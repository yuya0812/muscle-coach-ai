import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { getAnthropicClient, pickModel } from "../ai/client";
import { getXClient } from "./client";

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

// ISO週番号を取得（CTA文言のA/Bテスト用）
function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

/**
 * CTAバリアントの選定（A/Bテスト）
 * URLは投稿本文に含めずプロフィール固定リンクへ誘導する（X API Pay-per-use のURL課金回避）。
 * 文言だけ強弱で振り、xPostLogs.ctaVariant でどちらが効くか集計する。
 *   directProfile: CTAあり（プロフ誘導を明示）
 *   softProfile:   CTAなし（自然な発信のみ・対照群）
 * 奇数週=directProfile, 偶数週=softProfile で交互運用。
 */
type CtaVariant = "directProfile" | "softProfile";

function pickCtaVariant(weekNum: number): CtaVariant {
  return weekNum % 2 === 1 ? "directProfile" : "softProfile";
}

function ctaInstruction(variant: CtaVariant): string {
  switch (variant) {
    case "directProfile":
      return `- 投稿の最後に改行を1つ入れて、CTAとして「AIトレーナーで一緒に始めたい人はプロフのリンクから👇」のような一行を添える（同じ文言の丸写しはNG、毎回少しだけ言い回しを変える）。URLは絶対に含めない`;
    case "softProfile":
      return `- 投稿は本編で完結させる。CTAは含めない。プロフィールに誘導するような文言も入れない（自然な発信のみ）`;
  }
}

function buildSystemPrompt(ctaVariant: CtaVariant): string {
  return `あなたは「コウ」というAIパーソナルトレーナーのXアカウントです。
エニタイムに通う30代サラリーマンの筋トレ初心者〜中級者に向けて発信しています。

【キャラクター】
- 情熱的で親しみやすい、熱血コーチ
- 自分もサラリーマンとして忙しい中でトレーニングを続けている設定
- 初心者の気持ちがわかる、上から目線にならない

以下のルールでツイートを1件作成してください：

【ルール】
- 140文字以内（日本語）。CTA行を含めてカウント
- タメ口・親しみやすい口調（「〜だよ」「〜だぞ」「〜じゃない？」）
- 具体的な数値や体験談を交える
- 共感を呼ぶ内容（「あるある」「知らなかった」系）
- URL・短縮リンク・ドメインは絶対に含めない（本文・CTAいずれも）
${ctaInstruction(ctaVariant)}
- ハッシュタグは2〜3個（#筋トレ #ジム初心者 #筋肥大 #エニタイム 等から適切なものを選ぶ）

【NG】
- 宣伝っぽいメイン文・サービス名の言及
- 医療・怪我の断定的アドバイス
- 「〜しましょう」系の敬語命令口調
- URL・https・lin.ee などのリンク表記

ツイート本文のみを出力してください。前置きや説明は不要です。`;
}

async function generateTweetContent(theme: string, ctaVariant: CtaVariant): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: pickModel("autopost"),
    max_tokens: 300,
    system: buildSystemPrompt(ctaVariant),
    messages: [{ role: "user", content: `今日のテーマ: ${theme}` }],
  });

  if (response.content[0].type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }
  return response.content[0].text.trim();
}

/**
 * モデルが指示を無視してURLを生成してしまった場合の保険。
 * URL課金（$0.20/件）を避けるため、本文中のURL/ドメインを除去する。
 */
function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[\w-]+\.(?:com|net|org|jp|co\.jp|me|app|io|ai|line|ee|link)\b\S*/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Timing = "morning" | "noon" | "evening";

const TIMING_SUFFIX: Record<Timing, string> = {
  morning: "（朝の投稿。出勤前や朝活の時間帯を想定）",
  noon: "（昼休みの投稿。ランチ休憩中・昼ジムに行く層を想定）",
  evening: "（夜・仕事終わりのジム帰りを想定した投稿）",
};

async function savePostLog(
  tweetId: string,
  tweetText: string,
  weekNum: number,
  ctaVariant: CtaVariant,
  timing: Timing
): Promise<void> {
  await admin.firestore().collection("xPostLogs").doc(tweetId).set({
    tweetId,
    tweetText,
    weekNum,
    ctaVariant,
    timing,
    postedAt: admin.firestore.Timestamp.now(),
  });
}

async function runAutoPost(timing: Timing): Promise<void> {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dayOfWeek = now.getDay();
  const weekNum = getISOWeekNumber(now);
  const ctaVariant = pickCtaVariant(weekNum);
  const theme = DAILY_THEMES[dayOfWeek];
  const themeSuffix = TIMING_SUFFIX[timing];

  console.log(`[AutoPost ${timing}] week=${weekNum} variant=${ctaVariant} day=${dayOfWeek}`);

  const raw = await generateTweetContent(theme + themeSuffix, ctaVariant);
  const tweetText = stripUrls(raw);

  const xClient = getXClient();
  try {
    const result = await xClient.v2.tweet(tweetText);
    await savePostLog(result.data.id, tweetText, weekNum, ctaVariant, timing);
    console.log(`[AutoPost ${timing}] tweeted: ${result.data.id}`);
  } catch (e: unknown) {
    // twitter-api-v2 のエラーは code/data/errors を持つ。原因切り分けのため詳細を出す。
    const err = e as { code?: number; data?: unknown; errors?: unknown; message?: string };
    console.error(`[AutoPost ${timing}] X API failed`, {
      code: err.code,
      data: err.data,
      errors: err.errors,
      message: err.message,
    });
    throw e;
  }
}

export const autoPostMorning = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    memory: "256MiB",
  },
  async () => {
    await runAutoPost("morning");
  }
);

export const autoPostNoon = onSchedule(
  {
    schedule: "0 12 * * *",
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    memory: "256MiB",
  },
  async () => {
    await runAutoPost("noon");
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
    await runAutoPost("evening");
  }
);
