// デモモード用の API モック。本番 API（functions/src/index.ts）と同じ形のレスポンスを返す。
// データはメモリ上にだけ持ち、リロードすると初期状態に戻る。

import type { AnalysisSummary, ProfileData } from '../api'

interface SetGroup {
  weight: number | null
  reps: number | null
  sets: number | null
}

interface Workout {
  date: Date
  exercises: { name: string; setGroups: SetGroup[] }[]
}

const DAY = 24 * 60 * 60 * 1000

// 本番の /api/dashboard と同じ部位マッピング
const BODY_PART_MAP: Record<string, string> = {
  'ベンチプレス': '胸', 'ダンベルフライ': '胸', 'インクラインベンチ': '胸', 'チェストプレス': '胸', '腕立て伏せ': '胸',
  'スクワット': '脚', 'レッグプレス': '脚', 'レッグカール': '脚', 'レッグエクステンション': '脚', 'ランジ': '脚', 'カーフレイズ': '脚',
  'デッドリフト': '背中', 'ラットプルダウン': '背中', '懸垂': '背中', 'ベントオーバーロウ': '背中', 'シーテッドロウ': '背中',
  'ショルダープレス': '肩', 'サイドレイズ': '肩', 'フロントレイズ': '肩', 'リアレイズ': '肩',
  'アームカール': '腕', 'バイセップスカール': '腕', 'トライセップス': '腕', 'ハンマーカール': '腕',
  'クランチ': '腹', 'プランク': '腹', 'レッグレイズ': '腹', 'アブローラー': '腹', '腹筋': '腹',
}

// 約8週間・18回分のサンプル記録。胸肩 / 脚 / 背中腕 の3分割をローテーションし、
// ベンチ・スクワット・ラットプルは伸び、ショルダープレスは横ばい（伸び悩み）になるようにしている。
function seedWorkouts(): Workout[] {
  const daysAgo = [54, 51, 48, 45, 41, 38, 34, 31, 27, 24, 20, 17, 13, 10, 8, 5, 3, 1]
  const n = daysAgo.length
  const step = (from: number, to: number, t: number) => Math.round((from + (to - from) * t) / 2.5) * 2.5
  return daysAgo.map((ago, i) => {
    const t = i / (n - 1)
    const date = new Date(Date.now() - ago * DAY)
    const kind = i % 3
    const exercises =
      kind === 0
        ? [
            { name: 'ベンチプレス', setGroups: [{ weight: step(45, 65, t), reps: 10, sets: 3 }] },
            { name: 'ショルダープレス', setGroups: [{ weight: 20, reps: 10, sets: 3 }] },
            { name: 'サイドレイズ', setGroups: [{ weight: 6, reps: 15, sets: 3 }] },
          ]
        : kind === 1
        ? [
            { name: 'スクワット', setGroups: [{ weight: step(60, 80, t), reps: 8, sets: 3 }] },
            { name: 'レッグプレス', setGroups: [{ weight: step(100, 130, t), reps: 12, sets: 3 }] },
            { name: 'プランク', setGroups: [{ weight: null, reps: 60, sets: 2 }] },
          ]
        : [
            { name: 'ラットプルダウン', setGroups: [{ weight: step(40, 50, t), reps: 10, sets: 3 }] },
            { name: 'デッドリフト', setGroups: [{ weight: step(70, 90, t), reps: 5, sets: 3 }] },
            { name: 'アームカール', setGroups: [{ weight: 10, reps: 12, sets: 3 }] },
          ]
    return { date, exercises }
  })
}

const state = {
  workouts: seedWorkouts(),
  profile: {
    profile: {
      goal: 'hypertrophy',
      level: 'beginner',
      equipment: ['gym'],
      frequency: 3,
      birthYearRange: '30s',
      sex: 'male',
      heightCm: 172,
      weightKg: 68,
      targetMuscleGroups: ['chest', 'legs'],
      activityLevel: 'light',
      bodyFatPercent: null,
      targetWeightKg: null,
      targetBodyFatPercent: null,
      setupCompleted: true,
    },
    legal: { currentTermsVersion: 'demo', acceptedTermsVersion: 'demo' },
    settings: {
      notificationEnabled: true,
      notificationTime: '20:00',
      notificationDays: [1, 3, 5],
      autoSendAnalysisEnabled: false,
      autoSendAnalysisMessage: '今日の記録を分析して',
    },
  } as ProfileData,
}

function totalVolume(groups: SetGroup[]): number {
  return groups.reduce((sum, g) => sum + (g.weight ?? 0) * (g.reps ?? 0) * (g.sets ?? 1), 0)
}

function toJst(d: Date): Date {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000)
}

function byDateDesc(): Workout[] {
  return [...state.workouts].sort((a, b) => b.date.getTime() - a.date.getTime())
}

function dashboard(period: string) {
  const daysBack = period === '1w' ? 7 : period === '3m' ? 90 : 30
  const since = Date.now() - daysBack * DAY
  const workouts = byDateDesc().filter((w) => w.date.getTime() >= since)
  const weeklyCount = workouts.filter((w) => w.date.getTime() >= Date.now() - 7 * DAY).length

  const bodyPartFrequency: Record<string, number> = { '胸': 0, '背中': 0, '肩': 0, '腕': 0, '脚': 0, '腹': 0 }
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const part = BODY_PART_MAP[ex.name]
      if (part && bodyPartFrequency[part] !== undefined) bodyPartFrequency[part]++
    }
  }

  const volumes: Record<string, Map<string, number>> = {}
  for (const w of [...workouts].reverse()) {
    const jst = toJst(w.date)
    const label = `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`
    for (const ex of w.exercises) {
      const vol = totalVolume(ex.setGroups)
      if (vol <= 0) continue
      if (!volumes[ex.name]) volumes[ex.name] = new Map()
      volumes[ex.name].set(label, (volumes[ex.name].get(label) ?? 0) + vol)
    }
  }
  const top = Object.entries(volumes).sort((a, b) => b[1].size - a[1].size).slice(0, 4)
  const labels = Array.from(new Set(top.flatMap(([, m]) => Array.from(m.keys())))).sort((a, b) => {
    const [am, ad] = a.split('/').map(Number)
    const [bm, bd] = b.split('/').map(Number)
    return am !== bm ? am - bm : ad - bd
  })
  const datasets = top.map(([name, m]) => ({ label: name, data: labels.map((l) => m.get(l) ?? null) }))

  const recentWorkouts = workouts.slice(0, 10).map((w) => {
    const jst = toJst(w.date)
    return {
      date: `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`,
      exercises: w.exercises.map((e) => ({ name: e.name, setGroups: e.setGroups, totalVolume: totalVolume(e.setGroups) })),
    }
  })

  return { weeklyCount, bodyPartFrequency, progressData: { labels, datasets }, recentWorkouts }
}

function workoutsByMonth(month: string) {
  return byDateDesc()
    .filter((w) => {
      const jst = toJst(w.date)
      return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}` === month
    })
    .map((w, i) => ({
      id: `demo-${i}`,
      date: w.date.toISOString(),
      exercises: w.exercises.map((e) => ({
        name: e.name,
        bodyPart: '',
        sets: e.setGroups.flatMap((g) =>
          Array.from({ length: g.sets ?? 1 }, () => ({ weight: g.weight ?? 0, reps: g.reps ?? 0 })),
        ),
      })),
    }))
}

// 本番の buildAnalysisHighlights を簡略化した集計（判定はコード、という設計をデモでも再現する）
export function demoAnalysisSummary(): AnalysisSummary {
  const sorted = [...state.workouts].sort((a, b) => a.date.getTime() - b.date.getTime())
  if (sorted.length === 0) return { hasRecords: false }

  const history: Record<string, number[]> = {}
  for (const w of sorted) {
    for (const ex of w.exercises) {
      const max = Math.max(0, ...ex.setGroups.map((g) => g.weight ?? 0))
      if (max <= 0) continue
      ;(history[ex.name] ??= []).push(max)
    }
  }

  const improved: AnalysisSummary['improved'] = []
  const stagnant: string[] = []
  for (const [name, maxes] of Object.entries(history)) {
    if (maxes.length < 4) continue
    const early = Math.max(...maxes.slice(0, 2))
    const recent = Math.max(...maxes.slice(-2))
    if (recent > early) {
      improved.push({ name, earlyMaxWeight: early, recentMaxWeight: recent, earlyTypicalReps: null, recentTypicalReps: null })
    } else {
      stagnant.push(name)
    }
  }
  // 伸び率の大きい順（重量の絶対差だと高重量種目ばかり上位に来るため）
  improved.sort((a, b) => b.recentMaxWeight! / b.earlyMaxWeight! - a.recentMaxWeight! / a.earlyMaxWeight!)

  const counts: Record<string, number> = {}
  for (const w of sorted) for (const ex of w.exercises) counts[ex.name] = (counts[ex.name] ?? 0) + 1
  const consistent = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name)

  const lead = improved[0]?.name ?? consistent[0]
  return {
    hasRecords: true,
    weekSessions: sorted.filter((w) => w.date.getTime() >= Date.now() - 7 * DAY).length,
    totalRecords: sorted.length,
    improved: improved.slice(0, 3),
    consistent,
    stagnant: stagnant.slice(0, 2),
    trendJudgeable: true,
    nextStep: `${lead}は今のフォームを保てる範囲で、少しずつ重量を上げていきましょう。`,
    untouchedUnlocked: false,
    untouched: [],
  }
}

function saveWorkout(body: { exercises?: { name: string; setGroups?: SetGroup[] }[]; date?: string }) {
  const date = body.date ? new Date(`${body.date}T12:00:00+09:00`) : new Date()
  state.workouts.push({
    date,
    exercises: (body.exercises ?? []).map((e) => ({
      name: e.name,
      setGroups: (e.setGroups ?? []).map((g) => ({ weight: g.weight ?? null, reps: g.reps ?? null, sets: g.sets ?? null })),
    })),
  })
}

export async function handleDemoRequest(path: string, options?: RequestInit): Promise<unknown> {
  // 体感を本番に近づけるための軽い待ち
  await new Promise((r) => setTimeout(r, 200))

  const url = new URL(path, 'https://demo.local')
  const method = options?.method ?? 'GET'
  const body = options?.body ? JSON.parse(String(options.body)) : {}

  switch (`${method} ${url.pathname}`) {
    case 'GET /api/dashboard':
      return dashboard(url.searchParams.get('period') ?? '1m')
    case 'GET /api/profile':
      return state.profile
    case 'PUT /api/profile': {
      const rest = { ...body }
      delete rest.userId
      delete rest.acceptTerms
      state.profile = { ...state.profile, profile: { ...state.profile.profile, ...rest } }
      return { success: true }
    }
    case 'PUT /api/settings': {
      const rest = { ...body }
      delete rest.userId
      state.profile = { ...state.profile, settings: { ...state.profile.settings, ...rest } }
      return { success: true }
    }
    case 'GET /api/subscription':
      return { plan: 'free' }
    case 'POST /api/stripe/checkout':
    case 'POST /api/stripe/portal':
      return { url: 'demo:checkout' }
    case 'GET /api/workouts/exercises/recent': {
      const exclude = new Set((url.searchParams.get('exclude') ?? '').split(',').filter(Boolean))
      const limit = Number(url.searchParams.get('limit') ?? 6)
      const names = Array.from(new Set(byDateDesc().flatMap((w) => w.exercises.map((e) => e.name))))
      return { names: names.filter((n) => !exclude.has(n)).slice(0, limit) }
    }
    case 'GET /api/workouts':
      return workoutsByMonth(url.searchParams.get('month') ?? '')
    case 'POST /api/workouts':
      saveWorkout(body)
      return { success: true }
    case 'GET /api/milestones': {
      const totalCount = state.workouts.length
      return {
        totalCount,
        milestones: [
          { count: 5, name: 'はじめての振り返り' },
          { count: 15, name: '成長トレンド分析' },
          { count: 30, name: 'トレーニング全体の傾向' },
        ].map((m) => ({ ...m, achieved: totalCount >= m.count })),
      }
    }
    case 'GET /api/analysis-summary':
      return demoAnalysisSummary()
    case 'GET /api/usage':
      return { remaining: null }
    default:
      throw new Error(`Demo API: unsupported ${method} ${url.pathname}`)
  }
}
