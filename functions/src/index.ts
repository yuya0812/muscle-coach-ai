import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { lineWebhook } from "./line/webhook";
import { stripeWebhook, createCheckoutSession, createCustomerPortalSession } from "./subscription/stripe";
import { getOrCreateUser, updateUserProfile, getRemainingUsage, updateUserSettings } from "./user/manager";
import {
  getRecentWorkouts,
  getWorkoutsByMonth,
  saveWorkoutDirectly,
  getTotalWorkoutCount,
  getRecentCustomExerciseNames,
  normalizeExercise,
  totalVolumeOf,
  Exercise,
} from "./workout/recorder";
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
          return {
            date: data.date?.toDate?.() ? data.date.toDate() : new Date(),
            exercises: ((data.exercises || []) as Exercise[]).map((ex) => normalizeExercise(ex)),
          };
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

        // 種目ごと・日付ごとに「総重量 = Σ(weight × reps × sets)」を集計
        const exerciseVolumes: Record<string, Map<string, number>> = {};
        const sortedWorkouts = [...workouts].sort((a, b) => a.date.getTime() - b.date.getTime());
        for (const w of sortedWorkouts) {
          const jst = new Date(w.date.getTime() + 9 * 60 * 60 * 1000);
          const dateStr = `${jst.getMonth() + 1}/${jst.getDate()}`;
          for (const ex of w.exercises) {
            const vol = totalVolumeOf(ex);
            if (vol <= 0) continue; // 重量未入力等は除外
            if (!exerciseVolumes[ex.name]) exerciseVolumes[ex.name] = new Map();
            const map = exerciseVolumes[ex.name];
            map.set(dateStr, (map.get(dateStr) ?? 0) + vol);
          }
        }
        // よく記録されている上位4種目
        const topExercises = Object.entries(exerciseVolumes)
          .sort((a, b) => b[1].size - a[1].size)
          .slice(0, 4);
        // 日付軸: 上位4種目に出現した日付の和集合（時系列順）
        const allDatesSet = new Set<string>();
        for (const [, dateMap] of topExercises) {
          for (const d of dateMap.keys()) allDatesSet.add(d);
        }
        const allDates = Array.from(allDatesSet).sort((a, b) => {
          const [am, ad] = a.split("/").map(Number);
          const [bm, bd] = b.split("/").map(Number);
          return am !== bm ? am - bm : ad - bd;
        });
        // datasets: 0kg時はnullを返してChart.jsの spanGaps で線をスキップ可能に
        const datasets = topExercises.map(([name, dateMap]) => ({
          label: name,
          data: allDates.map((d) => dateMap.get(d) ?? null),
        }));

        const recentWorkouts = workouts.slice(0, 10).map((w) => {
          const jst = new Date(w.date.getTime() + 9 * 60 * 60 * 1000);
          return {
            date: `${jst.getFullYear()}/${jst.getMonth() + 1}/${jst.getDate()}`,
            exercises: w.exercises.map((e) => ({
              name: e.name,
              setGroups: e.setGroups ?? [],
              totalVolume: totalVolumeOf(e),
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
            trainerType: user.profile.trainerType || "hot",
          },
          settings: {
            notificationEnabled: user.settings.notificationEnabled,
            notificationTime: user.settings.notificationTime,
            notificationDays: user.settings.notificationDays ?? [],
            autoSendAnalysisEnabled: user.settings.autoSendAnalysisEnabled ?? false,
            autoSendAnalysisMessage: user.settings.autoSendAnalysisMessage ?? "今日の記録を分析して",
          },
        });
        return;
      }

      // Profile update
      if (req.method === "PUT" && (path === "/api/profile" || path === "/profile")) {
        const { userId, goal, level, equipment, frequency, trainerName, trainerType } = req.body;
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        const updates: Record<string, unknown> = { goal, level, equipment, frequency };
        if (trainerName !== undefined) updates.trainerName = trainerName;
        if (trainerType !== undefined) updates.trainerType = trainerType;
        await updateUserProfile(userId, updates);
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

      // Notification & misc settings
      if (req.method === "PUT" && (path === "/api/settings" || path === "/settings")) {
        const {
          userId,
          notificationEnabled,
          notificationTime,
          notificationDays,
          autoSendAnalysisEnabled,
          autoSendAnalysisMessage,
        } = req.body;
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        // バリデーション: 曜日は0-6の整数配列のみ受理
        let validatedDays: number[] | undefined;
        if (notificationDays !== undefined) {
          if (!Array.isArray(notificationDays)) { res.status(400).json({ error: "notificationDays must be an array" }); return; }
          validatedDays = notificationDays
            .map((d: unknown) => Number(d))
            .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6);
          // 重複排除
          validatedDays = Array.from(new Set(validatedDays));
        }
        // 自動送信メッセージは長さ制限
        let validatedMessage: string | undefined;
        if (autoSendAnalysisMessage !== undefined) {
          if (typeof autoSendAnalysisMessage !== "string") { res.status(400).json({ error: "autoSendAnalysisMessage must be string" }); return; }
          validatedMessage = autoSendAnalysisMessage.replace(/[\r\n\t]/g, " ").trim().slice(0, 200);
        }
        await updateUserSettings(userId, {
          notificationEnabled,
          notificationTime: notificationTime || undefined,
          notificationDays: validatedDays,
          autoSendAnalysisEnabled,
          autoSendAnalysisMessage: validatedMessage,
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

      // Workouts: 履歴一覧 (/workouts/exercises/recent はカスタム種目候補を返す)
      if (req.method === "GET" && (path === "/api/workouts/exercises/recent" || path === "/workouts/exercises/recent")) {
        const userId = req.query.userId as string;
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 6));
        const exclude = ((req.query.exclude as string) || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const names = await getRecentCustomExerciseNames(userId, limit, new Set(exclude));
        res.json({ names });
        return;
      }

      if (req.method === "GET" && (path === "/api/workouts" || path === "/workouts" || path.startsWith("/workouts/"))) {
        const userId = (req.query.userId as string) || path.split("/workouts/")[1];
        if (!userId) { res.status(400).json({ error: "Missing userId" }); return; }
        const month = req.query.month as string | undefined;
        const workouts = month
          ? await getWorkoutsByMonth(userId, month)
          : await getRecentWorkouts(userId, 30);
        // フロント既存の WorkoutLog 表示が { exercises: [{ sets: [{weight, reps}] }] } 形式を期待しているので
        // setGroups を sets配列に展開する形でレスポンス
        const formatted = workouts.map((w) => ({
          id: "",
          date: w.date?.toDate?.() ? w.date.toDate().toISOString() : new Date().toISOString(),
          exercises: w.exercises.map((e) => {
            const flatSets: { weight: number; reps: number }[] = [];
            for (const g of e.setGroups ?? []) {
              const count = g.sets ?? 1;
              for (let i = 0; i < count; i++) {
                flatSets.push({ weight: g.weight ?? 0, reps: g.reps ?? 0 });
              }
            }
            return { name: e.name, bodyPart: "", sets: flatSets };
          }),
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
