import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { theme } from '../theme'

const Nav = styled.nav`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: ${theme.colors.surface};
  border-top: 1px solid ${theme.colors.border};
  border-radius: 14px 14px 0 0;
  display: flex;
  /* iPhoneのホームインジケータ領域＋追加余白でジェスチャー誤発火を防ぐ */
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
  box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.18);
`

const NavItem = styled.button<{ $active: boolean }>`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 0 14px;
  border: none;
  background: none;
  color: ${({ $active }) => ($active ? theme.colors.primary : theme.colors.textMuted)};
  cursor: pointer;
  gap: 4px;
`

const ActiveBar = styled.span`
  position: absolute;
  top: 0;
  width: 22px;
  height: 2.5px;
  background: ${theme.colors.primary};
  border-radius: 0 0 3px 3px;
`

const Label = styled.span<{ $active: boolean }>`
  font-size: 10px;
  font-weight: ${({ $active }) => ($active ? 700 : 400)};
  line-height: 1;
`

const IconHome = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)
const IconPlus = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconCalendar = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IconClock = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <polyline points="12 7 12 12 15.5 14"/>
  </svg>
)
const IconSettings = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)
const IconCrown = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 20h20M4 20L2 8l5 4 5-6 5 6 5-4-2 12H4z"/>
  </svg>
)

const tabs = [
  { path: '/dashboard', icon: IconHome, label: 'ホーム' },
  { path: '/workout-input', icon: IconPlus, label: '記録' },
  { path: '/workout-log', icon: IconCalendar, label: '履歴' },
  { path: '/timer', icon: IconClock, label: 'タイマー' },
  { path: '/profile', icon: IconSettings, label: '設定' },
  { path: '/subscribe', icon: IconCrown, label: 'プラン' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  if (location.pathname === '/onboarding') return null

  return (
    <Nav data-tour-id="nav-bar">
      {tabs.map((t) => {
        const active = location.pathname === t.path
        return (
          <NavItem
            key={t.path}
            $active={active}
            onClick={() => navigate(t.path)}
          >
            {active && <ActiveBar />}
            {t.icon}
            <Label $active={active}>{t.label}</Label>
          </NavItem>
        )
      })}
    </Nav>
  )
}
