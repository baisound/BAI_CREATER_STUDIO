# Phase E ボーン追従設定プロジェクト保存チェックポイント

- 前提HEAD: `469b272`。
- `camera_project.json` の schema 1を維持し、任意 `bone_follow` フィールドにボーン名・Humanoid役割・XYZオフセット・有効フラグを保存する。
- APIの保存時にサーバー側で値の型、有限性、範囲、キー長を検証する。旧プロジェクトには新フィールドを強制追加しない。
- カメラ画面保存前に追従設定を同期し、読み込み時に保存設定を3D画面へ通知する。
- localStorage は旧ブラウザー設定のフォールバックとして維持。プロジェクト設定が存在すればそちらを優先。
- テスト: `python -m unittest -q test_bai_camera.py test_camera_follow_project.py test_camera_bone_follow_wiring.py` と `node --test test_camera_follow_config.mjs`、JS構文検査。
- 未検証: ブラウザー上の実モデル追従、設定保存UIのE2E、VRM標準化の完全性、リグ平滑化、MMD互換性、Phase E全体。
