/**
 * X投稿のエンゲージメント回収。
 *
 * 投稿時点ではインプレッションやいいねは付いていないため、後日まとめて
 * X API（読み取り）でメトリクスを取得し、xPostLogs に書き戻す。
 * これにより「どの投稿が伸びたか」をプロンプト改善のために分析できるようになる。
 *
 * 設計:
 * - 対象は xPostLogs の status=success（tweetId がある）ドキュメント。
 * - 投稿直後はエンゲージメントが付かないので、投稿から一定時間（MIN_AGE_MS）
 *   経過したものだけ回収する。
 * - 既に回収済みでも、ある程度日が浅い投稿は再取得して数値を更新する
 *   （いいね等は数日かけて伸びるため）。古い投稿は確定値として再取得しない。
 * - X の tweets() は1回最大100件まで。レート/課金を抑えるため上限を設ける。
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { getXReadClient } from "./client";

const db = admin.firestore;

// 1回の回収で取得する最大件数（X tweets() の上限は100）。
const MAX_FETCH = 100;

// 投稿からこの時間が経つまでは回収しない（直後は数値が0なので無意味）。
const MIN_AGE_MS = 6 * 60 * 60 * 1000; // 6時間

// この日数より新しい投稿は、回収済みでも再取得して数値を更新する。
const REFRESH_WINDOW_DAYS = 7;

interface XPublicMetrics {
  impressionCount: number;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
}

/**
 * 回収対象の tweetId を集める。
 * - status=success かつ tweetId あり
 * - 投稿から MIN_AGE_MS 以上経過
 * - 未回収、または REFRESH_WINDOW_DAYS 以内（伸び続けるので更新する）
 */
async function selectTargets(): Promise<{ docId: string; tweetId: string }[]> {
  const snapshot = await db()
    .collection("xPostLogs")
    .where("status", "==", "success")
    .orderBy("postedAt", "desc")
    .limit(300)
    .get();

  const now = Date.now();
  const refreshCutoff = now - REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const targets: { docId: string; tweetId: string }[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const tweetId = data.tweetId as string | undefined;
    if (!tweetId) continue;

    const postedAtMs = (data.postedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
    if (now - postedAtMs < MIN_AGE_MS) continue; // 新しすぎる

    const metricsFetchedAtMs =
      (data.metricsFetchedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
    const alreadyFetched = metricsFetchedAtMs > 0;
    const isRecent = postedAtMs >= refreshCutoff;

    // 未回収 or（回収済みでも日が浅く伸びうる）なら対象
    if (!alreadyFetched || isRecent) {
      targets.push({ docId: doc.id, tweetId });
    }
    if (targets.length >= MAX_FETCH) break;
  }

  return targets;
}

/**
 * メトリクスを回収して xPostLogs に書き戻す。
 * 戻り値は処理結果サマリー（疎通確認・ログ用）。
 */
export async function collectXMetrics(): Promise<{
  attempted: number;
  updated: number;
  error?: string;
}> {
  const targets = await selectTargets();
  if (targets.length === 0) {
    return { attempted: 0, updated: 0 };
  }

  const client = getXReadClient();
  const ids = targets.map((t) => t.tweetId);

  let result;
  try {
    result = await client.v2.tweets(ids, { "tweet.fields": ["public_metrics"] });
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string };
    console.error("[collectXMetrics] X API read failed", { code: err.code, message: err.message });
    return { attempted: targets.length, updated: 0, error: `${err.code ?? ""} ${err.message ?? ""}`.trim() };
  }

  // tweetId -> metrics のマップを作る
  const byId = new Map<string, XPublicMetrics>();
  for (const t of result.data ?? []) {
    const m = t.public_metrics;
    if (!m) continue;
    byId.set(t.id, {
      impressionCount: m.impression_count ?? 0,
      likeCount: m.like_count ?? 0,
      retweetCount: m.retweet_count ?? 0,
      replyCount: m.reply_count ?? 0,
      quoteCount: m.quote_count ?? 0,
    });
  }

  let updated = 0;
  const now = admin.firestore.Timestamp.now();
  const batch = db().batch();
  for (const target of targets) {
    const metrics = byId.get(target.tweetId);
    if (!metrics) continue; // 削除済みツイート等で取得できなかった分はスキップ
    batch.update(db().collection("xPostLogs").doc(target.docId), {
      metrics,
      metricsFetchedAt: now,
    });
    updated += 1;
  }
  await batch.commit();

  console.log(`[collectXMetrics] attempted=${targets.length} updated=${updated}`);
  return { attempted: targets.length, updated };
}

/**
 * xPostLogs を集計して X 投稿のパフォーマンスを返す（運用の分析用）。
 * AI は使わず Firestore の集計のみ。手動トリガ /api/admin/x-performance から呼ぶ。
 *
 * 軸ごとの交絡に注意:
 * - ctaVariant（CTAあり/なし）は週単位で分離されているので比較的クリーン → 主指標
 * - timing（朝昼夜）・曜日テーマは ctaVariant や互いと交絡する → 参考値
 * いずれもエンゲージメント率（likes/impressions, (likes+rt+reply)/impressions）で見る。
 */
export interface PerfBucket {
  posts: number;
  withMetrics: number;
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
  /** likes / impressions（%表記の素の値） */
  likeRate: number;
  /** (likes+retweets+replies) / impressions */
  engagementRate: number;
}

function emptyBucket(): PerfBucket {
  return {
    posts: 0, withMetrics: 0, impressions: 0, likes: 0, retweets: 0, replies: 0,
    likeRate: 0, engagementRate: 0,
  };
}

function finalizeBucket(b: PerfBucket): PerfBucket {
  b.likeRate = b.impressions > 0 ? b.likes / b.impressions : 0;
  b.engagementRate =
    b.impressions > 0 ? (b.likes + b.retweets + b.replies) / b.impressions : 0;
  return b;
}

export async function aggregateXPerformance(): Promise<{
  totalSuccess: number;
  totalWithMetrics: number;
  failedCount: number;
  byCtaVariant: Record<string, PerfBucket>;
  byTiming: Record<string, PerfBucket>;
  topPosts: Array<{ tweetText: string; ctaVariant: string; timing: string; impressions: number; likes: number }>;
  note: string;
}> {
  const snapshot = await db().collection("xPostLogs").orderBy("postedAt", "desc").limit(500).get();

  const byCtaVariant: Record<string, PerfBucket> = {};
  const byTiming: Record<string, PerfBucket> = {};
  const scored: Array<{ tweetText: string; ctaVariant: string; timing: string; impressions: number; likes: number }> = [];

  let totalSuccess = 0;
  let totalWithMetrics = 0;
  let failedCount = 0;

  for (const doc of snapshot.docs) {
    const d = doc.data();
    if (d.status === "failed") { failedCount += 1; continue; }
    if (d.status !== "success") continue;
    totalSuccess += 1;

    const cta = (d.ctaVariant as string) ?? "unknown";
    const timing = (d.timing as string) ?? "unknown";
    byCtaVariant[cta] ??= emptyBucket();
    byTiming[timing] ??= emptyBucket();
    byCtaVariant[cta].posts += 1;
    byTiming[timing].posts += 1;

    const m = d.metrics as
      | { impressionCount?: number; likeCount?: number; retweetCount?: number; replyCount?: number }
      | undefined;
    if (!m) continue;
    totalWithMetrics += 1;

    const imp = m.impressionCount ?? 0;
    const likes = m.likeCount ?? 0;
    const rt = m.retweetCount ?? 0;
    const rep = m.replyCount ?? 0;

    for (const b of [byCtaVariant[cta], byTiming[timing]]) {
      b.withMetrics += 1;
      b.impressions += imp;
      b.likes += likes;
      b.retweets += rt;
      b.replies += rep;
    }
    scored.push({ tweetText: (d.tweetText as string) ?? "", ctaVariant: cta, timing, impressions: imp, likes });
  }

  for (const b of Object.values(byCtaVariant)) finalizeBucket(b);
  for (const b of Object.values(byTiming)) finalizeBucket(b);

  const topPosts = scored.sort((a, b) => b.likes - a.likes || b.impressions - a.impressions).slice(0, 5);

  return {
    totalSuccess,
    totalWithMetrics,
    failedCount,
    byCtaVariant,
    byTiming,
    topPosts,
    note:
      "ctaVariant は週単位で分離されており比較的クリーン（主指標）。" +
      "timing は曜日テーマや ctaVariant と交絡するため参考値。" +
      "withMetrics が totalSuccess より大幅に少ない場合は回収待ち（集計の信頼度が低い）。",
  };
}

// 毎日 3:00 JST に前日までの投稿のメトリクスを回収する。
// 投稿（朝昼夜）から十分時間が経った頃に拾うことで、ある程度伸びた数値を取る。
export const collectXMetricsScheduled = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    memory: "256MiB",
    retryCount: 1,
  },
  async () => {
    await collectXMetrics();
  }
);
