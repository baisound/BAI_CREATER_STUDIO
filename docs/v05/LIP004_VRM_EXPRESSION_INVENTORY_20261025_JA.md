# LIP-004 登録VRMの表情定義と実バインドの確認（Issue #175）

## 読取契約

登録済みVRM素材IDから管理下原本のみを読み、GLB JSONのVRM 0.x `blendShapeGroups` またはVRM 1.0 `expressions.preset/custom` を検査する。原本hashと解析hashを返し、要求された原本hashとの差、検査中の変更を409で拒否する。0.xの母音プリセット `a/i/u/e/o`、1.0の `aa/ih/ou/ee/oh` を区別する。モーフバインドが実在するmesh/nodeと対象indexを参照し、重みが0.xの0〜100または1.0の0〜1にあるか確認する。名前があっても実バインドが空・0・無効なら5母音を使用可能と表示しない。Closed/Restへの任意の表情名の自動対応はしない。APIは読取専用で原VRMを変更しない。

v0.5の同じ3D制作画面に折りたたみの定義検査を追加した。5母音を「実バインドあり／定義のみ・実変形なし／定義なし／無効なバインドあり」に分け、表情一覧のバインド件数、二値属性、入力・バインド重み範囲を表示する。現段階では定義の確認だけで、VRMの表情操作、対応表保存、動画出力へは適用しない。

形式の母音名とバインド構造は[VRM 0.x仕様](https://github.com/vrm-c/vrm-specification/blob/master/specification/0.0/schema/vrm.blendshape.group.schema.json)、[VRM 1.0公式表情仕様](https://vrm.dev/vrm1/expression/)、[VRM 1.0スキーマ](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/schema/VRMC_vrm.expressions.schema.json)と照合した。

## 検証

`BAI_REAL_MMD_DATA` 指定の `python -m pytest -q tests/test_studio_v05_vrm_expressions.py` は3/3成功。人工VRM0/1で実バインド、欠落、重み0、無効index/重みを分け、隔離HTTPで登録素材限定・原本hash一致200／不一致409・未知ID404・不正クエリ400を確認した。

`node tests/run-guarded.cjs tests/studio-v05-vrm-expression-ui.test.cjs` は隔離Chromeで1/1成功。実VRM 0.x（原本SHA-256 `21130746078bfaf0ce15f3438878381fe995ca14172df380b617ffbd754816c3`）は5母音が実バインドあり、実VRM 1.0（`0ff97e827ca8e9ad1a9db81795366319a478139fc3bc7e524fbb29605dcfee02`）は5つの定義名があってもモーフバインド0件で「実変形なし」と表示した。モデル切替で旧モデルの表示を消し、作品scene revision・表情キーは不変。原VRM2体と監視対象data 7ファイル・exports 0ファイルのハッシュは前後一致。型チェック、Python/JS構文、差分検査も成功。

この検査はVRM表情の実際の描画・合成結果を確認するものではない。VRM表情の手動対応・保存・再読込・プレビュー・出力、別VRMやLinux、WebMCP/標準MCP、統合productionは未実装・未検証。LIP-004全体は未完成。
