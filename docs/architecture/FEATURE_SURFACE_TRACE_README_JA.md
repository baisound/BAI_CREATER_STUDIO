# 147機能 操作面トレーサビリティ（第三次設計）

正本は `../roadmap/FEATURE_REGISTER.json`。`FEATURE_SURFACE_TRACE_147.csv` は同ファイルの147件を1件ずつ収録。Phase割当は**実装優先路線を示す暫定的なグループ単位**であり、実装済み・API実在を意味しない。

## 共通設計契約
1. 1つのUseCase(Command + Query)を手動UI・バックエンドAPI・WebMCP・標準MCPから共有する。外部AIが使えなくても手動UIは独立稼働。
2. 変更操作には `operation_id`、`project_revision`、`actor`、`dry_run`、`undo_group_id` を持たせ、競合時に上書きしない。破壊的操作は事前プレビュー/明示確認。
3. 共有結果は `ok`、`error_code`、`warnings`、`affected_ids`、`revision_after` を最低限返し、非同期ジョブは別途 `job_id` と進捗を返す。
4. 147行は **API実装の証拠ではなく受入れ契約の雛形**。個別の具体的エンドポイント・テスト・実装ファイルはコード監査後に追記し、未検証を完了にしない。
5. 基本試験は契約テスト、UI操作、WebMCP/標準MCP等価性、保存再読込、Undo/Redo、実素材の画面/ファイル検証。既存機能のテストは壊さない。

## 優先順
Phase Bの残課題を維持しつつ E → F → リップシンク・表情・MMDエフェクト → C → D残り → G → H。バージョン文字列は識別目安で、完成判定は証拠ベース。
