# Phase E: 統合プロジェクトの素材参照・再生位置の中間チェックポイント

- ベース: `45b0ef6`
- 範囲: 既存高優先要件「プロジェクト状態保存・復元」の一部。追加提案なし。
- `workspace` はGLB/VRMの素材名・GLB内蔵クリップ番号・フレームの参照情報だけを保持する。素材ファイル自体や外部VMDの内容は埋め込まない。
- バンドルAPIは旧形式も受理する。旧バンドルはカメラ復元可能だが、完全な作業状態復元の成功表示はしない。
- 読み込み時に素材カタログとクリップを検査し、取得できなければ失敗を画面に表示する。
- 未実装: メイン画面編集中状態、外部VMD、永続的な素材識別子、MCP、電源断耐障害性、実GPU・ブラウザー往復試験。
- 検証: `python -m unittest -q test_project_state_bundle test_camera_project_bundle_ui`、`node --check camera_3d.js`、`node --check camera_project_bundle_ui.js`。
- 次回: 失敗時の画面状態ロールバックとメイン編集画面の実状態保存、素材参照の安定ID化。
