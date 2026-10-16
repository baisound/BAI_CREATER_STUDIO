# Mixamo FBX → VMD実験的変換（Codex向け）

## 流れ
1. ブラウザのコンビネーション編集にFBX登録済みの技を連結。
2. 「FBX → VMD 出力ジョブ」のMixamo名→MMD名マッピングを**対象PMXモデルに合わせて修正**して保存。
3. 「VMD変換ジョブ作成」をクリック。`exports/vmd_conversion_job.json` が生成。
4. Blender 4.x（FBXインポータ搭載）を起動可能なターミナルで実行：
   `blender -b --python tools/fbx_chain_to_vmd.py -- --job exports/vmd_conversion_job.json`
5. `exports/chain_motion.vmd` と `exports/chain_motion.report.json` を確認。PMXに読み込み映像で評価。

## 重要な制約
これはFBXボーンのアニメーションをサンプリングしてVMDボーンキーに変換する**実験的基礎実装**です。モデル別ボーン軸、PMXボーン初期姿勢、フットIK、複数モーションのスムーズなブレンド、回転を含む移動座標の整合、PMX物理、ボーン名変換などの完全な自動化は未対応です。

特にFBXのpose.matrix_basisの回転はPMXボーン基準軸と直接一致しない場合があります。VMDファイルが生成されても正常動作を保証しません。変換レポートを読み、MMD/Blender内で骨格ごとに確認してください。PMXのセンター・グルーブ・IKボーンは正しい軸・ベース姿勢で補正が必要です。

安全策：`chain_motion.vmd` は新規出力のみ。既存VMDへ直接書き込みません。マッピングJSONは`data/conversion_map.json`、制作状態は`data/project_state.json`、お気に入りは`data/favorites.json`。

## API
`GET/POST /api/conversion-map` はボーン対応表の読み書き。`POST /api/export-vmd-job` は登録済みFBXのファイル名配列 `names` と `bone_map`, `scale` を受け取ってBlenderジョブJSONを作成します。サーバーはユーザー入力の任意ファイルパスを受け付けず、manifest登録済みの `data/files/*.fbx` のみ参照します。
