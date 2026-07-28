import { useEffect, useRef, useState, useCallback } from 'react'
import styled from 'styled-components'
import { theme } from '../theme'

// セット間インターバルのプリセット（秒）。よく使う休憩時間を並べる。
const PRESETS = [30, 60, 90, 120, 180]

type Mode = 'timer' | 'stopwatch'

const Page = styled.div`
  padding: ${theme.spacing.md};
  padding-bottom: ${theme.layout.bottomNavSpace};
  animation: fadeUp 0.22s ease both;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
`

const Title = styled.h2`
  font-size: ${theme.fontSize.xl};
  font-weight: ${theme.fontWeight.extrabold};
  letter-spacing: -0.02em;
  color: ${theme.colors.text};
  margin: 0 0 4px;
`

const Sub = styled.p`
  font-size: ${theme.fontSize.sm};
  color: ${theme.colors.textMuted};
  margin: 0 0 ${theme.spacing.lg};
  line-height: 1.6;
`

const ModeSwitch = styled.div`
  display: flex;
  gap: 6px;
  background: ${theme.colors.surface2};
  border-radius: ${theme.borderRadius.md};
  padding: 4px;
  margin-bottom: ${theme.spacing.lg};
`

const ModeButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: ${theme.borderRadius.sm};
  background: ${({ $active }) => ($active ? theme.colors.primary : 'transparent')};
  color: ${({ $active }) => ($active ? '#fff' : theme.colors.textMuted)};
  font-size: ${theme.fontSize.sm};
  font-weight: ${theme.fontWeight.bold};
  cursor: pointer;
`

const Display = styled.div<{ $alert?: boolean }>`
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 68px;
  font-weight: ${theme.fontWeight.extrabold};
  letter-spacing: -0.03em;
  color: ${({ $alert }) => ($alert ? theme.colors.danger : theme.colors.text)};
  margin: ${theme.spacing.xl} 0;
  line-height: 1;
`

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: ${theme.spacing.lg};
`

const PresetButton = styled.button<{ $active: boolean }>`
  padding: 12px 4px;
  border: 1.5px solid ${({ $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: ${theme.borderRadius.sm};
  background: ${({ $active }) => ($active ? theme.colors.primaryDim : 'transparent')};
  color: ${({ $active }) => ($active ? theme.colors.primary : theme.colors.textMuted)};
  font-size: ${theme.fontSize.sm};
  font-weight: ${theme.fontWeight.bold};
  cursor: pointer;
`

const Controls = styled.div`
  display: flex;
  gap: 10px;
  margin-top: auto;
`

const ControlButton = styled.button<{ $variant: 'primary' | 'ghost' }>`
  flex: 1;
  padding: 16px;
  border: ${({ $variant }) => ($variant === 'ghost' ? `1px solid ${theme.colors.border}` : 'none')};
  border-radius: ${theme.borderRadius.md};
  background: ${({ $variant }) => ($variant === 'primary' ? theme.colors.primary : 'transparent')};
  color: ${({ $variant }) => ($variant === 'primary' ? '#fff' : theme.colors.text)};
  font-size: ${theme.fontSize.md};
  font-weight: ${theme.fontWeight.bold};
  cursor: pointer;
  &:active { opacity: 0.85; }
`

const Note = styled.p`
  font-size: ${theme.fontSize.xs};
  color: ${theme.colors.textMuted};
  text-align: center;
  margin: ${theme.spacing.md} 0 0;
  line-height: 1.6;
`

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtStopwatch(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  const centi = Math.floor((ms % 1000) / 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(centi).padStart(2, '0')}`
}

// Web Audio でビープ音を合成する（音声ファイル不要）。ユーザー操作起点で生成/resume するので
// iOS Safari / LINE内ブラウザの autoplay 制約下でも、開始ボタン経由なら鳴らせる。
function useBeep() {
  const ctxRef = useRef<AudioContext | null>(null)

  // 開始ボタン押下時に呼ぶ。AudioContext を用意し、suspended なら resume する。
  const unlock = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) ctxRef.current = new Ctor()
    }
    if (ctxRef.current?.state === 'suspended') void ctxRef.current.resume()
  }, [])

  const beep = useCallback((times = 3) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const now = ctx.currentTime
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      const start = now + i * 0.35
      // クリックノイズを避けるため gain を短くフェードイン/アウトする
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.26)
    }
  }, [])

  return { unlock, beep }
}

// インターバル中は画面を消させない（消えると音が鳴らないため）。Wake Lock 非対応環境では黙って無視。
function useWakeLock(activeState: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    let released = false
    const request = async () => {
      try {
        if (activeState && 'wakeLock' in navigator) {
          lockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch {
        // ユーザー操作外・非対応などで失敗しても致命ではない
      }
    }
    const release = () => {
      if (lockRef.current && !released) {
        released = true
        void lockRef.current.release().catch(() => {})
        lockRef.current = null
      }
    }
    if (activeState) void request()
    else release()

    // 画面復帰時に再取得（バックグラウンドから戻ると lock は失われるため）
    const onVisible = () => {
      if (document.visibilityState === 'visible' && activeState) void request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      release()
    }
  }, [activeState])
}

export default function Timer() {
  const [mode, setMode] = useState<Mode>('timer')
  const { unlock, beep } = useBeep()

  // === インターバルタイマー ===
  const [duration, setDuration] = useState(90) // 選択中のプリセット秒数
  const [remaining, setRemaining] = useState(90) // 残り秒（表示用）
  const [timerRunning, setTimerRunning] = useState(false)
  // ドリフト防止のため終了時刻(ms)を保持し、Date.now() との差分で残りを算出する
  const endAtRef = useRef<number | null>(null)
  const firedRef = useRef(false) // 二重発火防止

  // === ストップウォッチ ===
  const [swRunning, setSwRunning] = useState(false)
  const [swElapsed, setSwElapsed] = useState(0) // ms
  const swStartRef = useRef<number | null>(null) // 計測開始時刻 - これまでの累積を引いた基準

  useWakeLock(timerRunning || swRunning)

  // タイマー駆動（100msごとに残りを再計算。0到達でビープ）
  useEffect(() => {
    if (!timerRunning) return
    const id = setInterval(() => {
      const end = endAtRef.current
      if (end == null) return
      const rem = (end - Date.now()) / 1000
      if (rem <= 0) {
        setRemaining(0)
        setTimerRunning(false)
        endAtRef.current = null
        if (!firedRef.current) {
          firedRef.current = true
          beep(3)
          if ('vibrate' in navigator) navigator.vibrate?.([200, 100, 200])
        }
      } else {
        setRemaining(rem)
      }
    }, 100)
    return () => clearInterval(id)
  }, [timerRunning, beep])

  // ストップウォッチ駆動
  useEffect(() => {
    if (!swRunning) return
    const id = setInterval(() => {
      if (swStartRef.current != null) setSwElapsed(Date.now() - swStartRef.current)
    }, 33)
    return () => clearInterval(id)
  }, [swRunning])

  const selectPreset = (sec: number) => {
    setDuration(sec)
    setRemaining(sec)
    setTimerRunning(false)
    endAtRef.current = null
    firedRef.current = false
  }

  const startTimer = () => {
    unlock() // ユーザー操作起点で音を解禁
    const base = remaining > 0 ? remaining : duration
    endAtRef.current = Date.now() + base * 1000
    firedRef.current = false
    setRemaining(base)
    setTimerRunning(true)
  }

  const pauseTimer = () => {
    // 残りを確定させて停止（再開時はこの残りから）
    const end = endAtRef.current
    if (end != null) setRemaining(Math.max(0, (end - Date.now()) / 1000))
    endAtRef.current = null
    setTimerRunning(false)
  }

  const resetTimer = () => {
    setTimerRunning(false)
    endAtRef.current = null
    firedRef.current = false
    setRemaining(duration)
  }

  const startStopwatch = () => {
    unlock()
    swStartRef.current = Date.now() - swElapsed // 累積を維持して再開
    setSwRunning(true)
  }
  const pauseStopwatch = () => setSwRunning(false)
  const resetStopwatch = () => {
    setSwRunning(false)
    swStartRef.current = null
    setSwElapsed(0)
  }

  const timerAlert = remaining <= 0 && !timerRunning && duration > 0 && endAtRef.current === null && firedRef.current

  return (
    <Page>
      <Title>タイマー</Title>
      <Sub>セット間インターバルの管理に。終了時にイヤホンへ通知音が鳴ります（画面を開いたままにしてください）。</Sub>

      <ModeSwitch>
        <ModeButton $active={mode === 'timer'} onClick={() => setMode('timer')}>
          インターバル
        </ModeButton>
        <ModeButton $active={mode === 'stopwatch'} onClick={() => setMode('stopwatch')}>
          ストップウォッチ
        </ModeButton>
      </ModeSwitch>

      {mode === 'timer' ? (
        <>
          <PresetGrid>
            {PRESETS.map((sec) => (
              <PresetButton
                key={sec}
                $active={duration === sec}
                onClick={() => selectPreset(sec)}
              >
                {sec}秒
              </PresetButton>
            ))}
          </PresetGrid>

          <Display $alert={timerAlert}>{fmtClock(remaining)}</Display>

          <Controls>
            {timerRunning ? (
              <ControlButton $variant="ghost" onClick={pauseTimer}>
                一時停止
              </ControlButton>
            ) : (
              <ControlButton $variant="primary" onClick={startTimer}>
                {remaining > 0 && remaining < duration ? '再開' : 'スタート'}
              </ControlButton>
            )}
            <ControlButton $variant="ghost" onClick={resetTimer}>
              リセット
            </ControlButton>
          </Controls>

          <Note>
            画面を閉じたりアプリを切り替えると、端末によっては音が鳴らないことがあります。
          </Note>
        </>
      ) : (
        <>
          <Display>{fmtStopwatch(swElapsed)}</Display>

          <Controls>
            {swRunning ? (
              <ControlButton $variant="ghost" onClick={pauseStopwatch}>
                ストップ
              </ControlButton>
            ) : (
              <ControlButton $variant="primary" onClick={startStopwatch}>
                {swElapsed > 0 ? '再開' : 'スタート'}
              </ControlButton>
            )}
            <ControlButton $variant="ghost" onClick={resetStopwatch}>
              リセット
            </ControlButton>
          </Controls>
        </>
      )}
    </Page>
  )
}
