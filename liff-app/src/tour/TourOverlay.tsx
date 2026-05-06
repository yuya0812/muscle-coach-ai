import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { useTour } from './TourContext'
import { theme } from '../theme'

const PADDING = 6

const Highlight = styled.div<{ $top: number; $left: number; $width: number; $height: number }>`
  position: fixed;
  top: ${({ $top }) => `${$top - PADDING}px`};
  left: ${({ $left }) => `${$left - PADDING}px`};
  width: ${({ $width }) => `${$width + PADDING * 2}px`};
  height: ${({ $height }) => `${$height + PADDING * 2}px`};
  border-radius: 12px;
  border: 2px solid ${theme.colors.primary};
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.72);
  pointer-events: none;
  z-index: 9998;
`

const Tooltip = styled.div<{ $top: number; $left: number; $width: number }>`
  position: fixed;
  top: ${({ $top }) => `${$top}px`};
  left: ${({ $left }) => `${$left}px`};
  width: ${({ $width }) => `${$width}px`};
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.primaryBorder};
  border-radius: 14px;
  padding: 14px 16px 12px;
  z-index: 10000;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
`

const Title = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${theme.colors.primary};
  margin-bottom: 6px;
`

const Body = styled.p`
  font-size: 13px;
  color: ${theme.colors.text};
  line-height: 1.6;
  margin: 0 0 14px;
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`

const Counter = styled.span`
  font-size: 11px;
  color: ${theme.colors.textMuted};
`

const NextButton = styled.button`
  flex: 1;
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  background: ${theme.colors.primary};
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  &:active { opacity: 0.85; }
`

const SkipLink = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.textMuted};
  font-size: 11px;
  text-decoration: underline;
  cursor: pointer;
  padding: 4px 6px;
  &:active { color: ${theme.colors.text}; }
`

const ClickBlocker = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9997;
  cursor: default;
`

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const POLL_INTERVAL = 100
const POLL_LIMIT = 25 // 約2.5秒

export default function TourOverlay() {
  const { active, currentStep, stepIndex, totalSteps, next, skipScreen } = useTour()
  const [rect, setRect] = useState<Rect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; width: number } | null>(null)

  // 対象要素を polling で待ち、見つかったら矩形を取得
  useEffect(() => {
    if (!active || !currentStep) {
      setRect(null)
      setTooltipPos(null)
      return
    }
    setRect(null)
    setTooltipPos(null)

    let attempts = 0
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(`[data-tour-id="${currentStep.target}"]`) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // スクロール後にrectを再取得（次フレーム）
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled) return
            const r = el.getBoundingClientRect()
            setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
          })
        })
        return
      }
      if (++attempts > POLL_LIMIT) return
      setTimeout(tick, POLL_INTERVAL)
    }
    tick()

    return () => { cancelled = true }
  }, [active, currentStep, stepIndex])

  // ウィンドウリサイズ・スクロールで再計測
  useEffect(() => {
    if (!active || !currentStep) return
    const recalc = () => {
      const el = document.querySelector(`[data-tour-id="${currentStep.target}"]`) as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      }
    }
    window.addEventListener('resize', recalc)
    window.addEventListener('scroll', recalc, true)
    return () => {
      window.removeEventListener('resize', recalc)
      window.removeEventListener('scroll', recalc, true)
    }
  }, [active, currentStep])

  // tooltip 位置決定
  useLayoutEffect(() => {
    if (!rect || !tooltipRef.current) return
    const tooltipEl = tooltipRef.current
    const tooltipHeight = tooltipEl.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    const horizontalMargin = 16
    const width = Math.min(vw - horizontalMargin * 2, 320)

    const spaceBelow = vh - (rect.top + rect.height)
    const spaceAbove = rect.top
    const gap = 14

    let top: number
    if (spaceBelow >= tooltipHeight + gap + 16) {
      top = rect.top + rect.height + gap
    } else if (spaceAbove >= tooltipHeight + gap + 16) {
      top = rect.top - tooltipHeight - gap
    } else {
      top = Math.max(16, vh / 2 - tooltipHeight / 2)
    }

    let left = rect.left + rect.width / 2 - width / 2
    left = Math.max(horizontalMargin, Math.min(left, vw - width - horizontalMargin))

    setTooltipPos({ top, left, width })
  }, [rect])

  if (!active || !currentStep) return null

  return (
    <>
      <ClickBlocker onClick={next} />
      {rect && (
        <Highlight
          $top={rect.top}
          $left={rect.left}
          $width={rect.width}
          $height={rect.height}
          onClick={(e) => {
            e.stopPropagation()
            next()
          }}
        />
      )}
      <Tooltip
        ref={tooltipRef}
        $top={tooltipPos?.top ?? -9999}
        $left={tooltipPos?.left ?? -9999}
        $width={tooltipPos?.width ?? 320}
        onClick={(e) => e.stopPropagation()}
      >
        <Title>{currentStep.title}</Title>
        <Body>{currentStep.body}</Body>
        <Footer>
          <Counter>
            {stepIndex + 1} / {totalSteps}
          </Counter>
          <SkipLink onClick={skipScreen}>スキップ</SkipLink>
          <NextButton onClick={next}>
            {stepIndex === totalSteps - 1 ? 'はじめる' : '次へ'}
          </NextButton>
        </Footer>
      </Tooltip>
    </>
  )
}
