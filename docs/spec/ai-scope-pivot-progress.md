# 作業進捗メモ: AI用途の方針転換（再起動引き継ぎ用）

最終更新: 2026-06-11（エージェント再起動のため作業を中断して記録）

> 次のエージェントへ: このファイルは「方針転換リファクタ」の作業途中の引き継ぎメモです。
> まず [ai-scope-pivot.md](ai-scope-pivot.md)（spec）と [ai-scope-pivot-plan.md](ai-scope-pivot-plan.md)（plan）を読み、
> その上でこのファイルの「現在地」「残作業」を確認してください。

---

## このリファクタの目的（要約）

マッスルコーチAIの AI 用途を、メニュー生成・コーチング会話から
**「①雑な入力を構造化記録する ②記録を集計してデータ分析を言語化する」の2つ**に絞る方針転換。
「正解のない生成」（メニュー提案・フォーム指導・栄養相談・一般会話）を全廃し、
入出力が検証可能で再現性のある用途に限定する。トレーナー3キャラの人格も廃止。
分析は **計算をコードで行い、AIは言語化のみ**（数値の捏造を禁止）。

詳細は spec / plan を参照。ユーザー（guttii さん）承認済みの確定方針:
- マイルストーンは削除でなく「作り替えて残す」（トリガー維持、中身をコード集計+AI言語化に）
- トレーナーキャラは削除
- 設計原則「LIFF=記録 / LINE=コーチング」→「LIFF=閲覧 / LINE=記録の入口＋分析の言語化」

---

## 現在地（2026-06-11 中断時点）

### 完了済み（Phase 1〜4 + Phase 5途中まで）

**Phase 1: 分析・マイルストーンの「コード集計+AI言語化」基盤** — 完了
- `functions/src/workout/history.ts`: 成長トレンド集計 `buildGrowthTrend`（初期 vs 最近の比較）+ 型 `ExerciseTrend` / `GrowthTrend` を追加
- `functions/src/ai/analysis.ts`（新規）: `buildAnalysis(userId, kind, milestoneCount?)` を新設。
  kind は `"overview" | "weakpoint" | "trend" | "pattern"`。`analysisKindForMilestone(count)` で 5→weakpoint / 15→trend / 30→pattern。
  集計値を「分析データ」テキストにし、`ANALYSIS_VERBALIZE_PROMPT` で言語化（system に cache_control 付き）。
- `functions/src/ai/prompts.ts`: 旧 WEAK_POINT/GROWTH_TREND/PROGRAM_OPTIMIZATION/TRAINER_PERSONA/
  TRAINER_SYSTEM_PROMPT/MENU/FORM/PROGRESS/NUTRITION/WEEKLY_REPORT を削除。残したのは
  WORKOUT_PARSE_PROMPT / ANALYSIS_VERBALIZE_PROMPT / INTENT_CLASSIFICATION_PROMPT の3つだけ。
- `functions/src/line/recordingFlow.ts`: `generateMilestoneContent` を `buildAnalysis` 委譲に変更。

**Phase 2: メニュー・コーチング会話の削除** — 完了
- 削除したファイル: `functions/src/workout/menuGenerator.ts` / `functions/src/ai/context.ts`
- `functions/src/ai/trainer.ts`: 4ハンドラ(form/progress/nutrition/general)+handleMenuRequest+buildSystemBlocks を全削除。
  `getTrainerResponse` は analyze（→buildAnalysis）/ greeting / その他（USAGE_GUIDE）だけ捌く薄い形に。
  `USAGE_GUIDE` を export 済み。
- `functions/src/ai/intentClassifier.ts`: intent を record/analyze/greeting/other の4分類に縮小（種目名抽出も削除）。
- `functions/src/ai/formatter.ts`: メニュー整形関数群を全削除（formatForLine/formatGreeting/formatErrorMessage/
  formatWorkoutConfirmation は残す）。
- `functions/src/reports/weeklyReport.ts`: 週次レポートを `buildAnalysis` 載せ替え（後述の Phase 5 修正も参照）。
- `functions/src/line/webhook.ts`: メニュー系コマンド経路を削除、意図ルーティングを record/analyze/greeting/other に。

**Phase 3: キャラ削除** — 完了
- 削除したファイル: `functions/src/line/trainerCharacter.ts`
- `getTrainer`/`getTrainerName`/`thinkingMessage` 参照を webhook/recordingFlow/onboarding/notifications から全除去。
- LINE の sender 表示名は各ファイルの定数 `APP_SENDER_NAME = "マッスルコーチ"` 固定。
- `scheduledNotifications.ts`: キャラ別リマインダー → 汎用文言1種に。
- `onboardingFlow.ts`: trainer_type ステップ撤去で 6→5 ステップ（nickname→goal→height→weight→frequency→confirm）。
  初回メニュー生成は廃止し「記録の使い方案内」に差し替え。確認カードのトレーナー行も除去。
- `trainerType`/`trainerName` フィールド（user/manager.ts, metrics.ts, index.ts）は**残置**（既存ユーザー保護）。新規参照しないだけ。

**Phase 4: ドキュメント更新** — 完了
- `CLAUDE.md`: 設計原則を全面改訂、プレミアム仕様・既知の罠（マイルストーン/クレジット/トレーナー名）を更新。
- `AGENT_HANDOFF.md`: 冒頭に方針転換の注意書き（旧記述が残る旨）。
- `NEXT_TASKS.md`: 冒頭に方針転換セクション + 残課題リスト。
- `TESTING_CHECKLIST.md`: 方針転換後の動作確認項目を冒頭に追加。

**Phase 5: Codexレビュー** — 途中（2巡実施・対応済み、3巡目の確認が未実施）
- Codex 1巡目の指摘2件 → 対応済み:
  - 分析コマンドが課金チェックをバイパス → `runAnalysis` に `incrementUsage` を一元化
  - 週次レポートが今週スコープでない → `recorder.ts` に `countWorkoutsSince(userId, days)` 追加、
    weeklyReport で過去7日の記録有無を先に判定
- Codex 2巡目の指摘3件 → 対応済み:
  - 壊れたメニューボタン → `messages.ts` の `createMenuFlexMessage` を記録/分析/履歴ボタンに作り替え+絵文字除去
  - 記録なしでも課金 → `runAnalysis` で `getTotalWorkoutCount` を先に確認、記録ゼロなら increment せず案内
  - other経路の二重分類 → `getTrainerResponse` を呼ばず `USAGE_GUIDE` を直接返す
- **未実施: Codex 3巡目の確認**（2巡目修正後の退行チェック）。ここで中断。

### ビルド状態
- `cd functions && npm run build` は **成功**（型エラーなし）。最後のビルド時点で全変更が型チェックを通過。

### Git 状態
- ブランチ: main（guttii さん指示で main 直運用、ブランチは切っていない）
- 直前コミット: `8d4ef91 feat(ai): improve menu reproducibility, context retention, caching`
  （これは方針転換**前**の別作業＝メニュー再現性等4ステップ。方針転換でメニュー機能ごと消えたため
  このコミットの内容は実質無効化されたが、記録として残してある）
- **今回の方針転換リファクタは全て未コミット**（作業ツリーに M / D / ?? の状態で存在）
- 未追跡: `docs/spec/`（spec/plan/このメモ）, `functions/src/ai/analysis.ts`, `SESSION_HANDOFF_2026-06-06.md`(前回引き継ぎ・今回と無関係)

---

## 残作業（再起動後にやること）

1. **Codex 3巡目レビュー**（中断地点）
   - `cd <repo> && codex review --uncommitted` を実行し、2巡目修正後の退行がないか確認。
   - 新たな指摘があれば対応 → 再ビルド。
   - 注意: codex は ChatGPT アカウント。過去に全モデル400エラーで止まったことがあるが、
     guttii さんの再認証後は gpt-5.5 で動作した実績あり。

2. **コミット**（ユーザー承認後）
   - 方針転換リファクタ一式を main にコミット。メッセージは Conventional Commits（feat! or refactor!）。
   - 末尾に `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
   - SESSION_HANDOFF_2026-06-06.md は今回と無関係なので含めるか別途判断。

3. **デプロイ**（ユーザー承認後）
   - AI関数群: `firebase deploy --only functions:lineWebhook,functions:api,functions:sendScheduledNotifications,functions:sendWeeklyReports`
   - autoPost 系（X投稿）は今回未変更だが含めるかは任意。

4. **動作確認**（TESTING_CHECKLIST.md の「2026-06 方針転換後」セクション）
   - 記録パース / 「分析して」/ 記録なしユーザーの分析（課金されないこと）/ マイルストーン5・15・30 /
     週次レポート（今週記録なし時のメッセージ）/ sender名がマッスルコーチ固定 / オンボ5ステップ。

---

## この転換に伴う残課題（spec の「残課題」再掲・別タスク）
- [x] プレミアム課金軸の再設計（旧「AI相談 月5回」「目標別プログラム」廃止。分析回数制限を再定義）
- [x] 既存の絵文字残存の整理: `line/recordingFlow.ts`(部位選択の絵文字2箇所) / `line/messages.ts` /
      `index.ts` / `x/autoPost.ts`。今回スコープ外で未着手。
- [x] LIFF 側（React）のメニュー表示画面・トレーナー名カスタマイズ UI の扱い（残す/外す）
- [x] `trainerType`/`trainerName` フィールドを将来マイグレーションで削除するか

---

## 注意・申し送り
- guttii さんは設計議論を好む。勝手に方針変更せず、選択肢を提示して判断を仰ぐこと。
- 破壊的操作（ファイル削除・本番デプロイ・コミット/push）は実行コマンドを提示して明示承認を得てから（CLAUDE.md ルール）。
- 中断の直接の理由: 前任エージェントの応答テキストに `court` という不要語が混入する出力バグが発生したため、
  クリーンな状態で再起動したいとの判断。コード変更・ビルド結果には影響していない（ツール実行は全て正常）。
