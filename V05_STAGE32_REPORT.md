# BAI Creator Studio v0.5 枝番32

ブランチ: `feature/v05-ui-overhaul-32`

## 実装
- 作品一覧の選択・開く操作から `bai:project-selected` を発行。
- 作品IDによる `/api/studio/v05/project/fps` の取得と、設定ダイアログのFPS編集UIを実装。
- 同じAPIへの保存を使い、プロジェクトを切り替えた後の古い非同期レスポンスを破棄。
- 作品ごとのFPS取得結果を既存 `BAIStudioCameraProjectRuntime` へ渡す。
- 未設定時は既定値60fpsを明示。通信失敗時は保存成功と表示しない。
- 標準MCP・WebMCPは既存 `bai_studio_project_fps_get/set` を維持し、重複ツールを作らない。

## 検証
- `node test_v05_fps_ui_v32.cjs` 成功
- `node --check` (変更したJavaScript) 成功
- `python -m unittest -q test_v05_stage31` 3件成功

## 未完了・注意
- 既存カメラプロジェクト側の実DOF GPUレンダリングは未接続。
- ブラウザ実動作、実モデル描画、MCP/WebMCP実通信の統合テストは未実施。
- 作品一覧は一部デモカードが残る。FPS操作は実IDを持つ作品のみ有効。
- 起動済みの別タブへ設定変更を即時プッシュする機能は未実装。
