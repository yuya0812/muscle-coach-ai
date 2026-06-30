# 次回再開時のタスク

最終更新: 2026-06-28

セッション再開時はまずこのファイルを読む。完了したタスクは `[x]` でチェック、新しく見つけたら追加。

---

## 【重要】2026-06 方針転換: AI用途を「記録パース + 分析の言語化」に絞った

メニュー生成・コーチング会話（フォーム指導・栄養相談・一般会話）・トレーナー3キャラの人格を
**全て廃止**し、AIの用途を次の2つに限定した。設計の経緯は
[docs/spec/ai-scope-pivot.md](docs/spec/ai-scope-pivot.md) と
[docs/spec/ai-scope-pivot-plan.md](docs/spec/ai-scope-pivot-plan.md) を参照。

1. 雑な入力 → 構造化記録（`workout/recorder.ts`）
2. 記録の集計・分析 → コード集計 + AI言語化（`workout/history.ts` + `ai/analysis.ts`）

- 削除: `workout/menuGenerator.ts` / `ai/context.ts` / `line/trainerCharacter.ts`
- 作り替え: マイルストーン・週次レポートを `buildAnalysis`（コード集計+AI言語化）に載せ替え
- 意図分類は record / analyze / greeting / other の4分類に縮小
- LINE の sender 名は固定 `"マッスルコーチ"`（`APP_SENDER_NAME`）。キャラ名は使わない
- オンボーディングは6ステップ→5ステップ（トレーナー選択を撤去）

### この転換に伴う残課題（次セッション以降）
- [x] プレミアム課金軸の再設計（2026-07）。フリー＝記録1日3回/分析週1回、プレミアム＝無制限。
      週次レポート・通知はプレミアム特典。**ベータ中は `BETA_ALL_PREMIUM=true` で全員プレミアム扱い**。
      プレミアム判定は `manager.ts` の `isPremiumUser()` に一元化。詳細は CLAUDE.md。
  - [ ] 🔴 ベータ解除（集客が乗ったら）: `manager.ts` の `BETA_ALL_PREMIUM` を false にして再デプロイ。
        切替前に下記の課金導線の品質を仕上げること:
    - [ ] LIFF 記録の上限到達（POST /api/workouts が 429 record_limit）時、api.ts の汎用 throw ではなく
          サーバの `message` をユーザーに出す。WorkoutInput 側のエラー表示も上限と分かる文言にする
    - [ ] Dashboard の残数表示・アップグレードナッジが期待通り出るか実機確認（ベータ中は ∞ 表示で出ない）
    - [ ] Stripe 本番化（決済が通らないと課金導線が成立しない。本番設定フェーズと連動）
- [x] 既存の絵文字残存の整理（2026-07 完了）。`messages.ts` のウェルカム/メニュー文言を実機能に
      差し替えつつ絵文字除去。コードベース全体の絵文字スキャンもゼロを確認。
- [x] LIFF 側（React）のメニュー表示画面・トレーナー名カスタマイズ UI の扱い（2026-07 確認）。
      pages にメニュー画面は存在せず（Dashboard/Onboarding/Profile/Setup/Subscribe/WorkoutInput/
      WorkoutLog のみ）、Profile に呼び方/トレーナー名の入力欄もない。方針転換時に撤去済みで
      対応不要だった。残っていたのは api.ts の廃止理由コメント1行のみ（(b) で整理済み）。
- [x] `trainerType`/`trainerName` は参照を全停止（2026-07）。新規の読み書き・AIプロンプト注入なし。
      フィールド自体は既存ユーザー保護のため残置（完全削除は将来マイグレーションで）。
- [ ] 動作確認: 記録パース / 「分析して」/ マイルストーン(5/15/30) / 週次レポートの新経路

---

## 直近の完了事項（2026-05-22〜23 セッション: AIトレーナー品質向上）

- [x] 全AI応答経路に履歴サマリーを注入（`functions/src/workout/history.ts` 新設）
  - 直近30セッションの種目別最大重量・中央値レップ・実施回数・部位別タッチ数を集計
  - `buildConversationContext` で並列取得し、general / form / nutrition / progress / menu 全経路に共通注入
  - `WorkoutHistorySummary.hasRecords` を導入し、壊れやすい文字列 includes 判定を撤廃
- [x] 意図分類の自然文パターン拡張（`intentClassifier.ts`）
  - 「数字+単位」を含んでも相談語があれば record 扱いしないガード追加
  - menu/progress/form の自然言語パターンを大幅拡張（「胸の日」「停滞」「違和感」等）
  - 痛み・違和感は form_question に集約して医療相談誘導の経路に乗せる
- [x] プロンプト全面改訂（Codex レビュー反映）
  - TRAINER_PERSONA に文字数優先順位・専門語ポリシー・重量表記ポリシーを集約
  - MENU_GENERATION_PROMPT で履歴値の前回→今回明記を必須化
  - JSON 系プロンプトでコードフェンス禁止を明示
  - `extractJson()` 防御層導入で前置き付き JSON も自動回復
- [x] LINE メッセージの絵文字を全削除し、視認性を構造化記号で補強
  - 太い区切り線 ━━━ / 細い区切り線 ──
  - 種目番号を全角ブラケット ［１］で表示
  - カテゴリ・テーマ・アドバイスを《 》で見出し化
  - ポイント補足を ▷ マーカーで本文と区別
  - トレーナーキャラ3種の thinkingMessage / label の絵文字も除去

## 直近の完了事項（2026-05-17〜21 セッション）

- [x] 利用規約・プライバシーポリシー同意ゲート（TermsGate）の実装と起動時表示確認
- [x] BottomNav 下余白のページ間バラつき解消（theme.layout.bottomNavSpace で統一）
- [x] X 自動投稿の本番化
  - X Developer Portal で Read and Write 権限を有効化、5キー再発行
  - X API Pay-per-use へ課金登録（$5チャージ）
  - URL課金（$0.20/件）回避のため、本文/CTAいずれもURL不掲載・プロフィール誘導方針に変更
  - A/Bテストを「URL有無」→「CTA文言バリアント（directProfile / softProfile）」に再設計
  - `stripUrls()` 保険を導入
  - 詳細エラーログ（X API レスポンスの code/data/errors）を出力するよう改修
  - 朝7時の手動実行で投稿成功・タイムライン表示・xPostLogs保存を確認
  - 1日3投稿に拡張（朝7:00 / 昼12:00 / 夜20:00、`autoPostNoon` 追加）

---

## 🔴 すぐやる（次セッションの起点）

### TESTING_CHECKLIST の通し動作確認
[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) の項目を順に実行。Anthropicクレジットは追加済みなので全AI機能が動くはず。

- [ ] LINEで「おはよう」→ 即座に挨拶返答
- [ ] ワークアウト5回記録 → 弱点部位レポート追送
- [x] 「メニュー作成」→ 待機メッセージ後にメニューが届く（5/23 確認）
- [ ] プロフィールで通知ON → 設定時刻にリマインダー届く
- [x] X投稿ログが Firestore `xPostLogs` に保存される（朝の手動実行で確認済）

---

## 🟡 本番環境設定フェーズ（次の大きな塊）

### Git管理（完了）
- [x] `.gitignore` 整備、機密ファイル除外
- [x] initial commit + GitHub 紐付け済み
- [ ] ブランチ運用ルールの明文化（現状は main 直push運用）

### firebase.json の hosting 設定修正
現状 `"public": "public"` で、`liff-app` のvite出力は直接 `public/` に書かれる構成。
本来は `liff-app/dist` を public source にしたほうが綺麗だが、当面は現運用で問題ない。
- [ ] hosting の source を liff-app に向ける（任意の整理タスク）
- [ ] predeploy フックで `cd liff-app && npm run build` を自動実行

### Stripe 本番化
- [ ] Stripe Dashboard で本番モードに切替
- [ ] 本番用 secret key / publishable key / price ID を取得
- [ ] `functions/.env` に本番キーを設定
- [ ] 本番 webhook エンドポイント登録 + webhook secret 取得
- [ ] テストカードでサブスク作成 → キャンセル → 再開 まで通す

### LINE / LIFF 本番URL差し替え
- [ ] LINE Developers Console: Webhook URL を本番Functions URLに
- [ ] LIFF Endpoint URL を本番Hosting URLに
- [ ] リッチメニューが本番URLを指していること確認

### 監視・バックアップ
- [ ] Firestore 自動バックアップ設定（Cloud Scheduler + Export）
- [ ] Cloud Logging アラート（エラー多発・Anthropicクレジット枯渇）
- [ ] Sentry など外部監視を入れるか判断
- [ ] Functions の最小インスタンス設定（コールドスタート対策の要否判断）

### カスタムドメイン
- [ ] 必要かどうか判断（ブランド・SEO観点）
- [ ] 必要なら Firebase Hosting でドメイン追加 + DNS設定

---

## 🟡 インフラ技術負債（必要時に改修・運用は止まらない）

2026-06-28 の functions デプロイ時に出た警告。いずれも今すぐ壊れるものではなく、
動作には影響しない。期限・課金が絡むので必要時に着手するためメモしておく。

### 1. Artifact Registry のクリーンアップポリシー未設定（少額課金リスク）
デプロイのたびに古いコンテナイメージが asia-northeast1 に溜まり、放置すると
ストレージ課金が少額ずつ増える。緊急度は低い。
- [ ] `firebase functions:artifacts:setpolicy` でクリーンアップポリシーを設定
      （または次回 deploy 時に `--force` を付けると自動設定される）
- 着手トリガー: Artifact Registry のストレージ課金が目に見えて増えてきたら

### 2. Node.js 20 ランタイム廃止 + firebase-functions が古い（期限あり）
- Node.js 20 (2nd Gen) は **2026-04-30 に deprecated、2026-10-30 に decommission**。
  それ以降は Node 20 のままだとデプロイ不可になる。
- 併せて `firebase-functions` も outdated 警告（`npm install --save firebase-functions@latest`）。
  メジャー更新で **breaking changes あり**と警告が出ているため、上げる際は要確認・要動作確認。
- [ ] `functions/package.json` の engines を Node 22 等に上げてデプロイ確認
- [ ] firebase-functions を latest に更新（breaking change の影響範囲を確認してから）
- 着手トリガー: **2026-10-30 の decommission 前に必ず**（遅くとも 2026-09 中には着手したい）

---

## UIリデザイン（完了）

[design_handoff_ui_redesign/](design_handoff_ui_redesign/) の12ファイル差し替え指示は
リデザイン本体が `0079f73 feat(frontend): LIFF app with dark UI, milestone tracking, product tour`
の段階で取り込まれて以降、`f3a9bac` `325ff6b` `d7854da` `959ed57` で発展している。
2026-05-23 時点で実装が仕様を上回っているため、これ以上の対応は不要。
- [x] theme.ts / index.html / index.css の基盤反映
- [x] Header / BottomNav / Loading / PlanBadge の更新（PlanBadge の「★」は装飾抑制ポリシーに合わせ意図的に省略）
- [x] Dashboard / Onboarding / WorkoutInput / WorkoutLog / Subscribe / Profile の更新
- [x] プロト未定義の追加要素（Setup.tsx の4ステップヒアリング・TermsGate・Tour・bottomNavSpace 等）

`design_handoff_ui_redesign/` ディレクトリ自体は後の参照用として保管。

---

## 🟡 X集客フォロー（運用フェーズ）

### 2週間後（2026-06-04頃）
- [x] `xPostLogs` を集計し勝ちパターンを判定（2026-06-28）。勝ちパターン＝
      「具体的な重量のビフォーアフター」＋「記録してなかったら気づかなかった後悔」。
      これを `x/autoPost.ts` の `buildSystemPrompt` に最優先構成として反映済み（commit 94f63be）。
  - [ ] 反映後の投稿でエンゲージメントが実際に上がったか、1〜2週後に再集計して効果検証する
- [ ] LINE友達追加数の推移と突き合わせ、効くCTAバリアントを判定
- [ ] フォロワー1,000人超えアカウントの手動フォロー返し
- [ ] Xコメントが増えたら、まとめてエージェントに貼って分析依頼

### コスト監視
- [ ] チャージ残高は X Developer Portal の Billing で確認
- [ ] 想定 $1.80/月（90投稿×$0.02）を大きく超えていないか
- [ ] 大幅超過時は `autoPost.ts` のログから URL混入の有無を確認

---

## 🟢 Threads 並行運用（保留中）

**目的:** X単独運用に依存せず、無料APIで投稿経路を多重化する。

### 現状: 2026-05-21 時点で保留判断

Threads API は無料だが、Meta for Developers のセットアップが個人検証フェーズに対して過重と判断。具体的に詰まったポイント:
- Business Portfolio の作成が必須
- Business Portfolio の URL 認証で `*.web.app` 等の共有ドメインが弾かれる（独自ドメイン必須）
- 加えて Tech Provider Verification / Privacy Policy 整備 / App Review（場合により screencast 必須）
- アカウント・アプリ作成自体は完了済みだが、それ以上進めるには独自ドメイン購入から必要

### 再開のトリガー
以下のいずれかが揃ったら再開検討:
- X 運用でフォロワー伸び・LINE流入の手応えが出てきて、横展開の価値が見えた
- 独自ドメイン取得を他の理由（Stripe本番化、ブランディング等）でやることになった
- Meta が個人開発向けセットアップを緩めた

### 再開時のタスク（参考保存）
- [ ] 独自ドメイン取得（`muscle-coach-ai.com` など）
- [ ] Firebase Hosting にカスタムドメイン接続
- [ ] Meta App の Business Portfolio URL を独自ドメインに差し替えて認証突破
- [ ] Use cases → Threads → Access Token 取得
- [ ] Tech Provider Verification（必要なら）
- [ ] コード実装:
  - `functions/src/threads/client.ts`
  - `functions/src/threads/autoPost.ts`（X と同じ `runAutoPost` パターンを踏襲）
  - `threadsPostLogs/{postId}` への保存
  - スケジューラ `autoPostThreadsMorning` / `autoPostThreadsNoon` / `autoPostThreadsEvening`
- [ ] App Review が必要かは Development mode のテスト投稿で判定（オーナーアカウントのみなら不要の可能性）
- [ ] X と同一文面で同時投稿開始、2週間比較

---

## メモ

- 次回再開時: このファイル → [CLAUDE.md](CLAUDE.md) → [AGENT_HANDOFF.md](AGENT_HANDOFF.md) の順で読むと全体像が把握しやすい
- 設計原則「LIFF=記録 / LINE=コーチング」は維持。X/Threads は「集客（コウのキャラを外に出す入口）」専用
