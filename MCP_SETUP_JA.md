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

### 2026-11-06 音声トラックのミュート

既存 `bai_studio_track_flags_set` の `muted` にある `audio` / `music` / `video` は、その行の音だけをプレビューと次のMP4へ反映する。動画の映像と元時刻は保持。最新revisionは `bai_studio_track_layout_get` から取得する。処理中の変更は次の出力へ適用し、各ジョブの `audio_settings` は開始時設定を記録する。[実行・未検証](docs/v05/TRACK_AUDIO_MUTE_20261106_JA.md)。


### 2026-11-06 動画行の追加・空行削除

既存 `bai_studio_track_layout_set` に `action: "add_video_lane" / "remove_video_lane"` を追加。project_id/revision、削除時laneを指定する。getで安定video_lane_ids/next_video_lane_idを読む。動画1は旧保存互換、最大16、削除番号非再利用、占有/最後の行/古いrevisionは拒否。既存画像action/省略更新は維持。[操作・実測・未検証](docs/v05/VIDEO_LANES_20261106_JA.md)。


### 2026-11-06 保存済み動画・音声のハサミ分割

`bai_studio_clip_split` を標準MCP/WebMCPへ追加。入力は `project_id`、`clip_id`、最新の `revision`、作品内の秒 `split_at`。元ファイルを保ち、右片の元素材開始位置を分割分だけ進める。既存の手動ハサミと同じAPI `/api/studio/v05/arrangement/clip/split` を使い、動画/音声/楽曲だけが対象。両片0.1秒以上、ロック/古いrevision/元尺超過は拒否する。後続の位置変更と再伸長は既存clip_edit。MP3は実際に復号されるサンプル数の尺で検査する。既存の保存とツール入力は保持する。[契約・再実行・未検証](docs/v05/MP3_TIMELINE_SYNC_20261106_JA.md)。


## 2026-11-07 音声・楽曲の複数行

`bai_studio_track_layout_set` の既存5actionへ `add_audio_lane` / `remove_audio_lane` / `add_music_lane` / `remove_music_lane` を追加。追加はproject_id/revision/action、削除はlaneも必須。各種最大16行、削除は空行だけ、最後の行は残す。削除番号は再使用しない。行IDはlayout_getのaudio_lane_ids/music_lane_idsを読み、clip_place/editのlaneへ指定する。同種editでlaneを省略すると元行を保持する。ロック/ミュートは音声全行または楽曲全行に作用する。旧5action/省略updateとツール数（標準128、共通Web64）は維持。

手動UIと同じ保存APIを使う。外部MCP編集を試験した後は作品を明示的に読み直した。画面の一般的な自動同期・行別音量/ミキサーの完成を示さない。[仕様・操作・試験](docs/v05/AUDIO_MUSIC_LANES_20261107_JA.md)。


## 2026-11-08 OGG・FLAC・M4A

既存の素材登録/参照、clip_place/edit/split、render_job_startへOGG(Vorbis/Opus)・FLAC・M4A(AAC)を接続。ツール名・数・保存形式は変更しない。capabilitiesのupload_formatsと共通の登録検査が正本。新形式の実尺もmedia-infoで確認し、種類/偽装/破損・元尺超過は理由付き拒否。全codec/ブラウザー/クライアントの保証ではない。[契約と試験](docs/v05/AUDIO_FORMATS_20261108_JA.md)。


## 2026-11-08 静止画像の出力可否

既存assets/capabilitiesの `mp4_image_formats` はMP4画像形式の読取専用一覧（出力側IMAGE_EXTを正本とする）。素材詳細は登録/プレビューと出力可否を区別する。GIF/AVIF/EXR等を含む保存作品の出力は、欠落させず理由付き拒否。標準MCPとネイティブWebMCPの拒否を確認した。WebMCPのrender_job_startだけはサーバーのerror文字列（最大600文字）をHTTP状態へ添え、非JSONはHTTP状態だけを維持する。他ツールとツール数/入力schemaは変更しない。[仕様・試験](docs/v05/IMAGE_FORMATS_20261108_JA.md)。


## 2026-11-08 既存素材capabilityと動画配置理由

既存assets/capabilitiesへ読取専用mp4_video_formatsを追加（正本は出力VIDEO_EXT）。UIはブラウザー再生と出力対応を分けて案内する。ツール数・引数・登録形式は増やさない。動画映像のない素材/カバー画像だけのMP4は共通media-info/配置/出力サービスで拒否。既存WebMCP bai_studio_clip_placeのみ、出力ジョブと同じ限定error本文処理でHTTP番号に理由を加える。SDK/ネイティブ/手動UIで保存不変を確認。旧MOV出力は未対応を明示。詳細 docs/v05/VIDEO_FORMAT_POLICY_20261108_JA.md。


## 2026-11-09 新規MP4のAAC目標値

既存render_capabilitiesのaudio_bitrate=320000、新規render_jobのaudio_bitrateへ開始時の値を固定し、UI/標準MCP/WebMCPは同じ既存APIで使用する。新しいツール/引数/音量操作は追加しない。旧履歴にフィールドが無い場合は旧値を推測で表示しない。元音量と時計を保持し新規出力だけ作用する。詳細 docs/v05/AAC_320K_BOUNDARY_FIX_20261109_JA.md。
