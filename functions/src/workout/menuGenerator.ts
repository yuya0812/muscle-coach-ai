import * as admin from "firebase-admin";
import { getAIJsonResponse } from "../ai/trainer";
import { MENU_GENERATION_PROMPT } from "../ai/prompts";
import { getOrCreateUser } from "../user/manager";
import { buildUserContextBlock } from "../user/metrics";
import { formatMenuForLine } from "../ai/formatter";
import { buildWorkoutHistorySummary, formatWorkoutHistoryForPrompt } from "./history";

const db = admin.firestore;

interface MenuExercise {
  category: string;
  name: string;
  sets: number;
  reps: string;
  weight: string;
  restSeconds: number;
  notes: string;
}

interface MenuDay {
  dayNumber: number;
  theme: string;
  exercises: MenuExercise[];
}

interface WeeklyPlan {
  splitMethod: string;
  daysPerWeek: number;
  sessionDurationMin?: number;
  rationale?: string;
  days: MenuDay[];
}

interface MenuData {
  weeklyPlan: WeeklyPlan;
  advice: string;
  generatedAt: FirebaseFirestore.Timestamp;
  status: "active" | "archived";
}

export async function generateWeeklyMenu(userId: string): Promise<string> {
  const user = await getOrCreateUser(userId);

  // 身体情報・目標・派生メトリクス（BMR/TDEE/タンパク質目標等）込みのコンテキスト
  const profileContext = buildUserContextBlock(user.profile);

  // 直近30セッションの履歴サマリー（種目別の最大重量・典型回数・触れていない部位など）
  const historySummary = await buildWorkoutHistorySummary(userId, 30);
  const historyContext = formatWorkoutHistoryForPrompt(historySummary);

  const userContent =
    `以下のユーザー情報と履歴を踏まえて、1週間のトレーニングメニューをJSON形式で作成してください。\n\n` +
    `${profileContext}\n${historyContext}`;

  const jsonStr = await getAIJsonResponse(MENU_GENERATION_PROMPT, userContent);

  let parsed: { weeklyPlan: WeeklyPlan; advice: string };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[generateWeeklyMenu] JSON parse failed", {
      error: e instanceof Error ? e.message : String(e),
      head: jsonStr.slice(0, 200),
      tail: jsonStr.slice(-200),
      length: jsonStr.length,
    });
    return "メニューの生成に失敗しました。もう一度お試しください。";
  }

  if (!parsed.weeklyPlan?.days || parsed.weeklyPlan.days.length === 0) {
    console.error("[generateWeeklyMenu] empty plan", {
      hasWeeklyPlan: !!parsed.weeklyPlan,
      daysLength: parsed.weeklyPlan?.days?.length ?? null,
      head: jsonStr.slice(0, 300),
    });
    return "メニューの生成に失敗しました。もう一度お試しください。";
  }

  // 既存のアクティブメニューを archived に切り替え
  const existingMenus = await db()
    .collection("users")
    .doc(userId)
    .collection("menus")
    .where("status", "==", "active")
    .get();

  const batch = db().batch();
  existingMenus.docs.forEach((doc) => {
    batch.update(doc.ref, { status: "archived" });
  });

  const menuData: MenuData = {
    weeklyPlan: parsed.weeklyPlan,
    advice: parsed.advice,
    generatedAt: admin.firestore.Timestamp.now(),
    status: "active",
  };

  const newMenuRef = db()
    .collection("users")
    .doc(userId)
    .collection("menus")
    .doc();
  batch.set(newMenuRef, menuData);
  await batch.commit();

  return formatMenuForLine({ weeklyPlan: parsed.weeklyPlan, advice: parsed.advice });
}

export async function getTodayMenu(userId: string): Promise<string> {
  const snapshot = await db()
    .collection("users")
    .doc(userId)
    .collection("menus")
    .where("status", "==", "active")
    .orderBy("generatedAt", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    return "まだメニューが作成されていません。\n「メニュー作成」と送ってください！";
  }

  const menu = snapshot.docs[0].data() as MenuData;
  const todayDayOfWeek = getTodayDayOfWeek();

  // Find today's menu by matching dayNumber to current day of week
  const todayDay = menu.weeklyPlan.days.find(
    (d) => d.dayNumber === todayDayOfWeek
  );

  if (!todayDay) {
    return "今日は休息日です。\nしっかり体を休めて、次のセッションに備えましょう。";
  }

  const FULLWIDTH_NUMS = ["０","１","２","３","４","５","６","７","８","９"];
  const fw = (n: number) =>
    n < 0 || n > 30 ? String(n) : String(n).split("").map((c) => FULLWIDTH_NUMS[Number(c)]).join("");

  const exercises = todayDay.exercises
    .map((e, i) => {
      const weight = e.weight && e.weight.trim().length > 0 ? e.weight : "自重";
      const head = `［${fw(i + 1)}］${e.name}`;
      const detail = `   ${weight}  ${e.sets}セット × ${e.reps}回`;
      const rest = e.restSeconds ? `\n   休憩 ${e.restSeconds}秒` : "";
      const note = e.notes ? `\n   ▷ ${e.notes}` : "";
      return `${head}\n${detail}${rest}${note}`;
    })
    .join("\n\n");

  const header = [
    "━━━━━━━━━━━━━━",
    "今日のメニュー",
    `《 ${todayDay.theme} 》`,
    "━━━━━━━━━━━━━━",
  ].join("\n");

  return `${header}\n\n${exercises}`;
}

function getTodayDayOfWeek(): number {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // Return 1-7 for Mon-Sun
  const day = jst.getDay();
  return day === 0 ? 7 : day;
}
