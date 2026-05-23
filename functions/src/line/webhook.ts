import { onRequest } from "firebase-functions/v2/https";
import * as line from "@line/bot-sdk";
import { getTrainerResponse, classifyIntent } from "../ai/trainer";
import { formatGreeting } from "../ai/formatter";
import { getOrCreateUser, incrementUsage, getRemainingUsage } from "../user/manager";
import { getRecentWorkouts, formatWorkoutHistory } from "../workout/recorder";
import { generateWeeklyMenu, getTodayMenu } from "../workout/menuGenerator";
import { replyMessages, pushMessages, createMenuFlexMessage } from "./messages";
import { startRecordingFlow, handleRecordingStep } from "./recordingFlow";
import { getTrainer } from "./trainerCharacter";

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

  // フォロー時: シンプルな歓迎メッセージ + LIFFへ誘導（旧オンボーディングのボタンフローは廃止）
  if (event.type === "follow") {
    const userId = event.source.userId;
    if (!userId) return;
    await getOrCreateUser(userId);
    const trainer = getTrainer("hot");
    const welcome: line.messagingApi.TextMessage = {
      type: "text",
      text:
        `${trainer.name}です。マッスルコーチAIへようこそ。\n\n` +
        `下のメニューから「設定」を開いて、まずはプロフィールを登録してくれ。\n` +
        `目標やレベルを教えてくれれば、君専用のアドバイスができるからな。\n\n` +
        `準備ができたら、いつでも俺に話しかけてくれ。`,
      sender: { name: trainer.name },
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

  // trainerType未設定なら hot をデフォルトとして扱う（旧フォールバックの再オンボーディングは廃止）
  const effectiveTrainerType = user.profile.trainerType || "hot";
  const trainer = getTrainer(effectiveTrainerType);
  const sender = { name: user.profile.trainerName || trainer.name };
  const command = text.toLowerCase();

  if (command === "メニュー" || command === "ヘルプ" || command === "help") {
    await replyMessages(replyToken, [createMenuFlexMessage()]);
    return;
  }

  if (command === "今日のメニュー" || command === "今日") {
    const menu = await getTodayMenu(userId);
    await replyMessages(replyToken, [buildMsg("メニューを送るね！", sender)]);
    await pushMessages(userId, [buildMsg(menu, sender)]);
    return;
  }

  if (command === "メニュー作成") {
    await replyMessages(replyToken, [buildMsg(`${trainer.thinkingMessage}\nメニューを作成中です。`, sender)]);
    try {
      const menu = await generateWeeklyMenu(userId);
      await pushMessages(userId, [buildMsg(menu, sender)]);
    } catch (error) {
      console.error("[Menu generation] error:", error);
      await pushMessages(userId, [buildMsg("メニュー生成に失敗しました。もう一度お試しください。", sender)]);
    }
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

  if (command === "分析") {
    const remaining = await getRemainingUsage(userId);
    if (remaining !== null && remaining <= 0) {
      await replyMessages(replyToken, [
        buildMsg("本日の無料利用回数を超えました。\nプレミアムプランに登録すると無制限に利用できます！", sender),
      ]);
      return;
    }
    await replyMessages(replyToken, [buildMsg(`${trainer.thinkingMessage}\n分析中です。`, sender)]);
    try {
      const responses = await getTrainerResponse(
        userId,
        "以下のトレーニング記録を分析して、フィードバックをください",
        user.profile.name
      );
      await incrementUsage(userId);
      for (const msg of responses) {
        await pushMessages(userId, [buildMsg(msg, sender)]);
      }
    } catch (error) {
      console.error("Analysis error:", error);
      await pushMessages(userId, [buildMsg("分析に失敗しました。もう一度お試しください。", sender)]);
    }
    return;
  }

  // 意図を先に分類して表示を分岐
  const { intent } = await classifyIntent(text);

  // 挨拶はAI呼び出しなし・利用カウントなしで即応答
  if (intent === "greeting") {
    const greetingMsg = formatGreeting(user.profile.name || "ゲスト");
    await replyMessages(replyToken, [buildMsg(greetingMsg, sender)]);
    return;
  }

  // AI会話（利用回数チェック + 連投クールダウン）
  const usage = await incrementUsage(userId);
  if (!usage.allowed) {
    const msg =
      usage.reason === "cooldown"
        ? "続けて送られると追いつかないので、数秒後にもう一度お願いします。"
        : "本日の利用回数の上限に達しました。\n時間をおいてもう一度お試しください。";
    await replyMessages(replyToken, [buildMsg(msg, sender)]);
    return;
  }

  // 意図ごとに待機メッセージを分ける（メニュー設計と進捗分析と通常会話で文脈が違う）
  let waitMsg: string;
  if (intent === "menu_request") {
    waitMsg = "メニューを設計しています。少し待っていてください。";
  } else if (intent === "progress") {
    waitMsg = "過去の記録を確認しています。少し待っていてください。";
  } else {
    waitMsg = trainer.thinkingMessage;
  }

  await replyMessages(replyToken, [buildMsg(waitMsg, sender)]);
  try {
    const responses = await getTrainerResponse(userId, text, user.profile.name);
    for (const msg of responses) {
      await pushMessages(userId, [buildMsg(msg, sender)]);
    }
  } catch (error) {
    console.error("AI response error:", error);
    await pushMessages(userId, [buildMsg("すみません、エラーが発生しました。もう一度お試しください。", sender)]);
  }
}
