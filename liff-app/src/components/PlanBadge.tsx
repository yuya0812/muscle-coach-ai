import styled from 'styled-components'
import { theme } from '../theme'

const Badge = styled.span<{ $premium: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: ${theme.borderRadius.full};
  font-size: 11px;
  font-weight: 700;
  background: ${({ $premium }) => ($premium ? theme.colors.goldDim : theme.colors.surface2)};
  border: 1px solid ${({ $premium }) => ($premium ? theme.colors.goldBorder : theme.colors.border)};
  color: ${({ $premium }) => ($premium ? theme.colors.gold : theme.colors.textMuted)};
`

export default function PlanBadge({ plan }: { plan: 'free' | 'premium' }) {
  return (
    <Badge $premium={plan === 'premium'}>
      {plan === 'premium' ? 'PREMIUM' : 'FREE'}
    </Badge>
  )
}
