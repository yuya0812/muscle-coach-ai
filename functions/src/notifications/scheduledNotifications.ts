import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as line from "@line/bot-sdk";
import { pushMessages } from "../line/messages";
import { sendWeeklyReportToUser } from "../reports/weeklyReport";

// LINE メッセージの送信者表示名（旧トレーナーキャラ名の代わりに固定のサービス名）
const APP_SENDER_NAME = "マッスルコーチ";

// 日次リマインダー（キャラ別ではなく汎用文言。記録を促すことに徹する）
const DAILY_REMINDERS: string[] = [
  "今日のトレーニングを記録しましょう。「ベンチプレス 60kg 10回 3セット」のように送るだけです。",
  "今日も一歩。トレーニングをしたら記録に残しておきましょう。",
  "コツコツ続けるのが一番の近道です。今日の記録を送ってください。",
];

function getReminderMessage(nickname: string): string {
  const base = DAILY_REMINDERS[Math.floor(Math.random() * DAILY_REMINDERS.length)];
  return `${nickname}さん、${base}`;
}

/**
 * 毎時実行 - 各ユーザーの設定時刻に合わせて通知を送信
 * 月曜日: 週次レポート
 * その他: 日次リマインダー
 */
export const sendScheduledNotifications = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    memory: "256MiB",
  },
  async () => {
    const db = admin.firestore();
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
    const currentHour = now.getHours();
    const isMonday = now.getDay() === 1;

    const usersSnapshot = await db.collection("users")
      .where("settings.notificationEnabled", "==", true)
      .get();

    console.log(
      `[ScheduledNotifications] JST=${now.toISOString()}, hour=${currentHour}, monday=${isMonday}, targets=${usersSnapshot.size}`
    );

    const currentDay = now.getDay(); // 0=日, 1=月, ...

    for (const userDoc of usersSnapshot.docs) {
      const data = userDoc.data();
      const notifTime: string = data.settings?.notificationTime || "09:00";
      const notifHour = parseInt(notifTime.split(":")[0], 10);

      if (notifHour !== currentHour) continue;

      const userId = userDoc.id;
      const nickname: string = data.profile?.nickname || data.profile?.name || "ゲスト";
      const sender = { name: APP_SENDER_NAME };

      // 月曜は週次レポートを必ず送る（プレミアム会員のみ）。曜日設定の影響を受けない固定通知。
      if (isMonday) {
        try {
          await sendWeeklyReportToUser(userId);
          console.log(`[ScheduledNotifications] Weekly report sent to ${userId}`);
        } catch (error) {
          console.error(`[ScheduledNotifications] Weekly report failed for ${userId}:`, error);
        }
        continue;
      }

      // 任意の日次リマインダーは notificationDays に現在曜日が含まれる場合のみ送る
      const notifDays: number[] = Array.isArray(data.settings?.notificationDays)
        ? data.settings.notificationDays
        : [];
      if (!notifDays.includes(currentDay)) continue;

      try {
        const text = getReminderMessage(nickname);
        await pushMessages(userId, [
          { type: "text", text, sender } as line.messagingApi.Message,
        ]);
        console.log(`[ScheduledNotifications] Daily reminder sent to ${userId} (day=${currentDay})`);
      } catch (error) {
        console.error(`[ScheduledNotifications] Failed for ${userId}:`, error);
      }
    }
  }
);
