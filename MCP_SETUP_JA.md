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


## 追補（2026-11-05）：v0.5の限定MP4出力

mcp_server.py に bai_studio_render_ で始まる完成MP4用ツールを追加した。標準MCPクライアントはMIXAMO_VIEWER_URLで接続先を指定できる（既定は127.0.0.1:8765、localhostのみ）。In/Outのrevision、配置のrevision、3Dを含める場合のscene_revisionを確かめてからジョブを開始する。ジョブIDで完了を確認し、成功後にfile_linkのURLからMP4を取得する。詳しい呼出し順と検証範囲は [v0.5の出力MCP記録](docs/v05/RENDER_MCP_20261105_JA.md)。

LIP-001の元VMD合成候補は `bai_studio_lip_adoptions_get` で採用revisionを読み、既存の場面・動作計画ツールで取得したrevisionとともに `bai_studio_lip_composite_candidate_create` へ渡す。`dry_run` はファイルを作らない。結果の `downloadUrl` は取得時に再照合される。呼出し順と未検証範囲は [合成候補MCP記録](docs/v05/LIP001_COMPOSITE_MCP_20261105_JA.md)。

## 追補（2026-11-05）：LIP-001のSRTから採用まで

SRT原本のBase64バイト取込、読み、候補、下書き、別名モーフVMD作成、明示採用/解除/Undo/Redoを `bai_studio_` ツールでv0.5の保存APIへ接続した。任意のローカルパスは受け取らない。ツール名・revisionの呼出し順・試験と未検証は [LIP-001 MCP記録](docs/v05/LIP001_WORKFLOW_MCP_20261105_JA.md)。


## 2026-11-06 v0.5の実クライアント検証

公式`@modelcontextprotocol/client` 2.4.0のSTDIOクライアントと、Chrome 156のネイティブWebMCPから、同じ作品の約229.53秒・102MBのMP4出力と、別版作成/明示置換/旧版復元を確認した。標準MCPの接続設定例はそのまま使える。サーバーが通信をUTF-8へ設定するため、PythonをCP932で起動しても日本語名を受け渡せる。

`bai_studio_clip_edit`は`source_start`（元動画/音声内の秒位置）と`lane`（既存画像行ID）、`bai_studio_clip_place`は`lane`を受け取る。これらは任意指定で、元素材尺・実在行・revisionの拒否は手動UIと同じHTTP APIが行う。

開発検証では新しいdevDependencyを入れるため`npm ci`を実行する。MCPサーバー自体は引き続きPython標準ライブラリのみで動く。試験コマンド・入力hash・実機範囲は[実クライアント検証](docs/v05/NATIVE_MCP_RENDER_20261106_JA.md)。利用者のクライアント設定やAIによる自然文のツール選択は、この試験で変更/検証していない。

## 2026-11-06 完成物一覧のページ指定

`bai_studio_render_jobs_list` は任意の `completed_only`（boolean）、`limit`（1〜100）、`offset`（0以上）を受け取る。完成物を絞り込み、過去のページも取得できる。返却の `total`/`has_more`/`file_available` と `bai_studio_render_file_link` を使う。[操作・検証](docs/v05/RENDER_DOWNLOAD_LIST_20261106_JA.md)。

## v0.5画像行の追加・空行削除（2026-11-06、#80）

既存の `bai_studio_track_layout_set` は `action: "add_image_lane"` / `"remove_image_lane"`（後者は `lane` も指定）に対応する。共通入力は作品の `project_id` と最新 `revision`。従来の `order`/`heights` だけの更新も維持する。[操作・安全条件・実測と未検証](docs/v05/IMAGE_LANES_NATIVE_MCP_20261106_JA.md)。
