# Issue #40: ステージ配置と照明リグ（2026-10-21 Owner直接指定）

対象は `NF-014` のステージ配置拡張と `LIGHT-001` の照明編集。既存の P2 仕様で未承認だったライト・シーンツリーは、今回の Owner 直接指定の範囲で承認された。ステージ1個の読込、ライトの任意追加、個別の RGB・強度・位置・回転・キー、保存再読込を扱う。小道具の骨接続や大型ステージ分割などは従来の別要件のまま。

## 実素材と座標

- S01 提供 GLB SHA-256: `a54a7451a580eb88df9e6b13308d406cad9000abc72410fd4a006197dd7cae35`、7,539,272 bytes。原本は Git に含めない。ローカル素材ライブラリ ID: `library:c8b7aa49c924c0b00b5d3ecc`。
- glTF 2.0、78 メッシュ、8 材質、画像8枚すべて内包。Blender 往復 QA は原点と床面を確認。Three.js での実読込では X/Z が床、Y が上で、配置 `[0,0,0]`、建築部分の高さは約 5.65 m。
- `DANCE_GLB_SkyDome` は半径約 50 m。全メッシュの包囲箱によるカメラ調整だと球体の外から眺めて室内が隠れた。S01 のように SkyDome を含む閉じたステージでは原点周辺にカメラを置き、ドーム内側から見る。素材そのものは変更しない。

## ライト操作の設計

- 青みの淡い左キー、赤い右フィル、白い背面光は**今回の初期配置**。固定3灯ではない。利用者は独立したライトを追加・複製・無効化・削除できる。
- [Unreal のライト種類](https://dev.epicgames.com/documentation/unreal-engine/light-types-and-their-mobility-in-unreal-engine?lang=en-US)を参考に、方向光・スポット光・点光をシーンの物体として管理する。[Sequencer のライトアニメーション](https://dev.epicgames.com/documentation/en-us/unreal-engine/how-to-animate-lights-in-unreal-engine)と同様に、選択したライトごとに変形・RGB・強度等のキーを持つ。
- [VMD ライトキーの形式](https://github.com/dskjal/OpenMMD/blob/main/docs/specification/vmd-specification.md)にはフレーム・色・方向の記録があるが、複数の名前付きライトと種類をそのまま表現する構造ではない。この実装の正本は `workspace.lights` とし、将来の VMD 入出力で複数灯を黙って1灯へ潰さない。
- ビュー内のライトはカメラと区別できる色付きフレーム/放射線・方向線で表示する。左のシーン一覧で選び、移動/回転ギズモと右の数値入力を連動させる。下部のライト専用タイムラインでフレームを選び、現在の値をキーとして編集する。画面中央の3Dプレビューを最も大きく残す。
- RGB は各 0〜255、強度・位置 XYZ・回転 XYZ・スポット角・距離・有効状態をライト単位で保存する。キー間は位置・色・強度を線形補間し、回転は最短角度で補間する。タイプはライト単位で固定する。
- 照明シーンはカメラの300F初期尺とは独立の30fps・初期9000F（300秒）。尺は現在の最終キー以降で変更できる。下部キー欄は10秒・30秒・全体の表示範囲を選べる。ライト値を変えた現在Fへキーを自動追加し、1F単位で移動できる。現在の再生位置は画面状態であり、保存対象はキーと尺。
- ライト数やキー数が増えると描画負荷が増す。保存形式では固定3灯に制限せず、安全な容量上限と描画実測を別に設ける。GPU/低性能機での動作は実機確認まで未検証とする。

## 視点とパネル内スクロール（VIEW-001・UX-002）

- [Unreal公式のViewport Toolbar](https://dev.epicgames.com/documentation/en-us/unreal-engine/viewport-toolbar) は透視と、上・下・左・右・正面・背面の平行投影を挙げる。SCR-06 の中央ビュー見出しから同じ7方向を切り替える。透視の位置・注視点は平行投影へ出入りしても復元する。選択ライトへ寄る・全体を表示する操作を併設した。
- 平行投影はライトのRGB/強度・フレームと同じシーンを表示する。S01 は閉じた室内なので、そのまま外から見た正投影では外壁だけが映る。実素材の `SkyDome` と視線側の壁・天井・床を**ビュー表示時だけ**隠す。透視に戻したとき元の `visible` 値を復元し、GLB/保存スキーマを変更しない。
- 右インスペクター、左のシーン一覧、下のライト別キー一覧にはそれぞれ縦スクロール領域とキーボードフォーカスを置く。中央ビューは縮めず、下の再生操作・表示範囲は固定し、キー行をスクロールする。

## 検証と未検証

- `test_project_state_bundle.WorkspaceStageTest` 12件、`tests/studio-p2-viewport.test.cjs` のステージ保存再読込、`tests/studio-real-stage.test.cjs` の実 S01 GLB 読込/原点/室内カメラ/保存再読込を通過。Chrome SwiftShader で室内を視覚確認。
- `test_scene_lighting.py` 3件（7 subtests）、`tests/studio-scene-lighting.test.mjs` 2件、`npm run typecheck` 通過。実S01を隔離Chrome SwiftShaderへ読ませ、初期3灯のフレーム、4灯目の追加、F90のRGB・位置キー、プロジェクト保存・再読込を `tests/studio-real-stage.test.cjs` で確認。確認画像はOwnerローカルの `_Claude確認画像/2026-10-21_stage_light_40/S01_stage_light_editor.png`。ソースGLBのhashは不変。
- 初期ライト枠は室内プレビューで見える高さと方向に調整した。方向光・スポット光・点光はThree.jsで実照明として追加される。まだPMXキャラクターはSCR-06へ配置されないため、赤色とオッドアイの当たり方を実キャラクターで確証していない。GPU/Linux、影品質、MMD/Unreal との見た目の一致、Owner 採用は未検証。
- 提供S01のChrome SwiftShaderで透視/6平行投影、視線方向、選択ライトへ寄る・全体復帰、正投影の近側外殻一時非表示、透視へ戻した際の表示と位置の復元を検証。ライトの移動ギズモを実ドラッグし、F0キーへの反映を確認。右と下の一覧を末尾までスクロールできることを確認。6方向の確認画像は同じOwnerローカルフォルダの `view_*.png`。

### 保存・補間

- `scene_lighting.py` が最大128ライト/合計5000キー、尺と各キーの座標・角度・RGB・強度等を検証。`project_state_bundle.py` は `workspace.lights` を保存し、旧画面がこの項目を送らない場合は既存値を残す。既存値が壊れている通常保存は書き込み前に拒否する。
- `studio/js/viewport/scene-lighting.js` が初期3灯の独立キーと、RGB・位置・強度の補間、最短角度の回転補間、キーの追加/削除を扱う。`scene-light-rig.js` は可視フレームと移動/回転ギズモ、`scene-light-ui.js` は一覧・右編集欄・下部タイムラインを担当する。
