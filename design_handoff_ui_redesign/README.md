# デザイン引き継ぎ: MuscleAI フロントエンド UI リデザイン

## 概要

`liff-app/` 配下のフロントエンド UI を全面的にリデザインしたものです。
LINE LIFF アプリとして動作する React + Styled Components のプロジェクトに対し、
**既存のロジック・ルーティング・API 呼び出しは一切変更せず**、スタイル・レイアウトのみを更新します。

変更可能な範囲は `liff-app/DESIGN_CONSTRAINTS.md` で定義されています。必ず事前に読んでください。

---

## デザインリファレンスファイル

| ファイル | 説明 |
|---|---|
| `AI_Trainer_Prototype.html` | 全6画面の高忠実度インタラクティブプロトタイプ。ブラウザで開いて各タブをクリックして確認できます |

> **注意**: このHTMLファイルは**デザイン参照用プロトタイプ**です。プロダクションコードとして使用するものではありません。実際の実装は `liff-app/` 内の既存 React + Styled Components の構造を維持したまま行ってください。

---

## フィデリティ

**High-fidelity（高忠実度）**: カラー・タイポグラフィ・スペーシング・インタラクションすべて確定済みです。プロトタイプのビジュアルをピクセル精度で再現してください。

---

## デザイントークン（新 `theme.ts`）

既存の `src/theme.ts` を以下の内容に**全面差し替え**してください。

```typescript
export const theme = {
  colors: {
    // Backgrounds
    bg:           '#0e1018',
    surface:      '#181c28',
    surface2:     '#1e2333',

    // Primary (LINE Green)
    primary:      '#06C755',
    primaryDim:   'rgba(6, 199, 85, 0.10)',
    primaryBorder:'rgba(6, 199, 85, 0.28)',

    // Text
    text:         '#eef1f8',
    textMuted:    '#6b7385',
    textFaint:    '#2e3347',

    // Borders
    border:       'rgba(255, 255, 255, 0.07)',
    borderMd:     'rgba(255, 255, 255, 0.12)',

    // Semantic
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
```

---

## フォント設定

`liff-app/index.html` の `<head>` に以下を追加してください：

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800&display=swap" rel="stylesheet">
```

`liff-app/src/index.css` のベーススタイルを以下に差し替え：

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  background: #0e1018;
  color: #eef1f8;
  font-family: 'Noto Sans JP', sans-serif;
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
}

::-webkit-scrollbar { width: 0; }

input[type="date"]::-webkit-calendar-picker-indicator,
input[type="time"]::-webkit-calendar-picker-indicator {
  filter: invert(0.6);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## ファイル別 実装指示

### `src/components/Header.tsx`

```
高さ: 52px
背景: theme.colors.bg
下ボーダー: 1px solid theme.colors.border
position: sticky / top: 0 / z-index: 100

ロゴ "MuscleAI":
  フォント: 18px / weight 800 / letter-spacing -0.02em
  "AI" 部分のみ color: theme.colors.primary
```

---

### `src/components/BottomNav.tsx`

- 絵文字アイコン → SVG アイコンに変更（下記参照）
- 背景: `theme.colors.surface`
- 上ボーダー: `1px solid theme.colors.border`
- アクティブタブ:
  - アイコン・ラベル色: `theme.colors.primary`
  - タブ上部に幅 22px / 高さ 2.5px のグリーンバー（`border-radius: 0 0 3px 3px`）
- 非アクティブタブ色: `theme.colors.textMuted`
- ラベル: `font-size: 10px`、アクティブ時 `font-weight: 700`、非アクティブ時 `400`

**SVG アイコン一覧（stroke="currentColor" / strokeWidth="2" / fill="none" / size 22px）**

| タブ | SVG path |
|---|---|
| ホーム（dashboard） | `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>` |
| 記録（workout-input） | `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>` |
| 履歴（workout-log） | `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>` |
| 設定（profile） | `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>` |
| プラン（subscribe） | `<path d="M2 20h20M4 20L2 8l5 4 5-6 5 6 5-4-2 12H4z"/>` |

---

### `src/components/Loading.tsx`

```
中央に 30×30px の円形スピナー
  border: 3px solid theme.colors.borderMd
  border-top-color: theme.colors.primary
  animation: spin 0.75s linear infinite

オプションのメッセージ: font-size 13px / color theme.colors.textMuted
```

---

### `src/components/PlanBadge.tsx`

```
premium プラン:
  背景: theme.colors.goldDim
  border: 1px solid theme.colors.goldBorder
  color: theme.colors.gold
  テキスト: "★ PREMIUM"

free プラン:
  背景: theme.colors.surface2
  border: 1px solid theme.colors.border
  color: theme.colors.textMuted
  テキスト: "FREE"

共通: padding 3px 10px / border-radius full / font-size 11px / font-weight 700
```

---

### `src/pages/Onboarding.tsx`（JSXレイアウト変更、ロジック保持）

画面構成（上から順）:

1. **ヒーローセクション** (padding-top: 52px, text-align: center)
   - アイコンボックス: 72×72px / border-radius 20px / bg `primaryDim` / border `primaryBorder`
     - 内部に AIBot SVG（32px / stroke `primary`）
   - タイトル: `マッスルコーチAIへ\nようこそ！` / 26px / weight 800 / letter-spacing -0.02em
   - サブ: `AIがあなた専属のパーソナルトレーナーになります` / 13px / color `textMuted`

2. **セクションラベル** `使い方` / 11px / weight 700 / letter-spacing 0.08em / textMuted / 中央揃え

3. **フローカード × 2**（縦並び、gap 10px）
   - カード共通スタイル: bg `surface` / border-radius 16px / padding 16px 18px / border `border`
   - 01 カード（LINE）: アクセントカラー `primary`
   - 02 カード（アプリ）: アクセントカラー `#3b82f6`
   - 各カードのヘッダー: 番号（11px weight 800）＋縦線＋タイトル（14px weight 700）

4. **プロフィール設定CTA** 
   - bg `primaryDim` / border `primaryBorder` / border-radius 18px / padding 20px 18px
   - ボタン: width 100% / bg `primary` / color white / border-radius 12px / 14px weight 700
   - ボタンクリック → `/profile` へ遷移（`markOnboarded()` を忘れずに呼ぶ）

5. **スキップリンク** → `/dashboard`（`markOnboarded()` 呼ぶ）

---

### `src/pages/Dashboard.tsx`（ロジック保持）

画面構成（上から順）:

1. **週次サマリー行**（flex / space-between）
   - 左: ラベル「今週のトレーニング」(12px / textMuted) + 数値 40px weight 800 + 「回」(16px textMuted)
   - 右: ゴールドボックス（bg `goldDim` / border `goldBorder` / border-radius 12px / padding 10px 14px）
     - ラベル「今月の残り」10px weight 700 gold
     - 数値 26px weight 800 gold + 「回」13px
     - `remaining === null` → 「∞」表示 / `remaining === undefined` → 非表示

2. **AIコーチカード**
   - bg `surface` / border-radius 18px / padding 18px / border `border`
   - 右上に半透明のサークル装飾（120×120px / bg `primaryDim` / overflow hidden で裁断）
   - ヘッダー: 38×38px アイコンボックス（bg `primaryDim` / border `primaryBorder` / border-radius 11px）+ タイトル/サブ
   - 例文3件: bg `surface2` / border-radius 9px / padding 8px 12px / 12px textMuted / border `border`
   - CTAボタン: width 100% / bg `primary` / border-radius 12px / `closeLiff()` を呼ぶ
     - 左: 「LINEでAIコーチに話しかける」/ 右: 残り回数（12px / opacity 0.85）
     - `remaining === null` → 「無制限」

3. **アップグレードナッジ**（`remaining` が 1〜2 の時のみ表示）
   - bg `goldDim` / border `goldBorder` / border-radius 12px / padding 12px 14px
   - `/subscribe` へ遷移するボタン

4. **期間タブ** (1週間 / 1ヶ月 / 3ヶ月)
   - アクティブ: border `primary` / bg `primaryDim` / color `primary` / weight 700
   - 非アクティブ: border `border` / color `textMuted`
   - border-radius: full / padding 7px 14px

5. **部位別バランス（Radar）** / **重量推移（Line）**
   - ラッパー: bg `surface` / border-radius 18px / padding 16px / border `border`
   - Chart.js カラー設定（ダークテーマ）:
     ```javascript
     // Radar
     grid: { color: 'rgba(255,255,255,0.06)' }
     ticks: { color: '#6b7385', backdropColor: 'transparent' }
     pointLabels: { color: '#c8cde0', font: { size: 12, weight: '600' } }
     dataset: { backgroundColor: 'rgba(6,199,85,0.12)', borderColor: '#06C755' }
     
     // Line
     grid: { color: 'rgba(255,255,255,0.05)' }
     ticks: { color: '#6b7385' }
     colors: ['#06C755', '#3b82f6']
     legend: { labels: { color: '#6b7385', font: { size: 11 } } }
     ```

6. **直近のトレーニングリスト**
   - ラッパー: bg `surface` / border-radius 18px
   - 各アイテム: borderBottom `border`（最終行はなし）
   - 日付: 11px / textMuted / margin-bottom 5px
   - 内容: 13px / text / line-height 1.65

---

### `src/pages/WorkoutInput.tsx`（ロジック保持）

- **ページタイトル**: 22px / weight 800 / letter-spacing -0.02em
- **日付入力**: bg `surface2` / border `border` / border-radius 9px / `colorScheme: dark`
- **種目カード**: bg `surface` / border-radius 18px / padding 14px 16px / border `border`
  - カードヘッダー（種目番号 11px textMuted + 削除ボタン danger色）
  - クイックタグ: pill形式 / アクティブ時 bg `primaryDim` border `primary` color `primary` / 非アクティブ border `border` color `textMuted`
  - テキスト入力: bg `surface2` / border `border` / border-radius 9px
  - 数値グリッド（重量/回数/セット数）: 3カラムグリッド / ラベル 10px weight 700 textMuted
- **種目追加ボタン**: border 1.5px dashed `borderMd` / border-radius 14px / color `textMuted`
- **保存成功時**:
  - サクセスバー: bg `primaryDim` / border `primaryBorder` / color `primary`
  - AI分析CTAボタン: border `primary` / color `primary` / bg none（`closeLiff()` を呼ぶ）
- **保存ボタン**: bg `primary` / disabled 時 bg `textFaint` color `textMuted` / border-radius 14px

---

### `src/pages/WorkoutLog.tsx`（ロジック保持・`normalizeDate()` 保持）

- **月ナビゲーション**: 前後ボタン 36×36px / border-radius 10px / bg `surface` / border `border`
- **カレンダーグリッドラッパー**: bg `surface` / border-radius 18px / padding 12px 10px 14px / border `border`
- **曜日ヘッダー**: 11px / weight 600 / textMuted
- **日付セル**:
  - ワークアウトあり: bg `primaryDim` / color `primary` / weight 700 ＋ 下部に 4×4px のグリーンドット
  - 選択中: bg `primary` / color white（ドットなし）
  - 通常: bg transparent / color textMuted
  - border-radius: 9px / aspect-ratio: 1
- **詳細カード**: bg `surface` / border-radius 14px / padding 14px 16px / border `border`
  - 種目名（14px / weight 700）+ 部位タグ（bg `primaryDim` / color `primary` / border-radius 99px）
  - セットテーブル: ヘッダー borderBottom `border` / 11px textMuted / セル 13px
- **空状態**: 13px / textMuted / 中央揃え

---

### `src/pages/Subscribe.tsx`（ロジック保持）

- **現在プラン表示**: `<PlanBadge>` / タイトル 22px weight 800 / サブ 13px textMuted
- **プレミアムプランカード**: bg `surface` / border-radius 20px / border `border` / overflow hidden
  - ヘッダー: `background: linear-gradient(160deg, #0c2b1a 0%, #0f3520 100%)` / border-bottom `primaryBorder`
    - プランバッジ: bg `goldDim` / border `goldBorder` / color `gold` / 「★ プレミアムプラン」
    - 価格: 44px weight 800 / letter-spacing -0.03em / 「/月」は 16px textMuted
    - 無料期間: 12px / color `primary` / weight 600
  - 機能リスト: border-bottom `border` で区切り / 各行にチェックアイコン（20×20px `primaryDim` circle）
    - チェックアイコン SVG: `<polyline points="20 6 9 17 4 12"/>` / stroke white / strokeWidth 3
  - CTAボタン: `handleSubscribe()` を呼ぶ / bg `primary` / border-radius 14px / 15px weight 700
- **注記テキスト**: bg `surface` / border-radius 14px / border `border` / 12px textMuted

---

### `src/pages/Profile.tsx`（ロジック保持）

- **セクションカード**: bg `surface` / border-radius 18px / padding 18px / border `border`
- **セクションラベル**: 11px / weight 700 / textMuted / letter-spacing 0.06em
- **テキスト入力**: bg `surface2` / border `border` / border-radius 10px / padding 10px 12px / `colorScheme: dark`
- **オプションボタン（目標/レベル/器具）**:
  - 選択中: border 1.5px `primary` / bg `primaryDim` / color `primary` / weight 700
  - 非選択: border 1.5px `border` / bg transparent / color `textMuted`
  - border-radius 10px / padding 10px 8px / transition all 0.15s
- **頻度ピッカー**: 38×38px の円ボタン / 選択中 bg `primary` color white / 非選択 border `border` color textMuted
- **トグルスイッチ**: 46×26px / border-radius 13px / ON: bg `primary` / OFF: bg `surface2`
  - つまみ: 20×20px / top 3px / left: ON=23px OFF=3px / transition left 0.2s
- **保存ボタン**: bg `primary` / border-radius 14px / 15px weight 700

---

## App.tsx / グローバルレイアウト

ページ切り替え時にフェードアップアニメーションを適用：

```typescript
// Styled Components 例
const PageWrapper = styled.div`
  animation: fadeUp 0.22s ease both;
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`
```

ボディ背景色: `#0e1018`（メタテーマカラーも合わせて変更推奨）

```html
<!-- index.html -->
<meta name="theme-color" content="#0e1018">
```

---

## 変更ファイル一覧

実装が必要なファイル（優先度順）:

| 優先度 | ファイル | 変更内容 |
|---|---|---|
| 1 | `liff-app/index.html` | Noto Sans JP フォント追加、theme-color メタタグ |
| 1 | `liff-app/src/theme.ts` | テーマトークン全面差し替え |
| 1 | `liff-app/src/index.css` | グローバルスタイル差し替え |
| 2 | `src/components/Header.tsx` | Styled Components 更新 |
| 2 | `src/components/BottomNav.tsx` | SVGアイコン + スタイル更新 |
| 2 | `src/components/Loading.tsx` | スピナー実装 |
| 2 | `src/components/PlanBadge.tsx` | バッジスタイル更新 |
| 3 | `src/pages/Dashboard.tsx` | 全Styled Components + Chart.js設定更新 |
| 3 | `src/pages/Onboarding.tsx` | JSXレイアウト + Styled Components更新 |
| 3 | `src/pages/WorkoutInput.tsx` | Styled Components更新 |
| 3 | `src/pages/WorkoutLog.tsx` | カレンダースタイル更新 |
| 3 | `src/pages/Subscribe.tsx` | プランカード + Styled Components更新 |
| 3 | `src/pages/Profile.tsx` | フォームコンポーネント更新 |

**変更禁止ファイル**: `src/liff.ts` / `src/api.ts` / `src/firebase.ts`

---

## 実装確認

変更後は必ず以下でビルドエラーがないことを確認してください：

```bash
cd liff-app && npm run build
```

デザインの詳細確認は `AI_Trainer_Prototype.html` をブラウザで開いて各タブを操作してください。
