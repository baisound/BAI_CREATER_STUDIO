# Phase E カメラVMD 試験3Dプレビュー・チェックポイント

## 実装
- `camera_vmd_bridge.py` にMMDネイティブサンプル値からThree.js Y-upのカメラ位置・注視点・FOVへ変換する**試験用**関数を追加。
- `/api/camera/vmd/preview-pose` と、読み込み済みVMDを任意フレームで「試験3Dプレビューへ適用」するボタンを追加。
- プレビュー変更は一時的で、プロジェクト・キーフレーム・VMD原本は変更しない。

## 座標系の暫定仮定・制約
- MMD左手座標のZを反転し、Euler XYZとローカルZ方向の符号付き距離を利用。MMD本体のカメラ挙動との一致は**未検証**。カメラのロール表現や透視フラグのThree.jsへの完全対応は未実装。
- UIは現時点で「単一フレームの試験表示」。タイムライン再生とVMDサンプルの全フレーム連動は未実装。
- モデル／カメラの両方を備える実MMDの比較テスト、ブラウザGPU実機検証、VMDの再編集・書出しは未完成。
- 次回は基準VMDの比較と、正確な座標・回転・符号の確定を優先する。

## 検証
`python -m unittest -q test_camera_vmd_bridge test_camera_vmd_playback test_camera_vmd_codec test_bai_camera`（23件）、`node --check camera.js`、`python -m py_compile server.py` 通過。実ブラウザー確認は未実施。
