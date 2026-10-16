# 第2段階：FBX連続モーション→VMD変換 改良仕様

## 今回の変更

- **開始位置の相対化**：各FBXの移動ルートをそのクリップの開始位置から相対化し、前クリップの終了座標を引き継ぎます。
- **境界の姿勢ブレンド**：各クリップ冒頭の `blend_frames`（初期値6、0〜60）に、前クリップ終端の姿勢から球面線形補間（slerp）を適用します。ルート移動も滑らかに補間します。
- **PMX向け回転補正設定**：`bone_corrections` キーでボーン別の補正クォータニオン `[w,x,y,z]` を指定します。初期値の補正なしは `[1,0,0,0]` です。
- **詳細レポート**：変換ジョブのブレンド数と各クリップの区間を `.report.json` に出力します。

## ジョブの拡張例

```json
{
  "fps":30,
  "scale":0.08,
  "blend_frames":8,
  "bone_corrections":{"右腕":[1,0,0,0]},
  "bone_map":{"mixamorig:Hips":"センター"},
  "steps":[{"file":"/absolute/path/jab.fbx"},{"file":"/absolute/path/kick.fbx"}],
  "output":"/absolute/path/exports/chain_motion.vmd"
}
```

**注意**：`bone_corrections` はPMXの実リグを測定して設定してください。正しい補正値が未判明なら単位回転を使い、変換を正確と判定しないでください。

### 依然として未完成・検証が必要な項目

1. この変換器は**PMXモデルの実際のバインドポーズを自動解析しません**。骨格の軸差・レストポーズ差を完全に解決するものではありません。
2. 「ブレンド」はクリップ冒頭を前の終端へ近づける簡易的な姿勢補間です。元クリップ同士を時間的に重ねる高度なブレンドではありません。
3. **足IK/接地ソルバー、つま先固定、床衝突、物理演算は未実装**。Kip UpやノックダウンはPMXモデル上で重点確認してください。
4. Mixamo FBXのFPS・座標軸とVMDの座標系は素材・環境に依存します。Blender実機でフレーム位置と接地を検証してください。
5. 保存済みプロジェクト・履歴・お気に入り・FBXは保持しています。既存のVMDを上書きしないよう出力パスを変更してください。

### 実行

```
blender -b --python tools/fbx_chain_to_vmd.py -- --job exports/vmd_conversion_job.json
```

API `/api/export-vmd-job` は任意の `blend_frames` と `bone_corrections` を受け取れます。現時点のUIからは初期値6フレームを使います。Codexは必要に応じてジョブJSONを編集できます。
