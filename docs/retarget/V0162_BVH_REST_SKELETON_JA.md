# v0.16.2 — BVH骨格階層・初期位置解析（部分実装）

## 追加
- BVH ROOT/JOINTの親子インデックスとOFFSETを検証し、初期位置を親から累積算出。
- End Siteをボーンとして誤登録せず件数を保持。
- `/api/retarget/analyze?id=...` の既存解析結果に `metadata.bones_detail` を追加。
- 既存の解析機能を使用するUI・MCPから同じデータを参照可能。
- テスト38件成功（追加4件）。

## 制約
- BVH元座標系のまま。up軸・単位・回転順の自動統一は行わない。
- FBX/GLB/BVHからPMX/VRMへのアニメーション完全転写は未完成。
- ボーンの自動マッピングとツイスト推定は確実ではなく、VMD出力の実機検証も未完了。
- UIで直接3D編集可能になったわけではない。Ollamaは不要。

## 手動確認
BVH素材を登録し、既存の骨格解析APIで `metadata.bones_detail` に `parent_index`, `offset`, `position` が返ることを確認する。
