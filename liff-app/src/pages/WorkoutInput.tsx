import { useState } from 'react'
import styled from 'styled-components'
import { theme } from '../theme'
import { saveWorkout } from '../api'
import { closeLiff } from '../liff'

const COMMON_EXERCISES = [
  'ベンチプレス', 'スクワット', 'デッドリフト',
  'ショルダープレス', 'ラットプルダウン', 'ダンベルカール',
  'トライセップス', 'レッグプレス', 'インクラインベンチ',
]

interface Exercise {
  name: string
  weight: string
  reps: string
  sets: string
}

const emptyExercise = (): Exercise => ({ name: '', weight: '', reps: '', sets: '' })

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

const FieldLabel = styled.label`
  font-size: 10px;
  font-weight: 700;
  color: ${theme.colors.textMuted};
  margin-bottom: 6px;
  display: block;
  letter-spacing: 0.04em;
`

const DateInput = styled.input`
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 11px 13px;
  border: 1px solid ${theme.colors.border};
  border-radius: 9px;
  background: ${theme.colors.surface2};
  color: ${theme.colors.text};
  font-size: 14px;
  font-family: inherit;
  margin-bottom: ${theme.spacing.lg};
  box-sizing: border-box;
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

const Card = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 18px;
  padding: 14px 16px;
  margin-bottom: ${theme.spacing.md};
  position: relative;
`

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
`

const CardTitle = styled.span`
  font-size: 11px;
  font-weight: 700;
  color: ${theme.colors.textMuted};
  letter-spacing: 0.04em;
`

const DeleteButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.danger};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px;
`

const QuickTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
`

const QuickTag = styled.button<{ $selected: boolean }>`
  padding: 5px 11px;
  border: 1px solid ${({ $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  border-radius: ${theme.borderRadius.full};
  background: ${({ $selected }) => ($selected ? theme.colors.primaryDim : 'transparent')};
  color: ${({ $selected }) => ($selected ? theme.colors.primary : theme.colors.textMuted)};
  font-size: 11.5px;
  font-weight: ${({ $selected }) => ($selected ? 700 : 500)};
  cursor: pointer;
  white-space: nowrap;
`

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${theme.colors.border};
  border-radius: 9px;
  background: ${theme.colors.surface2};
  color: ${theme.colors.text};
  font-size: 13px;
  font-family: inherit;
  box-sizing: border-box;
  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
  }
  &::placeholder { color: ${theme.colors.textMuted}; }
`

const FieldRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
`

const AddButton = styled.button`
  width: 100%;
  padding: 13px;
  border: 1.5px dashed ${theme.colors.borderMd};
  border-radius: 14px;
  background: none;
  color: ${theme.colors.textMuted};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: ${theme.spacing.lg};
  &:active { color: ${theme.colors.text}; }
`

const SaveButton = styled.button<{ disabled: boolean }>`
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 14px;
  background: ${({ disabled }) => (disabled ? theme.colors.textFaint : theme.colors.primary)};
  color: ${({ disabled }) => (disabled ? theme.colors.textMuted : '#fff')};
  font-size: 15px;
  font-weight: 700;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  &:active { opacity: ${({ disabled }) => (disabled ? 1 : 0.85)}; }
`

const SuccessBar = styled.div`
  text-align: center;
  padding: 12px;
  background: ${theme.colors.primaryDim};
  border: 1px solid ${theme.colors.primaryBorder};
  border-radius: 12px;
  color: ${theme.colors.primary};
  font-weight: 700;
  font-size: 13px;
  margin-bottom: ${theme.spacing.sm};
`

const AiAnalysisButton = styled.button`
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: 1.5px solid ${theme.colors.primary};
  border-radius: 12px;
  color: ${theme.colors.primary};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: ${theme.spacing.md};
  &:active { background: ${theme.colors.primaryDim}; }
`

function todayString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function WorkoutInput({ userId }: { userId: string }) {
  const [date, setDate] = useState(todayString())
  const [exercises, setExercises] = useState<Exercise[]>([emptyExercise()])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const updateExercise = (index: number, field: keyof Exercise, value: string) => {
    setExercises((prev) => prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex)))
  }

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index))
  }

  const addExercise = () => {
    setExercises((prev) => [...prev, emptyExercise()])
  }

  const canSave = exercises.length > 0 && exercises.some((ex) => ex.name.trim() !== '')

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    setSuccess(false)
    try {
      const payload = exercises
        .filter((ex) => ex.name.trim() !== '')
        .map((ex) => ({
          name: ex.name.trim(),
          weight: ex.weight ? Number(ex.weight) : undefined,
          reps: ex.reps ? Number(ex.reps) : undefined,
          sets: ex.sets ? Number(ex.sets) : undefined,
        }))
      await saveWorkout(userId, payload, date)
      setSuccess(true)
      setExercises([emptyExercise()])
      setDate(todayString())
    } catch {
      alert('保存に失敗しました。再度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page>
      <Title>ワークアウト記録</Title>

      <FieldLabel>日付</FieldLabel>
      <DateInput data-tour-id="input-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      {exercises.map((ex, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle>種目 {i + 1}</CardTitle>
            {exercises.length > 1 && (
              <DeleteButton onClick={() => removeExercise(i)}>削除</DeleteButton>
            )}
          </CardHeader>

          <QuickTags data-tour-id={i === 0 ? 'input-tags' : undefined}>
            {COMMON_EXERCISES.map((name) => (
              <QuickTag
                key={name}
                $selected={ex.name === name}
                onClick={() => updateExercise(i, 'name', name)}
              >
                {name}
              </QuickTag>
            ))}
          </QuickTags>

          <Input
            placeholder="種目名を入力"
            value={ex.name}
            onChange={(e) => updateExercise(i, 'name', e.target.value)}
          />

          <FieldRow data-tour-id={i === 0 ? 'input-fields' : undefined}>
            <div>
              <FieldLabel>重量(kg)</FieldLabel>
              <Input
                type="number"
                placeholder="0"
                value={ex.weight}
                onChange={(e) => updateExercise(i, 'weight', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>回数</FieldLabel>
              <Input
                type="number"
                placeholder="0"
                value={ex.reps}
                onChange={(e) => updateExercise(i, 'reps', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>セット数</FieldLabel>
              <Input
                type="number"
                placeholder="0"
                value={ex.sets}
                onChange={(e) => updateExercise(i, 'sets', e.target.value)}
              />
            </div>
          </FieldRow>
        </Card>
      ))}

      <AddButton onClick={addExercise}>+ 種目を追加</AddButton>

      {success && (
        <>
          <SuccessBar>記録しました！</SuccessBar>
          <AiAnalysisButton onClick={closeLiff}>
            AIコーチに今日の記録を分析してもらう →
          </AiAnalysisButton>
        </>
      )}

      <SaveButton data-tour-id="input-save" disabled={!canSave || saving} onClick={handleSave}>
        {saving ? '保存中...' : '保存する'}
      </SaveButton>
    </Page>
  )
}
