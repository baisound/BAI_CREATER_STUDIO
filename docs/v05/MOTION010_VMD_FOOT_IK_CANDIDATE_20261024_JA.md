# MOTION-010 足IKを含む別名VMD候補の限定往復

2026-10-24、Issue #106。時間変化する頭FKキーと、全区間で一定の左足ＩＫターゲット位置補正を同じ作品クリップへ保存した場合を扱う。30fps候補の区間終了キーだけを置くと、終盤の広い時間をかけて足IK位置が0へ減衰する。各対象骨について最後の有効VMDフレームにも補正値を置き、次のフレームで区間外の値にする。作品FPSで全フレームの局所誤差ゲートを再実行し、超過する候補は従来どおり拒否する。

実PMX＋実VMDを隔離Chrome/SwiftShaderで4クリップとして読み込み、原VMD＋保存補正と別名候補を600作品フレームで比較した。左足ＩＫのワールド位置最大成分差は`3.447532653799712e-7`、左足首は`3.443117760765224e-7`、未編集の右足首は`0`。局所位置の最大誤差は`4.313273286427055e-6` MMD単位（作品F599）。候補は元のVMDの非骨区画、IK有効状態、未編集骨を保持する。実PMXのIK処理後に左足首がターゲットへ追従する範囲を確認したが、別PMX・足IK定義・IK無効区間へ一般化しない。

`BAI_REAL_MMD_DATA`を登録実素材へ向けた`python -m pytest -q tests/test_studio_v05_vmd_temporal.py tests/test_studio_v05_vmd_constant.py tests/test_studio_v05_vmd_rewrite.py tests/test_v0163_vmd_readback.py`で30件成功。`BAI_TEST_CONCURRENCY=1 node tests/run-guarded.cjs tests/studio-v05-vmd-constant-real.test.cjs`で隔離Chrome1件成功。`run-guarded`の利用者`data/`7ファイルと`exports/`0ファイルの前後ハッシュ一致。原PMX SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`、原VMD SHA-256 `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234`は不変。

対象は1モデル・左足ＩＫ・頭骨・60fps・10秒・SwiftShader。候補の全PMX採用判定、作品配置、別骨・別FPS・長尺・実GPU・Linux・MCP実呼出し、Owner採用は未確認。候補の状態は`candidate_requires_real_pmx_validation`、`MOTION-010`全体は「要検証」のまま。画像・動画成果物は作成しておらず、Eagle登録対象はない。モデル区分：標準モデル区分で実装・試験・記録を実施。
