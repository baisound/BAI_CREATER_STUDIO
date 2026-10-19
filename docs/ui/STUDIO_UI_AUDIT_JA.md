# 新UI（25画面モック）監査 — 2026-10-20

引き継ぎ資料 `BAI_Creator_Studio_Claude_Code_Handoff_GitHub_Direct_20261020.zip`（START_HERE_JA.md 起点）とGitHub現行コードを照合した結果。

## 1. 現行コードの事実（GitHub正本）

| 項目 | 確認結果 |
|---|---|
| 正本ブランチ | `recovery/phase-e-20261019`（HEAD `8b9d9d2`）。`main` は `e68dafc`、`master` は `4a79138`（recoveryの祖先）。作業ブランチ `claude/project-thread-8gcwq2` は recovery から分岐 |
| package.json | Python server + nodemon + BrowserSync + concurrently のみ。TypeScript / Vite / React / Vue は**未導入**（スナップショットと一致） |
| フロントエンド | `index.html`（制作画面・800行）と `camera.html`（カメラ画面）。フレームワークなしのES/グローバルスクリプト |
| サーバー | `server.py`（標準ライブラリ、127.0.0.1限定）。静的ファイルは許可リスト方式で個別配信 |
| API | `/api/project/bundle`, `/api/camera/*`（project, focus, sequence/evaluate, sample, VMD系）, `/api/ai/*`, `/api/diagnostics/*`, `/api/ui-qa/settings`, `/api/server-version` 等 |
| MCP | `webmcp.js`（ブラウザ）、`mcp_server.py`（stdio）。新UIからは未接続 |
| 台帳 | `FEATURE_REGISTER.json` 147件（要検証50・計画68等）。Phase E は CAM-001〜018 全件 `release_complete=false` |
| 既存テスト | pytest 295 pass / **3 fail**（`test_camera_easing.py::test_custom_round_trip`、`test_camera_lens_fstop.py::test_invalid`・`test_persist`）。`8b9d9d2` で追加されたテストが `bai_camera.validate` 未対応のため失敗。今回の変更前から存在 |

## 2. 監査で見つけた既存不具合（修正済み）
- `GET /api/camera/focus` が常に応答なし（`do_GET` 内の局所 `import parse_qs` による UnboundLocalError）。CAM-005 / E-FOCUS の必須修正として `a9ba647` で修正し回帰テストを追加。

## 3. 技術選定（P1-B）
- **TypeScript導入は型チェックのみ**：`tsconfig.json`（checkJs）＋ JSDoc。ビルド工程なしでPythonサーバーがそのまま配信し、既存BrowserSyncの自動リロードで即時反映される。Vite等への全面移行は不要と判断（既存スタックとの衝突回避）。将来 `.ts` 化する場合も型情報はそのまま移せる。
- ルート：`/workspace/01`〜`/workspace/25`（直接URL・再読み込み可）。アセットは `/studio/*`。`studio_routes.py` でパス走査を拒否。
- 既存画面・既存APIは変更なし（index.html にリンク1件を追加したのみ）。

## 4. 起動手順
```
python server.py 8765          # 既存と同じ。npm 不要
# ブラウザで http://127.0.0.1:8765/workspace/01
npm install                    # 開発時のみ
npm run dev                    # http://127.0.0.1:3000/workspace/01（studio/ 編集で自動リロード）
npm run typecheck              # 型チェック
npm run test:studio            # Playwright 画面操作テスト（初回は npx playwright install chromium）
npm run test:studio-routes     # ルーティング単体テスト
node tools/gen_screen_matrix.mjs   # 画面×機能の実装マトリクスを再生成
```
※ 自動リロード時、画面内のサンプル入力は失われます（保存機能がないため）。

## 5. 25画面の状態（要約）
詳細は [`SCREEN_IMPLEMENTATION_MATRIX.json`](SCREEN_IMPLEMENTATION_MATRIX.json)。パネル152件の新UI上の状態：

| 表示 | 件数 | 意味 |
|---|---|---|
| 実機能 | 11 | 既存APIを読み取り表示（GETのみ。新UIからの書き込みはない） |
| 既存・部分 | 48 | 現行画面にコードあり。新UIへ未移植（P2対象） |
| サンプル表示 | 35 | 画面内の仮データのみ |
| ◇ 未実装 | 58 | 実装なし。押すとロードマップ上の位置を説明 |

**いずれの行も機能完成ではない。** 25画面台帳の分類（existing_or_partial_to_audit / candidate_late）は提案のまま維持。

## 6. 引き継ぎ資料との差異
- 資料は「TypeScript/Vite未確認」としていた → 未導入を確認。型チェックのみ段階導入。
- SCR-15（カメラVMD）・SCR-02/03/14/16 はカメラ実装と横断。新UIは既存カメラ画面へリンクし、カメラ処理を複製していない。
- SCR-08 と SCR-11 は同一素材索引に統合する方針を画面上にも明記。
- SCR-19 の稼働率・GPU負荷などの画像内サンプル値は採用せず、既存 `/api/ai/status` の実値または「未接続」を表示。
- 25画面の参照画像（52.7MB）はリポジトリに含めない（原本素材はGit管理対象外の規則）。所在：プロジェクト共有フォルダ `設計書/BAI_Creator_Studio_UI_Design_25_Screens_PACKAGE.zip`、ローカル `D:\BAI\BAI_CREATER_STUDIO\`。

> 追記（2026-10-20）：上記の既存テスト3件の失敗は `bai_camera.validate` を修正して解消し、pytest は304件すべて成功しています。
