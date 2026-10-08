# liff-app

マッスルコーチAI の LIFF フロントエンド（React 19 + TypeScript + Vite + Styled Components）。
プロジェクト全体の説明はルートの [README.md](../README.md) を参照。

## 画面

| ページ | 内容 |
|---|---|
| Dashboard | 今週の回数・重量推移グラフ・マイルストーン・分析サマリー・LINE 記録導線 |
| WorkoutInput | フォームでの記録（種目ごとに複数セット） |
| WorkoutLog | 月カレンダーの記録履歴 |
| Timer | インターバルタイマー / ストップウォッチ |
| Profile / Setup | プロフィール・通知設定、初回ヒアリング |
| Subscribe | プラン表示と Stripe Checkout / Customer Portal への遷移 |

## 実装上のルール

- Firestore には直接アクセスしない。データ操作はすべて [src/api.ts](src/api.ts) 経由で
  Functions の REST API を呼び、各リクエストに LIFF Access Token を付与する。
- デザイン上の制約は [DESIGN_CONSTRAINTS.md](DESIGN_CONSTRAINTS.md) を参照。

## コマンド

```bash
npm install
npm run dev     # 開発サーバ（LIFF は HTTPS 必須のため LIFF Inspector 等を併用）
npm run build   # ../public に出力（firebase.json の hosting public）
npm run lint
```
