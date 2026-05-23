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
 * 5,000文字超のときは段落単位で分割（trainer.ts側のプロンプトで「収まる量に」要請しているので、
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
// メニュー表示
// ============================================================

interface MenuExerciseForFormat {
  category: string;
  name: string;
  sets: number;
  reps: string;
  weight: string;
  restSeconds: number;
  notes?: string;
}

interface MenuJson {
  weeklyPlan: {
    splitMethod: string;
    daysPerWeek: number;
    sessionDurationMin?: number;
    rationale?: string;
    days: Array<{
      dayNumber: number;
      theme: string;
      exercises: MenuExerciseForFormat[];
    }>;
  };
  advice: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  warmup: "ウォームアップ",
  main: "メイン",
  accessory: "補助",
  cooldown: "クールダウン",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] || category;
}

// 視覚的なセクション区切り。絵文字は使わず記号構造化で視認性を上げる。
const DIVIDER_HEAVY = "━━━━━━━━━━━━━━";
const DIVIDER_LIGHT = "──────────────";

// 全角数字の番号（1〜30 をカバー、それ以上は半角フォールバック）
const FULLWIDTH_NUMS = ["０","１","２","３","４","５","６","７","８","９"];
function fullwidthNumber(n: number): string {
  if (n < 0 || n > 30) return String(n);
  return String(n).split("").map((c) => FULLWIDTH_NUMS[Number(c)]).join("");
}

/**
 * メニュー生成結果をLINE表示用テキストにフォーマットする。
 * - 詳細版（weight・rest・notes 全部表示）でまず組み立て
 * - 5,000文字を超える場合は notes を削る → さらに超える場合は補助種目の notes も削る → 最終的に compact 版にフォールバック
 */
export function formatMenuForLine(menuJson: MenuJson): string {
  const fullDetail = renderMenu(menuJson, { includeNotes: true, includeRest: true });
  if (fullDetail.length <= LINE_MAX_CHARS) return fullDetail;

  const noNotes = renderMenu(menuJson, { includeNotes: false, includeRest: true });
  if (noNotes.length <= LINE_MAX_CHARS) return noNotes;

  const minimal = renderMenu(menuJson, { includeNotes: false, includeRest: false });
  if (minimal.length <= LINE_MAX_CHARS) return minimal;

  // どうしても収まらない極端なケースのみ、コンパクト版にフォールバック
  return renderCompact(menuJson);
}

interface RenderOptions {
  includeNotes: boolean;
  includeRest: boolean;
}

function renderMenu(menuJson: MenuJson, opt: RenderOptions): string {
  const plan = menuJson.weeklyPlan;
  const lines: string[] = [];

  // ヘッダーブロック（太い区切り線で挟む）
  lines.push(DIVIDER_HEAVY);
  lines.push(`トレーニングメニュー`);
  lines.push(`（${plan.splitMethod}・週${plan.daysPerWeek}回）`);
  if (plan.sessionDurationMin) lines.push(`1回あたり目安  約${plan.sessionDurationMin}分`);
  lines.push(DIVIDER_HEAVY);

  if (plan.rationale) {
    lines.push("");
    lines.push(`▼ 設計意図`);
    lines.push(`${plan.rationale}`);
  }

  for (const day of plan.days) {
    lines.push("");
    // Day 区切り：太い線で挟み、テーマを《 》で囲って続けて表示
    lines.push(`━━━ Day ${day.dayNumber} ━━━`);
    lines.push(`《 ${day.theme} 》`);
    let idx = 1;
    for (const ex of day.exercises) {
      lines.push("");
      // 種目見出し：［全角番号］種目名  《カテゴリ》
      lines.push(`［${fullwidthNumber(idx)}］${ex.name}  《${categoryLabel(ex.category)}》`);
      const weight = ex.weight && ex.weight.trim().length > 0 ? ex.weight : "自重";
      lines.push(`   ${weight}  ${ex.sets}セット × ${ex.reps}回`);
      if (opt.includeRest && ex.restSeconds) {
        lines.push(`   休憩 ${ex.restSeconds}秒`);
      }
      if (opt.includeNotes && ex.notes) {
        lines.push(`   ▷ ${ex.notes}`);
      }
      idx += 1;
    }
  }

  if (menuJson.advice) {
    lines.push("");
    lines.push(DIVIDER_LIGHT);
    lines.push(`《 今週のアドバイス 》`);
    lines.push(DIVIDER_LIGHT);
    lines.push(`${menuJson.advice}`);
  }

  return lines.join("\n");
}

/**
 * 最小のコンパクト版（5,000文字に収まらない極端なケースのフォールバック）。
 * 種目名と重量・回数のみ。
 */
function renderCompact(menuJson: MenuJson): string {
  const plan = menuJson.weeklyPlan;
  const lines: string[] = [];
  lines.push(DIVIDER_HEAVY);
  lines.push(`トレーニングメニュー（${plan.splitMethod}）`);
  lines.push(DIVIDER_HEAVY);

  for (const day of plan.days) {
    lines.push("");
    lines.push(`━━━ Day ${day.dayNumber} ━━━`);
    lines.push(`《 ${day.theme} 》`);
    const target = day.exercises.filter((e) => e.category === "main" || e.category === "accessory");
    for (const ex of target) {
      const weight = ex.weight && ex.weight.trim().length > 0 ? ex.weight : "自重";
      lines.push(`・${ex.name}  ${weight}  ${ex.sets}×${ex.reps}`);
    }
  }

  if (menuJson.advice) {
    lines.push("");
    lines.push(DIVIDER_LIGHT);
    lines.push(`《 今週のアドバイス 》`);
    lines.push(DIVIDER_LIGHT);
    lines.push(`${menuJson.advice}`);
  }

  // それでも超えたら末尾を切る（保険）
  const text = lines.join("\n");
  if (text.length <= LINE_MAX_CHARS) return text;
  return text.substring(0, LINE_MAX_CHARS - 30).trimEnd() + "\n…（続きはメニュー画面で確認）";
}

// ============================================================
// 定型メッセージ
// ============================================================

export function formatErrorMessage(type: "limit" | "parse" | "general"): string {
  switch (type) {
    case "limit":
      return "本日の無料利用回数に達しました。\nプレミアムプランで無制限にご利用いただけます。\nメニューから「プラン変更」をタップしてください。";
    case "parse":
      return "うまく読み取れませんでした。\n例えばこんな風に入力してみてください。\n・ベンチプレス 60kg 10回 3セット\n・メニュー作って\n・スクワットのフォーム教えて";
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

  return `${timeGreeting}、${userName}さん。\n今日もトレーニング、無理のない範囲で行きましょう。\n何でも聞いてください。`;
}
