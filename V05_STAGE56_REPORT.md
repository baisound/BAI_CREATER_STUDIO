# BAI Creator Studio v0.5 — 枝番56 実装・検証報告

## 目的
枝番55の単一シーンモデルと保存済みモーションクリップを関連付け、既存のモーションプレイヤーとリターゲティングプレビューを再利用する。
元のモデル・ボーン・モーションデータを変更しない。複数モデル対応は既存設計を維持し、本工程に割り込ませない。

## 実装
- `studio_v05_motion_plan.py`：作品別のシーン配置・モーションクリップ・登録済み素材を照合した読み取り専用プレビュー計画。未指定・モデル不在・形式不一致・素材欠落を明示し、勝手に対象モデルを選ばない。
- `GET /api/studio/v05/scene/motion-plan?id=<project_id>`：候補・レディ状態・対象モデル・再生可能クリップ（プレビュー用）・素材メタデータを返す。副作用なし。
- `studio/v05/js/motion-bindings-v56.js`：日本語UIによるクリップの選択、既存のrevision保護された `POST /api/studio/v05/arrangement/clip/target` による対象保存、既存 `BAIStudioScenePreview.show` の呼び出し。
- `studio/v05/js/asset-workflow-v06.js`：従来の情報不足の素材検索レスポンスではなく、実ローダーに必要なメタデータと対象モデル検査済みの計画を利用して再生接続。
- 標準MCP・WebMCP：`bai_studio_scene_motion_plan`（読取）を追加。変更操作は既存 `bai_studio_clip_target_set` を再利用。
- `jp.json`・`en.json`：新規UI表示文字列。

## 現在の対応・非対応
- 既存の単一モデルローダーが対応する候補のみに限定。PMX＋VMD、PMX/GLB/VRM/FBX＋GLB/FBXモーションの形式レベルの判定を実装。
- 形式の組合せが有効でも、実際の骨構造・アニメーションクリップ・GPU描画の成功は保証しない。既存ローダーが失敗した場合はそのエラーを表示。
- VRM/GLB/FBXへVMDを自動リターゲティングする機能を新規実装したわけではない。
- 素材取り込み方式や、複数モデル共有シーンは本工程の範囲外。
- 作品全体の完全な状態保存・書き出し、実ブラウザE2E、Windows BAT起動、MCP/WebMCP実プロトコル通信は未検証。

## 検証
- Python unittest：枝番56、55、54、53、20、クリップ編集の関連34件 PASS。
- JS：v22実ローダー契約16項目、v18素材再生管理10項目、v23時刻同期8項目 PASS。
- `node --check`、Python `py_compile`、`git diff --check` PASS。
- 隔離したHTTPサーバーによるGETプラン→POSTターゲット設定→GETプランの往復テスト PASS。
- 実GPU描画によるボーン変形・最終映像は未検証。

## 次工程（枝番57以降）
承認済みの複数モデル用設計に照らして、共有シーンのモデルインスタンスID分離、複数モデルの配置・描画・同期を実装する。既存実装を二重化しない。
