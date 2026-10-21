# Phase E 詳細設計（CAM-001〜018・横断要件）v4 — 2026-10-20 【v4 承認済み（条件付き・最終判定 2026-10-20）：API・計算・保存・MCP は実装可。UI 部分は §7 の読み替え表の追加・レビュー後】

- 位置付け：承認済み Phase E の**残作業を実装可能な粒度まで落とした詳細設計**。新機能の追加ではない。本書に書いた項目はすべて `FEATURE_REGISTER.json` の CAM-001〜018、`PHASE_E_IMPLEMENTATION_STATUS.json` の E-FOCUS-01/02、およびオーナー決定文書に根拠がある。根拠のない案は本書に入れない（入れた場合は §9 の「未承認候補」に送る）。
- 正本の優先順位：`AGENTS.md`（スコープ凍結）＞ オーナー決定文書（`docs/camera/BAI_CAMERA_INTERACTION_DESIGN_V1_JA.md`、`docs/camera/PHASE_E_CAM005_FOCUS_CONSISTENCY_CONTRACT_JA.md`、`docs/camera/BAI_CAMERA_FOCUS_DOF_TEST_MODE_DESIGN_V1_JA.md`、`docs/roadmap/PHASE_E_PROJECT_STATE_ROUNDTRIP_DESIGN_JA.md`、`docs/camera/KEY_INTERVAL_EASING_AND_LENS_20261018_JA.md`、`docs/camera/MASTER_MULTICAMERA_SEQUENCER_DESIGN_V1_JA.md`）＞ 本書。**本書が上位文書と矛盾したら上位文書が正しい**。矛盾を見つけたら実装を止めて本書を直す。
- 基準コード：ブランチ `claude/project-thread-8gcwq2` の `b60d8e1`（`origin/recovery/phase-e-20261019` へ早送り後。カメラ関連コードは `28af8c3` から未変更）。本書の「ファイル:行」はこの時点の行番号。v4 作成時に該当コードを読み直して確認した（§1）。
- 対象読者：実装担当（標準モデル想定）。各作業パッケージ（WP）は「何を・どのファイルに・どの関数名で・どのテストで・何を満たせば完了か」まで決めてある。**本書に書いていない仕様を独自に足さない。** 迷ったら §9 に従う。

---

## 変更履歴

### v3→v4（批評3回目＋所有者の状況変化）

| 指摘 | 内容（要約） | v4 での変更 | 本書の場所 |
|---|---|---|---|
| 判定 | 最終判定（APPROVED WITH CONDITIONS）の条件 C1〜C7 を反映：見出し、UI実装先の決定反映（§0・§7・Q7）、保存経路への追加規則（§2.3）、深度色テスト条件、ジャーナル txid と掃除範囲、付録B追加ケース、付録D 11・12 | 全体 |
| 所有者 | UI 移植（新UI `studio/`）を Phase E より前に行う可能性が高い | §0 に「UIの実装先は所有者判断待ち。API・計算・データ・MCP は実装先に依存しない。UI 節は操作と表示の仕様。新UIに決まれば要素IDを読み替える」を追加。UI 節は書き換えない | §0、§7 |
| 3-B1 samples の形 | samples のスキーマが未定義。`modelTransform` を包む（§0.2）か並べる（§2.5/2.6/API）かが矛盾 | §2.6.1 に samples スキーマ（`frame, subject, bones, markers, bbox, forward, resolved`）、件数・バイト上限、`collectSamples(kind,args)` の種類別引数・出力を定義。`modelTransform` は**本文の兄弟フィールド**に統一 | §0.2、§2.6.1 |
| 3-B2 CAM-005 と上位文書の矛盾 | フォーカス設計 §2・操作設計 §7 は「ボーン欠落時は BBox 中心へ代替し明示」。全身・手動ピック・画面外・モデル未読込の扱い | (a) BBox 中心代替を許可：`target_source:'fallback_bbox'`、明示表示、`in_focus` に分類しない。代替不能（包囲箱なし）のときだけ `bone_missing`。(b) 評価対象・追従対象に `full`（包囲箱中心）、評価対象に `pick`（手動ピック点、workspace）。(c) 対象ごとに `inFrame`・警告 `out_of_frame`。(d) モデル未読込は `unknown`・`model_not_loaded`、ガイド推定は追加フィールド `guideEstimate` のみ。ガイド顔の高さを正規化モデル（2.0）内の 1.8 に修正。Playwright ゲート4と §3 を一致 | CAM-005 §3・§4、§2.6.1 |
| 3-B3 リグの互換 | 付録A が既存 `validate_rig`（`camera_rig_store.py:9-33`）の必須項目と合わない。orbit は `rig.start` が中心（`camera.js:100`） | `camera_rig.py bake(rig, from_frame, to_frame, step, base_pose)` のシグネチャ、リグ種ごとの全フィールドと保存フィールドの対応表を追加。`orbit.height` は**中心からの相対高さ**、`orbit.radius` は水平半径と定義、`elevation`・`startAzimuth` は削除（開始姿勢から導出）。fight-orbit・mv-half-orbit・prod-turntable を修正。`spin` の yaw/pitch は開始の向きからの相対。`spline.lookAt` を CAM-008 で定義。CAM-012 のパラメータ表を追加 | CAM-007〜010、CAM-012、付録A |
| 3-M1 | 付録B と CAM-016 fixture の z | 3.6×1.25 = **4.5**（4.6 は誤り） | CAM-016、付録B |
| 3-M2 | 新規エンドポイントの本文・応答の書き方が混在、invalid-preview の形 | 新規エンドポイントの「→ {…}」はすべて `result` の中身で、実際の応答は `{ok,revision,result}` で包むと明記。invalid-preview の読めない場合も包む | §2.4、§2.7 |
| 3-M3 | `project2d` の右ベクトルがロールを無視 | `right = normalize(f × up)`（ロール後の `up`）。WP-06 で roll≠0 の parity ケースを追加 | §2.1、§2.2 |
| 3-M4 | `KEY_FIELDS` 初期集合に WP-04 で増えるフィールドが無い | WP-02a は WP-04 の後なので、`keys[].focusDistance`・`focus_tracking.target` を初期集合に含める（WP-02a 時点で存在する全フィールド） | §2.3 |
| 3-M5 | bundle 保存が MCP 等で変わった workspace の `focusTest` を上書き | `X-Bai-Workspace-Revision` を追加（不一致 409 `workspace_revision_conflict`）。サーバー側マージは採らない | §2.4、§2.8 |
| 3-M6 | ジャーナル復旧の細部 | `restore_backup` で `backup:null`→対象を削除、⑤途中の `keep_current`→残りの `.tmp` が全部あれば前進、無ければ復元、起動時の孤立 `.bak-<txid>` 掃除、ディレクトリ fsync は POSIX のみ（Windows は省略と明記）、カメラ画面も 423 で復旧バナー | §2.8-4 |
| 3-M7 | 深度カラーの適用範囲 | `uEnabled=1` は `views[1].renderer.render` の直前〜直後だけ。深度は撮影カメラのビュー空間 | CAM-005 §10 |
| 3-M8 | Scene View 専用表示の方式 | `THREE.Layers` チャンネル1（`sceneCam` だけ有効）に統一 | CAM-005 §8、§2.12 |
| 3-M9 | テストのデータ隔離 | ルート `conftest.py` が import 前に `BAI_DATA_DIR` を一時ディレクトリへ。`diagnostic_logging.LOG_DIR` も `data_dir()`。ハッシュ検査は `data/` 全体 | §2.9 |
| 3-M10 | 本文上限 | カメラ project 1MB→**8MB**、bundle 4MB→**16MB**（テスト付き）。生成キーは 1e-6 に丸め | §2.3、§2.6 |
| 3-M11 | Alt+左ドラッグ | Camera View の Alt+左ドラッグ＝オービット（操作設計 §4）を追加。2D プレビューの左ドラッグ（現行オービット）とシフトドラッグ（縦方向が逆）の変化を P10 に記録 | CAM-006、§0 P10 |
| 3-M12 | ツール定義の不足 | `camera_tools.json` に `headers` 対応表、`webmcp.js` に browser 転送のハンドラー表、`samples:'browser'`／`transport:'browser'` はカメラ画面だけで登録（scope 規則）、`document.currentScript` は最初の await 前に同期で読む | §2.5 |
| 3-M13 | マーカーとボーン | マーカー→ボーン対応表（face＝両眼中点、無ければ head＋オフセット、full＝包囲箱中心 等）。テスト GLB は「モデルは +Z を向き、左＝+X」（VRM 1.0 規約）に合わせ、L/R ボーンの x 符号を修正 | §2.6.2、§2.9 |
| 3-M14 | CAM-018 が決定的でない | フレームごとの activity、15 フレーム移動平均、谷＝±15 フレーム内の極小、カット位置規則、主役交代と山の統合、同点規則を固定し、期待カットを手計算できる例を追加 | CAM-018 |
| 3-m1 | テストモデルのカタログ名 | `合成テストモデル.glb` | §2.9 |
| 3-m2 | CAM-014 の改名重複コード | 409 `name_conflict`（付録C に追加） | CAM-014、付録C |
| 3-m3 | `custom_presets[].pose.roll` の WP | WP-06 へ移動 | §2.3 |
| 3-m4 | 追従の role | `camera_follow_store.ROLES`・`validFollowConfig` に `eyes`・`hand_l`・`hand_r`・`face`・`full` を追加（WP-08） | CAM-011 |
| 3-m5 | 旧分類ラベル | `front→near_blur`、`focus→in_focus`、`within→acceptable`、`back→far_blur`。`errorM = depth − focus`（符号付き） | CAM-005 §4 |
| 3-m6 | keys/merge・keys/apply | `create` 既定 false。apply は `[from,to]` 外・`duration` 超のキーを 400 `invalid_range` | §2.6 |
| 3-m7 | 復元時のフレーム | `workspace.frame > duration` は拒否せず `duration` に丸めて警告 | §2.8 |
| 3-m8 | assetRef | sha256 は (パス, mtime_ns, size) でキャッシュ。`assetRef` は保存時にカメラ画面が `asset-ref` を呼んで埋める | §2.8-3 |
| 3-m9 | サイドカーの合焦距離 | 追従 ON の区間は書出しフレームごとに評価した追従距離（samples 必須、無ければ `null`＋理由） | CAM-016 |
| 3-m10 | 画素確認 | `readPixels` ではなく要素の `page.screenshot` で確認 | CAM-005 |
| 3-m11 | VMD デコーダの終端 | 任意節ごとの EOF、IK 件数、末尾の余りバイトは警告 `trailing_bytes`。クリップ登録は `skip_non_camera=True` | CAM-001 |
| 3-m12 | 行番号 | G-12（`server.py:415-426` sequence/edit、`:427-438` camera/project）、シフトドラッグ `camera.js:22`、`bai_camera.py` 右 `:104`・最終キー `:63`・hold `:64-69` を修正 | §0.2、§1、CAM-006 |
| 3-m13 | §2.2 の `project2d` 参照実装の文 | 「テスト用の参照実装で本番コードからは呼ばない」に修正 | §2.2 |
| 3-m14 | ファイル無し＋If-Match | ファイル無しの GET は `revision:"absent"`。書込は If-Match 省略か `absent` のときだけ新規作成、それ以外は 409 | §2.4 |
| 3-m15 | `/api/sync` の前提 | カメラ画面は `/api/sync` を見ていない（`index.html:400-415` のみ）。前提を削除し、外部変更は［再取得］と bundle 保存時の競合検出で扱う | §2.8-6 |
| 3-m16 | FOV>112.6° の焦点距離表示 | 「<8mm」と表示。`zoom` の下限は `min(8, 現在値)` | CAM-005 §1、CAM-006 |
| 3-m17 | 自動キー ON・キー無しの新規キー | `focusDistance`・`fStop` はユーザーがその操作で編集したか、値がキー由来のときだけ書く（既定値は書かない） | CAM-005 §2 |
| 3-m18 | 深度色テストの条件 | 撮影カメラ位置・レンズ・合焦距離と期待色を固定 | CAM-005 テスト |
| 3-m19 | フォーカス設計の欠落項目 | 書出しにレンズモデル・ポストプロセス・解像度・レンダラースケールを記録（安価なので入れる）。半透明・線画表示、設定可能なショートカット、操作中のフレーム変更ガードは後送り（Q6） | CAM-005 §7、§9 |
| 3-m20 | VRM 0.x | VRM 0.x は −Z 向き。正規化（180°回転）は現行に無い＝付録D に記載 | 付録D |
| 3-m21 | 書出し先 | 既存 `BASE/exports/`（`server.py:732-892`）は `data_dir()` の外。本書の `camera_exports/` は `data_dir()` 内と明記 | §2.9、CAM-016 |
| 3-m22 | 付録A の基準 | B と h は**範囲開始フレーム（`from`）**の samples で決める | 付録A |
| スコープ | 三分割線の既定 OFF 化は未要求の変更 | 現行の常時表示を維持。P10 の該当記述を削除し、ON/OFF はセーフフレーム・ヘッドルームのみ | CAM-004、§2.8 |

- 3-B1〜3-M14 と 3-m1〜3-m22 は、コーディネーターから受け取った批評3回目の要約に基づく（批評本文は受け取っていない）。

### v2→v3（批評2回目）

| 指摘 | 内容（要約） | v3 での変更 | 本書の場所 |
|---|---|---|---|
| 2-B1 モデル正規化 | `loadAsset` が全モデルを高さ 2.0 に正規化（`camera_3d.js:278`）しており、「1単位=1m」「12.5単位/m」の前提が崩れる | **正規化は維持**（既存利用者の見た目を変えない）。読込モデルごとに縮尺 `s` とオフセット `o` を記録し、samples と `BAICameraDebug` に出す。VMD 取込・書出・ブリッジは `MMD_UNIT_PER_M` と `s`・`o` の両方を使う。光学距離はシーン単位で計算し、`s` が分かれば物理 m（＝シーン値/`s`）も返す。`s` 不明時は物理値を `null`・理由 `scale_unknown`。テスト GLB は高さちょうど 2.0、中心、足 y=0（`s=1`）、ボーン10本 | §0.2、§2.9、CAM-001/005/012/016/017、付録B |
| 2-B2 共通基盤の置き場所 | `bad(status,msg,code)`・応答形・エラー表・単位定数が WP-02 にあり、先行 WP-04 が使えない | `bad()` の拡張、新規エンドポイントの応答形 `{ok,revision,result}`（失敗時 `ok:false`）、エラーコード表、`MMD_UNIT_PER_M` を **WP-00a** へ移動。同じコミットで更新するテストを列挙 | §2.4、§4.2 |
| 2-B3 移動の符号 | 旧 `pan`/`tilt` の右ベクトルが実際はカメラ左、`truck` との関係が曖昧、`draw()` が鏡像 | `truck(+a)` はカメラ右 `right0 = f×Y` へ動き、**旧 `pan(−a)` と等しい**ことを明記。`pan_yaw`/`tilt`/`roll`/`orbit`/`zoom` の符号を期待値表で固定。`draw()` は `upVector()`/`right0` を使う（G-14）。2D 投影の fixture を追加 | §0.2、§1、CAM-006、§2.2 |
| 2-B4 レンズ値の書込規則 | 確定時の自動キー扱いが上位文書と不一致、値の出所×状態の表がない、追従対象と評価対象の混同 | 上位文書（フォーカス設計 §5）に従い**確定も自動キー ON/OFF に従う**。値の出所×自動キー×（キーあり／キーなし／キー以外が姿勢を決める）の全表、F値・合焦距離のプレビュー置き場所（`previewPose`）を定義。追従対象（焦点を決める点）と評価対象（診断する点）を分け、両眼の選択規則と保存先（project／workspace）を定義。焦点距離の範囲は FOV 5〜150 から **8〜274mm**。`camera_dof.js` の範囲も一致させる | CAM-005 |
| 2-M1 bundle の競合検出 | v2 の `X-Bai-Bundle-Revision`/`bundle_revision:null` 方式が複雑 | 批評の案を採用：bundle 保存は**直前に GET した combination と revision**で If-Match、同時に `X-Bai-Camera-Revision`（カメラ画面が読込・保存で保持している値）を送り、サーバーが現在のカメラファイルと照合。`bundle_revision:null`・ボタン無効化は削除。bundle 保存成功後に `dirty` を解除。`test_bundle_revision.py` を更新 | §2.4、§2.8 |
| 2-M2 読込エラーの復旧 | 退避の取り出し方・中身確認・読めないファイル・退避場所・メイン画面表示が未定義 | 退避ファイルのダウンロード、緩い読取専用プレビュー（不正フィールドの一覧）、読めない場合は `backup:null`、退避は読んだファイルと同じフォルダ、423 時にメイン画面で「カメラ画面で復旧してください」 | §2.7、§2.8 |
| 2-M3 互換と revision 規則 | `bai_camera_get` の破壊的変更、revision 必須/任意の不統一、新規作成時、応答キーの再送、FIELD 初期集合 | `bai_camera_get` は**既定で旧形**、`with_revision:true` で新形（互換維持）。revision 規則を表で統一（MCP は必須、HTTP の旧経路のみ任意）。ファイル新規作成の書込は If-Match 不要。書込時の `_revision`・`bundle_revision`・`revision` キーは無視。FIELD 初期集合を列挙 | §2.3、§2.4、§2.5 |
| 2-M4 ツール定義 | WebMCP 専用ツール・バイナリ・samples の表現がない、登録の順序 | `camera_tools.json` に `transport`・`bodyEncoding`・`samples` を追加。標準MCPとの一致テストは `transport:'http'` のみ。`webmcp.js` は取得を await してから登録 | §2.5 |
| 2-M5 sample の出力 | `sample()` の出力キーが端と中間で違い、parity の比較対象が不明 | 既存 `bai_camera.sample` は互換のため不変。正規化版 `sample_pose` を新設し、**WP ごとの出力フィールド一覧**と parity 比較フィールドを固定。後の WP のフィールドを先に足さない | §2.1、§2.2 |
| 2-M6 既存テストの扱い | 各 WP で壊れる既存テスト、ソース文字列テスト、実行コマンド、ポート衝突 | WP ごとの「更新する既存テスト」一覧、置き換え方針（ソース文字列テストは同じコミットで振る舞いテストへ置換）、ルートの `*.js`/`*.mjs` を含むコマンド、Playwright ファイルごとに別ポート | §4.2、§5 |
| 2-M7 データ隔離 | `BAI_DATA_DIR` が server.py の一部パスだけ | `bai_paths.data_dir()` 1関数で全パス（server・ログ・QA キャプチャ・リターゲット設定）を解決。テスト前後で実 `data/` ツリーのハッシュ比較 | §2.9 |
| 2-M8 テンプレート値 | 付録Aが表だけで生成できない | 18件すべての完全なパラメータ JSON を付録Aに記載（被写体高さ h 基準） | 付録A |
| 2-M9 フォーカス設計の欠落 | 設定の get/set API、性能計測、外部更新の Undo 単位 | フォーカステスト設定の取得・変更 API と MCP を復活。開発テストでフレーム時間と GPU 効果 ON/OFF を計測。外部（MCP）更新の再取得を1 Undo 単位として履歴に積む | CAM-005、§2.10、§2.8 |
| 2-M10 保存範囲の明示 | VMD 参照・追従状態がどこで保存されるか | WP-02 のゲートに「VMD 参照・追従状態は WP-13 で保存（原本保存の仕組みが WP-13 で初めてできるため）」と明記。他の保存範囲の注記も整理 | §2.8、§4.1 |
| 2-M11 WP-02 が大きすぎる | 1 WP に4系統 | WP-02a（読込エラー・未知フィールド）、02b（revision・応答・書込 API）、02c（MCP・WebMCP）、02d（統合保存・ジャーナル・素材ID・設定 API）に分割 | §4 |
| 2-M12 深度カラー | `overrideMaterial` ではスキニングが失われる | 組み込みマテリアルの `onBeforeCompile` で深度色を注入（スキニング・モーフ維持）。アニメーション付きテスト GLB で Playwright 確認 | CAM-005 |
| 2-m1 | VMD 書出しが常に密な線形キー | 全区間の曲線が VMD で表せる（y∈[0,1] 等）ときは**キー保持書出し**を選べる。それ以外は密な線形 | CAM-016 |
| 2-m2 | `camera_dof.js` の焦点距離範囲 8–300 が UI と不一致 | 8–274mm に統一 | CAM-005 |
| 2-m3 | `focus-follow-bone` と `focus_tracking` を別物として記述していた | 同じチェックボックス（`camera_3d.js:51`）であることを §1 の事実に記載し記述を修正 | §1、CAM-005 |
| 2-m4 | `draw()` の右ベクトル符号が逆で 2D プレビューが左右反転 | G-14 として WP-00a で修正 | §1 |
| 2-m5 | 外部変更の再取得で Undo 履歴が消える（`camera.js:194`） | 1 Undo 単位として積む（2-M9 と同じ） | §2.10 |

### v1→v2（批評1回目）

| 指摘 | 内容（要約） | v2 での変更 | 本書の場所 |
|---|---|---|---|
| 1-A 作業順・循環依存 | WP-13/14 の循環、WP-02 に vmd_clips が入り CAM-001 と相互依存、WP-01 が全APIを先取り | 実装順を固定し、WP-01（全API先行）を廃止して**各WPが自分のAPIを追加**。vmd_clips は VMD 統合 WP（WP-13）へ移動。最大化・分割幅変更の WP-17 を追加 | §4 |
| 1-B リビジョン | UI・MCP・bundle の revision の持ち方が未定義、既存応答形の破壊 | UI は読込時の revision を保持し保存応答で更新。MCP 書込ツールに `revision`、`api()`／`request()` に If-Match。既存エンドポイントは `error` を残し `error_code` を追加。新規は `{ok, revision, result}`（v3 で一部改訂：2-M1・2-M3） | §2.4、§2.5 |
| 1-C 読込エラー（G-06） | 409 の意味違い、退避名のコロン、退避の増殖、未知フィールド | ファイル無し＝既定値（保存まで書かない）、不正＝422 `camera_project_invalid`、内容ハッシュごと1つの退避、`POST /api/camera/project/reset`、未知フィールドは読込で破棄・書込で拒否（v3 で 2-M2 を追加） | §2.7、§2.3 |
| 1-D CAM-005 | 値の出所の二重化、追従失敗時の代替、範囲診断が別計算、状態版の粒度、承認済み項目の欠落 | 値の出所を1つずつ、`bone_missing` は代替しない、`evaluateOptics` 1関数、`contentVersion`＋frame、承認済み項目の復活、厳密許容 0.02m、上限 10,000（v3 で 2-B4 により改訂） | CAM-005 |
| 1-E VMD | 補間の帰属、分割式、バイト順、座標変換、単位、fps、FOV、件数、非カメラ節、原本保存 | 到着側キー規則、ド・カステリョ分割と退避、`VMD_CAMERA_INTERP_ORDER`（未検証）、ブリッジの厳密な逆、既定カメラ fixture、12.5単位/m、fps 写像、FOV クランプ、既定 step、照明/影/IK の読み飛ばし、原本 `data/camera_clips/<id>.vmd`（v3 で 2-B1 の縮尺を追加） | CAM-001/016、付録B |
| 1-F リグ互換 | 旧データの黙った意味変更 | 黙った移行なし。新リグ種 `jib`・`spline`・`spin`。ドローンのバンク削除。CAM-002 固定重み | CAM-002、007〜011 |
| 1-G CAM-015 | keys ソース、inherit、音声オフセット、改名 | `source:{kind:'preset'|'clip'}`、inherit＝平行移動、音声オフセット削除、改名連動 | CAM-015、014 |
| 1-H 計算の置き場所・MCP | 実態と不一致 | MCP は HTTP ブリッジ、UI はローカル計算、Python 専用生成器はプレビュー HTTP、カメラ画面に WebMCP | §0、§2.5、§2.6 |
| 1-I テスト基盤 | CDN 依存、GPU 表記、テストモデル、データ汚染 | three devDependency と CDN 振替、SwiftShader、テスト GLB、`BAI_DATA_DIR`（v3 で 2-M7 により拡張） | §2.9 |
| 1-J CAM-018 | 指標が曖昧 | activity・d/h・スコア表を数値で固定 | CAM-018 |
| 1-K その他 | 細部 | G-09 上限100、クライアント付与の時刻、workspace 緩和、ジャーナル、素材ID、選択状態、ロール定義、hold 明記、15モード、衝突体形式、aspect、+Z 前方、静的配信、`lens`、`notes`、P1、`camera_move` の置き場所 | 各所 |
| 追加（v2 で発見） | JS `cross()` が2要素 | G-13 | §1 |

---

## 0. 全体方針（全WP共通の約束）

> **UIの実装先（所有者決定 2026-10-20、ROADMAP_JA.md 4183c5f）**：P2（新UI `studio/` への移植）を Phase E より先に作業の流れ順で行い、Phase E の UI は新UIのカメラ画面上に実装する。旧画面（camera.html 等）には新機能を足さない。§2・§3 の API・計算・データ・MCP・samples の仕様は変わらない。§3 の UI 項目と各 WP の UI 部分（要素ID、camera.js の関数名、Playwright セレクター、`BAICameraDebug` と WebMCP scope `camera_page` を置く画面、静的配信）は操作と表示の仕様として読み、P2 ⑥（カメラ画面の移植）完了後に §7 へ読み替え表を追加し、その表を高性能モデルで1回レビューするまで UI 部分を実装しない。G-02/03/04/13/14/15/16 のうち camera.js・camera_3d.js・camera.html にある修正は、移植後の新UI側の同等コードに適用する。見た目は新UIモックに従い、WP-17 は新UIモックのカメラ画面レイアウト内で操作設計 §2（片側最大化・幅変更）を満たす。

| # | 約束 | 理由 |
|---|---|---|
| P1 | **同じ入力サンプルに対し、JS と Python が同じ出力を返す（Parity）**。補間・カメラ移動・光学の評価関数は JS では `camera_core.js`、Python では `bai_camera.py`／`camera_focus.py` にそれぞれ1つだけ置き、他のモジュールはそれを呼ぶ。一致は共通の照合データ（fixture）で自動検証する。 | 現状 JS は3モード、Python は15モード（`camera.js:2`、`bai_camera.py:59-75`）で食い違う。 |
| P2 | 保存データは **schema 1 のまま、任意フィールドの追加のみ**。既存フィールドの意味は変えない。**黙った移行（読込時の書き換え）をしない**。旧データは読込時に既定値で「解釈」するだけで、保存しても旧形のまま残る。 | 互換性。旧 `pan` の意味も保持（操作設計 §3）。 |
| P3 | 編集は**プレビュー → 確定**の2段階。プレビューは保存データを変えない。確定は1操作＝1 Undo。外部（API/MCP）からの書き込みは revision（If-Match）必須（例外は §2.4 の表）。 | 操作設計 §5・§8。 |
| P4 | MCP（標準 `mcp_server.py`・WebMCP `webmcp.js`）は**HTTP API を呼ぶ薄い橋渡し**。画面は移動・リグ・補間を JS でローカル計算し、ブラウザ内の Undo に積み、保存ボタンで HTTP 保存する。Python にしかない生成器はプレビュー用 HTTP を呼び、返ったキーを UI でローカル適用する（§2.6）。 | 現行構造を壊さずに4経路を揃える。 |
| P5 | 「できない」「未読込」「判定不能」は**成功扱いしない**。数値が出せない時は `null` と理由コードを返す。代替値で埋めるのは承認文書が認める箇所だけで、必ず代替したことを返す。 | CAM-005 契約・操作設計 §7。 |
| P6 | 構図の良し悪しを**自動で NG にしない**。出すのは事実と任意の補助線だけ。 | 残件監査 CAM-004/017。 |
| P7 | 実GPU・実MMDでの確認は開発環境では**未検証**と記録する。SwiftShader の自動テスト合格を GPU 検証と呼ばない。完成判定は §8。 | AGENTS.md 規則6・7。 |
| P8 | 1 WP ＝ 1〜数コミット。各コミットで `PHASE_E_IMPLEMENTATION_STATUS.json` の該当IDの `implementation_assessment` と `notes`（§6）を更新し、テスト結果を書く。 | AGENTS.md 規則6。 |
| P9 | 各WPは**自分が使う HTTP エンドポイント・MCP ツール・保存フィールド・出力フィールドを自分で追加**する。後のWPの分を先に作らない。 | 循環依存の防止。 |
| P10 | 既存の見た目・操作結果を変える修正は、変わる内容をコミット本文と該当ガイド文書に書く。対象：G-13/G-14（2D プレビューの左右）、VMD プレビューの縮尺（G-17）、2D プレビュー `#preview` の左ドラッグ（現行はオービット＋仰角、`camera.js:22`）が操作設計 §4 どおり**パン/ティルト**に変わり、オービットは Alt+左ドラッグに移ること、シフト＋ドラッグ（現行は下へドラッグでカメラが上がる、`camera.js:22` の `p.position[1]+=dy*.01`）が中ドラッグと同じ規則（上へドラッグでカメラが上がる）に変わること。**三分割線の常時表示は変えない**（未要求の変更をしない）。 | 非破壊・後方互換。 |

### 0.1 用語（本書内の固定訳）
- **キー**：`keys[]` の1要素。**区間**：あるキーから次のキーまで（BAI キーは**左キー**の補間設定を使う。VMD は**到着側キー**の補間を使う。両者を混同しない）。
- **ショット**：`sequence[]` の1要素（CAM-015）。**プリセット**：`custom_presets[]` の1要素（名前＋姿勢）。
- **ネイティブトラック**：カメラVMDを読み込んだ中間形式（`camera_vmd_codec.decode_camera_track` の戻り値、MMD座標・MMD単位）。
- **クリップ**：`vmd_clips[]` の1要素。保存済み VMD 原本の一区間への参照（CAM-001）。
- **プロジェクトキー**：`camera_project.json` の `keys[]`（BAI形式、`position`＋`target`＋縦FOV、**シーン単位**）。
- **シーン単位／物理 m**：§0.2。
- **サンプル（samples）**：ブラウザーが実モデルを評価して作る数値列。サーバー単独では作れない（形は §2.6.1、マーカーの解決は §2.6.2）。
- **代替（fallback）**：ボーンが見つからないときに包囲箱中心（の該当高さ）を使うこと。必ず `fallback_bbox` として表示する（§2.6.2、CAM-005）。
- **追従対象**：焦点距離を決める1点（CAM-005）。**評価対象**：合焦を診断する点（1点または両眼の2点）。

### 0.2 共通の数値・座標の約束
- **シーン単位とモデル縮尺（2-B1）**：BAI のカメラ座標・キーは**シーン単位**。`camera_3d.js:278` の `loadAsset` は読込モデルを高さ 2.0 シーン単位に正規化し（`scale = 2/size.y`）、x・z を中心化、足を y=0 に置く。**この正規化は変更しない**。
  - 読込ごとに `modelTransform = {s, o:[ox,oy,oz], sourceHeight}` を記録する。`s` = 適用した拡大率（`2/size.y`）、`o` = 拡大後に足した平行移動（`model.position` の変化量）、`sourceHeight` = 正規化前の高さ（ソース単位）。ソースの単位は**メートルとみなす**（GLB/VRM の規約。ソース単位が m でないモデルは物理 m が不正確になる＝未検証、§付録D）。
  - 変換：物理 m の点 `p` → シーン `s·p + o`。距離はシーン = 物理 × `s`。
  - モデル未読込：`s` 不明。シーン単位の計算はそのまま行い、物理 m の値は `null`、理由 `scale_unknown`。VMD 変換は `s=1, o=0` で行い結果に `scale_source:'unknown'` を付けて UI に「モデル未読込のため縮尺1で表示」と出す。
  - `modelTransform` は `BAICameraDebug.getState().model` と、samples を送るすべての HTTP 本文に**兄弟フィールド**として入れる（`{..., samples:[...], modelTransform:{s,o,sourceHeight}}`。samples 配列を包まない。§2.6.1）。
  - 既定キー（`DEFAULT`、位置 (0,1.6,5)）や付録A の値はシーン単位／被写体高さ基準で書く。
- MMD 換算：`MMD_UNIT_PER_M = 12.5`（MMD 単位/物理 m）。`camera_vmd_bridge.py` に定義し、JS は `camera_vmd_local.js` に同値（WP-00a で定義、parity で一致確認）。MMD ↔ シーンの変換は付録B（`12.5` と `s`・`o` の両方を使う）。
- 座標：右手系 Y 上。**モデルの前方は +Z**（モデル正面を撮る既定カメラは +Z 側）。**モデルの左は +X**（モデルが +Z を向いて立つとき、その左手が +X 側。VRM 1.0 の規約）。`*_l`／`Left*`／`左*` はモデル自身の左。
- FOV：BAI の `fov` は**縦方向の画角（度、5〜150）**。焦点距離換算はセンサー縦 24mm で `fov = 2·atan(24/(2·focalMm))`。FOV 5〜150 に対応する焦点距離は **3.2〜274.8mm**、UI の焦点距離入力は **8〜274mm**（8mm は FOV 112.62°）。FOV が 112.62° を超える（焦点距離 8mm 未満の）姿勢では焦点距離表示を「<8mm」とし、入力欄はその値を書き換えない（ユーザーが入力したときだけ 8〜274 の値を書く）。
- 補間モード：**15種で固定**。`linear, hold, smooth, bezier, sine, quad, cubic, quart, quint, expo, circ, back, bounce, elastic, custom`（`camera_easing.py MODES` の順）。
- **hold の挙動（現行コードどおり。変更しない）**：左キー a が `hold` の区間 [a, b] では値は a。**b が中間キーなら b のフレームちょうどでも a の値**（`bai_camera.py:64-69`）。**b が最終キーなら b のフレームで b の値**（`bai_camera.py:63`、`camera.js:2` の早期 return）。parity fixture にこの境界を必ず入れる。
- **カメラ基底**：前方 `f = normalize(target − position)`、**右 `right0 = normalize(f × (0,1,0))`**、上 `up0 = right0 × f`。例：`f=(0,0,−1)` なら `right0=(1,0,0)`、`up0=(0,1,0)`。**注意：現行コードの `right=[f.z,0,−f.x]`（`bai_camera.py:104`、`camera.js:96`、`camera.js:87`）は `−right0`（カメラ左）である**（§1 G-14、CAM-006 の符号表）。
- **ロール**：度、−180〜180。**正＝カメラの後ろから光軸方向を見て時計回り**（画面上端がカメラ右側へ傾く）。`up = cos(roll)·up0 + sin(roll)·right0`。
  - 縮退（`|f × (0,1,0)| < 1e-6`）：`right0` は直前に評価した姿勢の `right0` を `f` に直交化して使う。直前が無ければ `(1,0,0)`。
  - 補間：最短経路 `Δ = ((b − a + 540) mod 360) − 180`、`roll(t) = a + Δ·t` を (−180,180] に正規化。
  - 逆算：`roll = atan2(up·right0, up·up0)`。
- 角度入出力の API 単位は度。VMD 内部のみラジアン。

---

## 1. 現状の事実と、先に直すべき不整合（G-xx）

v4 作成時に全件をコードで再確認した（行番号は §冒頭の基準コード）。直すWPを右端に示す。

| ID | 不整合（確認済みの事実） | 証拠 | 影響 | WP |
|---|---|---|---|---|
| G-01 | JS `sample()` は linear/smooth/hold のみ。fStop を補間しない。Python は15モード＋custom＋fStop | `camera.js:2`、`bai_camera.py:59-75` | API・MCPで入れたキーがプレビューと違う動き | WP-00a |
| G-02 | `camera_easing.js`・`camera_cinematic.js`・`camera_vmd_preview.js`・`webmcp.js` が `camera.html` 未読込。前3つは静的配信リスト外 | `server.py:166`、`camera.html` | 計算が画面から使えない | WP-00a、以後各WP |
| G-03 | `writeKey` がキーを丸ごと置換し、既存の `customCurve`・`fStop` を消す | `camera.js:11` | 再キーでデータ消失 | WP-00a |
| G-04 | 統合保存が `bai-camera-before-save` を発火しない。`focus_tracking`・`bone_follow` は通常保存時にしか project へ入らない | `camera.js:208,210`、`camera_project_bundle_ui.js:6,18`、`camera_3d.js:90-96` | 保存→復元で追従設定が古い | WP-02d |
| G-05 | MCP `bai_camera_set` のスキーマが schema/fps/duration/keys のみ（`additionalProperties:false`）。MCP保存で sequence/rig/presets 等が**消える**。`bai_camera_get` は revision を返さない（非 envelope の GET） | `mcp_server.py:57-58,146,149-150`、`webmcp.js:10-11` | MCP保存でデータ消失・競合検出不能 | WP-02c |
| G-06 | `bai_camera.read` が読込・検証失敗時に**黙って既定値を返す** | `bai_camera.py:76-78` | データ消失（重大） | WP-02a |
| G-07 | フォーカス距離が JS は光軸方向深度、Python は3D距離。Python は合焦近傍分類なし | `camera_focus_consistency.js:15-18`、`camera_focus.py:21-23` | 単一診断と区間診断が不一致 | WP-00a |
| G-08 | F値範囲が UI 0.7–32、JS診断 0.5–64、Python診断 0.5–64、保存 0.7–64、DOF 0.7–32。焦点距離範囲が UI 8–300、JS診断 1–500、Python 1–500、DOF 8–300 | `camera.html` `#focus-aperture`・`#focus-lens`、`camera_focus_consistency.js:6`、`camera_focus.py:12`、`bai_camera.py:6`、`camera_dof.js:5` | 入力できるのに保存できない等 | WP-00a（F値・診断）、WP-04（焦点距離 8–274） |
| G-09 | `easingPresets` 上限：上位文書 **100件**、実装64件 | `KEY_INTERVAL_EASING_AND_LENS_20261018_JA.md`、`bai_camera.py:38` | 上位文書の100が正 | WP-05 |
| G-10 | `camera_vmd.py`（旧、補間 0–127 必須）と `camera_vmd_codec.py`（0–255 受理）で範囲が違う。旧は server 未使用 | 各ファイル | 混乱。旧は削除せず「非推奨・server未使用」と docstring に明記 | WP-13 |
| G-11 | `test_camera_lens.js`・`test_camera_lens_shots.js` が実行すると失敗（exit 1） | `node` で実行して確認 | テスト結果の信用を下げる | WP-00a |
| G-12 | `POST /api/camera/project` は If-Match 任意。`sequence/edit` は revision 検査なし。bundle 保存後に `camera.js` の `serverRevision` が更新されず次の通常保存が 409。bundle UI は保存直前の GET の revision を使うためカメラファイルの外部変更を検出しない | `server.py:415-426`（sequence/edit）、`server.py:427-438`（camera/project）、`server.py:359-376`（bundle）、`camera.js:210`、`camera_project_bundle_ui.js:18` | 古い画面からの上書き・誤った競合 | WP-02b、02d |
| G-13 | JS の `cross()` が**2要素しか返さない**。`moveCamera` の `orbit`・`tilt` が NaN（`rot([0,0.6,5],[0,1,0],0.5)` → z=NaN を node で確認） | `camera.js:93,96` | ドラッグ・ボタン操作の結果が不正 | WP-00a |
| G-14 | 2D プレビュー `draw()` の右ベクトル `[front.z,0,−front.x]` は `−right0`（カメラ左）で、`point()` の x が左右反転する。up も G-13 で壊れる | `camera.js:87` | 2D 構図ガイドが鏡像 | WP-00a |
| G-15 | 合焦追従のチェックボックスは `#focus-follow-bone` 1つで、`camera_3d.js` は同じ要素を `focusTrackToggle` として使い、`focus_tracking.enabled` に保存する。追従点は**カメラ追従用に選んだボーン**（`trackingBone`）。追従中は `#focus-distance` の画面値を書き換える | `camera_3d.js:51,90-96,120-130` | v2 は2つの別スイッチと誤記していた。追従対象を独立に選べない | WP-04 |
| G-16 | 外部変更の再取得（`refreshSequenceFromServer`）が Undo 履歴を消す | `camera.js:194`（`history=[clone(project)]`） | 外部更新を1手で戻せない | WP-02d |
| G-17 | モデルは読込時に高さ 2.0 へ正規化される。VMD プレビュー（ブリッジ・`camera_vmd_local.js`）は単位換算なし（MMD 1単位＝シーン1単位） | `camera_3d.js:278`、`camera_vmd_bridge.py:23-40`、`camera_vmd_local.js` | VMD カメラの構図が約 12.5/s 倍ずれる | WP-13 |

**G-xx の決定事項**
- G-03：`camera_core.mergeKey(existing, edit)` に置換（§2.1）。
- G-06：§2.7。
- G-07：**Python を光軸方向深度に合わせる**。分類も JS と同じ5分類。既存 `GET /api/camera/focus` の応答キーは残し、`classification` の値に `focus`・`unknown` を追加、`method` を `'optical-depth-coc'` に変更。
- G-08：F値は保存・API・診断を **0.7–64** に統一、UI 入力 `max=64`。DOF プレビュー（`camera_dof.js`）だけは F 0.7–32 にクランプして「プレビューはF32までの近似」と表示（保存値は変えない）。焦点距離は WP-04 で UI・診断・DOF とも **8–274mm**（`camera_dof.js:5` の 300 も 274 に）。
- G-09：上限を **100**。
- G-11：2ファイルを `tests/legacy/` へ `git mv`、実行対象外（削除しない）。
- G-12：§2.4。
- G-13・G-14：`camera_core.js` のベクトル関数と `basis()`（`up`・`right`）に置換。**G-14 の修正で 2D プレビューの左右が正しくなる（見た目が変わる）**ことをコミット本文に書く（P10）。
- G-15：CAM-005 §1。
- G-16：§2.10。
- G-17：CAM-016 §1、付録B。

---

## 2. 横断設計

### 2.1 JS 共通コア `camera_core.js`（WP-00a）
- 形式：UMD（`camera_rig.js` と同じ書き方）。ブラウザ `window.BAICameraCore`、Node `require('./camera_core.js')`。
- 中身（純関数のみ。DOM・Three.js 参照禁止）：
  - ベクトル：`add, sub, scale, dot, cross, norm, length`（`cross` は3要素）。
  - `basis(pose, prevRight0=null) → {f, right0, up0, up, right, degenerate}`：§0.2。`up` はロール適用後、**`right = normalize(f × up)`**（ロール後の右。roll=0 なら `right0` と同じ）。
  - `project2d(pose, point, {width, height}) → [x, y] | null`：`draw()` 用。`z = (point−eye)·f`、`z ≤ 0.03` は null、`x = w/2 + k·((point−eye)·right)/z`、`y = h/2 − k·((point−eye)·up)/z`（`right`・`up` は `basis()` のロール後の値、`k = min(w,h)·0.85/tan(fov/2)`＝現行 `draw()` と同じ係数）。WP-00a ではキーに `roll` が無いので常に roll=0。
  - `ease(mode, t, customCurve)`、`MODES`（15種）：`camera_easing.js` から移し、同ファイルは互換ラッパー（`window.BAICameraEasing` は残す）。
  - `sampleKeys(keys, frame) → SamplePose`：Python `bai_camera.sample_pose` と同仕様（出力フィールドは下表、WP ごとに追加）。
  - `mergeKey(existing, edit) → key`：既存キーのフィールドを保ち `edit` の項目だけ上書き。`interpolation` を `custom` 以外へ変えたときだけ `customCurve` を削除。`KEY_FIELDS`（§2.3）以外は捨てる。
  - `focalToVerticalFov(mm, sensorH=24)`、`verticalFovToFocal(deg, sensorH=24)`：`camera_lens.js` から移す（同ファイルは互換ラッパー、`presets` は残す）。
  - `moveCamera(pose, operation, amount, opts)`：Python `bai_camera.camera_move` と同じ結果（WP-00a は既存4種 `orbit, dolly, pan, tilt` を**現行 Python の結果どおり**に。WP-06 で拡張）。
  - `opticalDepth(position, target, point)`、`thinLens({focalMm, fNumber, focusM, cocMm})`（WP-00a）、`evaluateOptics(input)`（WP-04）。
- `camera.js`：`sample()` は `BAICameraCore.sampleKeys(project.keys, f)` を呼ぶだけ。`moveCamera`・`dot/norm/cross` の重複実装を削除。`draw()` は `basis()`・`project2d()` を使う（G-14）。`drawScene()` も同じ `basis()` を使う。
- `camera.html` に `<script src="/camera_core.js" defer>` を最初の defer（`camera_vmd_local.js` より前）に置く。

**`sample_pose`／`sampleKeys` の出力フィールド（2-M5）**
既存 `bai_camera.sample(project, frame)` は `/api/camera/sample` と既存テストのため**出力を変えない**（端では元キーの複製、中間では `frame/position/target/fov(/fStop)`）。正規化版を新設する：

| WP | `sample_pose(project, frame)`（Python）／`sampleKeys(keys, frame)`（JS）の出力 | parity で比較するフィールド |
|---|---|---|
| WP-00a | `{frame, position, target, fov, fStop}`（`fStop` は常に出す。両キーに無ければ 4.0、片側だけなら欠けた側 4.0） | 5つすべて |
| WP-04 | 上記＋`focusDistance`（欠けた側 4.0）、`focusDistanceSource:'key'|'default'`（両側とも無いとき `default`） | 7つ |
| WP-05 | フィールド追加なし（トラック別補間の挙動のみ） | 7つ |
| WP-06 | 上記＋`roll`（欠けた側 0） | 8つ |

- `/api/camera/sample` に `?normalized=1` を追加すると `sample_pose` を返す（WP-00a）。MCP `bai_camera_sample` は引数 `normalized`（既定 false）。
- 後の WP のフィールドを先に出さない（P9）。

### 2.2 照合テスト（Parity fixture）（WP-00a で作成、各WPで追加）
- 定義：「同じサンプル入力に同じ出力」。
- `tests/fixtures/camera_parity.json`：`{schema:1, cases:[{id, kind, input, expected}]}`。`kind`：`ease`・`sample`・`move`・`basis`・`project2d`・`optics`・`rig`・`vmd_pose`。
  - WP-00a で 70 件以上：15モード×t（0.1, 0.5, 0.9）、custom、hold の中間キー境界・最終キー境界、fStop 片側、範囲外フレーム、`move` 既存4種（CAM-006 符号表の旧操作の行）、`basis`（通常・真上・真下）、**`project2d`**（基準姿勢 position (0,1,5)・target (0,1,0)・fov 40、幅 800×高さ 450 で点 (1,1,0) は x > 400、(0,2,0) は y < 225、(0,1,0) は (400,225)、カメラ背後の点は null）。
  - WP-04 `optics`、WP-05 トラック別、WP-06 roll・新操作・**roll≠0 の `project2d`**（同じ基準姿勢で roll=+90：`up=(1,0,0)`・`right=(0,−1,0)`。点 (1,1,0) は x=400・y < 225（画面上へ）、点 (0,2,0) は x < 400・y=225（画面左へ）。roll=+30 の中間ケースも入れる）、WP-07 `rig`、WP-13 `vmd_pose`（縮尺 s=1 と s=1.25 の両方）。
- 生成：`tools/gen_camera_parity.py`（Python 実装で `expected` を作りコミット）。`project2d` だけは Python 側に参照実装 `bai_camera.project2d` を置く。これは**テスト用の参照実装で、本番コード（サーバー・他モジュール）からは呼ばない**と docstring に書く。
- Python：`tests/test_camera_parity.py`（許容 1e-9、`vmd_pose` は 1e-5）。Node：`tests/test_camera_parity.cjs`。

### 2.3 保存データ（schema 1 のまま・すべて任意）
**既知フィールドの初期集合（WP-02a で定数化、2-M3・3-M4）**：WP-02a は WP-04 の**後**に実装するので、WP-02a 時点で存在する**すべて**のフィールド（WP-04 で増えたものを含む）を初期集合にする。
- `bai_camera.TOP_FIELDS = {schema, fps, duration, keys, easingPresets, custom_presets, sequence, rig, focus_tracking, bone_follow}`
- `KEY_FIELDS = {frame, position, target, fov, interpolation, customCurve, fStop, focusDistance}`（`focusDistance` は WP-04）
- `FOCUS_TRACKING_FIELDS = {enabled, target}`、`FOCUS_TARGET_FIELDS = {marker, bone, eye}`（`target` は WP-04）
- `PRESET_FIELDS = {name, pose}`（`pose` 内は `{position, target, fov}`）
- `SHOT_FIELDS = {start, end, preset, transition}`
- `rig`・`bone_follow` の中は対象外（既存の `validate_rig`・`validate_follow` が既知キーだけを返し、未知キーは現行どおり黙って落ちる。挙動を変えない）。
- 各WPが下表のフィールドを追加するときに同じコミットで定数へ足す。MCP `bai_camera_set` の入力スキーマとの一致をテストする（§2.5）。
- **保存経路への追加（全WP共通）**：フィールドを追加する WP は同じコミットで ①`bai_camera.validate` と該当の下位検証（`validate_presets`・`validate_sequence`・`validate_rig`・`validate_follow`）がそのフィールドを検証して保持するよう変更する（現行 validate はキーと `focus_tracking` を明示的に組み立て直すため、変更しないと黙って消える）②JS `camera_core.KEY_FIELDS`（WP-00a で `{frame, position, target, fov, interpolation, customCurve, fStop}` として定義し `mergeKey` が使う）に足す ③保存→再読込で値が残る往復テストを追加する。WP-04 は `keys[].focusDistance`・`focus_tracking.target`、WP-06 はキーと `custom_presets[].pose.roll`。`sampleKeys`／`sample_pose` の出力（`focusDistanceSource` 等）をそのままキーに入れず、必ず `mergeKey` を通す。

| 場所 | フィールド | 型・範囲 | 既定（未指定時の解釈） | WP |
|---|---|---|---|---|
| keys[] | `focusDistance` | 0.01〜10000（**シーン単位**） | 4.0（`focusDistanceSource:'default'`） | WP-04 |
| （トップ） | `focus_tracking` | 既存 `{enabled}` に任意 `target:{marker:'bone'|'face'|'eyes'|'chest'|'hips'|'full', bone?:string(≤256), eye?:'nearest'|'left'|'right'}` を追加 | `target` 無し＝カメラ追従ボーン（現行動作） | WP-04 |
| keys[] | `trackInterpolation`／`trackCustomCurve` | §CAM-003 | なし | WP-05 |
| keys[] | `roll` | −180〜180 | 0 | WP-06 |
| custom_presets[] | `pose.roll` | −180〜180 | 0 | WP-06（キーと同じ WP。プリセット適用でロールが失われないため） |
| （トップ） | `easingPresets` | 既存、上限 64→**100** | — | WP-05 |
| rig | 拡張 | §CAM-007〜010 | 旧形は現行の意味 | WP-07 |
| bone_follow | `targets` | 2〜8件のときだけ | 旧単一形 | WP-08 |
| custom_presets[] | `tags`・`favorite`・`lens{fStop?, focusDistance?}`・`createdAt`/`updatedAt` | §CAM-014（時刻はクライアント付与、`YYYY-MM-DDTHH:MM:SSZ`） | — | WP-10 |
| （トップ） | `preset_history` | `[{name, usedAt}]` 最大20 | `[]` | WP-10 |
| custom_presets[] | `category` | `fight|mv|horror|arch|product|sns|custom` | `custom` | WP-11 |
| sequence[] | `source` | `{kind:'preset', name}`（WP-12）／`{kind:'clip', clip, from}`（WP-13） | 無ければ旧形 `preset` | WP-12、13 |
| sequence[] | `inherit` | bool（clip のみ） | false | WP-13 |
| （トップ） | `vmd_clips` | §CAM-001（最大128） | `[]` | WP-13 |
| （トップ） | `collision` | `{enabled, minDistance:0.05–5（物理 m）, floor:bool, colliders:[{name, min, max}]}`（最大64、シーン単位） | 無効 | WP-15 |

- 既存上限は変えない：`custom_presets` 64、`sequence` 256、`keys` 5000。
- **本文サイズ上限（3-M10、WP-02b）**：`POST /api/camera/project` 1MB→**8MB**（`server.py:430`）、`POST /api/project/bundle` 4MB→**16MB**（`server.py:362`）。5000 キーに全任意フィールドを入れても収まる値。テスト `tests/test_camera_body_limits.py`：7.9MB 相当の有効 project が 200、8MB 超が 413 `payload_too_large`、bundle も同様。
- **生成キーの丸め**：プレビュー API・UI のベイク・VMD 変換が作るキーの数値は小数第6位（1e-6）に丸めてから返す・保存する（サイズ抑制と再現性）。`sample_pose` の出力や parity の計算値は丸めない。
- **未知フィールド（WP-02a）**：対象はトップレベル・`keys[]`・`custom_presets[]`・`sequence[]` の4階層。
  - 読込：破棄し、パスを `dropped_fields` に列挙（`GET /api/camera/project?envelope=1` に追加）。ファイルは書き換えない。UI は「保存すると次の項目が失われます：…」。
  - 書込：400 `unknown_field`。ただし**応答由来のキー `_revision`・`revision`・`bundle_revision`・`dropped_fields` はトップレベルにあっても黙って無視**（UI が応答をそのまま送り返しても通る）。
  - `bai_camera.validate(payload, strict=True)` が書込、`strict=False` が読込。

### 2.4 リビジョン・応答形・エラーコード
**WP-00a で入れる共通部品（2-B2）**
- `server.py`：`def bad(self, status, msg, code=None)`。`code` があれば `{"error":msg,"error_code":code}`、無ければ従来の `{"error":msg}`（既存呼出は不変）。
- 新規エンドポイントの応答ヘルパー：`def ok(self, result, revision)` → `{"ok":true,"revision":revision,"result":result}`、`def fail(self, status, msg, code)` → `{"ok":false,"error":msg,"error_code":code}`（`error` は既存と同じく文字列）。
- エラーコード表（付録C）を `camera_errors.py` に定数として置く（`CODES = {'revision_required':428, ...}`）。
- `MMD_UNIT_PER_M = 12.5`（`camera_vmd_bridge.py`、JS `camera_vmd_local.js`）。WP-00a では定義だけで、使うのは WP-13。
- WP-00a は G-07 の `GET /api/camera/focus` のエラーに `error_code:'invalid_payload'` を付けるところまで使う。

**revision の値**：`camera_project_revision.revision(validated_project)`（既存）。bundle は `bundle_revision`（既存、combination・camera・workspace の3つから計算）。workspace 単体は `workspace_revision = revision(validated_workspace)`（WP-02d、同じ関数）。
- **ファイルが無いとき（3-m14）**：`camera_project.json` が無ければ `GET /api/camera/project?envelope=1` は `{project:DEFAULT, revision:"absent", dropped_fields:[]}`（`DEFAULT` の内容ハッシュは返さない）。workspace ファイルが無いときの `workspace_revision` も `"absent"`。書込側の照合：ファイルが無い場合、If-Match が**省略**または `absent` なら新規作成を許可、それ以外の値なら 409 `revision_conflict`（読込後にファイルが消された＝reset 等）。ファイルがある場合に If-Match `absent` は 409。

**revision 規則（2-M3、WP-02b）**

| 書込経路 | revision | 不在時 | 不一致時 |
|---|---|---|---|
| `POST /api/camera/project`（UI・MCP） | If-Match **必須**。ただし `camera_project.json` が**存在しない**ときは省略可（上記「ファイルが無いとき」） | 428 `revision_required` | 409 `revision_conflict` |
| `POST /api/camera/sequence/edit`（HTTP） | `expected_sequence` 必須（既存）。revision は**任意**（旧 MCP クライアント互換のため。カメラ画面はこの API を使わない） | — | 409 `revision_conflict` |
| MCP `bai_camera_sequence_edit` | `revision` **必須**（ツールのスキーマで必須） | スキーマエラー | 409 |
| `POST /api/project/bundle` | If-Match 必須（既存）＋`X-Bai-Camera-Revision` 必須＋`X-Bai-Workspace-Revision` 必須（WP-02d） | 428 | 409（`error_code` で区別：`revision_conflict`／`camera_revision_conflict`／`workspace_revision_conflict`。複数不一致なら この順で最初のもの） |
| 新規の書込エンドポイント（keys/merge 等） | If-Match 必須。ファイルが無い場合の新規作成は不要 | 428 | 409 |
| `POST /api/camera/project/reset`・`/api/project/bundle/recover` | 不要（確認文字列で代替、§2.7・§2.8） | — | — |
| `POST /api/camera/focus-test/settings`（workspace のみ） | If-Match に **workspace_revision** 必須（workspace ファイルが無いときは省略か `absent`） | 428 | 409 `workspace_revision_conflict` |

**保持の規則（UI）**
- `camera.js`：読込時の envelope `revision` を `serverRevision` に保持。更新は ①通常保存応答 `_revision` ②再取得 ③bundle 保存応答の `camera_revision`（イベント `bai-camera-revision`）④bundle 復元時の `camera_revision`（bundle GET 応答に追加）。
- `camera_project_bundle_ui.js`：`workspaceRevision` を保持。更新は ①カメラ画面の起動時に `GET /api/camera/focus-test/settings` の `revision` ②focus-test 設定の保存応答 ③bundle 保存応答の `workspace_revision` ④bundle 復元時（bundle GET 応答に `workspace_revision` を追加）。
- `camera_project_bundle_ui.js`（2-M1）：保存時に**その場で** `GET /api/project/bundle` して `combination` と `revision` を得る（現行どおり。メイン画面の最新コンビネーションを使うため）。POST は `If-Match: <その revision>`、**`X-Bai-Camera-Revision: <camera.js の serverRevision>`**（イベント `bai-camera-revision-query` で取得）、**`X-Bai-Workspace-Revision: <workspaceRevision>`**（3-M5）を送る。サーバーは現在のカメラファイル・workspace ファイルの revision と照合し、違えば 409 `camera_revision_conflict`（「カメラが他の場所（MCP 等）で変更されました。再取得してから保存してください」）／`workspace_revision_conflict`（「画面設定（フォーカステスト等）が他の場所で変更されました。再読込してから保存してください」）。サーバー側で `focusTest` をマージする方式は採らない（どちらの値を正とするかを利用者に見せずに決めてしまうため）。成功したら `camera.js` に `camera_revision` を渡し、**`dirty=false`** にし、`workspaceRevision` を更新する。v2 の `X-Bai-Bundle-Revision`／`bundle_revision:null`／ボタン無効化は廃止。

**送信側（WP-02c）**
- `mcp_server.py`：`api(path, payload=None, revision=None, method=None, headers=None)`。`revision` は `If-Match`。HTTPError は本文 JSON を解析して `ValueError(f"HTTP {code} {error_code}: {error}")`（`error_code` が無ければ従来文字列）。
- `webmcp.js`：`request(path, options={}, revision)`。`!r.ok` 時は本文の `{error, error_code}` を含む Error。

**既存エンドポイントの応答（形を壊さない、追加キーのみ）**
- エラー：`{"error"}` に `"error_code"` を追加（`camera.js:55,73-76,210`、`camera_project_bundle_ui.js:4` は `data.error` を読むので壊れない）。
- `POST /api/camera/project` → `{...project, _revision}`（従来どおり）。
- `POST /api/project/bundle` → `{ok, schema, revision, camera_revision, workspace_revision}`。`GET /api/project/bundle` → 従来＋`camera_revision`、`workspace_revision`、`recovery_pending`。
- `POST /api/camera/sequence/edit` → `{ok, sequence, revision}`。`expected_sequence` 不一致は 409 `sequence_conflict`（現行 400 から変更、`error` 文字列は同じ）。

**新規エンドポイント（3-M2）**：成功 `{"ok":true,"revision":<保存済みプロジェクトの revision または null>,"result":{...}}`、失敗 `{"ok":false,"error":"...","error_code":"..."}`。**本書で新規エンドポイントについて「本文 `{…}`」と書いたものは HTTP 本文そのもの、「→ `{…}`」と書いた応答は `result` の中身**で、実際の応答は必ず `{ok, revision, result}` で包む（書き方が `{ok, revision, result:{…}}` と明示してある箇所も同じ意味）。`revision` は書込系なら書込後の値、読取系は対象ファイルの現在値（無関係なら `null`）。既存エンドポイント（下記）は形を変えない。

### 2.5 MCP・WebMCP（WP-02c で基盤、各WPでツール追加）
- **標準MCP も WebMCP も HTTP API の橋渡し**（P4）。
- **ツール定義 `camera_tools.json`**（リポジトリ直下、2-M4）：
  ```json
  {"schema":1,"tools":[
   {"name":"bai_camera_get","description":"...","transport":"http","method":"GET",
    "path":"/api/camera/project","query":["with_revision"],"bodyEncoding":"none",
    "revision":"none","headers":{},"samples":"none","readOnly":true,"scope":"both",
    "inputSchema":{"type":"object","properties":{"with_revision":{"type":"boolean"}},"required":[],"additionalProperties":false}},
   {"name":"bai_project_bundle_save","description":"...","transport":"http","method":"POST",
    "path":"/api/project/bundle","query":[],"bodyEncoding":"json:bundle",
    "revision":"required","headers":{"camera_revision":"X-Bai-Camera-Revision","workspace_revision":"X-Bai-Workspace-Revision"},
    "samples":"none","readOnly":false,"scope":"both",
    "inputSchema":{"type":"object","properties":{"bundle":{"type":"object"},"revision":{"type":"string"},
     "camera_revision":{"type":"string"},"workspace_revision":{"type":"string"}},
     "required":["bundle","revision","camera_revision","workspace_revision"],"additionalProperties":false}}]}
  ```
  - `transport`：`http`（両 MCP が HTTP を呼ぶ）／`browser`（WebMCP 専用。カメラ画面の `BAICameraDebug` を読む。標準MCPには出さない）。
  - `bodyEncoding`：`none`／`json`（引数から `revision` を除いた全部を JSON 本文）／`json:<引数名>`（その引数だけ）／`binary_base64:<引数名>`（その引数を base64 復号してバイナリ本文、上限 8MB）。
  - `revision`：`none`／`required`（引数 `revision` を If-Match に）／`optional`。
  - `headers`（3-M12）：`{引数名: HTTPヘッダー名}`。その引数を本文から除き、指定ヘッダーで送る（`revision` は常に `If-Match` で、ここには書かない）。
  - `samples`：`none`／`browser:<kind>`（WebMCP はカメラ画面で `BAICameraDebug.collectSamples(kind, args)` を呼び、結果を本文の `samples`、`BAICameraDebug.getState().model` を本文の兄弟フィールド `modelTransform` に入れる。`args` はツール引数のうち `collectSamples` の種類別引数（§2.6.1）と同名のもの。標準MCPは付けない）。
  - `scope`（3-M12）：`both`（カメラ画面と main 画面の両方の WebMCP で登録）／`camera_page`（カメラ画面だけ）／`main_page`（main 画面だけ）。**`transport:'browser'` または `samples:'browser:*'` のツールは必ず `camera_page`**（`BAICameraDebug` がカメラ画面にしか無いため）。スキーマテストでこの規則を検査する。標準MCPは `scope` を見ない（`transport:'http'` を全部出す）。
  - `mcp_server.py`：起動時に読み、`transport:'http'` のツールだけ `TOOLS` に追加、`run()` は汎用ディスパッチ（既存の手書き `bai_camera_*` 分岐は JSON へ移す）。
  - `webmcp.js`：スクリプト評価の**最初の同期部分で** `const scope = document.currentScript?.dataset.webmcpScope || 'main'` を読み保持する（`document.currentScript` は await の後では `null` になるため）。そのうえで `register()` を `async` にし、**`await fetch('/camera_tools.json')` の完了後に**既存ツールとまとめて登録する（取得失敗時は `mixamoWebMcpDiagnostics.errors` に記録し、他のツールは登録する）。
  - **browser 転送のハンドラー表（3-M12）**：`webmcp.js` に `const BROWSER_HANDLERS = {bai_camera_framing_state: () => BAICameraDebug.framingState(), bai_camera_follow_fit_all: (args) => BAICameraDebug.fitAllPreview(args), bai_camera_debug_state: () => BAICameraDebug.getState()}` を置く。`transport:'browser'` のツール名がこの表に無ければ登録せず `errors` に記録（テストで「JSON の browser ツール＝表のキー」を検査）。`bai_camera_debug_state` は WP-03 で追加（読取専用）、他の2つは各 WP で追加。
  - `server.py` 静的配信に `/camera_tools.json`（`application/json`）。
  - テスト：`tests/test_camera_tool_parity.py`（`transport:'http'` の全ツールが tools/list に同じスキーマで出る。`bai_camera_set` のプロパティ集合 = `TOP_FIELDS ∪ {revision}`。scope 規則。`headers` の引数が `inputSchema` にある）、`tests/test_camera_tools_webmcp.cjs`（`vm` で `webmcp.js` を偽 `document.currentScript`・偽 `document.modelContext`・**解決を遅らせた**偽 fetch と実行し、①カメラ画面（`data-webmcp-scope="camera"`）で登録される名前の集合＝JSON の `both`＋`camera_page`、main 画面の既存ツールは含まれない ②main 画面では `both`＋`main_page`＋既存ツール、`camera_page` は含まれない ③fetch 解決前は登録されない ④`headers` の引数がヘッダーで送られ本文に無い）。
- **WebMCP をカメラ画面へ**：`camera.html` に `<script src="/webmcp.js" defer data-webmcp-scope="camera">` を `camera_project_bundle_ui.js` の後に追加。`webmcp.js` は保持した `scope==='camera'` のとき `both`＋`camera_page` のツールだけ登録（main 画面の既存ツールは `rows`・`chain` 等 main 画面のグローバルに依存するため登録しない）。
- **互換（2-M3）**：`bai_camera_get` は**既定で従来どおり project そのもの**を返す。`with_revision:true` で `{project, revision, dropped_fields}`（`?envelope=1` を呼ぶ）。`bai_camera_set` は従来の引数（schema/fps/duration/keys）に全フィールドと `revision`（**必須**）を追加。`revision` 必須化は**データ消失防止のための意図的な非互換**として `MCP_SETUP_JA.md` に移行手順（先に `bai_camera_get{with_revision:true}`）を書く。
- **WP-02c で追加・移行するツール**：`bai_camera_get`、`bai_camera_set`、`bai_camera_sample`（`normalized` 追加）、`bai_camera_sequence_evaluate`、`bai_camera_sequence_edit`（`revision` 必須）、`bai_project_bundle_get`、`bai_project_bundle_save`（`{bundle:{schema,combination,camera,workspace?}, revision, camera_revision, workspace_revision}`、上記 JSON 例）、`bai_camera_keys_merge`、`bai_camera_keys_apply`、`bai_camera_focus_commit`（実体は keys/merge の `focusDistance`）、WP-04 の読取ツール（手書きから JSON へ移す）。WP-02d で `bai_camera_focus_test_get`・`bai_camera_focus_test_set`。
- MCP に出さない操作（安全上・明記）：`reset`、`recover`、退避ファイルのダウンロード。

### 2.6 計算の置き場所（UI ローカル計算と Python プレビュー）
| 計算 | UI（画面） | Python（HTTP/MCP） | parity |
|---|---|---|---|
| キー補間 | `camera_core.sampleKeys` | `bai_camera.sample_pose` | ○ |
| カメラ移動 | `camera_core.moveCamera` | `bai_camera.camera_move`（`POST /api/camera/move`） | ○ |
| リグ評価・ベイク | `camera_rig.js` | `camera_rig.py`（`POST /api/camera/rig/bake`） | ○ |
| 光学評価 | `camera_core.evaluateOptics` | `camera_focus.evaluate_optics`（`POST /api/camera/focus/evaluate`） | ○ |
| 映画演出・テンプレート・類似・衝突・ディレクター | プレビュー HTTP を呼び、結果を UI でローカル適用（1 Undo） | Python のみ | — |
| 実モデルのボーン座標・包囲箱・`modelTransform` | `camera_3d.js` が samples を作る | 受け取るだけ | — |

- プレビュー HTTP の共通引数：`project`（任意、未保存の UI 状態。`strict` 検証するが保存しない。結果に `based_on:'request'|'saved'`）、`samples`・`modelTransform`（任意）。
- 確定（MCP・HTTP 経由の書込、WP-02b）：
  - `POST /api/camera/keys/apply`：本文 `{keys, from, to, mode:'insert'|'replace'}`＋If-Match。`keys` の各 `frame` が `[from, to]` の外、または `project.duration` を超えるときは 400 `invalid_range`（どのキーかを `error` に書く）。`insert` は区間内に既存キーがあれば 409 `keys_in_range`（UI ベイクと同じ規則、`camera.js:124-125`）。`replace` は `[from,to]` 内の既存キーを削除してから入れる。→ `{inserted, removed}`。
  - `POST /api/camera/keys/merge`：本文 `{frame, fields, create?}`＋If-Match。**`create` の既定は `false`**（キーが無ければ 404 `not_found`）。`bai_camera.merge_key`（`mergeKey` と同仕様、parity）。`create:true` でキーが無ければ `sample_pose(frame)` の `position`・`target`・`fov` に `fields` を重ねて新規（`fStop`・`focusDistance` は CAM-005 §2 の新規キー規則に従い、`fields` に無く値がキー由来でなければ書かない）。→ `{key, created}`。

### 2.6.1 samples のスキーマ（3-B1）
ブラウザーが実モデルを評価して作る数値列。**すべてシーン単位**。HTTP 本文では `samples`（配列）と `modelTransform`（オブジェクトまたは `null`）を**兄弟フィールド**として送る。`modelTransform` は配列を包まない。

```json
{"samples":[
  {"frame":120,"subject":"model-0",
   "bones":{"hips":[0,1.0,0.25],"head":[0,1.75,0.25]},
   "markers":{"face":[0,1.85,0.35],"eyes":{"l":[0.04,1.85,0.35],"r":[-0.04,1.85,0.35]},
              "chest":[0,1.45,0.25],"hips":[0,1.0,0.25],"hand_l":[0.4,1.0,0.25],"hand_r":[-0.4,1.0,0.25],
              "full":[0,1.0,0.25],"pick":null},
   "bbox":{"min":[-0.25,0,0.1],"max":[0.25,2.0,0.4]},
   "forward":{"head":[0,0,1]},
   "resolved":{"face":"bone","eyes":"bone","chest":"bone","hips":"bone","hand_l":"bone","hand_r":"bone","full":"bbox","pick":null}}],
 "modelTransform":{"s":1,"o":[0,0,0],"sourceHeight":2.0}}
```
- 各要素：`frame`（整数、プロジェクトフレーム）、`subject`（被写体ID、現行は1体なので `"model-0"`）、`bones`（ボーン名→ワールド座標。種類別に必要なものだけ）、`markers`（§2.6.2 の解決結果。解決できないマーカーは `null`）、`bbox`（そのフレームのスキニング後の包囲箱。モデル未読込なら要素自体を作らない）、`forward.head`（頭ボーンのワールド回転を (0,0,1) に適用した単位ベクトル、`cinematic` のみ）、`resolved`（マーカー名→`'bone'`（ボーンから）／`'fallback_bbox'`（ボーン欠落のため包囲箱中心で代替）／`'bbox'`（`full` は定義上包囲箱中心）／`'pick'`／`null`（解決不能））。
- 上限：要素 **10,000 件**、1要素の `bones` **64 本**、ボーン名 256 文字、本文全体 **16MB**（プレビュー系エンドポイント共通。超過は 413 `payload_too_large`、件数超過は 400 `invalid_range`）。数値は有限、絶対値 10000 以下。
- サーバーは samples を**受け取るだけで作らない**。`frame` の重複・降順は 400 `invalid_payload`。
- `BAICameraDebug.collectSamples(kind, args) → Promise<{samples, modelTransform}>`（モデル未読込なら `{samples:[], modelTransform:null}`）。フレームの列 `frames` は `args.frames`（整数配列、≤10,000）か `args.start`・`args.end`・`args.step` から作る。各フレームで `bai-camera-query-focus-target` と同じ方法でモデル時刻を合わせて評価し、終わったら現在フレームに戻す。

| kind | 追加する WP | 引数 `args`（frames 以外） | 出力に含めるもの |
|---|---|---|---|
| `transform` | WP-03 | なし | `samples:[]` と `modelTransform` だけ（VMD 変換・書出し用） |
| `focus` | WP-04 | `targetMarker`、`boneName`、`trackingTarget`（`focus_tracking.target` と同形） | 評価対象と追従対象のマーカー（`eyes` は両眼）、指定ボーン、`bbox`、`resolved`、`markers.pick`（workspace の手動ピック点） |
| `follow` | WP-08 | `targets`（`bone_follow.targets` と同形） | 指定マーカー・ボーン、`bbox`、`resolved` |
| `cinematic` | WP-09 | `need:['head','shoulder_l','shoulder_r']` 等 | `bones` の指定分、`forward.head`、`markers.face`、`bbox` |
| `collision` | WP-15 | なし | `bbox` だけ |
| `director` | WP-16 | なし | `bones` に `hips, spine, chest, head, hand_l, hand_r, foot_l, foot_r`（§2.6.2 の対応で解決できたもの）、`bbox` |

### 2.6.2 マーカー→ボーン対応（3-M13、WP-04 で `camera_follow_config.js` の `classifyBone` を拡張、Python は同表を `camera_markers.py` に持つ）
照合は大文字小文字を無視し、表の上から最初に一致したボーンを使う。`L/R`・`左/右` は**モデル自身の左右**（§0.2：モデルは +Z を向き、左＝+X）。

| マーカー／役割 | 候補ボーン名（いずれか） | 点の決め方 | ボーンが無いとき |
|---|---|---|---|
| `hips` | `hips`, `Hips`, `mixamorig:Hips`, `下半身`, `センター`, `J_Bip_C_Hips` | ボーン位置 | 包囲箱中心（`fallback_bbox`） |
| `spine` | `spine`, `Spine`, `mixamorig:Spine`, `上半身`, `J_Bip_C_Spine` | ボーン位置 | なし（`null`） |
| `chest` | `chest`, `Chest`, `UpperChest`, `mixamorig:Spine2`, `上半身2`, `J_Bip_C_Chest` | ボーン位置 | 包囲箱の高さ 72.5% の中心（`fallback_bbox`） |
| `head` | `head`, `Head`, `mixamorig:Head`, `頭`, `J_Bip_C_Head` | ボーン位置 | なし（`null`） |
| `eye_l`／`eye_r` | `eye_l`/`eye_r`, `LeftEye`/`RightEye`, `左目`/`右目`, `J_Adj_L_FaceEye`/`J_Adj_R_FaceEye` | ボーン位置 | なし（`null`） |
| `eyes` | 上の2つ | `{l, r}` の2点 | 片眼だけ解決なら解決できた方のみ（もう一方 `null`）。両方無しは `null` |
| `face` | （派生） | 両眼が解決できれば**両眼の中点**。無ければ `head` 位置＋`forward.head`×0.08·s＋ワールド上 (0,1,0)×0.06·s | `head` も無ければ包囲箱の高さ 92.5% の中心（`fallback_bbox`） |
| `hand_l`／`hand_r` | `hand_l`/`hand_r`, `LeftHand`/`RightHand`, `mixamorig:LeftHand`/`mixamorig:RightHand`, `左手首`/`右手首`, `J_Bip_L_Hand`/`J_Bip_R_Hand` | ボーン位置 | なし（`null`） |
| `foot_l`／`foot_r` | `foot_l`/`foot_r`, `LeftFoot`/`RightFoot`, `mixamorig:LeftFoot`/`mixamorig:RightFoot`, `左足首`/`右足首` | ボーン位置 | なし（`null`） |
| `full` | （派生） | 包囲箱中心（`resolved:'bbox'`） | モデル未読込なら `null` |
| `bone` | 指定名と完全一致（大文字小文字は区別） | ボーン位置 | 包囲箱中心（`fallback_bbox`、警告 `bone_missing`） |
| `pick` | （手動ピック、CAM-005） | workspace に保存したワールド座標（アニメーションに追従しない固定点と UI に明示） | 未設定なら `null` |

- 包囲箱の高さ割合 72.5%・92.5% はテスト GLB の `chest`（1.45/2.0）・顔（1.85/2.0）に合わせた目安で、**代替であることを必ず表示**する。
- 代替を許すのは上表の「包囲箱」欄があるものだけ。`spine`・`head`・眼・手・足は代替しない（位置が大きく違うため）。

### 2.7 読み込みエラー（G-06、WP-02a、2-M2）
- `bai_camera.read_project(path) → (project, dropped_fields)` を新設、旧 `read(path)` は `read_project(path)[0]`（呼出元互換）。
  - **ファイルが無い**：`DEFAULT` を返す。書かない。
  - **読めない（OSError：権限・ロック等）**：退避できないので `backup:null` で `CameraProjectInvalid` を投げる。
  - **JSON 不正／検証失敗**：`sha8 = sha256(生バイト)[:8]`。**読んだファイルと同じフォルダ**に `camera_project.invalid-<sha8>-*.json` が既にあれば作らず、無ければ `camera_project.invalid-<sha8>-<YYYYmmddTHHMMSSZ>.json`（UTC、コロンなし）に生バイトをコピー。元ファイルは動かさない。`CameraProjectInvalid(message, backup_name)` を投げる。
- サーバー：カメラを読む全 GET（`/api/camera/project` 両形式・`sample`・`focus`・`sequence/evaluate`・`/api/project/bundle`）と全書込は 422 `{error, error_code:'camera_project_invalid', backup:<名前>|null}`。
- **復旧用（UI・HTTP のみ）**：
  - `GET /api/camera/project/backup?name=<退避名>`：退避ファイルをそのままダウンロード（`application/json`、`Content-Disposition: attachment`）。名前は正規表現 `^camera_project\.invalid-[0-9a-f]{8}-\d{8}T\d{6}Z\.json$` のみ。
  - `GET /api/camera/project/invalid-preview`：**読取専用の緩い解析**。応答は常に `{ok:true, revision:null, result:{...}}`。JSON として読めれば、トップレベル・各キーを個別に検証し `result = {readable:true, valid_fields:[...], invalid_fields:[{path, reason}], key_count, valid_key_count}`。JSON として読めない・ファイルを開けないときは `result = {readable:false, reason:'json_error'|'os_error', detail}`。ファイルが正常に読める（不正でない）ときは `result = {readable:true, valid:true}`。何も保存しない。
  - `POST /api/camera/project/reset`：本文 `{"confirm":"reset-camera-project"}` 必須（違えば 400 `confirmation_required`）。退避を確認（読めるのに無ければ作る）してから `DEFAULT` を保存。→ `{backup}`（`backup` は退避名または `null`）。
- UI：`camera.js` は読込時に 422 なら編集を開始せず、「カメラ保存データを読めませんでした。元ファイルはそのまま。退避コピー：<名前>（なし）」＋［退避ファイルをダウンロード］［中身を確認］（invalid-preview の一覧表示）［初期状態から始める］（確認ダイアログ後 reset）。
- テスト（`tests/test_camera_project_read_errors.py`）：ファイル無し→既定値・未作成、不正 JSON→422・退避1件・元不変、同じ内容2回→退避1件、別内容→2件目、読めないファイル（権限なしを模擬）→`backup:null`、退避が読んだファイルのフォルダにできる、backup ダウンロードの名前検査、invalid-preview の一覧、reset の確認なし→400、reset 後は正常、未知フィールド→`dropped_fields`、書込の未知フィールド→400、`_revision` 等は無視。
- **注記（P2 設計 v2、2026-10-20。仕様の変更ではない）**：P2 の統合保存が壊れたカメラ保存データを既定値で上書きしないよう、本節のうち `read_project` の読込エラーの分岐（ファイル無し・OSError・JSON 不正/検証失敗→退避）、`CameraProjectInvalid`、退避コピー、`bad(...,code)`（§2.4）を **P2-WP-00b で前倒し**する（`docs/roadmap/P2_PORT_DETAILED_DESIGN_20261020_JA.md` §1.15 B-3）。前倒しで厳格に読むのは、`/api/project/bundle` の GET と POST の書く前の読込（保存後の読み直しは非厳格のまま）、`GET /api/camera/project`（両形式）、`POST /api/camera/project`（If-Match の有無にかかわらず書く前に読む）、`POST /api/camera/sequence/edit` だけ（P2 設計 v3、2-B1）。`dropped_fields` は常に `[]`、旧 `read()` と読むだけの GET（focus・sample・sequence/evaluate）は変えない。`CameraProjectInvalid` は `Exception` を直接継承し、422 の本文は `backup` を含めて直接送る。旧 `camera.js` は読込エラーの文言だけを直す（1か所）。残り（`read()` の置き換え、未知フィールド、読むだけの GET の 422、backup・invalid-preview・reset、UI の復旧操作）は WP-02a のまま。
- **注記（P2 設計 v4、2026-10-20。仕様の変更ではない）**：本節の `POST /api/camera/project/reset`（本文・400 `confirmation_required`・退避の確認・`{backup}` の応答）も、**仕様どおり P2-WP-00b で前倒し**する（壊れたカメラ保存データのとき、新UIで利用者が打てる手が無いため。P2 設計 §1.15 B-3 の 2b、3-M2）。新UIは確認ダイアログを出してから送る。`GET /api/camera/project/backup`・`invalid-preview` と `camera.js` の［退避ファイルをダウンロード］［中身を確認］［初期状態から始める］は WP-02a のまま。WP-02a では、reset の実装とテストが既にあることを確かめ、UI 部分だけを足す。台帳 `p2_port.planned_in` に記録した。

### 2.8 統合保存の完成（WP-02d）
`PHASE_E_PROJECT_STATE_ROUNDTRIP_DESIGN_JA.md` の残りを埋める。
- **注記（P2 設計 v4、2026-10-20。仕様の変更ではない）**：P2-WP-04 で、所有者決定（NF-014 のうちステージ配置の基本、2026-10-20）により、workspace に任意のキー `stage`（`null` か `{asset, position[3], rotation[3], scale}`）を足す（P2 設計 §1.15 B-4）。サーバーは、本文に `stage` が無ければ既存の値を残す。下の 2 の workspace の拡張では、この `stage` を消さずに残す（`validate_workspace` の緩和と `test_camera_workspace_contract.py` の検査も `stage` を含めて直す）。`assetRef` は保存のときに新UIのストアの `asset` から作る（カメラ側のフィールドではない。P2 設計 3-M8）。

1. **保存前イベントの統一（G-04）**：`collectCameraState()` を作り、通常保存と bundle スナップショットの両方がこれを呼ぶ。`bai-camera-before-save` を同期発火（`detail.project` に clone）し、その clone を返す。ハンドラーの例外で保存中止。
2. **workspace の拡張**（`data/project_state.workspace.json`。必須 `{frame, asset, clip}`、以下は任意）：
   ```json
   {"frame":0,"asset":"abc.glb","clip":0,
    "assetRef":{"filename":"abc.glb","sha256":"<64桁>"},
    "timelineView":{"start":0,"size":300},
    "autoKey":false,
    "selection":{"keyFrame":null,"presetName":null,"shotIndex":null},
    "focusTest":{"enabled":false,"viewMode":"normal","targetMarker":"face","boneName":"","pickPoint":null,
                 "circleOfConfusionMm":0.03,"strictToleranceM":0.02,"showNearFarPlanes":true,"rangeStep":1},
    "dofPreview":false,
    "framing":{"enabled":false,"mode":"full","aspect":1.7778,"margin":5,
               "guides":{"safe":false,"headroom":false}}}
   ```
   - 範囲：`viewMode` `normal|color`、`targetMarker` `face|eyes|chest|hips|full|bone|pick`、`pickPoint` `[x,y,z]`（シーン単位）または `null`、CoC 0.001–0.1mm、`strictToleranceM` 0.001–1（シーン単位）、`rangeStep` 1–1000、`aspect` 0.2–5、`margin` 0–40。
   - `framing.guides` はセーフフレーム・ヘッドルームだけ。**三分割線は現行どおり常時表示で、ON/OFF も保存もしない**（未要求の変更をしない）。
   - 再生中フラグは保存しない。独立した「再生範囲」機能は現行に無いので表示範囲を `timelineView` に保存（新機能は作らない）。
   - メイン画面状態＝コンビネーション（既存 bundle に含まれる）。保存・復元後に既存 `sync_bump()` でメイン画面に再読込させる。追加のメイン画面 UI 状態は保存しない。
   - **保存範囲の明示（2-M10）**：VMD 参照・VMD 追従状態は **WP-13 で保存する**（現行のネイティブトラックはメモリ上だけで、原本を保存する仕組み `data/camera_clips/` が WP-13 で初めてできるため。WP-02d の時点で保存すると復元できない参照になる）。画面レイアウト（最大化・分割比）は WP-17。WP-02d のゲートではこの2つを「後続 WP で保存」と記録する。
   - `validate_workspace` を緩和（必須3つ＋上記任意キーのみ、他は `unknown_field`）。`validateRestore` も任意キーを受け入れ型だけ確認。
   - **復元時のフレーム（3-m7）**：`workspace.frame > camera.duration` は拒否しない。`duration` に丸めて復元し「保存時のフレーム N は長さを超えるため M に合わせました」と表示。`timelineView` も同様に範囲内へ丸める。
3. **素材 ID＝ファイル名＋sha256**：`GET /api/camera/asset-ref?name=` → `{filename, sha256, bytes}`（`catalog_combined()` 登録済みのみ、無ければ 404 `not_found`）。
   - サーバーは sha256 を `(絶対パス, st_mtime_ns, st_size)` をキーにメモリへキャッシュ（最大 256 件、超えたら古い順に捨てる）。キーが変われば再計算。
   - **`assetRef` を埋めるのはカメラ画面**：`collectCameraState()` の後、bundle スナップショット作成時に `camera_project_bundle_ui.js` が現在表示中のモデル名で `asset-ref` を呼び、結果を `workspace.assetRef` に入れる（モデル未選択なら `assetRef` を入れない。呼出が失敗したら保存を中止し理由を表示）。サーバーは `assetRef` を検証するだけで作らない。復元時：無い→読み込まず「モデルが見つかりません」、sha256 不一致→［このまま読み込む］［中止］、`assetRef` 無しの旧形→名前だけ照合し「旧形式のため中身の照合なし」。
4. **原子的保存とジャーナル**：
   - 書込順：①全体検証 ②`txid` 決定、既存3ファイル（camera・workspace・combination）のうち**存在するもの**を `<name>.bak-<txid>` にコピー（存在しないものは `backup:null`）③`data_dir()/.bundle-journal.json` を書き fsync（`{schema:1, txid, startedAt, files:[{target, tmp, backup|null, newSha256}]}`。`newSha256` は①で作った新しい内容のハッシュ）④3つの `<name>.tmp-<txid>` を書き fsync ⑤`os.replace` を camera → workspace → combination ⑥ジャーナル削除 ⑦バックアップ削除。
   - **ディレクトリの fsync**：③⑤⑥の後に、POSIX（`os.name=='posix'`）では `data_dir()` を `os.open(..., O_RDONLY)`＋`os.fsync` する。**Windows では省略**する（ディレクトリを開いて fsync できないため。`os.replace` の原子性だけに頼る）ことをコードのコメントと本節に明記。
   - ジャーナル残存中：カメラ・コンビネーション・bundle・workspace の**全書込エンドポイント**は 423 `recovery_pending`。GET は通常どおり、bundle GET に `recovery_pending:true`。
   - **画面表示**：**メイン画面（`index.html` の保存処理）**は 423 を受けたら「前回の統合保存が途中で止まっています。カメラ画面で復旧してください」（リンク付き）を表示する（2-M2）。**カメラ画面**は起動時の bundle GET で `recovery_pending:true`、または任意の保存で 423 を受けたら、画面上部に復旧バナー（「前回の統合保存が途中で止まっています」＋［保存前の状態に戻す］［今のファイルのまま続ける］）を出し、選ぶまで保存ボタンを無効にする。
   - `POST /api/project/bundle/recover`：本文 `{"action":"restore_backup"|"keep_current","confirm":true}` → `{action, restored:[...], removed:[...], rolled_forward:[...]}`。自動では選ばない。処理（ジャーナルの `files` を順に）：
     - `restore_backup`：`backup` があれば `os.replace(backup, target)`。**`backup:null`（保存前に無かったファイル）なら `target` を削除**（存在すれば）。残った `.tmp-<txid>` は削除。
     - `keep_current`（＝今回の保存を完了させる）：ファイルごとに、`target` の内容ハッシュが `newSha256` なら置換済み、そうでなく `.tmp-<txid>` があり内容ハッシュが `newSha256` なら未置換で前進可能、どちらでもなければ前進不能と判定する。**全ファイルが「置換済み」か「前進可能」なら、前進可能なものを⑤の順で `os.replace` して前進（roll forward）**する。1つでも前進不能（④の途中で止まり tmp が欠けた・壊れた等）なら `restore_backup` と同じ処理をして `action:'restore_backup'`、理由 `tmp_missing` を返す（UI はその旨を表示）。
     - どちらも最後にジャーナル削除→ `.bak-<txid>` 削除→ディレクトリ fsync（POSIX のみ）。
     - `txid = uuid4().hex`（32桁小文字16進）。単一ファイル保存の tmp 名も `<name>.tmp-<uuid4().hex>`。起動時の掃除は `data_dir()` 直下で名前が `^(<bundle が書く camera・workspace・combination の実ファイル名>)\.(bak|tmp)-[0-9a-f]{32}$` に一致するものだけを削除する。
   - **起動時の掃除**：ジャーナルが**無い**状態で `data_dir()` に `*.bak-<txid>`・`*.tmp-<txid>` が残っていれば（⑥の後⑦の前に止まった場合）、サーバー起動時に削除し `diagnostic_logging` に記録する。ジャーナルがある間は何も消さない。
   - 単一ファイル保存の tmp 名を `<name>.tmp-<乱数>` に。
   - 既存テスト `test_bundle_snapshot_consistency.py` はソース文字列を検査している。同じコミットで振る舞いテストへ置換（§4.2）。
5. **追従設定**：`bone_follow`・`focus_tracking` は project。localStorage `bai-camera-follow-v1` は project 未保存時の下書きに限定。
6. **フォーカステスト設定 API（2-M9、フォーカス設計 §6 の `get_settings`/`set_settings`）**：
   - `GET /api/camera/focus-test/settings` → `{focusTest}`、`revision` は **workspace_revision**（workspace に無ければ既定値、ファイルが無ければ `revision:"absent"`）。
   - `POST /api/camera/focus-test/settings` 本文 `{focusTest:{...部分}}`、If-Match＝workspace_revision → workspace の `focusTest` だけを置き換えて保存（workspace 1ファイルの原子的保存。ジャーナル残存中は 423）。撮影キーは変えない。→ `{focusTest}`、`revision` は新しい workspace_revision。
   - **外部変更の反映（3-m15）**：カメラ画面は `/api/sync` を見ていない（ポーリングは `index.html:400-415` のメイン画面だけ）。本書でもカメラ画面にポーリングを足さない。MCP 等で設定が変わった場合、カメラ画面は ①ページ再読込 ②既存の［再取得］（`#sequence-refresh`）で `GET /api/camera/focus-test/settings` も呼び直す、で反映する。気付かずに bundle 保存した場合は `X-Bai-Workspace-Revision` の 409 で止まる（§2.4）。
   - MCP `bai_camera_focus_test_get`・`bai_camera_focus_test_set`。
7. **テスト**：`tests/test_project_bundle_roundtrip.py`（保存→再 import 相当→読込→全フィールド比較、ジャーナル 423 と recover 2種、sha256 不一致、素材欠損、未知フィールド、If-Match 競合、`X-Bai-Camera-Revision` 不一致で 409 `camera_revision_conflict`、**focus-test settings を API で変えた後の古い `X-Bai-Workspace-Revision` で 409 `workspace_revision_conflict`**、bundle 保存後に `camera_revision` で通常保存が通り `dirty=false`、focus-test settings の get/set と撮影キー不変、`workspace.frame > duration` の丸め、asset-ref のキャッシュ（mtime 変更で再計算）。ジャーナル：⑤の各段階（camera だけ置換済み、camera＋workspace 置換済み）で止めた状態を作り `keep_current` が前進する／④の途中（tmp が1つ欠ける・内容が違う）で止めると `restore_backup` になる、`backup:null` の対象が `restore_backup` で消える、起動時の孤立 `.bak`・`.tmp` 掃除、Windows 判定でディレクトリ fsync を呼ばない（`os.name` を差し替え））、Playwright：bundle 保存→ページ再読込→復元→`readState` 一致、メイン画面の 423 表示、カメラ画面の復旧バナー。

### 2.9 実ブラウザーテストの土台（WP-03）
- 新規 `tests/camera-ui.test.cjs`（`tests/studio-ui.test.cjs` と同じ起動方式）。
- **ポート**：Playwright ファイルごとに別ポート。`studio-ui` は既存 8799、`camera-ui` は環境変数 `CAMERA_UI_TEST_PORT`（既定 **8798**）。**注記（P2 設計 v2、2026-10-20）**：8798 は既存の `tests/legacy-ui-layout.test.cjs`（`LEGACY_UI_TEST_PORT`）が使っているため、`camera-ui` の既定は **8791** に読み替える（P2 のポート表：`docs/roadmap/P2_PORT_DETAILED_DESIGN_20261020_JA.md` §4.1）。また、データ隔離・ルート `conftest.py`・three・SwiftShader 起動・テスト GLB・`studio-ui` の隔離は P2-WP-00a-1（データ隔離）・P2-WP-00a-2（ハーネス・three・SwiftShader・テスト GLB）で先に実施する予定（本節の仕様どおり）。
- **データ隔離（2-M7、必要な依存作業）**：新規 `bai_paths.py` に `data_dir() → Path`（環境変数 `BAI_DATA_DIR` があればそれ、無ければ `BASE/'data'`）。次の**すべて**を `data_dir()` から作る：`server.py` の `DATA`（`FILES`・`MMD_DIR`・`MMD_META`・`META`・`FAVORITES`・`PROJECT`・`CUSTOM_ASSETS`・`CUSTOM_INDEX`・`EDITOR_FILE`・`LAYER_FILE`・`CONVERT_STATUS`・`SYNC_FILE`・`camera_project.json`・`pose_ik_last.json`・`conversion_map.json`・`integrated_v02/catalog.json` を含む）、`server.py:37` `RETARGET_FILE`、`server.py:54` `AI_CONFIG`、`diagnostic_logging.py:5` `LOG_DIR`（**import 時に `mkdir` するので、`data_dir()/'logs'` に変えたうえで import 前に環境変数が設定されている必要がある**）、`qa_capture.py:5` `ROOT`、および本書で追加する `camera_clips/`・`camera_exports/`・`.bundle-journal.json`。テストは一時ディレクトリに `integrated_v02/catalog.json`（`{"models":[],"motions":[]}`）を置いてから起動。
  - **pytest（3-M9）**：リポジトリ直下に `conftest.py` を新設（ルートの `test_*.py` と `tests/` の両方に効く位置）。モジュールの先頭（どのプロジェクトモジュールの import よりも前）で `tempfile.mkdtemp()` を作り、空の `integrated_v02/catalog.json` を置いて `os.environ['BAI_DATA_DIR']` に設定する。セッション終了時に削除。個別テストが独自の一時ディレクトリを使う場合は `monkeypatch.setenv` ＋`importlib.reload` で切り替える。
  - **対象外の書出し先（3-m21）**：既存の `BASE/'exports'`（`server.py:732-892`、VMD 変換ジョブ・チェーン書出し）は `data_dir()` の外で、本書では移さない（Phase E の範囲外）。テストでこの経路を呼ぶものは無いことを `tests/test_data_isolation.py` で `exports/` のハッシュ不変として併せて確認する。本書で追加する `camera_exports/` は `data_dir()` の中。
  - 検証：テスト開始前と終了後に実 `data/` ツリー**全体**（`logs/` を含む全ファイルの相対パス＋内容）と `exports/` の sha256 を計算して一致を確認（`tests/test_data_isolation.py` と Playwright の after フック）。
- **three**：devDependencies に `"three": "0.160.1"`（importmap と完全一致）。`page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**', ...)` で `node_modules/three/` から返す。
- **Chromium**：`chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, args:['--enable-unsafe-swiftshader']})`。ブラウザーは `/opt/pw-browsers`。SwiftShader は GPU 検証ではない。結果に `webgl_renderer` を記録し、SwiftShader/llvmpipe なら「GPU未検証」。
- **テスト用モデル（2-B1）**：`tools/make_test_glb.py`（標準ライブラリのみ）が `tests/fixtures/synthetic_test_model.glb` を生成。
  - 形状：**直方体1個**（8頂点・12三角形）。頂点の包囲箱が**ちょうど x −0.25〜0.25、y 0〜2.0、z −0.15〜0.15**（中心 x=z=0、足 y=0、高さ 2.0）。読込時の正規化で `s=1`・`o=(0,0,0)` になる。全頂点を `hips` に重み 1.0 でスキニング（`hips` の移動で箱全体が動く。正面 z=+0.15 は光軸に垂直な平面なので深度が一様になる＝深度色テスト用）。マテリアルは `MeshStandardMaterial` 相当の単色（白）1つ。
  - 向きと左右（3-M13）：**モデルは +Z を向き、モデルの左は +X**（VRM 1.0 規約、§0.2）。
  - ボーン10本（名前固定、ワールド座標）：`hips`(0,1.0,0) → `spine`(0,1.2,0) → `chest`(0,1.45,0) → `head`(0,1.75,0) → `eye_l`(**+0.04**,1.85,0.1)・`eye_r`(**−0.04**,1.85,0.1)、`chest` → `hand_l`(**+0.4**,1.0,0)・`hand_r`(**−0.4**,1.0,0)、`hips` → `foot_l`(**+0.1**,0.05,0)・`foot_r`(**−0.1**,0.05,0)。頭ボーンのローカル +Z はモデル前方 +Z と一致。眼・手・足は頂点を持たない（重み0）。
  - アニメ1本（30フレーム、30fps）：`hips` を z 方向に 0（フレーム0）→0.5（フレーム15）→0（フレーム30）を線形に移動、`head` を y 軸回りに 0→30度（フレーム0→30、線形）。期待するボーンのワールド座標と、各フレームの包囲箱を JSON（`tests/fixtures/synthetic_test_model.expected.json`）に同時出力。
  - 登録は `POST /api/integrated-v02/upload?name=合成テストモデル.glb&kind=model`、**カタログ名 `合成テストモデル.glb`**（3-m1。カタログはアップロード時の `name` をそのまま表示名にするため）。
- `window.BAICameraDebug`（読取専用）：`getState() → {frame, contentVersion, pose, lens, optics, keysCount, dirty, serverRevision, workspaceRevision, model:{loaded, s, o, sourceHeight}|null, renderer}`、`collectSamples(kind, args)`（§2.6.1。WP-03 で `transform`、WP-04 で `focus`、WP-08 で `follow`、WP-09 で `cinematic`、WP-15 で `collision`、WP-16 で `director` を追加）。`framingState()`（WP-15）、`fitAllPreview(args)`（WP-08）は §2.5 のハンドラー表から呼ばれる。
- WP-03 の受け入れ：テスト GLB 登録→選択→両 View に描画（非背景ピクセル > 0）→`getState().model` が `s=1`・`o=(0,0,0)`（1e-9）→フレーム変更でボーン位置が期待 JSON と 1e-3 以内→実 `data/` ハッシュ不変。

### 2.10 状態バージョンとキャッシュ無効化（WP-04）、外部変更の Undo（WP-02d）
- `contentVersion`：キー編集・補間変更・VMD/通常キー切替・VMD 追従 ON/OFF・ショット変更・レンズ/F値/合焦距離・`previewPose` の変更・追従 ON/OFF・追従対象変更・モデル/クリップ変更・フォーカステスト設定変更・Undo/Redo・再取得/復元で +1。
- フレームは別の値。キャッシュと非同期結果のキーは `(contentVersion, frame)`。不一致の結果は捨てる。範囲診断は開始時の値を保持し、変わったら中止して通知。
- **外部変更の再取得（G-16、2-M9）**：`refreshSequenceFromServer` は履歴を消さず、取得した project を**1件のチェックポイント**（ラベル「外部変更（MCP 等）」）として積む。Undo でその外部変更前の状態に戻せる（戻した状態を保存すれば revision 照合のうえ通常の保存になる）。未保存の UI 編集がある間は再取得しない（現行規則）。

### 2.11 静的配信リスト（`server.py:166`）
追加：`/camera_core.js`（WP-00a）、`/camera_easing.js`（WP-00a）、`/camera_tools.json`（WP-02c）、`/camera_curve_editor.js`（WP-05）。`/webmcp.js` は既存の個別ルート。`camera_cinematic.js`・`camera_vmd_preview.js` は読み込まない（削除しない、docstring に「カメラ画面未使用」）。テスト `tests/test_camera_static_files.py`：`camera.html` の全 `<script src>` が 200。

### 2.12 Scene View 専用表示（3-M8、WP-04）
- Scene View にだけ映すもの（撮影カメラのヘルパー `camHelper`、焦点面・近点面・遠点面・対象マーカー `focusOverlay`、リグの経路 `railPath`・ハンドル `railHandles`、CAM-017 の衝突体表示）は **`THREE.Layers` のチャンネル1**に置く（`object.traverse(o => o.layers.set(1))`）。
- `sceneCam.layers.enable(1)`（チャンネル0と1の両方を見る）。撮影カメラ（`views[1].camera`、`selectFilmingCamera` で切り替わるものすべて）はチャンネル0だけ（既定のまま）。
- 現行の「描画の前後で `visible` を切り替える」方式（`camera_3d.js:206` の `camHelper.visible=true/false`・`focusOverlay.visible=false` 等）は WP-04 でこの方式に置き換える（`visible` は「表示 ON/OFF の設定」の意味だけに使う）。
- レイキャスト（リグハンドルのドラッグ）は `raycaster.layers.enable(1)` を設定する。
- テスト（Playwright）：焦点面 ON で、Camera View の要素スクリーンショットに焦点面の色が無く、Scene View には有る。

---

## 3. 機能ごとの詳細設計（ID 順。実装順は §4）

### CAM-001 カメラVMDの読込・分割・登録（任意区間抽出と境界補間）— WP-13
- 現状：inspect・native import・sample・preview-pose あり。ボーン/モーフ入り、カメラ節の後の照明・セルフ影・IK 節があると拒否（`camera_vmd_codec.py:21-22,37`）。分割・登録なし。トラックはメモリ上だけ。
- 設計：
  1. **デコーダ**：`decode_camera_track(raw, *, skip_non_camera=False)`。カメラ節の後の照明（件数 `u32`＋各28バイト）・セルフ影（件数 `u32`＋各9バイト）・IK（件数 `u32`＋各 `u32 frame + u8 show + n:u32 + n×(20バイト名+u8)`＝`9+21n` バイト）は**常に読み飛ばして件数を数える**。
     - **終端の扱い（3-m11）**：照明・セルフ影・IK の各節は、その節の件数 `u32` を読む位置で**ちょうどファイル終端なら「節なし」（件数0）**として正常終了（古い VMD はこれらの節を持たない）。件数を読めたのに中身が足りない、または件数 `u32` の途中で終わる（1〜3 バイトだけ残る）場合は 400 `vmd_truncated`。IK の `n` は 0〜1024 を超えたら 400 `vmd_truncated`（壊れたファイルの巨大確保を防ぐ）。
     - IK 節を読み終えても残りバイトがあれば拒否せず、`warnings:[{code:'trailing_bytes', bytes:<数>}]` を返す（UI に表示）。
     - ボーン・モーフは `skip_non_camera=True` のときだけ読み飛ばす（既定は従来どおり拒否）。戻り値に `skipped:{bones, morphs, lights, shadows, ik}`・`warnings`。
  2. **補間バイト順**：`camera_vmd_playback.py` に `VMD_CAMERA_INTERP_ORDER = ('x1','y1','x2','y2')`（現行コードの仮定、チャンネル X,Y,Z,回転,距離,視野角 ごとに4バイト連続）。JS 同値。**未検証**。検証方法：mmd_tools のカメラ補間読取部との照合、またはオーナー提供の実 MMD カメラ VMD。確定まで CAM-001/016 は未完成。
     - **2026-10-22の調査追記（Issue #58）**：公開実装 [three-mmd-loader のカメラ読取部](https://github.com/hanakla/three-mmd-loader/blob/master/src/MMDLoader.ts#L2598-L2608) は各4バイトを `(x1,x2,y1,y2)` と読む。[mmd_tools の到着側キー適用例](https://github.com/sugiany/blender_mmd_tools/issues/10) も区間の後ろのキーの補間を使う。現行の `camera_vmd_playback.py`・`camera_vmd_local.js`・`camera_vmd_preview.js` は `(x1,y1,x2,y2)` と解釈するため、非対称曲線で緩急が異なる可能性が高い。WP-13では非対称な6曲線を持つ固定VMDで公開実装と比較し、実MMDでも中間フレームを確認してから定数・デコーダ・プレビュー・書出しを一緒に改める。原本バイト列は保持する。実MMDでの一致はまだ未検証。
  3. **原本保存**：`camera_vmd_clip.store_original(raw, name) → {file, sha256, bytes}`、`file='vmd-'+sha256[:16]`、`data_dir()/camera_clips/<file>.vmd`（同一 sha256 は書かない）。
  4. **クリップ参照**（`vmd_clips[]`）：`{id, name, file, sha256, start, end, keyCount, importedAt}`（`start`・`end` は VMD フレーム、両端含む。`id` は1〜64文字 `[A-Za-z0-9_-]`。`importedAt` クライアント付与）。
  5. **分割** `split(track, start, end, *, rebase=True) → {track, changed_keys}`：
     - 到着側キー規則。区間内の元キーはそのまま。境界 τ にキーが無ければ τ を含む元区間 (a,b) で境界キーを作る（値は `sample_native_camera(track, τ)`）。
     - チャンネルごとに `u=(τ−a.frame)/(b.frame−a.frame)`、制御点 `P0=(0,0),P1=(x1,y1),P2=(x2,y2),P3=(1,1)`（/127）。`x(s)=u` を二分法（40回）で解き、ド・カステリョ分割（`P01,P12,P23,P012,P123,P0123`）。左 `P0,P01,P012,P0123`、右 `P0123,P123,P23,P3`、`yτ=P0123.y`。左の正規化 `x'=x/u, y'=y/yτ`、右 `x'=(x−u)/(1−u), y'=(y−yτ)/(1−yτ)`、`round(v·127)`。境界キー τ ← 左、元キー b ← 右。クリップ先頭の境界キーは線形 `(20,20,107,107)`。
     - 退避：(i) 正規化後 0〜127 外 (ii) `|yτ|<1e-9` か `|1−yτ|<1e-9` (iii) 量子化後 `x1>x2` → 切り出し側を毎フレームの線形キーで置換。
     - `changed_keys:[{frame, reason:'boundary_inserted'|'split_left'|'split_right'|'fallback_dense'}]` を表示。`rebase=True` で `start` を 0 に。
  6. **プロジェクトキーへの変換** `to_project_keys(track, *, fps, start, end, step=None, model_transform=None) → {keys, clamped_fov, merged_frames, scale_source}`：
     - フレーム：キー位置 `f_project = round(f_vmd·fps/30)`、サンプリングは `g·30/fps` の実数フレーム。
     - 既定 `step = max(1, ceil(区間のプロジェクトフレーム数/4000))`。既存＋生成 > 5000 は 400 `too_many_keys`。
     - 各サンプルを付録B の取込変換（`12.5` と `model_transform` の `s`・`o`）でシーン姿勢へ。`model_transform` 無しは `s=1, o=0`、`scale_source:'unknown'`。`up` から `roll`。
     - FOV は [5,150] にクランプし件数を返す。補間は `linear`。
     - 平行投影（`perspective=1`）を含めば 400 `vmd_unsupported`。
  7. **UI**：「VMDを登録」、クリップ一覧（欠損表示）、「区間を切り出す」（`changed_keys` 表示）、「プロジェクトのキーに変換」（確認ダイアログ、`keys_in_range` で中止、ローカル適用 1 Undo）。試験プレビュー・追従はクリップに対して動き、workspace に `vmdPreview:{clip, follow}` を保存（WP-13 で `validate_workspace` に追加）。
  8. **欠損**：`file` 無し／sha256 不一致は一覧に表示。そのクリップを使うショットは CAM-015 の欠損表示。
- API・MCP：`POST /api/camera/vmd/clips/upload?name=`（≤32MB。**`decode_camera_track(raw, skip_non_camera=True)`** で検査するので、モーション入りの VMD からもカメラ部分を登録できる。読み飛ばした件数を表示）→ `{file, sha256, bytes, keyCount, frames, skipped, warnings}`。`GET /api/camera/vmd/clips` → `{clips:[...available, reason?]}`。`POST /api/camera/vmd/clips/preview` 本文 `{file, start, end, rebase, to_keys:{fps, step?}?, modelTransform?}` → `{track, changed_keys, keys?, clamped_fov?, scale_source?}`。MCP `bai_camera_vmd_clip_upload`（`bodyEncoding:'binary_base64:data_base64'`、8MB 上限）、`bai_camera_vmd_clip_list`、`bai_camera_vmd_clip_preview`（`samples:'browser:transform'` で WebMCP は `modelTransform` を付ける。このため scope は `camera_page`。標準MCPからは `modelTransform` を引数で渡せる）。登録・挿入は `bai_camera_set`／`bai_camera_keys_apply`。
- テスト：`tests/test_camera_vmd_clip.py`：照明・影・IK 節が無い／件数0／途中で切れる（件数の途中・中身の途中）、IK `n` 過大、末尾の余り 5 バイトで `trailing_bytes`、モーション入り VMD の登録（`skipped.bones>0`）、境界値一致（1e-6）、分割後曲線の一致（1/127 相当）、退避3種、区間内不変、原本 sha256 不変・1ファイル、照明/影/IK の `skipped`、`vmd_truncated`、`to_project_keys` 後の `sample_pose` がブリッジ（縮尺込み）と一致（位置 1e-4、角度 1e-3度）、`s=1` と `s=1.25, o=(0,0.1,0)` の両方、fps 24/30/60、FOV クランプ、`too_many_keys`、`vmd_unsupported`、`VMD_CAMERA_INTERP_ORDER` の JS/Python 一致。
- 完了ゲート：上記＋バイト順検証。実 MMD データの目視は未検証記録。
- 規模：中。**標準モデル可**。

### CAM-002 カメラ類似分類（距離・回転・速度・画角を比較）— WP-14
- 現状：実装なし。
- 設計（読取専用）：`camera_similarity.py`：
  - `features(poses, fps)`：8次元（`dist_mean`, `dist_range`, `yaw_total`, `pitch_mean`, `roll_absmax`, `speed_mean`, `speed_max`, `fov_mean`）。距離・速度は**シーン単位**（同じプロジェクト内の比較なので縮尺に依存しない）。1姿勢のときは速度・変化量 0。
  - `distance(a,b)`：固定スケール（距離 10、角度 180度、速度 5/s、fov 90度）・**固定重み1**。重み UI は作らない。
  - `rank(query, items, limit=20)`（同距離は ID 順）、`cluster(items, threshold=0.25)`（単連結、ID 順で決定的）。
  - 対象：プリセット・クリップ（`s=1` で変換したシーン姿勢、`scale_source` を結果に付記）・ショット。
  - UI：「似ているものを探す」→近い順と各次元の差。「グループに分ける」で閾値入力。**自動でタグ付け・削除・並べ替えをしない**。
- API・MCP：`POST /api/camera/similarity` 本文 `{query:{kind, id}, mode:'rank'|'cluster', threshold?, project?}` → `{ranked|clusters, features}`。MCP `bai_camera_similarity`。
- テスト：`tests/test_camera_similarity.py`：同一入力で0、既知値、決定性、1姿勢の速度0。
- 完了ゲート：UI・API・両MCP同順位。実クリップは未検証記録。
- 規模：小〜中。**標準モデル可**。

### CAM-003 キーフレーム・カーブ編集（位置/回転/距離/FOV）— WP-05

> **注記（2026-10-20 追記。承認済み本文は変更していない）**：パイロット（表示中の画面をそのまま撮影カメラとして動かす）と、Scene View のカメラギズモ操作によるオートキーの要求が追加された（`RIG_EDITING_SPEC_20261020_JA.md` §3.2・§3.3 参照）。これは Phase E の承認済み設計（本書 CAM-006 設計6・操作設計 §2「Scene View は撮影キーを変えない」）の例外になるため、**まだ組み込まれていない**。組み込むには本書の改訂とレビューが要る。それまで WP-05・WP-06 の実装は本節以下の承認済み内容のまま進める。

- 現状：キー追加・削除・ドラッグ・Undo/Redo（上限80）。UI の補間3種（`#interpolation`）。保存は15モード対応済み。グラフエディタなし。`easingPresets` 上限64。
- 設計：
  1. 補間選択を15モードに（表示名：`linear` 線形、`hold` 保持、`smooth` 滑らか（旧互換）、`bezier` ベジェ（既定曲線）、`sine` サイン、`quad` 2次、`cubic` 3次、`quart` 4次、`quint` 5次、`expo` 指数、`circ` 円、`back` バック（行き過ぎあり）、`bounce` バウンド（行き過ぎあり）、`elastic` 弾性（行き過ぎあり）、`custom` カスタム）。
  2. **トラック別補間** `trackInterpolation:{position?, target?, fov?, roll?, fStop?, focusDistance?}`（値は15モード名）、`trackCustomCurve:{トラック名:[x1,y1,x2,y2]}`（`custom` のトラックは必須）。キー詳細の「トラック別に設定」スイッチ（既定 OFF）。`sampleKeys`／`sample_pose` はトラックごとに `trackInterpolation[track] ?? interpolation`。hold 規則もトラック単位。`roll` トラックは WP-06 以降に有効（WP-05 では受理のみ、`roll` 自体が無いので影響なし）。
  3. **カーブエディタ** `camera_curve_editor.js`（Canvas 2D、UMD `window.BAICameraCurveEditor`）：custom のみハンドル2つ（x 0≤x1≤x2≤1、y −2〜3）。ドラッグ中プレビュー、離して1 Undo、Esc 取消、数値入力4つ。登録カーブ（`easingPresets`、上限 **100**、適用はコピー・遡及しない）。
  4. 派生値（注視点までの距離、ヨー/ピッチ）の表示と数値編集：`target` 固定で `position` を球座標再計算（`d=position−target`、`yaw=atan2(d.x,d.z)`、`pitch=asin(d.y/|d|)`）。
  5. Undo：上限80。すべて1操作1件。
- API・MCP：専用 API なし。`bai_camera_keys_merge`（`fields:{interpolation, customCurve, trackInterpolation, trackCustomCurve}`）、`bai_camera_set`（`easingPresets`）。
- テスト：parity にトラック別・custom。`tests/test_camera_curve_editor.cjs`（クランプ・単調性・Esc）。`tests/test_camera_easing_presets_limit.py`（100可・101で400）。Playwright：`back` でスクラブ→`/api/camera/sample?normalized=1` と一致、カーブのドラッグ1回で Undo 1件。
- 完了ゲート：4経路で同じキー、保存往復、SwiftShader でのドラッグ。
- 規模：中〜大。**標準モデル可**。

### CAM-004 カメラ矩形フレームと被写体見切れ検出 — WP-15
- 現状：球・8頂点 AABB 判定（`camera_framing.js`、`camera.js:23-34`）。三分割線は CSS で常時表示（`camera.css` `.camera-frame::before/::after`）。
- 設計（判定ロジックを増やさない）：
  1. 文言は事実のみ（はみ出し方向と量 %）。既存「構図の良否は判定しません」を維持。
  2. 補助表示（セーフフレーム90%・ヘッドルーム目安）は**任意 ON/OFF、初期 OFF**。保存は workspace `framing.guides`。**三分割線は現行どおり常時表示のまま変えない**（ON/OFF を足さない。未要求の変更をしないため）。
  3. テンプレートの aspect は補助線の縦横比（`#framing-aspect`）だけを設定。出力解像度・撮影カメラは変えない。
  4. 遮蔽・輪郭は承認範囲外。
- API・MCP：JS のみ。WebMCP `bai_camera_framing_state`（`transport:'browser'`、scope `camera_page`、ハンドラー `BAICameraDebug.framingState`、読取）。標準MCP非対応（制限明記）。
- テスト：Playwright：補助表示 ON/OFF で撮影キー不変、補助線は `.camera-frame` オーバーレイだけ、三分割線が常時表示のまま、文言に良否語なし。
- 規模：小。**標準モデル可**。

### CAM-005 焦点距離・F値・ピント距離＋フォーカス契約＋E-FOCUS-01/02 — WP-04
- 現状（確認済み）：`#focus-lens`（8–300）・`#focus-aperture`（0.7–32）・`#focus-distance`（0.01–100000）はキーと無関係な画面値。レンズプリセット適用（`camera.js:215-224`）は FOV をキーへ、mm/F を画面値へ。JS 診断は光軸深度・厳密許容 0.01（`camera_focus_consistency.js:18`）、ガイド位置 face (0,2.4,0)（`camera_focus_consistency.js:3`、正規化モデルの高さ 2.0 を超えている）、Python は3D距離（G-07）。範囲診断は上限10,000（`camera.js:78`、`camera_focus.py:36`）。Scene View に焦点面1枚と対象マーカー（`camera_3d.js:186-202`）。合焦追従は `#focus-follow-bone`＝`focus_tracking.enabled`、追従点はカメラ追従ボーン、追従中は `#focus-distance` を書き換える（G-15）。
- 設計：
  1. **値の出所（1か所ずつ）**：
     - `focalMm = verticalFovToFocal(有効 FOV, 24)`。有効 FOV＝`previewPose.fov`（現在フレームでプレビュー中）→ なければ有効姿勢（シーケンス・VMD 追従を含む）の FOV。FOV > 112.62° なら表示は「<8mm」（§0.2）。
     - `fNumber = previewPose.fStop ?? sample_pose.fStop`（既定 4.0）。
     - `focusM`：追従 ON → 追従点（下記3）の光軸深度（`focusSource:'tracking'`。追従点が `fallback_bbox` なら `focusSource:'tracking_fallback'`。解決不能なら `null`・`unknown`）。追従 OFF → `previewPose.focusDistance ?? sample_pose.focusDistance`（`focusSource:'preview'|'key'|'default'`）。
     - 範囲：焦点距離入力 **8〜274mm**、F値 0.7〜64、合焦距離 0.01〜10000（シーン単位）。`camera_dof.js` の焦点距離範囲も 8–274 に（2-m2）。
  2. **入力と自動キーの規則（2-B4、フォーカス設計 §5「自動キーON/OFFに従う」に準拠）**：
     - プレビューの置き場所：`camera.js` の `previewPose` を `{position, target, fov, roll?, fStop?, focusDistance?}` に拡張（現行と同じく `setFrame` で破棄）。`evaluateOptics`・DOF・色分けは現在フレームでは `previewPose` を優先。
     - 対象となる入力：焦点距離（`#focus-lens`・10段選択・ラベル付きレンズプリセット）→`fov`、F値（`#focus-aperture`）→`fStop`、合焦距離（`#focus-distance`、追従 ON 中は読取専用）→`focusDistance`、「対象にピントを合わせる」の［確定］→`focusDistance`、レンズプリセットは `fov`＋`fStop` を同時に。

     | 状態 | 自動キー ON | 自動キー OFF |
     |---|---|---|
     | 現在フレームにキーあり | `mergeKey` でそのキーの該当フィールドだけ更新（1 Undo） | `previewPose` に入れる（「未確定」表示）。［キー化］で `mergeKey`（姿勢＋プレビュー中のレンズ値、1 Undo） |
     | 現在フレームにキーなし | 新規キー（1 Undo）。中身は下記「新規キーの規則」 | `previewPose` に入れる。［キー化］で新規キー（同じ規則） |
     | キー以外が姿勢を決めている（シーケンスのショット区間内、または VMD 追従 ON） | **キーに書かない**。`previewPose` にも入れず、「ショット／VMD 表示中はキーを編集できません（該当区間外で編集してください）」を表示 | 同左 |
     - **新規キーの規則（3-m17）**：`position`・`target`・`fov`（・WP-06 以降は `roll`）は有効姿勢（＋今回の入力）から書く。`fStop`・`focusDistance` は、**今回の操作でユーザーが編集したフィールド**か、**`sample_pose` の値がキー由来**（`focusDistanceSource:'key'`、`fStop` はプロジェクトのいずれかのキーが `fStop` を持つ）のときだけ書く。どちらでもなければ書かない（既定値 4.0 をキーに固定しない＝後で既定が変わっても追従する）。
     - ［キー化］は既存の `#key-save`（現在フレームへキー保存）を使い、`previewPose` のレンズ値も含めて書く（現行は位置・注視点・FOV のみ）。
     - テストモード ON/OFF・診断・範囲診断はキーも `previewPose` も変えない。
  3. **追従対象と評価対象（2-B4・3-B2）**：
     - **追従対象**（焦点距離を決める1点、project に保存）：`focus_tracking.target`（§2.3、`marker` は `bone|face|eyes|chest|hips|full`）。無ければカメラ追従ボーン（現行動作、G-15）。`marker:'eyes'` のとき `eye:'nearest'`（既定。両眼のうち光軸深度が小さい方）／`left`／`right`。点の解決は §2.6.2 の表。
     - **評価対象**（診断する点、workspace `focusTest` に保存）：`targetMarker`（`face|eyes|chest|hips|full|bone|pick`）＋`boneName`＋`pickPoint`。`eyes` は両眼を評価し最悪値（下記4）。
     - **全身**（`full`）：包囲箱中心（フォーカス設計 §2「全身中心」）。
     - **手動ピック**（`pick`、フォーカス設計 §2）：Camera View で［対象を指定］を押してからモデルをクリックすると、レイキャストの交点（シーン単位のワールド座標）を `focusTest.pickPoint` に保存する（撮影キーは変えない、1操作は Undo 対象外の設定変更）。**固定点であり、モデルのアニメーションに追従しない**ことを対象名の横に表示する。交点が無ければ「モデルがありません」。追従対象には使えない（固定点のため）。
     - **ボーン欠落時の代替（3-B2(a)、フォーカス設計 §2・操作設計 §7 に準拠）**：§2.6.2 で「包囲箱」欄があるマーカー（`hips`・`chest`・`face`・`bone`）は、ボーンが見つからなければ**包囲箱中心（の該当高さ）へ代替**し、`target_source:'fallback_bbox'` と警告 `bone_missing` を付けて、UI に「ボーン『○○』が無いため包囲箱中心で代替中」を必ず表示する。代替した点の分類は計算するが、**`in_focus`（合焦近傍）には分類しない**（`in_focus` の条件を満たしても `acceptable` とし、警告 `fallback_no_in_focus` を付ける。偽の合焦成功を返さない＝契約ゲート4）。追従対象が代替点のとき、`focusM` はその代替点の深度（`focusSource:'tracking_fallback'`）。
     - **代替できないとき**：眼（`eyes`・`left`・`right`）は代替しない。眼が解決できなければ `class:'unknown'`・`reason:'bone_missing'`（`eye:'nearest'` で片眼だけ解決できたときはその眼を使う）。包囲箱も得られない（samples に `bbox` が無い）ときも `bone_missing`。追従対象が解決不能なら `focusM:null`（`#focus-distance` の値で代用しない）。
     - **モデル未読込（3-B2(d)）**：すべての対象が `class:'unknown'`・`reason:'model_not_loaded'`。ガイド位置（正規化モデル高さ 2.0 に合わせて **face (0,1.8,0)・chest (0,1.45,0)・hips (0,1.0,0)・full (0,1.0,0)**、`camera_focus_consistency.js:3` の値を修正）での推定は追加フィールド `guideEstimate:{point, depthM, class}` にだけ入れ、`class` には反映しない。UI は「モデル未読込：ガイド位置での参考値」として灰色で併記する。
     - **画面外（3-B2(c)）**：対象ごとに `inFrame`（撮影カメラの縦 FOV と Camera View の縦横比で、点の正規化デバイス座標 `|x|≤1` かつ `|y|≤1`、かつ深度 > 0）。`false` なら分類は計算したうえで警告 `out_of_frame` を付け、UI に「画面外」と表示（フォーカス設計 §4「視野外は警告を併記」）。
     - 保存先の理由：追従対象は撮影結果（焦点）を決めるショットデータなので project、評価対象は診断表示の設定なので workspace。
  4. **唯一の評価関数** `BAICameraCore.evaluateOptics(input) → OpticsResult`：
     - 入力：`{frame, contentVersion, pose:{position,target,fov,roll}, aspect, lens:{fStop, focusDistance, focusSource}, tracking:{enabled, point|null, source:'bone'|'fallback_bbox'|null, reason?}, targets:[{name, point|null, source:'bone'|'bbox'|'fallback_bbox'|'pick'|null, reason?}], modelLoaded, guidePoints?, settings:{circleOfConfusionMm, strictToleranceM}, modelTransform:{s, o}|null}`。
     - 出力：
       ```json
       {"frame":120,"contentVersion":37,
        "lens":{"focalMm":50.0,"fNumber":2.8,"focusM":3.2,"focusSource":"key","cocMm":0.03},
        "dof":{"nearM":2.9,"farM":3.57,"hyperfocalM":29.8},
        "targets":[{"name":"eye_l","depthM":3.25,"errorM":0.05,"class":"acceptable","target_source":"bone","inFrame":true,"warnings":[]},
                   {"name":"eye_r","depthM":3.31,"errorM":0.11,"class":"acceptable","target_source":"bone","inFrame":true,"warnings":[]}],
        "worst":{"name":"eye_r","class":"acceptable","errorM":0.11},
        "physical":{"focusM":2.56,"nearM":2.32,"farM":2.86,"depthM":2.65,"reason":null},
        "guideEstimate":null,
        "class":"acceptable","reason":null,"warnings":[]}
       ```
     - **単位（2-B1）**：`depthM`・`focusM`・`nearM`・`farM` などは**シーン単位**で計算・分類する（キー・姿勢と同じ単位）。`physical` は `s` が分かれば各値 ÷ `s`、分からなければ各値 `null`・`reason:'scale_unknown'`。薄レンズ式は縮尺に対して不変ではないため、シーン単位での分類は「正規化モデル上の近似」であることを UI に注記する（§9 Q5）。
     - 分類：`depth < near` → `near_blur`（マゼンタ）、`depth > far` → `far_blur`（橙）、`|errorM| ≤ strictToleranceM` → `in_focus`（青。ただし `target_source:'fallback_bbox'` は除く）、それ以外 → `acceptable`（緑）、評価不能 → `unknown`（灰＋斜線）。**`errorM = depthM − focusM`（符号付き。正＝対象が焦点面より奥）**（3-m5）。
     - **旧ラベルとの対応（3-m5）**：既存 `camera_focus_consistency.diagnose` の `classification` と `GET /api/camera/focus` の `classification` は互換のため旧ラベルのまま返し、新しい `class` を併記する。`front`→`near_blur`、`focus`→`in_focus`、`within`→`acceptable`、`back`→`far_blur`、（新設）`unknown`→`unknown`。`inside` は `class` が `in_focus` か `acceptable` のとき true。
     - `unknown` の理由：`bone_missing`、`model_not_loaded`、`behind_camera`、`focus_inside_focal`（`focusM ≤ focalMm/1000`）、`invalid_number`。警告（分類は出す）：`fallback_bbox`、`fallback_no_in_focus`、`out_of_frame`。
     - 両眼：`worst` = どちらかが `unknown` ならそれ、そうでなければ `|errorM|` が大きい方。片眼欠落なら全体 `unknown`・`bone_missing`。
     - 既定：厳密許容 **0.02**、CoC 0.03mm。センサー 36×24mm 固定（§9 Q3）。
  5. **全部同じ関数**：色分け・単一診断・範囲診断・DOF プレビュー。`camera_focus_consistency.diagnose` は互換ラッパー。追従中に `#focus-distance` を書き換える現行処理（`camera_3d.js:127`）は削除し、表示は `OpticsResult.lens.focusM` から行う。
  6. **範囲診断（E-FOCUS-02）**：JS で `[start,end]` を `step`（既定 `max(1, ceil((end−start+1)/10000))`、上限 10,000 サンプル）ごとに、撮影に実際に使う姿勢と対象点（`collectSamples('focus', …)` と同じ方法でモデル時刻を合わせる）を評価。200 フレームごとに描画を譲る、キャンセル、進捗は実処理数。結果：逸脱区間（理由別）、焦点面誤差の最小・最大、見失い区間（`bone_missing`・`model_not_loaded`）、代替区間（`fallback_bbox`）、画面外区間（`out_of_frame`）、タイムライン色帯。
  7. **出力（export_report）**：CSV 列 `frame,class,reason,warnings,target,target_source,in_frame,depth_m,focus_m,error_m,near_m,far_m,physical_depth_m,physical_focus_m,focal_mm,f_number,focus_source,camera_source`。JSON `{schema:1, generatedAt, conditions:{start,end,step,cocMm,strictToleranceM,targetMarker,boneName,pickPoint,sensorMm:[36,24],lensModel:'thin_lens',postprocess:'BokehPass'|'none',resolution:[w,h],pixelRatio,rendererScale,renderer,modelTransform}, intervals, samples}`（3-m19：フォーカス設計 §4「使用レンズモデル、ポストプロセス、解像度、レンダラスケールを記録」）。project に保存しない。
  8. **Scene View の焦点面ガイド**：焦点面＋**近点面・遠点面**（遠点が無限なら「∞」）。`showNearFarPlanes`。**`THREE.Layers` チャンネル1**（§2.12）に置き、Camera View・書き出しに映さない。
  9. **「対象にピントを合わせる」**：［合わせる］で現在フレームの評価対象（両眼は `nearest`）の深度を `previewPose.focusDistance` に入れる（プレビュー）。［確定］は §2 の表に従う（自動キー ON → キー更新、OFF → プレビューのまま［キー化］待ち）。［取消］／Esc でプレビュー破棄。追従 ON 中・対象が `unknown`・キー以外が姿勢を決めている間は押せない（理由表示）。対象が代替点（`fallback_bbox`）のときは押せるが、確認文「包囲箱中心（代替）に合わせます」を出す。
  10. **深度カラー表示（2-M12・3-M7）**：Camera View の `viewMode:'color'`。`camera_3d.js` がモデルの全マテリアル（組み込みの `MeshStandardMaterial` 等）に `onBeforeCompile` で、ビュー空間深度 varying と、uniform（`uNear, uFar, uFocus, uStrict, uEnabled`）による5色の混合を注入する（**スキニング・モーフのシェーダー部分はそのまま**）。マテリアルの `customProgramCacheKey` に深度色フラグを加える。
      - **適用範囲**：`render()` の中で **`views[1].renderer.render(world, views[1].camera)`（DOF ON 時は `dofComposer.render()`）の直前に `uEnabled=1`、直後に `uEnabled=0`** にする。Scene View の描画（`views[0]`）は常に `uEnabled=0`。uniform の切替なので再コンパイルは起きない。
      - **深度は撮影カメラのビュー空間**（`views[1].camera` の `modelViewMatrix` で求めた `−mvPosition.z`）。Camera View を描くときのカメラ＝撮影カメラなので、シェーダー内の視点深度がそのまま `OpticsResult` と同じ光軸深度になる。
      - `uNear, uFar, uFocus, uStrict` は毎フレーム `OpticsResult` の値（シーン単位）を入れる。`unknown` 時は `uEnabled=0` のまま灰色の斜線オーバーレイ（DOM）を出す。
      - 書き出し・本番映像には使わない。**GPU での正しさは未検証**。左右比較・ブラー差分は F-DOF-01（Phase F）。
  11. **レンダラー状態表示**：`WebGL: 有効/無効・レンダラー: <UNMASKED_RENDERER_WEBGL>・ソフトウェア描画: はい/いいえ・DOF: BokehPass/OFF/利用不可・深度色: 有効/無効`。`getState().renderer` にも同値。
  12. **性能計測（2-M9、契約の GPU 優先方針）**：Playwright で、テスト GLB 再生中の平均フレーム時間（`requestAnimationFrame` 120回）を「効果なし／DOF ON／深度色 ON／両方 ON」で計測し、テスト出力と台帳 `notes` に記録（合否基準なし。SwiftShader の値は GPU 性能を表さないと明記）。**アプリは毎フレームのピクセル読み戻しをしない**。テストの画素確認は `readPixels` ではなく、Camera View 要素の `page.screenshot({clip})`（または `locator.screenshot()`）で取る（3-m10）。
  13. **Python（G-07・G-08）**：`camera_focus.evaluate_optics(input)`（JS と同仕様、parity）。既存 `diagnose`・`diagnose_range` はこれを使う。
  14. **VMD**：F値・合焦距離はサイドカー（CAM-016）。
- API・MCP（WP-04、読取のみ。応答は §2.4 のとおり `{ok,revision,result}` で包む）：
  - `POST /api/camera/focus/evaluate` 本文 `{frame? | start,end,step?, settings, samples?, modelTransform?, report?:'csv'|'json'}` → `{samples:[OpticsResult], intervals, camera_source, target_source, report?}`。samples あり → そのまま評価（`camera_source:'keys_and_sequence'`、`target_source:'samples'`）。samples なし → 保存済みキー（シーケンス適用後、VMD 試験・未保存編集・実ボーンを含まない）で、全対象 `unknown`・`model_not_loaded`、`guideEstimate` にガイド位置での推定、`physical` は `scale_unknown`（`target_source:'guide'`）。上限超過は 400 `invalid_range`。
  - `POST /api/camera/focus/target-preview` 本文 `{frame, samples:[1件], modelTransform?}` → `{focusDistance, depthM, target_source}`（samples なしは 409 `model_not_loaded`。眼が解決不能なら 409 `model_not_loaded` ではなく結果 `focusDistance:null`・`reason:'bone_missing'`）。
  - 既存 `GET /api/camera/focus` は互換で残す（G-07 の定義修正、旧ラベル＋`class` 併記）。
  - MCP（WP-04 は手書き、WP-02c で JSON 化）：`bai_camera_focus_evaluate`（`samples:'browser:focus'`、scope `camera_page`）、`bai_camera_focus_target_preview`（同）。確定 `bai_camera_focus_commit` は WP-02c、設定 get/set は WP-02d。
- テスト：
  - `tests/test_camera_optics.py`＋parity `optics`：焦点面・手前・奥・無限遠境界、mm/m、`focus_inside_focal`、`behind_camera`、両眼最悪値、0.02 境界、`errorM` の符号、旧ラベル対応、`fallback_bbox` は `in_focus` にならない、`out_of_frame`、`model_not_loaded` と `guideEstimate`、`physical`（s=1.25 で ÷1.25、s 不明で `scale_unknown`）。
  - `tests/test_camera_markers.py`＋`tests/test_camera_markers.cjs`：§2.6.2 の対応表（Mixamo・VRM・MMD 名・テスト GLB 名）、L/R の取り違えなし、代替の可否。
  - `tests/test_camera_focus_evaluate_api.py`：samples あり/なし、`model_not_loaded`、上限、CSV 列順、JSON の `conditions` 全項目。
  - `tests/test_camera_lens_input_rules.cjs`：§2 の表の6セル（自動キー×3状態）と新規キーの規則（編集したフィールドだけ／キー由来だけ書く）を純関数 `lensEditAction(state)`（`camera.js` から切り出す）で検証。
  - `tests/test_camera_optics_wiring.cjs`：`contentVersion` 変化後の遅延結果を捨てる。
  - Playwright（テスト GLB）：
    - 契約ゲート1（単一と範囲が同じ `depthM`・`class`）、2（アニメで同フレームに色・数値・DOF 焦点が変わる）、3（VMD 追従切替・順逆スクラブで古い値なし）。
    - **ゲート4（3-B2 と一致させる）**：(i) 追従 ON・追従対象 `bone:'no_such_bone'` → `target_source:'fallback_bbox'`、代替表示あり、`in_focus` にならない (ii) 追従 ON・`eyes` でテスト GLB から眼ボーンを外した版 → `unknown`・`bone_missing`、`focusM:null` (iii) モデル未読込 → `unknown`・`model_not_loaded`、`guideEstimate` が灰色で併記 (iv) 対象がカメラ背後 → `behind_camera` (v) 対象が画面外 → `out_of_frame` 表示。
    - テスト ON/OFF でキー・Undo 不変。自動キー ON/OFF それぞれで焦点距離・F値・合焦距離・［確定］が表どおり。シーケンス区間内で入力が拒否される。近点/遠点面が Scene View にだけある（§2.12）。手動ピックで `pickPoint` が保存されキー不変。
    - **深度色（3-m18）**：条件を固定する。撮影カメラ position (0,1,4)・target (0,1,0)（`roll` なし）、テスト開始前に `POST /api/camera/project` で `{schema:1,fps:30,duration:300,keys:[{frame:0,position:[0,1,4],target:[0,1,0],fov:26.9915,fStop:2.8,focusDistance:3.35,interpolation:'linear'}]}` を保存してからページを開く（キー1つなので全フレームで同じ姿勢・レンズ。`previewPose` は `setFrame` で破棄されるため使わない）。合焦追従 OFF、CoC 0.03・厳密許容 0.02（既定）。この条件で `H≈29.81`・near≈3.016・far≈3.767（シーン単位）。テスト GLB の正面（z=+0.15＋hips の z）は：フレーム0で深度 3.85 → `far_blur`（橙）、フレーム15で深度 3.35 → `in_focus`（青）。Camera View 要素のスクリーンショットの中央 9×9 画素の平均色が、凡例 RGB と各成分 ±40 以内であることを確認する。静止メッシュ（スキニング無視）ならフレーム15でも深度 3.85 のまま橙になるので、フレーム15で青になることが「スキニングで動いた位置に色が付く」ことの確認になる。
    - レンダラー表示に SwiftShader。性能計測が記録される。
- 完了ゲート：契約ゲート1〜5（GPU 実描画は未検証記録＝完成扱いしない）。フォーカス設計 §8 の 1〜6 は自動、7・8 は全実装後の確認。
- **フォーカス設計にあるが WP-04 で作らない項目（3-m19、§9 Q6）**：モデル遮蔽時の半透明・線画切替（§2）、フォーカステスト切替の設定可能なショートカット（§2。ボタンは作る）、操作中（ドラッグ中）のフレーム変更ガード。後送りの既定で進め、最終判定時にオーナーへ提示する。
- 規模：大。**標準モデル可**。実装後の契約適合レビューを高性能モデルで1回。

### CAM-006 パン・ティルト・ロール・自転（固定位置からの向き操作）— WP-06
- 現状：`orbit/dolly/pan/tilt`（Python `camera_move`、JS `moveCamera`）。旧 `pan`・`tilt` の「右」は `[f.z,0,−f.x]`＝**カメラ左**（`bai_camera.py:104`）。2D プレビュー `#preview` の左ドラッグは `orbit(−dx·0.35)`＋仰角 `dy·0.004`、シフト＋左ドラッグは `pan(−dx·0.01)`＋位置・注視点の y に `+dy·0.01`（下へドラッグでカメラが上がる）（`camera.js:22`）。ロールなし。HTTP なし。`applyPose` は `up` を受ける（`camera_3d.js:169`）。
- 設計：
  1. キーに `roll`。描画は `basis()` の `up` を `applyPose` に渡す。
  2. 操作（`bai_camera.camera_move`（**bai_camera.py に置く**）と `camera_core.moveCamera`）。シグネチャ：Python `camera_move(pose, operation, amount, *, prev_right=None) → {position, target, fov, roll}`、JS `moveCamera(pose, operation, amount, {prevRight})`。`amount` −360〜360。
  3. **符号の固定（2-B3）**：基準姿勢 `position (0,1,5)・target (0,1,0)・fov 40・roll 0`（`f=(0,0,−1)`、`right0=(1,0,0)`、`up0=(0,1,0)`）での期待値（parity `move` に全行を入れる）：

     | 操作 | amount | position | target | fov | roll | 備考 |
     |---|---|---|---|---|---|---|
     | `truck` | +1 | (1,1,5) | (1,1,0) | 40 | 0 | **カメラ右 `right0` へ**。`truck(+a) = 旧 pan(−a)` |
     | `pan`（旧・互換） | +1 | (−1,1,5) | (−1,1,0) | 40 | 0 | 現行どおり（カメラ左へ）。結果を変えない |
     | `pedestal` | +1 | (0,2,5) | (0,2,0) | 40 | 0 | ワールド上 |
     | `dolly` | +1 | (0,1,4) | (0,1,0) | 40 | 0 | 現行どおり（前進） |
     | `pan_yaw` | +90 | (0,1,5) | (5,1,5) | 40 | 0 | **カメラ右へ向く**（上から見て時計回り） |
     | `tilt` | +90 | (0,1,5) | (0,−4,5) | 40 | 0 | 現行どおり（**正＝下を向く**） |
     | `orbit` | +90 | (5,1,0) | (0,1,0) | 40 | 0 | 現行どおり（ワールド Y 右手回り、カメラは右側へ回り込む） |
     | `roll` | +30 | (0,1,5) | (0,1,0) | 40 | 30 | `up=(0.5, 0.8660, 0)`（画面上端が右へ） |
     | `zoom` | +10 | (0,1,5) | (0,1,0) | 31.2065 | 0 | 焦点距離 +10mm（32.970→42.970mm）。結果の焦点距離は `[min(8, 現在値), 274]` にクランプ（FOV>112.62° の姿勢から縮めても 8mm へ飛ばない、3-m16） |
     - UI の操作方向（Camera View と 2D プレビュー `#preview` 共通、操作設計 §4）：左ドラッグ右＝`pan_yaw` 正、左ドラッグ上＝`tilt` 負（上を向く）、**Alt＋左ドラッグ＝`orbit`（注視点中心）。向きと係数は現行の `#preview` 左ドラッグと同じ：右へドラッグで `orbit(−dx·0.35)`（カメラは左側へ回る＝被写体をつかんで回す感覚）、下へドラッグで仰角が増える（`+dy·0.004` rad）**（3-M11。オービットの向きは変えない）、中ドラッグ右＝`truck` 正、中ドラッグ上＝`pedestal` 正、R＋ドラッグ右＝`roll` 正、Z＋ドラッグ上＝`zoom` 正、ホイール前＝`dolly` 正、A/D＝`truck` −/＋、E/Q＝`pedestal` ＋/−、W/S＝`dolly` ＋/−（入力欄フォーカス時は無効）。係数は現行どおり：角度 0.35度/px（pan_yaw・orbit）、仰角・tilt 0.23度/px（現行 0.004rad/px）、平行移動 0.01 シーン単位/px。
     - **現行操作からの変化（P10 に記録）**：①`#preview` の左ドラッグ（現行オービット）は**パン/ティルト**に変わり、オービットは Alt＋左ドラッグに移る ②シフト＋左ドラッグは中ドラッグの別名として残す（中ボタンの無い環境のため）。横方向は現行と同じ（右へドラッグでカメラ右へ＝`truck(+dx·0.01)`＝旧 `pan(−dx·0.01)`）だが、**縦方向は逆になる**（現行は下へドラッグでカメラが上がる。新規則は上へドラッグで上がる＝`pedestal(−dy·0.01)`、画面座標 dy は下が正）。
  4. 旧 `pan` は保存・API 互換で残す（UI のボタン表示は「トラック」に統一、ツールチップで旧名を説明）。
  5. 「自転」は CAM-010 の `spin`。
  6. Camera View 割当（操作設計 §4）、ドラッグ中の操作名表示、Esc 取消、pointerup で1キー＝1 Undo（自動キー OFF はプレビュー）。Scene View は UE 方式で撮影キーを変えない。
- API・MCP：`POST /api/camera/move` 本文 `{frame, operation, amount, commit, revision?}`（commit 時 revision 必須、`merge_key`）。MCP `bai_camera_move`。
- テスト：parity（上表全行＋縮退＋§2.2 の roll≠0 `project2d`）。`tests/test_camera_move_ops.py`：旧 `pan`/`tilt`/`orbit`/`dolly` の結果が WP-00a の fixture と同一（回帰）、`truck(+a)==pan(−a)`、`pan_yaw`/`tilt`/`roll`/`zoom` で位置不変。Playwright：CAM-UI-01〜04、CAM-KEY-01〜03、ドラッグ方向と符号（左・Alt＋左・中・シフト＋左の各方向で上表の符号）、`zoom` の下限。
- 規模：中。**標準モデル可**。

### CAM-007 ドリー・トラック・スライダー・ズーム（移動と画角独立）— WP-07
- 設計：rig に任意 `fov_start`・`fov_end`（5–150）。未指定は開始姿勢の FOV で固定（現状互換）。位置は FOV 指定の有無で同一。ドリーズームは CAM-012。「スライダー」＝短い `rail` の UI プリセット（0.3〜2、既定 1、`right0` 方向）。
- テスト：両端の FOV、中間のイージング、位置の独立性。
- 規模：小。**標準モデル可**。

### CAM-008 レール・曲線カメラパス — WP-07
- 現状：`rail`・`curve`（二次ベジェ3点、等速化）・ベイク（linear/smooth、上限2000）・3D ハンドル。
- 設計：
  1. `bake_ease` を15モードに（`custom` は `bake_custom_curve` 必須）。生成キーは `linear`。
  2. **旧 `curve` は現行の意味のまま**。新リグ種 **`spline`**：`rig.spline = {points:[[x,y,z], …](2〜8点), lookAt:[x,y,z]|null}`、既存フィールド `constant_speed` を使う。centripetal Catmull-Rom（α=0.5）、端点複製、ノット間隔 `max(|Pi+1−Pi|^0.5, 1e-4)`、t を区間数で等分、等速化は区間あたり64分割の弧長表。
     - **注視点（3-B3）**：`spline.lookAt` が点なら全フレームその点を見る（ドローン俯瞰など）。`null` なら `rail` と同じく開始姿勢の視線方向を保つ（`target = position + (base.target − base.position)`）。
     - 3D ハンドルで追加（Shift＋クリック、最大8）・削除（Delete、最小2）、ドラッグは rig 設定のみ変更。
  3. 範囲外キーは不変。
- テスト：旧 `curve` の回帰一致、制御点通過（1e-9）、端点で有限、等速化 < 1%、2点＝直線、`lookAt` 固定と `null`（向き保持）。
- 規模：中。**標準モデル可**。

### CAM-009 クレーン・ジブ・ブーム・ドローン — WP-07
- 設計：旧 `crane` は現行の意味のまま。新リグ種 **`jib`**：`rig.jib = {pivot, armLength:[s,e](0.5〜20), elevation:[s,e](−80〜80度), swing:[s,e](度), pedestal:[s,e](−10〜10), lookAt:[x,y,z]|null}`、位置 `= pivot + (0,pedestal,0) + armLength·(cos el·sin sw, sin el, cos el·cos sw)`（`swing=0` は pivot から +Z＝モデル前方側）、注視点は `lookAt`、`null` なら `pivot`。UI プリセット「クレーン」「ジブ」「ブーム」。**ドローン**＝`spline`＋高所の点＋`spline.lookAt` 固定の UI プリセット（バンクなし）。数値はシーン単位。
- テスト：アーム端の球面（1e-9）、旧 `crane` 回帰、swing のみで高さ不変、`lookAt:null` で pivot を見る。
- 規模：中。**標準モデル可**。

### CAM-010 オービット・スパイラル・自転 — WP-07
- 設計：
  1. 旧 `orbit` は現行の意味のまま（`rig.start` が中心、`amount` が総方位角、半径と仰角は開始姿勢から保持。`camera.js:100`、`camera_rig.js:10-17`）。
  2. 任意 `rig.orbit = {radius:[s,e]|null, height:[s,e]|null}`（3-B3）：
     - **`radius` は中心からの水平距離**、**`height` は中心からの相対高さ**（カメラ y − 中心 y）。どちらも `null` なら開始姿勢の値で一定（このとき結果は旧 `orbit` と一致する。回帰テストで確認）。
     - 開始方位は**開始姿勢から導出**：`δ = base.position − start`、`az0 = atan2(δx, δz)`。`startAzimuth` は持たない（v3 の `startAzimuth`・`elevation` は削除）。
     - 位置：`az = az0 + amount·t`、`p = start + (ρ(t)·sin az, hh(t), ρ(t)·cos az)`、`ρ(t)` は `radius` の補間（`null` なら `hypot(δx,δz)`）、`hh(t)` は `height` の補間（`null` なら `δy`）。注視点は `start`。
     - スパイラル＝`radius` か `height` が変化（プリセット「スパイラル上昇」「スパイラル接近」）。
  3. 新リグ種 **`spin`**：`rig.spin = {yaw:[s,e], pitch:[s,e]}`、位置は開始姿勢のまま固定。**yaw・pitch は開始姿勢の向きからの相対角**（3-B3）：開始の方位 `ψ0 = atan2(f0.x, f0.z)`・仰角 `φ0 = asin(f0.y)`（`f0` は開始姿勢の前方）、`ψ = ψ0 − yaw(t)`（**正＝カメラ右へ向く**、`pan_yaw` と同じ符号）、`φ = clamp(φ0 + pitch(t), −89°, 89°)`（**正＝上を向く**。`tilt` と逆符号であることを UI 注記）、`target = position + |base.target − base.position|·(cos φ·sin ψ, sin φ, cos φ·cos ψ)`。`yaw`・`pitch` の範囲は −360〜360・−178〜178（クランプ後の絶対仰角が ±89 以内）。
  4. 「オービット」と「自転」は別ボタン・別アイコン。
- テスト：radius・height 固定（`null`）で旧 `orbit` と一致（1e-9）、radius 固定で水平距離一定、height 固定で高さ一定、スパイラル両端、`amount` の符号（+90 でカメラが右側へ回り込む＝§CAM-006 の `orbit` と同じ）、spin で位置不変、pitch のみでヨー不変、pitch 正で target.y 増加、yaw 正でカメラ右へ向く、開始の向きが斜めでも相対で動く。
- 規模：小〜中。**標準モデル可**。

**CAM-007〜010 共通（WP-07、3-B3）**
- **ベイク関数**：Python `camera_rig.py`（新規、JS `camera_rig.js` の移植＋拡張、parity `rig`）に
  `bake(rig: dict, from_frame: int, to_frame: int, step: int, base_pose: dict) -> list[dict]`。
  - `rig` は `validate_rig` 済みの保存形。`from_frame < to_frame`、`step ≥ 1`、生成数 ≤ 2000（超過は `ValueError` → 400 `too_many_keys`）。保存形の `bake_from`・`bake_to`・`bake_step` は**UI の入力欄の既定値**で、関数は引数の値を使う。
  - `base_pose = {position, target, fov, roll?}`（開始姿勢）。UI は現行どおり `previewPose || sample(frame)`、HTTP は `sample_pose(project, base_frame ?? from_frame)`。
  - 各フレーム `t = ease(bake_ease, (frame − from)/(to − from), bake_custom_curve)`（`smooth` は現行の `t·t·(3−2t)` と同じ）。出力キー `{frame, position, target, fov, interpolation:'linear'}`（`fov` は `fov_start/fov_end` があればその補間、無ければ `base_pose.fov`。`roll` は `base_pose.roll` があればそのまま。数値は 1e-6 に丸め）。最後のフレームは必ず `to_frame`。
  - JS は `BAICameraRig.bakeRig(rig, fromFrame, toFrame, step, basePose)` を同仕様で追加し、既存 `bake(base, opts)` は互換のため残す（`bakeRig` を呼ぶラッパー）。
- **リグ種ごとのフィールドと保存フィールドの対応**（`camera_rig_store.validate_rig` は旧6種の必須項目を変えない。新3種は種別ブロックが必須で、`start/control/end` は任意＝あれば3要素ベクトル検査のみ）：

| type | 保存フィールド（必須） | 意味 | 任意の追加 | 位置 | 注視点 |
|---|---|---|---|---|---|
| `orbit` | `start, control, end, constant_speed, show_path, bake_from, bake_to, bake_step, bake_ease`（`amount` は省略時 0、`camera_rig_store.py:18`） | `start`＝中心、`amount`＝総方位角（度、±360）、`control`・`end` は未使用（値は保持） | `orbit{radius,height}`、`fov_start/end`、`bake_custom_curve` | 上記 CAM-010 | `start` |
| `crane` | 同上（`crane_from_angle` は省略時 0） | `start`＝支点、角度 `crane_from_angle→amount`（ワールド X 軸回り） | `fov_start/end`、`bake_custom_curve` | 現行 `crane` | `base.target` |
| `rail` | 同上 | `start→end` を直線 | 同上 | 現行 `rail` | 開始の視線方向を保持 |
| `curve` | 同上 | `start, control, end` の二次ベジェ、`constant_speed` | 同上 | 現行 `curvedRail` | 開始の視線方向を保持 |
| `parent` | 同上 | `start`＝支点、`end`＝総平行移動、`amount`＝総ヨー | 同上 | 現行 `parentTransform` | 変換後の注視点 |
| `follow` | 同上 | ベイク対象外（現行どおり別経路の追従ベイク） | — | — | — |
| `jib` | `jib`, `constant_speed, show_path, bake_from, bake_to, bake_step, bake_ease` | `jib` ブロック（CAM-009） | `start/control/end`、`fov_start/end`、`bake_custom_curve` | CAM-009 | `jib.lookAt` か `pivot` |
| `spline` | `spline`, 同上 | `spline` ブロック（CAM-008）、`constant_speed` を使う | 同上 | CAM-008 | `spline.lookAt` か視線保持 |
| `spin` | `spin`, 同上 | `spin` ブロック（CAM-010） | 同上 | 開始位置で固定 | CAM-010 |

  - `bake_ease` の検査を `linear|smooth` から15モードに広げる（旧データはそのまま有効）。`amount` は新3種では使わない（現行 UI が送っても無視、保存値は保持）。
- `POST /api/camera/rig/bake` 本文 `{rig, from, to, step, base_frame?, project?}` → `{keys, base_frame}`（プレビュー、確定は `keys/apply`）。MCP `bai_camera_rig_bake`。

### CAM-011 被写体追従・複数人自動構図 — WP-08
- 設計：
  1. 旧単一形はそのまま。2つ以上のときだけ `bone_follow.targets:[{marker:'face'|'eyes'|'chest'|'hips'|'full'|'hand_l'|'hand_r'|'bone', bone?, weight:0–1}]`（2〜8件）。単一形フィールドも残す（`boneName` は先頭対象）。1件以下になったら `targets` を削除して保存。
  2. マーカー解決：§2.6.2 の対応表（WP-04 で作成）を使う。未解決時の代替も同表どおり（包囲箱欄があるものだけ `resolved:'fallback_bbox'`、操作設計 §7）。フォーカス（CAM-005）も同じ代替規則で、違いは「フォーカスでは代替点を `in_focus` にしない」ことだけ。
     - **単一形の `role`（3-m4）**：`camera_follow_store.ROLES`（現行 `head, neck, chest, hips`、`camera_follow_store.py:3`）と `camera_follow_config.js` の `validFollowConfig` の role 一覧（同じ4つ、`camera_follow_config.js:6`）に **`face, eyes, hand_l, hand_r, full`** を追加する（旧4つは意味を変えない）。`classifyBone` が返す役割名も §2.6.2 に合わせる。
  3. 注視点＝重み付き平均（重み合計0は 400）。「全員を画面に入れる」：`camera_framing.js` に `fitAll(pose, points, opts)`（注視点固定で最小ドリー距離、または位置固定で最小 FOV、二分法）。プレビュー→確定1 Undo。自動で動かし続けない。
  4. 別モデル複数人の実機検証は Phase C 以降（§9 Q1）。
- API・MCP：保存は `bai_camera_set`。WebMCP `bai_camera_follow_fit_all`（`transport:'browser'`、scope `camera_page`、ハンドラー `BAICameraDebug.fitAllPreview`）。標準MCP非対応（明記）。
- テスト：旧データの形不変、新しい role の検証（Python・JS 一致）、重み平均、注視の代替表示、`fitAll`（合成点群、テスト GLB の10ボーン）、bundle 往復。`test_camera_follow_config.mjs`・`test_camera_follow_project.py` に role 追加分。
- 規模：中。**標準モデル可**。

### CAM-012 映画演出カメラ（POV・OTS・Whip・Dolly Zoom・衝撃）— WP-09
- 設計：**Python のみ** `camera_cinematic.py`。UI はプレビュー HTTP→確定でローカル挿入（1 Undo）。`camera_cinematic.js` は使わない。
  - **縮尺（2-B1）**：パラメータの長さ（オフセット・振幅・後方距離など）は**物理 m** で指定し、`modelTransform.s` を掛けてシーン単位にする。samples（＝`modelTransform`）が無い POV・OTS は 409 `model_not_loaded`、Whip・Dolly Zoom・衝撃は `s=1` で計算し `scale_source:'unknown'` を返す。
  1. **POV**：頭ボーン位置＋オフセット（前 0.08m・上 0.02m、×s）、向きは頭ボーンのワールド回転を (0,0,1) に適用した前方（samples の `forward.head`）。頭ボーンのローカル +Z＝モデル前方はモデル依存で**未検証**（テスト GLB は一致）。
  2. **OTS**：被写体 A の肩（無ければ頭から横 0.2m×s）の後方 0.6m・上 0.1m・横 0.35m（×s、左右選択）、注視点は `lookAt`（無ければ A の前方 3m×s）。
  3. **Whip**：`pan_yaw` と同じ符号のヨー回転を `duration`（既定6）で、補間 `expo`、前後 `hold`。`meta.motionBlurHint:true` は結果のみ。
  4. **Dolly Zoom**：`d·tan(θ/2)=一定`、`fov:[s,e]`（5〜150）、`d<0.1×s` は 400 `invalid_range`。
  5. **衝撃**：`duration` 既定12、振幅 位置 0.03m（×s）・ロール 1.0度（上限 0.3m・10度）、`exp(−5t)` 減衰、mulberry32（seed 既定1）、位置は `right0`・`up` 方向、毎フレームキー。
  6. **パラメータ表（3-B3、`params` の全キー。表に無いキーは 400 `unknown_field`）**：長さは物理 m（×s でシーン単位）、角度は度、フレームは整数。

     | type | キー | 型・範囲 | 既定 | 意味 |
     |---|---|---|---|---|
     | `pov` | `offsetForwardM` | −0.5〜0.5 | 0.08 | 頭ボーンから `forward.head` 方向へのずらし |
     | `pov` | `offsetUpM` | −0.5〜0.5 | 0.02 | ワールド上方向へのずらし |
     | `pov` | `lookDistanceM` | 0.1〜100 | 3.0 | 注視点＝位置＋`forward.head`×この距離 |
     | `ots` | `side` | `'left'|'right'` | `'right'` | 被写体 A の右肩越し（モデル自身の右＝−X 側、§0.2）か左肩越し |
     | `ots` | `backM`・`upM`・`sideM` | 0〜5 | 0.6・0.1・0.35 | 肩からの後方・上・横のずらし |
     | `ots` | `lookAt` | `[x,y,z]`（シーン単位）または `null` | `null` | `null` なら A の前方 3m×s |
     | `whip` | `yaw` | `[s,e]`、各 −360〜360 | `[0,90]` | 開始の向きからの相対ヨー（正＝カメラ右、`pan_yaw` と同じ） |
     | `whip` | `duration` | 2〜60 | 6 | 振る時間（フレーム）。`from` から `from+duration` で回し、残りは `hold` |
     | `dolly_zoom` | `fov` | `[s,e]`、各 5〜150 | `[40,20]` | 開始・終了の縦 FOV。距離は `d(t)=d0·tan(fov0/2)/tan(fov(t)/2)`、`d0`＝開始姿勢の注視点距離 |
     | `shake` | `duration` | 1〜600 | 12 | 揺れの長さ（フレーム） |
     | `shake` | `amplitudeM` | 0〜0.3 | 0.03 | 位置の振幅（`right0`・`up` 方向） |
     | `shake` | `amplitudeRollDeg` | 0〜10 | 1.0 | ロールの振幅 |
     | `shake` | `seed` | 0〜2^32−1 の整数 | 1 | mulberry32 の種 |
     | 共通 | （なし） | — | — | 補間は各 type で固定（POV・OTS は開始姿勢の1キー＋追従キー `linear`、whip `expo`、dolly_zoom `linear`、shake 毎フレーム `linear`） |
- API・MCP：`POST /api/camera/cinematic/preview` 本文 `{type:'pov'|'ots'|'whip'|'dolly_zoom'|'shake', from, to, params, base_frame?, samples?, modelTransform?, project?}` → `{keys, meta, scale_source}`。MCP `bai_camera_cinematic_preview`（`samples:'browser:cinematic'`、scope `camera_page`）、確定は `bai_camera_keys_apply`。
- テスト：`tests/test_camera_cinematic.py`：パラメータ表の範囲・既定・未知キー、POV＝頭＋オフセット×s（s=1 と 1.25）、OTS の左右（`side:'right'` でカメラが −X 側）、Dolly Zoom 一定（1e-9）、衝撃の決定性・上限・減衰、Whip の hold、`model_not_loaded`。Playwright：プレビューでキー不変、確定1 Undo。
- 規模：中。**標準モデル可**。

### CAM-013 撮影用途別テンプレートライブラリ — WP-11
- 設計：
  1. `camera_templates.json`（読取専用）。各要素の形と18件の値は付録A（完全な JSON）。長さは**被写体高さ h 基準**（h＝samples の包囲箱高さ。samples 無しは h=2.0＝正規化モデルの高さ、`scale_source:'unknown'`）。
  2. 生成は Python `camera_templates.py`（`camera_cinematic.py`・`camera_rig.py` を呼ぶ）。**テンプレートは `project.rig` を書き換えない**：`kind:'rig'` は付録A の `params` から一時的な保存形 rig（CAM-007〜010 共通の表の形）を組み立てて `camera_rig.bake(rig, from, to, bake_step, base_pose)` を呼び、キーだけを返す。
  3. aspect は補助線の縦横比だけ。`lens` は生成キーの `fov`（focalMm 換算）と `fStop`。
  4. UI：カテゴリタブ→カード。範囲指定→プレビュー（HTTP）→確定（ローカル、1 Undo）。「マイプリセットに複製」（開始姿勢、`category` 付き）。
  5. 新 UI（/workspace/22）も同じ JSON を読む（UI の実装先は §0 の所有者判断に従う）。
- API・MCP：`GET /api/camera/templates`、`POST /api/camera/templates/preview` 本文 `{id, from, to, samples?, modelTransform?, project?}` → `{keys, aspect, lens, scale_source, base:{B, h}}`（B・h は `from` フレームの samples から。付録A）。MCP の preview は `samples:'browser:cinematic'`（`bbox` と頭が入るため）、scope `camera_page`。MCP `bai_camera_template_list`・`bai_camera_template_preview`。
- テスト：JSON スキーマ（18件とも生成可能。POV は samples ありで）、適用→Undo、複製後に元不変、aspect 適用で撮影キー不変、h=2.0 と h=1.6 で長さが比例。
- 規模：中。**標準モデル可**。

### CAM-014 カメラプリセット お気に入り・タグ・検索（JSON/VMDと履歴）— WP-10（JSON）、WP-13（VMD）
- 現状：名前（1〜48）＋姿勢の保存・適用・削除（最大64）。使用中削除は UI で禁止（`camera.js:204`）。
- 設計：
  1. フィールド：§2.3。
  2. 検索：NFKC＋casefold の部分一致（名前・タグ・カテゴリ）、お気に入りのみ、タグ AND。並び：お気に入り→最近使った順→名前。
  3. 履歴：使用履歴20件＋Undo/Redo（版管理なし、§9 Q2）。
  4. 名前変更：同じトランザクションで `sequence[]` の `preset`・`source.name` と `preset_history` を更新。**改名先・`add` の名前が既存と重複したら 409 `name_conflict`**（付録C。自動で「 (2)」を付けるのは `duplicate` と JSON 取込だけ）。
  5. 削除：使用中は 409 `preset_in_use`。
  6. JSON 入出力：`{schema:1, presets}`、重複名は「 (2)」…、64件超は読まずに件数報告。
  7. VMD 入出力（WP-13）：1フレームのカメラ VMD＋サイドカー（`lens`・`tags`・`favorite`・FOV 小数）。取込は付録B（`modelTransform` があれば使う）。
  8. UI：カード・検索・タグチップ・★・複製・改名・JSON（VMD は WP-13）。適用時に `preset_history` 更新（Undo に含めない、dirty にする）。
- API・MCP：`GET /api/camera/presets/search`、`POST /api/camera/presets/manage`（`add|update|rename|delete|duplicate|favorite|tag|untag|import`、revision 必須）、`POST /api/camera/presets/apply`（`merge_key`）。MCP 3種。
- テスト：`tests/test_camera_presets.py`：検索、自動改名（duplicate・import）、改名・add の重複で 409 `name_conflict`、JSON 往復、改名連動、`preset_in_use`、履歴20、上限64。VMD 往復（WP-13）。
- 規模：中。**標準モデル可**。

### CAM-015 カメラ連結・カット・時間同期＋シーケンサー — WP-12（preset）、WP-13（clip・inherit）
- 現状：検証・編集 API・評価 API・MCP・UI（追加/削除/移動/再取得）。UI に update なし。プリセット参照のみ。
- 設計：
  1. ショットの形：preset ショットは旧形 `{start,end,preset,transition:'cut'}`（UI もこの形）、新形 `{start,end,source:{kind:'preset',name},transition:'cut'}` も受理し与えられた形のまま保存。clip ショット（WP-13）`{start,end,source:{kind:'clip',clip,from},inherit?,transition:'cut'}`、`clipFrame = from + (f − start)`、短ければ最終姿勢保持。keys ソースは作らない。
  2. `inherit:true`（clip のみ、preset で true は 400）：直前ショット（接している場合。隙間があれば `start−1` のプロジェクトキー姿勢）の `start−1` の姿勢 P とクリップ最初の姿勢 C0 の差 `Δ=P.position−C0.position` をクリップ全体の `position`・`target` に加える。向き・FOV・ロールは不変。`orientationDeltaDeg` を返し表示。
  3. 瞬時カット、半開区間（既存）、隙間はプロジェクトキー（既存）。
  4. 時間同期：共通タイムライン。音声オフセットは作らない。
  5. UI：ショット帯（色帯・名前・境界ドラッグ・分割・削除・update）、再生中ショット強調。
  6. 評価：`activeShot`（JS）・`evaluate`（Python）を clip 対応（WP-13、parity）。clip 欠損は `{source:'clip_missing', pose:null}`、Camera View はプロジェクトキー姿勢に「クリップ欠損：キー姿勢を表示中」を必ず表示。
  7. CAM-016 はシーケンス適用後をベイク。
- API・MCP（WP-12）：`sequence/edit` に revision（§2.4）。UI でも update。WP-16 で `action:'replace'`。
- テスト：`tests/test_camera_sequence_v2.py`（update、旧形・新形の保存形維持、境界ゼロ遅延、隙間、往復、MCP update と競合）。WP-13：clip 時刻、保持、inherit、`orientationDeltaDeg`、欠損。Playwright：ショット帯ドラッグ1回＝1 Undo。
- 規模：中〜大。**標準モデル可**。

### CAM-016 MMDカメラVMD書出し（FOV・位置・距離・回転・補間）— WP-13
- 現状：ネイティブトラックの往復書出しのみ。ブリッジ・`camera_vmd_local.js` は単位換算なし（G-17）。
- 設計：
  1. **単位と縮尺（2-B1）**：取込・書出・ブリッジ（Python `preview_pose`、JS `camera_vmd_local.preview`）のすべてで付録B の変換（`MMD_UNIT_PER_M=12.5` と `modelTransform` の `s`・`o`）を使う。`preview_pose(track, frame, model_transform=None)`。**既存の試験プレビューの見え方が変わる**（現在は MMD 単位のまま表示しており、正規化モデルに対して約 12.5/s 倍）。コミット本文と `VMD_EXPERIMENTAL_PREVIEW_20261018_JA.md` に記録（P10）。モデル未読込は `s=1, o=0` と「縮尺1で表示」。
  2. `camera_vmd_export.export_project(project, *, start, end, step=1, fps, mode='dense', model_transform=None) → {raw, sidecar, report}`：シーケンス適用後の姿勢（`camera_sequence_api.evaluate` と同じ）を付録B の逆変換で MMD キーへ。
     - フレーム `f_vmd = round(f_project·30/fps)`、重複は先を残し `report.merged_frames`。
     - 距離は負。オイラー角は前キーと ±2π で連続化。
     - 視野角は整数度、[1,180]、`report.fov_round_max_deg`。`perspective=0`。100000 キー超は 400 `too_many_keys`。
     - **`mode:'dense'`（既定）**：`step` ごとのサンプル、補間は線形 `(20,20,107,107)`×6（並びは `VMD_CAMERA_INTERP_ORDER`）。
     - **`mode:'keys'`（キー保持書出し、2-m1）**：範囲内の**全区間**が次を満たすときだけ選べる：補間が `linear`・`bezier`・`custom`（制御点の y がすべて [0,1]）のいずれか、`trackInterpolation` なし、`hold` なし、範囲内にショットなし、`roll` が区間内で ±180 を跨がない。BAI キー1つを VMD キー1つにし、区間（左キー a → 右キー b）の曲線を**到着側キー b** の6チャンネルすべてに入れる（`linear` は `(20,20,107,107)`、`bezier`/`custom` は `round(v·127)`）。条件を満たさなければ 400 `invalid_payload`（理由に最初の違反区間）。**注意**：BAI は位置・注視点を直線補間し、MMD は注視点・回転（オイラー）・距離を補間するため、キー間の経路は一致しない。書出し後の再読込差分（下記6）で最大誤差を必ず表示する。
  3. **サイドカー** `<name>.vmd.bai.json`：`{schema:1, fps, mmdUnitPerM:12.5, modelTransform:{s,o}|null, frames:[{vmdFrame, projectFrame, fov, fStop, focusDistance, focusSource, roll}]}`。**`focusDistance` の値（3-m9）**：そのフレームで合焦追従が OFF ならキー補間値（`sample_pose`）、**追従 ON なら書出しフレームごとに `evaluateOptics` で評価した追従点の距離**（`focusSource:'tracking'`／`'tracking_fallback'`）。追従 ON で samples が無い（標準MCP から samples 無しで呼んだ等）ときは `focusDistance:null`・`focusSource:'unavailable'`、`report.focus_unavailable_frames` に件数を入れて UI に表示する（キー値で代用しない）。読込時にあれば FOV 小数・レンズ値を復元、無ければ「レンズ情報なし」（紛失検出）。
  4. UI：「プロジェクトをVMDに書き出す」（範囲・step・モード。`keys` は条件を満たすときだけ選択可、理由をツールチップ表示）。
  5. 出力先：`data_dir()/camera_exports/<name>.vmd`（＋サイドカー）。既存の `BASE/exports/`（`data_dir()` の外、§2.9）には書かない。`name` は1〜64文字、`/`・`\`・`..` 不可。
  6. 書出し後に自動で再読込し差分（位置 シーン単位と物理 m、角度、FOV）を表示。
- API・MCP：`POST /api/camera/vmd/export-project` 本文 `{start, end, step?, mode?, name, samples?, modelTransform?, project?}`（`samples` は追従 ON 区間の合焦距離用、`focus` 種別） → `{file, sidecar, report}`、`?download=1` でバイナリ。MCP `bai_camera_vmd_export`（`samples:'browser:focus'` で WebMCP は samples と `modelTransform` を付ける。scope `camera_page`。標準MCP は samples 無し＝追従 ON 区間の合焦距離は `null`）。プリセット VMD 入出力 `POST /api/camera/presets/vmd-export`・`vmd-import`。
- テスト：`tests/test_camera_vmd_export_project.py`：**固定試験データ MMD 既定カメラ**（target (0,10,0)、distance −45、rotation 0、fov 30）→ `s=1, o=0` でシーン姿勢 target (0,0.8,0)・position (0,0.8,3.6)・up (0,1,0)・roll 0、`s=1.25, o=(0,0.1,0)` で target (0,1.1,0)・position (0,1.1,**4.5**)（付録B、z＝3.6×1.25）。往復で位置 < 1e-3、角度 < 1e-3度、ロール ±170度、真下（ジンバル）、連続化、FOV 丸め ≤0.5度、サイドカー往復、追従 ON 区間の `focusDistance` が評価値・samples 無しで `null`、fps 24/60、件数。`mode:'keys'`：条件を満たす線形2キーでキー数一致、`hold` を含むと 400、custom の y が 1.2 で 400。
- 完了ゲート：上記＋バイト順検証。MMD 本体での確認・ブリッジ回転順の一致は未検証記録。
- 規模：中。付録B の実装後レビューのみ高性能モデル。

### CAM-017 カメラ衝突回避・構図品質 — WP-15
- 設計（事実検出とユーザーが選ぶ回避案のみ）：
  1. 衝突体：被写体＝samples の各フレーム包囲箱を `margin`（既定 0.05m×s）膨らませたもの。ステージ＝`collision.colliders`（`{name,min,max}`、シーン単位、最大64）＋床（y=0）。メッシュからの自動生成はしない（Phase H）。
  2. 判定：カメラ位置が衝突体内、または表面まで `minDistance`（物理 m、既定 0.2、×s でシーン単位）未満。ニアクリップ 0.1 で被写体にめり込む場合も「近すぎ」。`s` 不明時は ×1 とし `scale_source:'unknown'`。
  3. 出力：区間一覧（開始・終了・種類・衝突体名・最小距離（シーン単位と物理 m））とタイムライン色帯。
  4. 回避案：最近点から外向きに `minDistance` まで押し出した位置をプレビュー、確定で該当キーの `position` のみ（1 Undo）。注視点不変。
  5. 構図品質は CAM-004 の事実を並べるだけ。点数化しない。
- API・MCP：`camera_collision.py`、`POST /api/camera/collision/check` 本文 `{from, to, step?, samples?, modelTransform?, project?}` → `{intervals, fixes, subject_source, scale_source}`（samples 無しはステージ・床のみ、`subject_source:'none'`）。MCP `bai_camera_collision_check`（`samples:'browser:collision'`、scope `camera_page`。確定は `keys/merge`）。
- テスト：`tests/test_camera_collision.py`：内側/近接/外側、床、押し出し後 ≥ minDistance、注視点不変、`subject_source:'none'`、s=1.25 で閾値×1.25。
- 規模：中。**標準モデル可**。

### CAM-018 自動ディレクターとショット選択 — WP-16
- 設計（提案のみ、適用はユーザー確定）。`camera_director.py`。**同じ入力から必ず同じ出力**（3-M14）：
  1. 入力：範囲 `[start, end]`（プロジェクトフレーム、両端含む、長さ `L = end−start+1`）、候補（プリセット・テンプレート・クリップ、与えられた順＝候補順）、ルール `{minShotFrames:45, maxShotFrames:240}`、samples（`director` 種別、§2.6.1）：各被写体・各フレームの §2.6.2 で解決できたボーン（`hips, spine, chest, head, hand_l, hand_r, foot_l, foot_r`）と包囲箱。samples のフレームは `start..end` の全フレーム（欠けたら 400 `invalid_payload`）。
  2. **activity（フレームごと）**：
     - 被写体 i の生の値 `r_i(f)` = 解決できたボーンの速度 `|p(f) − p(f−1)|·fps` の平均（`f=start` は `|p(start+1) − p(start)|·fps`。そのフレームで解決できたボーンが0本なら 0）。
     - 正規化 `n_i(f) = r_i(f) / M`、`M` = 範囲内の全被写体・全フレームの `r` の最大値（`M=0` なら全部 0）。縮尺は割り算で消えるので `s` 不要。
     - 平滑化 `A_i(f)` = `n_i` の**中心 15 フレーム移動平均**（`[f−7, f+7]` を範囲内に切り詰めた区間の平均）。
  3. **主役**：`leader(start)` = `A_i(start)` 最大の i（同値は被写体番号の小さい方）。以後、別の被写体 j が `A_j(f) ≥ A_leader(f) + 0.1` になったフレームで交代（ヒステリシス）。交代したフレーム `f` を**主役交代カット候補**とする。1体なら交代は起きない。
  4. **山と谷**（主役の `A(f) = A_leader(f)(f)` に対して、`N = 15`）：
     - **谷**：`start < f < end` で、`A(f)` が `[f−N, f+N]`（範囲内に切り詰め）の最小値に等しく、かつその区間で同じ最小値を取るフレームのうち最も早いもの。範囲の両端は谷にしない。
     - **山**：同様に区間最大で最も早いフレームのうち、`A(山) − min(A on [山−N, 山+N]) ≥ 0.2` を満たすもの。
     - **山カット候補**：各山 p について、p より前で最も近い谷 v（`v < p`）を候補にする。谷が無ければその山からは候補を作らない。
  5. **カット位置の決定**：主役交代カット候補と山カット候補を合わせてフレーム順に並べ（同じフレームは1つにまとめる。同じフレームでは主役交代を理由に記録）、前から順に、直前のカット（最初は `start`）から `minShotFrames` 以上離れていて、かつ `end + 1 − c ≥ minShotFrames` のものだけ採用する（貪欲法）。採用されたカット `c` は「フレーム c から新しいショット」。
  6. **長すぎるショットの分割**：各ショット `[a, b]`（長さ `len = b−a+1`）が `maxShotFrames` を超えたら、`k = ceil(len / maxShotFrames)` 等分し、境界を `a + floor(j·len/k)`（j=1..k−1）とする（理由 `max_length_split`）。
  7. **ショットサイズ**：主役包囲箱の高さ h と候補カメラ位置から包囲箱中心までの距離 d の比 `d/h`：> 2.5 `wide`、1.2〜2.5 `medium`、< 1.2 `close`（比なので縮尺不変）。候補の位置はショット開始フレームの姿勢。
  8. **スコアと選択**：ショットの代表 activity `a` = そのショット区間の主役 `A` の平均。a ≥ 0.5 → wide +2・medium +1。0.2 ≤ a < 0.5 → medium +2・wide +1・close +1。a < 0.2 → close +2・medium +1。直前のショットと同じ候補 −1。最高点の候補を選ぶ。同点は候補順で先のもの。
  9. 出力：`sequence` 案（各ショットに `reason:'leader_change'|'activity_valley'|'max_length_split'|'range_start'`・`score`・`shotSize`・`activity`）と、途中結果 `{activity:[A(f)], valleys, peaks, candidates}`（テスト・説明表示用）。
  10. UI：ショット帯に半透明表示、「この案を適用」で置換（1 Undo、確認ダイアログ）。
  11. 1体では山と谷だけ。複数人の実機検証は Phase C 以降（§9 Q1）。
- **手計算できる期待例（テスト固定データ）**：1体、`start=0`・`end=299`、activity を samples ではなく関数 `_cuts_from_activity(A, start, rules)` に直接与える。`A(f)` は区分線形：f=0 で 0.5、f=60 で 0.0（谷）、f=100 で 0.8（山）、f=170 で 0.1（谷）、f=220 で 0.9（山）、f=299 で 0.3。→ 谷 {60, 170}、山 {100, 220}（±15 区間の最小との差：f=100 は 0.8−A(85)=0.8−0.5=0.3、f=220 は 0.9−A(205)=0.9−0.66=0.24、どちらも ≥ 0.2。f=0・f=299 は端なので谷・山にしない）、候補 {60, 170}、`min=45` を満たし採用、ショット `[0,59]`（60）・`[60,169]`（110）・`[170,299]`（130）、いずれも ≤240 で分割なし。同じデータで `minShotFrames=120` にすると 60 は不採用（60−0<120）、170 は採用（170−0≥120、300−170≥120）→ `[0,169]`・`[170,299]`。`maxShotFrames=100`（min 45）にすると `[60,169]`（110）は `k=2`・境界 60+floor(110/2)=115、`[170,299]`（130）は `k=2`・境界 170+floor(130/2)=235 → `[0,59]`・`[60,114]`・`[115,169]`・`[170,234]`・`[235,299]`。
- API・MCP：`POST /api/camera/director/propose` 本文 `{start, end, candidates, rules?, samples, modelTransform?, project?}`（samples 無しは 409 `model_not_loaded`）→ `{proposal, debug}`。適用は `sequence/edit` の `action:'replace'`。MCP `bai_camera_director_propose`（`samples:'browser:director'`、scope `camera_page`）。
- テスト：`tests/test_camera_director.py`：上の期待例3通り、移動平均の端の切り詰め、谷・山の同値で最も早いもの、主役交代のヒステリシス（差 0.09 で交代しない・0.1 で交代）、交代と谷が同じフレーム、d/h 境界（2.5・1.2 ちょうど）、スコア表と同点の候補順、決定性（同じ入力を2回）、`replace` の競合。Playwright：適用→Undo。
- 規模：中。**標準モデル可**。

---

## 4. 作業パッケージ（WP）と順番

上から順に実装（前提は必ず上にある WP だけ。循環なし）。

| 順 | WP | 内容 | 対象ID | 前提 | 追加する API・MCP | モデル |
|---|---|---|---|---|---|---|
| 1 | WP-00a | G-01/03/07/08(F値)/11/13/14、`camera_core.js`、`sample_pose`、parity（2D 投影含む）、静的配信、**共通部品**（`bad(...,code)`・`ok/fail`・`camera_errors.py`・`MMD_UNIT_PER_M`） | 全体 | なし | `/api/camera/sample?normalized=1` | 標準 |
| 2 | WP-03 | テスト土台（`bai_paths.data_dir()`、ルート `conftest.py`、three、SwiftShader、テスト GLB、`BAICameraDebug`（`transform`）、ポート）。**注記（P2 v2/v3）**：`bai_paths`・`conftest.py` は P2-WP-00a-1、three・SwiftShader 起動・テスト GLB・`studio-ui` の隔離は P2-WP-00a-2 で実施予定（未実施）。WP-03 に残るのは `BAICameraDebug`（`transform`）・`tests/camera-ui.test.cjs`・ポート 8791 | 全体 | WP-00a | なし | 標準 |
| 3 | WP-04 | CAM-005／E-FOCUS-01/02（G-08 焦点距離、G-15、§2.6.1 samples `focus`、§2.6.2 マーカー対応、§2.12 Layers） | CAM-005 | WP-00a, 03 | `focus/evaluate`、`focus/target-preview`、MCP 読取2種 | 標準＋契約レビュー（高性能1回） |
| 4 | WP-02a | 読込エラー（G-06）・退避・invalid-preview・reset・未知フィールド・FIELD 定数 | 保存 | WP-00a | `project/backup`、`project/invalid-preview`、`project/reset`（**reset は P2-WP-00b で前倒し済み**。P2 設計 v4、3-m6。WP-02a は UI の追加と確認だけ） | 標準 |
| 5 | WP-02b | revision 規則（G-12、`absent`）・If-Match 必須化・本文上限 8MB/16MB・`keys/merge`・`keys/apply`・sequence/edit の revision | 保存 | WP-02a | `keys/merge`、`keys/apply` | 標準 |
| 6 | WP-02c | MCP・WebMCP（G-05、`camera_tools.json`、カメラ画面に WebMCP、bundle MCP、focus_commit） | 全体 | WP-02b, 04 | MCP 一式（§2.5） | 標準 |
| 7 | WP-02d | 統合保存（G-04・G-16、workspace 拡張、素材ID、ジャーナル・recover・起動時掃除、`X-Bai-Camera-Revision`・`X-Bai-Workspace-Revision`、focus-test settings、復旧バナー） | 保存 | WP-02c | `asset-ref`、`bundle/recover`、`focus-test/settings`、MCP 2種 | 標準（ジャーナルのレビューのみ高性能） |
| 8 | WP-12 | CAM-015（preset ショット） | CAM-015 | WP-02d | sequence/edit の応答 revision | 標準 |
| 9 | WP-05 | CAM-003（G-09） | CAM-003 | WP-02d | なし | 標準 |
| 10 | WP-06 | CAM-006（キーとプリセットの `roll`） | CAM-006 | WP-02d | `move`、MCP | 標準 |
| 11 | WP-07 | CAM-007〜010 | CAM-007〜010 | WP-06 | `rig/bake`、MCP | 標準 |
| 12 | WP-08 | CAM-011（role 追加） | CAM-011 | WP-02d, 04 | WebMCP `follow_fit_all` | 標準 |
| 13 | WP-09 | CAM-012 | CAM-012 | WP-06, 07 | `cinematic/preview`、MCP | 標準 |
| 14 | WP-10 | CAM-014（JSON） | CAM-014 | WP-12 | `presets/*`、MCP 3種 | 標準 |
| 15 | WP-11 | CAM-013 | CAM-013 | WP-07, 09, 10 | `templates*`、MCP 2種 | 標準 |
| 16 | WP-13 | VMD 統合（CAM-016・CAM-001・CAM-015 clip・CAM-014 VMD・G-10・G-17） | CAM-016, 001 | WP-12, 10 | `vmd/*`、`presets/vmd-*`、MCP 4種 | 標準＋付録Bレビュー（高性能1回） |
| 17 | WP-14 | CAM-002 | CAM-002 | WP-13 | `similarity`、MCP | 標準 |
| 18 | WP-15 | CAM-004＋CAM-017 | CAM-004, 017 | WP-04, 02d | `collision/check`、MCP、WebMCP `framing_state` | 標準 |
| 19 | WP-16 | CAM-018 | CAM-018 | WP-12, 08, 11, 13 | `director/propose`、`replace`、MCP | 標準 |
| 20 | WP-17 | 片側最大化・分割幅変更 | 横断（UI） | WP-03, 02d | なし | 標準 |
| 21 | WP-18 | 4経路一致の総合テスト・台帳・未検証一覧 | 全体 | 全部 | なし | 標準（最終レビュー高性能1回） |

- WP-04 は WP-02a〜d より前に実装するため、レンズ値の保存は既存の通常保存（`POST /api/camera/project`、If-Match 任意の現行仕様）で行い、`focusTest` 設定の保存・往復テストは WP-02d で追加する。

### 4.1 WP ごとの受け入れ条件
共通：§4.2 の更新テストを含む全テスト合格（§5 のコマンド）、台帳 `implementation_assessment`・`notes` 更新、コミット本文に要件ID・テスト件数・未検証事項・見た目の変化（P10）。

- **WP-00a**：parity 70件以上（2D 投影 roll=0 含む）が JS・Python で合格。`sampleKeys` と `sample_pose` が §2.1 の WP-00a フィールドで一致。`writeKey` で `customCurve`・`fStop` が残る。JS `moveCamera` 旧4種が Python と一致（G-13）。2D プレビューで +X の点が画面右（G-14）。`/api/camera/focus` が光軸深度。F値 64 を入力・保存できる。`bad()` に code を渡すと `error_code` が付き、渡さないと従来形。旧テスト2件が `tests/legacy/`。
- **WP-03**：§2.9 の受け入れ（`s=1`・`o=0`、ボーン位置、L/R の x 符号、データハッシュ不変、ルート `conftest.py` で pytest 全体が一時ディレクトリを使う）。
- **WP-04**：CAM-005 のテスト全部（マーカー対応・代替・画面外・深度色・Layers を含む）、契約ゲート1〜4。ゲート5の保存往復は WP-02d で追加（WP-04 時点は未検証記録）。
- **WP-02a**：§2.7 のテスト全部。
- **WP-02b**：§2.4 の表の全行（428/409、ファイル無しの `absent` 規則、`_revision` 等の無視、sequence/edit の revision 任意と `sequence_conflict` 409）、本文上限、keys/apply の `invalid_range`、keys/merge の `create` 既定 false。
- **WP-02c**：MCP `bai_camera_set` で sequence/rig/presets が消えない（G-05 回帰）、`bai_camera_get` 既定は旧形・`with_revision` で新形、ツール一致テスト、scope 規則（カメラ画面は `both`＋`camera_page` のみ）、`document.currentScript` を await 前に読む、`await` 後に登録、`headers` 対応、browser ハンドラー表。
- **WP-02d**：§2.8 のテスト全部、bundle 保存→再読込→復元で workspace 全項目と camera が一致（Playwright）、423 と recover（前進・復元・`backup:null` の削除）、起動時の掃除、メイン画面の 423 表示とカメラ画面の復旧バナー、`workspace_revision_conflict`、外部変更の再取得が1 Undo。**ゲートの記録事項：VMD 参照・追従状態は WP-13、画面レイアウトは WP-17 で保存する（理由は §2.8-2）。CAM-005 ゲート5の保存往復をここで合格させる**。
- **WP-12 以降**：各 §3 のテスト。WP-07 は旧 `crane`・`curve`・`orbit` の回帰一致。WP-13 は `VMD_CAMERA_INTERP_ORDER` の検証状況を `notes` に記録、VMD プレビューの縮尺変更を記録。WP-17 は §4.3。WP-18 は §8。

### 4.2 WP ごとに更新する既存テスト（2-B2・2-M6）
**方針**：実装を変えたことで成り立たなくなる**ソース文字列テスト**（`read_text()`／`readFileSync` でソースに特定文字列があるかを見るもの）は、同じコミットで**振る舞いテスト**（関数を呼ぶ・HTTP を叩く・Playwright）に置き換える。削除だけはしない。置き換えた旨と理由をコミット本文に書く。値の期待が変わるテストは期待値を更新し、変わった理由を書く。

| WP | 更新する既存テスト（予定） | 理由 |
|---|---|---|
| WP-00a | `test_camera_focus_consistency.cjs`（厳密許容・F範囲）、`test_camera_focus_fail_closed.cjs`・`test_camera_focus_vmd_range.cjs`（`camera.js` の文字列検査）、`test_camera_lens.cjs`（`camera.js`・`camera.html`・`server.py` の文字列、F値 max）、`test_camera_dof.cjs`（`server.py` 静的リストの文字列）、`test_camera_focus.py`・`tests/test_camera_focus_endpoint.py`（3D距離→光軸深度、分類値）、`test_camera_easing.js`（ラッパー化）、`test_camera_lens.js`・`test_camera_lens_shots.js`（`tests/legacy/` へ移動） | G-01/07/08/11/13/14、静的配信、共通部品 |
| WP-03 | `tests/studio-ui.test.cjs`（`BAI_DATA_DIR` で起動するよう変更）、データを直接 `data/` に書く既存 pytest（ルート `conftest.py` 導入で一時ディレクトリへ向くため、`BASE/'data'` を直書きしているものは `data_dir()` 経由に直す）。**注記（P2 v2/v3）**：この行の変更は P2-WP-00a-1・00a-2 で先に行う予定（`tests/legacy-ui-layout.test.cjs` の隔離を含む）。WP-03 では実施済みであることを確認するだけ | データ隔離 |
| WP-04 | `test_camera_focus_overlay.cjs`・`test_camera_focus_update_order.cjs`（`camera_3d.js` の文字列。`visible` 切替→Layers）、`test_camera_3d_focus_contract.py`、`test_camera_focus_tracking.cjs`、`test_camera_focus_tracking_project.py`（`focus_tracking.target` 追加）、`test_camera_dof.cjs`（焦点距離範囲）、`test_camera_focus_consistency.cjs`（ガイド位置 face 2.4→1.8、`class` 併記）、`test_camera_follow_config.mjs`（`classifyBone` の眼・手・足） | G-15、evaluateOptics、深度色、マーカー |
| WP-02a | `test_bai_camera.py`・`test_camera_lens_fstop.py`（`read` の挙動変更、既定値返却の削除） | G-06 |
| WP-02b | `test_camera_project_revision.py`（If-Match 必須化、`absent`）、`test_camera_sequence_api.py`・`test_camera_sequence_edit.py`（409 化、revision）、本文上限を検査している既存テスト（1MB・4MB の期待値を 8MB・16MB に） | G-12、3-M10 |
| WP-02c | `mcp_server.py` を使う既存テスト（無ければ新規のみ）、`test_camera_workspace_contract.py` に関係なし | G-05 |
| WP-02d | `test_bundle_revision.py`（`existing.revision)` の検査は残し、`X-Bai-Camera-Revision` の振る舞いテストを追加）、`test_bundle_snapshot_consistency.py`（ソース文字列→振る舞い）、`test_camera_project_bundle_ui.py`・`test_camera_bundle_preflight.cjs`（文言・イベント）、`test_camera_workspace_contract.py`・`test_project_state_bundle.py`（workspace 緩和）、`test_camera_bone_follow_wiring.py`、`test_camera_sequence_ui.py`（再取得の履歴）。**注記（P2 v2）**：新UIの `studio/js/features/project.js` の `saveProject()` も `X-Bai-Camera-Revision`・`X-Bai-Workspace-Revision` を送り、423 `recovery_pending` で保存を止めるよう直し、`tests/studio-p2-project.test.cjs` に 423 と見出しの検査を足す（P2 設計 §1.3）。また、§2.8 の画面側の規則（`assetRef` の記入、`validateRestore` の緩和、`workspace.frame` の整数化、423 の扱い）は、`camera_project_bundle_ui.js` に直接書かず、P2-WP-06c で作る DOM なしの共有モジュール `camera_bundle_core.js` に入れる（旧 `camera.html` と新UIの `features/project.js` の両方が使う。P2 設計 v3、2-M6）。`test_camera_bundle_core.cjs` に検査を足す。**注記（P2 v4）**：`test_bundle_snapshot_consistency.py` のソース文字列の検査（18行の `camera_project=camera_read`）は、P2-WP-00b で既に振る舞いのテスト（同時の GET と POST で版が一致）に置き換え済み（3-M1）。WP-02d ではその振る舞いのテストに `X-Bai-Camera-Revision` の検査を足す。`assetRef` は新UIのストアの `asset` から作る（3-M8）。workspace の `stage`（P2 B-4）は残す | G-04、G-16、2-M1 |
| WP-05 | `test_camera_interpolation.py`（UI 選択肢）、`test_camera_easing.py`（上限100） | G-09 |
| WP-06 | `test_camera_move.py`（旧4種は不変であることを確認、新操作は新規ファイル）、2D プレビューのドラッグ割当を文字列で検査している既存テスト（左ドラッグ＝オービット、シフトドラッグの縦方向） | 符号表、操作割当（P10） |
| WP-07 | `test_camera_rig.js`、`test_camera_rig_store.py`、`test_camera_rail_handles.py` | rig 拡張 |
| WP-08 | `test_camera_follow_config.mjs`・`test_camera_follow_smoothing.mjs`・`test_camera_follow_project.py` | targets、role 追加 |
| WP-09 | `test_camera_cinematic.js`（JS 版は未使用と明記して残す） | Python 専用化 |
| WP-12 | `test_camera_sequence.py`・`test_camera_sequence_playback.cjs`・`test_camera_sequence_ui.py` | update・新形 |
| WP-13 | `test_camera_vmd_codec.py`（照明等の読み飛ばし）、`test_camera_vmd_bridge.py`・`test_camera_vmd_local.py`・`test_camera_vmd_preview.js`・`test_camera_vmd_playback.py`（縮尺・バイト順定数）、`test_camera_vmd_render_priority.py`・`test_camera_vmd_timeline_wiring.py`（文字列→振る舞い）、`test_camera_vmd.py`・`test_camera_vmd_export.py`（旧 `camera_vmd.py` 用として残す） | G-10/17 |
| WP-15 | `test_camera_framing.cjs`・`test_camera_model_bounds_wiring.py`（セーフフレーム・ヘッドルームの追加。三分割線の期待は変えない） | CAM-004 |
| WP-17 | `test_camera_projection_wiring.py`・`test_camera_html_wiring_recovery.py`（レイアウト変更） | 最大化・分割 |

一覧に無い既存テストが壊れた場合も、同じ方針で同じコミット内に直し、本表に追記する。

### 4.3 WP-17 の詳細
各ペイン右上に片側最大化ボタン（もう一度押すと2画面）、中央スプリッター（ドラッグで分割比 0.2〜0.8、←→ で 0.05 刻み、`role="separator"`・`aria-valuenow`）、幅 950px 以下は上下配置（既存 CSS）でスプリッターも上下。workspace `view:{layout:'split'|'scene'|'camera', splitRatio}` を保存（このWPで `validate_workspace` に追加）。リサイズ中にキー・姿勢不変、`resizeRender` が呼ばれ両 canvas の縦横比が正しい（Playwright、CAM-PERF-01 の一部）。

---

## 5. テスト方針（まとめ）
- 単体：Python `tests/test_camera_*.py` と既存のルート `test_*.py`、Node `tests/test_camera_*.cjs` と既存のルート `test_camera_*.cjs`・`test_camera_*.js`・`test_camera_*.mjs`。
- 照合：parity（§2.2）、ツール定義（§2.5）、静的配信（§2.11）。
- 画面：`tests/camera-ui.test.cjs`（ポート 8798）、`tests/studio-ui.test.cjs`（8799）。SwiftShader、「GPU未検証」記録。
- データ隔離：実 `data/` のハッシュ不変（§2.9）。
- **コミットごとのコマンド**：`npm run typecheck`、`python -m pytest -q`、`node --test tests/test_camera_*.cjs test_camera_*.cjs test_camera_*.js test_camera_*.mjs`、該当 Playwright（`node --test tests/camera-ui.test.cjs`）。`package.json` に `test:camera`（上の node コマンド）と `test:camera-ui` を追加。結果（件数）をコミット本文と台帳に書く。既存の失敗は件名と理由を書き、隠さない。

## 6. 台帳（PHASE_E_IMPLEMENTATION_STATUS.json）の更新ルール
- 各 feature に `notes`（文字列配列、任意）を追加（schema_version 1 のまま）。要素は `"YYYY-MM-DD WP-xx: 内容"`。
- `implementation_assessment`：1〜3文。`evidence_paths`：実装・テストを追加。
- `ui_api_webmcp_stdio_mcp_verified`：WP-18 の4経路一致が通った ID だけ true。
- `real_browser_verified`：実GPU確認済みだけ true（SwiftShader は false、`notes` に記録）。
- `release_complete`：§8 を満たしオーナー確認済みのみ true。

## 7. 新UI（/workspace）との関係
- **決定済み（§0 冒頭）**：UIの実装先（所有者決定 2026-10-20、ROADMAP_JA.md 4183c5f）：P2（新UI `studio/` への移植）を Phase E より先に作業の流れ順で行い、Phase E の UI は新UIのカメラ画面上に実装する。旧画面（camera.html 等）には新機能を足さない。§2・§3 の API・計算・データ・MCP・samples の仕様は変わらない。§3 の UI 項目と各 WP の UI 部分（要素ID、camera.js の関数名、Playwright セレクター、`BAICameraDebug` と WebMCP scope `camera_page` を置く画面、静的配信）は操作と表示の仕様として読み、P2 ⑥（カメラ画面の移植）完了後に §7 へ読み替え表を追加し、その表を高性能モデルで1回レビューするまで UI 部分を実装しない。G-02/03/04/13/14/15/16 のうち camera.js・camera_3d.js・camera.html にある修正は、移植後の新UI側の同等コードに適用する。見た目は新UIモックに従い、WP-17 は新UIモックのカメラ画面レイアウト内で操作設計 §2（片側最大化・幅変更）を満たす。
- §2（API・保存・MCP・計算・samples）と §3 の計算・API・テストの仕様は変わらない。§3 の UI 項目（ボタン・入力欄・表示・操作の割当）は**操作と表示の仕様**として読み、下の読み替え表に従ってSCR-02で実装する。
- 新UIに決まった場合に変わるのは主に：Playwright のセレクター、静的配信リスト（§2.11）、WebMCP の scope `camera_page` を付ける画面、`BAICameraDebug` を置く画面。WP の順番と完了条件は変えない。
- **注記（P2 設計 v2、2026-10-20）**：`docs/roadmap/P2_PORT_DETAILED_DESIGN_20261020_JA.md` で次を決めた。独立した高性能モデルによるレビューは未実施。
  - 「移植後の新UI側の同等コード」は、**動作を変えずに `mount(root)` 化した共有の `camera.js`・`camera_3d.js`**（P2-WP-06a）を指す。`camera.html` と新UIが同じファイルを読むので、G-02/03/04/13/14/15/16 の修正と Phase E の改修は1か所に入る。共有ファイルは `mount(root,{host:'legacy'|'studio'})` で動き（`camera.html` は `'legacy'`、新UIは `'studio'`）、**Phase E が足す新機能は `host==='studio'` のときだけ有効にする**（G-xx のバグ修正は両方に入れる）。新機能のコードは `camera.html` に無い要素について必ず null を確かめて何もしないようにし（P2 K8）、各 WP の完了ゲートに「旧 `camera.html` で pageerror 0件」を加える。§2.9 の `BAICameraDebug.getState().dirty` は、mount の戻り値 `MountHandle.isDirty()` と同じ内部変数（`camera.js` の `dirty`）を読む（P2 設計 v3、2-M5）。
  - **workspace の所有者（フィールド単位、P2 設計 v3 で決定、2-M4）**：`asset`・`clip`・`frame` は新UIのストア（`features/project.js`）が持ち、書く経路は `setWorkspaceFields` だけ（カメラ画面で利用者が変えたときも、ホストがこの関数を呼ぶ）。ストアの変更は `bai-camera-workspace-restore` でカメラ画面に伝える。WP-02d で足すカメラ側のフィールドはカメラ画面が持ち、`camera_bundle_core.js` の `CAMERA_OWNED_WORKSPACE_FIELDS` に列挙する（統合保存ではスナップショットからこの一覧のものだけを取る）。WP-02d ではこの一覧に足すこと。
  - **カメラ単独の保存**（`#save` → `POST /api/camera/project`）は、WP-02d まで新UIのカメラ画面にも残す（P2 O-⑥-2）。統合保存への一本化は WP-02d の後に読み替え表で決める。
- **注記（P2 設計 v4、2026-10-20）**：
  - **通し確認（所有者決定 2026-10-20、P2 設計 §2.9）**：P2 は主要シナリオ（歌ってみた動画の制作）の E2E テスト `tests/studio-p2-e2e-main.test.cjs` を持つ。Phase E の各 WP の完了ゲートに「この E2E を最初から通し、`P2_PORT_STATUS.json` の `e2e_main.furthest_step` が後退しない」を足し、その WP の機能の確認手順を同じファイルに足す（WP-04 フォーカス・DOF、WP-05〜09 カメラワーク、WP-07 カメラレール、WP-12・13 シーケンスとカメラ VMD の入出力、WP-12・16 マルチカメラ）。各 WP の完了時には、所有者向けの5手順以内の確認手順も書く（P2 設計 §3.1）。
  - **`assetRef`**（§2.8）は保存のときに新UIのストアの `asset` から作る。カメラ画面が持つフィールドではない（`CAMERA_OWNED_WORKSPACE_FIELDS` に入れない。P2 設計 3-M8）。
  - **カメラ単独の保存の後**、`camera.js` は無害な通知 `bai-camera-saved` を発火する（P2-WP-06c）。新UIのホストはこれで統合バンドルの版を取り直す。WP-02d で保存を一本化するときも、この通知を残すかどうかを読み替え表で決める。
  - workspace の受け渡しは、**外部からの変更で `asset`・`clip` が違うときだけ** `bai-camera-workspace-restore` を送る。`frame` だけの変化は未保存にしない（P2 設計 3-M6）。WP-02d で足すカメラ側のフィールドも同じ規則に従う。

### 7.1 P2-WP-06d 読み替え表（2026-10-22、現行実装）

`camera.html` の現物124 IDを `tools/camera_id_map.py` で列挙した [`legacy-ids.json`](../../studio/js/camera/legacy-ids.json) が**IDごとの完全な配置表**である。`camera-host.js` はHTMLを読み取り、同じ要素をSCR-02へ一度だけ移す。IDを付け替えないため、§3以降の既存ID指定は下表の配置先にある同名IDを指す。124個の内訳、直接参照するクラス・属性、実ブラウザーでの包含・重複ID検査は [WP-06b要素配置表](P2_WP06_CAMERA_ID_PLACEMENT_JA.md) に記録した。

| Phase Eの記述・旧画面 | SCR-02での対応 | 実装・検証時の読み方 |
|---|---|---|
| `#save`・`#undo`・`#redo` | 上部のカメラ操作（3 ID） | `#save` は当面「カメラだけ保存」。制作状態の［保存］は別の `projectToolbar` から統合保存する。WP-02dの一本化はその段階で再判定する。 |
| ショット・カスタム構図 | 左パネル（17 ID） | `#camera-custom-presets` と `#camera-sequence-editor` を含む既存要素を移す。 |
| `#scene`・`#preview`、素材・クリップ選択 | 中央の撮影ビュー（8 ID） | 2面とも旧 `camera_3d.js` を共有。モデル選択はGLB・VRM・PMX・FBXを扱う。新機能の表示確認は実モデルとGPU環境を区別して記録する。 |
| レンズ、XYZ、FOV、`#key-save`、カメラVMD、状態 | 右の「カメラ」タブ（32 ID） | 旧 `#camera-project-bundle` ボタン群は無効表示し、統合保存は制作状態へ送る。 |
| `#focus-lens`、ボーン追従、合焦・DOF診断 | 右の「フォーカス」タブ（27 ID） | SCR-03はこのタブへのリンク。計算上の診断と実描画DOFを混同しない。 |
| リグ・レール | 右の「レール」タブ（18 ID） | SCR-04/14/15/16は該当タブへのリンク。単一のカメラホストを使う。 |
| `#interpolation` | 右の「補間」タブ（1 ID） | カメラと補間のコードは旧画面と同じ要素IDを使う。 |
| `#track`、再生・コマ送り、範囲、キー操作 | 下部タイムライン（18 ID） | 画面を離れる際はホストを`#keepalive`へ移す。再訪時も同一DOM・同一マウントを使う。 |
| 新しい Phase E 専用UI | SCR-02の対応パネル・タブに追加 | `host==='studio'` でのみ有効にし、旧画面に要素が無いときは安全に何もしない。ID追加時は配置表を再生成し、包含・重複ID検査を更新する。 |

### 7.2 保存・API・自動操作の置き場所

| 旧記述 | 新UIでの対応・境界 |
|---|---|
| `camera.js`・`camera_3d.js`、`BAICameraDebug` | 共有スクリプトを `mount(root,{host:'studio'})` でSCR-02へ一度だけ接続する。`BAICameraDebug` を使うWPはSCR-02で公開し、`dirty` は `MountHandle.isDirty()` と同じ状態を見る。旧 `camera.html` の `host:'legacy'` では新機能を有効にしない。 |
| カメラだけ保存、統合保存 | カメラだけ保存後は `bai-camera-saved` を受け、バンドル版を再取得する。統合保存前はカメラのスナップショットを取り、ストアのworkspaceと `camera_bundle_core.js` で本文を作る。カメラ破損時はマウント・保存を止め、原本と退避を保持する。 |
| workspace の `asset`・`clip`・`frame` | 新UIストアが正本。ホストでの変更は退出時・保存前にストアへ書き、外部の素材変更をホストへ復元する。`frame` だけの変更は未保存にしない。`stage` と `character` も統合保存で保持する。WP-02dでカメラ側のフィールドを追加するときは `CAMERA_OWNED_WORKSPACE_FIELDS` を更新する。 |
| Playwright セレクター、静的配信 | 既存IDはSCR-02内の同名IDへ置き換える。ルートは `/workspace/02`。共有ファイルは従来の静的URLを使い、`camera_bundle_core.js` は旧画面と新UIの両方から読む。 |
| WebMCP `camera_page` | 画面上の操作先はSCR-02。現時点で `webmcp.js` は旧 `camera.html` にもSCR-02にも読み込まれていない。SCR-02への登録と標準MCPとの同等性はPhase Eの各WPで実装・試験する。登録前に新UIで利用可能と表示しない。 |

**ゲート**：124 IDの配置とSCR-02の基本操作はソース・隔離Chrome（SwiftShader）で照合済み。独立した高性能モデルによる本表のレビュー、実GPU/Linux、全実モデルの外観、Owner採用は未検証。Phase EのUI部分は所定のレビューを記録するまで着手しない。各WPでは旧 `camera.html` の `pageerror` 0件とP2 E2Eの到達点非後退を確認する。

## 8. 完了ゲート（Phase E 全体）
1. 18機能と E-FOCUS-01/02 の本書のテストがすべて自動で合格。
2. 4経路で同じ操作・同じ samples が同じ結果（WP-18）。標準MCP の制限（`transport:'browser'` のツール、samples が必要な機能）を一覧で明記。
3. 保存→再起動相当→復元で全状態一致（WP-02d、WP-13 の clip・VMD 追従、WP-17 の view を含む）。
4. テスト GLB で Scene View と Camera View が同一時刻に表示（SwiftShader）。
5. 未検証事項（付録D）をオーナーに提示。**ここで初めてオーナーに動作確認を依頼**。

## 9. 判断に迷ったとき・オーナーへの確認事項
- 迷ったとき：①上位文書 ②本書の最小解釈 ③書いていない機能は作らず「未決」と追記して報告。
- **Q1（既定で進める）**：別モデル複数人の実機検証は Phase C 以降。
- **Q2（既定で進める）**：CAM-014 の履歴は使用履歴＋Undo/Redo。
- **Q3（要確認・既定で進める）**：フォーカス設計 §4 はセンサー幅を変更可能としているが、本書は 36×24mm 固定（FOV が正本のため）。変更可能化はオーナー確認後。
- **Q4（情報）**：12.5 MMD単位/m。VMD 補間バイト順は未検証。
- **Q5（要確認・既定で進める）**：モデル正規化（高さ 2.0）を維持するため、光学計算はシーン単位で行い、物理 m は参考値として併記する。薄レンズの DOF は縮尺に不変でないため、物理 m で分類すべきかはオーナー確認後に決める（変更は `evaluateOptics` の入力単位の切替1か所で済む設計にする）。
- **Q6（要確認・既定で進める、3-m19）**：フォーカス設計（上位文書）にあるが本書で後送りにした項目：①モデル遮蔽時の半透明・線画切替（§2）②フォーカステスト切替の設定可能なショートカット（§2）③操作中（ドラッグ中）のフレーム変更ガード。理由：①②は表示・設定 UI の追加で、UI の実装先（§0）の決定後に作る方が手戻りが少ない。③は操作トランザクション全体の設計が必要。書出しに記録する項目（レンズモデル・ポストプロセス・解像度・レンダラースケール）は安価なので CAM-005 §7 に入れた。
- **Q7（決定済み）**：UI の実装先は新UI（§0、§7、上記）。
- 未承認候補（実装しない）：現時点で無し（ドローンのバンク、CAM-002 の重みスライダー、CAM-015 の keys ソースと音声オフセットは削除済み。三分割線の ON/OFF も入れない）。

---

## 付録A CAM-013 組み込みテンプレート（完全な定義、2-M8）
**座標の約束**：被写体基準点 B＝被写体包囲箱の底面中心（正規化モデルなら原点）。長さの単位は **h（被写体の高さ、シーン単位）**。**B と h は範囲開始フレーム `from` の samples の包囲箱から決め、範囲内で固定する**（3-m22。samples 無しは B=(0,0,0)・h=2.0、`scale_source:'unknown'`）。`startPose.position`・`lookAt`・各点は `B + h·(x,y,z)`（+Z＝モデル前方）。`lookAtMarker` があれば samples のそのマーカー点を注視（無ければ `lookAt` の値、`target_source:'guide'`）。rail の `moveLocal:[右, 上, 前]` は開始姿勢のカメラ基底（`right0`・`up0`・`f`）での移動量（h 単位）。cinematic の長さは CAM-012 の物理 m 指定（×s）。

```json
{"schema":1,"templates":[
 {"id":"fight-impact","category":"fight","name":"インパクト・シェイク","description":"打撃の瞬間に揺れを加える","aspect":"16:9",
  "lens":{"focalMm":35,"fStop":4},"recommendedFrames":[8,24],
  "startPose":{"position":[0,0.55,1.6],"lookAt":[0,0.55,0],"lookAtMarker":"chest"},
  "generator":{"kind":"cinematic","type":"shake","params":{"duration":12,"amplitudeM":0.05,"amplitudeRollDeg":2,"seed":1}}},
 {"id":"fight-orbit","category":"fight","name":"回り込みオービット","description":"被写体の周りを半周回り込む","aspect":"16:9",
  "lens":{"focalMm":28,"fStop":5.6},"recommendedFrames":[60,150],
  "startPose":{"position":[0,0.75,2.2],"lookAt":[0,0.55,0],"lookAtMarker":"chest"},
  "generator":{"kind":"rig","type":"orbit","params":{"center":[0,0.55,0],"amount":180,"orbit":{"radius":[2.2,2.2],"height":[0.2,0.2]},"bake_ease":"sine","bake_step":2}}},
 {"id":"fight-low","category":"fight","name":"ローアングル見上げ","description":"低い位置から見上げる静止構図","aspect":"16:9",
  "lens":{"focalMm":24,"fStop":4},"recommendedFrames":[1,1],
  "startPose":{"position":[0,0.25,1.55],"lookAt":[0,0.72,0],"lookAtMarker":"chest","roll":0},
  "generator":{"kind":"pose","type":"static","params":{}}},
 {"id":"mv-push","category":"mv","name":"スロープッシュイン","description":"ゆっくり前進して寄る","aspect":"16:9",
  "lens":{"focalMm":50,"fStop":2.8},"recommendedFrames":[90,240],
  "startPose":{"position":[0,0.6,2.5],"lookAt":[0,0.6,0],"lookAtMarker":"chest"},
  "generator":{"kind":"rig","type":"rail","params":{"moveLocal":[0,0,0.9],"constant_speed":false,"bake_ease":"sine","bake_step":2}}},
 {"id":"mv-half-orbit","category":"mv","name":"半周オービット","description":"横から反対側の横まで回る","aspect":"2.39:1",
  "lens":{"focalMm":50,"fStop":2},"recommendedFrames":[90,240],
  "startPose":{"position":[-1.9,0.6,0],"lookAt":[0,0.55,0],"lookAtMarker":"chest"},
  "generator":{"kind":"rig","type":"orbit","params":{"center":[0,0.55,0],"amount":180,"orbit":{"radius":[1.9,1.9],"height":[0.05,0.05]},"bake_ease":"sine","bake_step":2}}},
 {"id":"mv-crane-up","category":"mv","name":"クレーン上昇","description":"アームで持ち上げながら見下ろす","aspect":"16:9",
  "lens":{"focalMm":35,"fStop":4},"recommendedFrames":[90,240],
  "startPose":{"position":[0,0.17,2.46],"lookAt":[0,0.55,0],"lookAtMarker":"chest"},
  "generator":{"kind":"rig","type":"jib","params":{"jib":{"pivot":[0,0.6,0],"armLength":[2.5,2.5],"elevation":[-10,35],"swing":[0,0],"pedestal":[0,0],"lookAt":[0,0.55,0]},"bake_ease":"cubic","bake_step":2}}},
 {"id":"horror-pov","category":"horror","name":"主観POV","description":"被写体の目線で見る","aspect":"16:9",
  "lens":{"focalMm":24,"fStop":2.8},"recommendedFrames":[30,240],
  "startPose":{"position":[0,0.9,0.05],"lookAt":[0,0.9,1.0]},
  "generator":{"kind":"cinematic","type":"pov","params":{"offsetForwardM":0.08,"offsetUpM":0.02}}},
 {"id":"horror-pullback","category":"horror","name":"ゆっくり後退","description":"不安を残してゆっくり離れる","aspect":"16:9",
  "lens":{"focalMm":35,"fStop":2},"recommendedFrames":[120,300],
  "startPose":{"position":[0,0.6,1.5],"lookAt":[0,0.6,0],"lookAtMarker":"face"},
  "generator":{"kind":"rig","type":"rail","params":{"moveLocal":[0,0,-1.25],"constant_speed":false,"bake_ease":"quad","bake_step":2}}},
 {"id":"horror-dutch","category":"horror","name":"ダッチアングル","description":"傾けた静止構図","aspect":"16:9",
  "lens":{"focalMm":35,"fStop":2.8},"recommendedFrames":[1,1],
  "startPose":{"position":[0,0.6,1.9],"lookAt":[0,0.85,0],"lookAtMarker":"face","roll":15},
  "generator":{"kind":"pose","type":"static","params":{}}},
 {"id":"arch-slide","category":"arch","name":"等速レール横移動","description":"一定速度で横に流す","aspect":"2.39:1",
  "lens":{"focalMm":24,"fStop":8},"recommendedFrames":[120,360],
  "startPose":{"position":[-1.25,0.6,3.0],"lookAt":[-1.25,0.6,0]},
  "generator":{"kind":"rig","type":"rail","params":{"moveLocal":[2.5,0,0],"constant_speed":true,"bake_ease":"linear","bake_step":2}}},
 {"id":"arch-drone","category":"arch","name":"ドローン俯瞰","description":"高所を曲線で移動しながら見下ろす（バンクなし）","aspect":"16:9",
  "lens":{"focalMm":18,"fStop":8},"recommendedFrames":[150,450],
  "startPose":{"position":[-3,5,4],"lookAt":[0,0.5,0]},
  "generator":{"kind":"rig","type":"spline","params":{"spline":{"points":[[-3,5,4],[0,6.25,3],[3,7.5,4]],"lookAt":[0,0.5,0]},"constant_speed":true,"bake_ease":"sine","bake_step":3}}},
 {"id":"arch-tiltup","category":"arch","name":"ティルトアップ","description":"位置を固定して下から上へ見上げる","aspect":"16:9",
  "lens":{"focalMm":24,"fStop":8},"recommendedFrames":[90,240],
  "startPose":{"position":[0,0.3,3.0],"lookAt":[0,-0.23,0]},
  "generator":{"kind":"rig","type":"spin","params":{"spin":{"yaw":[0,0],"pitch":[0,40]},"bake_ease":"sine","bake_step":2}}},
 {"id":"prod-turntable","category":"product","name":"ターンテーブル","description":"近距離で一周回る","aspect":"1:1",
  "lens":{"focalMm":85,"fStop":5.6},"recommendedFrames":[180,360],
  "startPose":{"position":[0,0.7,0.75],"lookAt":[0,0.5,0]},
  "generator":{"kind":"rig","type":"orbit","params":{"center":[0,0.5,0],"amount":360,"orbit":{"radius":[0.75,0.75],"height":[0.2,0.2]},"bake_ease":"linear","bake_step":2}}},
 {"id":"prod-dollyzoom","category":"product","name":"ドリーズーム","description":"大きさを保ったまま背景の遠近感を変える","aspect":"16:9",
  "lens":{"focalMm":50,"fStop":4},"recommendedFrames":[60,180],
  "startPose":{"position":[0,0.6,2.0],"lookAt":[0,0.6,0],"lookAtMarker":"chest"},
  "generator":{"kind":"cinematic","type":"dolly_zoom","params":{"fov":[27,14]}}},
 {"id":"prod-macro","category":"product","name":"マクロ寄り","description":"至近距離でわずかに前進","aspect":"1:1",
  "lens":{"focalMm":105,"fStop":8},"recommendedFrames":[60,180],
  "startPose":{"position":[0,0.6,0.8],"lookAt":[0,0.6,0]},
  "generator":{"kind":"rig","type":"rail","params":{"moveLocal":[0,0,0.2],"constant_speed":false,"bake_ease":"sine","bake_step":1}}},
 {"id":"sns-bust","category":"sns","name":"縦型バストアップ","description":"縦長画面の胸から上","aspect":"9:16",
  "lens":{"focalMm":50,"fStop":2.8},"recommendedFrames":[1,1],
  "startPose":{"position":[0,0.9,1.0],"lookAt":[0,0.85,0],"lookAtMarker":"face","roll":0},
  "generator":{"kind":"pose","type":"static","params":{}}},
 {"id":"sns-dollyin","category":"sns","name":"縦型ドリーイン","description":"縦長画面で前進して寄る","aspect":"9:16",
  "lens":{"focalMm":35,"fStop":2.8},"recommendedFrames":[60,180],
  "startPose":{"position":[0,0.7,2.0],"lookAt":[0,0.7,0],"lookAtMarker":"chest"},
  "generator":{"kind":"rig","type":"rail","params":{"moveLocal":[0,0,0.6],"constant_speed":false,"bake_ease":"cubic","bake_step":2}}},
 {"id":"sns-whip","category":"sns","name":"縦型ウィップ","description":"素早く横に振る","aspect":"9:16",
  "lens":{"focalMm":28,"fStop":4},"recommendedFrames":[6,30],
  "startPose":{"position":[0,0.6,2.5],"lookAt":[0,0.6,0]},
  "generator":{"kind":"cinematic","type":"whip","params":{"yaw":[0,90],"duration":6}}}
]}
```

- `kind:'pose'`：`startPose` をそのまま1キー（`roll` を含む）。
- `kind:'rig'`：`startPose` を開始姿勢 `base_pose`（`fov` は `lens.focalMm` から換算、`roll` は `startPose.roll`）とし、`params` から保存形 rig（CAM-007〜010 共通の表）を組み立てて `camera_rig.bake(rig, from, to, bake_step, base_pose)` を呼ぶ。位置・点は `B + h·(…)`、長さ（`radius`・`height`・`armLength`・`pedestal`・`moveLocal`）は h 倍してシーン単位。角度はそのまま。組み立て規則（`project.rig` は書き換えない）：
  - 共通：`constant_speed`（params に無ければ false）、`show_path:false`、`bake_from:from`、`bake_to:to`、`bake_step`、`bake_ease`。
  - `orbit`：`start = B + h·center`、`control = end = start`、`amount`、`orbit = {radius: h·radius, height: h·height}`。**`height` は中心からの相対高さ、`radius` は水平半径**（CAM-010）。開始方位は `startPose.position` から導出（`startAzimuth` は持たない）。各テンプレートの `startPose.position` は `center` から水平距離 `radius[0]`・相対高さ `height[0]` の位置にしてある（fight-orbit：(0,0.75,2.2)−(0,0.55,0)＝高さ 0.2・半径 2.2。mv-half-orbit：(−1.9,0.6,0)−(0,0.55,0)＝高さ 0.05・半径 1.9、開始方位 −90°から +180°で反対側 +90°へ。prod-turntable：高さ 0.2・半径 0.75）。
  - `rail`：`start = startPose.position`（B+h 換算後）、`end = start + h·(moveLocal[0]·right0 + moveLocal[1]·up0 + moveLocal[2]·f)`（`right0`・`up0`・`f` は開始姿勢の基底）、`control = start`。
  - `jib`：`jib = {pivot: B + h·pivot, armLength: h·armLength, elevation, swing, pedestal: h·pedestal, lookAt: B + h·lookAt | null}`。`startPose.position` はアーム式の t=0 の位置と一致させてある（mv-crane-up：(0,0.6,0)+2.5·(0, sin(−10°), cos(−10°))＝(0,0.166,2.462)、表記は小数2桁）。スキーマテストで差 ≤ 0.01h を確認。
  - `spline`：`spline = {points: B + h·各点, lookAt: B + h·lookAt | null}`。`startPose.position` は `points[0]`。
  - `spin`：`spin = {yaw, pitch}`（**開始の向きからの相対角**、CAM-010）。arch-tiltup は開始時に約 −10°（下向き）を見ており、`pitch:[0,40]` で終了時に約 +30°（上向き）。
- `kind:'cinematic'`：`startPose` を開始姿勢、`params` を CAM-012 の引数に渡す（長さは CAM-012 の物理 m×s で、h 倍しない）。prod-dollyzoom の `fov[0]=27` は `lens.focalMm=50`（26.99°）に合わせてある。
- スキーマ検証で全18件について `id` 一意、`category` 6種、`aspect` 4種、`focalMm` が10段選択または 8〜274、`fStop` 0.7〜64、`recommendedFrames[0] ≤ [1]`、組み立てた rig が `validate_rig` を通る、`kind:'rig'` の `startPose.position` が t=0 の生成位置と 0.01h 以内、`cinematic` の `params` が CAM-012 の表どおり。

## 付録B MMD カメラ座標変換（コードで確認した式＋縮尺。MMD 実機との一致は未検証）
**定数**：`k = MMD_UNIT_PER_M = 12.5`、モデル縮尺 `s`・オフセット `o`（§0.2、未読込は `s=1, o=0`）。

**取込（現行 `preview_pose`・`camera_vmd_local.preview` の回転部分と同一。WP-13 で単位・縮尺を追加）**
- 入力：注視点 `c`、回転 `(x,y,z)`（ラジアン）、距離 `d`、`fov`。
- `_rotate_xyz` はベクトルに X→Y→Z の順で回転（`camera_vmd_bridge.py:14-21`）。`R = Rz(z)·Ry(y)·Rx(x)`：
  ```
  R = [[cz·cy, cz·sy·sx − sz·cx, cz·sy·cx + sz·sx],
       [sz·cy, sz·sy·sx + cz·cx, sz·sy·cx − cz·sx],
       [−sy,   cy·sx,            cy·cx          ]]
  ```
- `v = R·(0,0,d)`、`u = R·(0,1,0)`。Z 反転して物理 m：`T_phys = (cx, cy, −cz)/k`、`P_phys = T_phys + (vx, vy, −vz)/k`。シーン：`target = s·T_phys + o`、`position = s·P_phys + o`、`up = (ux, uy, −uz)`（向きは縮尺の影響なし）。`roll` は §0.2 の逆算。

**書出し（取込の厳密な逆）**
1. シーン姿勢 `(p, t, fov, roll)` から `up`（縮退時は前サンプルの right0）。
2. 物理 m：`T_phys = (t − o)/s`、`P_phys = (p − o)/s`。
3. MMD 空間：`c = (T.x, T.y, −T.z)·k`、`v' = ((P−T).x, (P−T).y, −(P−T).z)·k`、`u' = (up.x, up.y, −up.z)`。
4. `d = −|v'|`、`w = v'/d`（R の第3列）、`u'' = normalize(u' − (u'·w)w)`（第2列）、`r1 = u'' × w`（第1列）。
5. 分解：`y = asin(−R[2][0])`、`x = atan2(R[2][1], R[2][2])`、`z = atan2(R[1][0], R[0][0])`。ジンバル（`|R[2][0]| > 1−1e-9`）：`z` は前サンプル（無ければ0）、`R[2][0]=−1` なら `x = z + atan2(R[0][1], R[0][2])`、`+1` なら `x = −z + atan2(−R[0][1], −R[0][2])`。
6. ±2π で連続化。`fov_vmd = clamp(round(fov),1,180)`、`perspective=0`。

**固定試験データ（MMD 既定カメラ）**：`c=(0,10,0)`、回転0、`d=−45`、`fov=30`。
- `s=1, o=0`：`T_phys=(0,0.8,0)`、`P_phys=(0,0.8,3.6)` → target (0,0.8,0)、position (0,0.8,3.6)、up (0,1,0)、roll 0。カメラは +Z 側から −Z（モデル正面）を見る＝モデル前方 +Z と整合。
- `s=1.25, o=(0,0.1,0)`：target (0,1.1,0)（0.8×1.25＋0.1）、position (0,1.1,**4.5**)（z＝3.6×1.25）。
- 書出しで `c=(0,10,0)`、`d=−45`、回転0に戻る（1e-5）。追加ケース：回転 (0.3,−0.5,0.2)、ロール ±170度、距離 −10、真下（回転 (π/2,0,0)：BAI 側 `right0` の縮退、直前なしで (1,0,0)）、オイラーのジンバル（回転 (0.2,±π/2,0.1)）。ジンバルは角度が一意でないため、往復の比較は角度ではなく再取込した position・target・up（1e-5）で行う。

**未検証**：①ブリッジの回転順・符号・Z 反転と MMD 表示の一致 ②VMD 補間バイト順 ③VMD 視野角が縦 FOV か ④「VMD は物理 1.6m 前後の MMD モデル向けに作られ、ソース GLB/VRM も m 単位」という縮尺の前提。検証は mmd_tools のコード照合またはオーナー提供の実データ。

## 付録C エラーコード一覧（WP-00a で `camera_errors.py` に定数化）

| error_code | HTTP | 意味 | 主な発生箇所 |
|---|---|---|---|
| `revision_required` | 428 | revision が無い | 書込系 |
| `revision_conflict` | 409 | revision 不一致 | 書込系 |
| `camera_revision_conflict` | 409 | bundle 保存時のカメラファイル不一致 | bundle |
| `workspace_revision_conflict` | 409 | bundle 保存・focus-test 設定保存時の workspace 不一致 | bundle・focus-test/settings |
| `sequence_conflict` | 409 | `expected_sequence` 不一致 | sequence/edit |
| `invalid_payload` | 400 | 形・範囲・重複名・条件不成立 | 全般 |
| `unknown_field` | 400 | 未知フィールド（書込） | project・bundle・workspace |
| `invalid_range` | 400 | 範囲・上限・幾何的に不可能 | focus・cinematic・keys/apply・samples 件数 等 |
| `too_many_keys` | 400 | キー上限超過 | keys/apply・VMD |
| `keys_in_range` | 409 | 挿入区間に既存キー | keys/apply |
| `preset_in_use` | 409 | 使用中プリセット削除 | presets/manage |
| `name_conflict` | 409 | プリセット名の重複（改名・add） | presets/manage |
| `not_found` | 404 | 素材・クリップ・テンプレート・退避が無い | 各所 |
| `payload_too_large` | 413 | 本文が上限超過 | 各所 |
| `camera_project_invalid` | 422 | 保存ファイルが読めない | camera 読込・書込 |
| `confirmation_required` | 400 | reset・recover の確認なし | reset・recover |
| `recovery_pending` | 423 | bundle ジャーナル残存 | 全書込系 |
| `model_not_loaded` | 409 | samples が必要なのに無い | focus・cinematic・director |
| `vmd_unsupported` | 400 | 非対応 VMD | VMD |
| `vmd_truncated` | 400 | 節が途中で切れている | VMD |
| `clip_missing` | 409 | クリップ原本が無い／不一致 | VMD・sequence |

結果内の理由コード（`unknown` の理由）：`bone_missing`、`model_not_loaded`、`behind_camera`、`focus_inside_focal`、`invalid_number`、`scale_unknown`、`tmp_missing`（recover）。
警告コード（結果は出す）：`fallback_bbox`（ボーン欠落で包囲箱中心に代替。CAM-005・CAM-011）、`fallback_no_in_focus`、`out_of_frame`、`trailing_bytes`（VMD 末尾の余り）。

## 付録D 未検証事項（Phase E 全実装後にオーナーへ提示する一覧の初期版）
1. 実 GPU での描画（2画面・DOF・深度カラー・焦点面ガイド）と性能。開発環境は SwiftShader のみ。
2. MMD 本体での VMD 読込・書出し、補間バイト順、ブリッジの回転順・符号、視野角の定義、`mode:'keys'` 書出しの見た目。
3. 実 FBX/VRM・実アニメーションでのフォーカス・追従・POV（頭ボーン前方 +Z）。
4. モデル縮尺の前提（ソースが m 単位、VMD が物理 1.6m 前後のモデル向け）と、シーン単位での光学分類（Q5）。
5. 別モデル複数人（Phase C 以降）。
6. センサー寸法変更（Q3）。
7. 実 MMD カメラ VMD クリップでの類似分類。
8. **VRM 0.x の向き（3-m20）**：VRM 0.x のモデルは −Z を向く（VRM 1.0 は +Z）。現行の `loadAsset`（`camera_3d.js:278`）は VRM を GLB として読み、three-vrm の `VRMUtils.rotateVRM0` 等による向きの正規化をしていない。このため VRM 0.x では「モデル前方 +Z・左 +X」（§0.2）が成り立たず、付録A の構図・CAM-012 の OTS の左右・既定カメラが背面を撮る。本書では正規化を追加しない（未承認の変更になるため）。実モデルでの確認と、正規化（読込時に Y 軸 180°回転して `modelTransform` に記録）を入れるかはオーナー確認事項。
9. マーカー対応表（§2.6.2）の名前が実モデル（Mixamo・VRM・MMD 変換モデル）で解決できるか。包囲箱の高さ割合による代替位置の妥当性。
10. 手動ピック点がアニメーションに追従しないことの実用性。
11. Windows 実機での保存・ジャーナル復旧（ディレクトリ fsync 省略、`os.replace` とファイルロック）。開発環境は Linux のみ。
12. 新UI上の Phase E UI の実ブラウザー動作（移植後）。
