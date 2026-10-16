# WebMCP 連携仕様書（Mixamo 格闘ビューワー）

更新: 2026-10-17 / 試作仕様 v1

## 目的
WebMCP の **imperative API** `document.modelContext.registerTool()` を利用し、WebMCP対応のブラウザ上のAIエージェントが、既存のMixamo格闘ビューワーの機能を直接呼び出す。**ブラウザのWebMCP対応が必要**。Codex CLI/Claude Code の標準MCP(stdio)と同一ではない。自動接続・互換を保証しない。

## ファイル
- `index.html`: `webmcp.js` を読み込む。既存UI・保存機能を維持。
- `webmcp.js`: WebMCPツールの定義・登録。未対応ブラウザでは何もしない。
- `server.py`: 既存のJSON API。追加のネットワークサービスは不要。
- `data/`: ローカルFBXとプロジェクト・お気に入りは既存形式を保持。

## 起動
- Windows: `起動.bat` / Linux: `./start.sh`
- `http://127.0.0.1:8765/` をWebMCP APIに対応したブラウザで開く。localhost はセキュアコンテキストとして扱われる。
- 開発者コンソールで `window.mixamoWebMcpDiagnostics` を確認する。`supported`, `registered`, `errors` を検査。
- 非対応時の `supported:false` はアプリ不具合ではなく、ブラウザ側のWebMCP機能不足を示す。
- Chrome等での提供方式は変化するため、使用時点のブラウザ仕様に従って有効化すること。

## 公開ツール一覧
| 名前 | 引数 | 効果 |
|---|---|---|
| `mixamo_list_patterns` | `query?`, `limit?` | 既存パターン検索・登録有無 |
| `mixamo_list_imported_fbx` | なし | `GET /api/manifest` のFBX/マッピング一覧 |
| `mixamo_select_pattern` | `id` (1始まり) | UIでパターン選択 |
| `mixamo_search_favorites` | `query?` | お気に入り検索 |
| `mixamo_get_chain` | なし | 編集中チェイン取得 |
| `mixamo_add_selected_to_chain` | なし | 登録済みの選択パターンのみ追加 |
| `mixamo_add_clip_to_chain` | `name` | 登録済みFBX名称の追加 |
| `mixamo_reorder_chain` | `from`, `to` (0始まり) | チェイン並べ替え |
| `mixamo_play_chain` | なし | 連結プレビュー再生 |
| `mixamo_save_project` | なし | 保存し既存APIから結果取得 |
| `mixamo_get_project` | なし | プロジェクト・履歴取得 |
| `mixamo_undo` | なし | 編集履歴を1つ戻す |
| `mixamo_redo` | なし | 編集履歴を1つ進む |
| `mixamo_export_vmd_job` | なし | 変換ジョブJSONの作成（VMD生成実行ではない） |
| `mixamo_set_search` | `query` | UI検索欄更新 |

全ツール `inputSchema` は JSON Schema形式。実行結果は `{content:[{type:"text",text:"...JSON..."}]}` として返す。異常時は `isError:true` とJSONエラーメッセージ。

## 基本的な呼び出し順
1. `mixamo_list_imported_fbx` で登録済みを確認。
2. `mixamo_list_patterns` で候補と`registered`を確認。
3. `mixamo_select_pattern({id:...})` → `mixamo_add_selected_to_chain({})` または `mixamo_add_clip_to_chain({name:"Kip Up"})`。
4. `mixamo_get_chain` で順番確認 → `mixamo_play_chain`。
5. `mixamo_save_project` で編集結果を保存。
6. VMD変換は `mixamo_export_vmd_job` の後に別途Blender処理、PMX上で実機検証する。

## 安全性・制限
- AI用に任意OSコマンド実行や任意ファイル読み取りの機能は公開していない。
- サーバーは127.0.0.1に限定して使うこと。外部公開は想定しない。
- FBX登録はUI/既存APIで行う。WebMCPにはローカルパスからの無制限アップロードツールを用意していない。
- この初版は**お気に入りの新規保存・削除およびチェイン全消去をWebMCPへ公開しない**。変更操作はプロジェクト保存・Undo/Redoを使用。
- WebMCP経由でのチェイン追加や順序変更は画面の既存の実装を呼び出す。PMXモデル差によるモーション変換精度は保証しない。
- WebMCPはAIが3D描画を視覚的に検証したことを意味しない。
- 本版の `mixamo_save_project` と `mixamo_export_vmd_job` は既存UIイベントを再利用するため、非同期完了判定は簡易的。長時間処理の完全な成功保証には専用APIの追加が必要。

## Codexへの引継ぎ
1. `webmcp.js` を確認して、WebMCP対応ブラウザのインスペクタで登録ツールを確認。
2. 既存の `server.py`, `index.html`, `data/` を保持。
3. 既存のプロジェクト・FBX・favoritesをバックアップしてから更新。
4. 将来的にPlaywright + ブラウザ実機検証を追加し、ツール呼出し後にUIとデータの一致を確認。
5. CLI向けの通常MCPが必要になった場合は別途 stdio/SSE等のブリッジを開発する。

## テスト境界
- 構文検査は `node --check webmcp.js`。Pythonは `python -m py_compile server.py`。
- APIの疎通、WebMCPブラウザ内登録、実際のFBX→VMD再生成功はそれぞれ独立に検証すること。
- 標準ブラウザでWebMCPがない場合のフォールバックを確認。
