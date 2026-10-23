# UI全面刷新 枝番03：プロジェクト一覧

専用APIでプロジェクト一覧メタデータを永続化します。GET/POST `/api/studio/v05/projects` と POST `/api/studio/v05/projects/rename`。保存先は `data/studio_v05_catalog.json`。従来の `data/project_state.json` とカメラ保存データには触れません。

v0.5画面の一覧・作成はこのAPIを使用。APIなしではデモ表示とし、作成の永続化は拒否。WebMCPおよび標準MCPに一覧・作成・名称変更を追加。

**重要**：これは一覧メタデータの保存のみで、作品別の編集状態の切り替えではありません。残りの機能は未完成です。
