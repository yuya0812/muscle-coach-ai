import liff from '@line/liff'

const API_URL = import.meta.env.VITE_API_URL as string

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  const accessToken = liff.getAccessToken()
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  return headers
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: getAuthHeaders(),
    ...options,
  })
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// Stripe Checkout Session を作成
export async function createCheckoutSession(userId: string): Promise<{ url: string }> {
  return request('/api/stripe/checkout', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

// Stripe Customer Portal URL を取得
export async function getCustomerPortalUrl(userId: string): Promise<{ url: string }> {
  return request('/api/stripe/portal', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

// プロフィール取得（Firestore直アクセスを廃止し、サーバ経由に統一）
export interface ProfileData {
  profile: {
    goal: string
    level: string
    equipment: string | string[]
    frequency: number
    // セットアップヒアリング項目
    birthYearRange?: string
    sex?: string
    heightCm?: number
    weightKg?: number
    targetMuscleGroups?: string[]
    activityLevel?: string
    bodyFatPercent?: number | null
    targetWeightKg?: number | null
    targetBodyFatPercent?: number | null
    setupCompleted?: boolean
  }
  legal?: {
    currentTermsVersion: string
    acceptedTermsVersion: string | null
  }
  settings: {
    notificationEnabled: boolean
    notificationTime: string
    notificationDays?: number[]
    autoSendAnalysisEnabled?: boolean
    autoSendAnalysisMessage?: string
  }
}

export async function getProfile(userId: string): Promise<ProfileData> {
  return request(`/api/profile?userId=${userId}`)
}

// プロフィール更新（セットアップ追加項目もこのエンドポイントで送れる）
// trainerName/trainerType は方針転換（2026-06）でトレーナーキャラを廃止したため
// 送受信しない。Firestore のフィールド自体は既存ユーザーの doc 保護のため残置。
export interface ProfileUpdateInput {
  goal?: string
  level?: string
  equipment?: string[]
  frequency?: number
  birthYearRange?: string
  sex?: string
  heightCm?: number | null
  weightKg?: number | null
  targetMuscleGroups?: string[]
  activityLevel?: string
  bodyFatPercent?: number | null
  targetWeightKg?: number | null
  targetBodyFatPercent?: number | null
  setupCompleted?: boolean
  acceptTerms?: boolean
}

export async function updateProfile(userId: string, profile: ProfileUpdateInput): Promise<void> {
  await request('/api/profile', {
    method: 'PUT',
    body: JSON.stringify({ userId, ...profile }),
  })
}

// ダッシュボードデータ取得
export interface ExerciseSetGroup {
  weight: number | null
  reps: number | null
  sets: number | null
}

export interface DashboardData {
  weeklyCount: number
  bodyPartFrequency: Record<string, number>
  progressData: {
    labels: string[]
    // 0kg等の未記録ポイントは null（線をスキップしてグラフ描写）
    datasets: { label: string; data: (number | null)[] }[]
  }
  recentWorkouts: {
    date: string
    exercises: {
      name: string
      setGroups: ExerciseSetGroup[]
      totalVolume: number
    }[]
  }[]
}

export async function getDashboardData(
  userId: string,
  period: '1w' | '1m' | '3m',
): Promise<DashboardData> {
  return request(`/api/dashboard?userId=${userId}&period=${period}`)
}

// トレーニング記録取得（履歴表示用）
export interface WorkoutRecord {
  id: string
  date: string
  exercises: {
    name: string
    bodyPart: string
    sets: { weight: number; reps: number }[]
  }[]
  note?: string
}

export async function getWorkoutLogs(
  userId: string,
  month: string,
): Promise<WorkoutRecord[]> {
  return request(`/api/workouts?userId=${userId}&month=${month}`)
}

// 通知設定更新（曜日・自動送信設定も含む）
export async function updateNotificationSettings(
  userId: string,
  settings: {
    notificationEnabled: boolean
    notificationTime: string
    notificationDays?: number[]
    autoSendAnalysisEnabled?: boolean
    autoSendAnalysisMessage?: string
  },
): Promise<void> {
  await request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ userId, ...settings }),
  })
}

// サブスクリプション状態取得
export interface SubscriptionStatus {
  plan: 'free' | 'premium'
  expiresAt?: string
  cancelAt?: string
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  return request(`/api/subscription?userId=${userId}`)
}

// ワークアウト記録保存（新形式: 1種目に複数セットグループ）
export interface SaveExerciseInput {
  name: string
  setGroups: { weight?: number | null; reps?: number | null; sets?: number | null }[]
}

export async function saveWorkout(
  userId: string,
  exercises: SaveExerciseInput[],
  date?: string
): Promise<void> {
  await request('/api/workouts', {
    method: 'POST',
    body: JSON.stringify({ userId, exercises, date }),
  })
}

// 利用回数ステータス取得
export async function getUsageStatus(userId: string): Promise<{ remaining: number | null }> {
  return request(`/api/usage?userId=${userId}`)
}

// マイルストーン進捗取得
export interface MilestoneStatus {
  totalCount: number
  milestones: {
    count: number
    name: string
    emoji: string
    achieved: boolean
  }[]
}

export async function getMilestones(userId: string): Promise<MilestoneStatus> {
  return request(`/api/milestones?userId=${userId}`)
}

// 分析サマリー（ダッシュボード表示用・AI不使用の事実ベース）
export interface AnalysisImprovedItem {
  name: string
  earlyMaxWeight: number | null
  recentMaxWeight: number | null
  earlyTypicalReps: number | null
  recentTypicalReps: number | null
}

export interface AnalysisSummary {
  hasRecords: boolean
  weekSessions?: number | null
  totalRecords?: number
  improved?: AnalysisImprovedItem[]
  consistent?: string[]
  stagnant?: string[]
  trendJudgeable?: boolean
  nextStep?: string
  // 「最近やっていない種目」は累計30回で解放。解放後もデフォルトは非表示で、
  // ユーザーがトグルでONにしたときだけ表示する（責めない方針）。
  untouchedUnlocked?: boolean
  untouched?: string[]
}

export async function getAnalysisSummary(userId: string): Promise<AnalysisSummary> {
  return request(`/api/analysis-summary?userId=${userId}`)
}

// ユーザーが過去に手入力した種目名を取得（クイック選択候補）
export async function getRecentCustomExercises(
  userId: string,
  exclude: string[] = [],
  limit = 6,
): Promise<{ names: string[] }> {
  const params = new URLSearchParams({
    userId,
    limit: String(limit),
  })
  if (exclude.length > 0) params.set('exclude', exclude.join(','))
  return request(`/api/workouts/exercises/recent?${params.toString()}`)
}
