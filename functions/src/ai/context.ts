/**
 * 会話コンテキスト管理
 * Firestoreから会話履歴・ユーザープロフィールを取得し、
 * AIリクエスト用のコンテキストを構築する
 */

import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { buildUserContextBlock } from "../user/metrics";
import type { UserProfile } from "../user/manager";

const db = admin.firestore;

const MAX_HISTORY_MESSAGES = 10;
const MAX_CONTEXT_CHARS = 4000; // コンテキストの最大文字数（トークン節約）

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: FirebaseFirestore.Timestamp;
}

export interface ConversationContext {
  messages: Anthropic.MessageParam[];
  userProfileContext: string;
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
  // 並列でプロフィールと履歴を取得
  const [profile, history] = await Promise.all([
    getUserProfile(userId),
    getConversationHistory(userId),
  ]);

  // 文字数制限を適用
  const trimmedHistory = trimMessages(history);

  // Anthropic APIのメッセージ形式に変換
  const messages: Anthropic.MessageParam[] = trimmedHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // 現在のメッセージを追加
  messages.push({ role: "user", content: currentMessage });

  // ユーザープロフィールコンテキストを構築（年代・身体スペック・派生メトリクス含む）
  const userProfileContext = profile ? buildUserContextBlock(profile) : "";

  return { messages, userProfileContext };
}
