# Phase E — VMD追従描画優先順位と再生クロック修正

## 起点
前HEAD `de231f7`。MMDカメラプレビューはまだ試験モードで、MMD本体との座標・回転一致は未検証。

## 今回確認した具体的な不具合
`setFrame` が `bai-camera-frame` を発火させると、通常撮影姿勢の `camera_3d.js` のイベントハンドラが、`camera.js` の `bai-camera-vmd-preview` イベントで適用した試験VMD姿勢を上書きすることがある。登録順は依存関係の一部ではないため、描画の優先順位を明示しなければならない。

## 修正
1. VMD追従ON中は通常カメライベントによる撮影姿勢上書きを抑制する。OFFでは通常姿勢へ戻る。モデルアニメーションのフレーム更新は両モードで継続。
2. 再生クロックで整数に丸めたframeを毎回の起点に使わず、浮動小数のplayheadを保持しフレーム端数を蓄積する。停止時には要求済みRAFを取り消す。
3. コード構文と回帰テストを追加。

## 検証
`node --check camera.js && node --check camera_3d.js`、`python -m unittest -q test_camera_vmd_render_priority test_camera_vmd_local test_camera_vmd_timeline_wiring`（9件）。ブラウザー上のWebGL/MMD実機比較は未実施。

## 未完了
- 実MMDとの回転・符号・距離・透視設定の比較検証。
- 完全なVMD往復編集と本番シーケンスへの導入。
- 撮影リグ、DOF、MCP、実モデルによるブラウザー統合検証。
- イベント優先順位はローカルVMD追従ON/OFFの範囲に限る。複数カメラトラックとレイヤーの設計は別途必要。

ユーザー側の動作確認はPhase Eの全実装後に行う。
