# 旧UI 動作インベントリ（2026-10-20 採取）

対象: `server.py` が配信する旧画面（新UI `/workspace/NN` は対象外）。診断のみで、旧UIの修正は行っていない。
採取: `tools/legacy_ui_inventory.mjs`（Playwright / chromium、`--enable-unsafe-swiftshader`）→ 生データ `docs/ui/legacy_inventory/inventory.json`。
three.js は `cdn.jsdelivr.net` が 403 のため、ローカルの three@0.160.1 へルーティングして採取（`THREE_DIR` 環境変数、`node_modules` はコミットしない）。

## ページ別レイアウト判定

| ページ | URL | 判定 | 1280x720 / 1600x900 / 1920x1080 | 根拠（証拠） |
|---|---|---|---|---|
| 制作画面 | `/`, `/index.html` | **完全に崩れ** | 3解像度とも同一症状 | `<main>`（3カラム本体）の高さが 20px に潰れ、3つの `section.panel` が各 26px。モーション一覧82件・プレビュー・コンビネーションは枠内で切れ操作不能。`main` の外（body直下）に追加された `timeline-studio`〜`bai-pose-editor` 等6セクションが縦に並び、`html,body{overflow:hidden}` のためスクロールできず y=900 以降は到達不能（page高さ 3,400px超が切れる）。操作要素 73 件がゼロサイズ、重なりパネル検出 9〜12 組（例: `#asset-workflow` と `#timeline-studio` が 919x256px 重なる、`canvas#threecanvas` と `#skeleton-lab` が 917x438px 重なる）。横スクロールなし。画像: `index_viewport.jpg` `index_1280x720.jpg` `index_1920x1080.jpg` `index_full.jpg` |
| カメラ画面 | `/camera.html` | **一部崩れ（軽微）** | 3解像度とも主要パネルは収まり、横スクロールなし | 3ペイン構成は成立し操作可能。崩れは (a) 「現在フレーム」数値入力が縦長（約180px）に伸び、隣の「1フレーム ▶」「◆」キーが押せない（操作不能3件）、(b) 1280幅で「表示モデル」セレクトの文字が切れる、(c) 検出された canvas 同士の「重なり」はビュー内の重ね描画で正常。画像: `camera_viewport.jpg` `camera_1280x720.jpg` `camera_1920x1080.jpg` |

旧画面として配信されている HTML は上記2つのみ（`server.py` の `do_GET`、`/` `/index.html` `/camera.html`）。その他の旧JS（`/camera_*.js`, `/motion_layers.js`, `/retarget_ui.js` 等）はこの2ページから読み込まれる。`/workspace/*` `/studio/*` は新UI。

### 崩れの原因診断（修正はしていない）

制作画面（`index.html`）
1. **主因: 「v0.14.0 canonical UI」CSS と後から body 直下に増えたセクションの衝突。** `index.html:25` の `<style id="studio-ui-canonical">`（27行目）が `html,body{height:100%;overflow:hidden}`、`body{display:flex;flex-direction:column}`、`main{flex:1 1 0;min-height:0;...}` を宣言している。ところが `timeline-studio`（CSSは757行付近）、`skeleton-lab`（799行）、`foot-qa`、`bai-ai-manager`、`bai-pose-editor` など後付けの `<section>` は `<main>` の外、body 直下の flex 子要素として置かれている（実測: これらは `flex:0 1 auto` で合計約3,300px）。flex 縮小の結果、`flex-basis:0` の `main` が最小高さ（padding 20px）まで潰され、全パネルが26px化する。body は `overflow:hidden` なので溢れた分はスクロール不能。
2. **従: 画面ごとの `max-height`/`height:100%` 指定が3世代（v0.12.6 の `#chain-side` ブロック、v0.14.0 canonical、末尾の追加CSS）重なり、`!important` で上書き合戦になっている**（`index.html:13-47`）。
3. **JSエラー（ページエラー3件）:** `insertBefore ... is not a child of this node`。候補は `index.html:500`（`#integrated-pane` 内に `.controls` が無い場合の `insertBefore`）、`index.html:510`（`.ui-guidance` が無い場合）、`v01636_40_playback.js:22`（`slider.parentNode.insertBefore(toolbar,slider)`）。いずれも DOM 再配置後に基準ノードが子でなくなる前提崩れ。レイアウト崩れの直接原因ではないが一部パネル（PMX ZIP登録、再生ツールバー）が生成されない。
4. **`/v01641_preview_guard.js` が 404**（`server.py:227` の配信許可リストに無い。`v01633_35_scrub.js:5` が import するため ES モジュール全体の読込に失敗し、スクラブ/キーフレームレビュー機能が動かない）。CSS の 404 はなし。

カメラ画面（`camera.html`）
- CSS は正常読込（`/camera.css` 200）。「現在フレーム」入力の縦伸びは `camera.css` 内の flex/グリッド指定で `input` が行高いっぱいに伸びる（`align-items:stretch` 相当）可能性が高いが、該当行は未特定。
- 同じ `/v01641_preview_guard.js` 404 を `camera_3d.js`（モジュール）経由で発生。ページエラー1件（`insertBefore`、発生元スクリプト未特定）。3D表示自体は swiftshader 上で描画できた。
- 素材 `W02_白峰ユキナ.vrm` の `/api/integrated-v02/asset/...` が 404（同梱素材が実在しない＝実モデル未検証）。

## 状態の集計（操作要素ベース、旧2ページ合計）

「動く」はクリック/入力でエラーが出なかったことを示すだけで、機能の正しさは保証しない。「エラー」の多くは未選択状態での 400（入力不足）で、仕様どおりの拒否を含む。

| 分野 | 動く | エラー | 操作不能(レイアウト崩れ) | 未確認 | 計 |
|---|---|---|---|---|---|
| ①プロジェクト新規作成・保存/読込 | 1 | 0 | 1 | 3 | 5 |
| ②素材取り込み・素材管理 | 8 | 0 | 0 | 54 | 62 |
| ③キャラクター・ステージ読込と3D表示 | 35 | 10 | 0 | 15 | 60 |
| ④モーション適用・タイムライン再生 | 27 | 0 | 122 | 11 | 160 |
| ⑤カメラ | 73 | 2 | 3 | 17 | 95 |
| ⑥書き出し | 2 | 0 | 4 | 6 | 12 |
| ⑦その他 | 27 | 4 | 0 | 11 | 42 |

未確認の内訳: 非表示タブ内（PMX/インポート/診断ペイン）、ファイル選択、破壊的操作（削除/リセット/全消去）、ダウンロード/書き出し、disabled。

## 機能別一覧（旧UI → 新UI移植先）

新UI画面番号は `studio/js/screens.js` の SCR-01〜25。状態は 動く／エラー／操作不能(レイアウト崩れ)／未確認。

### ① プロジェクト新規作成・保存/読込
| 機能 | 画面上の場所 | 状態 | 根拠 | 移植先 |
|---|---|---|---|---|
| 統合状態の保存・復元（バンドル） | camera.html 右カラム「統合状態の保存・復元」 | 動く | 操作でエラーなし。`GET /api/project/bundle` 応答あり。pytest `test_project_state_bundle` `test_bundle_revision` 等 全通過 | SCR-18 |
| 編集履歴 戻す/やり直す/履歴選択/復元 | index「詳細設定・編集履歴・VMD変換」内 | 操作不能(レイアウト崩れ) | 復元ボタンは main 潰れで押せない。戻す/やり直しは履歴0件で disabled。`/api/project` の pytest は通過 | SCR-18 |
| 組み合わせ（コンビネーション）のお気に入り保存 | index 左「コンビネーション」 | 動く | クリックでエラーなし（`/api/favorites`） | SCR-18 / SCR-22 |
| 新規プロジェクト作成 | （旧UIに専用画面なし） | 未確認 | 旧UIに該当UIなし。新UIは SCR-01 に作成モックのみ | SCR-01 |
| カメラ設定 保存/戻す/やり直す | camera.html ヘッダー | 動く | 3ボタンともエラーなし。`/api/camera/project` pytest 通過 | SCR-02 / SCR-18 |

### ② 素材取り込み・素材管理
| 機能 | 場所 | 状態 | 根拠 | 移植先 |
|---|---|---|---|---|
| FBX/GLB/VRM/PMX ZIP のファイル選択→登録 | index「素材を追加して制作する」 | 未確認（ファイル選択は自動操作せず）／登録ボタンは動く | 選択なしで登録押下はエラーなし（メッセージ表示のみ）。実ファイル投入は未検証 | SCR-08 / SCR-23 |
| 3Dプレビュー切替・ワークスペースタブ | index 上部タブ・`#studio-workspaces` | 動く（タブ切替） | 各ボタンでエラーなし | SCR-08 |
| PMX/VMD 登録・保存・再生 | index「PMX・VMD」タブ | 未確認 | 非表示ペインのため自動操作せず。pytest `test_pmx_bones` ほか通過 | SCR-12 / SCR-13 |
| GLB/VRM（同梱）一覧 | index「GLB / VRM（同梱）」タブ | 未確認 | `GET /api/integrated-v02/catalog` 応答あり。同梱 vrm は実体なし(404) | SCR-08 / SCR-12 |
| お気に入り検索 | index「★ お気に入り」 | 未確認 | 非表示タブ内 | SCR-08 |
| 診断ZIP保存・ログ表示 | index「診断」タブ | 未確認 | ダウンロードのためスキップ。pytest `test_logging` 通過 | SCR-24 |

### ③ キャラクター・ステージ読込と3D表示
| 機能 | 場所 | 状態 | 根拠 | 移植先 |
|---|---|---|---|---|
| 3Dプレビュー（GLB/VRM） | index `#threeview` / camera.html 3Dビュー | 動く（camera）／一部操作不能（index） | camera.html は swiftshader 上で3D描画。index は main 崩れでキャンバスが他パネルと重なる。実モデルでの表示は未検証 | SCR-12 / SCR-06 |
| カメラ側「3Dモデルを表示」 | camera.html 上部 | エラー | `/api/integrated-v02/asset/W02_白峰ユキナ.vrm` が 404（同梱素材なし） | SCR-12 |
| 骨格解析・比較・方向差・補正候補 | index「骨格解析・リターゲティング準備」 | エラー（未選択時） | モデル未選択で `/api/retarget/compare|pose-proposal|calibration|profile-for-pair` が 400。素材登録後の挙動は未検証。pytest `test_retarget_*` `test_v0154..v01628` 全通過 | SCR-13 |
| ボーン対応表編集・回転プレビュー・基準姿勢転写 | index 同セクション内 | 動く（UI応答）／API は入力なしで 400 | `rest-pose-inspection` ほか 400 | SCR-13 |
| VRMメッシュ補正前後比較 | index「v0.16.29」 | 動く（ファイル選択除く） | モジュール `v01629_mesh_compare.js` は読込成功 | SCR-12 / SCR-13 |
| 転写タイムライン・QA・JSON保存（v0.16.30〜32） | index | 動く（UI応答） | `v01641_preview_guard.js` 404 の影響範囲は v0.16.33〜35 側 | SCR-13 |
| ステージ読込 | （旧UIに該当なし） | 未確認 | 旧UIにステージ機能なし | SCR-06 |

### ④ モーション（VMD）適用・タイムライン再生
| 機能 | 場所 | 状態 | 根拠 | 移植先 |
|---|---|---|---|---|
| モーション82パターン一覧・絞込・分類 | index 左パネル | 操作不能(レイアウト崩れ) | ボタン82件とフィルタ全て押下不能（`main>.panel` が高さ26px、`index.html:27` 付近） | SCR-05 / SCR-13 |
| 選択モーションの2D模式再生（前/再生/次/速度/シーク） | index 中央 | 操作不能（ボタン）／シークは動く | 同上。`input#seek` のみ応答 | SCR-05 |
| コンビネーション（追加/チェイン再生/停止） | index 右 | 動く | 追加・再生ボタン応答あり。全消去はスキップ（破壊的） | SCR-05 / SCR-22 |
| タイムライン編集（クリップ追加・再生・保存/復元） | index `#timeline-studio`（body直下） | 操作不能 25 / 動く 17 | viewport 外（y>900）で到達不能の要素が多数。画面内に出ている一部のみ操作可 | SCR-05 / SCR-13 |
| 非破壊モーション補正レイヤー | index `#motion-layer-editor` | 動く 4 / 操作不能 9 | `GET /api/motion-layers` 応答あり。下部は到達不能 | SCR-13 |
| VMD 再生（PMX） | index PMX・VMD タブ | 未確認 | 実PMX/VMD を投入していない | SCR-12 / SCR-13 |
| キーフレームレビュー・スクラブ（v0.16.33〜35） | index | エラー（読込失敗の疑い） | `v01641_preview_guard.js` 404 のためモジュール import 失敗 | SCR-13 |
| 転写プレビュー再生（v0.16.36〜40） | index | 動く（UI応答） | `v01636_40_playback.js:22` の `insertBefore` が例外 | SCR-13 |
| 足の接地・滑り診断 | index「足の接地・滑り診断」「両足」 | 動く（UI応答） | pytest `test_v0158_foot_contact` `test_v0165_dual_foot` 通過。実モーションでは未検証 | SCR-13 / SCR-24 |

### ⑤ カメラ
| 機能 | 場所 | 状態 | 根拠 | 移植先 |
|---|---|---|---|---|
| カメラ位置・注視点・補間値・キーフレーム編集 | camera.html 下部・左 | 動く | 操作でエラーなし。ただし「◆」キーは一部操作不能（レイアウト） | SCR-02 / SCR-14 |
| 再生・1フレーム送り・スクラブ | camera.html 中段 | 動く（再生/戻る）／「1フレーム ▶」は操作不能 | 現在フレーム入力の縦伸びが覆う | SCR-02 |
| カスタム撮影構図・レンズプリセット・構図ガイド | camera.html | 動く | pytest `test_camera_custom_presets` ほか、node `test_camera_lens.cjs`(5) `test_camera_framing.cjs`(11) 通過 | SCR-02 / SCR-22 |
| CAM-015 ショット・シーケンス編集 | camera.html 右 | 動く | `GET /api/camera/sequence/evaluate`, `POST .../edit`。pytest `test_camera_sequence*` 通過 | SCR-04 / SCR-16 |
| フォーカステスト（DOF診断） | camera.html | 動く | pytest `test_camera_focus*`、node `test_camera_focus_*.cjs` 通過 | SCR-03 |
| 撮影リグ（ベータ） | camera.html | 動く | node `test_camera_rig.js` 通過 | SCR-02 / SCR-14 |
| ボーン追従カメラ | camera.html 上部 | 動く（UI）／実モデル追従は未検証 | node `test_camera_follow_*.mjs` 通過 | SCR-02 / SCR-12 |
| MMDカメラVMD 検査・読込 | camera.html | 未確認（ファイル選択） | pytest `test_camera_vmd*` 全通過 | SCR-15 |

### ⑥ 書き出し
| 機能 | 場所 | 状態 | 根拠 | 移植先 |
|---|---|---|---|---|
| FBX→VMD 変換（Blender） | index「詳細設定…VMD変換」 | 操作不能(レイアウト崩れ)／Blender実行は未検証 | ボタン押下不能。Blender 未導入環境のため実変換は未実施 | SCR-13 / SCR-17 |
| ボーン対応表の保存 | 同上 | 操作不能(レイアウト崩れ) | `POST /api/mapping` は pytest 範囲外 | SCR-13 |
| カメラVMD 書き出し（ネイティブ） | camera.html | 未確認（ダウンロードのためスキップ） | pytest `test_camera_vmd_export` 通過 | SCR-15 / SCR-17 |
| 診断ZIP | index「診断」 | 未確認 | ダウンロードのためスキップ | SCR-24 |
| 画像/動画レンダリング | （旧UIに該当なし） | 未確認 | 旧UIに機能なし | SCR-07 / SCR-17 |

### ⑦ その他
| 機能 | 場所 | 状態 | 根拠 | 移植先 |
|---|---|---|---|---|
| BAI AI Manager / IKポーズ提案 | index 下部 | エラー（503） | `POST /api/ai/pose-proposal`, `/api/ai/ik-preview` が 503（外部AI未接続。任意機能で想定内）。pytest `test_bai_ai` 通過 | SCR-19 |
| 手動IKポーズ補助 | index 下部 | 動く（UI応答） | `POST /api/pose/solve|save` | SCR-13 |
| 足接地QA / WebMCP | index | 動く（UI応答） | `webmcp.js` 読込成功 | SCR-19 / SCR-24 |
| 画面間リンク（新UI / カメラ） | index ヘッダー | 動く | 遷移のみ（`/workspace/01`、`/camera.html`） | SCR-01 |

## バックエンド（`/api/*`）とテスト

- `server.py` が処理する `/api/*` は約 75 エンドポイント（project/bundle, camera/*, retarget/*, qa/*, ai/*, integrated-v02/*, mmd-*, diagnostics/*, favorites, mapping, motion-layers, pose/*, sync* など）。
- `python3 -m pytest -q`: **305 件通過 / 失敗 0**（約1.4秒）。カメラ・プロジェクトバンドル・リターゲット(v0.15〜0.16)・VMD・ログ・新UIルーティングを網羅。素材管理(`/api/assets`, `/api/mmd-upload`, `/api/pmx-zip-upload`)と書き出し(`/api/run-vmd-conversion`, `/api/export-vmd-job`)は専用テストが薄い。
- `node --test`（`test_camera_*.cjs/js/mjs` と `tests/*.cjs`）: 21 ファイル中 **19 通過 / 2 失敗**。失敗は `test_camera_lens.js` と `test_camera_lens_shots.js`（`verticalFov is not a function`。同名 `.cjs` 版 `test_camera_lens.cjs` は5件通過しており、旧 `.js` 版の API 追従漏れとみられる）。`tests/dev-workflow.test.cjs`(4) `tests/studio-ui.test.cjs`(7) は通過。

## 優先して直すべき点（所見）

1. 制作画面の body 直下セクションを `<main>` 内（または別スクロール領域）へ整理しないと全機能が操作不能（④⑥に直結）。
2. `/v01641_preview_guard.js` の配信許可（`server.py:227` 付近）漏れ（制作・カメラ両画面で404、スクラブ機能が失敗）。
3. `insertBefore` 例外3件（`index.html:500,510`、`v01636_40_playback.js:22`）。
4. camera.html の現在フレーム入力の縦伸び（1フレーム▶／◆キーが押せない）。

## 最小修正後（2026-10-20）

オーナー承認の最小修正（移植の見本として旧画面を使えるようにするため。機能追加・再設計なし）。同じ `tools/legacy_ui_inventory.mjs`（1600x900、three はローカル 0.160.1）で修正前後を比較。

| 項目 | 修正前 | 修正後 |
|---|---|---|
| index `<main>` の高さ | 20px（3パネル各26px） | 770px（3パネル各750px、全パネルが枠内スクロールで操作可能） |
| index ページ全体の高さ | 900px（`overflow:hidden` で下部到達不能） | 4,187px（body が縦スクロール、タイムライン等6セクションへ到達可能） |
| index 重なりパネル検出 | 11 組 | 4 組（`#threecanvas` と `#timeline-studio` 等。3Dキャンバスの絶対配置由来、未対応） |
| index ページエラー | 3 件（`insertBefore`） | 0 件 |
| camera ページエラー | 1 件 | 0 件 |
| 404（`/v01641_preview_guard.js`） | index 3 / camera 1 | 0 / 0（残りは同梱VRM素材の 404 のみ） |
| camera 「現在フレーム」入力の高さ | 180px（「1フレーム ▶」を覆う） | 33px（`#next` クリック可能を確認） |
| 画面遷移を除く index 操作要素のうち、④の「モーション82件・再生ボタン」 | main 潰れで枠外 | 枠内に表示（`#filter` 等の個別クリックで確認） |

変更箇所:
- `index.html:27`（canonical CSS）: `html,body` から `overflow:hidden` を外し、`body{overflow-y:auto;overflow-x:hidden}` と `body>*{flex-shrink:0}` を追加。`main` を `flex:0 0 auto` + `height:max(560px,calc(100dvh - 130px))` に変更（body 直下セクションは移動せず、JSセレクタ・DOM順は不変）。
- `server.py:226`: 配信許可リストに `/v01641_preview_guard.js` を追加。
- `index.html:484`: `insertBefore` の基準ノードが `#chain-side` の子でなかった（`#chain-scroll-body` は `details#chain-advanced` の孫）。基準を `#chain-advanced` に修正（保存/読込ツールバーが意図どおり生成される）。`index.html:500/510` と `v01636_40_playback.js:22` は現状エラーなし（修正不要）。
- `v01633_35_scrub.js:29`: ガード配信で当モジュールが読み込まれるようになり顕在化した `epoch is not defined`（`const epoch` が try 内で catch から参照不能）を、宣言を try の外へ移して解消。
- `camera.css`（末尾）: `.transport .inline-control` の flex 指定追加（`.transport input{flex:1 1 180px}` が数値入力に効いて縦伸びしていた）。
- `tools/legacy_ui_inventory.mjs`: 画面遷移後の再列挙待ちを 800ms→3000ms。
- 回帰テスト: `tests/test_legacy_ui_minimal_fix.py`（ガードJSがJS MIMEで配信される）、`tests/legacy-ui-layout.test.cjs`（1600x900 で main>300px、`insertBefore` エラーなし、camera 入力<60px、`#next` クリック可。chromium 無しならスキップ）。

テスト: `pytest -q` 307 件通過（305+2）。node: `tests/*.cjs`、`test_camera_*.cjs` 全通過。

修正前の診断の訂正: 「ゼロサイズ操作要素 73 件」は、非表示タブ（`[hidden]` 親）内の要素を数えたもので、`main` 潰れの指標ではなかった（修正後も 73 のまま）。

残っている問題・注意:
- インベントリ自動操作の「操作不能」は修正後も index 137 / camera 3 と出る。実クリックでは `#filter`・`#next` 等は操作できることを確認しており、スクリプトが先に押したタブ切替（お気に入り）や再生開始で状態が変わったまま後続を押す採取方法の限界とみられる。ため ④ の「操作不能」件数は修正の効果指標として使えない（採取順序の見直しが必要）。
- `#threecanvas` と `#timeline-studio` 等の重なり 4 組、1280幅の「表示モデル」切れ、同梱 VRM の 404 は未対応。
- `main` の高さは `100dvh-130px`（最低560px）の固定計算で、ヘッダー高変更時は再調整が必要。

## 未検証事項（NOT verified）

- GPU 描画: ソフトウェアレンダ（swiftshader）のみ。実GPUでの描画品質・性能は未確認。
- 実モデル/実モーション: 同梱 VRM は実体なし(404)。PMX/FBX/GLB/VMD の実ファイル登録・再生・リターゲット結果の見た目は未検証（ファイル選択は自動操作せず）。
- Blender 変換、外部AI接続、書き出し/ダウンロードの中身は未実行。
- 破壊的ボタン（削除/リセット/全消去/上書き等）は未操作。非表示タブ（PMX・インポート・診断）内の要素は未操作。
- 「動く」はエラー無しの応答確認であり、期待どおりの結果かどうかは別途確認が必要。
- three.js は CDN の代わりにローカル 0.160.1 を使用（本番の CDN 配信とは異なる）。
- 1600x900 / 1280x720 / 1920x1080 のみ確認。モバイル幅は未確認。

## 本来の配置に復元（2026-10-20）

f473eeb の最小修正（ページ全体が縦1列で流れる状態）を、本来の配置へ戻した。機能追加・見た目の変更はなく、配置のみ。

- 幅1101px以上: 画面高に収まる構成（ページ全体のスクロールなし）。左＝モーション一覧（独立スクロール）、右＝`#chain-side`（独立スクロール）、中央＝上：3Dプレビュー固定（`#threecanvas`と再生操作・モーション名）／下：独立スクロール領域（素材登録・タブ・各パネルと、従来`<main>`の外にあった `timeline-studio` / `skeleton-lab` / `foot-qa` / `bai-ai-manager` / `bai-pose-editor` ほか）。
- 幅1100px以下: 従来どおり縦積み（ページ全体スクロール）で、全パネルに到達できる。
- 実装: `index.html` 末尾の `studio-layout-controller-v01420`（DOM移動。idは変更なし）と `studio-layout-v01420` CSS。後から body 直下へ追加されるセクションも MutationObserver で中央下へ収める。
- 確認: `tests/legacy-ui-layout.test.cjs`（1280x720 / 1600x900 / 1920x1080）。スクリーンショットは git 管理外。
