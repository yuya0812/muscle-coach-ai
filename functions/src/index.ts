import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { lineWebhook } from "./line/webhook";
import { stripeWebhook, createCheckoutSession, createCustomerPortalSession } from "./subscription/stripe";
import { getOrCreateUser, updateUserProfile, getRemainingUsage } from "./user/manager";
import { getRecentWorkouts, getWorkoutsByMonth, saveWorkoutDirectly, getTotalWorkoutCount } from "./workout/recorder";
import { authenticateRequest } from "./auth/verifyLiffToken";
import { sendWeeklyReports } from "./reports/weeklyReport";
import { sendScheduledNotifications } from "./notifications/scheduledNotifications";
import { autoPostMorning, autoPostEvening } from "./x/autoPost";
import { createAndSetDefaultRichMenu } from "./line/richMenu";
import { checkAndPushMilestone } from "./line/recordingFlow";

admin.initializeApp();

const db = admin.firestore;

export { lineWebhook };
export { stripeWebhook };
export { sendWeeklyReports };
export { sendScheduledNotifications };
export { autoPostMorning, autoPostEvening };

// CORS設定: LIFFアプリのオリジンのみ許可
const ALLOWED_ORIGINS = [
  "https://muscle-coach-ai.web.app",
  "https://muscle-coach-ai.firebaseapp.com",
];

export const api = onRequest(
  { region: "asia-northeast1", cors: ALLOWED_ORIGINS, invoker: "public" },
  async (req, res) => {
    const path = req.path;

    // userId を取得（GET: query, POST/PUT: body）
    const requestedUserId =
      (req.query.userId as string) ||
      req.body?.userId ||
      (path.startsWith("/api/user/") ? path.split("/user/")[1] : null) ||
      (path.startsWith("/user/") ? path.split("/user/")[1] : null);

    try {
      // 認証が必要なエンドポイント（全LIFFリクエスト）
      if (requestedUserId) {
        const auth = await authenticateRequest(
          req.headers.authorization,
          requestedUserId
        );
        if (!auth.authenticated) {
          res.status(401).json({ error: auth.error || "Unauthorized" });
          return;
        }
      }

      // Dashboard
      if (req.method === "GET" && (path === "/api/dashboard" || path === "/dashboard")) {
        const userId = req.query.userId as string;
        const period = (req.query.period as string) || "1m";
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }

        const now = new Date();
        let daysBack = 30;
        if (period === "1w") daysBack = 7;
        if (period === "3m") daysBack = 90;

        const since = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
        const sinceTimestamp = admin.firestore.Timestamp.fromDate(since);

        const snapshot = await db()
          .collection("users").doc(userId).collection("workouts")
          .where("date", ">=", sinceTimestamp).orderBy("date", "desc").get();

        const workouts = snapshot.docs.map((doc) => {
          const data = doc.data();
          return { date: data.date?.toDate?.() ? data.date.toDate() : new Date(), exercises: data.exercises || [] };
        });

        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weeklyCount = workouts.filter((w) => w.date >= weekAgo).length;

        const bodyPartMap: Record<string, string> = {
          "ベンチプレス": "胸", "ダンベルフライ": "胸", "インクラインベンチ": "胸", "チェストプレス": "胸", "腕立て伏せ": "胸",
          "スクワット": "脚", "レッグプレス": "脚", "レッグカール": "脚", "レッグエクステンション": "脚", "ランジ": "脚", "カーフレイズ": "脚",
          "デッドリフト": "背中", "ラットプルダウン": "背中", "懸垂": "背中", "ベントオーバーロウ": "背中", "シーテッドロウ": "背中",
          "ショルダープレス": "肩", "サイドレイズ": "肩", "フロントレイズ": "肩", "リアレイズ": "肩",
          "アームカール": "腕", "バイセップスカール": "腕", "トライセップス": "腕", "ハンマーカール": "腕",
          "クランチ": "腹", "プランク": "腹", "レッグレイズ": "腹", "アブローラー": "腹", "腹筋": "腹",
        };
        const bodyPartFrequency: Record<string, number> = { "胸": 0, "背中": 0, "肩": 0, "腕": 0, "脚": 0, "腹": 0 };
        for (const w of workouts) {
          for (const ex of w.exercises) {
            const part = bodyPartMap[ex.name] || "その他";
            if (bodyPartFrequency[part] !== undefined) bodyPartFrequency[part]++;
          }
        }

        const exerciseWeights: Record<string, { date: string; weight: number }[]> = {};
        for (const w of workouts) {
          const jst = new Date(w.date.getTime() + 9 * 60 * 60 * 1000);
          const dateStr = `${jst.getMonth() + 1}/${jst.getDate()}`;
          for (const ex of w.exercises) {
            if (ex.weight) {
              if (!exerciseWeights[ex.name]) exerciseWeights[ex.name] = [];
              exerciseWeights[ex.name].push({ date: dateStr, weight: ex.weight });
            }
          }
        }
        const topExercises = Object.entries(exerciseWeights).sort((a, b) => b[1].length - a[1].length).slice(0, 4);
        const allDates = [...new Set(topExercises.flatMap(([, data]) => data.map((d) => d.date)))].reverse();
        const datasets = topExercises.map(([name, data]) => ({
          label: name,
          data: allDates.map((date) => { const e = data.find((d) => d.date === date); return e ? e.weight : 0; }),
        }));
        const recentWorkouts = workouts.slice(0, 10).map((w) => {
          const jst = new Date(w.date.getTime() + 9 * 60 * 60 * 1000);
          return {
            date: `${jst.getFullYear()}/${jst.getMonth() + 1}/${jst.getDate()}`,
            exercises: w.exercises.map((e: { name: string; weight?: number; reps?: number; sets?: number }) => ({
              name: e.name, weight: e.weight || 0, reps: e.reps || 0, sets: e.sets || 0,
            })),
          };
        });
        res.json({ weeklyCount, bodyPartFrequency, progressData: { labels: allDates, datasets }, recentWorkouts });
        return;
      }

      // Profile read (LIFF Profile画面で使用、最小限のフィールドのみ返す)
      if (req.method === "GET" && (path === "/api/profile" || path === "/profile")) {
        const userId = req.query.userId as string;
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        const user = await getOrCreateUser(userId);
        res.json({
          profile: {
            goal: user.profile.goal || "",
            level: user.profile.level || "beginner",
            equipment: user.profile.equipment || "",
            frequency: user.profile.frequency || 3,
            trainerName: user.profile.trainerName,
          },
          settings: {
            notificationEnabled: user.settings.notificationEnabled,
            notificationTime: user.settings.notificationTime,
          },
        });
        return;
      }

      // Profile update
      if (req.method === "PUT" && (path === "/api/profile" || path === "/profile")) {
        const { userId, goal, level, equipment, frequency } = req.body;
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        await updateUserProfile(userId, { goal, level, equipment, frequency });
        res.json({ success: true });
        return;
      }

      // Subscription status
      if (req.method === "GET" && (path === "/api/subscription" || path === "/subscription")) {
        const userId = req.query.userId as string;
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        const user = await getOrCreateUser(userId);
        const isPremium = user.subscription.status === "active" || user.subscription.status === "canceling";
        const plan = isPremium ? "premium" : "free";
        const expiresAt = user.subscription.currentPeriodEnd?.toDate?.()?.toISOString() || undefined;
        const cancelAt = user.subscription.cancelAt?.toDate?.()?.toISOString() || undefined;
        res.json({ plan, expiresAt, cancelAt });
        return;
      }

      // Notification settings
      if (req.method === "PUT" && (path === "/api/settings" || path === "/settings")) {
        const { userId, notificationEnabled, notificationTime } = req.body;
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        await db().collection("users").doc(userId).update({
          "settings.notificationEnabled": notificationEnabled ?? false,
          "settings.notificationTime": notificationTime || "09:00",
        });
        res.json({ success: true });
        return;
      }

      // Stripe checkout
      if (req.method === "POST" && (path === "/api/stripe/checkout" || path === "/checkout")) {
        const { userId } = req.body;
        const returnUrl = req.body.returnUrl || "https://muscle-coach-ai.web.app/subscribe";
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        const url = await createCheckoutSession(userId, returnUrl);
        res.json({ url });
        return;
      }

      // Stripe Customer Portal
      if (req.method === "POST" && (path === "/api/stripe/portal" || path === "/portal")) {
        const { userId } = req.body;
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        const user = await getOrCreateUser(userId);
        const customerId = user.subscription.stripeCustomerId;
        if (!customerId) { res.status(400).json({ error: "No Stripe customer found" }); return; }
        const returnUrl = req.body.returnUrl || "https://muscle-coach-ai.web.app/subscribe";
        const url = await createCustomerPortalSession(customerId, returnUrl);
        res.json({ url });
        return;
      }

      // Workouts
      if (req.method === "GET" && (path === "/api/workouts" || path === "/workouts" || path.startsWith("/workouts/"))) {
        const userId = (req.query.userId as string) || path.split("/workouts/")[1];
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        const month = req.query.month as string | undefined;
        const workouts = month
          ? await getWorkoutsByMonth(userId, month)
          : await getRecentWorkouts(userId, 30);
        const formatted = workouts.map((w) => ({
          id: "",
          date: w.date?.toDate?.() ? w.date.toDate().toISOString() : new Date().toISOString(),
          exercises: w.exercises.map((e) => ({
            name: e.name, bodyPart: "",
            sets: Array.from({ length: e.sets || 1 }, () => ({ weight: e.weight || 0, reps: e.reps || 0 })),
          })),
        }));
        res.json(formatted);
        return;
      }

      // Workout 直接保存
      if (req.method === "POST" && (path === "/api/workouts" || path === "/workouts")) {
        const { userId, exercises, date } = req.body;
        if (!userId || !exercises || !Array.isArray(exercises) || exercises.length === 0) {
          res.status(400).json({ error: "Missing required fields" });
          return;
        }
        await saveWorkoutDirectly(userId, exercises, date);
        res.json({ success: true });
        checkAndPushMilestone(userId).catch((err) =>
          console.error("checkAndPushMilestone error:", err)
        );
        return;
      }

      // Milestones
      if (req.method === "GET" && (path === "/api/milestones" || path === "/milestones")) {
        const userId = req.query.userId as string;
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        const totalCount = await getTotalWorkoutCount(userId);
        const MILESTONES = [
          { count: 5, name: "弱点部位レポート", emoji: "🔍" },
          { count: 15, name: "成長トレンド分析", emoji: "📈" },
          { count: 30, name: "プログラム最適化", emoji: "⚡" },
        ];
        const milestones = MILESTONES.map((m) => ({
          count: m.count,
          name: m.name,
          emoji: m.emoji,
          achieved: totalCount >= m.count,
        }));
        res.json({ totalCount, milestones });
        return;
      }

      // Usage status
      if (req.method === "GET" && (path === "/api/usage" || path === "/usage")) {
        const userId = req.query.userId as string;
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        const remaining = await getRemainingUsage(userId);
        res.json({ remaining }); // null = unlimited (premium)
        return;
      }

      // User info
      if (req.method === "GET" && (path.startsWith("/api/user/") || path.startsWith("/user/"))) {
        const lineUserId = path.split("/user/")[1];
        if (!lineUserId) { res.status(400).json({ error: "Missing userId" }); return; }
        const user = await getOrCreateUser(lineUserId);
        res.json(user);
        return;
      }

      // LINE Rich Menu 作成（管理者用、ADMIN_API_KEY 必須）
      if (req.method === "POST" && path === "/api/admin/create-rich-menu") {
        const adminKey = process.env.ADMIN_API_KEY;
        const provided = req.headers["x-admin-key"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        if (!adminKey || provided !== adminKey) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        const richMenuId = await createAndSetDefaultRichMenu();
        res.json({ success: true, richMenuId });
        return;
      }

      res.status(404).json({ error: "Not found" });
    } catch (error) {
      console.error("API error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
