import styled, { keyframes } from 'styled-components'
import { theme } from '../theme'

const spin = keyframes`
  to { transform: rotate(360deg); }
`

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: ${theme.spacing.md};
`

const Spinner = styled.div`
  width: 30px;
  height: 30px;
  border: 3px solid ${theme.colors.borderMd};
  border-top-color: ${theme.colors.primary};
  border-radius: 50%;
  animation: ${spin} 0.75s linear infinite;
`

const Text = styled.p`
  color: ${theme.colors.textMuted};
  font-size: 13px;
`

export default function Loading({ message = '読み込み中...' }: { message?: string }) {
  return (
    <Wrapper>
      <Spinner />
      {message && <Text>{message}</Text>}
    </Wrapper>
  )
}
