/**
 * 会話コンテキスト管理
 * Firestoreから会話履歴・ユーザープロフィールを取得し、
 * AIリクエスト用のコンテキストを構築する
 */

import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { buildUserContextBlock } from "../user/metrics";
import type { UserProfile } from "../user/manager";
import {
  buildWorkoutHistorySummary,
  formatWorkoutHistoryForPrompt,
  type WorkoutHistorySummary,
} from "../workout/history";

const db = admin.firestore;

// 直近の会話を何件・何文字まで AI に渡すか。
// マルチターンの文脈（短文返答「A」「はい」の続き解釈、相談の深掘り）を保つには
// ある程度の往復が履歴に残っている必要がある。Sonnet 4.6 は 1M コンテキストで、
// プロンプトキャッシュも併用するため、ここを保守的にしすぎると文脈切れの方が痛い。
// メニュー本文は要約プレースホルダに置き換える（trainer.ts 参照）ので、長文での圧迫もない。
const MAX_HISTORY_MESSAGES = 14;
const MAX_CONTEXT_CHARS = 6000;
const WORKOUT_HISTORY_LIMIT = 30; // 履歴サマリーで集計する直近セッション数

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: FirebaseFirestore.Timestamp;
}

export interface ConversationContext {
  messages: Anthropic.MessageParam[];
  /**
   * AI の system prompt に追記するコンテキスト本体。
   * ユーザー情報（プロフィール・派生メトリクス）と直近のトレーニング履歴サマリーを連結したもの。
   * 過去30セッションの種目別最大重量・典型レップ・触れていない部位などが含まれる。
   */
  userProfileContext: string;
  /** 履歴サマリー本体。記録の有無や具体的な数値を呼び出し元で参照するため。 */
  workoutSummary: WorkoutHistorySummary;
}

/**
 * Firestoreから直近の会話履歴を取得
 */
export async function getConversationHistory(
  userId: string,
  limit: number = MAX_HISTORY_MESSAGES
): Promise<ConversationMessage[]> {
  const snapshot = await db()
    .collection("users")
    .doc(userId)
    .collection("conversations")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  const messages: ConversationMessage[] = [];
  snapshot.docs.reverse().forEach((doc) => {
    const data = doc.data();
    messages.push({
      role: data.role,
      content: data.content,
      timestamp: data.timestamp,
    });
  });

  return messages;
}

/**
 * 会話メッセージをFirestoreに保存
 */
export async function saveConversationMessage(
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await db()
    .collection("users")
    .doc(userId)
    .collection("conversations")
    .add({
      role,
      content,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
}

/**
 * ユーザープロフィールを取得
 */
async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const doc = await db().collection("users").doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data?.profile) return null;
  return data.profile as UserProfile;
}

/**
 * コンテキストの文字数を制限する
 * 古いメッセージから順に削除してトークン数を管理
 */
function trimMessages(
  messages: ConversationMessage[]
): ConversationMessage[] {
  let totalChars = 0;
  const trimmed: ConversationMessage[] = [];

  // 新しいメッセージから逆順に文字数を積算
  for (let i = messages.length - 1; i >= 0; i--) {
    const charCount = messages[i].content.length;
    if (totalChars + charCount > MAX_CONTEXT_CHARS) {
      break;
    }
    totalChars += charCount;
    trimmed.unshift(messages[i]);
  }

  return trimmed;
}

/**
 * AIリクエスト用の完全なコンテキストを構築する
 */
export async function buildConversationContext(
  userId: string,
  currentMessage: string
): Promise<ConversationContext> {
  // 並列でプロフィール・会話履歴・ワークアウト履歴サマリーを取得
  const [profile, conversation, workoutSummary] = await Promise.all([
    getUserProfile(userId),
    getConversationHistory(userId),
    buildWorkoutHistorySummary(userId, WORKOUT_HISTORY_LIMIT),
  ]);

  // 会話履歴は文字数制限を適用
  const trimmedHistory = trimMessages(conversation);

  // Anthropic APIのメッセージ形式に変換
  const messages: Anthropic.MessageParam[] = trimmedHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // 現在のメッセージを追加
  messages.push({ role: "user", content: currentMessage });

  // ユーザープロフィール（年代・身体スペック・派生メトリクス）+ ワークアウト履歴サマリー
  // この組み合わせを「専属トレーナーが毎回参照する一人分の資料」として system prompt に渡す
  const profileBlock = profile ? buildUserContextBlock(profile) : "";
  const workoutBlock = formatWorkoutHistoryForPrompt(workoutSummary);
  const userProfileContext = [profileBlock, workoutBlock].filter((s) => s.length > 0).join("\n");

  return { messages, userProfileContext, workoutSummary };
}
