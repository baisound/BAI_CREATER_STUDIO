# P2-WP-05a/b/c 独立レビュー（2026-10-21）

## 範囲と判定

Claudeが実装したWP-05aの `app.js` の `modeSwitch`・`featureBottom`、WP-05bの `project.js` の `tick` とworkspace記録・`motion-view.js` の外部コマンド、WP-05cの `editCombination`・選択/速度・`chain-view.js`・`favorites.js` を、実装者と別のCodex（高性能モデル区分、GPT-6）がPR #20統合時に読み取り点検した。設計 §2.5 の05a/b/cの受け入れ条件と照合し、**この範囲に統合を止める指摘はない**。WP-05d以降やP2全体の完成判定ではない。

| 境界 | 確認結果 |
|---|---|
| SCR-13モードと下部 | `?mode=edit/compare` の移動でクエリ・タブを保ち、下部featureは既存の外枠・後始末に従う。 |
| workspace所有 | UIは `setWorkspaceFields` のみからclip/frameを書き、cameraInvalid時は拒否する。frameだけではdirtyにせず、clipが変われば統合保存対象にする。カメラの尺で丸め、元モデルは変更しない。 |
| 外部同期 | `tick` は初回コマンドを再生せず、IDの重複を抑える。受け口はSCR-13またはSCR-05の表示中だけ作用し、画面外では通知のみ。非同期読込後も現画面を再確認する。 |
| 履歴と自動保存 | 最初の実編集で初期状態を積み、カーソル以後を切り、100件を上限とする。保存中の追加編集はdirtyを残して再保存し、選択のみでは保存しない。 |
| お気に入り | 保存・削除は同一画面内で逐次化し、直前GETの一覧へ変更を反映する。失敗時は編集ダイアログを残す。 |

## 実行確認

- Node：`studio-p2-motion-logic.test.mjs` と `studio-p2-motion-fork.test.mjs`、計20件合格。
- 隔離Chrome：WP-05cの `studio-p2-chain.test.cjs` 対象9件合格。WP-05bの `studio-p2-motion.test.cjs` 対象6件合格。実データを使わず、テスト用サーバーは8852/8853番。既存の8765番サーバーには触れていない。
- PR #20の既存共通ゲート記録は `P2_PORT_STATUS.json` にあり、今回の同期は文書と `WORK_STATE.json` のみで、機能コードの変更はない。

## 残る制限

お気に入り・対応表のGETからPOSTまでをサーバー側の版条件で保護していないため、別画面から同時に書いた場合の競合は設計K12として残る。実利用者のFBX/PMX/VMDと実GPUは未検証。WP-05eの独立レビューはこの判定に含めない。
