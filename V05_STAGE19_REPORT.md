# Stage 19 — モーション対象モデルの識別・接続安全性

- 前段階のモーション素材照合を拡張。`target_model_id` を指定したクリップのモデル素材IDと利用可否を検証。
- `BAIStudioAssetRuntime.bindTarget(modelId, preview)` で読み込み済み対象モデルを明示登録。
- 対象モデルが未読み込みなら `target_not_loaded` として接続を拒否。別のモデルに誤適用しない。
- loader は `{targetModelId,targetPreview}` を受け取れる。対象モデル変更時には以前のクリップ接続を解除。
- 既存の `target_model_id` がないクリップには従来の動作を保持。
- 作品切替では登録済みプレビューの参照を破棄。

## 制限

- 本段階はブラウザ内管理層の実装。保存用クリップAPIへの `target_model_id` の追加、モデルの自動読み込み、VMDリターゲティング、実GPU描画は未実装。
- 既存の再生時刻APIとMCP/WebMCPツールは維持しているが、対象モデル登録操作の新規MCP/WebMCPツールは未実装。MCP/WebMCPの実通信も未検証。
- 既存の大量の未コミット変更は保護し、この段階の変更のみコミットする。

## 検証

- `node test_v05_stage18_asset_runtime.cjs`
- `node test_v05_stage19_targets.cjs`
- `node --check studio/v05/js/asset-runtime-v18.js`
