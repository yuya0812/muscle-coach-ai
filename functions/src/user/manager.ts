import * as admin from "firebase-admin";

const db = admin.firestore;

const FREE_DAILY_LIMIT = 3;
const PREMIUM_DAILY_LIMIT = 100;
const COOLDOWN_MS = 3000;

export type UsageDeniedReason = "limit" | "cooldown";

export interface UserProfile {
  name: string;
  goal: string;
  level: string;
  equipment: string;
  frequency: number;
  createdAt: FirebaseFirestore.Timestamp;
  trainerType?: string;
  trainerName?: string;
  heightRange?: string;
  weightRange?: string;
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
    dailyCount: number;
    lastResetDate: string;
    lastCallAt?: FirebaseFirestore.Timestamp;
  };
  settings: {
    notificationEnabled: boolean;
    notificationTime: string;
  };
}

export async function getOrCreateUser(lineUserId: string, displayName?: string): Promise<UserData> {
  const userRef = db().collection("users").doc(lineUserId);
  const doc = await userRef.get();

  if (doc.exists) {
    const data = doc.data() as UserData;
    return resetDailyUsageIfNeeded(lineUserId, data);
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

export async function incrementUsage(
  lineUserId: string
): Promise<{ allowed: boolean; reason?: UsageDeniedReason }> {
  const userRef = db().collection("users").doc(lineUserId);
  const doc = await userRef.get();
  if (!doc.exists) return { allowed: false, reason: "limit" };

  const data = doc.data() as UserData;
  const userData = await resetDailyUsageIfNeeded(lineUserId, data);

  // クールダウン: 連投でClaude APIコストが膨らむのを防ぐ
  const lastCallAt = userData.usage.lastCallAt;
  if (lastCallAt) {
    const elapsed = Date.now() - lastCallAt.toMillis();
    if (elapsed < COOLDOWN_MS) {
      return { allowed: false, reason: "cooldown" };
    }
  }

  const isPremium =
    userData.subscription.status === "active" || userData.subscription.status === "canceling";
  const dailyLimit = isPremium ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;

  if (userData.usage.dailyCount >= dailyLimit) {
    return { allowed: false, reason: "limit" };
  }

  await userRef.update({
    "usage.dailyCount": admin.firestore.FieldValue.increment(1),
    "usage.lastCallAt": admin.firestore.Timestamp.now(),
  });
  return { allowed: true };
}

export async function getRemainingUsage(lineUserId: string): Promise<number | null> {
  const userRef = db().collection("users").doc(lineUserId);
  const doc = await userRef.get();
  if (!doc.exists) return 0;

  const data = doc.data() as UserData;
  if (data.subscription.status === "active" || data.subscription.status === "canceling") return null; // unlimited

  return Math.max(0, FREE_DAILY_LIMIT - data.usage.dailyCount);
}

async function resetDailyUsageIfNeeded(
  lineUserId: string,
  data: UserData
): Promise<UserData> {
  const today = getTodayString();
  if (data.usage.lastResetDate !== today) {
    data.usage.dailyCount = 0;
    data.usage.lastResetDate = today;
    await db().collection("users").doc(lineUserId).update({
      "usage.dailyCount": 0,
      "usage.lastResetDate": today,
    });
  }
  return data;
}

function getTodayString(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}
