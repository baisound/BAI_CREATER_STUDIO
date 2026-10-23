# BAI Creator Studio v0.5 — 枝番61 実装・テスト報告
更新日：2026-10-23

## 概要
共通XYZ Transformモジュールを作成し、実3Dシーンに読み込まれたモデルの位置・回転・倍率を編集・保存できる経路を追加。
カメラ・ライト・3Dエフェクトは同一Transform型を受け付けるが、保存と実描画を行う種別別アダプターは未接続。

## 変更ファイル
- `studio/v05/js/spatial-transform-v61.js`: 非描画依存のTransformレジストリ、begin/preview/finish/cancel。
- `studio/v05/js/spatial-ui-v61.js`: Three.js TransformControls＋数値インスペクター、保存失敗ロールバック、選択切替。
- `studio/v05/js/multi-model-ui-v58.js`: 共有シーンの実ルート登録、既存scene/instances APIへの書き込み。
- `studio/v05/index.html`: 既存モック内XYZ入力も共通Transformコア経由へ統一。
- `studio/v05/locales/jp.json`, `en.json`: `spatialV61` 翻訳ラベル。
- `test_v05_spatial_transform_v61.cjs`, `test_v05_spatial_integration_v61.cjs`: 専用検証。

## データ契約
```
transform = {
  position: [number, number, number],
  rotation: [number, number, number],  // degree, UI
  scale: [positive number, positive number, positive number]
}
```
`/api/studio/v05/scene/instances`の保存では`project_id`,`action:"update"`,`revision`,`instance_id`,`transform`を利用。カメラ・ライト・エフェクトの保存は種別の既存APIと設計を照合して後続で接続する。

## 操作・保護
- 実モデル：共通XYZインスペクターで数値入力、TransformControlsギズモ切替。
- W/E/R: 実3Dプレビュー内の操作モード切替（テキスト入力フォーカス時は無効）。
- 更新中二重操作とロック対象は拒否。
- 保存エラーで変更前のTransformへロールバック。旧モックも別途共通コアの入力検証を利用。
- 複数モデルごとに独立のTransformがあり、他のモデルの位置・回転を変更しない。

## 実施した検証
- `node --test test_v05_spatial_transform_v61.cjs test_v05_spatial_integration_v61.cjs test_v05_shared_scene_v57.cjs test_v05_multi_model_v58.cjs test_v05_multi_motion_v59.cjs test_v05_multi_motion_v60.cjs` → 成功
- `python -m pytest -q test_v05_scene_instances_v57.py test_v05_scene_model_v55.py test_v05_multi_motion_v59.py` → 成功
- `node --check`、`git diff --check`、翻訳キー一致 → 成功。
- **未実施**：実ブラウザ、WebGL・VRM/PMX、MCP/WebMCP実プロトコル、Windows起動、全ソース網羅テスト。

## 残課題
1. 枝番62：ワールド／ローカル操作、スナップの正しい座標計算。
2. カメラ／照明／エフェクト種別の実エンジン・永続化アダプター。
3. 複数選択、統合Undo/Redo（既存承認済み順序に従う）。
4. GUI操作・Windows・GPU、MCP／WebMCP実通信のE2E。
5. 進捗は`docs/v05/PROGRESS_STAGE61_JA.md`を参照。
