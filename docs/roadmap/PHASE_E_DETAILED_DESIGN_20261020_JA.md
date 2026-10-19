# Phase E 詳細設計（CAM-001〜018・横断要件）v2 — 2026-10-20 【レビュー中の草案：批評3回＋最終判定の前。実装に使わない】

- 位置付け：承認済み Phase E の**残作業を実装可能な粒度まで落とした詳細設計**。新機能の追加ではない。本書に書いた項目はすべて `FEATURE_REGISTER.json` の CAM-001〜018、`PHASE_E_IMPLEMENTATION_STATUS.json` の E-FOCUS-01/02、およびオーナー決定文書に根拠がある。根拠のない案は本書に入れない（入れた場合は §9 の「未承認候補」に送る）。
- 正本の優先順位：`AGENTS.md`（スコープ凍結）＞ オーナー決定文書（`docs/camera/BAI_CAMERA_INTERACTION_DESIGN_V1_JA.md`、`docs/camera/PHASE_E_CAM005_FOCUS_CONSISTENCY_CONTRACT_JA.md`、`docs/camera/BAI_CAMERA_FOCUS_DOF_TEST_MODE_DESIGN_V1_JA.md`、`docs/roadmap/PHASE_E_PROJECT_STATE_ROUNDTRIP_DESIGN_JA.md`、`docs/camera/KEY_INTERVAL_EASING_AND_LENS_20261018_JA.md`、`docs/camera/MASTER_MULTICAMERA_SEQUENCER_DESIGN_V1_JA.md`）＞ 本書。**本書が上位文書と矛盾したら上位文書が正しい**。矛盾を見つけたら実装を止めて本書を直す。
- 基準コード：ブランチ `claude/project-thread-8gcwq2` の `c166d9e`（コードは `28af8c3` から未変更）。本書の「ファイル:行」はこの時点の行番号。v2 作成時に該当コードを読み直して確認した（§1）。
- 対象読者：実装担当（標準モデル想定）。各作業パッケージ（WP）は「何を・どのファイルに・どの関数名で・どのテストで・何を満たせば完了か」まで決めてある。**本書に書いていない仕様を独自に足さない。** 迷ったら §9 に従う。

---

## v1→v2 変更履歴

批評1回目の指摘を区分ごとに番号付けし（1-A〜1-K）、v2 での対応を記す。

| 指摘 | 内容（要約） | v2 での変更 | 本書の場所 |
|---|---|---|---|
| 1-A 作業順・循環依存 | WP-13/14 の循環、WP-02 に vmd_clips が入り CAM-001 と相互依存、WP-01 が全APIを先取り | 実装順を WP-00a → WP-03 → WP-04 → WP-02 → WP-12 → CAM-003 → 006 → 007〜010 → 011 → 012 → 014 → 013 → VMD統合WP（CAM-016＋CAM-001）→ 002 → 004/017 → 018 → 画面レイアウト → 最終、に固定。WP-01（全API先行）を廃止し、**各WPが自分のAPIを追加**。vmd_clips は VMD 統合 WP（WP-13）へ移動。最大化・分割幅変更の WP-17 を追加 | §4 |
| 1-B リビジョン | UI・MCP・bundle の revision の持ち方が未定義、既存応答形の破壊 | UI は読込時の revision を保持し保存応答で更新（bundle も同じ）。MCP 書込ツールに `revision` 引数、`mcp_server.api()`／`webmcp.js request()` に If-Match 送信機能。`bai_camera_get` は `{project, revision}`。sequence/edit は `expected_sequence` 維持＋任意 `revision`。既存エンドポイントは `error` 文字列を残し `error_code` を追加（形を壊さない）。新規エンドポイントは `{ok, revision, result}` | §2.4、§2.5 |
| 1-C 読込エラー（G-06） | 409 の意味違い、退避ファイル名にコロン、退避の無限増殖、未知フィールド方針 | ファイル無し＝既定値（保存まで書かない）。不正＝HTTP 422 `camera_project_invalid`、内容ハッシュごとに1つだけ `camera_project.invalid-<sha8>-<YYYYmmddTHHMMSSZ>.json` へ退避。復旧は `POST /api/camera/project/reset`（明示確認必須）。読込時の未知フィールドは破棄して `dropped_fields` に列挙、API書込時は `unknown_field` で拒否 | §2.7、§2.3 |
| 1-D CAM-005 | 焦点距離・F値の出所が二重、追従失敗時のフォールバック、範囲診断が別計算、状態版の粒度 | focalMm＝サンプルFOVから換算（センサー縦24mm）。焦点距離入力は現在キーのFOVを編集。F値＝サンプル fStop（既定4.0）、F値入力はキー fStop を書く。focusDistance キー既定 4.0m。s≤f は `focus_inside_focal`。追従ONで未解決は `bone_missing`（代替しない）。範囲診断は JS の `evaluateOptics` 1関数。Python は `samples` を受け、無ければ `camera_source:'keys_only'`。`stateVersion` を `contentVersion`＋frame に分割。v1 で落ちた承認済み項目（近点/遠点面ガイド、対象に合わせるプレビュー→確定、両眼の最悪値、CSV/JSON出力、レンダラー状態表示、深度カラー表示、10段の焦点距離選択）を復活。厳密許容値 0.02m、範囲サンプル上限 10,000 | §3 CAM-005 |
| 1-E VMD | 補間の帰属、分割の式、バイト順、座標変換、単位、fps、FOV範囲、件数、非カメラ節、原本保存 | 補間は**到着側キー**の規則。分割はチャンネルごとに x(u)=τ を二分法で解いてド・カステリョ分割し x・y とも正規化、範囲外や yτ∈{0,1} は密な線形キーへ退避し変更キーを報告。バイト順は定数 `VMD_CAMERA_INTERP_ORDER` に一本化（**未検証**）。書出しはブリッジ `preview_pose` の厳密な逆変換（コードで X→Y→Z 回転＋Z反転を確認）。固定試験データは MMD 既定カメラ。単位 12.5 MMD単位/m を取込・書出・ブリッジで統一。fps 写像、FOV クランプ、既定 step、`too_many_keys`、照明/影/IK 節は読み飛ばして件数報告。原本は `data/camera_clips/<id>.vmd`＋sha256 | §3 CAM-001/016、付録B |
| 1-F リグ互換 | 旧データの黙った意味変更、根拠のない機能 | 黙った移行をしない。旧 `crane`・`curve` は現行の意味のまま。新リグ種 `jib`・`spline`（centripetal Catmull-Rom α=0.5、端点複製、bake の step でサンプル）を追加。`bone_follow` は複数対象が必要なときだけ拡張形。ドローンのバンク（自動ロール）は削除。CAM-002 は固定重み（スライダーなし）。`spin` に `pitch` を追加 | §3 CAM-007〜011、CAM-002 |
| 1-G CAM-015 | keys ソースの根拠なし、inherit の意味、音声オフセット、改名時の参照切れ | `source:{kind:'preset'|'clip'}`（clip は CAM-001 の vmd_clips）。keys ソースは削除。`inherit`＝クリップ全体を平行移動して最初の姿勢の位置を直前ショット最終姿勢の位置に一致。音声オフセットは削除。プリセット改名は同一トランザクションでシーケンス参照も更新 | §3 CAM-015、CAM-014 |
| 1-H 計算の置き場所・MCP | 「同じPythonサービスを呼ぶ」が実態と不一致、WebMCP がカメラ画面に無い | MCP は HTTP ブリッジのまま。UI は移動・リグを JS でローカル計算しブラウザの Undo に積む。Python 専用の生成器（映画演出・テンプレート・類似・衝突・ディレクター）はプレビュー用エンドポイントで呼び、返ったキーをローカルで適用。`camera.html` に `webmcp.js` を追加。Parity は「同じサンプル入力に同じ出力」 | §0 P1・P4、§2.5、§2.6 |
| 1-I テスト基盤 | three の CDN 依存、GPU 表記、テストモデル、データ汚染 | `three@0.160.1` を devDependency に追加し Playwright で jsdelivr の URL をローカルへ振替。Chromium に `--enable-unsafe-swiftshader`。ブラウザーは `/opt/pw-browsers`（`CHROMIUM_PATH`）。テスト GLB は `/api/integrated-v02/upload` で登録し名前は「合成テストモデル」。テストデータを本番 `data/` に書かないため `BAI_DATA_DIR` を追加（必要な依存作業）。Node テストは `test_camera_*.cjs`・`tests/*.cjs` | §2.9 |
| 1-J CAM-018 | 指標が曖昧 | activity＝腰/背骨/胸/頭/両手/両足の平均速度を区間全体で正規化。ショットサイズは d/h（>2.5 引き、1.2〜2.5 中、<1.2 寄り）。activity 帯（≥0.5／0.2〜0.5／<0.2）で +2/+1、連続同一 −1 | §3 CAM-018 |
| 1-K その他 | 細部の不整合・欠落 | G-09 上限は **100**（v1 の64は誤り）。タイムスタンプはクライアント付与。`validate_workspace`・`validateRestore` を任意の新キー受入へ緩和。bundle 保存ジャーナルの書込順・423 `recovery_pending`・`POST /api/project/bundle/recover`。素材ID＝ファイル名＋sha256。選択状態を保存。ロールの正方向・up 縮退時・最短経路を定義。hold の挙動をコードどおり明記。補間モード数は custom・smooth を含め 15 に固定。衝突体は `{name,min,max}`。テンプレートの aspect はフレーミング補助線だけを設定。モデル前方は +Z。静的配信リストを完成し `camera_tools.json` を配信・取得。プリセットの `lens` は `fStop`・`focusDistance` のみ。台帳の各項目に `notes` を追加。P1 を言い換え。`camera_move` は `bai_camera.py` に置く | 各所 |
| 追加（v2 で発見） | JS `cross()` が2要素しか返さない | G-13 として WP-00a で修正 | §1 |

---

## 0. 全体方針（全WP共通の約束）

| # | 約束 | 理由 |
|---|---|---|
| P1 | **同じ入力サンプルに対し、JS と Python が同じ出力を返す（Parity）**。補間・カメラ移動・光学の評価関数は JS では `camera_core.js`、Python では `bai_camera.py`／`camera_focus.py` にそれぞれ1つだけ置き、他のモジュールはそれを呼ぶ。一致は共通の照合データ（fixture）で自動検証する。 | 現状 JS は3モード、Python は15モード（`camera.js:2`、`bai_camera.py:59-75`）で食い違う。 |
| P2 | 保存データは **schema 1 のまま、任意フィールドの追加のみ**。既存フィールドの意味は変えない。**黙った移行（読込時の書き換え）をしない**。旧データは読込時に既定値で「解釈」するだけで、保存しても旧形のまま残る。 | 互換性。旧 `pan`＝左右平行移動の意味も保持（操作設計 §3）。 |
| P3 | 編集は**プレビュー → 確定**の2段階。プレビューは保存データを変えない。確定は1操作＝1 Undo。外部（API/MCP）からの書き込みは revision（If-Match）必須。 | 操作設計 §5・§8。 |
| P4 | MCP（標準 `mcp_server.py`・WebMCP `webmcp.js`）は**HTTP API を呼ぶ薄い橋渡し**。画面（UI）は移動・リグ・補間を JS でローカル計算し、ブラウザ内の Undo に積み、保存ボタンで HTTP 保存する。Python にしかない生成器はプレビュー用 HTTP を呼び、返ったキーを UI でローカル適用する（§2.6）。 | 現行構造（`camera.js` がローカル編集→`POST /api/camera/project`）を壊さずに4経路を揃える。 |
| P5 | 「できない」「未読込」「判定不能」は**成功扱いしない**。数値が出せない時は `null` と理由コードを返す。代替値で埋める場合は、承認文書が代替を認めている箇所だけで、必ず代替したことを返す。 | CAM-005 契約・操作設計 §7。 |
| P6 | 構図の良し悪しを**自動で NG にしない**。出すのは事実（見切れ・衝突・距離）と任意の補助線だけ。 | 残件監査 CAM-004/017。 |
| P7 | 実GPU・実MMDでの確認は開発環境では**未検証**と記録する。SwiftShader（ソフトウェア描画）の自動テスト合格を GPU 検証と呼ばない。完成判定は §8。 | AGENTS.md 規則6・7。 |
| P8 | 1 WP ＝ 1〜数コミット。各コミットで `PHASE_E_IMPLEMENTATION_STATUS.json` の該当IDの `implementation_assessment` と `notes`（§6）を更新し、テスト結果を書く。 | AGENTS.md 規則6。 |
| P9 | 各WPは**自分が使う HTTP エンドポイント・MCP ツール・保存フィールドを自分で追加**する。後のWPの API を先に作らない。 | 循環依存の防止（指摘1-A）。 |

### 0.1 用語（本書内の固定訳）
- **キー**：`keys[]` の1要素。**区間**：あるキーから次のキーまで（BAI キーは**左キー**の補間設定を使う。VMD は**到着側キー**の補間を使う。両者を混同しない）。
- **ショット**：`sequence[]` の1要素（CAM-015）。**プリセット**：`custom_presets[]` の1要素（名前＋姿勢）。
- **ネイティブトラック**：カメラVMDを読み込んだ中間形式（`camera_vmd_codec.decode_camera_track` の戻り値、MMD座標・MMD単位）。
- **クリップ**：`vmd_clips[]` の1要素。保存済み VMD 原本の一区間への参照（CAM-001）。
- **プロジェクトキー**：`camera_project.json` の `keys[]`（BAI形式、`position`＋`target`＋縦FOV、単位 m）。
- **サンプル（samples）**：ブラウザーが実モデルを評価して作る数値列。サーバー単独では作れない（§2.6）。

### 0.2 共通の数値・座標の約束
- 長さ：BAI 1 単位 = 1 m。MMD 換算は `MMD_UNIT_PER_M = 12.5`（定数。`camera_vmd_bridge.py` に定義し、JS は `camera_vmd_local.js` に同値を定義、parity で一致確認）。
- 座標：右手系 Y 上。**モデルの前方は +Z**（モデル正面を撮る既定カメラは +Z 側に置く）。「被写体前方 x m」は被写体基準点から +Z 方向。
- FOV：BAI の `fov` は**縦方向の画角（度）**。焦点距離換算はフルサイズ 36×24mm の**センサー縦 24mm** で `fov = 2·atan(24/(2·focalMm))`。
- 補間モード：**15種で固定**。`camera_easing.py MODES` の順 `linear, hold, smooth, bezier, sine, quad, cubic, quart, quint, expo, circ, back, bounce, elastic, custom`。smooth（旧互換）と custom を含めて15。
- **hold の挙動（現行コードどおり。変更しない）**：左キー a が `hold` の区間 [a, b] では値は a。**b が中間キーなら b のフレームちょうどでも a の値**（`bai_camera.py:63-66` のループが `left.frame<=f<=right.frame` を先に満たすため）。**b が最終キーなら b のフレームで b の値**（`f>=keys[-1].frame` の早期 return、`bai_camera.py:62`、`camera.js:2`）。JS も同じ。parity fixture にこの境界を必ず入れる。
- **ロール**：`roll` は度、範囲 −180〜180。**正＝カメラの後ろから光軸方向を見て時計回り**（画面上端がカメラ右側へ傾く）。
  - 定義式：前方 `f = normalize(target − position)`、`right0 = normalize(f × (0,1,0))`、`up0 = right0 × f`、`up = cos(roll)·up0 + sin(roll)·right0`。
  - 縮退（`|f × (0,1,0)| < 1e-6`、真上/真下を向く）：`right0` は**直前に評価した姿勢の right0**（同じ評価列の前フレーム、または移動操作の開始姿勢）を `f` に直交化して使う。直前が無ければ `right0 = (1,0,0)`。
  - 補間：最短経路。`Δ = ((b − a + 540) mod 360) − 180`、`roll(t) = a + Δ·t` を (−180,180] に正規化。
  - 逆算（VMD 取込などで up が与えられた場合）：`roll = atan2(up·right0, up·up0)`。
- 角度入出力の API 単位は度。VMD 内部のみラジアン。

---

## 1. 現状の事実と、先に直すべき不整合（G-xx）

コードはあるが「つながっていない／食い違う」箇所。v2 作成時に全件をコードで再確認した。直すWPを右端に示す。

| ID | 不整合（確認済みの事実） | 証拠 | 影響 | WP |
|---|---|---|---|---|
| G-01 | JS `sample()` は linear/smooth/hold のみ。fStop を補間しない。Python は15モード＋custom＋fStop | `camera.js:2`、`bai_camera.py:59-75` | API・MCPで入れたキーがプレビューと違う動きになる | WP-00a |
| G-02 | `camera_easing.js`・`camera_cinematic.js`・`camera_vmd_preview.js`・`webmcp.js` が `camera.html` 未読込。前3つは `server.py` 静的配信リスト外 | `server.py:166`、`camera.html` の script 列 | 実装済みの計算が画面から使えない | WP-00a（必要分）、以後各WP |
| G-03 | `writeKey` がキーを丸ごと置換し、既存の `customCurve`・`fStop`（将来の追加フィールドも）を消す | `camera.js:11` | 再キーでデータ消失 | WP-00a |
| G-04 | 統合保存（bundle）が `bai-camera-before-save` を発火しない。追従設定（`focus_tracking`・`bone_follow`）は通常保存時にしか project へ入らない | `camera.js:208,210`、`camera_project_bundle_ui.js:6,18`、`camera_3d.js:90-96` | 保存→復元で追従設定が古い | WP-02 |
| G-05 | MCP `bai_camera_set` の入力スキーマが schema/fps/duration/keys のみ（`additionalProperties:false`）。MCP保存で sequence/rig/presets 等が**消える**。`bai_camera_get` は revision を返さない | `mcp_server.py:146,149-150`、`webmcp.js:10-11` | MCP保存でデータ消失・競合検出不能 | WP-02 |
| G-06 | `bai_camera.read` が読込・検証失敗時に**黙って既定値を返す**。その後の保存で元ファイルが既定値で上書きされうる | `bai_camera.py:76-78` | データ消失（重大） | WP-02 |
| G-07 | フォーカス距離の定義が JS（光軸方向深度）と Python（3Dユークリッド距離）で違う。Python は合焦近傍（focus）分類も無い | `camera_focus_consistency.js:15-18`、`camera_focus.py:21-23` | 単一診断と区間診断が不一致（契約違反） | WP-00a |
| G-08 | F値の許容範囲が4通り（UI入力 0.7–32、JS診断 0.5–64、Python診断 0.5–64、保存 0.7–64、DOF 0.7–32） | `camera.html` `#focus-aperture`、`camera_focus_consistency.js:6`、`camera_focus.py:12`、`bai_camera.py:6`、`camera_dof.js:5` | 入力できるのに保存できない等 | WP-00a |
| G-09 | `easingPresets` 上限：上位文書 **100件**、実装64件 | `KEY_INTERVAL_EASING_AND_LENS_20261018_JA.md`、`bai_camera.py:38` | 仕様不一致。**上位文書の100が正**（v1 の「64を正」は誤り） | WP-05 |
| G-10 | `camera_vmd.py`（旧、補間 0–127 必須）と `camera_vmd_codec.py`（0–255 を受理）で範囲が違う。旧は server 未使用（テストのみ） | 各ファイル | 混乱。旧は削除せず「非推奨・server未使用」と docstring に明記 | WP-13 |
| G-11 | `test_camera_lens.js`・`test_camera_lens_shots.js` が実行すると失敗（exit 1、存在しない関数を呼ぶ孤立テスト） | v2 作成時に `node` で実行して確認 | テスト結果の信用を下げる | WP-00a |
| G-12 | `POST /api/camera/project` は `If-Match` 任意（無ければ無条件上書き）。`sequence/edit` は revision 検査なし。bundle は必須。bundle 保存後に `camera.js` の `serverRevision` が更新されず、次の通常保存が 409 になる | `server.py:432-437`、`server.py:415-426`、`server.py:363-372`、`camera.js:210` | 古い画面からの上書き・誤った競合 | WP-02 |
| G-13 | JS の `cross()` が**2要素しか返さない**（z成分欠落）。`moveCamera` の `orbit`・`tilt` が NaN を出し、2D プレビューの up も壊れる（`rot([0,0.6,5],[0,1,0],0.5)` → z=NaN をnodeで確認） | `camera.js:93`（`cross`）、`camera.js:96`（`moveCamera`）、`camera.js:87`（`draw`） | 画面のドラッグ操作・ボタン操作の結果が不正 | WP-00a |

**G-xx の決定事項**
- G-03：`camera_core.mergeKey(existing, edit)` に置換（§2.1）。
- G-06：§2.7。
- G-07：**Python を光軸方向深度に合わせる**（契約が「光軸方向深度」を正本と明記）。分類も JS と同じ5分類（`near_blur`・`in_focus`・`acceptable`・`far_blur`・`unknown`）に揃える。既存 `GET /api/camera/focus` の応答キー（`classification` 等）は残し、値の定義だけ直す（`classification` の値は旧 `within/front/back` に加え `focus`・`unknown` を取りうる。`method` を `'optical-depth-coc'` に変更）。
- G-08：保存・API・診断の許容範囲を **0.7–64** に統一。UI の F値入力も `max=64`。DOFプレビュー（`camera_dof.js`）だけは 0.7–32 にクランプし、クランプ時は「プレビューはF32までの近似」と表示（値自体は保存値のまま）。
- G-09：上限を **100** に変更（`bai_camera.py:38` の `64`→`100`、テスト追加）。
- G-11：古い2ファイルは `tests/legacy/` へ `git mv` し、実行対象から外す（削除しない。履歴保持）。`tests/legacy/README` は作らず、コミット本文に理由を書く。
- G-12：§2.4。
- G-13：`camera_core.js` の正しいベクトル関数（`cross` は3要素）へ置換し、`camera.js` 内の重複実装を削除。

---

## 2. 横断設計

### 2.1 JS 共通コア `camera_core.js`（WP-00a）
- 形式：UMD（`camera_rig.js` と同じ書き方：`(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.BAICameraCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){...})`）。ブラウザでは `window.BAICameraCore`、Node では `require('./camera_core.js')`。
- 中身（純関数のみ。DOM・Three.js 参照禁止）：
  - ベクトル：`add, sub, scale, dot, cross, norm, length`（`cross` は3要素）。
  - `ease(mode, t, customCurve)`：`camera_easing.js` の実装を移す。`camera_easing.js` は `BAICameraCore.ease` 等を呼ぶ互換ラッパーに変える（`window.BAICameraEasing` は残す）。
  - `MODES`：§0.2 の15種（`camera_easing.py MODES` と同順、parity で一致検査）。
  - `sampleKeys(keys, frame) → {frame, position, target, fov, roll, fStop, focusDistance, focusDistanceSource}`：Python `bai_camera.sample` と同じ規則（§0.2 の hold・範囲外は端キー）。補間対象：`position`・`target`・`fov`・`fStop`（片側のみなら欠けた側 4.0。両側欠けは 4.0 を返す）・`roll`（片側欠けは 0、最短経路）・`focusDistance`（片側欠けは 4.0、両側欠けは 4.0 で `focusDistanceSource:'default'`、それ以外 `'key'`）。WP-05 でトラック別補間を追加。
  - `mergeKey(existing, edit) → key`：**既存キーのフィールドを保ったまま** `edit` の項目だけ上書き。`interpolation` を `custom` 以外に変えたときだけ `customCurve` を削除。許可フィールド（`KEY_FIELDS`）以外は捨てる（`frame, position, target, fov, interpolation, customCurve, fStop, roll, focusDistance, trackInterpolation, trackCustomCurve`。WPが進むごとに追加）。
  - `focalToVerticalFov(mm, sensorH=24)`、`verticalFovToFocal(deg, sensorH=24)`：`camera_lens.js` から移す（`camera_lens.js` は互換ラッパー、`presets` は `camera_lens.js` に残す）。
  - `upVector(pose, prevRight0=null) → {up, right0}`：§0.2 のロール定義。
  - `moveCamera(pose, operation, amount, opts) → pose`：Python `bai_camera.camera_move` と同じ結果（WP-00a は既存4種 `orbit, dolly, pan, tilt` のみ。WP-06 で拡張）。
  - `opticalDepth(position, target, point) → number`：光軸方向深度（m）。カメラ背後は負値。
  - `thinLens({focalMm, fNumber, focusM, cocMm}) → {nearM, farM, hyperfocalM} | {error:'focus_inside_focal'}`：フォーカス設計 §4 の式（mm 統一、`farM` は分母≤0 で `Infinity`）。
  - `evaluateOptics(input) → OpticsResult`：§3 CAM-005 で定義する**唯一の光学評価関数**（WP-04 で追加）。
- `camera.js` の `sample()` は `BAICameraCore.sampleKeys(project.keys, f)` を呼ぶだけにする。`moveCamera`・`dot/norm/cross` の重複実装は削除。
- `camera.html` に `<script src="/camera_core.js" defer>` を **`camera_vmd_local.js` より前**（最初の defer）に置く。`server.py` 静的配信リストに `/camera_core.js` を追加（§2.11）。

### 2.2 照合テスト（Parity fixture）（WP-00a で作成、各WPで追加）
- 定義：「同じサンプル入力に同じ出力」。計算をどちらで行うかではなく、同じ入力で両実装の出力が一致すること。
- `tests/fixtures/camera_parity.json`：`{schema:1, cases:[{id, kind, input, expected}]}`。`kind` は `ease`・`sample`・`move`・`optics`・`rig`・`vmd_pose` 等。
  - WP-00a 時点で 60 件以上：15モード×代表 t（0.1, 0.5, 0.9）、custom、hold の中間キー境界と最終キー境界、fStop 片側、範囲外フレーム、`move` 既存4種（orbit/tilt は G-13 の回帰）。
  - WP-04 で `optics`、WP-05 でトラック別、WP-06 で roll と新操作、WP-07 で rig、WP-13 で `vmd_pose` を追加。
- 生成：`tools/gen_camera_parity.py` が `input` を Python 実装で評価して `expected` を書く。**期待値は Python で生成した値をコミット**し、以後は両方がそれに一致すること。
- Python：`tests/test_camera_parity.py`（許容誤差 1e-9。`vmd_pose` は float32 量子化があるので 1e-5）。
- Node：`tests/test_camera_parity.cjs`（`node:test`、同じ許容誤差）。

### 2.3 保存データの追加フィールド（schema 1 のまま・すべて任意）
`bai_camera.validate` が受け付け、未指定なら出力にも出さない（旧データと同じ形で保存される）。**追加するWP以外で先に受け付けない**（P9）。

| 場所 | フィールド | 型・範囲 | 既定（未指定時の解釈） | WP |
|---|---|---|---|---|
| keys[] | `focusDistance` | 数値 0.01〜10000（m） | 4.0（`focusDistanceSource:'default'`） | WP-04 |
| keys[] | `trackInterpolation` | `{position?, target?, fov?, roll?, fStop?, focusDistance?}` 各値は15モード名。`custom` のトラックは `trackCustomCurve` に同名キー必須 | なし（`interpolation` を全トラックに使う） | WP-05 |
| keys[] | `trackCustomCurve` | `{トラック名: [x1,y1,x2,y2]}`（`easing_handles` と同じ検証） | なし | WP-05 |
| keys[] | `roll` | 数値 −180〜180（度、§0.2） | 0 | WP-06 |
| （トップ） | `easingPresets` | 既存。上限 64→**100** | — | WP-05 |
| rig | 拡張（§3 CAM-007〜010） | 型ごと | 旧形は現行の意味 | WP-07 |
| bone_follow | `targets` | 2〜8件のときだけ（§3 CAM-011） | 無ければ旧単一形 | WP-08 |
| custom_presets[] | `tags` | 文字列配列（各1〜24文字、最大16個、NFKC後の重複不可、前後空白除去） | `[]` | WP-10 |
| custom_presets[] | `favorite` | bool | false | WP-10 |
| custom_presets[] | `lens` | `{fStop?: 0.7–64, focusDistance?: 0.01–10000}`（**この2つだけ**。焦点距離は `pose.fov` が正） | なし | WP-10 |
| custom_presets[] | `pose.roll` | −180〜180 | 0 | WP-10 |
| custom_presets[] | `createdAt`/`updatedAt` | ISO 8601 UTC 文字列 `YYYY-MM-DDTHH:MM:SSZ`（**クライアントが付与**。サーバーは形式だけ検証し書き換えない） | なし | WP-10 |
| custom_presets[] | `category` | 文字列（CAM-013 のカテゴリID `fight|mv|horror|arch|product|sns` または `custom`） | `custom` | WP-11 |
| （トップ） | `preset_history` | `[{name, usedAt}]` 最大20件、新しい順、`usedAt` はクライアント付与 | `[]` | WP-10 |
| sequence[] | `source` | `{kind:'preset', name}` または `{kind:'clip', clip, from}` | 無ければ旧形 `preset` を使う | WP-12（preset）、WP-13（clip） |
| sequence[] | `inherit` | bool（clip ショットのみ有効） | false | WP-13 |
| （トップ） | `vmd_clips` | §3 CAM-001 のクリップ参照一覧（最大128） | `[]` | WP-13 |
| （トップ） | `collision` | `{enabled:bool, minDistance:0.05–5, floor:bool, colliders:[{name, min:[x,y,z], max:[x,y,z]}]}`（colliders 最大64、名前1〜48文字、`min<max` 各軸） | 無効 | WP-15 |

- 既存上限は変えない：`custom_presets` 64、`sequence` 256、`keys` 5000。
- **未知フィールドの扱い（G-06 と同時に WP-02 で導入）**：対象はトップレベル・`keys[]`・`custom_presets[]`・`sequence[]` の4階層（それ以下は既存の各 validator のまま）。
  - **読込（ファイル→メモリ）**：`bai_camera.read(path)` は未知フィールドを破棄し、破棄したパスを `dropped_fields: ["keys[3].foo", "bar"]` として返す。`GET /api/camera/project?envelope=1` は `{project, revision, dropped_fields}`（`dropped_fields` は空でも出す。追加キーなので既存の利用者は壊れない）。非 envelope の GET は従来どおり project のみ。UI は空でなければ「保存すると次の項目が失われます：…」を表示する。ファイルは書き換えない。
  - **書込（API→ファイル）**：未知フィールドがあれば 400 `unknown_field`（`error` に最初のパス）。`bai_camera.validate(payload, strict=True)` が書込経路、`strict=False` が読込経路。
- 既知フィールドの一覧は `bai_camera.TOP_FIELDS`・`KEY_FIELDS`・`PRESET_FIELDS`・`SHOT_FIELDS`（定数）に置き、各WPで追加する。MCP の `bai_camera_set` 入力スキーマはこの定数と一致することをテストする（§2.5）。

### 2.4 リビジョン・応答形・エラーコード（WP-02 で導入、以後全WP）
**revision の値**：`camera_project_revision.revision(validated_project)`（既存、sha256 の16進）。bundle は `project_state_bundle.bundle_revision`（既存）。

**保持の規則**
- `camera.js`：読込時 `GET /api/camera/project?envelope=1` の `revision` を `serverRevision` に保持（既存）。更新するのは①通常保存の応答 `_revision`（既存）②再取得（`refreshSequenceFromServer`、既存）③bundle 保存応答の `camera_revision`（**新規**、イベント `bai-camera-revision` で受け取る）④bundle 復元時の `camera_revision`（**新規**、bundle GET 応答に追加）。
- `camera_project_bundle_ui.js`：**ページ読込時**に `GET /api/project/bundle` して `bundleRevision` と `combination`・`workspace` の読込時コピーを保持する（現行の「保存直前に GET して最新 revision を使う」方式は競合を検出できないため廃止）。保存は保持した `bundleRevision` を If-Match に送り、応答 `revision` で更新。409 は「他の画面で変更されました。再読込してください」を表示し自動再試行しない。
- 通常保存が bundle revision を変える問題：`camera.js` は通常保存時にヘッダー `X-Bai-Bundle-Revision: <bundle UI の保持値>` を付ける。サーバーは保存前の bundle revision がこれと一致した場合だけ応答に `bundle_revision`（保存後の値）を入れ、不一致なら `bundle_revision:null` を入れる。`camera.js` はイベント `bai-bundle-revision` で bundle UI に渡し、`null` なら bundle UI は「統合保存の前に再読込が必要です」と表示し統合保存ボタンを無効化する。
- MCP：書込ツールはすべて `revision` 引数（文字列）を**必須**にする。読取ツールの結果に `revision` を含める。

**送信側の変更**
- `mcp_server.py`：`def api(path, payload=None, revision=None, method=None)`。`revision` があれば `If-Match` ヘッダーに付ける。HTTPError 時は本文 JSON を解析し `ValueError(f"HTTP {code} {error_code}: {error}")` を投げる（`error_code` が無い旧応答は従来の文字列）。
- `webmcp.js`：`async function request(path, options={}, revision)`。`revision` があれば `headers['If-Match']`。`!r.ok` 時は本文を読み `{status, error, error_code}` を含む Error を投げる。

**既存エンドポイント（形を壊さない）**
- エラー応答は従来どおり `{"error": "<文字列>"}` に **`"error_code": "<コード>"` を追加**するだけ。`server.py` の `bad(status, msg, code=None)` に引数を足す（`code` 省略時は `error_code` を出さない＝他機能は不変）。
- `camera.js`・`camera_project_bundle_ui.js` は `data.error` を読む（`camera.js:55,73,74,75,76,210`、`camera_project_bundle_ui.js:4` で確認）ので壊れない。
- 成功応答も従来形を維持し、追加キーのみ：`POST /api/camera/project` → `{...project, _revision, bundle_revision}`。`POST /api/project/bundle` → `{ok, schema, revision, camera_revision}`。`GET /api/project/bundle` → 従来＋`camera_revision`、`recovery_pending`。`POST /api/camera/sequence/edit` → `{ok, sequence, revision}`。
- `POST /api/camera/project` は **If-Match 必須**（無ければ 428 `revision_required`、不一致 409 `revision_conflict`）。
- `POST /api/camera/sequence/edit`：`expected_sequence` を従来どおり必須。追加で `revision`（本文の任意キー、または If-Match）があれば照合し不一致は 409 `revision_conflict`。`expected_sequence` 不一致は 409 `sequence_conflict`（現行は 400 → 409 に変更。`error` 文字列は同じ）。

**新規エンドポイント**
- 成功：`{"ok": true, "revision": "<保存済みプロジェクトの revision>", "result": {...}}`。
- 失敗：`{"ok": false, "error": "<日本語または英語の説明>", "error_code": "<コード>"}`（`error` は既存と同じく文字列）。
- 書込系は If-Match 必須（428/409）。

**エラーコード一覧**（英小文字スネーク。付録Cに全一覧）：`revision_required`(428)、`revision_conflict`(409)、`sequence_conflict`(409)、`invalid_payload`(400)、`unknown_field`(400)、`invalid_range`(400)、`too_many_keys`(400)、`keys_in_range`(409)、`preset_in_use`(409)、`not_found`(404)、`payload_too_large`(413)、`camera_project_invalid`(422)、`confirmation_required`(400)、`recovery_pending`(423)、`model_not_loaded`(409)、`bone_missing`（結果内の理由）、`focus_inside_focal`（結果内の理由）、`vmd_unsupported`(400)、`vmd_truncated`(400)、`clip_missing`(409)。

### 2.5 MCP・WebMCP（WP-02 で基盤、各WPでツール追加）
- **標準MCP も WebMCP も HTTP API の橋渡し**（P4）。独自の計算・保存をしない。
- **ツール定義の一本化**：新規 `camera_tools.json`（リポジトリ直下）にカメラ・bundle 系ツールを定義する。
  ```json
  {"schema":1,"tools":[{"name":"bai_camera_get","description":"...","method":"GET","path":"/api/camera/project?envelope=1",
    "query":[],"body":"none","revision":"none","readOnly":true,"scope":"camera",
    "inputSchema":{"type":"object","properties":{},"required":[],"additionalProperties":false}}]}
  ```
  - `method`：GET/POST。`query`：GET で URL に入れる引数名の配列。`body`：`none`／`args`（引数から `revision` を除いた全部を本文）／`args.<名前>`（その引数だけを本文）。`revision`：`none`／`required`（引数 `revision` を If-Match に）／`optional`。`scope`：`camera`（カメラ画面と main 両方で登録）／`main`。
  - `mcp_server.py`：起動時に `camera_tools.json` を読み、`TOOLS` に追加、`run()` は汎用ディスパッチ（既存の手書き `bai_camera_*` 分岐は削除して JSON に移す）。
  - `webmcp.js`：`fetch('/camera_tools.json')` で取得して `def()` 登録（取得失敗時は `mixamoWebMcpDiagnostics.errors` に記録し、他のツールは登録を続ける）。
  - `server.py` 静的配信に `/camera_tools.json`（`application/json`）を追加。
  - テスト：`tests/test_camera_tool_parity.py`（JSON の全ツールが `mcp_server` の tools/list に同じスキーマで出る。`bai_camera_set` のプロパティ集合 = `bai_camera.TOP_FIELDS` ∪ {`revision`}）、`tests/test_camera_tools_webmcp.cjs`（`vm` で `webmcp.js` を偽の `document.modelContext`・偽 fetch と共に実行し、登録名集合が JSON と一致）。
- **WebMCP をカメラ画面へ**：`camera.html` に `<script src="/webmcp.js" defer data-webmcp-scope="camera">` を `camera_project_bundle_ui.js` の後に追加。`webmcp.js` は `document.currentScript.dataset.webmcpScope` が `camera` のとき `scope:'camera'` のツールだけ登録する（既存の main 用ツールは `rows`・`chain` 等 main 画面のグローバルに依存するため登録しない）。main 画面（`index.html`）では従来どおり全ツール＋camera スコープのツールを登録。
- **ブラウザーが必要なツール**（フォーカス・追従・POV 等）：WebMCP のハンドラーは、カメラ画面で `window.BAICameraDebug` があれば `samples` を自動で集めて HTTP に付ける（`camera_tools.json` の `"samples":"browser"` 指定）。標準MCP は `samples` を集められないので、サーバーは §2.6 の規則で `keys_only` 結果または `model_not_loaded` を返す。**同じ samples なら4経路で同じ結果**。
- **WP-02 で追加するツール**：`bai_camera_get`（`{project, revision, dropped_fields}` を返すよう変更）、`bai_camera_set`（全フィールド＋`revision` 必須に拡張、G-05）、`bai_camera_sample`、`bai_camera_sequence_evaluate`、`bai_camera_sequence_edit`（`revision` 任意を追加）、`bai_project_bundle_get`、`bai_project_bundle_save`（引数 `{bundle:{schema,combination,camera,workspace?}, revision}`）、`bai_camera_keys_merge`、`bai_camera_keys_apply`、`bai_camera_focus_commit`（WP-04 の確定を MCP から行う。実体は keys/merge）。WP-04 の読取ツールは WP-04 で既存方式（手書き）で追加し、WP-02 で JSON へ移す。
- `bai_camera_set` の互換：従来の引数（schema/fps/duration/keys）はそのまま有効。`revision` が新たに必須になる（無ければ 428）。これは**データ消失防止のための意図的な非互換**で、`MCP_SETUP_JA.md` に移行手順（先に `bai_camera_get` で revision を得る）を書く。
- MCP に出さない操作（安全上・明記）：`POST /api/camera/project/reset`、`POST /api/project/bundle/recover`。UI と HTTP のみ。

### 2.6 計算の置き場所（UI ローカル計算と Python プレビュー）
| 計算 | UI（画面） | Python（HTTP/MCP） | parity |
|---|---|---|---|
| キー補間 `sampleKeys` | `camera_core.js`（ローカル） | `bai_camera.sample` | ○ |
| カメラ移動 `moveCamera` | `camera_core.js`（ローカル、ドラッグ中プレビュー、確定で1 Undo） | `bai_camera.camera_move`（`POST /api/camera/move`） | ○ |
| リグ評価・ベイク | `camera_rig.js`（ローカル） | 新規 `camera_rig.py`（`POST /api/camera/rig/bake`） | ○ |
| 光学評価 `evaluateOptics` | `camera_core.js`（色分け・単一・範囲・DOF の全部） | `camera_focus.py`（`POST /api/camera/focus/evaluate`） | ○ |
| 映画演出・テンプレート・類似分類・衝突・ディレクター | **プレビュー HTTP を呼び、返ったキー／提案を UI でローカル適用**（1 Undo） | Python のみ（`camera_cinematic.py`・`camera_templates.py`・`camera_similarity.py`・`camera_collision.py`・`camera_director.py`） | —（実装が1つ） |
| 実モデルのボーン座標・包囲箱 | `camera_3d.js` が評価して `samples` を作る | 作れない。`samples` を受け取るだけ | — |

- **プレビュー HTTP の共通引数**：`project`（任意。UI の未保存の編集状態を送る。`validate(strict=True)` するが保存しない）。無ければ保存済みファイルを使う。結果に `based_on: 'request'|'saved'` を入れる。`samples`（任意）。
- **確定（MCP・HTTP 経由の書込）**：プレビュー結果のキーを `POST /api/camera/keys/apply`（区間挿入）または `POST /api/camera/keys/merge`（1キー部分更新）で書く。UI はこれを使わずローカル適用→通常保存。
  - `keys/apply` 本文：`{keys:[key...], from, to, mode:'insert'|'replace', revision}`。`insert` は `[from,to]` に既存キーがあれば 409 `keys_in_range`（現行の UI ベイクと同じ規則、`camera.js:124-125`）。`replace` は区間内の既存キーを削除してから挿入。結果 `{ok, revision, result:{inserted, removed}}`。
  - `keys/merge` 本文：`{frame, fields:{...}, create:true|false, revision}`。`bai_camera.merge_key`（`camera_core.mergeKey` と同仕様、parity）。`create:true` かつキーが無いときは `sample(frame)` の姿勢に `fields` を重ねて新規キー。
  - 両方とも WP-02 で追加。

### 2.7 読み込みエラー（G-06、WP-02）
- `bai_camera.read(path) → (project, dropped_fields)`（戻り値を変えるので呼び出し元 `server.py`・`project_state_bundle.read_bundle`・テストを同時に直す。互換のため `read_project(path)` を新設し、旧 `read` は `read_project(path)[0]` を返す薄い関数として残す）。
  - **ファイルが無い**（`FileNotFoundError`）：`DEFAULT` を返す。**ファイルには書かない**（ユーザーが保存するまで作らない）。
  - **読めない／JSON 不正／検証失敗**：例外 `CameraProjectInvalid(message, backup_name)` を投げる。投げる前に退避：
    - `sha8 = sha256(生バイト列)[:8]`。`data/` に `camera_project.invalid-<sha8>-*.json` が既にあれば**新たに作らない**（同じ内容の退避は1つだけ）。無ければ `camera_project.invalid-<sha8>-<YYYYmmddTHHMMSSZ>.json`（UTC、コロンなし＝Windows でも有効）に生バイト列をコピー。元ファイルは動かさない・書き換えない。
- サーバー：`GET /api/camera/project`（両形式）・`/api/camera/sample`・`/api/camera/focus`・`/api/camera/sequence/evaluate`・`GET /api/project/bundle` は 422 `{error:'camera project is unreadable', error_code:'camera_project_invalid', backup:'<退避ファイル名>'}`。書込系も 422（上書きさせない）。
- UI：`camera.js` 読込時に 422 なら編集を開始せず、「カメラ保存データを読めませんでした。元ファイルはそのまま、退避コピー：<名前>。［初期状態から始める］」を表示。ボタンは確認ダイアログ（「現在のファイルを初期状態で置き換えます。退避コピーは残ります」）の後 `POST /api/camera/project/reset`。
- `POST /api/camera/project/reset`：本文 `{"confirm":"reset-camera-project"}` 必須（違えば 400 `confirmation_required`）。退避が存在することを確認（無ければ作る）してから `DEFAULT` を保存。応答 `{ok:true, revision, result:{backup}}`。If-Match は不要（不正ファイルには revision が無い）。MCP には出さない（§2.5）。
- テスト（`tests/test_camera_project_read_errors.py`）：ファイル無し→既定値・ファイル未作成、不正 JSON→422・退避1件・元ファイル不変、同じ不正内容で2回→退避は1件のまま、内容を変えて不正→2件目、reset の確認文字列なし→400、reset 後は正常読込、未知フィールド→`dropped_fields`、書込の未知フィールド→400 `unknown_field`。

### 2.8 統合保存（プロジェクト状態の保存・復元）の完成（WP-02）
`PHASE_E_PROJECT_STATE_ROUNDTRIP_DESIGN_JA.md` の残りを埋める。vmd_clips・画面レイアウトはそれぞれ WP-13・WP-17 が自分で追加する（P9）。

1. **保存前イベントの統一（G-04）**：`camera.js` に `collectCameraState()` を作り、通常保存（`$('save').onclick`）と bundle スナップショット（`bai-camera-bundle-snapshot`）の**両方**がこれを呼ぶ。`collectCameraState()` は `bai-camera-before-save` を同期発火（`detail.project` に clone を渡し、ハンドラーがそれを書き換える）してから、その clone を返す。ハンドラーが例外を投げたら保存を中止し理由を表示。
2. **workspace の拡張**（`data/project_state.workspace.json`。既存 `{frame, asset, clip}` は必須のまま、以下を任意追加）：
   ```json
   {"frame":0,"asset":"abc.glb","clip":0,
    "assetRef":{"filename":"abc.glb","sha256":"<64桁>"},
    "timelineView":{"start":0,"size":300},
    "autoKey":false,
    "selection":{"keyFrame":null,"presetName":null,"shotIndex":null},
    "focusTest":{"enabled":false,"viewMode":"normal","targetMarker":"face","boneName":"",
                 "circleOfConfusionMm":0.03,"strictToleranceM":0.02,"showNearFarPlanes":true,"rangeStep":1},
    "dofPreview":false,
    "framing":{"enabled":false,"mode":"full","aspect":1.7778,"margin":5,
               "guides":{"thirds":false,"safe":false,"headroom":false}}}
   ```
   - `focusTest.viewMode`：`normal|color`。`targetMarker`：`face|eyes|chest|hips|bone`。`circleOfConfusionMm` 0.001–0.1。`strictToleranceM` 0.001–1。`rangeStep` 1–1000。
   - `framing.mode` は現行 `#framing-mode` の値、`aspect` は 0.2–5、`margin` は 0–40（%）。`guides` は WP-15 で使う（WP-02 では保存だけ）。
   - `selection`：選択キーのフレーム・選択プリセット名・選択ショット番号。復元時、該当が無ければ `null` にして警告。
   - 再生中フラグは保存しない（復元時は停止状態）。
   - 「再生範囲」：現行 UI には独立した再生範囲機能が無く、あるのはタイムラインの表示範囲（`range-start`/`range-size`）。**表示範囲を `timelineView` として保存**し、独立した再生範囲は新機能になるため作らない。
   - 「メイン画面状態」：メイン画面の編集状態はコンビネーション（`project_state.json` の timeline/history/cursor、既存 bundle に含まれる）。bundle 保存・復元の後に既存 `sync_bump()` を呼び、メイン画面のライブ同期で再読込させる。メイン画面の追加 UI 状態は保存しない（新機能になるため）。
   - **`validate_workspace` を緩和**：必須 `{frame, asset, clip}`、上記任意キーのみ許可（それ以外は `unknown_field`）。`camera_project_bundle_ui.js` の `validateRestore` も任意キーを受け入れ、各任意キーの型だけ確認する。
3. **素材 ID＝ファイル名＋sha256**：新規 `GET /api/camera/asset-ref?name=<ファイル名>` → `{ok, revision:null, result:{filename, sha256, bytes}}`（`catalog_combined()` に登録済みの GLB/VRM のみ。未登録 404 `not_found`）。保存時に `assetRef` を付ける。復元時：
   - ファイルが無い → モデルを読み込まず「モデルが見つかりません：<名前>」。別モデルへ置き換えない。
   - sha256 不一致 → 「同名ですが中身が保存時と違います」を表示し［このまま読み込む］［中止］を選ばせる（自動で選ばない）。
   - `assetRef` の無い旧 workspace → ファイル名だけで照合し「旧形式のため中身の照合なし」と表示。
4. **原子的保存とジャーナル**（`project_state_bundle.save_bundle` を置換）：
   - 書込順：①全体を検証 ②`txid`（UTC 時刻＋乱数8桁）を決め、既存の3ファイル（camera・workspace・combination）を `<name>.bak-<txid>` にコピー ③`data/.bundle-journal.json` を書き fsync：`{schema:1, txid, startedAt, files:[{target, tmp, backup|null}]}`（`backup:null` は保存前に存在しなかったファイル）④3つの `<name>.tmp-<txid>` を書き fsync ⑤`os.replace` を camera → workspace → combination の順 ⑥ジャーナル削除 ⑦バックアップ削除。
   - ジャーナルが残っている間（電源断・例外）：カメラ・コンビネーション・bundle の**全書込エンドポイント**（`POST /api/camera/project`、`/api/project`、`/api/project/bundle`、`/api/camera/sequence/edit`、本書で追加する書込系すべて）は 423 `recovery_pending`。GET は通常どおり返し、bundle GET に `recovery_pending:true`。
   - `POST /api/project/bundle/recover`：本文 `{"action":"restore_backup"|"keep_current","confirm":true}`。`restore_backup` は backup のあるファイルを backup で置き換え、`backup:null` のファイルは削除。`keep_current` は現状を採用。どちらもジャーナル・バックアップ・tmp を削除。応答 `{ok, revision:<bundle revision>, result:{action}}`。UI は bundle 欄に「前回の保存が途中で止まりました」と2択ボタン（自動では選ばない）。
   - 既存テスト `test_bundle_snapshot_consistency.py` は `server.py` のソース文字列 `result['revision']=bundle_revision(read_bundle(...))` を検査している。この行を変える場合は同テストを同じコミットで更新し、理由をコミット本文に書く。
   - 単一ファイル保存（`bai_camera.save`）も tmp を `<name>.tmp-<乱数>` にする（現行 `.tmp` 固定は同時保存で衝突しうる）。
5. **追従設定の保存先**：`bone_follow`・`focus_tracking` は project（G-04 修正で bundle にも入る）。localStorage `bai-camera-follow-v1` は「プロジェクト未保存時の下書き」に限定し、project に値があれば project を優先。
6. **テスト**：`tests/test_project_bundle_roundtrip.py`（保存→モジュール再 import 相当の初期化→読込→全フィールド比較、ジャーナル残存時の 423 と recover 2種、sha256 不一致、素材欠損、未知フィールド、revision 競合、bundle 保存後の `camera_revision` で通常保存が通る、`X-Bai-Bundle-Revision` 不一致で `bundle_revision:null`）、`tests/test_camera_revision_api.py`（428/409、sequence/edit の revision 任意、`error_code` 追加で `error` が残る）、`tests/test_camera_tool_parity.py`、`tests/test_camera_tools_webmcp.cjs`、Playwright `tests/camera-ui.test.cjs` に「bundle 保存→ページ再読込→bundle 復元→`readState` の全値一致」「422 画面表示」。

### 2.9 実ブラウザーテストの土台（WP-03）
- 新規 `tests/camera-ui.test.cjs`（`tests/studio-ui.test.cjs` と同じ起動方式：実サーバーを子プロセスで起動し Playwright Chromium で操作、`node:test`）。
- **テストデータの隔離（必要な依存作業）**：`server.py` に環境変数 `BAI_DATA_DIR` を追加（未設定時は従来の `BASE/'data'`）。テストは一時ディレクトリを作り、`integrated_v02/catalog.json` に `{"models":[],"motions":[]}` を置いてから起動する。理由：テストが本番 `data/` を書き換えないため（非破壊原則）。要件ID：WP-03 全体（CAM-003〜018 の実ブラウザー検証の前提）。
- **three の取得**：`package.json` の devDependencies に `"three": "0.160.1"`（`camera.html` の importmap と同じ版、完全一致）。テストで `page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**', route => route.fulfill({path: node_modules/three/<残りのパス>}))` として CDN を使わない。
- **Chromium**：`chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, args:['--enable-unsafe-swiftshader']})`。開発環境ではブラウザーが `/opt/pw-browsers` にある（`PLAYWRIGHT_BROWSERS_PATH`、`CHROMIUM_PATH` で上書き可）。
- WebGL は SwiftShader で動かす。**これは GPU 実描画の検証ではない**。テスト結果に `webgl_renderer`（`WEBGL_debug_renderer_info` の `UNMASKED_RENDERER_WEBGL`）を記録し、`SwiftShader`・`llvmpipe` を含めば「GPU未検証」と出力する。
- **テスト用モデル**：`tools/make_test_glb.py`（標準ライブラリのみ）で、2ボーン（`hips`→`head`）・数十頂点・30フレームの回転アニメ1本のスキン付き GLB を生成し `tests/fixtures/synthetic_test_model.glb` に置く（数KB。原本素材ではない）。テストは `POST /api/integrated-v02/upload?name=合成テストモデル.glb&kind=model` で登録し、カタログ上の名前は「合成テストモデル」。ボーン名は CAM-011 の分類で `hips`・`head` に解決される名前にする。
- 読み取り専用デバッグ API `window.BAICameraDebug`（`camera.js` に新設）：`getState() → {frame, contentVersion, pose, lens:{focalMm, fNumber, focusM}, optics:<最後の OpticsResult>, keysCount, dirty, serverRevision}`、`collectFocusSamples({start,end,step})`（WP-04）。書込関数は置かない。
- 共通ヘルパー（テストファイル内）：`startServer()`、`loadCameraPage(page)`、`registerTestModel(page)`、`setFrame(page,f)`、`readState(page)`。
- Node テストの命名：既存のルート `test_camera_*.cjs` はそのまま。新規は `tests/test_camera_<対象>.cjs`（単体）と `tests/camera-ui.test.cjs`（Playwright）。`package.json` に `"test:camera": "node --test tests/test_camera_*.cjs test_camera_*.cjs"`、`"test:camera-ui": "node --test tests/camera-ui.test.cjs"` を追加。
- WP-03 の受け入れ：テスト用 GLB を登録→撮影画面で選択→Scene View と Camera View の両方に描画（canvas の非背景ピクセル数 > 0）→フレーム変更でアニメーション時刻が同期（`bai-camera-frame` 後のボーン位置が Python 生成時の期待値と 1e-3 以内）。

### 2.10 状態バージョンとキャッシュ無効化（CAM-005 契約の実装方法、WP-04）
- `camera.js` に単調増加の `contentVersion` を持たせ、**内容**が変わったら +1：キー編集・補間変更・VMD/通常キー切替・VMD 追従 ON/OFF・ショット変更・レンズ/F値/合焦距離の変更・追従 ON/OFF・追従対象変更・モデル/クリップ変更・フォーカステスト設定変更・Undo/Redo・再取得/復元。
- **フレームは別の値**として扱う（フレーム変更では `contentVersion` を増やさない）。キャッシュと非同期結果のキーは `(contentVersion, frame)`。
- 診断・色分け・DOF・範囲診断はすべて `(contentVersion, frame)` を受け取り、描画・反映の直前に現在値と一致しなければ結果を捨てる。範囲診断は開始時の `contentVersion` を保持し、途中で変わったら中止して「設定が変わったため中止しました」を表示。

### 2.11 静的配信リスト（`server.py:166`）
現行15ファイルに、各WPで次を追加する（カメラ画面が読む全ファイルを網羅）：`/camera_core.js`（WP-00a）、`/camera_easing.js`（WP-00a、互換ラッパーとして読込）、`/webmcp.js`（既存の個別ルートあり、追加不要）、`/camera_tools.json`（WP-02）、`/camera_curve_editor.js`（WP-05）。`camera_cinematic.js`・`camera_vmd_preview.js` は Python 専用化（§2.6）と `camera_vmd_local.js` で代替済みのため**読み込まない**（ファイルは削除しない。docstring に「カメラ画面未使用」と明記）。テスト `tests/test_camera_static_files.py`：`camera.html` の全 `<script src>` が静的配信で 200 を返す。

---

## 3. 機能ごとの詳細設計（ID 順。実装順は §4）

各項目の書式：**承認範囲**（台帳の要求）／**現状**／**設計**／**API・MCP**／**テスト**／**完了ゲート**／**規模と担当モデル**。

### CAM-001 カメラVMDの読込・分割・登録（任意区間抽出と境界補間）— WP-13
- 現状：inspect・native import・sample・preview-pose はある。ボーン/モーフを含むと decode が拒否、カメラ節の後に照明・セルフ影・IK 節があっても拒否（`camera_vmd_codec.py:21-22,37`）。「分割」「登録」なし。ネイティブトラックはメモリ上だけ（保存されない）。
- 設計：
  1. **デコーダ**：`decode_camera_track(raw, *, skip_non_camera=False)`。
     - カメラ節の後の照明（1件28バイト）・セルフ影（9バイト）・IK（`frame u32 + show u8 + n u32 + n×21`）節は**常に読み飛ばして件数を数える**（拒否しない）。途中で切れていれば 400 `vmd_truncated`。節が無い（ファイル末尾）は正常。
     - ボーン・モーフ節は `skip_non_camera=True` のときだけ読み飛ばす（既定は従来どおり拒否＝既存テスト不変）。UI と新 API は `True` で呼ぶ。
     - 戻り値に `skipped:{bones, morphs, lights, shadows, ik}` を追加。UIは「カメラ以外の n 件は無視しました（原本は変更していません）」と表示。
  2. **補間バイト順の一本化**：`camera_vmd_playback.py` に `VMD_CAMERA_INTERP_ORDER = ('x1','y1','x2','y2')`（チャンネル X,Y,Z,回転,距離,視野角 ごとに4バイト連続）を置き、`bezier_progress` 呼出前の並べ替えはこの定数だけで行う。JS（`camera_vmd_local.js`）に同値の `VMD_CAMERA_INTERP_ORDER` を置く。**現行コードの仮定をそのまま定数化したもので未検証**。検証方法：①mmd_tools（`mmd_tools/core/vmd/importer.py` のカメラ補間読取部）のソースと照合、または②オーナー提供の実 MMD カメラ VMD（既知の補間を付けたキー）で読込値を MMD 表示と照合。どちらかで確定するまで CAM-001/016 を完成扱いにしない。もし `('x1','x2','y1','y2')` 等が正しいと判明したら定数だけ変え、fixture を再生成する。
  3. **原本の保存**：新規 `camera_vmd_clip.py`。`store_original(raw, name) → {file, sha256, bytes}`。`file = 'vmd-' + sha256[:16]`、保存先 `data/camera_clips/<file>.vmd`（同じ sha256 が既にあれば書かない）。元のアップロードファイルは変更しない。
  4. **クリップ参照**（`vmd_clips[]`、最大128）：
     ```json
     {"id":"clip-1","name":"サビ前の回り込み","file":"vmd-0123456789abcdef","sha256":"<64桁>",
      "start":120,"end":300,"keyCount":42,"importedAt":"2026-10-20T03:00:00Z"}
     ```
     `start`・`end` は**VMD のフレーム番号**（両端含む）。`id` は 1〜64 文字の英数字・`-`・`_`、重複不可。`importedAt` はクライアント付与。
  5. **分割** `split(track, start, end, *, rebase=True) → {track, changed_keys}`（境界補間）：
     - 規則：VMD は**到着側キーの補間**が区間（前キー→そのキー）を支配する（`camera_vmd_playback.py:45-46` の現行規則）。
     - 区間内の元キーはそのまま残す。境界 τ（`start` または `end`）にキーが無い場合、τ を含む元区間 (a,b)（`a.frame < τ < b.frame`）で境界キーを作る：値は `sample_native_camera(track, τ)`。
     - 補間の分割（6チャンネル独立）：`u = (τ − a.frame)/(b.frame − a.frame)`。チャンネル c の制御点 `P0=(0,0), P1=(x1,y1), P2=(x2,y2), P3=(1,1)`（各値/127）。`x(s)=u` を s について二分法（40回）で解き、ド・カステリョ分割：`P01=lerp(P0,P1,s)`、`P12`、`P23`、`P012=lerp(P01,P12,s)`、`P123`、`P0123=lerp(P012,P123,s)`。左曲線 `P0,P01,P012,P0123`、右曲線 `P0123,P123,P23,P3`。`yτ = P0123.y`。
       - 左曲線の正規化：`x' = x/u`、`y' = y/yτ`。右曲線：`x' = (x−u)/(1−u)`、`y' = (y−yτ)/(1−yτ)`。各値を `round(v·127)`。
       - 境界キー τ の補間 = 左曲線（a→τ を支配）。元キー b の補間 = 右曲線（τ→b を支配）。クリップ先頭の境界キーは前区間が無いので補間は線形 `(20,20,107,107)`、b に右曲線。末尾の境界キーには左曲線。
     - **退避条件**：どれか1チャンネルで (i) 正規化後の値が 0〜127 の外 (ii) `|yτ| < 1e-9` または `|1−yτ| < 1e-9` (iii) 量子化後に `x1 > x2` のいずれかが起きたら、その区間（a〜τ または τ〜b の切り出し側）を**毎フレームの線形キー**（補間 `(20,20,107,107)`、値は元トラックのサンプル）で置き換える。
     - 戻り値 `changed_keys:[{frame, reason:'boundary_inserted'|'split_left'|'split_right'|'fallback_dense'}]` を UI・API で表示（どのキーが変わったかを隠さない）。
     - `rebase=True`：出力フレームを `start` が 0 になるよう詰める。
  6. **プロジェクトキーへの変換** `to_project_keys(track, *, fps, start, end, step=None) → {keys, clamped_fov, merged_frames}`：
     - フレーム写像：VMD は 30fps。キー位置の写像は `f_project = round(f_vmd · fps / 30)`。サンプリングはプロジェクトフレーム g ごとに VMD の実数フレーム `g · 30 / fps` で評価（`sample_native_camera` は実数フレームを受ける）。
     - 既定 `step = max(1, ceil(区間のプロジェクトフレーム数 / 4000))`。生成キー数＋既存キー数が 5000 を超えるなら 400 `too_many_keys`。
     - 各サンプルを §付録B の取込変換（`camera_vmd_bridge.preview_pose` と同一、単位 12.5 で割る）で BAI 姿勢へ。`up` から `roll` を §0.2 の逆算で求める。
     - FOV は取込時 [5,150] にクランプし件数を `clamped_fov` で返す。補間は `linear`（VMD ベジェを BAI 補間へ近似変換しない＝形の誤差を作らない）。
     - 平行投影（`perspective=1`）のキーは BAI キーで表せないので、区間に含まれていたら 400 `vmd_unsupported`（「平行投影のキーは変換できません」）。
  7. **UI**（`camera.html` の VMD 欄）：「VMDを登録」（ファイル選択→原本保存→クリップ一覧へ）、クリップ一覧（名前・区間・キー数・欠損表示）、「区間を切り出す」（開始/終了フレーム入力、`changed_keys` 表示）、「プロジェクトのキーに変換」（確認ダイアログで挿入範囲と件数、既存キー衝突は中止＝`keys_in_range`、ローカル適用で Undo 1回）。既存の「試験プレビュー」「追従」はクリップに対して動くよう変更（`vmdPreview:{clip, follow}` を workspace に保存、WP-13 で `validate_workspace` に追加）。
  8. **復元時の欠損**：クリップの `file` が無い／sha256 不一致 → 一覧に「元VMDが見つかりません／変更されています」。そのクリップを使うショットは §CAM-015 の欠損表示。黙って置換しない。
- API・MCP（WP-13 で追加）：
  - `POST /api/camera/vmd/clips/upload?name=<元ファイル名>`（本文 VMD バイナリ ≤32MB）→ `{ok, revision, result:{file, sha256, bytes, keyCount, frames:[first,last], skipped}}`（保存済みプロジェクトは変えない。クリップ参照の追加はプロジェクト保存で行う）。
  - `GET /api/camera/vmd/clips` → `{ok, revision, result:{clips:[...各 clip に available:true|false, reason?]}}`。
  - `POST /api/camera/vmd/clips/preview` 本文 `{file, start, end, rebase, to_keys:{fps, step?}?}` → `{ok, revision, result:{track, changed_keys, keys?, clamped_fov?}}`（読取専用）。
  - MCP：`bai_camera_vmd_clip_upload`（引数 `name`, `data_base64`（≤8MB、MCP の制限として明記））、`bai_camera_vmd_clip_list`、`bai_camera_vmd_clip_preview`。クリップ参照の登録とキー挿入は `bai_camera_set`／`bai_camera_keys_apply`（revision 必須）。
- テスト：`tests/test_camera_vmd_clip.py`：境界キー値が元トラックの補間値と一致（1e-6）、分割後の曲線上の任意 u で元曲線と一致（量子化誤差 1/127 相当まで）、退避条件3種で `fallback_dense`、区間内キー不変、原本 sha256 不変・同一原本は1ファイル、照明/影/IK 付き VMD で `skipped` 件数、切れた節で `vmd_truncated`、`to_project_keys` 後に `sample` した姿勢が `preview_pose`/12.5 と一致（位置 1e-4m、角度 1e-3度）、fps 24/30/60 写像、FOV クランプ件数、`too_many_keys`、平行投影で `vmd_unsupported`、`VMD_CAMERA_INTERP_ORDER` の JS/Python 一致（parity）。
- 完了ゲート：上記＋補間バイト順の検証（未検証のままなら未完成）。実 MMD カメラ VMD（オーナー手持ち）での目視比較は**オーナー確認待ち（Phase E 全実装後）**として未検証記録。
- 規模：中。**標準モデル可**。

### CAM-002 カメラ類似分類（距離・回転・速度・画角を比較）— WP-14
- 現状：実装なし。
- 設計（読み取り専用の分析。データを書き換えない）：
  1. 新規 `camera_similarity.py`：
     - `features(poses, fps)`：入力は同じ fps で評価済みの姿勢列 `[{position, target, fov, roll}]`（プリセット＝1姿勢、ショット区間・VMD クリップ＝毎フレーム評価）。出力8次元：`dist_mean`（注視点までの距離平均, m）、`dist_range`、`yaw_total`（水平方向の向きの累積変化の絶対値和, 度）、`pitch_mean`（俯角/仰角の平均, 度）、`roll_absmax`、`speed_mean`（位置速度 m/s）、`speed_max`、`fov_mean`（度）。1姿勢のときは速度系・変化量は 0。
     - `distance(a, b)`：各次元を**固定スケール**（距離系 10m、角度系 180度、速度系 5m/s、fov 90度）で割り、**固定重み（すべて1）**のユークリッド距離。重みを変える UI は作らない。
     - `rank(query, items, limit=20)`：近い順、同距離は入力の ID 順。`cluster(items, threshold=0.25)`：単連結クラスタ（ID 順に処理して決定的）。
  2. 対象：プリセット・VMD クリップ（CAM-001）・ショット（CAM-015）。
  3. UI：プリセット一覧・クリップ一覧の各行に「似ているものを探す」→ 右パネルに近い順リストと各次元の差（数値）。「グループに分ける」で閾値入力付きクラスタ表示。**自動でタグ付け・削除・並べ替え保存はしない**。結果から「タグを付ける」は CAM-014 の通常操作。
- API・MCP：`POST /api/camera/similarity` 本文 `{query:{kind:'preset'|'clip'|'shot', id}, items?:[...], mode:'rank'|'cluster', threshold?, project?}` → `{ok, revision, result:{ranked|clusters, features}}`。クリップは原本からサーバーで評価できる。MCP `bai_camera_similarity`（読取）。UI はこの HTTP を呼ぶ（§2.6）。
- テスト：`tests/test_camera_similarity.py`：同一入力で距離0、既知の合成データで距離値、クラスタの決定性（入力順を変えても同じグループ）、1姿勢の速度0。
- 完了ゲート：UI・API・両MCPで同じ順位。実 VMD クリップ3件以上での動作は合成 VMD で自動テストし、実データは未検証記録。
- 規模：小〜中。**標準モデル可**。

### CAM-003 キーフレーム・カーブ編集（位置/回転/距離/FOV）— WP-05
- 現状：キー追加・削除・ドラッグ・Undo/Redo（上限80）あり。UI の補間は3種（`camera.html` `#interpolation`）。保存は15モード＋custom 対応済み（`221951b`）。グラフエディタなし。`easingPresets` 上限64（G-09）。
- 設計：
  1. 補間選択を15モードに拡張（`BAICameraCore.MODES` の並び・同じ内部名）。表示名は日本語（`linear` 線形、`hold` 保持、`smooth` 滑らか（旧互換）、`bezier` ベジェ（既定曲線）、`sine` サイン、`quad` 2次、`cubic` 3次、`quart` 4次、`quint` 5次、`expo` 指数、`circ` 円、`back` バック（行き過ぎあり）、`bounce` バウンド（行き過ぎあり）、`elastic` 弾性（行き過ぎあり）、`custom` カスタム）。行き過ぎるモードは選択時に注記。
  2. **トラック別補間**：キー詳細に「トラック別に設定」スイッチ。ON で位置・注視点・FOV・ロール・F値・合焦距離ごとにモードを選べる（§2.3 `trackInterpolation`）。OFF（既定）は従来どおり `interpolation` 1つ。`sampleKeys`・`bai_camera.sample` はトラックごとに `trackInterpolation[track] ?? interpolation` を使う。hold の規則（§0.2）もトラック単位。
  3. **カーブエディタ**（新規 `camera_curve_editor.js`、Canvas 2D、UMD で `window.BAICameraCurveEditor`）：選択区間の正規化カーブ（横 t、縦 進み具合）を表示。custom のときだけ2つのハンドルをドラッグ可（x は 0≤x1≤x2≤1 にクランプ、y は −2〜3）。ドラッグ中はプレビュー、離した時点で1 Undo、Esc で取消。数値入力4つを併設。登録カーブ（`easingPresets`）の保存・適用・削除（既存仕様：適用はコピー、遡及しない、上限 **100**）。
  4. 「回転」「距離」の編集：BAI キーは `position`＋`target` で向きと距離を表す。キー詳細に**派生値**（注視点までの距離 m、ヨー/ピッチ 度）を表示し、数値で変えると `target` を固定して `position` を球座標で再計算する（`yaw=atan2(dx,dz)`、`pitch=asin(dy/r)`、d=position−target）。ロールは WP-06 の `roll` 入力。
  5. Undo/Redo：上限80を維持。補間変更・ハンドル編集・トラック別設定・カーブ適用・派生値編集はすべて1操作1件。
  6. G-09：`bai_camera.py` の `easingPresets` 上限を100へ。
- API・MCP：専用 API は作らない。MCP からは `bai_camera_keys_merge`（`fields:{interpolation, customCurve, trackInterpolation, trackCustomCurve}`）と `bai_camera_set`（`easingPresets`）で編集する。
- テスト：parity fixture にトラック別・custom を追加。`tests/test_camera_curve_editor.cjs`：ハンドルクランプ、x 単調性、Esc 取消で元値。`tests/test_camera_easing_presets_limit.py`：100件可・101件で400。Playwright：補間を `back` にしてスクラブ→`readState().pose` が `/api/camera/sample` と一致（1e-6）、Undo で戻る、カーブのドラッグ1回で Undo 1件。
- 完了ゲート：UI・API・両MCPで同じキーデータ、保存→復元で一致、SwiftShader でのドラッグ自動テスト（実GPUは未検証記録）。
- 規模：中〜大。**標準モデル可**（2点ハンドルのみ。汎用グラフエディタは作らない）。

### CAM-004 カメラ矩形フレームと被写体見切れ検出（投影バウンディングボックス）— WP-15
- 現状：球・8頂点 AABB で判定済み（`camera_framing.js`、`camera.js:23-34`）。UI 表示あり。三分割線は CSS で常時表示（`camera.css` `.camera-frame::before/::after`）。輪郭・遮蔽・GPU 統合は未。
- 設計（**判定ロジックを増やさない**。表示の整理と検証のみ）：
  1. 結果の文言を「事実」に限定：「包囲箱の上端が画面上端から 4% はみ出しています」等（はみ出し方向と量を数値で）。良し悪しの言葉を使わない。既存の「構図の良否は判定しません」を維持。
  2. 補助表示（三分割線・セーフフレーム 90%・ヘッドルーム目安線）は**任意 ON/OFF、初期 OFF**。現行の常時三分割線も ON/OFF 対象にする（既定 OFF に変わることを変更記録に書く）。保存は workspace `framing.guides`（WP-02 で枠のみ用意済み）。
  3. **テンプレートの aspect（CAM-013）はフレーミング補助線の縦横比（`#framing-aspect`）だけを設定**する。出力解像度・撮影カメラの縦横比は変えない。
  4. 遮蔽・輪郭は承認範囲外（台帳は「投影バウンディングボックス」）→ 実装しない。
- API・MCP：見切れ計算は実モデル包囲箱が必要。`POST /api/camera/framing/check` は作らない（JS の `camera_framing.js` のみ）。WebMCP `bai_camera_framing_state`（読取、`BAICameraDebug` から現在の結果を返す）。標準MCPは非対応（制限として明記）。
- テスト：既存 `test_camera_framing.cjs`＋Playwright：補助表示 ON/OFF が撮影キーを変えない、補助線は `.camera-frame` オーバーレイ層だけに描かれ 3D canvas に描かれない、文言に良否語（NG・悪い・良い）が含まれない。
- 完了ゲート：実モデルのアニメーション中判定（SwiftShader 自動＋実GPU未検証記録）。
- 規模：小。**標準モデル可**。

### CAM-005 焦点距離・F値・ピント距離（MMD非対応値はJSON保持）＋フォーカス契約＋E-FOCUS-01/02 — WP-04
- 現状（確認済み）：
  - レンズ欄の焦点距離 `#focus-lens`（8–300、既定50）・F値 `#focus-aperture`（0.7–32）・合焦距離 `#focus-distance`（0.01–100000）は**キーと無関係な画面値**。レンズプリセット適用（`camera.js:215-224`）は FOV をキーへ、mm/F を画面値へ書く。
  - JS 診断 `BAICameraFocusConsistency.diagnose` は光軸方向深度、厳密許容 0.01m（`camera_focus_consistency.js:18`）。Python は3D距離（G-07）。
  - 範囲診断は JS で `ceil((duration+1)/10000)` 間隔（上限10,000サンプル、`camera.js:78`）、Python も 10,000 上限（`camera_focus.py:36`）。
  - Scene View に焦点面1枚と対象マーカーを GPU 描画（`camera_3d.js:186-202`）。近点/遠点面は無い。
  - 追従（`focus_tracking`）は `camera_3d.js:120-130` で合焦距離入力を書き換える。
- 設計：
  1. **値の出所（1か所ずつ）**：
     - `focalMm = verticalFovToFocal(サンプルFOV, 24)`。`#focus-lens` は**現在フレームのキー FOV を編集する入力**（変更確定で `fov = focalToVerticalFov(mm)` を `commitPose` 経由で書く＝自動キー OFF ならプレビューのみ）。入力範囲 8–300mm（FOV 5–150 の範囲内に収まる）。
     - **10段の焦点距離選択** `#lens-focal-step`：18/24/28/35/50/80/85/105/135/200mm（`KEY_INTERVAL_EASING_AND_LENS_20261018_JA.md`）。選ぶと `#focus-lens` と同じ処理。既存の4つのラベル付きプリセット（`camera_lens.js` presets、mm＋F値）は残す。
     - `fNumber = サンプル fStop`（キーに無ければ 4.0）。`#focus-aperture` は現在キーの `fStop` を書く（`mergeKey`）。範囲 0.7–64（G-08）。
     - `focusM`：①**追従ON**（`focus_tracking.enabled`）：対象点が解決できれば対象点の光軸方向深度（`focusSource:'tracking'`）。**解決できなければ `focusM=null`、分類 `unknown`、理由 `bone_missing`。キー値や画面値で代替しない**。②追従OFF：キー `focusDistance` のサンプル値（`focusSource:'key'`、どのキーにも無ければ 4.0 で `focusSource:'default'`）。`#focus-distance` は現在キーの `focusDistance` を書く（範囲 0.01–10000）。追従ON中は入力を読み取り専用にする。
  2. **唯一の評価関数** `BAICameraCore.evaluateOptics(input) → OpticsResult`（純関数）：
     - 入力：`{frame, contentVersion, pose:{position,target,fov,roll}, lens:{fStop, focusDistance}, tracking:{enabled, point|null}, targets:[{name, point|null, reason?}], settings:{circleOfConfusionMm, strictToleranceM}}`。
     - 出力：
       ```json
       {"frame":120,"contentVersion":37,
        "lens":{"focalMm":50.0,"fNumber":2.8,"focusM":3.2,"focusSource":"key","cocMm":0.03},
        "dof":{"nearM":2.9,"farM":3.57,"hyperfocalM":29.8},
        "targets":[{"name":"eye_l","depthM":3.25,"errorM":0.05,"class":"acceptable"},
                   {"name":"eye_r","depthM":3.31,"errorM":0.11,"class":"acceptable"}],
        "worst":{"name":"eye_r","class":"acceptable","errorM":0.11},
        "class":"acceptable","reason":null}
       ```
     - 分類：`depth < near` → `near_blur`（手前ボケ、マゼンタ）、`depth > far` → `far_blur`（奥ボケ、橙）、`|depth − focusM| ≤ strictToleranceM` → `in_focus`（合焦近傍、青）、それ以外で near〜far 内 → `acceptable`（許容範囲、緑）、評価できない → `unknown`（灰＋斜線）。
     - `unknown` の理由コード：`bone_missing`（追従ONで対象ボーン未解決、または評価点のボーン欠落）、`model_not_loaded`、`behind_camera`（depth ≤ 0）、`focus_inside_focal`（`focusM ≤ focalMm/1000`）、`invalid_number`（非有限値）。
     - **両眼（`targetMarker:'eyes'`）**：左右眼ボーン（`classifyBone` を拡張：`LeftEye|RightEye|左目|右目|J_Adj_L_FaceEye|J_Adj_R_FaceEye|eye_l|eye_r` 等、大文字小文字無視）を両方評価し、`worst` = どちらかが `unknown` ならそれ、そうでなければ `|errorM|` が大きい方。全体の `class` は `worst.class`。両方の値を画面に出す。片眼だけ欠落なら全体 `unknown`・`bone_missing`（もう片方の値は表示）。
     - 厳密許容値の既定は **0.02m**（JS の 0.01 から変更、フォーカス設計 §4）。CoC 既定 0.03mm。
     - センサー：Phase E は 36×24mm 固定（焦点距離換算は縦 24mm）。`sensorWidthMm` は表示用に 36 を出すだけで変更不可（§9 Q3）。
  3. **全部同じ関数を使う**：①色分け（Camera View の対象マーカー・Scene View の色）②単一診断（下段の数値）③範囲診断（各フレームで呼ぶ）④DOF プレビュー（`camera_dof.js` に `lens.focusM`・`fNumber`・`focalMm` を渡す）。`camera_focus_consistency.js` の `diagnose` は `evaluateOptics` を呼ぶ互換ラッパーに変える。
  4. **範囲診断（E-FOCUS-02）**：JS で `[start,end]` を `step`（既定 `max(1, ceil((end−start+1)/10000))`、ユーザー指定可、サンプル上限 **10,000**）ごとに、カメラ姿勢（シーケンス・VMD 追従を含む実際に撮影に使う姿勢＝`diagnosticCameraPose`）と対象点（`bai-camera-query-focus-target` でモデル時刻を合わせて取得）を評価し `evaluateOptics` を呼ぶ。処理はチャンク（200 フレームごとに `await` で描画を譲る）、キャンセルボタン、進捗は**実際に処理したフレーム数**。結果：逸脱区間（`near_blur`/`far_blur`/`unknown` の連続区間、理由別）、最小・最大の焦点面誤差、対象見失い区間。タイムラインに色帯。
  5. **出力（export_report）**：範囲診断の結果を CSV と JSON でダウンロード。
     - CSV 列（固定順）：`frame,class,reason,target,depth_m,focus_m,error_m,near_m,far_m,focal_mm,f_number,focus_source,camera_source,target_source`。
     - JSON：`{schema:1, generatedAt(クライアント), conditions:{start,end,step,cocMm,strictToleranceM,targetMarker,boneName,renderer}, intervals:[{start,end,class,reason}], samples:[OpticsResult...]}`。
     - テスト結果は project に保存しない（フォーカス設計 §6）。
  6. **Scene View の焦点面ガイド**：既存の焦点面に加え、**近点面・遠点面**（半透明、焦点面と同じ向き、遠点が無限なら遠点面は出さず「∞」ラベル）。`focusTest.showNearFarPlanes` で ON/OFF。ガイドは Scene View だけに描き、Camera View・書き出しに映さない（既存の `world` ではなく Scene View 専用の描画レイヤーに置く）。
  7. **「対象にピントを合わせる」（プレビュー→確定）**：ボタンで現在フレームの対象深度を `focusM` 候補として**プレビュー**（焦点面ガイド・DOF プレビューだけが動き、キーは不変、画面に「未確定」）。［確定］で現在フレームのキー `focusDistance` を1件更新（`mergeKey`、自動キー OFF でも「確定」は明示操作なのでキーを書く。キーが無ければ現在姿勢で新規キー）＝1 Undo。［取消］／Esc で破棄。追従ON中・対象未解決中は押せない（理由を表示）。テストモードの ON/OFF 自体はキーを作らない。
  8. **深度カラー表示（Camera View、`focusTest.viewMode:'color'`）**：Three.js の `scene.overrideMaterial` に `ShaderMaterial` を設定し、各画素のビュー空間深度を near/far/focus/厳密許容で5色に塗る（凡例と同じ色、`unknown` は無し）。通常表示と切替。**GPU での正しさは未検証**（SwiftShader では描画のみ確認）。左右比較・ブラー差分は F-DOF-01（Phase F）。書き出し映像には使わない（プレビュー専用）。
  9. **レンダラー状態表示**：下段に `WebGL: 有効/無効 ・ レンダラー: <UNMASKED_RENDERER_WEBGL> ・ ソフトウェア描画: はい/いいえ ・ DOF: BokehPass/OFF/利用不可`。`BAICameraDebug.getState().renderer` にも同じ値。ソフトウェア描画（SwiftShader/llvmpipe）なら「GPU未検証」と表示。
  10. **Python 側（G-07・G-08）**：`camera_focus.py` に `evaluate_optics(input)`（JS と同仕様、parity）を追加。既存 `diagnose`・`diagnose_range` はこれを使うよう書き換え（応答キーは残す、§1 G-07）。
  11. **VMD とレンズ値**：VMD は F値・合焦距離を持てない → CAM-016 の書出しで**サイドカー JSON** に入れる（WP-13）。
- API・MCP（WP-04 で追加。読取のみ）：
  - `POST /api/camera/focus/evaluate` 本文 `{frame? | start,end,step?, settings:{circleOfConfusionMm, strictToleranceM, targetMarker}, samples?:[{frame, pose:{position,target,fov,roll?}, lens:{fStop, focusDistance}, tracking:{enabled, point|null}, targets:[{name, point|null, reason?}]}], report?:'csv'|'json'}` → `{ok, revision, result:{samples:[OpticsResult], intervals, camera_source, target_source, report?}}`。
    - `samples` あり → その値をそのまま `evaluate_optics`（`camera_source:'samples'`、`target_source:'samples'`）。
    - `samples` なし → 保存済みプロジェクトのキー（シーケンス適用後。VMD 試験プレビュー・未保存編集・実ボーンは含まない）で姿勢とレンズを作り、対象点はガイド位置（face/chest/hips の固定座標）。`camera_source:'keys_only'`、`target_source:'guide'`。`focus_tracking.enabled` が true なら各サンプル `unknown`・`model_not_loaded`（偽の合焦を返さない）。
    - 上限 10,000 サンプル（超えたら 400 `invalid_range`）。
  - `POST /api/camera/focus/target-preview` 本文 `{frame, samples:[1件]}` → `{ok, revision, result:{focusDistance, depthM}}`（samples なしは 409 `model_not_loaded`）。
  - 既存 `GET /api/camera/focus` は互換のため残す（G-07 の定義修正のみ）。
  - MCP（WP-04 では手書き追加、WP-02 で JSON 化）：`bai_camera_focus_evaluate`（WebMCP はカメラ画面なら `BAICameraDebug.collectFocusSamples` で samples を付ける）、`bai_camera_focus_target_preview`。確定 `bai_camera_focus_commit` は WP-02（書込基盤）で追加（実体は `keys/merge` の `focusDistance`）。
- テスト：
  - `tests/test_camera_optics.py` と parity の `optics` ケース：焦点面上・手前・奥・無限遠境界で理論値一致（mm/m 変換）、`focus_inside_focal`、`behind_camera`、両眼の最悪値、厳密許容 0.02 の境界。
  - `tests/test_camera_focus_evaluate_api.py`：samples あり/なし、追従ONで `model_not_loaded`、上限、CSV 列順。
  - `tests/test_camera_optics_wiring.cjs`：`contentVersion` が変わった後に解決する遅延 Promise の結果が捨てられる。
  - Playwright（`tests/camera-ui.test.cjs`）：テスト GLB で、同一フレームの単一診断と範囲診断の `depthM`・`class` が一致（契約ゲート1）。アニメーション中にフレームを進めると色・数値・DOF の焦点が同じフレームで変わる（ゲート2）。VMD 追従切替・スクラブ・逆方向スクラブで古い値が残らない（ゲート3）。追従ON＋ボーン無しで `unknown/bone_missing`、モデル未読込で `unknown/model_not_loaded`（ゲート4）。テスト ON/OFF・プレビューでキー・Undo 履歴が変わらず、確定で1キー1 Undo、Esc で不変。焦点距離入力で現在キーの FOV が変わる。F値入力でキー fStop。保存→再読込で `focusTest` 設定が戻る（ゲート5の一部、WP-02 後に追加）。近点/遠点面のメッシュが Scene View にだけ存在。レンダラー表示に SwiftShader が出る。
- 完了ゲート：契約の検証ゲート1〜5（ゲート5の GPU 実描画は未検証記録＝**完成扱いしない**）。フォーカス設計 §8 の 1〜6 は自動、7（実 FBX/VRM と実 GPU）・8 は Phase E 全実装後の確認へ。
- 規模：大。**設計確定済みなので標準モデル可**。実装後の契約適合レビューだけ高性能モデルで1回。

### CAM-006 パン・ティルト・ロール・自転（固定位置からの向き操作）— WP-06
- 現状：`orbit/dolly/pan(=平行移動)/tilt` の操作（Python `bai_camera.camera_move`、JS `moveCamera`）。JS は G-13 で orbit/tilt が壊れている（WP-00a で修正済みの前提）。ロールなし。HTTP なし。Camera View 左ドラッグ＝オービット、Shift＋ドラッグ＝平行移動（`camera.js:16-17`）。`applyPose` は `up` を受け付ける（`camera_3d.js:169`）。
- 設計：
  1. キーに `roll`（§2.3、§0.2）。描画は `upVector()` で up を作って `applyPose` に渡す。
  2. 操作（`camera_core.moveCamera` と `bai_camera.camera_move` に追加、**camera_move は bai_camera.py に置く**）：
     - `pan_yaw`：位置固定、ワールド Y 軸周りに注視方向を `amount` 度回す（target = eye + Ry(amount)·(target − eye)）。
     - `tilt`：既存どおり（位置固定、カメラ右軸周り）。
     - `roll`：`roll += amount`（正規化）。位置・注視点不変。
     - `truck`：カメラ右方向へ `amount` m 平行移動（**旧 `pan` と同じ結果**）。
     - `pedestal`：ワールド上方向へ `amount` m 平行移動（位置と注視点）。
     - `dolly`・`orbit`：既存どおり。
     - `zoom`：位置不変、`focalMm += amount`（8〜300 にクランプ）→ FOV。
     - **旧 `pan` は `truck` の別名として残す**（保存・API 互換、操作設計 §3）。
     - シグネチャ：Python `camera_move(pose, operation, amount, *, prev_right=None) → {position, target, fov, roll}`、JS `moveCamera(pose, operation, amount, {prevRight})`。`amount` 範囲は既存の −360〜360。
  3. 「自転」＝カメラ位置固定で向きを時間で回すこと。CAM-010 の rig `spin`（WP-07）で生成。CAM-006 は1回の操作まで。
  4. Camera View の入力割当（操作設計 §4）：左ドラッグ横＝`pan_yaw`、縦＝`tilt`、R＋ドラッグ＝`roll`、Z＋ドラッグ＝`zoom`、中ドラッグ横＝`truck`・縦＝`pedestal`、ホイール＝`dolly`、Alt＋左ドラッグ＝`orbit`、A/D＝truck、E/Q＝pedestal、W/S＝dolly（入力欄にフォーカスがある時は無効）。ドラッグ中は操作名と修飾キーを画面表示。Esc で取消（開始時スナップショットに戻す）。確定は pointerup で1キー＝1 Undo（`commitPose`、自動キー OFF ならプレビューのみ＝現行どおり）。Scene View は UE 方式（右ドラッグ見回し＋右ボタン保持 WASDQE、Alt＋左でオービット）で**撮影キーを変えない**。
  5. UI ラベルは新名称、ツールチップで旧名称（「旧『パン』＝トラック」）を説明。
- API・MCP：`POST /api/camera/move` 本文 `{frame, operation, amount, commit:false|true, revision?}`。`commit:false` は `{ok, revision, result:{pose}}`（保存しない）。`commit:true` は revision 必須、現在フレームのキーを `merge_key` で更新（無ければ作成）→ `{ok, revision(新), result:{pose, key}}`。MCP `bai_camera_move`。
- テスト：parity に新操作・roll・縮退ケース。`tests/test_camera_move_ops.py`：旧 `pan` の結果が変わらない（回帰）、`truck == pan`、`pan_yaw`/`tilt` で位置不変、`roll` で位置・注視点不変、縮退時 prev_right 使用。Playwright：操作設計 §9 の CAM-UI-01〜04、CAM-KEY-01〜03（`readState` で座標検証）。
- 完了ゲート：4経路一致、実機操作感はオーナー確認待ち。
- 規模：中。**標準モデル可**。

### CAM-007 ドリー・トラック・スライダー・ズーム（移動と画角独立）— WP-07
- 現状：ドリー・レール・FOV 入力あり。ベイクは FOV 固定（`camera_rig.js` bake の `fov:p.fov`）。
- 設計：
  1. rig 設定に任意 `fov_start`・`fov_end`（度、5–150）。未指定は開始姿勢の FOV で固定（現状互換）。指定時は各ベイクキーの `fov = fov_start + (fov_end − fov_start)·e(t)`。位置の計算は FOV 指定の有無で変わらない（独立）。
  2. **ドリーズーム**は CAM-012。CAM-007 は「ドリーとズームを独立に同時に動かせる」まで。
  3. 「スライダー」＝短い直線 `rail` の UI プリセット（長さ 0.3〜2m、既定 1m、カメラ右方向）。新しいリグ種は作らない。
- テスト：bake 結果の FOV が両端で指定値・中間がイージングどおり、位置は FOV 指定の有無で同一。
- 規模：小。**標準モデル可**。

### CAM-008 レール・曲線カメラパス（制御点/補間/テンプレート）— WP-07
- 現状：`rail`（直線）・`curve`（**二次ベジェ3点**、等速化あり）・ベイク・3D ハンドル。ベイクのイージングは linear/smooth のみ、ベイクキーは linear 固定、上限2000キー。
- 設計：
  1. ベイクのイージングを15モードに拡張（`bake_ease` に15モード、`custom` は `bake_custom_curve:[x1,y1,x2,y2]` 必須）。生成キーの `interpolation` は `linear` を維持（サンプル密度で形を出す）。サンプル間隔は既存の `bake_step`。
  2. **旧 `curve` は現行の意味（二次ベジェ3点）のまま**。新リグ種 **`spline`**：
     - データ：`rig.points:[[x,y,z],...]`（2〜8点）、`rig.constant_speed`（既存フィールドを流用）。
     - 評価：**centripetal Catmull-Rom（α=0.5）**。端点は複製（`P−1=P0`、`Pn=Pn−1`）。ノット間隔 `Δ = max(|Pi+1−Pi|^0.5, 1e-4)`（複製端点で0除算しない）。全体の進行度 t∈[0,1] は区間数で等分してから区間内パラメータへ写す。`constant_speed:true` は全区間をまとめて弧長表（区間あたり 64 分割）で等速化。
     - ベイクは既存 `bake_step` ごとにサンプル。
     - 3D ハンドル：点の追加（Shift＋クリック、最大8）・削除（選択して Delete、最小2）。ドラッグは rig 設定だけを変え撮影キーを書かない（現行の rail ハンドルと同じ規則）。
  3. キー区間編集：rig を `[bake_from, bake_to]` だけに適用（既存）。範囲外のキーは変更しない。
  4. テンプレート：CAM-013 の rail/spline 系テンプレートからこの設定が入る。
- テスト：旧 `curve` 3点データの評価が従来と完全一致（回帰）、`spline` が各制御点を通る（1e-9）、端点で微分が有限、等速化の速度変動 < 1%、範囲外キー不変、2点 spline＝直線。
- 規模：中。**標準モデル可**。

### CAM-009 クレーン・ジブ・ブーム・ドローン（縦移動と旋回）— WP-07
- 現状：`crane`＝ワールド X 軸周りに支点中心で位置を回す弧（注視点固定、`camera_rig.js crane`）。ジブ旋回・ブーム伸縮・ドローンなし。
- 設計：
  1. **旧 `crane` は現行の意味のまま**（`crane_from_angle`→`amount` の X 軸回転）。黙って一般化しない。
  2. 新リグ種 **`jib`**：`rig.jib = {pivot:[x,y,z], armLength:[s,e](0.5〜20m), elevation:[s,e](度 −80〜80), swing:[s,e](度、水平旋回), pedestal:[s,e](支点の上下 m、−10〜10), lookAt:[x,y,z]|null}`。
     - 位置 `= pivot + (0, pedestal, 0) + armLength·(cos el·sin sw, sin el, cos el·cos sw)`。注視点 = `lookAt`（null なら開始姿勢の target）。各値はベイクのイージング進行度で [s,e] を補間。
     - クレーン＝elevation 変化、ジブ＝swing 変化、ブーム＝armLength 変化、同時変化可。UI は「クレーン（上下）」「ジブ（旋回）」「ブーム（伸縮）」のプリセットで同じ `jib` を初期化。
  3. **ドローン**：`spline` リグ＋高所の制御点＋注視点固定、の UI プリセット「ドローン（高所スプライン）」。**バンク（自動ロール）は作らない**（根拠なしのため削除）。
- テスト：アーム端が球面上（|p − pivot − (0,pedestal,0)| = armLength、1e-9）、旧 `crane` の回帰一致、swing だけ変えると高さ不変。
- 規模：中。**標準モデル可**。

### CAM-010 オービット・スパイラル・自転（被写体中心とカメラ中心を区別）— WP-07
- 現状：`orbit`（`amount`＝方位角変化、半径は開始姿勢から）。スパイラル・自転なし。
- 設計：
  1. **旧 `orbit` は現行の意味のまま**。任意の追加 `rig.orbit = {radius:[s,e]|null, height:[s,e]|null, elevation:[s,e]|null}`。null／未指定の項目は現行どおり（開始姿勢から）。スパイラル＝radius か height が変化するオービット（UI プリセット「スパイラル上昇」「スパイラル接近」）。
  2. 新リグ種 **`spin`**（自転・カメラ中心）：`rig.spin = {yaw:[s,e], pitch:[s,e]}`（度。pitch は −89〜89）。カメラ位置固定、開始姿勢の視線方向をヨー・ピッチだけ回し、注視点は同じ距離で回る。
  3. UI でも「被写体を中心に回る（オービット）」「その場で向きを回す（自転）」を別ボタン・別アイコン。
- テスト：radius 固定時の注視点距離一定、スパイラルの半径・高さが両端で指定値、spin 中の位置不変、`pitch` だけ変化でヨー不変。
- 規模：小〜中。**標準モデル可**。

**CAM-007〜010 共通（WP-07）**
- `camera_rig_store.validate_rig`：type に `jib`・`spline`・`spin` を追加。追加フィールド `points`・`jib`・`spin`・`orbit`・`fov_start`・`fov_end`・`bake_custom_curve` を任意で受理。`bake_ease` を15モードへ。旧データは旧フィールドだけで有効のまま。
- Python 移植 `camera_rig.py`（`camera_rig.js` と同仕様、parity `rig` ケース）。
- API・MCP：`POST /api/camera/rig/bake` 本文 `{rig, from, to, step, base_frame?, project?}` → `{ok, revision, result:{keys}}`（プレビューのみ。確定は `keys/apply`）。MCP `bai_camera_rig_bake`。UI はローカル `camera_rig.js`。

### CAM-011 被写体追従・複数人自動構図（顔/全身/手などターゲット指定）— WP-08
- 現状：単一ボーン追従・平滑化・ベイクあり（`bone_follow = {boneName, role, offset, enabled, smoothingSeconds}`、`role` は head/neck/chest/hips）。複数ターゲットなし。保存は通常保存時のみ（G-04、WP-02 で修正済みの前提）。
- 設計：
  1. **旧単一形はそのまま**。2つ以上の対象が必要なときだけ `bone_follow.targets` を追加：`[{marker:'face'|'eyes'|'chest'|'hips'|'full'|'hand_l'|'hand_r'|'bone', bone?:string(≤256), weight:0–1}]`（2〜8件）。`targets` がある場合も単一形フィールドは残し、`boneName` は先頭対象（互換用）。`targets` が1件以下になったら UI は `targets` を削除して単一形で保存。
  2. マーカーの解決：`classifyBone`（既存）を拡張し、顔＝head、両眼＝§CAM-005 の眼ボーン、手＝`LeftHand|RightHand|左手首|右手首|hand_l|hand_r` 等。**注視（追従カメラの向き）では**、見つからなければ包囲箱中心へ代替し `resolved:'fallback_bbox'` を表示する（操作設計 §7 が認める代替）。**フォーカス（CAM-005）では代替しない**（`bone_missing`）。この違いを UI の注記に書く。`full` は包囲箱中心。
  3. 複数対象時の注視点＝重み付き平均（重み合計0は 400 `invalid_payload`）。「全員を画面に入れる」：全対象点＋包囲箱8頂点を CAM-004 の投影で評価し、全点が余白内に入る**最小のドリー距離**（注視点固定、二分法）または**最小の FOV**（位置固定）を提案（プレビュー→確定1 Undo）。**自動で動かし続けない**（初期 OFF、追従 ON 時のみ毎フレーム計算、ベイクで確定）。計算は JS（`camera_framing.js` に `fitAll(pose, points, opts)`）。
  4. 複数モデルの同時読込は現状1体（`camera-asset`）。Phase E は「データ構造」と「同一モデル内の複数部位（例：顔＋両手）」まで実装・検証。**別モデル複数人の実機検証は Phase C 以降**（§9 Q1）。
  5. localStorage `bai-camera-follow-v1` は下書き限定（WP-02 §2.8-5）。
- API・MCP：保存は `bai_camera_set`（`bone_follow`）。`fitAll` は実モデル点が必要なため WebMCP `bai_camera_follow_fit_all`（カメラ画面で `BAICameraDebug` 経由、プレビューのみ）。標準MCPは非対応（制限明記）。
- テスト：旧データ読込の回帰（`targets` 無しで保存しても形が変わらない）、重み付き平均、注視のフォールバック表示とフォーカスの非フォールバック、`fitAll` が全点を画面内に入れる（合成点群）、bundle 往復。
- 完了ゲート：単一モデル・複数部位まで。別モデル複数人は Phase C ゲートへ記録。
- 規模：中。**標準モデル可**。

### CAM-012 映画演出カメラ（POV・OTS・Whip・Dolly Zoom・衝撃）— WP-09
- 現状：`camera_cinematic.js` に orbit/face/dolly/crane/follow/rail の生成のみ（台帳の5種は未実装）、未配線。
- 設計：**Python のみ**（新規 `camera_cinematic.py`）。すべて「フレーム範囲＋パラメータ（＋必要なら samples）→ キー列」の純関数。UI はプレビュー HTTP を呼び、返ったキーをプレビュー表示→確定でローカル挿入（1 Undo）。`camera_cinematic.js` は使わない（削除しない）。
  1. **POV**（主観）：対象の頭ボーン位置＋オフセット（既定 前方 0.08m・上 0.02m）にカメラ、向きは頭ボーンの前方。前方＝頭ボーンのワールド回転を (0,0,1)（**モデル前方 +Z**）に適用したベクトル。ボーン座標・前方は samples（`[{frame, points:{head:[x,y,z]}, forward:{head:[x,y,z]}}]`）から取る。samples 無しは 409 `model_not_loaded`。頭ボーンのローカル +Z がモデル前方と一致するかはモデル依存で**未検証**（テスト GLB では一致させる）。
  2. **OTS**（肩越し）：被写体 A の肩（`shoulder_l/r` マーカー、無ければ頭位置から横 0.2m）の後方 `back`（既定 0.6m、モデル前方の逆）・上 `up`（0.1m）・横 `side`（0.35m、左右選択）にカメラ、注視点は被写体 B（単一モデルでは B を「点」`lookAt` で指定、無ければ A の前方 3m）。
  3. **Whip**（ウィップパン）：開始向き→終了向きを `duration`（既定6フレーム）で回すヨー回転（`pan_yaw` と同じ回転）。キー補間 `expo`。前後は `hold`。モーションブラーは Phase F（ショットの `meta.motionBlurHint:true` を結果に返すだけで保存しない）。
  4. **Dolly Zoom**：被写体までの光軸距離 d と縦 FOV θ を `d·tan(θ/2) = 一定` で変える。入力 `fov:[start,end]`（5〜150）、開始距離 d0（開始姿勢）。各サンプル `d = d0·tan(θ0/2)/tan(θ/2)`。d < 0.1m になる組み合わせは 400 `invalid_range`。
  5. **衝撃**（シェイク）：開始フレームから `duration`（既定12）で、振幅 `amplitude`（既定 位置 0.03m・ロール 1.0度、上限 0.3m・10度）が `exp(−5·t)` で減衰する揺れを、**シード付き疑似乱数 mulberry32（seed 既定1）**で位置（カメラ右・上方向）と `roll` に加える。同じ seed は同じ結果。毎フレームキー。
  - 生成キーの `interpolation`：Whip は前述、他は `linear`。
- API・MCP：`POST /api/camera/cinematic/preview` 本文 `{type:'pov'|'ots'|'whip'|'dolly_zoom'|'shake', from, to, params, base_frame?, samples?, project?}` → `{ok, revision, result:{keys, meta}}`。MCP `bai_camera_cinematic_preview`（確定は `bai_camera_keys_apply`）。
- テスト：`tests/test_camera_cinematic.py`：POV のカメラ＝頭＋オフセット、Dolly Zoom の d·tan(θ/2) 一定（1e-9）、衝撃の同 seed 同結果・上限内・減衰、Whip の前後 hold、samples 無しの POV/OTS で `model_not_loaded`。Playwright：プレビューでキー不変、確定で1 Undo。
- 規模：中。**標準モデル可**。

### CAM-013 撮影用途別テンプレートライブラリ（格闘/MV/ホラー/建築/商品/SNS）— WP-11
- 現状：用途別ライブラリなし（固定構図5種と4レンズのみ）。
- 設計：
  1. 組み込みテンプレート定義 `camera_templates.json`（読取専用、リポジトリ管理）。各要素：`{id, category, name, description, aspect:'16:9'|'9:16'|'2.39:1'|'1:1', lens:{focalMm, fStop}, generator:{kind:'cinematic'|'rig'|'pose', type, params}, recommendedFrames:[min,max]}`。
  2. 18件（付録A で値を固定）。生成は Python `camera_templates.py` が `camera_cinematic.py`・`camera_rig.py` を呼ぶ。
  3. **aspect はフレーミング補助線の縦横比だけを設定**（CAM-004 §3）。
  4. UI：撮影画面に「テンプレート」パネル（カテゴリタブ→カード一覧）。適用＝範囲指定→プレビュー（HTTP）→確定（ローカル挿入、1 Undo）。適用時、テンプレートの `lens` は生成キーの `fov`（focalMm 換算）・`fStop` に入る。「マイプリセットに複製」で CAM-014 の `custom_presets` に `category` 付きでコピー（静止構図＝開始姿勢のみ）。テンプレート本体は書き換えない。
  5. 新 UI（/workspace/22）のテンプレート画面は Phase E 後の P2 移植時に同じ JSON を読む（今回は既存カメラ画面に実装）。
- API・MCP：`GET /api/camera/templates` → `{ok, revision:null, result:{templates}}`。`POST /api/camera/templates/preview` 本文 `{id, from, to, base_frame?, samples?, project?}` → `{ok, revision, result:{keys, aspect, lens}}`。MCP `bai_camera_template_list`・`bai_camera_template_preview`。静的配信は不要（API で取得）。
- テスト：JSON スキーマ検証（18件すべて生成可能で例外なし。POV 系は samples ありで）、適用→Undo、複製後に元テンプレート不変、aspect 適用で撮影キー不変。
- 規模：中（大半はデータ）。**標準モデル可**。

### CAM-014 カメラプリセット お気に入り・タグ・検索（JSON/VMDと履歴）— WP-10（JSON）、WP-13（VMD）
- 現状：名前（1〜48文字）＋姿勢の保存・適用・削除のみ（最大64）。使用中プリセットの削除は UI で禁止（`camera.js:204`）。
- 設計：
  1. フィールド追加（§2.3）：`tags`・`favorite`・`lens{fStop?, focusDistance?}`・`pose.roll`・`createdAt`/`updatedAt`（クライアント付与）、トップの `preset_history`。`category` は WP-11。
  2. 検索：名前・タグ・カテゴリを対象に **NFKC 正規化＋casefold の部分一致**。「お気に入りのみ」「タグ（AND）」。並び：お気に入り→最近使った順（`preset_history`）→名前。
  3. **履歴**：「使用履歴（最近使ったプリセット、最大20件）」＋「プリセット操作の Undo/Redo」。プリセット内容の版管理は作らない（§9 Q2、既定はこの解釈）。
  4. **名前変更**：同じトランザクション（UI では同じ Undo 1件、API では同じ保存1回）で `sequence[]` の参照（`preset` と `source.name`）と `preset_history` の名前も更新。重複名は 409 `invalid_payload`（「同名があります」）。
  5. **削除**：シーケンスで使用中なら 409 `preset_in_use`（現行 UI 規則をサーバーにも）。
  6. **JSON 入出力**：選択プリセットを `bai-camera-presets.json`（`{schema:1, presets:[...]}`）として書出し／読込。読込時に名前が重複したら「 (2)」「 (3)」…を付けて追加（上書きしない）。上限64を超える分は読み込まずに件数を報告。
  7. **VMD 入出力（WP-13）**：プリセット1件＝1フレーム（フレーム0）のカメラ VMD（CAM-016 のエンコーダ）＋サイドカー（`lens`・`tags`・`favorite`・FOV の小数値）。VMD 読込時は最初のキーを姿勢として取り込み（付録B の取込変換）、名前は VMD ファイル名（拡張子除く）。
  8. UI：プリセット一覧をカード（名前・タグ・★）にし、検索欄・タグチップ・★切替・複製・名前変更・JSON 入出力ボタン（VMD は WP-13 で追加）。適用時に `preset_history` を更新（1 Undo には含めない＝閲覧操作扱い、ただし dirty にする）。
- API・MCP（WP-10）：
  - `GET /api/camera/presets/search?q=&tags=a,b&favorite=1` → `{ok, revision, result:{presets}}`。
  - `POST /api/camera/presets/manage` 本文 `{action:'add'|'update'|'rename'|'delete'|'duplicate'|'favorite'|'tag'|'untag'|'import', name?, preset?, new_name?, tags?, favorite?, presets?, revision}` → `{ok, revision, result:{presets, renamed_refs?}}`。
  - `POST /api/camera/presets/apply` 本文 `{name, frame, revision}`（キーへ書く＝`merge_key`、姿勢＋`lens`、`preset_history` 更新）。
  - MCP `bai_camera_preset_search`・`bai_camera_preset_manage`・`bai_camera_preset_apply`。
- テスト：`tests/test_camera_presets.py`：検索（全角/半角・大小文字）、重複名の自動改名、JSON 往復で完全一致、名前変更でシーケンス参照が同時更新、使用中削除で `preset_in_use`、履歴20件上限、64件上限。VMD 往復（WP-13）：姿勢一致（位置 1e-4m、FOV はサイドカーで完全一致）。
- 規模：中。**標準モデル可**。

### CAM-015 カメラ連結・カット・時間同期（最終姿勢継承と瞬時カット）＋シーケンサー — WP-12（preset）、WP-13（clip・inherit）
- 現状：ショット検証（`camera_sequence.py`、`{start,end,preset,transition:'cut'}`、半開区間・重複不可）・編集 API（`expected_sequence` 照合）・評価 API・MCP・UI（追加/削除/移動/再取得）あり。UI に update なし。ショットはプリセット（静止構図）参照のみ。
- 設計（MASTER＋複数カメラ設計とは**合流しない**。単一カメラのシーケンサーを完成させる）：
  1. **ショットの形**：
     - preset ショット：旧形 `{start, end, preset, transition:'cut'}` のまま（UI もこの形で書く。黙って `source` へ移行しない）。新形 `{start, end, source:{kind:'preset', name}, transition:'cut'}` も受理し、与えられた形のまま保存（`name` は存在するプリセット）。
     - clip ショット（WP-13）：`{start, end, source:{kind:'clip', clip:<vmd_clips の id>, from:<クリップ内フレーム（rebase後、プロジェクトフレーム）>}, inherit?:bool, transition:'cut'}`。ショット開始 `start` にクリップの `from` が対応（`clipFrame = from + (f − start)`）。クリップがショットより短ければ最終姿勢を保持。
     - keys ソースは作らない（根拠なし）。
  2. **最終姿勢継承** `inherit:true`（clip ショットのみ。preset ショットで true は 400 `invalid_payload`）：直前ショット（`end == このショットの start` で接する場合のみ。隙間があれば直前フレームのプロジェクトキー姿勢）の最終フレーム（`start − 1`）の姿勢を P とし、クリップの最初の姿勢 C0 との差 `Δ = P.position − C0.position` を、クリップ全体の `position` と `target` に加える（平行移動のみ）。向き・FOV・ロールは変えない。向きの不連続量 `orientationDeltaDeg` を評価結果に返し UI に表示（隠さない）。
  3. 瞬時カット：境界フレームで切替。半開区間 `[start,end)`（既存）。隙間は「ショットなし＝プロジェクトキーをそのまま再生」（既存）。
  4. **時間同期**：シーケンスのフレームは共通タイムライン（モーションクリップと同じ fps・フレーム番号）。音声オフセットは作らない（根拠なし、音楽同期は Phase D）。
  5. UI：撮影画面下段に**ショット帯**（ショットごとの色帯・名前・ドラッグで境界移動（重複時は中止）・分割（再生ヘッド位置で2つに）・削除・選択して詳細編集＝update）。再生ヘッドが入っているショットを強調。clip ショット追加は WP-13。
  6. 評価：`camera_sequence_playback.activeShot`（JS）と `camera_sequence_api.evaluate`（Python）を clip 対応に拡張（WP-13、parity）。clip が欠損（§CAM-001-8）なら `{source:'clip_missing', pose:null}` を返し、Camera View はプロジェクトキーの姿勢を表示したうえで「クリップ欠損：キー姿勢を表示中」を必ず出す（黙った代替にしない）。
  7. VMD 書出し（CAM-016）はシーケンス適用後の姿勢をベイク。
- API・MCP（WP-12）：既存 `sequence/edit` に `revision`（任意）を追加（§2.4）、`update` を UI でも使う。応答に `revision`。WP-16 で `action:'replace'`（シーケンス全置換、`expected_sequence` 必須）を追加。
- テスト：既存テスト＋`tests/test_camera_sequence_v2.py`：update、旧形・新形 preset の保存形維持、境界フレームでのゼロ遅延（f=start で新ショット）、隙間、保存往復、MCP からの update と revision 競合。WP-13：clip の時刻対応、短いクリップの保持、inherit の平行移動量、`orientationDeltaDeg`、欠損表示。Playwright：ショット帯のドラッグ1回＝1 Undo。
- 完了ゲート：画面・再生・保存・両MCP。
- 規模：中〜大。**標準モデル可**。

### CAM-016 MMDカメラVMD書出し（FOV・位置・距離・回転・補間）— WP-13
- 現状：ネイティブトラックの往復書出しのみ（`encode_camera_track`）。BAI プロジェクトからの書出しなし。ブリッジ `preview_pose` は**単位換算なし**（MMD 1単位＝BAI 1単位として表示している）。
- 設計：
  1. **単位の統一**：`MMD_UNIT_PER_M = 12.5` を `camera_vmd_bridge.py`（と JS `camera_vmd_local.js`）に定義し、`preview_pose` の出力（position・target）を 1/12.5 にする。**これは既存の試験プレビューの見え方を変える**（現在は MMD 単位のまま表示しており、BAI の m 単位モデルに対して12.5倍の大きさになる）。変更をコミット本文・`VMD_EXPERIMENTAL_PREVIEW_20261018_JA.md` に記録。取込（CAM-001）・書出し・ブリッジで同じ定数を使う。UI での変更は不可（定数）。
  2. 新規 `camera_vmd_export.py` `export_project(project, *, start, end, step=1, fps) → {raw, sidecar, report}`：シーケンス適用後の姿勢（`camera_sequence_api.evaluate` と同じ）を `step` フレームごとにサンプルし、付録B の書出し変換（**ブリッジの厳密な逆**）で MMD カメラキーへ。
     - フレーム：`f_vmd = round(f_project · 30 / fps)`。同じ `f_vmd` が重なれば先のキーを残し `report.merged_frames` に記録。
     - 距離は負値（MMD の慣例、既定カメラ −45）。
     - 回転のオイラー角は前キーとの差が最小になるよう ±2π で連続化（MMD はオイラー各成分を線形補間するため）。
     - 補間：毎サンプルなので線形 `(20,20,107,107)` を6チャンネルに（並びは `VMD_CAMERA_INTERP_ORDER`）。
     - 視野角：整数度へ丸め、[1,180] にクランプ。丸め誤差の最大値を `report.fov_round_max_deg` に。
     - `perspective = 0`。
     - キー数が 100000 を超えたら 400 `too_many_keys`。
  3. **サイドカー** `<name>.vmd.bai.json`：`{schema:1, fps, mmdUnitPerM:12.5, frames:[{vmdFrame, projectFrame, fov, fStop, focusDistance, roll}]}`（VMD に入らない小数 FOV・F値・合焦距離）。読込時にサイドカーがあれば FOV 小数値・レンズ値を復元、無ければ VMD だけで復元し「レンズ情報なし」と表示（紛失検出）。
  4. UI：「プロジェクトをVMDに書き出す」（範囲・step）。書出し後に**自動で再読込（CAM-001 の取込）して差分を表示**（最大誤差：位置 m、角度 度、FOV 度）。
- API・MCP：`POST /api/camera/vmd/export-project` 本文 `{start, end, step?, name, project?}` → `{ok, revision, result:{file:'data/camera_exports/<name>.vmd', sidecar:'data/camera_exports/<name>.vmd.bai.json', report}}`＋UI 用に `?download=1` で VMD バイナリを返す。`name` は 1〜64 文字の英数字・`-`・`_`・日本語可、`/`・`\`・`..` 不可。MCP `bai_camera_vmd_export`（ファイルに書いてパスを返す。出力のみで project は変えない）。CAM-014 のプリセット VMD 入出力 `POST /api/camera/presets/vmd-export`・`vmd-import` もここで追加。
- テスト：`tests/test_camera_vmd_export.py`（既存の同名ファイルは旧 `camera_vmd.py` 用のため、新規は `tests/test_camera_vmd_export_project.py`）：**固定試験データ＝MMD 既定カメラ**（target (0,10,0)、distance −45、rotation (0,0,0)、fov 30）→ BAI 姿勢 target (0,0.8,0)・position (0,0.8,3.6)・up (0,1,0)・roll 0（付録B で導出）。BAI→VMD→取込→BAI で位置誤差 < 1e-3m（float32）、角度 < 1e-3度、ロール ±170度・真下向き（縮退）・回転の連続化、FOV 丸め ≤0.5度、サイドカー往復一致、フレーム写像（fps 24/60）、件数。
- 完了ゲート：上記＋補間バイト順の検証（CAM-001 と共通）。MMD 本体での読込確認は**オーナー確認待ち（未検証記録）**。ブリッジの回転順・符号（X→Y→Z、Z 反転）自体が MMD の実際の表示と一致するかも**未検証**（現行ブリッジの仮定。付録B）。
- 規模：中。**座標変換（付録B）の実装後レビューだけ高性能モデル**、実装は標準モデル可。

### CAM-017 カメラ衝突回避・構図品質（ステージ/被写体との衝突）— WP-15
- 現状：実装なし。CAM-004 の見切れ判定のみ。
- 設計（**衝突の事実検出と、ユーザーが選ぶ回避案**まで。構図品質の自動 NG はしない）：
  1. 衝突体：被写体＝ブラウザが評価した各フレームの包囲箱（`bai-camera-model-bounds` の AABB）を各辺 `margin`（既定 0.05m）膨らませたもの。ステージ＝`collision.colliders`（`{name, min, max}`、最大64）＋床（y=0、`collision.floor`）。ステージモデルのメッシュからの自動生成は**しない**（Phase H）。
  2. 判定：各フレームのカメラ位置が衝突体の内側、または衝突体表面までの距離が `minDistance`（既定 0.2m）未満。ニアクリップ（0.1m）で被写体包囲箱にめり込む場合も「近すぎ」。
  3. 出力：区間一覧（開始・終了・種類 `subject|stage|floor`・衝突体名・最小距離）とタイムライン色帯。
  4. 回避案（任意）：衝突区間の各キーについて、衝突体の最近点から外向きにカメラを `minDistance` まで押し出した位置を**プレビュー**。確定で該当キーの `position` のみ更新（1 Undo）。注視点は変えない。
  5. 「構図品質」は CAM-004 の事実表示（見切れ方向と量）を同じ区間一覧に並べるだけ。点数化・合否はしない。
- API・MCP：Python `camera_collision.py`。`POST /api/camera/collision/check` 本文 `{from, to, step?, samples?:[{frame, bbox:{min,max}}], project?}` → `{ok, revision, result:{intervals, fixes:[{frame, position}]}}`。samples 無しはステージ・床だけで判定し `subject_source:'none'` を返す（被写体衝突は「未評価」と明示）。MCP `bai_camera_collision_check`（確定は `keys/merge`）。
- テスト：`tests/test_camera_collision.py`：合成 AABB で内側/近接/外側、床、押し出し後に minDistance 以上、注視点不変、samples 無しで `subject_source:'none'`。
- 規模：中。**標準モデル可**。

### CAM-018 自動ディレクターとショット選択（動作/主役交代に追従）— WP-16
- 現状：実装なし。
- 設計（**提案を作るだけ。適用はユーザー確定**）。Python `camera_director.py`：
  1. 入力：対象範囲、候補（プリセット・テンプレート・既存ショット）、ルール `{minShotFrames:45, maxShotFrames:240}`、samples：各被写体・各フレームの主要ボーン座標（`hips, spine, chest, head, hand_l, hand_r, foot_l, foot_r`）と包囲箱。
  2. **activity**：被写体 s・フレーム f で、上記ボーンのうち解決できたものの速度 `|p(f) − p(f−1)|·fps` の**平均**。範囲内の全被写体・全フレームの最大値で割って 0〜1 に正規化（最大値 0 なら全 0）。f の最初のフレームは次フレームとの差を使う。
  3. **主役**：各フレームで activity 最大の被写体。直前の主役との差が 0.1 未満なら直前を維持（ちらつき防止）。
  4. **カット候補**：主役が変わる点＋activity の山（15フレーム移動平均の極大で、前後の谷との差が 0.2 以上）。`minShotFrames` 以上の間隔に間引き（先の候補を優先）、`maxShotFrames` を超える区間は等分割。
  5. **ショットサイズ**：候補ごとに、区間の主役包囲箱の高さ h と、候補カメラ位置から主役包囲箱中心までの距離 d の比 `d/h`：> 2.5 → `wide`、1.2〜2.5 → `medium`、< 1.2 → `close`。
  6. **スコア**：区間の主役 activity 平均 a が ≥0.5 → `wide` +2・`medium` +1。0.2〜0.5 → `medium` +2・`wide` +1・`close` +1。<0.2 → `close` +2・`medium` +1。直前ショットと同じ候補は −1。最高点、同点は候補リスト順。
  7. 出力：CAM-015 形式の `sequence` 案（preset 候補は旧形 preset ショット、クリップ候補は clip ショット）。各ショットに `reason`（「主役が B に交代」「動きのピーク」「最大長で分割」）、`score`、`shotSize`。
  8. UI：ショット帯に半透明で重ねて表示、「この案を適用」で `sequence` を置き換え（1 Undo、置き換え前を確認ダイアログで表示）。
  9. 被写体1体では主役交代は起きず、動きの山だけでカット。複数人の実機検証は Phase C 以降（§9 Q1）。
- API・MCP：`POST /api/camera/director/propose` 本文 `{from, to, candidates:[{kind:'preset'|'template'|'clip', id}], rules?, samples, project?}` → `{ok, revision, result:{sequence, details}}`（samples 無しは 409 `model_not_loaded`）。適用は `sequence/edit` の `action:'replace'`（WP-16 で追加、`expected_sequence` 必須、`revision` 任意）。MCP `bai_camera_director_propose`。
- テスト：`tests/test_camera_director.py`：合成 activity（2被写体の交代、山、平坦）で期待カット位置、min/max 制約、ショットサイズ閾値の境界（2.5・1.2）、スコア表、同一入力で同一結果、`replace` の競合。Playwright：適用→Undo。
- 規模：中。**標準モデル可**（数値は本書で固定。調整はオーナー確認後）。

---

## 4. 作業パッケージ（WP）と順番

**上から順に実装**（AGENTS.md の順序固定。Phase E 内で前倒し・入れ替えをしない）。前提は必ず上にある WP だけ（循環なし）。

| 順 | WP | 内容 | 対象ID | 前提 | 追加する API・MCP | モデル |
|---|---|---|---|---|---|---|
| 1 | WP-00a | G-01/03/07/08/11/13、`camera_core.js`（UMD）、parity fixture、静的配信（core・easing） | 全体 | なし | なし（`GET /api/camera/focus` の定義修正のみ） | 標準 |
| 2 | WP-03 | 実ブラウザーテスト土台（`BAI_DATA_DIR`、three devDependency、CDN 振替、SwiftShader、テスト GLB、`BAICameraDebug`） | 全体 | WP-00a | なし | 標準 |
| 3 | WP-04 | CAM-005／E-FOCUS-01/02 全部（§3） | CAM-005 | WP-00a, 03 | `POST /api/camera/focus/evaluate`、`/focus/target-preview`、MCP 読取2種 | 標準＋契約適合レビュー（高性能1回） |
| 4 | WP-02 | 保存・復元の完成＋G-04/05/06/12、revision 基盤、`camera_tools.json`、WebMCP をカメラ画面へ、bundle MCP | 保存・全体 | WP-00a, 03, 04 | `POST /api/camera/project`（必須化）、`/project/reset`、`/project/bundle/recover`、`GET /api/camera/asset-ref`、`POST /api/camera/keys/merge`、`/keys/apply`、MCP `bai_camera_get/set`（変更）、`bai_project_bundle_get/save`、`bai_camera_keys_merge/apply`、`bai_camera_focus_commit` | 標準（ジャーナルの実装後レビューのみ高性能） |
| 5 | WP-12 | CAM-015（既存の名前＋姿勢プリセットでショット完成） | CAM-015 | WP-02 | `sequence/edit` に revision・応答 revision | 標準 |
| 6 | WP-05 | CAM-003（15モード UI、トラック別、カーブエディタ、G-09） | CAM-003 | WP-00a, 02 | なし（既存で編集） | 標準 |
| 7 | WP-06 | CAM-006（roll、新操作、入力割当） | CAM-006 | WP-00a, 02 | `POST /api/camera/move`、MCP `bai_camera_move` | 標準 |
| 8 | WP-07 | CAM-007〜010（rig 拡張、`jib`・`spline`・`spin`、`camera_rig.py`） | CAM-007〜010 | WP-06 | `POST /api/camera/rig/bake`、MCP `bai_camera_rig_bake` | 標準 |
| 9 | WP-08 | CAM-011（複数ターゲット、fitAll） | CAM-011 | WP-02, 04 | WebMCP `bai_camera_follow_fit_all` | 標準 |
| 10 | WP-09 | CAM-012（Python 映画演出） | CAM-012 | WP-06, 07 | `POST /api/camera/cinematic/preview`、MCP | 標準 |
| 11 | WP-10 | CAM-014（タグ・お気に入り・検索・履歴・改名連動・JSON 入出力） | CAM-014 | WP-12 | `presets/search`・`/manage`・`/apply`、MCP 3種 | 標準 |
| 12 | WP-11 | CAM-013（テンプレート18件） | CAM-013 | WP-07, 09, 10 | `templates`・`templates/preview`、MCP 2種 | 標準 |
| 13 | WP-13 | VMD 統合：CAM-016 書出し＋CAM-001 分割・登録＋CAM-015 clip ショット・inherit＋CAM-014 VMD 入出力＋単位統一＋G-10 | CAM-016, 001（015・014 の VMD 部分） | WP-12, 10 | `vmd/clips/upload`・`clips`・`clips/preview`・`vmd/export-project`・`presets/vmd-export/import`、MCP 4種 | 標準＋付録Bの座標レビュー（高性能1回） |
| 14 | WP-14 | CAM-002 類似分類 | CAM-002 | WP-13 | `POST /api/camera/similarity`、MCP | 標準 |
| 15 | WP-15 | CAM-004 表示整理＋CAM-017 衝突 | CAM-004, 017 | WP-04, 02 | `POST /api/camera/collision/check`、MCP、WebMCP `bai_camera_framing_state` | 標準 |
| 16 | WP-16 | CAM-018 自動ディレクター | CAM-018 | WP-12, 08, 11, 13 | `POST /api/camera/director/propose`、`sequence/edit` の `replace`、MCP | 標準 |
| 17 | WP-17 | 2画面の片側最大化・分割幅変更（操作設計 §1・§2） | 横断（UI） | WP-03 | なし | 標準 |
| 18 | WP-18 | 4経路一致の総合テスト・台帳更新・未検証一覧の確定 | 全体 | 全部 | なし | 標準（最終レビュー高性能1回） |

- 残件監査の「CAM-005 → 保存完全復元 → CAM-015」の順を、土台（WP-00a・03）の後にそのまま守っている。

### 4.1 WP ごとの受け入れ条件（すべて満たしてから次の WP へ）
共通：該当テストの追加・全既存テスト合格（`python -m pytest -q`、`node --test tests/*.cjs test_camera_*.cjs`、該当 Playwright、`npm run typecheck`）、台帳 `implementation_assessment`・`notes` 更新、コミット本文に要件ID・テスト結果・未検証事項。

- **WP-00a**：parity 60件以上が JS・Python で合格。`camera.js` の `sample` が15モード・fStop・hold 境界で Python と一致。`writeKey` で既存 `customCurve`・`fStop` が残る（`tests/test_camera_mergekey.cjs`）。JS `moveCamera` の orbit/tilt が有限値かつ Python と一致（G-13）。`GET /api/camera/focus` が光軸方向深度（`tests/test_camera_focus_optical_depth.py`）。F値 64 を UI で入力・保存できる。旧テスト2件が `tests/legacy/` に移り実行対象外。
- **WP-03**：§2.9 の受け入れ（テスト GLB 登録→両画面描画→時刻同期）、`webgl_renderer` 記録、本番 `data/` が変わらない（テスト前後で `git status data/` 不変）。
- **WP-04**：§3 CAM-005 のテスト全部。契約ゲート1〜4 の Playwright 合格。ゲート5のうち保存・再読込は WP-02 完了時に追加して合格させる（WP-04 の時点では未検証と記録）。
- **WP-02**：§2.7・§2.8 のテスト全部。MCP `bai_camera_set` で sequence/rig/presets が消えない（G-05 回帰）。bundle 保存→再読込→復元で workspace 全項目と camera が一致（Playwright）。ジャーナル残存で 423、recover 2種。`camera.html` で WebMCP のカメラツールが登録され main 用ツールは登録されない。
- **WP-12**：§3 CAM-015 の WP-12 分テスト。UI の update、ショット帯操作1回＝1 Undo、MCP update と revision 競合。
- **WP-05**：§3 CAM-003 のテスト。`easingPresets` 100件。
- **WP-06**：§3 CAM-006 のテスト。操作設計 §9 CAM-UI-01〜04・CAM-KEY-01〜03。
- **WP-07**：§3 CAM-007〜010 のテスト。旧 `crane`・`curve`・`orbit` データの回帰一致。rig parity。
- **WP-08**：§3 CAM-011 のテスト。
- **WP-09**：§3 CAM-012 のテスト。
- **WP-10**：§3 CAM-014 の JSON 部分のテスト。
- **WP-11**：§3 CAM-013 のテスト。
- **WP-13**：§3 CAM-001・CAM-016・CAM-015(clip)・CAM-014(VMD) のテスト。`VMD_CAMERA_INTERP_ORDER` の検証結果（済／未検証）を台帳 `notes` に記録。
- **WP-14〜16**：各 §3 のテスト。
- **WP-17**：Scene/Camera の片側最大化ボタン（各ペイン右上、もう一度押すと2画面へ）、中央のスプリッター（ドラッグで分割比 0.2〜0.8、キーボード ←→ で 0.05 刻み、`role="separator"`・`aria-valuenow`）、幅 950px 以下は上下配置（既存 CSS）でスプリッターは上下方向。最大化・分割比を workspace `view:{layout:'split'|'scene'|'camera', splitRatio}` に保存（このWPで `validate_workspace` に追加）。リサイズ中にキー・カメラ姿勢が変わらない、`resizeRender` が呼ばれ両 canvas の縦横比が正しい（Playwright、CAM-PERF-01 の一部）。
- **WP-18**：§8 のゲート。

---

## 5. テスト方針（まとめ）
- 単体：Python `tests/test_camera_*.py`（既存のルート `test_camera_*.py` もそのまま実行）、Node `tests/test_camera_*.cjs`（`node:test`）と既存ルート `test_camera_*.cjs`。
- 照合：parity fixture（§2.2）、ツール定義一致（§2.5）、静的配信（§2.11）。
- 画面：`tests/camera-ui.test.cjs`（SwiftShader。結果に「GPU未検証」と記録）。
- 往復：保存→初期化→復元の全フィールド比較、VMD 書出し→再読込。
- コミットごとに `npm run typecheck`（新UI）・`python -m pytest -q`・`node --test tests/*.cjs test_camera_*.cjs`・該当 Playwright を実行し、結果（件数）をコミット本文と台帳に書く。既存の失敗があれば件名と理由を書き、隠さない。

## 6. 台帳（PHASE_E_IMPLEMENTATION_STATUS.json）の更新ルール
- 各 feature に **`notes`（文字列配列、任意）を追加**する（schema_version は 1 のまま。追加フィールドのみ）。各要素は `"YYYY-MM-DD WP-xx: 内容"`。SwiftShader 合格・未検証事項・バイト順の検証状況などをここに書く。
- `implementation_assessment`：何ができて何が未かを1〜3文。
- `evidence_paths`：実装・テストのファイルを追加。
- `ui_api_webmcp_stdio_mcp_verified`：WP-18 の4経路一致テストが通った ID だけ true。
- `real_browser_verified`：**実GPU**での確認をした ID だけ true（SwiftShader では false のまま、`notes` に「SwiftShader 自動テスト合格」）。
- `release_complete`：§8 のゲートをすべて満たし、オーナー確認が済んだときだけ true。

## 7. 新UI（/workspace）との関係
- Phase E の実装は**既存の `camera.html` 系に対して行う**。新UIへの移植は P2（Phase E の後、オーナー決定）。
- API・MCP は共通なので、新UIの「実機能」表示は P2 で API を読むだけで済む。新UIのモック画面（SCR-02/03/04/14/15/16/22）の項目名は本書の名称に合わせて P2 で直す。

## 8. 完了ゲート（Phase E 全体）
1. 18機能と E-FOCUS-01/02 すべてで、本書の「テスト」が自動で合格。
2. 4経路（UI・HTTP API・WebMCP・標準MCP）で同じ操作・同じ samples が同じ結果（WP-18）。標準MCP の制限（ブラウザー必須の機能）は一覧で明記。
3. 保存→再起動相当→復元で全状態一致（WP-02、WP-13 の clip、WP-17 の view を含む）。
4. 実モデル（テスト GLB）で Scene View と Camera View が同一時刻に表示（SwiftShader）。
5. 未検証事項（付録D：実GPU、実MMD、VMD 補間バイト順、ブリッジの回転順、実データでの目視、別モデル複数人、センサー変更）を一覧化してオーナーに提示。**ここで初めてオーナーに動作確認を依頼**（AGENTS.md 規則7）。

## 9. 判断に迷ったとき・オーナーへの確認事項
- 迷ったとき：①上位文書を確認 ②本書の「設計」に書いてある最小の解釈で実装 ③書いていない機能は作らず、`docs/roadmap/` の該当箇所に「未決」と追記してコミットし、報告で知らせる。
- **Q1（既定で進める）**：CAM-011/018 の「複数人（別モデル）」の実機検証は、複数モデルの同時読込（Phase C マルチダンサー）が入ってから行う。Phase E では同一モデル内の複数部位とデータ構造・合成データテストまで。
- **Q2（既定で進める）**：CAM-014 の「履歴」は使用履歴＋Undo/Redo と解釈する（版管理は作らない）。
- **Q3（要確認・既定で進める）**：フォーカス設計 §4 は「センサー幅はユーザー変更可能」としているが、本書は焦点距離換算をセンサー縦 24mm 固定にしている（FOV が正本のため、センサーを変えると全キーの焦点距離表示が変わる）。Phase E はセンサー 36×24mm 固定で実装し、変更可能化はオーナー確認後とする。
- **Q4（情報）**：MMD 長さ単位係数は慣例の 12.5（1m＝12.5 MMD単位）。VMD 補間のバイト順は未検証（§CAM-001-2）。
- 未承認候補（実装しない）：本書の作成中に出た追加案はここに書く。現時点では無し（v1 のドローンのバンク、CAM-002 の重みスライダー、CAM-015 の keys ソースと音声オフセットは根拠が無いため削除済み）。

---

## 付録A CAM-013 組み込みテンプレートの値（固定）
「被写体前方」はモデル前方 +Z（§0.2）。aspect はフレーミング補助線のみ（CAM-004 §3）。

| id | カテゴリ | 名前 | aspect | 焦点距離mm / F | generator | 主要パラメータ |
|---|---|---|---|---|---|---|
| fight-impact | fight | インパクト・シェイク | 16:9 | 35 / 4 | cinematic shake | duration 12, amplitude 0.05m/2度, seed 1 |
| fight-orbit | fight | 回り込みオービット | 16:9 | 28 / 5.6 | rig orbit | amount 180, orbit.radius 3.5→3.5, orbit.height 1.2→1.2 |
| fight-low | fight | ローアングル見上げ | 16:9 | 24 / 4 | pose | 被写体前方 2.5m・高さ 0.4m、注視 胸 |
| mv-push | mv | スロープッシュイン | 16:9 | 50 / 2.8 | rig rail | 長さ 1.5m 前進, bake_ease sine |
| mv-half-orbit | mv | 半周オービット | 2.39:1 | 50 / 2 | rig orbit | 開始方位 −90, amount 180, orbit.radius 3→3 |
| mv-crane-up | mv | クレーン上昇 | 16:9 | 35 / 4 | rig jib | elevation −10→35, armLength 4→4, swing 0→0 |
| horror-pov | horror | 主観POV | 16:9 | 24 / 2.8 | cinematic pov | offset 前0.08/上0.02 |
| horror-pullback | horror | ゆっくり後退 | 16:9 | 35 / 2 | rig rail | 長さ 2m 後退, bake_ease quad |
| horror-dutch | horror | ダッチアングル | 16:9 | 35 / 2.8 | pose | roll 15度、被写体前方 3m |
| arch-slide | arch | 等速レール横移動 | 2.39:1 | 24 / 8 | rig rail | 横 4m, constant_speed true |
| arch-drone | arch | ドローン俯瞰 | 16:9 | 18 / 8 | rig spline | 3点、高さ 8→10→12m、注視点固定（バンクなし） |
| arch-tiltup | arch | ティルトアップ | 16:9 | 24 / 8 | rig spin | spin.pitch −10→30, spin.yaw 0→0 |
| prod-turntable | product | ターンテーブル | 1:1 | 85 / 5.6 | rig orbit | amount 360, orbit.radius 1.2→1.2, orbit.height 0.3→0.3 |
| prod-dollyzoom | product | ドリーズーム | 16:9 | 50 / 4 | cinematic dolly_zoom | fov 40→20 |
| prod-macro | product | マクロ寄り | 1:1 | 105 / 8 | rig rail | 長さ 0.3m 前進 |
| sns-bust | sns | 縦型バストアップ | 9:16 | 50 / 2.8 | pose | 被写体前方 1.6m・高さ 1.45m、注視 顔 |
| sns-dollyin | sns | 縦型ドリーイン | 9:16 | 35 / 2.8 | rig rail | 長さ 1m 前進 |
| sns-whip | sns | 縦型ウィップ | 9:16 | 28 / 4 | cinematic whip | yaw 0→90, duration 6 |

※ v1 の prod-macro 100mm は10段選択に無い値のため 105mm に変更。

## 付録B MMD カメラ座標変換（コードで確認した式。MMD 実機との一致は未検証）

**取込（現行 `camera_vmd_bridge.preview_pose`、`camera_vmd_local.js preview` と同一。WP-13 で単位 1/12.5 を追加）**
- 入力：MMD 注視点 `c=(cx,cy,cz)`、回転 `(x,y,z)`（ラジアン）、距離 `d`（通常負）、`fov`（整数度）。
- `_rotate_xyz` は**ベクトルに X 軸回転→Y 軸回転→Z 軸回転の順に適用**（`camera_vmd_bridge.py:14-21`）。行列で `R = Rz(z)·Ry(y)·Rx(x)`：
  ```
  R = [[cz·cy, cz·sy·sx − sz·cx, cz·sy·cx + sz·sx],
       [sz·cy, sz·sy·sx + cz·cx, sz·sy·cx − cz·sx],
       [−sy,   cy·sx,            cy·cx          ]]
  ```
- `v = R·(0,0,d)`、`u = R·(0,1,0)`。Z を反転（左手系→右手系）：
  `target_BAI = (cx, cy, −cz)/k`、`position_BAI = target_BAI + (vx, vy, −vz)/k`、`up_BAI = (ux, uy, −uz)`、`k = MMD_UNIT_PER_M = 12.5`。
- `roll` は `up_BAI` から §0.2 の逆算。

**書出し（取込の厳密な逆。WP-13 で実装）**
1. BAI 姿勢 `(position p, target t, fov, roll)` から §0.2 で `up`（縮退時は前サンプルの right0）。
2. MMD 空間へ：`c = (tx, ty, −tz)·k`、`v' = ((p−t).x, (p−t).y, −(p−t).z)·k`、`u' = (up.x, up.y, −up.z)`。
3. `d = −|v'|`（負の距離）。`w = v'/d`（= R の第3列）。`u'' = normalize(u' − (u'·w)·w)`（= R の第2列）。`r1 = u'' × w`（= R の第1列。単位行列で e2×e3=e1 を確認）。
4. オイラー分解（R = Rz·Ry·Rx）：`y = asin(−R[2][0])`、`x = atan2(R[2][1], R[2][2])`、`z = atan2(R[1][0], R[0][0])`。
   - ジンバル（`|R[2][0]| > 1 − 1e-9`）：`z` は前サンプルの z（無ければ 0）。`R[2][0] = −1`（y=+π/2）なら `x = z + atan2(R[0][1], R[0][2])`、`R[2][0] = +1`（y=−π/2）なら `x = −z + atan2(−R[0][1], −R[0][2])`。
5. 各成分を前キーとの差が最小になるよう ±2π で連続化。
6. `fov_vmd = clamp(round(fov), 1, 180)`、`perspective = 0`。

**固定試験データ（MMD 既定カメラ）**
- MMD：`c=(0,10,0)`、回転 `(0,0,0)`、`d=−45`、`fov=30`。
- 取込：`R=I`、`v=(0,0,−45)`、`target=(0,10,0)/12.5=(0,0.8,0)`、`position=(0,0.8,0)+(0,0,45)/12.5=(0,0.8,3.6)`、`up=(0,1,0)`、`roll=0`。カメラは +Z 側から −Z 方向（モデル正面）を見る＝モデル前方 +Z と整合。
- 書出し：上の BAI 姿勢から `c=(0,10,0)`、`d=−45`、回転 `(0,0,0)` に戻ること（1e-5）。
- 追加ケース：回転 `(0.3, −0.5, 0.2)`、ロール ±170度、真下向き（ジンバル）、距離 −10。

**未検証（実装しても完成扱いにしない）**：①ブリッジの回転順（X→Y→Z）と符号・Z 反転が MMD 本体の表示と一致するか ②VMD 補間バイト順（§CAM-001-2）③VMD の視野角が縦 FOV か。検証方法：mmd_tools のカメラ取込コードとの照合、またはオーナー提供の実 MMD カメラ VMD と MMD 上のスクリーンショットの比較。

## 付録C エラーコード一覧

| error_code | HTTP | 意味 | 主な発生箇所 |
|---|---|---|---|
| `revision_required` | 428 | If-Match（revision）が無い | 書込系 |
| `revision_conflict` | 409 | revision 不一致 | 書込系 |
| `sequence_conflict` | 409 | `expected_sequence` 不一致 | sequence/edit |
| `invalid_payload` | 400 | 形・範囲・重複名など | 全般 |
| `unknown_field` | 400 | 未知フィールド（書込） | project・bundle・workspace |
| `invalid_range` | 400 | フレーム範囲・サンプル上限・幾何的に不可能 | focus・cinematic 等 |
| `too_many_keys` | 400 | キー上限超過（5000／VMD 100000） | keys/apply・VMD |
| `keys_in_range` | 409 | 挿入区間に既存キー | keys/apply |
| `preset_in_use` | 409 | 使用中プリセットの削除 | presets/manage |
| `not_found` | 404 | 素材・クリップ・テンプレートが無い | 各所 |
| `payload_too_large` | 413 | 本文が上限超過 | 各所 |
| `camera_project_invalid` | 422 | 保存ファイルが読めない（退避済み） | camera 読込系 |
| `confirmation_required` | 400 | reset・recover の確認なし | reset・recover |
| `recovery_pending` | 423 | bundle ジャーナルが残っている | 全書込系 |
| `model_not_loaded` | 409 | samples が必要なのに無い | focus・cinematic・director |
| `vmd_unsupported` | 400 | 非対応 VMD（ヘッダー・平行投影の変換） | VMD |
| `vmd_truncated` | 400 | VMD の節が途中で切れている | VMD |
| `clip_missing` | 409 | クリップ原本が無い／sha256 不一致 | VMD・sequence |

結果内の理由コード（HTTP エラーではない）：`bone_missing`、`model_not_loaded`、`behind_camera`、`focus_inside_focal`、`invalid_number`、`fallback_bbox`（CAM-011 注視のみ）。

## 付録D 未検証事項（Phase E 全実装後にオーナーへ提示する一覧の初期版）
1. 実 GPU での描画（2画面・DOF・深度カラー表示・焦点面ガイド）。開発環境は SwiftShader のみ。
2. MMD 本体での VMD 読込・書出し（CAM-001/016）、VMD 補間バイト順、ブリッジの回転順・符号、視野角の定義。
3. 実 FBX/VRM・実アニメーションでのフォーカス・追従・POV（頭ボーン前方 +Z の仮定）。
4. 別モデル複数人（CAM-011/018、Phase C 以降）。
5. センサー寸法変更（Q3）。
6. 実 MMD カメラ VMD クリップでの類似分類（CAM-002）。
