# 制作状態・履歴の開発者仕様

- `GET /api/project` は `data/project_state.json` を返します。未保存なら `{}`。
- `POST /api/project` はUTF-8 JSONを保存。3MiB、schema=1、timeline最大300件、history最大120件。原子的に保存。
- 保存データは `schema,title,timeline,history,cursor,selected,playbackSpeed,updatedAt`。
- timeline要素は少なくとも `{"name":"Mixamo英語モーション名"}`。履歴は `label,at,timeline,selected,playbackSpeed`。
- コンビネーション追加、削除、並び替え、全消去で履歴自動記録、約450msのデバウンス自動保存。
- 保存ボタンは即時保存。読み込みは最後に永続保存された状態を読み直す。戻す・やり直し・指定履歴復元で現在のタイムラインを置き換える。
- **FBXやPMXバイナリ自体はプロジェクトJSONに格納しない**。従来の`data/files/`と`data/mmd/`に保持。JSONだけを他PCへ持ち出してもモデルは転送されません。
- 現在の履歴対象は**コンビネーション編集**。PMX読み込み操作やFBXモデル変更、カメラ座標、VMD再生時刻については履歴対象外。
- この段階のプロジェクト管理は単一ローカルプロジェクトのみ。複数名保存や分岐バージョン管理は未対応。
- サーバーのAPIはローカルホストのみ接続。複数タブ同時編集時の競合解決機能は未実装。
