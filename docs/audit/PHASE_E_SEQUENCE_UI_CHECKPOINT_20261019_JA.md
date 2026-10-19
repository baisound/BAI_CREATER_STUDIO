# Phase E CAM-015 チェックポイント（2026-10-19）

- 起点: `b949556`
- 対象: オーナー承認済みCAM-015、ショット・カット区間編集。
- 変更: `camera.html`/`camera.js` に区間追加・削除・開始位置移動、既存カスタムプリセットとの連動を追加。保存JSONの `sequence` と Undo/Redo に統合。使用中プリセットの削除を阻止。
- テスト: `python -m unittest test_camera_sequence test_camera_sequence_ui test_camera_custom_presets test_camera_rig_store -q`; `node --check camera.js`; `git diff --check`。
- 未完了: 連続カット再生、UIの実ブラウザー操作確認、API/WebMCP/標準MCP、複数カメラ合成、MMD互換性。実装済みと称さない。
- 継続優先: CAM-015連続切替再生→既存Phase E全体残件表の順。オーナー確認はPhase E全機能実装完了後。
