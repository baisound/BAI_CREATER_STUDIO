# MOTION-010 PMX姿勢評価の事前ゲート

2026-10-24、Issue #106。Three.js 0.160.1 の実PMX/VMD再生経路に、素のVMDを評価した直後、IK/grantの前で補正できる限定経路を追加した。呼び出し側が補正関数を設定しない場合、従来の `MMDAnimationHelper.update(0)` をそのまま使う。Three.js内部の必要な状態が無ければ補正側はエラーにして、未対応を隠さない。

`BAI_REAL_MMD_DATA=<既存data> CHROMIUM_PATH=<Chrome> node --test tests/studio-v05-pmx-pose-evaluator.test.cjs` を隔離ローカルサーバーとChromeのSwiftShaderで実行し、1/1成功。使用したPMXは骨201、モーフ168、VMDは10秒。時刻0、4、9、4、0、9秒で元経路→無補正の新経路→元経路と切り替え、全骨のローカル位置・四元数・ワールド行列と全モーフ値を照合。最大絶対差2.1685372053603658e-8、元経路へ戻した後は全値差0。閾値1e-5。PMX SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`、VMD SHA-256 `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234` は前後一致。初回sandbox実行はローカルサーバーが起動できず失敗し、通常の一時領域で再実行した。`npm run typecheck`、`node --check studio/js/motion/player.js`、`git diff --check` は成功。

このゲートは補正値を加えた動作、UI、作品別保存、MP4、VMD書き出し、実GPU、Linuxを検証していない。長尺90秒の同時刻比較も未検証。段階Aで骨補正の実動作と保存再読込を別に確認する。
