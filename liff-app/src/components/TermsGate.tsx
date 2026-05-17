import { useEffect, useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { theme } from '../theme'
import { getProfile, updateProfile } from '../api'
import { openExternalUrl } from '../liff'
import Loading from './Loading'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: ${theme.colors.bg};
  z-index: 99999;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: ${theme.spacing.md};
  padding-top: 40px;
  padding-bottom: 40px;
`

const Card = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 18px;
  padding: 24px 22px;
  margin: auto 0;
  max-width: 520px;
  width: 100%;
  align-self: center;
`

const Title = styled.h1`
  font-size: 20px;
  font-weight: 800;
  color: ${theme.colors.text};
  margin: 0 0 ${theme.spacing.md};
  letter-spacing: -0.02em;
`

const Body = styled.p`
  font-size: 13px;
  color: ${theme.colors.textMuted};
  line-height: 1.7;
  margin: 0 0 ${theme.spacing.md};
`

const LinkList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: ${theme.spacing.md};
`

const LinkButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: ${theme.colors.surface2};
  border: 1px solid ${theme.colors.border};
  border-radius: 11px;
  color: ${theme.colors.text};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  &:active { background: ${theme.colors.bg}; }
`

const LinkArrow = styled.span`
  color: ${theme.colors.primary};
  font-size: 14px;
`

const AgreementRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 14px;
  background: ${theme.colors.surface2};
  border: 1px solid ${theme.colors.border};
  border-radius: 11px;
  margin-bottom: ${theme.spacing.md};
  cursor: pointer;
  font-size: 13px;
  color: ${theme.colors.text};
  line-height: 1.55;
`

const Checkbox = styled.input`
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  accent-color: ${theme.colors.primary};
  cursor: pointer;
`

const AcceptButton = styled.button<{ $disabled: boolean }>`
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 14px;
  background: ${({ $disabled }) => ($disabled ? theme.colors.textFaint : theme.colors.primary)};
  color: ${({ $disabled }) => ($disabled ? theme.colors.textMuted : '#fff')};
  font-size: 15px;
  font-weight: 700;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  font-family: inherit;
  &:active { opacity: ${({ $disabled }) => ($disabled ? 1 : 0.85)}; }
`

const ErrorText = styled.div`
  color: ${theme.colors.danger};
  font-size: 12px;
  margin-top: 8px;
  text-align: center;
`

const NoteText = styled.p`
  font-size: 11px;
  color: ${theme.colors.textMuted};
  text-align: center;
  margin-top: 14px;
  line-height: 1.6;
`

interface TermsGateProps {
  userId: string
  children: ReactNode
}

type State = 'loading' | 'needs' | 'ok' | 'error'

export default function TermsGate({ userId, children }: TermsGateProps) {
  const [state, setState] = useState<State>('loading')
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRevision, setIsRevision] = useState(false)

  useEffect(() => {
    getProfile(userId)
      .then((p) => {
        const current = p.legal?.currentTermsVersion
        const accepted = p.legal?.acceptedTermsVersion
        if (!current) {
          // backend が legal を返さない（互換性のため）。ゲートをスキップ
          setState('ok')
          return
        }
        if (!accepted) {
          // 初回ユーザー
          setIsRevision(false)
          setState('needs')
        } else if (accepted !== current) {
          // 規約改訂後の再同意
          setIsRevision(true)
          setState('needs')
        } else {
          setState('ok')
        }
      })
      .catch((e) => {
        console.error('[TermsGate] profile fetch failed:', e)
        // フェールセーフ: 取得失敗時はゲートを通す（ユーザーがアプリ使えなくならないように）
        setState('ok')
      })
  }, [userId])

  const handleAccept = async () => {
    if (!checked || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await updateProfile(userId, { acceptTerms: true })
      setState('ok')
    } catch (e) {
      console.error(e)
      setError('同意の保存に失敗しました。電波の良い場所でもう一度お試しください。')
      setSubmitting(false)
    }
  }

  if (state === 'loading') return <Loading message="読み込み中..." />

  if (state === 'needs') {
    return (
      <Backdrop>
        <Card>
          <Title>{isRevision ? '利用規約を改訂しました' : 'ご利用にあたって'}</Title>
          <Body>
            {isRevision
              ? '利用規約・プライバシーポリシーを改訂しました。引き続き本サービスをご利用いただくには、改訂後の内容にご同意ください。'
              : '本サービスをご利用いただくには、利用規約とプライバシーポリシーへの同意が必要です。下のリンクから内容をご確認ください。'}
          </Body>

          <LinkList>
            <LinkButton onClick={() => openExternalUrl('https://muscle-coach-ai.web.app/terms.html')}>
              利用規約を読む <LinkArrow>›</LinkArrow>
            </LinkButton>
            <LinkButton onClick={() => openExternalUrl('https://muscle-coach-ai.web.app/privacy.html')}>
              プライバシーポリシーを読む <LinkArrow>›</LinkArrow>
            </LinkButton>
          </LinkList>

          <AgreementRow>
            <Checkbox
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>利用規約およびプライバシーポリシーの内容を確認し、これらに同意します。</span>
          </AgreementRow>

          <AcceptButton
            $disabled={!checked || submitting}
            onClick={handleAccept}
            disabled={!checked || submitting}
          >
            {submitting ? '保存中...' : '同意してはじめる'}
          </AcceptButton>

          {error && <ErrorText>{error}</ErrorText>}

          <NoteText>
            同意した内容と日時はサーバーに記録されます。<br />
            同意後はプロフィール画面からいつでも規約を再確認できます。
          </NoteText>
        </Card>
      </Backdrop>
    )
  }

  // state === 'ok' or 'error'
  return <>{children}</>
}
