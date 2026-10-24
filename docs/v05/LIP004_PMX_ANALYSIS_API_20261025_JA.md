# LIP-004 登録PMX口モーフ解析API（Issue #175）

## 今回の接続

`GET /api/studio/v05/pmx/morph-analysis?asset_id=<登録素材ID>` は、既存の素材一覧にあり使用可能なPMXだけを対象にする。`server.character_source` の管理下パス照合を通し、ブラウザーから任意のファイルパスを渡さない。応答は素材ID、原本SHA-256 `modelHash`、数値結果SHA-256 `analysisHash`、口パネルの各モーフの型・移動頂点数・中央値/p95・手動確認フラグ、頂点モーフ間の共有頂点/Jaccard比を含む。`model_hash=<既知SHA-256>` を添えた要求は原本が変わると409で拒否する。元PMXは読み取りのみ。

Node helperの結果とファイルを読み直したSHA-256が異なれば、解析中の原本変更として409を返す。出力サイズ、入力300MiB、口モーフ256件、処理時間30秒に上限を設ける。解析は候補であって、モーフ名を母音へ暗黙に割り当てない。

## 試験と範囲

隔離したローカルHTTPサーバーで `python -m pytest -q tests/test_studio_v05_pmx_analysis.py` は1/1成功。頂点移動0.2の既知PMXを登録素材として読み、モデルSHA-256、名前・移動数・中央値、元バイト不変を照合。正しいhash付き200、異なるhash409、未登録ID404、管理下から外れるパス404、余分な/不正な引数400を確認した。前段の実PMX A/Bの読み取り試験は[数値検査](LIP004_PMX_MORPH_MEASUREMENT_20261025_JA.md)。`npm run typecheck`、Python/JS構文、JSON、差分も確認する。

v0.5画面からの手動確認、MorphMapの保存・再読込、VRM、MCP、実プレビューでの強度確定は未接続。実PMX Aの母音モーフはグループ型なので、APIがそのまま自動強度候補を確定できるとは扱わない。
