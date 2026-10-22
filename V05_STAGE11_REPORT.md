# v0.5 UI Overhaul 11 — 実装・検証

ブランチ: feature/v05-ui-overhaul-11
コミット: e31c975

## 今回実装
- 複数クリップの一括移動：POST /api/studio/v05/arrangement/batch-move
- 直前の一括移動の単段Undo：POST /api/studio/v05/arrangement/undo
- トラックのロック／ミュート属性の保存：POST /api/studio/v05/timeline/flags
- 同等の標準MCP / WebMCPツール登録：bai_studio_batch_move / bai_studio_batch_undo / bai_studio_track_flags_set
- 作品IDとリビジョンの確認。クリップ・トラック・時刻の入力検証。一括操作の原子的保存。

## 検証
python -m unittest -q test_v05_stage11 test_v05_track_layout test_v05_clip_edit → 18 tests OK
python -m py_compile studio_v05_arrangement.py studio_v05_track_layout.py server.py mcp_server.py → OK
node --check webmcp.js → OK

## 制限・次段階
- 複数クリップ選択UI、ロック・ミュートボタンとUndoショートカットの画面配線は未完成。
- Undoは一括移動の直前1操作のみ。Studio全体の履歴管理・Redoとは未統合。
- ロック属性は保存できるが、全ての編集エンドポイントによるロックの強制は未実装。
- MCP / WebMCPの実通信とブラウザE2Eは未実施。
- 既存エンジンの再生・レンダリングには未接続。
- 初期アーカイブ由来の大量の未コミット変更・削除は維持しており、今回コミットには含めていない。
