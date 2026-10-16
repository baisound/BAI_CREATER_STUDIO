# Codex / Claude Code 標準MCP接続仕様（STDIO）

WebMCP（`webmcp.js`）はそのまま維持。通常のMCP用に `mcp_server.py` を追加した。Python 3.9以降の標準ライブラリのみ使用。MCP 2024-11-05、STDIO(JSON-RPC 2.0、1行1JSON)方式。接続先は `127.0.0.1:8765` のローカルHTTP APIのみ。AIエージェントからブラウザUIのボタンを直接クリックする機能ではない。

## 起動

1. `起動.bat` または `./start.sh` でMixamoビューワーのHTTPサーバーを立ち上げる。
2. MCPクライアント側で `mcp_server.py` を実行するコマンドを登録する。MCPプロセス自体を独立して常駐起動する必要はなく、クライアントがSTDIOで起動する。

### Claude Code

展開先ディレクトリで実行：

```sh
claude mcp add mixamo-viewer -- python3 "$(pwd)/mcp_server.py"
```

Windowsでは `python3` を `python` または `py -3`（環境に応じて）へ変更し、絶対パスを指定する。

### Codex

`~/.codex/config.toml` の例（実際のパスへ書換える）：

```toml
[mcp_servers.mixamo_viewer]
command = "python3"
args = ["/absolute/path/to/Mixamo_Fighting_Viewer_Local/mcp_server.py"]
```

Windowsなら `command = "python"`、`args = ["C:\\...\\mcp_server.py"]` など環境に合わせる。設定編集後はCodexを再起動し、ツール一覧を確認。

## MCPツール

| ツール名 | 機能 |
|---|---|
| mixamo_health | HTTPサーバーへの接続確認 |
| mixamo_list_patterns | 収録パターン検索（同梱MOTION_CATALOG_50.jsonを参照） |
| mixamo_list_fbx | FBXと名称マッピング取得 |
| mixamo_list_mmd_assets | PMX/VMD/テクスチャ登録一覧 |
| mixamo_get_project | 保存済み制作状態・履歴取得 |
| mixamo_get_favorites | タグ付きお気に入り検索 |
| mixamo_get_conversion_map | ボーン対応表取得 |
| mixamo_add_clip | 登録済みモーション追加 |
| mixamo_remove_clip | 任意ステップ削除 |
| mixamo_reorder_clip | ステップ順序変更 |
| mixamo_save_favorite | 保存済みタイムラインをお気に入り登録 |
| mixamo_set_conversion_map | ボーン対応表の全置換 |
| mixamo_export_vmd_job | VMD変換用のBlenderジョブを生成 |

編集操作はビューワーの `/api/project` の保存済み状態を更新する。**ブラウザが開いたままの場合、画面内の編集状態は自動同期しない。** 保存済みデータを再読込して確認すること。複数クライアントの競合は未処理。`mixamo_set_conversion_map` は全置換のため、AIは事前に既存マップを確認すること。VMDジョブ生成はVMD出力そのものではなく、Blender実行とPMX上での検証が必要。

## セキュリティ・制約

- MCPクライアントはローカルユーザーと同等の編集権限を持つ。信頼できるローカルエージェントにのみ登録。
- FBXのアップロードは現行のMCPツールでは非対応（既存Web UIまたはAPI経由）。
- ファイル削除のMCPツールは公開していない。登録されたFBXとPMXはそのまま保持。
- `MOTION_CATALOG_50.json` は50件の参考データ。現行UIの全82件を保証しない。
- WebMCP未対応ブラウザでも標準MCPツールは動作可能。
- ローカルサーバーを閉じるとMCPからのAPI呼び出しは接続エラーになる。
