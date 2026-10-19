# Phase E 統合保存の競合制御チェックポイント

## 対応した既存要件
CAM-015とプロジェクト統合保存の整合性。新機能追加ではなく、MCPとUIが同じカメラプロジェクトを変更する際の上書き防止。

- `project_state_bundle.bundle_revision`: コンビネーション・カメラ・ワークスペースの保存状態からSHA256版を算出。
- `GET /api/project/bundle`: `revision` を返す。
- `POST /api/project/bundle`: If-Match欠落428、版不一致409、保存前にロック内で照合。
- `camera_project_bundle_ui.js`: GETで受け取った版をPOSTに渡す。

## 検証と限界
`python -m unittest -q test_bundle_revision test_project_state_bundle test_camera_project_revision test_camera_sequence_edit`：19件成功。JS構文・Python構文成功。
実ブラウザー／実MCPホスト操作と電源断耐性は未検証。古いクライアントは428になり更新が必要。コンビネーション単体保存のような別経路の競合制御は未監査。Phase E完成扱いは禁止。

## 次の再開地点
統合保存の失敗時復元、別経路の保存競合、MCPとUIの実環境往復テスト。その後、残りCAM-001〜018の未達項目をロードマップに従って実装。
