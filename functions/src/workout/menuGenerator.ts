import * as admin from "firebase-admin";
import { getAIJsonResponse } from "../ai/trainer";
import { MENU_GENERATION_PROMPT } from "../ai/prompts";
import { getOrCreateUser } from "../user/manager";
import { buildUserContextBlock } from "../user/metrics";
import { formatMenuForLineSplit, type SplitMenuMessages } from "../ai/formatter";
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

export class MenuGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MenuGenerationError";
  }
}

// 週次メニューの有効期間（日数）。これを過ぎた active メニューは「古い」とみなし、
// 既定経路（forceRegenerate なし）でも作り直す。「週次」プログラムなので 7 日。
const MENU_FRESH_DAYS = 7;

/**
 * 現在 active な週次メニューを取得する。なければ null。
 * 「メニュー作成」を押すたびに作り直すのではなく、既存メニューを返すための土台。
 */
async function getActiveMenu(userId: string): Promise<MenuData | null> {
  const snapshot = await db()
    .collection("users")
    .doc(userId)
    .collection("menus")
    .where("status", "==", "active")
    .orderBy("generatedAt", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as MenuData;
}

/**
 * active メニューが「まだ今週分として有効か」を判定する。
 * 週次メニューは生成から MENU_FRESH_DAYS を過ぎたら古いとみなし、再生成に回す。
 * これにより「翌週も先週のメニューが出続ける」ことを防ぎつつ、
 * 同じ週の中では同じメニューを返して一貫性を保つ。
 */
function isMenuFresh(menu: MenuData): boolean {
  const generatedMs = menu.generatedAt?.toMillis?.();
  if (!generatedMs) return false; // 生成日時が壊れている場合は安全側（作り直す）に倒す
  const ageMs = Date.now() - generatedMs;
  return ageMs >= 0 && ageMs < MENU_FRESH_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * 週次メニューを取得して LINE 送信用の 2 通分メッセージ（今日詳細 + 全体見取り図）を返す。
 *
 * 既定では「今週分としてまだ有効な active メニューがあればそれを返す」。これにより
 * 「メニュー作成」を短時間に複数回押しても、専属トレーナーが毎回違うことを言う
 * 不自然さ（再現性のなさ）を避ける。
 *
 * ただし生成から MENU_FRESH_DAYS（7日）を過ぎた古いメニューは、既定経路でも
 * 作り直す。週次プログラムなので「翌週も先週のメニューが出続ける」のを防ぐため。
 *
 * 新しいメニューを今すぐ作り直したいときは forceRegenerate=true を渡す。
 * 「メニュー作り直し」のような明示的な再作成キーワードのときだけ true にする想定。
 *
 * 失敗時は MenuGenerationError を投げる。呼び出し側 (webhook など) は
 * catch して「メニュー生成に失敗しました」とユーザーに返す責務を持つ。
 */
export async function generateWeeklyMenu(
  userId: string,
  options: { forceRegenerate?: boolean } = {},
): Promise<SplitMenuMessages> {
  // 作り直し指定がなく、今週分としてまだ有効な active メニューがあればそれを再整形して返す。
  // 古い（7日超）メニューや active なしの場合は新規生成に回す。
  if (!options.forceRegenerate) {
    const active = await getActiveMenu(userId);
    if (active && isMenuFresh(active)) {
      return formatMenuForLineSplit(
        { weeklyPlan: active.weeklyPlan, advice: active.advice },
        getTodayDayOfWeek(),
      );
    }
  }

  return regenerateWeeklyMenu(userId);
}

/**
 * Claude でメニューを新規生成し、既存 active を archived に切り替えた上で
 * 新しいメニューを保存し、2 通分割で返す。
 * 再現性ガード（既存があれば返す）を通さずに必ず作り直す内部関数。
 */
async function regenerateWeeklyMenu(userId: string): Promise<SplitMenuMessages> {
  const user = await getOrCreateUser(userId);

  // 身体情報・目標・派生メトリクス（BMR/TDEE/タンパク質目標等）込みのコンテキスト
  const profileContext = buildUserContextBlock(user.profile);

  // 直近30セッションの履歴サマリー（種目別の最大重量・典型回数・触れていない部位など）
  const historySummary = await buildWorkoutHistorySummary(userId, 30);
  const historyContext = formatWorkoutHistoryForPrompt(historySummary);

  const userContent =
    `以下のユーザー情報と履歴を踏まえて、1週間のトレーニングメニューをJSON形式で作成してください。\n\n` +
    `${profileContext}\n${historyContext}`;

  const jsonStr = await getAIJsonResponse(MENU_GENERATION_PROMPT, userContent, "menu");

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
    throw new MenuGenerationError("Failed to parse menu JSON");
  }

  if (!parsed.weeklyPlan?.days || parsed.weeklyPlan.days.length === 0) {
    console.error("[generateWeeklyMenu] empty plan", {
      hasWeeklyPlan: !!parsed.weeklyPlan,
      daysLength: parsed.weeklyPlan?.days?.length ?? null,
      head: jsonStr.slice(0, 300),
    });
    throw new MenuGenerationError("Empty weeklyPlan from model");
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

  return formatMenuForLineSplit(
    { weeklyPlan: parsed.weeklyPlan, advice: parsed.advice },
    getTodayDayOfWeek(),
  );
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
