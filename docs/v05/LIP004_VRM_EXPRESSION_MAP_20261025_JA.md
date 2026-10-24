# LIP-004 VRM表情の手動対応表（Issue #175）

## 今回接続した範囲

登録済みVRMの表情検査結果を使い、同じv0.5制作画面で A/I/U/E/O/Closed/Rest に表情名と入力重み0〜1を手動で割り当てる。対応表は作品別の `data/studio_v05_vrm_maps/<project_id>.json` に改訂番号付きで原子的に保存し、再読込する。登録素材ID、原本SHA-256、解析SHA-256、表情index・名前・種別を保存して照合する。原本が変わった旧対応表は保持し、`changed` と表示する。モデル本体・scene・表情キーは変更しない。

下書きには定義名だけの表情も記録できる。確定には5母音すべての選択、0より大きい入力重み、有効かつ0より大きいモーフバインドを要求する。VRM 1.0実例は5母音の定義名 `aa/ih/ou/ee/oh` を持つが実バインドが空のため、下書き保存はできても確定できない。画面の無効化に加え、APIでも422で拒否する。Closed/Restは任意で、母音名から自動推定しない。

GET/POST `/api/studio/v05/vrm/expression-map` は既存の作品・登録素材の共通経路を使う。保存時は最新の原本・解析hashと作品改訂番号を照合する。旧版を上書きせず、別hashの版を併存させる。これはv0.5向けの部分保存であり、設計書の統合 `production.lip` journal ではない。

## 検証

- 隔離HTTPと人工VRM: `python -m pytest -q tests/test_studio_v05_vrm_maps.py tests/test_studio_v05_vrm_expressions.py` は4/4成功。下書き・確定・再読込・別作品分離、改訂衝突409、原本/解析hashの変更409、無効結合/重み0の確定422、壊れた保存ファイルの保持を確認した。実VRM原本2体の検査も成功。
- 隔離Chrome: `node tests/run-guarded.cjs tests/studio-v05-vrm-expression-ui.test.cjs` は1/1成功。VRM 0.x原本SHA `21130746078bfaf0ce15f3438878381fe995ca14172df380b617ffbd754816c3` で手動5母音を下書き→確定保存・再検査で復元した。VRM 1.0原本SHA `0ff97e827ca8e9ad1a9db81795366319a478139fc3bc7e524fbb29605dcfee02` では未結合5母音を下書き保存し、画面の確定ボタンが無効、直接API確定も422であることを確認した。scene revision・表情キーは不変。原本2体と監視対象 data 7ファイル・exports 0ファイルの前後hashは一致。
- `npm run typecheck`、Python/JS構文、JSON・差分検査は成功。

実ブラウザは Windows の `C:\Program Files\Google\Chrome\Application\chrome.exe`（154.0.8037.100）。`BAI_TEST_CONCURRENCY=1`、隔離TEMPを使用した。

最初の非guarded Chrome試験は、表情API応答後で対応表GETの画面反映前に状態を確認して失敗した。両方の読込が反映されるまで待つよう試験を直し、guarded試験で成功した。

VRM表情の実描画・一時プレビュー・動画出力、他モデル、Linux、WebMCP/標準MCP、統合productionの耐障害性、Ownerの自然さ採用は未検証。LIP-004全体は未完成。
