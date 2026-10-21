# Mixamo統合制作スタジオ — 開発文書（正本）

**このフォルダーは「提案と実装報告の取りこぼしを防ぐ」ための文書専用コミットです。**

- [`00_OVERVIEW_JA.md`](00_OVERVIEW_JA.md) — フェーズ別の概要と機能リンク
- [`FEATURE_DETAIL_JA.md`](FEATURE_DETAIL_JA.md) — 全機能IDの詳細・受け入れ条件
- [`FEATURE_REGISTER.csv`](FEATURE_REGISTER.csv) / [`FEATURE_REGISTER.json`](FEATURE_REGISTER.json) — 機械可読の機能台帳
- [`ROADMAP_JA.md`](ROADMAP_JA.md) — 推奨開発順序・依存性
- [`TRACEABILITY_JA.md`](TRACEABILITY_JA.md) — 会話要求とIDの対応表
- [`IMPLEMENTATION_AUDIT_JA.md`](IMPLEMENTATION_AUDIT_JA.md) — 検証・実装状態の基準
- [`../specs/SPEC_PROGRESS_JA.md`](../specs/SPEC_PROGRESS_JA.md) — 承認済みバックログの仕様・UIモック進捗と未検証点

## 変更時の規則

新規要求があれば最初に類似のIDを探し、統合可能ならそのIDの詳細仕様を更新。独立している場合のみ新IDを発番。概要・詳細・CSV/JSON・トレーサビリティ・テストを同時に修正する。

**全機能をAI不要の手動UIとWebMCP/標準MCPの共通APIで扱うこと。**

## 追加監査
[添付アプリ分析](ATTACHMENT_20261015_V02_ANALYSIS_JA.md) / [統合フェーズ](PHASE_00_INTEGRATION_JA.md)

## 最新の未実装・合意済み決定
- **Phase 00の最初の実装はログ出力・ログローテーション**：[仕様](PHASE_00_LOGGING_FIRST_JA.md)。手動UI/WebMCP/標準MCPすべて対応し、実機診断ZIPを用意する。

## 全開発エージェント・UI/UX設計の入口
- [`../../AGENTS.md`](../../AGENTS.md) — ローカル開発者・Codex向けの最初に読む規則
- [`UI_UX_DESIGN_STANDARD_JA.md`](UI_UX_DESIGN_STANDARD_JA.md) — 新規決定された横断UI/UX基準（UX-001〜008）
