import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { theme } from '../theme'
import { updateProfile, updateNotificationSettings, getProfile } from '../api'
import Loading from '../components/Loading'

const Page = styled.div`
  padding: ${theme.spacing.md};
  padding-bottom: 80px;
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

const SectionLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${theme.colors.textMuted};
  letter-spacing: 0.06em;
  margin-bottom: 10px;
  text-transform: uppercase;
`

const Label = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: ${theme.colors.textMuted};
  margin: ${theme.spacing.md} 0 8px;
  &:first-child { margin-top: 0; }
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
  padding: 10px 12px;
  border: 1px solid ${theme.colors.border};
  border-radius: 10px;
  font-size: 13px;
  color: ${theme.colors.text};
  background: ${theme.colors.surface2};
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  color-scheme: dark;
  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
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

export default function Profile({ userId }: { userId: string }) {
  const [goal, setGoal] = useState('hypertrophy')
  const [level, setLevel] = useState('beginner')
  const [equipment, setEquipment] = useState<string[]>(['bodyweight'])
  const [frequency, setFrequency] = useState(3)
  const [trainerName, setTrainerName] = useState('')
  const [notificationEnabled, setNotificationEnabled] = useState(false)
  const [notificationTime, setNotificationTime] = useState('09:00')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getProfile(userId)
      .then((d) => {
        if (d.profile?.goal) setGoal(d.profile.goal)
        if (d.profile?.level) setLevel(d.profile.level)
        if (d.profile?.equipment) {
          setEquipment(Array.isArray(d.profile.equipment) ? d.profile.equipment : [d.profile.equipment])
        }
        if (d.profile?.frequency) setFrequency(d.profile.frequency)
        if (d.profile?.trainerName) setTrainerName(d.profile.trainerName)
        if (d.settings?.notificationEnabled !== undefined) {
          setNotificationEnabled(d.settings.notificationEnabled)
        }
        if (d.settings?.notificationTime) {
          setNotificationTime(d.settings.notificationTime)
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

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await Promise.all([
        updateProfile(userId, { goal, level, equipment, frequency, trainerName: trainerName || undefined }),
        updateNotificationSettings(userId, { notificationEnabled, notificationTime }),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      alert('保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <Page>
      <Title>プロフィール設定</Title>

      {saved && <SuccessMsg>保存しました！</SuccessMsg>}

      <Card>
        <SectionLabel>トレーナー</SectionLabel>
        <Label>トレーナーの名前</Label>
        <TextInput
          data-tour-id="profile-trainer-name"
          type="text"
          value={trainerName}
          onChange={(e) => setTrainerName(e.target.value.slice(0, 20))}
          placeholder="例：コウ、田中トレーナー など"
          maxLength={20}
        />
        <HintText>LINEのメッセージに表示される名前です（空欄の場合はデフォルト名）</HintText>

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
            <OptionButton
              key={e.value}
              $selected={equipment.includes(e.value)}
              onClick={() => toggleEquipment(e.value)}
            >
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

      <Card data-tour-id="profile-notifications">
        <SectionLabel>通知</SectionLabel>
        <ToggleRow>
          <ToggleLabel>通知（日次リマインダー・週次レポート）</ToggleLabel>
          <Toggle
            $on={notificationEnabled}
            onClick={() => setNotificationEnabled((v) => !v)}
            aria-label="通知のオン/オフ"
          />
        </ToggleRow>
        {notificationEnabled && (
          <>
            <Label>通知時刻</Label>
            <TimeInput
              type="time"
              value={notificationTime}
              onChange={(e) => setNotificationTime(e.target.value)}
            />
          </>
        )}
      </Card>

      <SaveButton data-tour-id="profile-save" onClick={handleSave} disabled={saving}>
        {saving ? '保存中...' : '設定を保存'}
      </SaveButton>
    </Page>
  )
}
