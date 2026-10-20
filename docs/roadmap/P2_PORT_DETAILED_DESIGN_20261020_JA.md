# P2 既存機能の新UI移植 詳細設計 v2 — 2026-10-20 【レビュー中の草案 v2：批評1回目の指摘を反映。批評2・3回目と最終判定の前なので、実装には使わない】

- 位置付け：所有者決定（2026-10-20、`docs/roadmap/ROADMAP_JA.md`「25画面UIモック先行」節）の **P2（既存機能を新UI `studio/` へ移植）** を、標準モデル（Sonnet 系）が設計判断なしで実装できる細かさまで決める詳細設計。**新機能の追加ではない。** 各項目は、旧画面（`index.html`・`camera.html` とそれらが読み込む JS）か既存の Python API に実在するコードを根拠にする。根拠のないものは「◇ 未実装のまま」に入れる。
- 作業の流れ順（所有者決定・固定）：①旧画面の動作記録（完了：`docs/ui/LEGACY_UI_INVENTORY_JA.md`）→ **②プロジェクト新規作成・保存/読込 → ③素材取り込み・素材管理 → ④キャラクター・ステージ読込と3D表示 → ⑤モーション（VMD）適用・タイムライン再生 → ⑥カメラ → ⑦書き出し**。本書は②〜⑦を扱う。②③はそのまま実装できる細かさで書く。④〜⑦も同じ章立てで書き、未決事項は O-xx として明示する。
- 正本の優先順位：`AGENTS.md`（スコープ凍結・モデル使い分け）＞ `docs/roadmap/ROADMAP_JA.md` の所有者決定 ＞ `docs/roadmap/PHASE_E_DETAILED_DESIGN_20261020_JA.md`（v4、条件付き承認。本書と接するのは §0・§2.7・§2.9・§2.11・§4・§7）＞ 本書。矛盾を見つけたら実装を止め、本書を直す。
- 基準コード：ブランチ `claude/project-thread-8gcwq2` の **`5865209`**（旧制作画面を本来の配置に戻したコミット）。v1 は `f473eeb` 基準だった。`5865209` で `index.html` の 52 行目以降が **20 行下へずれた**ため、本書の `index.html:行` はすべてずれた後の番号に直した。直した値は 2026-10-20 に読み直して確かめた（例：`ivLoad` 206行、`importFiles` 237行、`fetchProjectVersion` 371行、`externalProjectApply` 376行、`reconcile` の `setInterval` 455行、`studio-workflow-binding` 615行）。他のファイルの行番号は `f473eeb` から変わっていない。旧画面は今後も別の作業で変わることがあるので、**実装時は記載した関数名・要素IDで探す**（行番号は目安）。
- **旧制作画面の配置（`5865209` で戻した本来の配置）**：幅1101px以上では、ページ全体はスクロールしない。左にモーション一覧（独立スクロール）。中央は上に3Dプレビュー（`#threecanvas`・再生操作・モーション名）を固定し、下は独立スクロール領域。この領域に、素材登録・タブ・各パネルと、以前 `<main>` の外にあった節（骨格解析 `#skeleton-lab`、足接地 `#foot-qa`、AI `#bai-ai-manager`、IK `#bai-pose-editor` など）が入る。右は `#chain-side`（コンビネーション、独立スクロール）。この配置は `index.html` 末尾の `studio-layout-controller-v01420` が DOM を移して作り、要素IDは変わらない。幅1100px以下は従来どおり縦に積む（`LEGACY_UI_INVENTORY_JA.md`「本来の配置に復元」）。本書は旧画面を「どの機能がどの要素にあるか」の見本としてだけ使う。**旧画面の配置は新UIへ写さない**（R6）。新UIの配置は新UIモックの各画面のパネル構成に従う。
- 設計作業のモデル区分：本書の作成とレビューへの対応は高性能モデル（Opus 系）。実装の割当は §3。

---

## 変更履歴

### v1→v2（批評1回目、2026-10-20）

| ID | 指摘 | 対応 | 反映先 |
|---|---|---|---|
| 1-B1 | カメラ保存データ（`camera_project.json`）が壊れていても `bai_camera.read()` は既定値を返す（`bai_camera.py:76〜78`）。そのため新UIで統合保存すると、壊れたファイルが既定値で上書きされ、復旧できなくなる。G-06（Phase E WP-02a）が未実装のままでは P2 の保存は安全でない。 | Phase E §2.7 の一部を **P2-WP-00b** へ前倒しする：`read_project` の読込エラー分岐、`CameraProjectInvalid`、退避コピー、`bad(...,code)`。使うのは統合バンドルの GET/POST だけ（`read_bundle(strict=True)`）。旧 `read()` は WP-02a まで変えない。新UIは 422 を受けたら保存を止め、理由を表示する。テストは pytest と Playwright。 | §1.15 B-3、§1.3、§2.2(d)(f)(g)、§3 WP-00b、Phase E §2.7 注記、Phase E 台帳 `planned_in` |
| 1-B2 | WP-00b の完了ゲートが、実 `data/` で動く `tests/legacy-ui-layout.test.cjs` の環境で旧画面の［保存］を押すものだった（実データを書き換える）。ハーネスの記述も不足していた（ポートの衝突、Chromium 変数名、テストごとのハッシュ比較が並行実行と競合、エラーの許可リスト、終了順）。 | そのゲートを削除し、隔離データ上の専用テストに置き換えた。サーバーを使う既存テストの分類表を追加した。ポートを再割当した（legacy-ui-layout は 8798 のまま、Phase E camera-ui は 8791）。実データのハッシュは全体ラッパーで1回だけ比べる。`expectErrors` を追加し、ブラウザーを閉じてからサーバーを止める。 | §1.14、§3、§4.1、Phase E §2.9 注記 |
| 1-M1 | FBX は同じ種類・同じ名前だと確認なしで上書きされる（`server.py:961` の `fid`）。GLB/VRM は同じ中身だと、既存の登録の名前・種類が置き換わる（`server.py:772〜777`）。どちらも見落としていた。 | 事前確認を2種類追加した（クライアントで同じ `fid`・SHA-256 を計算して照合する）。テストも追加した。 | §2.3(d)(g) |
| 1-M2 | 1ファイルずつの取り込みは旧画面より後退している（旧 `#motions`・`#vmd-input` は `multiple`、`importFiles` はループで処理）。 | 複数のファイルを選べるようにする。1ファイルを1行として順番に処理する。一括のタグ付け・変換だけを NF-004 として残す。 | §2.3 |
| 1-M3 | 旧スクリプト群（リターゲット・レビュー・補正レイヤー・足接地 QA・2D 模式再生）を移植対象から外していた。 | ④⑤の移植対象として行ごとに書いた。IK（`pose_ik_ui.js`）と AI（`bai_ai_ui.js`）は⑦の後に移植する（既定は残す）。Q2 は「この中に削除してよいものはあるか」だけにした。 | §1.8、§2.4、§2.5、§2.8、§5.4 |
| 1-M4 | `camera.js` などをフォーク（分岐コピー）すると、Phase E のコードが2本に分かれる。 | 動作を変えない `mount(root)` 化に変更した（要素の取り方だけ `root` 基準にする）。`camera.html` は `mount(document)`、新UIは `mount(panelRoot)`。コードは1本で、Phase E と共有する。 | R2・R5、§1.7、§1.8、§2.6、K8、Q3 |
| 1-M5 | 旧 ESM（ルート直下）の型宣言と、写したコードの型検査の扱いが決まっていなかった。 | `tsconfig.json` の `paths` で `/camera_follow_config.js` などを型宣言ファイルへ対応させる。批評案の `declare module '/…'` は TS2436 で失敗することを tsc で確かめたので採らない。写したコードは `*.fork.js` に置き、`// @ts-nocheck`＋理由を付ける（一覧を固定）。 | §1.8、§1.12、§3 WP-00c |
| 1-M6 | `api.js` の誤りの分類が足りない（`error_code`・423・403・422 がない）。`too_large` の上限が 400MB で固定されていた。 | `serverCode`、`locked`・`forbidden`・`unprocessable`・`client` を追加。上限は呼び出しごとに指定する。WP-02d の後に必要な見出し（ヘッダー）と 423 を明記した。 | §1.3、§2.2、Phase E §4.2 注記 |
| 1-M7 | `runAction` の `nav:` はクエリを扱えない。v1 は `href:` で全体を読み直す方式だった。 | `navigate(id,{tab,query})` に変え、`nav:08?import=1` を読めるようにする。ダイアログを開いた後で `import=1` を消す。 | §1.6、§1.9、§2.3 |
| 1-M8 | ④の「制作に使う」が `workspace` 全体を置き換え、`frame` や今後のフィールドを消していた。 | 既存の値にマージする。`workspace` の所有者を1つに決めた（カメラ画面がカメラ関連を持ち、④は `asset` だけを書く）。コンビネーションが未作成なら警告する。 | §2.4、Phase E §7 注記 |
| 1-M9 | Phase E WP-03 の作業（データ隔離など）を前倒しすることが、Phase E 側の文書と台帳に書かれていない。 | Phase E §4 の表と §4.2 に「P2-WP-00a で実施予定」と注記した。台帳に P2 台帳への参照と `planned_in` を追加した。 | §3、Phase E §4・§4.2、`PHASE_E_IMPLEMENTATION_STATUS.json` |
| 1-M10 | O-⑥-2 の既定「カメラ単独の保存を廃止」は、Phase E の If-Match 設計より前に保存経路を変えてしまう。 | 既定を「WP-02d までカメラ単独の保存を残す」に変えた。 | §2.6、Phase E §7 注記 |
| 1-m1 | テスト専用の分岐 `__P2_TEST_SKIP_FBX_PARSE` が本番コードに入る。 | 削除した。上書きの確認を FBX の解析より**前**に行う。こうすれば置き換えのテストは確認画面で取り消せるので、解析は不要になる。最小 FBX の生成（標準ライブラリだけで ASCII FBX 7.4）は O-③-1 の任意項目にした。 | §2.3、K6 削除 |
| 1-m2 | R2（フォーク）と §2.6 が矛盾していた。 | R2 を書き直し、§2.6 と同じ方針にした（mount 化）。 | §0 |
| 1-m3 | ストアに `combinationMissing`・`syncRevision`・`lastCommandId` がない。 | 追加した。封筒の版 `projectRevision` と、部分ごとの未保存フラグ `dirty` も足した。`status` が `ready` でないときは、戻す・やり直すを何もしない操作にする。 | §1.4、§2.2 |
| 1-m4 | `restoreHistory` が `combination.selected` を変えていたが、旧 `restore` は変えない。 | 変えないようにした（`index.html:375` と同じ）。 | §2.2 |
| 1-m5 | 同期の初回は版を覚えるだけで、読込から初回までの変化を見逃す。 | 初回も統合バンドルの版を比べる。 | §2.2 |
| 1-m6 | 後始末が画面の切り替え時だけで、同じ画面の再描画では動かなかった。 | 後始末を `render()` のたびに実行する。テストも追加した。 | §1.6 |
| 1-m7 | 状態表示が正直かを確かめるテストが、正規表現で `screens.js` を読んでいた。 | `screens.js` を import する Node テストに変えた。`screens.js` から機能モジュールを import しないことを規則にした。完了ゲートで evidence のテストを実際に走らせる。シェル自体の機能（FAQ・テーマ・ヘルプ）は `shell:true` で例外にする。 | §1.13 |
| 1-m8 | トップバーの `#project-chip` はモックにない部品だった。 | 削除した。状態は SCR-18 の状態行とトーストで出す。 | §2.2 |
| 1-m9 | 「ファイルがある素材だけ表示」は旧画面にない機能だった。 | 削除した。 | §2.3 |
| 1-m10 | `bai.studio.lib.v1` の保存。 | 問題なし（変更なし）。 | §1.11 |
| 1-m11 | 新UIで明示保存だけにすると、旧画面の自動保存より後退する。 | **旧画面の自動保存を残す**：コンビネーションの編集は 450ms 後に `POST /api/project`（If-Match に封筒の版。B-1 修正が前提）で自動保存し、その後で統合バンドルの版を取り直す。明示の［保存］は統合バンドル（カメラ・workspace を含む）。タイムライン編集の 550ms 自動保存（`index.html:802`）は⑤で移植する。 | §2.2、§2.5、§5.3 |
| 1-m12 | 分類ラベル「モーション（VMD）」に FBX・GLB のモーションも入る。 | 「モーション」に変えた。 | §2.3 |
| 1-m13 | SCR-18 左の一覧部品の名前（キー）が決まっていなかった。 | `projectList` にした。 | §2.2 |
| 1-m14 | three の devDependency とロックファイルの扱い。 | WP-00a で `package.json` と `package-lock.json` を更新する。three が無ければ 3D のテストは skip し、「未検証」と記録する。 | §3、§4.1 |
| 1-m15 | ホームの「最近の素材」は取り込みに依存する。 | WP-03 へ移した。 | §2.3、§3 |
| 1-m16 | WP-06 の規模を小さく見積もっていた。 | XL に直し、06a〜06d に分けた。 | §2.6、§3 |
| 1-m17 | （K2 の補足）B-1 を直した後でも、旧画面が外部の変更を取り込むと `projectRevision=null`（`index.html:376`）になり、手動で再読込するまで保存できない。 | WP-00b で最小限のバグ修正をする（取り込み後に版を取り直す）。 | §1.15 B-2、§3 WP-00b |
| 1-m18 | （追加指示）旧制作画面の配置を本来の形に戻した（`5865209`）。 | 基準コミットと `index.html` の行番号を更新し、旧画面の構造の説明を新しい配置に合わせた。 | 冒頭、§1.1 |
| 1-M4 補足 | 批評は `camera_project_bundle_ui.js` も mount 化する案だった。 | **mount 化しない**。新UIではこのファイルを読み込まず、②の保存に統合する。使わないファイルを変えないことで、旧画面への変更を最小にする。 | §2.6 |

---

## 0. 原則（全作業パッケージ共通の約束）

| # | 約束 | 理由・根拠 |
|---|---|---|
| R1 | **ロジックを書き直さない**。計算・検証・保存の処理は既存の Python API（`server.py` と各 `*.py`）を**そのまま呼ぶ**。DOM に依存しない既存の JS モジュール（§1.8 の「共有」）は**ファイルをそのまま読み込む**。 | AGENTS.md「既存機能へ統合できるものは重複実装しない」。 |
| R2 | 旧画面の **DOM に依存する JS** の扱いは3つだけ。<br>(1) **カメラ画面**（`camera.js`・`camera_3d.js`）は、動作を変えずに **`mount(root)` 化**する（§2.6）。旧 `camera.html` と新UIが**同じファイル**を読む。<br>(2) **`index.html` インラインの計算・データ**（82パターン表、連結再生の位置合わせ、モデルの正規化式）は `studio/js/**/*.fork.js` へ写す（フォーク）。旧コードと同じ結果になることを照合テストで確かめる。<br>(3) **fetch で API を呼んで表示するだけの接着コード**（index.html の制作状態・素材登録・素材棚・同期、小さな旧 UI スクリプト群）は `api.js`（§1.3）で書き直す。ロジックは Python 側にあるので、書き直してもロジックの重複にはならない。 | 二重化を避ける（Phase E の改修が1か所に入る）。旧画面を変えるのは R5 の例外の範囲だけ。 |
| R3 | 新UIの各画面は、移植した部分から**サンプルデータを実データの結線に置き換える**。置き換えた部分では `samples.js` の参照を消す（画像を含む）。置き換えない部分はサンプルのまま残し、「サンプル表示」と明記する。 | 所有者決定「見た目の正本は新UIモック」。 |
| R4 | 状態バッジ（`実機能`／`既存・部分`／`サンプル表示`／`◇ 未実装`）は**正直に**更新する。`実機能` は「既存の Python API を読み書きし、その結果を表示している。かつ本書のブラウザーテストが合格している」場合だけ。テストが無いか失敗中なら `既存・部分` のままにする。偽の成功・偽の進捗・偽の数値は出さない。 | `docs/ui/STUDIO_DESIGN_SYSTEM_JA.md`「状態表示の契約」。P2 で定義を「読み取りのみ」から「読み書き」へ広げる（WP-00c で文書も更新）。 |
| R5 | **旧画面は配信を続ける。** 旧画面のファイルを変えてよいのは次の2つだけで、コミット本文に要件IDと理由を書く。<br>(a) **バグ修正**（B-1・B-2・B-3。§1.15）。<br>(b) **動作を変えない mount 化**（WP-06a）。<br>旧画面に新機能は足さない。共有したカメラコードに Phase E が加える機能は、新UIにしかない要素がある場合だけ動くようにする（K8）。新UIへの移植が終わっても旧画面は削除しない。 | ROADMAP_JA.md 所有者決定、AGENTS.md スコープ凍結。 |
| R6 | **見た目・レイアウトの正本は新UIモック**（ナイト配色、左サイドメニュー、各画面のパネル構成）。旧画面の見た目や配置（§冒頭の3列配置を含む）には合わせない。モックの部品を流用する。新しい部品を作るときも、モックのトークン（`studio/styles/tokens.css`）とクラスを使う。 | 所有者決定。 |
| R7 | **NF 候補（NF-001〜023）は実装しない**。モックにだけある機能（お気に入りのハート、コレクション、一括操作、素材の場所タブなど）は見た目を残し、押すと `◇ 未実装` の説明ダイアログを出す。 | AGENTS.md スコープ凍結、ROADMAP_RECONCILED。 |
| R8 | **非破壊**。既存 API の中で「上書き・置き換え・削除・再分類を伴う動作」（§2.3 の表）を新UIから呼ぶときは、必ず事前に影響を表示して確認を取る。画面内の未保存の変更を、確認なしに外部の内容で上書きしない。読めない保存データを既定値で上書きしない（B-3）。 | AGENTS.md「非破壊・後方互換」。 |
| R9 | 1つの作業パッケージ（WP）は1〜数コミット。各コミットで P2 進捗台帳（`docs/roadmap/P2_PORT_STATUS.json`、WP-00c で新設）・テスト結果・未検証事項を更新する。Phase E 台帳に影響する変更は `PHASE_E_IMPLEMENTATION_STATUS.json` の `planned_in`／`recovery_notes` にも1行書く。 | AGENTS.md 規則6。 |
| R10 | **WebMCP・標準MCP**：標準MCP（`mcp_server.py`）は HTTP API を呼ぶので、新UIが同じ API を使う限り変更は不要。WebMCP（`webmcp.js`）は旧画面の要素IDを `document.getElementById` で操作するため、新UIでは読み込まない。新UIへの WebMCP 登録は Phase E WP-02c（scope `camera_page`）以降に扱い、P2 では `◇ 未実装` と明記する。 | `webmcp.js:4`。 |
| R11 | ユーザー側の動作確認は求めない（AGENTS.md 規則7）。自動テストは SwiftShader 上の Chromium で行い、**GPU 実機は未検証**と記録する。 | AGENTS.md。 |

---

## 1. アーキテクチャ

### 1.1 現状の事実（コードで確認）

**新UI（外殻）**
- `studio/index.html`：読み込むスクリプトは `<script type="module" src="/studio/js/app.js">`（42行目）だけで、importmap はない。トップバーに `.mock-chip`「UIモック（仮画像）」（23行目）がある。
- `studio/package.json` が `{"type":"module"}` なので、Node から `studio/js/screens.js` を直接 import できる（2026-10-20、Node 22 で確認：`SCREENS` 25件）。`screens.js` が import するのは `samples.js` だけ。
- `studio/js/app.js`：
  - UI設定：`bai.studio.prefs.v1`（13〜25行）をブラウザーに保存する。対象はテーマ・密度・タイムラインの折りたたみだけ。
  - ルーター：`parseLocation()`（32〜39行）が `/workspace/NN?tab=` を読む。`navigate(id,{replace,tab})`（41〜50行）は History API を使い、**`tab` 以外のクエリを作れない**。
  - 描画：`render()`（665〜702行）は毎回 `main.textContent=''`（671行）で画面全体を作り直す。**画面を作り直すときの後始末（requestAnimationFrame・WebGL の破棄）の仕組みがない。**
  - 操作の振り分け：`runAction()`（137〜145行）は `unimpl`／`nav:`／`href:`／`form:`／`mock:` を扱う。`nav:` は `navigate(act.slice(4))` で、クエリを付けられない。API への書き込みはない。
  - 部品 `control()`（194〜225行）。`live` 部品（217行→`liveBlock()` 258〜276行）が、`live.js` の GET を表示する唯一の実データ経路。
  - 特別な描画：左 `custom:'assetCats'`（323行）、中央 `type:'library'`（336行）、右タブ `custom:'assetDetail'`（309行）。素材管理の状態 `lib`（513〜514行）は画面内のメモリにある。`refreshLibrary()`（519〜527行）が DOM を直接差し替える。
  - ホーム `homeView()`（470〜509行）：「最近のプロジェクト」は `PROJECTS`（サンプル、483〜487行）、「最近の素材」は `ASSETS` の固定4件（499〜502行）。
  - ビューポート `viewport()`（373〜387行）：画像と「3D描画は未接続」の表示だけ。
  - `window.baiStudio`（720行）：画面一覧と `navigate` を公開する（読み取り専用）。
- `studio/js/live.js`：`get()`（12〜21行、失敗時は `{ok:false,error}`）と、読み取り先の一覧 `LIVE`（24〜33行）。
- `studio/js/screens.js`：25画面の定義。`PH.P2` の文言が「Phase E の後に実施」のまま（36行。所有者決定で古くなった）。主な画面：SCR-01（82行〜）、SCR-08（273行〜）、SCR-12（352行〜）、SCR-13（376行〜）、SCR-18（494行〜）、SCR-23（599行〜）。`status: 'real'` は24か所（パネル状態の表とカードの合計）。フォーム `FORMS.newProject`（661〜670行）は入力を検証するだけで、保存しない。
- `studio/js/samples.js`：`ASSET_CATS`（15〜25行。`motion` のラベルは「モーション（VMD）」）、`ASSETS`（28行〜）、`PROJECTS`（62行〜）、`RENDERS`（70行〜）。
- `studio_routes.py`：`/workspace(/NN)` には外殻を返す（17・26〜27行）。`/studio/` 配下は拡張子の許可リスト（6〜15行：html/css/js/json/webp/png/jpg/svg）とパス走査の拒否（31〜38行）で配信する。**`studio/` 配下に置いた .js は追加の設定なしで配信される。**
- `tsconfig.json`：`include` は `studio/js/**/*.js` だけ。`checkJs`・`strict`・`moduleResolution: bundler`。ルート直下の旧ファイルは型検査の対象外。
- テスト：`tests/studio-ui.test.cjs`（Playwright、ポートは `STUDIO_TEST_PORT` で既定 8799。**実 `data/` を使うサーバーを起動する**。7件）と `tests/test_studio_routes.py`。`studio-ui.test.cjs` の「every action button on every screen responds」は、`button[data-act]`（`href`・`nav` 以外）を全部押し、トーストかダイアログが出ることを確かめる。

**サーバー（既存 API、`server.py`）**
- 読み取り：`/api/project/bundle`（168〜173行）、`/api/camera/project`（174〜177行）、`/api/assets`（289〜290行。`unified_assets()` は 85〜109行）、`/api/mmd-assets`（291〜292行）、`/api/mmd-file/<slot>/<name>`（293〜307行）、`/api/project`（316〜325行。B-1）、`/api/favorites`（326〜329行）、`/api/integrated-v02/catalog`（330〜334行）、`/api/integrated-v02/asset/<file>`（335〜348行）、`/api/manifest`（349行）、`/api/file/<id>`（350〜355行）、`/api/server-version`（241〜242行）、`/api/sync`（310〜311行）。
- 書き込み：
  - `POST /api/project/bundle`（359〜376行）：本文は 4MB まで（362行、超えると 413）。**If-Match が必須**で、無ければ 428、不一致なら 409。
  - `POST /api/camera/project`（427〜438行）：If-Match は任意。
  - `POST /api/integrated-v02/upload`（762〜778行）、`POST /api/pmx-zip-upload`（779〜829行）、`POST /api/mmd-upload`（830〜845行）、`POST /api/upload`（FBX、956〜973行）。
  - `POST /api/project`（895〜917行）：本文は 3MB まで。If-Match は任意で、付いていれば `camera_revision(現在の内容)` と比べ、違えば 409。成功すると `{ok, revision}` を返す。同じ処理が 918〜940行に重複しているが、到達しないだけで害はない。
  - `POST /api/favorites`（941〜950行）、`POST /api/timeline-editor`（668〜686行）。
  - エラー応答 `bad(status,msg)`（163行）は `{"error": msg}` だけを返し、`error_code` を返す経路はまだない。
- 保存バンドル `project_state_bundle.py`：
  - `validate_bundle()`（52〜62行）、`validate_workspace()`（36〜49行。`asset` は `.glb`/`.vrm` のファイル名か空文字だけ）。
  - `read_bundle()`（65〜72行）は、カメラを `bai_camera.read()` で読む。`read()`（`bai_camera.py:76〜78`）は、ファイルが読めない・JSON が不正・検証に失敗、の**どの場合も黙って `validate(DEFAULT)` を返す**（B-3）。
  - `save_bundle()`（75〜124行）は**カメラを必ず書く**。本文に `workspace` が無いと、既存の workspace ファイルを**削除する**（95〜98行）。
  - `bundle_revision()`（127〜129行）。
- 同期：`sync_bump()`（141〜144行）を呼ぶのは `POST /api/project` と `POST /api/project/bundle` だけ。`POST /api/camera/project` は呼ばない（427〜438行）。

**旧画面の該当コード（移植の見本。`index.html` は `5865209` の行）**
- 制作状態（コンビネーション）：`index.html:361〜383`。
  - 既定値（364行）、`ui()`（370行）、`fetchProjectVersion()`（371行）、`save()`（372行。`selected`・`playbackSpeed` を画面の値で上書きしてから、If-Match 付きで `POST /api/project` に送る）。
  - `autosave()`（373行、450ms）、`record()`（374行）、`restore(i)`（375行。`selected` は変えない）。
  - `externalProjectApply`（376行。`projectRevision=null` にする）、ボタンの結線（378〜382行）、起動時の読込（383行）。
- 統合状態の保存・復元：`camera_project_bundle_ui.js`（全20行。保存は18行、復元は19行、復元前の検証 `validateRestore` は7〜14行）。
- 外部変更の同期：`index.html:420〜456`。`reconcile` が `/api/sync` を 1200ms ごとに取得する（`setInterval` は455行）。変更があると、**封筒なし**の `GET /api/project`（431行）を取り、`externalProjectApply` に渡す（432行）。
- 素材：
  - 拡張子による登録先の振り分け：`index.html:615〜646`（`studio-workflow-binding`）。
  - 登録の入口：GLB/VRM（`index.html:572`）、PMX ZIP（`index.html:524〜547`。サーバー版の機能確認は 533〜536行）、VMD（`uploadMmd()` 325〜336行。`#vmd-input` は `multiple`）、FBX（`importFiles()` 237行。`#motions` は `.fbx` の `multiple`。選んだファイルをループで FBXLoader に読ませてから1つずつ送る）。
  - 素材棚：`refreshShelf()`（764行）、`openAsset()`（726〜749行）、絞り込み（750〜762行）。
- 3D：
  - GLB/VRM：`ivLoad()`（206行。高さを 2.0 に正規化）。
  - PMX：`loadPmx()`（305〜316行。高さ 1.8）。
  - FBX：`fitModel()`（231行。高さ 1.95）。
  - VMD の適用（340〜347行）：`AnimationMixer` だけで、IK・物理はない。
  - 2D 模式アニメーション（`index.html:71` の `<details>`「従来の2D模式アニメーション」、要素 `prev`・`play`・`next`・`speed`・`seek`）。
  - カメラ画面の `camera_3d.js:278〜280`（`loadAsset`。高さを 2.0 に正規化、GLB/VRM のみ）。

**見つけた既存の不具合（P2 の前提として直す。§1.15）**
- **B-1（DATA-008）**：`GET /api/project` の分岐が 316行と 321行に重複しており、最初の分岐（316〜320行）が `?envelope=1` を無視して生データを返す。321〜325行の封筒（`{project, revision}`）付きの応答には到達しない。このため旧画面の `fetchProjectVersion()`（`index.html:371`）は常に「保存データの版を取得できません」で失敗し、**旧画面のコンビネーションの保存（`project-save`）と読込（`project-load`）が動かない**。2026-10-20 に `curl /api/project?envelope=1` が `{}` を返すことを確認した。既存テストの `test_legacy_project_client_revision.py:10` は文字列が2回出ることを確かめるだけで、実際の応答を検査していない。
- **B-2**：B-1 を直しても、旧画面は外部の変更を取り込むたびに `projectRevision=null` に戻る（`index.html:376`）。`reconcile` は封筒なしの `GET /api/project`（431行）を使うので版が分からず、手動で［読込］するまで保存できない。新UIで保存した後には必ずこの状態になる。
- **B-3（G-06 の一部）**：上の `read()` の動作のため、壊れたカメラ保存データがあると、統合バンドルの GET は既定のカメラを「正常」として返す。それを読んで保存した画面（旧 `camera.html` の統合保存、新UIの②）は、元のファイルを既定値で上書きする。退避コピーも作られない。

### 1.2 モジュール構成（新規ファイルと責務）

すべて ES モジュールで、先頭に `// @ts-check` を書く（`*.fork.js` を除く。§1.8）。フレームワークは使わない。`studio/js/` 配下に置く（`studio_routes.py` の変更は不要）。

| ファイル | 責務 | 作るWP |
|---|---|---|
| `studio/js/api.js` | 既存 HTTP API の呼び出し窓口（§1.3）。fetch/XHR はすべてここを通す。 | WP-00c |
| `studio/js/store.js` | 小さな状態ストア（§1.4）。 | WP-00c |
| `studio/js/bus.js` | 画面間のイベント（§1.5）。 | WP-00c |
| `studio/js/state-box.js` | 読込中・空・失敗・未接続の共通表示（§1.10）。 | WP-00c |
| `studio/js/legacy.js` | 共有する旧 JS（UMD）を1回だけ読み込む（§1.8）。 | WP-00c |
| `studio/js/legacy-globals.d.ts`、`studio/types/legacy/*.d.ts` | 旧ファイルの型宣言（§1.8）。 | WP-00c |
| `studio/js/features/index.js` | 画面の結線の登録簿（§1.6）。`FEATURES` を export する。 | WP-00c |
| `studio/js/features/project.js` | ②の読込・自動保存・統合保存・履歴・外部変更の検知。 | WP-01 |
| `studio/js/features/project-view.js` | ②の画面部品（SCR-18・SCR-01）。 | WP-01 |
| `studio/js/features/assets-model.js` | ③の素材一覧の分類・絞り込み（純関数。DOM なしで、Node で単体テストする）。`ASSET_CATS` もここへ移す。 | WP-02 |
| `studio/js/features/assets-view.js` | ③の素材管理画面（SCR-08 の左・中央・右）。 | WP-02 |
| `studio/js/features/import-rules.js` | ③の取り込み規則（純関数：拡張子→送り先・種類・事前検査・衝突の判定）。 | WP-03 |
| `studio/js/features/import.js` | ③の取り込みダイアログ・キュー・送信。 | WP-03 |
| `studio/js/viewport/three-host.js` | ④の three.js ビューポートの生成と破棄（SCR-12/13/05 用）。 | WP-04 |
| `studio/js/viewport/model-loader.js` ＋ `normalize.fork.js` | ④ GLB/VRM/PMX/FBX の取得と解析（新規）。正規化の式は旧コードのフォーク（`normalize.fork.js`）。 | WP-04 |
| `studio/js/features/character-view.js` | ④ SCR-12。 | WP-04 |
| `studio/js/features/retarget-view.js` | ④ リターゲット検証（`retarget_ui.js` 等の接着コードの書き直し。§2.4）。 | WP-04b |
| `studio/js/motion/patterns.fork.js`、`motion/chain.fork.js`、`features/motion-view.js` ほか | ⑤（§2.5。O-⑤ で確定）。 | WP-05 |
| `studio/js/camera/camera-host.js`、`camera/legacy-ids.json`、`styles/camera-host.css` | ⑥ カメラ画面のホスト（`mount(root)` の受け皿。§2.6）。 | WP-06b |
| `studio/js/features/export-view.js` | ⑦。 | WP-07 |
| `studio/styles/features.css` | 新しい部品の見た目（トークンだけを使う）。`studio/index.html` で `app.css` の後に読む。 | WP-00c |

既存ファイルの変更：
- `app.js`：結線、後始末、`data-act="real"`、`navigate` のクエリ対応。
- `screens.js`：パネル状態、`feature` 部品、`evidence`／`shell`、`PH.P2` の文言。機能モジュールは import しない（§1.13）。
- `ui.js`：原則として変えない。必要な部品は新しいファイルに置く。
- `live.js`：`get()` の中身を `api.getJson()` の呼び出しに置き換える。戻り値の形 `{ok,data}|{ok:false,error}` は保つ。
- `studio/index.html`：importmap、`features.css`、`#keepalive`。

### 1.3 API クライアント `studio/js/api.js`

```js
/** @typedef {'offline'|'timeout'|'aborted'|'conflict'|'revision_required'|'too_large'|'bad_request'|'not_found'|'forbidden'|'locked'|'unprocessable'|'client'|'unavailable'|'server'|'bad_json'} ApiErrorCode */
/** @typedef {{ok: true, status: number, data: any}} ApiOk */
/** @typedef {{ok: false, status: number, code: ApiErrorCode, message: string, serverMessage: string|null, serverCode: string|null, body: any}} ApiErr */
/** @typedef {ApiOk | ApiErr} ApiResult */
/** @typedef {{ifMatch?: string, headers?: Record<string,string>, timeoutMs?: number, signal?: AbortSignal, limitLabel?: string}} ApiOpts */

export async function getJson(path, opts = {}) {}        // GET, cache:'no-store', Accept: application/json。timeoutMs 既定 15000
export async function postJson(path, body, opts = {}) {} // Content-Type: application/json。ifMatch があれば If-Match、headers を追加。timeoutMs 既定 30000
export async function getBinary(path, opts = {}) {}      // ArrayBuffer（3D 素材用）。timeoutMs 既定 120000
export function uploadFile(path, file, { contentType = 'application/octet-stream', onProgress, timeoutMs = 600000, limitLabel = '400MB' } = {}) {} // XMLHttpRequest。onProgress({loaded,total}) は送信バイトの実測だけ。戻り値は {promise, abort}
export function messageFor(err) {} // ApiErr → 日本語1文（下表）
export const MAX_UPLOAD_BYTES = 400 * 1024 * 1024;   // server.py:59 の MAX_SIZE と同じ値（テストで一致を確かめる）
export const LIMITS = Object.freeze({ upload: '400MB', bundle: '4MB', project: '3MB' }); // 現在の上限（server.py:59 / 362 / 896）。Phase E WP-02b で bundle 等が 8MB/16MB に変わったら、ここだけを直す
```

- 判定：
  - `fetch` が例外を出したら `offline`。`AbortError` のうち、時間切れなら `timeout`、利用者の取消なら `aborted`。
  - 応答が `res.ok` なのに本文を JSON として読めなければ `bad_json`。
  - 状態コード：409→`conflict`、428→`revision_required`、413→`too_large`、400→`bad_request`、403→`forbidden`、404→`not_found`、422→`unprocessable`、423→`locked`、503→`unavailable`、その他の 4xx→`client`、その他の 5xx→`server`。
  - エラー応答の本文が JSON なら `body` に入れる。`body.error` は `serverMessage` に、`body.error_code` は `serverCode` に入れる（B-3 の `camera_project_invalid`、Phase E 付録C のコード）。
- 日本語の文言（`messageFor`、固定）：

| code | 文言 |
|---|---|
| offline | 未接続：サーバーに接続できません。Python サーバー（npm start）が動いているか確認してください。 |
| timeout | 時間切れ：サーバーの応答がありません。もう一度お試しください。 |
| aborted | 取り消しました。 |
| conflict | 他の画面・MCP でサーバー側が更新されています。再読込してから操作してください。 |
| revision_required | 保存元の版がわかりません。再読込してください。 |
| too_large | ファイルまたはデータが大きすぎます（上限 {limitLabel}）。 |
| bad_request | 受け付けられませんでした：{serverMessage}（serverMessage が無ければ「入力を確認してください」） |
| forbidden | この操作は許可されていません：{serverMessage} |
| not_found | 見つかりません：{serverMessage} |
| unprocessable | 保存データを読めません：{serverMessage}（`serverCode==='camera_project_invalid'` は §2.2 の専用文言を使う） |
| locked | 復旧待ちのため保存できません：{serverMessage}（Phase E WP-02d の `recovery_pending`。WP-02d の後で使う） |
| client | 受け付けられませんでした（HTTP {status}）：{serverMessage} |
| unavailable | 利用できません：{serverMessage} |
| server | サーバーでエラーが起きました（HTTP {status}）。診断ZIP（24 診断・品質）で状況を確認できます。 |
| bad_json | サーバーの応答を読めませんでした（HTTP {status}）。 |

- 送信前の検査は呼び出し側（`import-rules.js` など）で行う。api.js は検査しない。
- `live.js` の `get()` は `getJson()` を呼び、失敗したら `{ok:false, error: messageFor(r)}` を返す（表示の形は変えない）。
- **Phase E WP-02d の後の追記（今は実装しない）**：統合保存に `X-Bai-Camera-Revision`・`X-Bai-Workspace-Revision` の見出しが必須になり、復旧待ちのときは 423 `recovery_pending` が返る（Phase E §2.4・§2.8）。そうなったら `features/project.js` の `saveProject()` で `headers` に2つの版を付け、423 では `locked` の文言を出して保存を止める。WP-02d の実装時に、Phase E §4.2 の WP-02d 行に従ってこのファイルとテストを直す。

### 1.4 状態ストア `studio/js/store.js`

```js
/** @template T @param {T} initial */
export function createStore(initial) {
  // returns { get(): T, set(patch: Partial<T>, reason: string): void, subscribe(fn: (state: T, reason: string) => void): () => void }
}
export const project = createStore({
  status: 'idle',            // 'idle'|'loading'|'ready'|'error'
  bundle: null,              // GET /api/project/bundle の data（combination は欠けていれば既定値で補う）
  base: null,                // 読込時の { combination, camera, workspace } の複製（外部変更の判定に使う）
  revision: null,            // 統合バンドルの版（bundle_revision）
  projectRevision: null,     // コンビネーション単体の版（GET /api/project?envelope=1 の revision。B-1 修正が前提）
  combinationMissing: false, // project_state.json が無い
  dirty: { combination: false, workspace: false, camera: false },
  autosavePending: false, saving: false,
  error: null,               // ApiErr
  cameraInvalid: null,       // { backup: string|null }。B-3 の 422 を受けたとき
  externalChange: false, syncRevision: null, lastCommandId: null, loadedAt: null,
});
export const assets  = createStore({ status: 'idle', items: [], error: null, loadedAt: null });
export const imports = createStore({ rows: [] }); // このページを開いている間だけ（保存しない）
```
- `set` は浅いマージ。`dirty` を変えるときは `set({ dirty: { ...get().dirty, workspace: true } })` のように丸ごと渡す。`subscribe` の解除関数は画面の後始末（§1.6）に登録する。
- 「未保存がある」は `dirty.combination || dirty.workspace || dirty.camera || autosavePending || saving` で判定する（関数 `hasUnsaved()` を export する）。
- 制作データは**ブラウザーに保存しない**（再読込したら必ずサーバーから読み直す）。ストアの寿命はページの寿命と同じ。

### 1.5 イベントバス `studio/js/bus.js`

```js
export const bus = new EventTarget();
export function emit(name, detail) { bus.dispatchEvent(new CustomEvent(name, { detail })); }
export function on(name, fn) { const h = (e) => fn(e.detail); bus.addEventListener(name, h); return () => bus.removeEventListener(name, h); }
```
イベント名は次の表で固定する（増やすときは本書を更新する）：

| 名前 | detail | 発生元 |
|---|---|---|
| `studio:project-loaded` | `{revision}` | project.js |
| `studio:project-saved` | `{revision, kind: 'autosave'|'bundle'}` | project.js |
| `studio:asset-imported` | `{id}`（`/api/assets` の id） | import.js |
| `studio:assets-refresh` | `{}` | 外部同期（`refresh_assets` コマンド）・取り込みの後 |
| `studio:model-loaded` | `{assetId, format, scale, offset}` | ④ viewport |

旧カメラ画面の `window` イベント（`bai-camera-*`。`camera.js:208〜210`、`camera_3d.js:290〜293`、`camera_project_bundle_ui.js:5〜6・16・19`）は、mount したカメラコードの中でそのまま使う。新UIのバスとの橋渡しは `camera-host.js` だけが行う（§2.6）。

### 1.6 画面の結線方式と後始末

1. **部品の型 `feature` を1つ追加する**：`screens.js` の Control に `{t:'feature', key:'projectSummary', ...opts}` を書けるようにし、`app.js` の `control()` に `case 'feature': return FEATURES[c.key](ctx, c);` を足す。左パネル・中央・右タブにある既存の `custom` の仕組み（`app.js:309, 323, 336`）は残す。`custom` の値は `FEATURES` のキーにそろえる（`assetCats`→`assetCategories`、`assetDetail`→`assetDetail`、SCR-18 左は `projectList`、中央 `type:'library'`→`type:'feature', key:'assetLibrary'`）。`screens.js` はキーの文字列だけを持ち、`features/*.js` を import しない（§1.13）。
2. **`ctx` の形**：`{ screenId, params: URLSearchParams, navigate, onCleanup(fn) }`。部品は、購読の解除・タイマーの停止・three.js の破棄を `onCleanup` に登録する。
3. **後始末は `render()` のたびに行う**：`app.js` に `let cleanups = [];` を置く。`render()` の先頭（671行の `main.textContent=''` の直前）で `for (const f of cleanups.splice(0)) { try { f(); } catch (e) { console.error(e); } }` を実行する。**同じ画面の再描画（タブ切替・テーマ変更など、`render()` を呼ぶ処理すべて）でも実行する。** 部品は再描画のたびに作り直されるので、登録も毎回やり直される。常駐させる部品（⑥のカメラホスト）だけは後始末で破棄せず、`#keepalive` へ移す（§2.6）。
4. **部分再描画**：実データの部品は、自分の根要素だけを作り直す。`refreshLibrary()` のように画面全体の DOM を差し替える処理は、③の移植でサンプル版ごと削除する。
5. **ボタンの印**：実際に API を呼ぶボタンには `data-act="real"` を付ける。`tests/studio-ui.test.cjs` の総当たりテスト（「every action button…」）の対象から `real` を外し（`:not([data-act="real"])` を足す）、各 WP の専用テストで検査する。`unimpl`・`mock`・`form` はこれまでどおり総当たりの対象にする。
6. **`navigate` のクエリ対応**：`navigate(id, { replace, tab, query })`。`query` は `Record<string,string>` で、`tab` と合わせて `URLSearchParams` に組み立てる。`runAction` の `nav:` は `nav:08?import=1&cat=motion` の形を読み、`?` の前を画面ID、後ろを `query` として `navigate` に渡す。`href:` は外部ページ（旧画面など）にだけ使う。
7. **`window.baiStudio` の拡張**（読み取り専用、テスト用）：`project: { getState: () => project.get() }`、`assets: { getState: () => assets.get() }`、④で `viewport: { getState() }`、そして `cleanupCount: () => cleanups.length`。書き込みの関数は公開しない。
8. **後始末のテスト**（`tests/studio-ui.test.cjs` に追加、WP-00c）：実データの部品（`live`）がある画面でタブを10回切り替え、`baiStudio.cleanupCount()` が増え続けないこと（毎回、同じ数に戻ること）を確かめる。

### 1.7 3D ビューポートの埋め込み（④⑤⑥共通の決定）

- **キャラクター・モーション画面（SCR-12/13/05）**：新規の `studio/js/viewport/three-host.js` で作る。モデルの取得と解析は `model-loader.js`（新規）が行い、正規化の式は旧コードのフォーク `normalize.fork.js` に置く。
- **カメラ画面（SCR-02）**：`mount(root)` 化した `camera_3d.js` を**そのまま**使う（§2.6）。three-host は使わない。
- 理由（コードで確認）：
  - `camera_3d.js` は読み込んだ時点で、24個の要素IDを `$()` で取得する（例：`$('camera-asset-status')` 6行目）。関数を export しておらず、モデルの読み込み `loadAsset()`（278行）もモジュールの中に閉じている。そのため SCR-12 からは部品として呼べない。
  - 旧制作画面の `ivLoad()`（`index.html:206`）はインラインなので読み込めない。
  - 両者の正規化は同じ式（高さ 2.0、XZ の中心を原点、足を y=0）。この式を `normalize.fork.js` に写し、照合テスト（§2.4）で一致を確かめる。`camera_3d.js` 側の式は変えない（v1 の O-⑥-3 は、mount 方式にしたので不要になった）。
- three.js は旧画面と同じ **three@0.160.1**。`studio/index.html` の `<head>` に、`camera.html` と同じ importmap（`{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/"}}`）を、`app.js` の `<script type="module">` より前に置く。three は**3D 画面を開いたときだけ** `await import('three')` で読み込む（ホームなどの表示を遅くしない）。
- `createViewport(container, { background })` は `{ scene, camera, renderer, controls, setObject(obj), clear(), resize(), dispose(), getState() }` を返す。
  - 操作には `OrbitControls`（旧制作画面と同じ `three/addons/controls/OrbitControls.js`、`index.html:139`）を使う。大きさは `ResizeObserver` で追従する。
  - `dispose()` は rAF の停止、`renderer.dispose()`、`renderer.forceContextLoss()`、ジオメトリ・マテリアル・テクスチャの dispose を行う。必ず `ctx.onCleanup` に登録する。
  - three-host は同時に1つだけ存在する（⑥のホストは別。§2.6）。
- 失敗したときの表示：
  - WebGL を作れない（例外）：ビューポートに「3D 表示を開始できません（WebGL が使えません）。」と出す。状態は `◇` ではなく `既存・部分` のままにし、操作は無効にする。
  - CDN から three を取れない：「3D ライブラリ（three.js）を読み込めません。インターネット接続を確認してください。」（旧画面も同じ CDN に依存している。§5 K3）。
- `getState()` は `{ loaded: boolean, assetId: string|null, format: string|null, scale: number|null, offset: [x,y,z]|null, renderer: string }` を返す。`renderer` は `WEBGL_debug_renderer_info` の文字列で、取れなければ `'unknown'`。

### 1.8 旧 JS の扱い（ファイルごとの決定）

| 旧ファイル | DOM 依存 | 決定 | 移植先・時期 |
|---|---|---|---|
| `camera_rig.js`, `camera_framing.js`, `camera_lens.js`, `camera_dof.js`, `camera_focus_tracking.js`, `camera_focus_consistency.js`, `camera_sequence_playback.js`, `camera_vmd_local.js` | なし（UMD。`root.BAI*` に公開） | **共有**：新UIからも `<script src="/camera_rig.js">` などでそのまま読む（`legacy.js`）。 | ⑥。`server.py:166` の配信許可リストに既にある。 |
| `camera_follow_config.js`, `camera_follow_smoothing.js` | なし（ESM。export あり） | **共有**：`import { classifyBone } from '/camera_follow_config.js'` で直接 import する。 | ④（ボーン一覧）。配信許可済み。 |
| `camera.js`, `camera_3d.js` | あり（94個・24個の要素ID） | **動作を変えない `mount(root)` 化**（WP-06a）をして共有する。 | ⑥（§2.6）。 |
| `camera_project_bundle_ui.js` | あり（3個） | 新UIでは読まない（②の保存に統合）。ファイルは変えない。 | ⑥（§2.6）。 |
| `v01641_preview_guard.js`, `camera_easing.js`, `camera_cinematic.js`, `camera_vmd_preview.js` | なし | P2 では使わない（camera.html も読んでいない。Phase E §2.11）。 | — |
| `index.html` インライン：制作状態・素材登録・素材棚・同期 | あり | **接着コードを `api.js` で書き直す**（R2-3）。 | ②③ |
| `index.html` インライン：3D の正規化の式 | あり | **フォーク** `viewport/normalize.fork.js`。 | ④ |
| `index.html` インライン：82パターン表（80行）・FBX 連結再生（`chainFrame` 291行〜）・2D 模式再生（71行） | あり | 表と計算は**フォーク**（`motion/patterns.fork.js`・`motion/chain.fork.js`）、表示は新しく作る。 | ⑤（O-⑤-1/2） |
| `retarget_ui.js`（34行。`#sk-source` が無ければ何もしない） | あり | 接着コードを書き直す。 | ④（§2.4 ④-9） |
| `v01629_mesh_compare.js`（26行、three を使う） | あり | 接着コードを書き直す。three での描画は three-host を使う（O-④-5）。 | ④（§2.4 ④-10） |
| `v01630_32_review.js`、`v01633_35_scrub.js`（three を使う）、`v01636_40_playback.js`、`motion_layers.js`、`foot_qa_ui.js` | あり | 接着コードを書き直す（O-⑤-6）。 | ⑤（§2.5 ⑤-10〜⑤-14） |
| `pose_ik_ui.js`（21行）、`bai_ai_ui.js`（25行） | あり | 接着コードを書き直す。 | **⑦の後**（§2.8。既定は残す。Q2） |
| `webmcp.js` | あり | P2 では新UIに読み込まない（R10）。 | Phase E WP-02c |

**型の扱い（WP-00c。2026-10-20 に tsc で確認）**
- ルート直下の旧 ESM を `import '/camera_follow_config.js'` で読むと、tsc は TS2307（モジュールが見つからない）になる。批評案の `declare module '/camera_follow_config.js'` は、`/` で始まる名前が相対パス扱いになるため **TS2436 で失敗する**。
- そこで `tsconfig.json` の `compilerOptions.paths` に `{"/camera_follow_config.js": ["./studio/types/legacy/camera_follow_config.d.ts"], "/camera_follow_smoothing.js": ["./studio/types/legacy/camera_follow_smoothing.d.ts"], "/camera_3d.js": ["./studio/types/legacy/camera_3d.d.ts"]}` を足し、宣言ファイルを置く。この方式で型が効くことを、作業用ディレクトリで tsc 5 で確かめた。
- `window.BAICameraRig` などの UMD と `window.BAICameraPage`（§2.6）は、`studio/js/legacy-globals.d.ts`（`interface Window { … }`、`any` で宣言）に書く。`tsconfig.json` の `include` に `studio/js/**/*.d.ts` と `studio/types/**/*.d.ts` を足す。
- **写したコード**は `*.fork.js` という名前にして、先頭に `// @ts-nocheck 旧コード <file>:<行> @5865209 のフォーク。照合テスト <テスト名> で一致を保証` を書く。対象は次の3つで固定する：`viewport/normalize.fork.js`、`motion/patterns.fork.js`、`motion/chain.fork.js`。増やすときは本書を更新する。`tests/test_screen_status_honesty.mjs`（§1.13）の中で、`@ts-nocheck` が `*.fork.js` にしか無いことも確かめる。新しく書くコードは必ず型検査を通す。

`studio/js/legacy.js`：
```js
const loaded = new Map(); // src -> Promise<void>
/** 共有 UMD を1回だけ <script> で読み込む。読み込みに失敗したら reject する（呼び出し側が状態を表示する）。 */
export function loadLegacyScript(src) {}
/** 例：await loadLegacyScripts(['/camera_rig.js', '/camera_framing.js']) は書いた順番どおりに読む */
export async function loadLegacyScripts(list) {}
```

### 1.9 ルーティング

- 既存の `/workspace/NN?tab=<id>` を保つ。P2 で使う追加のクエリは次のとおり。どれも任意で、再読込すると同じ表示に戻る。

| クエリ | 画面 | 意味 |
|---|---|---|
| `asset=<id>` | 08, 12 | 選択中の素材（`/api/assets` の id、`encodeURIComponent`） |
| `import=1` | 08 | 取り込みダイアログを開く（SCR-23・SCR-01 から遷移）。開いたら `history.replaceState` で `import` を消す（戻る・再読込でダイアログが再び開かないように） |
| `cat=<id>` | 08 | 左の分類（`char`、`motion`、…、`all`） |

- 選択を変えたら、`history.replaceState` でクエリだけを更新する（タブ切替の既存処理 `app.js:310〜316` と同じ方法）。
- 画面を移っても `project`・`assets`・`imports` のストアは保たれる（同じページの中なので）。

### 1.10 読込中・空・失敗・未接続の表示

`state-box.js`：`stateBox({ kind: 'loading'|'empty'|'error'|'offline', title, message, retry? })` が `HTMLElement` を返す。見た目は既存の `.empty`（`app.css`）を流用し、`kind` を `data-kind` に入れる。`retry` があれば「↻ 再読込」ボタン（`data-act="real"`）を付ける。
- 読込中の表示は、300ms 以上かかったときだけ出す（ちらつきを防ぐ）。
- 「未接続」は `offline`・`timeout` のとき。失敗は `ApiErr` の `messageFor()` の文言をそのまま出す。
- 空（0件）は「まだありません」と、次の操作への導線（例：素材管理なら「素材を取り込む」）。

### 1.11 UI 設定の保存

- 既存の `bai.studio.prefs.v1`（テーマ・密度・タイムラインの折りたたみ）はそのまま。
- 追加するのは `bai.studio.lib.v1` で、素材管理の表示形式（`view: 'grid'|'list'`、`size: 1..3`、`sort`、`fmt`）だけを入れる。読み書きは try/catch で囲み、失敗しても既定値で動くようにする。
- 制作データ・選択中の素材・未保存の編集は保存しない（§1.4）。

### 1.12 静的配信

- `studio/js/**`・`studio/styles/**` の新しいファイルは、`studio_routes.py` の既存の規則で配信される（追加の設定は不要）。`.d.ts` は型検査専用で、ブラウザーは読まない。
- 共有する旧 JS は、`server.py:166` の許可リスト（`camera_*.js` 15件）から配信される。⑥で `camera.js`・`camera_3d.js` を新UIから読むときも、既に許可されているので変更はいらない。ほかに必要な旧ファイルが出たら、`server.py:166` に足し、`tests/test_studio_routes.py` に 200 の確認を足す。
- three.js は CDN（importmap）から読む。テストでは Playwright の `context.route` でローカルのファイルに差し替える（§4）。

### 1.13 状態バッジと台帳の更新規則

- `screens.js` の Panel に、任意のフィールド `evidence?: string`（`<テストファイル>::<テスト名>`）と `shell?: true` を足す。
  - `status:'real'` のパネルは `evidence` が必須。
  - `shell:true` は、シェル自体が機能を果たしているパネル（FAQ・テーマ・ヘルプ）に付ける。この場合の `evidence` は `tests/studio-ui.test.cjs` のテストでよい。
  - WP-00c で、既存の `real` 24か所に `evidence` か `shell` を書く。
- 新しいテスト `tests/test_screen_status_honesty.mjs`（`node --test`）：
  - `studio/js/screens.js` を **import** し、`status:'real'` の各パネルに `evidence` があること、そのファイルが存在すること、テスト名の文字列がそのファイルの中にあることを確かめる。
  - あわせて次も確かめる：`screens.js` の import 先が `./samples.js` だけであること、`shell:true` のパネルの `evidence` が `tests/studio-ui.test.cjs` を指していること、`@ts-nocheck` が `*.fork.js` にしかないこと（§1.8）。
- **完了ゲート**：各 WP の最後に、`evidence` に書かれたテストファイルを全部実行する（`node tools/run_evidence_tests.mjs`。`screens.js` から一覧を作り、`node --test` に渡すだけの小さなスクリプト。WP-00c で作る）。
- `tools/gen_screen_matrix.mjs`：`API` の対応（6行）を `real: 'existing_api_read_write'` にする。`blockers` の文言（21行）の「after Phase E per owner decision」を「P2 (before Phase E, owner decision 2026-10-20)」に直す。`evidence` を行に出力する。各 WP の最後に再生成し、コミットに含める。
- `screens.js:36` の `PH.P2` を `'P2 既存機能の新UI移植（Phase E より前・作業の流れ順。所有者決定 2026-10-20）'` に直す。`docs/ui/STUDIO_DESIGN_SYSTEM_JA.md:3` の「P2、Phase E の後」も同じように直す（WP-00c）。

### 1.14 既存テストへの影響

**サーバーを使う既存テストの分類**（2026-10-20 に確認）

| 種類 | テスト | P2 での扱い |
|---|---|---|
| サーバーを別プロセスで起動 | `tests/studio-ui.test.cjs`（8799、実 `data/`）、`tests/legacy-ui-layout.test.cjs`（`LEGACY_UI_TEST_PORT` 既定 8798、実 `data/`、`process.env.CHROMIUM`、`PYTHON`） | WP-00a で共通ハーネス（§4）に移し、一時データディレクトリを使う。ポートは今のまま。`legacy-ui-layout.test.cjs` は、別作業（`5865209`）の変更が入った後に移す。 |
| 同じプロセスで `import server` し、`ThreadingHTTPServer(('127.0.0.1',0), server.Handler)` を使う | `tests/test_camera_focus_endpoint.py`、`tests/test_legacy_ui_minimal_fix.py` | ルートの `conftest.py`（WP-00a）が import より前に `BAI_DATA_DIR` を設定するので、変更しなくても隔離される。WP-00a で隔離されていることを確かめる。 |
| ログのモジュールを import | `tests/test_logging.py`（`diagnostic_logging`） | 同上（`LOG_DIR` が `data_dir()/'logs'` になる）。 |
| ソースの文字列だけを検査（サーバーなし） | `tests/dev-workflow.test.cjs`、`tests/test_v01618_humanoid_ui.py`、`test_v01630_32_review.py`、`test_v01633_35_keyframe_review.py`、`test_camera_dof.cjs`、`test_camera_lens.cjs` ほか | データには触れない。WP-06a で該当するもの（下表）は、mount 化に合わせて直す。 |

**WP ごとに直すテスト**

| テスト | 変更 | WP |
|---|---|---|
| `tests/studio-ui.test.cjs`、`tests/legacy-ui-layout.test.cjs` の起動処理 | 共通ハーネス（§4）に移す。 | WP-00a |
| `tests/studio-ui.test.cjs`「every action button…」 | 対象から `[data-act="real"]` を外す。後始末のテスト（§1.6-8）を足す。 | WP-00c |
| `test_legacy_project_client_revision.py:8〜11` | 文字列の出現回数ではなく、実際の HTTP 応答を検査する `tests/test_project_envelope.py` に置き換える（B-1）。 | WP-00b |
| `tests/studio-ui.test.cjs`「unimplemented actions…」SCR-18 の「復元…」 | ②で `form:confirmRestore` が実際の再読込に変わるので、この行を削除し、②のテストへ移す。 | WP-01 |
| 同 SCR-01 の新規プロジェクトのフォーム | Q1 の既定で［新規プロジェクト］が ◇ になる。フォームの検証の検査を削除し、「◇ ダイアログに DATA-008 が出る」検査に置き換える。Q1 が承認されたら元に戻す。 | WP-01 |
| 同「read-only live data…」SCR-18 | `[data-live="projectBundle"]` は `[data-feature="projectSummary"]` になる。 | WP-01 |
| `camera.js`・`camera_3d.js`・`camera.html` のソース文字列を検査するテスト：`test_bai_camera.py`、`test_bundle_revision.py`、`test_bundle_snapshot_consistency.py`、`test_camera_3d_focus_contract.py`、`test_camera_bone_follow_wiring.py`、`test_camera_bundle_preflight.cjs`、`test_camera_dof.cjs`、`test_camera_focus_fail_closed.cjs`、`test_camera_focus_overlay.cjs`、`test_camera_focus_update_order.cjs`、`test_camera_focus_vmd_range.cjs`、`test_camera_follow_project.py`、`test_camera_html_wiring_recovery.py`、`test_camera_lens.cjs`、`test_camera_model_bounds_wiring.py`、`test_camera_project_bundle_ui.py`、`test_camera_projection_wiring.py`、`test_camera_rail_handles.py`、`test_camera_rig_store.py`、`test_camera_sequence_ui.py`、`test_camera_vmd_local.py`、`test_camera_vmd_render_priority.py`、`test_camera_vmd_timeline_wiring.py`、`test_camera_workspace_contract.py`、`test_project_state_bundle.py`、および `tests/legacy-ui-layout.test.cjs`・`tests/studio-ui.test.cjs`・`tests/test_studio_routes.py` | mount 化の後も全件を走らせる。失敗したものは、**同じ意味の検査**に直す（例：`const $=id=>document.getElementById(id)` を探していた検査は、`root.querySelector('#'+CSS.escape(id))` を探す検査にする）。検査の意味を弱めない。直した一覧はコミット本文に書く。 | WP-06a |

### 1.15 前提として直す既存不具合（すべてバグ修正。新機能ではない）

- **B-1**（DATA-008）：`server.py:316〜320` の重複した分岐を削除し、321〜325行（封筒付き）を残す。
  - 期待する動作：`GET /api/project` はこれまでどおり生データを返す。`GET /api/project?envelope=1` は `{"project": <生データ>, "revision": camera_revision(<生データ>)}` を返す。ファイルが無いときは `{"project": {}, "revision": camera_revision({})}`。
  - `POST /api/project` の重複（918〜940行）は到達しないだけで害がないので、触らない（変更を最小にする）。
  - これで旧画面の保存・読込が直る（見た目は変えない）。コミット本文に「DATA-008：旧制作画面のコンビネーション保存が常に失敗していた不具合の修正。新機能ではない」と書く。
- **B-2**：`index.html` の `externalProjectApply`（376行）で、適用が終わった後（`info(...)` の後）に次の1文を足す。
  ```js
  fetchProjectVersion().then(v=>{if(JSON.stringify(v.project)===JSON.stringify(obj))projectRevision=v.revision}).catch(()=>{});
  ```
  - 取り込んだ内容とサーバーの内容が同じときだけ版を戻す（違えば、次の同期でもう一度取り込まれる）。失敗しても今の動作（`null` のまま）と同じなので、悪くなることはない。
  - `index.html` は別作業（`5865209`）で配置を戻したばかりなので、その変更の後に当てる。変えるのはこの1文だけ。
  - コミット本文に「B-2：外部同期の後に旧制作画面で保存できなくなる不具合の修正」と書く。
- **B-3**（G-06 の一部の前倒し。Phase E §2.7 の仕様どおり）：
  1. `bai_camera.py` に `class CameraProjectInvalid(Exception)`（`message`、`backup_name`）と `read_project(path) → (project, dropped_fields)` を新しく作る。作るのは**読込エラーの分岐だけ**。
     - ファイルが無い：`DEFAULT` を返し、ファイルは書かない。
     - OSError：`backup_name=None` で `CameraProjectInvalid` を投げる。
     - JSON が不正・検証に失敗：生のバイト列の `sha8` を求める。読んだファイルと同じフォルダに `camera_project.invalid-<sha8>-*.json` が無ければ、`camera_project.invalid-<sha8>-<YYYYmmddTHHMMSSZ>.json` に生のバイト列をコピーする（同じ内容なら1回だけ）。元のファイルは動かさずに `CameraProjectInvalid` を投げる。
     - `dropped_fields` は P2 では常に `[]` を返す（未知のフィールドを検出する処理は WP-02a のまま）。
     - **旧 `read()` は変えない**（WP-02a で `read_project(path)[0]` にする）。
  2. `server.py:163` の `bad` を `def bad(self,status,msg,code=None)` にする（Phase E §2.4 と同じ形）。`code` があれば本文に `error_code` を足す。既存の呼び出しは変えない。
  3. `project_state_bundle.read_bundle(combination_path, camera_path, strict=False)`：`strict=True` のときだけ `read_project` を使う。
  4. `server.py` の統合バンドルの GET（168〜173行）と POST（369・373行の `read_bundle`）だけ `strict=True` にする。`CameraProjectInvalid` を捕まえたら 422 `{error, error_code:'camera_project_invalid', backup}` を返す。POST は書く前に読むので、**壊れたファイルは上書きされない**。
  5. 旧 `camera.html` の統合保存・復元（`camera_project_bundle_ui.js`）は、この 422 を受けると `data.error` を `#bundle-status` に表示して止まる。既存の `api()` が `!r.ok` で例外を出す作りなので、ファイルの変更はいらない。既定値で上書きしなくなるだけの安全側の変化で、コミット本文に書く。カメラ単独の `GET/POST /api/camera/project` は WP-02a まで今のまま。
- 新UIの②の自動保存は B-1 に依存する。②の統合保存は B-3 に依存する。どちらも WP-01 より前（WP-00b）に直す。

---

## 2. ステップ別の詳細

各ステップは同じ章立てで書く：(a) 移植する機能、(b) 移植先（画面・パネル）、(c) 使う既存 API・コード、(d) 新UIの動作、(e) 置き換えるサンプル、(f) 受け入れ条件、(g) テスト、(h) ◇ 未実装のまま残すもの。

### 2.2 ② プロジェクト新規作成・保存/読込（WP-01、実装できる細かさ）

#### (a) 移植する機能

| # | 旧画面の機能 | 根拠 | 新UIでの扱い |
|---|---|---|---|
| ②-1 | 制作状態の読込（起動時に自動、`project-load` で手動） | `index.html:379, 383`、`camera_project_bundle_ui.js:19` | 移植する。読込元は統合バンドル `GET /api/project/bundle` と `GET /api/project?envelope=1`。 |
| ②-2 | コンビネーションの自動保存（編集から 450ms 後） | `index.html:372〜374` | 移植する（`POST /api/project`、If-Match 付き）。 |
| ②-3 | 統合状態の保存（コンビネーション＋カメラ＋作業参照 workspace） | `camera_project_bundle_ui.js:18`、`server.py:359〜376` | 移植する。新UIの明示の［保存］。 |
| ②-4 | 編集履歴の一覧・戻す・やり直す・選んで復元 | `index.html:370, 375, 380〜381` | 移植する（コンビネーションの `history`・`cursor`）。 |
| ②-5 | 外部（MCP・他の画面）の変更の取り込み | `index.html:420〜456`、`index.html:376` | 移植する。ただし**未保存の変更がある間は上書きしない**（R8。旧画面は確認なしで上書きしていた）。 |
| ②-6 | 新規プロジェクトの作成 | 旧画面に無い（`LEGACY_UI_INVENTORY_JA.md` ①「旧UIに該当UIなし」） | **既定では ◇ 未実装のまま**（Q1）。 |
| ②-7 | 版（revision）による同時編集の検知 | `server.py:363〜372`（409/428）、`server.py:908〜914`（409） | 移植する（If-Match と 409 の扱い）。 |

#### (b) 移植先

- **SCR-18 プロジェクト保存・復元・バージョン管理**（`screens.js:494〜513`）
  - ツール（`tools`）：`現行カメラ画面で保存・復元`（href）を削除し、`{t:'feature', key:'projectToolbar'}` を置く。中身は［保存］（primary、`data-act="real"`）と［再読込］（`data-act="real"`）。既存の `復元…`（`form:confirmRestore`）は、確認付きの［再読込］に置き換える（フォーム定義 `FORMS.confirmRestore` は削除する）。`ポータブルZIP`（◇、DATA-012）は残す。
  - 状態行（`{t:'feature', key:'projectStatus'}`、中央の先頭、`role="status" aria-live="polite"`）に、次のどれかを出す：`未読込`／`読込中…`／`保存済み`／`自動保存待ち…`／`保存中…`／`未保存の変更があります（［保存］で保存）`／`未接続`／`サーバー側が更新されました`／`カメラ保存データを読めません`。v1 で予定していたトップバーの `#project-chip` は作らない（モックに無い部品なので）。他の画面では、状態が変わったときのトーストで知らせる。
  - 左の `プロジェクト`（`custom:'projectList'`）：一覧に1件「現在の制作状態」（`meta` は最終更新時刻）。`status:'real'`。
  - 中央カード1「現在の制作状態（読み取り）」：タイトルを「現在の制作状態」に変え、`{t:'feature', key:'projectSummary'}` にする。`status:'real'`。
  - 中央カード2「バージョン」：`{t:'feature', key:'projectHistory'}`（版の短縮表示と編集履歴）。`status:'real'`。カードの中の「版を比較」は ◇（DATA-009）のまま。
  - 中央カード3「アーカイブ」：◇ のまま。
  - パネルの状態：`保存・復元` は real、`バージョン` は real（note：「編集履歴はコンビネーションのみ。任意の版との差分比較は未実装」）、`プロジェクト一覧` は real（note：「単一の制作状態」）。他は今のまま。
- **SCR-01 ホーム**（`screens.js:82〜116`、`app.js:470〜509`）
  - 「最近のプロジェクト」：`PROJECTS` のサンプル4枚（`app.js:483〜487`）を、`projectCard` 部品（1枚）に置き換える。カードを押すと SCR-18 へ移る。サンプル画像は使わず、形式アイコンの無地のタイルにする。注記「複数のプロジェクト管理は未実装です（新規作成は ◇）」。`status:'real'`。
  - ツールとヒーローの［新規プロジェクト］（`form:newProject`）：Q1 の既定に従い **`unimpl`** にする。why は「現在のサーバーは制作状態を1つだけ保持します。新しい制作状態を作る機能は未実装です（DATA-008 の範囲外、テンプレートからの作成は NF-019）」、ids は `['DATA-008','NF-019']`、phase は `PH.P2`。`FORMS.newProject` は削除しない（Q1 が承認されたら使う）。

#### (c) 使う既存 API・コード

| 操作 | API | 旧コード（見本） |
|---|---|---|
| 読込 | `GET /api/project/bundle` → `{schema, combination|null, camera, workspace|null, complete, revision}`（`server.py:168〜173`）。カメラが壊れていれば 422 `camera_project_invalid`（B-3）。あわせて `GET /api/project?envelope=1` → `{project, revision}`（B-1） | `camera_project_bundle_ui.js:4, 19`、`index.html:371` |
| 自動保存 | `POST /api/project`、`If-Match: <projectRevision>`、本文はコンビネーション → `{ok, revision}`（`server.py:895〜917`、3MB まで） | `index.html:372〜373` |
| 統合保存 | `POST /api/project/bundle`、`If-Match: <revision>`、本文 `{schema:1, combination, camera, workspace?}` → `{ok, schema, revision}`（`server.py:359〜376`、4MB まで） | `camera_project_bundle_ui.js:18` |
| 外部変更の検知 | `GET /api/sync` → `{revision, commandId, command}`（`server.py:310〜311, 138〜148`） | `index.html:425〜455` |
| 既定のコンビネーション | `{schema:1,title:'無題のプロジェクト',timeline:[],history:[],cursor:-1,selected:0,playbackSpeed:1,updatedAt:''}` | `index.html:364`（そのまま写す） |
| 履歴の復元 | クライアント内の処理（`timeline = clone(history[i].timeline)`、`cursor = i`、`playbackSpeed = history[i].playbackSpeed || 1`。`selected` は変えない） | `index.html:375` |

#### (d) 新UIの動作（`features/project.js`）

```js
export const DEFAULT_COMBINATION = Object.freeze({ schema: 1, title: '無題のプロジェクト', timeline: [], history: [], cursor: -1, selected: 0, playbackSpeed: 1, updatedAt: '' });
export async function loadProject({ discardLocal = false } = {}) {}  // 未保存があって discardLocal=false なら、何もせずに false を返す
export function restoreHistory(index) {}                               // status!=='ready' または範囲外なら何もしない
export const undo = () => restoreHistory(project.get().bundle?.combination.cursor - 1);
export const redo = () => restoreHistory(project.get().bundle?.combination.cursor + 1);
export function setWorkspaceAsset(filename) {}                         // ④ が使う（§2.4）。マージ規則は下の 9
export async function saveProject() {}                                 // 統合保存（下の 5）
export function startExternalSync() {}                                 // 1回だけ呼ぶ。app.js の起動時
export function hasUnsaved() {}
export function summarize(bundle) {}                                   // 表示用の純関数（下の表）
```

1. **起動時**：`app.js` の最後（`buildNav()` の後）で `loadProject()` と `startExternalSync()` を呼ぶ（どの画面から開いても1回だけ）。
2. **読込** `loadProject()`：
   - `status:'loading'` にして、`GET /api/project/bundle` と `GET /api/project?envelope=1` を並行で取る。
   - 両方成功したら：
     - `envelope.project` と `bundle.combination ?? {}` を JSON として比べる。違えば読込中に変更があったので、1回だけ取り直す。それでも違えば `status:'error'`（「保存データを一貫した状態で読めませんでした。再読込してください。」）。
     - 一致すれば、`bundle = data` にする。`combination` が `null` なら、**ストアの中でだけ** `structuredClone(DEFAULT_COMBINATION)` を入れ、`combinationMissing: true` にする。
     - `base = structuredClone({combination: data.combination, camera: data.camera, workspace: data.workspace})`、`revision = data.revision`、`projectRevision = envelope.revision`、`dirty` を全部 false、`status:'ready'`、`loadedAt = Date.now()`、`emit('studio:project-loaded')`。
   - 統合バンドルが 422 で `serverCode==='camera_project_invalid'` のとき：`status:'error'`、`cameraInvalid:{backup: body.backup}`。状態行と SCR-18 に「カメラ保存データ（camera_project.json）を読めませんでした。元のファイルはそのままです。退避コピー：{backup ?? 'なし（ファイルを開けません）'}。この状態では保存できません。」と出し、［保存］と自動保存を止める。復旧の手段（invalid-preview・reset・退避ファイルのダウンロード）は Phase E WP-02a で作るので、ここでは ◇ の説明だけを出す（ids `['CAM-G06']`、phase「Phase E WP-02a」）。
   - その他の失敗：`status:'error'`、`error` を入れる。
3. **履歴の復元** `restoreHistory(i)`：
   - 実行するのは `status==='ready'` かつ `0 ≤ i < history.length` のときだけ。
   - 変えるのは次の3つ：`combination.timeline = structuredClone(history[i].timeline)`、`combination.cursor = i`、`combination.playbackSpeed = history[i].playbackSpeed || 1`。**`selected` と `history` 配列は変えない**（旧 `restore` と同じ）。
   - `dirty.combination = true` にして、自動保存の予約（下の 4）をする。
4. **自動保存**（旧 `autosave()` と同じく 450ms 後。`index.html:373`）：
   - コンビネーションが変わるたびにタイマーを引き直し（`autosavePending:true`）、450ms 後に `autosave()` を実行する。
   - `saving` 中なら、終わってからもう一度予約する（旧と同じ）。`status!=='ready'` や `cameraInvalid` のときは予約しない。
   - 本文は `{ ...combination, updatedAt: new Date().toISOString() }`（`selected`・`playbackSpeed` はストアの値のまま）。`POST /api/project` に `If-Match: projectRevision` を付けて送る。
   - 200 のとき：
     - `projectRevision = data.revision`、`bundle.combination = 送った本文`、`base.combination = 送った本文`、`combinationMissing:false`、`dirty.combination:false`、`autosavePending:false`。
     - 続けて `GET /api/project/bundle` を取る。`combination` が送った本文と等しく、かつ `camera`・`workspace` が `base` と等しければ、`revision = data.revision` だけを更新する。違えば、外部の変更として下の 7 と同じ処理をする。
     - 状態行は「保存済み」。`emit('studio:project-saved',{kind:'autosave'})`。トーストは出さない（旧画面と同じく静かに保存する）。
   - 409 のとき：自動保存を止める（`autosavePending:false`、`dirty.combination` は true のまま）。ダイアログ「サーバー側が更新されています」を出す。本文は「他の画面（現行の制作画面・カメラ画面）や MCP が先に保存しました。この画面の変更はまだ残っています。」、ボタンは［再読込して変更を破棄］（`loadProject({discardLocal:true})`）と［閉じる］。**マージはしない。**
   - 400 のとき：「自動保存できませんでした：{serverMessage}」。`dirty` は残す。413 は `too_large`（`limitLabel: LIMITS.project`）。
   - offline/timeout のとき：「未接続：自動保存できませんでした。変更はこの画面に残っています。」と出し、`dirty` は残す。回復したら（下の 7 の tick が成功したら）もう一度予約する。
5. **統合保存** `saveProject()`（［保存］）：
   - 未保存が何も無い（`hasUnsaved()===false`）なら、何もせずにトースト「変更はありません」（`kind:'real'`）。`saving` 中なら何もしない（ボタンは無効になっている）。
   - 自動保存の待ちがあれば、タイマーを取り消して統合保存に含める。
   - 本文は `{ schema: 1, combination: { ...combination, updatedAt: new Date().toISOString() }, camera: bundle.camera }`。**`bundle.workspace` が `null` でなければ、必ず `workspace` を含める**（含めないとサーバーが workspace のファイルを削除する：`project_state_bundle.py:95〜98`）。
   - ⑥の後は、カメラホストが読み込み済みなら `camera`・`workspace` をホストから集める（§2.6）。
   - `combinationMissing` のときは、確認ダイアログ「コンビネーション（project_state.json）はまだ作られていません。保存すると空のコンビネーションも一緒に作られます。」で［続ける］［キャンセル］を選ばせる。
   - `POST /api/project/bundle` に `If-Match: revision` を付けて送る（`limitLabel: LIMITS.bundle`）。
   - 200 のとき：`revision = data.revision`、`bundle.combination = 送った combination`、`base` を送った内容で更新、`combinationMissing:false`、`dirty` を全部 false。続けて `GET /api/project?envelope=1` を取り、`project` が送った combination と等しければ `projectRevision` を更新する（違えば外部の変更として 7 の処理）。トースト「保存しました（コンビネーション・カメラ・作業中の素材参照）。」（`kind:'real'`）、`emit('studio:project-saved',{kind:'bundle'})`。
   - 409：4 と同じダイアログ。422 `camera_project_invalid`：2 と同じ表示にして保存を止める。428：`revision_required`（通常は起きない）。400：「保存できませんでした：{serverMessage}」（例：`invalid combination cursor`）、`dirty` は残す。offline/timeout：「未接続：保存できませんでした。変更はこの画面に残っています。」
6. **再読込**（［再読込］と、`復元…` の確認の後）：未保存があれば確認ダイアログ「保存していない変更を破棄して、サーバーの保存済み状態を読み込みますか？」（［破棄して読み込む］［キャンセル］）を出す。未保存が無ければ、そのまま `loadProject({discardLocal:true})`。
7. **外部変更** `startExternalSync()`：`setInterval(tick, 1200)`（旧と同じ間隔）と、`document.visibilitychange`（画面が表示に戻ったとき）で `tick()` を呼ぶ。
   - `tick()` は同時に1つしか動かさない。`GET /api/sync` を取る。
   - **初回**は、`syncRevision` と `lastCommandId` を覚えたうえで、`GET /api/project/bundle` の `revision` を `project.revision` と比べる（読込から初回までの間の変化を見逃さないため）。
   - 2回目以降は、`revision` が変わったときだけ `GET /api/project/bundle` を取る。
   - 比べた結果、`data.revision === project.revision` なら何もしない（自分の保存による変化）。違うとき：
     - 未保存が無い：読み込み直して、トースト「外部の変更を読み込みました」（`kind:'real'`）。
     - 未保存がある：`externalChange:true` にし、状態行に「サーバー側が更新されました。保存されていない変更があるため、自動では読み込みません。［再読込して変更を破棄］」と出す。自動保存の待ちがあれば、それも止める（送れば 409 になるだけなので）。
   - `visibilitychange` のときは `/api/sync` を見ずに、直接 `GET /api/project/bundle` の `revision` を比べる（カメラ画面の保存 `POST /api/camera/project` は `sync_bump` を呼ばないため：`server.py:427〜438`）。
   - `command`（`play_chain` など、`server.py:846〜862`）のうち、②で扱うのは `refresh_assets` だけ（`emit('studio:assets-refresh')`）。他のコマンドは無視する（⑤⑥で扱う。旧画面は `index.html:435〜450`）。`commandId` が `lastCommandId` と同じなら処理しない。
   - 失敗が続いても例外は出さない。状態行に「未接続」と出し、回復したら元の表示に戻す。
8. **離脱の警告**：`window.addEventListener('beforeunload', e => { if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; } })`。画面内の移動（SPA）では警告しない（ストアは保たれるので）。
9. **workspace のマージ規則**（④⑤⑥共通。`setWorkspaceAsset` などが使う）：
   - 新しい値は `{ ...(bundle.workspace ?? { frame: 0, asset: '', clip: null }), asset: filename }` の形で作る。`asset` が変わったときだけ `clip: null` にし、`frame` と今後増えるフィールド（Phase E WP-02d で足すもの）は残す。
   - **所有者は1つに決める**：カメラ関連のフィールド（Phase E WP-02d で足すものを含む）はカメラ画面（⑥）が持つ。④が書くのは `asset` だけ（`asset` が変わったときの `clip:null` を含む）。⑤が書くのは `clip`・`frame`（O-⑤-7）。
   - 変更したら `dirty.workspace=true` にする（保存は［保存］で行う）。
10. **表示**（`project-view.js`。`summarize(bundle)` の出力を使う）：

| 表示項目 | 値 | 例 |
|---|---|---|
| タイトル | `combination.title`（`combinationMissing` なら「（未保存）」を付ける） | 無題のプロジェクト |
| 最終更新 | `combination.updatedAt` を `toLocaleString('ja-JP')`。空なら「—」 | 2026/10/20 14:28:00 |
| コンビネーション | `timeline.length` 件、履歴 `history.length` 件（現在 `cursor+1` 番目） | 2件・履歴3件（3番目） |
| カメラ | `camera.keys.length` キー、`camera.duration` フレーム、`camera.fps` fps | 2キー・300F・30fps |
| 作業中の素材 | `workspace.asset`（空なら「なし」）、`workspace.clip`、`workspace.frame` | char.vrm・クリップ0・F 0 |
| 統合保存 | `complete` が true なら「保存済み」、false なら「コンビネーション未保存（保存すると作成されます）」 | — |
| 版 | `revision.slice(0, 12)`（`title` 属性に全体） | 6d1875cf2667 |

   - 編集履歴（`projectHistory`）：`history` を保存順に一覧にする（`(i+1). 日時 ラベル`。旧 `ui()` と同じ書式：`index.html:370`）。`cursor` の行に「現在」と付ける。行を選ぶと［この時点に戻す］（`restoreHistory(i)`）が使える。［戻す］は `cursor <= 0` のとき、［やり直す］は `cursor >= history.length-1` のとき無効（`index.html:370` と同じ条件）。`status!=='ready'` のときは全部無効。履歴が0件なら空表示「履歴はまだありません。コンビネーションを編集すると記録されます（現行の制作画面、または ⑤ の移植後）。」
   - ［保存］が無効になる条件：`hasUnsaved()===false`、`saving`、`status !== 'ready'`、`cameraInvalid` のどれか。
11. **アクセシビリティ**：状態行は `role="status"`。ダイアログは既存の `openModal()`（Esc・フォーカス固定）を使う。

#### (e) 置き換えるサンプル

`app.js:483〜487` の `PROJECTS` の表示、`screens.js:509` の `live('projectBundle')`、`FORMS.confirmRestore`（`screens.js:676〜681`）、SCR-18 左パネルの固定 `{id:'cur', meta:'サーバー'}`。`samples.js` の `PROJECTS` は SCR-01 から参照されなくなるので削除する（他に参照が無いことを `grep` で確かめてから）。

#### (f) 受け入れ条件

1. 一時データ（§4）に置いた `project_state.json`・`camera_project.json`・`project_state.workspace.json` の内容が、SCR-18 と SCR-01 に表の書式で出る。
2. ［戻す］の 450ms 後に、`project_state.json` の `cursor`・`timeline` が変わる。`If-Match` は読込時の封筒の版。`selected` は変わらない。`project_state.workspace.json` と `camera_project.json` は変わらない（JSON として等しい）。その後の統合保存が 409 にならない（版を取り直しているので）。
3. ［戻す］の直後（450ms 以内）に［保存］を押すと、統合バンドルが1回だけ送られ、`POST /api/project` は送られない。workspace のファイルは残る。
4. 読込の後で別の経路から保存すると（409 が起きる状況）、新UIの保存は拒否され、ファイルは別の経路の内容のまま。ダイアログから再読込すると新しい内容が出る。
5. `project_state.json` が無い状態で何も編集しなければ、［保存］は無効で、ファイルは作られない。
6. 壊れた `camera_project.json` があると、SCR-18 に「読めません」と退避名が出て、［保存］が無効になる。ファイルのバイト列は変わらず、退避コピーが1つだけできる。
7. 外部から `POST /api/project` で保存すると、未編集なら3秒以内に表示が更新される。
8. 自動保存の通信中に再読込すると、`beforeunload` が発生する。
9. 旧制作画面（隔離データ）で、B-1・B-2 の修正後に［保存］が成功する。外部の変更を取り込んだ後でも、続けて［保存］が成功する。
10. 実 `data/` のハッシュが変わらない（§4）。型検査と既存テストがすべて合格する。

#### (g) テスト（追加）

`tests/studio-p2-project.test.cjs`（Playwright、ポートは `P2_PROJECT_PORT` で既定 8797、§4 のハーネス）：

| テスト名 | 主な検査 |
|---|---|
| `SCR-18 shows the real production state` | 種データ（コンビネーション2件・履歴3件で cursor=2、カメラ2キー・300F、workspace `{frame:0, asset:'', clip:null}`）を使う。`[data-feature="projectSummary"]` に「2件」「履歴3件（3番目）」「2キー」「300F」が出て、版の先頭12文字が `GET /api/project/bundle` の `revision` と一致する。カードの見出しに `.badge-real` がある。 |
| `undo autosaves the combination with the envelope revision` | ［戻す］を押し、`page.waitForRequest` で `POST /api/project` を待つ。`If-Match` が `GET /api/project?envelope=1` の `revision` と一致し、送るまでの時間が 400ms 以上であることを確かめる。保存後の `project_state.json` は `cursor===1`、`timeline` が history[1] と同じ、`selected` は種データのまま。workspace とカメラのファイルは JSON として変わらない。状態行は「保存済み」。続けて［戻す］→（450ms 以内に）［保存］で統合保存が 200 になる。 |
| `explicit save flushes the pending autosave into the bundle` | ［戻す］の直後に［保存］を押す。`POST /api/project/bundle` が1回、`POST /api/project` が0回（2秒待って確かめる）。workspace のファイルが残っている。 |
| `autosave conflict keeps local edits and offers reload` | `page.route('**/api/sync', r => r.abort())` で同期を止める。読込の後、テストから Node の fetch で `POST /api/project`（timeline 3件）を送る。UI で［戻す］を押すとダイアログに「他の画面」が出て、ファイルは3件のまま。［再読込して変更を破棄］を押すと「3件」が出る。 |
| `bundle conflict keeps local edits` | 同期を止めて、外部から `POST /api/project/bundle`（正しい版、camera.duration=400）を送る。［戻す］の直後に［保存］を押すとダイアログが出て、ファイルの duration は 400 のまま。 |
| `invalid camera file blocks saving and is never overwritten` | 種データの `camera_project.json` を `{"broken":` にする。状態行に「カメラ保存データ」と退避名 `camera_project.invalid-` が出る。［保存］は `disabled`。ファイルのバイト列は変わらず、退避コピーは1つ。テストから直接 `POST /api/project/bundle` を送っても 422 で、バイト列は変わらない。 |
| `missing combination is not created without an edit` | `project_state.json` が無い。表示は「コンビネーション未保存」で、［保存］は `disabled`。10秒待っても `project_state.json` は無い。 |
| `external change reloads when clean` | テストから `POST /api/project`（timeline 3件、If-Match なし）を送ると、3秒以内に「3件」が出て、トースト「外部の変更を読み込みました」が出る。 |
| `beforeunload guard while autosave is in flight` | `page.route` で `POST /api/project` を保留にする（応答しない）。［戻す］の 500ms 後に `page.reload()` すると、`page.on('dialog')` の type が `beforeunload` になる。dismiss する。 |
| `home shows one real project card and no sample projects` | SCR-01 に `[data-feature="projectCard"]` が1つあり、`City_Night_MV` の文字が無い。［新規プロジェクト］で ◇ ダイアログ（「DATA-008」を含む）が出る。 |
| `offline shows 未接続 and disables save` | `page.route('**/api/project/bundle', r => r.abort())` の状態で開くと、`[data-kind="offline"]` と「未接続」が出て、［保存］は無効。 |
| （dirty 中に外部変更を受けて警告するテスト） | ②には長く残る未保存が無いので、WP-04（`setWorkspaceAsset` で dirty にする）に置く（§2.4(g)）。 |

`tests/legacy-project-save.test.cjs`（Playwright、ポートは `P2_LEGACY_PORT` で既定 8790、§4 のハーネスで隔離データ、WP-00b）：旧 `/index.html` を開いて `#project-save` を押すと、`#project-info` に「保存済み」が出る。テストから `POST /api/project` を送ると、`#project-info` に「MCPから更新を同期しました」が出る。もう一度 `#project-save` を押すと、また「保存済み」が出る（B-2）。three が無いときは skip する（§4.1）。

`tests/test_project_envelope.py`（pytest、WP-00b。サーバーは同じプロセスで起動し、ルートの `conftest.py` で一時データを使う）：`GET /api/project?envelope=1` が `{"project":…, "revision":…}` を返し、`revision == camera_revision(project)` であること。`GET /api/project` が生データを返すこと。ファイルが無いときは `{"project": {}, …}` であること。

`tests/test_bundle_camera_invalid.py`（pytest、WP-00b）：壊れたカメラファイルを置くと、`GET /api/project/bundle` が 422 `camera_project_invalid` で `backup` に名前を返し、退避コピーが同じフォルダに1つだけでき、元のファイルのバイト列は変わらないこと。同じ内容でもう一度 GET しても、退避コピーは1つのままであること。`POST /api/project/bundle`（正しい If-Match を付けても）が 422 で、バイト列が変わらないこと。ファイルが無いときは 200 で、既定のカメラを返し、ファイルは作られないこと。読めないファイル（権限なしを模擬）では `backup:null` になること。旧 `bai_camera.read()` が今のまま既定値を返すこと（WP-02a まで互換を保つ）。

#### (h) ◇ 未実装のまま

新規作成（Q1）、複数プロジェクトの一覧・切替（DATA-008 の範囲外）、テンプレートからの作成（NF-019）、版の差分比較・任意の版への復元（DATA-009）、クラッシュ復元（DATA-010）、ポータブルZIP・アーカイブ（DATA-012）、素材参照の健全性検査（DATA-015）、ファイルへの書き出し・ファイルからの読込（旧画面に無い）、壊れたカメラ保存データの復旧操作（Phase E WP-02a）。

---

### 2.3 ③ 素材取り込み・素材管理（WP-02 一覧、WP-03 取り込み。実装できる細かさ）

#### (a) 移植する機能

| # | 旧画面の機能 | 根拠 | 新UIでの扱い |
|---|---|---|---|
| ③-1 | 統合素材一覧（FBX・GLB/VRM・PMX・VMD を1つに） | `server.py:85〜109, 289〜290`、`index.html:764` | 移植する（SCR-08 中央）。 |
| ③-2 | 名前で検索・形式で絞り込み | `index.html:750〜753` | 移植する。 |
| ③-3 | ファイルの有無（`available`）の表示 | `index.html:755〜759`（「ファイルなし」） | 移植する。 |
| ③-4 | 選んだファイルを拡張子で登録先へ振り分ける | `index.html:615〜646` | 移植する（取り込みダイアログ）。 |
| ③-5 | GLB/VRM の登録（VRM はモデル固定、GLB の既定はモーション） | `index.html:572, 631`、`server.py:762〜778` | 移植する。 |
| ③-6 | PMX＋テクスチャの ZIP 登録（スロット A/B。事前にサーバー版の機能を確認） | `index.html:524〜547`、`server.py:779〜829` | 移植する。 |
| ③-7 | VMD の登録（**複数選択**） | `index.html:325〜336, 339`、`server.py:830〜845` | 移植する。 |
| ③-8 | FBX の登録（**複数選択**。モーション／モデルA／モデルB。送る前に FBXLoader で読めるか、モーションならアニメーションがあるかを確かめる） | `index.html:237〜238`、`server.py:956〜973` | 移植する。 |
| ③-9 | 登録後に一覧を更新し、登録した素材を選ぶ | `index.html:572`（`studio:asset-imported`）、`771` | 移植する。 |
| ③-10 | 素材を開く（3D 表示・PMX 表示・VMD の選択） | `index.html:726〜749` | ④⑤で移植する（③では「3D で表示」ボタンを ◇ にしておき、④の完了時に結線する）。 |
| ③-11 | PMX の個別ファイル＋テクスチャの複数選択による登録 | `index.html:337〜338` | **移植しない**（AGENTS.md「PMX登録の現行方針：個別複数選択UIは再導入しない」）。 |

#### (b) 移植先

- **SCR-08 素材管理・アセットライブラリ**（`screens.js:273〜297`、`app.js:513〜613`）。モックの構成をそのまま使う。左は分類と件数。中央は場所タブ・検索・形式・並び替え・グリッド/リスト・大きさ・カード・インポートキュー。右はプレビュー・情報・タグ・依存素材・操作。
  - ツール：
    - `現行画面で素材を登録`（href）を［素材を取り込む…］（primary、`data-act="real"`、`openImportDialog()`）に変える。
    - `一括インポート`（◇ NF-004）は残す。why を「一括のタグ付け・変換は未実装です（複数ファイルの取り込みは［素材を取り込む…］でできます）」に直す。
    - `並び替え`（select、`screens.js:285`）は中央バーの並び替えと重複するので、ツールから削除する。
  - パネルの状態：`素材カテゴリ` は real。`検索・タグ` は real（note：「名前・形式で検索。タグは未実装」）。`メタデータ` は real（note：「登録情報のみ。作者・ライセンスは未記録」）。`インポートキュー` は real。`サムネイル` は ◇（MOTION-016）。`依存参照` は ◇（REVIEW-010）。
- **SCR-23 外部連携**（`screens.js:599〜617`）：中央カード「インポート」の `link('現行画面で素材を登録','/')` を `btn('素材を取り込む','nav:08?import=1')` に変える（§1.6-6 のクエリ対応を使う）。パネル `インポート` を real にする（evidence は③のテスト）。
- **SCR-01 ホーム**「最近の素材」（`app.js:499〜502`。**WP-03** で作業）：固定のサンプル4件を、**このページで取り込んだ素材**（`imports` ストアの完了した行、新しい順に最大4件）に置き換える。0件なら空表示「このページではまだ素材を取り込んでいません。」と［素材管理へ］を出す。`/api/assets` には登録日時が無いので、「最近」を全素材から求めない（偽の「最近」を出さないため）。

#### (c) 使う既存 API・コード

| 操作 | API | 応答・注意 |
|---|---|---|
| 一覧 | `GET /api/assets` → `{items:[{id, name, format, kind, source, available, previewable, filename?}]}` | `id` は `fbx:<24桁>`・`integrated:<保存名>`・`mmd:<A|B|vmd>:<名前>`（`server.py:91, 103, 109`）。 |
| サーバー版 | `GET /api/server-version` → `{version, features}` | PMX ZIP を送る前に、`features` に `pmx_zip_upload` があるか確かめる（`index.html:533〜536`）。 |
| GLB/VRM の登録 | `POST /api/integrated-v02/upload?kind=model|motion&name=<名前>`、本文はファイル | 名前は `[^/\\\x00]{1,180}\.(glb|vrm)`。VRM は `kind=model` だけ。先頭4バイトが `glTF`。成功すると `{ok, name, asset, kind}`（`asset` は SHA-256 の先頭20桁＋拡張子の小文字）。**同じ中身なら同じ保存名になり、既存の登録（名前・種類）は今回の名前・種類に置き換わる**（`server.py:772〜777`：同じ `filename` の行を消して追加し直す）。 |
| PMX ZIP の登録 | `POST /api/pmx-zip-upload?slot=A|B`、`Content-Type: application/zip` | PMX がちょうど1つ、展開後 600MB・1500ファイル以下。成功すると `{ok, slot, model, model_path, files}`。**同じ相対パスの既存ファイルは上書き**される（無関係なファイルは消さない：`server.py:819〜823`）。 |
| VMD の登録 | `POST /api/mmd-upload?slot=vmd&name=<名前>` | 名前は180文字以内で、`/`・`\` と先頭の `.` は不可、拡張子は `.vmd`。**同じ名前は確認なしで上書き**される（`server.py:840〜844`）。 |
| FBX の登録 | `POST /api/upload?kind=motions|modelA|modelB&name=<名前>` | `.fbx`、250文字以内。成功すると `{ok, id}`。`id = sha256(kind + '\0' + name)` の先頭24桁（`server.py:961`）。**同じ種類・同じ名前なら確認なしで上書き**される。`modelA`/`modelB` は、同じ枠の既存モデルの登録を外して元のファイルを削除する（`server.py:963〜971`）。 |
| 上限 | 本文 400MB（`server.py:59` の MAX_SIZE、`server.py:719〜722`） | クライアントで事前に拒否する。 |

#### (d) 新UIの動作

**分類（`assets-model.js`、純関数）**

```js
export const ASSET_CATS = [/* samples.js:15〜25 から移す。motion のラベルだけ「モーション」に変える */];
/** @returns {'char'|'motion'} 一覧の item を左の分類へ */
export function categoryOf(item) {
  if (item.source === 'fbx') return item.kind === 'motions' ? 'motion' : 'char';  // kind: modelA|modelB|motions
  if (item.source === 'integrated') return item.kind === 'model' ? 'char' : 'motion';
  if (item.source === 'mmd') return item.format === 'PMX' ? 'char' : 'motion';    // PMX→char, VMD→motion
  return 'motion';
}
export function sourceLabel(item) {} // fbx→'FBX登録（モデルA）'等、integrated→'GLB / VRM 登録'（catalog 由来も同じ）、mmd→'MMD スロットA'/'MMD スロットB'/'MMD VMD'
export function filterAssets(items, { cat, q, fmt, sort }) {} // q は name の小文字の部分一致、fmt は format の完全一致、sort は 'api'|'name'|'format'
export function countByCategory(items) {} // {all, char, motion, stage:0, prop:0, mat:0, fx:0, audio:0, video:0, image:0}
```
- 左の分類は `ASSET_CATS` の順序・ラベル・アイコンを使い、件数は `countByCategory` の実数にする。`motion` のラベルは「モーション」にする（FBX・GLB のモーションも入るので。旧ラベル「モーション（VMD）」は誤解を招く）。
- `char`・`motion` 以外（ステージ・小物・マテリアル・エフェクト・オーディオ・動画・画像）は、今の API に登録手段が無いので常に0件。選ぶと空表示「この種類の素材を登録する機能はまだありません。」と ◇ の説明を出す（ids はステージ `LYRIC-009`、オーディオ `LYRIC-006`、その他 `NF-004`。phase は screens.js の該当画面と同じ）。
- `ASSET_CATS` は `samples.js` から `features/assets-model.js` へ移し（データの定義であってサンプルではないので）、`samples.js` からは削除する。
- 「お気に入り」「コレクション」（`app.js:536〜538`）：見た目は残し、選ぶと ◇ を出す（お気に入り：素材のお気に入りは未実装〔旧画面のお気に入りはコンビネーションだけ〕、ids `['NF-004']`）。件数は「—」と表示する。

**中央（`assetLibrary`）**
- 場所タブ（`app.js:549〜550`）：選べるのは「ライブラリ」（＝ `/api/assets` 全体）だけ。他（ローカル／プロジェクト内／クラウド／最近追加／使用中）は ◇（クラウドは NF-013、他は NF-004）。
- 一括ボタン（`app.js:551〜554`）：3つとも ◇ のまま（既存の why を保つ）。
- 検索・形式・並び替え・グリッド/リスト・大きさ：既存の部品をそのまま実データに使う。
  - 形式の選択肢は、実データに現れる `format` の集合（`FBX, GLB, VRM, PMX, VMD`）。
  - 並び替えは `登録順`（API の順）・`名前順`・`形式順`。
  - 表示の設定は `bai.studio.lib.v1` に保存する（§1.11）。
  - v1 で予定していた「ファイルがある素材だけ表示」は、旧画面に無いので作らない。
- カード：サムネイル画像は使わない（MOTION-016 は未実装）。無地のタイルに形式（例「VRM」）と分類のアイコン（`user`／`motion`、`icons.js`）を出す。`available === false` は薄く表示し、「ファイルなし」のピル（旧画面と同じ語）を付ける。カードに `data-asset-id` を付ける。ハート（`fav`）は見た目を残して ◇ にする。
- 件数の表示（`app.js:593`）：「N件（サンプル）」を「N件」にする。
- 状態：読込中・失敗・未接続は `stateBox`（再読込付き）で出す。0件（素材なし）は「まだ素材がありません。［素材を取り込む…］」。
- 一覧の更新：画面を表示したとき `assets.status === 'idle'` なら読み込む。`studio:asset-imported`・`studio:assets-refresh` で読み直す。［↻］（`data-act="real"`）で手動で読み直せる。

**インポートキュー（中央の下、`app.js:579〜588` を置き換える）**
- タブ「インポートキュー（N）」の N は `imports.rows.length`。他の3タブ（同期ステータス／依存関係の確認／最近のダウンロード）は既存どおり ◇ の空表示。
- 行：ファイル名・種類（下表の表示名）・進み具合・状態。
  - 進み具合は送信中だけ実測する（XHR の `upload.onprogress` の `loaded/total`）。送信が終わってサーバーの応答を待つ間は「サーバーで処理中…」と出し、バーは不定表示（`data-indeterminate`）にして % は出さない。
  - 状態は `待機中`／`確認中`／`送信中 42%`／`サーバーで処理中…`／`完了`／`失敗：<理由>`／`取り消し`／`スキップ（確認で除外）` のどれか。
- 失敗した行には［もう一度］（同じファイルでやり直す。衝突の確認もやり直す）。送信中は［取り消し］（`abort()`）。行を消すのは［一覧から消す］（画面の中だけ。サーバーのファイルは消えないことを title に書く）。
- 注記「このページを開いている間の記録です（保存されません）」。

**右（`assetDetail`、`app.js:597〜613` を置き換える）**
- プレビュー：サンプル画像は使わず、形式のタイル（大）を出す。④の完了後は、GLB/VRM/PMX/FBX のモデルなら［3D で表示］で SCR-12 へ移る（`navigate('12',{query:{asset:id}})`）。③の時点では［3D で表示］は ◇（why：「3D 表示は ④ の移植で結線します」、ids `['MOTION-003']`、phase `PH.P2`）。
- 情報（`real`）：名前、形式、分類、登録元（`sourceLabel`）、ID（等幅で、選択してコピーできる文字）、ファイル（`available` なら「あり」、無ければ「なし（再登録してください）」）、保存名（integrated だけ `filename`、title は「SHA-256 先頭20桁＋拡張子」）、作成者・ライセンスは「未記録」（note：REVIEW-010 は未実装）。
- タグ・説明：◇（タグは未実装、`NF-004`）。依存素材：◇（`REVIEW-010`）のままにし、並びの表示例は削除する（実データでない画像を出さない）。
- 操作：「シーンで使う」は ◇（NF-014）、「置換」は ◇（REVIEW-010）、「エクスポート」は ◇（NF-010）のまま。**削除ボタンは置かない**（削除の API が無い）。

**取り込み（`import-rules.js` の純関数と `import.js`）**

```js
/** @typedef {'integrated'|'pmxZip'|'vmd'|'fbx'} Route */
/** @returns {{ok:true, route:Route, label:string, kinds:{value:string,label:string}[], defaultKind:string, warnings:string[]} | {ok:false, error:string}} */
export function classifyImport(name, size) {}
export const IMPORT_ACCEPT = '.glb,.vrm,.zip,.vmd,.fbx';
/** 送り先ごとの、既存の素材との衝突。純関数（ハッシュは呼び出し側で計算して渡す） */
/** @returns {{kind:'overwrite'|'reclassify'|'replaceModel'|'slotOverwrite', message:string}|null} */
export function conflictOf(entry, items, { contentSha20, fbxId }) {}
/** 1回の取り込みの中での矛盾（同じ枠に2つ等） */
export function batchErrors(entries) {} // → string[]
export function fbxIdFor(kind, name) {} // Promise<string>：crypto.subtle.digest('SHA-256', utf8(kind + '\0' + name)) の hex 先頭24桁（server.py:961 と同じ）
```

| 拡張子 | route | 表示名 | 種類の選択 | 既定 | 名前の検査（送信前） |
|---|---|---|---|---|---|
| `.glb` | integrated | GLB（モデル／モーション） | モーション／モデル | モーション（`index.html:631` と同じ） | `/^[^/\\\x00]{1,180}\.glb$/i` |
| `.vrm` | integrated | VRM モデル | なし（モデル固定） | model | `/^[^/\\\x00]{1,180}\.vrm$/i` |
| `.zip` | pmxZip | PMX モデル＋テクスチャ ZIP | 登録先：モデルA／モデルB | A | なし（中身はサーバーが検査する） |
| `.vmd` | vmd | VMD モーション | なし | — | 180文字以内、`/`・`\` を含まない、`.` で始まらない |
| `.fbx` | fbx | FBX | モーション／モデルA（置き換え）／モデルB（置き換え） | モーション（`index.html:640` と同じ） | 250文字以内 |
| その他 | — | — | — | — | `{ok:false, error:'この形式には対応していません（GLB・VRM・PMX ZIP・VMD・FBX）。'}` |

共通：`size > MAX_UPLOAD_BYTES` なら `{ok:false, error:'400MB を超えるファイルは登録できません。'}`。`size === 0` なら `{ok:false, error:'空のファイルです。'}`。

取り込みダイアログ（`openImportDialog()`、既存の `openModal()`）：
1. **ファイルの選択**：`<input type="file" accept=IMPORT_ACCEPT multiple>` で、**複数のファイルを選べる**（旧画面の `#motions`・`#vmd-input` と同じ）。選んだファイルごとに1行を作り、`classifyImport` の結果（表示名・種類の選択・警告）を出す。種類は行ごとに選ぶ。不可のファイルは理由を出してその行だけ除外し、取り込めるファイルが0件なら［取り込む］を無効にする。一括のタグ付け・変換は NF-004 なので作らない。
2. **1回の取り込みの中での矛盾**（`batchErrors`）：同じ回に「FBX モデルA が2つ」「FBX モデルB が2つ」「PMX ZIP の同じスロットが2つ」「同じ名前の VMD が2つ」「同じ種類・同じ名前の FBX が2つ」があれば、該当する行に「1回の取り込みで同じ登録先に置けるのは1つです」と出し、［取り込む］を無効にする（後のファイルが先のファイルを黙って上書きするのを防ぐ）。
3. **上書き・置き換え・再分類の事前確認（R8）**：［取り込む］を押したら、**ファイルの解析（FBXLoader）より前に**、全部の行について `conflictOf` を計算する。1つでも当てはまれば、確認ダイアログを1つ出し、該当するファイルとその影響を一覧で示す。ボタンは［すべて続ける］［該当ファイルを除いて続ける］［キャンセル］。
   - VMD：`id === 'mmd:vmd:' + name` が既にある →「同じ名前の VMD『{name}』があります。上書きすると元の内容は戻せません。」
   - FBX（同じ種類・同じ名前）：`'fbx:' + await fbxIdFor(kind, name)` が既にある →「同じ名前の FBX『{name}』（{種類}）があります。上書きすると元の内容は戻せません。」
   - FBX の modelA/modelB（別の名前）：同じ `kind` の FBX が既にある →「モデル{A|B}の現在の FBX『{既存の name}』は登録が外れ、元のファイルが削除されます。」（既存が無くても、種類の選択の横に「置き換え」の説明を常に出す）。
   - PMX ZIP：選んだスロットに PMX が既にある（`id` が `mmd:<slot>:` で始まり、`format==='PMX'`）→「モデル{slot}には既に PMX が登録されています。ZIP の中と同じパスのファイルは上書きされます（他のファイルは残ります）。」
   - GLB/VRM（同じ中身）：`file.arrayBuffer()` を `crypto.subtle.digest('SHA-256', …)` して、hex の先頭20桁＋拡張子の小文字を求める。`'integrated:' + それ` が既にあり、名前か種類が違う →「同じ内容の素材『{既存の name}』（{既存の種類}）が登録済みです。続けると、名前と種類が『{name}』（{種類}）に置き換わります（ファイルは同じものです）。」名前も種類も同じなら確認は出さない（結果が変わらないので）。大きいファイルはハッシュの計算に時間がかかるので、行の状態を「確認中」にする。
4. **送信前の追加の検査**（行ごとに、キューで順番に行う）：
   - pmxZip：`GET /api/server-version`。失敗したら「サーバーのバージョンを確認できません。旧版のサーバーが起動している可能性があります。サーバーを止めて起動し直してください。」。`features` に `pmx_zip_upload` が無ければ「サーバーが PMX ZIP 登録に対応していません（現在のバージョン：{version}）。」（文言は `index.html:534〜536` から写す）。
   - fbx：`three/addons/loaders/FBXLoader.js` を動的に import し、`file.arrayBuffer()` を `new FBXLoader().parse(buf, '')` で解析する。例外が出たら「FBX として読み込めません：{message}」。種類がモーションで `animations.length === 0` なら「{name} にアニメーションがありません」（`index.html:237` と同じ）。three を読めなければ「FBX の確認に必要な 3D ライブラリを読み込めません。」で中止する（確認しないまま送ることはしない）。
5. **送信**：`uploadFile()` を使う。URL は上の表の API。`Content-Type` は、pmxZip が `application/zip`、他は `application/octet-stream`（旧と同じ）。
6. **結果**：
   - 成功：行を「完了」にする。`assets` を読み直し、登録した素材の id を求めて選択する（`?asset=` を更新）。`emit('studio:asset-imported', {id})`。
     - id の求め方：integrated は `'integrated:' + data.asset`、pmxZip は `'mmd:' + data.slot + ':' + data.model_path`、vmd は `'mmd:vmd:' + name`、fbx は `'fbx:' + data.id`。
     - 読み直した後に見つからなければ「登録しましたが一覧に見つかりません（再読込してください）」。
     - トースト「登録しました：{name}」（`kind:'real'`）。複数のときは最後に「{n}件を登録しました（失敗 {m}件）」。PMX ZIP は「登録完了：{model_path}、素材{files}件」。
   - 失敗：行を「失敗：{messageFor(err)}」にする。`bad_request` の serverMessage は、日本語（GLB/VRM 系）でも英語（PMX ZIP の `PMX ZIP rejected: …` など）でもそのまま出す。他の行の処理は続ける。
7. 同時に送るのは1件だけ。キューに積んだ順に1件ずつ処理する（ダイアログを閉じても続ける）。

#### (e) 置き換えるサンプル

`ASSETS`（`samples.js:28〜59`）の SCR-08・SCR-01 での使用、`app.js:513〜514` の `lib`（`favs` を含む）、`COLLECTIONS` の件数、キューの表示例3行（`app.js:581`）、詳細の依存素材の画像の列（`app.js:599, 607`）。`ASSETS` は SCR-11（`screens.js:348`、画像管理のサンプル）が引き続き使うので、`samples.js` には残す。

#### (f) 受け入れ条件

1. 種データ（§4）の素材が、分類・件数・形式・ファイルの有無とともに SCR-08 に出る。サンプルの素材名（例「夜の神社」）は SCR-08 に出ない。分類のラベルは「モーション」。
2. GLB・VRM・PMX ZIP・VMD を新UIから登録でき、一時データディレクトリの決まった場所に保存され、一覧に出て選ばれる。複数のファイルを選ぶと、1ファイル1行で順番に登録される。
3. FBX の壊れたファイルは送られずに拒否される。上書き・置き換え・再分類になる取り込み（VMD の同名、FBX の同名、FBX のモデル枠、PMX のスロット、GLB/VRM の同じ中身で名前か種類が違う）は、確認を経ないと送られない。［該当ファイルを除いて続ける］では、該当しないファイルだけが送られる。
4. サーバーの拒否理由が行に出る。送信中に取り消せる。
5. モックにだけある機能（お気に入り・コレクション・場所タブ・一括操作・タグ・依存素材・シーンで使う・置換・エクスポート）は ◇ の説明が出て、何も保存されない。
6. ホームの「最近の素材」には、このページで取り込んだものだけが出る（WP-03）。
7. 実 `data/` のハッシュが変わらない。型検査と既存テストが合格する。

#### (g) テスト（追加）

- `tests/studio-p2-import-rules.test.mjs`（`node --test`、ブラウザー不要）：
  - `classifyImport` の表（上の6行に加え、上限・空・長すぎる名前・`a/b.vmd`・`.hidden.vmd`）。
  - `conflictOf` の5種類と「同じ名前・同じ種類の GLB は確認なし」。`batchErrors` の5種類。
  - `fbxIdFor('motions','a.fbx')` が Python の `hashlib.sha256(b'motions\0a.fbx').hexdigest()[:24]` と一致すること（期待値はテストの中に固定し、作るときに Python で求める）。
  - `categoryOf`・`sourceLabel`・`filterAssets`・`countByCategory` を表で検査する。
  - `MAX_UPLOAD_BYTES === 400*1024*1024` と、`server.py` の `MAX_SIZE=400*1024*1024` の文字列が一致すること。
- `tests/studio-p2-assets.test.cjs`（Playwright、ポートは `P2_ASSETS_PORT` で既定 8796）：

| テスト名 | 主な検査 |
|---|---|
| `library lists real assets by category` | 種データ：integrated モデル1（ファイルあり）、integrated モーション1（ファイルなし）、mmd VMD 1、mmd A の PMX 1、FBX motions 1（ファイルあり）。左の「キャラクター」が2、「モーション」が3、「すべての素材」が5。ファイルなしのカードに「ファイルなし」。「夜の神社」が無い。 |
| `search and format filter work on real data` | 検索語で1件、形式「VMD」で1件。 |
| `detail shows registration facts` | カードを選ぶと、右に ID・登録元・保存名（integrated）が出る。URL に `asset=` が付く。再読込しても同じものが選ばれている。 |
| `import dialog opens from nav query and clears it` | `/workspace/23` で［素材を取り込む］を押すと、全体の再読込なしで（`page.on('load')` が0回）SCR-08 のダイアログが開き、URL から `import=1` が消える。 |
| `import GLB and VRM` | `tests/fixtures/synthetic_test_model.glb` を GLB（モデル）として取り込むと、行が「完了」になり、一時データに `integrated_v02/assets/<sha20>.glb` ができ、一覧に出て選ばれる。同じ中身を `.vrm` の名前で取り込むと、種類の選択は出ず、**再分類の確認**（「名前と種類が…置き換わります」）が出る。［すべて続ける］で `user_assets.json` が kind=model・新しい名前の1行になる。 |
| `multiple files import sequentially` | GLB と VMD を一度に選ぶと、2行になり、`/api/integrated-v02/upload` と `/api/mmd-upload` が順番に（重ならずに）1回ずつ送られる。 |
| `batch with two FBX for the same model slot is rejected` | 2つの FBX を両方ともモデルA にすると「同じ登録先に置けるのは1つです」が出て、［取り込む］が無効。 |
| `import PMX ZIP checks server version first` | `tests/fixtures/minimal_pmx.zip`（§4）をスロット A に送る。`/api/server-version` へのリクエストが `/api/pmx-zip-upload` より先。成功の文言に `model_path` が入る。`mmd_assets.json` の A に PMX がある。 |
| `VMD overwrite requires confirmation` | VMD を2回取り込むと、2回目で確認が出る。［キャンセル］なら `/api/mmd-upload` へのリクエストは1回だけ。 |
| `FBX same-name overwrite requires confirmation` | 種データに FBX motions `walk.fbx`（`id` は `fbx:` ＋ Python で求めた24桁）がある。`walk.fbx`（中身はランダム）をモーションとして選ぶと、解析より前に確認が出る。［キャンセル］なら `/api/upload` は0回。 |
| `FBX model replacement warns before parsing` | 種データに FBX modelA がある。別の名前の FBX（中身はランダム）をモデルA にすると、確認に既存の名前と「元のファイルが削除されます」が出る。［キャンセル］なら `/api/upload` は0回。確認が解析より前なので、正しい FBX は要らない。 |
| `FBX is validated before upload` | 衝突しない名前の `bad.fbx`（ランダム256バイト）をモーションにすると、行が「失敗：FBX として読み込めません…」になり、`/api/upload` は0回。 |
| `server rejection is shown` | `page.route('**/api/integrated-v02/upload**', r => r.fulfill({status:400, body:JSON.stringify({error:'GLB/VRM形式として認識できません'})}))` の状態で取り込むと、行にその文言が出る。 |
| `home shows only assets imported in this page` | 取り込みの前は空表示。1件取り込むと、SCR-01 にその1件が出る。 |
| `mock-only controls explain themselves` | ハート・「コレクション」・場所タブ「クラウド」・「一括タグ付け」・タグ欄・「シーンで使う」で ◇ ダイアログが出る。 |

#### (h) ◇ 未実装のまま

サムネイルの生成（MOTION-016）、素材の削除・名前の変更（API が無い）、タグ・お気に入り・コレクション・一括のタグ付けと変換（NF-004）、クラウド（NF-013）、依存参照・ライセンス・作者の記録（REVIEW-010）、重複の検出表示（DATA-013。取り込み時の衝突の確認だけは R8 として行う）、ステージ・小物・音声・画像などの登録（API が無い）、ドラッグ＆ドロップでの取り込み（旧画面に無い）、PMX の個別ファイル登録（方針で廃止）。

- **O-③-1**（任意）：FBX の正常な登録・表示を自動テストするための、最小の ASCII FBX 7.4 を標準ライブラリだけで作る `tools/make_test_fbx.py`。作れたら、`import FBX motion succeeds` のテストを足す。作れなければ「FBX の正常登録は未検証」と台帳に書く。テスト専用の分岐は本番コードに入れない。

---

### 2.4 ④ キャラクター・ステージ読込と3D表示（WP-04、WP-04b。章立ては同じで、未決は O-④）

#### (a) 移植する機能

| # | 機能 | 根拠 |
|---|---|---|
| ④-1 | GLB/VRM の 3D 表示（`/api/integrated-v02/asset/<file>`、GLTFLoader、高さ 2.0 に正規化） | `index.html:206`、`camera_3d.js:278` |
| ④-2 | PMX の 3D 表示（`/api/mmd-file/<slot>/<name>`、MMDLoader、テクスチャは相対パス） | `index.html:302〜316` |
| ④-3 | FBX モデルの 3D 表示（`/api/file/<id>`、FBXLoader） | `index.html:231, 236` |
| ④-4 | 視点の回転・ズーム（OrbitControls） | `index.html:139` |
| ④-5 | ボーン一覧と分類（`classifyBone`） | `camera_3d.js:98`（`discoverBones`）、`camera_follow_config.js`（共有） |
| ④-6 | 素材一覧からモデルを開く | `index.html:726〜749`（`openAsset`） |
| ④-7 | 作業中のモデルを制作状態に記録（`workspace.asset`、GLB/VRM のみ） | `camera_3d.js:290〜292`（workspace の `asset`）、`project_state_bundle.py:36〜49` |
| ④-8 | ステージの読込 | 旧画面に無い（`LEGACY_UI_INVENTORY_JA.md` ③）→ ◇ |
| ④-9 | 骨格解析・リターゲット準備（`#skeleton-lab`）：素材の選択、骨格・レストポーズの検査、ボーン対応の提案・プレビュー、キャリブレーション、比較、プロファイル | `retarget_ui.js`（34行）。API は `/api/assets` と `/api/retarget/` 配下の `calibration`・`compare`・`explicit-rest-preview`・`glb-clip-hierarchy-inspection`・`glb-clip-rest-preview`・`mapping-preview`・`motion-channels`・`pose-proposal`・`profile-for-pair`・`profiles`・`rest-hierarchy-inspection`・`rest-pose-inspection`・`root-preview`・`vrm-humanoid-preview`・`vrm-local-transfer-preview`・`world-rest-motion-preview` |
| ④-10 | GLB/VRM のポーズ比較（実験。モデルは変えない） | `v01629_mesh_compare.js`（26行、three を使う。API は `/api/retarget/vrm-local-transfer-preview`） |

#### (b) 移植先

- SCR-12 キャラクター管理（`screens.js:352〜374`）：
  - 左「キャラクター」：`categoryOf === 'char'` の実素材にする（サンプル6件を置き換える）。
  - 中央：three-host のビューポート。
  - 右タブ：「ボーン」は実際のボーン一覧（④-5）。「モーフ」「物理」は ◇。「リターゲット」は、④-9・④-10 の移植先（既定は SCR-13。O-④-5）へのリンクにする（WP-04b。それまでは既存の旧画面へのリンクのまま）。
  - ツールの `現行画面でモデルを表示`（href）は、旧画面との比較用に残す。
- SCR-06 は ◇ のまま（ステージ）。
- SCR-08 の詳細の［3D で表示］を結線する。

#### (c) 使う既存 API・コード

`GET /api/integrated-v02/asset/<filename>`（未登録・ファイルなしは 404、カタログが使えなければ 503：`server.py:335〜348`）、`GET /api/mmd-file/<slot>/<name>`（`server.py:293〜307`）、`GET /api/file/<id>`（`server.py:350〜355`）、`GET /api/assets`、④-9・④-10 の `/api/retarget/*`。

`model-loader.js`（新規）と `normalize.fork.js`（フォーク。関数ごとに元の行を書く）：
```js
// normalize.fork.js
export const TARGET_HEIGHT = { GLB: 2.0, VRM: 2.0, PMX: 1.8, FBX: 1.95 }; // index.html:206 / 310 / 231, camera_3d.js:278
export function normalizeModel(object, format, THREE) {} // 戻り値は {scale, offset:[x,y,z]}。GLB/VRM：高さを TARGET_HEIGHT に、XZ の中心を原点に、足を y=0 に（index.html:206 と同じ式）。PMX/FBX：高さを TARGET_HEIGHT に、足を y=0、XZ の中心を原点に（旧画面の ±1.4 の配置と向きの回転は2体を並べるためのものなので、単体の表示では行わない：O-④-1）
// model-loader.js
export async function loadModel(item, THREE, loaders) {} // item は /api/assets の行。戻り値は {object, animations, format}
```

#### (d) 新UIの動作

- 左で選ぶと `?asset=<id>` になり、中央で読み込む（読込中を表示）。成功したら HUD に「名前・形式・クリップ N 件・頂点数」を出し、`emit('studio:model-loaded')`。
- 失敗したとき：404 は「元ファイルが見つかりません。素材を再登録してください。」（`index.html:727` の文言）。読込中の例外は「3D 表示できませんでした：{message}」。`available === false` の素材は選べるが、読み込まずに同じ文言を出す。
- 右「ボーン」：`object.traverse` で `isBone` を集め、名前と `classifyBone(name)` の分類を表にする（検索付き）。ボーンが無ければ「ボーンがありません（静的モデル）」。
- ［このモデルを制作に使う］（GLB/VRM のときだけ有効、`data-act="real"`）：`setWorkspaceAsset(item.filename)` を呼ぶ（§2.2(d)-9 のマージ規則）。④が書くのは `asset` だけで、`frame` と他のフィールドは残す。`asset` が変わったときだけ `clip` を `null` にする。
  - `combinationMissing` のときは、ボタンの横に「保存すると、空のコンビネーション（project_state.json）も一緒に作られます。」と常に出す。
  - 押した後のトーストは「作業中の素材を {name} にしました。［保存］で保存されます。」で、SCR-18 へのリンク（`nav:18`）を付ける。
  - PMX/FBX のときはボタンを無効にし、title に「統合保存に記録できるのは GLB/VRM だけです（project_state_bundle.py の制限）」と書く。
- ツール「選択」は ◇（オブジェクトの選択は旧画面に無い）。「回転」は OrbitControls を有効にする（既定）。
- 画面を離れたら three-host を破棄する（§1.6、§1.7）。
- **O-④-4（決定済み）**：workspace の所有者を1つにする規則（§2.2(d)-9）。Phase E §7 にも注記した。

#### (e) 置き換えるサンプル

SCR-12 左の6件、中央の `img:'viewport-character'`、右「ボーン」の固定8件（`screens.js:369`）、SCR-08 の詳細の［3D で表示］の ◇。

#### (f) 受け入れ条件（案）

- 合成 GLB（§4）を登録し、SCR-12 で選ぶと、キャンバスに背景以外のピクセルが1つ以上ある。`baiStudio.viewport.getState()` が `{loaded:true, scale:≈1, offset:≈[0,0,0]}`（誤差 1e-9。合成モデルは高さ 2.0・中心 0 だから）。ボーン一覧に10本（`hips`〜`foot_r`）が出る。
- ［このモデルを制作に使う］の後、`workspace.frame` は種データの値のまま。［保存］の後のファイルで `asset` だけが変わっている。
- PMX の最小 ZIP は、O-④-2 が決まるまで「読込中の例外を正しく表示する」ことだけを確かめる。

#### (g) テスト（案）

- `tests/studio-p2-viewport.test.cjs`（ポート 8795）：
  - `glb renders and normalizes like the camera page`（上記）。
  - `viewport is disposed on leave`：SCR-12 から SCR-08 へ移ったとき、`WEBGL_lose_context` が呼ばれたことを、`page.evaluate` で仕込んだスパイで確かめる。
  - `missing file shows re-register message`。
  - `workspace asset merge keeps frame and other fields`：種データの workspace は `{frame:42, asset:'a.glb', clip:1}`。別の GLB を選ぶと、保存後に `{frame:42, asset:'<新しい名前>', clip:null}` になる。
  - `workspace asset is set only for GLB/VRM`。
  - `missing combination warns before creating it`。
  - `external change warns while workspace is dirty`（②から移したテスト）：dirty にした後で外部から `POST /api/project` を送ると、表示は変わらず、警告文「自動では読み込みません」が出る。
- 照合（`tests/studio-p2-normalize-parity.test.cjs`）：同じ合成 GLB を `/camera.html` の［3Dモデルを表示］で読む。`camera_3d.js` のモデルは `window` から辿れないので、`publishModelFraming` の `bai-camera-model-bounds` イベントの `min/max` を受け取る。それと新UIの包囲箱が、誤差 1e-6 で一致することを確かめる。

#### (h) ◇ 未実装のまま／未決

ステージ（SCR-06、NF-014/LYRIC-009）、モーフ（LIP-004）、物理（MOTION-021）、衣装（NF-005）、ウェイトの編集（NF-023）、オブジェクトの選択。
- **O-④-1**：PMX/FBX の単体表示の正規化（旧の 1.8/1.95 を保つか、2.0 にそろえるか）。既定は旧の値を保つ（旧画面と見え方を比べられるように）。
- **O-④-2**：PMX の自動テスト用の最小モデル（`tools/make_test_pmx.py`。PMX 2.0 の最小構成：頂点3・面1・材質1・ボーン1）を作れるか。作れなければ、PMX の表示は「未検証」と台帳に書く。
- **O-④-3**：A/B の2体を並べる表示（`index.html:231, 310` の ±1.4 の配置）は、⑤の連結再生で必要になるので⑤で扱う。
- **O-④-5**：④-9・④-10 の画面の割り付け（SCR-12 の「リターゲット」タブにまとめるか、SCR-13 と分けるか）と、`v01629_mesh_compare.js` の three 表示を three-host に載せる方法。既定は SCR-13（モーションVMD編集・リターゲティング。画面名がこの機能を指す）の右タブにまとめ、SCR-12 の「リターゲット」タブからはそこへ移る。比較の表示は three-host の2つ目のオブジェクトとして並べる。WP-04b の着手前に Opus で決める。

---

### 2.5 ⑤ モーション（VMD）適用・タイムライン再生（WP-05。未決は O-⑤。着手前に Opus で本節を詳しくする）

#### (a) 移植する機能（候補一覧。根拠付き）

| # | 機能 | 根拠 |
|---|---|---|
| ⑤-1 | GLB の中のアニメーションの選択・再生・停止・シーク | `camera_3d.js:281〜282`（`setClip`・`updateTime`）、`index.html:213`（`integratedPreviewV02.play`） |
| ⑤-2 | PMX に VMD を当てて再生（`MMDLoader.loadAnimation`＋`AnimationMixer`。IK・物理なし） | `index.html:340〜347, 356` |
| ⑤-3 | FBX モーションの82パターンの一覧・分類・絞り込み・再生できるか（👑） | `index.html:80〜90`（表は80行に埋め込み） |
| ⑤-4 | コンビネーション（追加・連結再生・停止・全消去）と履歴の記録（②の `history` に積む。②の自動保存を使う） | `index.html:118〜133, 291〜302, 366〜377` |
| ⑤-5 | お気に入りのコンビネーション（保存・一覧・開く・削除） | `index.html:129〜133`、`POST /api/favorites`（`server.py:941〜950`） |
| ⑤-6 | タイムラインの編集（クリップ：開始・長さ・速度・補間。保存・読込・コンビネーションからの取り込み・再生）と、**550ms の自動保存** | `index.html:788〜817`（自動保存は802行）、`/api/timeline-editor`（`server.py:287〜288, 668〜686`） |
| ⑤-7 | ボーン対応表（FBX→モデル）の編集と保存 | `index.html:233〜235`（`/api/mapping`）、`/api/conversion-map`（`server.py:312〜315, 863〜872`） |
| ⑤-8 | 作業中のクリップ・フレームを制作状態へ（`workspace.clip`・`workspace.frame`） | `camera_3d.js:290〜292` |
| ⑤-9 | 外部同期のコマンド（`play_chain`・`stop_chain`・`preview_motion`・`preview_vmd`・`integrated_preview`） | `index.html:435〜450` |
| ⑤-10 | 2D 模式アニメーション（前・再生・次・速度・シーク） | `index.html:71`（`<details>`「従来の2D模式アニメーション」、要素 `prev`/`play`/`next`/`speed`/`seek`） |
| ⑤-11 | リターゲットのレビュー一式（JSON の QA レポート、読み取りのみ） | `v01630_32_review.js`（26行、`/api/retarget/review-bundle`） |
| ⑤-12 | キーフレームのスクラブと校正レポート（読み取りのみ、three を使う）とその再生 | `v01633_35_scrub.js`（36行、`/api/retarget/keyframe-review`）、`v01636_40_playback.js`（35行、API なし） |
| ⑤-13 | 補正レイヤー（`#timeline-studio` の中） | `motion_layers.js`（29行、`/api/motion-layers`） |
| ⑤-14 | 足の接地・足滑りの検査 | `foot_qa_ui.js`（7行）、`/api/qa/bvh-foot-world`・`/api/qa/dual-foot-preview`・`/api/qa/foot-contact` |

#### (b) 移植先（案）

- SCR-13（主）：左「VMDライブラリ」は mmd VMD の実素材。中央は④の three-host（モックの4分割表示は「1面＝実際の描画、他の3面＝◇（REVIEW-001 の3視点比較は対象外）」）。右「ボーンマップ」は⑤-7。下部のタイムラインは⑤-6 の実クリップ。⑤-11〜⑤-14 は右の既存のタブ（または O-⑤-3 の扱い）に置く。
- SCR-05（初期構想）：左「モーション検索」は⑤-3。右「再生」は速度・ループ。コンビネーションは右の新しいタブ（モックに無いタブを足すことになる：O-⑤-3）。⑤-10 はここに置く。
- SCR-12：⑤-1 のクリップの選択。

#### (c)〜(g)

着手前に本節を詳しくする（Opus）。決めること：
- **O-⑤-1**：82パターン表（`index.html:80`）の扱い。既定は `studio/js/motion/patterns.fork.js` へ写し（データのフォーク）、`tests/test_motion_patterns_parity.py` で `index.html` の `const rows=[…]` の配列と JSON として一致することを確かめる（旧画面は変えない）。
- **O-⑤-2**：FBX の連結再生の位置合わせ（`chainFrame`・`clipOffset`、`index.html:291〜301`）はインラインの計算。既定は `studio/js/motion/chain.fork.js` へ関数単位でフォークし、DOM を参照する部分（`msg.textContent` など）だけを戻り値に変える。単体テストで旧の式と同じ結果になることを確かめる。
- **O-⑤-3**：コンビネーションの編集の置き場所（SCR-05 の右タブを足すのはモックの変更になる）。既定は、SCR-13 の下部タイムラインの上に「コンビネーション」のトラックとして表示し、編集は右の新しいタブ「コンビネーション」で行う。タブを足すことが、見た目の変更として所有者決定「モックが正本」に反するかを Opus のレビューで判断する。
- **O-⑤-4**：タイムラインの自動保存（550ms、`index.html:802`）は旧画面と同じく再現する（1-m11）。ただし `/api/timeline-editor` には If-Match が無い（`server.py:668〜686`）。そこで、保存の前に GET して `updatedAt` を比べ、変わっていたら自動保存を止めて確認するクライアント側の簡易な検知を既定とする（Opus のレビューの対象）。
- **O-⑤-5**：⑤-9 の外部コマンドのうち、どれを新UIで受けるか（旧画面と新UIを同時に開くと、両方が反応する）。
- **O-⑤-6**：⑤-11〜⑤-14 の割り付け（どのタブに置くか）と、three を使う⑤-12 の表示を three-host に載せる方法。
- **O-⑤-7**：⑤-8 で `clip`・`frame` を書く時（再生を止めたとき、明示の操作）と、⑥のカメラ画面との所有の分担（§2.2(d)-9）。
- テスト：連結再生のフレーム位置（合成 GLB のアニメーションで `hips` の z が期待値になる）、VMD の適用（O-④-2 の最小 PMX と `tools/make_test_vmd.py` の最小 VMD）、タイムラインの保存の往復、自動保存の 550ms、⑤-11〜⑤-14 の API 応答の表示。

#### (h) ◇ 未実装のまま

表情レイヤー（LIP-009）、曲線の編集（DATA-003）、3視点比較・同期比較（REVIEW-001 の範囲。旧画面へのリンクのまま）、MMD の IK・物理（旧画面にも無い）。

---

### 2.6 ⑥ カメラ（WP-06a〜06d。Phase E の UI の土台。規模 XL。未決は O-⑥）

#### (a) 移植する機能

`camera.html` の全機能（`LEGACY_UI_INVENTORY_JA.md` ⑤の表）：
- キーフレームの編集・Undo/Redo・保存（`camera.js:187, 210, 226`）。
- 再生・コマ送り・スクラブ、表示範囲。
- 2D 構図プレビュー（`#preview`）、自由視点の 3D と撮影カメラの 3D（`camera_3d.js`）。
- 表示モデル・クリップ・追従ボーン・追従設定と区間のキー化。
- カスタム撮影構図、CAM-015 のショット・シーケンス編集（`/api/camera/sequence/edit`）。
- フォーカス診断・範囲診断・DOF の近似プレビュー、構図診断、撮影リグ（ベータ）。
- MMD カメラ VMD の検査・読込・試験再生・書き出し（`/api/camera/vmd/*`）。
- 統合状態の保存・復元（②に統合する）。

#### (b) 移植先と方式（決定）

- **方式：動作を変えない `mount(root)` 化 ＋ 要素ID互換ホスト ＋ 常駐（keep-alive）**。コードは1本で、旧 `camera.html` と新UIが同じファイルを読む（フォークしない）。
  1. **WP-06a：mount 化**（旧ファイルの変更。R5 (b)）。
     - `camera.js`：IIFE（`(()=>{'use strict'; … })()`）の中身を `function mount(root){ … }` に移す。
       - 要素の取得を `const $=id=>root.querySelector('#'+CSS.escape(id))` に変える（今は1行目で `document.getElementById`）。
       - `document.querySelector` の箇所（87行の `.preview-shell`・`.camera-frame`、97行の `[data-camera-move]`、213行の `.dual-views`）を `root.querySelector(All)` に変える。
       - `document.createElement`（13・76・94・211行）と `window` のリスナー（213行の `beforeunload`〔未保存〕・`resize`）は変えない。
       - 最後に `window.BAICameraPage={mount}; if(!window.BAI_CAMERA_MANUAL_MOUNT)mount(document);` を書く。2回目の `mount` は何もせずに `false` を返す（`let mounted=false`）。
     - `camera_3d.js`：`import` 文は先頭に残す。残りの最上位の処理を `export function mount(root){ … }` に移す。
       - `$` を同じ形に変え、`document.getElementById('vmd-follow-timeline')`（67・137・286行）を `$('vmd-follow-timeline')` に変える。
       - `window` の `blur`（240行）は変えない。`keydown` は要素に付いている（356行）ので変えない。
       - 最後に `if(!window.BAI_CAMERA_MANUAL_MOUNT)mount(document);` を書く。
     - **`camera.html` は変えない**（フラグが無ければ今と同じ順番・同じ時点で `mount(document)` が動く）。
     - `camera_project_bundle_ui.js` は新UIでは読まないので変えない（1-M4 補足）。
     - 字下げは変えない（差分を最小にし、ソースの文字列を検査するテストへの影響を減らす）。
     - 完了条件：§1.14 の一覧のテストと、カメラ関係の全テスト・`legacy-ui-layout`・`studio-ui` が合格する。直したテストの一覧をコミット本文に書く。旧画面の操作で動作が変わらない（Phase E WP-03 の `camera-ui.test.cjs` がまだ無いので、WP-06a では `tests/studio-p2-camera.test.cjs` の中で旧 `camera.html` を開く同じ操作の検査（キー追加→Undo→保存→再読込で復元）を、mount 化の前後で走らせ、結果が一致することを確かめる）。
  2. **WP-06b：ホスト**。`studio/js/camera/camera-host.js` が、mount したコードが参照する全ての要素ID・クラス・属性を、**新UIモックの SCR-02 のパネル構成の中に**配置した DOM を作る。
     - 配置：左はショット（シーケンスの一覧）。中央は `#scene` と `#preview` のキャンバス。右のタブはカメラ／フォーカス／レール／補間。下部は `#track` を含むタイムライン。配置表は O-⑥-4。
     - 見た目は `studio/styles/camera-host.css`（`.camera-host` の中だけに効く。`camera.css` は読まない）。
     - DOM を作った後で、`window.BAI_CAMERA_MANUAL_MOUNT=true` を立てる。次に `camera.html` と**同じ順番**で共有 UMD（`/camera_vmd_local.js`、`/camera_rig.js`、`/camera_framing.js`、`/camera_lens.js`、`/camera_dof.js`、`/camera_focus_tracking.js`、`/camera_focus_consistency.js`、`/camera_sequence_playback.js`）と `/camera.js`（classic script）を `legacy.js` で読む。その後 `BAICameraPage.mount(hostRoot)` を呼び、`(await import('/camera_3d.js')).mount(hostRoot)` を呼ぶ。どれも1回だけ。
     - 包含の検査（`tests/studio-p2-camera-ids.test.mjs`）：
       - `camera.js`・`camera_3d.js` のソースから `$('…')` の ID、`querySelector` のクラス・属性セレクターを抜き出し、`studio/js/camera/legacy-ids.json`（WP-06b で生成。`camera.html` には ID が 122個ある）と、ホストが作る DOM（Playwright で列挙）に全部が含まれることを確かめる。
       - **重複IDの検査**：新UIのページ全体で `[id]` が一意であること。`root` 基準で取るので、重複してもカメラのコードは壊れないが、`label for` や `document.getElementById` を使う他のコードが壊れるのを防ぐ。
     - **常駐**：mount したコードは作り直せないので、ホストの根要素はページの中で1つだけ作る。SCR-02 を離れるときは `#main` から外し、非表示の `#keepalive`（`studio/index.html` の `<body>` の直下に足す）へ移す。戻ったら `#main` に戻して、`window.dispatchEvent(new Event('resize'))` を送る。§1.6 の後始末では破棄しない。SCR-03/04/14/15/16 は、⑥の時点では SCR-02 の該当タブ（`?tab=focus` など）へのリンクにし、同じホストを2つ作らない。
  3. **WP-06c：②との統合**。保存は②の［保存］1つにする。
     - `saveProject()` は、ホストが読み込み済みなら、`window` イベント `bai-camera-bundle-snapshot`（`camera.js:208`）でカメラの状態を、`bai-camera-workspace-snapshot`（`camera_3d.js:290`）で workspace を集め、本文の `camera`・`workspace` に使う（`camera_project_bundle_ui.js:5〜6, 18` と同じ方法）。集めた workspace にも §2.2(d)-9 のマージ規則を当てる。
     - 再読込のときは、`bai-camera-workspace-restore`・`bai-camera-bundle-restore`（`camera_3d.js:293`、`camera.js:209`）で反映する（`camera_project_bundle_ui.js:19` と同じ順番）。
     - `dirty.camera` はホストの「未保存」の状態から取る（取り方は O-⑥-1）。
  4. **WP-06d**：Phase E §7 に読み替え表（O-⑥-4 の配置表から作る）を追加し、高性能モデルで1回レビューする（Phase E §0 の条件）。
- **理由**：`camera.js` は 227 行の中で 94個の要素IDを直接参照しており、Phase E WP-00a〜17 がこの中身を改修する予定。フォークすると、Phase E の改修と G-xx の修正を2か所に入れることになり、ずれる。mount 化なら変えるのは要素の取り方だけで、動作は変わらない。Phase E の変更は1か所に入る。
- **K8（Phase E の改修の約束）**：共有した `camera.js`・`camera_3d.js` に Phase E が足す UI は、`camera.html` に無い要素を使うことがある。足すコードは必ず `const el=$('new-id'); if(el){ … }` の形で要素が無い場合を守り、`camera.html` では何も起きないようにする（旧画面に新機能を出さない：R5）。Phase E の各 WP の完了ゲートに「旧 `camera.html` を開いて pageerror が0件」を足す（Phase E §7 に注記した）。

#### (c)〜(g)

- **O-⑥-1**：`camera.js` の未保存の状態（内部の変数 `dirty`、`camera.js:1, 7`）を外へ知らせる方法。既定は、`mount` の戻り値として読み取り専用の `{ isDirty(): boolean }` を返すこと（mount 化と同じコミットで足す。旧画面からは呼ばれないので動作は変わらない）。Opus で判断する。
- **O-⑥-2**（既定を変えた：1-M10）：カメラ画面単独の［保存］（`#save` → `POST /api/camera/project`、`camera.js:210`）は、**Phase E WP-02d まで残す**。新UIのホストにも `#save` を見える形で置き、モックの SCR-02 のツールの位置に「カメラだけ保存」として出す。WP-02d で統合保存が完成したら、Phase E §7 の読み替え表に従って一本化する。
- **O-⑥-4**：要素IDの配置表（どの ID をモックのどのパネル・タブに置くか）。WP-06b の最初の成果物として作り、Opus で1回レビューしてから実装する。これが Phase E §7 の読み替え表の元になる。
- 削除：v1 の O-⑥-3（正規化の置き換え）は、mount 方式にしたので不要になった（§1.7）。
- テスト：`tests/studio-p2-camera.test.cjs`（ポート 8794）。
  - 旧 `camera.html` に対する既存の Playwright 相当の操作（キー追加→Undo→保存→再読込で復元、合成 GLB を両方のビューに描画）が、新UIのホストでも同じ結果になる。
  - 包含と重複IDの検査。
  - 常駐（SCR-02→08→02 でキーが残っている）。
  - カメラ単独の保存と統合保存の両方が、それぞれのファイルに正しく書く。
- Phase E との接続：WP-06d の完了で、Phase E §7 の「UI 部分は読み替え表の追加・レビュー後」の条件が満たされる。

#### (h) ◇ 未実装のまま

Phase E の未完成の機能すべて（CAM-001〜018 の未達の部分。Phase E 側で実装する）、SCR-03/04/14/15/16 の独立画面化（⑥ではリンク）、WebMCP `camera_page`（Phase E WP-02c）。

- **Q3（所有者への確認）**：⑥の後、旧 `camera.html` での編集をどうするか。既定は**編集できるまま残し**、上部に案内「新UIのカメラ画面（/workspace/02）をお使いください」を1行出す。案内は文言だけの表示で機能ではない。ただし旧画面の見た目の変更なので、所有者の承認を得てから入れる。読み取り専用にする案は、Phase E WP-02a〜d と同時に旧画面を変えることになるので、既定にはしない。

---

### 2.7 ⑦ 書き出し（WP-07。未決は O-⑦）

#### (a) 移植する機能

| # | 機能 | 根拠 |
|---|---|---|
| ⑦-1 | FBX の連結を VMD に変換するジョブの作成（ボーン対応の JSON が必須） | `index.html:418`（`#vmd-job`）、`POST /api/export-vmd-job`（`server.py:873〜894`） |
| ⑦-2 | Blender での変換の実行と状態の取得 | `POST /api/run-vmd-conversion`（`server.py:723〜761`。`confirm:true` が必須、Blender が無ければ 503）、`GET /api/conversion-status`（`server.py:308〜309`） |
| ⑦-3 | カメラ VMD の書き出し | ⑥のホストの中（`camera.js:76`、`/api/camera/vmd/native/export`） |
| ⑦-4 | 診断 ZIP | `GET /api/diagnostics/export`（既に SCR-20/24 にリンクがあり、実機能） |

#### (b) 移植先

SCR-23 の中央のカード「エクスポート」（`screens.js:607` のパネル）に⑦-1・⑦-2 を置く。SCR-13 のツール「VMDを書き出す」（◇、`screens.js:390`）は SCR-23 への遷移に変える。SCR-17・SCR-07（動画のレンダリング）は ◇ のまま（Phase F）。

#### (c)〜(g)

- **O-⑦-1**：⑦-1 はコンビネーション（⑤）とボーン対応（⑤-7）に依存する。⑤の完了後に詳しくする。
- **O-⑦-2**：Blender の実行には 240 秒かかることがある（`server.py:745`）。新UIでの待ち方（`/api/conversion-status` を1秒ごとに取る、画面を離れても続ける）を決める。偽の進捗は出さない（出すのは「実行中（経過 N 秒）」だけ）。
- **O-⑦-3**：書き出し先は `exports/`（`data_dir()` の外。Phase E §2.9 の「対象外の書出し先」）。テストでは Blender を呼ばず、503 の表示だけを確かめる（Blender の実行は開発環境で未検証）。

#### (h) ◇ 未実装のまま

動画・画像のレンダリング（Phase F）、出力のプリセット・キュー・AOV（RENDER-*、NF-018）、素材単体の書き出し（NF-010）、ポータブル ZIP（DATA-012）。

---

### 2.8 ⑦の後：IK・AI（WP-08。既定は移植する）

| # | 機能 | 根拠 | 移植先（案） |
|---|---|---|---|
| ⑧-1 | 手動 IK のポーズ補助（基礎版） | `pose_ik_ui.js`（21行、`#bai-pose-editor`）、`/api/pose/last`・`/api/pose/save`・`/api/pose/solve` | SCR-13 の右タブ（O-⑧-1） |
| ⑧-2 | AI 管理（`#bai-ai-manager`） | `bai_ai_ui.js`（25行）、`/api/ai/*` | SCR-19（WebMCP・標準MCP・AIエージェント統合）（O-⑧-1） |

- 方式は R2-3（接着コードを `api.js` で書き直す）。⑦の完了後に、Opus で本節を詳しくする（割り付け・テスト）。Q2 で削除してよいと決まったものは移植しない。

---

## 3. 作業パッケージ（P2-WP）と順番

| WP | 内容 | 依存 | 規模 | モデル | 完了ゲート（すべて満たす） |
|---|---|---|---|---|---|
| **P2-WP-00a** | テストの土台とデータの隔離：`bai_paths.py`・ルートの `conftest.py`・`tests/test_data_isolation.py`（Phase E §2.9 の仕様どおり。**Phase E WP-03 の前倒し**）、`tests/helpers/studio-harness.cjs` と `tests/run-guarded.cjs`（§4）、devDependencies に `"three": "0.160.1"`（`package.json` と `package-lock.json`）、`tools/make_test_glb.py`（Phase E §2.9 の合成モデルの仕様）、`tools/make_test_vmd.py`、`tools/make_test_pmx_zip.py`、`tests/studio-ui.test.cjs`・`tests/legacy-ui-layout.test.cjs` をハーネスへ移す | なし（`legacy-ui-layout` の移行は `5865209` の後） | M | Sonnet で実装 → **Opus でレビュー**（全ての保存先を切り替える＝データ破損のリスク） | pytest 全件・node 全件が合格。実 `data/` と `exports/` のハッシュが全テストの前後で一致（`run-guarded.cjs`）。§1.14 の「同じプロセス」のテストが一時ディレクトリを使っていることを確認。`PHASE_E_IMPLEMENTATION_STATUS.json` の `planned_in` の該当行の `status` を `done` にし、コミットを書く。 |
| **P2-WP-00b** | 不具合の修正（§1.15）：B-1（`server.py:316〜320` の削除）、B-2（`index.html` の `externalProjectApply` に1文）、B-3（`read_project` のエラー分岐・`CameraProjectInvalid`・退避・`bad(...,code)`・`read_bundle(strict)`・バンドルの GET/POST の 422）。テストは `tests/test_project_envelope.py`、`tests/test_bundle_camera_invalid.py`、`tests/legacy-project-save.test.cjs`。`test_legacy_project_client_revision.py` の該当する検査を置き換える | 00a | S〜M | Sonnet で実装 → **Opus でレビュー**（保存経路の変更） | 新しいテストが合格。既存の `test_bai_camera.py`・`test_project_state_bundle.py`・`test_bundle_revision.py` が合格（旧 `read()` の互換）。実 `data/` を使うテストは無い。Phase E 台帳の G-06 の行に「一部（エラー分岐のみ）P2-WP-00b で実施」を記録。 |
| **P2-WP-00c** | 新UIの土台：`api.js`・`store.js`・`bus.js`・`state-box.js`・`legacy.js`・`features/index.js`・`legacy-globals.d.ts`・`studio/types/legacy/*.d.ts`・`tsconfig.json` の `paths`／`include`・`features.css`。`app.js` の `feature` 部品・後始末（毎回の render）・`data-act="real"`・`navigate` のクエリ。`studio/index.html` の importmap・`#keepalive`。`screens.js` の `evidence`／`shell`・`PH.P2` の文言。`tests/test_screen_status_honesty.mjs`、`tools/run_evidence_tests.mjs`、`gen_screen_matrix.mjs` の更新、`STUDIO_DESIGN_SYSTEM_JA.md` の契約の文言、`docs/roadmap/P2_PORT_STATUS.json` の新設。`*.fork.js` の規則（§1.8） | 00a | M | Sonnet で実装 → **Opus でレビュー**（全画面の土台） | 型検査が合格。`studio-ui.test.cjs` が全件合格（見た目・動作の後戻りなし。後始末のテストを含む）。`api.js` の単体テスト（`tests/studio-p2-api.test.mjs`：`fetch` を差し替えて、状態コードと `error_code` の割当、`limitLabel` を確かめる）。honesty テストが合格。 |
| **P2-WP-01** | ② プロジェクト（§2.2） | 00b, 00c | M | Sonnet で実装 → **Opus でレビュー**（上書き・競合・自動保存） | §2.2(f) の全項目、§2.2(g) の全テストが合格、マトリクスを再生成 |
| **P2-WP-02** | ③ 素材一覧（§2.3 の一覧・分類・詳細・キューの表示枠） | 00c | S〜M | Sonnet | §2.3(f) の 1・5、`studio-p2-import-rules`（分類の部分）と `studio-p2-assets` の一覧の3件が合格 |
| **P2-WP-03** | ③ 取り込み（§2.3 の取り込み規則・複数選択・ダイアログ・衝突の確認・送信）とホームの「最近の素材」 | 02 | M | Sonnet で実装 → **Opus でレビュー**（置き換え・上書き・再分類の確認） | §2.3(f) の 2〜4・6、取り込みのテストが全件合格 |
| **P2-WP-04** | ④ 3D 表示（§2.4 の ④-1〜④-8） | 03（素材の登録が必要）、O-④-1〜3 の決定 | L | O-④ を Opus で決める → Sonnet で実装 | §2.4(f)、viewport・照合のテストが合格、GPU 未検証を台帳に記録 |
| **P2-WP-04b** | ④ リターゲット検証の移植（④-9・④-10） | 04、O-④-5 | M | O-④-5 を Opus で決める → Sonnet | 各 API の応答の表示のテスト（隔離データ、合成 GLB） |
| **P2-WP-05** | ⑤ モーションの適用・タイムライン（§2.5） | 04、§2.5 を詳しくした版 | L〜XL | **Opus で §2.5 を詳しくする**（批評1回）→ Sonnet で実装 → Opus でレビュー | 詳しくした版の受け入れ条件 |
| **P2-WP-06a** | ⑥ mount 化（§2.6 の 1） | 01、00a | M | Sonnet で実装 → **Opus でレビュー**（旧画面の変更） | §2.6 の 1 の完了条件 |
| **P2-WP-06b** | ⑥ ホスト・配置表・包含と重複IDのテスト・常駐 | 06a、04、05（workspace の clip・frame）、O-⑥-4 の配置表 | L | **Opus で配置表を決める** → Sonnet で実装 | `studio-p2-camera` のホストの部分が合格 |
| **P2-WP-06c** | ⑥ ②の保存との統合、`dirty.camera`（O-⑥-1） | 06b | M | Sonnet で実装 → **Opus でレビュー** | 統合保存とカメラ単独の保存のテストが合格 |
| **P2-WP-06d** | ⑥ Phase E §7 の読み替え表 | 06c | S（文書） | **Opus** | 読み替え表のレビュー完了 |
| **P2-WP-07** | ⑦ 書き出し（§2.7） | 05 | M | O-⑦ を Opus で決める → Sonnet | §2.7 の受け入れ条件（Blender の実行は未検証として記録） |
| **P2-WP-08** | IK・AI（§2.8） | 07、Q2 | M | Opus で詳しくする → Sonnet | 詳しくした版の受け入れ条件 |
| **P2-WP-99** | 締め：マトリクス・監査文書（`STUDIO_UI_AUDIT_JA.md` の件数表）・台帳・旧画面との比較（`tools/legacy_ui_inventory.mjs` を新UIにも走らせる版は作らない。手順書にテストの一覧を書く） | 08 | S | Sonnet（文書） | 未検証の一覧（§5.2）を台帳に写す |

WP-06 全体の規模は **XL**（v1 では L としていたが、旧画面の変更・テストの直し・ホスト・統合・文書の4段階に分けて見積もり直した）。

共通の完了ゲート（各 WP）：
- `npm run typecheck`、`python -m pytest -q`（全件）、`node tests/run-guarded.cjs`（既存の `tests/*.cjs`・`test_camera_*.cjs/mjs` と新しいテストを、実データのハッシュの確認で包んで実行）、`npm run test:studio`。
- `node tools/run_evidence_tests.mjs`（§1.13）。
- `node tools/gen_screen_matrix.mjs` の再生成の差分をコミットに含める。
- `P2_PORT_STATUS.json` の該当する WP を更新する（`state`・`commits`・`tests`・`unverified`）。
- 作業報告にモデルの区分を1行で書く（AGENTS.md）。

`docs/roadmap/P2_PORT_STATUS.json` の形（WP-00c で作る）：
```json
{
  "schema": "bai.p2_port_status.v1",
  "design": "docs/roadmap/P2_PORT_DETAILED_DESIGN_20261020_JA.md",
  "baseline_commit": "5865209",
  "precedes": "Phase E（docs/roadmap/PHASE_E_IMPLEMENTATION_STATUS.json の p2_port を参照）",
  "work_packages": [
    {"id": "P2-WP-00a", "step": "基盤", "state": "not_started", "commits": [], "tests": [], "unverified": [], "notes": ""}
  ]
}
```
`state` は `not_started`／`in_progress`／`implemented`（コードがあり、テストは一部）／`verified`（本書のテストが全件合格）。`verified` でも、GPU・実データは `unverified` に残す。

---

## 4. テストの土台

### 4.1 共通ハーネス `tests/helpers/studio-harness.cjs`（WP-00a）

```js
// 返り値: { base, dataDir, stop(), launchBrowser(), newPage(browser, { expectErrors }) }
async function startServer({ port, seed = {} }) {}
// page に許可するエラーを登録する（正規表現の配列）。テストの最後に、許可されていないエラーが0件であることを確かめる
function expectErrors(page, patterns) {}
```
- **データの隔離**：`fs.mkdtempSync(os.tmpdir() + '/bai-p2-')` を作り、`integrated_v02/catalog.json` に `{"models":[],"motions":[]}` を置き、`seed`（相対パス→内容の辞書。バイナリは Buffer）を書く。`python server.py <port>` を `env: { ...process.env, BAI_DATA_DIR: dataDir }` で起動し、`/api/server-version` が 200 になるまで待つ（最大12秒）。Python は `process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')`（`legacy-ui-layout.test.cjs:14` と同じ）。
- **終了の順番**：`test.after` では、**ブラウザーを閉じてから** `stop()` を呼ぶ（逆だと、閉じる途中の通信がエラーとして残る）。`stop()` はサーバーを止めて一時ディレクトリを消す（環境変数 `KEEP_TEST_DATA=1` なら残してパスを表示する）。
- **前提**：`bai_paths.py`（Phase E §2.9）が、`server.py` の `DATA`・`RETARGET_FILE`・`AI_CONFIG`、`diagnostic_logging.py` の `LOG_DIR`、`qa_capture.py` の `ROOT` を `data_dir()` から作ること。これが無いとアップロードが実 `data/` に書かれてしまうので、**書き込みのテストは WP-00a の完了まで作らない**。
- **実データの保護**（`tests/run-guarded.cjs`）：リポジトリの `data/` 全体（`logs/` を含む）と `exports/` の、相対パス＋内容の sha256 を**1回だけ**計算する。そのうえで `node --test`（与えられたファイル）を子プロセスとして実行し、終わった後にもう一度計算して比べる。違えば、変わったパスの一覧を出して失敗にする。テストのファイルごとの before/after では比べない（並行で動く他のテストのログ書き込みと競合するため）。pytest 側は `tests/test_data_isolation.py`（Phase E §2.9）が同じことをする。
- **three**：`node_modules/three`（devDependency の `three@0.160.1`。`npm ci` で入る）を使う。環境変数 `THREE_DIR` で上書きできる（`tools/legacy_ui_inventory.mjs:11` と同じ）。`context.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.1\/(.*)/, …)` でローカルのファイルを返す（`tools/legacy_ui_inventory.mjs:19〜25` の方式を写す）。three が無いとき、3D を使うテストは `skip`（理由「three.js がローカルにありません（npm ci）」）にして、未検証として記録する。
- **Chromium**：`executablePath = process.env.CHROMIUM_PATH || process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? そのパス : undefined)`（`legacy-ui-layout.test.cjs:15` は `CHROMIUM`、Phase E §2.9 は `CHROMIUM_PATH` なので両方を読む）。`args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']`（`tools/legacy_ui_inventory.mjs:83` と同じ）。3D のテストは `WEBGL_debug_renderer_info` の文字列を結果に出し、SwiftShader／llvmpipe なら「GPU 未検証」とする。
- **ポート**（ファイルごとに別のサーバー。環境変数で上書きできる）：

| テスト | 既定のポート | 環境変数 |
|---|---|---|
| `studio-ui`（既存） | 8799 | `STUDIO_TEST_PORT` |
| `legacy-ui-layout`（既存） | 8798 | `LEGACY_UI_TEST_PORT` |
| `studio-p2-project` | 8797 | `P2_PROJECT_PORT` |
| `studio-p2-assets` | 8796 | `P2_ASSETS_PORT` |
| `studio-p2-viewport`・`normalize-parity` | 8795 | `P2_VIEWPORT_PORT` |
| `studio-p2-camera` | 8794 | `P2_CAMERA_PORT` |
| `studio-p2-motion` | 8793 | `P2_MOTION_PORT` |
| `studio-p2-export` | 8792 | `P2_EXPORT_PORT` |
| Phase E `camera-ui`（Phase E WP-03） | **8791**（Phase E §2.9 の既定 8798 を変更。Phase E §2.9 に注記した） | `CAMERA_UI_TEST_PORT` |
| `legacy-project-save` | 8790 | `P2_LEGACY_PORT` |

- **エラーの監視**：`pageerror` とコンソールの `error` を集め、各テストの最後に、`expectErrors` で許可したもの以外が0件であることを確かめる（既存の `studio-ui.test.cjs:36〜37` と同じ考え方）。意図して 404/400/409/422 を起こすテストは、その URL と文言の正規表現を許可する。

### 4.2 テスト用ファイル（`tests/fixtures/`。生成スクリプトで作り、コミットする。元の素材ではない）

| ファイル | 生成 | 中身 |
|---|---|---|
| `synthetic_test_model.glb` ＋ `.expected.json` | `tools/make_test_glb.py`（標準ライブラリだけ） | Phase E §2.9 の合成モデル（直方体・ボーン10本・アニメ30F）。 |
| `minimal.vmd` | `tools/make_test_vmd.py` | `Vocaloid Motion Data 0002` のヘッダー＋モデル名20バイト＋ボーンキー1件（`センター` の 0F）＋他の件数は0。 |
| `minimal_pmx.zip` | `tools/make_test_pmx_zip.py` | `model/test.pmx`（O-④-2 の最小 PMX。作れるまでは `PMX ` で始まるダミーで、③の登録のテストだけに使う）＋ `model/tex/a.png`（1×1）。 |
| `bad.fbx` | テストの中で生成 | ランダムな256バイト。 |
| 壊れたカメラ | テストの中で生成 | `{"broken":`（B-3）。 |

### 4.3 実行コマンド（`package.json` に足す）

```
"test:p2": "node tests/run-guarded.cjs tests/studio-p2-*.test.cjs tests/studio-p2-*.test.mjs tests/legacy-project-save.test.cjs tests/test_screen_status_honesty.mjs",
"test:p2-py": "python -m pytest -q tests/test_project_envelope.py tests/test_bundle_camera_invalid.py tests/test_data_isolation.py"
```
`npm run test:studio` は今のまま（ハーネスへ移した後も同じ名前）。

---

## 5. リスク・未検証・所有者への確認

### 5.1 リスク

| # | リスク | 対策 |
|---|---|---|
| K1 | データの隔離が漏れて、テストが実 `data/` を書き換える | WP-00a を Opus でレビューする。`run-guarded.cjs` と `test_data_isolation.py` で全体の前後を比べる。書き込みのテストは WP-00a の完了後に作る。 |
| K2 | 新UIと旧画面を同時に開き、両方で保存する | 統合バンドルとコンビネーションの If-Match（409）で検知する。B-1・B-2 の修正後は、旧画面も If-Match 付きで保存し、外部の変更を取り込んだ後も保存できる。旧画面の外部同期は確認なしで上書きする（`index.html:376`）が、これは既存の動作なので P2 では変えない（変えると旧画面への新機能になる）。新UIのヘルプ（SCR-25 FAQ）に「新旧の画面で同時に編集しないでください」と1行足す。 |
| K3 | three.js を CDN から読むので、インターネットが無いと 3D が動かない | 旧画面と同じ制約。状態の表示で理由を出す。ローカルからの配信は本書の範囲外（未承認）。 |
| K4 | ⑥の常駐の方式で、非表示の間にキャンバスの大きさが0になり、描画がおかしくなる | 戻ったときに `resize` を送る。⑥のテストで往復を確かめる。 |
| K5 | フォークした部分（`*.fork.js` の3つ）が旧コードとずれる | 先頭のコメントに元の行と基準コミットを書く。照合テストで一致を保つ。フォークは計算・データだけに限る。 |
| K6 | GLB/VRM の衝突の確認で、大きいファイルのハッシュを計算すると、メモリと時間がかかる | ファイル全体の `ArrayBuffer` を読むのは送信でも同じなので、増えるのは計算の時間だけ。行の状態を「確認中」にする。400MB を超えるファイルは事前に拒否する。 |
| K7 | 素材の「上書き」系の API は、確認なしで上書き・削除・再分類する | 新UIで事前に確認する（§2.3）。サーバーは変えない（R1）。 |
| K8 | 共有した `camera.js`・`camera_3d.js` に Phase E が足す UI のコードが、`camera.html` で例外を出したり、新機能を見せたりする | 要素が無い場合を必ず守る（§2.6）。Phase E の各 WP の完了ゲートに「旧 `camera.html` で pageerror 0件」を足す（Phase E §7 に注記）。 |
| K9 | 自動保存（450ms）と統合保存、外部の同期が重なる | 保存は同時に1つ（`saving`）。自動保存の待ちは統合保存に含める。外部の変更を検知したら自動保存の待ちを止める。§2.2(g) の競合のテストで確かめる。 |

### 5.2 未検証事項（実装後もこのままなら台帳の `unverified` に書く）

- 実際の GPU での描画（SwiftShader だけで確かめる）。
- 実際のモデル・モーション（VRM・PMX・FBX・VMD の実ファイル）。合成ファイルでしか確かめない。正しい最小の FBX を作る手段が決まっていない（O-③-1）ので、FBX の正常な登録と 3D 表示は未検証になる見込み。
- Blender による VMD の変換（⑦）。
- Windows での動作（開発環境は Linux）。
- 外部の AI・MCP クライアントからの同時操作（②の外部同期は HTTP で模擬するだけ）。
- 1180px・820px・390px 以外の画面幅。
- 旧制作画面の新しい配置（`5865209`）と新UIを同時に開いたときの動作（K2 の範囲で、テストは保存の往復だけ）。

### 5.3 判断として決めたこと（確認は不要。異論があれば指摘してください）

- 素材一覧の並び替え・グリッド/リスト・大きさは、モックで既に動いている**表示だけの機能**として実データに使う（データは変えない）。
- コンビネーションの編集は、旧画面と同じく **450ms 後に自動保存する**。カメラ・作業中の素材参照を含む統合保存は［保存］で行う（1-m11）。タイムラインの 550ms の自動保存は⑤で移植する。
- 外部の変更は、未保存の変更を上書きしない（旧画面より安全側）。
- 「最近の素材」には、このページで取り込んだものだけを出す（API に登録日時が無いので）。
- 取り込みは複数のファイルを選べる。一括のタグ付け・変換は作らない（NF-004）。
- workspace は1つの所有者の規則に従ってマージする（§2.2(d)-9）。

### 5.4 所有者への確認（既定のまま進める）

- **Q1 新規プロジェクトの作成**：今のサーバーは制作状態を1つだけ持ち（`data/project_state.json` と `data/camera_project.json`）、旧画面にも「新規作成」は無い。新規作成を「今の制作状態を空に戻す」として作ると、取り消しのできない上書きになる（バックアップの機能が無い）。**既定：P2 では新規作成を ◇ 未実装のまま残し、保存・読込・履歴だけを移植する。** 「空に戻す（確認の入力つき）」を P2 に入れる場合は指示してください（WP-01 への小さな追加で入ります）。
- **Q2 旧画面の機能の中に、削除してよいものはあるか**：v2 では、旧画面の機能はすべて移植する予定にした（④-9・④-10、⑤-10〜⑤-14、⑧-1・⑧-2）。この中に、新UIへ移さずに旧画面のリンクだけで残してよいもの（または不要なもの）があれば指示してください。**既定：すべて残して移植する。**
- **Q3 ⑥の後の旧 `camera.html`**：§2.6(h) のとおり。**既定：編集できるまま残し、案内を1行出す（案内は承認の後）。**

---

## 付録A 本書で使う既存 API の一覧（P2 で新UIから呼ぶもの）

| API | メソッド | 使うステップ | 根拠（server.py） |
|---|---|---|---|
| `/api/project/bundle` | GET / POST（If-Match 必須。B-3 の後はカメラが壊れていれば 422） | ②⑥ | 168〜173 / 359〜376 |
| `/api/project` | GET（`?envelope=1`。B-1）/ POST（If-Match。自動保存） | ② | 316〜325 / 895〜917 |
| `/api/sync` | GET | ② | 310〜311 |
| `/api/assets` | GET | ③④⑤ | 289〜290 |
| `/api/server-version` | GET | ③ | 241〜242 |
| `/api/integrated-v02/upload` | POST | ③ | 762〜778 |
| `/api/pmx-zip-upload` | POST | ③ | 779〜829 |
| `/api/mmd-upload` | POST（slot=vmd のみ） | ③ | 830〜845 |
| `/api/upload` | POST | ③ | 956〜973 |
| `/api/integrated-v02/asset/<file>` | GET | ④⑤ | 335〜348 |
| `/api/mmd-file/<slot>/<name>` | GET | ④⑤ | 293〜307 |
| `/api/file/<id>` | GET | ④⑤ | 350〜355 |
| `/api/retarget/*`（§2.4 ④-9 の16本と `review-bundle`・`keyframe-review`） | GET/POST | ④⑤ | 各ハンドラー（WP-04b・WP-05 の詳細化で行番号を記録） |
| `/api/motion-layers`、`/api/qa/*` | 各種 | ⑤ | 同上 |
| `/api/favorites` | GET / POST | ⑤ | 326〜329 / 941〜950 |
| `/api/timeline-editor` | GET / POST | ⑤ | 287〜288 / 668〜686 |
| `/api/mapping`、`/api/manifest`、`/api/conversion-map` | POST / GET / GET・POST | ⑤⑦ | 951〜955 / 349 / 312〜315・863〜872 |
| `/api/camera/*` | 各種 | ⑥ | 174〜200, 377〜438 |
| `/api/export-vmd-job`、`/api/run-vmd-conversion`、`/api/conversion-status` | POST / POST / GET | ⑦ | 873〜894 / 723〜761 / 308〜309 |
| `/api/diagnostics/export` | GET | ⑦（既存のリンク） | 216〜218 |
| `/api/pose/*`、`/api/ai/*` | 各種 | ⑦の後 | 同上（WP-08 で記録） |

## 付録B 旧画面のファイルの変更（R5 の確認用）

| ファイル | P2 で変えるか | WP | 内容 |
|---|---|---|---|
| `server.py` | 変える（バグ修正） | 00b | B-1 の重複分岐の削除、B-3 の `bad(code)` とバンドルの 422 |
| `bai_camera.py`、`project_state_bundle.py` | 変える（バグ修正、Phase E §2.7 の一部の前倒し） | 00b | B-3 |
| `index.html` | 変える（バグ修正の1文） | 00b | B-2 |
| `camera.js`、`camera_3d.js` | 変える（動作を変えない mount 化） | 06a | §2.6 の 1 |
| `camera.html`、`camera.css`、`camera_project_bundle_ui.js`、`webmcp.js`、旧画面専用の `*_ui.js`・`v016*.js`、`motion_layers.js` | 変えない | — | — |
| 共有の UMD（`camera_rig.js` など） | P2 では変えない（Phase E で変わる） | — | — |
