/**
 * ユーザーメッセージの意図分類
 * Claude APIを使わずにキーワードベースで高速分類し、
 * 曖昧な場合のみAIにフォールバックする
 */

import { getAIJsonResponse } from "./client";
import { INTENT_CLASSIFICATION_PROMPT } from "./prompts";

export type Intent =
  | "record"
  | "menu_request"
  | "form_question"
  | "progress"
  | "nutrition"
  | "general"
  | "greeting"
  | "other";

export interface ClassificationResult {
  intent: Intent;
  confidence: number;
  exerciseName: string | null;
}

// キーワードベースの高速分類パターン
const PATTERNS: { intent: Intent; keywords: RegExp }[] = [
  {
    intent: "record",
    keywords:
      /(\d+\s*(kg|キロ|KG)|\d+\s*(回|rep|レップ)|\d+\s*(セット|set|SET)|今日.*(やった|した|トレ|筋トレ))/i,
  },
  {
    intent: "menu_request",
    keywords:
      /(メニュー|めにゅー|作って|組んで|考えて|何やれば|なにやれば|今日.*(何|なに).*(する|やる|トレ))/,
  },
  {
    intent: "form_question",
    keywords:
      /(フォーム|やり方|教えて|コツ|ポイント|正しい.*(方法|姿勢)|どうやって)/,
  },
  {
    intent: "progress",
    keywords:
      /(記録|履歴|進捗|推移|伸び|成長|振り返|最近の|前回|見せて|確認)/,
  },
  {
    intent: "nutrition",
    keywords:
      /(プロテイン|タンパク質|PFC|カロリー|食事|栄養|サプリ|炭水化物|脂質|クレアチン|BCAA|減量食|増量食|カーボ|マクロ|プロテイン量|食べ物|食べる|何を食|サプリ)/,
  },
  {
    intent: "greeting",
    keywords:
      /^(こんにちは|こんばんは|おはよう|お疲れ|おつかれ|はじめまして|ども|やあ|hey|hello|hi)$/i,
  },
];

// 種目名の抽出パターン
const EXERCISE_NAMES = [
  "ベンチプレス", "ベンチ", "BP",
  "スクワット", "スク", "スクワ",
  "デッドリフト", "デッド", "DL",
  "オーバーヘッドプレス", "ショルプレ", "OHP",
  "ラットプルダウン", "ラットプル",
  "チンニング", "懸垂",
  "サイドレイズ", "サイレ",
  "レッグプレス", "レグプレ",
  "バイセプスカール", "カール", "アームカール",
  "プッシュアップ", "腕立て",
  "クランチ", "腹筋",
  "ダンベルプレス", "ダンベルベンチ",
  "インクライン",
  "ディップス",
  "ローイング", "ロウ",
  "レッグカール", "レッグエクステンション",
  "ブルガリアンスクワット",
  "フロントスクワット",
];

/**
 * キーワードベースの高速分類を試みる
 */
function classifyByKeywords(message: string): ClassificationResult | null {
  const trimmed = message.trim();

  for (const pattern of PATTERNS) {
    if (pattern.keywords.test(trimmed)) {
      const exerciseName = extractExerciseName(trimmed);
      return {
        intent: pattern.intent,
        confidence: 0.8,
        exerciseName,
      };
    }
  }

  return null;
}

/**
 * メッセージから種目名を抽出
 */
function extractExerciseName(message: string): string | null {
  for (const name of EXERCISE_NAMES) {
    if (message.includes(name)) {
      return name;
    }
  }
  return null;
}

/**
 * ユーザーメッセージの意図を分類する
 * まずキーワードベースで高速分類し、マッチしなければAIにフォールバック
 */
export async function classifyIntent(
  message: string
): Promise<ClassificationResult> {
  // 1. キーワードベースで高速分類を試みる
  const keywordResult = classifyByKeywords(message);
  if (keywordResult) {
    return keywordResult;
  }

  // 2. AIによる分類にフォールバック
  try {
    const jsonStr = await getAIJsonResponse(
      INTENT_CLASSIFICATION_PROMPT,
      message
    );
    const parsed = JSON.parse(jsonStr) as ClassificationResult;

    // バリデーション
    const validIntents: Intent[] = [
      "record", "menu_request", "form_question",
      "progress", "nutrition", "general", "greeting", "other",
    ];
    if (!validIntents.includes(parsed.intent)) {
      return { intent: "general", confidence: 0.5, exerciseName: null };
    }

    return {
      intent: parsed.intent,
      confidence: parsed.confidence ?? 0.7,
      exerciseName: parsed.exerciseName ?? null,
    };
  } catch {
    // AIの分類も失敗した場合は一般質問として扱う
    return { intent: "general", confidence: 0.3, exerciseName: null };
  }
}
