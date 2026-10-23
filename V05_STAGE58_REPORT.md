# BAI Creator Studio v0.5 — 枝番58 実装・検証報告

## 変更の目的
枝番57で保存できるようになったシーンインスタンスを、実際のThree.js共通シーンへ読み込み、同じ素材から作成した2体のモデルも別々の3Dオブジェクトとして描画可能な経路を確立する。

## 実装
- `studio/v05/js/multi-model-runtime-v58.js`: 非同期シーン差分適用、作品別世代管理、モデル単位の独立読込、Transform・表示更新、モデル削除時の解放、エラー隔離。ブラウザ不要の契約テスト可能。
- `studio/v05/js/multi-model-ui-v58.js`: 旧`loadLibs/loadModel/normalizeModel/createViewport`を再利用し、**単一Three.js scene・renderer・camera**に複数rootを配置。インスタンスごとに毎回`loadModel`し、スケルトン・アニメーション状態の共有を避ける。共有ホストは既存ビューポート描画要求をまとめ、複数Canvasを重ねない。複数モデルプレビュー画面、再読み込み、注目、開閉、状態表示。
- `scene-instances-v57.js`: 新プレビューの導線追加。既存の保存APIを維持し、配置変更イベントで描画データを更新。
- `actual-motion-ui-v22.js`: 従来の単一モデルプレビューを開くときは複数モデル側を閉じ、単一ビューポートの排他制約を維持。
- `jp.json/en.json`: v58の表示文言。
- 標準MCP `bai_studio_scene_preview_plan`: 既存のシーン配置GETを元に表示候補を取得する読み取りツール。**ブラウザの実GPU状態ではない**。
- WebMCP `bai_studio_scene_preview_plan`: 同等の読み取り操作。WebMCP対応ブラウザのv0.5画面に`bai_studio_multi_preview_open/status`を登録し、ローカル画面操作・状態照会も提供。モデル配置の更新は既存 `bai_studio_scene_instances_mutate` を利用。

## 機能の制限
- **今回の段階は複数モデルの3D静的表示のコード接続まで。** 各キャラクター固有のVMD/FBX/GLBモーション再生、表情・口レイヤー、GPUでの複数モデル同時描画の画素検証は未完了。
- 同じ素材を複数回ロードするためモデル別独立性があるが、メモリ使用量は増える。ジオメトリやマテリアル共有のキャッシュは設けない（参照計数とスケルトン分離設計が必要）。
- Three.jsは既存のCDN importmapを参照する。ネット接続のない環境ではライブラリ読み込みに失敗し、画面はエラーを表示する。
- MCP経由のHTTP応答では実ブラウザの描画完了を保証しない。標準MCPが画面を直接開くための通信経路は今後の実装課題。

## テスト・判定
- `node test_v05_multi_model_v58.cjs`: 同一素材の2インスタンス独立性、個別XYZ、削除、作品切替、遅い非同期読み込みの破棄、ロード失敗時の隔離。
- `node test_v05_shared_scene_v57.cjs`: 描画呼び出し1回、モデル単位エラー隔離、世代処理。
- `python -m unittest -q test_v05_scene_instances_v57 test_v05_scene_model_v55`: 保存形式、旧版互換、リビジョン競合、既存API。
- JS/Python構文検査とGitの`diff --check`。
- ブラウザE2E試行：作業環境のChromiumがlocalhostアクセスを管理者ポリシーでブロックしたため未検証。実WebGL表示・FPS・GPUメモリ・MCP/WebMCP実プロトコル通信は完了扱いにしない。

## 次工程
枝番59：シーンインスタンスIDをモーションクリップの適用先へ明示的に結び付け、全モデルを共通時刻で独立にモーション評価した後、1フレーム1回描画する。既存の単一モデル再生処理を非破壊で拡張。
