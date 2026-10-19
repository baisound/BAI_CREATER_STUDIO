# Phase E 詳細設計（CAM-001〜018・横断要件）v1 — 2026-10-20 【レビュー中の草案：批評3回＋最終判定の前。実装に使わない】

- 位置付け：承認済み Phase E の**残作業を実装可能な粒度まで落とした詳細設計**。新機能の追加ではない。
- 正本の優先順位：`AGENTS.md`（スコープ凍結）＞ オーナー決定文書（`BAI_CAMERA_INTERACTION_DESIGN_V1_JA.md`、`PHASE_E_CAM005_FOCUS_CONSISTENCY_CONTRACT_JA.md`、`BAI_CAMERA_FOCUS_DOF_TEST_MODE_DESIGN_V1_JA.md`、`PHASE_E_PROJECT_STATE_ROUNDTRIP_DESIGN_JA.md`、`MASTER_MULTICAMERA_SEQUENCER_DESIGN_V1_JA.md`）＞ 本書。**本書が上位文書と矛盾したら上位文書が正しい**。矛盾を見つけたら実装を止めて本書を直す。
- 基準コード：`recovery/phase-e-20261019`（`28af8c3`）。根拠は 2026-10-20 のコード証拠調査（ファイル：行は当時のもの）。
- 対象読者：実装担当（標準モデル想定）。各作業パッケージ（WP）は「何を・どのファイルに・どの関数名で・どのテストで」まで決めてある。**本書に書いていない仕様を独自に足さない。** 迷ったら §9 の「判断に迷ったとき」に従う。

---

## 0. 全体方針（全WP共通の約束）

| # | 約束 | 理由 |
|---|---|---|
| P1 | 計算の正本は1か所。カメラの補間・光学計算は **JS共通コア `camera_core.js`** と **Python `bai_camera.py` 系** の2実装を持つが、同じ**照合用テストデータ（fixture）**で一致を自動検証する。 | 現状 JS は3モードのみ、Python は15モード対応で食い違う（証拠：`camera.js:2`、`bai_camera.py:59-75`）。 |
| P2 | 保存データは **schema 1 のまま、任意フィールドの追加のみ**。既存フィールドの意味は変えない。旧データは読み込み時に既定値で補う。 | 互換性。旧 `pan`＝左右平行移動の意味も保持（操作設計 §3）。 |
| P3 | 編集は**プレビュー → 確定**の2段階。プレビューは保存データを変えない。確定は1操作＝1 Undo。外部（API/MCP）からの書き込みは `If-Match`（revision）必須。 | 操作設計 §5・§8。 |
| P4 | UI・HTTP API・WebMCP・標準MCP は**同じ Python サービス関数**を呼ぶ（UIは HTTP 経由）。WebMCP は HTTP を呼ぶ薄い層。 | 4経路の結果一致を構造で保証する。 |
| P5 | 「できない」「未読込」「判定不能」は**成功扱いしない**。数値が出せない時は `null` と理由コードを返す。 | CAM-005 契約・正直な表示。 |
| P6 | 構図の良し悪しを**自動で NG にしない**。出すのは事実（見切れ・衝突・距離）と任意の補助線だけ。 | 残件監査 CAM-004/017。 |
| P7 | 実GPU・実MMDでの確認は開発環境では**未検証**と記録する。自動テストの合格を完成と呼ばない。完成判定は §8 のゲート。 | AGENTS.md 規則6・7。 |
| P8 | 1 WP ＝ 1〜数コミット。各コミットで `PHASE_E_IMPLEMENTATION_STATUS.json` の該当IDの `implementation_assessment` を更新し、テスト結果を書く。 | AGENTS.md 規則6。 |

### 0.1 用語（本書内の固定訳）
- **キー**：`keys[]` の1要素。**区間**：あるキーから次のキーまで（左キーの補間設定を使う）。
- **ショット**：`sequence[]` の1要素（CAM-015）。**プリセット**：`custom_presets[]` の1要素。
- **ネイティブトラック**：カメラVMDを読み込んだ中間形式（`camera_vmd_codec.decode_camera_track` の戻り値）。
- **プロジェクトキー**：`camera_project.json` の `keys[]`（BAI独自形式、`target`＋`position`＋縦FOV）。

---

## 1. 現状の事実と、先に直すべき不整合（G-xx）

コードはあるが「つながっていない／食い違う」箇所。**WP-00 で最初にまとめて直す**（他WPの土台）。

| ID | 不整合 | 証拠 | 影響 |
|---|---|---|---|
| G-01 | JS `sample()` は linear/smooth/hold のみ。Python は15モード＋custom＋fStop。 | `camera.js:2`、`bai_camera.py:59-75` | API・MCPで入れたキーがプレビューと違う動きになる |
| G-02 | `camera_easing.js`・`camera_cinematic.js`・`camera_vmd_preview.js` が `camera.html` 未読込・`server.py` 静的配信リスト外 | `server.py:166`、`camera.html` script列 | 実装済みの計算が画面から使えない |
| G-03 | `writeKey` がキーを丸ごと置換し、`customCurve`・`fStop`（将来の追加フィールドも）を消す | `camera.js:11` | 再キーでデータ消失 |
| G-04 | 統合保存（bundle）が `bai-camera-before-save` を発火せず、最新の追従設定が入らない可能性 | `camera.js:208`、`camera_project_bundle_ui.js:6`、`camera_3d.js:90-96` | 保存→復元で追従設定が古い |
| G-05 | MCP `bai_camera_set` のスキーマが schema/fps/duration/keys のみ（`additionalProperties:false`）。MCP経由の保存で sequence/rig/presets 等が**消える** | `mcp_server.py:146,150`、`webmcp.js:5,11` | MCP保存でデータ消失 |
| G-06 | `bai_camera.read` が検証失敗時に**黙って既定値を返す**。その後の保存で元ファイルが既定値で上書きされうる | `bai_camera.py` `read()` | データ消失（重大） |
| G-07 | フォーカス距離の定義が JS（光軸方向深度）と Python（3Dユークリッド距離）で違う | `camera_focus_consistency.js:23`、`camera_focus.py:24` | 単一診断と区間診断が不一致（契約違反） |
| G-08 | F値の許容範囲が3通り（UI 0.7–32、Python診断 0.5–64、保存 0.7–64） | `camera.html`、`camera_focus.py`、`bai_camera.py:28` | 入力できるのに保存できない等 |
| G-09 | `easingPresets` 上限：設計書100件、実装64件 | `KEY_INTERVAL_EASING_AND_LENS_20261018_JA.md`、`bai_camera.py:36` | 仕様不一致 |
| G-10 | `camera_vmd.py`（旧）と `camera_vmd_codec.py` で補間値範囲が違う（0–127 / 0–255）。旧は server 未使用 | 各ファイル | 混乱。旧は削除せず「非推奨」と明記 |
| G-11 | `test_camera_lens.js`・`test_camera_lens_shots.js` が存在しない関数を呼び失敗（孤立した古いテスト） | 調査ログ | テスト結果の信用を下げる |
| G-12 | `POST /api/camera/project` は `If-Match` 任意。bundle は必須 | `server.py:433`、`server.py:359-376` | 古い画面からの上書き |

**G-xx の決定事項**
- G-06：検証失敗時は既定値を返さず、**読み込みエラー（HTTP 409 相当の `camera_project_invalid`）を返し、元ファイルを `data/camera_project.json.invalid-<UTC時刻>` に退避コピー**してから、画面に「保存データを読めませんでした（退避先）」を表示する。自動で既定値保存はしない。
- G-07：**Python を光軸方向深度に合わせる**（契約が「光軸方向深度」を正本と明記）。
- G-08：保存・API の許容範囲を **0.7–64** に統一。UI の数値入力も 0.7–64。DOFプレビューは 0.7–32 にクランプし、クランプ時は「プレビューはF32までの近似」と表示（値自体は保存値のまま）。Python 診断も 0.7–64。
- G-09：**64件のまま**（実装・テスト済みの値を正とし、設計書側を64に訂正する）。
- G-11：古い2ファイルは中身が `test_camera_lens.cjs` に移行済みのため**削除せず `tests/legacy/` へ移動し、テスト実行対象から外す**（履歴保持）。
- G-12：`POST /api/camera/project` も `If-Match` を**必須**にする。ただし旧画面互換のため、`If-Match` なしは 428 を返し、`camera.js` 側は保存前に `GET ?envelope=1` で revision を取得してから送る（bundle と同じ方式）。

---

## 2. 横断設計

### 2.1 JS 共通コア `camera_core.js`（WP-00）
- 形式：既存と同じ UMD（`camera_cinematic.js` と同じ書き方。ブラウザでは `window.BAICameraCore`、Node では `module.exports`）。
- 中身（純関数のみ。DOM・Three.js 参照禁止）：
  - `ease(mode, t, customCurve)`：`camera_easing.js` の実装を取り込む（`camera_easing.js` は `BAICameraCore.ease` を呼ぶ薄い互換ラッパーに変更）。
  - `sampleKeys(keys, frame, opts)`：Python `bai_camera.sample` と同じ規則。`hold` は右キーのフレームでも左キー値。範囲外は端のキー値。補間対象：`position`・`target`・`fov`・`fStop`（片側のみなら既定 4.0）・`roll`（§3 CAM-006）・`focusDistance`（§3 CAM-005）。トラック別補間（§3 CAM-003）を適用。
  - `mergeKey(existing, edit)`：**既存キーのフィールドを保ったまま** `edit` の項目だけ上書き（G-03 の修正）。
  - `focalToVerticalFov(mm, sensorH=24)`、`verticalFovToFocal(deg, sensorH=24)`：`camera_lens.js` から移す（`camera_lens.js` は互換ラッパー）。
  - `opticalDepth(cameraPos, cameraTarget, point)`：光軸方向深度（m）。カメラ背後は負値。
  - `thinLens({focalMm, fNumber, focusM, cocMm})`：近点・遠点・過焦点距離（フォーカス設計 §4 の式）。
- `camera.js` の `sample()` は `BAICameraCore.sampleKeys` を呼ぶだけにする。
- `server.py` 静的配信に `camera_core.js`・`camera_easing.js`・`camera_cinematic.js` を追加。`camera.html` に `camera_core.js` を **`camera.js` より前**に読み込む。

### 2.2 照合テスト（Parity fixture）（WP-00）
- `tests/fixtures/camera_parity.json`：入力（keys・frame・期待値）を 40 件以上。15 モード×代表 t、custom、hold 境界、fStop 片側、roll、範囲外フレーム、トラック別補間。
- Python：`tests/test_camera_parity.py` が fixture を `bai_camera.sample` で評価し、許容誤差 1e-9 で一致。
- Node：`tests/test_camera_parity.cjs` が同じ fixture を `camera_core.sampleKeys` で評価。
- **期待値は Python で生成した値をコミット**し、以後は両方がそれに一致すること（生成スクリプト `tools/gen_camera_parity.py`）。

### 2.3 保存データの追加フィールド一覧（schema 1 のまま・すべて任意）
`bai_camera.validate` が受け付け、未指定なら出力にも出さない（旧データと同じ形で保存される）。

| 場所 | フィールド | 型・範囲 | 既定 | WP |
|---|---|---|---|---|
| keys[] | `roll` | 数値 −180〜180（度、光軸周り、右回り正） | 0 | CAM-006 |
| keys[] | `focusDistance` | 数値 0.05〜10000（m） | なし（なければ追従/手動値） | CAM-005 |
| keys[] | `trackInterpolation` | `{position?, target?, fov?, roll?, fStop?, focusDistance?}` 各値は補間モード名。`custom` の場合は同名の `trackCustomCurve` 必須 | なし（`interpolation` を使う） | CAM-003 |
| keys[] | `trackCustomCurve` | `{トラック名: [x1,y1,x2,y2]}` | なし | CAM-003 |
| custom_presets[] | `tags` | 文字列配列（各1〜24文字、最大16個、重複不可、前後空白除去） | `[]` | CAM-014 |
| custom_presets[] | `favorite` | bool | false | CAM-014 |
| custom_presets[] | `category` | 文字列（`CAM-013` のカテゴリID または `custom`） | `custom` | CAM-013/014 |
| custom_presets[] | `lens` | `{focalMm?: 8–300, fStop?: 0.7–64, focusDistance?: 0.05–10000}` | なし | CAM-014 |
| custom_presets[] | `pose.roll` | −180〜180 | 0 | CAM-006 |
| custom_presets[] | `createdAt`/`updatedAt` | ISO 8601 UTC 文字列 | 保存時にサーバーが付与 | CAM-014 |
| （トップ） | `preset_history` | `[{name, usedAt}]` 最大20件（新しい順） | `[]` | CAM-014 |
| sequence[] | `inherit` | bool：開始姿勢を直前ショットの最終姿勢から継承（CAM-015） | false | CAM-015 |
| sequence[] | `source` | `{kind:'preset', name}` または `{kind:'keys', from, to}` | 旧形式 `preset` を `{kind:'preset'}` とみなす | CAM-015 |
| （トップ） | `vmd_clips` | §3 CAM-001 のクリップ参照一覧（本体は別ファイル） | `[]` | CAM-001 |
| （トップ） | `collision` | `{enabled:bool, minDistance:0.05–5, colliders:[AABB]}` | 無効 | CAM-017 |

- 上限：`custom_presets` 64、`sequence` 256、`keys` 5000、`vmd_clips` 128（既存の上限は変えない）。
- `validate` は**未知のトップレベルキーをエラー**にする（現状は黙って捨てる）。ただし旧データ移行のため、`schema`, `fps`, `duration`, `keys`, 上表、既存（`easingPresets` `custom_presets` `sequence` `rig` `focus_tracking` `bone_follow`）以外が来たら `unknown camera field: <名前>` を返す。bundle 側の方針（未知フィールドはエラー）と揃える。

### 2.4 サービス層・API・MCP の対応表（WP-01）
新規 `camera_service.py` に「読み込み→検証→変更→保存」を集約し、`server.py` と `mcp_server.py` はそれを呼ぶだけにする。

| サービス関数 | HTTP | 標準MCP / WebMCP ツール名 | 書き込み |
|---|---|---|---|
| `get_project()` | `GET /api/camera/project?envelope=1` | `bai_camera_get` | — |
| `set_project(payload, if_match)` | `POST /api/camera/project` | `bai_camera_set`（**全フィールド対応に拡張**、G-05） | ○ |
| `sample(frame)` | `GET /api/camera/sample` | `bai_camera_sample` | — |
| `move(op, amount, frame, if_match, commit)` | `POST /api/camera/move` **新規** | `bai_camera_move` **新規** | commit時 |
| `apply_preset(name, frame, if_match)` | `POST /api/camera/preset/apply` **新規** | `bai_camera_preset_apply` | ○ |
| `manage_preset(action, preset, if_match)` | `POST /api/camera/preset` **新規**（add/update/delete/duplicate/favorite/tag） | `bai_camera_preset_manage` | ○ |
| `search_presets(query, tags, favorite)` | `GET /api/camera/preset/search` **新規** | `bai_camera_preset_search` | — |
| `generate_shot(spec, preview)` | `POST /api/camera/shot` **新規**（CAM-012/013/007/009/010 の生成） | `bai_camera_shot_generate` | preview=false 時 |
| `sequence_edit(...)` / `sequence_evaluate(...)` | 既存 | 既存 | 既存 |
| `focus_evaluate(frame|range)` | 既存 `GET /api/camera/focus` | `bai_camera_focus_evaluate` **新規** | — |
| `similarity(items)` | `POST /api/camera/similarity` **新規** | `bai_camera_similarity` | — |
| `collision_check(range)` | `POST /api/camera/collision` **新規** | `bai_camera_collision_check` | — |
| `director_propose(range, rules)` | `POST /api/camera/director/propose` **新規** | `bai_camera_director_propose` | — |
| `vmd_split/register` | `POST /api/camera/vmd/clip` **新規** | `bai_camera_vmd_clip` | ○ |
| `vmd_export_project(range)` | `POST /api/camera/vmd/export-project` **新規** | `bai_camera_vmd_export` | 出力のみ |

- 書き込み系はすべて `if_match`（revision 文字列）必須。不一致は 409 `revision_conflict`、なしは 428。
- 戻り値は `{ok:true, revision, result}` / `{ok:false, error:{code, message}}` に統一。`code` は英小文字スネーク（例：`model_not_loaded`、`bone_missing`、`revision_conflict`、`invalid_range`）。
- **ブラウザ内の3Dモデル情報（ボーン座標・境界箱）が必要な計算**（CAM-011/017/018・フォーカス追従）は、サーバー単独では評価できない。これらは「ブラウザが評価済みの数値列を送る」方式にする：`samples: [{frame, points:{name:[x,y,z]}, bbox:[min,max]}]`。サーバー（MCP）単独呼び出しで `samples` が無い場合は `model_not_loaded` を返す（偽の成功を返さない）。
- 標準MCP（`mcp_server.py`）のツール定義・WebMCP（`webmcp.js`）の定義は **1つの JSON 定義ファイル `camera_tools.json` から生成**し、両者のずれをテストで検出する（`tests/test_camera_tool_parity.py`：両方のツール名・必須引数集合が一致）。

### 2.5 統合保存（プロジェクト状態の保存・復元）の完成（WP-02）
`PHASE_E_PROJECT_STATE_ROUNDTRIP_DESIGN_JA.md` の残りを埋める。
1. **保存前イベントの統一**：`camera.js` に `collectCameraState()` を作り、通常保存・bundle 保存の**両方**がこれを呼ぶ。`collectCameraState()` は `bai-camera-before-save` を同期発火してから `clone(project)` を返す（G-04）。
2. **workspace に入れるもの**（`<combination>.workspace.json`、既存の `{frame, asset, clip}` を拡張）：`frame`, `asset`, `clip`, `playRange:[start,end]`, `view:{layout:'split'|'scene'|'camera', splitRatio:0.2–0.8}`, `focusTest:{enabled, viewMode, targetMarker, sensorWidthMm, circleOfConfusionMm, strictToleranceM}`, `dofPreview:bool`, `framing:{enabled, mode, aspect, margin}`, `diagnostic:{focusLensMm, apertureF, focusDistanceM}`。再生中フラグは保存しない（復元時は停止状態）。
3. **外部VMD参照**：`vmd_clips[]` の各要素 `{id, name, path, sha256, frames, importedAt}`。本体は `data/camera_clips/<id>.json`（ネイティブトラック）に保存。復元時に `path` のファイルが無い／sha256 不一致なら「元VMDが見つからない／変更されている」を表示し、保存済みネイティブトラックで続行するか選ばせる（黙って置換しない）。
4. **原子的保存**：各ファイルを `<name>.tmp` に書いて `os.replace`。3ファイルの前に `data/.bundle-journal.json`（書き込み予定と旧版のバックアップパス）を作り、全部成功したら削除。起動時にジャーナルが残っていたら「前回の保存が途中で止まりました」とし、バックアップから戻す/新しい方を採用を選べる（自動では選ばない）。
5. **素材欠損**：`asset` のファイルが無い場合、モデルを読み込まずに「モデルが見つかりません：<名前>」を表示。別モデルへ置き換えない。
6. **テスト**：`tests/test_project_bundle_roundtrip.py`（保存→全モジュール再 import 相当の初期化→読込→全フィールド比較）、ジャーナル残存時の復旧、sha256 不一致、素材欠損、未知フィールド、revision 競合。Playwright：`tests/camera-ui.test.cjs`（§2.6）で bundle 保存→再読込→画面値一致。

### 2.6 実ブラウザーテストの土台（WP-03）
- 新規 `tests/camera-ui.test.cjs`（`tests/studio-ui.test.cjs` と同じ起動方式：実サーバー＋Chromium）。
- WebGL は headless Chromium の SwiftShader（ソフトウェア描画）で動かす。**これは「GPU 実描画の検証」ではない**ので、テスト結果に `webgl_renderer`（`WEBGL_debug_renderer_info` の値）を記録し、SwiftShader なら「GPU未検証」と出力する。
- テスト用の小さい実モデル：リポジトリ内の既存サンプル GLB/VRM があればそれを使う。なければ**テスト時にスクリプトで生成する骨付き GLB（2ボーン・数十頂点）**を `tests/fixtures/` に置く（原本素材の追加ではない、数KB）。
- 共通ヘルパー：`loadCameraPage(page)`、`setFrame(page, f)`、`readState(page)`（`window.BAICameraDebug.getState()` を新設：現在フレーム・カメラ姿勢・レンズ・診断結果・状態バージョン を返す読み取り専用）。

### 2.7 状態バージョンとキャッシュ無効化（CAM-005 契約の実装方法）
- `camera.js` に単調増加の `stateVersion` を持たせ、次のいずれかで +1：フレーム変更、キー編集、VMD/通常キー切替、ショット変更、レンズ/F値/合焦距離変更、追従ON/OFF・対象変更、モデル/クリップ変更、Undo/Redo。
- すべての診断・色分け・DOF更新関数は引数に `{frame, stateVersion}` を受け取り、描画直前に `stateVersion` が最新でなければ結果を捨てる。非同期の範囲診断も同様。
- 単一評価関数 `evaluateOptics(frame)` を `camera.js` に1つだけ置き、①色分け ②単一診断 ③範囲診断（各フレームで呼ぶ）④DOFプレビュー がこの戻り値だけを使う：`{frame, stateVersion, pose, lens:{focalMm,fNumber,focusM,sensorWidthMm,cocMm}, target:{name, point|null, depthM|null, reason?}, dof:{nearM, farM, hyperfocalM}|null, class:'near_blur'|'in_focus'|'acceptable'|'far_blur'|'unknown'}`。

---

## 3. 機能ごとの詳細設計

各項目の書式：**承認範囲**（台帳の要求）／**現状**／**設計**／**テスト**／**完了ゲート**／**規模と担当モデル**。

### CAM-001 カメラVMDの読込・分割・登録（任意区間抽出と境界補間）
- 現状：読込（inspect・native import・sample・preview-pose）はあり。カメラ以外（ボーン/モーフ）を含むVMDは decode が拒否。「分割」「登録」なし。
- 設計：
  1. `camera_vmd_codec.decode_camera_track(data, allow_non_camera=False)` に引数追加。`True` のときボーン/モーフは**読み飛ばして件数だけ返す**（`skipped:{bones:n, morphs:m}`）。UIは「カメラ以外の n 件は無視しました」と表示。元ファイルは変更しない。
  2. 新規 `camera_vmd_clip.py`：
     - `split(track, start, end)`：`[start, end]`（両端含む）を切り出し。境界にキーが無ければ、`camera_vmd_playback` の補間で境界フレームの値を求めて**境界キーを作る**（境界補間）。区間内の元キーの VMD ベジェ補間パラメータはそのまま保持。境界キーの補間パラメータは、元区間の曲線を境界で分割した**ド・カステリョ分割**で求める（曲線形を保つ）。出力フレームは 0 始まりに詰める（`rebase=True` 既定）。
     - `register(track, name, source_path)`：`data/camera_clips/<uuid>.json` に保存し、`vmd_clips[]` に参照を追加（§2.5-3）。
     - `to_project_keys(track, fps, sample_step=1)`：ネイティブトラック → プロジェクトキー（`target`・`position`・縦FOV・`roll`）。MMD の「距離・回転・注視点」表現を `position = target + R(rot)·(0,0,distance)` で変換（既存 `camera_vmd_bridge` の変換を使い、座標系の符号は §3 CAM-016 の往復テストで確定させる）。補間は `sample_step` ごとに `linear` キーを作る（VMD のベジェを BAI の補間へ近似変換しない＝形の誤差を作らない）。
  3. UI（`camera.html` VMD欄）：「区間を切り出す」（開始/終了フレーム入力・プレビュー）、「ライブラリに登録」、「プロジェクトのキーに変換」（確認ダイアログで上書き範囲と件数を表示、Undo 1回で戻せる）。
  4. API/MCP：§2.4 `vmd_clip`（action: split|register|to_keys|list|delete）。
- テスト：境界キーの値が元トラックの補間値と一致（1e-6）、区間内キー不変、元ファイルの sha256 不変、ボーン入りVMDで skipped 件数、`to_project_keys` 後に `sample` した姿勢が元トラック評価と一致（位置 1e-4、角度 1e-3 度）。
- 完了ゲート：上記＋実MMDカメラVMD（オーナー手持ち）での目視比較は**オーナー確認待ち（Phase E 全実装後）**として未検証記録。
- 規模：中。**標準モデル可**（ド・カステリョ分割の式は本書に明記：3次ベジェ P0..P3 を u で分割すると左側は `P0, P01, P012, P0123`、右側は `P0123, P123, P23, P3`。VMD補間の制御点は (x1,y1),(x2,y2) を 0–127 正規化。分割後の各区間を x 方向に [0,1] へ再正規化してから 0–127 に量子化し、量子化誤差 1/127 以内をテストで許容）。

### CAM-002 カメラ類似分類（距離・回転・速度・画角を比較）
- 現状：実装なし。
- 設計（読み取り専用の分析機能。データを書き換えない）：
  1. 新規 `camera_similarity.py`：
     - `features(samples)`：入力は同じfpsで評価済みの姿勢列 `[{position, target, fov, roll}]`（プリセット＝1姿勢、キー区間・VMDクリップ＝毎フレーム評価）。出力8次元：`dist_mean`（注視点までの距離平均, m）、`dist_range`、`yaw_total`（水平方向の向きの累積変化, 度）、`pitch_mean`（俯角/仰角の平均, 度）、`roll_absmax`、`speed_mean`（位置速度 m/s）、`speed_max`、`fov_mean`（度）。1姿勢のときは速度系・変化量は 0。
     - `distance(a, b, weights)`：各次元を固定スケール（dist 10m、角度 180度、速度 5m/s、fov 90度）で割って正規化し、重み付きユークリッド距離。既定の重みはすべて1。UIで「距離・回転・速度・画角」の4グループ単位で重み 0〜2 を変更可。
     - `rank(query, items, weights, limit=20)`：近い順。`cluster(items, threshold=0.25)`：単連結クラスタ（決定的：入力順・ID順で安定）。
  2. 対象：プリセット・VMDクリップ（CAM-001 登録済み）・現在のキー区間（ショット単位）。
  3. UI：プリセット一覧・VMDクリップ一覧の各行に「似ているものを探す」→ 右パネルに近い順リストと各次元の差（数値）を表示。「グループに分ける」で閾値スライダー付きクラスタ表示。**自動でタグ付け・削除・並べ替え保存はしない**（表示のみ）。結果から「タグを付ける」は CAM-014 の通常操作として行う。
  4. API/MCP：§2.4 `similarity`。
- テスト：同一入力で距離0、スケール既知の合成データで距離の値、クラスタの決定性（入力順を変えても同じグループ）、4グループ重み0で無視されること。
- 完了ゲート：UI・API・両MCPで同じ順位、実VMDクリップ3件以上での動作（自動テストは合成VMDで代替し、実データは未検証記録）。
- 規模：小〜中。**標準モデル可**。

### CAM-003 キーフレーム・カーブ編集（位置/回転/距離/FOV）
- 現状：キー追加・削除・ドラッグ・Undo/Redo（上限80）あり。UIの補間は3種。15モード・custom・グラフエディタなし。
- 設計：
  1. 補間選択を15モード＋custom に拡張（`camera_easing.py MODES` と同じ並び・同じ内部名）。表示名は日本語（例：`sine`＝サイン、`back`＝バック（行き過ぎあり））。行き過ぎるモード（back/elastic/bounce）は選択時に注記。
  2. **トラック別補間**：キー詳細に「トラック別に設定」スイッチ。ONで位置・注視点・FOV・ロール・F値・合焦距離ごとにモードを選べる（§2.3 `trackInterpolation`）。OFF（既定）は従来どおり `interpolation` 1つ。
  3. **カーブエディタ**（新規 `camera_curve_editor.js`、Canvas 2D）：選択区間の正規化カーブ（横 t、縦 進み具合）を表示。custom のときだけ2つのハンドルをドラッグ可（x は 0≤x1≤x2≤1 にクランプ、y は −2〜3）。ドラッグ中はプレビュー、離した時点で1 Undo。数値入力欄 4つも併設。登録カーブ（`easingPresets`）の保存・適用・削除（既存仕様：適用はコピー、遡及しない）。
  4. 「回転」「距離」の編集：BAIキーは `position`＋`target` で向きと距離を表す。キー詳細に**派生値表示**（注視点までの距離、ヨー/ピッチ）と、それを数値で変える入力を置き、変更時は `target` を固定して `position` を再計算する（距離・ヨー・ピッチの球座標）。
  5. Undo/Redo：上限 80 を維持。補間変更・ハンドル編集・トラック別設定・プリセットカーブ適用もすべて1操作1件。
- テスト：parity fixture（§2.2）で15モード・トラック別。Node：カーブエディタのハンドルクランプ、x 単調性。Playwright：補間を `back` にしてスクラブ→`readState` の姿勢が Python `/api/camera/sample` と一致（1e-6）。Undo で元に戻る。
- 完了ゲート：UI・API・両MCPで同じキーデータ、保存→復元で一致、実ブラウザーでのドラッグ確認（SwiftShader で自動、実GPUは未検証記録）。
- 規模：中〜大。**標準モデル可**（カーブエディタは2点ハンドルのみ、汎用グラフエディタは作らない）。

### CAM-004 カメラ矩形フレームと被写体見切れ検出（投影バウンディングボックス）
- 現状：球・8頂点AABBで判定済み。UI表示あり。輪郭・遮蔽・GPU統合は未。
- 設計（追加は検証と表示の整理のみ。**判定ロジックを増やさない**）：
  1. 判定結果の文言を「事実」に限定：「頭が上端から 4% はみ出し」等。良し悪しの言葉（NG/悪い構図）を使わない。既存の「構図の良否は判定しません」を維持。
  2. 補助表示（三分割線・セーフフレーム・ヘッドルーム目安）は**任意ON/OFF**で、初期OFF。保存は workspace の `framing`（§2.5-2）。
  3. 遮蔽・輪郭は承認範囲外（台帳は「投影バウンディングボックス」）→ 実装しない。
- テスト：既存 node テスト＋Playwright で補助表示ON/OFFが撮影キーを変えないこと、書き出し（将来）に混入しない旨の描画レイヤー分離（`overlay` レイヤーのみに描く）を DOM/レイヤー名で確認。
- 完了ゲート：実モデルでのアニメーション中判定（SwiftShader 自動＋実GPU未検証記録）。
- 規模：小。**標準モデル可**。

### CAM-005 焦点距離・F値・ピント距離（MMD非対応値はJSON保持）＋フォーカス契約
- 現状：レンズプリセット・FOV反映・診断計算あり。fStop を送るUIなし、JS が fStop 補間しない、距離定義と範囲の不一致（G-07/G-08）、色分け3D描画・区間診断の動的連携未。
- 設計：
  1. キーに `fStop`・`focusDistance` を書けるUI（キー詳細のレンズ欄。値を変えて確定で現在フレームのキーを更新＝`mergeKey`）。
  2. `evaluateOptics(frame)`（§2.7）を唯一の評価関数にする。合焦距離の決まり方の優先順位：①追従ON かつ対象点が解決 → 対象点の光軸方向深度 ②キーの `focusDistance` の補間値 ③画面の手動合焦距離。どれを使ったかを `focusSource: 'tracking'|'key'|'manual'` で返し画面に表示。
  3. 色分け（手前ボケ・合焦近傍・許容範囲・奥ボケ・判定不能）を Camera View の**オーバーレイ層**に描く（対象点の位置に凡例色の円＋文字。模様（斜線）も併用）。全画面のピクセル色分けは Phase F（F-DOF-01）。
  4. 範囲診断：ブラウザ側で各フレームの対象点を評価して `samples` を作り（§2.4）、`focus_evaluate(range)` に送る。結果の逸脱区間をタイムラインに色帯表示。キャンセル可、上限 20,000 フレーム、進捗表示は**実際に処理したフレーム数**のみ。
  5. Python `camera_focus.py` を光軸方向深度に変更（G-07）。範囲 0.7–64（G-08）。
  6. VMD はF値・合焦距離を持てない → VMD書出し時に**サイドカー JSON**（`<name>.vmd.bai.json`：`{schema:1, fps, keys:[{frame, fStop, focusDistance, roll?}]}`）を同時に出す（CAM-016）。
- テスト：フォーカス設計 §8 の 1〜6 を自動テスト化（7・8 は実機）。特に「同一フレームで単一診断と区間診断の距離・分類が一致」（Python と JS の両方、parity fixture に光学ケースを追加）。stateVersion で古い結果を捨てること（遅延 Promise を使ったテスト）。
- 完了ゲート：契約の検証ゲート 1〜5。GPU実描画は未検証記録。
- 規模：大。**設計確定済みなので標準モデル可**。ただし実装後のレビュー（契約への適合確認）だけ高性能モデルで1回行う。

### CAM-006 パン・ティルト・ロール・自転（固定位置からの向き操作）
- 現状：pan（旧＝平行移動）/tilt/orbit/dolly の操作あり。ロール操作なし。HTTP なし。
- 設計：
  1. キーに `roll`（§2.3）。描画時のカメラ up ベクトル = 光軸周りに roll 回転した (0,1,0)。`sampleKeys` で補間（角度は単純線形、±180 を跨ぐ場合は短い方向。parity でテスト）。
  2. 操作名（新API）：`pan_yaw`（位置固定でヨー）、`tilt`（位置固定でピッチ）、`roll`、`truck`（右方向平行移動）、`pedestal`（上下平行移動）、`dolly`、`orbit`、`zoom`（焦点距離）。**旧 `pan` は `truck` の別名として残す**（保存・APIの互換、操作設計 §3）。UIラベルは新名称、ツールチップで旧名称を説明。
  3. 「自転」＝カメラ位置固定のヨー回転を時間で行うこと。CAM-010 の rig `spin`（§CAM-010）として生成。
  4. Camera View の入力割当（操作設計 §4）：左ドラッグ＝パン/ティルト、R+ドラッグ＝ロール、Z+ドラッグ＝ズーム、中ドラッグ＝トラック/ペデスタル、ホイール＝ドリー、Alt+左＝オービット。Scene View は UE 方式（右ドラッグ見回し＋WASDQE）で**撮影キーを変えない**。ドラッグ中は操作名を画面に表示。Esc で取消。
  5. HTTP `POST /api/camera/move`（§2.4）。`commit:false` は計算結果の姿勢だけ返す（保存しない）。
- テスト：操作設計 §9 の CAM-UI-01〜04、CAM-KEY-01〜03 を Playwright で（座標を `readState` で検証）。Python `camera_move` に pan_yaw/roll/truck/pedestal を追加し単体テスト。旧 `pan` の結果が変わらないこと（回帰）。
- 完了ゲート：4経路一致、実機操作感はオーナー確認待ち。
- 規模：中。**標準モデル可**。

### CAM-007 ドリー・トラック・スライダー・ズーム（移動と画角独立）
- 現状：ドリー・レール・FOV入力あり。FOVアニメーションの生成なし、bake は FOV 固定。
- 設計：
  1. rig の bake に `fov_start`・`fov_end`（度）を追加（未指定は現在値で固定＝現状互換）。移動と画角は独立した値として補間。
  2. **ドリーズーム**は CAM-012 で定義（被写体の見かけの大きさを保つ）。CAM-007 では「ドリーとズームを独立に同時に動かせる」ことまで。
  3. 「スライダー」＝短い直線レール（rail の別名プリセット：長さ 0.3〜2m、既定 1m）。
- テスト：bake 結果の FOV が両端で指定値、中間がイージングどおり。位置は FOV 指定の有無で変わらない（独立性）。
- 規模：小。**標準モデル可**。

### CAM-008 レール・曲線カメラパス（制御点/補間/テンプレート）
- 現状：直線・二次ベジェ・等速化・ベイク・3Dハンドルあり。bake の ease は linear/smooth のみ、ベイクキーは linear 固定。
- 設計：
  1. bake の ease を15モード＋custom に拡張（`camera_core.ease` を使う）。生成キーの `interpolation` は `linear`（サンプル密度で形を出す）を維持し、サンプル数は既定 = 区間フレーム数 / 3（最低 4、最大 500）。
  2. 制御点を**最大 8 点の Catmull-Rom**（`curvedRail` を拡張、既存の二次ベジェ3点データはそのまま読める：3点の場合は従来どおり二次ベジェで評価）。データ：`rig.points:[[x,y,z]...]`（3〜8）。3Dハンドルで点の追加（Shift+クリック）・削除（選択して Delete）。
  3. キー区間編集：rig を「フレーム範囲 [start,end] だけ」に適用する入力（既存の rig-start/-end を明示表示）。範囲外のキーは変更しない。
  4. テンプレート：CAM-013 のテンプレートから rail 系を選ぶとこの rig 設定が入る。
- テスト：3点データの評価が従来と完全一致（回帰）、8点の通過性（各制御点を通る）、等速化の誤差 < 1%、範囲外キー不変。
- 規模：中。**標準モデル可**。

### CAM-009 クレーン・ジブ・ブーム・ドローン（縦移動と旋回）
- 現状：クレーン（X軸回りの弧）あり。ドローン・ジブ旋回なし。
- 設計：rig `crane` を次のパラメータで一般化：`pivot:[x,y,z]`、`armLength`（0.5〜20m）、`elevation:[start,end]`（度、−80〜80）、`swing:[start,end]`（度、水平旋回）、`pedestal:[start,end]`（支点の上下 m）。
  - クレーン＝elevation 変化、ジブ＝swing 変化、ブーム＝armLength 変化（`armLength:[start,end]` も許可）。同時変化可。注視は `target` 固定 or 被写体追従（CAM-011）。
  - ドローン＝CAM-008 の曲線レール＋**バンク**（進行方向の曲がり具合から roll を自動計算：`roll = clamp(k * 曲率 * 速度², ±25°)`、k は既定 0.5、0 で無効）＋速度上限（m/s）。
  - 既存 `crane_from_angle` データは `elevation:[crane_from_angle, 0]` として読む（互換）。
- テスト：アーム端の軌跡が球面上（|p−pivot|=armLength、1e-6）、旧データの回帰一致、ドローンのバンク角が上限内。
- 規模：中。**標準モデル可**。

### CAM-010 オービット・スパイラル・自転（被写体中心とカメラ中心を区別）
- 現状：オービット（方位角）あり。スパイラル・自転なし。bake は方位角のみ変化。
- 設計：rig `orbit` に `radius:[start,end]`、`height:[start,end]`、`elevation:[start,end]`、`azimuth:[start,end]`、`center:'subject'|'point'`。スパイラル＝radius か height が時間で変化するオービット（プリセット名「スパイラル上昇」「スパイラル接近」）。
  - **自転** rig `spin`：カメラ位置固定、`yaw:[start,end]`（度）で向きだけ回す（被写体中心ではなくカメラ中心）。注視点は回転に合わせて動く。
  - UI でも「被写体を中心に回る（オービット）」「その場で向きを回す（自転）」を別ボタン・別アイコンにする。
- テスト：オービット中の注視点距離（radius 固定時一定）、スパイラルの半径が両端で指定値、自転中の位置不変。
- 規模：小〜中。**標準モデル可**。

### CAM-011 被写体追従・複数人自動構図（顔/全身/手などターゲット指定）
- 現状：単一ボーン追従・平滑化・ベイクあり。複数人・複数ターゲット構図なし。追従設定の保存が通常保存時のみ（G-04）。
- 設計：
  1. ターゲット指定を `bone_follow.targets:[{model:'active'|<id>, marker:'face'|'eyes'|'chest'|'hips'|'full'|'hand_l'|'hand_r'|'bone', bone?:string, weight:0–1}]`（最大 8）に拡張。旧データ（単一ボーン）は `targets:[{model:'active', marker:'bone', bone, weight:1}]` として読む。
  2. マーカーの解決：`classifyBone`（既存）で顔/胸/腰/手のボーンを探し、見つからなければ**境界箱中心へ代替し、`resolved:'fallback_bbox'` を表示**（操作設計 §7）。`full` は境界箱中心。
  3. 複数ターゲット時の注視点＝重み付き平均。「全員を画面に入れる」オプション：全ターゲット点＋各境界箱を CAM-004 の投影で評価し、全員が入る**最小の距離（ドリー）または FOV（ズーム）**を提案（プレビュー→確定）。**自動でカメラを動かし続けない**（初期OFF、追従ON時のみ毎フレーム計算、ベイクで確定）。
  4. 複数モデルの同時読込は現状の画面では1体（`camera-asset`）。Phase E では「ターゲットに `model` を持てるデータ構造」と「同一モデル内の複数部位（例：顔＋両手）」まで実装・検証する。**複数人物（別モデル）の実機検証は、複数モデル読込が入る Phase C 以降**に回す（§9 Q1）。
  5. 保存：G-04 修正で bundle にも入る。localStorage `bai-camera-follow-v1` は「最後に使った設定の下書き」に限定し、プロジェクト保存値を優先。
- テスト：旧データ読込の回帰、重み付き平均、フォールバック表示、全員フレーミング提案が全点を画面内に入れること（合成点群）、bundle 往復。
- 完了ゲート：単一モデル・複数部位までを Phase E 完了条件とし、別モデル複数人は Phase C ゲートへ記録（§9 Q1 の回答で確定）。
- 規模：中。**標準モデル可**。

### CAM-012 映画演出カメラ（POV・OTS・Whip・Dolly Zoom・衝撃）
- 現状：`camera_cinematic.js` に orbit/face/dolly/crane/follow/rail の生成のみ（台帳の5種は未実装）。未配線。
- 設計：`camera_cinematic.js` に5種を追加。すべて「フレーム範囲＋パラメータ → キー列」を返す純関数。適用は §2.4 `generate_shot`（プレビュー→確定、Undo 1回）。Python 版 `camera_cinematic.py` を同じ仕様で作り parity fixture で一致検証（MCP から生成できるようにするため）。
  1. **POV**（主観）：対象モデルの頭ボーン位置＋オフセット（既定 前方 0.08m・上 0.02m）にカメラ、向きは頭ボーンの前方。ボーン座標はブラウザが評価した `samples` を使う（§2.4）。`samples` 無しは `model_not_loaded`。
  2. **OTS**（肩越し）：被写体A の肩（`shoulder_l/r` マーカー、無ければ頭位置から横 0.2m）の後方 `back`（既定 0.6m）・上 `up`（0.1m）・横 `side`（0.35m、左右選択）にカメラ、注視点は被写体B（無ければ A の前方 3m の点）。単一モデルでは B を「点」で指定。
  3. **Whip**（ウィップパン）：開始向き→終了向きを `duration`（既定 6 フレーム）で回すヨー回転。補間 `expo` 既定。前後は hold。モーションブラーは Phase F（フラグ `motionBlurHint:true` を shot メタに残すだけ）。
  4. **Dolly Zoom**（ドリーズーム）：被写体までの光軸距離 d と縦FOV θ を `d · tan(θ/2) = 一定` を保って変える。入力：`fov:[start,end]`、開始距離 d0（現在値）。各サンプルで `d = d0 · tan(θ0/2) / tan(θ/2)`。FOV 範囲 5〜150、d が 0.1m 未満になる組み合わせはエラー `invalid_range`。
  5. **衝撃**（シェイク）：開始フレームから `duration`（既定 12）で、振幅 `amplitude`（既定 0.03m・回転 1.0度、上限 0.3m・10度）が指数減衰する揺れを、**シード付き疑似乱数（mulberry32、seed 既定 1）**で位置と roll に加える。同じ seed は同じ結果。サンプルは毎フレーム。
  - 生成キーの `interpolation`：Whip は指定、他は `linear`（毎フレーム or 既定密度）。
- テスト：各ショットの幾何条件（POV：カメラ＝頭＋オフセット、Dolly Zoom：d·tan(θ/2) 一定 1e-6、衝撃：同 seed 同結果・上限内・減衰）。JS と Python の一致。
- 規模：中。**標準モデル可**。

### CAM-013 撮影用途別テンプレートライブラリ（格闘/MV/ホラー/建築/商品/SNS）
- 現状：用途別ライブラリなし（5つの固定構図と4レンズのみ）。
- 設計：
  1. 組み込みテンプレート定義 `camera_templates.json`（読み取り専用、リポジトリ管理）。各テンプレート：`{id, category, name, description, aspect:'16:9'|'9:16'|'2.39:1'|'1:1', lens:{focalMm, fStop}, generator:{kind:'cinematic'|'rig'|'pose', type, params}, recommendedFrames:[min,max]}`。
  2. カテゴリと最低限の中身（各3件、計18件。値は本書付録Aで固定）：
     - 格闘：インパクト・シェイク（CAM-012 衝撃）、回り込みオービット、ローアングル見上げ
     - MV：スロープッシュイン、半周オービット、クレーン上昇
     - ホラー：主観POV、ゆっくり後退ドリー、ダッチアングル（roll 15度の静止）
     - 建築：等速レール横移動、ドローン俯瞰、ティルトアップ
     - 商品：ターンテーブル（近距離オービット・85mm）、ドリーズーム、マクロ寄り（100mm相当）
     - SNS：縦型バストアップ（9:16）、縦型ドリーイン、縦型ウィップ
  3. UI：撮影画面に「テンプレート」パネル（カテゴリタブ→カード一覧）。適用＝範囲指定→プレビュー→確定。「マイプリセットに複製」で CAM-014 の custom_presets に `category` 付きでコピー（以後ユーザーが編集可）。テンプレート本体は書き換えない。
  4. 新UI（/workspace/22）のテンプレート画面は Phase E 後の P2 移植時に同じ JSON を読む（今回は既存カメラ画面に実装）。
- テスト：JSON スキーマ検証（全18件が生成可能で例外なし）、適用→Undo、複製後に元テンプレート不変。
- 規模：中（大半はデータ）。**標準モデル可**（付録Aの値をそのまま使う）。

### CAM-014 カメラプリセット お気に入り・タグ・検索（JSON/VMDと履歴）
- 現状：名前＋姿勢の保存・適用・削除のみ（最大64）。
- 設計：
  1. フィールド追加（§2.3）：tags・favorite・category・lens・pose.roll・createdAt/updatedAt。
  2. 検索：名前・タグ・カテゴリを対象に、**NFKC 正規化＋大文字小文字無視の部分一致**。「お気に入りのみ」「タグ（AND）」絞り込み。並び：お気に入り→最近使った順→名前。
  3. **履歴**の解釈：「使用履歴（最近使ったプリセット、最大20件）」＋「プリセット操作の Undo/Redo」。プリセット内容の版管理（過去版への巻き戻し）は作らない（§9 Q2 で確認、既定はこの解釈）。
  4. **JSON 入出力**：選択プリセットを `bai-camera-presets.json`（`{schema:1, presets:[...]}`）として書き出し／読み込み。読み込み時に名前が重複したら「(2)」を付けて追加（上書きしない）。
  5. **VMD 入出力**：プリセット1件 = 1フレームのカメラVMD（CAM-016 のエンコーダ、フレーム0）＋サイドカー（lens・roll・tags）。VMD 読込時は 1 フレーム目を姿勢として取り込み、名前は VMD ファイル名。
  6. UI：プリセット一覧をカード（名前・タグ・★）にし、検索欄・タグチップ・★切替・複製・名前変更・JSON/VMD入出力ボタン。
- テスト：検索（全角/半角・大小文字）、重複名の自動改名、JSON往復で完全一致、VMD往復で姿勢一致（位置 1e-4、FOV 1e-3）、履歴20件上限、64件上限エラー。
- 規模：中。**標準モデル可**。

### CAM-015 カメラ連結・カット・時間同期（最終姿勢継承と瞬時カット）＋シーケンサー
- 現状：ショット検証・編集API・評価API・MCP・UI（追加/削除）あり。UI に update なし、transition は cut 固定、ショットはプリセット（静止）参照のみ。
- 設計（MASTER＋複数カメラ設計は**合流しない**。単一カメラのシーケンサーを完成させる）：
  1. ショットの中身 `source`（§2.3）：`preset`（静止構図）または `keys`（プロジェクトキーの区間 `[from,to]` をこのショットの時間に再生）。`keys` ソースのショットは、ショット開始時刻にキー区間の `from` が対応（`offset = shot.start − from`）。区間長がショット長より短い場合は最終姿勢を保持。
  2. **最終姿勢継承** `inherit:true`：ショット開始時の姿勢を直前ショットの最終フレームの姿勢にする（`preset` ソースのときのみ意味を持つ。直前ショットの終わりの姿勢から、このショットのプリセット姿勢へ `duration` 内で補間する「つなぎ」ではない＝瞬時カットが既定）。
  3. 瞬時カット：境界フレームで切替。半開区間 `[start,end)`。隙間は「ショットなし＝プロジェクトキーをそのまま再生」。
  4. **時間同期**：シーケンスのフレームは共通タイムライン（モーションクリップと同じ fps・フレーム番号）。音声同期は「BGMの頭出しオフセット `audioOffsetFrames`」を workspace に保存して再生位置を揃えるまで（音楽解析は Phase D）。
  5. UI：撮影画面下段に**ショット帯**（ショットごとの色帯・名前・ドラッグで境界移動・分割・削除・選択して詳細編集＝update）。再生ヘッドが入っているショットを強調表示。
  6. VMD 書出し（CAM-016）はシーケンス適用後の姿勢をベイク。
- テスト：既存テスト＋update、keys ソースの時刻対応、inherit の姿勢、境界フレームでのゼロ遅延（f=start で新ショット）、隙間、保存往復、MCP からの update。
- 完了ゲート：画面・再生・保存・両MCP。
- 規模：中〜大。**標準モデル可**。

### CAM-016 MMDカメラVMD書出し（FOV・位置・距離・回転・補間）
- 現状：VMDから読み込んだネイティブトラックのラウンドトリップ書出しのみ。BAI プロジェクトキーからの書出しなし。
- 設計：
  1. `camera_vmd_export.py`（新規）`export_project(project, start, end, step=1)`：シーケンス適用後の姿勢を `step` フレームごとにサンプルし、MMDカメラ形式（注視点・距離・回転（ラジアン）・視野角（整数度）・パース有無）へ変換。**距離は MMD の慣例で負値**（カメラは注視点の手前）。補間パラメータは毎フレームサンプルなので**線形（20,20,107,107）**。
  2. 変換式（座標の正本。CAM-001 の取り込みと逆）：MMD の回転 (rx, ry, rz) と距離 d、注視点 c から位置 `p = c + Ry(ry)·Rx(rx)·Rz(rz)·(0,0,d)`。BAI→MMD は `c = target`、`d = −|position − target|`、`ry = atan2(dx, dz)`、`rx = atan2(−dy, hypot(dx,dz))` 等（符号は**往復テストで確定**させ、確定した式を本書付録Bに追記してからコミットする）。
  3. 長さ単位：BAI 1 = 1m、MMD 1 = 8cm（慣例）。換算係数 `MMD_UNIT_PER_M = 12.5` を定数化し、UIで変更可（既定 12.5）。
  4. 視野角は整数度へ丸め（MMD仕様）、丸め誤差を書出し結果に表示。
  5. サイドカー `<name>.vmd.bai.json`（CAM-005 §6）。
  6. UI：「プロジェクトをVMDに書き出す」（範囲・step・単位係数）、書出し後に**自動で再読込して差分を表示**（最大誤差：位置 m、角度 度、FOV 度）。
- テスト：BAI→VMD→（CAM-001 の取り込み）→BAI で位置誤差 < 1e-3m（float32量子化を考慮）、FOV 丸め ≤0.5度、サイドカー往復一致、フレーム番号・件数。
- 完了ゲート：MMD 本体での読み込み確認は**オーナー確認待ち（未検証記録）**。
- 規模：中。**座標系の符号確定（付録B）だけ高性能モデルでレビュー**、実装は標準モデル可。

### CAM-017 カメラ衝突回避・構図品質（ステージ/被写体との衝突）
- 現状：実装なし。CAM-004 の見切れ判定のみ。
- 設計（**衝突の事実検出と、ユーザーが選ぶ回避案**まで。構図品質の自動 NG はしない）：
  1. 衝突体：被写体＝ブラウザが評価した各フレームの境界箱（`publishModelFraming` の AABB）を各辺 `margin`（既定 0.05m）で膨らませたもの。ステージ＝`collision.colliders`（ユーザー定義 AABB、最大 64）＋床（y = 0、ON/OFF）。ステージモデルのメッシュ由来の自動生成は**しない**（Phase H ステージ工程の範囲）。
  2. 判定：各フレームのカメラ位置が衝突体の内側、または衝突体表面までの距離が `minDistance`（既定 0.2m）未満。ニアクリップ（既定 0.1m）で被写体にめり込む場合も「近すぎ」。
  3. 出力：区間一覧（開始・終了・種類（被写体/ステージ/床）・最小距離）とタイムライン色帯。
  4. 回避案（任意）：衝突区間の各キーについて、衝突体の最近点から外向きにカメラを `minDistance` まで押し出した位置を**プレビュー**。確定で該当キーのみ更新（1 Undo）。注視点は変えない。
  5. 「構図品質」は CAM-004 の事実表示（見切れ％、ヘッドルーム）を同じ区間一覧に並べるだけ。点数化・合否はしない。
- テスト：合成 AABB で内側/近接/外側、床、押し出し後に minDistance 以上、注視点不変、Undo。
- 規模：中。**標準モデル可**。

### CAM-018 自動ディレクターとショット選択（動作/主役交代に追従）
- 現状：実装なし。
- 設計（**提案を作るだけ。適用はユーザー確定**）：
  1. 入力：対象範囲、使えるショット候補（プリセット・テンプレート・既存キー区間）、ルール `{minShotFrames: 45, maxShotFrames: 240, preferCloseOnLowActivity:true}`、各被写体の**動きの量**（ブラウザが評価：各フレームの主要ボーン速度の二乗和を 0〜1 に正規化した列 `activity[subject][frame]`）。
  2. アルゴリズム（決定的・ルールベース）：
     - 主役 = 各フレームで activity が最大の被写体（差が 0.1 未満なら直前の主役を維持＝ちらつき防止）。主役が変わる点をカット候補にする。
     - activity の山（移動平均 15 フレームの極大で、前後の谷との差が 0.2 以上）をカット候補に追加。
     - 候補を `minShotFrames` 以上の間隔に間引き、`maxShotFrames` を超える区間は等分割。
     - 各区間のショット選択：activity 平均が高い → 引き（広角・全身・オービット系）、低い → 寄り（顔アップ・ドリーイン）。同じショットの連続を避ける（直前と同じ候補はスコア −1）。スコアが同点なら候補リスト順。
  3. 出力：CAM-015 形式の `sequence` 案（各ショットに理由文字列：例「主役がBに交代」「動きのピーク」）。画面ではショット帯に半透明で重ねて表示し、「この案を適用」で `sequence` を置き換え（1 Undo、置き換え前を確認ダイアログで表示）。
  4. 被写体が1体の場合は「主役交代」は発生せず、動きの山だけでカット。複数人の実機検証は CAM-011 と同じく Phase C 以降（§9 Q1）。
- テスト：合成 activity 列（2被写体の交代、山、平坦）で期待カット位置、min/max 制約、同一入力で同一結果、適用→Undo。
- 規模：中。**標準モデル可**（ルールは本書の数値で固定。調整はオーナー確認後）。

---

## 4. 作業パッケージ（WP）と順番

依存関係の順。**上から順に実装**（AGENTS.md の順序固定に従い、Phase E 内で前倒し・入れ替えをしない）。

| WP | 内容 | 対象ID | 前提 | モデル |
|---|---|---|---|---|
| WP-00 | G-01〜G-12 の修正、`camera_core.js`、parity fixture | 全体 | なし | 標準 |
| WP-01 | `camera_service.py`、新API、`camera_tools.json`→両MCP生成、If-Match 必須化 | 全体 | WP-00 | 標準 |
| WP-02 | 統合保存の完成（collectCameraState、workspace拡張、vmd_clips参照、原子的保存＋ジャーナル、欠損表示） | 保存 | WP-01 | 標準（ジャーナル部分の実装後レビューのみ高性能） |
| WP-03 | 実ブラウザーテスト土台（camera-ui.test.cjs、テスト用GLB、BAICameraDebug） | 全体 | WP-00 | 標準 |
| WP-04 | CAM-005 フォーカス契約（evaluateOptics・stateVersion・色分けオーバーレイ・範囲診断・Python距離修正） | CAM-005, E-FOCUS-01/02 | WP-00〜03 | 標準＋契約適合レビュー（高性能1回） |
| WP-05 | CAM-003 補間UI・トラック別・カーブエディタ | CAM-003 | WP-00,03 | 標準 |
| WP-06 | CAM-006 ロール・操作名整理・入力割当・move API | CAM-006 | WP-01,03 | 標準 |
| WP-07 | CAM-007/008/009/010 rig 拡張 | CAM-007〜010 | WP-00,06 | 標準 |
| WP-08 | CAM-011 複数ターゲット・保存修正 | CAM-011 | WP-02,04 | 標準 |
| WP-09 | CAM-012 映画演出（JS＋Python） | CAM-012 | WP-07 | 標準 |
| WP-10 | CAM-014 プリセット拡張 | CAM-014 | WP-01 | 標準 |
| WP-11 | CAM-013 テンプレート | CAM-013 | WP-09,10 | 標準 |
| WP-12 | CAM-015 シーケンサー完成 | CAM-015 | WP-10 | 標準 |
| WP-13 | CAM-016 プロジェクト→VMD書出し＋サイドカー（付録B確定） | CAM-016 | WP-12 | 標準＋座標レビュー（高性能1回） |
| WP-14 | CAM-001 分割・登録・キー変換 | CAM-001 | WP-13 | 標準 |
| WP-15 | CAM-002 類似分類 | CAM-002 | WP-14 | 標準 |
| WP-16 | CAM-004 表示整理・CAM-017 衝突 | CAM-004, 017 | WP-04 | 標準 |
| WP-17 | CAM-018 自動ディレクター | CAM-018 | WP-12, 08 | 標準 |
| WP-18 | 4経路一致の総合テスト・台帳更新・未検証一覧の確定 | 全体 | 全部 | 標準（最終レビュー高性能1回） |

- 既存の優先指示との関係：残件監査は「CAM-005 → 保存完全復元 → CAM-015」の順を挙げている。WP-00〜03 はこれらの**前提（土台）**なので先に行い、その直後に WP-04（CAM-005）、WP-02 で保存は完了済み、WP-12（CAM-015）は依存の都合で WP-10 の後。**CAM-015 を先に終えたい場合は WP-10 を最小（タグなしで名前のみ）にして WP-12 を前に出してよい**（オーナー指示があれば）。

---

## 5. テスト方針（まとめ）
- 単体：Python `tests/test_camera_*.py`、Node `tests/*.cjs`（node:test）。
- 照合：parity fixture（§2.2）、ツール定義一致（§2.4）。
- 画面：`tests/camera-ui.test.cjs`（SwiftShader。GPU未検証と記録）。
- 往復：保存→初期化→復元の全フィールド比較、VMD 書出し→再読込。
- コミットごとに `npm run typecheck`（新UI）・`python -m pytest -q`・`node --test tests/`（既存 node テスト）・該当 Playwright を実行し、結果をコミット本文と台帳に書く。

## 6. 台帳（PHASE_E_IMPLEMENTATION_STATUS.json）の更新ルール
- `implementation_assessment`：何ができて何が未かを1〜3文。
- `ui_api_webmcp_stdio_mcp_verified`：WP-18 の4経路一致テストが通った ID だけ true。
- `real_browser_verified`：**実GPU**での確認をした ID だけ true（SwiftShader では false のまま、`notes` に「SwiftShader 自動テスト合格」と書く）。
- `release_complete`：§8 のゲートをすべて満たし、オーナー確認が済んだときだけ true。

## 7. 新UI（/workspace）との関係
- Phase E の実装は**既存の `camera.html` 系に対して行う**。新UIへの移植は P2（Phase E の後、オーナー決定）。
- ただし API・MCP は共通なので、新UIの「実機能」表示は P2 で API を読むだけで済む形にしておく。新UIのモック画面（SCR-02/03/04/14/15/16/22）の項目名は本書の名称に合わせて P2 で直す。

## 8. 完了ゲート（Phase E 全体）
1. 18機能すべてで、本書の「テスト」が自動で合格。
2. 4経路（UI・HTTP API・WebMCP・標準MCP）で同じ操作が同じ結果（WP-18）。
3. 保存→再起動相当→復元で全状態一致（WP-02）。
4. 実モデル（テスト用GLB）で Scene View と Camera View が同一時刻に表示（SwiftShader）。
5. 未検証事項（実GPU、実MMD、実データでの目視、別モデル複数人）を一覧化してオーナーに提示。**ここで初めてオーナーに動作確認を依頼**（AGENTS.md 規則7）。

## 9. 判断に迷ったとき・オーナーへの確認事項
- 迷ったとき：①上位文書を確認 ②本書の「設計」に書いてある最小の解釈で実装 ③書いていない機能は作らず、`docs/roadmap/` の該当箇所に「未決」と追記してコミットし、報告で知らせる。
- **Q1（既定で進める）**：CAM-011/018 の「複数人（別モデル）」の実機検証は、複数モデルの同時読込（Phase C マルチダンサー）が入ってから行う。Phase E では同一モデル内の複数部位とデータ構造・合成データテストまで。→ 既定：この分け方で進める。
- **Q2（既定で進める）**：CAM-014 の「履歴」は使用履歴＋Undo/Redo と解釈する（版管理は作らない）。→ 既定：この解釈。
- Q3（情報）：MMD 長さ単位係数は慣例の 12.5（1m＝12.5 MMD単位）を既定にする。

---

## 付録A CAM-013 組み込みテンプレートの値（固定）
| id | カテゴリ | 名前 | aspect | 焦点距離mm / F | generator | 主要パラメータ |
|---|---|---|---|---|---|---|
| fight-impact | 格闘 | インパクト・シェイク | 16:9 | 35 / 4 | cinematic shake | duration 12, amplitude 0.05m/2度, seed 1 |
| fight-orbit | 格闘 | 回り込みオービット | 16:9 | 28 / 5.6 | rig orbit | azimuth 0→180, radius 3.5, height 1.2 |
| fight-low | 格闘 | ローアングル見上げ | 16:9 | 24 / 4 | pose | 被写体前方 2.5m・高さ 0.4m、注視 胸 |
| mv-push | MV | スロープッシュイン | 16:9 | 50 / 2.8 | rig rail | 長さ 1.5m 前進, ease sine |
| mv-half-orbit | MV | 半周オービット | 2.39:1 | 50 / 2 | rig orbit | azimuth −90→90, radius 3 |
| mv-crane-up | MV | クレーン上昇 | 16:9 | 35 / 4 | rig crane | elevation −10→35, armLength 4 |
| horror-pov | ホラー | 主観POV | 16:9 | 24 / 2.8 | cinematic pov | offset 前0.08/上0.02 |
| horror-pullback | ホラー | ゆっくり後退 | 16:9 | 35 / 2 | rig rail | 長さ 2m 後退, ease quad |
| horror-dutch | ホラー | ダッチアングル | 16:9 | 35 / 2.8 | pose | roll 15度、被写体前方 3m |
| arch-slide | 建築 | 等速レール横移動 | 2.39:1 | 24 / 8 | rig rail | 横 4m, constant_speed true |
| arch-drone | 建築 | ドローン俯瞰 | 16:9 | 18 / 8 | rig curve(drone) | 高さ 8→12m, バンク k 0.5 |
| arch-tiltup | 建築 | ティルトアップ | 16:9 | 24 / 8 | rig spin(pitch) | pitch −10→30, 位置固定 |
| prod-turntable | 商品 | ターンテーブル | 1:1 | 85 / 5.6 | rig orbit | azimuth 0→360, radius 1.2, height 0.3 |
| prod-dollyzoom | 商品 | ドリーズーム | 16:9 | 50 / 4 | cinematic dollyZoom | fov 40→20 |
| prod-macro | 商品 | マクロ寄り | 1:1 | 100 / 8 | rig rail | 長さ 0.3m 前進 |
| sns-bust | SNS | 縦型バストアップ | 9:16 | 50 / 2.8 | pose | 被写体前方 1.6m・高さ 1.45m、注視 顔 |
| sns-dollyin | SNS | 縦型ドリーイン | 9:16 | 35 / 2.8 | rig rail | 長さ 1m 前進 |
| sns-whip | SNS | 縦型ウィップ | 9:16 | 28 / 4 | cinematic whip | yaw 0→90, duration 6 |

※ `rig spin(pitch)`：CAM-010 の自転を pitch にも適用できるよう `spin` は `yaw:[s,e]` と `pitch:[s,e]` の両方を受け付ける（既定 0→0）。

## 付録B MMD カメラ座標変換（WP-13 で往復テストにより確定して追記）
- 未確定。WP-13 の最初のコミットで、既知の値を持つ合成VMD（回転 0/90度、距離 −10 など）を CAM-001 の取り込み→BAI→書出しで往復させ、符号と軸順を確定してここに式を書く。確定前に CAM-016 を完成扱いにしない。
