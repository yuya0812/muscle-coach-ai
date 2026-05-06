import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as line from "@line/bot-sdk";
import { pushMessages } from "../line/messages";
import { getTrainer } from "../line/trainerCharacter";
import { sendWeeklyReportToUser } from "../reports/weeklyReport";

// トレーナーキャラクター別リマインダーメッセージ
const DAILY_REMINDERS: Record<string, string[]> = {
  hot: [
    "今日もトレーニングするぞ！💪\n諦めたら終わりだ！記録して一緒に追い込もう！",
    "体は裏切らない！今日も記録して積み上げよう🔥",
    "毎日コツコツが最強の武器だ！今日も「記録」から始めよう💪",
  ],
  science: [
    "定期的なトレーニングが筋肥大の最大要因です📊\n今日の記録をつけていきましょう。",
    "一貫性こそが最大の変数です📈\n今日も記録を積み上げましょう。",
    "超回復サイクルを最適化するには記録が不可欠です🧪\n今日はどんなトレーニングをしましたか？",
  ],
  buddy: [
    "やあ！今日も一緒にやろうよ〜😄\n「記録」って送ってくれたら付き合うよ！",
    "ねえねえ、今日体動かした？😊\nなんでも聞いてね、一緒に頑張ろ！",
    "お疲れ〜！今日もトレーニングどう？💪\nメニューは「今日のメニュー」で見れるよ！",
  ],
};

function getReminderMessage(trainerType: string, nickname: string): string {
  const msgs = DAILY_REMINDERS[trainerType] || DAILY_REMINDERS.hot;
  const base = msgs[Math.floor(Math.random() * msgs.length)];
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

    for (const userDoc of usersSnapshot.docs) {
      const data = userDoc.data();
      const notifTime: string = data.settings?.notificationTime || "09:00";
      const notifHour = parseInt(notifTime.split(":")[0], 10);

      if (notifHour !== currentHour) continue;

      const userId = userDoc.id;
      const trainer = getTrainer(data.profile?.trainerType);
      const trainerName: string = data.profile?.trainerName || trainer.name;
      const nickname: string = data.profile?.nickname || data.profile?.name || "ゲスト";
      const sender = { name: trainerName };

      try {
        if (isMonday) {
          await sendWeeklyReportToUser(userId);
        } else {
          const text = getReminderMessage(data.profile?.trainerType || "hot", nickname);
          await pushMessages(userId, [
            { type: "text", text, sender } as line.messagingApi.Message,
          ]);
        }
        console.log(`[ScheduledNotifications] Sent to ${userId} (monday=${isMonday})`);
      } catch (error) {
        console.error(`[ScheduledNotifications] Failed for ${userId}:`, error);
      }
    }
  }
);
