/**
 * トレーニング記録の分析（コード集計 + AI言語化）
 *
 * 設計の核心:
 * - 「弱点部位」「成長トレンド」「伸び悩み」の判定はすべてコード(history.ts)が行う。
 * - AI は集計済みの数値・判定を読みやすい日本語にするだけ（数値の捏造を禁止）。
 * - これにより「同じ記録からは実質同じ分析」が返る（再現性）。
 *
 * 通常分析（「分析して」）とマイルストーン(5/15/30回)の両方がこのモジュールを使う。
 */

import * as admin from "firebase-admin";
import { getAnthropicClient, pickModel, pickMaxTokens } from "./client";
import { ANALYSIS_VERBALIZE_PROMPT } from "./prompts";
import {
  buildWorkoutHistorySummary,
  buildGrowthTrend,
  type WorkoutHistorySummary,
  type GrowthTrend,
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

/**
 * 分析の種類。マイルストーンは到達回数で焦点が変わる。
 * - overview:   通常分析（直近の総括）
 * - weakpoint:  5回到達 — 部位バランス・弱点
 * - trend:      15回到達 — 成長トレンド
 * - pattern:    30回到達 — パターン・偏りの総括
 */
export type AnalysisKind = "overview" | "weakpoint" | "trend" | "pattern";

/**
 * マイルストーン到達回数から分析種別を引く。
 */
export function analysisKindForMilestone(count: number): AnalysisKind | null {
  if (count === 5) return "weakpoint";
  if (count === 15) return "trend";
  if (count === 30) return "pattern";
  return null;
}

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
 * 集計済みサマリー・成長トレンド・プロフィールを、AI に渡す「分析データ」テキストに変換する。
 * ここに書かれた数値・判定だけを AI は言語化する（これ以外は使わせない）。
 */
function buildAnalysisData(
  kind: AnalysisKind,
  summary: WorkoutHistorySummary,
  trend: GrowthTrend,
  profile: ProfileLite,
  milestoneCount: number | null,
): string {
  const lines: string[] = [];

  lines.push("## 分析データ（これらの確定値のみ使うこと）");
  if (milestoneCount != null) {
    lines.push(`- 累計記録回数: ${milestoneCount}回（マイルストーン到達）`);
  }
  lines.push(`- 集計対象セッション数: ${summary.totalRecords}`);
  lines.push(`- 過去14日間のジム回数: ${summary.sessionsLast14Days}回`);
  if (summary.lastWorkoutDaysAgo != null) {
    lines.push(`- 最終トレーニング: ${summary.lastWorkoutDaysAgo}日前`);
  }

  if (profile.goal) lines.push(`- ユーザーの目標: ${profile.goal}`);
  if (profile.frequency) lines.push(`- 目標頻度: 週${profile.frequency}回`);

  // 部位バランス（overview / weakpoint / pattern で重視）
  if (kind === "weakpoint" || kind === "overview" || kind === "pattern") {
    const touch = Object.entries(summary.muscleTouchCounts)
      .map(([g, n]) => `${MUSCLE_LABEL[g] ?? g}${n}`)
      .join(" / ");
    lines.push("");
    lines.push(`### 部位別の刺激回数: ${touch}`);
    if (summary.underworkedMuscles.length > 0) {
      const labels = summary.underworkedMuscles.map((g) => MUSCLE_LABEL[g] ?? g).join("・");
      lines.push(`### 刺激できていない部位（弱点候補）: ${labels}`);
    } else {
      lines.push(`### 刺激できていない部位: なし（全部位に刺激あり）`);
    }
  }

  // 種目別実績（overview / pattern）
  if (kind === "overview" || kind === "pattern") {
    if (summary.exerciseSummaries.length > 0) {
      lines.push("");
      lines.push("### 種目別の実績（実施回数順・上位）");
      for (const s of summary.exerciseSummaries.slice(0, 6)) {
        const parts: string[] = [];
        if (s.maxWeight != null) parts.push(`最大${s.maxWeight}kg`);
        if (s.typicalReps != null) parts.push(`通常${s.typicalReps}回`);
        const stat = parts.length ? ` / ${parts.join(" × ")}` : "";
        lines.push(`- ${s.name}: ${s.timesPerformed}回${stat}`);
      }
    }
  }

  // 成長トレンド（trend / pattern）
  if (kind === "trend" || kind === "pattern") {
    lines.push("");
    if (!trend.hasEnoughData) {
      lines.push("### 成長トレンド: 比較に足る記録がまだ不足（初期と最近を比べられない）");
    } else {
      lines.push("### 成長トレンド（初期 vs 最近の比較・確定値）");
      if (trend.improved.length > 0) {
        for (const e of trend.improved.slice(0, 5)) {
          const w =
            e.earlyMaxWeight != null && e.recentMaxWeight != null
              ? `最大重量 ${e.earlyMaxWeight}kg→${e.recentMaxWeight}kg`
              : "";
          const r =
            e.earlyTypicalReps != null && e.recentTypicalReps != null
              ? `回数 ${e.earlyTypicalReps}→${e.recentTypicalReps}`
              : "";
          const detail = [w, r].filter(Boolean).join(" / ");
          lines.push(`- 伸びている: ${e.name}${detail ? `（${detail}）` : ""}`);
        }
      } else {
        lines.push("- 明確に伸びている種目: 該当なし");
      }
      if (trend.stagnant.length > 0) {
        const names = trend.stagnant.slice(0, 5).map((e) => e.name).join("・");
        lines.push(`- 伸び悩み（複数回やっているが変化が小さい）: ${names}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * 分析を実行して、ユーザー向けの言語化テキストを返す。
 * 集計はコード、言語化のみ AI。記録が無い/不足の場合は null を返す（呼び出し側で分岐）。
 *
 * @param milestoneCount マイルストーン経路のときは到達回数を渡す（通常分析では null）
 */
export async function buildAnalysis(
  userId: string,
  kind: AnalysisKind,
  milestoneCount: number | null = null,
): Promise<string | null> {
  // 集計（trend が要る種別のときだけ成長トレンドも計算）
  const needTrend = kind === "trend" || kind === "pattern";
  const limit = milestoneCount ?? 30;
  const [summary, trend, profile] = await Promise.all([
    buildWorkoutHistorySummary(userId, limit),
    needTrend
      ? buildGrowthTrend(userId, limit)
      : Promise.resolve<GrowthTrend>({
          hasEnoughData: false,
          comparedExercises: [],
          improved: [],
          stagnant: [],
        }),
    getProfileLite(userId),
  ]);

  if (!summary.hasRecords) return null;

  const analysisData = buildAnalysisData(kind, summary, trend, profile, milestoneCount);

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
