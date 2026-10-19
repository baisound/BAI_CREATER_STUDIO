# Phase E 親子リグ・クレーン補間のチェックポイント

基点: ced7d0a / コードコミット: 9b1f07a

## 実装
- `BAICameraRig.parentTransform`：任意支点中心のY軸回転とXYZ平行移動を親変換としてカメラ位置と注視点へ同一適用。入力姿勢は変更しない。
- `BAICameraRig.craneSequence`：開始角・終了角・進行度・linear/smoothからクレーン姿勢を評価する純粋関数。
- 親子リグをUIのリグ種別に追加し、プロジェクト正規化で保存可にする。
- `bake(type='parent')`：区間に親子リグ変換を通常のカメラキーとして生成。既存のキー衝突・Undoの画面処理を利用。

## 検証
- Node `test_camera_rig.js` 通過。
- pytest camera_rig_store / follow_project / bone_follow_wiring / rail_handles: 13 passed, 5 subtests passed。
- JavaScript構文チェック通過。

## 未完成・注意
- 3Dシーン内で親子リグを選択するギズモ、子階層を含む永続リググラフ、ボーンを親とした動的親子変換は未実装。
- `craneSequence` は計算関数であり、画面の連続編集UIにはまだ接続していない。
- 実ブラウザー描画・MMD本体との一致は未検証。Phase E完成ではない。
- これまで通りユーザー側の動作確認はPhase E全実装後に依頼する。
