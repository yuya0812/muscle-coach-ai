# 次回再開時のタスク

最終更新: 2026-05-03

セッション再開時はまずこのファイルを読む。完了したタスクは `[x]` でチェック、新しく見つけたら追加。

---

## 🔴 すぐやる（前回のフォローアップ）

### 1. マイルストーン修正のデプロイ + 動作確認
- [ ] `cd functions && npm run build && cd .. && firebase deploy --only functions:api`
- [ ] LIFFアプリで（既存記録数+1で5回目になるユーザーで）ワークアウト保存
- [ ] LINEトークに `🎉 🔍「弱点部位レポート」が解放されました！` が届くこと
- [ ] 数秒後にAI分析テキストが追送されること

**変更点:** [recordingFlow.ts](functions/src/line/recordingFlow.ts) に `checkAndPushMilestone` を export 追加 / [index.ts](functions/src/index.ts) の `POST /api/workouts` で fire-and-forget 呼び出し。

### 2. TESTING_CHECKLIST の通し動作確認
[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) の項目を順に実行。Anthropicクレジットは追加済みなので全AI機能が動くはず。

- [ ] LINEで「おはよう」→ 即座に挨拶返答
- [ ] ワークアウト5回記録 → 弱点部位レポートが追送される（上記1で確認）
- [ ] 「メニュー作成」→ 待機メッセージ後にメニューが届く
- [ ] プロフィールで通知ON → 設定時刻にリマインダー届く
- [ ] X投稿ログが Firestore `xPostLogs` に保存される

---

## 🟡 本番環境設定フェーズ（次の大きな塊）

### Git管理を開始する（最優先）
現状コミット0件。本番運用前に必ず実施。
- [ ] `.gitignore` の見直し（`*.env` / `node_modules/` / `lib/` / `dist/` 含まれているか）
- [ ] `git add` で機密ファイルを含めない（`.env` 系・`*firebase*adminsdk*.json` など）
- [ ] initial commit
- [ ] GitHub リポジトリ作成 + push
- [ ] ブランチ運用ルール決定（main + feature/* など）

### firebase.json の hosting 設定修正
現状 `"public": "public"` だが React アプリは `liff-app/dist` にビルドされる。
- [ ] hosting の source を liff-app に向ける
- [ ] predeploy フックで `cd liff-app && npm run build` を自動実行
- [ ] 本番デプロイで最新ビルドが反映されることを確認

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

## 🟢 X集客フォロー

- [ ] 数週間運用後、A/Bテスト結果（奇数週=全投稿CTA / 偶数週=週2回CTA）を `xPostLogs` で集計
- [ ] LINE友達追加数と突き合わせて効果の高いCTA方針に固定
- [ ] フォロワー1,000人超えアカウントの手動フォロー返し
- [ ] Xコメントが増えたら、まとめてエージェントに貼って分析依頼

---

## メモ

- 今日の作業: レイアウト改修 + 機能追加 + セキュリティチェック + Anthropicクレジット追加
- 今日の成果: マイルストーンバグ修正 / [CLAUDE.md](CLAUDE.md) 大幅拡充 / 設計原則「LIFF=記録 / LINE=コーチング」を確定・記録
- 次回再開時: このファイル → [CLAUDE.md](CLAUDE.md) → [AGENT_HANDOFF.md](AGENT_HANDOFF.md) の順で読むと全体像が把握しやすい
