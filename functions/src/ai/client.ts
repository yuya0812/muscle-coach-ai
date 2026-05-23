/**
 * Anthropic APIクライアント管理 & 共通AI呼び出しユーティリティ
 */

import Anthropic from "@anthropic-ai/sdk";

// モデル切替はここ1箇所で行う
export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

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
 * systemPromptの指示に従いJSON文字列を返す
 */
export async function getAIJsonResponse(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
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
