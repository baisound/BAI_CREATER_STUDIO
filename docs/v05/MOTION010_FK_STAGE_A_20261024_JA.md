# MOTION-010 PMX＋VMD限定FK補正の接続記録

2026-10-24、Issue #106。詳細設計の段階Aのうち、作品に登録済みのPMX＋VMDに対する骨の**ローカルFK回転差分**を数値で仮表示・保存する経路を接続した。`MOTION-010`全体の完了、段階Aの全操作の完了、Owner採用を示す記録ではない。

## 今回つながった経路

- 同じv0.5の3Dプレビュー内の「リグ：PMX骨のFK回転補正」から、対象インスタンス・作品フレーム・PMX実骨・X/Y/Z度差分を指定する。仮補正はメモリ内だけに適用し、Escまたは破棄で戻す。［このFをキー化］で初めて保存する。オートキーは作らず、キー化を明示操作とした。
- `data/studio_v05_motion_edits/<project-id>.json`へ作品別の別データとして保存する。PMX/VMD原本は読取のみ。キーは整数の作品フレーム、PMX骨名、ローカル正規化四元数。最初のキーを作ると対象インスタンスとVMDクリップだけのFKレイヤーを作る。同一骨のキー間は四元数Slerp、キー外は端のキーを保持する。重みは現段階では100%固定で、編集UIはまだない。
- 保存層にモデル・VMDの素材IDとSHA-256、作品FPS、クリップ開始と長さを固定する。作品・対象クリップ・実PMX骨・VMDに載せられるShift_JIS 15バイト名・クリップ内フレーム・有限/正規化四元数・インスタンスロック・件数をサーバーで検査する。原本や配置が変わると層を無効と表示し、再適用/上書きを拒む。破損した正本を空データへ置き換えない。
- 同じREST APIを手動UI、ブラウザーWebMCP、標準MCPへ公開した。`GET /api/studio/v05/motion-edits?id=...`と改訂付き`POST`の`set/remove/undo/redo`。競合は409。1操作につき1履歴、Undo/Redo上限80。
- Three.js 0.160.1のVMD評価後、PMX IK/grant前に差分を入れる。補正のない既存経路はそのまま残す。プレビューと3Dキャプチャは同じ保存revisionを読む。フレーム書き出しの開始/終了で補正revisionと原本一致状態を確認し、途中変更は失敗にする。

## 実行した確認

`BAI_REAL_MMD_DATA=<既存data>`、`CHROMIUM_PATH=<Chrome>`、`BAI_TEST_CONCURRENCY=1`を指定し、`node tests/run-guarded.cjs tests/studio-v05-pmx-pose-evaluator.test.cjs tests/studio-v05-pmx-fk-edit-real.test.cjs tests/studio-v05-real-pmx-vmd.test.cjs` は3/3成功。原本を含む利用者`data/` 7ファイルと`exports/`は前後ハッシュ一致。実PMXの頭骨に15度の差分を仮表示→破棄→保存→再読込→Undo→Redoし、F240で四元数差分0.130033394、無関係のセンター骨差分0。保存後の320×180 PNGキャプチャも同じ頭骨姿勢。別作品への漏出なし、古いrevisionは409、未知骨・クリップ範囲外は422、インスタンスロックは409、隔離コピーのPMX内容変更後は層を無効にして409。PMX原本SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`、VMD原本SHA-256 `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234` は前後一致。

`node --test tests/studio-v05-scene-mp4.test.cjs` は3/3成功。既存GLB/PMXのMP4と撮影視点の回帰で、実PMXのMP4経路はRTX 4070 SUPERのDirect3D11レンダラーを報告した。この3件は**FK補正を保存したMP4の画素差までは検査していない**。新FK試験のブラウザー表示はSwiftShader。`npm run typecheck`、Python構文確認、標準MCPのツール重複/登録確認、`git diff --check`は成功。

`python -m pytest -q tests/test_studio_v05_motion_edits.py` は4/4成功。未作成正本の非書込、未知作品の拒否、壊れたJSON・作品不一致・余分なフィールドの原本byte保持を確認した。初回sandboxの一時領域作成は拒否されて起動せず、通常の一時領域で再実行した。

初回の新FK試験はUndo時刻をキー編集欄から取る実装で、F4の表示がF0へ移る不具合を検出して修正した。再試行時のChrome `ERR_NO_BUFFER_SPACE` は画面エラー監視で失敗扱いにし、最終試験では発生せず通過した。既存PMX/VMD試験の再読込時には、骨読込完了と補正・表情適用完了の間で表情値を読んで0となる競合を検出した。プレビュー全体の`ready`を追加し、キャプチャもその状態を要求してから上の3件を再実行した。

## 続く実装と判定

レイヤー名/重み/有効区間/なじませ/ミュート/ソロ/順序の編集、補正キーの作品タイムライン表示と移動、階層アウトライン、3D回転ギズモ、FK/IK切替、位置チャネル、手足の3D IK、VRM、長尺90秒A/B、別名VMD書き出しと往復誤差、FK補正入り**完成MP4の画素比較**、WebMCP/標準MCPの実呼出し、Linux、実GPU上のFK補正動作、Owner採用は未完了または未検証。現時点で`MOTION-010`を完成に昇格しない。
