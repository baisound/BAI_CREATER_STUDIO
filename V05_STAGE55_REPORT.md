# BAI Creator Studio v0.5 — 枝番55 実装報告

## 要件と範囲
ロードマップ枝番55：登録済み3Dモデルを作品のシーンへ選択・配置・保存し、既存の実Three.jsモデルローダーから表示できる入口を作る。
複数モデル共有シーンは別設計のため、v55は1作品1モデルのみとする。保存対象はXYZ Transform（位置、回転°、倍率）。
既存のシーン・モデル・モーションデータは上書きしない。

## 実装
- `studio_v05_scene_model.py`：作品ID別の単一モデル配置。原子保存・revision競合検出・厳密な素材種別確認・数値安全性検証・削除時も元素材を保持。
- `server.py`：`GET /api/studio/v05/scene/model-candidates`、`GET /api/studio/v05/scene/model?id=<project_id>`、`POST /api/studio/v05/scene/model`。
- `studio/v05/js/scene-models-v55.js`：3Dモデル選択、XYZ編集、保存、削除、再読込、実プレビュー起動。
- `studio/v05/js/actual-motion-ui-v22.js`：既存の実ローダーへ作品IDとモデル素材・XYZ変換を渡す `BAIStudioScenePreview` を公開。
- `studio/v05/js/actual-motion-loader-v22.js`：同じモデルIDの重複読み込み防止。
- `mcp_server.py`・`webmcp.js`：候補取得・配置取得・保存（削除含む）の3操作。
- `jp.json`・`en.json`：新UIのラベル。

## 対応する登録済み3D形式
- `integrated` のモデル用 GLB・VRM・FBX
- `library` の GLB (stage/prop)
- `mmd` の PMX (A/B)
- `fbx` の modelA/modelB
これ以外のものは選択候補から除外。ファイルを推測したURLで開かない。
ローダーが実際に解析可能かは素材内容・ライブラリ・GPU環境に依存する。

## 仕様境界と未完了
- この工程は単一モデルの手動プレビュー入口。プロジェクトを開いた瞬間の自動描画ではなく、明示的な「実3Dで表示」で起動する。
- モデルのインスタンスをシーンへ永続保存するが、共通XYZギズモの実編集、複数モデルの同時表示と独立アニメーションは後続。
- 登録素材の一括取り込み形式拡張（VRM・PMX・VMD等）は後続。
- 作品全体のスナップショット保存経路への統合は別の既存課題。
- モデル描画・モーションを実ブラウザで操作するE2E、実WebGL、Windows起動、MCP/WebMCPプロトコル実通信は未検証。
- `loadTarget` は読み込み済みモデルの `seek` に対応するが、モーション自動適用までは本工程では保証しない。
- `asset_inbox` で参照登録された GLB 等のモデルは現在の既存3Dローダーでは直接表示できないため、本工程の候補から除外する。

## 検証
- `python -m unittest -q test_v05_scene_model_v55.py test_v05_asset_sources_v54.py test_v05_asset_import_v53.py`：16 tests PASS
- `node --check`：変更JavaScript・WebMCPはPASS
- `python -m py_compile`：変更PythonはPASS
- 隔離した `BAI_DATA_DIR` を使う localhost HTTP smoke：候補・GET・POST・保存後GET、revision競合409を確認。
- `git diff --check`：PASS
- 表示プレビューの実WebGL・各MCPプロトコル実通信は未実施。
- Python起動時に環境の任意の `artifact_tool` warmup 警告がstderrへ出る場合があったが、ユニットテスト自体は終了コード0。

## 次工程
枝番56：既存モーション・リターゲティング処理を、保存済みモデル配置と対象モーションへ接続する（対応形式を検証し、非対応の組合せを無理に再生しない）。
