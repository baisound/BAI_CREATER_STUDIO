# BAI Creator Studio v0.5 — 枝番54 実装報告

## 目的
前段階の一括取り込みを拡張し、参照・コピー、SHA-256重複検出、同一内容に限った再リンク、パス制限を実装する。既存の素材アップロードとキャラクター読み込み機構は変更しない。

## 新規・変更
- studio_v05_asset_sources.py：参照素材台帳、登録、コピー、再リンク、内容照合、安全な相対パス。
- server.py：GET /api/studio/v05/asset-sources、POST /api/studio/v05/asset-sources/register、POST /api/studio/v05/asset-sources/relink、GET /api/studio/v05/asset-source/file/<id>。
- studio_v05_arrangement.py：v05sourceを既存のカテゴリ検索へ追加。
- studio/v05/js/asset-references-v54.js：参照・コピー・再リンク操作と一覧表示。言語変更時にラベルを更新。
- studio/v05/locales/jp.json / en.json：表示文字列。
- mcp_server.py / webmcp.js：bai_studio_asset_sources_get / bai_studio_asset_source_register / bai_studio_asset_source_relink。
- test_v05_asset_sources_v54.py：安全性・永続性・重複検出テスト。

## 使い方
1. サーバーのデータディレクトリ（BAI_DATA_DIR、未設定ならプロジェクトの data）に `asset_inbox` を用意し、対象ファイルを入れる。
2. v0.5の素材画面の「素材の参照・コピーと再リンク」で `music/theme.wav` などの相対パスを入力する。
3. 既存ライブラリ対応形式と種類を選ぶ。参照（元ファイルを保持）またはコピー（内部ライブラリへ登録）を選択する。
4. 内容ハッシュが既登録と一致すると重複登録せず既存IDを返す。
5. 参照元を移動した際は、新しいパスに**同じ内容のファイル**を用意して再リンクする。

## 安全性
- API経由で任意のWindows絶対パス、相対パスの `..`、シンボリックリンク、許可フォルダ外のファイルを読み込まない。
- 再リンクはSHA-256および容量一致のときだけ受け付ける。
- 登録台帳は既存の原本から分離し、アトミックに保存する。破損した台帳は上書きしない。
- コピーは既存の `library_assets.register_stream` とファイルヘッダ検証を再利用。
- 参照ファイルの提供時に内容ハッシュを再検査する。
- 参照元が消失した場合は「利用不可」とし、登録記録は保持する。
- 通常のブラウザアップロード（枝番53）と今回のサーバー側ステージング登録は異なるワークフロー。

## 制限
- VRM、FBX、PMX、VMD等の一括登録は既存のライブラリAPIの形式制限により今回の対象外。
- この段階で実モデル読込・リターゲティング・動画書き出しが完成したわけではない。
- WindowsでのBAT起動・ブラウザ操作E2E・標準MCP/WebMCPの実プロトコル通信は未検証。
- パス参照はサーバー側 `asset_inbox` 以下に限定。任意のローカルフォルダを指定する機能は実装していない。

## 検証
- Python `test_v05_asset_sources_v54.py`、`test_v05_asset_import_v53.py`：10件成功。
- `python -m py_compile` 対象コード：成功。
- `node --check` 対象JavaScript：成功。
- localhost実HTTPスモーク：参照登録（revision 1）、再リンク（revision 2）、検索（count 1）、ファイル取得（HTTP 200）成功。
- GitとZIPの検証結果は本ZIP化後の成果物確認で記録。

## 次工程
枝番55：実3Dモデル読込と素材のシーン配置・表示の統合。既存実装と重複するコードを増やさない。
