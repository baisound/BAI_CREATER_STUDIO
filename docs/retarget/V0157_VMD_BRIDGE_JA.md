# v0.15.7 共通モーション→VMD変換（実験版）

## 実装範囲
- BVH：階層チャンネルから平行移動・宣言順のEuler回転をクォータニオンにしてVMD生成。
- GLB：埋め込みBINの線形・STEPキーフレームからVMD生成。外部バッファ、CUBICSPLINE、モーフは対象外。
- FBX：Blenderの `tools/extract_fbx_motion_blender.py` でサンプリングして共通JSONを作り、同じVMD変換経路に投入する（Blender実機未検証）。
- PMX/VRM：明示的ボーン名対応で出力するが、基準姿勢・軸・IK・階層の正確な自動リターゲティングは未実装。

## 使い方（AI不要）

```bash
python motion_vmd_bridge.py --source sample.bvh --bone-map bone_map.json --output out.vmd
```

`bone_map.json` 例：
```json
{"Hips":"センター","Chest":"上半身"}
```

FBXの場合は先に次を実行します。
```bash
blender -b --python tools/extract_fbx_motion_blender.py -- sample.fbx sampled.json
python motion_vmd_bridge.py --source sampled.json --bone-map bone_map.json --output out.vmd
```

VMDは30fps基準です。キーのフレーム丸め、衝突時の上書き、BVH座標系とPMX座標系の差、レスト姿勢、骨軸のひねり、モデル別IKおよび足接地は現在の変換器で解決していません。**出力は検証用であり、MMD上の実モデルで品質を確認するまで使用可能と判定しないこと。**
出力と同じ名前の `.report.json` に変換キー数と警告を残します。元のファイルを上書きしないでください。

## 検証
- `python -m unittest discover -s tests -p test_v0157_vmd_bridge.py -v`
- BVH模擬データによるVMDヘッダーとボーン数の確認済み。
- BlenderでのFBX実機抽出、実PMXのモーション検証、WebMCP・標準MCPでのVMD生成ツール操作は未実装・未検証。

## 次工程
モデル別補正プロファイルと結びつけ、T/A基準姿勢変換、座標系、スケール、ルート、IKを校正し、アプリUIとWebMCP/標準MCPの共通ジョブに統合する。
