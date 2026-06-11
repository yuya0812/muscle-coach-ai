/**
 * AIトレーナーエンジン（方針転換後）
 *
 * AIの用途は2つだけ:
 *  1. 雑な入力 → 構造化記録（recorder.ts の parseAndSaveWorkout、webhook 側で直接処理）
 *  2. 記録の集計・分析 → コード集計 + AI言語化（analysis.ts）
 *
 * メニュー生成・フォーム指導・栄養相談・一般コーチング会話（正解のない生成）は廃止した。
 * この関数は意図分類の結果のうち analyze / other を捌く（record/greeting は webhook 側で処理）。
 */

import { classifyIntent, Intent } from "./intentClassifier";
import { buildAnalysis } from "./analysis";
import { formatForLine, formatGreeting } from "./formatter";

// 後方互換のため再エクスポート（recorder.ts等が import from "./trainer" している）
export { getAIJsonResponse } from "./client";

// 記録の使い方案内（コーチング会話を廃止したため、雑談・質問にはこれを返す）
export const USAGE_GUIDE =
  "トレーニングを記録するには、こんなふうに送ってください。\n" +
  "・ベンチプレス 60kg 10回 3セット\n" +
  "・今日はスクワット80キロ5回を3セット\n\n" +
  "記録がたまってきたら「分析して」「最近どう？」と送ると、" +
  "部位のバランスや伸びている種目をまとめてお伝えします。";

/**
 * メインのトレーナー応答関数。
 * 意図分類 → analyze なら分析（集計+言語化）、それ以外は使い方案内。
 *
 * record / greeting は webhook 側で先に処理される想定だが、フォールバックとして
 * greeting にも対応しておく。
 */
export async function getTrainerResponse(
  userId: string,
  userMessage: string,
  userName?: string
): Promise<string[]> {
  const classification = await classifyIntent(userMessage);

  switch (classification.intent) {
    case "greeting":
      return [formatGreeting(userName || "ゲスト")];

    case "analyze":
      return handleAnalysis(userId);

    case "record":
    case "other":
    default:
      // record は本来 webhook 側で parseAndSaveWorkout に流れる。ここに来た場合や
      // 雑談・質問は、記録の使い方を案内する。
      return [USAGE_GUIDE];
  }
}

/**
 * 分析リクエストを処理。コード集計 + AI言語化（analysis.ts）に委譲する。
 * 記録がなければ案内を返す。
 */
async function handleAnalysis(userId: string): Promise<string[]> {
  try {
    const text = await buildAnalysis(userId, "overview");
    if (!text) {
      return [
        "まだ分析できる記録がありません。\n" +
          "「ベンチプレス 60kg 10回 3セット」のように記録を送ってみてください。",
      ];
    }
    return formatForLine(text);
  } catch (err) {
    console.error("[handleAnalysis] error:", err);
    return ["分析中にエラーが発生しました。もう一度お試しください。"];
  }
}

// Intent型の再エクスポート（他モジュールから使えるように）
export type { Intent };
export { classifyIntent } from "./intentClassifier";
