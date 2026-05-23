/**
 * メニュー生成・分析用に「直近の記録の要約」を作るヘルパー。
 * AIに丸ごと記録を渡すとトークンを食う & ノイズが多いので、
 * 種目別に最大重量・典型レップ・典型セット数を集計したサマリーを返す。
 */

import { getRecentWorkouts, totalVolumeOf } from "./recorder";

const MUSCLE_GROUPS = ["chest", "back", "legs", "shoulders", "arms", "core"] as const;
type MuscleGroup = typeof MUSCLE_GROUPS[number];

// よくある種目名から部位を推定する（完全網羅ではないが、メニュー組成のヒントとしては十分）
const EXERCISE_TO_MUSCLE: Array<[RegExp, MuscleGroup]> = [
  [/ベンチ|チェスト|プッシュアップ|腕立て|ディップス|フライ/, "chest"],
  [/ラットプル|ロー|デッドリフト|懸垂|チンニング|プルアップ|プルダウン|シュラッグ/, "back"],
  [/スクワット|レッグプレス|レッグカール|レッグエクステンション|ランジ|ヒップ|カーフ|ブルガリアン/, "legs"],
  [/ショルダー|サイドレイズ|フロントレイズ|リアレイズ|オーバーヘッド|アーノルド/, "shoulders"],
  [/カール|トライセプス|プレスダウン|キックバック|スカルクラッシャー|ハンマー|プリーチャー/, "arms"],
  [/クランチ|アブ|プランク|レッグレイズ|シットアップ|腹筋|ロシアンツイスト/, "core"],
];

function detectMuscleGroup(exerciseName: string): MuscleGroup | null {
  for (const [pattern, group] of EXERCISE_TO_MUSCLE) {
    if (pattern.test(exerciseName)) return group;
  }
  return null;
}

const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: "胸",
  back: "背中",
  legs: "脚",
  shoulders: "肩",
  arms: "腕",
  core: "腹",
};

interface ExerciseSummary {
  name: string;
  maxWeight: number | null;
  typicalReps: number | null;
  typicalSets: number | null;
  lastUsedDaysAgo: number;
  timesPerformed: number;
}

export interface WorkoutHistorySummary {
  hasRecords: boolean;
  totalRecords: number;
  sessionsLast14Days: number;
  exerciseSummaries: ExerciseSummary[];
  muscleTouchCounts: Record<MuscleGroup, number>;
  underworkedMuscles: MuscleGroup[];
  lastWorkoutDaysAgo: number | null;
}

/**
 * 直近のワークアウトを集計してサマリーを返す。
 * 履歴が空の場合は totalRecords=0 のサマリーを返す（呼び出し元で「履歴なし」分岐できる）。
 */
export async function buildWorkoutHistorySummary(
  userId: string,
  recentLimit = 30
): Promise<WorkoutHistorySummary> {
  const records = await getRecentWorkouts(userId, recentLimit);

  const muscleTouchCounts: Record<MuscleGroup, number> = {
    chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0,
  };

  if (records.length === 0) {
    return {
      hasRecords: false,
      totalRecords: 0,
      sessionsLast14Days: 0,
      exerciseSummaries: [],
      muscleTouchCounts,
      underworkedMuscles: [...MUSCLE_GROUPS],
      lastWorkoutDaysAgo: null,
    };
  }

  const now = Date.now();
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  let sessionsLast14Days = 0;

  // 種目別の集計バッファ
  const byExercise = new Map<string, {
    maxWeight: number | null;
    repsBag: number[];
    setsBag: number[];
    lastDate: Date;
    count: number;
  }>();

  let mostRecentDate: Date | null = null;

  for (const record of records) {
    const recordDate = record.date.toDate();
    if (!mostRecentDate || recordDate > mostRecentDate) mostRecentDate = recordDate;
    if (now - recordDate.getTime() <= FOURTEEN_DAYS_MS) sessionsLast14Days += 1;

    for (const ex of record.exercises) {
      const group = detectMuscleGroup(ex.name);
      if (group && totalVolumeOf(ex) > 0) muscleTouchCounts[group] += 1;

      let bucket = byExercise.get(ex.name);
      if (!bucket) {
        bucket = { maxWeight: null, repsBag: [], setsBag: [], lastDate: recordDate, count: 0 };
        byExercise.set(ex.name, bucket);
      }
      bucket.count += 1;
      if (recordDate > bucket.lastDate) bucket.lastDate = recordDate;
      for (const g of ex.setGroups ?? []) {
        if (g.weight != null && (bucket.maxWeight == null || g.weight > bucket.maxWeight)) {
          bucket.maxWeight = g.weight;
        }
        if (g.reps != null) bucket.repsBag.push(g.reps);
        if (g.sets != null) bucket.setsBag.push(g.sets);
      }
    }
  }

  const exerciseSummaries: ExerciseSummary[] = Array.from(byExercise.entries())
    .map(([name, b]) => ({
      name,
      maxWeight: b.maxWeight,
      typicalReps: median(b.repsBag),
      typicalSets: median(b.setsBag),
      lastUsedDaysAgo: Math.max(0, Math.floor((now - b.lastDate.getTime()) / (24 * 60 * 60 * 1000))),
      timesPerformed: b.count,
    }))
    // 実施回数が多い順 → 直近順
    .sort((a, b) => b.timesPerformed - a.timesPerformed || a.lastUsedDaysAgo - b.lastUsedDaysAgo);

  const underworkedMuscles = MUSCLE_GROUPS.filter((g) => muscleTouchCounts[g] === 0);

  const lastWorkoutDaysAgo = mostRecentDate
    ? Math.max(0, Math.floor((now - mostRecentDate.getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  return {
    hasRecords: true,
    totalRecords: records.length,
    sessionsLast14Days,
    exerciseSummaries,
    muscleTouchCounts,
    underworkedMuscles,
    lastWorkoutDaysAgo,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/**
 * AIに渡す用の Markdown ブロックを生成する。
 * 履歴が空の場合は空文字を返す（呼び出し元で連結時に何も足さない）。
 */
export function formatWorkoutHistoryForPrompt(summary: WorkoutHistorySummary): string {
  if (summary.totalRecords === 0) {
    return "## トレーニング履歴\n（まだ記録なし。初回ユーザーとしてフォーム習得を最優先に組むこと）\n";
  }

  const lines: string[] = ["## トレーニング履歴（直近）"];
  lines.push(`- 集計対象: 直近${summary.totalRecords}セッション`);
  lines.push(`- 過去14日間のジム回数: ${summary.sessionsLast14Days}回`);
  if (summary.lastWorkoutDaysAgo !== null) {
    lines.push(`- 最終トレーニング: ${summary.lastWorkoutDaysAgo}日前`);
  }

  // 種目別の実績（上位8件）
  if (summary.exerciseSummaries.length > 0) {
    lines.push("");
    lines.push("### 種目別の実績（実施回数順）");
    const top = summary.exerciseSummaries.slice(0, 8);
    for (const s of top) {
      const parts: string[] = [];
      if (s.maxWeight != null) parts.push(`最大 ${s.maxWeight}kg`);
      if (s.typicalReps != null) parts.push(`通常 ${s.typicalReps}回`);
      if (s.typicalSets != null) parts.push(`${s.typicalSets}セット`);
      const stats = parts.length > 0 ? ` / ${parts.join(" × ")}` : "";
      lines.push(`- ${s.name}: ${s.timesPerformed}回実施${stats}（${s.lastUsedDaysAgo}日前）`);
    }
  }

  // 部位バランス
  const touchEntries = MUSCLE_GROUPS.map((g) => `${MUSCLE_LABEL[g]}${summary.muscleTouchCounts[g]}`);
  lines.push("");
  lines.push(`### 部位別の刺激回数: ${touchEntries.join(" / ")}`);

  if (summary.underworkedMuscles.length > 0) {
    const labels = summary.underworkedMuscles.map((g) => MUSCLE_LABEL[g]).join("・");
    lines.push(`### 触れていない部位: ${labels}（次のメニューで意識的に組み込むこと）`);
  }

  return lines.join("\n") + "\n";
}
