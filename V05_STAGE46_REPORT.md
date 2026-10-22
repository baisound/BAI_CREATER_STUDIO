# v0.5 UI刷新 枝番46

- 新規区間診断は全フレームの成功/失敗・誤差を `samples` として格納。
- 保存APIでは count とフレーム順、数値の有限性を検証。旧レポートは samples 無しで継続読取可能。
- 実測値がある連続フレームだけを線で描画し、失敗フレーム間を捏造補間しない。
- プロットの空白部分をポインタドラッグすると診断範囲の開始・終了入力に反映。
- GPU描画との一致は未検証であり、 `evaluatedAgainstGPU=false` を維持。
- MCP/WebMCP の既存レポート保存・取得APIをそのまま使用。新しいツールは不要。
- 検証: `node test_v05_focus_samples_v46.mjs`、`python -m unittest discover -s tests -p test_v05_focus_reports_v43.py`、構文検査。
- 未検証: ブラウザE2E、実モデルのGPU描画、MCP/WebMCP実通信。
