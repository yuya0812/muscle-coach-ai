import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { getAnthropicClient, pickModel } from "../ai/client";
import { getXClient } from "./client";

// 投稿テーマのローテーション（曜日別）。
// 方針転換後はアプリの実機能（記録の習慣化・成長の可視化）に寄せたテーマにする。
// フォーム指導・栄養Tips・メニュー提案など廃止機能を匂わせるテーマは置かない。
const DAILY_THEMES: Record<number, string> = {
  0: "今週のトレーニングを振り返る・記録を見返すと気づくこと",
  1: "月曜スタート・今週こそ記録を続けるための小さなコツ",
  2: "筋トレ記録が続かないあるある（前回の重量を忘れる等）への共感",
  3: "記録をためると見えてくる自分の弱点・部位の偏り",
  4: "少しずつ伸びている実感・成長を数字で見える化する話",
  5: "花金トレーニング・週末に向けたモチベーション",
  6: "土曜の追い込み・1週間の記録をまとめて振り返る",
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
      return `- 投稿の最後に改行を1つ入れて、CTAとして「LINEに送るだけで記録できるアプリ、気になる人はプロフから」のような一行を添える（同じ文言の丸写しはNG、毎回少しだけ言い回しを変える）。URLは絶対に含めない`;
    case "softProfile":
      return `- 投稿は本編で完結させる。CTAは含めない。プロフィールに誘導するような文言も入れない（自然な発信のみ）`;
  }
}

function buildSystemPrompt(ctaVariant: CtaVariant): string {
  // 方針転換後: トレーナーキャラ「コウ」を廃止。アプリの実機能（雑にLINEへ送れば記録、
  // 記録を集計してAIが弱点・伸びを言語化）と整合する世界観で発信する。
  // 「メニューを組む」「フォーム指導」「コーチング相談」など廃止済み機能は訴求しない。
  return `あなたは「マッスルコーチAI」という筋トレ記録アプリの公式Xアカウントです。
エニタイムに通う30代サラリーマンの筋トレ初心者〜中級者に向けて発信しています。

【このアプリの実態（訴求してよいこと）】
- LINEに「ベンチプレス 60kg 10回 3セット」のように雑に送るだけで記録できる
- 足りない情報（回数・セット数など）はその場で聞き返して補完してくれる
- たまった記録をAIが集計し、弱点の部位・伸びている種目・伸び悩みを言葉でまとめる
- 「記録のハードルを下げる」「自分の成長を客観的に見える化する」のが価値

【絶対に言わないこと（廃止済み機能・誇大表現）】
- AIがメニューを組む／トレーニングプログラムを提案する
- AIがフォームを指導する／なんでも相談に乗る／パーソナルトレーナーになる
- これらは廃止した機能なので、ツイートで匂わせてもいけない

【発信トーン】
- 押し付けない、共感ベース。「記録が続かない」「成長してるか分からない」という
  初心者のあるあるに寄り添う
- タメ口寄りの親しみやすい口調（「〜だよね」「〜なんだよな」「〜しがち」）
- 具体的な数値や初心者あるある（記録が三日坊主、前回の重量を忘れる等）を交える

以下のルールでツイートを1件作成してください：

【ルール】
- 140文字以内（日本語）。CTA行を含めてカウント
- 共感を呼ぶ内容（「あるある」「それな」系）を軸にする
- URL・短縮リンク・ドメインは絶対に含めない（本文・CTAいずれも）
${ctaInstruction(ctaVariant)}
- ハッシュタグは2〜3個（#筋トレ #ジム初心者 #筋トレ記録 #筋肥大 #エニタイム 等から適切なものを選ぶ）

【NG】
- 宣伝っぽいメイン文・「マッスルコーチAI」というサービス名の直接連呼
- メニュー提案・フォーム指導・コーチング相談など廃止機能の訴求
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

// 投稿タイミング（1日3回）。noon/evening が 403 で弾かれることがあるが、
// 「3回とも成功する日もある」ため固定的なプラン上限ではなく間欠的な失敗と判断。
// 各回に retryCount を付けて拾い直す方針で運用・観察する（2026-06）。
type Timing = "morning" | "noon" | "evening";

const TIMING_SUFFIX: Record<Timing, string> = {
  morning: "（朝の投稿。出勤前や朝活の時間帯を想定）",
  noon: "（昼休みの投稿。ランチ休憩中・昼ジムに行く層を想定）",
  evening: "（夜・仕事終わりのジム帰りを想定した投稿）",
};

/**
 * 投稿結果を xPostLogs に記録する。成功・失敗の両方を残す（status で区別）。
 * 旧実装は成功時しか記録せず、失敗（403等）が後から追えなかった。
 * doc ID は「日付_timing」にして冪等性も担保する（リトライ時の二重投稿・二重記録を防ぐ）。
 */
async function savePostLog(params: {
  docId: string;
  status: "success" | "failed";
  tweetId: string | null;
  tweetText: string;
  weekNum: number;
  ctaVariant: CtaVariant;
  timing: Timing;
  errorCode?: number | null;
  errorMessage?: string | null;
}): Promise<void> {
  await admin.firestore().collection("xPostLogs").doc(params.docId).set({
    status: params.status,
    tweetId: params.tweetId,
    tweetText: params.tweetText,
    weekNum: params.weekNum,
    ctaVariant: params.ctaVariant,
    timing: params.timing,
    errorCode: params.errorCode ?? null,
    errorMessage: params.errorMessage ?? null,
    postedAt: admin.firestore.Timestamp.now(),
  });
}

/** その日・その timing の投稿が既に成功記録されているか（冪等性チェック）。 */
async function alreadyPostedToday(docId: string): Promise<boolean> {
  const doc = await admin.firestore().collection("xPostLogs").doc(docId).get();
  return doc.exists && doc.data()?.status === "success";
}

function dateKeyJst(now: Date): string {
  // now は JST 補正済みの Date。YYYY-MM-DD を返す。
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function runAutoPost(timing: Timing): Promise<void> {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dayOfWeek = now.getDay();
  const weekNum = getISOWeekNumber(now);
  const ctaVariant = pickCtaVariant(weekNum);
  const theme = DAILY_THEMES[dayOfWeek];
  const themeSuffix = TIMING_SUFFIX[timing];
  const docId = `${dateKeyJst(now)}_${timing}`;

  console.log(`[AutoPost ${timing}] week=${weekNum} variant=${ctaVariant} day=${dayOfWeek} doc=${docId}`);

  // 冪等性: リトライで再実行された際、既に成功済みなら二重投稿しない。
  if (await alreadyPostedToday(docId)) {
    console.log(`[AutoPost ${timing}] already posted today (${docId}), skipping`);
    return;
  }

  const raw = await generateTweetContent(theme + themeSuffix, ctaVariant);
  const tweetText = stripUrls(raw);

  const xClient = getXClient();
  try {
    const result = await xClient.v2.tweet(tweetText);
    await savePostLog({
      docId, status: "success", tweetId: result.data.id, tweetText, weekNum, ctaVariant, timing,
    });
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
    // 失敗も記録しておき、後から「いつ・どのコードで落ちたか」を追えるようにする。
    await savePostLog({
      docId, status: "failed", tweetId: null, tweetText, weekNum, ctaVariant, timing,
      errorCode: err.code ?? null, errorMessage: err.message ?? null,
    });
    throw e;
  }
}

// 1日3回投稿。各回 retryCount=2 で間欠的な失敗（403/タイムアウト/LLM一過性エラー）を
// 拾い直す。投稿成功は冪等性チェック（alreadyPostedToday）で二重化を防ぐので、
// リトライで同じ枠を2回投稿することはない。
// noon/evening の 403 が「上限」なのか「一過性」なのかを、失敗ログ（xPostLogs.status=failed）と
// リトライ結果で見極める実験フェーズ。
export const autoPostMorning = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    memory: "256MiB",
    retryCount: 2,
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
    retryCount: 2,
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
    retryCount: 2,
  },
  async () => {
    await runAutoPost("evening");
  }
);
