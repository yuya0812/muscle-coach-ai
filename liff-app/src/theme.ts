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
} as const
