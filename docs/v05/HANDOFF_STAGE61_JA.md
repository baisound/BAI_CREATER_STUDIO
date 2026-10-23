# BAI Creator Studio v0.5 — 次チャットへの開発引き継ぎ（枝番61）

## 0. 最初に実行すること
1. パックに含まれる `BAI_Creator_Studio_v05_UI_OVERHAUL_61_FULL_GIT.zip` を展開して、そのルートで作業する。`.git` が含まれる。
2. `git status --short`、`git branch --show-current`、`git log -3 --oneline` を確認する。ブランチは `feature/v05-ui-overhaul-61`。`main` を書き換えない。
3. `AGENTS.md`、`docs/roadmap/README_JA.md`、`docs/v05/ROADMAP_V23_JA.md`、`docs/v05/PROGRESS_STAGE61_JA.md`、`V05_STAGE61_REPORT.md` を読み、既存の承認済み順序を尊重する。
4. `docs/v05/PROGRESS_STAGE61.json` はAI向けのコンパクトな状態記録。テスト内容を深掘りする時だけ報告書を読む。
5. **次工程は枝番62**。独立ブランチ `feature/v05-ui-overhaul-62` を作り、既存の機能を維持したまま進む。

## 1. 直近コミット
- 枝番61の実装・進捗：`04888e03bfd259e3dfd10d7dfd05c696819b47e9`
- この引き継ぎ文書および進捗JSONは別コミットで追加。
- 最終 HEAD の正確なハッシュは展開後に `git rev-parse HEAD` で確認すること。

## 2. 枝番61でできたこと
- 空間オブジェクト共通XYZの正規化・入力検証・ロック・ロールバック・二重操作の防止。
- 読み込み済みモデルのThree.jsルートへ実TransformControlsを接続するコード。
- 数値編集とギズモ操作を既存のリビジョン付き `/api/studio/v05/scene/instances` に保存。
- モデル配置の独立性、旧モックの入力検証、日本語と英語の `spatialV61` ラベルを追加。
- 追加APIや重複したMCPツールは作成せず、既存 `bai_studio_scene_instances_get/mutate` を維持。

## 3. 未完了（絶対に完成扱いにしない）
- カメラ／照明／3Dエフェクト実オブジェクトの保存アダプターは未接続（共通Transform型のみ）。
- 座標系のワールド／ローカル切替は本格的な計算を未実装。スナップ・ピボット・軸拘束等は枝番62の範囲。
- Windowsブラウザでのギズモ実操作、実VRM／PMX、WebGL描画、MCP・WebMCP実プロトコル試験は未検証。
- モーションやカメラ・DOFの過去からの実GPU／GUI未検証事項も残っている。

## 4. 次工程の優先順序（枝番62）
1. 既存の保存単位とThree.js TransformControlsの座標系・回転表示を監査。
2. ワールド／ローカルの切替が**実際のXYZ計算**に反映されるようにする（表示ラベル切替だけでは不可）。
3. 移動・回転・倍率の軸拘束とスナップを追加。ワールドとローカル、親子付け時に結果を検証。
4. UI・API・MCP・WebMCPと保存経路を揃える。既存操作は再利用し、重複ツールを増やさない。
5. 単体・回帰テストを実行。実機試験不可なら未検証を明記し、進捗記録／ロードマップを更新。
6. 新ブランチへのコミット後、`.git`全体入りZIPを作り、そのZIPを含む次チャット引き継ぎパックを作成。

## 5. 確認コマンド
```powershell
git branch --show-current
git status --short
git log --oneline -5
node --test test_v05_spatial_transform_v61.cjs test_v05_spatial_integration_v61.cjs test_v05_shared_scene_v57.cjs test_v05_multi_model_v58.cjs test_v05_multi_motion_v59.cjs test_v05_multi_motion_v60.cjs
python -m pytest -q test_v05_scene_instances_v57.py test_v05_scene_model_v55.py test_v05_multi_motion_v59.py
```

## 6. 進捗記録
- **総合暫定値：37.0%**。枝番60から据え置き。GUI連携率と実GPU合格率の個別値は未算出。
- 枝番消化率61/112=54.46%は製品完成率ではない。
- 計算根拠と未検証事項は`docs/v05/PROGRESS_STAGE61_JA.md`を参照。

## 7. ソースの主な入口
- `studio/v05/index.html`: 画面とモック。
- `studio/v05/js/spatial-transform-v61.js`: 共有XYZレジストリ。
- `studio/v05/js/spatial-ui-v61.js`: ギズモ・数値インスペクター。
- `studio/v05/js/multi-model-ui-v58.js`: 実3Dロード・シーン保存経路。
- `studio_v05_scene_instances.py`: 作品別シーン配置保存APIロジック。
- `server.py`: API。
- `mcp_server.py`、WebMCP関連コード：既存操作の登録・エンドポイント。
- `studio/v05/locales/jp.json`、`en.json`: v61ラベル。

## 8. 作業ルール
`main`に直接書かず、未追跡データや原本素材を勝手に削除しない。LFを維持し、各段階でテスト・Gitコミット・ロードマップ・進捗・完全Git付きZIPを更新する。実行環境が使えないときは完了を偽装しない。
