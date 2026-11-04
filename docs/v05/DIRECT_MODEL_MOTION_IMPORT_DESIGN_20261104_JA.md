# ③の素材管理からの、VRM・FBX・GLB動作の直接登録（設計メモ、2026-11-04）

対象: `DATA-016`、Issue #37/#50。所有者が2026-11-04に選んだ「3番の後に作る」に基づく。画面の呼び方は、①が `/` と `camera.html`、②が `/workspace/NN`、③が v0.5（`/studio/v05`）。

## 目的と範囲

③の素材管理だけで、VRM・FBX（モデルと動作）・GLB動作を登録・確認できるようにする。②の `/workspace/08` を開かずに済むようにする。

| 範囲に入るもの | 範囲に入らないもの |
|---|---|
| VRM、FBXモデル（A/B）、FBX動作、GLB動作の、③からの登録 | PMX ZIP・VMDの③からの登録。これまでどおり②へ案内する |
| それらの3D見本を③の中で作る | GLBモデル・ステージ・小物の見本を③で作ること |
| ③の詳細欄で、VRM・FBXモデルの回転表示と、FBX・GLB動作の再生 | 動作見本のサーバー保存。②と同じく画面内だけに持つ |
| | 新しいAPI。既存の登録APIをそのまま使う |

## 入口

③の「素材を追加」の種類に、次の4つを足す。既存の7種類（ステージ・小物・材質・エフェクト・音声・動画・画像）は変えない。

| 種類 | 拡張子 | 送り先（既存API） | 登録後のID |
|---|---|---|---|
| VRMモデル | `.vrm` | `POST /api/integrated-v02/upload?kind=model` | `integrated:<内容hash20桁>.vrm` |
| FBXモデルA／B（置き換え） | `.fbx` | `POST /api/upload?kind=modelA|modelB` | `fbx:<sha256(kind\0name)先頭24桁>` |
| FBX動作 | `.fbx` | `POST /api/upload?kind=motions` | 同上 |
| GLB動作 | `.glb` | `POST /api/integrated-v02/upload?kind=motion` | `integrated:<内容hash20桁>.glb` |

「モデル・動作を登録 ↗」のリンクは、「PMX ZIP・VMDを登録 ↗」に名前を変える。②を開く先は変えない。

## 共通部品（②の挙動は変えない）

②の `studio/js/features/import.js` の中だけにあった次の処理を、純関数として `import-rules.js` へ移す。②は移した関数を呼ぶだけにして、動作は同じに保つ。

- 送り先URLの決定：`uploadUrlFor(route, kind, name)`
- 登録後のIDの決定：`importedAssetId(route, kind, name, data)`
- FBXの送信前の検査：`fbxPrecheck(file, kind)`。読めないFBXと、アニメーションの無い動作FBXを、送る前に止める

③の新しいモジュール `studio/v05/js/model-motion-import-v188.js` は、これらに加えて、②の既存部品をそのまま使う。

- 送る前の分類・名前の検査：`classifyImport`
- 衝突の判定：`conflictOf`・`fbxIdFor`・`sha256Hex`
- 送信：`uploadFile`

## 衝突の確認

②と同じ判定（`conflictOf`）を使い、上書き・置き換え・再分類になる登録は、すぐには送らない。理由を画面に示し、［内容を確認して登録］を押した場合だけ送る。FBXモデルの置き換えでは古いFBXが削除されるため、この確認が特に必要になる。

## 見本の作り方

- **VRM・FBXモデル：** ②の `characterThumbnail(item)` を呼ぶ。正面画像を作り、既存の `POST /api/assets/thumbnail` に保存する。作るのは、登録の直後と、③の一覧で見本の無いモデルが見えたとき。1件ずつ順番に作る。
- **FBX・GLB動作：** ②の `motionThumbnail(item)` を呼ぶ。開始・中間・終了の3つの姿勢を、グレーマンで並べた画像を作る。②と同じく、ページの中だけに持ち、サーバーには保存しない。

## 詳細欄

- **VRM・FBXモデル：** ②の `loadModel` と `createViewport` で、回転できる3D表示を出す。中ドラッグで回転、ホイールで前後に動く。［全体を表示］ボタンを付ける。
- **FBX・GLB動作：** ②の `mountMotionPreview` をそのまま使う。再生・一時停止・シーク・全体表示・クリップの選択ができる。
- 別の素材を選んだとき、追加画面を開いたとき、素材管理を離れたときは、表示を破棄して WebGL を解放する。
- 上の対象外の形式（PMX・VMD・GLBモデル等）は、これまでどおり「3D回転表示と実動作はこの詳細欄へ未接続です」と示す。

## 試験計画

`tests/studio-v05-real-format-import.test.cjs` を、③の直接経路に広げる。

1. VRM・FBXモデル・FBX動作・GLB動作の実素材を、③の追加画面から1件ずつ登録する。新しいタブ（②）が開かないことを確かめる。
2. 保存ファイルのhashが原本と一致すること、IDの規則を確かめる。
3. VRM・FBXモデルの見本が保存され、背景以外の明るさが基準を超えること。動作は、一覧のカードに3姿勢の画像が出ること。
4. 詳細欄の確認。モデルでは、3D表示が出て、ドラッグでカメラが動くこと。動作では、再生すると時刻が進み、シークで骨の姿勢が変わること。
5. ③の再読込後も、同じIDと見本が残ること。
6. 実GPU（`BAI_REAL_GPU=1`）とSwiftShaderの両方で通す。
7. 衝突の確認は、同じFBX動作をもう一度登録し、確認なしでは送らないことを確かめる。

ほかに、次も確認する。

- ②の既存試験：`studio-p2-assets`、`studio-p2-import-rules`、`studio-v05-legacy-import-bridge`。
- 移した関数の単体試験を `studio-p2-import-rules.test.mjs` に追加する。
- `npm run typecheck`、pytest、原本のhash。

## 未検証として残す見込み

PMX ZIP・VMDの③からの登録、GLBモデルの見本と回転表示、WebMCP・標準MCP、Linux。
