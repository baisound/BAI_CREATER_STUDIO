# Mixamo統合制作スタジオ — 開発文書（正本）

**このフォルダーは「提案と実装報告の取りこぼしを防ぐ」ための文書専用コミットです。**

- [`00_OVERVIEW_JA.md`](00_OVERVIEW_JA.md) — フェーズ別の概要と機能リンク
- [`FEATURE_DETAIL_JA.md`](FEATURE_DETAIL_JA.md) — 全機能IDの詳細・受け入れ条件
- [`FEATURE_REGISTER.csv`](FEATURE_REGISTER.csv) / [`FEATURE_REGISTER.json`](FEATURE_REGISTER.json) — 機械可読の機能台帳
- [`ROADMAP_JA.md`](ROADMAP_JA.md) — 推奨開発順序・依存性
- [`TRACEABILITY_JA.md`](TRACEABILITY_JA.md) — 会話要求とIDの対応表
- [`IMPLEMENTATION_AUDIT_JA.md`](IMPLEMENTATION_AUDIT_JA.md) — 検証・実装状態の基準

## 変更時の規則

新規要求があれば最初に類似のIDを探し、統合可能ならそのIDの詳細仕様を更新。独立している場合のみ新IDを発番。概要・詳細・CSV/JSON・トレーサビリティ・テストを同時に修正する。

**全機能をAI不要の手動UIとWebMCP/標準MCPの共通APIで扱うこと。**
