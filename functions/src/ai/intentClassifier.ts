/**
 * ユーザーメッセージの意図分類（記録 / 分析 / 挨拶 / その他）
 *
 * 方針転換後の用途に合わせて分類を縮小:
 * - record:  トレーニング記録の報告（→ パースして保存）
 * - analyze: 進捗・分析・調子確認（→ コード集計 + AI言語化の分析を返す）
 * - greeting: 挨拶（→ 即返答、AI不使用）
 * - other:   上記以外（→ 記録の使い方を案内）
 *
 * メニュー生成・フォーム指導・栄養相談などの「正解のない生成」は廃止したため、
 * それらの意図カテゴリも持たない。
 */

import { getAIJsonResponse } from "./client";
import { INTENT_CLASSIFICATION_PROMPT } from "./prompts";

export type Intent = "record" | "analyze" | "greeting" | "other";

export interface ClassificationResult {
  intent: Intent;
  confidence: number;
}

// 数字を含む文でも「記録報告」ではなく相談・分析依頼とみなすべきガード語。
// 例:「最近100kg上がるようになった？」のような確認は record ではなく analyze に寄せる。
const RECORD_GUARD = /(どう|分析|教えて|どれくらい|どんな感じ|アドバイス|相談|伸び|成長|停滞|弱点)/;

// キーワードベースの高速分類パターン（上から順に評価）
const PATTERNS: { intent: Intent; keywords: RegExp }[] = [
  {
    // 数字 + 単位を含む = 記録報告。ただし RECORD_GUARD（相談・分析語）を含む場合は除外。
    intent: "record",
    keywords:
      /(\d+\s*(kg|キロ|KG)|\d+\s*(回|rep|レップ)|\d+\s*(セット|set|SET)|今日.*(やった|した|筋トレ))/i,
  },
  {
    // 進捗・分析・調子確認系。弱点・伸び悩み・部位バランスの確認もここ。
    intent: "analyze",
    keywords:
      /(分析|記録|履歴|進捗|推移|伸び|成長|振り返|最近|どう|確認|調子|どんな感じ|どうなって|ペース|どれくらい|強くなって|停滞|伸び悩|上がって|弱点|バランス|まとめ)/,
  },
  {
    intent: "greeting",
    keywords:
      /^(こんにちは|こんばんは|おはよう|お疲れ|おつかれ|はじめまして|ども|やあ|hey|hello|hi)[。！!～ー…]*$/i,
  },
];

/**
 * キーワードベースの高速分類を試みる
 */
function classifyByKeywords(message: string): ClassificationResult | null {
  const trimmed = message.trim();
  const hasRecordGuard = RECORD_GUARD.test(trimmed);

  for (const pattern of PATTERNS) {
    // 数字を含んでも相談・分析語を含む場合は record として扱わない
    if (pattern.intent === "record" && hasRecordGuard) continue;

    if (pattern.keywords.test(trimmed)) {
      return { intent: pattern.intent, confidence: 0.8 };
    }
  }

  return null;
}

/**
 * ユーザーメッセージの意図を分類する。
 * まずキーワードベースで高速分類し、マッチしなければAIにフォールバック。
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
      message,
      "intent"
    );
    const parsed = JSON.parse(jsonStr) as ClassificationResult;

    const validIntents: Intent[] = ["record", "analyze", "greeting", "other"];
    if (!validIntents.includes(parsed.intent)) {
      return { intent: "other", confidence: 0.5 };
    }

    return {
      intent: parsed.intent,
      confidence: parsed.confidence ?? 0.7,
    };
  } catch {
    // AIの分類も失敗した場合はその他として扱う（記録の使い方案内に流す）
    return { intent: "other", confidence: 0.3 };
  }
}
