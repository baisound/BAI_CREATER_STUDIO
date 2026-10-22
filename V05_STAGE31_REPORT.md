# v0.5 UI刷新 枝番31 実装記録

ブランチ `feature/v05-ui-overhaul-31`。

## 実装
- `studio_project_catalog.set_fps`: 作品単位の有限FPS (1～240) を原子的に保存。既存作品は `fps` 欄が未設定のまま保持。
- GET/POST `/api/studio/v05/project/fps`: 作品FPSの取得・更新。既存のレガシー編集データに影響を与えない。
- 標準MCP・WebMCP: `bai_studio_project_fps_get/set` を共通APIへ接続。
- `camera-diagnostic-v31.js`: 既存の `bai:diagnostic` イベントを `/api/studio/v05/diagnostic` へ転送。サーバーの既存JSONLローテーションと機密値除去を利用。カテゴリとコードを制限し、メッセージ全文はサーバーへ送らない。

## テスト
- `python -m unittest -v test_v05_stage31.py` 3件PASS
- `node test_v05_camera_v30.cjs` PASS
- `node test_v05_camera_v29.cjs` PASS
- `python -m unittest -q test_v05_stage20.py` 6件PASS
- Python/JavaScript構文検査 PASS

## 未実装・未検証
- GPUによるDOFぼかしの実描画。v30のフォーカス描画インターフェースはまだ実レンダラー未登録。
- ブラウザ上でのFPS設定変更UIと、プロジェクト選択直後の自動GET適用（APIと翻訳UIの結合は次段階）。
- MCP/WEBMCP実通信、ブラウザE2E、実3Dモデルレンダリング。
- JSONLへの診断ログ実通信（静的なイベント登録とAPI処理のみ）。

## 次段階
1. プロジェクト選択時にAPIからFPSを取得し、カメラ評価へ自動適用。FPS編集フォームをUIに追加。
2. 診断APIのループバック通信テスト、権限境界を含む確認。
3. 現在の実DOF描画経路を監査し、カメラ姿勢・レンズ・ピントの同一時刻評価を統合。
