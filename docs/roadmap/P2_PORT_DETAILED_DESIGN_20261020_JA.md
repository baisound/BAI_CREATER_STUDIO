# P2 既存機能の新UI移植 詳細設計 v1 — 2026-10-20 【レビュー中の草案 v1：批評3回＋最終判定の前。実装に使わない】

- 位置付け：所有者決定（2026-10-20、`docs/roadmap/ROADMAP_JA.md`「25画面UIモック先行」節）の **P2（既存機能を新UI `studio/` へ移植）** を、標準モデル（Sonnet 系）が設計判断なしで実装できる粒度まで落とす詳細設計。**新機能の追加ではない。** 本書の各項目は、旧画面（`index.html`・`camera.html` と読み込む JS）または既存 Python API に実在するコードに根拠を置く。根拠のないものは「◇ 未実装のまま」に分類する。
- 作業の流れ順（所有者決定・固定）：①旧画面の動作記録（完了：`docs/ui/LEGACY_UI_INVENTORY_JA.md`）→ **②プロジェクト新規作成・保存/読込 → ③素材取り込み・素材管理 → ④キャラクター・ステージ読込と3D表示 → ⑤モーション（VMD）適用・タイムライン再生 → ⑥カメラ → ⑦書き出し**。本書は②〜⑦を扱う。②③は実装可能な詳細度、④〜⑦は同じ章立てで未決事項（O-xx）を明示する。
- 正本の優先順位：`AGENTS.md`（スコープ凍結・モデル使い分け）＞ `docs/roadmap/ROADMAP_JA.md` の所有者決定 ＞ `docs/roadmap/PHASE_E_DETAILED_DESIGN_20261020_JA.md`（v4、条件付き承認。本書と接するのは §0・§2.9・§2.11・§7）＞ 本書。矛盾を見つけたら実装を止めて本書を直す。
- 基準コード：ブランチ `claude/project-thread-8gcwq2` の `f473eeb`。本書の「ファイル:行」はこの時点の行番号で、作成時に該当箇所を読み直して確認した（§1.1）。
- 設計作業のモデル区分：本書の作成は高性能モデル（Opus 系）。実装の割当は §3。

---

## 0. 原則（全作業パッケージ共通の約束）

| # | 約束 | 理由・根拠 |
|---|---|---|
| R1 | **ロジックを書き直さない**。計算・検証・保存の処理は既存 Python API（`server.py` と各 `*.py`）を**そのまま呼ぶ**。DOM に依存しない既存 JS モジュール（§1.8 の「共有」）は**ファイルをそのまま読み込む**。 | AGENTS.md「既存機能へ統合できるものは重複実装しない」。 |
| R2 | 旧画面の **DOM に縛られた JS**（`index.html` のインライン、`camera.js`・`camera_3d.js`・`camera_project_bundle_ui.js`）は**読み込めないので、新UI側へ「分岐コピー（フォーク）」**する。コピーは元コードの該当行を写し、変えてよいのは DOM との境界（要素の取り方・表示の書き方）と import 先だけ。コピー元を先頭コメントに `// fork of <file>:<行> @f473eeb` で記録する。②③は「fetch で既存 API を呼ぶ接着コード」しか無いため、§1.3 の API クライアントで書き直す（ロジックは Python 側にある）。 | 旧画面を変えずに（R5）新UIで同じ動作をさせる唯一の方法。Phase E §0 の「移植後の新UI側の同等コードに適用する」に合わせ、Phase E の画面側変更はフォーク側にだけ入る。 |
| R3 | 新UIの各画面は、移植した部分から**サンプルデータを実データの結線に置き換える**。置き換えた部分の `samples.js` の参照を消す（画像を含む）。置き換えない部分はサンプルのまま残し「サンプル表示」と明記する。 | 所有者決定「見た目の正本は新UIモック」。 |
| R4 | 状態バッジ（`実機能`／`既存・部分`／`サンプル表示`／`◇ 未実装`）は**正直に**更新する。`実機能` は「既存 Python API を読み書きし、その結果を表示している。かつ本書のブラウザーテストが合格している」場合だけ。テストが無い・失敗中なら `既存・部分` のまま。偽の成功・偽の進捗・偽の数値は出さない。 | `docs/ui/STUDIO_DESIGN_SYSTEM_JA.md`「状態表示の契約」。P2 で「読み取りのみ」から「読み書き」へ定義を広げる（WP-00c で文書も更新）。 |
| R5 | **旧画面は配信を続け、変更しない**（例外：必要不可欠なバグ修正。要件IDと理由をコミット本文に書く）。旧画面へ新機能を足さない。新UIへの移植が終わっても旧画面は削除しない。 | ROADMAP_JA.md 所有者決定。 |
| R6 | **見た目・レイアウトの正本は新UIモック**（ナイト配色、左サイドメニュー、各画面のパネル構成）。旧画面の見た目には合わせない。モックの部品を流用し、新しい部品を作るときもモックのトークン（`studio/styles/tokens.css`）とクラスを使う。 | 所有者決定。 |
| R7 | **NF 候補（NF-001〜023）は実装しない**。モックにだけある機能（お気に入りハート、コレクション、一括操作、素材の場所タブ等）は、見た目を残して `◇ 未実装` の説明ダイアログにする。 | AGENTS.md スコープ凍結、ROADMAP_RECONCILED。 |
| R8 | **非破壊**。既存 API の「上書き・置き換え・削除を伴う動作」（§2.3 の表）を新UIから呼ぶときは、必ず事前に影響を表示し確認を取る。画面内の未保存変更を、確認なしに外部の内容で上書きしない。 | AGENTS.md「非破壊・後方互換」。 |
| R9 | 1 作業パッケージ（WP）＝1〜数コミット。各コミットで P2 進捗台帳（`docs/roadmap/P2_PORT_STATUS.json`、WP-00c で新設）・テスト結果・未検証事項を更新する。Phase E 台帳に影響する変更（データ隔離の前倒し等）は `PHASE_E_IMPLEMENTATION_STATUS.json` の `notes` にも1行書く。 | AGENTS.md 規則6。 |
| R10 | **WebMCP・標準MCP**：標準MCP（`mcp_server.py`）は HTTP API を呼ぶので、新UIが同じ API を使う限り変更不要。WebMCP（`webmcp.js`）は旧画面の要素IDに依存するため新UIでは読み込まない。新UIへの WebMCP 登録は Phase E WP-02c（scope `camera_page`）以降の扱いで、P2 では `◇ 未実装` と明記する。 | `webmcp.js:4` は `document.getElementById` で旧画面の要素を操作する。 |
| R11 | ユーザー側の動作確認は求めない（AGENTS.md 規則7）。自動テストは SwiftShader 上の Chromium で行い、**GPU 実機は未検証**と記録する。 | AGENTS.md。 |

---

## 1. アーキテクチャ

### 1.1 現状の事実（コードで確認）

**新UI（外殻）**
- `studio/index.html`：`<script type="module" src="/studio/js/app.js">` のみ（42行目）。importmap なし。トップバーに `.mock-chip`「UIモック（仮画像）」（23行目）。
- `studio/js/app.js`：
  - UI設定 `bai.studio.prefs.v1`（13〜25行）をブラウザー保存。テーマ・密度・タイムライン折りたたみのみ。
  - ルーター：`parseLocation()`（32〜39行）が `/workspace/NN?tab=` を解釈、`navigate()`（41〜50行）は History API。
  - `render()`（665〜702行）は毎回 `main.textContent=''`（671行）で画面全体を作り直す。**画面を離れるときの後始末（requestAnimationFrame・WebGL の破棄）の仕組みが無い。**
  - 操作の振り分け `runAction()`（137〜145行）：`unimpl`／`nav:`／`href:`／`form:`／`mock:`。実際の API 書き込みは無い。
  - 部品 `control()`（194〜225行）。`live` 部品（217行→`liveBlock()` 258〜276行）が `live.js` の GET を表示する唯一の実データ経路。
  - 特別描画：左 `custom:'assetCats'`（323行）、中央 `type:'library'`（336行）、右タブ `custom:'assetDetail'`（309行）。素材管理の状態 `lib`（513〜514行）は画面内メモリ。`refreshLibrary()`（519〜527行）が DOM を直接差し替える。
  - ホーム：`homeView()`（470〜509行）の「最近のプロジェクト」は `PROJECTS`（サンプル、483〜487行）、「最近の素材」は `ASSETS` の固定4件（499〜502行）。
  - ビューポート `viewport()`（373〜387行）は画像＋「3D描画は未接続」表示のみ。
  - `window.baiStudio`（720行）：画面一覧と `navigate` を公開（読み取り専用）。
- `studio/js/live.js`：`get()`（12〜21行、失敗時は `{ok:false,error}`）と読み取り先一覧 `LIVE`（24〜33行）。
- `studio/js/screens.js`：25画面の定義。`PH.P2` の文言が「Phase E の後に実施」のまま（36行。所有者決定で古くなった）。SCR-01（82行〜）、SCR-08（273行〜）、SCR-12（352行〜）、SCR-13（376行〜）、SCR-18（494行〜）、SCR-23（599行〜）。フォーム `FORMS.newProject`（661〜670行）は入力検証のみで保存しない。
- `studio/js/samples.js`：`ASSET_CATS`（15行）、`ASSETS`（28行）、`PROJECTS`（62行）、`RENDERS`（70行）。
- `studio_routes.py`：`/workspace(/NN)` は外殻を返す（17・26〜27行）。`/studio/` 配下は拡張子許可リスト（6〜15行：html/css/js/json/webp/png/jpg/svg）とパス走査拒否（31〜38行）。**`studio/` 配下に置く .js は追加設定なしで配信される。**
- `tsconfig.json`：`studio/js/**/*.js` を `checkJs`・`strict` で型検査（ビルドなし）。
- テスト：`tests/studio-ui.test.cjs`（Playwright、ポート 8799、**実 `data/` を使うサーバーを起動**、7件）、`tests/test_studio_routes.py`。`studio-ui.test.cjs` の「every action button on every screen responds」は `button[data-act]`（`href`・`nav` 以外）を全部押し、トーストかダイアログが出ることを確かめる。

**サーバー（既存 API、`server.py`）**
- 読み取り：`/api/project/bundle`（168〜173行）、`/api/camera/project`（174〜177行）、`/api/assets`（289〜290行。`unified_assets()` 85〜109行）、`/api/mmd-assets`（291〜292行）、`/api/mmd-file/<slot>/<name>`（293〜307行）、`/api/project`（316〜320行）、`/api/favorites`（326〜329行）、`/api/integrated-v02/catalog`（330〜334行）、`/api/integrated-v02/asset/<file>`（335〜348行）、`/api/manifest`（349行）、`/api/file/<id>`（350〜355行）、`/api/server-version`（241〜242行）、`/api/sync`（310〜311行）。
- 書き込み：`POST /api/project/bundle`（359〜376行。**If-Match 必須**：無ければ 428、不一致 409）、`POST /api/camera/project`（427〜438行、If-Match 任意）、`POST /api/integrated-v02/upload`（762〜778行）、`POST /api/pmx-zip-upload`（779〜829行）、`POST /api/mmd-upload`（830〜845行）、`POST /api/upload`（FBX、956〜973行）、`POST /api/project`（895〜917行。同じ処理が 918〜940行に重複＝到達しないだけで無害）、`POST /api/favorites`（941〜950行）、`POST /api/timeline-editor`（668〜686行）。
- 保存バンドル：`project_state_bundle.py` の `validate_bundle()`（52〜62行）、`validate_workspace()`（36〜49行。`asset` は `.glb`/`.vrm` のファイル名か空文字のみ）、`save_bundle()`（75〜124行。**本文に `workspace` が無いと既存の workspace ファイルを削除する**：95〜98行）、`bundle_revision()`（127〜129行）。
- 同期：`sync_bump()`（141〜144行）は `POST /api/project` と `POST /api/project/bundle` のときだけ呼ばれる。`POST /api/camera/project` は呼ばない（427〜438行）。

**旧画面の該当コード（移植の見本）**
- 制作状態（コンビネーション）：`index.html:341〜363`（既定値 344行、`ui()` 350行、`fetchProjectVersion()` 351行、`save()` 352行、`record()` 354行、`restore(i)` 355行、`externalProjectApply` 356行、ボタン結線 358〜362行、起動時読込 363行）。
- 統合状態の保存・復元：`camera_project_bundle_ui.js`（全20行。保存 18行、復元 19行、復元前の検証 `validateRestore` 7〜14行）。
- 外部変更の同期：`index.html:400〜436`（`/api/sync` を 1200ms ごとに取得、`setInterval` 435行）。
- 素材：拡張子による登録の振り分け `index.html:595〜626`（`studio-workflow-binding`）、GLB/VRM 登録 `index.html:552`、PMX ZIP 登録 `index.html:504〜527`（サーバー版の機能確認 513〜516行）、VMD 登録 `uploadMmd()` 305〜316行、FBX 登録 `importFiles()` 217行（FBXLoader で読んでから送る）、素材棚 `refreshShelf()` 744行・`openAsset()` 706〜729行・絞り込み 730〜742行。
- 3D：GLB/VRM `ivLoad()` 186行（高さ 2.0 に正規化）、PMX `loadPmx()` 285〜296行（高さ 1.8）、FBX `fitModel()` 211行（高さ 1.95）、VMD 適用 320〜327行（`AnimationMixer` のみ。IK・物理なし）。カメラ画面 `camera_3d.js:278〜280`（`loadAsset`、高さ 2.0 に正規化、GLB/VRM のみ）。

**見つけた既存不具合（P2 の前提として直す。§1.15）**
- **B-1（DATA-008）**：`GET /api/project` の分岐が 316行と 321行に重複し、最初の分岐（316〜320行）が `?envelope=1` を無視して生データを返す。321〜325行の封筒（`{project, revision}`）付き応答は到達しない。このため旧画面の `fetchProjectVersion()`（`index.html:351`）は常に「保存データの版を取得できません」で失敗し、**旧画面のコンビネーション保存（`project-save`）と読込（`project-load`）が動かない**。2026-10-20 に `curl /api/project?envelope=1` が `{}` を返すことを確認した。既存テスト `test_legacy_project_client_revision.py:10` は文字列が2回出ることを確かめるだけで、実際の応答を検査していない。

### 1.2 モジュール構成（新規ファイルと責務）

すべて ES モジュール、先頭に `// @ts-check`。フレームワークなし。`studio/js/` 配下に置く（`studio_routes.py` の変更不要）。

| ファイル | 責務 | 作るWP |
|---|---|---|
| `studio/js/api.js` | 既存 HTTP API の呼び出し窓口（§1.3）。すべての fetch/XHR はここを通す。 | WP-00c |
| `studio/js/store.js` | 小さな状態ストア（§1.4）。 | WP-00c |
| `studio/js/bus.js` | 画面間イベント（§1.5）。 | WP-00c |
| `studio/js/state-box.js` | 読込中・空・失敗・未接続の共通表示（§1.10）。 | WP-00c |
| `studio/js/legacy.js` | 共有する旧 JS（UMD）の一度だけの読み込み（§1.8）。 | WP-00c |
| `studio/js/features/index.js` | 画面の結線登録簿（§1.6）。`FEATURES` を export。 | WP-00c |
| `studio/js/features/project.js` | ②プロジェクトの読込・保存・履歴・外部変更検知。 | WP-01 |
| `studio/js/features/project-view.js` | ②の画面部品（SCR-18・SCR-01・トップバー表示）。 | WP-01 |
| `studio/js/features/assets-model.js` | ③素材一覧の分類・絞り込みの純関数（DOM なし、Node で単体テスト）。 | WP-02 |
| `studio/js/features/assets-view.js` | ③素材管理画面（SCR-08 左・中央・右）。 | WP-02 |
| `studio/js/features/import-rules.js` | ③取り込み規則の純関数（拡張子→送り先・種類・事前検査）。 | WP-03 |
| `studio/js/features/import.js` | ③取り込みダイアログ・キュー・送信。 | WP-03 |
| `studio/js/viewport/three-host.js` | ④ three.js ビューポートの生成と破棄。 | WP-04 |
| `studio/js/viewport/model-loader.js` | ④ GLB/VRM/PMX/FBX の取得・解析・正規化（旧コードのフォーク）。 | WP-04 |
| `studio/js/features/character-view.js` | ④ SCR-12。 | WP-04 |
| `studio/js/motion/*.js`, `studio/js/features/motion-view.js` | ⑤（O-⑤ で確定）。 | WP-05 |
| `studio/js/camera/camera-page.js`, `camera-3d.js`, `camera-host.js` | ⑥ カメラ画面のフォークとホスト（§2.6）。 | WP-06 |
| `studio/js/features/export-view.js` | ⑦。 | WP-07 |
| `studio/styles/features.css` | 新部品の見た目（トークンのみ使用）。`studio/index.html` で `app.css` の後に読む。 | WP-00c |

既存ファイルの変更：`app.js`（結線・後始末・`data-act="real"`・トップバー表示）、`screens.js`（パネル状態・`feature` 部品・`PH.P2` 文言）、`ui.js`（変更なしを原則。必要な部品は新ファイルに置く）、`live.js`（`get()` を `api.getJson()` 呼び出しに置き換え、戻り値の形 `{ok,data}|{ok:false,error}` は維持）、`studio/index.html`（importmap、`features.css`、トップバーの状態表示の器）。

### 1.3 API クライアント `studio/js/api.js`

```js
/** @typedef {'offline'|'timeout'|'conflict'|'revision_required'|'too_large'|'bad_request'|'not_found'|'unavailable'|'server'|'bad_json'|'aborted'} ApiErrorCode */
/** @typedef {{ok: true, status: number, data: any}} ApiOk */
/** @typedef {{ok: false, status: number, code: ApiErrorCode, message: string, serverMessage: string|null}} ApiErr */
/** @typedef {ApiOk | ApiErr} ApiResult */

export async function getJson(path, { timeoutMs = 15000, signal } = {}) {}      // GET, cache:'no-store', Accept: application/json
export async function postJson(path, body, { ifMatch, timeoutMs = 30000 } = {}) {} // Content-Type: application/json, If-Match があれば付ける
export async function getBinary(path, { timeoutMs = 120000, signal } = {}) {}    // ArrayBuffer（3D素材用）。成功時 data は ArrayBuffer
export function uploadFile(path, file, { contentType = 'application/octet-stream', onProgress, timeoutMs = 600000 } = {}) {} // XMLHttpRequest。onProgress({loaded,total}) は送信バイトの実測のみ。戻り値 {promise, abort}
export function messageFor(err) {} // ApiErr → 日本語1文（下表）
export const MAX_UPLOAD_BYTES = 400 * 1024 * 1024; // server.py:59 MAX_SIZE と同値（テストで一致を検査）
```

- 判定：`fetch` が例外 → `offline`（`AbortError` で時間切れなら `timeout`、利用者の取消なら `aborted`）。`res.ok` で本文が JSON として読めない → `bad_json`。409→`conflict`、428→`revision_required`、413→`too_large`、400→`bad_request`、404→`not_found`、503→`unavailable`、その他 5xx→`server`。サーバー本文 `{"error": "..."}`（`server.py:163` の `bad()`）があれば `serverMessage` に入れる。
- 日本語文言（`messageFor`、固定）：

| code | 文言 |
|---|---|
| offline | 未接続：サーバーに接続できません。Python サーバー（npm start）が動いているか確認してください。 |
| timeout | 時間切れ：サーバーの応答がありません。もう一度お試しください。 |
| conflict | 他の画面・MCP でサーバー側が更新されています。再読込してから操作してください。 |
| revision_required | 保存元の版がわかりません。再読込してください。 |
| too_large | ファイルまたはデータが大きすぎます（上限 400MB）。 |
| bad_request | 受け付けられませんでした：{serverMessage}（serverMessage が無ければ「入力を確認してください」） |
| not_found | 見つかりません：{serverMessage} |
| unavailable | 利用できません：{serverMessage} |
| server | サーバーでエラーが起きました（HTTP {status}）。診断ZIP（24 診断・品質）で状況を確認できます。 |
| bad_json | サーバーの応答を読めませんでした（HTTP {status}）。 |
| aborted | 取り消しました。 |

- 送信前の検査は呼び出し側（`import-rules.js` 等）で行い、api.js は検査しない。
- `live.js` の `get()` は `getJson()` を呼び、失敗時 `{ok:false, error: messageFor(r)}` を返す（表示の形は変えない）。

### 1.4 状態ストア `studio/js/store.js`

```js
/** @template T @param {T} initial */
export function createStore(initial) {
  // returns { get(): T, set(patch: Partial<T>, reason: string): void, subscribe(fn: (state: T, reason: string) => void): () => void }
}
export const project = createStore({ status: 'idle', bundle: null, revision: null, dirty: false, saving: false, error: null, loadedAt: null, externalChange: false });
export const assets  = createStore({ status: 'idle', items: [], error: null, loadedAt: null });
export const imports = createStore({ rows: [] }); // このページを開いている間だけ（保存しない）
```
- `set` は浅いマージ。`subscribe` の解除関数は画面の後始末（§1.6）に登録する。
- 制作データは**ブラウザー保存しない**（再読込で必ずサーバーから読み直す）。ストアはページの寿命の間だけ。
- `project.status`：`idle`（未読込）→`loading`→`ready`｜`error`。`error` は `ApiErr`。

### 1.5 イベントバス `studio/js/bus.js`

```js
export const bus = new EventTarget();
export function emit(name, detail) { bus.dispatchEvent(new CustomEvent(name, { detail })); }
export function on(name, fn) { const h = (e) => fn(e.detail); bus.addEventListener(name, h); return () => bus.removeEventListener(name, h); }
```
固定のイベント名（これ以外を作るときは本書を更新する）：

| 名前 | detail | 発生元 |
|---|---|---|
| `studio:project-loaded` | `{revision}` | project.js |
| `studio:project-saved` | `{revision}` | project.js |
| `studio:asset-imported` | `{id}`（`/api/assets` の id） | import.js |
| `studio:assets-refresh` | `{}` | 外部同期（`refresh_assets` コマンド）・取り込み後 |
| `studio:model-loaded` | `{assetId, format, scale, offset}` | ④ viewport |

旧カメラ画面の `window` イベント（`bai-camera-*`。`camera.js:208〜210`、`camera_3d.js:290〜293`、`camera_project_bundle_ui.js:5〜6・16・19`）は、⑥のフォーク内でそのまま使い、新UIのバスとの橋渡しは `camera-host.js` だけが行う（§2.6）。

### 1.6 画面の結線方式と後始末

1. **部品の型 `feature` を1つ追加**：`screens.js` の Control に `{t:'feature', key:'projectSummary', ...opts}` を書けるようにする。`app.js` の `control()` に `case 'feature': return FEATURES[c.key](ctx, c);` を足す。左パネル・中央・右タブの既存の `custom` 機構（`app.js:309, 323, 336`）は残し、同じ登録簿 `FEATURES` を参照するよう `custom` の値を `FEATURES` のキーに統一する（`assetCats`→`assetCategories`、`assetDetail`→`assetDetail`、中央 `type:'library'`→`type:'feature', key:'assetLibrary'`）。
2. **`ctx` の形**：`{ screenId, params: URLSearchParams, navigate, onCleanup(fn) }`。部品は購読解除・タイマー停止・three.js の破棄を `onCleanup` に登録する。
3. **後始末**：`app.js` に `let cleanups = [];` を置き、`render()` の先頭（671行の `main.textContent=''` の直前）で `for (const f of cleanups.splice(0)) { try { f(); } catch (e) { console.error(e); } }` を実行する。
4. **部分再描画**：実データ部品は自分の根要素だけを作り直す（`refreshLibrary()` のような画面全体の DOM 差し替えは、③の移植でサンプル版ごと削除する）。
5. **ボタンの印**：実際に API を呼ぶボタンは `data-act="real"` を付ける。`tests/studio-ui.test.cjs` の総当たりテスト（「every action button…」）の対象から `real` を外し（`:not([data-act="real"])` を足す）、各 WP の専用テストで検査する。`unimpl`・`mock`・`form` は従来どおり総当たり対象。
6. **`window.baiStudio` の拡張**（読み取り専用、テスト用）：`project: { getState: () => project.get() }`、`assets: { getState: () => assets.get() }`、④で `viewport: { getState() }`。書き込みの関数は公開しない。

### 1.7 3D ビューポートの埋め込み（④⑤⑥共通の決定）

- **決定**：新UIの 3D は新規の `studio/js/viewport/three-host.js` で作り、モデルの取得・解析・正規化は旧コードのフォーク `studio/js/viewport/model-loader.js` に置く。`camera_3d.js` の再利用（そのまま読み込む）は**しない**。
- **理由**（コードで確認）：`camera_3d.js` は読み込み時に 24 個の要素IDを `$()` で取得し（例：`$('camera-asset-status')` 6行目、`$('dof-preview-enabled')` 17行目）、カメラ画面専用の HTML が無いと例外になる。関数を export しておらず（ESM だが export 0 件）、モデル読み込み `loadAsset()`（278行）もモジュール内に閉じている。旧制作画面の `ivLoad()`（`index.html:186`）はインラインで読み込めない。両者の正規化は同じ式（高さ 2.0、XZ 中心、足 y=0）なので、この式を model-loader.js へ写し、照合テスト（§2.4）で一致を保証する。
- カメラ画面（⑥）は `camera_3d.js` 全体をフォークする（§2.6）。そのため④の three-host.js は**キャラクター・モーション画面（SCR-12/13/05）用**で、カメラ画面の 3D は⑥のフォークが受け持つ。どちらも model-loader.js の正規化関数を使う（⑥のフォークで `loadAsset` 内の正規化 3 行を `normalizeModel()` 呼び出しに置き換えるのは「DOM 境界以外の変更」なので、O-⑥-3 として Opus レビューで可否を決める。既定は置き換えない）。
- three.js は旧画面と同じ **three@0.160.1**。`studio/index.html` の `<head>` に、`camera.html` と同一の importmap（`{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/"}}`）を、`app.js` の `<script type="module">` より前に置く。three は**3D 画面を開いたときだけ** `await import('three')` で読み込む（ホーム等の表示を遅くしない）。
- `createViewport(container, { background })` → `{ scene, camera, renderer, controls, setObject(obj), clear(), resize(), dispose(), getState() }`。`OrbitControls`（旧制作画面と同じ `three/addons/controls/OrbitControls.js`、`index.html:119`）。`ResizeObserver` で大きさに追従。`dispose()` は rAF 停止・`renderer.dispose()`・`renderer.forceContextLoss()`・ジオメトリ/マテリアル/テクスチャの dispose を行い、`ctx.onCleanup` に必ず登録する。同時に存在する three-host は1つ（⑥のホストは別。§2.6）。
- WebGL を作れないとき（例外）：ビューポートに状態表示「3D 表示を開始できません（WebGL が使えません）。」＋ `◇` ではなく `既存・部分` のまま、操作は無効化。CDN から three を取れないとき：「3D ライブラリ（three.js）を読み込めません。インターネット接続を確認してください。」（旧画面も同じ CDN 依存。§5 リスク）。
- `getState()` → `{ loaded: boolean, assetId: string|null, format: string|null, scale: number|null, offset: [x,y,z]|null, renderer: string }`（`renderer` は `WEBGL_debug_renderer_info` の文字列。取れなければ `'unknown'`）。

### 1.8 旧 JS の扱い（モジュールごとの決定）

| 旧ファイル | DOM 依存 | 決定 | 理由 |
|---|---|---|---|
| `camera_rig.js`, `camera_framing.js`, `camera_lens.js`, `camera_dof.js`, `camera_focus_tracking.js`, `camera_focus_consistency.js`, `camera_sequence_playback.js`, `camera_vmd_local.js` | なし（UMD、`root.BAI*` に公開） | **共有**：新UIからそのまま `<script src="/camera_rig.js">` 等で読む（`legacy.js`）。 | 純関数。`server.py:166` の配信許可リストに既にある。 |
| `camera_follow_config.js`, `camera_follow_smoothing.js` | なし（ESM、export あり） | **共有**：`import { classifyBone } from '/camera_follow_config.js'` で直接 import。 | ④ のボーン一覧で `classifyBone` を使う。配信許可済み（`server.py:166`）。 |
| `v01641_preview_guard.js` | なし（ESM） | P2 では使わない（⑤以降で必要なら共有）。 | — |
| `camera_easing.js`, `camera_cinematic.js`, `camera_vmd_preview.js` | なし | P2 では使わない（カメラ画面も読んでいない。Phase E §2.11 参照）。 | camera.html が読み込んでいない。 |
| `camera.js`, `camera_3d.js`, `camera_project_bundle_ui.js` | あり（94・24・3 個の要素ID） | **フォーク＋要素ID互換ホスト**（§2.6、⑥）。 | 書き直すと Phase E WP-00a の改修と二重になる。フォークすれば Phase E の画面側変更が旧画面に入らない（R5）。 |
| `index.html` インライン（制作状態・素材登録・素材棚・同期） | あり | **API クライアントで接着コードを作り直す**（②③）。ロジックは Python 側。 | 中身は fetch と表示だけ（§1.1 の行）。 |
| `index.html` インライン（3D 読込・正規化） | あり | **フォーク**（model-loader.js）。 | §1.7。 |
| `index.html` インライン（82パターン表・FBX 連結再生 `chainFrame` 271行〜・2D 模式） | あり | ⑤で決める（O-⑤-1/2）。既定は「データはフォーク、計算はフォーク、表示は新規」。 | 82パターンの表は `index.html:60` に埋め込み。 |
| `motion_layers.js`, `retarget_ui.js`, `foot_qa_ui.js`, `pose_ik_ui.js`, `bai_ai_ui.js`, `v01629〜v01640_*.js`, `webmcp.js` | あり | **P2（②〜⑦）の対象外**。新UIからは旧画面へのリンクのまま（`既存・部分`）。扱いは Q2。 | 所有者の7段階に入っていない検証用ツール群。 |

`studio/js/legacy.js`：
```js
const loaded = new Map(); // src -> Promise<void>
/** 共有 UMD を1回だけ <script> で読み込む。読み込み失敗は reject（呼び出し側が状態表示）。 */
export function loadLegacyScript(src) {}
/** 例：await loadLegacyScripts(['/camera_rig.js', '/camera_framing.js']) は順番どおりに読む */
export async function loadLegacyScripts(list) {}
```
型：`window.BAICameraRig` 等は `studio/js/legacy-globals.d.ts`（`tsconfig.json` の `include` に追加）に `any` で宣言する。

### 1.9 ルーティング

- 既存の `/workspace/NN?tab=<id>` を維持。P2 で使う追加のクエリ（すべて任意、再読込で同じ表示に戻る）：

| クエリ | 画面 | 意味 |
|---|---|---|
| `asset=<id>` | 08, 12 | 選択中の素材（`/api/assets` の id、`encodeURIComponent`） |
| `import=1` | 08 | 取り込みダイアログを開いた状態で表示（SCR-23・SCR-01 から遷移） |
| `cat=<id>` | 08 | 左の分類（`char`, `motion`, … `all`） |

- 選択を変えたら `history.replaceState` でクエリだけ更新（タブ切替の既存処理 `app.js:310〜316` と同じ方法）。
- 画面を移っても `project`・`assets`・`imports` ストアは保たれる（同じページ内）。

### 1.10 読込中・空・失敗・未接続の表示

`state-box.js`：`stateBox({ kind: 'loading'|'empty'|'error'|'offline', title, message, retry? })` → `HTMLElement`。見た目は既存の `.empty`（`app.css`）を流用し、`kind` を `data-kind` に入れる。`retry` があれば「↻ 再読込」ボタン（`data-act="real"`）。
- 読込中は 300ms 以上かかったときだけ表示（ちらつき防止）。
- 未接続は `offline`・`timeout`。失敗は `ApiErr` の `messageFor()` 文言をそのまま出す。
- 空（0件）は「まだありません」＋次の操作への導線（例：素材管理の「素材を取り込む」）。

### 1.11 UI 設定の保存

- 既存の `bai.studio.prefs.v1`（テーマ・密度・タイムライン折りたたみ）はそのまま。
- 追加：`bai.studio.lib.v1` に素材管理の表示形式（`view: 'grid'|'list'`、`size: 1..3`、`sort`、`fmt`）だけ。読み書きは try/catch で囲み、失敗しても既定値で動く。
- 制作データ・選択中の素材・未保存の編集は保存しない（§1.4）。

### 1.12 静的配信

- `studio/js/**`・`studio/styles/**` の新ファイルは `studio_routes.py` の既存規則で配信される（追加設定なし）。拡張子 `.d.ts` は配信しない（型検査専用、ブラウザーは読まない）。
- 共有する旧 JS は `server.py:166` の許可リスト（`camera_*.js` 15件）から配信される。P2 で新たに必要になる旧ファイルは無い（⑥で必要なら `server.py:166` に追加し、`tests/test_studio_routes.py` に 200 の確認を足す）。
- three.js は CDN（importmap）。テストでは Playwright の `page.route` でローカルへ差し替える（§4）。

### 1.13 状態バッジと台帳の更新規則

- `screens.js` の Panel に任意フィールド `evidence?: string`（テストファイル名＋テスト名）を追加する。`status:'real'` のパネルは `evidence` 必須。WP-00c で既存の `real` 11件に `tests/studio-ui.test.cjs` を書く。
- 新テスト `tests/test_screen_status_honesty.py`：`screens.js` を正規表現で読み、`status: 'real'` の各パネルに `evidence` があり、そのファイルが存在し、テスト名の文字列がそのファイル内にあることを確かめる。
- `tools/gen_screen_matrix.mjs`：`API` の対応（6行）を `real: 'existing_api_read_write'`、`blockers` の文言（21行）の「after Phase E per owner decision」を「P2 (before Phase E, owner decision 2026-10-20)」に直し、`evidence` を行に出力する。各 WP の最後に再生成してコミットに含める。
- `screens.js:36` の `PH.P2` を `'P2 既存機能の新UI移植（Phase E より前・作業の流れ順。所有者決定 2026-10-20）'` に直す。`docs/ui/STUDIO_DESIGN_SYSTEM_JA.md:3` の「P2、Phase E の後」も同様に直す（WP-00c）。

### 1.14 既存テストへの影響（WP ごとに直す）

| テスト | 変更 | WP |
|---|---|---|
| `tests/studio-ui.test.cjs` 起動処理 | 共通ハーネス（§4）で一時データディレクトリを使うサーバーに切り替え。 | WP-00a |
| 同「every action button…」 | 対象から `[data-act="real"]` を除外。 | WP-00c |
| 同「unimplemented actions…」SCR-18 の「復元…」 | ②で `form:confirmRestore` が実際の再読込に変わるため、期待文言を「未接続」から ②のテストへ移す（この行を削除）。 | WP-01 |
| 同「unimplemented actions…」SCR-01 の新規プロジェクトフォーム | Q1 の既定で［新規プロジェクト］が ◇ になるため、フォーム検証の検査を削除し「◇ ダイアログに DATA-008 が出る」検査に置き換える（②のテストにも同じ検査あり）。Q1 で承認されたら戻す。 | WP-01 |
| 同「read-only live data…」SCR-18 | `[data-live="projectBundle"]` は②で `feature` 部品に変わる。セレクターを `[data-feature="projectSummary"]` に変更。 | WP-01 |
| `test_legacy_project_client_revision.py:8〜11` | 文字列の出現回数ではなく実際の HTTP 応答を検査する `tests/test_project_envelope.py` に置き換え（B-1）。 | WP-00b |

### 1.15 前提として直す既存不具合

- **B-1**（DATA-008、§1.1）：`server.py:316〜320` の重複分岐を削除し、321〜325行（封筒付き）を残す。期待：`GET /api/project` は従来どおり生データ、`GET /api/project?envelope=1` は `{"project": <生データ>, "revision": camera_revision(<生データ>)}`。ファイルが無いときは `{"project": {}, "revision": camera_revision({})}`。`POST /api/project` の重複（918〜940行）は到達しないだけで無害なので触らない（変更最小）。旧画面の保存・読込が直る（見た目は変えない）。コミット本文に「DATA-008：旧制作画面のコンビネーション保存が常に失敗していた不具合の修正。新機能ではない」と書く。
- 新UIの②は B-1 に依存しない（統合バンドル API だけを使う。§2.2）が、旧画面との比較・MCP 経路の検証に必要なので先に直す。

---

## 2. ステップ別の詳細

各ステップは同じ章立て：(a) 移植する機能 (b) 移植先（画面・パネル） (c) 使う既存 API・コード (d) 新UIの動作 (e) 置き換えるサンプル (f) 受け入れ条件 (g) テスト (h) ◇ 未実装のまま残すもの。

### 2.2 ② プロジェクト新規作成・保存/読込（WP-01、実装可能な詳細度）

#### (a) 移植する機能

| # | 旧画面の機能 | 根拠 | 新UIでの扱い |
|---|---|---|---|
| ②-1 | 制作状態の読込（起動時に自動、`project-load` で手動） | `index.html:359, 363`、`camera_project_bundle_ui.js:19` | 移植。読込元は統合バンドル `GET /api/project/bundle`。 |
| ②-2 | 統合状態の保存（コンビネーション＋カメラ＋作業参照 workspace） | `camera_project_bundle_ui.js:18`、`server.py:359〜376` | 移植。新UIの唯一の保存ボタン。 |
| ②-3 | 編集履歴の一覧・戻す・やり直す・選んで復元 | `index.html:350, 355, 360〜361` | 移植（コンビネーションの履歴。`history`・`cursor`）。 |
| ②-4 | 外部（MCP・他画面）の変更の取り込み | `index.html:400〜436`、`index.html:356` | 移植。ただし**未保存の変更がある間は上書きしない**（R8。旧画面は確認なしで上書きしていた）。 |
| ②-5 | 新規プロジェクト作成 | 旧画面に無い（`LEGACY_UI_INVENTORY_JA.md` ①「旧UIに該当UIなし」） | **既定は ◇ 未実装のまま**（Q1）。 |
| ②-6 | 版（revision）による同時編集の検知 | `server.py:363〜369`（409/428） | 移植（保存時の If-Match と 409 の扱い）。 |

#### (b) 移植先

- **SCR-18 プロジェクト保存・復元・バージョン管理**（`screens.js:494〜513`）
  - ツール（`tools`）：`現行カメラ画面で保存・復元`（href）を削除し、`{t:'feature', key:'projectToolbar'}` を置く。中身は［保存］（primary、`data-act="real"`）、［再読込］（`data-act="real"`）。既存の `復元…`（`form:confirmRestore`）は［再読込］と同じ処理の確認付き入口に置き換える（フォーム定義 `FORMS.confirmRestore` は削除）。`ポータブルZIP`（◇、DATA-012）は残す。
  - 左 `プロジェクト`：一覧1件「現在の制作状態」（`meta`＝最終更新時刻）。`status:'real'`。
  - 中央カード1「現在の制作状態（読み取り）」→ タイトルを「現在の制作状態」に変え、`{t:'feature', key:'projectSummary'}`。`status:'real'`。
  - 中央カード2「バージョン」→ `{t:'feature', key:'projectHistory'}`（版の短縮表示＋編集履歴）。`status:'real'`。カード内の「版を比較」は ◇（DATA-009）のまま。
  - 中央カード3「アーカイブ」→ ◇ のまま。
  - パネル状態：`保存・復元` real、`バージョン` real（note：「編集履歴はコンビネーションのみ。任意版の差分比較は未」）、`プロジェクト一覧` real（note：「単一の制作状態」）、他は現状維持。
- **SCR-01 ホーム**（`screens.js:82〜116`、`app.js:470〜509`）
  - 「最近のプロジェクト」：`PROJECTS` のサンプル4枚（`app.js:483〜487`）を、`projectCard` 部品（1枚）に置き換える。カードのクリックで SCR-18 へ。サンプル画像は使わない（形式アイコンの無地タイル）。注記「複数のプロジェクト管理は未実装です（新規作成は ◇）」。`status:'real'`。
  - ツールの［新規プロジェクト］（`form:newProject`）とヒーローの［新規プロジェクト］：Q1 の既定に従い、**`unimpl`** に変更（why：「現在のサーバーは制作状態を1つだけ保持します。新しい制作状態を作る機能は未実装です（DATA-008 の範囲外、テンプレートからの作成は NF-019）」、ids `['DATA-008','NF-019']`、phase `PH.P2`）。`FORMS.newProject` は削除しない（Q1 が承認されたら使う）。
  - ダッシュボード側カード「最近のプロジェクト」（`screens.js:96〜99`、`homeView` の `rest` では除外済み）は表示されていないので変更不要。
- **トップバー**：`studio/index.html:23` の `.mock-chip` の右に `<span id="project-chip" class="mock-chip" role="status" aria-live="polite"></span>` を追加。`project-view.js` が状態を表示：`未読込`／`読込中…`／`保存済み`／`未保存の変更があります`／`保存中…`／`未接続`／`サーバー側が更新されました`。クリックで SCR-18 へ。

#### (c) 使う既存 API・コード

| 操作 | API | 旧コード（見本） |
|---|---|---|
| 読込 | `GET /api/project/bundle` → `{schema, combination|null, camera, workspace|null, complete, revision}`（`server.py:168〜173`、`project_state_bundle.py:65〜72`） | `camera_project_bundle_ui.js:4, 19` |
| 保存 | `POST /api/project/bundle`、`If-Match: <revision>`、本文 `{schema:1, combination, camera, workspace?}` → `{ok, schema, revision}`（`server.py:359〜376`） | `camera_project_bundle_ui.js:18` |
| 外部変更の検知 | `GET /api/sync` → `{revision, commandId, command}`（`server.py:310〜311, 138〜148`） | `index.html:405〜435` |
| 既定のコンビネーション | `{schema:1,title:'無題のプロジェクト',timeline:[],history:[],cursor:-1,selected:0,playbackSpeed:1,updatedAt:''}` | `index.html:344`（そのまま写す） |
| 履歴の復元 | クライアント内の処理（`timeline = clone(history[i].timeline)`、`cursor = i`、`playbackSpeed = history[i].playbackSpeed || 1`） | `index.html:355` |

#### (d) 新UIの動作（`features/project.js`）

```js
export const DEFAULT_COMBINATION = Object.freeze({ schema: 1, title: '無題のプロジェクト', timeline: [], history: [], cursor: -1, selected: 0, playbackSpeed: 1, updatedAt: '' });
export async function loadProject({ discardLocal = false } = {}) {}  // 未保存があり discardLocal=false なら何もしないで false を返す
export function restoreHistory(index) {}                               // 範囲外は何もしない
export const undo = () => restoreHistory(project.get().bundle.combination.cursor - 1);
export const redo = () => restoreHistory(project.get().bundle.combination.cursor + 1);
export async function saveProject() {}                                 // §下記
export function startExternalSync() {}                                 // 1回だけ。app.js の起動時に呼ぶ
export function summarize(bundle) {}                                   // 表示用の純関数（下表）
```

1. **起動時**：`app.js` の最後（`buildNav()` の後）で `loadProject()` と `startExternalSync()` を呼ぶ（どの画面から開いても1回）。
2. **読込** `loadProject()`：`status:'loading'` → `GET /api/project/bundle`。成功：`bundle = data`（`combination` が `null` なら**ストア内でだけ** `structuredClone(DEFAULT_COMBINATION)` を入れ、`combinationMissing: true` を立てる）、`revision = data.revision`、`dirty:false`、`status:'ready'`、`loadedAt = Date.now()`、`emit('studio:project-loaded')`。失敗：`status:'error'`、`error`。
3. **履歴の復元** `restoreHistory(i)`：`0 ≤ i < history.length` のときだけ。`combination.timeline = structuredClone(history[i].timeline)`、`combination.cursor = i`、`combination.playbackSpeed = history[i].playbackSpeed || 1`、`combination.selected = history[i].selected ?? combination.selected`。`history` 配列自体は変えない（旧 `restore` と同じ）。`dirty:true`。**自動保存はしない**（旧画面は 450ms 後に自動保存していた：`index.html:353`。新UIは明示保存。自動保存は DATA-010 の範囲で ◇）。
4. **保存** `saveProject()`：
   - `dirty === false` → 何もせずトースト「変更はありません」（`kind:'real'`）。
   - `saving === true` → 何もしない（ボタンは無効化済み）。
   - 本文：`{ schema: 1, combination: { ...combination, updatedAt: new Date().toISOString() }, camera: bundle.camera }`。**`bundle.workspace` が `null` でなければ必ず `workspace` を含める**（含めないとサーバーが workspace ファイルを削除する：`project_state_bundle.py:95〜98`）。
   - `POST /api/project/bundle`、`If-Match: revision`。
   - 200：`revision = data.revision`、`bundle.combination = 送った combination`、`combinationMissing:false`、`dirty:false`、トースト「保存しました（コンビネーション・カメラ・作業中の素材参照）。」`kind:'real'`、`emit('studio:project-saved')`。
   - 409：ダイアログ「サーバー側が更新されています」本文「他の画面（現行のカメラ画面・制作画面）や MCP が先に保存しました。この画面の変更はまだ残っています。」ボタン［再読込して変更を破棄］（`loadProject({discardLocal:true})`）・［閉じる］。**マージはしない。**
   - 428：`revision_required` の文言で失敗表示（通常起きない）。
   - 400：「保存できませんでした：{serverMessage}」（例：`invalid combination cursor`）。`dirty` は残す。
   - offline/timeout：「未接続：保存できませんでした。変更はこの画面に残っています。」
5. **再読込**（［再読込］・`復元…` の確認後）：`dirty` なら確認ダイアログ「保存していない変更を破棄して、サーバーの保存済み状態を読み込みますか？」［破棄して読み込む］［キャンセル］。`dirty` でなければそのまま `loadProject({discardLocal:true})`。
6. **外部変更** `startExternalSync()`：`setInterval(tick, 1200)`（旧と同じ間隔）と `document.visibilitychange`（表示に戻ったとき）で `tick()`。
   - `tick()`：同時実行しない。`GET /api/sync`。初回は `syncRevision` を覚えるだけ。`revision` が変わったら `GET /api/project/bundle` を取り、`data.revision === project.revision` なら何もしない（自分の保存による変化）。違えば：`dirty === false` → 読み込み直してトースト「外部の変更を読み込みました」（`kind:'real'`）。`dirty === true` → `externalChange:true` を立て、SCR-18 上部とトップバーに「サーバー側が更新されました。保存されていない変更があるため自動では読み込みません。［再読込して変更を破棄］」。
   - `visibilitychange` では `/api/sync` を見ずに直接 `GET /api/project/bundle` の `revision` を比べる（カメラ画面の保存 `POST /api/camera/project` は `sync_bump` を呼ばないため：`server.py:427〜438`）。
   - `command`（`play_chain` 等、`server.py:846〜862`）は②では `refresh_assets` だけ扱う：`emit('studio:assets-refresh')`。他のコマンドは無視（⑤⑥で扱う。旧画面 `index.html:415〜430`）。`commandId` は覚えて重複処理しない。
   - 失敗が続いても例外を出さない。トップバーに「未接続」。回復したら元の表示へ。
7. **離脱の警告**：`window.addEventListener('beforeunload', e => { if (project.get().dirty) { e.preventDefault(); e.returnValue = ''; } })`。画面内の移動（SPA）では警告しない（ストアは保たれる）。
8. **表示**（`project-view.js`、`summarize(bundle)` の出力を使う）：

| 表示項目 | 値 | 例 |
|---|---|---|
| タイトル | `combination.title`（`combinationMissing` なら「（未保存）」を付ける） | 無題のプロジェクト |
| 最終更新 | `combination.updatedAt` を `toLocaleString('ja-JP')`。空なら「—」 | 2026/10/20 14:28:00 |
| コンビネーション | `timeline.length` 件、履歴 `history.length` 件（現在 `cursor+1` 番目） | 2件・履歴3件（3番目） |
| カメラ | `camera.keys.length` キー、`camera.duration` フレーム、`camera.fps` fps | 2キー・300F・30fps |
| 作業中の素材 | `workspace.asset`（空なら「なし」）、`workspace.clip`、`workspace.frame` | char.vrm・クリップ0・F 0 |
| 統合保存 | `complete` が true なら「保存済み」、false なら「コンビネーション未保存（保存すると作成されます）」 | — |
| 版 | `revision.slice(0, 12)`（`title` 属性に全体） | 6d1875cf2667 |

   - 編集履歴（`projectHistory`）：`history` を新しい順ではなく**保存順**に一覧（`(i+1). 日時 ラベル`、旧 `ui()` と同じ書式：`index.html:350`）。`cursor` の行に「現在」。行の選択で［この時点に戻す］（`restoreHistory(i)`）。［戻す］は `cursor <= 0` で無効、［やり直す］は `cursor >= history.length-1` で無効（`index.html:350` と同じ条件）。履歴0件なら空表示「履歴はまだありません。コンビネーションを編集すると記録されます（現行の制作画面または ⑤ の移植後）。」
   - ［保存］は `dirty === false` または `saving` または `status !== 'ready'` で無効。
9. **アクセシビリティ**：状態表示は `role="status"`。ダイアログは既存 `openModal()`（Esc・フォーカス固定）。

#### (e) 置き換えるサンプル

`app.js:483〜487` の `PROJECTS` 表示、`screens.js:509` の `live('projectBundle')`、`FORMS.confirmRestore`（`screens.js:676〜681`）、SCR-18 左パネルの固定 `{id:'cur', meta:'サーバー'}`。`samples.js` の `PROJECTS` は SCR-01 から参照が無くなるので削除（他に参照なし。`grep` で確認してから）。

#### (f) 受け入れ条件

1. 一時データ（§4）に置いた `project_state.json`・`camera_project.json`・`project_state.workspace.json` の内容が SCR-18 と SCR-01 に表の書式で出る。
2. 戻す→保存で、サーバーの `project_state.json` の `cursor`・`timeline` が変わり、`If-Match` が読込時の版、`project_state.workspace.json` が残っている（削除されない）。カメラファイルの内容は変わらない（JSON として等しい）。
3. 読込後に別経路で保存（409 を起こす）→ 新UIの保存は拒否され、ファイルは別経路の内容のまま。ダイアログから再読込すると新しい内容が出る。
4. `project_state.json` が無い状態で、何も編集しなければ保存ボタンは無効で、ファイルは作られない。
5. 外部の `POST /api/project` の後、未編集なら 3 秒以内に表示が更新される。未保存の変更があるときは上書きされず警告が出る。
6. 未保存の変更があるときの再読込で `beforeunload` が発生する。
7. 実 `data/` のハッシュが不変（§4）。型検査・既存テストがすべて合格。

#### (g) テスト（追加）

`tests/studio-p2-project.test.cjs`（Playwright、ポート `P2_PROJECT_PORT` 既定 8797、§4 のハーネス）：

| テスト名 | 主な検査 |
|---|---|
| `SCR-18 shows the real production state` | 種データ（コンビネーション2件・履歴3件 cursor=2、カメラ2キー 300F、workspace `{frame:0, asset:'', clip:null}`）で、`[data-feature="projectSummary"]` に「2件」「履歴3件（3番目）」「2キー」「300F」、版の先頭12文字が `GET /api/project/bundle` の `revision` と一致。`.badge-real` がカード見出しにある。 |
| `undo then save writes the bundle with If-Match and keeps workspace` | ［戻す］→ `#project-chip` が「未保存の変更があります」→［保存］。`page.waitForRequest` の `If-Match` が初回 `revision`。保存後ファイル `project_state.json` の `cursor===1`、`timeline` が history[1] と同じ、`project_state.workspace.json` が存在、`camera_project.json` が JSON として不変。チップ「保存済み」。 |
| `conflict keeps local edits and offers reload` | 読込後、テストから Node の fetch で `POST /api/project/bundle`（正しい版、camera.duration=400）。UI で［戻す］→［保存］→ ダイアログに「他の画面」。ファイルの duration は 400 のまま。［再読込して変更を破棄］で「400F」表示。 |
| `missing combination is not created without an edit` | `project_state.json` なし。表示「コンビネーション未保存」、［保存］が `disabled`。10秒待っても `project_state.json` が無い。 |
| `external change reloads when clean and warns when dirty` | テストから `POST /api/project`（timeline 3件、If-Match なし）→ 3秒以内に「3件」表示とトースト「外部の変更を読み込みました」。次に［戻す］で dirty にしてから再度外部保存 → 表示は変わらず、警告文「自動では読み込みません」。 |
| `beforeunload guard when dirty` | dirty で `page.reload()` → `page.on('dialog')` の type が `beforeunload`。dismiss。 |
| `home shows one real project card and no sample projects` | SCR-01 に `[data-feature="projectCard"]` が1つ、`City_Night_MV` の文字が無い。［新規プロジェクト］で ◇ ダイアログ（「DATA-008」を含む）。 |
| `offline shows 未接続 and disables save` | `page.route('**/api/project/bundle', r => r.abort())` で開く → `[data-kind="offline"]` と「未接続」、［保存］無効。 |

`tests/test_project_envelope.py`（pytest、WP-00b）：一時データでサーバーを起動し、`GET /api/project?envelope=1` が `{"project":…, "revision":…}` で `revision == camera_revision(project)`、`GET /api/project` が生データ、ファイルなしで `{"project": {}, …}`。旧画面の結線が変わっていないことは `test_legacy_project_client_revision.py` の残り2件（`fetch('/api/project?envelope=1'` の存在等）で引き続き確認。

#### (h) ◇ 未実装のまま

新規作成（Q1）、複数プロジェクト一覧・切替（DATA-008 の範囲外）、テンプレートからの作成（NF-019）、版の差分比較・任意版への復元（DATA-009）、自動保存・クラッシュ復元（DATA-010）、ポータブルZIP・アーカイブ（DATA-012）、素材参照の健全性検査（DATA-015）、ファイルへの書き出し・ファイルからの読込（旧画面に無い）。

---

### 2.3 ③ 素材取り込み・素材管理（WP-02 一覧、WP-03 取り込み。実装可能な詳細度）

#### (a) 移植する機能

| # | 旧画面の機能 | 根拠 | 新UIでの扱い |
|---|---|---|---|
| ③-1 | 統合素材一覧（FBX・GLB/VRM・PMX・VMD を1つに） | `server.py:85〜109, 289〜290`、`index.html:744` | 移植（SCR-08 中央）。 |
| ③-2 | 名前で検索・形式で絞り込み | `index.html:730〜733` | 移植。 |
| ③-3 | ファイルの有無（`available`）の表示 | `index.html:735〜739`（「ファイルなし」） | 移植。 |
| ③-4 | 1つのファイル選択から拡張子で登録先を振り分け | `index.html:595〜626` | 移植（取り込みダイアログ）。 |
| ③-5 | GLB/VRM 登録（VRM はモデル固定、GLB は既定モーション） | `index.html:552, 611`、`server.py:762〜778` | 移植。 |
| ③-6 | PMX＋テクスチャ ZIP 登録（スロット A/B、事前にサーバー版の機能確認） | `index.html:504〜527`、`server.py:779〜829` | 移植。 |
| ③-7 | VMD 登録 | `index.html:305〜316, 319`、`server.py:830〜845` | 移植。 |
| ③-8 | FBX 登録（モーション／モデルA／モデルB、送る前に FBXLoader で読めるか・モーションならアニメーションがあるか確認） | `index.html:217`、`server.py:956〜973` | 移植。 |
| ③-9 | 登録後に一覧を更新し、登録した素材を選択 | `index.html:552`（`studio:asset-imported`）、`751` | 移植。 |
| ③-10 | 素材を開く（3D 表示・PMX 表示・VMD 選択） | `index.html:706〜729` | ④⑤で移植（③では「3D で表示」ボタンを ◇→④完了時に結線）。 |
| ③-11 | PMX 個別ファイル＋テクスチャ複数選択の登録 | `index.html:317〜318` | **移植しない**（AGENTS.md「PMX登録の現行方針：個別複数選択UIは再導入しない」）。 |

#### (b) 移植先

- **SCR-08 素材管理・アセットライブラリ**（`screens.js:273〜297`、`app.js:513〜613`）。モックの構成（左：分類と件数、中央：場所タブ・検索・形式・並び替え・グリッド/リスト・大きさ・カード・インポートキュー、右：プレビュー・情報・タグ・依存素材・操作）をそのまま使う。
  - ツール：`現行画面で素材を登録`（href）→ ［素材を取り込む…］（primary、`data-act="real"`、`openImportDialog()`）。`一括インポート`（◇ NF-004）は残す。`並び替え`（select、`screens.js:285`）は中央バーの並び替えと重複するのでツールから削除。
  - パネル状態：`素材カテゴリ` real、`検索・タグ` real（note：「名前・形式で検索。タグは未実装」）、`メタデータ` real（note：「登録情報のみ。作者・ライセンスは未記録」）、`インポートキュー` real、`サムネイル` ◇（MOTION-016）、`依存参照` ◇（REVIEW-010）。
- **SCR-23 外部連携**（`screens.js:599〜617`）：中央カード「インポート」の `link('現行画面で素材を登録','/')` を `btn('素材を取り込む','nav:08?import=1')` に変える（`runAction` の `nav:` はクエリを扱えないので、`act:'feature'` ではなく `href:/workspace/08?import=1` を使う）。パネル `インポート` を real（evidence は③のテスト）。
- **SCR-01 ホーム**「最近の素材」（`app.js:499〜502`）：固定のサンプル4件を、**このページで取り込んだ素材**（`imports` ストアの完了行、新しい順に最大4件）に置き換える。0件なら空表示「このページではまだ素材を取り込んでいません。」＋［素材管理へ］。`/api/assets` に登録日時が無いため「最近」を全素材から求めない（偽の「最近」を出さない）。

#### (c) 使う既存 API・コード

| 操作 | API | 応答・注意 |
|---|---|---|
| 一覧 | `GET /api/assets` → `{items:[{id, name, format, kind, source, available, previewable, filename?}]}` | `id` は `fbx:<24桁>`・`integrated:<ファイル名>`・`mmd:<A|B|vmd>:<名前>`（`server.py:91, 103, 109`）。 |
| サーバー版 | `GET /api/server-version` → `{version, features}` | PMX ZIP の前に `features` に `pmx_zip_upload` があるか確認（`index.html:513〜516`）。 |
| GLB/VRM 登録 | `POST /api/integrated-v02/upload?kind=model|motion&name=<名前>`、本文＝ファイル | 名前は `[^/\\\x00]{1,180}\.(glb|vrm)`、VRM は `kind=model` のみ、先頭4バイト `glTF`。成功 `{ok, name, asset, kind}`（`asset`＝SHA-256先頭20桁＋拡張子）。同じ中身は同じ保存名で上書き（重複しない）。 |
| PMX ZIP 登録 | `POST /api/pmx-zip-upload?slot=A|B`、`Content-Type: application/zip` | PMX がちょうど1つ、展開後600MB・1500ファイル以下。成功 `{ok, slot, model, model_path, files}`。**同じ相対パスの既存ファイルは上書き**（無関係なファイルは消さない：`server.py:819〜823`）。 |
| VMD 登録 | `POST /api/mmd-upload?slot=vmd&name=<名前>` | 名前180文字以内、`/`・`\`・先頭 `.` 不可、`.vmd`。**同名は確認なしで上書き**（`server.py:840〜844`）。 |
| FBX 登録 | `POST /api/upload?kind=motions|modelA|modelB&name=<名前>` | `.fbx`、250文字以内。成功 `{ok, id}`。**`modelA`/`modelB` は同じ枠の既存モデルの登録を外し、元ファイルを削除する**（`server.py:963〜971`）。 |
| 上限 | 本文 400MB（`server.py:59` MAX_SIZE、`server.py:719〜722`） | クライアントで事前に拒否。 |

#### (d) 新UIの動作

**分類（`assets-model.js`、純関数）**

```js
/** @returns {'char'|'motion'} 一覧の item を左の分類へ */
export function categoryOf(item) {
  if (item.source === 'fbx') return item.kind === 'motions' ? 'motion' : 'char';  // kind: modelA|modelB|motions
  if (item.source === 'integrated') return item.kind === 'model' ? 'char' : 'motion';
  if (item.source === 'mmd') return item.format === 'PMX' ? 'char' : 'motion';    // PMX→char, VMD→motion
  return 'motion';
}
export function sourceLabel(item) {} // fbx→'FBX登録（モデルA）'等、integrated→'GLB / VRM 登録'（catalog 由来も同じ）、mmd→'MMD スロットA'/'MMD スロットB'/'MMD VMD'
export function filterAssets(items, { cat, q, fmt, sort, onlyAvailable }) {} // q は name の小文字部分一致、fmt は format 完全一致、sort: 'api'|'name'|'format'
export function countByCategory(items) {} // {all, char, motion, stage:0, prop:0, mat:0, fx:0, audio:0, video:0, image:0}
```
- 左の分類は `ASSET_CATS`（`samples.js:15`）の順序・ラベル・アイコンをそのまま使い、件数は `countByCategory` の実数。`char`・`motion` 以外（ステージ・小物・マテリアル・エフェクト・オーディオ・動画・画像）は現在の API に登録手段が無いので常に 0。選ぶと空表示「この種類の素材を登録する機能はまだありません。」＋ ◇ の説明（ids：ステージ `LYRIC-009`、オーディオ `LYRIC-006`、その他 `NF-004`、phase は screens.js の該当画面と同じ）。`ASSET_CATS` は samples.js から `features/assets-model.js` へ移し（データ定義でありサンプルではない）、samples.js からは削除。
- 「お気に入り」「コレクション」（`app.js:536〜538`）：見た目を残し、選ぶと ◇（お気に入り：素材のお気に入りは未実装〔旧画面のお気に入りはコンビネーションのみ〕、ids `['NF-004']`）。件数表示は「—」。

**中央（`assetLibrary`）**
- 場所タブ（`app.js:549〜550`）：「ライブラリ」だけ選択可能（＝ `/api/assets` 全体）。他（ローカル／プロジェクト内／クラウド／最近追加／使用中）は ◇（クラウド：NF-013、他：NF-004）。
- 一括ボタン（`app.js:551〜554`）：3つとも ◇ のまま（既存の why を維持）。
- 検索・形式・並び替え・グリッド/リスト・大きさ：既存の部品をそのまま実データに適用。形式の選択肢は実データに現れる `format` の集合（`FBX, GLB, VRM, PMX, VMD`）。並び替えは `登録順`（API の順）・`名前順`・`形式順`。表示設定は `bai.studio.lib.v1` に保存（§1.11）。追加：チェック「ファイルがある素材だけ表示」（既定 OFF。同梱カタログの多くはファイルが無いため：`data/integrated_v02/catalog.json` はモデル3件・モーション227件で、実体はリポジトリに無い）。
- カード：サムネイル画像は使わない（MOTION-016 未実装）。無地のタイルに形式（例「VRM」）と分類アイコン（`user`／`motion`、`icons.js`）。`available === false` は薄く表示し「ファイルなし」ピル（旧画面と同じ語）。カードに `data-asset-id`。ハート（`fav`）は見た目を残し ◇。
- 件数表示（`app.js:593`）：「N件（サンプル）」→「N件」。
- 状態：読込中・失敗・未接続は `stateBox`（再読込付き）。0件（素材なし）は「まだ素材がありません。［素材を取り込む…］」。
- 一覧の更新：画面表示時に `assets.status === 'idle'` なら読込。`studio:asset-imported`・`studio:assets-refresh` で再読込。［↻］（`data-act="real"`）で手動再読込。

**インポートキュー（中央下、`app.js:579〜588` を置き換え）**
- タブ「インポートキュー（N）」の N は `imports.rows.length`。他の3タブ（同期ステータス／依存関係の確認／最近のダウンロード）は既存どおり ◇ の空表示。
- 行：ファイル名・種類（下表の表示名）・進み具合・状態。進み具合は送信中だけ実測（XHR `upload.onprogress` の `loaded/total`）。送信完了後サーバー応答待ちは「サーバーで処理中…」（バーは不定表示 `data-indeterminate`、%を出さない）。状態は `待機中`／`確認中`／`送信中 42%`／`サーバーで処理中…`／`完了`／`失敗：<理由>`／`取り消し`。
- 失敗行に［もう一度］（同じファイルで再実行）。送信中に［取り消し］（`abort()`）。行の削除は［一覧から消す］（画面内のみ。サーバーのファイルは消えない旨を title に書く）。
- 注記「このページを開いている間の記録です（保存されません）」。

**右（`assetDetail`、`app.js:597〜613` を置き換え）**
- プレビュー：サンプル画像を使わず、形式タイル（大）。④完了後は GLB/VRM/PMX/FBX のモデルなら［3D で表示］で SCR-12 へ（`/workspace/12?asset=<id>`）。③の時点では［3D で表示］は ◇（why：「3D 表示は ④ の移植で結線します」、ids `['MOTION-003']`、phase `PH.P2`）。
- 情報（`real`）：名前、形式、分類、登録元（`sourceLabel`）、ID（等幅、コピー可能な選択テキスト）、ファイル（`available` → 「あり」／「なし（再登録してください）」）、保存名（integrated のみ `filename`。title「SHA-256 先頭20桁＋拡張子」）、作成者・ライセンス：「未記録」（note：REVIEW-010 未実装）。
- タグ・説明：◇（タグは未実装、`NF-004`）。依存素材：◇（`REVIEW-010`）のまま、並びの表示例は削除（実データでない画像を出さない）。
- 操作：「シーンで使う」◇（NF-014）、「置換」◇（REVIEW-010）、「エクスポート」◇（NF-010）のまま。**削除ボタンは置かない**（削除 API が無い）。

**取り込み（`import-rules.js` 純関数＋`import.js`）**

```js
/** @typedef {'integrated'|'pmxZip'|'vmd'|'fbx'} Route */
/** @returns {{ok:true, route:Route, label:string, kinds:{value:string,label:string}[], defaultKind:string, warnings:string[]} | {ok:false, error:string}} */
export function classifyImport(name, size) {}
export const IMPORT_ACCEPT = '.glb,.vrm,.zip,.vmd,.fbx';
```

| 拡張子 | route | 表示名 | 種類の選択 | 既定 | 名前の検査（送信前） |
|---|---|---|---|---|---|
| `.glb` | integrated | GLB（モデル／モーション） | モーション／モデル | モーション（`index.html:611` と同じ） | `/^[^/\\\x00]{1,180}\.glb$/i` |
| `.vrm` | integrated | VRM モデル | なし（モデル固定） | model | `/^[^/\\\x00]{1,180}\.vrm$/i` |
| `.zip` | pmxZip | PMX モデル＋テクスチャ ZIP | 登録先：モデルA／モデルB | A | なし（中身はサーバーが検査） |
| `.vmd` | vmd | VMD モーション | なし | — | 180文字以内、`/`・`\` を含まない、`.` で始まらない |
| `.fbx` | fbx | FBX | モーション／モデルA（置き換え）／モデルB（置き換え） | モーション（`index.html:620` と同じ） | 250文字以内 |
| その他 | — | — | — | — | `{ok:false, error:'この形式には対応していません（GLB・VRM・PMX ZIP・VMD・FBX）。'}` |

共通：`size > MAX_UPLOAD_BYTES` → `{ok:false, error:'400MB を超えるファイルは登録できません。'}`。`size === 0` → `{ok:false, error:'空のファイルです。'}`。

取り込みダイアログ（`openImportDialog()`、既存 `openModal()`）：
1. ファイル選択（`<input type="file" accept=IMPORT_ACCEPT>`、**1ファイル**。複数一括は NF-004）。選択すると `classifyImport` の結果を表示（表示名・種類の選択・警告）。不可なら理由を表示し［取り込む］無効。
2. **上書き・置き換えの事前確認（R8）**：［取り込む］押下時に現在の `assets.items` を見て、該当すれば確認ダイアログ（［続ける］［キャンセル］）を挟む：
   - VMD：`id === 'mmd:vmd:' + name` が既にある →「同じ名前の VMD『{name}』があります。上書きすると元の内容は戻せません。」
   - PMX ZIP：選んだスロットに PMX が既にある（`id` が `mmd:<slot>:` で始まり `format==='PMX'`）→「モデル{slot}には既に PMX が登録されています。ZIP 内と同じパスのファイルは上書きされます（他のファイルは残ります）。」
   - FBX の modelA/modelB：同じ `kind` の FBX が既にある →「モデル{A|B}の現在の FBX『{name}』は登録が外れ、元ファイルが削除されます。」（既に無い場合も「置き換え」の説明は種類選択の横に常時表示）。
   - GLB/VRM：確認なし（同じ中身なら同じ保存名、違えば別名で保存され、既存を壊さない：`server.py:772〜777`）。
3. **送信前の追加検査**：
   - pmxZip：`GET /api/server-version`。失敗 →「サーバーのバージョンを確認できません。旧版のサーバーが起動している可能性があります。サーバーを止めて起動し直してください。」`features` に `pmx_zip_upload` が無い →「サーバーが PMX ZIP 登録に対応していません（現在のバージョン：{version}）。」（文言は `index.html:514〜516` を写す）。
   - fbx：`three/addons/loaders/FBXLoader.js` を動的 import し、`file.arrayBuffer()` を `new FBXLoader().parse(buf, '')`。例外 →「FBX として読み込めません：{message}」。種類がモーションで `animations.length === 0` →「{name} にアニメーションがありません」（`index.html:217` と同じ）。three を読めない →「FBX の確認に必要な 3D ライブラリを読み込めません。」で中止（確認なしでは送らない）。
4. 送信：`uploadFile()`。URL は上表の API。`Content-Type`：pmxZip は `application/zip`、他は `application/octet-stream`（旧と同じ）。
5. 結果：
   - 成功：行を「完了」。`assets` を再読込し、登録した素材の id を求めて選択（`?asset=` を更新）、`emit('studio:asset-imported', {id})`。id の求め方：integrated → `'integrated:' + data.asset`、pmxZip → `'mmd:' + data.slot + ':' + data.model_path`、vmd → `'mmd:vmd:' + name`、fbx → `'fbx:' + data.id`。再読込後に見つからなければ「登録しましたが一覧に見つかりません（再読込してください）」。トースト「登録しました：{name}」`kind:'real'`。PMX ZIP は「登録完了：{model_path}、素材{files}件」。
   - 失敗：行を「失敗：{messageFor(err)}」。`bad_request` の serverMessage は日本語（GLB/VRM 系）または英語（PMX ZIP の `PMX ZIP rejected: …` 等）をそのまま表示。
6. 同時に送るのは1件。キューに積んだ順に1件ずつ処理（ダイアログを閉じても続行）。

#### (e) 置き換えるサンプル

`ASSETS`（`samples.js:28〜59`）の SCR-08・SCR-01 での使用、`app.js:513〜514` の `lib`（`favs` を含む）、`COLLECTIONS` の件数、キューの表示例3行（`app.js:581`）、詳細の依存素材の画像列（`app.js:599, 607`）。`ASSETS` は SCR-11（`screens.js:348`、画像管理のサンプル）が引き続き使うため samples.js には残す。

#### (f) 受け入れ条件

1. 種データ（§4）の素材が分類・件数・形式・ファイル有無とともに SCR-08 に出る。サンプル素材名（例「夜の神社」）が SCR-08 に出ない。
2. GLB・VRM・PMX ZIP・VMD を新UIから登録でき、一時データディレクトリの所定の場所に保存され、一覧に現れ選択される。
3. FBX：壊れたファイルは送信されずに拒否される。モデル置き換えは確認ダイアログを経ないと送信されない。VMD の同名上書き・PMX スロットの上書きも同様。
4. サーバーの拒否理由が行に表示される。送信中の取り消しができる。
5. モックにだけある機能（お気に入り・コレクション・場所タブ・一括操作・タグ・依存素材・シーンで使う・置換・エクスポート）は ◇ の説明が出て、何も保存されない。
6. 実 `data/` のハッシュ不変。型検査・既存テスト合格。

#### (g) テスト（追加）

- `tests/studio-p2-import-rules.test.mjs`（`node --test`、ブラウザー不要）：`classifyImport` の表（上の6行＋上限・空・長すぎる名前・`a/b.vmd`・`.hidden.vmd`）、`categoryOf`・`sourceLabel`・`filterAssets`・`countByCategory` の表駆動テスト、`MAX_UPLOAD_BYTES === 400*1024*1024` と `server.py` の `MAX_SIZE=400*1024*1024` の文字列一致。
- `tests/studio-p2-assets.test.cjs`（Playwright、ポート `P2_ASSETS_PORT` 既定 8796）：

| テスト名 | 主な検査 |
|---|---|
| `library lists real assets by category` | 種データ：integrated モデル1（ファイルあり）・integrated モーション1（ファイルなし）・mmd VMD 1・mmd A の PMX 1・FBX motions 1（ファイルあり）。左「キャラクター」2、「モーション」3、「すべての素材」5。ファイルなしカードに「ファイルなし」。「夜の神社」が無い。 |
| `search and format filter work on real data` | 検索語で1件、形式「VMD」で1件、「ファイルがある素材だけ表示」で4件。 |
| `detail shows registration facts` | カード選択 → 右に ID・登録元・保存名（integrated）。URL に `asset=`。再読込で同じ選択。 |
| `import GLB and VRM` | `tests/fixtures/synthetic_test_model.glb` を GLB（モデル）で取り込み → 行「完了」、一時データ `integrated_v02/assets/<sha20>.glb` が存在、一覧に出て選択。同じ内容を `.vrm` 名で取り込み → 種類の選択が出ない、`user_assets.json` に kind=model。 |
| `import PMX ZIP checks server version first` | `tests/fixtures/minimal_pmx.zip`（§4）をスロット A。`/api/server-version` へのリクエストが `/api/pmx-zip-upload` より先。成功文言に `model_path`。`mmd_assets.json` の A に PMX。 |
| `VMD overwrite requires confirmation` | VMD を2回取り込み、2回目で確認ダイアログ → キャンセルで `/api/mmd-upload` へのリクエストが1回だけ。 |
| `FBX is validated before upload` | 中身がランダムな `bad.fbx` → 行「失敗：FBX として読み込めません…」、`/api/upload` へのリクエスト0回。 |
| `FBX model replacement warns` | 種データに FBX modelA あり。正しい FBX が用意できないため（§5 未検証）、`page.route('**/api/upload**')` は使わず、**確認ダイアログが出てキャンセルで送信されない**ことだけを検査（検証段階は FBXLoader の成功が前提なので、このテストでは `window.__P2_TEST_SKIP_FBX_PARSE = true` を `page.addInitScript` で設定し、`import.js` はこの値が true のときだけ解析を省く。本番では未定義）。 |
| `server rejection is shown` | `page.route('**/api/integrated-v02/upload**', r => r.fulfill({status:400, body:JSON.stringify({error:'GLB/VRM形式として認識できません'})}))` → 行にその文言。 |
| `mock-only controls explain themselves` | ハート・「コレクション」・場所タブ「クラウド」・「一括タグ付け」・タグ欄・「シーンで使う」で ◇ ダイアログ。 |

（`__P2_TEST_SKIP_FBX_PARSE` はテスト専用の分岐。O-③-1 で Opus レビューの対象とし、正しい最小 FBX 生成手段が見つかれば削除する。）

#### (h) ◇ 未実装のまま

サムネイル生成（MOTION-016）、素材の削除・名前変更（API なし）、タグ・お気に入り・コレクション・一括操作（NF-004）、クラウド（NF-013）、依存参照・ライセンス・作者の記録（REVIEW-010）、重複の検出表示（DATA-013。サーバーは GLB/VRM の同一内容を同じ保存名にするだけ）、ステージ・小物・音声・画像などの登録（API なし）、ドラッグ＆ドロップ取り込み（旧画面に無い）、PMX 個別ファイル登録（方針で廃止）。

---

### 2.4 ④ キャラクター・ステージ読込と3D表示（WP-04。章立ては同じ、未決は O-④）

#### (a) 移植する機能

| # | 機能 | 根拠 |
|---|---|---|
| ④-1 | GLB/VRM の 3D 表示（`/api/integrated-v02/asset/<file>`、GLTFLoader、高さ 2.0 正規化） | `index.html:186`、`camera_3d.js:278` |
| ④-2 | PMX の 3D 表示（`/api/mmd-file/<slot>/<name>`、MMDLoader、テクスチャは相対パス） | `index.html:282〜296` |
| ④-3 | FBX モデルの 3D 表示（`/api/file/<id>`、FBXLoader） | `index.html:211, 216` |
| ④-4 | 視点の回転・ズーム（OrbitControls） | `index.html:119` |
| ④-5 | ボーン一覧と分類（`classifyBone`） | `camera_3d.js:98`（`discoverBones`）、`camera_follow_config.js`（共有） |
| ④-6 | 素材一覧からモデルを開く | `index.html:706〜729`（`openAsset`） |
| ④-7 | 作業中のモデルを制作状態に記録（`workspace.asset`、GLB/VRM のみ） | `camera_3d.js:290〜292`（workspace の `asset`）、`project_state_bundle.py:36〜49` |
| ④-8 | ステージ読込 | 旧画面に無い（`LEGACY_UI_INVENTORY_JA.md` ③）→ ◇ |

#### (b) 移植先

SCR-12 キャラクター管理（`screens.js:352〜374`）：左「キャラクター」＝ `categoryOf === 'char'` の実素材（サンプル6件を置換）、中央＝three-host のビューポート、右タブ「ボーン」＝実ボーン一覧（④-5）、「モーフ」「物理」◇、「リターゲット」既存リンク。ツールの `現行画面でモデルを表示`（href）は残す（旧画面との比較用）。SCR-06 は ◇ のまま（ステージ）。SCR-08 詳細の［3D で表示］を結線。

#### (c) 使う既存 API・コード

`GET /api/integrated-v02/asset/<filename>`（未登録 404、ファイルなし 404、カタログ不可 503：`server.py:335〜348`）、`GET /api/mmd-file/<slot>/<name>`（`server.py:293〜307`）、`GET /api/file/<id>`（`server.py:350〜355`）、`GET /api/assets`。正規化はフォーク（下）。

`model-loader.js`（フォーク。各関数の先頭に元の行を記録）：
```js
export const TARGET_HEIGHT = { GLB: 2.0, VRM: 2.0, PMX: 1.8, FBX: 1.95 }; // index.html:186 / 290 / 211, camera_3d.js:278
export async function loadModel(item, THREE, loaders) {} // item は /api/assets の行。戻り {object, animations, format}
export function normalizeModel(object, format, THREE) {} // 戻り {scale, offset:[x,y,z]}。GLB/VRM：高さ→TARGET_HEIGHT、XZ 中心を原点、足を y=0（index.html:186 と同式）。PMX/FBX：高さ→TARGET_HEIGHT、足 y=0、XZ 中心を原点（旧画面の ±1.4 配置と向きの回転は2体並べ用なので単体表示では行わない：O-④-1）
```

#### (d) 新UIの動作

- 左で選択 → `?asset=<id>` → 中央で読込（読込中表示）→ 成功で HUD に「名前・形式・クリップ N 件・頂点数」、`emit('studio:model-loaded')`。失敗：404「元ファイルが見つかりません。素材を再登録してください。」（`index.html:707` の文言）、読込例外「3D 表示できませんでした：{message}」。`available === false` の素材は選べるが読込せず同じ文言。
- 右「ボーン」：`object.traverse` で `isBone` を集め、名前と `classifyBone(name)` の分類を表に（検索付き）。ボーンなしは「ボーンがありません（静的モデル）」。
- ［このモデルを制作に使う］（GLB/VRM のときだけ有効、`data-act="real"`）：`project` ストアの `bundle.workspace` を `{frame: workspace?.frame ?? 0, asset: item.filename, clip: null}` に設定し `dirty:true`（保存は②の［保存］）。PMX/FBX のときは無効で title「統合保存に記録できるのは GLB/VRM だけです（project_state_bundle.py の制限）」。
- ツール「選択」は ◇（オブジェクト選択は旧画面に無い）、「回転」は OrbitControls 有効（既定）。
- 画面を離れたら three-host を破棄（§1.7）。

#### (e) 置き換えるサンプル

SCR-12 左の6件、中央の `img:'viewport-character'`、右「ボーン」の固定8件（`screens.js:369`）、SCR-08 詳細の［3D で表示］◇。

#### (f) 受け入れ条件（案）

合成 GLB（§4）を登録 → SCR-12 で選ぶ → キャンバスの非背景ピクセル > 0、`baiStudio.viewport.getState()` が `{loaded:true, scale:≈1, offset:≈[0,0,0]}`（1e-9。合成モデルは高さ 2.0・中心 0 のため）、ボーン一覧に10本（`hips`〜`foot_r`）。PMX 最小 ZIP は O-④-2 が決まるまで「読込例外を正しく表示する」ことだけを検査。

#### (g) テスト（案）

`tests/studio-p2-viewport.test.cjs`（ポート 8795）：`glb renders and normalizes like the camera page`（上記）、`viewport is disposed on leave`（SCR-12→SCR-08 で `WEBGL_lose_context` が呼ばれたことを `page.evaluate` のスパイで確認）、`missing file shows re-register message`、`workspace asset is set only for GLB/VRM`。照合：`tests/studio-p2-normalize-parity.test.cjs` で同じ合成 GLB を `/camera.html` の［3Dモデルを表示］で読み、`camera_3d.js` 側のモデルの `scale`・`position`（`window` から辿れないため、`publishModelFraming` の `bai-camera-model-bounds` イベントの `min/max` を受ける）と新UIの包囲箱が 1e-6 で一致。

#### (h) ◇ 未実装のまま／未決

ステージ（SCR-06、NF-014/LYRIC-009）、モーフ（LIP-004）、物理（MOTION-021）、衣装（NF-005）、ウェイト編集（NF-023）、オブジェクト選択。
- **O-④-1**：PMX/FBX の単体表示の正規化（旧の 1.8/1.95 を維持するか 2.0 に統一するか）。既定：旧の値を維持（見え方を旧と比較できる）。
- **O-④-2**：PMX の自動テスト用最小モデル（`tools/make_test_pmx.py`。PMX 2.0 の最小構成：頂点3・面1・材質1・ボーン1）を作れるか。作れなければ PMX 表示は「未検証」と台帳に書く。
- **O-④-3**：A/B 2体の並び表示（`index.html:211, 290` の ±1.4 配置）は⑤の連結再生で必要になるため⑤で扱う。

---

### 2.5 ⑤ モーション（VMD）適用・タイムライン再生（WP-05。未決は O-⑤、着手前に Opus で本節を v2 に詳細化）

#### (a) 移植する機能（候補一覧。根拠付き）

| # | 機能 | 根拠 |
|---|---|---|
| ⑤-1 | GLB 内アニメーションの選択・再生・停止・シーク | `camera_3d.js:281〜282`（`setClip`・`updateTime`）、`index.html:193`（`integratedPreviewV02.play`） |
| ⑤-2 | PMX へ VMD を適用して再生（`MMDLoader.loadAnimation`＋`AnimationMixer`、IK・物理なし） | `index.html:320〜327, 336` |
| ⑤-3 | FBX モーション82パターン一覧・分類・絞り込み・再生可否（👑） | `index.html:60〜70`（表は 60行に埋め込み） |
| ⑤-4 | コンビネーション（追加・連結再生・停止・全消去）と履歴記録（②の `history` に積む） | `index.html:98〜113, 271〜282, 346〜357` |
| ⑤-5 | お気に入りコンビネーション（保存・一覧・開く・削除） | `index.html:109〜113`、`POST /api/favorites`（`server.py:941〜950`） |
| ⑤-6 | タイムライン編集（クリップ：開始・長さ・速度・補間、保存・読込・コンビネーションから取り込み・再生） | `index.html:768〜797`、`/api/timeline-editor`（`server.py:287〜288, 668〜686`） |
| ⑤-7 | ボーン対応表（FBX→モデル）の編集・保存 | `index.html:213〜215`（`/api/mapping`）、`/api/conversion-map`（`server.py:312〜315, 863〜872`） |
| ⑤-8 | 作業中のクリップ・フレームを制作状態へ（`workspace.clip`・`workspace.frame`） | `camera_3d.js:290〜292` |
| ⑤-9 | 外部同期コマンド（`play_chain`・`stop_chain`・`preview_motion`・`preview_vmd`・`integrated_preview`） | `index.html:415〜430` |

#### (b) 移植先（案）

SCR-13（主）：左「VMDライブラリ」＝ mmd VMD の実素材、中央＝④の three-host（モックの4分割表示は「1面＝実描画、他3面＝◇（REVIEW-001 の3視点比較は対象外）」）、右「ボーンマップ」＝⑤-7、下部タイムライン＝⑤-6 の実クリップ。SCR-05（初期構想）：左「モーション検索」＝⑤-3、右「再生」＝速度・ループ、コンビネーションは右に新タブ（モックに無いタブを足すことになる：O-⑤-3）。SCR-12：⑤-1 のクリップ選択。

#### (c)〜(g)

着手前に本節を詳細化する（Opus）。決めること：
- **O-⑤-1**：82パターン表（`index.html:60`）の扱い。既定：`studio/js/motion/patterns.js` へ写し（データのフォーク）、`tests/test_motion_patterns_parity.py` で `index.html:60` の配列と JSON として一致することを検査（旧画面は変えない）。
- **O-⑤-2**：FBX 連結再生の位置合わせ（`chainFrame`・`clipOffset`、`index.html:271〜281`）はインラインの計算。既定：`studio/js/motion/chain.js` へ関数単位でフォーク（DOM 参照の `msg.textContent` 等だけを戻り値に変える）。単体テストで旧の式と同じ結果。
- **O-⑤-3**：コンビネーション編集の置き場所（SCR-05 の右タブ追加はモックの変更）。既定：SCR-13 の下部タイムラインの上に「コンビネーション」トラックとして表示し、編集は右の新タブ「コンビネーション」（タブの追加は見た目の変更として所有者決定「モックが正本」に反するか、Opus レビューで判断）。
- **O-⑤-4**：旧画面の自動保存（コンビネーション 450ms、タイムライン 550ms：`index.html:353, 782`）を新UIで再現するか。既定：②と同じく明示保存。ただし `/api/timeline-editor` は If-Match を持たない（`server.py:668〜686`）ので、保存前に GET して `updatedAt` を比べ、変わっていたら確認する（クライアント側の簡易検知。Opus レビュー対象）。
- **O-⑤-5**：⑤-9 の外部コマンドのうちどれを新UIで受けるか（旧画面と新UIを同時に開くと両方が反応する）。
- テスト：連結再生のフレーム位置（合成 GLB のアニメーションで `hips` の z が期待値）、VMD 適用（O-④-2 の最小 PMX と `tools/make_test_vmd.py` の最小 VMD）、タイムライン保存の往復。

#### (h) ◇ 未実装のまま

表情レイヤー（LIP-009）、曲線編集（DATA-003）、3視点比較・同期比較（REVIEW-001 の範囲、旧画面リンク）、補正レイヤー `motion_layers.js`・足接地 QA・IK・AI 提案・v0.16.x のレビュー群（Q2）、MMD の IK・物理（旧画面にも無い）。

---

### 2.6 ⑥ カメラ（WP-06。Phase E の UI の土台。未決は O-⑥）

#### (a) 移植する機能

`camera.html` の全機能（`LEGACY_UI_INVENTORY_JA.md` ⑤の表）：キーフレーム編集・Undo/Redo・保存（`camera.js:187, 210, 226`）、再生・コマ送り・スクラブ、表示範囲、2D 構図プレビュー（`#preview`）、自由視点 3D と撮影カメラ 3D（`camera_3d.js`）、表示モデル・クリップ・追従ボーン・追従設定と区間キー化、カスタム撮影構図、CAM-015 ショット・シーケンス編集（`/api/camera/sequence/edit`）、フォーカス診断・範囲診断・DOF 近似プレビュー、構図診断、撮影リグ（ベータ）、MMD カメラ VMD の検査・読込・試験再生・書き出し（`/api/camera/vmd/*`）、統合状態の保存・復元（②に統合）。

#### (b) 移植先と方式（決定）

- **方式：フォーク＋要素ID互換ホスト＋常駐（keep-alive）**。
  1. `camera.js`・`camera_3d.js` を `studio/js/camera/camera-page.js`・`camera-3d.js` にコピー（R2）。最初のコミットでは**中身を変えない**（import 先 `./camera_follow_smoothing.js` 等を `/camera_follow_smoothing.js` に変えるだけ）。`camera_project_bundle_ui.js` はフォークしない（②の保存に統合。下記）。
  2. `studio/js/camera/camera-host.js` が、`camera.html` にある要素ID（`grep -o 'id="[^"]*"' camera.html` で 122 個。WP-06 で一覧を `studio/js/camera/legacy-ids.json` に生成し、テストで「フォークが参照する全ID ⊆ ホストが作るID」を検査）を、**新UIモックの SCR-02 のパネル構成の中に**配置した DOM を作る（左：ショット＝シーケンス一覧、中央：`#scene` と `#preview` のキャンバス、右タブ：カメラ／フォーカス／レール／補間、下部：`#track` を含むタイムライン）。見た目は `studio/styles/camera-host.css`（`.camera-host` 配下だけに効く。`camera.css` は読まない）。
  3. DOM を作った後で、`camera.html` と**同じ順番**で共有 UMD（`/camera_vmd_local.js`, `/camera_rig.js`, `/camera_framing.js`, `/camera_lens.js`, `/camera_dof.js`, `/camera_focus_tracking.js`, `/camera_focus_consistency.js`, `/camera_sequence_playback.js`）→ `camera-page.js`（classic script）→ `camera-3d.js`（module）を1回だけ読む。
  4. **常駐**：`camera-page.js` は即時実行関数で、読み込み時にイベントを結線するため作り直せない。ホストの根要素はページ内で1つだけ作り、SCR-02 を離れるときは `#main` から外して非表示の `#keepalive`（`studio/index.html` の `<body>` 直下に追加）へ移し、戻ったら `#main` へ戻して `window.dispatchEvent(new Event('resize'))` を送る。SCR-03/04/14/15/16 は⑥の時点では SCR-02 の該当タブ（`?tab=focus` 等）へのリンクとし、同じホストを2つ作らない。
- **②との統合**：保存は②の［保存］1つ。`project.js` の `saveProject()` は、ホストが読み込み済みなら `window` イベント `bai-camera-bundle-snapshot`（`camera.js:208`）でカメラ状態、`bai-camera-workspace-snapshot`（`camera_3d.js:290`）で workspace を集め、本文の `camera`・`workspace` に使う（`camera_project_bundle_ui.js:5〜6, 18` と同じ方法）。再読込時は `bai-camera-workspace-restore`・`bai-camera-bundle-restore`（`camera_3d.js:293`、`camera.js:209`）で反映（`camera_project_bundle_ui.js:19` と同じ順番）。`dirty` はホストの「未保存」状態と OR をとる（取り方は O-⑥-1）。
- **理由**：`camera.js` は 227 行に 94 個の要素IDを直接参照し、Phase E WP-00a〜17 がこの中身を改修する予定。いま書き直すと Phase E と二重の作業になる。フォークすれば Phase E の画面側変更は新UIにだけ入り、旧 `camera.html` は変わらない（R5）。共有 UMD への Phase E の変更（計算の修正・関数の追加）は旧画面にも入るが、旧画面は新しい関数を呼ばないので「旧画面への新機能追加」にはならない（バグ修正は R5 の例外）。

#### (c)〜(g)

- **O-⑥-1**：`camera-page.js` の未保存状態（内部変数 `dirty`、`camera.js:1, 7`）を外へ知らせる方法。既定：フォークに読み取り専用の `window` イベント `bai-camera-dirty-query` を1つ足す（DOM 境界の追加として許容するか Opus 判断）。
- **O-⑥-2**：カメラ画面単独の［保存］（`#save` → `POST /api/camera/project`、`camera.js:210`）を残すか。既定：残さない（②の統合保存に一本化し、`#save` 要素はホスト内に非表示で置く）。ただし Phase E の If-Match・revision 設計（Phase E §2.4）と整合させる必要があり、Opus レビュー必須。
- **O-⑥-3**：`camera-3d.js` の正規化を `normalizeModel()` に置き換えるか（§1.7）。
- **O-⑥-4**：要素IDの配置表（どのIDをモックのどのパネル・タブに置くか）。WP-06 の最初の成果物として作り、Opus で1回レビューしてから実装。これが Phase E §7 の「読み替え表」の元になる。
- テスト：`tests/studio-p2-camera.test.cjs`（ポート 8794）：旧 `camera.html` に対する既存の Playwright 相当の操作（キー追加→Undo→保存→再読込で復元、合成 GLB を両ビューに描画）が新UIのホストで同じ結果。`legacy-ids` の包含検査。常駐（SCR-02→08→02 でキーが残っている）。
- Phase E との接続：⑥完了で `PHASE_E_DETAILED_DESIGN_20261020_JA.md` §7 に読み替え表を追加し、高性能モデルで1回レビュー（Phase E §0 の条件）。

#### (h) ◇ 未実装のまま

Phase E の未完成機能すべて（CAM-001〜018 の未達部分。Phase E 側で実装）、SCR-03/04/14/15/16 の独立画面化（⑥ではリンク）、WebMCP `camera_page`（Phase E WP-02c）。

---

### 2.7 ⑦ 書き出し（WP-07。未決は O-⑦）

#### (a) 移植する機能

| # | 機能 | 根拠 |
|---|---|---|
| ⑦-1 | FBX 連結→VMD 変換ジョブの作成（ボーン対応 JSON 必須） | `index.html:398`（`#vmd-job`）、`POST /api/export-vmd-job`（`server.py:873〜894`） |
| ⑦-2 | Blender での変換実行と状態の取得 | `POST /api/run-vmd-conversion`（`server.py:723〜761`、`confirm:true` 必須、Blender が無ければ 503）、`GET /api/conversion-status`（`server.py:308〜309`） |
| ⑦-3 | カメラ VMD 書き出し | ⑥のホスト内（`camera.js:76`、`/api/camera/vmd/native/export`） |
| ⑦-4 | 診断 ZIP | `GET /api/diagnostics/export`（既に SCR-20/24 にリンク、実機能） |

#### (b) 移植先

SCR-23 中央カード「エクスポート」（`screens.js:607` のパネル）に⑦-1/⑦-2。SCR-13 ツール「VMDを書き出す」（◇、`screens.js:390`）を SCR-23 への遷移に変更。SCR-17・SCR-07（動画レンダリング）は ◇ のまま（Phase F）。

#### (c)〜(g)

- **O-⑦-1**：⑦-1 はコンビネーション（⑤）とボーン対応（⑤-7）に依存。⑤の完了後に詳細化。
- **O-⑦-2**：Blender 実行は 240 秒かかり得る（`server.py:745`）。新UIでの待ち方（`/api/conversion-status` の 1 秒ごとの取得、画面を離れても続行）を決める。偽の進捗は出さない（「実行中（経過 N 秒）」のみ）。
- **O-⑦-3**：書き出し先は `exports/`（`data_dir()` の外、Phase E §2.9 の「対象外の書出し先」）。テストでは Blender を呼ばず、503 の表示だけを検査（Blender 実行は開発環境で未検証）。

#### (h) ◇ 未実装のまま

動画・画像レンダリング（Phase F）、出力プリセット・キュー・AOV（RENDER-*、NF-018）、素材単体の書き出し（NF-010）、ポータブル ZIP（DATA-012）。

---

## 3. 作業パッケージ（P2-WP）と順番

| WP | 内容 | 依存 | 規模 | モデル | 完了ゲート（すべて満たす） |
|---|---|---|---|---|---|
| **P2-WP-00a** | テスト基盤とデータ隔離：`bai_paths.py`・`conftest.py`・`tests/test_data_isolation.py`（Phase E §2.9 の仕様どおり。Phase E WP-03 の前倒し）、`tests/helpers/studio-harness.cjs`（§4）、devDependencies に `"three": "0.160.1"`、`tools/make_test_glb.py`（Phase E §2.9 の合成モデル仕様）、`tools/make_test_vmd.py`、`tools/make_test_pmx_zip.py`、既存 `tests/studio-ui.test.cjs` をハーネスへ移行 | なし | M | Sonnet 実装 → **Opus レビュー**（全保存先の切替＝データ破損リスク） | pytest 全件・node 全件合格、実 `data/` と `exports/` のハッシュがテスト前後で一致、`PHASE_E_IMPLEMENTATION_STATUS.json` notes に前倒しを記録 |
| **P2-WP-00b** | B-1 修正（`server.py:316〜320` 削除）と `tests/test_project_envelope.py`、`test_legacy_project_client_revision.py` の該当検査の置換 | 00a | S | Sonnet | 新テスト合格、旧画面の `project-save` が `tests/legacy-ui-layout.test.cjs` の環境で 200 を返す（Playwright で1件追加：クリック後 `#project-info` が「保存済み」を含む） |
| **P2-WP-00c** | 新UI基盤：`api.js`・`store.js`・`bus.js`・`state-box.js`・`legacy.js`・`features/index.js`・`legacy-globals.d.ts`・`features.css`、`app.js` の `feature` 部品・後始末・`data-act="real"`、`studio/index.html` の importmap・`#project-chip`・`#keepalive`、`screens.js` の `evidence`・`PH.P2` 文言、`tests/test_screen_status_honesty.py`、`gen_screen_matrix.mjs` の更新、`STUDIO_DESIGN_SYSTEM_JA.md` の契約文言、`docs/roadmap/P2_PORT_STATUS.json` 新設 | 00a | M | Sonnet 実装 → **Opus レビュー**（全画面の土台） | 型検査合格、`studio-ui.test.cjs` 全件合格（見た目・動作の回帰なし）、`api.js` の単体テスト（`tests/studio-p2-api.test.mjs`：エラーコードの割当を `fetch` の差し替えで検査） |
| **P2-WP-01** | ② プロジェクト（§2.2） | 00b, 00c | M | Sonnet 実装 → **Opus レビュー**（上書き・競合） | §2.2(f) 全項目、§2.2(g) 全テスト合格、マトリクス再生成 |
| **P2-WP-02** | ③ 素材一覧（§2.3 の一覧・分類・詳細・キュー表示枠） | 00c | S〜M | Sonnet | §2.3(f) 1・5、`studio-p2-import-rules`（分類部分）と `studio-p2-assets` の一覧系3件合格 |
| **P2-WP-03** | ③ 取り込み（§2.3 の取り込み規則・ダイアログ・送信・確認） | 02 | M | Sonnet 実装 → **Opus レビュー**（置き換え・上書きの確認、O-③-1） | §2.3(f) 2〜4、取り込み系テスト全件合格 |
| **P2-WP-04** | ④ 3D 表示（§2.4） | 03（素材登録が必要）、O-④-1〜3 の決定 | L | O-④ を Opus で決定 → Sonnet 実装 | §2.4(f)、viewport・照合テスト合格、GPU 未検証を台帳に記録 |
| **P2-WP-05** | ⑤ モーション適用・タイムライン（§2.5） | 04、§2.5 の v2 詳細化 | L | **Opus で §2.5 を詳細化**（批評1回）→ Sonnet 実装 → Opus レビュー | v2 の受け入れ条件 |
| **P2-WP-06** | ⑥ カメラ（§2.6） | 01・04・05（workspace の clip・frame）、O-⑥-4 の配置表 | L | **Opus で配置表と O-⑥ を決定**→ Sonnet 実装 → Opus レビュー → Phase E §7 読み替え表（Opus） | §2.6 のテスト、旧 `camera.html` と同じ操作結果、Phase E §7 の表のレビュー完了 |
| **P2-WP-07** | ⑦ 書き出し（§2.7） | 05 | M | O-⑦ を Opus で決定 → Sonnet | §2.7 の受け入れ条件（Blender 実行は未検証として記録） |
| **P2-WP-99** | 締め：マトリクス・監査文書（`STUDIO_UI_AUDIT_JA.md` の件数表）・台帳・旧画面との比較（`tools/legacy_ui_inventory.mjs` を新UIにも走らせる版は作らない。手順書にテスト一覧を書く） | 07 | S | Sonnet（文書） | 未検証一覧（§5.2）を台帳に転記 |

共通の完了ゲート（各 WP）：`npm run typecheck`、`python -m pytest -q`（全件）、`node --test`（既存 `tests/*.cjs`・`test_camera_*.cjs/mjs` と新規）、`npm run test:studio`、実 `data/` ハッシュ不変、`node tools/gen_screen_matrix.mjs` の再生成差分をコミットに含める、`P2_PORT_STATUS.json` の該当 WP を更新（`state`・`commits`・`tests`・`unverified`）。作業報告にモデル区分を1行で記録（AGENTS.md）。

`docs/roadmap/P2_PORT_STATUS.json` の形（WP-00c で作成）：
```json
{
  "schema": "bai.p2_port_status.v1",
  "design": "docs/roadmap/P2_PORT_DETAILED_DESIGN_20261020_JA.md",
  "baseline_commit": "f473eeb",
  "work_packages": [
    {"id": "P2-WP-00a", "step": "基盤", "state": "not_started", "commits": [], "tests": [], "unverified": [], "notes": ""}
  ]
}
```
`state` は `not_started`／`in_progress`／`implemented`（コードあり・テスト一部）／`verified`（本書のテストが全件合格）。`verified` でも GPU・実データは `unverified` に残す。

---

## 4. テスト基盤

### 4.1 共通ハーネス `tests/helpers/studio-harness.cjs`（WP-00a）

```js
// 返り値: { base, dataDir, stop(), launchBrowser(), newPage(browser, opts), realDataHash() }
async function startServer({ port, seed = {} }) {}
```
- **データ隔離**：`fs.mkdtempSync(os.tmpdir() + '/bai-p2-')` を作り、`integrated_v02/catalog.json` に `{"models":[],"motions":[]}` を置き、`seed`（相対パス→内容の辞書。バイナリは Buffer）を書く。`python server.py <port>` を `env: { ...process.env, BAI_DATA_DIR: dataDir }` で起動し、`/api/server-version` が 200 になるまで待つ（最大 12 秒）。`stop()` でサーバーを止め、一時ディレクトリを削除（環境変数 `KEEP_TEST_DATA=1` なら残してパスを表示）。
- **前提**：`bai_paths.py`（Phase E §2.9）が `server.py` の `DATA`・`RETARGET_FILE`・`AI_CONFIG`、`diagnostic_logging.py` の `LOG_DIR`、`qa_capture.py` の `ROOT` を `data_dir()` から作ること。これが無いとアップロードが実 `data/` に書かれるため、**③以降の書き込みテストは WP-00a の完了まで作らない**。
- **実データ保護**：`realDataHash()` はリポジトリの `data/` 全体（`logs/` を含む）と `exports/` の相対パス＋内容の sha256。各テストファイルの `before`/`after` で一致を確認（Phase E §2.9 と同じ）。
- **three**：`node_modules/three`（devDependency `three@0.160.1`、`npm ci` で入る）。環境変数 `THREE_DIR` で上書き可（`tools/legacy_ui_inventory.mjs:11` と同じ）。`context.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.1\/(.*)/, …)` でローカルのファイルを返す（`tools/legacy_ui_inventory.mjs:19〜25` の方式を写す）。`THREE_DIR` が無いとき、3D を使うテストは `skip`（理由「three.js がローカルにありません（npm ci）」）し、未検証として記録。
- **Chromium**：`executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? そのパス : undefined)`、`args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']`（`tools/legacy_ui_inventory.mjs:83` と同じ）。3D テストは `WEBGL_debug_renderer_info` の文字列を結果に出し、SwiftShader／llvmpipe なら「GPU 未検証」。
- **ポート**：`studio-ui` 8799（既存）、`camera-ui` 8798（Phase E）、`studio-p2-project` 8797、`studio-p2-assets` 8796、`studio-p2-viewport` 8795、`studio-p2-camera` 8794、`studio-p2-motion` 8793、`studio-p2-export` 8792。環境変数で上書き可。ファイルごとに別サーバー（並列実行で衝突しない）。
- **エラー監視**：`pageerror` とコンソールの `error` を集め、各テストの最後に空であることを確認（既存 `studio-ui.test.cjs:36〜37` と同じ）。意図的に 404/400 を起こすテストは、その URL を許可リストに入れる。

### 4.2 テスト用ファイル（`tests/fixtures/`、生成スクリプトで作り、コミットする。原本素材ではない）

| ファイル | 生成 | 中身 |
|---|---|---|
| `synthetic_test_model.glb` ＋ `.expected.json` | `tools/make_test_glb.py`（標準ライブラリのみ） | Phase E §2.9 の合成モデル（直方体・ボーン10本・アニメ30F）。 |
| `minimal.vmd` | `tools/make_test_vmd.py` | `Vocaloid Motion Data 0002` ヘッダー＋モデル名20バイト＋ボーンキー1件（`センター` 0F）＋他の件数0。 |
| `minimal_pmx.zip` | `tools/make_test_pmx_zip.py` | `model/test.pmx`（O-④-2 の最小 PMX。作れるまでは `PMX ` で始まるダミーで、③の登録テストだけに使う）＋ `model/tex/a.png`（1×1）。 |
| `bad.fbx` | テスト内で生成 | ランダム 256 バイト。 |

### 4.3 実行コマンド（`package.json` に追加）

```
"test:p2": "node --test tests/studio-p2-*.test.cjs tests/studio-p2-*.test.mjs",
"test:p2-py": "python -m pytest -q tests/test_project_envelope.py tests/test_screen_status_honesty.py tests/test_data_isolation.py"
```
`npm run test:studio` は既存のまま（ハーネス移行後も同じ名前）。

---

## 5. リスク・未検証・所有者への確認

### 5.1 リスク

| # | リスク | 対策 |
|---|---|---|
| K1 | データ隔離の漏れでテストが実 `data/` を書き換える | WP-00a を Opus レビュー。全テストで前後ハッシュ比較。書き込みテストは WP-00a 完了後。 |
| K2 | 新UIと旧画面を同時に開いて両方で保存 | 統合バンドルの If-Match（409）で検知。旧コンビネーション保存は B-1 修正後 If-Match 付き。旧画面の外部同期は確認なしで上書きする（`index.html:356`）既存の動作で、P2 では変えない（旧画面の新機能追加になるため）。新UIのヘルプ（SCR-25 FAQ）に「新旧の画面を同時に編集しないでください」と1行追加。 |
| K3 | three.js を CDN から読むため、インターネットが無いと 3D が動かない | 旧画面と同じ制約。状態表示で理由を出す。ローカル配信化は本書の範囲外（未承認）。 |
| K4 | ⑥ の常駐方式で、非表示中のキャンバス大きさ 0 による描画不具合 | 戻ったときに `resize` を送る。⑥のテストで往復を検査。 |
| K5 | フォーク（⑤⑥）と旧コードの乖離 | 先頭コメントに元の行と基準コミット。Phase E の変更はフォーク側だけ。共有 UMD はどちらからも同じファイル。 |
| K6 | `__P2_TEST_SKIP_FBX_PARSE` のようなテスト専用分岐が本番に残る | O-③-1 で Opus 判断。値が `true` のときだけ有効で、本番コードは設定しない。`tests/test_screen_status_honesty.py` と同じ要領で、`studio/js` 内の出現箇所が `import.js` の1か所だけであることを検査。 |
| K7 | 素材の「上書き」系 API（VMD 同名・PMX スロット・FBX モデル枠）は確認なしで上書きする | 新UIで事前確認（§2.3）。サーバーは変えない（R1）。 |

### 5.2 未検証事項（実装後もこのままなら台帳 `unverified` に記録）

- 実 GPU での描画（SwiftShader のみ）。
- 実モデル・実モーション（VRM・PMX・FBX・VMD の実ファイル）。合成ファイルでの検証のみ。正しい最小 FBX を作る手段が未確定（O-③-1）なので、FBX の正常登録・3D 表示は未検証になる見込み。
- Blender による VMD 変換（⑦）。
- Windows での動作（開発環境は Linux）。
- 外部 AI・MCP クライアントからの同時操作（②の外部同期は HTTP で模擬するのみ）。
- 1180px・820px・390px 以外の画面幅。

### 5.3 判断として決めたこと（確認不要・異論があれば指摘）

- 素材一覧の並び替え・グリッド/リスト・大きさは、モックで既に動いている**表示だけの機能**として実データに適用する（データを変えない）。
- 新UIは明示保存のみ（旧画面の自動保存は再現しない。DATA-010 は ◇）。
- 外部変更は未保存の変更を上書きしない（旧画面より安全側）。
- 「最近の素材」は、このページで取り込んだものだけを表示する（登録日時が API に無いため）。

### 5.4 所有者への確認（既定で進める）

- **Q1 新規プロジェクト作成**：現在のサーバーは制作状態を1つだけ持ち（`data/project_state.json` と `data/camera_project.json`）、旧画面にも「新規作成」は無い。新規作成を「現在の制作状態を空に戻す」として作ると、取り消しのできない上書きになる（バックアップ機能が無い）。**既定：P2 では新規作成を ◇ 未実装のまま残し、保存・読込・履歴だけを移植する。** 「空に戻す（確認入力つき）」を P2 に含める場合は指示してください（WP-01 に小さな追加で入ります）。
- **Q2 7段階に入らない旧画面の機能**：骨格解析・リターゲット検証（v0.15〜0.16 系）、補正レイヤー、足接地 QA、IK・AI 提案、診断タブは、②〜⑦のどれにも当たらない。**既定：P2 の対象外とし、新UIからは旧画面へのリンク（既存・部分）のまま残す。移植の時期は、予定されているロードマップ全体の作り直しで決める。**

---

## 付録A 本書で使う既存 API 一覧（P2 で新UIから呼ぶもの）

| API | メソッド | 使うステップ | 根拠（server.py） |
|---|---|---|---|
| `/api/project/bundle` | GET / POST(If-Match 必須) | ②⑥ | 168〜173 / 359〜376 |
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
| `/api/favorites` | GET / POST | ⑤ | 326〜329 / 941〜950 |
| `/api/timeline-editor` | GET / POST | ⑤ | 287〜288 / 668〜686 |
| `/api/mapping`, `/api/manifest`, `/api/conversion-map` | POST / GET / GET・POST | ⑤⑦ | 951〜955 / 349 / 312〜315・863〜872 |
| `/api/camera/*` | 各種 | ⑥ | 174〜200, 377〜438 |
| `/api/export-vmd-job`, `/api/run-vmd-conversion`, `/api/conversion-status` | POST / POST / GET | ⑦ | 873〜894 / 723〜761 / 308〜309 |
| `/api/diagnostics/export` | GET | ⑦（既存リンク） | 216〜218 |

## 付録B 変更しない既存ファイル（R5 の確認用）

`index.html`、`camera.html`、`camera.css`、`camera.js`、`camera_3d.js`、`camera_project_bundle_ui.js`、`webmcp.js`、旧画面専用の `*_ui.js`・`v016*.js`。例外：B-1（`server.py`）。共有 UMD（`camera_rig.js` 等）は P2 では変更しない（Phase E で変更される）。
