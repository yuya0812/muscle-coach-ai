# muscle-coach-ai 開発ガイドライン

このファイルはエージェントが毎回読むプロジェクト固有のルール集。詳細仕様は [AGENT_HANDOFF.md](AGENT_HANDOFF.md) を参照。

---

## 重要ルール

- **編集前にコードベースを調査せよ。読んでいないコードは決して変更しないように。**
- 破壊的操作（git reset、本番デプロイ、DBスキーマ変更等）は必ずユーザーに確認を取ること。
- 推測でAPIや関数を呼ぶな。実装を読んでから呼ぶ。

---

## プロジェクト概要

- **サービス名:** マッスルコーチAI
- **構成:** LINE LIFF × AI筋トレコーチ（Claude API）× Stripe
- **ターゲット:** 30代サラリーマン・エニタイム初心者
- **マネタイズ:** Stripeサブスクリプション（¥1,480/月、トライアル1週間無料）
- **集客:** X自動投稿 → LINE友達登録 → LIFFアプリで記録・管理

---

## 設計原則: LIFF=記録 / LINE=コーチング

**この棲み分けを絶対に崩さない。** 新機能の配置先で迷ったらこれで判断する。

| 配置先 | 用途 | 例 |
|---|---|---|
| **LIFFアプリ** | 記録・閲覧・データダッシュボード（静的、ユーザーが能動的に開く） | ワークアウト記録、グラフ、履歴カレンダー、プロフィール設定、決済 |
| **LINEトーク** | AIトレーナーとの対話・通知・レポート（コーチからの能動的なコミュニケーション） | AI会話、マイルストーンレポート、週次レポート、リマインダー、メニュー提案 |

**判断基準:** 「これはコーチが言うこと？それともユーザーが見るデータ？」
- コーチが言うこと → LINE
- ユーザーが見るデータ → LIFF

**理由:** ユーザーの認知モデルをシンプルに保ち、AIトレーナー（コウ/ドクターK/アキラ先輩）のキャラクター性を LINE に集約することで「人格を持った専属トレーナー」というナラティブを保つため。

---

## アーキテクチャ

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 19 + TypeScript + Styled Components + Chart.js（[liff-app/](liff-app/)） |
| バックエンド | Firebase Functions v2（Node 20）（[functions/](functions/)） |
| DB | Cloud Firestore（asia-northeast1） |
| AI | Claude API（claude-sonnet-4-6） |
| 認証 | Firebase Anonymous Auth + LIFF Token |
| 決済 | Stripe |
| X自動投稿 | twitter-api-v2 + Cloud Scheduler |

### functions/src/ ディレクトリ責務マップ

```
ai/             AIトレーナーのコア（client / prompts / trainer / intentClassifier / formatter / context）
line/           LINE関連処理（webhook / onboardingFlow / recordingFlow / trainerCharacter / messages / richMenu）
notifications/  日次リマインダー（毎時実行・ユーザー設定時刻にpush）
reports/        週次レポート（月曜8:00 JST）
subscription/   Stripe決済
user/           ユーザー管理・利用回数カウント
workout/        ワークアウト記録・取得・週次メニュー生成
auth/           LIFF Token認証
x/              X自動投稿
index.ts        全Function export + LIFF用 REST API ハンドラ
```

### liff-app/src/ ディレクトリ責務マップ

```
pages/          Dashboard / Onboarding / Profile / Subscribe / WorkoutInput / WorkoutLog
components/     Header / BottomNav / Loading / PlanBadge
tour/           初回操作説明（TourContext / TourOverlay / steps）
api.ts          REST APIクライアント（全リクエストが LIFF Access Token 認証付き）
firebase.ts     Firebase 初期化（クライアント直アクセスは廃止、認証のみ）
liff.ts         LIFF SDK 初期化
theme.ts        Styled Components テーマ（ダークUI）
```

---

## 環境変数

| ファイル | 用途 |
|---|---|
| `functions/.env` | バックエンド（LINE / ANTHROPIC / Stripe / X / LIFF）— 設定済み |
| `liff-app/.env.local` | フロント（VITE_API_URL / VITE_LIFF_ID）— 必要に応じて |
| `.env.example` | テンプレート（コミット対象） |

**機密ファイルは絶対にコミットしない。** `*.env` は `.gitignore` 済み。

---

## セキュリティ・データアクセス

### Firestoreは全Deny

[firestore.rules](firestore.rules) でクライアント直アクセスを完全禁止。

```
allow read, write: if false;
```

**全てのデータ操作は Cloud Functions の Admin SDK 経由で行う。** LIFFアプリから Firestore SDK で直接読み書きしてはいけない。`liff-app/src/api.ts` 経由でREST APIを叩く。

### LIFF Token認証

LIFFからのAPIリクエストは全て `Authorization: Bearer <LIFF Access Token>` を付与し、`functions/src/auth/verifyLiffToken.ts` で検証する。`requestedUserId` と Token の userId が一致しない場合は 401 を返す。

### 機密データ取り扱い

- ユーザーのLINE userId は外部に漏らさない
- Stripeの顧客ID・サブスクリプションIDは Firestore の `users/{userId}` 内に保存
- ログにメッセージ本文を出さない（PII漏洩リスク）

---

## デプロイ

```bash
# Functionsのみ
cd functions && npm run build && cd .. && firebase deploy --only functions

# 特定Functionのみ
firebase deploy --only functions:api,functions:lineWebhook

# フロントエンドのみ
cd liff-app && npm run build && cd .. && firebase deploy --only hosting

# Firestoreルール
firebase deploy --only firestore:rules
```

**注意:** [firebase.json](firebase.json) のhosting設定は `public/` を見ているが、liff-app は `liff-app/dist` にビルドされる。本番デプロイ前に hosting source を見直すこと（本番フェーズで対応予定）。

---

## プレミアムプラン仕様（確定済み）

| 機能 | フリー | プレミアム |
|------|-------|-----------|
| AI相談 | 月5回 | 無制限 |
| 筋トレ記録 | ◯ | ◯ |
| マイルストーン（全段階） | ◯ | ◯ |
| 週次AIレポート | ✕ | ◯ |
| 日次/週次プッシュ通知 | ✕ | ◯ |
| 目標別パーソナルプログラム | ✕ | ◯ |

- **価格:** ¥1,480/月
- **トライアル:** 1週間無料

---

## 既知の罠

### 🔴 マイルストーンは記録経路ごとに発火を仕込む必要がある
ワークアウト記録は **LINE経由（recordingFlow.ts）** と **LIFF経由（POST /api/workouts）** の2系統ある。マイルストーン達成チェックは両方で呼ばないとレポートが届かない。共通関数 `checkAndPushMilestone(userId)` を [recordingFlow.ts](functions/src/line/recordingFlow.ts) からexportしている。

### 🔴 LINE Developers Console の応答設定
- **応答モード: Bot**（チャットモードにすると返信が無効化される）
- **Webhookの利用: ON**
- **挨拶メッセージ: OFF**（オンボーディングと競合する）

### 🟡 Anthropic APIクレジット切れで全AI機能停止する
クレジット枯渇すると AI会話・マイルストーン・週次レポート・X自動投稿が全部止まる。`credit balance is too low` エラーがログに出たら即課金。

### 🔴 X API は Pay-per-use 課金。URL含む投稿は単価13倍
新規アカウントは Free / Basic / Pro tier に申し込めず Pay-per-use 一択（2026/02〜）。
URLなし $0.015/件・URL含む $0.20/件 で、本プロジェクトは**本文/CTAいずれもURL不掲載**でプロフィール誘導する方針。
[autoPost.ts](functions/src/x/autoPost.ts) の `stripUrls()` がモデルの逸脱を投稿前に除去する保険。これを外すと月コストが跳ねるので注意。
クレジットは X Developer Portal で事前チャージ。残高はそこで監視する。

### 🟡 LIFF SDK は HTTPSドメインでのみ動作
ローカル開発時は `liff-app` を `npm run dev` した URL を LIFF Endpoint に登録するか、LIFF Inspector を使う。

### 🟡 トレーナー名のカスタマイズ
ユーザーは LIFFアプリのプロフィールでトレーナー名を変更できる。LINE側でメッセージ送信する時は必ず `getTrainerName(userId)` で取得した名前を `sender.name` に入れる。

---

## コミット・PR運用

- コミットメッセージは Conventional Commits（`feat:` / `fix:` / `chore:` / `docs:` 等）。
- mainブランチへの直接pushは原則禁止。PR経由で確認する。

---

## 関連ドキュメント

- [NEXT_TASKS.md](NEXT_TASKS.md) — **セッション再開時はまずこれを読む。** 残タスクと進捗
- [AGENT_HANDOFF.md](AGENT_HANDOFF.md) — プロジェクト全詳細・引き継ぎ用
- [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) — APIクレジット追加後の動作確認リスト
- [design_handoff_ui_redesign/](design_handoff_ui_redesign/) — UIリデザイン仕様書 + プロトタイプ
