# P2-WP-07 書き出し監査（2026-10-22）

## 対象と現行コード

| 操作 | 現行の入口 | 移植先 | 書込先・注意 |
|---|---|---|---|
| VMD変換用ボーン対応表 | `index.html` の `#vmd-bonemap`、GET/POST `/api/conversion-map` | SCR-23 の「エクスポート」 | `data/conversion_map.json`。パターン手順とFBXの対応 `/api/mapping` は別物で⑤が保持する。 |
| コンビネーションから変換ジョブを作成 | `#vmd-job`、POST `/api/export-vmd-job` | SCR-23 | 登録済みFBXの名前に解決した順序列と非空のボーン対応表を送る。`exports/vmd_conversion_job.json` は `BAI_DATA_DIR` の外へ書く。 |
| Blender変換 | `#vmd-run-direct`、POST `/api/run-vmd-conversion`、GET `/api/conversion-status` | SCR-23 | `confirm:true` とスロットA/Bを送る。実行は最大240秒。VMDは `exports/chain_motion.vmd` とMMD素材登録へ反映される。 |
| カメラVMD | `camera.js` の `#vmd-native-export` | SCR-02の既存カメラタブ、SCR-23から案内 | POST `/api/camera/vmd/native/export` はバイト列を返す。 |
| 診断ZIP | GET `/api/diagnostics/export` | SCR-24の既存リンク、SCR-23から案内 | 既存機能を重複実装しない。 |

## WP-07の実装判断

1. SCR-23にボーン対応JSONの編集・保存、現在のコンビネーションからのジョブ作成、Blender実行、変換結果の取得を同じカードに置く。SCR-13の◇書き出しボタンはSCR-23へ案内する。SCR-07/17の動画レンダリングはPhase Fのまま。
2. 手順名から登録済みFBXへの解決は旧画面の規則（`manifest.mapping[name]`、無ければ正規化した名前）と同じにする。見つからない手順を明示し、ジョブを送らない。ジョブ作成時に使った対応表・コンビネーションが後で変わった場合は、再作成するまで実行ボタンを使えないようにする。
3. 実行は確認ダイアログを経て `confirm:true` を送る。状態を1秒ごとに問い合わせ、進捗率は作らず「実行中（経過N秒）」だけ示す。画面を離れても通信・問い合わせは続け、戻れば最新結果を表示する。新規画面表示時は前回のサーバー状態も読み、過去の成功を今のジョブ成功と誤認させない。
4. テストのPOST `/api/export-vmd-job`・`/api/run-vmd-conversion` は **Playwright `page.route` で必ず捕捉**する。本文とUI応答を確認し、実リポジトリの `exports/`・Blender・実素材は変更しない。MCPとの機能同等性、Blender変換の実データ妥当性はP2の合格と別に記録する。

設計・監査は標準モデル区分（GPT-6）で実施。独立高性能モデルによるO-⑦のレビューは未実施として残す。

## 実装と検証（2026-10-22）

- SCR-23に対応表の編集・保存、登録済みFBXを解決したVMDジョブ作成、ローカルBlender実行の確認、実行状態・結果の表示を接続した。SCR-13からSCR-23へ、カメラVMDはSCR-02へ案内する。動画レンダリングはPhase Fの範囲と表示する。
- 保存済みの対応表を取得できないときは保存・ジョブ作成を無効にし、上書きを防ぐ。対応表またはコンビネーションが変わった後は古いジョブの実行を無効にする。実行中は状態を問い合わせ続け、秒数のみ表示する。
- `tests/studio-p2-export-model.test.mjs` は登録済みFBX名の解決と不正な対応表の拒否、`tests/studio-p2-export.test.cjs` はジョブ内容、実行確認、失敗表示、対応表保存・再読込、画面を離れた実行中の状態取得を確認する。書込を伴う変換POSTはPlaywrightで捕捉し、テストデータ以外の素材と実際のBlenderは変更しない。
- `tests/studio-p2-e2e-main.test.cjs` のS8で、歌ってみた制作の最初からVMDジョブ作成・実行確認まで通した。実データ7ファイルのハッシュは前後一致。画面共通回帰は27画面20件成功。型チェックも成功。
- PR #57更新分を統合後、P2 Node 249件成功・2件計画スキップ、Python全体386件と50サブテスト成功、画面20件成功、S8までの通し操作成功。`npm run test:node-all` は2回とも355件を完走し、各342件成功・11件計画スキップ・2件失敗。後半の画面試験でWindowsの `ERR_NO_BUFFER_SPACE` と要素待機の時間切れが生じ、失敗箇所は隔離再実行で成功した。一括ゲートの失敗0件は未確認として台帳に残す。実データ7ファイルのハッシュは前後一致。
- 実Blenderでの変換品質、MCP経路との一致、実GPU/Linux、独立高性能モデルレビューは未検証。MOTION-006/007全体を完了扱いにはしない。

## オーナー確認手順（Phase E実装完了後に依頼）

1. SCR-05で登録済みFBXをコンビネーションへ追加する。
2. SCR-23を開き、現在の手順数、VMD用ボーン対応とジョブ・実行の操作が表示されることを確認する。

ジョブ作成と実Blender変換はリポジトリ直下の `exports/` を書き換え得るため、試用データフォルダだけでは隔離できない。オーナー確認では実行を求めず、開発側の隔離Chrome試験と実変換の未検証を区別する。

## 独立レビュー（2026-11-03、高性能モデル Claude Opus 系）

対象はコミット `0171076` の SCR-23（`studio/js/features/export-view.js`・`export-model.js`）と、その試験。旧 `index.html` の `#vmd-job`・`#vmd-run-direct`・`#vmd-check-status` と `server.py` の `/api/conversion-map`・`/api/export-vmd-job`・`/api/run-vmd-conversion`・`/api/conversion-status` に照合した。

| 観点 | 結果 |
|---|---|
| FBX名の解決（`manifest.mapping` → 正規化名） | 旧画面と同じ。順序も同じ。`scale:1`・`bone_map` も同じ本文。 |
| 対応表の検査 | 新UIは空の名前と128文字以上を送信前に拒否する。サーバーの検査（128文字未満の文字列）より少し厳しいが、旧データを壊す方向ではない。 |
| 実行の確認・スロット | 確認ダイアログ後に `{confirm:true, slot}` を送る。旧画面は PMX スロットの選択欄から、新UIは画面内の選択欄から取る。 |
| **失敗の表示（バグ・修正済み）** | Blender の失敗は 422 `{status:'failed', returncode, output_tail}` で、`error` が無い。新UIは共通の文言に任せていたため「保存データを読めません：」とだけ出て、原因が分からなかった。409（別の変換が実行中）も「他の画面・MCP で更新されています。再読込…」と誤って案内していた。旧画面は `x.error || x.output_tail` を出していた。`conversionFailureText()` を `export-model.js` に足し、サーバーの理由（`error`、無ければ終了コードと `output_tail` の末尾400文字）を出すようにした。サーバー状態の「失敗」表示も末尾400文字に絞った。 |
| 試験の穴（修正済み） | 失敗の試験は 503（`error` あり）だけで、実サーバーの 422 の形を試していなかった。`tests/studio-p2-export.test.cjs` に 422 の実行を足し、`tests/studio-p2-export-model.test.mjs` に 422・409・504・未接続の単体試験を足した。 |
| 旧画面との差（判断待ち・未修正） | 旧画面は変換成功後に `refreshMmd()` で MMD 素材一覧を読み直し、PMX タブへ移っていた。新UIは結果を表示するだけで、素材一覧の読み直しはしない（SCR-08 などで変換後の `chain_motion.vmd` がすぐ見えるかは未確認）。旧画面にあった結果の `warning`（PMXで目視確認）は、新UIでは固定の文言で同じ趣旨を出す。 |

レビュー後も、実Blenderでの変換品質、MCP経路との一致、実GPU・Windowsは未検証のまま。
