# CAM-015 — 採用ショット読み取りAPI / MCP 接続

- 基点 `eb05335`（MASTER＋マルチカメラ案は**後順位**、この実装に混入させない）。
- `/api/camera/sequence/evaluate?frame=N` は現在保存済みのカメラプロジェクトに基づき、カット区間 `[start,end)` に採用するプリセットか、区間外の通常キー補間を返す。
- WebMCPと標準MCPに `bai_camera_sequence_evaluate`（読み取り専用）を追加。
- VMDカメラ追従優先は従来どおり画面レイヤーが担当。評価APIはVMDの出力や編集を実装していない。
- CAM-015は**未完成**。MCPからの編集、保存UI実機、切替再生のGPU/ブラウザー確認は残る。
- テスト: Python15件・Node3件。実ブラウザー未検証。
- 次の承認済み作業: CAM-015のカット編集に必要なAPI・両MCP書き込み経路の整合と、全Phase E残件の引き続き確認。
