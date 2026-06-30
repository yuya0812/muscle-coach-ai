import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { theme } from '../theme'
import { updateProfile, updateNotificationSettings, getProfile } from '../api'
import { openExternalUrl } from '../liff'
import Loading from '../components/Loading'
import { useTour } from '../tour/TourContext'

const Page = styled.div`
  padding: ${theme.spacing.md};
  padding-bottom: ${theme.layout.bottomNavSpace};
  animation: fadeUp 0.22s ease both;
`

const Title = styled.h2`
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: ${theme.colors.text};
  margin: 0 0 ${theme.spacing.lg};
`

const Card = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 18px;
  padding: 18px;
  margin-bottom: ${theme.spacing.md};
`

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
`

const SectionLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${theme.colors.textMuted};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`

const EditButton = styled.button`
  background: none;
  border: 1px solid ${theme.colors.border};
  color: ${theme.colors.text};
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 5px 12px;
  border-radius: 999px;
  &:active { background: ${theme.colors.surface2}; }
`

const ViewRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid ${theme.colors.border};
  &:last-child { border-bottom: none; }
`

const ViewLabel = styled.span`
  font-size: 12px;
  color: ${theme.colors.textMuted};
  flex-shrink: 0;
  width: 110px;
`

const ViewValue = styled.span`
  font-size: 13px;
  color: ${theme.colors.text};
  font-weight: 600;
  text-align: right;
  flex: 1;
  overflow-wrap: anywhere;
`

const Label = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: ${theme.colors.textMuted};
  margin: ${theme.spacing.md} 0 8px;
`

const OptionGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`

const OptionButton = styled.button<{ $selected: boolean }>`
  padding: 10px 8px;
  border: 1.5px solid ${({ $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  border-radius: 10px;
  background: ${({ $selected }) => ($selected ? theme.colors.primaryDim : 'transparent')};
  color: ${({ $selected }) => ($selected ? theme.colors.primary : theme.colors.textMuted)};
  font-size: 13px;
  font-weight: ${({ $selected }) => ($selected ? 700 : 500)};
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
`

const FrequencyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

const FreqButton = styled.button<{ $selected: boolean }>`
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1.5px solid ${({ $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  background: ${({ $selected }) => ($selected ? theme.colors.primary : 'transparent')};
  color: ${({ $selected }) => ($selected ? '#fff' : theme.colors.textMuted)};
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
`

const FreqUnit = styled.span`
  font-size: 13px;
  color: ${theme.colors.textMuted};
`

const DayRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-top: 8px;
`

const DayButton = styled.button<{ $selected: boolean; $isHoliday?: boolean }>`
  flex: 1;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid ${({ $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  background: ${({ $selected }) => ($selected ? theme.colors.primary : 'transparent')};
  color: ${({ $selected, $isHoliday }) =>
    $selected ? '#fff' : $isHoliday ? theme.colors.danger : theme.colors.textMuted};
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
`

const SaveButton = styled.button`
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 14px;
  background: ${theme.colors.primary};
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  &:active { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const CancelButton = styled.button`
  width: 100%;
  padding: 12px;
  border: 1px solid ${theme.colors.border};
  border-radius: 12px;
  background: none;
  color: ${theme.colors.textMuted};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 10px;
  &:active { color: ${theme.colors.text}; }
`

const LegalCard = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 18px;
  padding: 6px 4px;
  margin-bottom: ${theme.spacing.md};
`

const LegalLink = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 14px;
  border: none;
  background: none;
  color: ${theme.colors.text};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  & + & { border-top: 1px solid ${theme.colors.border}; }
  &:active { background: ${theme.colors.surface2}; }
`

const LegalLinkArrow = styled.span`
  color: ${theme.colors.textMuted};
  font-size: 14px;
`

const TourLinkButton = styled.button`
  width: 100%;
  padding: 12px;
  border: 1px solid ${theme.colors.border};
  border-radius: 12px;
  background: ${theme.colors.surface};
  color: ${theme.colors.textMuted};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: ${theme.spacing.md};
  &:active { color: ${theme.colors.text}; }
`

const SetupNudge = styled.div`
  background: ${theme.colors.goldDim};
  border: 1px solid ${theme.colors.goldBorder};
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: ${theme.spacing.md};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`

const SetupNudgeText = styled.div`
  font-size: 12.5px;
  color: ${theme.colors.gold};
  font-weight: 600;
  flex: 1;
  line-height: 1.5;
`

const SetupNudgeButton = styled.button`
  padding: 8px 14px;
  border: none;
  border-radius: 999px;
  background: ${theme.colors.gold};
  color: #1a1a1a;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  &:active { opacity: 0.85; }
`

const SuccessMsg = styled.div`
  background: ${theme.colors.primaryDim};
  border: 1px solid ${theme.colors.primaryBorder};
  color: ${theme.colors.primary};
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  text-align: center;
  margin-bottom: ${theme.spacing.md};
  font-weight: 600;
`

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.md};
  margin-top: 10px;
`

const ToggleLabel = styled.span`
  font-size: 13px;
  color: ${theme.colors.text};
  flex: 1;
`

const Toggle = styled.button<{ $on: boolean }>`
  width: 46px;
  height: 26px;
  border-radius: 13px;
  border: none;
  background: ${({ $on }) => ($on ? theme.colors.primary : theme.colors.surface2)};
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: ${({ $on }) => ($on ? '23px' : '3px')};
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    transition: left 0.2s;
  }
`

const TimeInput = styled.input`
  display: block;
  padding: 10px 12px;
  border: 1px solid ${theme.colors.border};
  border-radius: 10px;
  font-size: 13px;
  color: ${theme.colors.text};
  background: ${theme.colors.surface2};
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  color-scheme: dark;
  -webkit-appearance: none;
  appearance: none;
  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
  }
  &::-webkit-date-and-time-value {
    text-align: left;
  }
`

const TextInput = styled.input`
  padding: 10px 12px;
  border: 1px solid ${theme.colors.border};
  border-radius: 10px;
  font-size: 13px;
  color: ${theme.colors.text};
  background: ${theme.colors.surface2};
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
  }
  &::placeholder { color: ${theme.colors.textMuted}; }
`

const HintText = styled.p`
  font-size: 11px;
  color: ${theme.colors.textMuted};
  margin: 6px 0 0;
  line-height: 1.5;
`

const GOALS = [
  { value: 'hypertrophy', label: '筋肥大' },
  { value: 'diet', label: 'ダイエット' },
  { value: 'strength', label: '筋力アップ' },
  { value: 'health', label: '健康維持' },
]

const LEVELS = [
  { value: 'beginner', label: '初心者' },
  { value: 'intermediate', label: '中級者' },
  { value: 'advanced', label: '上級者' },
]

const EQUIPMENT = [
  { value: 'bodyweight', label: '自重のみ' },
  { value: 'dumbbell', label: 'ダンベル' },
  { value: 'barbell', label: 'バーベル' },
  { value: 'gym', label: 'ジム器具' },
]

const BIRTH_YEAR_OPTIONS = [
  { value: '20s', label: '20代' },
  { value: '30s', label: '30代' },
  { value: '40s', label: '40代' },
  { value: '50s', label: '50代' },
  { value: '60plus', label: '60代以上' },
]
const SEX_OPTIONS = [
  { value: 'male', label: '男性' },
  { value: 'female', label: '女性' },
  { value: 'other', label: '回答しない' },
]
const MUSCLE_OPTIONS = [
  { value: 'chest', label: '胸' },
  { value: 'back', label: '背中' },
  { value: 'legs', label: '脚' },
  { value: 'shoulders', label: '肩' },
  { value: 'arms', label: '腕' },
  { value: 'core', label: '腹' },
]
const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: '座り中心' },
  { value: 'light', label: '軽い活動' },
  { value: 'moderate', label: '活発' },
  { value: 'active', label: 'かなり活動的' },
]

const DAYS_OF_WEEK = [
  { value: 0, label: '日', isHoliday: true },
  { value: 1, label: '月', isHoliday: false },
  { value: 2, label: '火', isHoliday: false },
  { value: 3, label: '水', isHoliday: false },
  { value: 4, label: '木', isHoliday: false },
  { value: 5, label: '金', isHoliday: false },
  { value: 6, label: '土', isHoliday: true },
]

function labelOf<T extends { value: string; label: string }>(opts: T[], v: string): string {
  return opts.find((o) => o.value === v)?.label ?? v
}

export default function Profile({ userId }: { userId: string }) {
  const tour = useTour()
  const navigate = useNavigate()

  // 編集中の値
  const [goal, setGoal] = useState('hypertrophy')
  const [level, setLevel] = useState('beginner')
  const [equipment, setEquipment] = useState<string[]>(['bodyweight'])
  const [frequency, setFrequency] = useState(3)

  // セットアップ追加項目
  const [birthYearRange, setBirthYearRange] = useState('')
  const [sex, setSex] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [targetMuscleGroups, setTargetMuscleGroups] = useState<string[]>([])
  const [activityLevel, setActivityLevel] = useState('')
  const [bodyFatPercent, setBodyFatPercent] = useState('')
  const [targetWeightKg, setTargetWeightKg] = useState('')
  const [targetBodyFatPercent, setTargetBodyFatPercent] = useState('')
  const [setupCompleted, setSetupCompleted] = useState(false)
  const [aboutMode, setAboutMode] = useState<'view' | 'edit'>('view')

  const [notificationEnabled, setNotificationEnabled] = useState(false)
  const [notificationTime, setNotificationTime] = useState('09:00')
  const [notificationDays, setNotificationDays] = useState<number[]>([])
  const [autoSendAnalysisEnabled, setAutoSendAnalysisEnabled] = useState(false)
  const [autoSendAnalysisMessage, setAutoSendAnalysisMessage] = useState('今日の記録を分析して')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 編集モード（profile / notification をそれぞれ独立に切替可能）
  const [profileMode, setProfileMode] = useState<'view' | 'edit'>('view')
  const [notifMode, setNotifMode] = useState<'view' | 'edit'>('view')
  // 設定済みかどうか（goal が入っていれば設定済み）
  const [hasInitialData, setHasInitialData] = useState(false)

  useEffect(() => {
    getProfile(userId)
      .then((d) => {
        if (d.profile?.goal) setGoal(d.profile.goal)
        if (d.profile?.level) setLevel(d.profile.level)
        if (d.profile?.equipment) {
          setEquipment(Array.isArray(d.profile.equipment) ? d.profile.equipment : [d.profile.equipment])
        }
        if (d.profile?.frequency) setFrequency(d.profile.frequency)
        if (d.profile?.birthYearRange) setBirthYearRange(d.profile.birthYearRange)
        if (d.profile?.sex) setSex(d.profile.sex)
        if (d.profile?.heightCm) setHeightCm(String(d.profile.heightCm))
        if (d.profile?.weightKg) setWeightKg(String(d.profile.weightKg))
        if (Array.isArray(d.profile?.targetMuscleGroups)) {
          setTargetMuscleGroups(d.profile.targetMuscleGroups)
        }
        if (d.profile?.activityLevel) setActivityLevel(d.profile.activityLevel)
        if (d.profile?.bodyFatPercent != null) setBodyFatPercent(String(d.profile.bodyFatPercent))
        if (d.profile?.targetWeightKg != null) setTargetWeightKg(String(d.profile.targetWeightKg))
        if (d.profile?.targetBodyFatPercent != null) setTargetBodyFatPercent(String(d.profile.targetBodyFatPercent))
        setSetupCompleted(!!d.profile?.setupCompleted)
        if (d.settings?.notificationEnabled !== undefined) {
          setNotificationEnabled(d.settings.notificationEnabled)
        }
        if (d.settings?.notificationTime) {
          setNotificationTime(d.settings.notificationTime)
        }
        if (Array.isArray(d.settings?.notificationDays)) {
          setNotificationDays(d.settings!.notificationDays!)
        }
        if (d.settings?.autoSendAnalysisEnabled !== undefined) {
          setAutoSendAnalysisEnabled(d.settings.autoSendAnalysisEnabled)
        }
        if (d.settings?.autoSendAnalysisMessage) {
          setAutoSendAnalysisMessage(d.settings.autoSendAnalysisMessage)
        }
        const initialized = !!d.profile?.goal
        setHasInitialData(initialized)
        if (!initialized) {
          setProfileMode('edit')
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [userId])

  const toggleEquipment = (val: string) => {
    setEquipment((prev) =>
      prev.includes(val) ? prev.filter((e) => e !== val) : [...prev, val],
    )
  }

  const toggleDay = (val: number) => {
    setNotificationDays((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val].sort(),
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await Promise.all([
        updateProfile(userId, {
          goal,
          level,
          equipment,
          frequency,
          birthYearRange: birthYearRange || undefined,
          sex: sex || undefined,
          heightCm: heightCm ? Number(heightCm) : null,
          weightKg: weightKg ? Number(weightKg) : null,
          targetMuscleGroups,
          activityLevel: activityLevel || undefined,
          bodyFatPercent: bodyFatPercent ? Number(bodyFatPercent) : null,
          targetWeightKg: targetWeightKg ? Number(targetWeightKg) : null,
          targetBodyFatPercent: targetBodyFatPercent ? Number(targetBodyFatPercent) : null,
        }),
        updateNotificationSettings(userId, {
          notificationEnabled,
          notificationTime,
          notificationDays,
          autoSendAnalysisEnabled,
          autoSendAnalysisMessage,
        }),
      ])
      setSaved(true)
      setHasInitialData(true)
      setProfileMode('view')
      setNotifMode('view')
      setAboutMode('view')
      setTimeout(() => setSaved(false), 3000)
    } catch {
      alert('保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  const dayLabel = (days: number[]) => {
    if (days.length === 0) return 'なし'
    return [...days].sort().map((d) => DAYS_OF_WEEK[d].label).join(' ')
  }

  const isAnyEdit = profileMode === 'edit' || notifMode === 'edit' || aboutMode === 'edit' || !hasInitialData

  const toggleMuscle = (val: string) => {
    setTargetMuscleGroups((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val],
    )
  }

  // ===== About (view / edit) =====
  const aboutSection = aboutMode === 'view' && hasInitialData ? (
    <Card>
      <SectionHeader>
        <SectionLabel>あなたについて</SectionLabel>
        <EditButton onClick={() => setAboutMode('edit')}>編集</EditButton>
      </SectionHeader>
      <ViewRow><ViewLabel>年代</ViewLabel><ViewValue>{labelOf(BIRTH_YEAR_OPTIONS, birthYearRange) || '(未設定)'}</ViewValue></ViewRow>
      <ViewRow><ViewLabel>性別</ViewLabel><ViewValue>{labelOf(SEX_OPTIONS, sex) || '(未設定)'}</ViewValue></ViewRow>
      <ViewRow><ViewLabel>身長</ViewLabel><ViewValue>{heightCm ? `${heightCm} cm` : '(未設定)'}</ViewValue></ViewRow>
      <ViewRow><ViewLabel>体重</ViewLabel><ViewValue>{weightKg ? `${weightKg} kg` : '(未設定)'}</ViewValue></ViewRow>
      <ViewRow>
        <ViewLabel>重点部位</ViewLabel>
        <ViewValue>
          {targetMuscleGroups.length > 0
            ? targetMuscleGroups.map((m) => labelOf(MUSCLE_OPTIONS, m)).join(' / ')
            : '(未設定)'}
        </ViewValue>
      </ViewRow>
      <ViewRow><ViewLabel>活動レベル</ViewLabel><ViewValue>{labelOf(ACTIVITY_OPTIONS, activityLevel) || '(未設定)'}</ViewValue></ViewRow>
      <ViewRow><ViewLabel>体脂肪率</ViewLabel><ViewValue>{bodyFatPercent ? (Number(bodyFatPercent) < 0 ? 'わからない' : `${bodyFatPercent}%`) : '(未設定)'}</ViewValue></ViewRow>
      <ViewRow><ViewLabel>目標体重</ViewLabel><ViewValue>{targetWeightKg ? `${targetWeightKg} kg` : '(未設定)'}</ViewValue></ViewRow>
      <ViewRow><ViewLabel>目標体脂肪率</ViewLabel><ViewValue>{targetBodyFatPercent ? `${targetBodyFatPercent}%` : '(未設定)'}</ViewValue></ViewRow>
    </Card>
  ) : (
    <Card>
      <SectionHeader>
        <SectionLabel>あなたについて</SectionLabel>
        {hasInitialData && <EditButton onClick={() => setAboutMode('view')}>キャンセル</EditButton>}
      </SectionHeader>
      <Label>年代</Label>
      <OptionGrid style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {BIRTH_YEAR_OPTIONS.map((o) => (
          <OptionButton key={o.value} $selected={birthYearRange === o.value} onClick={() => setBirthYearRange(o.value)}>
            {o.label}
          </OptionButton>
        ))}
      </OptionGrid>

      <Label>性別</Label>
      <OptionGrid style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {SEX_OPTIONS.map((o) => (
          <OptionButton key={o.value} $selected={sex === o.value} onClick={() => setSex(o.value)}>
            {o.label}
          </OptionButton>
        ))}
      </OptionGrid>

      <Label>身長 (cm)</Label>
      <TextInput type="number" inputMode="numeric" placeholder="170" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />

      <Label>体重 (kg)</Label>
      <TextInput type="number" inputMode="decimal" placeholder="65" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />

      <Label>重点的に鍛えたい部位（複数可）</Label>
      <OptionGrid style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {MUSCLE_OPTIONS.map((o) => (
          <OptionButton key={o.value} $selected={targetMuscleGroups.includes(o.value)} onClick={() => toggleMuscle(o.value)}>
            {o.label}
          </OptionButton>
        ))}
      </OptionGrid>

      <Label>日常の活動レベル</Label>
      <OptionGrid>
        {ACTIVITY_OPTIONS.map((o) => (
          <OptionButton key={o.value} $selected={activityLevel === o.value} onClick={() => setActivityLevel(o.value)}>
            {o.label}
          </OptionButton>
        ))}
      </OptionGrid>

      <Label>体脂肪率（任意・%）</Label>
      <TextInput type="number" inputMode="decimal" placeholder="例: 18" value={bodyFatPercent} onChange={(e) => setBodyFatPercent(e.target.value)} />

      <Label>目標体重（任意・kg）</Label>
      <TextInput type="number" inputMode="decimal" placeholder="例: 60" value={targetWeightKg} onChange={(e) => setTargetWeightKg(e.target.value)} />

      <Label>目標体脂肪率（任意・%）</Label>
      <TextInput type="number" inputMode="decimal" placeholder="例: 15" value={targetBodyFatPercent} onChange={(e) => setTargetBodyFatPercent(e.target.value)} />
    </Card>
  )

  // ===== Profile (view / edit) =====
  const profileSection = profileMode === 'view' && hasInitialData ? (
    <Card>
      <SectionHeader>
        <SectionLabel>目標 / トレーニング</SectionLabel>
        <EditButton onClick={() => setProfileMode('edit')}>編集</EditButton>
      </SectionHeader>
      <ViewRow><ViewLabel>目標</ViewLabel><ViewValue>{labelOf(GOALS, goal)}</ViewValue></ViewRow>
      <ViewRow><ViewLabel>レベル</ViewLabel><ViewValue>{labelOf(LEVELS, level)}</ViewValue></ViewRow>
      <ViewRow>
        <ViewLabel>使える器具</ViewLabel>
        <ViewValue>{equipment.length > 0 ? equipment.map((e) => labelOf(EQUIPMENT, e)).join(' / ') : '(未設定)'}</ViewValue>
      </ViewRow>
      <ViewRow><ViewLabel>頻度</ViewLabel><ViewValue>週 {frequency} 回</ViewValue></ViewRow>
    </Card>
  ) : (
    <Card>
      <SectionHeader>
        <SectionLabel>目標 / トレーニング</SectionLabel>
        {hasInitialData && <EditButton onClick={() => setProfileMode('view')}>キャンセル</EditButton>}
      </SectionHeader>
      <Label>トレーニングの目標</Label>
      <OptionGrid data-tour-id="profile-options">
        {GOALS.map((g) => (
          <OptionButton key={g.value} $selected={goal === g.value} onClick={() => setGoal(g.value)}>
            {g.label}
          </OptionButton>
        ))}
      </OptionGrid>

      <Label>トレーニングレベル</Label>
      <OptionGrid style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {LEVELS.map((l) => (
          <OptionButton key={l.value} $selected={level === l.value} onClick={() => setLevel(l.value)}>
            {l.label}
          </OptionButton>
        ))}
      </OptionGrid>

      <Label>利用可能な器具</Label>
      <OptionGrid>
        {EQUIPMENT.map((e) => (
          <OptionButton key={e.value} $selected={equipment.includes(e.value)} onClick={() => toggleEquipment(e.value)}>
            {e.label}
          </OptionButton>
        ))}
      </OptionGrid>

      <Label>週のトレーニング頻度</Label>
      <FrequencyRow>
        {[2, 3, 4, 5, 6, 7].map((n) => (
          <FreqButton key={n} $selected={frequency === n} onClick={() => setFrequency(n)}>
            {n}
          </FreqButton>
        ))}
        <FreqUnit>回/週</FreqUnit>
      </FrequencyRow>
    </Card>
  )

  // ===== Notification (view / edit) =====
  const notifSection = notifMode === 'view' && hasInitialData ? (
    <Card data-tour-id="profile-notifications">
      <SectionHeader>
        <SectionLabel>通知 / その他</SectionLabel>
        <EditButton onClick={() => setNotifMode('edit')}>編集</EditButton>
      </SectionHeader>
      <ViewRow>
        <ViewLabel>通知</ViewLabel>
        <ViewValue>{notificationEnabled ? `ON / ${notificationTime}` : 'OFF'}</ViewValue>
      </ViewRow>
      <ViewRow>
        <ViewLabel>通知曜日</ViewLabel>
        <ViewValue>{notificationEnabled ? dayLabel(notificationDays) : '—'}</ViewValue>
      </ViewRow>
      <ViewRow>
        <ViewLabel>AI自動送信</ViewLabel>
        <ViewValue>{autoSendAnalysisEnabled ? `ON / ${autoSendAnalysisMessage}` : 'OFF'}</ViewValue>
      </ViewRow>
    </Card>
  ) : (
    <Card data-tour-id="profile-notifications">
      <SectionHeader>
        <SectionLabel>通知 / その他</SectionLabel>
        {hasInitialData && <EditButton onClick={() => setNotifMode('view')}>キャンセル</EditButton>}
      </SectionHeader>
      <ToggleRow>
        <ToggleLabel>通知を受け取る</ToggleLabel>
        <Toggle $on={notificationEnabled} onClick={() => setNotificationEnabled((v) => !v)} aria-label="通知のオン/オフ" />
      </ToggleRow>
      {notificationEnabled && (
        <>
          <Label>通知時刻</Label>
          <TimeInput type="time" value={notificationTime} onChange={(e) => setNotificationTime(e.target.value)} />
          <Label>通知する曜日</Label>
          <DayRow>
            {DAYS_OF_WEEK.map((d) => (
              <DayButton
                key={d.value}
                type="button"
                $selected={notificationDays.includes(d.value)}
                $isHoliday={d.isHoliday}
                onClick={() => toggleDay(d.value)}
              >
                {d.label}
              </DayButton>
            ))}
          </DayRow>
          <HintText>
            選択した曜日の通知時刻にリマインダーが届きます。月曜の週次レポートは曜日設定に関わらずプレミアム会員に送信されます。
          </HintText>
        </>
      )}

      <Label>AI自動送信（記録後）</Label>
      <ToggleRow>
        <ToggleLabel>記録後にAIへ自動でメッセージを送る</ToggleLabel>
        <Toggle $on={autoSendAnalysisEnabled} onClick={() => setAutoSendAnalysisEnabled((v) => !v)} aria-label="AI自動送信のオン/オフ" />
      </ToggleRow>
      {autoSendAnalysisEnabled && (
        <>
          <Label>送信メッセージ</Label>
          <TextInput
            type="text"
            value={autoSendAnalysisMessage}
            onChange={(e) => setAutoSendAnalysisMessage(e.target.value.slice(0, 200))}
            placeholder="例: 今日の記録を分析して"
            maxLength={200}
          />
          <HintText>
            記録画面の「分析してもらう」を押すと、自動でこのメッセージがLINEに送信されます。
          </HintText>
        </>
      )}
    </Card>
  )

  return (
    <Page>
      <Title>プロフィール設定</Title>

      {saved && <SuccessMsg>保存しました！</SuccessMsg>}

      {!setupCompleted && hasInitialData && (
        <SetupNudge>
          <SetupNudgeText>
            セットアップを完了すると、AIのアドバイスが体格・年代・活動量に基づいて最適化されます。
          </SetupNudgeText>
          <SetupNudgeButton onClick={() => navigate('/setup')}>セットアップ</SetupNudgeButton>
        </SetupNudge>
      )}

      {profileSection}
      {aboutSection}
      {notifSection}

      <SectionLabel style={{ marginBottom: 8 }}>規約・ポリシー</SectionLabel>
      <LegalCard>
        <LegalLink onClick={() => openExternalUrl('https://muscle-coach-ai.web.app/terms.html')}>
          利用規約
          <LegalLinkArrow>›</LegalLinkArrow>
        </LegalLink>
        <LegalLink onClick={() => openExternalUrl('https://muscle-coach-ai.web.app/privacy.html')}>
          プライバシーポリシー
          <LegalLinkArrow>›</LegalLinkArrow>
        </LegalLink>
        <LegalLink onClick={() => openExternalUrl('https://muscle-coach-ai.web.app/commerce.html')}>
          特定商取引法に基づく表記
          <LegalLinkArrow>›</LegalLinkArrow>
        </LegalLink>
      </LegalCard>

      {isAnyEdit ? (
        <>
          <SaveButton data-tour-id="profile-save" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '設定を保存'}
          </SaveButton>
          {hasInitialData && (
            <CancelButton onClick={() => { setProfileMode('view'); setNotifMode('view'); setAboutMode('view') }}>
              キャンセル
            </CancelButton>
          )}
        </>
      ) : (
        <TourLinkButton onClick={() => tour.start()}>
          操作方法を見る
        </TourLinkButton>
      )}
    </Page>
  )
}
