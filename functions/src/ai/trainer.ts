/**
 * AIトレーナーエンジン
 * 意図分類・コンテキスト構築・AI呼び出し・レスポンス整形を統合する
 */

import * as admin from "firebase-admin";
import {
  TRAINER_SYSTEM_PROMPT,
  MENU_GENERATION_PROMPT,
  FORM_GUIDE_PROMPT,
  PROGRESS_ANALYSIS_PROMPT,
  NUTRITION_ADVICE_PROMPT,
} from "./prompts";
import { getAnthropicClient, getAIJsonResponse, CLAUDE_MODEL } from "./client";
import {
  buildConversationContext,
  saveConversationMessage,
} from "./context";
import { classifyIntent, Intent } from "./intentClassifier";
import {
  formatForLine,
  formatMenuForLine,
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
      return handleProgressInquiry(userId);

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
 * メニュー生成リクエストを処理
 */
async function handleMenuRequest(
  userId: string,
  userMessage: string
): Promise<string[]> {
  try {
    const context = await buildConversationContext(userId, userMessage);

    const menuPrompt = context.userProfileContext
      ? `${MENU_GENERATION_PROMPT}\n\n## ユーザー情報\n${context.userProfileContext}`
      : MENU_GENERATION_PROMPT;

    const jsonStr = await getAIJsonResponse(menuPrompt, userMessage);
    const menuData = JSON.parse(jsonStr);

    // 会話履歴に保存
    await saveConversationMessage(userId, "user", userMessage);

    const formatted = formatMenuForLine(menuData);
    await saveConversationMessage(userId, "assistant", formatted);

    return formatForLine(formatted);
  } catch {
    // JSONパースに失敗した場合は一般会話にフォールバック
    return handleGeneralConversation(userId, userMessage);
  }
}

/**
 * フォーム指導リクエストを処理
 */
async function handleFormQuestion(
  userId: string,
  userMessage: string,
  exerciseName: string | null
): Promise<string[]> {
  const client = getAnthropicClient();

  const systemPrompt = exerciseName
    ? `${FORM_GUIDE_PROMPT}\n\n## 対象種目\n${exerciseName}`
    : FORM_GUIDE_PROMPT;

  await saveConversationMessage(userId, "user", userMessage);

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const assistantMessage =
    response.content[0].type === "text"
      ? response.content[0].text
      : formatErrorMessage("general");

  await saveConversationMessage(userId, "assistant", assistantMessage);

  return formatForLine(assistantMessage);
}

/**
 * 進捗分析リクエストを処理
 */
async function handleProgressInquiry(userId: string): Promise<string[]> {
  // Firestoreからワークアウト履歴を取得
  const snapshot = await admin.firestore()
    .collection("users")
    .doc(userId)
    .collection("workouts")
    .orderBy("date", "desc")
    .limit(20)
    .get();

  if (snapshot.empty) {
    return [
      "まだトレーニング記録がありません 📝\n\n「ベンチプレス 60kg 10回 3セット」\nのように記録を入力してみましょう！",
    ];
  }

  const workouts = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      date: data.date?.toDate?.()?.toISOString?.() || "不明",
      exercises: data.exercises || [],
    };
  });

  const historyText = JSON.stringify(workouts, null, 2);
  const client = getAnthropicClient();

  const systemPrompt = `${PROGRESS_ANALYSIS_PROMPT}\n\n## ワークアウト履歴\n${historyText}`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      { role: "user", content: "最近のトレーニングの進捗を教えて" },
    ],
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
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
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
    model: CLAUDE_MODEL,
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
