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
- ライト数やキー数が増えると描画負荷が増す。保存形式では固定3灯に制限せず、安全な容量上限と描画実測を別に設ける。GPU/低性能機での動作は実機確認まで未検証とする。

## 検証と未検証

- `test_project_state_bundle.WorkspaceStageTest` 12件、`tests/studio-p2-viewport.test.cjs` のステージ保存再読込、`tests/studio-real-stage.test.cjs` の実 S01 GLB 読込/原点/室内カメラ/保存再読込を通過。Chrome SwiftShader で室内を視覚確認。
- ライト編集のコード・実視覚・保存テストは続く段階で記録する。GPU/Linux、影品質、MMD/Unreal との見た目の一致、Owner 採用は未検証。

### 保存・補間の段階（実装中）

- `scene_lighting.py` が最大128ライト/合計5000キー、各キーの座標・角度・RGB・強度等を検証。`project_state_bundle.py` は `workspace.lights` を保存し、旧画面がこの項目を送らない場合は既存値を残す。既存値が壊れている通常保存は書き込み前に拒否する。
- `studio/js/viewport/scene-lighting.js` が初期3灯の独立キーと、RGB・位置・強度の補間、最短角度の回転補間、キーの追加/削除を扱う。`test_scene_lighting.py` 3件と `tests/studio-scene-lighting.test.mjs` 2件を実施。ビューのギズモ/UI 結線は次段階。
