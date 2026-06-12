import * as admin from "firebase-admin";
import { getAIJsonResponse } from "../ai/trainer";
import { WORKOUT_PARSE_PROMPT } from "../ai/prompts";

const db = admin.firestore;

// 1種目を構成するセットグループ（同じ重量×回数のセット数を1行で表現）
export interface ExerciseSetGroup {
  weight: number | null;
  reps: number | null;
  sets: number | null;
}

// Firestoreに保存される新形式
export interface Exercise {
  name: string;
  setGroups: ExerciseSetGroup[];
}

// 旧形式（互換性のため読み込みのみサポート）
interface LegacyExercise {
  name: string;
  weight?: number | null;
  reps?: number | null;
  sets?: number | null;
}

export interface WorkoutRecord {
  date: FirebaseFirestore.Timestamp;
  exercises: Exercise[];
  notes: string;
}

// 旧形式 ⇄ 新形式の正規化（読み込み時のbackward-compatibility）
export function normalizeExercise(raw: Exercise | LegacyExercise): Exercise {
  if ("setGroups" in raw && Array.isArray(raw.setGroups)) {
    return raw;
  }
  const legacy = raw as LegacyExercise;
  const hasAnyValue =
    legacy.weight != null || legacy.reps != null || legacy.sets != null;
  return {
    name: legacy.name,
    setGroups: hasAnyValue
      ? [
          {
            weight: legacy.weight ?? null,
            reps: legacy.reps ?? null,
            sets: legacy.sets ?? null,
          },
        ]
      : [],
  };
}

export function normalizeWorkoutRecord(raw: WorkoutRecord): WorkoutRecord {
  return {
    ...raw,
    exercises: (raw.exercises ?? []).map((ex) =>
      normalizeExercise(ex as Exercise | LegacyExercise)
    ),
  };
}

// 1種目の総重量計算: Σ (weight × reps × sets) over all setGroups
export function totalVolumeOf(exercise: Exercise): number {
  return (exercise.setGroups ?? []).reduce((sum, g) => {
    const w = g.weight ?? 0;
    const r = g.reps ?? 0;
    const s = g.sets ?? 0;
    return sum + w * r * s;
  }, 0);
}

/**
 * 自然文をAIでパースして Exercise[] を返す（保存はしない）。
 * 聞き返しフローのため、パースと保存を分離している。
 * パース失敗・種目ゼロのときは空配列を返す（呼び出し側で案内に分岐）。
 *
 * 各種目は必ず1つ以上の setGroup を持つ形に正規化する
 * （「スクワットやった」のような値なし入力も、全 null の1グループとして
 * 欠損検出・聞き返しの対象にできるようにするため）。
 */
export async function parseWorkoutText(text: string): Promise<Exercise[]> {
  const jsonStr = await getAIJsonResponse(WORKOUT_PARSE_PROMPT, text, "parse");

  let parsed: { exercises: LegacyExercise[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  if (!parsed.exercises || parsed.exercises.length === 0) return [];

  return parsed.exercises.map((e) => {
    const ex = normalizeExercise(e);
    return ex.setGroups.length > 0
      ? ex
      : { ...ex, setGroups: [{ weight: null, reps: null, sets: null }] };
  });
}

// 自重種目の判定。これらは weight が null でも欠損として扱わない（聞き返さない）。
const BODYWEIGHT_EXERCISE_PATTERN =
  /プッシュアップ|腕立て|チンニング|懸垂|プルアップ|ディップス|クランチ|プランク|レッグレイズ|シットアップ|腹筋|アブローラー|ロシアンツイスト|バーピー|バックエクステンション/;

export function isBodyweightExercise(name: string): boolean {
  return BODYWEIGHT_EXERCISE_PATTERN.test(name);
}

/** パース結果の欠損1箇所（聞き返しの最小単位） */
export interface MissingField {
  exerciseIndex: number;
  groupIndex: number;
  exerciseName: string;
  field: "weight" | "reps" | "sets";
}

/**
 * パース結果から欠損フィールドを列挙する。
 * 順序は「種目の登場順 × weight → reps → sets」で固定（聞き返しの再現性のため）。
 * 自重種目の weight は欠損に数えない。
 */
export function detectMissingFields(exercises: Exercise[]): MissingField[] {
  const missing: MissingField[] = [];
  exercises.forEach((ex, exerciseIndex) => {
    const bodyweight = isBodyweightExercise(ex.name);
    (ex.setGroups ?? []).forEach((g, groupIndex) => {
      if (!bodyweight && g.weight == null) {
        missing.push({ exerciseIndex, groupIndex, exerciseName: ex.name, field: "weight" });
      }
      if (g.reps == null) {
        missing.push({ exerciseIndex, groupIndex, exerciseName: ex.name, field: "reps" });
      }
      if (g.sets == null) {
        missing.push({ exerciseIndex, groupIndex, exerciseName: ex.name, field: "sets" });
      }
    });
  });
  return missing;
}

/**
 * Exercise[] を保存し、ユーザー向けサマリーメッセージを返す。
 * 自然文パース経路（即保存・聞き返し完了の両方）が使う。
 */
export async function saveWorkout(
  userId: string,
  exercises: Exercise[],
  notes: string
): Promise<{ message: string }> {
  const workout: WorkoutRecord = {
    date: admin.firestore.Timestamp.now(),
    exercises,
    notes,
  };

  await db()
    .collection("users")
    .doc(userId)
    .collection("workouts")
    .add(workout);

  const summary = exercises
    .map((e) => {
      const lines = [e.name];
      e.setGroups.forEach((g) => {
        const parts: string[] = [];
        if (g.weight) parts.push(`${g.weight}kg`);
        if (g.reps) parts.push(`${g.reps}回`);
        if (g.sets) parts.push(`${g.sets}セット`);
        if (parts.length) lines.push(`  ${parts.join(" ")}`);
      });
      return lines.join("\n");
    })
    .join("\n");

  return { message: `記録しました！\n\n${summary}\n\nお疲れ様でした！` };
}

// プロンプトインジェクション/データ汚染対策: 種目名のサニタイズ
function sanitizeExerciseName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // 改行・タブ・# を除去し、最大30文字に制限
  return raw
    .replace(/[\r\n\t]/g, " ")
    .replace(/#/g, "")
    .trim()
    .slice(0, 30);
}

function sanitizeNumber(raw: unknown, max: number): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

function sanitizeSetGroup(raw: unknown): ExerciseSetGroup {
  const g = (raw ?? {}) as Partial<ExerciseSetGroup>;
  return {
    weight: sanitizeNumber(g.weight, 1000),
    reps: sanitizeNumber(g.reps, 1000),
    sets: sanitizeNumber(g.sets, 100),
  };
}

// 入力 Exercise（新形式 setGroups 配列 / 旧形式 weight/reps/sets フラット）両方を受け入れる
type IncomingExercise =
  | { name: unknown; setGroups: unknown[] }
  | { name: unknown; weight?: unknown; reps?: unknown; sets?: unknown };

export async function saveWorkoutDirectly(
  userId: string,
  exercises: IncomingExercise[],
  dateStr?: string // "YYYY-MM-DD" 形式、省略時は今日
): Promise<void> {
  // 入力バリデーション: 1リクエストあたりの種目数を制限
  if (!Array.isArray(exercises) || exercises.length === 0 || exercises.length > 50) {
    throw new Error("Invalid exercises payload");
  }

  const sanitized: Exercise[] = exercises
    .map((ex) => {
      const name = sanitizeExerciseName((ex as { name?: unknown })?.name);
      // 新形式
      if (Array.isArray((ex as { setGroups?: unknown[] }).setGroups)) {
        const groups = (ex as { setGroups: unknown[] }).setGroups
          .slice(0, 30) // 1種目あたり最大30グループまで
          .map(sanitizeSetGroup)
          .filter((g) => g.weight !== null || g.reps !== null || g.sets !== null);
        return { name, setGroups: groups };
      }
      // 旧形式 → 1グループに変換
      const legacy = ex as { weight?: unknown; reps?: unknown; sets?: unknown };
      const group = sanitizeSetGroup(legacy);
      const hasValue = group.weight !== null || group.reps !== null || group.sets !== null;
      return { name, setGroups: hasValue ? [group] : [] };
    })
    .filter((ex) => ex.name.length > 0);

  if (sanitized.length === 0) {
    throw new Error("No valid exercises after sanitization");
  }

  const date = dateStr
    ? admin.firestore.Timestamp.fromDate(new Date(dateStr + "T00:00:00+09:00"))
    : admin.firestore.Timestamp.now();

  await db()
    .collection("users")
    .doc(userId)
    .collection("workouts")
    .add({ date, exercises: sanitized, notes: "" });
}

export async function getWorkoutsByMonth(
  userId: string,
  month: string // "YYYY-MM"
): Promise<WorkoutRecord[]> {
  const [year, monthNum] = month.split("-").map(Number);
  if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return getRecentWorkouts(userId, 30);
  }

  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 1);

  const snapshot = await db()
    .collection("users")
    .doc(userId)
    .collection("workouts")
    .where("date", ">=", admin.firestore.Timestamp.fromDate(startDate))
    .where("date", "<", admin.firestore.Timestamp.fromDate(endDate))
    .orderBy("date", "desc")
    .get();

  return snapshot.docs.map((doc) => normalizeWorkoutRecord(doc.data() as WorkoutRecord));
}

/**
 * 指定日数以内（過去 days 日）のワークアウト記録を新しい順で返す。
 * 分析の「週区切り」集計（直近7日のスナップショット）が使う。
 */
export async function getWorkoutsSince(
  userId: string,
  days: number
): Promise<WorkoutRecord[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const snapshot = await db()
    .collection("users")
    .doc(userId)
    .collection("workouts")
    .where("date", ">=", admin.firestore.Timestamp.fromDate(since))
    .orderBy("date", "desc")
    .get();
  return snapshot.docs.map((doc) => normalizeWorkoutRecord(doc.data() as WorkoutRecord));
}

/**
 * 指定日数以内（過去 days 日）に記録されたワークアウト件数を返す。
 * 週次レポートが「今週分の記録があるか」を判定するために使う。
 */
export async function countWorkoutsSince(userId: string, days: number): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const snapshot = await db()
    .collection("users")
    .doc(userId)
    .collection("workouts")
    .where("date", ">=", admin.firestore.Timestamp.fromDate(since))
    .count()
    .get();
  return snapshot.data().count;
}

export async function getTotalWorkoutCount(userId: string): Promise<number> {
  const snapshot = await db()
    .collection("users")
    .doc(userId)
    .collection("workouts")
    .count()
    .get();
  return snapshot.data().count;
}

export async function getRecentWorkouts(
  userId: string,
  limit = 5
): Promise<WorkoutRecord[]> {
  const snapshot = await db()
    .collection("users")
    .doc(userId)
    .collection("workouts")
    .orderBy("date", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => normalizeWorkoutRecord(doc.data() as WorkoutRecord));
}

export function formatWorkoutHistory(workouts: WorkoutRecord[]): string {
  if (workouts.length === 0) {
    return "まだトレーニング記録がありません。\n「記録 ベンチプレス 60kg 10回 3セット」のように入力してみましょう！";
  }

  return workouts
    .map((w) => {
      const date = w.date.toDate();
      const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
      const dateStr = `${jst.getMonth() + 1}/${jst.getDate()}`;
      const exercises = w.exercises
        .map((e) => {
          const lines = [`  ${e.name}`];
          (e.setGroups ?? []).forEach((g) => {
            const parts: string[] = [];
            if (g.weight) parts.push(`${g.weight}kg`);
            if (g.reps) parts.push(`${g.reps}回`);
            if (g.sets) parts.push(`${g.sets}セット`);
            if (parts.length) lines.push(`    ${parts.join(" ")}`);
          });
          return lines.join("\n");
        })
        .join("\n");
      return `[${dateStr}]\n${exercises}`;
    })
    .join("\n\n");
}

// 直近のワークアウトから、ユーザー独自に手入力した種目名（重複排除）を取得
export async function getRecentCustomExerciseNames(
  userId: string,
  limit = 6,
  excludeSet: Set<string> = new Set()
): Promise<string[]> {
  const workouts = await getRecentWorkouts(userId, 50);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const name = ex.name?.trim();
      if (!name) continue;
      if (seen.has(name)) continue;
      if (excludeSet.has(name)) continue;
      seen.add(name);
      result.push(name);
      if (result.length >= limit) return result;
    }
  }
  return result;
}
