/**
 * ユーザープロフィールから派生メトリクス（BMR / TDEE / タンパク質目標）を算出する。
 * 算出に必要なフィールドが欠けている場合は undefined を返す。
 */

import type { UserProfile } from "./manager";

const ACTIVITY_FACTOR: Record<string, number> = {
  sedentary: 1.2,
  light: 1.4,
  moderate: 1.6,
  active: 1.8,
};

// 年代から代表年齢を返す（BMR計算用、あくまで概算）
function midAge(birthYearRange?: string): number | null {
  switch (birthYearRange) {
    case "20s": return 25;
    case "30s": return 35;
    case "40s": return 45;
    case "50s": return 55;
    case "60plus": return 65;
    default: return null;
  }
}

// Mifflin-St Jeor 式
function calcBMR(sex: string, weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  if (sex === "female") return base - 161;
  if (sex === "male") return base + 5;
  // 不明: 男女中間で概算
  return base - 78;
}

// 目標別の体重あたりタンパク質g/kg
function proteinPerKg(goal?: string): number {
  switch (goal) {
    case "hypertrophy": return 2.0; // 筋肥大
    case "strength": return 2.0;    // 筋力アップ
    case "diet": return 2.2;        // ダイエット中は維持のために多め
    case "health": return 1.4;      // 健康維持
    default: return 1.6;
  }
}

export interface DerivedMetrics {
  ageYears?: number;
  bmrKcal?: number;
  tdeeKcal?: number;
  proteinTargetG?: number;
  bmi?: number;
}

export function deriveMetrics(profile: UserProfile): DerivedMetrics {
  const m: DerivedMetrics = {};
  const age = midAge(profile.birthYearRange);
  if (age !== null) m.ageYears = age;

  if (profile.heightCm && profile.weightKg) {
    const heightM = profile.heightCm / 100;
    m.bmi = Math.round((profile.weightKg / (heightM * heightM)) * 10) / 10;
  }

  if (age !== null && profile.heightCm && profile.weightKg && profile.sex) {
    const bmr = calcBMR(profile.sex, profile.weightKg, profile.heightCm, age);
    m.bmrKcal = Math.round(bmr);
    if (profile.activityLevel && ACTIVITY_FACTOR[profile.activityLevel]) {
      m.tdeeKcal = Math.round(bmr * ACTIVITY_FACTOR[profile.activityLevel]);
    }
  }

  if (profile.weightKg) {
    m.proteinTargetG = Math.round(profile.weightKg * proteinPerKg(profile.goal));
  }

  return m;
}

// AIシステムプロンプトに差し込むユーザー情報セクションを文字列化する
export function buildUserContextBlock(profile: UserProfile): string {
  const lines: string[] = [];
  if (profile.birthYearRange) lines.push(`年代: ${jpYearRange(profile.birthYearRange)}`);
  if (profile.sex) lines.push(`性別: ${jpSex(profile.sex)}`);
  if (profile.heightCm) lines.push(`身長: ${profile.heightCm}cm`);
  if (profile.weightKg) lines.push(`体重: ${profile.weightKg}kg`);
  if (profile.bodyFatPercent !== undefined && profile.bodyFatPercent !== null) {
    lines.push(`体脂肪率: ${profile.bodyFatPercent}%`);
  }
  if (profile.goal) lines.push(`目標: ${jpGoal(profile.goal)}`);
  if (profile.level) lines.push(`レベル: ${jpLevel(profile.level)}`);
  if (Array.isArray(profile.targetMuscleGroups) && profile.targetMuscleGroups.length > 0) {
    lines.push(`重点部位: ${profile.targetMuscleGroups.map(jpMuscle).join("・")}`);
  }
  if (profile.frequency) lines.push(`頻度: 週${profile.frequency}回`);
  if (profile.activityLevel) lines.push(`活動レベル: ${jpActivity(profile.activityLevel)}`);
  if (profile.targetWeightKg) lines.push(`目標体重: ${profile.targetWeightKg}kg`);
  if (profile.targetBodyFatPercent) lines.push(`目標体脂肪率: ${profile.targetBodyFatPercent}%`);

  const m = deriveMetrics(profile);
  const calc: string[] = [];
  if (m.bmi) calc.push(`BMI ${m.bmi}`);
  if (m.bmrKcal) calc.push(`BMR ${m.bmrKcal}kcal`);
  if (m.tdeeKcal) calc.push(`推定TDEE ${m.tdeeKcal}kcal`);
  if (m.proteinTargetG) calc.push(`推奨タンパク質 ${m.proteinTargetG}g/日`);
  if (calc.length > 0) lines.push(`参考値: ${calc.join(" / ")}`);

  if (lines.length === 0) return "";
  return `## ユーザー情報\n${lines.join("\n")}\n`;
}

function jpYearRange(v: string): string {
  return ({ "20s": "20代", "30s": "30代", "40s": "40代", "50s": "50代", "60plus": "60代以上" } as Record<string, string>)[v] || v;
}
function jpSex(v: string): string {
  return ({ male: "男性", female: "女性", other: "回答なし" } as Record<string, string>)[v] || v;
}
function jpGoal(v: string): string {
  return ({ hypertrophy: "筋肥大", diet: "ダイエット", strength: "筋力アップ", health: "健康維持" } as Record<string, string>)[v] || v;
}
function jpLevel(v: string): string {
  return ({ beginner: "初心者", intermediate: "中級者", advanced: "上級者" } as Record<string, string>)[v] || v;
}
function jpMuscle(v: string): string {
  return ({ chest: "胸", back: "背中", legs: "脚", shoulders: "肩", arms: "腕", core: "腹", all: "全身" } as Record<string, string>)[v] || v;
}
function jpActivity(v: string): string {
  return ({ sedentary: "座り中心", light: "軽労働", moderate: "活発", active: "かなり活動的" } as Record<string, string>)[v] || v;
}
