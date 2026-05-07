import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { getAnthropicClient, CLAUDE_MODEL } from "../ai/client";
import { pushText } from "../line/messages";
import { WEEKLY_REPORT_PROMPT } from "../ai/prompts";
import { normalizeExercise, Exercise } from "../workout/recorder";

/**
 * 毎週月曜日 8:00 JSTにプレミアムユーザーへ週次レポートを送信
 */
export const sendWeeklyReports = onSchedule(
  {
    schedule: "every monday 08:00",
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    memory: "256MiB",
  },
  async () => {
    const db = admin.firestore();

    // プレミアムかつ通知設定OFFのユーザーのみ（通知設定ONは sendScheduledNotifications 側で対応）
    const usersSnapshot = await db.collection("users").get();
    const targets = usersSnapshot.docs.filter((doc) => {
      const data = doc.data();
      const isPremium = data.subscription?.status === "active";
      const notifEnabled = data.settings?.notificationEnabled === true;
      return isPremium && !notifEnabled;
    });

    console.log(`Sending weekly reports to ${targets.length} users`);

    for (const userDoc of targets) {
      const userId = userDoc.id;
      try {
        await sendWeeklyReportToUser(userId);
      } catch (error) {
        console.error(`Failed to send weekly report to ${userId}:`, error);
      }
    }
  }
);

export async function sendWeeklyReportToUser(userId: string): Promise<void> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const snapshot = await admin
    .firestore()
    .collection("users")
    .doc(userId)
    .collection("workouts")
    .where("date", ">=", admin.firestore.Timestamp.fromDate(weekAgo))
    .orderBy("date", "desc")
    .get();

  if (snapshot.empty) {
    await pushText(
      userId,
      "📊 週次トレーニングレポート\n\n今週はまだ記録がありませんでした💦\n来週も一緒に頑張りましょう！\n\n「メニュー作成」で今週のプランを立ててみませんか？💪"
    );
    return;
  }

  const workouts = snapshot.docs.map((doc) => {
    const data = doc.data();
    const date = data.date?.toDate?.();
    const jst = date ? new Date(date.getTime() + 9 * 60 * 60 * 1000) : null;
    return {
      date: jst
        ? `${jst.getMonth() + 1}/${jst.getDate()}`
        : "不明",
      exercises: ((data.exercises || []) as Exercise[]).map((ex) => normalizeExercise(ex)),
    };
  });

  const workoutSummary = workouts
    .map((w) => {
      const exList = w.exercises
        .map((e) => {
          const parts = [e.name];
          (e.setGroups ?? []).forEach((g) => {
            const setParts: string[] = [];
            if (g.weight) setParts.push(`${g.weight}kg`);
            if (g.reps) setParts.push(`${g.reps}回`);
            if (g.sets) setParts.push(`${g.sets}セット`);
            if (setParts.length) parts.push(`(${setParts.join(" ")})`);
          });
          return parts.join(" ");
        })
        .join(", ");
      return `[${w.date}] ${exList}`;
    })
    .join("\n");

  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    system: WEEKLY_REPORT_PROMPT,
    messages: [
      {
        role: "user",
        content: `今週のトレーニング記録（${workouts.length}回）:\n${workoutSummary}`,
      },
    ],
  });

  const reportText =
    response.content[0].type === "text"
      ? response.content[0].text
      : "レポートの生成に失敗しました。";

  await pushText(userId, `📊 週次トレーニングレポート\n\n${reportText}`);
}
