import * as admin from "firebase-admin";

const db = admin.firestore;

// 課金軸（2026-07 再設計）。フリーは記録1日3回・分析週1回。プレミアムは無制限。
// 詳細は CLAUDE.md「プレミアムプラン仕様」を参照。
const FREE_RECORD_DAILY_LIMIT = 3; // フリー: 記録（自然文パース）1日3回
const FREE_ANALYZE_WEEKLY_LIMIT = 1; // フリー: 分析 週1回
const COOLDOWN_MS = 3000;

// 🔴 ベータフラグ: true の間はフリーユーザーも全員プレミアム扱い（記録・分析無制限、特典あり）。
// まずユーザーを集めることを優先する。集客が乗ったら false にして課金導線を有効化する。
// 詳細は CLAUDE.md「ロールアウト戦略: ベータ期間は全員プレミアム扱い」を参照。
const BETA_ALL_PREMIUM = true;

// 課金済み（または解約予約中で期間内）かどうか。ベータ中は全員 true。
// プレミアム判定はこの関数に一元化する（散在させると BETA フラグの切り替え漏れが起きる）。
export function isPremiumUser(data: UserData): boolean {
  if (BETA_ALL_PREMIUM) return true;
  const status = data.subscription?.status;
  return status === "active" || status === "canceling";
}

export type UsageKind = "record" | "analyze";

// 利用規約・プライバシーポリシーの現行バージョン。
// 規約を改訂するたびに日付を更新すると、全ユーザーが起動時に再同意モーダルを見ることになる。
export const TERMS_CURRENT_VERSION = "2026-05-12";

export type UsageDeniedReason = "limit" | "cooldown";

export interface UserProfile {
  name: string;
  goal: string;
  level: string;
  equipment: string;
  frequency: number;
  createdAt: FirebaseFirestore.Timestamp;
  // 廃止: トレーナーキャラ（2026-06 方針転換）。既存ユーザーの doc 保護のため型は残すが、
  // 新規の読み書き・AIプロンプトへの注入はしない。完全削除は将来マイグレーションで。
  trainerType?: string;
  trainerName?: string;
  // 旧オンボーディングの遺物（読み込み互換のため残す。新ヒアリングでは使わない）
  heightRange?: string;
  weightRange?: string;
  // セットアップヒアリング項目
  birthYearRange?: string; // "20s" | "30s" | "40s" | "50s" | "60plus"
  sex?: string; // "male" | "female" | "other"
  heightCm?: number;
  weightKg?: number;
  targetMuscleGroups?: string[]; // ["chest", "back", ...] or ["all"]
  activityLevel?: string; // "sedentary" | "light" | "moderate" | "active"
  bodyFatPercent?: number; // null/未設定なら不明
  targetWeightKg?: number;
  targetBodyFatPercent?: number;
  setupCompleted?: boolean;
  // 利用規約への同意バージョン。null/undefined または現行版と一致しない場合は再同意が必要
  termsAcceptedVersion?: string | null;
  termsAcceptedAt?: FirebaseFirestore.Timestamp;
}

export interface UserData {
  profile: UserProfile;
  subscription: {
    status: "free" | "active" | "canceling" | "canceled" | "past_due";
    stripeCustomerId: string | null;
    stripePriceId: string | null;
    currentPeriodEnd: FirebaseFirestore.Timestamp | null;
    cancelAt: FirebaseFirestore.Timestamp | null;
  };
  usage: {
    // 旧: 分析の日次カウンタ。2026-07 課金軸再設計で記録=日次/分析=週次に分離したため、
    // 新ロジックでは未使用。既存 doc 互換のため型は残す。
    dailyCount: number;
    lastResetDate: string;
    lastCallAt?: FirebaseFirestore.Timestamp;
    // 記録（自然文パース）の日次カウンタ。recordResetDate が当日でなければリセット。
    recordDailyCount?: number;
    recordResetDate?: string; // JST の YYYY-MM-DD
    // 分析の週次カウンタ。analyzeWeekStart がその週の月曜（JST）でなければリセット。
    analyzeWeekCount?: number;
    analyzeWeekStart?: string; // その週の月曜 JST の YYYY-MM-DD
  };
  settings: {
    notificationEnabled: boolean;
    notificationTime: string;
    notificationDays?: number[]; // 0=日, 1=月, ..., 6=土。空配列=曜日指定なし
    autoSendAnalysisEnabled?: boolean;
    autoSendAnalysisMessage?: string;
  };
}

export interface UserSettingsUpdate {
  notificationEnabled?: boolean;
  notificationTime?: string;
  notificationDays?: number[];
  autoSendAnalysisEnabled?: boolean;
  autoSendAnalysisMessage?: string;
}

export async function getOrCreateUser(lineUserId: string, displayName?: string): Promise<UserData> {
  const userRef = db().collection("users").doc(lineUserId);
  const doc = await userRef.get();

  if (doc.exists) {
    // 利用カウンタのリセットは incrementUsage / getRemainingUsage 内で
    // 日付・週起点を見て都度判定するため、ここでの事前リセットは不要。
    return doc.data() as UserData;
  }

  const newUser: UserData = {
    profile: {
      name: displayName || "ユーザー",
      goal: "",
      level: "beginner",
      equipment: "",
      frequency: 3,
      createdAt: admin.firestore.Timestamp.now(),
    },
    subscription: {
      status: "free",
      stripeCustomerId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
      cancelAt: null,
    },
    usage: {
      dailyCount: 0,
      lastResetDate: getTodayString(),
    },
    settings: {
      notificationEnabled: false,
      notificationTime: "09:00",
      notificationDays: [],
      autoSendAnalysisEnabled: false,
      autoSendAnalysisMessage: "今日の記録を分析して",
    },
  };

  await userRef.set(newUser);
  return newUser;
}

export async function updateUserProfile(
  lineUserId: string,
  profile: Partial<UserProfile>
): Promise<void> {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profile)) {
    updates[`profile.${key}`] = value;
  }
  await db().collection("users").doc(lineUserId).update(updates);
}

export async function updateUserSettings(
  lineUserId: string,
  settings: UserSettingsUpdate
): Promise<void> {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) continue;
    updates[`settings.${key}`] = value;
  }
  if (Object.keys(updates).length === 0) return;
  await db().collection("users").doc(lineUserId).update(updates);
}

/**
 * 利用回数を消費する（記録 or 分析）。フリーユーザーのみ上限がある。
 * - record: 日次3回（recordResetDate が当日でなければリセット）
 * - analyze: 週次1回（analyzeWeekStart がその週の月曜でなければリセット）
 * プレミアム（ベータ中は全員）は上限なし。連投クールダウンは両方に効かせる。
 */
export async function incrementUsage(
  lineUserId: string,
  kind: UsageKind
): Promise<{ allowed: boolean; reason?: UsageDeniedReason }> {
  const userRef = db().collection("users").doc(lineUserId);
  const doc = await userRef.get();
  if (!doc.exists) return { allowed: false, reason: "limit" };

  const data = doc.data() as UserData;

  // クールダウン: 連投でClaude APIコストが膨らむのを防ぐ（記録・分析共通）
  const lastCallAt = data.usage.lastCallAt;
  if (lastCallAt) {
    const elapsed = Date.now() - lastCallAt.toMillis();
    if (elapsed < COOLDOWN_MS) {
      return { allowed: false, reason: "cooldown" };
    }
  }

  const updates: Record<string, unknown> = {
    "usage.lastCallAt": admin.firestore.Timestamp.now(),
  };

  // プレミアム（ベータ中は全員）は上限チェックをスキップし、カウントだけ進める
  const premium = isPremiumUser(data);

  if (kind === "record") {
    const today = getTodayString();
    const count = data.usage.recordResetDate === today ? data.usage.recordDailyCount ?? 0 : 0;
    if (!premium && count >= FREE_RECORD_DAILY_LIMIT) {
      return { allowed: false, reason: "limit" };
    }
    updates["usage.recordDailyCount"] = count + 1;
    updates["usage.recordResetDate"] = today;
  } else {
    const weekStart = getWeekStartString();
    const count = data.usage.analyzeWeekStart === weekStart ? data.usage.analyzeWeekCount ?? 0 : 0;
    if (!premium && count >= FREE_ANALYZE_WEEKLY_LIMIT) {
      return { allowed: false, reason: "limit" };
    }
    updates["usage.analyzeWeekCount"] = count + 1;
    updates["usage.analyzeWeekStart"] = weekStart;
  }

  await userRef.update(updates);
  return { allowed: true };
}

/**
 * フリーユーザーの残り利用可能回数を返す（LIFF 表示用）。プレミアムは null（無制限）。
 * record=その日の残り、analyze=その週の残り。
 */
export async function getRemainingUsage(
  lineUserId: string,
  kind: UsageKind
): Promise<number | null> {
  const userRef = db().collection("users").doc(lineUserId);
  const doc = await userRef.get();
  if (!doc.exists) return 0;

  const data = doc.data() as UserData;
  if (isPremiumUser(data)) return null; // unlimited

  if (kind === "record") {
    const today = getTodayString();
    const count = data.usage.recordResetDate === today ? data.usage.recordDailyCount ?? 0 : 0;
    return Math.max(0, FREE_RECORD_DAILY_LIMIT - count);
  }
  const weekStart = getWeekStartString();
  const count = data.usage.analyzeWeekStart === weekStart ? data.usage.analyzeWeekCount ?? 0 : 0;
  return Math.max(0, FREE_ANALYZE_WEEKLY_LIMIT - count);
}

function getTodayString(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}

// その週の月曜（JST）の YYYY-MM-DD を返す。分析の週次カウンタの起点に使う。
// 分析は「週区切り（直近7日が軸）」だが、カウンタは暦週（月曜起点）で揃える。
function getWeekStartString(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = jst.getUTCDay(); // 0=日,1=月,... (jst は +9h した値を UTC として読む)
  const diffToMonday = (day + 6) % 7; // 月曜からの経過日数
  jst.setUTCDate(jst.getUTCDate() - diffToMonday);
  return jst.toISOString().split("T")[0];
}
