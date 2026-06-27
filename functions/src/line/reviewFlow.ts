/**
 * レビュー（フィードバック）誘導フロー。
 *
 * 無料で使ってもらい、利用が定着したタイミング（累計3回の送信）で一度だけ
 * 「使ってみてどうでしたか？」とフィードバックを促す。ユーザーが続けて送った返信を
 * フィードバックとして受け取り、Firestore に保存する。
 *
 * 設計:
 * - カウント対象は「あらゆるテキスト送信」（フォロー/空文字は除く。webhook 側で判定）。
 * - 誘導は一度だけ（prompted フラグ）。再表示しない。
 * - 誘導直後の1通だけをフィードバックとして受け取る（awaitingFeedback フラグ）。
 *   これにより、通常の記録パースに「感想の文章」が誤って流れ込むのを防ぐ。
 */

import * as admin from "firebase-admin";
import * as line from "@line/bot-sdk";
import { pushMessages, replyMessages } from "./messages";

const db = admin.firestore;

const APP_SENDER_NAME = "マッスルコーチ";

// この回数の送信に達したらレビュー誘導を出す（あらゆる送信をカウント）。
const REVIEW_PROMPT_THRESHOLD = 3;

// フィードバック受付の有効期限。誘導後しばらく無反応なら、次の送信は通常処理に戻す
// （いつまでも「感想待ち」だと、後日の記録が感想として保存されてしまうため）。
const FEEDBACK_WINDOW_MS = 30 * 60 * 1000; // 30分

interface ReviewState {
  messageCount: number;
  prompted: boolean;
  awaitingFeedback: boolean;
  promptedAt?: FirebaseFirestore.Timestamp;
}

function readReviewState(data: FirebaseFirestore.DocumentData | undefined): ReviewState {
  const r = (data?.review ?? {}) as Partial<ReviewState>;
  return {
    messageCount: r.messageCount ?? 0,
    prompted: r.prompted ?? false,
    awaitingFeedback: r.awaitingFeedback ?? false,
    promptedAt: r.promptedAt,
  };
}

/**
 * 受信メッセージをカウントし、しきい値に達したら一度だけレビュー誘導を出す。
 * 誘導を出した場合は awaitingFeedback=true にして true を返す（webhook 側はそこで return）。
 *
 * 注意: この関数は「カウントすべき送信」のときだけ呼ぶこと（フォロー時や、記録フロー・
 * フィードバック受付など別ステートを処理した後は呼ばない）。
 */
export async function bumpAndMaybePrompt(userId: string): Promise<boolean> {
  const userRef = db().collection("users").doc(userId);
  const doc = await userRef.get();
  const state = readReviewState(doc.data());

  // 既に誘導済みなら、以降はカウントも誘導もしない（一度きり）。
  if (state.prompted) return false;

  const newCount = state.messageCount + 1;
  if (newCount < REVIEW_PROMPT_THRESHOLD) {
    await userRef.update({ "review.messageCount": newCount });
    return false;
  }

  // しきい値到達: 誘導を出し、フィードバック受付状態にする。
  await userRef.update({
    "review.messageCount": newCount,
    "review.prompted": true,
    "review.awaitingFeedback": true,
    "review.promptedAt": admin.firestore.Timestamp.now(),
  });

  await pushMessages(userId, [
    {
      type: "text",
      text:
        "いつも使ってくれてありがとうございます。\n\n" +
        "よかったら、使ってみた感想をこのまま返信で教えてもらえませんか？\n" +
        "「記録が楽になった」「ここが使いにくい」など、一言でも大歓迎です。\n" +
        "今後の改善の参考にさせてください。",
      sender: { name: APP_SENDER_NAME },
    } as line.messagingApi.Message,
  ]);

  return true;
}

/**
 * フィードバック受付中なら、受信テキストを感想として保存して受付を終了する。
 * 受付中でなければ何もせず false を返す（webhook は通常処理を続行）。
 *
 * 記録パースより前に呼ぶこと（感想が記録として保存されるのを防ぐため）。
 */
export async function handleFeedbackIfAwaiting(
  userId: string,
  replyToken: string,
  text: string,
): Promise<boolean> {
  const userRef = db().collection("users").doc(userId);
  const doc = await userRef.get();
  const state = readReviewState(doc.data());

  if (!state.awaitingFeedback) return false;

  // 受付の有効期限切れなら、受付を畳んで通常処理に戻す（この送信は感想にしない）。
  const promptedAtMs = state.promptedAt?.toMillis() ?? 0;
  if (Date.now() - promptedAtMs > FEEDBACK_WINDOW_MS) {
    await userRef.update({ "review.awaitingFeedback": false });
    return false;
  }

  // 感想として保存し、受付終了。
  await db().collection("reviews").add({
    userId,
    text,
    createdAt: admin.firestore.Timestamp.now(),
  });
  await userRef.update({ "review.awaitingFeedback": false });

  await replyMessages(replyToken, [
    {
      type: "text",
      text:
        "ありがとうございます。いただいた感想は今後の改善に活かします。\n" +
        "引き続き、トレーニングの記録に使ってください。",
      sender: { name: APP_SENDER_NAME },
    } as line.messagingApi.Message,
  ]);

  return true;
}
