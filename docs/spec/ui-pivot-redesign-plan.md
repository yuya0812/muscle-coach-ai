# Plan: LIFF UI を AI記録アプリの新設計に合わせて改修

対応 spec: [ui-pivot-redesign.md](ui-pivot-redesign.md)（承認済み 2026-06-16）

## 技術方針

- **スタックは現状維持**: React 19 + styled-components + Chart.js。theme.ts を土台に保つ。
  新スタック・新ライブラリは入れない（Design DNA の「フォント増やさない/静か」と整合）。
- **分析サマリーはAIを介さない軽量APIにする**（spec 未確定1の確定案）:
  - バックエンドに既存の純粋関数 `selectHighlights`（analysis.ts、AnalysisHighlights を返す）を
    再利用する。これは集計→ハイライト選定までをコードで行い AI を呼ばない。
  - 新 export `buildAnalysisHighlights(userId)`: 集計（buildWorkoutHistorySummary /
    buildGrowthTrend / buildWeeklySnapshot）→ selectHighlights → AnalysisHighlights を返す
    関数を analysis.ts に追加（buildAnalysis から集計部分を切り出して共用）。
  - 新APIエンドポイント `GET /api/analysis-summary?userId=` を index.ts に追加。
    AnalysisHighlights をそのまま JSON で返す（Claude API を呼ばない＝無料・即時）。
  - LINE の「分析して」は従来どおり buildAnalysis（AI言語化）を使う。役割分担:
    ダッシュボード=事実の要点（無料）、LINE=AIが語る（課金）。
- **theme トークン追加**: 計器盤強化用に微光ハイライト（カード上面の inset 白微光）等を
  theme に足す。色は既存パレットの範囲（緑=実績/アクション、gold=一点豪華）を厳守。
- **trainerType/trainerName**: フロントの送信・表示をやめるだけ。型定義（ProfileData）からは
  消さず optional のまま残す（既存データ読み込み時の互換のため）。

## 既存コードへの影響範囲

| 対象 | 変更 |
|---|---|
| `functions/src/ai/analysis.ts` | `buildAnalysisHighlights(userId)` を export 追加（buildAnalysis と集計を共用） |
| `functions/src/index.ts` | `/api/analysis-summary` ハンドラ追加（AnalysisHighlights を返す） |
| `liff-app/src/api.ts` | `getAnalysisSummary(userId)` と型 `AnalysisSummary` を追加。updateProfile から trainer 系送信を除去 |
| `liff-app/src/theme.ts` | 計器盤強化トークン（微光ハイライト等）を追加 |
| `liff-app/src/pages/Dashboard.tsx` | 旧AIコーチカード撤去。記録導線カード + 分析サマリーカードを新設。数値計器の対比強化 |
| `liff-app/src/pages/Profile.tsx` | トレーナー名/キャラのUI（入力・表示・state・保存）を削除 |
| `liff-app/src/pages/Onboarding.tsx` | フロー文言を記録・分析に差し替え（2カード再構成） |
| `liff-app/src/pages/Setup.tsx` | 「メニュー」系の subtitle/hint 文言を差し替え |
| `liff-app/src/pages/Subscribe.tsx` | PREMIUM_FEATURES を新設計の特典に差し替え |
| `liff-app/src/tour/steps.ts` | dashboard-ai-card 等のツアー説明を新カードに合わせて差し替え |
| `liff-app/src/components/BottomNav.tsx` | 変更なし（5タブ維持） |

## タスク分解

### Phase 1: バックエンド軽量サマリーAPI（1.5h）
- [x] analysis.ts: 集計部分を切り出し `buildAnalysisHighlights(userId): Promise<AnalysisHighlights | null>`
      を追加。buildAnalysis もこれを使うようリファクタ（重複集計を避ける）
- [x] index.ts: `GET /api/analysis-summary` を追加（認証は既存 verifyLiffToken パターンに合わせる）
- [x] functions ビルド通過確認

### Phase 2: 不要UI除去（1.5h）
- [x] Profile.tsx: trainerName/trainerType の state・読み込み・保存・view/edit UI を削除。
      「トレーナー / 目標」セクションを「目標」セクションにリネーム
- [x] api.ts: updateProfile の引数から trainer 系を外す（ProfileUpdateInput 調整）
- [x] Subscribe.tsx: PREMIUM_FEATURES 差し替え
- [x] Setup.tsx / Onboarding.tsx / tour/steps.ts: 旧文言の差し替え
- [x] 絵文字混入チェック（触ったファイル）

### Phase 3: ダッシュボード新カード + 計器盤強化（3h）
- [x] theme.ts: 微光ハイライト等トークン追加
- [x] api.ts: getAnalysisSummary + AnalysisSummary 型追加
- [x] Dashboard.tsx: 旧AIコーチカード撤去 → 記録導線カード（チャットバブル風 + 2アクション）
- [x] Dashboard.tsx: 分析サマリーカード（4セクション・色分け・記録なし時の案内）
- [x] Dashboard.tsx: サマリー数値の計器盤対比を強化（トラッキング・単位縮小）
- [x] tour/steps.ts: 新カードにツアーターゲットを合わせる

### Phase 4: 確認（1h）
- [x] liff-app ビルド（npm run build）通過
- [x] Design DNA の Do/Don't 自己検証（green の意味限定 / gold 一点 / フォント不増 / 濃い影なし）
- [x] TESTING_CHECKLIST に UI 確認項目を追記

## リスク・懸念点

- **分析サマリーの「事実」と LINE分析の「文章」の二重持ち**: 両者が食い違うと混乱する。
  どちらも同じ selectHighlights を源にするので内容は一致する（言語化の有無だけが違う）。
- **記録なしユーザーの分析サマリー**: buildAnalysisHighlights が null を返す設計にし、
  カードは「記録がたまると分析が出る」案内に分岐。
- **ツアーの target 不整合**: カード撤去で data-tour-id が消えると TourOverlay が
  ターゲットを見失う。steps.ts と Dashboard の data-tour-id を必ずセットで更新する。
- **デプロイ範囲**: Phase 1 で functions(api) も変わるため、デプロイは hosting + functions:api。
  実装完了後にユーザー承認を得てから。

## spec との対応確認

- 旧UI除去（Profile/Dashboard/Onboarding/Setup/Subscribe/tour） → Phase 2 + Phase 3
- 記録導線カード → Phase 3
- 分析サマリーカード（軽量API） → Phase 1 + Phase 3
- 高級感（theme洗練・計器盤強化） → Phase 3
- trainer フィールド残置 → Phase 2（送信/表示のみ除去）

## 変更履歴
- 2026-06-16: 初版作成
