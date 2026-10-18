# Phase E: VMD透視・平行投影切り替えチェックポイント

- 起点: `572f98a`
- 範囲: `camera_3d.js` の試験VMDプレビュー
- 完了: VMD透視フラグ（0=透視、1=平行）に応じて Three.js のPerspectiveCamera/OrthographicCameraを切り替える。描画カメラおよび自由視点側のCameraHelperを同期し、リサイズ時に平行投影領域を更新する。
- 仕様上の暫定措置: 平行投影の垂直半幅は被写体距離×tan(FOV/2)で算出。実際のMMDの平行投影スケールに対する互換性は未検証。
- 確認: JavaScript構文検査、`test_camera_projection_wiring.py` を含む関連テスト15件通過（静的配線チェック中心）。GPU描画・MMD本体との比較は未実施。
- 残課題: 実MMD参照映像による投影サイズと軸の検証、実画面試験、VMD書き出しの同値検証、撮影リグ、DOF、ショット管理、MCP。
- Phase E全体: 未完成。ユーザーによる動作確認は要求しない。
