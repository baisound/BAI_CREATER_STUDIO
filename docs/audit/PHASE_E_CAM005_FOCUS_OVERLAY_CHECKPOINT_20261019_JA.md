# CAM-005 フォーカス可視化・同期 チェックポイント

基点 b7a1687。ユーザー要求の既存機能連携修正のみ。

## 実装
- camera.js で共通診断の結果を3D描画側へイベント通知。診断OFF・計算失敗で表示も消す。
- camera_3d.js でThree.jsの焦点面・対象マーカーをGPU描画。自由視点だけに表示し、撮影プレビュー・出力へ混入させない。
- VMD追従ONの現在フレームで、診断姿勢に試験VMD姿勢を使う。切替OFFで解除。

## 未完了・重要
- 試験VMDの全区間診断は現在フレーム以外のVMD姿勢を使用していない。完了と判定しない。
- 3Dカラー表示は焦点面と選択対象マーカーの簡易表示。メッシュ全体の深度ヒートマップではない。
- GPU実行/実GLB・VRM/DOF映像一致/標準MCPとWebMCPは未検証。
- 次はVMD区間姿勢の整合、通常/追従/VMD切替の回帰テスト、実ブラウザーでの描画テスト。

## 自動試験
- node --test test_camera_focus_overlay.cjs test_camera_focus_consistency.cjs test_camera_dof.cjs
- node --check camera.js; node --check camera_3d.js
