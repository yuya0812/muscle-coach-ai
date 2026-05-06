# フロントエンド デザイン変更 制約ドキュメント

フロントのビジュアル・UIを変更する前に必ずこのファイルを読むこと。
**以下のファイルと仕様は変更禁止。** スタイル・レイアウト変更は Styled Components の範囲内で行うこと。

---

## 絶対に変更しないファイル

| ファイル | 理由 |
|---------|------|
| `src/liff.ts` | LINE認証・LIFFの初期化ロジック |
| `src/api.ts` | バックエンドAPI呼び出し（関数シグネチャ含む） |
| `src/firebase.ts` | Firebase接続設定 |

---

## ロジックを保持しながらスタイルのみ変更可能なファイル

### `src/App.tsx`
- **変えてはいけない**: `localStorage.getItem(\`onboarded_${userId}\`)` によるオンボーディング判定
- **変えてはいけない**: 以下のルートパス（BottomNavと連動している）
  ```
  /onboarding
  /dashboard
  /subscribe
  /profile
  /workout-input
  /workout-log
  ```

### `src/components/BottomNav.tsx`
- **変えてはいけない**: 5タブの構成とそれぞれのパス（順序変更も不可）
  ```
  /dashboard  ホーム
  /workout-input  記録
  /workout-log  履歴
  /profile  設定
  /subscribe  プラン
  ```
- **変えてはいけない**: `/onboarding` でのタブ非表示ロジック

### `src/pages/Onboarding.tsx`
- **変えてはいけない**: `markOnboarded()` の呼び出し（localStorage キー `onboarded_${userId}`）
- **変えてはいけない**: 「プロフィールを設定する」→ `/profile`、「スキップ」→ `/dashboard` の遷移先

### `src/pages/Dashboard.tsx`
- **変えてはいけない**: `closeLiff()` を呼ぶAIコーチCTAボタン
- **変えてはいけない**: `remaining` の表示ロジック（null=無制限、数値=残り回数）
- **変えてはいけない**: `Chart.js` の登録コード（`ChartJS.register(...)`）
- **変えてはいけない**: `getDashboardData` / `getUsageStatus` の呼び出し

### `src/pages/Subscribe.tsx`
- **変えてはいけない**: `handleSubscribe()` / `handleManagePlan()` の処理
- **変えてはいけない**: `openExternalUrl()` の使用（LIFF内でStripeを開くため必須）
- **変えてはいけない**: URLパラメータ `?success` / `?canceled` によるチェックアウト結果の判定
- **変えてはいけない**: 以下のプレミアムプラン仕様（確定済み）
  ```
  価格: ¥1,480/月
  トライアル: 最初の1週間は無料
  機能:
    - AIパーソナルトレーナーの無制限利用（フリーは月5回）
    - 週次AIレポート自動送信（月曜朝に届く）
    - 日次リマインダー・週次レポート通知
    - 目標別パーソナルトレーニングプログラム作成
  ```

### `src/pages/Profile.tsx`
- **変えてはいけない**: `handleSave()` の処理（`updateProfile` / `updateNotificationSettings` の並列呼び出し）
- **変えてはいけない**: Firestoreからの初期値読み込みロジック

### `src/pages/WorkoutInput.tsx`
- **変えてはいけない**: `handleSave()` のpayload整形（`name`, `weight`, `reps`, `sets` の構造）
- **変えてはいけない**: 保存後の `closeLiff()` を呼ぶAI分析CTAボタン

### `src/pages/WorkoutLog.tsx`
- **変えてはいけない**: `normalizeDate()` 関数
- **変えてはいけない**: カレンダーグリッドのデータ構造

---

## 全面的に変更可能なもの

- `src/theme.ts` — カラー・スペーシング・フォントサイズ
- 各ファイル内のすべての Styled Components の定義
- `src/components/Header.tsx` — ロゴ表示以外は自由
- `src/components/Loading.tsx`
- `src/components/PlanBadge.tsx`
- JSXのレイアウト・構造（ロジック部分を残せば可）

---

## ビルド確認

変更後は必ず以下を実行してエラーがないことを確認すること。

```bash
cd liff-app && npm run build
```
