# Plan: 分析出力の固定フォーマット化（ハイライト選定のコード化）

対応 spec: [analysis-highlight-format.md](analysis-highlight-format.md)（承認済み 2026-06-11）

## 技術方針

- **ハイライト選定を確定的なコードにする**。新しい中間構造 `AnalysisHighlights` を導入し、
  「分析データに何を載せるか」をコードが決め、AI は受け取ったものの言語化だけを行う。

  ```
  集計（history.ts） → ハイライト選定（新ロジック） → AnalysisHighlights
    → 分析データテキスト化（analysis.ts） → AI言語化（4セクション固定）
  ```

- **週区切り集計の追加**: 既存 `buildWorkoutHistorySummary` は「直近N件」ベースで日付の
  概念がない。直近7日間に限定した週次スナップショット集計を追加する
  （`countWorkoutsSince` と同様の date クエリで取得）。
- **AnalysisHighlights の形**（各セクション上限は spec 仮決定どおり）:
  - `weakpoints`: 最大2部位（今週未刺激 or 著しく偏っている部位）
  - `improved`: 最大2種目（buildGrowthTrend の improved から改善幅順）
  - `stagnant`: 最大2種目（同 stagnant から実施回数の多い順）
  - `nextStep`: 1点。優先順位ルール: 弱点あり→弱点部位の補強 / なければ伸び悩み打開 /
    それもなければ伸びている種目の継続強化
- **マイルストーンの集計範囲**: 通常分析・週次レポートは週区切り（直近7日）を軸にするが、
  マイルストーンは「累計到達」の節目なので全期間（到達回数分）の集計を維持する。
  出力のセクション構造（4セクション）は全経路で統一し、導入文だけ
  「累計N回到達」/「今週の振り返り」と文脈を変える。
- `ANALYSIS_VERBALIZE_PROMPT` を4セクション固定見出しの出力指示に改訂する
  （見出し・順序・「該当なしはそのまま書く」を明記。数値捏造禁止は維持）。
- `AnalysisKind`（overview/weakpoint/trend/pattern）は**廃止方向**で整理する。
  選定ロジックが共通化されるため kind の役割は導入文の差だけになり、
  `milestoneCount` の有無で表現できる。`analysisKindForMilestone` も不要になる見込み
  （実装時に呼び出し元 recordingFlow / weeklyReport / webhook を確認して判断）。

## 既存コードへの影響範囲

| 対象 | 変更 |
|---|---|
| `workout/history.ts` | 週次スナップショット集計（直近7日）を追加。既存集計は維持 |
| `functions/src/ai/analysis.ts` | ハイライト選定ロジック + buildAnalysisData の書き換え。kind 整理 |
| `functions/src/ai/prompts.ts` | ANALYSIS_VERBALIZE_PROMPT を4セクション固定に改訂 |
| `line/webhook.ts` (runAnalysis) | 週内記録0件の分岐を追加（「今週はまだ記録がない」案内・課金しない） |
| `line/recordingFlow.ts` | generateMilestoneContent の呼び出しシグネチャ追従のみ |
| `reports/weeklyReport.ts` | buildAnalysis 呼び出しの追従のみ（既に countWorkoutsSince で今週判定済み） |

## タスク分解

### Phase 1: 週区切り集計とハイライト選定（2h）
- [x] `history.ts` に直近7日間の週次スナップショット集計を追加
      （部位別刺激回数・セッション数。date 範囲クエリで取得）
- [x] ハイライト選定ロジックを実装（weakpoints/improved/stagnant 各最大2、nextStep 1点の
      優先順位ルール）。判定はすべて確定的（同じ記録なら同じ選定結果）
- [x] 週内記録0件を判定できるシグナルを戻り値に含める

### Phase 2: 言語化の組み替え（1.5h）
- [x] `ANALYSIS_VERBALIZE_PROMPT` を「弱点 / 伸びているところ / 伸び悩んでいるところ /
      次のステップ」の固定4見出し出力に改訂
- [x] `buildAnalysisData` を AnalysisHighlights ベースに書き換え（選定済み項目のみ渡す。
      該当なしセクションは「該当なし」「まだ判定できない」を明示して渡す）
- [x] AnalysisKind の整理（廃止 or 縮小）と呼び出し元の追従

### Phase 3: 経路接続・確認（1h）
- [x] `runAnalysis`（webhook）: 週内記録0件なら課金せず「今週はまだ記録がない」案内
- [x] マイルストーン経路（recordingFlow）と週次レポート（weeklyReport）の動作整合
- [x] `npm run build` 通過確認
- [x] CLAUDE.md の分析記述・TESTING_CHECKLIST の確認項目を更新

## リスク・懸念点

- **週区切り化の副作用**: 記録が1週間以上空いたユーザーは常に「今週はまだ記録がない」に
  なる。案内文に最終記録日（lastWorkoutDaysAgo）を添えて、再開を促す文面にする。
- **伸び/伸び悩み判定は全期間データ依存**: buildGrowthTrend は初期 vs 最近の比較なので
  週区切りにはしない（週単位だとデータ不足で常に判定不能になる）。「今週の実績」と
  「全期間のトレンド」が混在することをプロンプトの導入文で区別させる。
- **マイルストーン5回時点はトレンド判定不能**（buildGrowthTrend は4セッション以上必要・
  比較対象も少ない）→「まだ判定できない」を素直に出す設計なので問題なし。

## spec との対応確認

- 固定4セクション出力 → Phase 2（プロンプト + buildAnalysisData）
- 週区切り集計 → Phase 1
- ハイライト選定はコード・上限つき → Phase 1
- 該当なしの明示・再現性 → Phase 1（確定的選定）+ Phase 2（プロンプト指示）
- 通常分析・週次レポート・マイルストーンへの適用 → Phase 3

## 変更履歴
- 2026-06-11: 初版作成
