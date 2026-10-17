# v0.16.45 カメラキーフレーム区間補間

- キーごとの `interpolation` は `linear` / `smooth` / `hold`。
- 旧プロジェクトで省略される場合は `linear` として扱う。
- 左キーの補間指定を右キーまでの区間に適用。`smooth` は Smoothstep（Bezier曲線ではない）、`hold` は直前キーを維持。
- 3D実モデルのプレビューおよびカメラVMDはこの版では未実装。
- 開発環境で実行できた検証は `python -m unittest discover -p 'test*.py' -q`（25件）および `node --check camera.js`。
- 他のディレクトリにあるテストの全件確認、ブラウザE2E、MCP実通信は未検証。
