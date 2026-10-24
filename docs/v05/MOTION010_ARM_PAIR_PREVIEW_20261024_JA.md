# MOTION-010 腕・ひじ2キーの同時仮表示

2026-10-24、Issue #106。[実骨局所回転](MOTION010_ARM_LOCAL_ROTATION_20261024_JA.md)で算出した腕・ひじ2キーを、同一作品Fの1つの未保存プレビューとして評価する。既存の1キーFK補正を維持し、PMX VMD評価器のプレビュー引数が1キーまたは重複のない2キーを受けるようにした。画面内の診断入口`armIkPreview`は、未補正の腕、重み100%でなじませ外の単一レイヤーだけを対象にし、保存前のメモリ内姿勢のみを変える。計算後の手首と頭・上半身を評価器で再測定し、誤差超過なら仮表示を破棄する。Escまたは［仮補正を破棄］で元姿勢へ戻し、［このFをキー化］で`arm-set`を1回だけ呼び、1 revision・1 Undoで保存する。

## 検証

- `npm run typecheck`: 成功。
- `BAI_REAL_MMD_DATA`、`CHROMIUM_PATH`、`BAI_TEST_CONCURRENCY=1`を設定した`node tests/run-guarded.cjs tests/studio-v05-arm-ik-geometry-real.test.cjs`: 隔離Chrome/SwiftShaderの実PMX＋VMDで1件成功。左腕の2キー同時仮表示では手首残差1e-3未満、頭・上半身差1e-4未満。Escで手首は元の位置へ1e-8以内に復帰し、作品のrevisionは増えない。再度仮表示した後、画面の［このFをキー化］から腕・ひじ2キーを1 revisionとして保存した。右腕の2キー保存も加え、再読込後の左右手首残差は各1e-3未満。Undo/Redo、不正ペア拒否、元素材と利用者`data/`/`exports/`のハッシュ不変を確認。
- `node tests/run-guarded.cjs tests/studio-v05-pmx-fk-edit-real.test.cjs`: 既存の1キーFKプレビュー・保存・再読込・Undo/Redoを実PMXで1件成功。原本ハッシュ不変。

開始操作はまだ読み取り用の診断入口であり、利用者が画面の手先・肘ハンドルをドラッグして2キー仮表示を作る経路は未接続。別PMX、別名VMDの全骨往復、物理ON、実GPU、Linux、標準MCP、Owner採用も未確認。AC-M-01/02とMOTION-010全体は「要検証」。画像・動画の成果物はなくEagle登録対象はない。モデル区分: 既存評価器との接続・試験に標準モデル区分を使用。
