# BAI Creator Studio v0.15.9 — Ollama / Qwen 任意連携

## 目的
BAI VIDEO PRODUCTIONで使用しているローカルOllamaを共用する。未接続・未起動・タイムアウトでも通常の制作機能を停止しない。外部LLM APIは必要ない。

## UI
画面末尾の「BAI AI Manager」からON/OFF、モデル名、接続確認、日本語姿勢指示を利用する。初期モデルは `qwen3.5:9b`、代替候補は `qwen3:8b`。構造化指示は提案のみで、IK実行、3D反映、原本変更、VMD出力を行わない。

## API
- `GET /api/ai/settings` : 設定を取得
- `POST /api/ai/settings` : 設定を更新（enabled, default_llm など）
- `GET /api/ai/status` : Ollama `/api/tags` を短時間確認。未接続時は `available:false`, `manual_available:true`
- `POST /api/ai/pose-proposal` : `{"text":"右手を上げて"}`。Ollamaに接続できた場合のみ構造化制約を返す。元データは変更しない。失敗時503。

## AI設定
初期値は `bai_ai_manager.DEFAULTS`。個人設定は `data/bai_ai_config.json` に保存しGitには登録しない。URLはローカルOllama標準ポートだけ許可。

## 手動UI / WebMCP / 標準MCP
- `bai_ai_status`
- `bai_ai_settings`
- `bai_ai_pose_proposal`

通常操作とAI操作は切り離されている。AIを無効化しても制作アプリの起動、既存FBX/PMX/VMDの閲覧、編集、保存には影響を与えない設計。

## 検証
`python -m unittest -v test_bai_ai.py`
`python -m py_compile server.py bai_ai_manager.py mcp_server.py`
`node --check bai_ai_ui.js && node --check webmcp.js`
Ollama未起動時のAPI応答はローカルHTTPで確認済み。

## 未完了
- 実際のQwenによる文章推論テスト（この環境にOllamaがない）
- IKの拘束条件へ提案を反映する処理
- BAI VIDEO PRODUCTIONの実設定ファイルとの共用
- RAGのEmbeddingモデル・知識索引
- 実ブラウザUI、WebMCPエージェント実操作
- 推論キャンセル・ジョブキュー
