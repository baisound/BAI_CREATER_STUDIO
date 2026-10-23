# v0.5 実PMX表情・口モーフ時刻キー（Issue #96）

## 利用者に見える範囲

同じ作品の3DプレビューでPMXモデルを選ぶと、読み込んだ実PMXに存在するモーフ名から表情・口を選べる。作品の共通シーク位置を時刻欄へ入れ、0〜1の強さを保存する。保存済みキーは選択して値を直すか削除できる。原PMX・VMDは書き換えない。

キーは`scene/instances`の作品別revision付き`face_keys`に保存する。従来ファイルにこの欄が無くても空配列として読む。シーンモデルを削除したとき、そのインスタンスのキーを一緒に除く。古いrevision、ロック済みモデル、範囲外値、登録PMXにない名前を保存APIが拒否する。登録原本が欠けても、孤立キーの削除はできる。

共通時刻のシークでは、まず既存のVMD/動作を評価し、その後に保存表情キーを適用する。最初のキーより前は元の動作の顔を使う。キー間は線形補間し、最後のキー以降は値を保持する。限定MP4の各3Dフレームも同じ順序で評価する。保存キーが実モデルから消えていれば出力を止め、顔だけ抜けた完成品を作らない。原素材のhash検査と720p・300F上限は既存の書き出し契約を継続する。

## 検証

- `python -m pytest -q test_v05_scene_instances_v57.py`: 8件成功。旧データ読み込み、保存/削除、revision競合、無効時刻・値、存在しないモーフ名、モデル削除時のキー整理。
- `npm run typecheck`、Python/JS構文、JSON構文、`git diff --check`: 成功。
- `BAI_REAL_MMD_DATA=<既存data> BAI_TEST_CONCURRENCY=1 node tests/run-guarded.cjs tests/studio-v05-real-pmx-vmd.test.cjs tests/studio-v05-scene-mp4.test.cjs`: 隔離Chromeで4件成功。実PMXのモーフ168名を確認し、UIから「まばたき」を0秒0・4秒1で保存、2秒0.5と4秒1を観測。再読込後も4秒1。同じF120のプレビューは160×90デコード済み画素で3,399画素、F240の限定MP4は1280×720で4,289画素が閾値5超で変化した。存在しない名前と古いシーンrevisionはAPIで拒否。3D入りGLB/カメラ既存試験も成功。
- PMX原本SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`、VMD原本SHA-256 `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234` は試験前後で一致。`run-guarded`の`data` 7件と`exports`も一致。
- MP4試験の描画器はNVIDIA GeForce RTX 4070 SUPER / ANGLE D3D11。プレビュー試験はSwiftShader。試験MP4とフレーム画像は隔離一時領域のみで、利用者向け動画成果物には昇格していない。

## 残る範囲

モーフ値の専用可視タイムライントラック、複数キーのドラッグ、Undo/Redo、視線骨、感情同期、SRT/音素からの自動リップ、頂点変位の定量解析・母音強度最適化、物理表情、長尺出力は未接続。WebMCPと標準MCPは同じrevision付き保存APIのスキーマを提供するが、実運用接続は未検証。Linuxと他のPMXモデル、全区間の音画1F以内同期も未検証。LIP-004/LIP-009の全体を完成扱いしない。

この工程はアプリ内の既存PMXモーフ値のみを扱い、Blenderモデル制作の骨・ウェイト・スキニングは変更しない。
