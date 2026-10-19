# Phase E 状態保存統合 — 中間チェックポイント

- 基点Git: `93fd42c`
- 対象: オーナー承認済み・高優先のプロジェクト保存/再読み込み機能。新機能の思いつきによる拡張ではない。
- 追加: `project_state_bundle.py`、`test_project_state_bundle.py`、`GET/POST /api/project/bundle`。
- テスト: `python -m unittest -q test_project_state_bundle test_bai_camera` 11件通過。
- 未完成: 一括UI操作、素材参照と欠損警告、VMD・再生時刻、DOF/フォーカス全設定、WebMCP・標準MCP、電源断時の原子性、実ブラウザー往復テスト。
- 完成判定は禁止。ユーザー側の動作確認はPhase E全機能完成後。
