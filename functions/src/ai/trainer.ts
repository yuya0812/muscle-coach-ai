/**
 * AIトレーナーエンジン
 * 意図分類・コンテキスト構築・AI呼び出し・レスポンス整形を統合する
 */

import {
  TRAINER_SYSTEM_PROMPT,
  FORM_GUIDE_PROMPT,
  PROGRESS_ANALYSIS_PROMPT,
  NUTRITION_ADVICE_PROMPT,
} from "./prompts";
import { getAnthropicClient, pickModel } from "./client";
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
    // 会話履歴には 1 通目（実行用）だけ保存する。2 通目（見取り図）は補足扱いで
    // 履歴に残すと「メニュー後の会話で AI が見取り図を引用する」ような不自然さが出るため。
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

  const parts: string[] = [FORM_GUIDE_PROMPT];
  if (context.userProfileContext) parts.push(context.userProfileContext);
  if (exerciseName) parts.push(`## 対象種目\n${exerciseName}`);
  const systemPrompt = parts.join("\n\n");

  await saveConversationMessage(userId, "user", userMessage);

  const response = await client.messages.create({
    model: pickModel("conversation"),
    max_tokens: 1024,
    system: systemPrompt,
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
  const systemPrompt = `${PROGRESS_ANALYSIS_PROMPT}\n\n${context.userProfileContext}`;

  await saveConversationMessage(userId, "user", userMessage);

  const response = await client.messages.create({
    model: pickModel("conversation"),
    max_tokens: 1024,
    system: systemPrompt,
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

  const systemPrompt = context.userProfileContext
    ? `${NUTRITION_ADVICE_PROMPT}\n\n## 現在のユーザー情報\n${context.userProfileContext}`
    : NUTRITION_ADVICE_PROMPT;

  await saveConversationMessage(userId, "user", userMessage);

  const response = await client.messages.create({
    model: pickModel("conversation"),
    max_tokens: 1024,
    system: systemPrompt,
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

  // ユーザープロフィールがあればシステムプロンプトに追加
  const systemPrompt = context.userProfileContext
    ? `${TRAINER_SYSTEM_PROMPT}\n\n## 現在のユーザー情報\n${context.userProfileContext}`
    : TRAINER_SYSTEM_PROMPT;

  await saveConversationMessage(userId, "user", userMessage);

  const response = await client.messages.create({
    model: pickModel("conversation"),
    max_tokens: 1024,
    system: systemPrompt,
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
