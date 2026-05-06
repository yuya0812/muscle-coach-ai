import styled from 'styled-components'
import { theme } from '../theme'

const Nav = styled.nav`
  position: sticky;
  top: 0;
  z-index: 100;
  height: 52px;
  background: ${theme.colors.bg};
  border-bottom: 1px solid ${theme.colors.border};
`

const Inner = styled.div`
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 ${theme.spacing.md};
`

const Logo = styled.span`
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: ${theme.colors.text};
  span {
    color: ${theme.colors.primary};
  }
`

export default function Header() {
  return (
    <Nav>
      <Inner>
        <Logo>
          Muscle<span>AI</span>
        </Logo>
      </Inner>
    </Nav>
  )
}
