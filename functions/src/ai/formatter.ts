/**
 * AIレスポンスフォーマッター
 * Claude APIの応答をLINEメッセージに適した形式に整形する。
 *
 * 方針:
 * - 絵文字は使わない（AI感を消すため）
 * - LINEの5,000文字制限を絶対に超えない（途中で切れる体験を避ける）
 * - 必要に応じて項目を削るが、フォーマット自体は崩さない
 */

const LINE_MAX_CHARS = 5000;

/**
 * AIのレスポンスをLINEメッセージ用にフォーマットする。
 * 5,000文字超のときは段落単位で分割（プロンプトで「収まる量に」要請しているので、
 * ここでの分割はあくまで保険）。
 */
export function formatForLine(text: string): string[] {
  let cleaned = text.trim();

  // コードブロックは除去（LINEで読めないため）
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");

  // 連続する空行を1つに
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  if (cleaned.length <= LINE_MAX_CHARS) {
    return [cleaned];
  }

  return splitMessage(cleaned);
}

function splitMessage(text: string): string[] {
  const messages: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= LINE_MAX_CHARS) {
      messages.push(remaining.trim());
      break;
    }
    const splitIndex = findSplitPoint(remaining, LINE_MAX_CHARS);
    messages.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return messages.filter((m) => m.length > 0);
}

function findSplitPoint(text: string, maxLength: number): number {
  const searchRange = text.substring(0, maxLength);
  const paragraphBreak = searchRange.lastIndexOf("\n\n");
  if (paragraphBreak > maxLength * 0.3) return paragraphBreak + 2;
  const lineBreak = searchRange.lastIndexOf("\n");
  if (lineBreak > maxLength * 0.3) return lineBreak + 1;
  const sentenceEnd = searchRange.lastIndexOf("。");
  if (sentenceEnd > maxLength * 0.3) return sentenceEnd + 1;
  return maxLength;
}

/**
 * ワークアウト記録の確認メッセージをフォーマットする
 */
export function formatWorkoutConfirmation(
  exercises: Array<{
    name: string;
    weight: number | null;
    reps: number | null;
    sets: number | null;
  }>
): string {
  const header = "記録しました。\n";
  const lines = exercises.map((e) => {
    const parts = [`・${e.name}`];
    if (e.weight) parts.push(`${e.weight}kg`);
    if (e.reps) parts.push(`${e.reps}回`);
    if (e.sets) parts.push(`${e.sets}セット`);
    return parts.join(" ");
  });
  const footer = "\nお疲れさまでした。";

  return header + lines.join("\n") + footer;
}

// ============================================================
// 定型メッセージ
// ============================================================

export function formatErrorMessage(type: "limit" | "parse" | "general"): string {
  switch (type) {
    case "limit":
      return "本日の無料利用回数に達しました。\nプレミアムプランで無制限にご利用いただけます。\nメニューから「プラン変更」をタップしてください。";
    case "parse":
      return "うまく読み取れませんでした。\n例えばこんな風に入力してみてください。\n・ベンチプレス 60kg 10回 3セット\n・スクワット 80kg 5回 3セット";
    case "general":
      return "申し訳ありません、エラーが発生しました。\nもう一度お試しください。";
  }
}

export function formatGreeting(userName: string): string {
  const hour = new Date(Date.now() + 9 * 60 * 60 * 1000).getHours();
  let timeGreeting: string;
  if (hour >= 5 && hour < 12) timeGreeting = "おはようございます";
  else if (hour >= 12 && hour < 18) timeGreeting = "こんにちは";
  else timeGreeting = "こんばんは";

  return `${timeGreeting}、${userName}さん。\n今日のトレーニングを記録しましょう。\n「ベンチプレス 60kg 10回 3セット」のように送ってください。`;
}
