# 枝番05：スナップショットの事前確認と明示的な復元

- `GET /api/studio/v05/project/activation-preview?id=...`: 変更の有無・現行のrevisionを読み取り専用で提示。
- `POST /api/studio/v05/project/activate`: `{id, expected_revision, confirm:true}` の要求が必要。revisionが一致しなければ409を返し、何も変更しない。
- 復元前に現行組み合わせ・カメラ・ワークスペースのスナップショットを `data/studio_v05_activation_backups/` にfsyncして保存。
- 復元対象は旧統合bundleが表す組み合わせ／カメラ／ワークスペースのみ。全素材・オーディオ・レンダー・シーンを含めた完全復元ではない。
- 旧 `save_bundle` は複数ファイルの電源断時原子性を保証しない。エンジンのメモリ内状態を完全に差し替えるE2Eは未検証。復元後に編集画面の再読み込みが必要になる可能性がある。
- 標準MCPとWebMCPへ `bai_studio_project_activation_preview` と `bai_studio_project_activate` を登録。同じHTTP APIを使用。
- 実通信（MCPクライアント⇔実アプリ）とブラウザE2Eは未実施。実装と単体テストを混同しない。
