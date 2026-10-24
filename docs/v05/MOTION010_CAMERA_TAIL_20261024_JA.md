# MOTION-010 長尺編集時の旧カメラ終端

2026-10-24、Issue #106。既定の旧カメラは300F、v0.5の作品は60fpsで90秒ならF5400になる。従来の画面シークはカメラシーケンスAPIへF5400をそのまま送り、範囲外HTTP 400を発生させた。長尺PMX/VMD編集を続ける際の診断ノイズとなるため、画面のカメラ追従要求に限り終端姿勢を保持する経路を追加した。

`GET /api/camera/sequence/evaluate?frame=5400&overflow=hold` は旧カメラの終端F300で評価した姿勢とともに `frame:300`、`requested_frame:5400`、`held_at_end:true` を返す。v0.5画面はこの指定を使い、カメラ状態へ作品F5400と実評価F300、終端保持状態を渡す。従来の `?frame=5400` は引き続きHTTP 400、負フレームも拒否する。カメラ原本のdurationやキーは変更しない。

隔離Chromeで実PMX `Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx`（SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`）と実VMD `キラメキのシンフォニー1005.vmd`（SHA-256 `f75a0bf518aef532c400e5ed31211d71ce294c2a69916ebf55ad16c3bfabd3d2`）を184.5秒作品へ置き、旧300Fカメラのまま90秒へシークした。画面のカメラ状態は作品F5400・実評価F300・終端保持trueで、ブラウザHTTP失敗0件。全身骨と表情キーの保存・再読込、3FのMP4も同じ試験で通り、原本ハッシュ不変。隔離ブラウザはSwiftShader、MP4ジョブはNVIDIA GeForce RTX 4070 SUPERを報告したが、任意GPUの描画品質まで認定しない。

試験: `python -m pytest -q tests/test_camera_sequence_tail.py tests/test_camera_focus_endpoint.py` は隔離データ・ローカルソケット許可下で4件通過。初回の制限環境では後者2件がソケット権限で失敗し、環境を直して全件再実行した。`node tests/run-guarded.cjs tests/studio-v05-full-pmx-dance.test.cjs` は1件通過、0失敗・0スキップ、実データ `data` 7件・`exports` 0件の前後ハッシュ一致。`npm run typecheck`、JS構文、Python構文も通過。

作品FPSと旧カメラファイルFPSが異なる場合の秒単位換算、物理ON、任意の旧カメラデータとカット構成、Linux、標準MCP実通信、Owner採用、MOTION-010/CAM-015全ACは未確認。画像・動画成果物はなくEagle登録対象なし。モデル区分：設計・実装・試験に標準モデル区分を使用。
