import { onRequest } from "firebase-functions/v2/https";
import * as line from "@line/bot-sdk";
import { classifyIntent, USAGE_GUIDE } from "../ai/trainer";
import { buildAnalysis } from "../ai/analysis";
import { formatGreeting, formatForLine } from "../ai/formatter";
import { getOrCreateUser, incrementUsage } from "../user/manager";
import {
  getRecentWorkouts,
  formatWorkoutHistory,
  parseWorkoutText,
  detectMissingFields,
  saveWorkout,
  getTotalWorkoutCount,
  countWorkoutsSince,
} from "../workout/recorder";
import { replyMessages, pushMessages, createMenuFlexMessage } from "./messages";
import {
  startRecordingFlow,
  handleRecordingStep,
  checkAndPushMilestone,
  startClarification,
  MAX_CLARIFY_QUESTIONS,
} from "./recordingFlow";

// LINE メッセージの送信者表示名（旧トレーナーキャラ名の代わりに固定のサービス名を使う）
const APP_SENDER_NAME = "マッスルコーチ";

function getChannelSecret(): string {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) throw new Error("LINE_CHANNEL_SECRET is not set");
  return secret;
}


export const lineWebhook = onRequest(
  { region: "asia-northeast1", memory: "512MiB", invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const signature = req.headers["x-line-signature"] as string;
    if (!signature) {
      res.status(401).send("No signature");
      return;
    }

    // Firebase Functions v2 provides rawBody as Buffer (same as Stripe webhook)
    const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;
    if (!rawBody) {
      res.status(400).send("No raw body");
      return;
    }

    if (!line.validateSignature(rawBody, getChannelSecret(), signature)) {
      console.error("Signature verification failed. Check LINE_CHANNEL_SECRET in .env");
      res.status(401).send("Invalid signature");
      return;
    }

    const body = JSON.parse(rawBody.toString("utf8"));
    const events: line.WebhookEvent[] = body.events;

    for (const event of events) {
      try {
        await handleEvent(event);
      } catch (error) {
        console.error("Error handling event:", error);
      }
    }

    res.status(200).send("OK");
  }
);

function buildMsg(text: string, sender: { name: string }): line.messagingApi.Message {
  return { type: "text", text, sender } as line.messagingApi.Message;
}

async function handleEvent(event: line.WebhookEvent): Promise<void> {
  console.log(`[handleEvent] type=${event.type}, source=${JSON.stringify(event.source)}`);

  // フォロー時: シンプルな歓迎メッセージ + 記録の使い方案内
  if (event.type === "follow") {
    const userId = event.source.userId;
    if (!userId) return;
    await getOrCreateUser(userId);
    const welcome: line.messagingApi.TextMessage = {
      type: "text",
      text:
        "マッスルコーチへようこそ。\n\n" +
        "トレーニングをしたら、こんなふうに送るだけで記録できます。\n" +
        "・ベンチプレス 60kg 10回 3セット\n" +
        "・今日はスクワット80キロ5回を3セット\n\n" +
        "記録がたまったら「分析して」と送ると、部位のバランスや伸びている種目をまとめます。",
      sender: { name: APP_SENDER_NAME },
    };
    await replyMessages(event.replyToken, [welcome]);
    return;
  }

  if (event.type !== "message" || event.message.type !== "text") return;

  const userId = event.source.userId;
  if (!userId) return;

  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const user = await getOrCreateUser(userId);

  // 送信者表示名は固定のサービス名（旧トレーナーキャラ名は廃止）
  const sender = { name: APP_SENDER_NAME };
  const command = text.toLowerCase();

  if (command === "メニュー" || command === "ヘルプ" || command === "help") {
    await replyMessages(replyToken, [createMenuFlexMessage()]);
    return;
  }

  if (command === "終わり" || command === "おわり") {
    await replyMessages(replyToken, [buildMsg("お疲れさまでした。記録を終了します。", sender)]);
    return;
  }

  // 記録フロー進行中
  const handled = await handleRecordingStep(userId, replyToken, text);
  if (handled) return;

  if (command === "記録" || command.startsWith("記録 ") || command.startsWith("記録　")) {
    await startRecordingFlow(userId, replyToken);
    return;
  }

  if (command === "履歴" || command === "記録一覧") {
    const workouts = await getRecentWorkouts(userId);
    const formatted = formatWorkoutHistory(workouts);
    await replyMessages(replyToken, [buildMsg(formatted, sender)]);
    return;
  }

  // 「分析」コマンド: 明示的な分析依頼。意図分類を経ずに直接 analyze として扱う。
  // 利用回数チェック・クールダウンは runAnalysis 内で行う（コマンド経路でも課金制限が効くように）。
  if (command === "分析") {
    await runAnalysis(userId, replyToken, sender, user.profile.name);
    return;
  }

  // 意図を分類（record / analyze / greeting / other）
  const { intent } = await classifyIntent(text);

  // 挨拶はAI呼び出しなし・利用カウントなしで即応答
  if (intent === "greeting") {
    const greetingMsg = formatGreeting(user.profile.name || "ゲスト");
    await replyMessages(replyToken, [buildMsg(greetingMsg, sender)]);
    return;
  }

  // 記録意図：自然文（例「腹筋10回×3セット」）をパースし、欠損の有無で分岐する。
  // - 欠損なし → 即保存 → サマリー返却 → マイルストーンチェック
  // - 欠損が聞き返し上限（2問）以内 → 保留して聞き返し開始（保存はまだしない）
  // - 欠損が上限超 → 保存せず入力例を案内（中途半端な記録は残さない）
  if (intent === "record") {
    await replyMessages(replyToken, [buildMsg("記録を読み取っています。", sender)]);
    try {
      const exercises = await parseWorkoutText(text);
      if (exercises.length === 0) {
        await pushMessages(userId, [
          buildMsg("トレーニング内容を読み取れませんでした。例: 「ベンチプレス 60kg 10回 3セット」", sender),
        ]);
        return;
      }

      const missing = detectMissingFields(exercises);
      if (missing.length === 0) {
        const { message } = await saveWorkout(userId, exercises, text);
        await pushMessages(userId, [buildMsg(message, sender)]);
        await checkAndPushMilestone(userId);
      } else if (missing.length <= MAX_CLARIFY_QUESTIONS) {
        await startClarification(userId, exercises, text, missing);
      } else {
        await pushMessages(userId, [
          buildMsg(
            "重量・回数・セット数のわからない箇所が多かったため、今回は記録しませんでした。\n" +
              "「ベンチプレス 60kg 10回 3セット」のように、重量・回数・セット数を入れて送ってください。",
            sender,
          ),
        ]);
      }
    } catch (error) {
      console.error("[Record intent] parse/save error:", error);
      await pushMessages(userId, [
        buildMsg("記録の保存に失敗しました。もう一度お試しください。", sender),
      ]);
    }
    return;
  }

  // 分析意図：利用回数チェック + 連投クールダウンは runAnalysis 内で実施。
  if (intent === "analyze") {
    await runAnalysis(userId, replyToken, sender, user.profile.name);
    return;
  }

  // その他（雑談・未対応）: 記録の使い方を静的に案内する。
  // ここで再度 AI 分類を呼ばない（intent は既に確定済みで、案内は固定文のため）。
  await replyMessages(replyToken, [buildMsg(USAGE_GUIDE, sender)]);
}

/**
 * 分析（コード集計 + AI言語化）を実行して push する共通処理。
 * 「分析」コマンドと analyze 意図の両方から呼ばれる。
 *
 * 利用回数チェック・連投クールダウンをここで一元的に行うことで、どちらの経路から来ても
 * 課金制限が確実に効くようにする（コマンド経路だけ制限をすり抜ける穴を作らない）。
 */
async function runAnalysis(
  userId: string,
  replyToken: string,
  sender: { name: string },
  _userName?: string,
): Promise<void> {
  // 記録が1件もないユーザーには分析できない。この場合は利用回数を消費せずに案内を返す
  // （記録なしで AI も呼ばないのに無料枠を1消費してしまう退行を防ぐ）。
  const totalCount = await getTotalWorkoutCount(userId);
  if (totalCount === 0) {
    await replyMessages(replyToken, [
      buildMsg(
        "まだ分析できる記録がありません。\n「ベンチプレス 60kg 10回 3セット」のように記録を送ってみてください。",
        sender,
      ),
    ]);
    return;
  }

  // 分析は週区切り（直近7日が軸）。今週の記録がなければ AI を呼ばず、課金もしない。
  // 最終記録日を添えて再開を促す（記録が空いたユーザーが常にここに来るため）。
  const thisWeekCount = await countWorkoutsSince(userId, 7);
  if (thisWeekCount === 0) {
    const recent = await getRecentWorkouts(userId, 1);
    const daysAgo =
      recent.length > 0
        ? Math.max(0, Math.floor((Date.now() - recent[0].date.toDate().getTime()) / (24 * 60 * 60 * 1000)))
        : null;
    const lastLine = daysAgo != null ? `最後の記録は${daysAgo}日前です。` : "";
    await replyMessages(replyToken, [
      buildMsg(
        `今週はまだ記録がありません。${lastLine}\n` +
          "今週のトレーニングを記録してから「分析して」と送ってください。",
        sender,
      ),
    ]);
    return;
  }

  // 利用回数チェック + 連投クールダウン（記録があるユーザーにのみ課金判定する）
  const usage = await incrementUsage(userId);
  if (!usage.allowed) {
    const msg =
      usage.reason === "cooldown"
        ? "続けて送られると追いつかないので、数秒後にもう一度お願いします。"
        : "本日の利用回数の上限に達しました。\n時間をおいてもう一度お試しください。";
    await replyMessages(replyToken, [buildMsg(msg, sender)]);
    return;
  }

  await replyMessages(replyToken, [buildMsg("記録を集計しています。少し待っていてください。", sender)]);
  try {
    const text = await buildAnalysis(userId);
    if (!text) {
      // 記録はあるのに集計できなかった例外的ケース。案内だけ返す。
      await pushMessages(userId, [
        buildMsg("分析できる記録が見つかりませんでした。もう少し記録をためてみてください。", sender),
      ]);
      return;
    }
    for (const msg of formatForLine(text)) {
      await pushMessages(userId, [buildMsg(msg, sender)]);
    }
  } catch (error) {
    console.error("Analysis error:", error);
    await pushMessages(userId, [buildMsg("分析に失敗しました。もう一度お試しください。", sender)]);
  }
}
