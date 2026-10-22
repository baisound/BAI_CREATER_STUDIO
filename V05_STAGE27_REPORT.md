# BAI Creator Studio v0.5 — UI Overhaul 27

## 実装
- 既存Three.jsモデルプレビューの `host.scene` を共有して、独立した `PerspectiveCamera` と `WebGLRenderer` による撮影小窓を実装。
- `BAIStudioShootingCamera` に撮影カメラを登録し、`bai:camera-pose-evaluated` の位置・回転・画角等の評価結果を反映。既存の自由視点カメラは編集しない。
- プレビュー破棄でイベント・撮影カメラ・WebGLリソースを解放。
- 既存の標準MCP/WebMCPの時刻変更→API→画面ポーリング→共通時刻イベント→カメラ評価経路を再利用。追加専用ツールはなし。

## テスト
- `node test_v05_shooting_preview_v27.mjs` PASS（独立カメラ、描画、イベント、破棄）。
- `node test_v05_actual_motion_v22.mjs` PASS（16検証）。
- `node --check`（新規・変更JS）PASS。

## 未検証・未完了
- 実ブラウザWebGL表示と実3Dモデル上のカメラ軌道検証。
- MCP・WebMCPの実通信を含むE2E。
- 映像の実DOF、FPS設定の作品別統合。
- カメラ評価APIから返る姿勢データのすべてのケースの実機座標系整合性。
- 複数モデル同時描画は設計のみ、実装対象外。

## 保護
- `main` を変更せず枝番ブランチで実装。
- 既存の大規模な未コミット変更は未整理・未破棄。
