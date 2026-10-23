# v0.5 枝番24 実装報告
- ブランチ: feature/v05-ui-overhaul-24
- 設計コミット: 778c27d （複数モデル3Dプレビュー・マスタータイムライン同期、未実装）
- 実装コミット: 5ffae45 （既存の再生位置GET APIを周期照合し外部更新を既存画面に反映）
- 対象: studio/v05/js/remote-playhead-v24.js と asset-workflow-v06.js
- 標準MCP/WebMCP: 既存の bai_studio_playhead_set を介した保存API変更をブラウザのGET照合で反映。新規ツールの重複実装は不要。実通信試験は未実施。
- 検証: node test_v05_remote_playhead_v24.cjs (10), node test_v05_persisted_seek_v23.cjs (8), node --check 成功。
- 制限: 通知方式はWebSocketでなく2秒ごとのポーリング。画面が非表示の時は問い合わせ停止。MCP/WebMCP実通信、WebGLモデル実描画、ブラウザE2Eは未実施。
- 留意点: 元の大量の未コミット変更は意図的に保持。Gitの原本ブランチを改変していない。
