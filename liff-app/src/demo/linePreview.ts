// デモモードで「LINE に戻る / LINE に送る」操作をしたときに、本番の LINE トークで
// 何が起きるかをチャット風のモーダルで見せる。React ツリーの外に DOM を直接追加する。

import { theme } from '../theme'
import { demoAnalysisSummary } from './mockApi'

type Message = { from: 'user' | 'bot'; text: string; quickReplies?: string[] }

function analysisReply(): string {
  const s = demoAnalysisSummary()
  if (!s.hasRecords) return '今週はまだ記録がありません。'
  const improved = (s.improved ?? [])
    .map((e) => `${e.name}は${e.earlyMaxWeight}kgから${e.recentMaxWeight}kgに伸びています。`)
    .join('')
  return [
    `直近7日で${s.weekSessions}回、累計${s.totalRecords}回の記録が続いています。`,
    '',
    '【伸びているところ】',
    improved || '続けていること自体が前進です。',
    '',
    '【続けられている種目】',
    `${(s.consistent ?? []).join('・')}を安定して続けられています。`,
    '',
    '【伸び悩んでいるところ】',
    (s.stagnant ?? []).length > 0 ? `${s.stagnant!.join('・')}は重量が横ばいです。` : '該当なし',
    '',
    '【次のステップ】',
    s.nextStep ?? '',
  ].join('\n')
}

function scenario(sentText?: string): { title: string; note: string; messages: Message[] } {
  if (sentText) {
    return {
      title: 'LINE に「分析して」を送信',
      note: '本番では LIFF が閉じて LINE に戻り、記録をコードで集計した結果を AI が文章にして返します（下は同じ集計値から作った例）。',
      messages: [
        { from: 'user', text: sentText },
        { from: 'bot', text: analysisReply() },
      ],
    }
  }
  return {
    title: 'LINE で記録',
    note: '本番では LIFF が閉じて LINE トークに戻ります。雑に送るだけで記録され、足りない項目だけ聞き返します。',
    messages: [
      { from: 'user', text: 'スクワット80キロ10回やった' },
      { from: 'bot', text: 'セット数を教えてください。', quickReplies: ['1', '2', '3', '4', '5'] },
      { from: 'user', text: '3' },
      { from: 'bot', text: '記録しました。\n・スクワット 80kg 10回 3セット\nお疲れさまでした。' },
    ],
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: Partial<CSSStyleDeclaration>, text?: string) {
  const node = document.createElement(tag)
  Object.assign(node.style, style)
  if (text !== undefined) node.textContent = text
  return node
}

export function showLinePreview(sentText?: string): void {
  const { title, note, messages } = scenario(sentText)

  const backdrop = el('div', {
    position: 'fixed', inset: '0', zIndex: '100000', background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  })
  const card = el('div', {
    width: '100%', maxWidth: '420px', maxHeight: '85vh', overflowY: 'auto',
    background: theme.colors.surface, border: `1px solid ${theme.colors.borderMd}`,
    borderRadius: '18px', padding: '20px', color: theme.colors.text, fontFamily: 'inherit',
  })
  card.append(
    el('div', { fontSize: '11px', fontWeight: '700', color: theme.colors.gold, letterSpacing: '0.08em', marginBottom: '6px' }, 'DEMO'),
    el('div', { fontSize: '17px', fontWeight: '800', marginBottom: '8px' }, title),
    el('div', { fontSize: '12px', lineHeight: '1.7', color: theme.colors.textMuted, marginBottom: '16px' }, note),
  )

  const chat = el('div', {
    background: '#8cabd9', borderRadius: '12px', padding: '14px 12px',
    display: 'flex', flexDirection: 'column', gap: '10px',
  })
  for (const m of messages) {
    const row = el('div', { display: 'flex', flexDirection: 'column', alignItems: m.from === 'user' ? 'flex-end' : 'flex-start', gap: '6px' })
    if (m.from === 'bot') row.append(el('div', { fontSize: '10px', color: '#24324a' }, 'マッスルコーチ'))
    row.append(el('div', {
      maxWidth: '85%', whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.6', padding: '8px 12px',
      borderRadius: '16px', color: '#111',
      background: m.from === 'user' ? '#8de055' : '#ffffff',
    }, m.text))
    if (m.quickReplies) {
      const qr = el('div', { display: 'flex', gap: '6px', flexWrap: 'wrap' })
      for (const q of m.quickReplies) {
        qr.append(el('span', {
          fontSize: '12px', padding: '4px 12px', borderRadius: '999px',
          background: '#ffffff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`,
        }, q))
      }
      row.append(qr)
    }
    chat.append(row)
  }
  card.append(chat)

  const close = el('button', {
    marginTop: '16px', width: '100%', padding: '12px', borderRadius: '11px', border: 'none',
    background: theme.colors.primary, color: '#fff', fontSize: '14px', fontWeight: '700',
    cursor: 'pointer', fontFamily: 'inherit',
  }, 'デモに戻る')
  card.append(close)

  const dismiss = () => backdrop.remove()
  close.addEventListener('click', dismiss)
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) dismiss() })
  backdrop.append(card)
  document.body.append(backdrop)
}

export function showDemoNotice(message: string): void {
  const toast = el('div', {
    position: 'fixed', left: '50%', bottom: '96px', transform: 'translateX(-50%)', zIndex: '100000',
    maxWidth: 'calc(100% - 32px)', padding: '10px 16px', borderRadius: '11px', fontSize: '13px',
    background: theme.colors.surface2, color: theme.colors.text, border: `1px solid ${theme.colors.goldBorder}`,
  }, message)
  document.body.append(toast)
  setTimeout(() => toast.remove(), 2800)
}
