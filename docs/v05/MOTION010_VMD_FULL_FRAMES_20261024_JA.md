# MOTION-010 全フレームVMD候補と元VMDの後続区間

2026-10-24、Issue #106。v0.5の別名VMD候補の既定を、対象骨の30fps毎フレームキー化へ変更した。対象範囲はF0から「配置クリップの終了」と「元VMDの最終骨キー」の遅い方まで。元VMDの最終骨キーが配置クリップより後なら、その区間には補正を掛けず、原姿勢との一致を毎VMDフレームで検査する。未編集骨レコード、補正ゼロの既存骨レコード、モーフ等の非骨区画は元byteを保持する。元PMX/VMDは読み取り専用で、候補は別名ファイルとなる。

候補作成時に、対象骨のキーが全VMDフレームを覆うこと、作品内の全フレームで局所姿勢差が位置1e-3 MMD単位・角度0.01°以下であること、後続の元VMD姿勢を保つことを確認する。実PMX検査は物理OFFで全骨を比較し、通常の配置クリップ全フレームに加えて、元VMDの骨キー末尾までのVMDフレームを調べる。採用APIも、この長い範囲を含む合格レポートを要求する。実PMX検査不合格の候補は採用できず、作品は原VMDのまま残る。

既存の元キーと補正点だけを使う疎な候補は「旧方式」として明示選択できる。作品FPSが30fpsと異なる場合や元VMDの動く曲線が密キー化で再現できない場合に、旧方式の実PMX全フレーム検査を引き続き使える。既定の全フレーム方式は誤差を黙認せず、閾値を超える入力を候補作成または実PMX検査で拒否する。

## 検証

- `python -m pytest -q tests/test_studio_v05_vmd_full.py tests/test_studio_v05_vmd_adoption.py tests/test_studio_v05_vmd_partial.py tests/test_studio_v05_vmd_temporal.py`: 実素材を指定して22件成功。毎フレームのキー、長い元VMDの後続151F、既存レコード・非骨区画byte一致、60fpsの表現不能な補正の拒否、採用レポートの後続範囲不足を確認。
- `npm run typecheck`: 成功。
- `node tests/run-guarded.cjs tests/studio-v05-vmd-full-real.test.cjs`: 隔離Chrome/SwiftShaderで2件成功。別系統の実PMX 246骨と実VMDから作った静止頭骨入力では、作品150F＋VMD301Fの実PMX全骨往復が位置最大1.45e-7、角度0°。画面の既定選択、別名候補、明示採用・復元、原本ハッシュ不変を確認。動く元VMDそのものでは、局所検査が通っても実PMX全骨往復は位置0.00398、角度0.0369°となり不合格で、採用APIは拒否した。数値だけで完成扱いにしない根拠としてこの入力を回帰試験に保持する。
- 旧方式の実PMX回帰: `studio-v05-vmd-constant-real.test.cjs`と`studio-v05-vmd-fractional-pmx-real.test.cjs`は成功。`studio-v05-vmd-partial-real.test.cjs`は単独再実行で成功。`studio-v05-vmd-fps-fade-real.test.cjs`は4件一括実行ではChromeの`ERR_NO_BUFFER_SPACE`で失敗し、単独再実行では成功。一括実行そのものは未完走として記録する。`run-guarded`は各単独実行で原本data 7ファイルの前後ハッシュ一致を報告。
- 入力SHA-256: PMX `d784722b85991df3a89931ef1066786205f1a9845a7995d611206ecca0bdd841`、実VMD `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234`。静止頭骨VMDは実VMDの形式と非骨区画を保ち、隔離データ内だけで作成。原本素材をGitに追加・変更していない。

## 残る条件

全フレーム候補はすべての元VMDを実PMXで再現できるとは限らない。特に動く元曲線と30fps密キーでは、Three.jsの再生時刻・隣接キー補間が異なるため、実PMXゲートで拒否する例がある。検査に合格する入力だけが採用可能。モーフだけが最終骨キーより後に続く時間は、この版の骨キー生成範囲に含めていない。異なる複数修正区間、物理ON、実GPU、Linux、標準MCP、Owner採用とMOTION-010全ACは未確認。MOTION-010の状態は「要検証」。画像・動画の納品成果物は制作しておらずEagle登録対象なし。モデル区分: 設計・実装・検証に標準モデル区分を使用。後続の部分VMD計算単体試験は[別記録](MOTION010_VMD_PARTIAL_MULTI_20261024_JA.md)。

追補: 動く元曲線の不一致は[境界補間の調査と候補作成前の拒否](MOTION010_DENSE_BOUNDARY_PREFLIGHT_20261024_JA.md)で原因を特定し、同じ入力を候補ファイル作成時点で拒否するようにした。この段落までの数値はPR #144時点の検査記録として残す。
