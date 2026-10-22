# v0.5 枝番43 実装報告

- 区間フォーカス診断結果を作品IDごとにリビジョン付きJSONで保存（最大30件）。
- API: GET/POST `/api/studio/v05/focus-reports`。
- 標準MCP/WebMCP: `bai_studio_focus_reports_get` / `bai_studio_focus_reports_save`。
- 区間診断GUIに明示的な保存ボタンを追加。GPU未検証を明記。
- 本機能は診断結果の保存・取得であり、実GPU画素との一致判定ではない。
- 実ブラウザE2EとMCP/WebMCPの通信は未検証。
