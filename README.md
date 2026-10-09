# マッスルコーチAI

LINE に「ベンチ60キロ10回3セット」と雑に送るだけで筋トレが記録され、
たまった記録から「伸びているところ・続けられている種目・伸び悩んでいるところ」を
言葉で返してくれる、LINE 完結型の筋トレ記録サービス。

- **ターゲット:** ジム通いを始めたばかりの30代会社員
- **構成:** LINE Messaging API + LIFF（React）+ Firebase + Claude API + Stripe
- **集客:** X 自動投稿 → LINE 友だち追加 → LIFF で記録を閲覧
- **ステータス:** 個人開発として一通り完成（2026-10 時点で開発を一区切り）

ランディングページ: https://muscle-coach-ai.web.app/lp.html

---

## 主な機能

| 場所 | 機能 |
|---|---|
| LINE トーク | 自然文の記録パース（欠損項目は Quick Reply で最大2問だけ聞き返す） |
| LINE トーク | 「分析して」で直近7日の記録を集計し、固定4セクションで言語化 |
| LINE トーク | 累計 5 / 15 / 30 回の記録でマイルストーン分析を配信 |
| LINE トーク | 週次レポート（月曜朝）・設定時刻の日次リマインダー |
| LIFF アプリ | ダッシュボード（グラフ・マイルストーン・分析サマリー）、記録フォーム、履歴カレンダー、インターバルタイマー、プロフィール設定、初回プロダクトツアー |
| LIFF アプリ | Stripe Checkout / Customer Portal によるサブスクリプション（月額 ¥1,480、1週間無料トライアル） |
| バックエンド | X への1日3回の自動投稿と投稿メトリクス収集 |

---

## 設計で一番こだわったこと: AIに「正解のない出力」をさせない

当初は AI がトレーニングメニューを組み、フォーム指導やキャラクター付きの会話もする
「AIパーソナルトレーナー」として作っていた。運用してみると、メニュー生成やコーチング会話は
**正解が存在しないため品質を検証できず、同じ依頼でも毎回違う答えが返る**という根本的な問題があった。

そこで途中で方針を転換し、AI の用途を **入出力が検証できる2つだけ** に絞った。

1. **雑な入力 → 構造化記録**（入力と出力が1対1で対応し、正解がある）
2. **集計済みの数値 → 読みやすい文章**（判断・計算はすべてコード側が行う）

```
ユーザーの自然文 ──▶ [AI] パース ──▶ 欠損検出（コード）──▶ 聞き返し / 保存
                                                              │
                                                              ▼
                           Firestore の記録 ──▶ 集計・判定・ハイライト選定（コード）
                                                              │
                                                              ▼
                                        [AI] 固定フォーマットへの言語化のみ（数値の捏造禁止）
```

- 伸び・継続・伸び悩みの判定と、どの項目を取り上げるかの選定はコードで決まるため、
  **同じ記録からは同じ分析が返る**（再現性）。
- 部位の網羅性で「弱点」を責める表現はやめ、やっている種目の伸びと継続を主役にした。
- メニュー生成・コーチング会話・トレーナー3キャラは機能ごと削除した。

経緯と判断の詳細は [docs/spec/ai-scope-pivot.md](docs/spec/ai-scope-pivot.md) にまとめている。

### LIFF と LINE の役割分担

| 配置先 | 役割 |
|---|---|
| LINE トーク | 記録の入口・集計結果の受け取り・通知（雑に送って、言葉で返ってくる場所） |
| LIFF アプリ | ユーザーが能動的に見るデータ（グラフ・履歴・設定・決済） |

新しい機能を足すときは「これは記録の投入/集計結果の受け取りか、ユーザーが見に行くデータか」で
置き場所を決めるルールにしている。

---

## アーキテクチャ

```
                ┌──────────────┐
  X ◀── 自動投稿 │ Cloud        │
                │ Scheduler    │──▶ 週次レポート / 日次リマインダー / X 投稿
                └──────────────┘
                        │
LINE ユーザー ──▶ LINE Messaging API ──▶ lineWebhook (Functions v2)
     │                                        │
     └──▶ LIFF アプリ (React, Hosting) ──▶ api (Functions v2, REST)
                                              │
                         ┌────────────────────┼─────────────────────┐
                         ▼                    ▼                     ▼
                   Cloud Firestore        Claude API             Stripe
                   (Admin SDK のみ)    (パース / 言語化)      (Checkout / Webhook)
```

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 19 / TypeScript / Vite / Styled Components / Chart.js / LIFF SDK |
| バックエンド | Firebase Functions v2（Node 22, TypeScript） |
| DB | Cloud Firestore（asia-northeast1） |
| AI | Claude API（記録パース・意図分類は Haiku 4.5、分析の言語化は Sonnet 4.6 とタスク別に使い分け） |
| 認証 | LIFF Access Token をサーバ側で検証 + Firebase Anonymous Auth |
| 決済 | Stripe（Checkout / Customer Portal / Webhook） |
| 集客 | twitter-api-v2 + Cloud Scheduler |

### セキュリティ上の判断

- Firestore はルールで**クライアントからの読み書きを全面禁止**し、すべて Functions の Admin SDK 経由にしている。
- LIFF からの API リクエストは `Authorization: Bearer <LIFF Access Token>` を必須とし、
  トークンの userId とリクエスト対象の userId が一致しなければ 401 を返す。
- ログにメッセージ本文を出さない（個人情報の漏えい対策）。

### 課金設計

フリー（記録1日3回・分析週1回）とプレミアム（無制限 + 週次レポート・通知）の制限ロジックは実装済み。
ベータ期間中はフラグ `BETA_ALL_PREMIUM` で全員をプレミアム扱いにしており、
集客が進んだらフラグ1つで課金導線を有効化できるようにしている。

---

## ディレクトリ構成

```
functions/src/
  ai/              Claude クライアント・プロンプト・意図分類・分析の言語化
  line/            Webhook・オンボーディング・記録フロー（聞き返し）・リッチメニュー
  workout/         記録の保存（recorder）と集計（history）
  reports/         週次レポート
  notifications/   日次リマインダー
  subscription/    Stripe
  user/            ユーザー管理・利用回数・プレミアム判定
  auth/            LIFF Token 検証
  x/               X 自動投稿・メトリクス収集
  index.ts         Function の export と LIFF 用 REST API

liff-app/src/
  pages/           Dashboard / WorkoutInput / WorkoutLog / Timer / Profile / Setup / Subscribe / Onboarding
  components/      Header / BottomNav / TermsGate（規約同意）など共通 UI
  tour/            初回プロダクトツアー
  api.ts           REST API クライアント（全リクエストに LIFF Token を付与）

docs/spec/         機能ごとの spec（要件）と plan（実装計画）
```

---

## 開発プロセス

機能ごとに **spec（なぜ・何を作るか）と plan（どう作るか）を分けて書き、承認してから実装**した。

| 機能 | spec | plan |
|---|---|---|
| AI 用途の再定義 | [ai-scope-pivot.md](docs/spec/ai-scope-pivot.md) | [ai-scope-pivot-plan.md](docs/spec/ai-scope-pivot-plan.md) |
| 分析フォーマット | [analysis-highlight-format.md](docs/spec/analysis-highlight-format.md) | [analysis-highlight-format-plan.md](docs/spec/analysis-highlight-format-plan.md) |
| 記録の聞き返し | [record-clarification.md](docs/spec/record-clarification.md) | [record-clarification-plan.md](docs/spec/record-clarification-plan.md) |
| UI の方針転換対応 | [ui-pivot-redesign.md](docs/spec/ui-pivot-redesign.md) | [ui-pivot-redesign-plan.md](docs/spec/ui-pivot-redesign-plan.md) |

実機での確認項目は [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)、
開発時のルールと既知の落とし穴は [CLAUDE.md](CLAUDE.md) にまとめている。

---

## ローカルでの動かし方

前提: Node.js 22、Firebase CLI、LINE 公式アカウント（Messaging API / LIFF）、Anthropic API キー、Stripe アカウント。

```bash
# バックエンド
cd functions
npm install
cp ../.env.example .env    # LINE / Anthropic / Stripe / X のキーを設定
npm run build

# フロントエンド
cd ../liff-app
npm install
cp .env.example .env.local # VITE_API_URL / VITE_LIFF_ID を設定
npm run dev                # LIFF は HTTPS でしか動かないため、LIFF Inspector 等を併用する
```

デプロイ（hosting は他と一括指定せず単独で実行する）:

```bash
cd functions && npm run build && cd .. && firebase deploy --only functions
cd liff-app && npm run build && cd .. && firebase deploy --only hosting
```
