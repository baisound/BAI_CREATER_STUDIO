# Phase E クレーン区間開始角対応（チェックポイント）

- 前HEAD: `5dcf714`
- 今回: 区間キー生成時に開始角 `crane_from_angle`、既存の操作量を終了角として使う。
- カメラ位置は両角の間で指定イージングに従って補間。既存キー衝突拒否・Undoは既存処理に委ねる。
- 旧プロジェクトに新項目がなければ開始角0度を使用する。保存時は明示的に追加。
- テスト: `node test_camera_rig.js`, `python -m unittest -q test_camera_rig_store`, `node --check camera.js`。
- 未完了: 親子階層のタイムラインUI、実ボーン軌跡のベイク、実GPUブラウザ検証、DOF実描画、ショット編集、MCP、MMD一致検証。
- 注意: ユーザー側動作確認はPhase E全実装後に行う。
