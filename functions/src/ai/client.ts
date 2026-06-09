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

/**
 * タスク別の出力上限トークン数を返す。
 * 会話ハンドラ（trainer.ts）が client.messages.create を直接呼ぶときに
 * 1024 をハードコードしないための共通アクセサ。MAX_TOKENS_BY_TASK の定義に追従する。
 */
export function pickMaxTokens(task: ModelTask): number {
  return MAX_TOKENS_BY_TASK[task];
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
 * タスク別の出力上限 (max_tokens)。
 *
 * メニュー生成は 1週間×6種目×notes(前回→今回+フォーム) で 5000 字超になることがあり、
 * 2048 トークンでは途中で切れてしまうため余裕を持って 6144 を割り当てる。
 * 意図分類・記録パースは小さい JSON なので 1024 で十分。
 */
export const MAX_TOKENS_BY_TASK: Record<ModelTask, number> = {
  // 日本語は 1 文字 ≒ 1〜1.5 トークン。会話・進捗分析・フォーム指導は
  // プロンプト上「800〜900 字以内」を指示しているが、構造化記号（━━━ 等）や
  // 専門用語の言い換え括弧が乗ると 1024 トークンでは途中で切れることがある。
  // 文章が途中で切れる体験を確実に避けるため 2048 に引き上げる（LINE 5000 字制限内）。
  conversation: 2048,
  menu:         6144,
  // 週次・マイルストーンレポートも 700〜800 字想定だが、同様に余裕を持たせる。
  report:       2048,
  parse:        1024,
  intent:       512,
  autopost:     512,
};

/**
 * JSON出力専用のAI呼び出し
 *
 * systemPromptの指示に従いJSON文字列を返す。
 * task でモデルと max_tokens を切り替える（メニュー生成は Sonnet 6144、
 * 記録パース・意図分類は Haiku 512〜1024）。
 * 既存呼び出しの後方互換のため、task 省略時は menu 用設定を使う。
 */
export async function getAIJsonResponse(
  systemPrompt: string,
  userMessage: string,
  task: ModelTask = "menu"
): Promise<string> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: pickModel(task),
    max_tokens: MAX_TOKENS_BY_TASK[task],
    // systemPrompt（MENU_GENERATION_PROMPT 等）は全ユーザー共通で不変なので
    // cache_control を付けてプロンプトキャッシュを効かせる。ユーザー固有のデータは
    // userMessage 側（プレフィックスの後ろ）にあるためキャッシュのプレフィックスは壊れない。
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  // 出力が max_tokens で打ち切られた場合は早期検知できるよう warn ログを出す。
  // メニュー生成のような大きな JSON で切れると JSON.parse 失敗 → ユーザーには
  // 「メニュー生成に失敗しました」しか返らないため、原因切り分けに必要。
  if (response.stop_reason === "max_tokens") {
    console.warn("[getAIJsonResponse] stop_reason=max_tokens; output was truncated", {
      task,
      maxTokens: MAX_TOKENS_BY_TASK[task],
      outputTokens: response.usage?.output_tokens,
    });
  }

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
