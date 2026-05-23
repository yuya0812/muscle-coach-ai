# 次回再開時のタスク

最終更新: 2026-05-23

セッション再開時はまずこのファイルを読む。完了したタスクは `[x]` でチェック、新しく見つけたら追加。

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

### 1. UIリデザインの棚卸し
[design_handoff_ui_redesign/](design_handoff_ui_redesign/) の12ファイル差し替え指示に対して、
どこまで進んでいるか / 残タスクは何かを洗い出してから着手判断する。

- [ ] design_handoff_ui_redesign/ の内容を読む
- [ ] 既に反映済みのファイルと未反映のファイルを git ログから特定
- [ ] 残タスクを NEXT_TASKS.md に書き戻す

### 2. TESTING_CHECKLIST の通し動作確認
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

## 🟢 UIリデザイン（進行中？要確認）

[design_handoff_ui_redesign/](design_handoff_ui_redesign/) に12ファイル差し替え指示あり。
- [ ] どこまで進んでいるか棚卸し
- [ ] 残タスクを洗い出し
- [ ] 完了後 TESTING_CHECKLIST の動作確認を再度通す

---

## 🟡 X集客フォロー（運用フェーズ）

### 2週間後（2026-06-04頃）
- [ ] `xPostLogs` を `ctaVariant` で集計し、エンゲージメント率を比較
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
