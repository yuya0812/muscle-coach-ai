# Plan: 記録パースの聞き返し（不足情報の補完フロー）

対応 spec: [record-clarification.md](record-clarification.md)（承認済み 2026-06-11）

## 技術方針

- **parseAndSaveWorkout（recorder.ts）を「パース」と「保存」に分離**する。
  間に欠損検出を挟み、欠損ありなら保存せず聞き返しフローへ移行する。

  ```
  自然文 → parseWorkoutText（AIパース）→ 欠損検出（コード）
    ├─ 欠損なし（or 自重の weight のみ）→ 保存 → 「記録しました」+ サマリー
    ├─ 欠損1〜2問で埋まる → clarify ステートに保留 → Quick Reply で聞き返し
    └─ 欠損3問以上 → 保存せず「情報が足りない」案内 + 入力例
  ```

- **既存の recordingState ステートマシンに `clarify` ステップを追加**する
  （recordingFlow.ts の `RecordingState`）。保管場所は既存と同じ
  `users/{userId}.recordingState`。ボタン記録フローと聞き返しフローは同時に走らない
  （どちらも recordingState を占有する）ため衝突しない。
- **自重種目の判定**は history.ts の `EXERCISE_TO_MUSCLE` と同様の正規表現リストで行う
  （プッシュアップ/腕立て/チンニング/懸垂/プルアップ/ディップス/クランチ/プランク/
  レッグレイズ/シットアップ/腹筋 等）。自重種目の weight null は欠損に数えない。
- **質問の生成は定型文 + Quick Reply**（AI不使用）:
  - reps: 「[種目名]は何回やりましたか？」+ ボタン 5/8/10/12/15/20回
  - sets: 「[種目名]は何セットやりましたか？」+ ボタン 1〜5セット
  - weight: 「[種目名]の重量は何kgでしたか？数字で送ってください（例: 60）」+
    「自重」ボタン（自重ならweightなしで確定できる）。スキップは置かない
    （欠損のまま保存しない原則のため）
- **回答の解釈**（spec 仮決定1）: clarify 中の受信テキストから数値を抽出
  （「60」「60kg」「10回」「3セット」「自重」を許容）。抽出できなければ離脱とみなし、
  `clearRecordingState` で保留を破棄し `handleRecordingStep` が false を返す
  → webhook が同メッセージを通常処理（意図分類）に流す。破棄の警告は出さない。
- **保存成功時のみ**サマリー + 「記録しました」を返し、`checkAndPushMilestone` 相当の
  マイルストーン処理を行う（現行の webhook record 経路と同じ後処理に揃える）。

## 既存コードへの影響範囲

| 対象 | 変更 |
|---|---|
| `workout/recorder.ts` | parseAndSaveWorkout を分離（parse / 欠損検出 / 保存）。既存呼び出しの互換維持 |
| `line/recordingFlow.ts` | RecordingState に clarify ステップ + ハンドラ追加。保留レコード（pendingExercises・質問キュー）をステートに保持 |
| `line/webhook.ts` | record 意図の処理を「即保存」から「欠損判定つき」に変更。handleRecordingStep 経由で clarify 回答を捌く（既存の先頭フックで対応済みの想定） |
| `functions/src/ai/prompts.ts` | 変更なし（WORKOUT_PARSE_PROMPT はそのまま） |

## タスク分解

### Phase 1: recorder.ts の分離と欠損検出（1.5h）
- [ ] `parseWorkoutText(text)`: AIパースのみ行い Exercise[] を返す関数に分離
- [ ] `saveWorkout(userId, exercises, notes)`: 保存とサマリー生成を分離
- [ ] 自重種目判定（正規表現リスト）と欠損検出ロジック
      （種目×フィールド単位で欠損を列挙。自重の weight は除外）
- [ ] 既存 `parseAndSaveWorkout` 呼び出し元（webhook）の互換を確認

### Phase 2: clarify ステートマシン（2h）
- [ ] `RecordingState` に `step: "clarify"` と保留データ
      （pendingExercises / 残り質問キュー / notes 原文）を追加
- [ ] `handleClarifyStep`: 回答解釈 → マージ → 次の質問 or 完了保存。
      解釈不能なら破棄して false を返す（webhook の通常処理に流す）
- [ ] キャンセル（「キャンセル」テキスト）でも破棄できるようにする（既存フローと同じ）
- [ ] 完了保存時: サマリー + マイルストーン処理（webhook record 経路と同じ後処理）

### Phase 3: webhook 接続と文言（1h）
- [ ] webhook の record 経路を分岐つきに変更
      （欠損なし→即保存 / 1〜2問→聞き返し開始 / 3問以上→案内のみ）
- [ ] 定型質問文と Quick Reply の実装（上記方針どおり）
- [ ] `npm run build` 通過確認
- [ ] TESTING_CHECKLIST に聞き返しフローの確認項目を追記
      （不完全入力→聞き返し→保存 / 聞き返し中に別メッセージ→破棄 / 自重種目は聞かれない）

## リスク・懸念点

- **挙動変更**: 現行は欠損があっても null のまま保存していた。今後は補完するか保存しない。
  「今まで保存されていた入力が保存されなくなる」ケース（3項目以上欠損）があるが、
  これは spec で意図した変更（中途半端な記録を残さない）。
- **replyToken は1回しか使えない**: 聞き返し質問は reply、保存完了は push という既存の
  使い分けパターンに従う（recordingFlow の現行実装と同じ）。
- **複数種目の欠損**: 質問上限2問は入力メッセージ全体で共有（spec 仮決定2）。
  質問順は種目の登場順 × weight → reps → sets の順で固定する（再現性）。
- **recordingFlow の既存文言に絵文字が残っている**（「部位を選んでください」の行）。
  絵文字整理は別タスクだが、今回触る箇所に絵文字は入れない・触った行にあれば除去する。

## spec との対応確認

- 欠損検出はコード → Phase 1
- 最大2問・Quick Reply・定型文 → Phase 2 + Phase 3
- 自重種目は weight を聞かない → Phase 1（判定）+ Phase 3（質問生成）
- 離脱で破棄・警告なし・通常処理続行 → Phase 2（handleClarifyStep の false 返し）
- 保存成功時のみ「記録しました」 → Phase 2（完了保存時のみメッセージ）
- 3項目以上の欠損は聞き返さず案内 → Phase 3（webhook 分岐）
- 完全入力は従来通り即保存 → Phase 3（webhook 分岐）
- ボタン記録フローと衝突しない → Phase 2（同一ステートの占有設計）

## 変更履歴
- 2026-06-11: 初版作成
