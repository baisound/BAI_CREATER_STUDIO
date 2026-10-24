# MOTION-010 脚のFK/IK編集方法の保存と姿勢不変検査

2026-10-24、Issue #106。v0.5の同じ3D編集画面で、標準名の脚骨を持つ実PMXについて、左脚・右脚の編集方法をFKまたはPMX足IKターゲットから選ぶ入口を追加した。FKでは「左足／右足」、IKでは実IK定義のある「左足ＩＫ／右足ＩＫ」を編集骨に選び、既存の回転・位置ハンドルへ接続する。腕は一覧に状態を示すが、3D腕IK解法がないためIKへは切り替えない。別名の脚骨やIK定義がないPMXでは理由を表示して止める。

`/api/studio/v05/motion-edits`の`mode-set`は作品・インスタンス・有効なPMX/VMDクリップ・revision・ロック・原素材を確認し、`fk_ik_modes`を作品別のschema 1ファイルへ保存する。従来ファイルにこの項目がなくても読み、次の保存時に追加する。切替は編集設定なので、補正レイヤー・キー・Undo/Redo履歴へ書かない。WebMCPと標準MCPも同じAPIを使う。

画面は切替直前・直後の実PMX全骨のワールド位置と回転差を測り、最大差が`1e-4`を超える場合は失敗を表示する。切替自体は骨姿勢を更新しない。実PMXでIK→FK→保存再読込→IK、ならびに保存済み補正キー・Undo状態の一致を隔離Chromeで確認した。

## 試験と修正

- `python -m pytest -q tests/test_studio_v05_motion_edits.py`: 8件成功。旧ファイルの読み取り、初回保存、再指定時のrevision不変、競合・腕IK拒否、不正ファイルの原本保持を確認。
- `node tests/run-guarded.cjs tests/studio-v05-pmx-fk-gizmo-real.test.cjs`: Chrome/SwiftShaderで1件成功。実PMX 201骨の画面内全骨差検査、脚FK/IKの保存再読込、既存の頭FKと足IK補正の回帰を確認。利用者`data/`7ファイル、`exports/`0ファイルの前後ハッシュ一致。
- 初回の実ブラウザ試験では、実シーンの32文字インスタンスIDをUUID形式と誤認して拒否した。シーン保存契約に合わせて検証を修正し、再試験で成功。
- `npm run typecheck`、Python構文、変更JSの`node --check`、`git diff --check`: 成功。
- 実PMX SHA-256 `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`、元VMD SHA-256 `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234`は前後一致。試験は隔離データを使い、稼働中の8765番サーバーを変更していない。

## 残る範囲

現在の切替は編集骨・ハンドル種類の選択であり、足先ハンドルの実足首位置へのスナップ、膝ポールの配置、FK/IK間の回転解き直し、腕IK、別名のPMX骨、VRMには未対応。仕様のAC-M-02全体はまだ合格にしない。保存済みモードはVMD候補やMP4の骨姿勢を変えない。標準MCPの実呼出し、Linux、実GPU、物理ON、Owner採用も未確認。画像・動画の納品物はなく、Eagle登録対象はない。

モデル区分: 仕様・既存保存契約の判断、実装、試験まで標準モデル区分を使用。
