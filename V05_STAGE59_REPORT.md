# BAI Creator Studio v0.5 — 枝番59 実装・テスト報告

## 目的と結論
複数モデル用の共有Three.jsシーンに、シーンインスタンスID単位で独立したモーションクリップを割り当て、共通タイムラインの時刻に基づき別々に姿勢を評価する処理を追加。今回のテストでは2モデルの評価を行った後、共有シーンに1回のみ描画要求を渡すことを確認。実GPU・実VRM/PMX・実MCP通信での完成判定は行っていない。

## 実装
- `studio_v05_multi_motion.py`：作品別モデルインスタンス・モーションクリップ割り当て、形式互換性・時間重複・不正対象検証、リビジョン付き保存。
- `server.py`：GET `/api/studio/v05/scene/multi-motion-plan`、POST `/api/studio/v05/scene/motion-target`。
- `mcp_server.py`, `webmcp.js`：`bai_studio_scene_multi_motion_plan`、`bai_studio_scene_motion_target_set`。
- `studio/v05/js/multi-model-motion-v59.js`：モデル別のモーションローダー・評価器とマスター時刻からの相対時刻計算。作品切替時に古い再生オブジェクトを破棄する。
- `multi-model-runtime-v58.js`：モデル別の再生評価器の登録・取得、共有ホストで1回描画。
- `multi-model-ui-v58.js`：再生対象モデルを選択して保存、実モーションローダーと独立プレイヤーの接続、共通シークUI。
- `persisted-seek-v23.js`：保存済み再生位置更新イベントの配信。
- `jp.json`, `en.json`：追加UIラベル。
- `docs/v05/ROADMAP_V23_JA.md`、`docs/v05/PROGRESS_STAGE59_JA.md`：到達点と残課題、暫定進捗率。

## 重要な制限
- VMD/GLB/FBXの実素材とWebGL描画をWindowsで実際に確認したわけではない。レンダラーのインターフェースを模擬したテスト。
- 1モデルに複数のVMDプレイヤーを連結する際の補間・姿勢復帰・ブレンド品質は実機検証待ち。重なった全身モーションは競合として拒否する。
- 旧単一モデルのモーション紐付けは変更しない。複数モデル向けに `target_scene_instance_id` を追加した。
- 標準MCP・WebMCPの登録/API経路は実装済みだが、クライアントからのプロトコル通信は未検証。
- ロード失敗時はモデル別にエラーを区別する。読めない素材を無理に再生成功扱いしない。

## 実施検証
- Python: `python -m unittest -q test_v05_multi_motion_v59 test_v05_scene_instances_v57 test_v05_motion_plan_v56 test_v05_scene_model_v55` → 23件合格。
- Node: `node test_v05_multi_motion_v59.cjs` → 合格（2モデル独立評価、単一描画、姿勢リセット、後始末）。
- Node: `node test_v05_multi_model_v58.cjs`、`node test_v05_shared_scene_v57.cjs`、`node test_v05_actual_motion_v22.mjs` → 合格。
- `node --check` / `python -m py_compile` / `git diff --check` → 合格。
- HTTP: テストが一時ローカルHTTPサーバーを起動し、モーション割り当てAPIとプラン取得を実行 → 合格。
- ブラウザWebGL E2E・Windows BAT起動・標準MCP/WebMCPのプロトコル通信 → 未実施。

## 次工程
枝番60：実VRM/GLB/PMXを用いた同時描画と同期・シーク、異なるモーション間の切替、フォーカス追従・撮影プレビューとの共存、レンダリング負荷、リソース破棄を検証し、見つかった実装不整合を修正する。
