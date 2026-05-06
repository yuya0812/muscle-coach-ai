import * as admin from "firebase-admin";
import { getAIJsonResponse } from "../ai/trainer";
import { WORKOUT_PARSE_PROMPT } from "../ai/prompts";

const db = admin.firestore;

export interface Exercise {
  name: string;
  weight: number | null;
  reps: number | null;
  sets: number | null;
}

export interface WorkoutRecord {
  date: FirebaseFirestore.Timestamp;
  exercises: Exercise[];
  notes: string;
}

export async function parseAndSaveWorkout(
  userId: string,
  text: string
): Promise<{ exercises: Exercise[]; message: string }> {
  const jsonStr = await getAIJsonResponse(WORKOUT_PARSE_PROMPT, text);

  let parsed: { exercises: Exercise[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      exercises: [],
      message: "記録の解析に失敗しました。もう一度入力してみてください。",
    };
  }

  if (!parsed.exercises || parsed.exercises.length === 0) {
    return {
      exercises: [],
      message: "トレーニング内容を読み取れませんでした。例: 「ベンチプレス 60kg 10回 3セット」",
    };
  }

  const workout: WorkoutRecord = {
    date: admin.firestore.Timestamp.now(),
    exercises: parsed.exercises,
    notes: text,
  };

  await db()
    .collection("users")
    .doc(userId)
    .collection("workouts")
    .add(workout);

  const summary = parsed.exercises
    .map((e) => {
      const parts = [e.name];
      if (e.weight) parts.push(`${e.weight}kg`);
      if (e.reps) parts.push(`${e.reps}回`);
      if (e.sets) parts.push(`${e.sets}セット`);
      return parts.join(" ");
    })
    .join("\n");

  return {
    exercises: parsed.exercises,
    message: `記録しました！\n\n${summary}\n\nお疲れ様でした！`,
  };
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

export async function saveWorkoutDirectly(
  userId: string,
  exercises: Exercise[],
  dateStr?: string // "YYYY-MM-DD" 形式、省略時は今日
): Promise<void> {
  // 入力バリデーション: 1リクエストあたりの種目数を制限
  if (!Array.isArray(exercises) || exercises.length === 0 || exercises.length > 50) {
    throw new Error("Invalid exercises payload");
  }

  const sanitized: Exercise[] = exercises
    .map((ex) => ({
      name: sanitizeExerciseName(ex?.name),
      weight: sanitizeNumber(ex?.weight, 1000),
      reps: sanitizeNumber(ex?.reps, 1000),
      sets: sanitizeNumber(ex?.sets, 100),
    }))
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

  return snapshot.docs.map((doc) => doc.data() as WorkoutRecord);
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

  return snapshot.docs.map((doc) => doc.data() as WorkoutRecord);
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
          const parts = [e.name];
          if (e.weight) parts.push(`${e.weight}kg`);
          if (e.reps) parts.push(`${e.reps}回`);
          if (e.sets) parts.push(`${e.sets}セット`);
          return `  ${parts.join(" ")}`;
        })
        .join("\n");
      return `[${dateStr}]\n${exercises}`;
    })
    .join("\n\n");
}
