/**
 * トレーニング記録の分析（コード集計 + ハイライト選定 + AI言語化）
 *
 * 設計の核心:
 * - 「弱点」「伸び」「伸び悩み」の判定はすべてコード(history.ts + selectHighlights)が行う。
 * - 「分析に何を載せるか」（ハイライト選定）もコードが決める。各セクションに上限を設け、
 *   優先度の高い項目だけを AI に渡す。
 * - AI は渡された確定値を固定4セクション（弱点/伸びているところ/伸び悩んでいるところ/
 *   次のステップ）の日本語にするだけ（数値の捏造を禁止）。
 * - これにより「同じ記録からは実質同じ分析」が返る（再現性）。
 *
 * 集計範囲:
 * - 通常分析・週次レポート: 直近7日の週次スナップショットを軸に、トレンドは全期間比較
 * - マイルストーン(5/15/30回): 累計到達の節目なので全期間（到達回数分）を集計
 */

import * as admin from "firebase-admin";
import { getAnthropicClient, pickModel, pickMaxTokens } from "./client";
import { ANALYSIS_VERBALIZE_PROMPT } from "./prompts";
import {
  buildWorkoutHistorySummary,
  buildGrowthTrend,
  buildWeeklySnapshot,
  type WorkoutHistorySummary,
  type GrowthTrend,
  type WeeklySnapshot,
  type ExerciseTrend,
  type MuscleGroup,
} from "../workout/history";

const db = admin.firestore;

const MUSCLE_LABEL: Record<string, string> = {
  chest: "胸",
  back: "背中",
  legs: "脚",
  shoulders: "肩",
  arms: "腕",
  core: "腹",
};

// セクションごとの掲載上限（spec: analysis-highlight-format.md の仮決定2）
const MAX_WEAKPOINTS = 2;
const MAX_IMPROVED = 2;
const MAX_STAGNANT = 2;

interface ProfileLite {
  nickname?: string;
  goal?: string;
  frequency?: number | string;
}

async function getProfileLite(userId: string): Promise<ProfileLite> {
  const doc = await db().collection("users").doc(userId).get();
  return (doc.data()?.profile ?? {}) as ProfileLite;
}

/**
 * 分析に載せる内容（コードが確定的に選定した結果）。
 * AI はこの中身を言語化するだけで、追加・推測はしない。
 */
export interface AnalysisHighlights {
  /** マイルストーン経路なら到達回数、通常分析なら null */
  milestoneCount: number | null;
  /** 直近7日のセッション数（マイルストーン経路では null = 週区切りを使わない） */
  weekSessions: number | null;
  totalRecords: number;
  lastWorkoutDaysAgo: number | null;
  goal?: string;
  /** 弱点部位のラベル（最大2） */
  weakpoints: string[];
  /** 伸びている種目（最大2、改善幅順） */
  improved: ExerciseTrend[];
  /** 伸び悩んでいる種目名（最大2、実施回数順） */
  stagnant: string[];
  /** トレンド判定に足るデータがあるか（false なら「まだ判定できない」を出す） */
  trendJudgeable: boolean;
  /** 次のステップ（1点のみ。優先順位ルールでコードが決める） */
  nextStep: string;
}

/**
 * 集計結果からハイライトを選定する。すべて確定的（同じ入力なら同じ出力）。
 *
 * - 弱点: 全期間で未刺激の部位を優先し、（通常分析では）今週未刺激の部位を
 *   全期間の刺激回数が少ない順で補充。最大2部位。
 * - 伸び: トレンドの improved から改善幅の大きい順に最大2種目。
 * - 伸び悩み: トレンドの stagnant から実施回数の多い順に最大2種目。
 * - 次のステップ: 弱点 > 伸び悩み > 伸びの継続 > 記録継続 の優先順位で1点。
 */
export function selectHighlights(
  summary: WorkoutHistorySummary,
  trend: GrowthTrend,
  weekly: WeeklySnapshot | null,
  profile: ProfileLite,
  milestoneCount: number | null,
): AnalysisHighlights {
  // 弱点候補: 全期間未刺激 → （通常分析のみ）今週未刺激を全期間刺激回数の少ない順で補充
  const weakGroups: MuscleGroup[] = [...summary.underworkedMuscles];
  if (weekly) {
    const extras = weekly.untouchedMuscles
      .filter((g) => !weakGroups.includes(g))
      .sort((a, b) => summary.muscleTouchCounts[a] - summary.muscleTouchCounts[b]);
    weakGroups.push(...extras);
  }
  const weakpoints = weakGroups.slice(0, MAX_WEAKPOINTS).map((g) => MUSCLE_LABEL[g] ?? g);

  const improved = trend.improved.slice(0, MAX_IMPROVED);

  // 伸び悩みは「よくやっている種目」ほど伝える価値が高いので実施回数順
  const performedCount = new Map(
    summary.exerciseSummaries.map((s) => [s.name, s.timesPerformed]),
  );
  const stagnant = [...trend.stagnant]
    .sort((a, b) => (performedCount.get(b.name) ?? 0) - (performedCount.get(a.name) ?? 0))
    .slice(0, MAX_STAGNANT)
    .map((e) => e.name);

  // 次のステップ（1点のみ）
  let nextStep: string;
  if (weakpoints.length > 0) {
    nextStep = `次回のトレーニングに${weakpoints[0]}の種目を1つ入れる`;
  } else if (stagnant.length > 0) {
    nextStep = `${stagnant[0]}の重量か回数を、どちらか一段だけ上げてみる`;
  } else if (improved.length > 0) {
    nextStep = `${improved[0].name}は伸びているので、今のペースを継続する`;
  } else {
    nextStep = "まずは記録を続けて、比較できるデータをためる";
  }

  return {
    milestoneCount,
    weekSessions: weekly ? weekly.sessions : null,
    totalRecords: summary.totalRecords,
    lastWorkoutDaysAgo: summary.lastWorkoutDaysAgo,
    goal: profile.goal,
    weakpoints,
    improved,
    stagnant,
    trendJudgeable: trend.hasEnoughData,
    nextStep,
  };
}

/**
 * 選定済みハイライトを、AI に渡す「分析データ」テキストに変換する。
 * 固定4セクションの順序で渡し、空のセクションは「該当なし」等を明示する。
 */
function buildAnalysisData(h: AnalysisHighlights): string {
  const lines: string[] = [];

  lines.push("## 分析データ（これらの確定値のみ使うこと）");
  if (h.milestoneCount != null) {
    lines.push(`- 種別: マイルストーン（累計${h.milestoneCount}回到達）。全期間の集計`);
  } else {
    lines.push("- 種別: 今週の振り返り（直近7日が軸。トレンドは全期間の比較）");
    lines.push(`- 直近7日のトレーニング回数: ${h.weekSessions}回`);
  }
  lines.push(`- 集計対象セッション数: ${h.totalRecords}`);
  if (h.lastWorkoutDaysAgo != null) {
    lines.push(`- 最終トレーニング: ${h.lastWorkoutDaysAgo}日前`);
  }
  if (h.goal) lines.push(`- ユーザーの目標: ${h.goal}`);

  lines.push("");
  lines.push("### 弱点（コード判定）");
  if (h.weakpoints.length > 0) {
    for (const w of h.weakpoints) lines.push(`- ${w}: 刺激が不足している`);
  } else {
    lines.push("- 該当なし（部位バランスに大きな偏りなし）");
  }

  lines.push("");
  lines.push("### 伸びているところ（コード判定）");
  if (!h.trendJudgeable) {
    lines.push("- まだ判定できる記録が足りない（初期と最近を比較できない）");
  } else if (h.improved.length > 0) {
    for (const e of h.improved) {
      const w =
        e.earlyMaxWeight != null && e.recentMaxWeight != null
          ? `最大重量 ${e.earlyMaxWeight}kg→${e.recentMaxWeight}kg`
          : "";
      const r =
        e.earlyTypicalReps != null && e.recentTypicalReps != null
          ? `回数 ${e.earlyTypicalReps}→${e.recentTypicalReps}`
          : "";
      const detail = [w, r].filter(Boolean).join(" / ");
      lines.push(`- ${e.name}${detail ? `（${detail}）` : ""}`);
    }
  } else {
    lines.push("- 該当なし（明確に伸びている種目はない）");
  }

  lines.push("");
  lines.push("### 伸び悩んでいるところ（コード判定）");
  if (!h.trendJudgeable) {
    lines.push("- まだ判定できる記録が足りない");
  } else if (h.stagnant.length > 0) {
    for (const name of h.stagnant) {
      lines.push(`- ${name}（複数回実施しているが重量・回数の変化が小さい）`);
    }
  } else {
    lines.push("- 該当なし");
  }

  lines.push("");
  lines.push("### 次のステップ（コード判定・この1点のみ）");
  lines.push(`- ${h.nextStep}`);

  return lines.join("\n");
}

/**
 * 集計 → ハイライト選定までをコードだけで行い、AnalysisHighlights を返す。
 * AI を一切呼ばない（無料・低レイテンシ）。記録が無い場合は null。
 *
 * ダッシュボードの「分析サマリー」（事実の要点表示）と、buildAnalysis（AI言語化）の
 * 両方がこれを使う。両者が同じ確定値を源にすることで内容の食い違いを防ぐ。
 *
 * @param milestoneCount マイルストーン経路のときは到達回数を渡す（通常分析では null）。
 *   マイルストーンは全期間集計、通常分析・週次スナップショットを軸にする。
 */
export async function buildAnalysisHighlights(
  userId: string,
  milestoneCount: number | null = null,
): Promise<AnalysisHighlights | null> {
  const limit = milestoneCount ?? 30;
  const [summary, trend, weekly, profile] = await Promise.all([
    buildWorkoutHistorySummary(userId, limit),
    buildGrowthTrend(userId, limit),
    milestoneCount == null
      ? buildWeeklySnapshot(userId)
      : Promise.resolve<WeeklySnapshot | null>(null),
    getProfileLite(userId),
  ]);

  if (!summary.hasRecords) return null;

  return selectHighlights(summary, trend, weekly, profile, milestoneCount);
}

/**
 * 分析を実行して、ユーザー向けの言語化テキストを返す。
 * 集計・選定はコード、言語化のみ AI。記録が無い場合は null を返す（呼び出し側で分岐）。
 *
 * @param milestoneCount マイルストーン経路のときは到達回数を渡す（通常分析では null）。
 */
export async function buildAnalysis(
  userId: string,
  milestoneCount: number | null = null,
): Promise<string | null> {
  const highlights = await buildAnalysisHighlights(userId, milestoneCount);
  if (!highlights) return null;

  const analysisData = buildAnalysisData(highlights);

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: pickModel("report"),
    max_tokens: pickMaxTokens("report"),
    // 言語化プロンプトは固定なのでキャッシュを効かせる。分析データはユーザー固有なので後ろ（messages）に置く。
    system: [{ type: "text", text: ANALYSIS_VERBALIZE_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: analysisData }],
  });

  return response.content[0].type === "text" ? response.content[0].text : null;
}
