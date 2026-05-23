import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { theme } from '../theme'
import { getWorkoutLogs, type WorkoutRecord } from '../api'
import Loading from '../components/Loading'

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
  margin: 0 0 ${theme.spacing.md};
`

const MonthNav = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${theme.spacing.md};
`

const NavButton = styled.button`
  width: 36px;
  height: 36px;
  border: 1px solid ${theme.colors.border};
  border-radius: 10px;
  background: ${theme.colors.surface};
  color: ${theme.colors.text};
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:active { background: ${theme.colors.surface2}; }
`

const MonthLabel = styled.span`
  font-size: 15px;
  font-weight: 700;
  color: ${theme.colors.text};
`

const CalendarWrap = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 18px;
  padding: 12px 10px 14px;
  margin-bottom: ${theme.spacing.lg};
`

const CalendarGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
`

const DayHeader = styled.div`
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: ${theme.colors.textMuted};
  padding: 6px 0;
`

const DayCell = styled.button<{ $hasWorkout: boolean; $selected: boolean; $empty: boolean }>`
  position: relative;
  aspect-ratio: 1;
  border: none;
  border-radius: 9px;
  font-size: 13px;
  cursor: ${({ $empty }) => ($empty ? 'default' : 'pointer')};
  background: ${({ $hasWorkout, $selected }) =>
    $selected
      ? theme.colors.primary
      : $hasWorkout
        ? theme.colors.primaryDim
        : 'transparent'};
  color: ${({ $selected, $hasWorkout, $empty }) =>
    $selected
      ? '#fff'
      : $empty
        ? 'transparent'
        : $hasWorkout
          ? theme.colors.primary
          : theme.colors.textMuted};
  font-weight: ${({ $hasWorkout }) => ($hasWorkout ? 700 : 500)};
  &:active {
    opacity: ${({ $empty }) => ($empty ? 1 : 0.7)};
  }
`

const Dot = styled.span`
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: ${theme.colors.primary};
`

const DetailCard = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: ${theme.spacing.md};
`

const ExerciseName = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${theme.colors.text};
  margin-bottom: ${theme.spacing.xs};
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
`

const BodyPartTag = styled.span`
  display: inline-block;
  padding: 2px 9px;
  border-radius: 99px;
  background: ${theme.colors.primaryDim};
  color: ${theme.colors.primary};
  font-size: 11px;
  font-weight: 600;
`

const SetTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: ${theme.spacing.sm};
  th, td {
    padding: 7px 8px;
    text-align: center;
  }
  th {
    color: ${theme.colors.textMuted};
    font-weight: 600;
    font-size: 11px;
    border-bottom: 1px solid ${theme.colors.border};
  }
  td {
    color: ${theme.colors.text};
    font-size: 13px;
  }
`

const NoteText = styled.p`
  font-size: 13px;
  color: ${theme.colors.textMuted};
  font-style: italic;
  margin-top: ${theme.spacing.sm};
`

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.textMuted};
  font-size: 13px;
`

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function getMonthString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

const normalizeDate = (dateStr: string) => {
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return dateStr
}

export default function WorkoutLog({ userId }: { userId: string }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [records, setRecords] = useState<WorkoutRecord[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  useEffect(() => {
    setLoading(true)
    getWorkoutLogs(userId, getMonthString(currentDate))
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [userId, currentDate])

  const workoutDates = new Set(records.map((r) => normalizeDate(r.date)))
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const selectedRecord = selectedDate
    ? records.find((r) => normalizeDate(r.date) === selectedDate)
    : null

  const calendarCells = []
  for (let i = 0; i < firstDay; i++) {
    calendarCells.push({ day: 0, dateStr: '' })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    calendarCells.push({ day: d, dateStr })
  }

  return (
    <Page>
      <Title>トレーニング記録</Title>

      <MonthNav data-tour-id="log-month-nav">
        <NavButton onClick={prevMonth}>‹</NavButton>
        <MonthLabel>{year}年{month + 1}月</MonthLabel>
        <NavButton onClick={nextMonth}>›</NavButton>
      </MonthNav>

      {loading ? (
        <Loading />
      ) : (
        <>
          <CalendarWrap data-tour-id="log-calendar">
            <CalendarGrid>
              {WEEKDAYS.map((w) => (
                <DayHeader key={w}>{w}</DayHeader>
              ))}
              {calendarCells.map((cell, i) => {
                const has = workoutDates.has(cell.dateStr)
                const selected = selectedDate === cell.dateStr
                return (
                  <DayCell
                    key={i}
                    $empty={cell.day === 0}
                    $hasWorkout={has}
                    $selected={selected}
                    onClick={() => {
                      if (cell.day > 0) setSelectedDate(cell.dateStr)
                    }}
                  >
                    {cell.day || ''}
                    {has && !selected && <Dot />}
                  </DayCell>
                )
              })}
            </CalendarGrid>
          </CalendarWrap>

          {selectedDate && (
            selectedRecord ? (
              <>
                {selectedRecord.exercises.map((ex, i) => (
                  <DetailCard key={i}>
                    <ExerciseName>
                      {ex.name}
                      <BodyPartTag>{ex.bodyPart}</BodyPartTag>
                    </ExerciseName>
                    <SetTable>
                      <thead>
                        <tr>
                          <th>セット</th>
                          <th>重量</th>
                          <th>回数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ex.sets.map((s, j) => (
                          <tr key={j}>
                            <td>{j + 1}</td>
                            <td>{s.weight}kg</td>
                            <td>{s.reps}回</td>
                          </tr>
                        ))}
                      </tbody>
                    </SetTable>
                  </DetailCard>
                ))}
                {selectedRecord.note && (
                  <NoteText>{selectedRecord.note}</NoteText>
                )}
              </>
            ) : (
              <EmptyState>この日のトレーニング記録はありません</EmptyState>
            )
          )}
        </>
      )}
    </Page>
  )
}
