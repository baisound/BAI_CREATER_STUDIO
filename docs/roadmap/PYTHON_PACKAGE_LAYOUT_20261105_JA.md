# Python の配置整理（Issue #234、2026-11-05）

## 目的と境界

Owner は直下に混在する Python ファイルを、役割が分かるフォルダで管理するよう指定した。現状は直下に `.py` 157件（テスト56件、起動入口と pytest 設定3件、その他98件）がある。API、保存形式、UI、素材、モデル、利用中のサーバーの動作は変えない。既存の `python server.py 8765`、`python mcp_server.py`、`python tools/*.py` は入口として維持する。実装を `bai_studio/` の機能別パッケージへ、直下のテストを `tests/` へ移す。`server.py`、`mcp_server.py`、`conftest.py` は互換入口・データ隔離設定として直下に残す。

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
