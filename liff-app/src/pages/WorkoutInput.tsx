import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { theme } from '../theme'
import { saveWorkout, getRecentCustomExercises, getProfile, type SaveExerciseInput } from '../api'
import { closeLiff, sendMessageAndCloseLiff } from '../liff'

// BIG3 のみデフォルト。それ以外はユーザーが手入力した履歴から動的に追加。
const BIG3_EXERCISES = ['ベンチプレス', 'スクワット', 'デッドリフト']

interface SetGroupRow {
  weight: string
  reps: string
  sets: string
}

interface ExerciseRow {
  name: string
  setGroups: SetGroupRow[]
}

const emptySetGroup = (): SetGroupRow => ({ weight: '', reps: '', sets: '' })
const emptyExercise = (): ExerciseRow => ({ name: '', setGroups: [emptySetGroup()] })

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
  align-items: center;
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

const HistoryDivider = styled.span`
  font-size: 10px;
  font-weight: 700;
  color: ${theme.colors.textFaint};
  letter-spacing: 0.06em;
  padding: 0 4px;
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

const SetGroupBox = styled.div`
  background: ${theme.colors.bg};
  border: 1px solid ${theme.colors.border};
  border-radius: 11px;
  padding: 10px 12px;
  margin-top: 10px;
  position: relative;
`

const SetGroupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`

const SetGroupNo = styled.span`
  font-size: 10px;
  font-weight: 800;
  color: ${theme.colors.textMuted};
  letter-spacing: 0.06em;
`

const SetGroupRemove = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.textMuted};
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  &:active { color: ${theme.colors.danger}; }
`

const FieldRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
`

const AddSetGroupButton = styled.button`
  width: 100%;
  padding: 8px;
  border: 1px dashed ${theme.colors.borderMd};
  border-radius: 10px;
  background: none;
  color: ${theme.colors.textMuted};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 8px;
  &:active { color: ${theme.colors.text}; }
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
  const [exercises, setExercises] = useState<ExerciseRow[]>([emptyExercise()])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [historyTags, setHistoryTags] = useState<string[]>([])
  const [autoSendEnabled, setAutoSendEnabled] = useState(false)
  const [autoSendMessage, setAutoSendMessage] = useState('今日の記録を分析して')

  // 直近の手入力種目を取得（BIG3を除外して履歴側に重複させない）
  useEffect(() => {
    getRecentCustomExercises(userId, BIG3_EXERCISES, 6)
      .then((res) => setHistoryTags(res.names))
      .catch(() => setHistoryTags([]))
  }, [userId, success]) // 保存成功後にも再取得

  // AI自動送信設定を取得
  useEffect(() => {
    getProfile(userId)
      .then((p) => {
        setAutoSendEnabled(p.settings.autoSendAnalysisEnabled ?? false)
        setAutoSendMessage(p.settings.autoSendAnalysisMessage || '今日の記録を分析して')
      })
      .catch(() => { /* 失敗時はデフォルト動作 */ })
  }, [userId])

  const updateExerciseName = (i: number, name: string) => {
    setExercises((prev) => prev.map((ex, idx) => (idx === i ? { ...ex, name } : ex)))
  }

  const updateSetGroup = (exIdx: number, gIdx: number, field: keyof SetGroupRow, value: string) => {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i !== exIdx
          ? ex
          : {
              ...ex,
              setGroups: ex.setGroups.map((g, j) => (j === gIdx ? { ...g, [field]: value } : g)),
            }
      )
    )
  }

  const addSetGroup = (exIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i !== exIdx ? ex : { ...ex, setGroups: [...ex.setGroups, emptySetGroup()] }))
    )
  }

  const removeSetGroup = (exIdx: number, gIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i !== exIdx ? ex : { ...ex, setGroups: ex.setGroups.filter((_, j) => j !== gIdx) }
      )
    )
  }

  const removeExercise = (i: number) => {
    setExercises((prev) => prev.filter((_, idx) => idx !== i))
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
      const payload: SaveExerciseInput[] = exercises
        .filter((ex) => ex.name.trim() !== '')
        .map((ex) => ({
          name: ex.name.trim(),
          setGroups: ex.setGroups
            .map((g) => ({
              weight: g.weight ? Number(g.weight) : null,
              reps: g.reps ? Number(g.reps) : null,
              sets: g.sets ? Number(g.sets) : null,
            }))
            .filter((g) => g.weight !== null || g.reps !== null || g.sets !== null),
        }))
        .filter((ex) => ex.setGroups.length > 0)
      if (payload.length === 0) {
        alert('少なくとも1セットの数値を入力してください。')
        setSaving(false)
        return
      }
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

  const handleAnalysisCta = async () => {
    if (autoSendEnabled) {
      await sendMessageAndCloseLiff(autoSendMessage || '今日の記録を分析して')
    } else {
      closeLiff()
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
            {BIG3_EXERCISES.map((name) => (
              <QuickTag
                key={name}
                $selected={ex.name === name}
                onClick={() => updateExerciseName(i, name)}
              >
                {name}
              </QuickTag>
            ))}
            {historyTags.length > 0 && <HistoryDivider>履歴</HistoryDivider>}
            {historyTags.map((name) => (
              <QuickTag
                key={`hist-${name}`}
                $selected={ex.name === name}
                onClick={() => updateExerciseName(i, name)}
              >
                {name}
              </QuickTag>
            ))}
          </QuickTags>

          <Input
            placeholder="種目名を入力"
            value={ex.name}
            onChange={(e) => updateExerciseName(i, e.target.value)}
          />

          {ex.setGroups.map((g, gIdx) => (
            <SetGroupBox key={gIdx} data-tour-id={i === 0 && gIdx === 0 ? 'input-fields' : undefined}>
              <SetGroupHeader>
                <SetGroupNo>SET {gIdx + 1}</SetGroupNo>
                {ex.setGroups.length > 1 && (
                  <SetGroupRemove onClick={() => removeSetGroup(i, gIdx)}>削除</SetGroupRemove>
                )}
              </SetGroupHeader>
              <FieldRow>
                <div>
                  <FieldLabel>重量(kg)</FieldLabel>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={g.weight}
                    onChange={(e) => updateSetGroup(i, gIdx, 'weight', e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>回数</FieldLabel>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={g.reps}
                    onChange={(e) => updateSetGroup(i, gIdx, 'reps', e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>セット数</FieldLabel>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={g.sets}
                    onChange={(e) => updateSetGroup(i, gIdx, 'sets', e.target.value)}
                  />
                </div>
              </FieldRow>
            </SetGroupBox>
          ))}
          <AddSetGroupButton onClick={() => addSetGroup(i)}>+ セットを追加</AddSetGroupButton>
        </Card>
      ))}

      <AddButton onClick={addExercise}>+ 種目を追加</AddButton>

      {success && (
        <>
          <SuccessBar>記録しました！</SuccessBar>
          <AiAnalysisButton onClick={handleAnalysisCta}>
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
