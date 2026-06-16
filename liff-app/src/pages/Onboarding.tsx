import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { theme } from '../theme'

const Page = styled.div`
  padding: ${theme.spacing.md};
  padding-bottom: 40px;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  animation: fadeUp 0.22s ease both;
`

const Hero = styled.div`
  text-align: center;
  padding-top: 52px;
  padding-bottom: ${theme.spacing.lg};
`

const HeroIcon = styled.div`
  width: 72px;
  height: 72px;
  margin: 0 auto ${theme.spacing.md};
  border-radius: 20px;
  background: ${theme.colors.primaryDim};
  border: 1px solid ${theme.colors.primaryBorder};
  display: flex;
  align-items: center;
  justify-content: center;
`

const HeroTitle = styled.h1`
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: ${theme.colors.text};
  margin: 0 0 ${theme.spacing.sm};
  white-space: pre-line;
  line-height: 1.3;
`

const HeroSub = styled.p`
  font-size: 13px;
  color: ${theme.colors.textMuted};
  margin: 0;
`

const SectionLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: ${theme.colors.textMuted};
  text-align: center;
  margin: ${theme.spacing.md} 0 ${theme.spacing.md};
  text-transform: uppercase;
`

const FlowCards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: ${theme.spacing.lg};
`

const FlowCard = styled.div`
  background: ${theme.colors.surface};
  border-radius: 16px;
  padding: 16px 18px;
  border: 1px solid ${theme.colors.border};
`

const FlowHeader = styled.div<{ $accent: string }>`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
`

const FlowNum = styled.span<{ $accent: string }>`
  font-size: 11px;
  font-weight: 800;
  color: ${({ $accent }) => $accent};
  letter-spacing: 0.05em;
`

const FlowDivider = styled.span<{ $accent: string }>`
  width: 1px;
  height: 12px;
  background: ${({ $accent }) => $accent};
  opacity: 0.5;
`

const FlowTitle = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: ${theme.colors.text};
`

const FlowItems = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const FlowItem = styled.li`
  font-size: 12.5px;
  color: ${theme.colors.textMuted};
  line-height: 1.6;
  &::before { content: '・'; }
`

const Nudge = styled.div`
  background: ${theme.colors.primaryDim};
  border: 1px solid ${theme.colors.primaryBorder};
  border-radius: 18px;
  padding: 20px 18px;
  text-align: center;
`

const NudgeText = styled.p`
  font-size: 13.5px;
  color: ${theme.colors.text};
  margin: 0 0 ${theme.spacing.xs};
  font-weight: 700;
`

const NudgeSub = styled.p`
  font-size: 12px;
  color: ${theme.colors.textMuted};
  margin: 0 0 ${theme.spacing.md};
  line-height: 1.6;
`

const PrimaryButton = styled.button`
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: ${theme.colors.primary};
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  &:active { opacity: 0.85; }
`

const SkipLink = styled.button`
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: ${theme.colors.textMuted};
  font-size: 13px;
  text-align: center;
  cursor: pointer;
  padding: ${theme.spacing.md} 0 0;
  &:hover { color: ${theme.colors.text}; }
`

function markOnboarded(userId: string) {
  localStorage.setItem(`onboarded_${userId}`, 'true')
}

export default function Onboarding({ userId }: { userId: string }) {
  const navigate = useNavigate()

  const goToSetup = () => {
    markOnboarded(userId)
    navigate('/setup')
  }

  const skip = () => {
    markOnboarded(userId)
    navigate('/dashboard')
  }

  return (
    <Page>
      <Hero>
        <HeroIcon>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2"/>
            <circle cx="12" cy="5" r="2"/>
            <path d="M12 7v4"/>
            <line x1="8" y1="16" x2="8" y2="16"/>
            <line x1="16" y1="16" x2="16" y2="16"/>
          </svg>
        </HeroIcon>
        <HeroTitle>{`マッスルコーチAIへ\nようこそ！`}</HeroTitle>
        <HeroSub>LINEに送るだけで記録、AIが分析まで言語化します</HeroSub>
      </Hero>

      <SectionLabel>使い方</SectionLabel>

      <FlowCards>
        <FlowCard>
          <FlowHeader $accent={theme.colors.primary}>
            <FlowNum $accent={theme.colors.primary}>01</FlowNum>
            <FlowDivider $accent={theme.colors.primary} />
            <FlowTitle>LINE に送るだけで記録</FlowTitle>
          </FlowHeader>
          <FlowItems>
            <FlowItem>「ベンチプレス 60kg 10回 3セット」と送る</FlowItem>
            <FlowItem>足りない情報はその場で聞き返します</FlowItem>
            <FlowItem>「分析して」で弱点・伸びをまとめて受け取る</FlowItem>
          </FlowItems>
        </FlowCard>

        <FlowCard>
          <FlowHeader $accent={theme.colors.blue}>
            <FlowNum $accent={theme.colors.blue}>02</FlowNum>
            <FlowDivider $accent={theme.colors.blue} />
            <FlowTitle>このアプリでデータを見る</FlowTitle>
          </FlowHeader>
          <FlowItems>
            <FlowItem>弱点・成長を分析サマリーで確認する</FlowItem>
            <FlowItem>グラフで成長を振り返る</FlowItem>
            <FlowItem>プランの確認・変更をする</FlowItem>
          </FlowItems>
        </FlowCard>
      </FlowCards>

      <Nudge>
        <NudgeText>まずヒアリングを始めましょう</NudgeText>
        <NudgeSub>
          年代・体格・目標などをいくつか教えてください。記録の分析があなたの目標に合わせて調整されます（60秒程度）。
        </NudgeSub>
        <PrimaryButton onClick={goToSetup}>
          セットアップを始める →
        </PrimaryButton>
      </Nudge>

      <SkipLink onClick={skip}>あとで設定する</SkipLink>
    </Page>
  )
}
