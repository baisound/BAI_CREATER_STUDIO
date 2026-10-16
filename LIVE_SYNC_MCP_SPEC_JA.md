# MCP ⇄ ブラウザ双方向同期 仕様書

## 概要
ローカル `server.py` を共通保存先にし、MCPが変更した `data/project_state.json` をブラウザが約1.2秒周期で検出します。ブラウザ内の通常編集は従来のAPIでサーバーに保存され、MCPは次の読み取りで反映できます。同期番号は `data/sync_state.json` に永続化されます。

## API
- GET `/api/sync`: `{revision, commandId, command}` を返す。
- POST `/api/sync-command`: `play_chain`, `stop_chain`, `preview_motion`（name指定）, `open_pmx`, `refresh_assets` のいずれかを要求。
- POST `/api/project`: JSON保存成功時に revision をインクリメント。
- GET `/api/project`: 制作状態を取得。

## 新規MCPツール
- `mixamo_sync_status`: 同期状態を取得。
- `mixamo_play_chain`: **開いている**ブラウザへ再生要求。
- `mixamo_stop_chain`: 再生停止。
- `mixamo_preview_motion`: 名前からプレビュー選択要求（UI側一致候補のみ）。
- `mixamo_open_pmx`: PMXタブを開く。
既存の13ツールと合わせて18ツールです。VMDジョブ作成は `mixamo_export_vmd_job`。これはBlenderを起動・VMDを生成するツールではありません。

## 制限事項と安全性
- ブラウザは開いている必要があります。再生要求は操作コマンドの最終1件を保持するため、ブラウザを閉じている間の連続コマンドは蓄積されません。
- プロジェクト編集の同時書き込みに対するCAS/楽観的ロックは未実装。AIと人間が同時編集すると後勝ちになる場合があります。重要な制作状態は事前に保存してください。
- 連結再生は既存ビューワーのアルゴリズムを使用。3Dモデルの骨格差、PMXへの自動リターゲティング、IK調整は今回追加していません。
- PMX確認はPMXタブの切替まで。VMDの自動生成・ブラウザでの自動検証、成功判定は含まれません。
- MCPはSTDIO、HTTP APIは原則ループバックのみで外部公開しないでください。

## Codex/Claude Code向け検証
1. 起動BATまたは `start.sh` でアプリ起動、ブラウザで開く。
2. MCPの `mixamo_sync_status` で `revision` を取得。
3. `mixamo_add_clip` で登録済みモーションを追加。
4. ブラウザ右サイドのリストが更新されたことを目視確認。
5. `mixamo_play_chain` で再生、`mixamo_stop_chain` で停止。
6. ブラウザから変更した後、MCPの `mixamo_get_project` へ反映されたか確認。
7. `mixamo_export_vmd_job` でジョブJSON作成後、Blenderは別途実行し、PMX上で結果を手動検証。
