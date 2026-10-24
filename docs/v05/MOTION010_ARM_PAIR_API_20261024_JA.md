# MOTION-010 腕・ひじ2キーの原子的保存

2026-10-24、Issue #106。[腕IKの実測と実装ゲート](MOTION010_ARM_IK_FEASIBILITY_20261024_JA.md)の保存部分を実装した。腕IKの3D解と操作ハンドルはまだ未実装。`MOTION-010`全体を完成扱いにしない。

`POST /api/studio/v05/motion-edits`に`action: "arm-set"`と`keys`を追加した。`keys`は同じ作品フレームの`左腕`＋`左ひじ`、または`右腕`＋`右ひじ`の2件だけを受ける。既存の作品・インスタンス・VMDクリップ・素材SHA・ロック・revision・フレーム・PMX骨名・VMD名長・四元数の検証を共用する。片方が不正なら両方とも保存せず、元ファイルのバイトを保持する。成功時は一つのレイヤーに2キーを保存し、revisionを1進め、Undo履歴を1件だけ積む。既存の他骨キー、腕・ひじキーの位置チャネルは保つ。全内容が同じ場合は無変更で返す。従来の`set`と`undo`/`redo`の契約は維持する。

ブラウザ内WebMCPの`bai_studio_pmx_fk_edits_mutate`にも`arm-set`と2キー入力を公開した。手動UIの腕IKハンドル、腕の仮プレビュー、標準MCPの同等操作は未接続であり、WebMCPのツール登録・実呼出しは未検証。元VMD/PMXは書き換えず、別名VMD候補への採用もまだ行わない。

## 検証

- `python -m pytest -q tests/test_studio_v05_motion_edits.py`: 9件成功。単体試験で片方の不正値・フレーム違い・重複骨・別骨・古いrevisionが元ファイルを変えないこと、既存位置チャネル、無変更、2キーの1 Undo/Redoを確認。
- `BAI_TEST_CONCURRENCY=1 node tests/run-guarded.cjs tests/studio-v05-arm-ik-geometry-real.test.cjs`: 隔離Chrome/SwiftShaderの実PMX/VMDで1件成功。HTTP経由で既存の頭キーを残したまま腕・ひじ2キーを1回保存し、不正ペアをHTTP 422で拒否、Undo/Redoで2キーが同時に往復した。ここで保存した単位四元数はAPIの検査用であり、腕IKの実姿勢合格を意味しない。
- 既存`tests/studio-v05-pmx-fk-edit-real.test.cjs`は実PMXで1件成功。単一FK補正のプレビュー、保存・再読込・Undo/Redoの経路に回帰なし。`npm run typecheck`、変更JS構文、Python構文、`git diff --check`を確認。`run-guarded`の利用者`data/`/`exports/`、実素材ハッシュは試験前後で一致した。

次は二つの腕骨差分を同時に仮表示し、実PMXの捩り・付与後の手首到達を検査する。実ポインタ、Esc、実骨世界姿勢、別名VMD全骨往復が通るまでAC-M-01/02とMOTION-010全体は「要検証」。画像・動画の成果物はなくEagle登録対象はない。モデル区分: API/試験/記録の実装に標準モデル区分を使用。
