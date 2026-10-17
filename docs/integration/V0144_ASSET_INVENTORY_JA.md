# v0.14.4 共通素材台帳と再利用UI

## 対象
- 旧データを削除せず、`/api/assets` で既存FBX、統合GLB/VRM、MMDのPMX/VMDのメタデータを横断取得する。
- **この段階では保存バックエンドを統一しない**。旧 `/api/upload`、`/api/integrated-v02/upload`、`/api/pmx-zip-upload`、`/api/mmd-upload` のまま、読取側を統合する。
- 画面「素材管理」の下部スクロールに一覧・形式絞り込み・更新を設置。3Dプレビューは上部に固定する。
- 素材がGLB/VRMの場合は現在の3Dプレビューに読み込む。PMX/VMD/FBXは既存の専用編集画面へ移動する。選択対象の自動設定は未完成。

## API
`GET /api/assets` → `{"items":[{"id":"...","name":"...","format":"FBX|GLB|VRM|PMX|VMD","kind":"...","source":"fbx|integrated|mmd","available":true,"previewable":true}]}`

メタデータのみでバイナリは含まない。`available` は参照ファイルの存在による判定。通常のアップロードAPIは従来どおり。

## MCP
- WebMCP：`mixamo_list_all_assets`
- 標準MCP：`mixamo_list_all_assets`
どちらも `/api/assets` と同じJSONを返す読み取りツール。書き込み系の完全同等化は未実装。

## QA・既知の制約
- Python構文、JavaScript構文、HTTP 200を確認。
- 同梱素材を読み取り、登録中のPMX/VMDは未存在なら一覧に出ない。
- 再生・停止・各画面サイズでの表示・3画面独立操作はブラウザで未検証。
- FBXまたはPMX/VMD選択から対象クリップ・モデルを自動適用する一貫した導線は今後の改修対象。
- 元のデータとGit履歴は保持。フォーマット別アップロード処理の重複整理、サーバーバージョン表記修正も今後の課題。
