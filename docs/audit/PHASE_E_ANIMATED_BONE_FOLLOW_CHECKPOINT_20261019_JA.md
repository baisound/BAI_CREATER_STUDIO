# Phase E 動的ボーン追従チェックポイント

- 起点: `ae2fb31`（既存作業ツリー再利用、ZIP再展開なし）
- 追加: GLB/VRMのボーン選択、クリップをサンプリングした後のワールド座標から撮影カメラを追従させる非破壊プレビュー
- オフ時: 通常の撮影姿勢に復帰。VMD試験追従中はボーン追従を抑止
- 未完了: 実ブラウザー/GPUによる表示確認、VRM Humanoidボーン名の正規化、ユーザー定義オフセット、永続的な追従リグ保存、VMDとの互換・優先順位UI、安定した連続更新
- 検証: `node --check camera_3d.js`、`python -m unittest -q test_camera_bone_follow_wiring.py test_bai_camera.py test_camera_focus.py`、`node --test test_camera_rig.js`
- 注意: 構造テスト中心で、実際のGPU表示成功やPhase E完成は意味しない
