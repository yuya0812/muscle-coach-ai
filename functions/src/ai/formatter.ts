/**
 * AIレスポンスフォーマッター
 * Claude APIの応答をLINEメッセージに適した形式に整形する
 */

const LINE_MAX_CHARS = 5000;
const PREFERRED_MAX_CHARS = 500;

/**
 * AIのレスポンスをLINEメッセージ用にフォーマットする
 */
export function formatForLine(text: string): string[] {
  let cleaned = text.trim();

  // Markdownの太字(**text**)をそのまま残す（LINEでは表示されないが読める）
  // コードブロックを除去
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");

  // 連続する空行を1つに
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // LINE文字数制限内であればそのまま返す
  if (cleaned.length <= LINE_MAX_CHARS) {
    return [cleaned];
  }

  // 制限を超える場合は分割
  return splitMessage(cleaned);
}

/**
 * 長いメッセージを適切な位置で分割する
 */
function splitMessage(text: string): string[] {
  const messages: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= LINE_MAX_CHARS) {
      messages.push(remaining.trim());
      break;
    }

    // 分割位置を探す（段落区切り → 改行 → 句点 → 文字数制限）
    let splitIndex = findSplitPoint(remaining, LINE_MAX_CHARS);
    messages.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return messages.filter((m) => m.length > 0);
}

/**
 * メッセージの分割位置を見つける
 */
function findSplitPoint(text: string, maxLength: number): number {
  const searchRange = text.substring(0, maxLength);

  // 段落区切り（空行）で分割を試みる
  const paragraphBreak = searchRange.lastIndexOf("\n\n");
  if (paragraphBreak > maxLength * 0.3) {
    return paragraphBreak + 2;
  }

  // 改行で分割を試みる
  const lineBreak = searchRange.lastIndexOf("\n");
  if (lineBreak > maxLength * 0.3) {
    return lineBreak + 1;
  }

  // 句点で分割
  const sentenceEnd = searchRange.lastIndexOf("。");
  if (sentenceEnd > maxLength * 0.3) {
    return sentenceEnd + 1;
  }

  // どれも見つからなければ文字数制限で強制分割
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
  const header = "記録しました！💪\n";
  const lines = exercises.map((e) => {
    const parts = [`・${e.name}`];
    if (e.weight) parts.push(`${e.weight}kg`);
    if (e.reps) parts.push(`${e.reps}回`);
    if (e.sets) parts.push(`${e.sets}セット`);
    return parts.join(" ");
  });
  const footer = "\nお疲れ様でした！🔥";

  return header + lines.join("\n") + footer;
}

/**
 * メニュー生成結果をLINE表示用テキストにフォーマットする
 */
export function formatMenuForLine(menuJson: {
  weeklyPlan: {
    splitMethod: string;
    daysPerWeek: number;
    days: Array<{
      dayNumber: number;
      theme: string;
      exercises: Array<{
        category: string;
        name: string;
        sets: number;
        reps: string;
        weight: string;
        restSeconds: number;
        notes: string;
      }>;
    }>;
  };
  advice: string;
}): string {
  const lines: string[] = [];

  lines.push(`🏋️‍♂️ トレーニングメニュー`);
  lines.push(`（${menuJson.weeklyPlan.splitMethod}・週${menuJson.weeklyPlan.daysPerWeek}回）\n`);

  for (const day of menuJson.weeklyPlan.days) {
    lines.push(`📅 Day ${day.dayNumber}: ${day.theme}`);
    for (const ex of day.exercises) {
      const icon = getCategoryIcon(ex.category);
      const detail = `${ex.sets}×${ex.reps}`;
      const weight = ex.weight !== "自重" ? ` (${ex.weight})` : "";
      lines.push(`${icon} ${ex.name} ${detail}${weight}`);
    }
    lines.push("");
  }

  if (menuJson.advice) {
    lines.push(`💡 ${menuJson.advice}`);
  }

  const result = lines.join("\n");

  // 長すぎる場合は切り詰める
  if (result.length > PREFERRED_MAX_CHARS) {
    return formatMenuCompact(menuJson);
  }

  return result;
}

/**
 * コンパクト版メニューフォーマット（長い場合のフォールバック）
 */
function formatMenuCompact(menuJson: {
  weeklyPlan: {
    splitMethod: string;
    daysPerWeek: number;
    days: Array<{
      dayNumber: number;
      theme: string;
      exercises: Array<{
        category: string;
        name: string;
        sets: number;
        reps: string;
      }>;
    }>;
  };
  advice: string;
}): string {
  const lines: string[] = [];
  lines.push(`🏋️‍♂️ メニュー（${menuJson.weeklyPlan.splitMethod}）\n`);

  for (const day of menuJson.weeklyPlan.days) {
    lines.push(`📅 Day${day.dayNumber}: ${day.theme}`);
    const mainExercises = day.exercises.filter(
      (e) => e.category === "main" || e.category === "accessory"
    );
    for (const ex of mainExercises) {
      lines.push(`  ・${ex.name} ${ex.sets}×${ex.reps}`);
    }
  }

  if (menuJson.advice) {
    lines.push(`\n💡 ${menuJson.advice}`);
  }

  return lines.join("\n");
}

function getCategoryIcon(category: string): string {
  switch (category) {
    case "warmup": return "🔸";
    case "main": return "🔴";
    case "accessory": return "🔵";
    case "cooldown": return "🟢";
    default: return "・";
  }
}

/**
 * エラーメッセージをフォーマットする
 */
export function formatErrorMessage(type: "limit" | "parse" | "general"): string {
  switch (type) {
    case "limit":
      return "本日の無料利用回数に達しました。\nプレミアムプランで無制限にご利用いただけます！💎\n\nメニューから「プラン変更」をタップしてください。";
    case "parse":
      return "すみません、内容を理解できませんでした 🤔\n\n例えばこんな風に入力してみてください：\n・ベンチプレス 60kg 10回 3セット\n・メニュー作って\n・スクワットのフォーム教えて";
    case "general":
      return "申し訳ありません、エラーが発生しました。\nもう一度お試しください 🙏";
  }
}

/**
 * 挨拶メッセージを返す
 */
export function formatGreeting(userName: string): string {
  const hour = new Date(
    Date.now() + 9 * 60 * 60 * 1000 // JST
  ).getHours();

  let timeGreeting: string;
  if (hour >= 5 && hour < 12) {
    timeGreeting = "おはようございます";
  } else if (hour >= 12 && hour < 18) {
    timeGreeting = "こんにちは";
  } else {
    timeGreeting = "こんばんは";
  }

  return `${timeGreeting}、${userName}さん！💪\n\n今日もトレーニング頑張りましょう！\n何でも聞いてくださいね 🏋️‍♂️`;
}
