import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { theme } from '../theme'
import {
  createCheckoutSession,
  getCustomerPortalUrl,
  getSubscriptionStatus,
  type SubscriptionStatus,
} from '../api'
import { openExternalUrl } from '../liff'
import PlanBadge from '../components/PlanBadge'
import Loading from '../components/Loading'

const Page = styled.div`
  padding: ${theme.spacing.md};
  padding-bottom: ${theme.layout.bottomNavSpace};
  animation: fadeUp 0.22s ease both;
`

const CurrentPlan = styled.div`
  text-align: center;
  padding: ${theme.spacing.md} 0 ${theme.spacing.lg};
`

const PlanTitle = styled.h2`
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: ${theme.colors.text};
  margin: ${theme.spacing.md} 0 ${theme.spacing.xs};
`

const PlanSub = styled.p`
  color: ${theme.colors.textMuted};
  font-size: 13px;
  margin: 0;
`

const PlanCard = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 20px;
  overflow: hidden;
  margin-bottom: ${theme.spacing.lg};
`

const PlanHeader = styled.div`
  background: linear-gradient(160deg, #0c2b1a 0%, #0f3520 100%);
  border-bottom: 1px solid ${theme.colors.primaryBorder};
  padding: ${theme.spacing.lg};
  text-align: center;
`

const PlanHeaderBadge = styled.div`
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: ${theme.borderRadius.full};
  background: ${theme.colors.goldDim};
  border: 1px solid ${theme.colors.goldBorder};
  color: ${theme.colors.gold};
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 12px;
`

const Price = styled.div`
  font-size: 44px;
  font-weight: 800;
  color: ${theme.colors.text};
  letter-spacing: -0.03em;
  line-height: 1;
  span { font-size: 16px; font-weight: 500; color: ${theme.colors.textMuted}; letter-spacing: 0; }
`

const TrialNote = styled.div`
  font-size: 12px;
  color: ${theme.colors.primary};
  font-weight: 600;
  margin-top: 8px;
`

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`

const FeatureItem = styled.li`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  font-size: 13px;
  color: ${theme.colors.text};
  border-bottom: 1px solid ${theme.colors.border};
  &:last-child { border-bottom: none; }
`

const FeatureCheck = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: ${theme.colors.primaryDim};
  border: 1px solid ${theme.colors.primaryBorder};
  flex-shrink: 0;
`

const Button = styled.button<{ $variant?: 'primary' | 'outline' }>`
  width: 100%;
  padding: 14px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  border: ${({ $variant }) => $variant === 'outline' ? `1.5px solid ${theme.colors.primary}` : 'none'};
  background: ${({ $variant }) => $variant === 'outline' ? 'transparent' : theme.colors.primary};
  color: ${({ $variant }) => $variant === 'outline' ? theme.colors.primary : '#fff'};
  &:active { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const ButtonWrap = styled.div`
  padding: 18px 20px 20px;
`

const SuccessMessage = styled.div`
  background: ${theme.colors.primaryDim};
  border: 1px solid ${theme.colors.primaryBorder};
  color: ${theme.colors.primary};
  padding: ${theme.spacing.md};
  border-radius: 14px;
  text-align: center;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: ${theme.spacing.lg};
`

const CancelNotice = styled.div`
  background: ${theme.colors.goldDim};
  color: ${theme.colors.gold};
  border: 1px solid ${theme.colors.goldBorder};
  border-radius: 14px;
  padding: ${theme.spacing.md};
  font-size: 13px;
  text-align: center;
  margin-bottom: ${theme.spacing.lg};
`

const FootNote = styled.p`
  text-align: center;
  color: ${theme.colors.textMuted};
  font-size: 12px;
  margin-top: ${theme.spacing.sm};
`

const AgreementRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: ${theme.colors.surface2};
  border: 1px solid ${theme.colors.border};
  border-radius: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  font-size: 12.5px;
  color: ${theme.colors.text};
  line-height: 1.55;
  &:active { background: ${theme.colors.surface}; }
`

const AgreementCheckbox = styled.input`
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  accent-color: ${theme.colors.primary};
  cursor: pointer;
`

const AgreementLink = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.primary};
  text-decoration: underline;
  cursor: pointer;
  font-size: inherit;
  padding: 0;
  font-family: inherit;
`

const LegalCard = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 14px;
  padding: 4px;
  margin-top: ${theme.spacing.lg};
`

const LegalLink = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: none;
  color: ${theme.colors.text};
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  & + & { border-top: 1px solid ${theme.colors.border}; }
  &:active { background: ${theme.colors.surface2}; }
`

const LegalLinkArrow = styled.span`
  color: ${theme.colors.textMuted};
  font-size: 14px;
`

const PREMIUM_FEATURES = [
  'AI分析の無制限利用（フリーは月5回）',
  '週次AIレポート自動送信（月曜朝に届く）',
  '日次リマインダー・週次レポート通知',
  '記録の集計から成長トレンド・続けられている種目を言語化',
]

export default function Subscribe({ userId }: { userId: string }) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [agreed, setAgreed] = useState(false)

  const urlParams = new URLSearchParams(window.location.search)
  const checkoutResult = urlParams.get('success') ? 'success' : urlParams.get('canceled') ? 'cancel' : null

  useEffect(() => {
    getSubscriptionStatus(userId)
      .then(setStatus)
      .catch(() => setStatus({ plan: 'free' }))
      .finally(() => setLoading(false))
  }, [userId])

  const handleSubscribe = async () => {
    setProcessing(true)
    try {
      const { url } = await createCheckoutSession(userId)
      openExternalUrl(url)
    } catch (e) {
      alert(`決済ページの作成に失敗しました。\n${e instanceof Error ? e.message : String(e)}`)
      setProcessing(false)
    }
  }

  const handleManagePlan = async () => {
    setProcessing(true)
    try {
      const { url } = await getCustomerPortalUrl(userId)
      if (!url) {
        alert('管理ページのURLが取得できませんでした。')
        setProcessing(false)
        return
      }
      openExternalUrl(url)
    } catch (e) {
      alert(`管理ページの取得に失敗しました。\n${e instanceof Error ? e.message : String(e)}`)
      setProcessing(false)
    }
  }

  if (loading) return <Loading />

  const isPremium = status?.plan === 'premium'

  return (
    <Page>
      {checkoutResult === 'success' && (
        <SuccessMessage>プレミアムプランへの登録が完了しました！</SuccessMessage>
      )}
      {checkoutResult === 'cancel' && (
        <SuccessMessage style={{ background: theme.colors.goldDim, borderColor: theme.colors.goldBorder, color: theme.colors.gold }}>
          決済がキャンセルされました
        </SuccessMessage>
      )}
      {status?.cancelAt && (
        <CancelNotice>
          解約手続き済みです。{new Date(status.cancelAt).toLocaleDateString('ja-JP')}までご利用いただけます。
        </CancelNotice>
      )}

      <CurrentPlan data-tour-id="subscribe-plan">
        <PlanBadge plan={status?.plan ?? 'free'} />
        <PlanTitle>{isPremium ? 'プレミアムプラン' : '無料プラン'}</PlanTitle>
        <PlanSub>
          {isPremium
            ? status?.cancelAt
              ? '解約予定のため期間末まで全機能をご利用いただけます'
              : 'すべての機能をご利用いただけます'
            : 'アップグレードでさらに便利に'}
        </PlanSub>
      </CurrentPlan>

      {!isPremium && (
        <PlanCard>
          <PlanHeader>
            <PlanHeaderBadge>プレミアムプラン</PlanHeaderBadge>
            <Price>¥1,480<span>/月</span></Price>
            <TrialNote>最初の1週間は無料</TrialNote>
          </PlanHeader>
          <FeatureList>
            {PREMIUM_FEATURES.map((f) => (
              <FeatureItem key={f}>
                <FeatureCheck>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </FeatureCheck>
                {f}
              </FeatureItem>
            ))}
          </FeatureList>
          <ButtonWrap data-tour-id="subscribe-cta">
            <AgreementRow>
              <AgreementCheckbox
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                <AgreementLink onClick={(e) => { e.preventDefault(); openExternalUrl('https://muscle-coach-ai.web.app/terms.html') }}>
                  利用規約
                </AgreementLink>
                {' '}と{' '}
                <AgreementLink onClick={(e) => { e.preventDefault(); openExternalUrl('https://muscle-coach-ai.web.app/privacy.html') }}>
                  プライバシーポリシー
                </AgreementLink>
                {' '}に同意してプランを開始する
              </span>
            </AgreementRow>
            <Button onClick={handleSubscribe} disabled={processing || !agreed}>
              {processing ? '処理中...' : '1週間無料で試す'}
            </Button>
          </ButtonWrap>
        </PlanCard>
      )}

      {isPremium && (
        <div data-tour-id="subscribe-cta">
          <Button $variant="outline" onClick={handleManagePlan} disabled={processing}>
            {processing ? '処理中...' : 'プランを管理する'}
          </Button>
          {status?.expiresAt && (
            <FootNote>
              次回更新日: {new Date(status.expiresAt).toLocaleDateString('ja-JP')}
            </FootNote>
          )}
        </div>
      )}

      <LegalCard>
        <LegalLink onClick={() => openExternalUrl('https://muscle-coach-ai.web.app/terms.html')}>
          利用規約 <LegalLinkArrow>›</LegalLinkArrow>
        </LegalLink>
        <LegalLink onClick={() => openExternalUrl('https://muscle-coach-ai.web.app/privacy.html')}>
          プライバシーポリシー <LegalLinkArrow>›</LegalLinkArrow>
        </LegalLink>
        <LegalLink onClick={() => openExternalUrl('https://muscle-coach-ai.web.app/commerce.html')}>
          特定商取引法に基づく表記 <LegalLinkArrow>›</LegalLinkArrow>
        </LegalLink>
      </LegalCard>
    </Page>
  )
}
