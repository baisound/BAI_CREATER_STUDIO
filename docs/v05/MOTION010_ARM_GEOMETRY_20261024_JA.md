# MOTION-010 腕IKの3D二関節幾何

2026-10-24、Issue #106。[実PMX腕の実測](MOTION010_ARM_IK_FEASIBILITY_20261024_JA.md)と[2キー保存API](MOTION010_ARM_PAIR_API_20261024_JA.md)に続く計算段階。`studio/v05/js/arm-ik-geometry-v134.mjs`は世界座標の肩・ひじ・手首・目標と任意の肘ポールから、肘の目標位置と到達可能な手首位置を返す純粋関数である。現時点では腕骨の回転、PMX付与後の実手首、UIハンドル、保存キーへの変換を行わない。

上腕・前腕の実長を保ち、二球の交円から肘位置を求める。手先が外側・内側の到達範囲を超える場合は近い境界へ置き、`unreachableDistance`と`reachable:false`を返す。入力が非有限、骨長がゼロ、目標が肩に重なる、指定ポールが腕軸と重なる場合は計算を拒否する。実PMXの初期姿勢はほぼ直線なので、現在の肘からポール方向を安定して求められない場合は呼出側が与える`fallbackPole`を使う。予備ポールも腕軸上なら拒否する。左右の符号を無条件に反転しない。

## 検証

- `node --test tests/studio-v05-arm-ik-geometry.test.mjs`: 4件成功。実PMXのほぼ直線の数値、左右の対称ポール、外側/内側の到達不能、非有限・退化・腕軸上のポールを確認した。上腕・前腕の長さは出力位置で1e-10以内に一致。
- `BAI_TEST_CONCURRENCY=1 node tests/run-guarded.cjs tests/studio-v05-arm-ik-geometry-real.test.cjs`: 隔離Chrome/SwiftShaderの実PMX/VMDで1件成功。左右の作品F240実骨位置に関数を適用し、手首目標を0.04シーン単位内側へ置いた場合に予備ポールを使い、目標位置と両骨長が1e-8以内で一致した。試験は前段の2キーHTTP保存も含む。元素材と利用者`data/`/`exports/`のハッシュは前後一致。
- `python -m pytest -q tests/test_studio_routes.py`: 6件成功。ブラウザが`.mjs`をJavaScriptとして取得できるよう、v0.5静的配信にその拡張子を追加した。`npm run typecheck`と構文確認を別途実施。

次はこの目標位置を実PMXの腕・ひじローカル回転差分へ変換し、腕捩・手捩・付与後の実手首を再評価する。到達残差、未編集側の全骨世界姿勢、保存再読込と別名VMD候補の往復が通るまで、AC-M-01/02とMOTION-010全体は「要検証」。画像・動画の成果物はなくEagle登録対象はない。モデル区分: 幾何実装と試験に標準モデル区分を使用。
