import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { initLiff, getLiffUser, type LiffUser } from './liff'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import Loading from './components/Loading'
import Dashboard from './pages/Dashboard'
import Subscribe from './pages/Subscribe'
import Profile from './pages/Profile'
import WorkoutLog from './pages/WorkoutLog'
import WorkoutInput from './pages/WorkoutInput'
import Onboarding from './pages/Onboarding'
import { TourProvider, useTour, hasSeenTour } from './tour/TourContext'
import TourOverlay from './tour/TourOverlay'

function TourBootstrap({ userId }: { userId: string }) {
  const { active, start } = useTour()
  const location = useLocation()

  useEffect(() => {
    if (active) return
    if (hasSeenTour()) return
    const isOnboarded = localStorage.getItem(`onboarded_${userId}`) === 'true'
    // オンボーディング済み かつ ダッシュボードに初到達したタイミングで開始
    if (isOnboarded && location.pathname === '/dashboard') {
      const t = setTimeout(() => start(), 600)
      return () => clearTimeout(t)
    }
  }, [active, userId, location.pathname, start])

  return null
}

export default function App() {
  const [user, setUser] = useState<LiffUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initLiff()
      .then(() => getLiffUser())
      .then(setUser)
      .catch((err) => {
        console.error('LIFF init error:', err)
        const msg = err instanceof Error ? err.message : String(err)
        setError(`エラー詳細: ${msg}`)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading message="初期化中..." />

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>
        <p>{error}</p>
        <p style={{ fontSize: 12, marginTop: 8, color: '#999' }}>
          LIFF ID: {import.meta.env.VITE_LIFF_ID || '未設定'}
        </p>
      </div>
    )
  }

  if (!user) return <Loading message="ユーザー情報を取得中..." />

  const isOnboarded = localStorage.getItem(`onboarded_${user.userId}`) === 'true'

  return (
    <BrowserRouter>
      <TourProvider>
        <Header />
        <TourBootstrap userId={user.userId} />
        <Routes>
          <Route path="/onboarding" element={<Onboarding userId={user.userId} />} />
          <Route path="/dashboard" element={<Dashboard userId={user.userId} />} />
          <Route path="/subscribe" element={<Subscribe userId={user.userId} />} />
          <Route path="/profile" element={<Profile userId={user.userId} />} />
          <Route path="/workout-input" element={<WorkoutInput userId={user.userId} />} />
          <Route path="/workout-log" element={<WorkoutLog userId={user.userId} />} />
          <Route path="*" element={<Navigate to={isOnboarded ? '/dashboard' : '/onboarding'} replace />} />
        </Routes>
        <BottomNav />
        <TourOverlay />
      </TourProvider>
    </BrowserRouter>
  )
}
