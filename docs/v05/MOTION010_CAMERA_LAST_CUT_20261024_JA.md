# MOTION-010 / CAM-015 末尾カットの終端保持

2026-10-24、Issue #106。30fps旧カメラの末尾に半開カット `[240,300)` があると、カメラF299ではそのプリセットを表示するが、F300では半開区間を外れて元キー姿勢に戻る。v0.5長尺作品で前段追加の `overflow=hold` を指定しても、F300を保持していたため、末尾カットから元キーへの不連続が発生した。

画面追従用の `overflow=hold` に限り、最後のカットがカメラdurationで終わる場合は、duration到達以後に最後の可視整数フレーム `duration-1` を評価する。応答は実評価F299、要求F300またはF600、`held_at_end:true` を区別する。厳密な `?frame=300` は従来どおり元キー姿勢、範囲外はHTTP400。末尾カットがない既定カメラでは従来どおりF300を保持し、カメラ原本のキー・カット・durationへ書き込まない。

隔離Chromeの24fps作品から、作品F239/240/480（約9.96/10/20秒）を試した。保存済み旧30fpsカメラでは要求F299/300/600に対し、画面で見える姿勢は一貫して末尾カットのF299で、F300以降は保持表示となった。カメラ同期イベントとHTTP評価の姿勢・プリセットを照合し、厳密APIのF300は元キー姿勢のままであることと、原本SHA不変を確認した。

最初のPython回帰試験は期待どおりF300を返して失敗し、修正後 `python -m pytest -q tests/test_camera_sequence_tail.py test_bai_camera.py test_camera_sequence_ui.py` は16件通過。`node tests/run-guarded.cjs tests/studio-v05-camera-seconds.test.cjs` は隔離Chrome3件通過、0失敗・0スキップ。実データ監視は `data` 7件、`exports` 0件の前後ハッシュ一致。`npm run typecheck`、Python/JS構文も通過。

この試験はカメラ姿勢APIと画面イベントまでの確認で、PMX付きの撮影プレビュー実ピクセル、MP4中のカット、カット編集UI、任意カット構成、Linux、標準MCP実通信、Owner採用、MOTION-010/CAM-015全ACは未確認。画像・動画成果物はなくEagle登録対象なし。モデル区分：調査・実装・試験に標準モデル区分を使用。
