/**
 * トレーニング記録の分析（コード集計 + ハイライト選定 + AI言語化）
 *
 * 設計の核心:
 * - 「伸び」「継続」「伸び悩み」の判定はすべてコード(history.ts + selectHighlights)が行う。
 * - 部位の網羅性で責める「弱点」は廃止。やっている種目の伸び・継続を主役にする。
 *   「最近やっていない種目」は累計30回到達で解放される任意情報（責めない中立表現）。
 * - 「分析に何を載せるか」（ハイライト選定）もコードが決める。各セクションに上限を設け、
 *   優先度の高い項目だけを AI に渡す。
 * - AI は渡された確定値を固定構成（伸び/続けられている種目/伸び悩み/次のステップ）の
 *   日本語にするだけ（数値の捏造を禁止）。
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
  untouchedExercises,
  type WorkoutHistorySummary,
  type GrowthTrend,
  type WeeklySnapshot,
  type ExerciseTrend,
} from "../workout/history";

const db = admin.firestore;

// セクションごとの掲載上限。
const MAX_IMPROVED = 2;
const MAX_CONSISTENT = 2;
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
// 「最近やっていない種目」の表示が解放される累計記録回数。
// それまでは伸び中心の前向きな分析だけを見せ、網羅性で責めない（モチベ優先）。
export const UNTOUCHED_UNLOCK_AT = 30;

export interface AnalysisHighlights {
  /** マイルストーン経路なら到達回数、通常分析なら null */
  milestoneCount: number | null;
  /** 直近7日のセッション数（マイルストーン経路では null = 週区切りを使わない） */
  weekSessions: number | null;
  totalRecords: number;
  lastWorkoutDaysAgo: number | null;
  goal?: string;
  /** 伸びている種目（最大2、改善幅順）。分析の主役。 */
  improved: ExerciseTrend[];
  /** 安定して継続できている種目名（伸びの土台。最大2、実施回数順） */
  consistent: string[];
  /** 伸び悩んでいる種目名（最大2、実施回数順） */
  stagnant: string[];
  /** トレンド判定に足るデータがあるか（false なら「まだ判定できない」を出す） */
  trendJudgeable: boolean;
  /** 次のステップ（1点のみ。優先順位ルールでコードが決める） */
  nextStep: string;
  /** 「最近やっていない種目」表示が解放されているか（累計30回以上） */
  untouchedUnlocked: boolean;
  /** 最近やっていない種目名（解放後・任意表示用。最大3）。責めない中立表現で使う。 */
  untouched: string[];
}

/**
 * 集計結果からハイライトを選定する。すべて確定的（同じ入力なら同じ出力）。
 *
 * 方針: 部位の網羅性（未刺激＝弱点）で責めるのをやめ、ユーザーがやっている種目の
 * 「伸び・継続・伸び悩み」を主役にする。「最近やっていない種目」は累計30回到達で
 * 解放される任意情報として持たせる（表示するかは閲覧側がデフォルトOFFで制御）。
 *
 * - 伸び: トレンドの improved から改善幅の大きい順に最大2種目（主役）。
 * - 継続: 実施回数の多い種目から最大2（伸びの土台として前向きに伝える）。
 * - 伸び悩み: トレンドの stagnant から実施回数の多い順に最大2種目。
 * - 次のステップ: 伸び悩み打開 > 伸びの継続 > 記録継続 の優先順位で1点（部位補強は出さない）。
 * - 触れていない種目: 累計30回以上で解放。最後の実施から日が空いた種目を中立に拾う。
 */
export function selectHighlights(
  summary: WorkoutHistorySummary,
  trend: GrowthTrend,
  _weekly: WeeklySnapshot | null,
  profile: ProfileLite,
  milestoneCount: number | null,
): AnalysisHighlights {
  const improved = trend.improved.slice(0, MAX_IMPROVED);

  const performedCount = new Map(
    summary.exerciseSummaries.map((s) => [s.name, s.timesPerformed]),
  );

  // 継続できている種目（実施回数が多い順）。伸びの土台として前向きに伝える。
  const improvedNames = new Set(improved.map((e) => e.name));
  const consistent = summary.exerciseSummaries
    .filter((s) => s.timesPerformed >= 2 && !improvedNames.has(s.name))
    .slice(0, MAX_CONSISTENT)
    .map((s) => s.name);

  // 伸び悩みは「よくやっている種目」ほど伝える価値が高いので実施回数順
  const stagnant = [...trend.stagnant]
    .sort((a, b) => (performedCount.get(b.name) ?? 0) - (performedCount.get(a.name) ?? 0))
    .slice(0, MAX_STAGNANT)
    .map((e) => e.name);

  // 次のステップ（1点のみ）。未刺激部位の補強提案はしない（やらない種目があってOK）。
  let nextStep: string;
  if (stagnant.length > 0) {
    nextStep = `${stagnant[0]}の重量か回数を、どちらか一段だけ上げてみる`;
  } else if (improved.length > 0) {
    nextStep = `${improved[0].name}は伸びているので、今のペースを継続する`;
  } else {
    nextStep = "まずは記録を続けて、比較できるデータをためる";
  }

  const untouchedUnlocked = summary.totalRecords >= UNTOUCHED_UNLOCK_AT;
  const untouched = untouchedUnlocked ? untouchedExercises(summary) : [];

  return {
    milestoneCount,
    weekSessions: _weekly ? _weekly.sessions : null,
    totalRecords: summary.totalRecords,
    lastWorkoutDaysAgo: summary.lastWorkoutDaysAgo,
    goal: profile.goal,
    improved,
    consistent,
    stagnant,
    trendJudgeable: trend.hasEnoughData,
    nextStep,
    untouchedUnlocked,
    untouched,
  };
}

/**
 * 選定済みハイライトを、AI に渡す「分析データ」テキストに変換する。
 * 伸び中心の構成（伸び→継続→伸び悩み→次の一歩）で渡す。空のセクションは明示する。
 * 「最近やっていない種目」は解放（累計30回）後のみ末尾に中立表現で付ける。
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
  lines.push("### 伸びているところ（コード判定・最重要。前向きに伝える）");
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
    lines.push("- 明確に伸びている種目はまだないが、続けていること自体が前進");
  }

  lines.push("");
  lines.push("### 続けられている種目（コード判定・継続を称える）");
  if (h.consistent.length > 0) {
    lines.push(`- ${h.consistent.join("・")} を安定して継続できている`);
  } else {
    lines.push("- これから継続の軸になる種目がたまっていく段階");
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

  // 「最近やっていない種目」は解放後のみ、参考情報として中立に渡す。
  // 責めず、やる/やらないはユーザー次第というトーンを保つこと。
  if (h.untouchedUnlocked && h.untouched.length > 0) {
    lines.push("");
    lines.push("### 参考: 最近やっていない種目（責めない。やるやらないは本人次第）");
    lines.push(`- ${h.untouched.join("・")}`);
  }

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
