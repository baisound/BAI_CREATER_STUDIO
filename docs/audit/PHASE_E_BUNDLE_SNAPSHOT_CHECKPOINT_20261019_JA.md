# Phase E 統合保存・読み取り整合性チェックポイント

- 起点: `e4a6187`。
- 統合GETは既にPROJECT_LOCKを使用していたため変更不要（監査中の誤認を訂正）。
- 統合POSTはコミット後のリビジョンを同じロック内で読み取り、レスポンスへ含める。
- カメラ単独GETをPROJECT_LOCKへ統一。
- 検証: `python -m unittest -q test_bundle_snapshot_consistency test_bundle_revision test_project_state_bundle test_camera_project_revision` 18件通過。Python構文検査とgit diff --check通過。
- 未検証: 実HTTP同時要求、ブラウザーUI、MCP接続、電源断、VMDを含む完全再開。
- 次回: 旧クライアントの無条件保存を排除する互換移行と実HTTP並行テスト。OWNER FIRST; 後順位マルチカメラは着手しない。
