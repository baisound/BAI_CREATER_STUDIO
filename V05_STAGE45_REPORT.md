# UI Overhaul 45 — フォーカス履歴の可視化

- 保存済み診断の問題フレームをSVGで描画。未記録フレームを正常として補間しない。
- ポイントのクリック／Enterで指定フレームへシーク。
- 保存した区間から再診断を起動。評価器未登録の場合はエラー、結果は自動保存しない。
- MCP/WebMCP: 既存の保存・取得ツールを維持。新規API追加なし。
- 未検証: ブラウザE2E、実モデル、GPU描画、MCP/WebMCP実通信。

## テスト
- `node test_v05_focus_visualization_v45.mjs`: PASS
- `node test_v05_focus_history_v44.mjs`: PASS
- JavaScript構文確認: PASS
