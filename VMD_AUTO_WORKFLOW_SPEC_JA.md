# MCP→Blender→VMD→PMX 自動ワークフロー仕様 (実験版)

## 目的
Codex / Claude Code から `mixamo_export_vmd_job` → `mixamo_run_vmd_conversion` を実行し、生成したVMDをローカル登録してブラウザのPMXタブで再生指示を送る。

## 接続手順
1. Blender 4.x（または既存のFBXインポートAPIが使える対応版）をインストールし、`blender` にPATHを通す。必要なら `MIXAMO_BLENDER` にBlender実行ファイルを指定する。
2. `起動.bat` または `start.sh` でビューアサーバーを起動。ブラウザの `http://127.0.0.1:8765/` でPMXモデル（AまたはB）を保存・表示しておく。
3. MCPの `mixamo_get_project` と `mixamo_get_conversion_map` で状態を確認。空のボーン対応表は事前に設定する。
4. MCPの `mixamo_export_vmd_job` でジョブJSONを作る（現行では既存の登録済みFBXファイル名の検証を実行）。
5. 明示的に承認して `mixamo_run_vmd_conversion` を `{ "confirm": true, "slot": "A" }` で呼ぶ。
6. API側でBlenderを同期実行し、VMDヘッダー・終了コードを検査。成功時に `data/mmd/vmd/chain_motion.vmd` にコピーして `data/mmd_assets.json` に登録し、ブラウザへ `preview_vmd` 指示を送る。
7. `mixamo_conversion_status` で実行結果を確認。PMXモデルが読み込まれていれば画面のVMD再生ボタンを経由して再生する。**実際のリターゲティング品質は人が目視確認する。**

## API
- `POST /api/run-vmd-conversion` JSON `{ "confirm": true, "slot": "A" }` ：Blender変換・VMD登録・再生コマンド。Blender実行は最大240秒でタイムアウト。ほかの変換と排他。
- `GET /api/conversion-status` ：最終実行結果（idle/running/succeeded/failed）
- `GET /api/mmd-assets` ：VMDの登録を確認。
- `GET /api/sync` ：preview_vmdコマンド反映を確認。

## 安全策・既知の限界
- Blenderに渡すジョブは登録済みFBXパスと固定出力先であることを検証する。モデルデータ自体は信頼できるソースから取得すること。
- `chain_motion.vmd` は毎回更新される固定名。履歴保存が必要なら生成前に複製すること。
- 現行Blender変換器は基準姿勢・軸差・IK・物理演算を完全には解決しない。MMDでの実用品質を保証しない。
- ブラウザの実描画確認を自動判定する機能は未実装。PMX未ロードの場合は自動プレビューできない。
- Blenderが存在しない場合はHTTP 503。ジョブ未作成の場合は400。変換失敗時は422。いずれも成功と見なさない。
- ファイルとプロジェクトデータはGit追跡対象外。Gitコミットはソースコードのみを対象にする。
