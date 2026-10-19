# P1 新UIモック テスト報告（2026-10-20）

実行環境：クラウドLinuxコンテナ（Python 3.13 / Node 22 / Playwright 1.56.1 + Chromium ヘッドレス）。

| コマンド | 結果 |
|---|---|
| `npm run test:studio`（tests/studio-ui.test.cjs） | **7/7 成功**：25画面のナビ遷移・aria-current・画面ID／直接URL・再読み込み・戻る/進む・?tab= 保持・存在しない番号／タブ・矢印キー・ドロップダウン・Ctrl+K検索・タイムラインのシーク／未実装ダイアログとEsc・フォーム検証・偽の成功を出さない文言／全画面・全タブの操作ボタンが必ずダイアログかトーストで反応／既存APIの読み取り表示と既存ページ200・パス走査404／テーマ保存・390px幅で横スクロールなし・モバイルメニュー。コンソールエラー0件 |
| `npm run test:studio-routes`（tests/test_studio_routes.py） | 4/4 成功 |
| `tests/test_camera_focus_endpoint.py`（CAM-005修正の回帰） | 2/2 成功 |
| `npm run typecheck`（tsc checkJs strict） | エラー0 |
| `python -m pytest -q`（全体） | 301 成功 / **3 失敗**（既存：`test_camera_easing.py::test_custom_round_trip`、`test_camera_lens_fstop.py::test_invalid`・`test_persist`。今回の変更前の `8b9d9d2` 時点で失敗。`bai_camera.validate` が custom 補間・fStop 未対応） |
| `node --test test_camera_*.cjs` | 40/40 成功 |
| `node --test tests/dev-workflow.test.cjs` | 4/4 成功 |

## 実機確認
- 所有者PC（Windows）で `python server.py 8770` を起動し、`/workspace/01` と `/api/server-version` が 200 を返すこと、既定ブラウザで表示されたことを確認（別フォルダの git worktree、コミット 55af2a7）。所有者自身による操作確認は未実施。

## 未検証
- 所有者PCでの `npm run dev`（BrowserSync）による自動リロードの実演。
- 実モデル・GPU描画（新UIは3D描画に未接続）。WebMCP・標準MCPからの新UI操作（未接続）。
- Firefox / Safari、実機タブレット。
