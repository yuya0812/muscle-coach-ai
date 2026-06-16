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

## 設計原則: LIFF=閲覧 / LINE=記録の入口＋分析の言語化

**この棲み分けを絶対に崩さない。** 新機能の配置先で迷ったらこれで判断する。

> 2026-06 方針転換: 旧原則「LINE=コーチング」を廃止。AIに「正解のない出力」（メニュー生成・
> フォーム指導・コーチング会話）をさせるのをやめ、AIの用途を「①雑な入力を構造化記録する
> ②記録を集計して分析を言語化する」の2つに限定した。トレーナー3キャラの人格も廃止。
> 詳細は [docs/spec/ai-scope-pivot.md](docs/spec/ai-scope-pivot.md)。

| 配置先 | 用途 | 例 |
|---|---|---|
| **LIFFアプリ** | 記録・閲覧・データダッシュボード（静的、ユーザーが能動的に開く） | ワークアウト記録、グラフ、履歴カレンダー、プロフィール設定、決済 |
| **LINEトーク** | 記録の入口・分析の言語化・通知（雑に投げて、集計結果を言葉で受け取る場所） | 自然文の記録パース、分析（コード集計+AI言語化）、マイルストーン、週次レポート、リマインダー |

**判断基準:** 「これはユーザーが見るデータ？ それとも記録の投入・集計結果の受け取り？」
- 記録の投入・集計結果の言語化 → LINE
- ユーザーが能動的に見るデータ（グラフ・履歴・設定） → LIFF

**AIに任せること / 任せないこと（最重要）:**
- AIに任せる: 自然言語の入出力変換だけ（雑な入力→構造化、集計済み数値→読みやすい文章）
- AIに任せない: 判断・計算（弱点・伸び悩み・部位バランスはコードが集計し判定する）
- 理由: 「正解のない生成」は検証も再現もできずユーザーの信頼を損なう。入出力が検証可能で
  再現性のある用途にAIを限定することで、「同じ記録なら同じ分析」を保証する。

**実装の核:**
- 記録パース: `functions/src/workout/recorder.ts`（`parseWorkoutText` → 欠損検出
  `detectMissingFields` → `saveWorkout`。LIFF 経由は `saveWorkoutDirectly`）
- 聞き返し: 欠損が2問以内なら `recordingFlow.ts` の clarify ステートで Quick Reply 補完。
  離脱（回答以外のメッセージ）で保留は破棄され、中途半端な記録は保存しない。
  自重種目（`isBodyweightExercise`）は重量を聞かない。
  詳細は [docs/spec/record-clarification.md](docs/spec/record-clarification.md)
- 集計: `functions/src/workout/history.ts`（部位タッチ数・最大重量・成長トレンド
  `buildGrowthTrend`・週次スナップショット `buildWeeklySnapshot`）
- 分析: `functions/src/ai/analysis.ts`。ハイライト選定（`selectHighlights`、各セクション
  上限つき）までコードが行い、AI は固定4セクション（弱点/伸びているところ/
  伸び悩んでいるところ/次のステップ）の言語化のみ（`ANALYSIS_VERBALIZE_PROMPT`、捏造厳禁）。
  通常分析・週次レポートは週区切り（直近7日が軸）、マイルストーンは全期間集計。
  詳細は [docs/spec/analysis-highlight-format.md](docs/spec/analysis-highlight-format.md)

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
ai/             AIのコア（client / prompts / trainer / intentClassifier / formatter / analysis）
                ※ 用途は記録パースと分析の言語化のみ。メニュー生成・コーチング会話は廃止。
line/           LINE関連処理（webhook / onboardingFlow / recordingFlow / trainerCharacter / messages / richMenu）
notifications/  日次リマインダー（毎時実行・ユーザー設定時刻にpush）
reports/        週次レポート（月曜8:00 JST）
subscription/   Stripe決済
user/           ユーザー管理・利用回数カウント
workout/        ワークアウト記録・取得・集計（recorder / history）。メニュー生成は廃止
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

## プレミアムプラン仕様

> 2026-06 方針転換で「AI相談（コーチング）」「目標別パーソナルプログラム」は廃止。
> 課金軸は分析機能に合わせて要再設計（下表は暫定。`AI分析` は分析の言語化リクエストを指す）。

| 機能 | フリー | プレミアム |
|------|-------|-----------|
| AI分析（記録の集計+言語化） | 月5回 | 無制限 |
| 筋トレ記録（自然文パース含む） | ◯ | ◯ |
| マイルストーン（全段階） | ◯ | ◯ |
| 週次AIレポート | ✕ | ◯ |
| 日次/週次プッシュ通知 | ✕ | ◯ |

- **価格:** ¥1,480/月
- **トライアル:** 1週間無料
- 課金軸（回数制限の対象・閾値）は分析機能の運用実績を見て見直す。

---

## 既知の罠

### 🔴 マイルストーンは記録経路ごとに発火を仕込む必要がある
ワークアウト記録は **LINE経由（recordingFlow.ts）** と **LIFF経由（POST /api/workouts）** の2系統ある。マイルストーン達成チェックは両方で呼ばないとレポートが届かない。共通関数 `checkAndPushMilestone(userId)` を [recordingFlow.ts](functions/src/line/recordingFlow.ts) からexportしている。
2026-06 方針転換後、マイルストーンの**中身**は「履歴JSONをLLMに丸投げ」から「コード集計+AI言語化」（[analysis.ts](functions/src/ai/analysis.ts) の `buildAnalysis`）に変更済み。トリガー（5/15/30回）と2経路発火の構造は不変。

### 🔴 LINE Developers Console の応答設定
- **応答モード: Bot**（チャットモードにすると返信が無効化される）
- **Webhookの利用: ON**
- **挨拶メッセージ: OFF**（オンボーディングと競合する）

### 🟡 Anthropic APIクレジット切れで全AI機能停止する
クレジット枯渇すると 記録パース・分析・マイルストーン・週次レポート・X自動投稿が全部止まる。`credit balance is too low` エラーがログに出たら即課金。
（特に記録パースが止まると自然文記録が一切保存できなくなるので影響が大きい）

### 🔴 X API は Pay-per-use 課金。URL含む投稿は単価13倍
新規アカウントは Free / Basic / Pro tier に申し込めず Pay-per-use 一択（2026/02〜）。
URLなし $0.015/件・URL含む $0.20/件 で、本プロジェクトは**本文/CTAいずれもURL不掲載**でプロフィール誘導する方針。
[autoPost.ts](functions/src/x/autoPost.ts) の `stripUrls()` がモデルの逸脱を投稿前に除去する保険。これを外すと月コストが跳ねるので注意。
クレジットは X Developer Portal で事前チャージ。残高はそこで監視する。

### 🟡 X自動投稿は1日3回。noon/evening が間欠的に 403 する（観察中・2026-06）
morning(7:00)/noon(12:00)/evening(20:00) の1日3回投稿。noon・evening が
`403 Forbidden`（"You are not permitted to perform this action"）で弾かれることがあるが、
「3回とも成功する日もある」ため固定的なプラン上限ではなく**間欠的な失敗**と判断。
各関数に `retryCount: 2` を付けて拾い直す方針で運用・観察している。
`xPostLogs` は成功・失敗の両方を記録する（doc ID = `YYYY-MM-DD_<timing>`、`status` フィールドで区別）。
冪等性: 同じ `YYYY-MM-DD_<timing>` が success 済みならリトライ時もスキップ（二重投稿しない）。
失敗の傾向を見るときは xPostLogs の `status: failed` の `errorCode`/`errorMessage`、または
Cloud Logging の `[AutoPost <timing>] X API failed` を見る。
投稿本文は方針転換後の世界観（雑にLINEへ送れば記録／AIが弱点・伸びを言語化）に合わせてある。
メニュー提案・フォーム指導など廃止機能を匂わせる文言を入れないこと。

### 🟡 LIFF SDK は HTTPSドメインでのみ動作
ローカル開発時は `liff-app` を `npm run dev` した URL を LIFF Endpoint に登録するか、LIFF Inspector を使う。

### 🟡 トレーナーキャラは廃止（2026-06 方針転換）
トレーナー3キャラ（コウ/ドクターK/アキラ先輩）の人格と `trainerCharacter.ts` は削除済み。
LINE の `sender.name` は固定のサービス名 `"マッスルコーチ"`（各ファイルの `APP_SENDER_NAME`）を使う。
`getTrainer`/`getTrainerName`/`thinkingMessage` は存在しない。
データモデルの `trainerType`/`trainerName` フィールドは既存ユーザー保護のため残置しているが、
新規に参照・書き込みしない（LIFF プロフィールのトレーナー名 UI を残す場合も応答口調には影響させない）。

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
