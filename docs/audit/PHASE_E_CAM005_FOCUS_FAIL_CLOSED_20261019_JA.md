# CAM-005 追従対象がない場合の誤判定防止 — 作業チェックポイント

- 基点: `a183347`
- 区間診断だけでなく単一フレーム診断も、追従ONで同フレームの実ボーン位置が取れない場合は判定不能とし、静的人体ガイドへの暗黙のフォールバックを禁止。
- モデル・ボーン・撮影姿勢が欠落したとき、または座標取得に失敗したとき、古い追従ポイントを無効にするイベントを通知。
- 自動テスト: `node --test test_camera_focus_fail_closed.cjs test_camera_focus_overlay.cjs test_camera_focus_tracking.cjs`。
- 未完了: GPU実描画確認、DOFの視覚一致、VMD切替時の連続統合試験、MCP連携。Phase E完成判定は不可。
- 方針: オーナー承認済み機能のみ。GPU優先。ユーザーによる確認はPhase E全実装後。
