# CAM-005 全区間VMDフォーカス診断チェックポイント

基点: `e88a767`。オーナーが指示した既存機能間の整合性修正であり、新機能ではない。

## 今回の修正
- 通常カメラとVMDカメラをフレームごとに選択する `diagnosticCameraPose(f)` を導入。
- VMD追従ON時は、現在フレームのキャッシュを流用せず、ローカルVMDサンプラーで対象フレームのカメラ姿勢を評価する。
- 区間診断での選択ボーンに対する合焦距離の再計算も同じカメラ姿勢を使う。
- VMD追従ONでサンプラーが利用不能な場合、通常カメラへ無断フォールバックせずエラーにする。

## 検証
- `node --test test_camera_focus_vmd_range.cjs test_camera_focus_overlay.cjs test_camera_focus_consistency.cjs`：9件通過。
- `node --check camera.js`：通過。

## 未完了
- 実ブラウザー・GPUでの3Dカラー表示、DOF映像との整合、MMD本体との一致は未検証。
- 現在のボーン区間評価はGLB内蔵アニメーションを前提とし、外部VMDキャラクターモーションの評価には未対応。
- 区間診断の長尺処理と全MCP経路は統合検証が必要。
- CAM-005およびPhase Eは完成扱いにしない。
