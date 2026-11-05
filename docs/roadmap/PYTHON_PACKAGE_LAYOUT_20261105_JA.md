# Python の配置整理（Issue #234、2026-11-05）

## 目的と境界

Owner は直下に混在する Python ファイルを、役割が分かるフォルダで管理するよう指定した。変更前は直下に `.py` 157件（`test_*.py` 56件、`tests_calibration.py` 1件、起動入口と pytest 設定3件、実装97件）があった。API、保存形式、UI、素材、モデル、利用中のサーバーの動作は変えない。既存の `python server.py 8765`、`python mcp_server.py`、`python tools/*.py` は入口として維持する。実装を `bai_studio/` の機能別パッケージへ、直下のテストを `tests/` へ移す。`server.py`、`mcp_server.py`、`conftest.py` は互換入口・データ隔離設定として直下に残す。

| パッケージ | 所有する責務 | 元のファイル群 |
|---|---|---|
| `bai_studio/core` | パス、診断ログ、操作診断、リリースゲート | `bai_paths`、`diagnostic_logging`、`operation_diagnostics`、`phase_b_release_gate` |
| `bai_studio/assets` | 登録素材とサムネイル | `library_assets`、`asset_thumbnails` |
| `bai_studio/camera` | カメラ保存、補間、VMD、API計算 | `bai_camera`、`camera_*` |
| `bai_studio/motion` | 骨・VMD・BVH・足・シーン動作 | `pmx_bones`、`vmd_readback`、`morph_vmd_codec`、`motion_*`、`bvh_*`、`foot_contact`、`dual_foot_plan`、`pose_ik`、`music_dance_project`、`scene_lighting` |
| `bai_studio/retarget` | 初期姿勢、骨対応、VRM、リターゲット診断 | `retarget_*`、`rest_*`、`animated_*`、`world_rest_*`、`vrm_*`、`model_rest_skeleton`、`ai_ik_preview` |
| `bai_studio/projects` | 旧作品の保存・復元と画面ルーティング | `project_state_bundle`、`studio_project_*`、`studio_routes` |
| `bai_studio/integrations` | 任意AI連携 | `bai_ai_manager` |
| `bai_studio/qa` | 実機QA設定 | `qa_capture` |
| `bai_studio/v05` 配下の `assets`、`timeline`、`motion`、`lip`、`render`、`imports` | v0.5の媒体、作品時計、VMD、歌口、出力、旧作品取込 | `studio_v05_*` |
| `tests/` | Python試験と共通fixture | 直下 `test_*.py` と `tests_calibration.py` |

各パッケージに空の `__init__.py` を置く。相互依存を隠す一括再エクスポートは作らない。旧モジュール名を保つ shim を直下へ残すと整理の目的を満たさないため、リポジトリ内の Python import を新しい完全修飾名へ更新する。import 時の別名で既存のローカル変数名は維持する。公開 HTTP/MCP の名前や JSON は変えない。

## 移動時に確認する箇所

1. `__file__` で直下を求める実装（`bai_paths`、`studio_routes`、`retarget_analysis`、`studio_v05_media_render`、`studio_v05_pmx_analysis`、`studio_v05_pmx_morphs`）は、パッケージ移動後もリポジトリ直下の `studio/`、`tools/`、`node_modules/` を指すようにする。
2. `tools/` の Blender 台本や実データ試験が直接読み込むモジュール、文字列の `__import__`、`sys.path`、`importlib.reload` を調べて更新する。実行入口の `server.py` と `mcp_server.py` は直下に残す。
3. 直下テストを `tests/` に移すと `Path(__file__).parent` が変わる。参照先がソース・JS・HTMLならリポジトリ直下へ、同じテストのfixtureなら `tests/` へ向ける。`conftest.py` の実 `data/`・`exports/` の前後ハッシュ検査は維持する。
4. 変更した Python 名を静的検査し、`python -m pytest --collect-only -q` で収集数を比較する。旧名を読み込む残存 import と、旧ルートファイルを参照する試験を検索する。

## 基準と合格条件

変更前の `python -m pytest -q` は Windows Python 3.12 で **955成功、8失敗、22スキップ、64 subtests成功**。失敗7件は cp932 で UTF-8 のソースを `read_text()` した既存試験、1件は `test_v05_timeline_drag_static`。整理の比較には `python -X utf8 -m pytest -q` を用い、失敗・スキップを個別に記録する。変更前の収集数は985件。

整理後は、Pythonの全収集・対象試験、`python server.py` の隔離起動と主要API、標準MCPの `initialize`、Node/ブラウザの結合試験を確認する。実 `data/` と `exports/` の前後ハッシュを照合し、未実施の Windows/Linux・実GPU層を明示する。既存の失敗を今回の成功として扱わない。テストで見つかった新たな移動起因の不具合は修正してから区切る。

Owner の追加依頼で、タイムラインが途中で止まる事象を別途調査・修正する。画面の目盛り30秒と作品の再生区間は別なので、保存クリップ・再生終端・シークを実データで照合する。両作業を検証した後にコミット、版名とタグを決める。既存の `package.json` は `0.0.0-recovery`、画面は v0.5、旧タグは v0.16 系で一致しないため、既存タグ・GitHub Release と公開手順を確認して衝突しない版名にする。合格していない段階に完成タグを付けない。

モデル区分：構成と互換境界の設計は高性能モデル、機械的な移動・import修正は標準モデル、ファイル一覧と静的照合は軽量作業。

## 実施結果（2026-11-06、Issue #234）

- [移動前後の対応表](PYTHON_PACKAGE_FILE_MAP_20261106.csv)に154件を記録した。実装97件は `bai_studio/`、試験57件は `tests/` へ移動した。直下の `.py` は入口とpytest設定の3件だけ。パッケージの案内は [`bai_studio/README.md`](../../bai_studio/README.md)。
- リポジトリ内のPython importと動的 `__import__`、直接実行する `tools/` と `qa/phase_b_gate.py`、`__file__` からのルート解決を更新した。ルートの旧名を import する参照は、`tests/` 内の試験間 import 1件を除き0件。公開HTTP/MCP名、保存形式、素材は変更していない。
- Windows Python 3.12・UTF-8指定で `python -X utf8 -m pytest -q --tb=short`: **965成功、22スキップ、64 subtests成功**。移動前からのタイムライン静的検査の旧引数数は、現行の保存呼出しに合わせて修正した。`compileall`、`npm run typecheck`、隔離データでの `python server.py` の作品一覧GETと `python mcp_server.py` の initialize、`python qa/phase_b_gate.py --help` は成功。
- Windows Node 22.16.0・Chrome 156の `npm run test:node-all`: **504件中444成功、55スキップ、5失敗**。うち1件は移動したAI設定モジュールの旧名参照で修正し、対象試験15件が成功。素材画面33件・動作画面20件は単独で成功し、一括時の各1件タイムアウトは再現しなかった。カメラ試験の8811番は別の開発用Pythonプロセスが占有し、単独でも1件未実行。ペイン配置1件は移動前からの既知失敗。実 `data/` 5ファイルと `exports/` なしの前後ハッシュは一括ゲートと対象再試験で一致。
- Ubuntu WSL Python 3.12.3・Node 26.4.0の全件は、初回にNodeの廃止されたオプションで1件失敗したため試験呼出しを修正した。再実行は接続リセットで1件失敗、**964成功・22スキップ**。当該隔離HTTP試験3件と修正したNode呼出し試験2件は個別に成功。Linux全件の安定完走は未確認。
- 使用中8765番サーバーと共有データは変更していない。実GPU、外部Blender、全CLIの実入力、全Node一括ゲートの無失敗完走は未確認。これらをパッケージ移動の合格と混同しない。

## 実旧作品での追加確認（2026-11-06、PR #235）

`codex/python-layout-20261105` の配置移動後に、Owner の現行 `data/` を読取専用入力として `python -X utf8 tools/legacy_import_real_check.py` を実行した。隔離した一時データとサーバーで、HTTP 適用と Chrome 156 / SwiftShader の取込画面からの適用をそれぞれ確認した。両実行とも R1（原本不変）・R2（取込直後の逆変換）・R3（取消）・R4（ステージ編集後の逆変換）が合格し、原本160ファイル（117.3 MiB）の前後 SHA-256 は一致した。Chrome 実行では取込ダイアログ、タイムライン9クリップ、3D場面2モデルを確認し、ページエラーは0件だった。結果と画像は `D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-06-python-layout-ui/`、HTTP結果は同階層の `2026-11-06-python-layout/` に保存した。

この試験は旧作品取込の一経路とパッケージ移動後の起動を実証する。SwiftShader であり実GPUは未確認。画面の人物は見えず、WP-L8a の L4（カメラ位置）は不合格、L5（人物が見えるか）は「見えない」と目視記録した。巨大なステージの構図に関する #63 の残件であり、Python配置移動の合格に含めない。動作GLBの適用先が未指定の1件も継続して記録した。

## 開発基点更新後の結合確認（2026-11-06）

PR #236（プレビュー終端修正）を取り込んだ `codex/next` を #235 にマージした。競合は `docs/handoff/WORK_STATE.json` のみで、#235 の進行中の作業位置を保持した。統合状態で `npm run typecheck` 成功、隔離Chromeのプレビュー・書き出し範囲試験4件成功（失敗0、スキップ0）。`tests/run-guarded.cjs` の実 `data/` 5ファイル・`exports/` 無しの前後ハッシュは一致。Python全件・Node全件・Ubuntu全件の再完走は、この基点更新後には未実施。

## Node全件の再実行（基点更新後、2026-11-06）

Windows Node 22.16.0 / Chrome 156 で `CHROMIUM_PATH` を指定し `npm run test:node-all` を再実行した。**505件中445成功・55スキップ・5失敗**、`tests/run-guarded.cjs` による実 `data/` 5ファイル・`exports/` 無しの前後ハッシュは一致。失敗は動画取込のポスター待機、カメラ保存競合試験の8811番占有、P2のS7再生確認、v0.5画像ドラッグ配置、既知の共通ペイン配置。8811番は別のClaude一時Pythonサーバー（PID 50712）が使用しており停止していない。

動画取込の失敗項目は試験ファイルを単独実行した際に成功したが、その実行では別の3D素材前面画像試験が画面表示待機で失敗し、同ファイルは32成功・1失敗。S7を含むP2主経路は単独実行で6成功・2スキップ・0失敗、画像ドラッグ配置は単独で1成功・0失敗。各単独試験でも原本ハッシュは一致した。全件ゲートの失敗5件を単独成功へ読み替えず、画面試験の実行順による不安定さと8811番占有、ペイン配置の既知失敗を未解決として保持する。パッケージ移動由来の新たな旧import失敗はこの再実行では観測しなかった。

## Ubuntu全件の再実行（基点更新後、2026-11-06）

Ubuntu WSL、Python 3.12.3で `wsl -d Ubuntu --cd /mnt/d/BAI/BAI_CREATER_STUDIO/_codex_work -- python3 -X utf8 -m pytest -q --tb=short` を実行し、**965成功・22スキップ・失敗0**（95.83秒）。前回の隔離HTTP接続リセットは再現しなかった。ルート `conftest.py` の隔離と実 `data/`・`exports/` 前後ハッシュ検査を含むセッションが終了コード0で完走した。Linuxの実GPU・外部Blender・全CLI実入力は未確認。Node全件の5失敗と混同しない。
