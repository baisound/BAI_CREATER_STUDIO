# v0.5 実素材の形式別登録・見本・再読込（2026-11-04）

対象: `DATA-016/008`、Issue #37/#50/#69、[再構築ロードマップ](../roadmap/V05_REBUILT_ROADMAP_20261102_JA.md)の「次の実施順」2。[11/02の調査](FORMAT_IMPORT_LEGACY_AUDIT_20261102_JA.md)は合成fixtureで登録経路を確かめた。今回は、この PC にある実素材で同じ経路を通した。形式全体の完成判定ではない。

画面の呼び方: ①は最初の制作画面（`/` と `camera.html`）、②は25画面設計の `/workspace/NN`、③は今後の制作画面 v0.5（`/studio/v05`）。この記録の「v0.5」は③を指す。③にはVRM・FBX・GLB動作を直接登録する入口がまだ無いため、③の「モデル・動作を登録 ↗」から②の素材管理 `/workspace/08` を開いて登録する。①は使っていない。（2026-11-04、当初「旧SCR-08」「旧画面」と書いた箇所を②の表記に直した）

## 試験の方法

`tests/studio-v05-real-format-import.test.cjs` は、`BAI_REAL_MMD_DATA` の実素材を読み取り専用で開く。登録名を付けた一時複製を、隔離サーバーの画面から登録する。手順は次のとおり。

1. GLBステージ・WAV・画像・動画を、v0.5素材管理の「画像・音声・動画などを登録」から1件ずつ登録する。
2. v0.5の「モデル・動作を登録 ↗」で②の `/workspace/08`（素材管理）を開き、VRM・FBXモデル・FBX動作・GLB人体動作をまとめて登録する。
3. ②の08で見本の作成が終わるまで待つ。開いたままのv0.5一覧が、再読込なしで見本を表示することを確かめる。
4. 形式ごとに次を照合する。v0.5詳細の見本の種類、「見本なし」「3D未接続」の表示、音声・動画の再生時間、隔離サーバー側の保存ファイルと原本のSHA-256。
5. v0.5を再読込し、同じID・同じ見本URL・同じ詳細表示が戻ることを確かめる。最後に原本のhashを再計算する。

## 形式別の結果

各IDは、今回の隔離サーバーで得たものです。`integrated:` は内容hash、`fbx:` は種類と登録名から決まり、毎回同じになります。`library:` は登録のたびに変わります。

| 形式 | 実素材（原本） | 原本SHA-256（先頭16桁） | 登録経路 → ID | v0.5詳細の見本 | 再読込 | 未対応の表示 |
|---|---|---|---|---|---|---|
| VRM | `integrated_v02/assets/K00_黒狼_バイサウンド.vrm`（28.67 MiB） | `8f882c2c003bf19c…` | ②の `/workspace/08` → `integrated:8f882c2c003bf19c6538.vrm` | ②の08が作った正面画像。キャラクターの全身と色を目視で確認 | 同じID・見本URL・詳細 | 「3D回転表示と実動作はこの詳細欄へ未接続です。」 |
| FBXモデル | `files/6986893f16a496f7ccb0409e.fbx`（Mixamo「Exo Gray」、30.72 MiB） | `78ea07322bc75047…` | ②の `/workspace/08`（モデルA） → `fbx:5acc2fc350d71c8c3d8909dd` | 正面画像は作られる。この時点では**全身が黒い影絵**だった（追補で修正） | 同じ | 同上。容量は「不明」と表示（追補で修正） |
| FBX動作 | `integrated_v02/assets/walk_standard.fbx`（1.92 MiB） | `cb9df56338ce499f…` | ②の `/workspace/08`（モーション） → `fbx:80a89a25fe6da485a653348e` | 「FBX：保存済み見本なし」 | 同じ | 同上 |
| GLB人体動作 | `integrated_v02/assets/Rig_Medium_General.glb`（15動作・スキン付き、0.79 MiB） | `5f725c0f745f3607…` | ②の `/workspace/08`（モーション） → `integrated:5f725c0f745f36078c72.glb` | 「GLB：保存済み見本なし」 | 同じ | 同上 |
| GLBステージ | 所有者のS01 `library_assets/files/a54a7451….glb`（7.19 MiB） | `a54a7451a580eb88…` | v0.5追加画面（ステージ） → `library:…`（毎回変わる） | ②の08が作ったステージ内部の画像。目視で確認 | 同じ | 同上 |
| WAV | 所有者の曲 `library_assets/files/c8506bc6….wav`（50.51 MiB） | `c8506bc68749956b…` | v0.5追加画面（音声） → `library:…` | 音声プレイヤー。長さ 183.91 秒を読めた。32 MiB を超えるため波形見本は作らない（仕様どおり） | 同じ | なし |
| 画像 | `sample_imports_20261021/ready/kenney_platformer_image.png`（CC0） | `8b9865779f60d78d…` | v0.5追加画面（画像） → `library:…` | 原画像 | 同じ | なし |
| 動画 | `sample_imports_20261021/ready/kenney_platformer_demo.mp4`（CC0） | `c974470c51c5148d…` | v0.5追加画面（動画） → `library:…` | 動画プレイヤー（長さ3秒）。②の08が作った代表フレームも一覧に出る | 同じ | なし |
| PMX＋VMD | — | — | 今回の対象外 | [11/02の縦断試験](../roadmap/V05_REBUILT_ROADMAP_20261102_JA.md)で実PMX・実VMDを確認済み | — | — |

完全なSHA-256は下の「原本の不変確認」に示す。

画像と動画は、Kenney の CC0 実ファイルです。所有者の制作物ではありません。v0.5の画面だけで登録した直後は、GLBステージと動画に見本がありません（②の08を開くまで `thumbnailUrl` は空）。v0.5には見本を作る処理が無く、②の `/workspace/08`が一覧を表示したときに作ります。v0.5詳細では、ステージは「保存済み見本なし」と「3D未接続」を表示し、動画はプレイヤーを表示します。

## 直したこと

既存要件 `DATA-016` の範囲で、欠けていた次の2点だけを直した。

1. **②の08が作った見本が、開いたままのv0.5一覧に出なかった。** ②の `/workspace/08`は登録の完了をv0.5へ知らせるが、その後に作る正面画像・ステージ画像・動画の代表フレームは知らせていなかった。そのためv0.5では、見本が作られた後も「保存済み見本なし」と表示されていた。修正前のコードでは新しい試験がこの箇所で失敗することを確かめた。`asset-character-thumbnail.js` と `asset-library-preview.js` は、見本を保存できたときに、登録完了と同じ `bai.studio.assets.changed` を送るようにした。
2. **一覧の更新が重なったときに、登録した素材の選択が失われた。** v0.5の一覧は、取得中に別の更新が来ると、要求を1つにまとめていた。このとき、登録した素材のIDを選び直す要求が捨てられていた。その結果、「素材を追加」の画面が残ったままになった（今回、試験が1回だけこの状態で止まった）。修正後は、明示した選択の要求を優先して保持する。まとめられた側も、実際の更新が終わるまで待つ。さらに、追加画面を開いている間に背景で見本の通知が来ても、入力中の追加画面を詳細表示で上書きしない。

## 試験結果

環境は Windows 11、Chrome 156.0.8078.80（`CHROMIUM_PATH`）、`BAI_TEST_CONCURRENCY=1`。

| 実行 | 結果 |
|---|---|
| `BAI_REAL_GPU=1 BAI_REAL_MMD_DATA=<所有者のdata> node tests/run-guarded.cjs tests/studio-v05-real-format-import.test.cjs` | 1/1 成功を3回。描画器は `ANGLE (NVIDIA GeForce RTX 4070 SUPER Direct3D11, D3D11)` |
| 同じ試験を既定の SwiftShader で | 1/1 成功 |
| 同じ試験を、修正前の3ファイルで | 失敗（v0.5一覧に見本が出ず、60秒で時間切れ）。修正が必要な箇所を試験が捉えることを確認 |
| `npm run typecheck` | 成功 |
| 関連7ファイル（`studio-v05-legacy-import-bridge` `studio-v05-smoke` `studio-p2-assets` `studio-real-asset-visuals` `studio-real-import-samples` `studio-real-stage` `studio-large-glb-guard`） | 45件のうち成功39件・失敗0件・スキップ6件。スキップした6件は実素材のパスを指定して再実行し、5件成功・1件失敗 |

スキップは成功件数に含めない。上の再実行で、6件ともスキップなしで実行した。

失敗した1件は `studio-real-asset-visuals` の「real VMD drives a neutral figure through a real PMX skeleton」です。原因は、実VMD（キラメキのシンフォニー1005.vmd）のShift-JISのボーン名を three.js が読むときに出る警告「unknown char code」10件です。修正前の main でも同じ10件で失敗した。今回の変更とは関係が無い既存の失敗として残す。同じ警告を、縦断試験は許容している。

`run-guarded` は各実行の前後で作業ツリーの `data/` の hash が一致することを確かめた。`studio-real-import-samples` を実行するため、所有者の `sample_imports_20261021/ready` を作業ツリーの `data/`（Git管理外）へ複製した。

## 原本の不変確認

試験の前後で、所有者の data の13ファイルを `sha256sum -c` で照合し、すべて一致した。対象は上の8形式の原本、`library_assets/index.json`、`manifest.json`、`integrated_v02/catalog.json`、回帰試験で使った実PMX・実VMD。所有者のチェックアウト（作業ツリー・ブランチ・未追跡ファイル・data/）は変更していない。

| 原本 | SHA-256 |
|---|---|
| K00_黒狼_バイサウンド.vrm | `8f882c2c003bf19c65386ad3f3e0a1dad45f241a90a745c08cf4574c9de71ef0` |
| 6986893f16a496f7ccb0409e.fbx（Exo Gray） | `78ea07322bc750476f68a286db649f835ca3792e2ece8ced25d8cc6b99ce27f7` |
| walk_standard.fbx | `cb9df56338ce499f3d9d4fe1a0747cb9e825dc87bd497e95a15523c8a33df96b` |
| Rig_Medium_General.glb | `5f725c0f745f36078c7238968cd5c04843cbc6260689eb6e7f5e2bbd7ffdd7ad` |
| S01 ステージGLB | `a54a7451a580eb88df9e6b13308d406cad9000abc72410fd4a006197dd7cae35` |
| キラメキのシンフォニー WAV | `c8506bc68749956b12713631127d22771d8212de99f1e189296ee1c528a39809` |
| kenney_platformer_image.png | `8b9865779f60d78dd0d96fd5cb28ea2abf0d5b39c36fab84c559a365deb16056` |
| kenney_platformer_demo.mp4 | `c974470c51c5148dea84f5f961f2b4135d496ac5f214e5e67c70b311f502ef77` |

確認画像は `D:\BAI\BAI_CREATER_STUDIO\_Claude確認画像\20261104-v05-format\` にある。`gpu\` は実GPUの各形式の詳細（`R`で始まるものは再読込後）、`swiftshader\` は既定描画器での同じ画面です。

## 未解決・未検証

- ~~FBXモデルの見本が黒い影絵になる。~~ 2026-11-04の追補で修正（下記）。
- ~~FBXモデル・FBX動作の容量が「不明」と表示される。~~ 2026-11-04の追補で修正（下記）。
- **v0.5の画面だけでは3D・動画の見本が作られない。** ②の `/workspace/08`を一度開く必要がある。v0.5で作る処理を足すかどうかは、既存要件の範囲を超える可能性があるため判断を残す。
- **動作（FBX/GLB）の見本と3D表示。** ②の `/workspace/08`には動作の3姿勢カードと再生があるが、v0.5詳細は「保存済み見本なし」「3D未接続」と示すだけです。
- **今回試していない形式:** MP3、WebM/OGV動画、JPEG/GIF/WebP/AVIF/BMP画像、GLB小物・エフェクト、PMX ZIP（実素材で②の08から登録）。実素材の有無も、この記録では調べていない。
- **WebMCP・標準MCP・Linux。** 128 MiBを超える大型ステージの見本（自動では作らない仕様）。
- **配置後のタイムライン再生・書き出し。** 形式別の登録・見本・再読込までで、配置後は扱っていない。

モデル区分: 実素材の選定、修正方針、試験設計、記録はすべて高性能モデル（1つの作業の中で、切り替えていない）。

## 2026-11-04 追補：FBXモデルの見本と容量（DATA-016）

**黒い影絵の原因。** `FBXLoader` は、FBXに埋め込まれたテクスチャ画像の読込が終わる前にモデルを返す。Exo Gray を製品と同じ `loadModel` で読むと、直後は8つの材質すべてで `map` に画像が無かった（`version 0`）。約3秒後には、2048画素の画像が入っていた。見本は読込直後に1枚だけ描くため、空のテクスチャを黒として描いていた。材質（`MeshPhongMaterial`）・色空間（sRGB）・ライトは原因ではない。GLB/VRMは、`GLTFLoader` がテクスチャを待ってから返すため、この問題は起きない。

**修正。** `asset-character-thumbnail.js` は、FBXの描画前に、全材質のテクスチャに画像が入るまで最大10秒待つ。PMXの既存の待ち方は変えていない。見つからない外部テクスチャは10秒で打ち切り、そのまま描く。

**容量。** `/api/assets` のFBX項目とPMX/VMD項目には `bytes` が無く、詳細欄に「不明」と出ていた。統合素材と同じく、元ファイルがある場合はその大きさを返すようにした。PMX/VMDは指示の対象外だが、同じ要件・同じ箇所の同じ欠落なので、合わせて直した。`tests/test_asset_thumbnails.py` に、FBX（あり/なし）・PMX・VMDの大きさの試験を追加した。

**確認。** Exo Gray の見本を作り直し、修正前後を `D:\BAI\BAI_CREATER_STUDIO\_Claude確認画像\20261104-v05-format\fbx\` に置いた（`before_ExoGray_*`、`after_ExoGray_*`）。修正前は全身が黒（背景以外の平均輝度1）。修正後は、青灰色のスーツ・金属の装甲・顔の肌色が出る（平均輝度52）。頭部の模様は、透明指定とアルファ画像を持つ `EXO_HeadMask` の材質どおりに描かれている。Mixamo公式の見本画像との突き合わせはしていない。v0.5詳細の容量は「30.72 MiB」で、原本の32,207,120バイトと一致する。

`tests/studio-v05-real-format-import.test.cjs` は、正面画像・ステージ画像の、背景以外の平均輝度が30を超えることを確かめるようにした。実GPUでの結果は VRM 61、FBXモデル 52、ステージ 96。

| 試験 | 結果 |
|---|---|
| `studio-v05-real-format-import`（実GPU） | 2/2回成功 |
| 同（SwiftShader） | 1/2回成功。失敗した1回は下の「途中で止まる」 |
| `python -m pytest -q`（`PYTHONUTF8=1`、`BAI_REAL_MMD_DATA` あり） | 629成功・1失敗・スキップ0。失敗は `test_v05_timeline_drag_static`（タイムラインの文字列検査）。今回の変更と無関係なファイルで、既存の失敗 |
| `studio-p2-assets`・`studio-real-asset-visuals`・`studio-v05-legacy-import-bridge`・`studio-v05-smoke`・`studio-real-import-samples`（実素材パスあり） | 実VMDの既存の失敗（unknown char code）を除き成功、スキップ0 |
| `npm run typecheck` | 成功 |

**途中で止まる（未解決）。** SwiftShaderの実行で、②の `/workspace/08` が枠だけ出て、中身が出ないまま止まることがある。今回は12回中2回ほど。記録した3回とも、`/studio/js/features/stage-thumbnail.js` の取得が `ERR_CONNECTION_TIMED_OUT` で失敗していた。1つのモジュールが読めないと、②の起動全体が止まる。サーバーの受付待ち行列（既定5）が原因と考え、300件の同時取得で調べた。しかし既定のままでも全件成功したため、この仮説は外れで、サーバーは変えていない。原因は未特定。修正前のコードでも同じ症状が出ている。
