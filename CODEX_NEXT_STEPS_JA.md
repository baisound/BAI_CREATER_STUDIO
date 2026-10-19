> **2026-10-19 最優先:** 作業開始前にルート `AGENTS.md` の「オーナー要求最優先・スコープ凍結」を読み、現在の承認済みPhase Eの未完成項目を優先する。ここにある古い作業順は新しいオーナー決定より優先しない。

# Codex実装・検証引継ぎ

## 今回の追加
- 制作状態の保存/読み込み、Undo/Redo、編集履歴一覧と履歴復元。JSONは `data/project_state.json`。
- Mixamoボーン→MMDボーン対応マップの保存。JSONは `data/conversion_map.json`。
- コンビネーションからBlender変換ジョブの作成。`exports/vmd_conversion_job.json`。
- `tools/fbx_chain_to_vmd.py` によるFBXアニメーションのサンプリングとVMDファイル生成。VMDをPMXで再生して手動検証すること。

## Codexが必ず確認すること
1. 既存の82パターン/FBX/PMX素材を退避してから編集すること。
2. FBXのポーズ行列はPMXボーンのローカル軸と必ずしも一致しない。VMDが生成できても正常なリターゲティングとは限らない。ボーン座標、A/Tポーズ、モデル固有の捩り、足IK、センター/グルーブ移動を検証・補正すること。
3. 動作境界の滑らかな遷移は今回の変換器では未実装（連結はキーの時間結合）。実制作では前後の姿勢/回転ブレンドを追加すること。
4. サーバーはローカルホスト専用。 `start.sh` または `起動.bat` 起動。`python -m py_compile server.py tools/fbx_chain_to_vmd.py` で構文確認。
5. `blender -b --python tools/fbx_chain_to_vmd.py -- --job exports/vmd_conversion_job.json` 実行後の `exports/chain_motion.report.json` を読み、PMXモデル上で再生・足滑り/関節の破綻確認をすること。
6. この実行環境ではローカルTCPへの接続とBlender実行は確認できなかった。両者とも未検証と扱う。

## 次の実装候補
- PMXボーンのrest orientationとFBX rest orientationの差分補正（数学的リターゲティング）。
- FBXタイミング正規化と根本移動の座標変換（Blender/MMD間の軸対応）。
- VMDボーン補間、IK、接地コンタクトのサンプリングと補正。
- 2体同期やタイムライン設定（オーバーラップ/ブレンド）のVMD変換への反映。
