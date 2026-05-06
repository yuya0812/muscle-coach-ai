import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { TOUR_STEPS } from './steps'

const TOUR_FLAG = 'tour_seen_v1'

interface TourContextValue {
  active: boolean
  stepIndex: number
  totalSteps: number
  currentStep: typeof TOUR_STEPS[number] | null
  start: () => void
  next: () => void
  skipScreen: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within TourProvider')
  return ctx
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()
  const lastNavigatedPath = useRef<string | null>(null)

  const currentStep = active ? TOUR_STEPS[stepIndex] ?? null : null

  // ステップが変わるたび、必要なら画面遷移する
  useEffect(() => {
    if (!active || !currentStep) return
    if (location.pathname !== currentStep.path && lastNavigatedPath.current !== currentStep.path) {
      lastNavigatedPath.current = currentStep.path
      navigate(currentStep.path)
    }
  }, [active, currentStep, location.pathname, navigate])

  const end = () => {
    setActive(false)
    setStepIndex(0)
    lastNavigatedPath.current = null
    try { localStorage.setItem(TOUR_FLAG, 'true') } catch { /* ignore */ }
  }

  const next = () => {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      end()
      return
    }
    setStepIndex((i) => i + 1)
  }

  const skipScreen = () => {
    const currentPath = TOUR_STEPS[stepIndex]?.path
    const nextScreen = TOUR_STEPS.findIndex((s, i) => i > stepIndex && s.path !== currentPath)
    if (nextScreen === -1) {
      end()
      return
    }
    setStepIndex(nextScreen)
  }

  const start = () => {
    setStepIndex(0)
    lastNavigatedPath.current = null
    setActive(true)
  }

  return (
    <TourContext.Provider
      value={{
        active,
        stepIndex,
        totalSteps: TOUR_STEPS.length,
        currentStep,
        start,
        next,
        skipScreen,
      }}
    >
      {children}
    </TourContext.Provider>
  )
}

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_FLAG) === 'true'
  } catch {
    return false
  }
}
