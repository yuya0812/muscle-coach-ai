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
    trainerName?: string
  }
  settings: {
    notificationEnabled: boolean
    notificationTime: string
  }
}

export async function getProfile(userId: string): Promise<ProfileData> {
  return request(`/api/profile?userId=${userId}`)
}

// プロフィール更新
export async function updateProfile(
  userId: string,
  profile: {
    goal: string
    level: string
    equipment: string[]
    frequency: number
    trainerName?: string
  },
): Promise<void> {
  await request('/api/profile', {
    method: 'PUT',
    body: JSON.stringify({ userId, ...profile }),
  })
}

// ダッシュボードデータ取得
export interface DashboardData {
  weeklyCount: number
  bodyPartFrequency: Record<string, number>
  progressData: {
    labels: string[]
    datasets: { label: string; data: number[] }[]
  }
  recentWorkouts: {
    date: string
    exercises: { name: string; sets: number; reps: number; weight: number }[]
  }[]
}

export async function getDashboardData(
  userId: string,
  period: '1w' | '1m' | '3m',
): Promise<DashboardData> {
  return request(`/api/dashboard?userId=${userId}&period=${period}`)
}

// トレーニング記録取得
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

// 通知設定更新
export async function updateNotificationSettings(
  userId: string,
  settings: { notificationEnabled: boolean; notificationTime: string },
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

// ワークアウト記録保存
export async function saveWorkout(
  userId: string,
  exercises: { name: string; weight?: number; reps?: number; sets?: number }[],
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
