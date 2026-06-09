/**
 * AIトレーナーエンジン
 * 意図分類・コンテキスト構築・AI呼び出し・レスポンス整形を統合する
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  TRAINER_SYSTEM_PROMPT,
  FORM_GUIDE_PROMPT,
  PROGRESS_ANALYSIS_PROMPT,
  NUTRITION_ADVICE_PROMPT,
} from "./prompts";
import { getAnthropicClient, pickModel, pickMaxTokens } from "./client";
import {
  buildConversationContext,
  saveConversationMessage,
} from "./context";
import { classifyIntent, Intent } from "./intentClassifier";
import {
  formatForLine,
  formatGreeting,
  formatErrorMessage,
} from "./formatter";

// 後方互換のため再エクスポート（recorder.ts等が import from "./trainer" している）
export { getAIJsonResponse } from "./client";

/**
 * 会話用の system prompt を「キャッシュ可能な固定部分」と「ユーザー固有の動的部分」に分けて組み立てる。
 *
 * - basePrompt: TRAINER_SYSTEM_PROMPT / FORM_GUIDE_PROMPT など、全ユーザー共通で不変のプロンプト。
 *   ここに cache_control を付けることで、プロンプトキャッシュ（プレフィックスマッチ）が効く。
 *   Sonnet 4.6 の最小キャッシュ単位（約2048トークン）を TRAINER_PERSONA 込みで十分超える。
 * - dynamicParts: プロフィール・履歴サマリー・対象種目など、ユーザーやタイミングで変わる部分。
 *   キャッシュのプレフィックスを壊さないよう、必ず固定ブロックより後ろに置く。
 *
 * キャッシュは tools → system → messages のレンダリング順でプレフィックス一致を見るため、
 * 不変ブロックを先頭に固定し、その末尾に cache_control を置くのが定石。
 */
function buildSystemBlocks(
  basePrompt: string,
  dynamicParts: string[],
): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: basePrompt, cache_control: { type: "ephemeral" } },
  ];
  const dynamic = dynamicParts.filter((p) => p && p.length > 0).join("\n\n");
  if (dynamic.length > 0) {
    blocks.push({ type: "text", text: dynamic });
  }
  return blocks;
}

/**
 * メインのトレーナー応答関数
 * 意図分類 → コンテキスト構築 → AI呼び出し → フォーマット
 */
export async function getTrainerResponse(
  userId: string,
  userMessage: string,
  userName?: string
): Promise<string[]> {
  // 1. 意図分類
  const classification = await classifyIntent(userMessage);

  // 2. 意図に応じたルーティング
  switch (classification.intent) {
    case "greeting":
      return [formatGreeting(userName || "ゲスト")];

    case "record":
      // レコード処理は recorder.ts 側で処理するため、ここではシグナルを返す
      // 呼び出し元（webhook handler）でrecord意図を検出してrecorder側に流す
      return handleRecordIntent(userId, userMessage);

    case "menu_request":
      return handleMenuRequest(userId, userMessage);

    case "form_question":
      return handleFormQuestion(
        userId,
        userMessage,
        classification.exerciseName
      );

    case "progress":
      return handleProgressInquiry(userId, userMessage);

    case "nutrition":
      return handleNutritionAdvice(userId, userMessage);

    case "general":
    case "other":
    default:
      return handleGeneralConversation(userId, userMessage);
  }
}

/**
 * トレーニング記録の意図を処理
 * 確認メッセージを返す（実際の保存は recorder.ts 側）
 */
async function handleRecordIntent(
  userId: string,
  userMessage: string
): Promise<string[]> {
  // record 意図の場合、trainer.ts では処理せず呼び出し元に委任する
  // ここではフォールバックとして一般会話として処理
  return handleGeneralConversation(userId, userMessage);
}

/**
 * メニュー生成リクエストを処理。
 * 履歴ベースで個別最適化したメニューを生成するため menuGenerator に委譲し、
 * 「今日詳細 + 全体見取り図」の 2 通分のメッセージを返す（呼び出し元で別々に push する想定）。
 *
 * 自然文（「今日のメニュー教えて」等）からの要求は forceRegenerate を渡さない＝
 * 既存の active メニューがあればそれを返す。会話のたびに別のメニューを作り直して
 * 一貫性を損なうのを避けるため。明示的な作り直しは webhook の「メニュー作り直し」コマンドで行う。
 */
async function handleMenuRequest(
  userId: string,
  userMessage: string
): Promise<string[]> {
  try {
    // 動的importで循環参照を避ける（workout/menuGenerator → ai/formatter → 既存トレーナー側、の流れ）
    const { generateWeeklyMenu } = await import("../workout/menuGenerator");
    const { todayDetail, weekOverview } = await generateWeeklyMenu(userId);

    await saveConversationMessage(userId, "user", userMessage);
    // 会話履歴には 1 通目（今日分の詳細）だけを保存する。
    // これにより直後のフォロー質問（「2種目目は何回？」「ベンチは何セット？」など）に
    // モデルが答えられる。2 通目（全Day見取り図）は補足扱いで保存しない
    //   - 見取り図まで履歴に残すと長すぎて他の会話文脈を押し出す
    //   - メニュー後の会話で AI が見取り図を不自然に引用するのを避ける
    // todayDetail は「今日分のみ」なので見取り図より短く、広げた履歴枠（context.ts の
    // MAX_CONTEXT_CHARS）に十分収まる。
    await saveConversationMessage(userId, "assistant", todayDetail);

    return [todayDetail, weekOverview];
  } catch {
    return handleGeneralConversation(userId, userMessage);
  }
}

/**
 * フォーム指導リクエストを処理。
 * プロフィール・履歴サマリーを system prompt に注入することで、
 * 「あなたが普段やっている重量」「最近どの部位を触っているか」を踏まえたフォーム助言を返せるようにする。
 */
async function handleFormQuestion(
  userId: string,
  userMessage: string,
  exerciseName: string | null
): Promise<string[]> {
  const client = getAnthropicClient();
  const context = await buildConversationContext(userId, userMessage);

  const dynamicParts: string[] = [];
  if (context.userProfileContext) dynamicParts.push(context.userProfileContext);
  if (exerciseName) dynamicParts.push(`## 対象種目\n${exerciseName}`);
  const system = buildSystemBlocks(FORM_GUIDE_PROMPT, dynamicParts);

  await saveConversationMessage(userId, "user", userMessage);

  const response = await client.messages.create({
    model: pickModel("conversation"),
    max_tokens: pickMaxTokens("conversation"),
    system,
    // 直前までの会話履歴 + 今回のメッセージを渡し、マルチターン会話の文脈を維持する
    messages: context.messages,
  });

  const assistantMessage =
    response.content[0].type === "text"
      ? response.content[0].text
      : formatErrorMessage("general");

  await saveConversationMessage(userId, "assistant", assistantMessage);

  return formatForLine(assistantMessage);
}

/**
 * 進捗分析リクエストを処理。
 * ユーザーの実際の文面（種目指定や期間指定を含むことが多い）を Claude に渡す。
 * 履歴の有無は WorkoutHistorySummary.hasRecords で判定する（文字列マッチは脆いため避ける）。
 */
async function handleProgressInquiry(
  userId: string,
  userMessage: string
): Promise<string[]> {
  const context = await buildConversationContext(userId, userMessage);

  if (!context.workoutSummary.hasRecords) {
    return [
      "まだトレーニング記録がありません。\n「ベンチプレス 60kg 10回 3セット」のように記録を入力してみましょう。",
    ];
  }

  const client = getAnthropicClient();
  const system = buildSystemBlocks(PROGRESS_ANALYSIS_PROMPT, [context.userProfileContext]);

  await saveConversationMessage(userId, "user", userMessage);

  const response = await client.messages.create({
    model: pickModel("conversation"),
    max_tokens: pickMaxTokens("conversation"),
    system,
    // 直前までの会話履歴 + 今回のメッセージを渡す
    messages: context.messages,
  });

  const assistantMessage =
    response.content[0].type === "text"
      ? response.content[0].text
      : formatErrorMessage("general");

  await saveConversationMessage(userId, "assistant", assistantMessage);

  return formatForLine(assistantMessage);
}

/**
 * 栄養アドバイスを処理
 */
async function handleNutritionAdvice(
  userId: string,
  userMessage: string
): Promise<string[]> {
  const client = getAnthropicClient();
  const context = await buildConversationContext(userId, userMessage);

  const dynamicParts = context.userProfileContext
    ? [`## 現在のユーザー情報\n${context.userProfileContext}`]
    : [];
  const system = buildSystemBlocks(NUTRITION_ADVICE_PROMPT, dynamicParts);

  await saveConversationMessage(userId, "user", userMessage);

  const response = await client.messages.create({
    model: pickModel("conversation"),
    max_tokens: pickMaxTokens("conversation"),
    system,
    // 直前までの会話履歴 + 今回のメッセージを渡す
    messages: context.messages,
  });

  const assistantMessage =
    response.content[0].type === "text"
      ? response.content[0].text
      : formatErrorMessage("general");

  await saveConversationMessage(userId, "assistant", assistantMessage);

  return formatForLine(assistantMessage);
}

/**
 * 一般的な会話を処理（フォールバック）
 */
async function handleGeneralConversation(
  userId: string,
  userMessage: string
): Promise<string[]> {
  const client = getAnthropicClient();
  const context = await buildConversationContext(userId, userMessage);

  // ユーザープロフィールがあればシステムプロンプトに追加（固定部分はキャッシュ、プロフィールは動的ブロック）
  const dynamicParts = context.userProfileContext
    ? [`## 現在のユーザー情報\n${context.userProfileContext}`]
    : [];
  const system = buildSystemBlocks(TRAINER_SYSTEM_PROMPT, dynamicParts);

  await saveConversationMessage(userId, "user", userMessage);

  const response = await client.messages.create({
    model: pickModel("conversation"),
    max_tokens: pickMaxTokens("conversation"),
    system,
    messages: context.messages,
  });

  const assistantMessage =
    response.content[0].type === "text"
      ? response.content[0].text
      : formatErrorMessage("general");

  await saveConversationMessage(userId, "assistant", assistantMessage);

  return formatForLine(assistantMessage);
}

// Intent型の再エクスポート（他モジュールから使えるように）
export type { Intent };
export { classifyIntent } from "./intentClassifier";
