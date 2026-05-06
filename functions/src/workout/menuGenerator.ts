import * as admin from "firebase-admin";
import { getAIJsonResponse } from "../ai/trainer";
import { MENU_GENERATION_PROMPT } from "../ai/prompts";
import { buildUserProfileContext } from "../ai/prompts";
import { getOrCreateUser } from "../user/manager";

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
  const profileContext = buildUserProfileContext(user.profile);

  const prompt = `以下のユーザー情報に基づいてメニューを作成してください:\n${profileContext}`;

  const jsonStr = await getAIJsonResponse(MENU_GENERATION_PROMPT, prompt);

  let parsed: { weeklyPlan: WeeklyPlan; advice: string };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return "メニューの生成に失敗しました。もう一度お試しください。";
  }

  if (!parsed.weeklyPlan?.days || parsed.weeklyPlan.days.length === 0) {
    return "メニューの生成に失敗しました。もう一度お試しください。";
  }

  // Archive existing menus
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

  return formatWeeklyMenu(parsed.weeklyPlan, parsed.advice);
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
    return "今日は休息日です！\nしっかり体を休めましょう💪";
  }

  const exercises = todayDay.exercises
    .map((e, i) => {
      const weight = e.weight !== "自重" ? ` (${e.weight})` : "";
      return `${i + 1}. ${e.name}\n   ${e.sets}×${e.reps}${weight} (休憩${e.restSeconds}秒)\n   💡 ${e.notes}`;
    })
    .join("\n\n");

  return `📅 今日のメニュー: ${todayDay.theme}\n\n${exercises}`;
}

function formatWeeklyMenu(plan: WeeklyPlan, advice: string): string {
  const lines: string[] = [];
  lines.push(`🏋️‍♂️ トレーニングメニュー`);
  lines.push(`（${plan.splitMethod}・週${plan.daysPerWeek}回）`);
  lines.push("");

  for (const day of plan.days) {
    lines.push(`📅 Day ${day.dayNumber}: ${day.theme}`);
    const mainExercises = day.exercises.filter(
      (e) => e.category === "main" || e.category === "accessory"
    );
    for (const ex of mainExercises) {
      lines.push(`  ・${ex.name} ${ex.sets}×${ex.reps}`);
    }
    lines.push("");
  }

  if (advice) {
    lines.push(`💡 ${advice}`);
  }

  return lines.join("\n");
}

function getTodayDayOfWeek(): number {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // Return 1-7 for Mon-Sun
  const day = jst.getDay();
  return day === 0 ? 7 : day;
}
