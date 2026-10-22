# 枝番06：素材検索とタイムライン配置の保存

## 完了
- 登録済み素材をカテゴリ・名前で検索するAPI（GET /api/studio/v05/assets）
- プロジェクトID別のクリップ配置を読み込むAPI（GET /api/studio/v05/arrangement?id=...）
- 登録素材をトラックと開始時刻・長さで配置するAPI（POST /api/studio/v05/arrangement/place）
- JSONのアトミック更新と楽観的リビジョン検証、異常値拒否
- v0.5素材パネル内の実素材検索・配置フォーム
- 標準MCP/WebMCPへ同じ三操作を登録

## 未完成／注意
- これは独立したv0.5クリップ配置データであり、旧3Dエンジンのタイムラインは変更しない。
- 旧エンジンでの再生、リターゲティング、表情・口の合成、素材プレビューを含む統合は未実装。
- 実ブラウザ画面およびMCP/WebMCPの実通信試験は未実施。JS構文・Python単体試験と登録経路を確認。
- モック側の従来のダミー素材一覧は残存し、今回の実素材フォームは区別して表示。

## テスト
- python -m unittest discover -s tests -p 'test_studio_v05*.py' -v : 24件成功
- python -m py_compile server.py mcp_server.py studio_v05_arrangement.py
- node --check webmcp.js
- node --check studio/v05/js/asset-workflow-v06.js

## 次段階
- 配置データと既存のタイムライン表示・再生状態の双方向同期。
- 専用素材管理ページと簡易素材パネルのデータ統一。
- 音声・動き・顔・カメラ・エフェクト別の配置先検証とクリップ編集。
