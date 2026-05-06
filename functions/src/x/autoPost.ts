import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { getAnthropicClient, CLAUDE_MODEL } from "../ai/client";
import { getXClient } from "./client";

const LINE_URL = "https://lin.ee/YjZDGe5";

// 投稿テーマのローテーション（曜日別）
const DAILY_THEMES: Record<number, string> = {
  0: "週末のトレーニングモチベーション・週を振り返る内容",
  1: "月曜スタートダッシュ・週の目標設定",
  2: "筋トレ初心者向けの基本知識・よくある失敗",
  3: "栄養・食事・プロテインに関するTips",
  4: "フォームのコツ・怪我予防",
  5: "花金トレーニング・週末に向けたモチベーション",
  6: "土曜の追い込み・週次振り返り",
};

// ISO週番号を取得
function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

/**
 * A/Bテスト判定
 * 奇数週: 全投稿にCTA（LINE URL）付き
 * 偶数週: 月・金の夜投稿のみCTA付き（週2回）
 */
function shouldIncludeCta(weekNum: number, dayOfWeek: number, isEvening: boolean): boolean {
  if (weekNum % 2 === 1) return true; // 奇数週は毎投稿CTA
  return isEvening && (dayOfWeek === 1 || dayOfWeek === 5); // 偶数週は月・金の夜のみ
}

function buildSystemPrompt(withCta: boolean): string {
  const ctaRule = withCta
    ? `- 投稿の最後に改行して「AIトレーナーに相談したい人はこちら👇\n${LINE_URL}」を自然に追加する`
    : `- URLは含めない（自然な投稿にする）`;

  return `あなたは「コウ」というAIパーソナルトレーナーのXアカウントです。
エニタイムに通う30代サラリーマンの筋トレ初心者〜中級者に向けて発信しています。

【キャラクター】
- 情熱的で親しみやすい、熱血コーチ
- 自分もサラリーマンとして忙しい中でトレーニングを続けている設定
- 初心者の気持ちがわかる、上から目線にならない

以下のルールでツイートを1件作成してください：

【ルール】
- URL除いて140文字以内（日本語）
- タメ口・親しみやすい口調（「〜だよ」「〜だぞ」「〜じゃない？」）
- 具体的な数値や体験談を交える
- 共感を呼ぶ内容（「あるある」「知らなかった」系）
${ctaRule}
- ハッシュタグは2〜3個（#筋トレ #ジム初心者 #筋肥大 #エニタイム 等から適切なものを選ぶ）

【NG】
- 宣伝っぽいメイン文・サービス名の言及
- 医療・怪我の断定的アドバイス
- 「〜しましょう」系の敬語命令口調

ツイート本文のみを出力してください。前置きや説明は不要です。`;
}

async function generateTweetContent(theme: string, withCta: boolean): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 300,
    system: buildSystemPrompt(withCta),
    messages: [{ role: "user", content: `今日のテーマ: ${theme}` }],
  });

  if (response.content[0].type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }
  return response.content[0].text.trim();
}

async function savePostLog(
  tweetId: string,
  tweetText: string,
  weekNum: number,
  withCta: boolean,
  timing: "morning" | "evening"
): Promise<void> {
  await admin.firestore().collection("xPostLogs").doc(tweetId).set({
    tweetId,
    tweetText,
    weekNum,
    withCta,
    timing,
    postedAt: admin.firestore.Timestamp.now(),
  });
}

export const autoPostMorning = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    memory: "256MiB",
  },
  async () => {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const dayOfWeek = now.getDay();
    const weekNum = getISOWeekNumber(now);
    const withCta = shouldIncludeCta(weekNum, dayOfWeek, false);
    const theme = DAILY_THEMES[dayOfWeek];

    console.log(`[AutoPost Morning] week=${weekNum}(${weekNum % 2 === 1 ? "奇数=CTA毎回" : "偶数=CTA週2"}), cta=${withCta}`);

    const tweetText = await generateTweetContent(theme + "（朝の投稿）", withCta);
    const xClient = getXClient();
    const result = await xClient.v2.tweet(tweetText);

    await savePostLog(result.data.id, tweetText, weekNum, withCta, "morning");
    console.log(`[AutoPost Morning] tweeted: ${result.data.id}`);
  }
);

export const autoPostEvening = onSchedule(
  {
    schedule: "0 20 * * *",
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    memory: "256MiB",
  },
  async () => {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const dayOfWeek = now.getDay();
    const weekNum = getISOWeekNumber(now);
    const withCta = shouldIncludeCta(weekNum, dayOfWeek, true);
    const theme = DAILY_THEMES[dayOfWeek];

    console.log(`[AutoPost Evening] week=${weekNum}(${weekNum % 2 === 1 ? "奇数=CTA毎回" : "偶数=CTA週2"}), cta=${withCta}`);

    const tweetText = await generateTweetContent(theme + "（夜・仕事終わりのジム帰りを想定した投稿）", withCta);
    const xClient = getXClient();
    const result = await xClient.v2.tweet(tweetText);

    await savePostLog(result.data.id, tweetText, weekNum, withCta, "evening");
    console.log(`[AutoPost Evening] tweeted: ${result.data.id}`);
  }
);
