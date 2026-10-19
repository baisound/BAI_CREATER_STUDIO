# CAM-005 フォーカス更新順の不具合修正（2026-10-19）

- 基点: `650e551`。オーナー承認の既存整合性不具合のみを対象とし、追加機能は導入しない。
- 問題: カメラのボーン追従では撮影カメラ姿勢の適用前に焦点距離を評価していた。そのためフォーカス診断・BokehPassが一時的に旧カメラ姿勢と新被写体位置を組み合わせうる。
- 対応: 追従中は `applyPose(next)` 後に `updateTrackedFocus()` を実行。VMDプレビューイベントでも姿勢適用後に更新。追従無効・VMD優先時も合焦距離評価は維持。
- テスト: `node --test test_camera_focus_update_order.cjs test_camera_focus_tracking.cjs test_camera_focus_overlay.cjs test_camera_focus_vmd_range.cjs` 。構文検査実施。
- 未検証: 実GPU/BokehPass表示、VMD・ボーンの実データ同期、描画性能、MMD実機比較。CAM-005とPhase Eは未完成。
- 次: これらの検証と既存機能との整合性を優先する。ユーザー側動作確認はPhase E全実装まで依頼しない。
