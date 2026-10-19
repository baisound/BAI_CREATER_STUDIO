# MMDカメラVMD — 共通フレーム連動サンプリング（部分実装）

- 既存のVMD解析APIが返すキーをブラウザ側で保持し、既存カメラタイムラインのフレーム位置に同期して、MMDのカメラ生値を補間表示する。
- FPS換算は `MMD frame = project frame × 30 / project.fps`。
- 六系統のBezier補間（X/Y/Z/回転/距離/視野角）をJS実装し、Python実装と同じ境界条件を用いる。
- 読み込み・サンプリングでは、カメラプロジェクトのキーを書き換えない。既存のワイヤーフレームプレビューは従来プロジェクトをそのまま使用する。
- この機能は『MMDカメラ数値の再生連動』であり、MMD回転・距離・座標系を3Dビューへ反映する本番カメラ再生ではない。MMD実VMD比較、実ブラウザE2E、カメラVMD出力、MCP追加は未完了。
- 検証: `node test_camera_vmd_preview.js`, `node --check camera.js`, `python -m unittest discover -p 'test_*.py' -q`。
