# Phase 00 第3段階（v0.12.2）

## 追加機能
- GLB: GLTFLoaderで原本をブラウザ内にロードし、GLB内のアニメーションクリップを切り替えて再生。
- VRM: GLTFLoaderによる汎用glTFとしての静的プレビュー。VRM Humanoid転写、表情、SpringBone物理は未実装。
- 正面/側面/斜めの3視点比較。**同一モデルの異なる視点**であり、元モーション対転写モーションの比較ではない。
- 接地QA: 表示時点のメッシュAABBの底面が床より下にあるかを検査。足IK・足滑り・連続フレーム検査ではない。
- UIは統合素材タブ内へ配置。既存82件、統合227件、保存データ、Git履歴を維持。
- WebMCP: `mixamo_integrated_preview`, `mixamo_integrated_preview_qa` を追加。

## 制約・検証繰越
- 依存ライブラリは現状CDN経由。完全オフライン化は別作業。
- VRMの本格的リターゲティング、3体の同期比較、足IK/床貫通解析は未実装。
- 実機ブラウザでのVRM/GLBの見た目とアニメーション検証は次工程へ繰り越し。
- ソースファイルは変換・削除しない。

## MCP 操作
- WebMCP `mixamo_integrated_preview` (`asset`)、`mixamo_integrated_preview_qa`（メッシュ底面評価）
- 標準MCP `mixamo_integrated_preview` (`asset`) は `/api/sync-command` 経由でブラウザへプレビュー指示。ブラウザが閉じている場合は再生しない。
- 登録済みの `.glb` / `.vrm` のみ許可する。
