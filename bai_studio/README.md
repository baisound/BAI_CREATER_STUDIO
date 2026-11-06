# Python コードの配置

`bai_studio` はサーバーと制作機能の実装パッケージです。機能を追加するときは責務に合うフォルダへ置き、`bai_studio.<機能>.<モジュール>` で import します。ルートに新しい実装モジュールを増やしません。

| フォルダ | 主な責務 |
|---|---|
| `core/` | 保存先、診断ログ、共通の運用処理 |
| `assets/` | 素材登録とサムネイル |
| `camera/` | カメラの保存、補間、VMD |
| `motion/` | 骨、BVH、VMD、足とシーン動作 |
| `retarget/` | 骨対応、初期姿勢、VRM変換診断 |
| `projects/` | 作品保存、復元、画面ルーティング |
| `integrations/` | 任意AI連携 |
| `qa/` | 診断・実機確認の設定 |
| `v05/` | 現行制作画面。`assets/`、`timeline/`、`motion/`、`lip/`、`render/`、`imports/` に分ける |

起動入口 `server.py` と `mcp_server.py`、pytest の隔離設定 `conftest.py` はリポジトリ直下です。CLI は `tools/`、Python 試験は `tests/` に置きます。現行の起動コマンドは `python server.py 8765` と `python mcp_server.py` です。移動前後の全154件は[対応表](../docs/roadmap/PYTHON_PACKAGE_FILE_MAP_20261106.csv)、回帰範囲は[構成整理の記録](../docs/roadmap/PYTHON_PACKAGE_LAYOUT_20261105_JA.md)にあります。

`__init__.py` はパッケージ境界だけを示します。内部モジュールの一括再エクスポートはせず、依存先を明示して import してください。`Path(__file__)` から素材や `tools/` を参照する場合は、モジュールの位置ではなくリポジトリ直下を基準にします。テストは `python -X utf8 -m pytest -q` で実行します。
