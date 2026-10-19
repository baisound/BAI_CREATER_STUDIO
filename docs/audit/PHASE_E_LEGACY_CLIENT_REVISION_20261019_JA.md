# Phase E 従来編集画面の保存競合修正

- 基点: `7a7db22`。承認済みプロジェクト状態保存の既存整合性修正。
- GET `/api/project?envelope=1` は従来レスポンスを維持しつつ `project` と `revision` を返す。
- 手動/自動保存で `If-Match` を使用し、409時は更新競合として保存を拒否する。成功時はサーバーが確定保存した版を返す。
- 初回読込失敗時は不明な版を用いた保存を拒否。
- テスト: `python -m unittest test_legacy_project_client_revision test_legacy_project_revision test_bundle_revision test_project_state_bundle -q`
- 未検証: 実ブラウザー、MCPホスト、旧版指定なしクライアント、電源断、全状態復元。
- 再開: 全保存経路の競合保護監査、外部素材参照復元、CAM-005/シーケンス残件。
