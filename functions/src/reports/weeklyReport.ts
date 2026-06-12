import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { pushText } from "../line/messages";
import { buildAnalysis } from "../ai/analysis";
import { countWorkoutsSince } from "../workout/recorder";

/**
 * 毎週月曜日 8:00 JSTにプレミアムユーザーへ週次レポートを送信。
 *
 * 方針転換後: レポート本文はコーチング型の自由生成ではなく、
 * analysis.ts（コード集計 + AI言語化）に委譲する。数値はコードが集計し、
 * AI は言語化のみ。記録がなければ案内を送る。
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
  // 週次レポートは「今週分（過去7日）に記録があるか」をまず判定する。
  // buildAnalysis は直近30セッションを集計するため、これ単体では「今週スキップしたが
  // 過去履歴はある」ユーザーに誤って分析を出してしまう。週次の意味を保つためのガード。
  const thisWeekCount = await countWorkoutsSince(userId, 7);
  if (thisWeekCount === 0) {
    await pushText(
      userId,
      "週次トレーニングレポート\n\n今週はまだ記録がありませんでした。\n" +
        "「ベンチプレス 60kg 10回 3セット」のように送るだけで記録できます。来週も無理なく続けましょう。"
    );
    return;
  }

  // 今週の記録がある場合は、週区切りの分析（集計 + ハイライト選定 + 言語化）を届ける。
  const reportText = await buildAnalysis(userId);
  if (!reportText) {
    await pushText(
      userId,
      "週次トレーニングレポート\n\n今週の記録を確認できませんでした。来週も続けていきましょう。"
    );
    return;
  }

  await pushText(userId, `週次トレーニングレポート\n\n${reportText}`);
}
