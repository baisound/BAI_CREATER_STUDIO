# MMDカメラVMD入力 — 開発進捗

基準コミット: `e965a0b`。ロードマップ訂正コミット: `5b4d6e4`。

## 今回実装
- `camera_vmd.py`: MMD VMDのバイナリヘッダ、ボーン・モーフ領域のスキップ、カメラフレームの安全な読み込み。
- カメラ項目: フレーム、距離、中心、Euler回転、24バイト補間、視野角、パース。
- `POST /api/camera/vmd/inspect`: 最大16MiB、`application/octet-stream`、原プロジェクト非破壊。
- `camera.html`/`camera.js`: VMDの選択と解析結果表示、旧キーフレームには自動反映しない。
- 異常データ・短い入力・重複フレーム・NaNを拒否するテスト。

## 実装未完了（完成と混同しない）
- VMDの独自Bezier補間を使う実カメラ再生、カメラ位置への正しい座標変換。
- 既存プロジェクトのタイムラインへの確定インポート、Undo/Redoとの統合。
- 標準MCP／WebMCPへの専用ツール公開。
- 実際のMMDカメラVMDでの動作、ブラウザE2Eの検証。
- カメラVMD書き出し／再読み込み検証。

## 検証
`python -m unittest discover -p 'test*.py' -q` および `node --check camera.js`。
