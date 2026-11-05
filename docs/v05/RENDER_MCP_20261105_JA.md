# v0.5完成MP4のWebMCP・標準MCP接続（2026-11-05）

対象：ロードマップ順3、Issue #39/#63/#81、RENDER-006。手動の出力画面と同じ /api/studio/v05/ のHTTP APIに接続した。MCP専用の書出し経路や新しい保存形式は作っていない。

## 公開した操作

| 操作 | 両MCPのツール名 | 共通API |
|---|---|---|
| encoder・3D制約 | bai_studio_render_capabilities | GET render/capabilities |
| In/Out取得・保存 | bai_studio_render_range_get / bai_studio_render_range_set | GET/POST timeline/range |
| 同名版名の確認 | bai_studio_render_name_preview | GET render/name |
| 完成物一覧・ジョブ取得 | bai_studio_render_jobs_list / bai_studio_render_job_get | GET render/jobs |
| MP4生成開始 | bai_studio_render_job_start | POST render/jobs |
| 旧版の復元 | bai_studio_render_restore | POST render/restore |
| 完成MP4へのリンク | bai_studio_render_file_link | GET render/jobs → GET render/file のURL |

v0.5の画面は webmcp.js を読み込み、document.modelContext に対応するブラウザでは bai_studio_ で始まるツールだけを登録する。旧トップ画面では従来どおり全ツールを登録する。標準MCPは mcp_server.py をクライアントから起動し、MIXAMO_VIEWER_URL で指定したローカルHTTPサーバーを使う（既定127.0.0.1:8765）。2つのMCPは互いのクライアント接続を共有しない。

## 呼出し順と版の保護

1. 作品IDを決め、arrangement と範囲の revision を取得する。必要なら範囲を保存する。
2. capabilities を確認し、scene instances に表示中の3Dがあれば scene_revision を含める。3Dがあるのに省くとサーバーが拒否する。
3. 同名のMP4がある場合は name preview で現在のジョブIDと新版名候補を取得する。既定の version は新しい版を作る。置換する場合は collision_mode=replace と直近の replace_job_id を明示する。
4. job start はすぐにジョブIDを返す。job get で succeeded / failed / interrupted まで確認する。succeeded のときだけ file link を取得する。リンク先のGETは完成ファイルの存在・長さを再検査する。
5. 旧版の復元には name preview の revision、current_job_id、復元対象job_idを指定する。旧版ファイルは残り、押し出された現行版も履歴に残る。

## 隔離試験

tests/studio-v05-render-mcp.test.cjs は、別ポートの一時データサーバーに1枚の画像を登録して1FのMP4を作る。標準MCPを実際のJSON-RPC STDIOサブプロセスから、WebMCPをブラウザ内の registerTool 互換スタブから呼んだ。v0.5 HTMLのスクリプト参照と、v0.5 URLでのstudio専用登録も確かめた。

標準MCPから最初のMP4を開始し、WebMCPでジョブ・リンクを確認。WebMCPから同名置換を開始し、標準MCPの一覧で旧版/現行版を確認。標準MCPから旧版を復元し、WebMCPの一覧と旧版MP4のバイト不変を確かめた。MP4ヘッダは ftyp。1成功、0失敗、0スキップ。run-guarded による data 5ファイルと exports 0ファイルのhashは前後一致した。最初の試験は編集中UIの追加リソース取得で ERR_NO_BUFFER_SPACE が出たため、WebMCPの通信経路だけをv0.5と同じURL階層の軽量ページで隔離した。製品の出力失敗ではない。

## 残る確認

WebMCPを実装した実ブラウザでのネイティブ呼出し、複数クライアントの競合、Windows以外、実素材の長尺・3D出力をMCPから開始する試験は未実施。標準MCPのクライアント設定と起動も、この試験ではJSON-RPC STDIOを直接使って確認した範囲に限る。RENDER-006全体と順3は未完了。
