# muscle-coach-ai エージェント引き継ぎドキュメント

> このドキュメントを読めば、別のエージェントがすぐにプロジェクトを引き継いで運用・開発を継続できる。

> **【重要】2026-06 方針転換あり。** このドキュメントの一部記述（メニュー生成・コーチング会話・
> トレーナーキャラ）は**旧仕様**です。現在のAI用途は「①記録パース ②分析の言語化」の2つに限定され、
> メニュー生成・コーチング会話・トレーナー3キャラは廃止されました。最新の設計は
> [docs/spec/ai-scope-pivot.md](docs/spec/ai-scope-pivot.md) と [CLAUDE.md](CLAUDE.md) の
> 「設計原則」を参照してください。本ファイルは開発途中の引き継ぎ資料として当時の記述を残しています。

---

## 1. プロジェクト概要

- **サービス名:** マッスルコーチAI
- **ターゲット:** 30代サラリーマン・エニタイム初心者
- **コアバリュー:** 記録するほど精度が上がる専属AIトレーナー
- **競合優位性:** パーソナルトレーナーより安い
- **マネタイズ:** Stripe サブスクリプション（プレミアムプラン）
- **集客:** X自動投稿 → LINE友達登録 → LIFFアプリで記録・管理

---

## 2. システム構成

```
ユーザー
  ├─ X (@kou_ai_trainer) ── 自動投稿で認知獲得
  │         └─ LINE公式アカウント 友達登録
  ├─ LINE Messaging API
  │    ├─ オンボーディング（トレーナー選択・プロフィール設定）
  │    ├─ AIトレーナー会話（Claude API）
  │    ├─ ワークアウト記録フロー（Quick Reply）
  │    ├─ マイルストーン解放（5/15/30回）
  │    └─ プッシュ通知・週次レポート
  └─ LIFFアプリ（React + Firebase Hosting）
       ├─ ダッシュボード（グラフ・記録カレンダー）
       ├─ プロフィール設定・トレーナー名変更
       └─ Stripe決済
```

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 19 + TypeScript + Styled Components + Chart.js |
| バックエンド | Firebase Functions v2（Node 20） |
| DB | Cloud Firestore（asia-northeast1） |
| AI | Claude API（claude-sonnet-4-6） |
| 認証 | Firebase Anonymous Auth + LIFF |
| 決済 | Stripe |
| X自動投稿 | twitter-api-v2 + Cloud Scheduler |

---

## 3. リポジトリ構造

```
muscle-coach-ai/
├── functions/src/
│   ├── index.ts                        # APIルーター・全Function エクスポート
│   ├── ai/
│   │   ├── client.ts                   # Anthropic APIクライアント
│   │   ├── prompts.ts                  # 全プロンプト定義
│   │   ├── trainer.ts                  # AIトレーナーエンジン
│   │   ├── intentClassifier.ts         # 意図分類（キーワード+AIフォールバック）
│   │   ├── formatter.ts                # LINE用フォーマット・挨拶生成
│   │   └── context.ts                  # 会話コンテキスト管理
│   ├── line/
│   │   ├── webhook.ts                  # LINEウェブフック（全LINE処理のエントリ）
│   │   ├── onboardingFlow.ts           # 6ステップオンボーディング
│   │   ├── recordingFlow.ts            # ワークアウト記録フロー + マイルストーン
│   │   ├── trainerCharacter.ts         # トレーナーキャラクター定義（3種）
│   │   ├── messages.ts                 # LINE送信ヘルパー・Flexメッセージ
│   │   └── richMenu.ts                 # リッチメニュー設定
│   ├── notifications/
│   │   └── scheduledNotifications.ts   # 日次リマインダー（毎時実行）
│   ├── reports/
│   │   └── weeklyReport.ts             # 週次レポート（月曜8:00）
│   ├── subscription/
│   │   └── stripe.ts                   # Stripe決済
│   ├── user/
│   │   └── manager.ts                  # ユーザー管理・利用回数管理
│   ├── workout/
│   │   ├── recorder.ts                 # ワークアウト記録・取得
│   │   └── menuGenerator.ts            # 週次メニュー生成
│   ├── auth/
│   │   └── verifyLiffToken.ts          # LIFF Token認証
│   └── x/
│       ├── client.ts                   # X APIクライアント（OAuth 1.0a）
│       └── autoPost.ts                 # 自動投稿（A/Bテスト付き）
├── liff-app/src/                        # Reactフロントエンド
├── TESTING_CHECKLIST.md                 # APIクレジット追加後の動作確認リスト
└── AGENT_HANDOFF.md                     # 本ドキュメント
```

---

## 4. 環境変数（functions/.env）

以下のキーがすべて設定済み。

```
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
ANTHROPIC_API_KEY          ★ クレジット追加が必要（後述）
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID
LIFF_CHANNEL_ID
LIFF_ID
X_BEARER_TOKEN
X_API_KEY
X_API_SECRET
X_ACCESS_TOKEN
X_ACCESS_TOKEN_SECRET
```

---

## 5. Firebase Functions 一覧

| Function名 | 種別 | スケジュール（JST） | 概要 |
|---|---|---|---|
| `lineWebhook` | HTTP | - | LINEウェブフック |
| `api` | HTTP | - | LIFFアプリ用REST API |
| `stripeWebhook` | HTTP | - | Stripe Webhook |
| `autoPostMorning` | Scheduler | 毎日 7:00 | X自動投稿（朝） |
| `autoPostNoon` | Scheduler | 毎日 12:00 | X自動投稿（昼・ランチ層向け） |
| `autoPostEvening` | Scheduler | 毎日 20:00 | X自動投稿（夜） |
| `sendScheduledNotifications` | Scheduler | 毎時 0分 | LINEプッシュ通知 |
| `sendWeeklyReports` | Scheduler | 毎週月曜 8:00 | 週次レポート |

---

## 6. X アカウント・自動投稿

### アカウント情報

| 項目 | 内容 |
|---|---|
| ユーザー名 | @kou_ai_trainer |
| 表示名 | コウ｜AIパーソナルトレーナー |
| キャラクター | 熱血コーチ「コウ」。エニタイム通いの30代サラリーマン設定 |
| LINE公式URL | https://lin.ee/YjZDGe5 |

**プロフィール文:**
```
AIトレーナーシステム
エニタイム通いの30代サラリーマンをAIでサポート💪
記録するたびに、あなた専用のアドバイスが的確になる専属トレーナーです

✅ パーソナルより安い
✅ 初心者でも続けられる
✅ LINEで今すぐ無料体験👇
https://lin.ee/YjZDGe5
```

### 自動投稿設定

**曜日別テーマ:**
| 曜日 | テーマ |
|---|---|
| 日 | 週末モチベーション・振り返り |
| 月 | スタートダッシュ・週の目標 |
| 火 | 初心者向け基本知識・よくある失敗 |
| 水 | 栄養・食事・プロテインTips |
| 木 | フォームのコツ・怪我予防 |
| 金 | 花金トレーニング・週末モチベーション |
| 土 | 追い込み・週次振り返り |

**投稿頻度:** 1日3投稿（朝7:00 / 昼12:00 / 夜20:00）× 30日 = 90投稿/月

**A/Bテスト（CTA文言バリアント）:**

X API Pay-per-use ではURL含む投稿が $0.20/件と高額（URLなしは $0.015〜$0.02/件）。
**本文・CTAいずれもURLは含めず、プロフィール固定リンクへ誘導する方針。**
文言だけ強弱で振り、どちらが効くかを `xPostLogs.ctaVariant` で集計する。

| 週 | CTAバリアント | 内容 |
|---|---|---|
| 奇数週 | `directProfile` | 本文の末尾に「プロフのリンクから〜」のCTA行を追加（URLなし） |
| 偶数週 | `softProfile` | CTAなし。本編で完結する自然な発信（対照群） |

数週間後にFirestoreの `xPostLogs` と LINE友達追加数を突き合わせて、CTAの効果を判定する。

**投稿ログ保存先:** Firestore `xPostLogs/{tweetId}`
```
{ tweetId, tweetText, weekNum, ctaVariant, timing, postedAt }
```
- `ctaVariant`: `"directProfile" | "softProfile"`
- `timing`: `"morning" | "noon" | "evening"`

**URL混入の保険:** [autoPost.ts](functions/src/x/autoPost.ts) の `stripUrls()` が、モデルが指示を無視してURLを出力した場合に投稿前に除去する。URL課金 $0.20/件を確実に回避するためのガード。

### X API 課金体系（2026年5月時点）

**Pay-per-use（従量課金）**。新規ユーザーは Free / Basic / Pro tier に直接申し込めず、これ一択。
クレジット先払い、Developer Portal で事前チャージしてリクエストごとに消費。

| 操作 | 公称単価 | 実測 |
|---|---|---|
| テキスト投稿（URLなし） | $0.015 | 約 $0.02/件（owned reads等が乗っているとみられる） |
| 投稿（URL含む） | $0.20 | 本プロジェクトでは使わない |
| 投稿の読み取り | $0.005 | 未使用 |

**月コスト試算:** 90投稿 × $0.02 = **約$1.80/月**。$5 チャージで約2.8ヶ月もつ計算。

キーワード検索・自動リプライ・タイムライン取得は未使用。

### 運用ルール

| # | ルール |
|---|---|
| フォロー返し | フォロワー1,000人以上のアカウントのみ **手動** でフォロー返し |
| フォロー | 初期20アカウントのみフォロー済み。以降は原則フォローしない（権威性） |
| コメント対応 | 基本無視。コメントが溜まったらエージェントに貼り付けて分析依頼 |
| コメント保存 | Firestore `xComments` または直接エージェントに貼り付けてその場で分析 |
| 中の人設定 | 「コウ」が運用している体で投稿。プロフに「AIトレーナーシステム」と記載済み |
| NGコンテンツ | 政治・宗教・他サービス批判・医療断定・宣伝臭い内容 |

---

## 7. LINEアプリ詳細

### トレーナーキャラクター

| ID | 名前 | 特徴 |
|---|---|---|
| `hot` | コウ | 🔥 熱血。情熱的・力強い言葉 |
| `science` | ドクターK | 🧪 科学派。データ・根拠重視・クール |
| `buddy` | アキラ先輩 | 😄 兄貴キャラ。フレンドリー・温かい |

トレーナー名はLIFFアプリのプロフィール画面からカスタマイズ可能。

### オンボーディングフロー（6ステップ）

1. トレーナー選択（Quick Reply）
2. ニックネーム入力（テキスト）
3. 目標選択（筋肥大/筋力向上/ダイエット/健康維持）
4. 身長レンジ選択
5. 体重レンジ選択
6. トレーニング頻度選択 → 確認画面 → 完了

完了後: Claude APIで初回週次メニューを自動生成してLINEに送信。

### マイルストーン解放

| 回数 | 解放コンテンツ | 内容 |
|---|---|---|
| 5回 | 弱点部位レポート | 部位バランス分析・補強提案 |
| 15回 | 成長トレンド分析 | 初期vs最近の重量・回数変化 |
| 30回 | プログラム最適化 | 全履歴分析・改善提案3点 |

### メッセージ表示ロジック

| 意図（intent） | 動作 |
|---|---|
| `greeting` | AI呼び出しなし・即返答・利用カウント消費なし |
| `menu_request` / `progress` | `📋 プログラムを設計してるよ...\n少しだけ待っててね⏳` |
| その他AI会話 | `trainer.thinkingMessage`（キャラ別） |

### プッシュ通知

- LIFFアプリのプロフィール画面でON/OFF・時刻設定
- ON → 毎日設定時刻にキャラ別リマインダー
- 月曜日 → 週次レポートに自動切替
- キャラ別メッセージ（hot/science/buddyそれぞれ3パターン）

### LINE 応答設定（重要）

LINE Developers Console で以下を守ること:
- **応答モード: Bot**（チャットモードにすると返信が無効化される）
- **Webhookの利用: ON**
- **挨拶メッセージ: OFF**（オンボーディングと競合するため）

---

## 8. Firestoreコレクション

| コレクション | 用途 |
|---|---|
| `users/{userId}` | ユーザープロフィール・設定・オンボーディング状態 |
| `users/{userId}/workouts` | ワークアウト記録 |
| `users/{userId}/conversations` | AI会話履歴 |
| `xPostLogs/{tweetId}` | X自動投稿ログ（A/Bテスト管理） |
| `xComments` | Xコメント手動保存（分析用受け皿） |

---

## 9. デプロイ方法

```bash
# Functionsのみ
cd functions && npm run build && cd .. && firebase deploy --only functions

# フロントエンドのみ
cd liff-app && npm run build && cd .. && firebase deploy --only hosting

# 特定Functionのみ
firebase deploy --only functions:autoPostMorning,functions:autoPostNoon,functions:autoPostEvening
```

---

## 10. 現在の状態・既知の問題

### ★ 最重要: Anthropic APIクレジット不足

**全AI機能が停止中。** 課金すれば即座に全機能が動き出す。

- **影響:** X自動投稿・LINEオンボーディング完了・AI会話・マイルストーン・週次レポート・通知
- **対応:** https://console.anthropic.com/settings/billing でクレジット購入
- **確認:** Firebase Functions ログで `credit balance is too low` が消えればOK

### クレジット追加後の確認リスト

詳細は `TESTING_CHECKLIST.md` を参照。主な確認：

- [x] LINEで「おはよう」→ 即座に挨拶返答（thinkingMessage不要）
- [x] ワークアウト5回記録 → 弱点部位レポートが追送される
- [x] 「メニュー作成」→ `📋 プログラムを設計してるよ...` 表示後にメニューが届く
- [x] プロフィールで通知ON → 設定時刻にリマインダー届く
- [x] X投稿ログが `xPostLogs` に保存される

---

## 11. 今後の対応・優先度

| 優先度 | タスク |
|---|---|
| 🔴 今すぐ | Anthropic APIクレジット追加 |
| 🟡 数週間後 | X A/Bテスト結果の比較・CTA方針の固定 |
| 🟡 随時 | フォロワー1,000人超えアカウントの手動フォロー返し |
| 🟢 コメントが増えたら | Xコメント内容をエージェントに貼り付けて分析依頼 |
| 🟢 将来 | X Basic tier移行（自動リプライが必要になったとき） |
