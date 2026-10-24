# MOTION-010 / CAM-015 作品時刻と旧カメラFPS

2026-10-24、Issue #106。v0.5作品のFPSと旧カメラファイルのFPSが違うと、作品フレームをそのまま旧カメラAPIへ渡す従来の画面追従は同じ秒数を指さない。60fps作品の4秒=作品F240を30fpsカメラへ渡すと、カメラは8秒を評価する。前段の終端保持だけでは、この終端前のずれは解消しない。

画面追従は作品の秒数を `GET /api/camera/sequence/evaluate?seconds=...&overflow=hold` に渡す。サーバーは保存されたカメラのFPSを読み、`floor(seconds * camera.fps + 0.5)` でカメラフレームへ換算する。応答に `requested_seconds`、`requested_frame`、`camera_fps` を加え、画面状態は作品フレームと実評価カメラフレームを区別する。既存の `?frame=...` と、`overflow` 未指定時の範囲外HTTP 400は保持する。負数・非有限秒・frameとsecondsの同時指定はHTTP 400とし、元カメラファイルへは書き込まない。

隔離Chromeで24fps作品と30fpsカメラを接続し、2秒で作品F48/カメラF60・X6、4秒で作品F96/カメラF120・X12、20秒で作品F480/要求カメラF600/終端F300を確認した。カメラ原本SHAは不変。別の実PMX/VMD統合試験では60fps作品の4秒で作品F240/カメラF120を画面イベント経由で確認し、90秒で作品F5400/要求カメラF2700/終端F300を保持した。ブラウザHTTP失敗0件、全身骨・表情・3F MP4の既存回帰も通過し、実PMX/VMD原本SHAは不変だった。後者の隔離ブラウザはSwiftShader、MP4ジョブはNVIDIA GeForce RTX 4070 SUPERを報告した。

試験: `node tests/run-guarded.cjs tests/studio-v05-camera-seconds.test.cjs tests/studio-v05-full-pmx-dance.test.cjs` は2件通過、0失敗・0スキップ、実データ `data` 7件と `exports` 0件の前後ハッシュ一致。追加のAPI境界を含むカメラ専用試験も単独1件通過。`python -m pytest -q tests/test_camera_sequence_tail.py tests/test_camera_focus_endpoint.py` は隔離データで4件通過。`npm run typecheck`、JS/Python構文、`git diff --check` 通過。追加試験の初期実行は空作品の非同期再生位置読込がテストの時刻イベントを上書きして失敗したため、カメラ公開APIで直接時刻を指定した。実PMX統合試験は作品イベント経由のまま維持した。

任意の旧カメラのカット構成、カメラ切替、物理ON、Linux、標準MCP実通信、Owner採用、MOTION-010/CAM-015全ACは未確認。画像・動画成果物はなくEagle登録対象なし。モデル区分：設計・実装・試験に標準モデル区分を使用。
