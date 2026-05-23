/**
 * Anthropic APIクライアント管理 & 共通AI呼び出しユーティリティ
 */

import Anthropic from "@anthropic-ai/sdk";

/**
 * タスク種別。AI呼び出しはこの種別を渡してモデルを選択する。
 *
 *   conversation: LINE 会話（フォーム / 進捗 / 栄養 / 一般）
 *   menu:         メニュー生成（JSON）
 *   report:       マイルストーン分析・週次レポート
 *   parse:        ワークアウト記録パース（JSON）
 *   intent:       意図分類（JSON、キーワード分類のフォールバック）
 *   autopost:     X 自動投稿（短文生成）
 *
 * ユーザー体験の核 (conversation / menu / report) は Sonnet、
 * 単純な構造化処理 (parse / intent / autopost) は Haiku、というハイブリッド構成。
 * 単価が 3 倍違うため、安く済ませられる箇所まで Sonnet にする必要はない。
 */
export type ModelTask =
  | "conversation"
  | "menu"
  | "report"
  | "parse"
  | "intent"
  | "autopost";

export const MODEL_BY_TASK: Record<ModelTask, string> = {
  conversation: "claude-sonnet-4-6",
  menu:         "claude-sonnet-4-6",
  report:       "claude-sonnet-4-6",
  parse:        "claude-haiku-4-5-20251001",
  intent:       "claude-haiku-4-5-20251001",
  autopost:     "claude-haiku-4-5-20251001",
};

export function pickModel(task: ModelTask): string {
  return MODEL_BY_TASK[task];
}

// 後方互換: 既存コードが import している定数。conversation のモデルを指す。
// 新規コードは pickModel(taskKind) を使うこと。
export const CLAUDE_MODEL = MODEL_BY_TASK.conversation;

let anthropicClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/**
 * JSON出力専用のAI呼び出し
 *
 * systemPromptの指示に従いJSON文字列を返す。
 * task でモデルを切り替える（メニュー生成は Sonnet、記録パース・意図分類は Haiku）。
 * 既存呼び出しの後方互換のため、task 省略時は menu 用モデル（現状は Sonnet）を使う。
 */
export async function getAIJsonResponse(
  systemPrompt: string,
  userMessage: string,
  task: ModelTask = "menu"
): Promise<string> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: pickModel(task),
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  return extractJson(text);
}

/**
 * Claude のレスポンスから JSON 本体を取り出す防御層。
 *
 * 想定ケース:
 *   1. 生 JSON のみ → そのまま返す
 *   2. ```json ... ``` で囲まれている → 中身を返す
 *   3. 前置きの説明文 + JSON → 最初の { から最後の } までを切り出して返す
 *
 * いずれにもマッチしなければ trim だけ返す（呼び出し元で JSON.parse 失敗時に詳細ログを出す）。
 */
function extractJson(text: string): string {
  const trimmed = text.trim();

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}
