# MOTION-010 左右腕のFK/IK編集方法切替

2026-10-24、Issue #106。腕IKの既存3D二関節解と腕・ひじ2キー保存経路を、作品・モデルごとのFK/IK編集方法へ接続した。PMXの腕→ひじ→手首が一意に存在して親子経路になり、元PMXのIK定義と競合しない場合だけIKを選べる。FKは腕骨が一意なら選べる。IKを選ぶと手先ハンドル、FKを選ぶと腕回転ハンドルを選択する。ハンドルの位置は表示中の実骨位置にスナップする。切替は編集設定のみで、補正キーとUndo履歴を書かない。

## 実行した試験

| 入力 | IK→保存再読込→FK | 全骨ワールド行列最大差 | 結果 |
|---|---|---:|---|
| 登録済み標準PMX、201骨 | 左右とも確認 | 0 | 合格 |
| 登録済み衣装PMX、246骨 | 左右とも確認 | 0 | 合格 |

両入力は実VMD 1本、作品F240、物理OFF。隔離Chrome/SwiftShaderで各切替の全骨行列を比較した。保存済み腕・ひじキー、Undo/Redo可否は切替前と一致し、IK設定をブラウザ再読込後に再取得した。IKへの切替時は3D手先ハンドルが実手首位置に一致。切替後の腕キー入り別名VMD候補も物理OFFの全作品600F＋VMD300Fで実PMX往復の誤差上限内。元PMX/VMDと利用者`data/`・`exports/`のSHA-256は前後で一致した。候補は未登録・未配置。

`python -m pytest -q tests/test_studio_v05_motion_edits.py`は10件成功。`npm run typecheck`、`node --check tests/studio-v05-arm-ik-geometry-real.test.cjs`、`git diff --check`は成功。`node tests/run-guarded.cjs tests/studio-v05-arm-ik-geometry-real.test.cjs`は標準・衣装PMXで成功し、既存の`studio-v05-pmx-fk-gizmo-real.test.cjs`も成功した。衣装PMXの最初の試験は途中のブラウザ再読込待ちが120秒で時間切れになり、診断出力を加えた再実行では69秒で全工程が成功した。時間切れは最初の失敗として記録し、再現条件は未確定。

実GPU、Linux、物理ON、標準MCP、任意PMXの関節制限、連続ドラッグ中更新、右腕ハンドルの保存再読込、候補の採用と作品配置、Owner採用は未確認。AC-M-01/02とMOTION-010全体は「要検証」。画像・動画の成果物はなくEagle登録対象はない。モデル区分: 実装・試験に標準モデル区分を使用。
