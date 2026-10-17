# v0.16.43 BAI Camera（Phase E）

## 実装済み
- 独立した `/camera.html` ワークスペース。既存画面から遷移できる。
- カメラ位置・注視点・画角（FOV）、キーフレーム追加/削除/ドラッグ移動、線形補間、プレビュー、基本プリセット。
- カメラプロジェクトの JSON 保存/取得、検証、アトミック保存。Undo/Redo、JSON書き出し。
- HTTP API `GET/POST /api/camera/project`, `GET /api/camera/sample?frame=N`。
- WebMCP、STDIO MCPそれぞれ `bai_camera_get/set/sample` を追加。
- Ollamaを必要としない独立動作。元モデル・VMDは変更しない。

## 未実装・制約
- カメラのプレビューは独立した Canvas ワイヤーフレーム簡易構図図。実PMX/VRM表示ではない。
- MMDカメラVMD読み込み/書き出し、Bezier補間、ロール/F値/DOF、実3Dモデル同期、レンダリングは未実装。
- 既存メイン画面のThree.jsはCDN参照でオフライン検証が必要だが、新カメラ画面は外部ライブラリ非依存。
- ブラウザの実GUI動作/WebMCP対応ブラウザでの実通信は未検証。

## 受け入れ・検証
- Pytest 148件通過（開発環境）。
- 新規カメラ専用の7件に加えHTTP GET/POSTの疎通確認を実施。
- 構文検査 `python -m py_compile ...`、`node --check camera.js webmcp.js` 成功。
