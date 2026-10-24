# MOTION-010 PMX骨の位置差分を作品キーへ接続

2026-10-24、Issue #106。v0.5の同じ3D編集画面に局所位置差分X/Y/Z（モデル単位）の数値欄を追加した。対象の作品F、PMX骨、VMDクリップは既存のFK回転補正と共通。数値を仮表示し、「このFをキー化」で作品別データへ保存する。元PMX/VMD、ボーン構造、ウェイトは変更しない。

保存キーの`position`は3要素の有限数・各軸±100000以内で検証し、原子置換とrevision/Undo/Redoを既存APIと共有する。旧回転専用キーは位置0として再生し、旧ファイルの読込を維持する。再生・固定フレームキャプチャは素のVMDの局所位置に線形補間した差分とレイヤー重みを加え、その後にPMX IK/grantを評価する。保存済みキーを選ぶと位置欄に値を読み戻す。画面側は空欄・非有限数・範囲外を保存前に拒否し、サーバーでも検証する。

## 確認

- `python -m pytest -q tests/test_studio_v05_motion_edits.py`: 6件成功。旧回転キーの互換読込と不正位置値の拒否を含む。
- `npm run typecheck`、`git diff --check`: 成功。
- `node tests/run-guarded.cjs tests/studio-v05-pmx-fk-edit-real.test.cjs`: 1件成功。実PMX＋VMDのF240で、頭骨の位置だけを動かす仮表示、回転不変、破棄、位置＋回転の同一キー保存、保存再読込、数値欄読戻し、Undo/Redo、重み50%、完成フレームの姿勢を確認。センター骨の位置は不変。範囲外のAPI書込は422。
- `node tests/run-guarded.cjs tests/studio-v05-pmx-fk-gizmo-real.test.cjs`: 1件成功。既存3D回転ハンドルの操作を再確認。
- 実素材のPMX SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`、VMD SHA-256 `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234` は試験前後で一致。各`run-guarded`で利用者`data/`7ファイルと`exports/`の前後ハッシュも一致。Chrome描画器はSwiftShader。

最初のブラウザ試験は制限された実行環境でローカル試験サーバーへ接続できず、起動待ちで失敗した。ローカル試験サーバーを許可した隔離実行では全操作が成功した。試験で作った一時データは削除した。画像・動画の納品成果物はないためEagle登録対象はない。

## 残る範囲

今回は数値の局所位置差分と実PMX頭骨1本・1レイヤー・F240を確認した。3D位置ハンドル、複数レイヤー、手足IK/FK切替、別名VMD書き出し、長尺90秒、Linux、今回の画面の実GPU、WebMCP/標準MCP実呼出し、Owner採用は未確認。MOTION-010全体の状態は「要検証」を維持する。

モデル区分: 設計済み要件の実装・試験・文書化に標準モデルを使用。
