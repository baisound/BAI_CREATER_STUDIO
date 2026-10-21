# MOTION-006「神っぽいな」PMX 脚プレビュー診断（2026-10-21）

## 再現

`main` の SCR-13［編集］で既定の PMX `Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx`（A）に `神っぽいな.vmd` を適用した。0・5・10・12・15・20・30 秒で停止・シークし、画面と `baiStudio.motion.probe` を確認した。元ファイルや制作状態は編集していない。

- オーナー確認用スクリーンショット：`D:\BAI\BAI_CREATER_STUDIO\_Claude確認画像\2026-10-21_神っぽいな_VMD脚調査\before_*.png`
- VMD は 26,859 件の骨キー、最大 6,109 フレーム（203.63 秒）。左足ＩＫ 579 件、右足ＩＫ 647 件、左右の足にもそれぞれ 935・956 件の回転キーがある。足 IK は開始から約 12 秒までは静止目標で、その後動く。
- PMX は左右の足ＩＫを持ち、それぞれ足首を effector、ひざ・足を link にする。15 秒の左足ＩＫは読み取り位置が `(-0.3, 1.70, 0)` から `(4.20, 3.10, 0.90)` へ移ったが、画面の脚は静止に近い。30 秒には左右の目標も移動している。
- 再生画面は `studio/js/motion/player.js` の `AnimationMixer.update` / `setTime` で VMD のキーだけを評価する。PMX の IK と grant のソルバーを呼んでいないため、足 IK 目標が移っても足・ひざの連鎖へ反映されない。手や腕の直接回転キーが動く現象と整合する。Three.js の [CCDIKSolver](https://threejs.org/docs/pages/CCDIKSolver.html) は、IK 目標からリンク骨を解く役割を持つ。

## 修正方針

既存の `MMDLoader` と同じ Three.js 0.160.1 の `MMDAnimationHelper` を PMX＋VMD のプレビューで使い、アニメーション評価の後に IK と grant を更新する。物理計算は別工程のため有効化しない。GLB/VRM のクリップ再生は従来経路を維持する。再生・停止・シーク・モデル切替・画面離脱を確認する。

元の PMX、VMD、既存ウェイトとスキニングには一切操作しない。開始時 SHA-256：PMX `542A4DAA561F0B0DA578FC303AF9B8C6DC4ACDD8D380771A170E96E95A205488`、VMD `FA224AD0F7C8AF26B5214C4726E0BE93ED719D1FCC539B679571761377225189`。修正後に再照合する。

実素材・ブラウザーは Chrome/SwiftShader。GPU 実機での描画速度と物理挙動は未確認。
