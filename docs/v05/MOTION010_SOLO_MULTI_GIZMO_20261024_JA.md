# MOTION-010 ソロ切替と重畳中の3D骨ハンドル

2026-10-24、Issue #106。v0.5作品の同じPMX/VMDクリップに保存した補正レイヤーを、1層だけ有効にするソロへ対応した。ソロ指定は作品別データの `solo` 真偽値で保存し、同じクリップで別層をソロにすると前の層を同じ1操作で解除する。旧データに `solo` がない場合は偽として読む。切替はrevisionとUndo/Redoの対象。手動UI、共通API、WebMCPと標準MCPのアクション定義は既存の `layer-update` と共通で、標準MCPの実通信は未確認。

ブラウザの3D姿勢、30fps別名VMDの全フレーム・部分区間・旧疎キーの各候補は同じソロ選択を使う。ミュートまたは重み0の層も姿勢と候補から除く。無効な保存データや同一クリップでソロが2層ある状態は拒否する。ソロ中は選ばれていない層のキー化を画面で止める。

3D骨ハンドルは、選択した層が現在有効な最上段で、重み100%、有効区間のなじませ外の場合に使える。選択層の対象骨キーを一時的に外し、下位層を含めた同フレームの姿勢から差分を計算する。補正済み姿勢へ仮適用して誤差を確認してからキー化する。下位層を選んだまま上位層が有効な操作は、上位層の逆算が必要になるため理由付きで止める。腕IKの2キー診断も同じ最上段条件で下位層を保つ。対象は物理OFFの実PMX＋VMDであり、全PMXの任意構造に対する腕IK成功は主張しない。

## 検証

- `python -m pytest -q tests/test_studio_v05_motion_edits.py tests/test_studio_v05_vmd_constant.py tests/test_studio_v05_vmd_temporal.py tests/test_studio_v05_vmd_full.py tests/test_studio_v05_vmd_partial.py tests/test_studio_v05_vmd_adoption.py`：44件成功、実素材条件の6件スキップ。ソロ切替の保存・読戻し・Undo/Redo、複数ソロ拒否、4種類のVMD候補で選外層を無視する計算を確認。
- `node tests/run-guarded.cjs tests/studio-v05-vmd-partial-real.test.cjs`：24fps作品、246骨の `avatar-front-garment-v04.pmx` で二つの補正区間を物理OFF全骨往復。作品240F＋VMD301F、位置最大0.0006557343 MMD単位、角度0°。画面で先頭層をソロにすると後半F168の頭位置が0.005超戻り、部分候補の区間はF90〜149だけとなった。後半層をソロにすると先頭層は自動解除され、F168の表示は元の合成姿勢と0.001未満で一致。候補の採用・復元、元骨キーと非骨区画のbyte保持も検査。
- `node tests/run-guarded.cjs tests/studio-v05-pmx-fk-multilayer-gizmo-real.test.cjs`：201骨実PMXの頭へ下位位置0.02、上位位置0.01を保存。下位選択時は3D操作不可、上位選択時のマウス回転ドラッグは未確定姿勢となり、下位キー不変・位置差分保持・上位回転だけの保存・再読込後の姿勢一致を確認。モデルを閉じてから再読込する試験手順で成功。
- `node tests/run-guarded.cjs tests/studio-v05-pmx-fk-gizmo-real.test.cjs`：単層の既存3D回転・位置・足IKハンドルの回帰試験1件が成功。SwiftShaderでのドラッグ、Esc取消、両チャネル保持、保存再読込、足首の到達差表示を確認。
- 実入力PMXのSHA-256：`542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`（201骨）、`d784722b85991df3a89931ef1066786205f1a9845a7995d611206ecca0bdd841`（246骨）。実VMDのSHA-256：`3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234`。後者の形式と非骨区画を借りた静止頭骨VMDを部分出力試験の隔離領域で作った。`run-guarded` は各実機試験で実データ7ファイル、exports 0ファイルの前後ハッシュ一致を報告。

上記VMDのSHA-256は実ファイルを読み直して記録した。過去のMOTION-010試験記録5件に転記されていた末尾の誤記も同時に直した。

## 未確認

下位層の上に有効な層がある状態での直接3D編集、レイヤー順変更、ソロを含む候補の実PMX全骨往復、複数層での腕IKドラッグ、物理ON、実GPU、Linux、標準MCP実通信、Owner採用、MOTION-010全AC。順変更は詳細設計のO-05に従い未実装。画像・動画の納品成果物はなくEagle登録対象なし。モデル区分：実装・試験・文書化に標準モデル区分を使用。
