# Plan: AI用途の再定義（記録パース + データ分析の言語化）

対応 spec: [ai-scope-pivot.md](ai-scope-pivot.md)（承認済み 2026-06-10）

## 技術方針

- **AIの境界を「自然言語の入出力変換」に限定**する。判断・計算はコード、AIは言語化のみ。
  - 記録: `WORKOUT_PARSE_PROMPT` + `getAIJsonResponse(task="parse")` を中核として維持・前面化。
  - 分析/マイルストーン: `history.ts` の集計（部位タッチ数・最大重量・中央値レップ・未刺激部位）を
    土台に、不足分の判定ロジックをコードで足し、AIには「集計済みの数値・判定を言語化させる」
    プロンプト（数値の捏造を禁じる制約付き）を渡す。
- **削除はファイル単位ではなく経路単位**で行う。`client.ts` / `recorder.ts` / `history.ts` /
  `context.ts`（の一部）は記録・分析に必要なため残す。
- **データモデルは破壊しない**: `trainerType`/`trainerName` フィールドは残置（既存ユーザー保護）。
  参照（口調分岐・sender.name へのキャラ名注入）をやめるだけにする。
- 既存テスト資産: TESTING_CHECKLIST のメニュー/フォーム項目は新方針で陳腐化するため Plan 完了時に更新。

## 既存コードへの影響範囲（調査結果）

| 対象 | 現状 | 方針 |
|---|---|---|
| `ai/menuGenerator`→正しくは `workout/menuGenerator.ts` | メニュー生成 | **削除** |
| `ai/trainer.ts` | 4ハンドラ(form/progress/nutrition/general) + handleMenuRequest + getTrainerResponse + buildSystemBlocks | コーチング系を削除。記録/分析ルータに作り替え |
| `ai/prompts.ts` | 全プロンプト | MENU/FORM/PROGRESS/NUTRITION/WEEKLY_REPORT/TRAINER_PERSONA/TRAINER_SYSTEM_PROMPT 削除。WORKOUT_PARSE 残す。WEAK_POINT/GROWTH_TREND/PROGRAM_OPTIMIZATION は「集計値→言語化」用に作り替え。分析用プロンプト新設 |
| `ai/intentClassifier.ts` | record/menu/form/progress/nutrition/general/greeting/other | menu/form/nutrition を廃し、record/analyze/greeting/other 程度に縮小 |
| `ai/context.ts` | 会話履歴+プロフィール+履歴サマリー | コーチング会話を消すので会話履歴の役割は縮小。記録/分析には履歴サマリーが要る。会話履歴ロジックは「分析の短いやり取り」用に最小限残すか判断（Phase 2で精査） |
| `line/webhook.ts` | コマンド分岐 + 意図ルーティング | メニュー/フォーム/栄養/一般会話のコマンド・経路を削除。記録・分析・履歴・記録フローは残す。キャラ参照（thinkingMessage/sender.name）除去 |
| `line/recordingFlow.ts` | 記録フロー + マイルストーン | 記録フローは残す。マイルストーンは中身を集計+言語化に作り替え。キャラ参照除去 |
| `line/onboardingFlow.ts` | 6ステップ + 初回メニュー生成 + キャラ選択 | 初回メニュー生成を削除し使い方案内に差し替え。キャラ選択ステップを撤去（Phase 3） |
| `line/trainerCharacter.ts` | 3キャラ定義 | **削除**（参照を全て除去した後） |
| `notifications/scheduledNotifications.ts` | キャラ別リマインダー | リマインダー自体は残す。キャラ別文言を非キャラの汎用文言に差し替え |
| `user/manager.ts` / `user/metrics.ts` | trainerType/trainerName 定義・利用 | フィールド定義は残置。metrics の「呼び方」行は残してよい（プロフィール表示）。デフォルト "hot" 代入は撤去検討 |
| `index.ts` `/milestones` API | LIFFのマイルストーン表示 | 表示は残す（記録回数ベース、AI不使用）。中身がAI生成に依存していないか確認 |
| reports/weeklyReport.ts | 週次レポート push | spec スコープ外。今回は触らない（ただしコーチング寄りなら将来見直し） |

## タスク分解

### Phase 0: 安全網（30分）
- [x] 現在の状態でブランチを切る（`git switch -c feat/ai-scope-pivot`）。main 直は避け、まとまったらマージ判断
- [x] 削除前スナップショット確認（8d4ef91 が直前コミット）。各 Phase 末でコミット

### Phase 1: 分析・マイルストーンの「コード集計 + AI言語化」基盤（中心作業・3〜4h）
- [x] `history.ts` に不足する集計を追加：初期 vs 最近の重量・回数差（成長トレンド）、頻度・偏りの判定
- [x] 「集計値を渡して言語化させる」プロンプトを新設（数値捏造禁止・与えられた数値のみ使用を明記）
- [x] 分析機能の本体関数を新設（集計→言語化）。マイルストーン(5/15/30)と通常分析で共通利用
- [x] `recordingFlow.ts` の `generateMilestoneContent` を新基盤に載せ替え（旧 WEAK_POINT 等の直叩きを廃止）

### Phase 2: コーチング会話・メニューの削除（2〜3h）
- [x] `workout/menuGenerator.ts` を削除し、参照（webhook/onboarding/trainer）を除去
- [x] `ai/trainer.ts` の form/progress/nutrition/general/menu ハンドラを削除。
      `getTrainerResponse` を「record / analyze / greeting」だけ捌く形に縮小（or webhook 側へ吸収）
- [x] `intentClassifier.ts` を record/analyze/greeting/other に縮小
- [x] `ai/prompts.ts` から不要プロンプト削除（WORKOUT_PARSE と新分析プロンプトは残す）
- [x] `webhook.ts` のメニュー/会話コマンド・待機メッセージ分岐を整理。記録・分析・履歴・記録フローを残す
- [x] ビルド通過確認

### Phase 3: キャラ削除（2h）
- [x] webhook/recordingFlow/onboarding/scheduledNotifications の `getTrainer`・thinkingMessage・
      sender.name へのキャラ名注入を除去（sender 自体を外すか、固定名にするかは実装時判断）
- [x] `scheduledNotifications.ts` のキャラ別リマインダーを汎用文言1種に差し替え
- [x] `onboardingFlow.ts` のキャラ選択ステップを撤去し、ステップ数・確認画面を調整
- [x] `trainerCharacter.ts` を削除（全参照除去後）
- [x] `trainerType`/`trainerName` はフィールド残置のまま新規参照ゼロを確認
- [x] ビルド通過確認

### Phase 4: ドキュメント・テスト更新（1h）
- [x] CLAUDE.md の設計原則を「LIFF=閲覧 / LINE=記録の入口＋分析の言語化」に改訂、キャラ記述を整理
- [x] AGENT_HANDOFF.md / NEXT_TASKS.md / TESTING_CHECKLIST.md を新方針に合わせて更新
- [x] 動作確認手順（記録・分析・マイルストーン作り替え）を TESTING_CHECKLIST に追記

### Phase 5: レビュー・デプロイ（承認後）
- [x] Codex レビュー（セカンドオピニオン、設計大変更のため必須）
- [x] 指摘対応 → ビルド
- [x] ユーザー承認後にコミット集約 → デプロイ（AI関数群）

## リスク・懸念点

- **削除の巻き込み事故**: `client.ts`/`recorder.ts`/`history.ts` は記録・分析の生命線。経路単位で消し、
  各 Phase 末でビルド＆`grep` で残参照を確認する。ファイル一括削除はしない。
- **会話履歴(context.ts)の扱い**: コーチング会話を消すと会話履歴の主用途が消える。分析の短い往復で
  必要かを Phase 2 で判断（不要なら `conversations` 書き込み/読み出しも縮小）。データは消さない。
- **キャラ削除のユーザー影響**: 既存ユーザーは `trainerType` を持つ。フィールドは残すので破壊はないが、
  LINE の応答からキャラ感が消える体験変化がある。これは意図した変更。
- **オンボーディング改修の波及**: キャラ選択ステップ撤去はステップ番号・状態機械に影響。慎重に。
- **デプロイ範囲**: lineWebhook / api / sendScheduledNotifications。メニュー/レポート関数の要否を最終確認。
- **マイルストーン LIFF API** (`/milestones`) が AI 生成に依存していないか Phase 1 で確認（依存なしの想定）。

## spec との対応確認

- 記録パース受け入れ条件 → Phase 2（経路維持）+ 既存 `recorder.ts`
- データ分析（コード集計+AI言語化・再現性） → Phase 1
- メニュー/コーチング/プロンプト削除 → Phase 2
- マイルストーン「作り替えて残す」 → Phase 1（中身）+ Phase 3（キャラ除去）
- キャラ削除 → Phase 3
- 初回メニュー→使い方案内 → Phase 3（onboarding）
- 設計原則・ドキュメント反映 → Phase 4

## 変更履歴
- 2026-06-10: 初版作成
