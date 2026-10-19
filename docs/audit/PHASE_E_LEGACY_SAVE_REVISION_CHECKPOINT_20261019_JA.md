# Phase E 従来プロジェクト保存の版照合 — チェックポイント

- 基点: `642a8ad`。
- 既存の `/api/project` 書き込み処理2経路に、任意の `If-Match` 版照合を追加。版が合わなければ HTTP 409 とし、既存データを上書きしない。
- 版文字列は `camera_project_revision.revision` と同じ正規化JSON SHA-256方式。
- **未完成**: クライアントによる版の取得・送信の標準化、版指定なし旧クライアントの競合防止、WebMCP/標準MCP含む全書き込み経路の統合試験、電源断復旧、素材/VMDと作業状態の完全復元。
- APIの後方互換性のため、`If-Match` 未指定の旧クライアントは引き続き保存可能。競合リスクは解消されない。完成とは判定しない。
- 検証: `python -m unittest test_legacy_project_revision test_bundle_revision test_project_state_bundle -q`、 `python -m py_compile server.py`。
- 後順位のMASTER複数カメラ拡張は未着手。オーナーが依頼したPhase Eの残件を優先。
