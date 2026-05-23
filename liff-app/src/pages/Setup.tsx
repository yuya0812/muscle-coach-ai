import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { theme } from '../theme'
import { getProfile, updateProfile, type ProfileUpdateInput } from '../api'
import Loading from '../components/Loading'

const TOTAL_STEPS = 4

// === 設問定義（後から増やす場合はここに追加） ===
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
const LEVEL_OPTIONS = [
  { value: 'beginner', label: '初心者' },
  { value: 'intermediate', label: '中級者' },
  { value: 'advanced', label: '上級者' },
]
const GOAL_OPTIONS = [
  { value: 'hypertrophy', label: '筋肥大' },
  { value: 'diet', label: 'ダイエット' },
  { value: 'strength', label: '筋力アップ' },
  { value: 'health', label: '健康維持' },
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
  { value: 'sedentary', label: '座り中心', sub: 'デスクワーク中心、ほぼ運動なし' },
  { value: 'light', label: '軽い活動', sub: '週1〜2回 軽い運動 / 日常で歩く程度' },
  { value: 'moderate', label: '活発', sub: '週3〜5回の運動 / 立ち仕事中心' },
  { value: 'active', label: 'かなり活動的', sub: '毎日運動 / 肉体労働あり' },
]
const BODY_FAT_OPTIONS = [
  { value: 12, label: '〜15%' },
  { value: 17, label: '15〜20%' },
  { value: 22, label: '20〜25%' },
  { value: 28, label: '25〜30%' },
  { value: 33, label: '30%以上' },
  { value: -1, label: 'わからない' },
]

const Page = styled.div`
  padding: ${theme.spacing.md};
  padding-bottom: ${theme.layout.bottomNavSpace};
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  animation: fadeUp 0.22s ease both;
`

const ProgressBar = styled.div`
  display: flex;
  gap: 4px;
  margin-bottom: ${theme.spacing.lg};
`

const ProgressSeg = styled.div<{ $active: boolean }>`
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: ${({ $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  transition: background 0.2s;
`

const StepCounter = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${theme.colors.textMuted};
  letter-spacing: 0.06em;
  margin-bottom: 8px;
  text-transform: uppercase;
`

const StepTitle = styled.h1`
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: ${theme.colors.text};
  margin: 0 0 8px;
`

const StepSub = styled.p`
  font-size: 13px;
  color: ${theme.colors.textMuted};
  margin: 0 0 ${theme.spacing.lg};
  line-height: 1.6;
`

const FieldGroup = styled.div`
  margin-bottom: ${theme.spacing.lg};
`

const FieldLabel = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: ${theme.colors.text};
  margin-bottom: 8px;
`

const FieldHint = styled.div`
  font-size: 11px;
  color: ${theme.colors.textMuted};
  margin-bottom: 8px;
`

const ButtonGrid = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 2}, 1fr);
  gap: 8px;
`

const ChoiceButton = styled.button<{ $selected: boolean }>`
  padding: 12px 8px;
  border: 1.5px solid ${({ $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  border-radius: 11px;
  background: ${({ $selected }) => ($selected ? theme.colors.primaryDim : 'transparent')};
  color: ${({ $selected }) => ($selected ? theme.colors.primary : theme.colors.textMuted)};
  font-size: 13px;
  font-weight: ${({ $selected }) => ($selected ? 700 : 500)};
  cursor: pointer;
  text-align: center;
`

const RichChoiceButton = styled.button<{ $selected: boolean }>`
  padding: 12px 14px;
  border: 1.5px solid ${({ $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  border-radius: 11px;
  background: ${({ $selected }) => ($selected ? theme.colors.primaryDim : 'transparent')};
  color: ${({ $selected }) => ($selected ? theme.colors.primary : theme.colors.text)};
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const RichChoiceLabel = styled.span<{ $selected: boolean }>`
  font-size: 14px;
  font-weight: ${({ $selected }) => ($selected ? 700 : 600)};
`

const RichChoiceSub = styled.span`
  font-size: 11px;
  color: ${theme.colors.textMuted};
`

const NumberInput = styled.input`
  display: block;
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid ${theme.colors.border};
  border-radius: 10px;
  background: ${theme.colors.surface2};
  color: ${theme.colors.text};
  font-size: 16px;
  font-family: inherit;
  box-sizing: border-box;
  -webkit-appearance: none;
  appearance: none;
  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
  }
  &::-webkit-outer-spin-button, &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`

const InputSuffix = styled.span`
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  color: ${theme.colors.textMuted};
  pointer-events: none;
`

const InputWrap = styled.div`
  position: relative;
`

const NavBar = styled.div`
  display: flex;
  gap: 10px;
  margin-top: auto;
  padding-top: ${theme.spacing.md};
`

const NavButton = styled.button<{ $primary?: boolean; $disabled?: boolean }>`
  flex: 1;
  padding: 14px;
  border: ${({ $primary }) => ($primary ? 'none' : `1px solid ${theme.colors.border}`)};
  border-radius: 12px;
  background: ${({ $primary, $disabled }) =>
    $disabled ? theme.colors.textFaint : $primary ? theme.colors.primary : 'transparent'};
  color: ${({ $primary, $disabled }) =>
    $disabled ? theme.colors.textMuted : $primary ? '#fff' : theme.colors.text};
  font-size: 14px;
  font-weight: 700;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  &:active { opacity: ${({ $disabled }) => ($disabled ? 1 : 0.85)}; }
`

const SkipLink = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.textMuted};
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
  padding: 6px 0;
  margin-top: 6px;
  align-self: center;
  &:active { color: ${theme.colors.text}; }
`

const ErrorText = styled.div`
  color: ${theme.colors.danger};
  font-size: 12px;
  margin-top: 6px;
`

interface SetupState {
  birthYearRange: string
  sex: string
  heightCm: string // フォーム上は文字列で扱う
  weightKg: string
  level: string
  frequency: number
  goal: string
  targetMuscleGroups: string[]
  activityLevel: string
  bodyFatChoice: number | null // BODY_FAT_OPTIONSのvalue。-1=わからない、null=未選択
  targetWeightKg: string
  targetBodyFatPercent: string
}

function StepShell({
  step,
  title,
  subtitle,
  children,
  canNext,
  canBack,
  optionalSkippable,
  onBack,
  onNext,
  onSkip,
  isLast,
}: {
  step: number
  title: string
  subtitle?: string
  children: ReactNode
  canNext: boolean
  canBack: boolean
  optionalSkippable?: boolean
  onBack: () => void
  onNext: () => void
  onSkip?: () => void
  isLast: boolean
}) {
  return (
    <Page>
      <ProgressBar>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <ProgressSeg key={i} $active={i < step} />
        ))}
      </ProgressBar>
      <StepCounter>STEP {step} / {TOTAL_STEPS}</StepCounter>
      <StepTitle>{title}</StepTitle>
      {subtitle && <StepSub>{subtitle}</StepSub>}
      {children}
      <NavBar>
        {canBack && (
          <NavButton onClick={onBack}>戻る</NavButton>
        )}
        <NavButton $primary $disabled={!canNext} onClick={canNext ? onNext : undefined}>
          {isLast ? 'はじめる' : '次へ'}
        </NavButton>
      </NavBar>
      {optionalSkippable && onSkip && (
        <SkipLink onClick={onSkip}>あとで設定する</SkipLink>
      )}
    </Page>
  )
}

export default function Setup({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [state, setState] = useState<SetupState>({
    birthYearRange: '',
    sex: '',
    heightCm: '',
    weightKg: '',
    level: 'beginner',
    frequency: 3,
    goal: 'hypertrophy',
    targetMuscleGroups: [],
    activityLevel: '',
    bodyFatChoice: null,
    targetWeightKg: '',
    targetBodyFatPercent: '',
  })

  // 既存値があれば初期値として埋める
  useEffect(() => {
    getProfile(userId)
      .then((p) => {
        if (p.profile.setupCompleted) {
          // 既にsetup完了済みなら即dashboardへ
          navigate('/dashboard', { replace: true })
          return
        }
        setState((s) => ({
          ...s,
          birthYearRange: p.profile.birthYearRange || '',
          sex: p.profile.sex || '',
          heightCm: p.profile.heightCm ? String(p.profile.heightCm) : '',
          weightKg: p.profile.weightKg ? String(p.profile.weightKg) : '',
          level: p.profile.level || 'beginner',
          frequency: p.profile.frequency || 3,
          goal: p.profile.goal || 'hypertrophy',
          targetMuscleGroups: p.profile.targetMuscleGroups ?? [],
          activityLevel: p.profile.activityLevel || '',
          bodyFatChoice: p.profile.bodyFatPercent ?? null,
          targetWeightKg: p.profile.targetWeightKg ? String(p.profile.targetWeightKg) : '',
          targetBodyFatPercent: p.profile.targetBodyFatPercent ? String(p.profile.targetBodyFatPercent) : '',
        }))
      })
      .catch((e) => {
        console.error(e)
        setError('プロフィール取得に失敗しました')
      })
      .finally(() => setLoading(false))
  }, [userId, navigate])

  const set = <K extends keyof SetupState>(key: K, value: SetupState[K]) =>
    setState((s) => ({ ...s, [key]: value }))

  const toggleMuscle = (val: string) => {
    set(
      'targetMuscleGroups',
      state.targetMuscleGroups.includes(val)
        ? state.targetMuscleGroups.filter((v) => v !== val)
        : [...state.targetMuscleGroups, val],
    )
  }

  // 各ステップの「次へ」可否判定
  const canNext = (() => {
    if (step === 1) {
      const h = Number(state.heightCm)
      const w = Number(state.weightKg)
      return (
        !!state.birthYearRange &&
        !!state.sex &&
        Number.isFinite(h) && h >= 100 && h <= 230 &&
        Number.isFinite(w) && w >= 20 && w <= 250
      )
    }
    if (step === 2) {
      return (
        !!state.level &&
        state.frequency >= 1 && state.frequency <= 7 &&
        !!state.goal &&
        state.targetMuscleGroups.length > 0
      )
    }
    if (step === 3) {
      return !!state.activityLevel
      // 体脂肪率は任意（スキップ可）
    }
    if (step === 4) {
      return true // 全任意
    }
    return false
  })()

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const payload: ProfileUpdateInput = {
        birthYearRange: state.birthYearRange,
        sex: state.sex,
        heightCm: Number(state.heightCm),
        weightKg: Number(state.weightKg),
        level: state.level,
        frequency: state.frequency,
        goal: state.goal,
        targetMuscleGroups: state.targetMuscleGroups,
        activityLevel: state.activityLevel,
        bodyFatPercent:
          state.bodyFatChoice !== null && state.bodyFatChoice >= 0
            ? state.bodyFatChoice
            : null,
        targetWeightKg: state.targetWeightKg ? Number(state.targetWeightKg) : null,
        targetBodyFatPercent: state.targetBodyFatPercent ? Number(state.targetBodyFatPercent) : null,
        setupCompleted: true,
      }
      await updateProfile(userId, payload)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      console.error(e)
      setError('保存に失敗しました。もう一度お試しください。')
      setSubmitting(false)
    }
  }

  if (loading) return <Loading message="読み込み中..." />

  // === Step 1: あなたについて ===
  if (step === 1) {
    return (
      <StepShell
        step={1}
        title="あなたについて"
        subtitle="AIがあなた専用のアドバイスを提供するための基本情報です。"
        canNext={canNext}
        canBack={false}
        onBack={() => {}}
        onNext={() => setStep(2)}
        isLast={false}
      >
        <FieldGroup>
          <FieldLabel>年代</FieldLabel>
          <ButtonGrid $cols={3}>
            {BIRTH_YEAR_OPTIONS.map((o) => (
              <ChoiceButton
                key={o.value}
                $selected={state.birthYearRange === o.value}
                onClick={() => set('birthYearRange', o.value)}
              >
                {o.label}
              </ChoiceButton>
            ))}
          </ButtonGrid>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel>性別</FieldLabel>
          <ButtonGrid $cols={3}>
            {SEX_OPTIONS.map((o) => (
              <ChoiceButton
                key={o.value}
                $selected={state.sex === o.value}
                onClick={() => set('sex', o.value)}
              >
                {o.label}
              </ChoiceButton>
            ))}
          </ButtonGrid>
          <FieldHint>BMR（基礎代謝）の計算式が変わります。</FieldHint>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel>身長</FieldLabel>
          <InputWrap>
            <NumberInput
              type="number"
              inputMode="numeric"
              min={100}
              max={230}
              placeholder="170"
              value={state.heightCm}
              onChange={(e) => set('heightCm', e.target.value)}
            />
            <InputSuffix>cm</InputSuffix>
          </InputWrap>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel>体重</FieldLabel>
          <InputWrap>
            <NumberInput
              type="number"
              inputMode="decimal"
              min={20}
              max={250}
              placeholder="65"
              value={state.weightKg}
              onChange={(e) => set('weightKg', e.target.value)}
            />
            <InputSuffix>kg</InputSuffix>
          </InputWrap>
        </FieldGroup>
      </StepShell>
    )
  }

  // === Step 2: トレーニング ===
  if (step === 2) {
    return (
      <StepShell
        step={2}
        title="トレーニング"
        subtitle="あなたに合うメニューや強度を判断します。"
        canNext={canNext}
        canBack
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
        isLast={false}
      >
        <FieldGroup>
          <FieldLabel>経験レベル</FieldLabel>
          <ButtonGrid $cols={3}>
            {LEVEL_OPTIONS.map((o) => (
              <ChoiceButton
                key={o.value}
                $selected={state.level === o.value}
                onClick={() => set('level', o.value)}
              >
                {o.label}
              </ChoiceButton>
            ))}
          </ButtonGrid>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel>主な目標</FieldLabel>
          <ButtonGrid>
            {GOAL_OPTIONS.map((o) => (
              <ChoiceButton
                key={o.value}
                $selected={state.goal === o.value}
                onClick={() => set('goal', o.value)}
              >
                {o.label}
              </ChoiceButton>
            ))}
          </ButtonGrid>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel>週のトレーニング頻度</FieldLabel>
          <ButtonGrid $cols={6}>
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <ChoiceButton
                key={n}
                $selected={state.frequency === n}
                onClick={() => set('frequency', n)}
              >
                {n}
              </ChoiceButton>
            ))}
          </ButtonGrid>
          <FieldHint>週の回数（目標）</FieldHint>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel>重点的に鍛えたい部位</FieldLabel>
          <ButtonGrid $cols={3}>
            {MUSCLE_OPTIONS.map((o) => (
              <ChoiceButton
                key={o.value}
                $selected={state.targetMuscleGroups.includes(o.value)}
                onClick={() => toggleMuscle(o.value)}
              >
                {o.label}
              </ChoiceButton>
            ))}
          </ButtonGrid>
          <FieldHint>複数選択OK。AIがあなたの優先部位を考慮してメニューを提案します。</FieldHint>
        </FieldGroup>
      </StepShell>
    )
  }

  // === Step 3: ライフスタイル ===
  if (step === 3) {
    return (
      <StepShell
        step={3}
        title="ライフスタイル"
        subtitle="日常の活動量から1日の消費カロリーを推定します。"
        canNext={canNext}
        canBack
        onBack={() => setStep(2)}
        onNext={() => setStep(4)}
        isLast={false}
      >
        <FieldGroup>
          <FieldLabel>日常の活動レベル</FieldLabel>
          <div style={{ display: 'grid', gap: 8 }}>
            {ACTIVITY_OPTIONS.map((o) => (
              <RichChoiceButton
                key={o.value}
                $selected={state.activityLevel === o.value}
                onClick={() => set('activityLevel', o.value)}
              >
                <RichChoiceLabel $selected={state.activityLevel === o.value}>{o.label}</RichChoiceLabel>
                <RichChoiceSub>{o.sub}</RichChoiceSub>
              </RichChoiceButton>
            ))}
          </div>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel>現在の体脂肪率（任意）</FieldLabel>
          <ButtonGrid $cols={3}>
            {BODY_FAT_OPTIONS.map((o) => (
              <ChoiceButton
                key={o.value}
                $selected={state.bodyFatChoice === o.value}
                onClick={() => set('bodyFatChoice', o.value)}
              >
                {o.label}
              </ChoiceButton>
            ))}
          </ButtonGrid>
          <FieldHint>正確に分からなくてOK。「わからない」も選べます。</FieldHint>
        </FieldGroup>
      </StepShell>
    )
  }

  // === Step 4: 目標設定（任意） ===
  return (
    <StepShell
      step={4}
      title="目標設定（任意）"
      subtitle="数値の目標があるとAIの提案がより具体的になります。スキップしてもOKです。"
      canNext={canNext}
      canBack
      optionalSkippable
      onBack={() => setStep(3)}
      onNext={handleSubmit}
      onSkip={handleSubmit}
      isLast
    >
      <FieldGroup>
        <FieldLabel>目標体重（任意）</FieldLabel>
        <InputWrap>
          <NumberInput
            type="number"
            inputMode="decimal"
            min={20}
            max={250}
            placeholder="例: 60"
            value={state.targetWeightKg}
            onChange={(e) => set('targetWeightKg', e.target.value)}
          />
          <InputSuffix>kg</InputSuffix>
        </InputWrap>
      </FieldGroup>

      <FieldGroup>
        <FieldLabel>目標体脂肪率（任意）</FieldLabel>
        <InputWrap>
          <NumberInput
            type="number"
            inputMode="decimal"
            min={1}
            max={60}
            placeholder="例: 15"
            value={state.targetBodyFatPercent}
            onChange={(e) => set('targetBodyFatPercent', e.target.value)}
          />
          <InputSuffix>%</InputSuffix>
        </InputWrap>
      </FieldGroup>

      {error && <ErrorText>{error}</ErrorText>}
      {submitting && <FieldHint>保存中...</FieldHint>}
    </StepShell>
  )
}
