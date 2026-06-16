import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line, Radar } from 'react-chartjs-2'
import { theme } from '../theme'
import { getDashboardData, getUsageStatus, getMilestones, getAnalysisSummary, type DashboardData, type MilestoneStatus, type AnalysisSummary } from '../api'
import { closeLiff, sendMessageAndCloseLiff } from '../liff'
import Loading from '../components/Loading'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
)

const Page = styled.div`
  padding: ${theme.spacing.md};
  padding-bottom: ${theme.layout.bottomNavSpace};
  animation: fadeUp 0.22s ease both;
`

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: ${theme.spacing.lg};
  gap: ${theme.spacing.md};
`

const SummaryLeft = styled.div`
  flex: 1;
`

const SummaryLabel = styled.div`
  font-size: 12px;
  color: ${theme.colors.textMuted};
  margin-bottom: 2px;
`

const SummaryNumberRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 4px;
`

const SummaryNumber = styled.span`
  font-size: 40px;
  font-weight: 800;
  color: ${theme.colors.text};
  line-height: 1;
  letter-spacing: -0.02em;
`

const SummaryUnit = styled.span`
  font-size: 16px;
  color: ${theme.colors.textMuted};
`

const GoldBox = styled.div`
  background: ${theme.colors.goldDim};
  border: 1px solid ${theme.colors.goldBorder};
  border-radius: 12px;
  padding: 10px 14px;
  text-align: center;
`

const GoldLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  color: ${theme.colors.gold};
  letter-spacing: 0.04em;
  margin-bottom: 2px;
`

const GoldNumberRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 2px;
  justify-content: center;
`

const GoldNumber = styled.span`
  font-size: 26px;
  font-weight: 800;
  color: ${theme.colors.gold};
  line-height: 1;
`

const GoldUnit = styled.span`
  font-size: 13px;
  color: ${theme.colors.gold};
  opacity: 0.85;
`

// ===== 記録導線カード（LINEでサッと記録） =====
const RecordCard = styled.div`
  position: relative;
  overflow: hidden;
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 18px;
  padding: 18px;
  margin-bottom: ${theme.spacing.md};
  box-shadow: ${theme.effects.cardLift};
`

const RecordHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
`

const RecordIconBox = styled.div`
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: ${theme.colors.primaryDim};
  border: 1px solid ${theme.colors.primaryBorder};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`

const RecordTitleBlock = styled.div`
  display: flex;
  flex-direction: column;
`

const RecordTitle = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: ${theme.colors.text};
`

const RecordSub = styled.span`
  font-size: 11.5px;
  color: ${theme.colors.textMuted};
`

// LINEのトークを模したチャットバブル（「こう送ればいい」を体験的に見せる）
const ChatBubble = styled.div`
  align-self: flex-end;
  max-width: 88%;
  margin: 0 0 14px auto;
  background: ${theme.colors.primary};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  padding: 10px 13px;
  border-radius: 14px 14px 4px 14px;
  box-shadow: ${theme.effects.bubbleEdge};
`

const RecordActions = styled.div`
  display: flex;
  gap: 8px;
`

const RecordPrimaryBtn = styled.button`
  flex: 1;
  padding: 13px 14px;
  background: ${theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  &:active { opacity: 0.85; }
`

const RecordGhostBtn = styled.button`
  flex: 1;
  padding: 13px 14px;
  background: transparent;
  color: ${theme.colors.primary};
  border: 1.5px solid ${theme.colors.primaryBorder};
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  &:active { background: ${theme.colors.primaryDim}; }
`

// ===== 分析サマリーカード（4セクション・計器盤） =====
const AnalysisCard = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 18px;
  padding: 16px 18px;
  margin-bottom: ${theme.spacing.md};
  box-shadow: ${theme.effects.cardLift};
`

const AnalysisHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
`

const AnalysisTitle = styled.span`
  font-size: 13px;
  font-weight: 700;
  color: ${theme.colors.text};
`

const AnalysisHint = styled.span`
  font-size: 10.5px;
  color: ${theme.colors.textMuted};
`

const AnalysisGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const AnalysisRow = styled.div<{ $accent: string }>`
  border: 1px solid ${theme.colors.border};
  border-left: 3px solid ${({ $accent }) => $accent};
  border-radius: 10px;
  background: ${theme.colors.surface2};
  padding: 9px 12px;
`

const AnalysisRowLabel = styled.div<{ $accent: string }>`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: ${({ $accent }) => $accent};
  margin-bottom: 3px;
`

const AnalysisRowValue = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${theme.colors.text};
  line-height: 1.5;
`

const AnalysisEmpty = styled.p`
  font-size: 12.5px;
  color: ${theme.colors.textMuted};
  line-height: 1.6;
  margin: 4px 0 0;
`

const MilestoneCard = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 18px;
  padding: 16px 18px;
  margin-bottom: ${theme.spacing.md};
`

const MilestoneTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: ${theme.colors.text};
  margin-bottom: 4px;
`

const MilestoneSub = styled.div`
  font-size: 11px;
  color: ${theme.colors.textMuted};
  margin-bottom: 12px;
`

const MilestoneRow = styled.div<{ $achieved: boolean; $next: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 11px;
  background: ${({ $achieved, $next }) =>
    $achieved ? theme.colors.primaryDim : $next ? theme.colors.goldDim : 'transparent'};
  border: 1px solid ${({ $achieved, $next }) =>
    $achieved ? theme.colors.primaryBorder : $next ? theme.colors.goldBorder : theme.colors.border};
  & + & { margin-top: 6px; }
`

const MilestoneStep = styled.span<{ $achieved: boolean; $next: boolean }>`
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: ${({ $achieved, $next }) =>
    $achieved ? theme.colors.primary : $next ? theme.colors.gold : theme.colors.textMuted};
  flex-shrink: 0;
  width: 26px;
`

const MilestoneInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const MilestoneName = styled.div<{ $achieved: boolean; $next: boolean }>`
  font-size: 13px;
  font-weight: 700;
  color: ${({ $achieved, $next }) =>
    $achieved ? theme.colors.primary : $next ? theme.colors.gold : theme.colors.textMuted};
  margin-bottom: 3px;
`

const MilestoneProgress = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const MilestoneBar = styled.div`
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
`

const MilestoneFill = styled.div<{ $pct: number; $color: string }>`
  width: ${({ $pct }) => `${$pct}%`};
  height: 100%;
  background: ${({ $color }) => $color};
  transition: width 0.3s;
`

const MilestoneStatusText = styled.span<{ $achieved: boolean; $next: boolean }>`
  font-size: 11px;
  font-weight: 600;
  color: ${({ $achieved, $next }) =>
    $achieved ? theme.colors.primary : $next ? theme.colors.gold : theme.colors.textMuted};
  white-space: nowrap;
`

const MilestoneCheck = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: ${theme.colors.primary};
  flex-shrink: 0;
`

const UpgradeNudge = styled.div`
  background: ${theme.colors.goldDim};
  border: 1px solid ${theme.colors.goldBorder};
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: ${theme.spacing.md};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
`

const NudgeText = styled.div`
  font-size: 12.5px;
  color: ${theme.colors.gold};
  font-weight: 600;
  flex: 1;
`

const NudgeButton = styled.button`
  padding: 6px 12px;
  background: ${theme.colors.gold};
  color: #1a1a1a;
  border: none;
  border-radius: ${theme.borderRadius.full};
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
`

const PeriodTabs = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: ${theme.spacing.md};
`

const PeriodTab = styled.button<{ $active: boolean }>`
  padding: 7px 14px;
  border: 1px solid ${({ $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: ${theme.borderRadius.full};
  background: ${({ $active }) => ($active ? theme.colors.primaryDim : 'transparent')};
  color: ${({ $active }) => ($active ? theme.colors.primary : theme.colors.textMuted)};
  font-size: 12px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  cursor: pointer;
`

const Section = styled.section`
  background: ${theme.colors.surface};
  border-radius: 18px;
  padding: 16px;
  margin-bottom: ${theme.spacing.md};
  border: 1px solid ${theme.colors.border};
`

const SectionTitle = styled.h3`
  font-size: 13px;
  font-weight: 700;
  margin: 0 0 12px;
  color: ${theme.colors.text};
`

const WorkoutItem = styled.div`
  padding: 14px 0;
  border-bottom: 1px solid ${theme.colors.border};
  &:last-child { border-bottom: none; padding-bottom: 0; }
  &:first-child { padding-top: 0; }
`

const WorkoutDate = styled.div`
  font-size: 11px;
  color: ${theme.colors.textMuted};
  margin-bottom: 8px;
  font-weight: 600;
  letter-spacing: 0.04em;
`

const WorkoutExerciseList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const WorkoutExerciseRow = styled.div`
  background: ${theme.colors.surface2};
  border: 1px solid ${theme.colors.border};
  border-radius: 10px;
  padding: 10px 12px;
`

const WorkoutExerciseName = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: ${theme.colors.text};
  margin-bottom: 6px;
`

const WorkoutVolumeBadge = styled.span`
  font-size: 10px;
  font-weight: 700;
  color: ${theme.colors.primary};
  background: ${theme.colors.primaryDim};
  border: 1px solid ${theme.colors.primaryBorder};
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
`

const WorkoutSetGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
`

const WorkoutSetTag = styled.span`
  font-size: 11.5px;
  color: ${theme.colors.textMuted};
  background: ${theme.colors.bg};
  border: 1px solid ${theme.colors.border};
  border-radius: 6px;
  padding: 2px 7px;
`

const Empty = styled.p`
  color: ${theme.colors.textMuted};
  font-size: 13px;
  text-align: center;
  padding: ${theme.spacing.md} 0;
`

const ErrorBtn = styled.button`
  padding: 10px 24px;
  background: ${theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
`

type Period = '1w' | '1m' | '3m'

export default function Dashboard({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [period, setPeriod] = useState<Period>('1m')
  const [loading, setLoading] = useState(true) // 初回ロード時のみ全画面ローディング
  const [refreshing, setRefreshing] = useState(false) // 期間タブ切替時はローディング画面を出さずに静かに更新
  const [error, setError] = useState(false)
  const [remaining, setRemaining] = useState<number | null | undefined>(undefined)
  const [milestones, setMilestones] = useState<MilestoneStatus | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null)

  const fetchData = (initial = false) => {
    if (initial) setLoading(true)
    else setRefreshing(true)
    setError(false)
    getDashboardData(userId, period)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }

  useEffect(() => {
    fetchData(data === null) // 初回のみ initial=true、以降は静的更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, period])

  useEffect(() => {
    getUsageStatus(userId)
      .then(r => setRemaining(r.remaining))
      .catch(() => setRemaining(undefined))
  }, [userId])

  useEffect(() => {
    getMilestones(userId)
      .then(setMilestones)
      .catch(() => setMilestones(null))
  }, [userId])

  useEffect(() => {
    getAnalysisSummary(userId)
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
  }, [userId])

  if (loading) return <Loading />
  if (error) return (
    <Page style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ color: theme.colors.textMuted, marginBottom: 16 }}>データの取得に失敗しました</p>
      <ErrorBtn onClick={() => fetchData(true)}>再試行</ErrorBtn>
    </Page>
  )
  if (!data) return <Page>データの取得に失敗しました</Page>

  const radarData = {
    labels: Object.keys(data.bodyPartFrequency),
    datasets: [
      {
        label: 'トレーニング頻度',
        data: Object.values(data.bodyPartFrequency),
        backgroundColor: 'rgba(6, 199, 85, 0.12)',
        borderColor: theme.colors.primary,
        borderWidth: 2,
        pointBackgroundColor: theme.colors.primary,
      },
    ],
  }

  const lineData = {
    labels: data.progressData.labels,
    datasets: data.progressData.datasets.map((ds, i) => ({
      ...ds,
      borderColor: [theme.colors.primary, theme.colors.blue, '#e74c3c', '#f39c12'][i % 4],
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 3,
      borderWidth: 2,
      spanGaps: false, // null（未記録）の前後で線を切る
    })),
  }

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      r: {
        beginAtZero: true,
        grid: { color: 'rgba(255,255,255,0.06)' },
        angleLines: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: '#6b7385', backdropColor: 'transparent', font: { size: 10 } },
        pointLabels: { color: '#c8cde0', font: { size: 12, weight: 600 as const } },
      },
    },
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { color: '#6b7385', font: { size: 11 } } },
      tooltip: {
        callbacks: {
          // ツールチップに「総重量 N kg」を表示
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const v = ctx.parsed.y
            if (v === null) return ''
            return ` ${ctx.dataset.label}: ${v}kg`
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#6b7385' },
      },
      y: {
        beginAtZero: false, // 0kgからではなく実データの範囲で表示
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#6b7385' },
      },
    },
  }

  return (
    <Page>
      <SummaryRow data-tour-id="dashboard-summary">
        <SummaryLeft>
          <SummaryLabel>今週のトレーニング</SummaryLabel>
          <SummaryNumberRow>
            <SummaryNumber>{data.weeklyCount}</SummaryNumber>
            <SummaryUnit>回</SummaryUnit>
          </SummaryNumberRow>
        </SummaryLeft>
        {remaining !== undefined && (
          <GoldBox>
            <GoldLabel>今月の残り</GoldLabel>
            <GoldNumberRow>
              <GoldNumber>{remaining === null ? '∞' : remaining}</GoldNumber>
              {remaining !== null && <GoldUnit>回</GoldUnit>}
            </GoldNumberRow>
          </GoldBox>
        )}
      </SummaryRow>

      <RecordCard data-tour-id="dashboard-record-cta">
        <RecordHeader>
          <RecordIconBox>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </RecordIconBox>
          <RecordTitleBlock>
            <RecordTitle>LINEでサッと記録</RecordTitle>
            <RecordSub>送るだけで記録、足りない分は聞き返します</RecordSub>
          </RecordTitleBlock>
        </RecordHeader>
        <ChatBubble>ベンチプレス 60kg 10回 3セット</ChatBubble>
        <RecordActions>
          <RecordPrimaryBtn onClick={closeLiff}>LINEで記録する</RecordPrimaryBtn>
          <RecordGhostBtn onClick={() => sendMessageAndCloseLiff('分析して')}>
            分析してもらう
          </RecordGhostBtn>
        </RecordActions>
      </RecordCard>

      {analysis && (
        <AnalysisCard data-tour-id="dashboard-analysis">
          <AnalysisHead>
            <AnalysisTitle>分析サマリー</AnalysisTitle>
            <AnalysisHint>記録の集計から自動でまとめています</AnalysisHint>
          </AnalysisHead>
          {!analysis.hasRecords ? (
            <AnalysisEmpty>
              記録がたまると、弱点・伸びている種目・次の一歩がここに表示されます。
              まずはLINEに「ベンチプレス 60kg 10回 3セット」のように送ってみてください。
            </AnalysisEmpty>
          ) : (
            <AnalysisGrid>
              <AnalysisRow $accent={theme.colors.textMuted}>
                <AnalysisRowLabel $accent={theme.colors.textMuted}>弱点</AnalysisRowLabel>
                <AnalysisRowValue>
                  {analysis.weakpoints && analysis.weakpoints.length > 0
                    ? `${analysis.weakpoints.join('・')}の刺激が不足`
                    : '部位バランスに大きな偏りなし'}
                </AnalysisRowValue>
              </AnalysisRow>

              <AnalysisRow $accent={theme.colors.primary}>
                <AnalysisRowLabel $accent={theme.colors.primary}>伸びているところ</AnalysisRowLabel>
                <AnalysisRowValue>
                  {!analysis.trendJudgeable
                    ? 'まだ判定できる記録が足りません'
                    : analysis.improved && analysis.improved.length > 0
                    ? analysis.improved
                        .map((e) =>
                          e.recentMaxWeight != null && e.earlyMaxWeight != null
                            ? `${e.name}（${e.earlyMaxWeight}→${e.recentMaxWeight}kg）`
                            : e.name,
                        )
                        .join('、')
                    : '明確に伸びている種目はまだありません'}
                </AnalysisRowValue>
              </AnalysisRow>

              <AnalysisRow $accent={theme.colors.gold}>
                <AnalysisRowLabel $accent={theme.colors.gold}>伸び悩んでいるところ</AnalysisRowLabel>
                <AnalysisRowValue>
                  {!analysis.trendJudgeable
                    ? 'まだ判定できる記録が足りません'
                    : analysis.stagnant && analysis.stagnant.length > 0
                    ? analysis.stagnant.join('、')
                    : '該当なし'}
                </AnalysisRowValue>
              </AnalysisRow>

              <AnalysisRow $accent={theme.colors.primary}>
                <AnalysisRowLabel $accent={theme.colors.primary}>次のステップ</AnalysisRowLabel>
                <AnalysisRowValue>{analysis.nextStep}</AnalysisRowValue>
              </AnalysisRow>
            </AnalysisGrid>
          )}
        </AnalysisCard>
      )}

      {milestones && (
        <MilestoneCard data-tour-id="dashboard-milestone">
          <MilestoneTitle>マイルストーン</MilestoneTitle>
          <MilestoneSub>累計 {milestones.totalCount} 回の記録</MilestoneSub>
          {(() => {
            const nextIndex = milestones.milestones.findIndex((m) => !m.achieved)
            return milestones.milestones.map((m, i) => {
              const achieved = m.achieved
              const isNext = i === nextIndex
              const pct = achieved ? 100 : Math.max(0, Math.min(100, (milestones.totalCount / m.count) * 100))
              const color = achieved ? theme.colors.primary : isNext ? theme.colors.gold : theme.colors.textFaint
              const remainingToGoal = m.count - milestones.totalCount
              return (
                <MilestoneRow key={m.count} $achieved={achieved} $next={isNext}>
                  <MilestoneStep $achieved={achieved} $next={isNext}>
                    {String(i + 1).padStart(2, '0')}
                  </MilestoneStep>
                  <MilestoneInfo>
                    <MilestoneName $achieved={achieved} $next={isNext}>{m.name}</MilestoneName>
                    <MilestoneProgress>
                      <MilestoneBar>
                        <MilestoneFill $pct={pct} $color={color} />
                      </MilestoneBar>
                      <MilestoneStatusText $achieved={achieved} $next={isNext}>
                        {achieved ? '達成済み' : isNext ? `あと${remainingToGoal}回` : `${m.count}回で解放`}
                      </MilestoneStatusText>
                    </MilestoneProgress>
                  </MilestoneInfo>
                  {achieved && (
                    <MilestoneCheck>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </MilestoneCheck>
                  )}
                </MilestoneRow>
              )
            })
          })()}
        </MilestoneCard>
      )}

      {typeof remaining === 'number' && remaining <= 2 && remaining > 0 && (
        <UpgradeNudge>
          <NudgeText>残り{remaining}回です。プレミアムで無制限に！</NudgeText>
          <NudgeButton onClick={() => navigate('/subscribe')}>
            アップグレード
          </NudgeButton>
        </UpgradeNudge>
      )}

      <PeriodTabs data-tour-id="dashboard-charts" style={{ opacity: refreshing ? 0.6 : 1, transition: 'opacity 0.15s' }}>
        {([['1w', '1週間'], ['1m', '1ヶ月'], ['3m', '3ヶ月']] as [Period, string][]).map(
          ([val, label]) => (
            <PeriodTab
              key={val}
              $active={period === val}
              disabled={refreshing}
              onClick={() => setPeriod(val)}
            >
              {label}
            </PeriodTab>
          ),
        )}
      </PeriodTabs>

      <Section>
        <SectionTitle>部位別バランス</SectionTitle>
        <div style={{ height: 260 }}>
          <Radar data={radarData} options={radarOptions} />
        </div>
      </Section>

      <Section>
        <SectionTitle>重量推移</SectionTitle>
        <div style={{ height: 280 }}>
          <Line data={lineData} options={lineOptions} />
        </div>
      </Section>

      <Section>
        <SectionTitle>直近のトレーニング</SectionTitle>
        {data.recentWorkouts.length === 0 ? (
          <Empty>まだ記録がありません</Empty>
        ) : (
          data.recentWorkouts.map((w, i) => (
            <WorkoutItem key={i}>
              <WorkoutDate>{w.date}</WorkoutDate>
              <WorkoutExerciseList>
                {w.exercises.map((e, exIdx) => (
                  <WorkoutExerciseRow key={exIdx}>
                    <WorkoutExerciseName>
                      <span>{e.name}</span>
                      {e.totalVolume > 0 && (
                        <WorkoutVolumeBadge>{e.totalVolume.toLocaleString()}kg</WorkoutVolumeBadge>
                      )}
                    </WorkoutExerciseName>
                    {e.setGroups.length > 0 && (
                      <WorkoutSetGrid>
                        {e.setGroups.map((g, gIdx) => {
                          const parts: string[] = []
                          if (g.weight) parts.push(`${g.weight}kg`)
                          if (g.reps) parts.push(`${g.reps}回`)
                          if (g.sets) parts.push(`${g.sets}セット`)
                          return parts.length > 0 ? (
                            <WorkoutSetTag key={gIdx}>{parts.join(' × ')}</WorkoutSetTag>
                          ) : null
                        })}
                      </WorkoutSetGrid>
                    )}
                  </WorkoutExerciseRow>
                ))}
              </WorkoutExerciseList>
            </WorkoutItem>
          ))
        )}
      </Section>
    </Page>
  )
}
