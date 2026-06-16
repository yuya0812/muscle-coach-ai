export const theme = {
  colors: {
    bg:           '#0e1018',
    surface:      '#181c28',
    surface2:     '#1e2333',

    primary:      '#06C755',
    primaryDim:   'rgba(6, 199, 85, 0.10)',
    primaryBorder:'rgba(6, 199, 85, 0.28)',

    text:         '#eef1f8',
    textMuted:    '#6b7385',
    textFaint:    '#2e3347',

    border:       'rgba(255, 255, 255, 0.07)',
    borderMd:     'rgba(255, 255, 255, 0.12)',

    danger:       '#ff4560',
    gold:         '#e8b800',
    goldDim:      'rgba(232, 184, 0, 0.10)',
    goldBorder:   'rgba(232, 184, 0, 0.22)',
    blue:         '#3b82f6',
  },
  // 計器盤トーンの質感トークン。カード上面の微光ハイライトと内側の沈み込みで、
  // ダーク基調のまま「精密機器」のような奥行きを出す（濃い影・グラデは使わない）。
  effects: {
    // カード上端の白微光（::before や box-shadow inset で使う）
    topHighlight: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    // 数値計器ブロックの軽い浮き上がり
    cardLift: '0 1px 0 rgba(255, 255, 255, 0.04), 0 8px 24px -16px rgba(0, 0, 0, 0.6)',
    // チャットバブル風要素の縁
    bubbleEdge: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  },
  spacing: {
    xs:  '4px',
    sm:  '8px',
    md:  '16px',
    lg:  '24px',
    xl:  '32px',
  },
  borderRadius: {
    sm:   '9px',
    md:   '14px',
    lg:   '18px',
    xl:   '20px',
    full: '9999px',
  },
  fontSize: {
    xs:  '11px',
    sm:  '13px',
    md:  '14px',
    lg:  '18px',
    xl:  '22px',
    xxl: '40px',
  },
  fontWeight: {
    regular: 400,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  layout: {
    // BottomNav の実高さ + コンテンツとの余白 + iPhone のホームバー領域。
    // 各ページのコンテンツ末尾 padding-bottom はこれに統一する（タブ切替時に隙間がバラつくのを防ぐ）。
    bottomNavSpace: 'calc(env(safe-area-inset-bottom, 0px) + 92px)',
  },
} as const
