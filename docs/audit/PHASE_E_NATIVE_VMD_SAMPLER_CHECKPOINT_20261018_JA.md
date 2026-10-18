# Phase E VMDネイティブ再生サンプラー — 中間チェックポイント

## 今回の実装
- MMDカメラVMDネイティブキーの各補間チャネル（位置X/Y/Z、回転、距離、画角）についてBezier逆解法を用いたサンプリング。
- `POST /api/camera/vmd/native/sample` で任意フレームのMMD座標値を取得。
- カメラ画面のネイティブVMD読込後、指定フレームの補間値を確認するUI。
- 既存のネイティブVMD入出力と併存し、既存プロジェクトキーを変更しない。

## 検証範囲
- `python -m unittest -q test_camera_vmd_playback test_camera_vmd_codec test_camera_vmd_inspect test_bai_camera test_camera_interpolation test_camera_move` ：34件成功。
- `node --check camera.js` ：成功。
- ブラウザGPU、実VMDによるMMD挙動照合は未実施。

## 未完成・次の作業
- MMD→BAI座標系とオイラー回転の変換、距離符号、右手/左手系の確定と実VMD照合。
- MMDの実際のカメラ補間仕様とのサンプル比較（回転と透視切替を含む）。
- カメラVMDの撮影プレビュー再生・BAI形式との双方向変換・書き出し実装。
- レール/クレーン/親子制御、実DOF、モデル同期、MCP、統合検証。

## 注意
これはPhase E完成宣言ではない。利用者の動作確認はPhase E全機能完成後に初めて依頼する。
