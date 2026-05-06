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

  // JSONブロック内のテキストを抽出（```json ... ``` 形式の場合）
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return jsonMatch[1];
  }

  return text.trim();
}
