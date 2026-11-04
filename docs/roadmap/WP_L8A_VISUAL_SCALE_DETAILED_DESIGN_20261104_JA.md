# WP-L8a 見た目の大きさをそろえる：詳細設計（2026-11-04、批評を受けて改訂）

対象: [旧保存→v0.5取込設計](LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md)の WP-L8a（§2.3 の差を解消する）。Issue #63/#69。要件ID は `DATA-008`（主）。画面の呼び方は、①が `/` と `camera.html`、②が `/workspace/NN`、③が v0.5（`/studio/v05`）。

前提: [再構築ロードマップ](V05_REBUILT_ROADMAP_20261102_JA.md)の「次の実施順3」（保存したステージ・カメラのプレビューとMP4の一致）は #214 でマージ済み。順3で、③のプレビューとMP4は同じ `multi-model-ui-v58.js` の読込と同じ場面インスタンスの変換を通ることが確かめられた（[調査表](../v05/SHARED_STATE_OUTPUT_AUDIT_20261104_JA.md) §1・§2）。この設計はその約束を変えない。

この文書は設計だけを扱う。コードと試験はまだ書いていない。行番号は main の `9c15d43` での値。実装する人は、この文書の「変更する箇所」（§4）と「試験」（§6）と「順」（§8）をそのまま使う。迷う箇所が出たら、推測で埋めずにこの文書を直してから進める。3人の批評への採否は §11 にまとめた。

**実施状況（2026-11-04）**：§8 の手順0〜6を実施。手順7（所有者のPC・実データ）で L1〜L3 合格、L4・L5 不合格のため、§10 の質問を所有者に出した。結果は [実データ確認](../v05/LEGACY_IMPORT_L8A_REAL_DATA_20261104_JA.md)。L4 の見込み「保存した視点が無ければ初期値 (2, 1.6, 4.5)」は誤りで、③は開くたびに `viewport.fit()` で全体が入るようにカメラを引く。

## 0. 結論

- **原因。** ③は場面インスタンスを読むたびに、形式ごとに大きさを決め直す（GLB・VRMは高さ2.0m、FBXは1.95m、PMXは0.08倍＋足をy=0へ）。旧の画面は、素材の単位の換算（PMX 0.08、GLB・VRM 1、FBX は UnitScaleFactor÷100）だけを掛け、ファイルの原点のまま置く。取込は旧の数値をそのまま写すので、S01ステージ（GLB）は③で2mに縮み、曲とダンスのモデル（S1、PMX）がその内側に入った。
- **選んだ案。** 取込で置いた場面インスタンス（キャラクター M3・ステージ M4）にだけ、印 `"units": "legacy"` を付ける。③の読込は、この印があるときだけ旧と同じ式（素材の単位の換算だけ、位置を動かさない）で置く。印が無いインスタンスは、いまのコードの道をそのまま通る。
- **換算式。** 旧の値 p（位置）、r（回転・度）、s（倍率）を、③の transform に `{position: p, rotation: r, scale: [s, s, s]}`、印 `units: "legacy"` で写す。③の読込は、印があれば object の拡大を u（素材の単位）にし、位置を動かさない。世界座標は `p + R(r)·(s·u·v)` となり、旧の式と同じになる（§3）。スキン付きのキャラクターでも同じになることを、スキン付きの試験素材（ケース K）と所有者の実PMX（ケース R）で確かめる（§6.3）。
- **しきい値。** ③と旧の画面で、同じ素材の世界座標の外接箱（最小・最大の6成分）の差が、すべて `ε = 0.00001 × (1 + D + Rₚ/s)` m 以内（D は外接箱の対角の長さ、Rₚ は位置 p から外接箱の角までの最大の距離、s は旧の倍率。§6.6）。印を付けない対照では、差が `100ε` 以上になることも確かめる。
- **所有者の症状が直ったかを完了条件にする。** 実データで、(1) S01 の外接箱が旧の SCR-06 と ε 以内、(2) S1 の中心がステージの外接箱の内側、(3) S1 の足とステージの床の差が許容内、(4) ③の初期カメラがステージの外接箱の内側、(5) 開発側が画像を見て S1 が見える、の5つをすべて満たすこと（§6.4）。実装の前に、所有者のPCで S01 の元の外接箱を測り、(2)〜(4) が満たせる見込みを確かめる（§6.0）。
- **警告。** `UNIT_SEMANTICS_DIFFER` は、M3 で `workspace.character` が無い・null のときだけ残す（①の `camera.html` とは大きさ・向きが違いうるため）。それ以外の M3・M4 では出さない（§3.4）。
- **既存の③の作品。** 印は取込だけが付ける。HTTP・MCP・画面からは付けられない。既存の保存ファイルは書き換えない。印の無いインスタンスの読込は、今のコードと同じ式・同じ順で動く。既存の作品の見た目は変わらない（§7）。
- **所有者への質問。** いまは無い。§6.0 の測定で「L8a だけでは症状が直らない」と分かったときだけ、既定値を付けた1件を尋ねる（§10）。GLB動作のダンス（S3）を写すかは、別のカードで所有者の回答を待っている。L8a には入れない（§9）。

## 1. 調べた事実

### 1.1 旧（①②）の置き方

| 画面 | 読む保存値 | 置き方 | 根拠 |
|---|---|---|---|
| ① `camera.html`（キャラクター、`workspace.character` が値のとき） | `workspace.asset`、`workspace.character` | 素材を読み込んだ `content` を、向き用の空のグループ（回転0）に入れ、その外側の `model` に「位置 p、回転 r（度→ラジアン、XYZ順）、拡大 u×s」を当てる。高さの正規化も、中心合わせも、足合わせもしない | `camera_3d.js:297-305`、`studio/js/viewport/character-placement.js:22-28`、`studio/js/viewport/placement.js:25-31` |
| ① `camera.html`（キャラクター、`workspace.character` が無い・null） | `workspace.asset` | 高さを PMX 1.8m／FBX 1.95m／GLB・VRM 2.0m に合わせ、XZの中心を原点へ、足を y=0 へ。VRM だけ π 回す。外接箱は頂点から測る（`setFromObject(…, true)`） | `camera_3d.js:306-311` |
| ① `camera.html`（ステージ） | — | **ステージを描かない。** `camera_3d.js` は `workspace.stage` を読まない（`stage` を含むのは `camera_3d.js:5` の import と `:304` の単位の関数の呼び出しだけ）。`camera.html` にもステージの要素は無い | `camera_3d.js` 全体、`camera.html` |
| ② SCR-06 `/workspace/06`（ステージ） | `workspace.stage` | `buildPlaced` で `content` を、単位 u を掛けたグループに入れ、`applyStage` でそのグループに「位置 p、回転 r、拡大 u×s」を当てる。正規化も中心合わせもしない | `studio/js/viewport/scene-parts.js:18-34`、`studio/js/features/scene-view.js:302-318,338` |
| ② SCR-06（キャラクター） | `workspace.asset`、`workspace.character`（無ければ既定値 `{[0,0,0],[0,0,0],1}`） | ステージと同じ式。`character` が無いときも既定値で同じ式 | `studio/js/features/scene-view.js:43-48,280-296,339` |
| ② SCR-10 曲とダンス（ダンスのモデル） | `music_dance_project.json` の `model_id` | PMX は0.08倍のあと足を y=0 へ。それ以外は `normalizeModel`（高さを目標へ、中心と足を合わせる）。**③の既定と同じ式。ステージは描かない** | `studio/js/features/music-dance-view.js:265-280` |

素材の単位 u は `stageUnitScale`（`studio/js/viewport/normalize.fork.js:58-65`）で、PMX 0.08、FBX は `userData.unitScaleFactor ÷ 100`（無ければ0.01）、GLB・VRM は 1。

①の `camera.html` はステージを描かない。旧の保存値 `workspace.stage` を描く画面は、② SCR-06 だけ。キャラクターとステージを同じ場面に描く画面も SCR-06 だけ。`workspace.character` が値のときは、① `camera.html` と ② SCR-06 は同じ式になる。

`camera_3d.js:298-299` には「読み込んだ骨を元の大きさのまま保つ。スキン付きの素材には、形状の箱が姿勢の付いた体よりずっと小さいものがあり、その scene root を拡大するとスキンが二重に拡大される」という注意書きがある。これについては §3.3 で扱う。

### 1.2 ③の置き方（いまのコード）

| 段階 | 処理 | 根拠 |
|---|---|---|
| 読込 | `loadModel` で object を作る（①②と同じ読込関数） | `studio/v05/js/multi-model-ui-v58.js:1494-1497`、`studio/js/viewport/model-loader.js:84-121` |
| 正規化 | PMX：object の拡大を0.08にし、頂点から測った外接箱の最小yだけ上げる。それ以外：`normalizeModel`（高さ GLB・VRM 2.0／FBX 1.95、XZの中心を原点、足をy=0。外接箱は `setFromObject(object)`＝頂点ではなく形状の箱から測る） | `multi-model-ui-v58.js:1499-1504`、`normalize.fork.js:5,13-25` |
| 置く | object を `BAI_Inst_<ID>` のグループ（root）に入れる。root に保存値の「位置、回転（度→ラジアン、XYZ順）、拡大（3成分）」を当てる | `multi-model-ui-v58.js:1505-1506`、`studio/v05/js/shared-scene-v57.js:27-41`、`studio/v05/js/multi-model-runtime-v58.js:56,76` |
| 保存値 | `transform = {position[3], rotation[3](度), scale[3]}`。小数点以下6桁に丸める | `studio_v05_scene_instances.py:104-114`、`studio_v05_scene_model.py:54-59` |
| 初期カメラ | ③の3D場面は②と同じ `createViewport` を使う（`multi-model-ui-v58.js:12`）。保存した視点が無ければ、カメラは (2, 1.6, 4.5)、描く遠い端は 500m | `studio/js/viewport/three-host.js:85-86` |
| 同じ処理の別の場所 | 単体の動作プレビュー（`actual-motion-loader-v22.js:39-43`）にも同じ正規化がある。場面インスタンスは使わない | `studio/v05/js/actual-motion-loader-v22.js:29-45` |

プレビューとMP4の書き出しは、どちらも `multi-model-ui-v58.js` の同じ `loadInstance` を通る（MP4は `?scene_capture=1` で同じ画面を開く。`multi-model-ui-v58.js:26`）。

### 1.3 取込（WP-L3）が今していること

- M3・M4 は、旧の値をそのまま transform にする（`studio_v05_legacy_import.py:231-236` の `_transform`、`:506-519` の `place`）。警告 `UNIT_SEMANTICS_DIFFER` を付ける（`:519`）。
- 曲とダンスのモデル（S1）は、既定の transform で置き、`PLACED_AT_ORIGIN` を付ける（`:283-286`）。
- 適用は `studio_v05_scene_instances.mutate(action="add", …)` を呼ぶ（`:913-916`）。
- 確認の各項目の文言（`messages`）は、取込記録の `items` に保存される（`studio_v05_legacy_import.py:498`、`studio_v05_legacy_import_record.py:26`）。画面はその保存された文言を出す（`studio/v05/js/legacy-import-ui-v188.js:156-157`）。したがって `MESSAGES` の文言を変えても、L8a より前の取込記録の表示は変わらない。

### 1.4 実データでの差（WP-L9）と、所有者の症状

所有者の旧保存は、キャラクターなし（`workspace.asset` が空）、ステージ S01「灰色の境界スタジオ」（位置0・回転0・大きさ1）。③に読み込んだ後の外接箱は次のとおりだった（[実データ確認](../v05/LEGACY_IMPORT_REAL_DATA_20261104_JA.md)、測り方は `tools/legacy_import_real_check_ui.cjs:89-93`、`frameProbe` の `root`）。

| インスタンス | 大きさ [m] | 最小 | 最大 |
|---|---|---|---|
| S01ステージ（M4） | (2, 2, 2) | (−1, 0, −1) | (1, 2, 1) |
| PMX（S1、曲とダンスのモデル） | (1.155, 1.731, 0.867) | (−0.334, 0.132, −0.375) | (0.821, 1.863, 0.492) |

S01 は③で高さ2mへ縮み、XZの中心を原点へ動かされた。旧の SCR-06 では、S01 はファイルの原点のまま、元の大きさ（u=1、s=1）で描かれる。

所有者の症状は「キャラクターが S01 の中に隠れる」。見えている「キャラクター」は S1（印なし、③の既定の式で足を y=0 に置く）で、M3 ではない。S1 を描く旧の画面 SCR-10 はステージを描かないので、「S01 の上に S1 が立つ」姿には旧の基準画面が無い。したがって、S01 の数値が SCR-06 と一致しても、症状が直ったことにはならない。S01 の元の外接箱・床の高さ・③の初期カメラとの位置関係で決まる。S01 の元の大きさは WP-L9 では測っていない。実装の前に §6.0 で測る。

## 2. 案の比較

| 観点 | 案1 取込で数値を換算する | **案2 取込で置いたものだけに印を付ける（採用）** | 案3 ③の正規化そのものを変える |
|---|---|---|---|
| やること | 取込の時点で、③の正規化を打ち消す scale と位置を計算して保存する（式は §3.5） | 取込の場面インスタンスに `units: "legacy"` を付ける。③の読込は、印があるときだけ正規化の代わりに単位の換算を掛ける | ③の読込から正規化を外す（または ステージだけ外す） |
| 既存の③の作品 | 変わらない | 変わらない（印が無いので、いまの道を通る） | **変わる。** 既存の作品のステージ・モデルの大きさと位置がすべて変わる |
| 正確さ | 素材ごとに、③が測る外接箱（形状の箱、PMXは頂点）と同じ値が要る。サーバー（Python）には three.js が無い。静止GLBは accessor の min/max とノードの行列で再現できるが、スキン付きGLB・VRM（`SkinnedMesh.computeBoundingBox` が骨の行列で頂点を動かす）とFBXは再現できない。画面で測って送る方法は、MCP・HTTPからの取込で使えない | 旧と同じ three.js の読込結果に、旧と同じ式を当てる。全形式で式が一致する。外接箱を測らない | — |
| 往復（R2・R4） | 保存値が旧の値と違う。逆変換に、記録した正規化の値が要る。③で倍率を変えると、旧の位置と倍率の両方が変わる | 保存値は旧の値のまま。いまの逆変換がそのまま使える | — |
| 触るファイル | 取込モジュール、新しい外接箱の読み取り（GLB・PMX）。それでもスキン付き・FBXは残る | 取込モジュール、場面インスタンスの保存の検査（項目1つ）、③の読込（分岐1つ）、③の実行部（引数1つ） | ③の読込。既存作品の作り直しや移行が要る |
| 保存の形 | 変えない | 場面インスタンスに任意の項目 `units` を1つ足す（値は `"legacy"` だけ）。この版より古いコードでは、印付きの作品の場面インスタンスを読めない（下の注） | 変えない |
| スコープ凍結 | L8a の候補 (b)。承認範囲 | L8a の候補 (a)。承認範囲。効果は取込で置いたものだけに及ぶ | 取込以外の作品の見た目を変えるので、**承認範囲の外** |

**採用は案2。** 理由は次の3つ。

1. 案3は取込以外の作品を変えるので、所有者の「既存の作品の見た目は変えない」とスコープ凍結に反する。
2. 案1は「取込だけで換算する」点では最も小さく見えるが、③と同じ外接箱をサーバーで再現できない形式（スキン付きGLB・VRM、FBX）が残る。画面で測る方法は、HTTP・MCPの取込で結果が変わる。外接箱を再現する新しい読み取り部品は、計画にない大きな追加になる。
3. 案2は、取込で置いたものにだけ効く（効果は「取込だけの換算」と同じ）。全形式で旧と同じ式になり、測る処理が要らない。保存値が旧の値のままなので、取消・逆変換・往復試験（R2〜R4）を変えずに済む。

**注（古いコードとの関係）。** 印付きのインスタンスを含む作品を、この版より古いコードで開いたときの影響は次のとおり。

- 古いコードの `_check_record` は、行のキーが6つちょうどでないと例外を出す（`studio_v05_scene_instances.py:58-60`）。`read()` はそれを包み直し、外に出る文は `Scene-instances file unreadable; original retained` になる（`:170-173`）。
- `read()` を呼ぶ処理は、その作品ですべて失敗する。3D場面の表示と編集（`server.py:315`、`mutate` の中の `read`）、MP4の書き出し（`studio_v05_media_render.py:295,572`）、動作の割り当て・計画（`studio_v05_multi_motion.py:7`、`server.py:464,522`）、口パクの採用と合成候補（`studio_v05_lip_adoptions.py:16`、`studio_v05_lip_composite_candidate.py:28`）、GLB→VMD（`studio_v05_glb_vmd.py:46`）、旧保存の取込の確認・適用・取消（`studio_v05_legacy_import.py:684,909,1148,1224`）。
- 書き込みの前に止まるので、元のファイルは書き換えられない。新しい版に戻せば、そのまま読める。
- 所有者のPCでは、マージ前の別ブランチ（Codex の作業を含む）で同じ data を開くことがありうる。そこで運用の注意として、**旧保存の取込は L8a をマージした版で行い、取り込んだ作品を L8a より前の版で開かない**と操作説明書に書く（§4.6）。古いコードは直せないので、これ以上の対策はしない。

## 3. 換算式

### 3.1 記号

| 記号 | 意味 |
|---|---|
| p = (px, py, pz) | 旧の位置 [m]。`workspace.character.position` または `workspace.stage.position` |
| r = (rx, ry, rz) | 旧の回転 [度]。XYZ順のオイラー角 |
| s | 旧の倍率（数1つ） |
| u | 素材の単位。`stageUnitScale(object, format)`（`normalize.fork.js:58-65`） |
| R(r) | 回転 r（度→ラジアン）の行列。three.js の既定の順（XYZ） |
| v | 読込直後の object の座標で表した頂点 |
| n, o | ③の正規化が object に当てる拡大と位置（PMX：n=0.08、o=(0, −0.08·ymin, 0)。それ以外：n=H/h、o=(−n·cx, −n·ymin, −n·cz)。h・cx・cz・ymin は読込直後の外接箱の高さ・中心・最小y、H は目標の高さ） |
| S, P, Q | ③の保存値（root に当てる倍率3成分、位置、回転） |

### 3.2 いまの式

- 旧（①の `character` が値のとき、②SCR-06）：`W旧(v) = p + R(r)·(u·s·v)`
- ③（いまの取込は S=(s,s,s)、P=p、Q=r）：`W③(v) = p + R(r)·(s·(n·v + o))`

n=u かつ o=0 のときだけ一致する。GLB・VRM・FBX は n=H/h なので、ほぼ常に一致しない。PMX は n=u=0.08 なので、o（足の高さの補正）の分だけずれる。

### 3.3 L8a のあとの式（採用）

取込の手順（M3・M4）：

```
③の transform = { position: [px, py, pz], rotation: [rx, ry, rz], scale: [s, s, s] }   … いまと同じ
③の印         = "units": "legacy"                                                  … 新しい
```

③の読込（印が `"legacy"` のとき）：

```
object.scale = (u, u, u)      … stageUnitScale(object, format)
object.position = 読込直後のまま（動かさない）
root の位置・回転・倍率 = 保存値（P=p、Q=r、S=(s,s,s)）     … いまと同じ（shared-scene-v57.js:38-40）
```

このとき `W③(v) = p + R(r)·(s·u·v) = W旧(v)`。倍率は数なので、u を object に、s を root に分けても、旧のように u×s を外側の1つのグループに掛けても、世界座標は同じになる。

印が無いときは、いまの式（§3.2）のまま。

**スキン付きのメッシュについて。** `camera_3d.js:298-299` の注意書きは、u を object に掛けると二重に拡大されるおそれを示している。次の理由で、u は object に掛けたままにする。そのうえで、試験で直接確かめる。

- loadModel が返す object は、GLTF の `parsed.scene`・FBX の sceneGraph・MMD の SkinnedMesh のどれも、位置0・回転0・拡大1。FBXLoader は `UnitScaleFactor` を userData に入れるだけ（`FBXLoader.js:1509-1511`）。
- three.js の attached の束縛は、`updateMatrixWorld` のたびに `matrixWorld` から逆行列を取り直す（`node_modules/three/src/objects/SkinnedMesh.js:203-209`）。描画の式は `modelMatrix · bindMatrixInverse · Σ(boneMatrixWorld · boneInverse) · bindMatrix · v` で、前の2つが打ち消し合うので、拡大は骨の `matrixWorld` を通して1回だけ掛かる。頂点から測る外接箱（`Box3.js:171-187`、`getVertexPosition`）も同じ式で、両側（`camera_3d.js:269`、`multi-model-ui-v58.js` の `frameProbe`）は測る前に `updateMatrixWorld(true)` を呼ぶ。
- ③はすでに、印の無い道で、すべての形式の object に拡大を掛けている（PMX は `object.scale.setScalar(.08)`、それ以外は `normalizeModel`）。実PMXと実素材での見た目は順3の試験（`studio-v05-saved-composition-real.test.cjs`）で確かめられている。u を外側の新しいグループに移すと、③の PMX の機能（骨の編集・IK・表情など、`target.object` を前提にした処理。`multi-model-ui-v58.js:830-1300` 付近）が印のある時だけ別の木の形で動くことになり、確かめる範囲が増える。
- 注意書きの前半（形状の箱が姿勢の付いた体より小さい）は、高さを合わせる正規化の話で、印のある道は外接箱を使わない。
- 確かめ方：スキン付きの試験素材 `tests/fixtures/synthetic_test_model.glb`（骨10本、skin 1つ、静止姿勢と束縛姿勢が同じ）をケース K、所有者の実PMX をケース R として、`camera.html` の頂点の箱と③の `precise` を比べる（§6.3）。合わなければ、u を外側のグループに移す案を検討し、この文書を直してから進める。

### 3.4 取込の項目ごとの扱い

| 項目 | 旧で描いていた画面 | 印 | transform | 理由コード |
|---|---|---|---|---|
| M3 キャラクター、`character` が値 | ① `camera.html` と ② SCR-06（同じ式） | `"legacy"` | 旧の値（いまと同じ） | なし |
| M3 キャラクター、`character` が無い・null | ② SCR-06 は既定値で同じ式。① `camera.html` は高さを合わせる（§1.1） | `"legacy"` | 既定値 `{[0,0,0],[0,0,0],[1,1,1]}`（いまと同じ） | `UNIT_SEMANTICS_DIFFER`（文言を下のとおり直す） |
| M4 ステージ（値のとき） | ② SCR-06 だけ（① はステージを描かない） | `"legacy"` | 旧の値（いまと同じ） | なし |
| S1 曲とダンスのモデル（M3 と別の素材） | ② SCR-10。③の既定と同じ式 | 付けない | 既定値（いまと同じ） | `PLACED_AT_ORIGIN`（いまと同じ） |
| S1 で M3 と同じ素材 | M3 のインスタンスを共有（いまと同じ） | M3 の印に従う | — | いまと同じ |

M3 で `character` が無いときの基準は ② SCR-06 にする。理由：③はステージとキャラクターを同じ場面に置く。旧でその2つを同じ場面に描くのは SCR-06 だけで、SCR-06 は `character` が無いときも既定値で同じ式を使う。① `camera.html` はキャラクターだけを単体で、高さを合わせて描く。この差は旧の2つの画面のあいだにもともとある差で、L8a では SCR-06 に合わせる。差が残るので、この場合だけ警告を残し、利用者に見せる。

`UNIT_SEMANTICS_DIFFER` の新しい文言（`studio_v05_legacy_import.py:47`、親設計 §3.4 の表、`tests/test_studio_v05_legacy_import_plan.py:73` の `EXPECTED` を同じ文に直す）：

> 旧のシーン画面（②）と同じ大きさで置きました。旧のカメラ画面（①）はモデルの高さを合わせて表示していたため、①とは大きさや向きが違うことがあります。

L8a より前の取込記録は、保存された文言を出すので、表示は変わらない（§1.3）。

### 3.5 参考：案1の数値換算式（採らない）

案1で③の正規化を打ち消すには、`S' = u·s / n`、`P' = p − (u·s / n)·R(r)·o` が要る。n と o は素材ごとに③の three.js が測る外接箱で決まる（§3.1）。この値をサーバーで同じに作れない形式があるため、案1は採らない（§2）。

## 4. 変更する箇所

ここに無いファイルは変えない（§4.8）。

### 4.1 `studio_v05_scene_instances.py`（場面インスタンスの保存）

1. 定数を足す（`MAX_INSTANCES = 32` の行 `:19` の次）。

   ```python
   # WP-L8a：旧画面と同じ式（素材の単位の換算だけ）で置く印。取込だけが付ける。
   # 名前は units だが、中身は「読込のときの置き方の規則」。値を足すときは _check_record と mutate の検査を広げる。
   UNITS_LEGACY = "legacy"
   _ROW_KEYS = frozenset({"id", "asset_id", "transform", "visible", "locked", "parent_id"})
   ```

2. `_check_record` の項目の検査（`:58-60`）を次に置き換える。`units` は任意で、値は `"legacy"` だけ。

   ```python
   for row in items:
       if not isinstance(row, dict) or not _ROW_KEYS <= set(row) <= _ROW_KEYS | {"units"}:
           raise SceneInstancesError("Invalid scene instance fields; original retained")
       if "units" in row and row["units"] != UNITS_LEGACY:
           raise SceneInstancesError("Invalid scene instance units; original retained")
   ```

   `read()` は `_check_record` の例外を `Scene-instances file unreadable; original retained` に包み直す（`:170-173`）。この包み方は変えない。

3. `mutate` の引数（`:190-192`）の末尾に `units=None` を足す（位置引数で呼ぶ既存の呼び出しを変えないため、`layout_root=None` の後ろ）。
4. `mutate` の action の検査（`:195-197`）の直後に、次を足す。

   ```python
   if units is not None and (action != "add" or units != UNITS_LEGACY):
       raise SceneInstancesError("Units can only be set to 'legacy' when adding")
   ```

5. `add`（`:329-332`）で、行を作ってから `units` を足す。キーの順は既存の6つのあと。

   ```python
   row = {"id": new_id, "asset_id": asset_id, "transform": _transform(transform),
          "visible": True, "locked": False, "parent_id": None}
   if units is not None:
       row["units"] = units
   rows.append(row)
   ```

6. `update`・`remove`・顔キー・カメラの処理は変えない。`update` は行を上書きせずに項目を書き換えるので（`:354-361`）、印は残る。`read`（`:164-188`）は `dict(row)` で返すので、印はそのまま応答に入る。

`server.py:1222-1223` の `allowed` には `units` を**足さない**。HTTP・MCP（`mcp_server.py:77,215`）・画面から印は付けられない。

### 4.2 `studio_v05_legacy_import.py`（取込）

1. 先頭の説明文（`:1-8`）に1行足す：「WP-L8a で、M3・M4 の場面インスタンスに印 `units: "legacy"` を付けた（旧画面と同じ大きさで置く）。」
2. 定数を足す（`DEFAULT_TRANSFORM` の行 `:40` の次）。

   ```python
   LEGACY_UNITS = studio_v05_scene_instances.UNITS_LEGACY  # M3・M4 の印（WP-L8a）
   ```

3. `MESSAGES["UNIT_SEMANTICS_DIFFER"]`（`:47`）を §3.4 の新しい文言にする。`KINDS`（`:87`）は `'警告'` のまま。
4. `place`（`:506`）に引数 `codes=()` を足し、手順に `"units": LEGACY_UNITS` を足す（`:515-516`）。

   ```python
   def place(iid, label_key, role, pointer, asset, legacy_value, legacy_transform, codes=()):
       ...
       step = {"kind": "scene_add", "role": role, "status": "pending", "asset_id": asset_id,
               "transform": _transform(legacy_transform), "units": LEGACY_UNITS,
               "pre_ids": [], "instance_id": None}
   ```

5. 同じ関数の `add(...)`（`:519`）の理由コードを引数にする：`add(iid, pointer, label_key, "mapped", list(codes), legacy_value, name=name)`。
6. M3 の呼び出し（`:539`）で、`character`（`:535` の `ws.get("character")`。無い・null のどちらも `None`）が `None` のときだけ警告を渡す。

   ```python
   place("M3", "M3", "character", "/workspace/asset", ws["asset"], value3, character,
         codes=["UNIT_SEMANTICS_DIFFER"] if character is None else [])
   ```

   M4 の呼び出し（`:546`）は変えない（`codes` の既定は空）。
7. S1（`:283-286`）は変えない。`units` を付けない。
8. `_run_step` の `scene_add`（`:914-916`）で、印を渡す。

   ```python
   after = studio_v05_scene_instances.mutate(
       roots.scene, roots.legacy, roots.catalog, pid, action="add", revision=before["revision"],
       assets=assets, asset_id=step["asset_id"], transform=step["transform"], units=step.get("units"))
   ```

   `step.get` にするのは、S1 の手順と、L8a より前に書かれた途中の記録（`units` が無い）を同じ道で扱うため。

9. 打ち消し（`_undo_scene_add`、`:1145-1159`）と取消（`revert`）は変えない。インスタンスを消せば印も消える。
10. 試験専用の逆変換（`_export_legacy_for_test`、`:1364-1451`）に、印の照合を足す。キャラクター（`:1402-1419`）とステージ（`:1420-1431`）のそれぞれで、`asset_ok(...)` の直後に次を入れる。

    ```python
    if inst.get("units") != step.get("units"):
        unrep.append({"pointer": "/workspace/character", "reason": "UNITS_CHANGED"})  # ステージは "/workspace/stage"
    else:
        placed = _placement_back(...)   # いまの処理をこの else の中へ移す
        ...
    ```

    印が違うときは `_placement_back` を呼ばず、`bundle` の該当項目は `source.bundle` の値（`copy.deepcopy` 済み）のまま返す。`changed` には入れない。公開の関数では印を変えられないので、この分岐は試験で `current` を手で作ったときだけ通る。L8a より前の記録は、手順にもインスタンスにも印が無いので（`None == None`）、いまと同じ結果になる。

### 4.3 `studio/v05/js/multi-model-runtime-v58.js`（③の実行部）

1. 読み込んだものを捨てる条件（`:48`）に、印の違いを足す。

   ```js
   if(!next||next.asset_id!==current.assetId||(next.units??null)!==current.units||!next.available||!next.asset)release(id);
   ```

2. 読込の呼び出し（`:63`）に印を渡す。

   ```js
   model=await loadInstance({instanceId:id,asset:entry.asset,units:entry.units??null,projectId:data.project_id,token});
   ```

3. 読み込んだものの記録（`:75`）に印を持たせる。

   ```js
   loaded.set(id,{assetId:entry.asset_id,units:entry.units??null,root:model.root,model,evaluate:model.evaluate||null});
   ```

### 4.4 新しいファイル `studio/v05/js/instance-units-v189.mjs`

③の読込の「正規化か、単位の換算か」を1か所にまとめる。印が無いときの処理は、`multi-model-ui-v58.js:1499-1504` の今のコードを、式も順も変えずに移したもの。

```js
// WP-L8a：場面インスタンスを読み込んだ直後の大きさと位置の置き方（設計 docs/roadmap/WP_L8A_VISUAL_SCALE_DETAILED_DESIGN_20261104_JA.md §3.3）。
// 印 units が 'legacy' のときだけ、旧画面（①camera_3d.js・②scene-parts.js）と同じく素材の単位の換算だけを掛け、位置は動かさない。
// 印が無いときは、v58 からの③の正規化（PMX は0.08倍と足合わせ、ほかは normalizeModel）をそのまま行う。
import { normalizeModel, stageUnitScale } from '../../js/viewport/normalize.fork.js';

export const LEGACY_UNITS = 'legacy';

/**
 * @param {any} object loadModel の object（読込直後。位置0・回転0・拡大1）
 * @param {'GLB'|'VRM'|'PMX'|'FBX'} format
 * @param {string|null|undefined} units 場面インスタンスの units（無ければ null か undefined）
 * @param {any} THREE
 * @returns {{mode: 'v05'|'legacy', unit: number|null}}
 */
export function placeInstanceObject(object, format, units, THREE) {
  if (units === LEGACY_UNITS) {
    const unit = stageUnitScale(object, format);
    object.scale.setScalar(unit);
    return { mode: 'legacy', unit };
  }
  if (units !== null && units !== undefined) throw new Error(`場面インスタンスの units が不正です: ${units}`);
  if (format === 'PMX') {
    object.scale.setScalar(.08);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object, true);
    object.position.y -= box.min.y;
  } else normalizeModel(object, format, THREE);
  return { mode: 'v05', unit: null };
}
```

拡張子を `.mjs` にするのは、Node の単体試験（§6.2）から直接 import するため。`pmx-lip-overlay-v199.mjs` と同じく、`multi-model-ui-v58.js` から ES module として読み込む（`studio/package.json` の `type: module`）。`studio/v05/index.html` は変えない（import で読まれる）。

### 4.5 `studio/v05/js/multi-model-ui-v58.js`（③の読込と画面）

1. import（`:11`）を置き換える。`normalizeModel` はこのファイルでは `:1504` だけで使っているので、その import は消す。

   ```js
   import {placeInstanceObject,LEGACY_UNITS} from './instance-units-v189.mjs';
   ```

2. 文言の既定（`:28-34` の `tr` の表）に2つ足す：`legacyUnits:'（旧の大きさ）'`、`legacyUnitsHint:'旧画面と同じ大きさで置いています（旧保存の取込で置いたもの）'`。
3. 印を表示用に覚える変数を、`:37` の `let` の並びの次の行に足す：`let unitsById=new Map();`
4. 場面インスタンスを読み直す処理で、API の応答を受け取った直後・`reconcile` の前（`:1614` と `:1615` のあいだ）に、表を作り直す。

   ```js
   unitsById=new Map((data.instances||[]).map(row=>[row.id,row.units??null]));
   ```

   `controller.reconcile` を呼ぶのはこの1か所だけ（`:1615`）。毎回作り直すので、消えたインスタンスの記録は残らない。`loadInstance` や `dispose` では触らない。
5. `loadInstance`（`:1494`）の引数に `units` を足し、`:1499-1504` を置き換える。

   ```js
   async loadInstance({asset,instanceId,units}){
     const loaded=await loadModel(asset,libs);
     const object=loaded.object;
     try{
       placeInstanceObject(object,loaded.format,units,libs.THREE);
       const root=new libs.THREE.Group();
       ...（:1505 以降は変えない）
   ```

6. 選択欄（`updateStatus`、`:384`）の選択肢に、印のあるものだけ注釈を付ける。

   ```js
   for(const id of s.ids){
     const legacy=unitsById.get(id)===LEGACY_UNITS;
     const option=new Option(id+(legacy?tr('legacyUnits'):''),id);
     if(legacy)option.title=tr('legacyUnitsHint');
     choose.add(option);
   }
   ```

   値（`value`）は今と同じIDなので、選択の処理と既存の試験（`selectOption(ID)`）は変わらない。

7. 試験と実データ確認のための読み取り `floorProbe` を、`frameProbe`（`:2533-2547`）の直後に足す。床の高さを測るためだけに使い、画面の動作は変えない。

   ```js
   floorProbe(instanceId,point){
     const target=controller?.getLoaded(instanceId);
     if(!opened||!target?.root||!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))return null;
     const THREE=target.libs.THREE;
     target.root.updateMatrixWorld(true);
     const ray=new THREE.Raycaster(new THREE.Vector3(...point),new THREE.Vector3(0,-1,0));
     const hit=ray.intersectObject(target.root,true)[0];
     return {instanceId,from:point,y:hit?hit.point.y:null};
   },
   ```

   point から真下へ光線を出し、そのインスタンスの形状に最初に当たった点の y を返す。当たらなければ `y: null`。

### 4.6 文書

[取込の操作説明書](../v05/LEGACY_IMPORT_GUIDE_JA.md)に、次の節「取り込んだキャラクター・ステージの大きさ」を足す（文はこのまま使う）。

- 旧保存のキャラクターとステージは、旧のシーン画面（②）と同じ大きさで置きます。3D場面の選択欄では、名前のあとに「（旧の大きさ）」と表示します。
- 旧保存にキャラクターの配置が保存されていないときは、②と同じ既定の位置に置きます。旧のカメラ画面（①）はモデルの高さを合わせて表示していたので、①とは大きさや向きが違うことがあります。このときは確認画面に注意を出します。
- 取り込んだキャラクター・ステージを消して置き直すと、v0.5 の大きさの規則（高さ2mなど）に戻ります。旧の大きさに戻すには、［取込を取消］のあと、もう一度［取り込む］を押してください。v0.5 で置いたステージの大きさの規則は、今後の「ステージと撮影」の段階で見直します。
- この版より前に取り込んだ作品は、大きさが旧の画面と合っていません。合わせるには［取込を取消］のあと、もう一度［取り込む］を押してください。
- ［取込を取消］をすると、取り込んだキャラクター・ステージと一緒に、あとから付けた表情キーや、それらを対象にしたあとから置いた動作のクリップも消えます。取消の確認画面の一覧を見てから押してください。取消のあとも作品にクリップや3D場面が残っていると、もう一度取り込めません（取り込めるのは空の作品だけです）。そのときは［＋ 新規作成］で空の作品を作って取り込んでください。
- 取り込んだ作品は、この版より前の BAI Creator Studio で開かないでください。前の版では、その作品の3D場面・MP4の書き出し・動作の割り当て・口パクの採用・取込の取消がエラーになります（ファイルは書き換わらず、この版に戻せば開けます）。

[取込設計](LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md)の WP-L8a 節に「実装済み・試験結果・未検証」を1〜3行で追記する（共通の完了条件3）。

### 4.7 試験と確認の台本

- `tests/helpers/box-glb.cjs`（新規。§6.3）
- `tests/studio-v05-legacy-units-l8a.test.cjs`（新規。§6.3）
- `tests/studio-v05-instance-units.test.mjs`（新規。§6.2）
- `tests/test_studio_v05_scene_instances_units.py`（新規。§6.1）
- `tools/legacy_import_real_check.py`・`tools/legacy_import_real_check_ui.cjs`・`tests/test_legacy_import_real_check.py`（§6.0・§6.4）

### 4.8 変えないもの

| ファイル | 変えない理由 |
|---|---|
| `server.py`（`:1222-1223` の `allowed`）、`mcp_server.py`、`webmcp.js` | 印は取込だけが付ける。手で付ける操作は承認されていない |
| `camera_3d.js`、`studio/js/**`（`normalize.fork.js`・`scene-parts.js`・`placement.js`・`character-placement.js`・`three-host.js` を含む） | ①②の見た目と、①②の照合試験（`tests/studio-p2-normalize-parity.test.cjs`）を変えない |
| `studio/v05/js/actual-motion-loader-v22.js` | 単体の動作プレビュー。場面インスタンスを使わない |
| `studio/v05/js/shared-scene-v57.js`、`spatial-*.js` | root の transform の当て方は変えない |
| `studio_v05_media_render.py`、`tools/render_v05_scene_frames.cjs` | MP4は同じ画面を開くので、印は自動で効く |
| `studio_v05_legacy_import_record.py` | 手順の項目の検査は n・kind・status だけ（`:100-111`）。`units` を足しても通る |
| `tests/helpers/studio-harness.cjs` | skip を防ぐ仕組みは新しい試験の中だけに置く（§6.3） |
| 既存の場面インスタンスのファイル、既存の取込記録 | 移行しない。書き換えない |

## 5. 取消・逆変換・往復試験との整合

| 試験 | L8a 後 | 確かめ方 |
|---|---|---|
| R1 元を壊さない | 変わらない。印は v0.5 の場面インスタンスのファイルにだけ書く | 既存の R1 の試験をそのまま通す |
| R2 往復一致 | 保存値が旧の値のままなので、いまの逆変換で元の bundle に戻る。印が一致するので `UNITS_CHANGED` は出ない | 既存の R2（bundle_a〜j）に、「M3・M4 のインスタンスに `units == "legacy"`、S1 のインスタンスに `units` が無い」を足す |
| R3 取消 | インスタンスを消すので印も消える。取消のあと `instances` が取込前と等しい | 既存の R3 をそのまま通す |
| R4 編集後の逆変換 | ③で印付きのインスタンスの倍率・位置を変えると、旧と同じ意味の数値なので、そのまま旧の `scale`・`position` に出る | 既存の R4 をそのまま通す。追加：印を消した `current` を手で作る → `/workspace/stage` に `UNITS_CHANGED`、`workspace.stage` は元の値、`changed` は空 |
| L8a より前の記録 | 手順にもインスタンスにも印が無い。取消・逆変換はいまと同じ。見た目は③の既定のまま | 下の手順 |

L8a より前の記録の試験の作り方：bundle_a で取込を適用したあと、(1) 取込記録の JSON の `steps` の各要素から `units` を消し、(2) 場面インスタンスのファイルの各行から `units` を消して、どちらもファイルに書き戻す。そのうえで、R2（`current` を組み直して `_export_legacy_for_test`）が元の bundle と深く等しく `unrepresentable` が空であること、R3（`revert`）で `instances` が取込前と等しいことを確かめる。

L8a より前に取り込んだ作品は自動では直さない。直すには、利用者が［取込を取消］→［取り込む］を行う（§4.6 の説明書）。自動で印を足すと、取り込んだあとに利用者が③で合わせた大きさが変わってしまうため。

## 6. 試験

共通：[共通試験手順](../handoff/TESTING_GUIDE_JA.md)に従う。取込の試験では skip を使わない。3D描画の試験が skip されたら「未検証」と記録し、合格にしない。skip が黙って通らないように、§6.3 の試験は `BAI_REQUIRE_3D=1` のとき three が無ければ失敗する。

### 6.0 実装の前に：所有者のPCで S01 の元の外接箱を測る

目的：L8a で S01 が旧の大きさに戻ったとき、所有者の症状（S1 が S01 の中に隠れる）が直る見込みがあるかを、実装の前に確かめる。

1. `tools/legacy_import_real_check_ui.cjs` に、取込ダイアログを開く前（`:36` の `page.goto(.../studio/v05/index.html)` の前）の手順を足す。同じ隔離サーバー（旧保存の複製）の `/workspace/06` を開き、`window.baiStudio.project.getState().status === 'ready'`、`window.baiStudio.assets.getState().status === 'ready'`（`tests/studio-p2-viewport.test.cjs:170-172`）、旧保存の `workspace.stage` が値なら `window.baiStudio.viewport.getState().stage?.assetId` が空でないことを待ち、`getState().bounds`（`studio/js/viewport/three-host.js:293-299`）と画像 `00_scr06_legacy.png` を取る。最後の JSON に `scr06: {stageAssetId, bounds}` を足す。
2. `tools/legacy_import_real_check.py` の報告（`render_ja`、`:328-372`）に「旧 SCR-06 の外接箱：最小・最大・大きさ」を1行足す。`tests/test_legacy_import_real_check.py` に、`scr06` がある場合と無い場合の報告の行を確かめる試験を1件足す。
3. 所有者のPCで、いまの製品コード（L8a の §4.1〜§4.5 を入れる前）のまま台本を実行する。旧保存の S01 は位置0・回転0・大きさ1・u=1 なので、この外接箱が L8a のあとの③の S01 の外接箱の予想値になる。
4. 次の3つを手で判定し、`docs/v05/LEGACY_IMPORT_REAL_DATA_<日付>_JA.md` と WORK_STATE.json に書く。
   - (a) 原点の真上（S1 が立つ場所。S1 は③の既定の式で XZ の中心を原点、足を y=0 に置く）が外接箱の内側か：`min.x < 0 < max.x` かつ `min.z < 0 < max.z`。
   - (b) ③の初期カメラ (2, 1.6, 4.5) が外接箱の内側か。
   - (c) 床の見込み：`min.y ≤ 0.02`（外接箱の最小yが S1 の足 y=0 より上にあると、S1 は床の下に埋まる）。
5. (a)〜(c) がすべて真なら、§8 の手順1へ進む。どれかが偽なら、L8a の換算だけでは症状が直らない。実装に進まず、測った値を添えて §10 の質問を所有者に出す。

### 6.1 Python の単体試験

`tests/test_studio_v05_scene_instances_units.py`（新規。`tmp_path` に catalog と作品1件を作る。リポジトリ直下の `test_v05_scene_instances_v57.py` の作り方に合わせる）

| # | 内容 | 期待 |
|---|---|---|
| U1 | `mutate(action="add", units="legacy", …)` | 保存ファイルの行に `"units": "legacy"`、行のキーは7つ（既存の6つ＋`units`）。応答（`mutate` の戻り値は `read(..., assets)`、`:367`）の行は、その7つに `available` と `asset` を加えた9つ |
| U2 | `units="other"` で add | `SceneInstancesError("Units can only be set to 'legacy' when adding")`、ファイルは変わらない |
| U3 | `action="update"` に `units="legacy"` | U2 と同じ例外 |
| U4 | 印付きの行を `update`（transform・visible・locked） | 印が残る |
| U5 | 印付きの行を `remove` | 行ごと消える |
| U6 | L8a より前の形のファイル（6キーの行だけ）を `read`、`update` | 読める。書いたファイルの行に `units` が無い。行のキーの集合が6つのまま |
| U7 | 保存ファイルの行に `"units": "x"` を書いて `read` | 例外の文が `Scene-instances file unreadable; original retained`、その `__cause__` の文が `Invalid scene instance units; original retained`。ファイルは変わらない |
| U8 | HTTP：`POST /api/studio/v05/scene/instances` に `units` を付けて add（`tests/test_studio_v05_legacy_import_http.py` と同じ起動方法） | 400 `Invalid scene instances fields` |

既存の試験の直し（期待値を L8a の仕様に合わせる。ここに書いたもの以外は変えない）：

- `tests/test_studio_v05_legacy_import_plan.py:73` の `EXPECTED` の `UNIT_SEMANTICS_DIFFER` の文を、§3.4 の新しい文言にする（親設計 §3.4 の表と一致させる）。
- 同 `:141-146`：character とステージの手順の期待に `"units": "legacy"` を足す。
- 同 `:150`：bundle_a（`character` が値）の M3・M4 の `codes` を `[]` にする。
- 同 `:205-215`（`test_m3_character_cases`）：bundle_b と bundle_e（どちらも `character` が無い）の M3 で `codes == ["UNIT_SEMANTICS_DIFFER"]`、手順に `step["units"] == "legacy"` を足す。さらに、bundle_a の `workspace.character` を `None` にした bundle を `L.plan(make_inputs(b))` に渡し、M3 の `codes == ["UNIT_SEMANTICS_DIFFER"]` を1件足す（`:231-233` の作り方と同じ）。
- 同 `:252`：`m4["codes"] == []`。
- 同 `:391`（`test_summary_and_source_info`）：bundle_a の `"warnings": 2` を `0` にする。
- `tests/test_studio_v05_legacy_import_music_dance.py`：S1 の手順に `units` が**無い**ことを1行足す（`"units" not in step`）。
- `tests/test_studio_v05_legacy_import_timeline_editor.py:138` の説明文の「（M3・M4 の UNIT_SEMANTICS_DIFFER は除く）」を「（M3 の character が無いときの UNIT_SEMANTICS_DIFFER は除く）」に直す（式は変えない）。
- `tests/test_studio_v05_legacy_import_record.py:37` は記録の形の試験で、コードの値を変えない。
- `tests/test_studio_v05_legacy_import_apply.py`・`_http.py`・`_mcp.py`・`_roundtrip.py`：インスタンスの行を辞書で丸ごと比べている箇所があれば、M3・M4 に `"units": "legacy"` を足す。`grep -n '"parent_id"' tests/test_studio_v05_legacy_import_*.py` で探す。
- `tests/studio-v05-legacy-import-ui.test.cjs:213` は summary の値と画面の数の一致なので、変えない（値が変わっても一致は保たれる）。
- `tests/test_studio_v05_legacy_import_roundtrip.py`：§5 の追加（R2 の印、`UNITS_CHANGED`、印の無い古い記録）。

### 6.2 Node の単体試験

`tests/studio-v05-instance-units.test.mjs`（新規。`three` は `node_modules/three/build/three.module.js` から import する。WebGL は使わない。この試験は three が必須なので、`node_modules/three` が無ければ skip せずに失敗にする）。期待値は試験の中に数で直接書く（`normalizeModel` を呼ぶ別の関数と比べると、自分と自分を比べることになるため）。

| # | 内容 | 期待（成分ごとの差が 1e-12 以下） |
|---|---|---|
| N1 | 箱のメッシュ（min (2,−0.5,−5)、max (12,3.5,1)）を Group に入れた object、format `GLB`、units `null` | 拡大0.5、位置 (−3.5, 0.25, 1)。戻り値 `{mode:'v05', unit:null}` |
| N2 | 同じ object、units `undefined` | N1 と同じ |
| N3 | 同じ箱、format `PMX`、units `null`（PMX の代わりに通常の Mesh で式だけ確かめる） | 拡大0.08、位置 (0, 0.04, 0) |
| N4 | format `GLB`、units `'legacy'` | 拡大1、位置 (0,0,0)。戻り値 `{mode:'legacy', unit:1}` |
| N5 | format `PMX`、units `'legacy'` | 拡大0.08、位置 (0,0,0) |
| N6 | format `FBX`、`object.userData.unitScaleFactor = 2.54`、units `'legacy'` | 拡大0.0254 |
| N7 | units `'other'` | 例外 |

`test_v05_multi_model_v58.cjs`（リポジトリ直下。`node test_v05_multi_model_v58.cjs` で単独実行。`test:node-all` の対象外）に2つ足す：(1) `loadInstance` が受け取る引数に `units` があり、行の `units` と同じ（無い行は `null`）。(2) 同じIDで `units` が変わった応答を `reconcile` に渡すと、古いものを捨てて読み直す。

### 6.3 ブラウザの比較試験（③と①②を同じ素材で比べる）

新規 `tests/studio-v05-legacy-units-l8a.test.cjs`。ポート 8944。隔離サーバー1つで、ケースごとに旧保存を書き直し、新しい作品へ取り込む。

**試験の作り（必ずこの形にする）**

- 先頭で `const REQUIRE_3D = process.env.BAI_REQUIRE_3D === '1';` とし、`REQUIRE_3D` なら `assert.ok(harness.haveThree(), 'BAI_REQUIRE_3D=1 なのに node_modules/three がありません')` を試験の最初に置き、skip しない。そうでなければ `harness.skip3d()` を使う。
- 試験の選択肢は `{ ...(REQUIRE_3D ? {} : harness.skip3d()), timeout: 900000 }`。
- 各ケースは、まず**測るだけ**を行い、値を配列 `measured` にためる。途中の確認（手順3の印の有無も含む）は `assert` せず、`measured` に `checks: [{name, ok, detail}]` として入れる。全ケースを測り終えたら、`process.stdout.write('L8A_RESULT ' + JSON.stringify(measured) + '\n')` で1行出し、その後でまとめて `assert` する。こうすると、変更前のコードでも最後まで測れて、対照と同じ値になることを記録できる（§8 の手順1）。
- ③、SCR-06、`camera.html` のどのページも `server.newPage(browser, { viewport: { width: 1280, height: 720 }, expectErrors: [/unknown char code \d+\./] })` で開く（PMX の読込で出る既知の警告。`tests/studio-v05-legacy-import-ui-3d.test.cjs:18`）。最後に各ページで `harness.assertNoErrors(page)`。

**素材**

- 新しい補助 `tests/helpers/box-glb.cjs`：`boxGlb(min, max) -> Buffer`。三角形12枚の直方体1つだけの GLB（JSON：`asset.version "2.0"`、`scene 0`、ノード1つ、メッシュ1つ、`POSITION`（FLOAT VEC3、8頂点、`min`・`max` 付き）と `indices`（UNSIGNED_SHORT、36個）。JSON チャンクは空白で、BIN チャンクは0で4バイト境界に詰める）。材質は付けない。
- ステージ：`boxGlb([2,-0.5,-5],[12,3.5,1])` を `/api/library-assets/upload?kind=stage&name=box_stage.glb` で登録（`tests/helpers/legacy-import-seed.cjs:34-35` と同じ呼び方）。ID は応答の `item.id`（`library:…` の形）。
- GLBキャラクター（スキンなし）：`boxGlb([0.5,0.1,-0.2],[1.1,1.7,0.2])` を、`startServer` の seed で `integrated_v02/assets/cccccccccccccccccccc.glb` と `integrated_v02/user_assets.json`（`{id:'user-cccccccccccccccccccc', name:'box_char.glb', filename:'cccccccccccccccccccc.glb', kind:'model', bytes}`）に置く（`tests/studio-p2-camera.test.cjs:273-278` と同じ形）。
- スキン付きGLBキャラクター：`tests/fixtures/synthetic_test_model.glb`（骨10本・skin 1つ・アニメーション1つ。逆束縛行列は静止姿勢の逆で、静止姿勢の頂点の外接箱は accessor の min (−0.25, 0, −0.15)・max (0.25, 2, 0.15)。アニメーションの0フレーム目も同じ外接箱：`tests/fixtures/synthetic_test_model.expected.json` の `perFrame["0"]`）を、seed で `integrated_v02/assets/kkkkkkkkkkkkkkkkkkkk.glb` と同じ `user_assets.json` の2行目（`id:'user-kkkkkkkkkkkkkkkkkkkk'`、`filename:'kkkkkkkkkkkkkkkkkkkk.glb'`、`kind:'model'`）に置く。
- PMX：`tests/fixtures/minimal_pmx.zip` を `/api/pmx-zip-upload?slot=A&name=minimal_pmx.zip` で登録し、`/api/assets` で `format === 'PMX'` のIDを取る（`legacy-import-seed.cjs:30-31,38-39`）。
- FBX：`tests/fixtures/minimal_model.fbx`（ASCII、三角形1枚、頂点 (0,0,0)・(1,0,0)・(0,1,0)、`UnitScaleFactor` なし＝u=0.01）を seed で `manifest.json`（`{files:[{id:'f-model', name:'model.fbx', kind:'modelA', size}], mapping:{}}`）と `files/f-model.fbx` に置く（`tests/studio-p2-camera.test.cjs:281-282`）。ID は `fbx:f-model`。
- ③と SCR-06 で使う ID は、`/api/assets` の応答から取る：GLB キャラクターは `id === 'integrated:cccccccccccccccccccc.glb'`、スキン付きは `'integrated:kkkkkkkkkkkkkkkkkkkk.glb'` の行があることを確かめ、その id を使う。旧保存の `workspace.asset` には、接頭辞の無い旧の綴り（`cccccccccccccccccccc.glb` など）を書く。

**ケース**（旧の `project_state.workspace.json`。どれも `frame: 0`、`clip: null`）

| ケース | `asset` | `character` | `stage` |
|---|---|---|---|
| S | `''` | なし | 箱ステージ、位置 (1, 0, −2)、回転 (0, 90, 0)、倍率 1.5 |
| G | `cccccccccccccccccccc.glb` | 位置 (0.5, 0, 1)、回転 (0, 0, 0)、倍率 1.25 | S と同じ |
| K | `kkkkkkkkkkkkkkkkkkkk.glb` | 位置 (0.5, 0, 1)、回転 (0, 90, 0)、倍率 1.5 | なし |
| P | PMX のID | 位置 (−1, 0, 0.5)、回転 (0, 30, 0)、倍率 1.2 | なし |
| F | `fbx:f-model` | 位置 (0, 0, 0)、回転 (0, −45, 0)、倍率 2 | なし |
| A | `cccccccccccccccccccc.glb` | なし（項目ごと書かない） | なし |

`project_state.json` は `{schema:1, timeline:[], history:[], cursor:-1, title:'L8a-<ケース>'}`、`camera_project.json` は `{schema:1, fps:30, duration:300, keys:[{frame:0, position:[0,1.6,5], target:[0,1,0], fov:40}]}`。`music_dance_project.json` は書かない（あれば消す）。

**手順**（ケースごと）

1. 旧の3ファイルを `server.dataDir` に書き、`createProjectWithSnapshot`（`legacy-import-seed.cjs:69-74`）で作品とスナップショットを作る。
2. `GET /api/studio/v05/project/legacy-import-preview?id=<ID>` の `expected` を使い、`POST /api/studio/v05/project/legacy-import/apply` に `{id, expected, include: [], fps_policy: 'keep_if_same', confirm: true}` を送る。
3. `GET /api/studio/v05/project/legacy-import?id=<ID>` の取込記録の `steps` から、`kind === 'scene_add'` の各手順の `role`（`character`・`stage`）と `instance_id` の対応を取る。`GET /api/studio/v05/scene/instances?id=<ID>` で、取り込んだ全インスタンスに `units: 'legacy'` があるかを `checks` に入れる。M3 の確認の項目の `codes` も記録する（A だけ `["UNIT_SEMANTICS_DIFFER"]`、ほかは `[]` になるはず）。
4. ③：`/studio/v05/index.html` を開き、`window.baiGo('projects')` のあと、題名の作品カードの `[data-openproject]` を押し、`document.querySelector('#v06project')?.value === ID` を待つ（`tests/studio-v05-legacy-import-ui-3d.test.cjs:31-32`）。`#v70sceneOpen` を押し、`BAIStudioMultiScenePreview.status().loaded` がインスタンス数になるまで待つ。インスタンスごとに `frameProbe(id)` を読む（`multi-model-ui-v58.js:2533-2547`）。あわせて次を記録する。
   - 選択欄 `#v58-multi-preview select` の各選択肢の `value`・`textContent`・`title`。印付きのインスタンスの選択肢は、`value` が ID のまま、`textContent` が `ID + '（旧の大きさ）'`、`title` が `legacyUnitsHint` の文。
   - ステージがあるケース（S・G）は、`floorProbe(ステージのID, [−2, 10, −12])` の `y`。
5. ② SCR-06：`/workspace/06` を開き、`window.baiStudio.project.getState().status === 'ready'` と `window.baiStudio.assets.getState().status === 'ready'` を待つ（`tests/studio-p2-viewport.test.cjs:170-172`）。ステージがあるケースは `window.baiStudio.viewport.getState().stage?.assetId === ステージのID`、キャラクターがあるケースは `getState().character?.assetId === キャラクターのID`（`integrated:…` の綴り）を待つ。`getState().bounds` を読む（`studio/js/viewport/three-host.js:293-299`。content に入るのはキャラクターとステージだけ：`scene-view.js:295,315`）。
6. ① `camera.html`（ケース G・K・P・F。A は値を記録するだけ）：`/camera.html` を開く。`window.addEventListener('bai-camera-model-bounds', …)` で `detail.source === 'model'` の最後の値を記録する。`page.once('dialog', d => d.accept())` を置いて `#bundle-load` を押し（`camera_project_bundle_ui.js:11`）、`#bundle-status` に「復元しました」が出るのを待ってから、記録した最後の値を読む（`camera_3d.js:267-276`、頂点から測る外接箱）。K は `clip: null` なので、読込時に選ばれた動きは止まり、0フレーム目（静止姿勢と同じ）のまま測られる（`camera_3d.js:317,339-342`）。
7. 比べる（下の表）。

| 対 | 旧の値 | ③の値 | 測り方の一致 |
|---|---|---|---|
| ステージ（S） | SCR-06 の `bounds` | ステージの `frameProbe(id).root` | どちらも形状の箱（`setFromObject(…)`） |
| キャラクター（G・K・P・F） | `camera.html` の `bai-camera-model-bounds` | キャラクターの `frameProbe(id).precise` | どちらも頂点（`setFromObject(…, true)`） |
| 場面全体（G） | SCR-06 の `bounds`（キャラクター＋ステージ） | 2つの `frameProbe(id).root` の和 | どちらも形状の箱 |
| キャラクター（A） | SCR-06 の `bounds`（既定の配置） | `frameProbe(id).root` | どちらも形状の箱。`camera.html` の値は記録だけして比べない（§3.4） |

スキン付きのメッシュ（K・P・F・R）は、形状の箱で測ると three.js が `SkinnedMesh.boundingBox` を最初に測ったときの値を使い回す（`node_modules/three/src/math/Box3.js:191-199`）。測った時点の骨の行列が画面ごとに違いうるので、これらは頂点で測る `camera.html` とだけ比べ、SCR-06 とは比べない。形状の箱で比べる対（S・G・A）は、スキンの無い直方体の GLB だけを使う。

**合否**（全ケースを測ったあとにまとめて判定する）

- 各対で、最小・最大の6成分すべてが `|③ − 旧| ≤ ε`（§6.6 の式）。
- 取り込んだ全インスタンスに `units: 'legacy'`。M3 の `codes` が上の手順3のとおり。
- 選択欄の注釈が手順4のとおり。
- 基準の画面そのものが正しいことを確かめるため、旧の値が手で計算した値と ε 以内で一致する。

  | ケース・対 | 最小 | 最大 | D | Rₚ/s | ε |
  |---|---|---|---|---|---|
  | S ステージ（SCR-06） | (−6.5, −0.75, −20) | (2.5, 5.25, −5) | 18.4932 | 13.4629 | 0.000330 |
  | G キャラクター（`camera.html`） | (1.125, 0.125, 0.75) | (1.875, 2.125, 1.25) | 2.1937 | 2.0347 | 0.0000523 |
  | G 場面全体（SCR-06） | (−6.5, −0.75, −20) | (2.5, 5.25, 1.25) | 23.8445 | 13.4629（2つのうち大きい方） | 0.000383 |
  | K キャラクター（`camera.html`） | (0.275, 0, 0.625) | (0.725, 3, 1.375) | 3.1249 | 2.0211 | 0.0000615 |
  | F キャラクター（`camera.html`） | (0, 0, 0) | (0.0141421, 0.02, 0.0141421) | 0.0282843 | 0.0141421 | 0.0000104 |

  P は `minimal_pmx.zip` の頂点を設計で手計算していないので、`camera.html` と③の一致だけで判定する。
- ステージの床：S と G の `floorProbe(…).y` が 5.25 と ε（S の値）以内。
- **対照（試験の感度）。** 同じサーバーで、次の番号どおりに行う。
  1. `createProjectWithSnapshot` で空の作品を作る（旧保存はケース S のまま）。取込はしない。
  2. `GET /api/studio/v05/scene/instances?id=<ID>` で `instances` が空であることを確かめ、`revision` を取る。
  3. `POST /api/studio/v05/scene/instances` に `{project_id: ID, action: 'add', revision, asset_id: <箱ステージの library: ID>, transform: {position: [1,0,-2], rotation: [0,90,0], scale: [1.5,1.5,1.5]}}`（印なし）。
  4. 応答の `revision` で、同じく `{…, asset_id: 'integrated:cccccccccccccccccccc.glb', transform: {position: [0.5,0,1], rotation: [0,0,0], scale: [1.25,1.25,1.25]}}` を add。
  5. この作品で手順4（③）を行い、ステージの `frameProbe(id).root` と、キャラクターの `frameProbe(id).precise` を読む。
  6. ステージはケース S の SCR-06 の値と、キャラクターはケース G の `camera.html` の値と比べる。ε はそれぞれ S・G キャラクターの値。どちらも差の最大が `100ε` **以上**であること。計算上の値は、ステージが最小 (−1.25, 0, −5.75)・最大 (3.25, 3, 1.75)（差の最大 14.25m）、GLBキャラクターが最小 (0.03125, 0, 0.6875)・最大 (0.96875, 2.5, 1.3125)（差の最大 1.09375m）。③の値がこの計算上の値と ε 以内で一致することも確かめる。
- 試験の最後に出す `L8A_RESULT` の1行に、各ケースの旧と③の値、ε、差の最大、`checks` を入れる（記録用）。

**実素材のケース R（所有者のPCで必須）**

同じファイルに2つめの `test()` として置く。ポート 8945。

- 素材：`BAI_REAL_MMD_DATA` の実PMX。探し方と seed の作り方は `tests/studio-v05-camera-preview-real.test.cjs:10-13,35-43` と同じ（`mmd_assets.json` の A から、モデルと `tex/` 以下を seed に入れる）。ID は `/api/assets` の `format === 'PMX'` の行。
- 旧保存：`asset` は実PMXのID、`character` は位置 (0.3, 0, −0.4)、回転 (0, 20, 0)、倍率 1.1、`stage` なし。
- 手順：上の手順1〜4・6。`camera.html` の `bai-camera-model-bounds` と③の `frameProbe(id).precise` を比べ、§6.6 の ε 以内であること。
- skip の条件：実PMX が無いときは skip する。ただし `BAI_REQUIRE_REAL=1` のときは skip せずに失敗させる（所有者のPCで §6.5 と一緒に実行するとき、これを付ける）。

### 6.4 実データでの確認（WP-L9 の台本を広げる）

所有者のPCで開発側が実行する（所有者に確認は頼まない）。台本 `tools/legacy_import_real_check.py` と `tools/legacy_import_real_check_ui.cjs` に、§6.0 の SCR-06 の読み取りに加えて、次を足す。

1. 3D場面の外接箱（`_ui.cjs:89-93`）のあとで、取込記録（`GET /api/studio/v05/project/legacy-import?id=<ID>`）の `steps` から、`role` が `character`・`stage` の `instance_id` を取る。曲とダンスのモデル（S1）は、`instances` のうち `asset_id` が `library:` で始まらず、M3 の `instance_id` でもない行（M3 が無い所有者の旧保存では、ステージ以外の1体）とする。
2. 各インスタンスの `frameProbe(id)`（`root`・`precise`・`camera`）を読む。S1 の `precise` の中心 (cx, cy, cz) から `floorProbe(ステージのID, [cx, cy, cz])` を読む。
3. 次の対・条件を作る。

   | # | 内容 | 合格 |
   |---|---|---|
   | L1 | ステージ：§6.0 の SCR-06 の `bounds` と、③のステージの `frameProbe(id).root`（M3 があるときは、③の M3 と M4 の `root` の和と比べる） | 6成分すべて ε 以内。M3 があるときは、キャラクターがスキン付きでありうるため（§6.3 の注）、この対は記録だけにし、L1' を合否に使う |
   | L1' | M3 があり `workspace.character` が値のとき：`/camera.html` で §6.3 の手順6を行い、キャラクターの `precise` と比べる | ε 以内（値でなければ「比べない（基準は SCR-06）」と書く） |
   | L2 | S1 の `precise` の中心が、ステージの `root` の外接箱の内側 | 3成分とも `min < 中心 < max` |
   | L3 | S1 の足（`precise.min.y`）と床（`floorProbe` の `y`） | `y` が null でなく、`−0.02 ≤ 足 − 床 ≤ 0.20`（m） |
   | L4 | ③のカメラ（ステージの `frameProbe(id).camera`。保存した視点が無ければ初期値 (2, 1.6, 4.5)）が、ステージの `root` の外接箱の内側 | 3成分とも `min < カメラ < max` |
   | L5 | 画像 `05_scene_3d.png`・`06_scene_3d_focus_character.png` を開発側が開き、S1 が見えるかを目で見る | 「見える」。ステージの壁などで S1 が隠れていれば「見えない」で不合格 |

   L3 の幅の根拠：③の既定の式は S1 の静止姿勢の足を y=0 に置く。WP-L9 では、ダンスの動作を読み込んだ後の S1 の最小yが 0.132m だった（§1.4）。動作で足が上がる分として上を 0.20m、床に埋まっていないことを見るために下を −0.02m とした。

4. 出力の JSON に `l8a: {scr06, pairs: [{name, legacy: {min, max}, v05: {min, max}, eps, max_abs_diff, pass}], conditions: [{id, value, pass}], visual: null, pass}` を足す。`visual` は L5 の結果を開発側が書くまで `null` で、そのあいだ `pass` は `null`（未判定）にする。`report_JA.md` に、対ごとに「旧・③の大きさ・最小・最大、差の最大、ε、合否」、条件ごとに「値と合否」を1行ずつ書く。
5. 台本の単体試験 `tests/test_legacy_import_real_check.py` に、`l8a` の報告の書き方（合格・不合格・未判定の3通り）を1件足す。
6. Chrome が無ければ、L8a は「未検証」と書き、合格にしない。
7. L1 が ε を超えたときは、しきい値を広げない。S01 にスキン付きのメッシュがあるか（`frameProbe(id).root` と `precise` の差）を記録し、§6.3 の注（スキン付きのメッシュの形状の箱）に当たるかを調べてから、この文書を直す。
8. L1 が合格で L2〜L5 のどれかが不合格のときは、L8a の換算は旧と一致したが、所有者の症状は直っていない。完了にしない。値と画像を添えて §10 の質問を所有者に出す。

実データの合格条件：L1（M3 があるときは L1'）と L2〜L5 がすべて合格。

### 6.5 既存の③の作品への影響の試験

| 試験 | 期待 |
|---|---|
| §6.1 の U6（印の無い古いファイル） | 読めて、書いても印が増えない |
| §6.2 の N1〜N3（印なしの式の結果が、いまのコードの式の値と同じ） | 等しい |
| 既存の3D試験を、変更前と同じ環境で `BAI_REQUIRE_3D=1` を付けて実行：`tests/studio-v05-legacy-import-ui-3d.test.cjs`、`tests/studio-v05-composite-scene-preview.test.cjs`、`tests/studio-v05-scene-mp4.test.cjs`、`tests/studio-real-stage.test.cjs`、`tests/studio-p2-normalize-parity.test.cjs`、`node test_v05_multi_model_v58.cjs` | すべて合格。出力の `# skip` が0であることを確かめる（既存の試験は `BAI_REQUIRE_3D` を見ないので、three が無ければ skip になる。そのときは合格にしない）。失敗したら、変更前のコードでも同じ失敗かを確かめて記録する |
| `tests/studio-v05-saved-composition-real.test.cjs`（`BAI_REAL_MMD_DATA` 指定、実GPU）と、§6.3 のケース R（`BAI_REQUIRE_REAL=1`） | **所有者のPCで §6.4 と一緒に必ず実行する。** skip された結果は完了の根拠にしない。saved-composition は、重なり（IoU）と重心のずれを、順3の記録（0.886・0.005）と並べて記録する。この試験の作品は印を持たないので、値は同じになるはず。違えば原因を調べる |
| `python -m pytest -q`、`npm run test:node-all`、`npm run typecheck` | 既存の失敗（`test_v05_timeline_drag_static` 1件、node-all の既知の失敗）の件数が増えない |

### 6.6 しきい値の根拠

- 案2では、③と旧が同じ three.js の読込結果に同じ式を当てる。理論上の差は0。
- 差が出るのは保存値の丸めだけ。③は保存値を小数点以下6桁に丸める（`studio_v05_scene_model.py:59`）。旧の値が7桁以上のとき、成分ごとの丸めの差は最大 5×10⁻⁷。
  - 位置 Δp：外接箱の各成分に、最大 5×10⁻⁷ m。
  - 倍率 Δs：頂点の世界座標は `p + R(r)·(s·u·v)` なので、Δs による動きは `Δs·u·|v| = (Δs/s)·|R(r)·(s·u·v)| ≤ (Δs/s)·Rₚ`。Rₚ は p から外接箱の8つの角までの最大の距離。最大 5×10⁻⁷ × Rₚ/s m。倍率が小さいとき、またはファイルの原点から離れた形状で大きくなる。
  - 回転 Δr：3成分で最大 3 × 5×10⁻⁷ 度 ≈ 2.6×10⁻⁸ rad。動きは最大 2.6×10⁻⁸ × Rₚ m。旧の倍率は 0.01〜100（`project_state_bundle.py:97`）なので Rₚ ≤ 100·Rₚ/s で、これは 2.6×10⁻⁶ × Rₚ/s 以下。
  - 合わせて、成分ごとの差は最大 `5×10⁻⁷ + 3.1×10⁻⁶ × Rₚ/s` m。
- three.js の行列は倍精度で、頂点の値（float32）は両側で同じなので、計算の差はこれより十分小さい。D の項は、その計算の差と、外接箱の大きさに比例する誤差への余裕。
- 上の上限に、定数の項で20倍、Rₚ/s の項で3倍以上の余裕を取り、`ε = 0.00001 × (1 + D + Rₚ/s)` m とした。D は旧の外接箱の対角の長さ。Rₚ と s は、その対に入るインスタンスごとに求め、対に2つ以上のインスタンスが入るとき（G の場面全体、L1 で M3 があるとき）は Rₚ/s の大きい方を使う。§6.4 では Rₚ を③の外接箱から求める（③と旧は ε 以内で等しいので、どちらで求めても ε はほぼ同じ）。
- 例：キャラクター（D≈2.2、p の近く、s≈1）で約0.05mm。100mのステージを原点に s=1 で置くと（D≈173、Rₚ≈173）約3.5mm。1000m級の素材を s=0.0123 で置くと（D≈21、Rₚ/s≈1700）約17mm で、丸めの上限（約5.3mm）を上回る。
- 実データで直す差（S01 が2mに縮む、キャラクターが2.0m・1.95mへ合わせられる）は、少なくとも数cm〜数十mで、ε より何桁も大きい。対照の `100ε` は、この差が確かに検出できることを確かめるための下限。
- 「6桁に丸めた保存値で旧の式を計算した値」を基準にする案は採らない。旧の画面は丸めていない旧の保存値を読むので、試験の入力を変えずにはその基準を作れないため（§11）。
- 画面の画素では比べない。①の `camera.html` はステージを描かず、①と③は画角・枠の形・背景が違うので、画素の比較は、大きさの一致ではなく画面の作りの違いを測ってしまう。③のプレビューとMP4の画素の一致は、順3の試験（`studio-v05-saved-composition-real.test.cjs`）で保たれている。見た目の判定は §6.4 の L5 で行う。

## 7. 既存の③の作品への影響

- **保存ファイル。** 既存の場面インスタンスのファイルは移行しない。印の無い行は、L8a 後も同じ検査を通る（`_ROW_KEYS` と同じ6つ）。保存し直しても印は増えない（§6.1 U6）。
- **見た目。** 印の無いインスタンスは、`placeInstanceObject` の「印なし」の道を通る。式も順も `multi-model-ui-v58.js:1499-1504` と同じ（§6.2 N1〜N3）。プレビューとMP4は同じ画面を通るので、MP4も変わらない。
- **操作。** HTTP・MCP・WebMCP・画面から印は付けられない（`server.py:1222-1223` を変えない。§6.1 U8）。③で新しく置くステージ・モデルは、これまでどおり正規化される。取り込んだものを消して置き直すと、印の無い③の規則になる（§4.6 の説明書、§9）。
- **L8a より前に取り込んだ作品。** 変えない。大きさを旧に合わせたいときは、利用者が取消と再取込をする（§5）。取消で消えるものは説明書に書く（§4.6）。
- **古い版のコード。** 印付きの作品を、この版より古いコードで開くと、その作品の場面インスタンスを読む処理がすべて `Scene-instances file unreadable; original retained` で失敗する（元のファイルは残る。範囲は §2 の注）。

## 8. 実装の順と完了条件

実装は標準モデルで、次の順に行う。手順2以降の各段で、共通の完了条件（[取込設計 §8](LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md) の「各WPの完了条件」1〜5）を満たしてコミットする。

0. §6.0（SCR-06 の読み取りを台本に足し、所有者のPCで S01 の元の外接箱を測る）。台本の変更と単体試験はこの段でコミットする。判定 (a)〜(c) のどれかが偽なら、ここで止まり §10 の質問を出す。
1. §6.3 の試験と `tests/helpers/box-glb.cjs` を書き、変更前のコードで実行する。`L8A_RESULT` の行で、比較の合否が失敗し、③の値が対照の計算上の値と同じ形（GLB は高さ2mへ、ステージは中心を原点へ）になることを確かめ、その行を WORK_STATE.json の `next`/`unverified` ではなく作業記録（`work_state.py done --summary`）とコミットの本文に写す。**この段では試験のファイルをコミットしない**（失敗する試験をコミットすると、共通の完了条件1に反するため）。WORK_STATE.json の更新だけをコミットする。
2. §4.1（保存）と §6.1 の U1〜U8。
3. §4.2（取込）と §6.1 の既存試験の直し、§5 の往復試験の追加。
4. §4.3〜§4.5（③の読込と画面）と §6.2。
5. §6.3 を `BAI_REQUIRE_3D=1` で実行して合格（出力に `# skip 0` と `L8A_RESULT` の行があることを確かめる）。§6.5 の回帰が合格。手順1の試験ファイルをここでコミットする。
6. §4.6 の文書、台帳（`FEATURE_REGISTER.json`・`.csv` の `DATA-008` の `detail`、`FEATURE_DETAIL_JA.md`、`TRACEABILITY_JA.md`、`PHASE_E_IMPLEMENTATION_STATUS.json`）、Issue #69 へのコメント。
7. §6.4 と、§6.5 の所有者のPCでの試験（saved-composition、ケース R）を所有者のPCで実行し、結果を `docs/v05/LEGACY_IMPORT_REAL_DATA_<日付>_JA.md` に書く。

**L8a の完了条件**（すべて満たすまで完了にしない）：

- §6.1・§6.2 が合格。
- §6.3（ケース S・G・K・P・F・A と対照）が `BAI_REQUIRE_3D=1` で合格し、skip が0件。
- §6.5 の回帰が合格（skip された3D試験は根拠にしない）。
- 所有者のPC・実GPUで、§6.3 のケース R（`BAI_REQUIRE_REAL=1`）と saved-composition の試験が合格。
- 所有者のPC・実GPUで、§6.4 の L1（または L1'）と L2〜L5 がすべて合格。L5 の目視は開発側が行い、「見えない」なら不合格。

`DATA-008` の台帳の状態は `要検証` のまま（L8b が残るため。取込設計 §9）。

## 9. 残るもの・範囲外

- ① `camera.html` が `character` の無い旧作品で描く「高さを合わせた」見た目には合わせない。基準は ② SCR-06（§3.4）。この旧作品では、③のキャラクターの大きさが `camera.html` と違うことがある（PMX は1.8mではなく素材の単位の大きさ、VRM は向きが π 違う）。確認画面に `UNIT_SEMANTICS_DIFFER` を出して、利用者に見せる。
- ③で新しく置くステージは、これまでどおり高さ2mに正規化される。取り込んだステージを消して置き直したときも同じで、所有者の症状がまた出る。これはロードマップの順6（GLBステージと撮影、Issue #40/#63）の課題で、L8a では直さない（③の正規化を変えると既存の作品の見た目が変わるため。§2 の案3）。利用者には §4.6 の説明書で知らせる。
- 順6の設計への申し送り：順6で③のステージの大きさの規則を変えるときは、`units: "legacy"` の行（取込で置いたもの）をどう扱うか（印を残すか、新しい規則にまとめるか）を、順6の設計の前提として決める。
- 同じ倍率「1」が、印付きでは素材の元の大きさ、印なしでは高さ2mなどを意味する。③で取込のキャラクターと新しく置いたキャラクターを並べると、大きさがそろわないことがある。これも順6の規則の見直しで扱う。
- GLB の内蔵アニメーション（`workspace.clip`）、照明、カメラの動きは L8a の範囲外（M5〜M8 のまま。カメラは WP-L8b）。
- GLB動作のダンス（S3、所有者の SCR-10 のダンス）を写すかは、別のカードで所有者の回答を待っている。L8a には入れない。回答が来たら、S3 の設計を直す別の作業として扱う。
- 曲とダンスのモデル（S1）は印を付けない。旧の SCR-10 と同じ見た目で、L8a の前後で変わらない。S1 がステージの上で見えるかは §6.4 の L2〜L5 で確かめる。
- 取込後の作品の MP4 は、順3で「プレビューと同じ画面を通る」と確かめた範囲で一致する。取込後の作品での MP4 の実行は、L8a では行わない（WP-L9 の未検証のまま）。
- 標準MCP・WebMCPからの取込は、同じ `apply` を通るので印も付くが、実クライアントでの確認は未検証のまま。Linux も未検証。

## 10. 所有者への質問

いまは無い。案の選択は、取込設計 §10.1 のとおり開発側で決める技術の判断。`character` が無い旧作品の基準（§3.4）も、旧で2つを同じ場面に描く唯一の画面（SCR-06）に合わせるという技術の判断で決めた。

次のどちらかが起きたときだけ、測った値と画像を添えて、次の1件を所有者に尋ねる。

- §6.0 の判定 (a)〜(c) のどれかが偽だったとき。
- §6.4 で L1 が合格し、L2〜L5 のどれかが不合格だったとき。

> 質問：旧のシーン画面（②）と同じ大きさに戻すと、S01 の中で曲とダンスのモデルが［床の下に埋まる／壁の外に出る／カメラが外殻の外になる］ことが分かりました。旧の②の大きさを優先しますか、それとも曲とダンスのモデルが S01 の上に立つ置き方を優先しますか。
>
> 既定（返事が無いとき）：旧の②の大きさを優先する。L8a は L1（または L1'）までを合否に使い、L2〜L5 は値と画像を記録するだけにして完了とする。曲とダンスのモデルがステージの上に立つ置き方は、順6（ステージと撮影）の課題として Issue #63 に記録する。新しい置き方の機能は、所有者の承認なしに作らない。

モデル区分：調査・設計・批評の採否は高性能モデル。実装は標準モデルで行う。

## 11. 批評への対応（2026-11-04）

3人の批評者（式・データ安全、スコープ・UX、試験性）の指摘を、`9c15d43` のコードで確かめて採否を決めた。

| # | 指摘（批評者） | 採否 | 確かめたこと・理由 | 反映先 |
|---|---|---|---|---|
| 1 | 所有者の症状が直ったかを完了条件にしていない（UX） | 採る | 所有者の旧保存に M3 は無く、見えているのは S1（`music-dance-view.js:265-280` の SCR-10 はステージを描かない）。S01 の数値が一致しても症状が直る保証は無い | §0、§1.4、§6.0、§6.4 の L2〜L5、§8、§10 |
| 2 | S01 の元の外接箱を実装前に測る（UX） | 採る | WP-L9 は③の縮んだ値しか測っていない。旧保存の S01 は p=0・s=1・u=1 なので、SCR-06 の `bounds` がそのまま予想値になる | §6.0 |
| 3 | スキン付きのキャラクターで旧と一致するかを確かめていない（UX） | 採る（試験を足す） | 試験の FBX・PMX は骨を持たない最小の素材。`synthetic_test_model.glb` は骨10本・skin 1つで、逆束縛行列が静止姿勢と一致することを確かめた | §3.3、§6.3 のケース K と R、§8 |
| 4 | u を外側のグループに掛ける（UX の案 a） | 採らない | ③は印の無い道で、すでに全形式の object に拡大を掛けて実素材で確かめられている。attached の束縛では拡大は1回だけ掛かる（`SkinnedMesh.js:203-209`）。外側に段を足すと、`target.object` を前提にした PMX の機能が印のある時だけ別の木で動き、確かめる範囲が広がる。ケース K・R で合わなければ、そのとき検討する | §3.3 |
| 5 | 取込で置いたものを消して置き直すと③の規則に戻る説明が無い（UX） | 採る | `mutate` の update は `asset_id` を変えられない（`studio_v05_scene_instances.py:354-361`）。差し替えは削除と追加になり、印は付かない | §4.6、§7、§9 |
| 6 | ③のステージの2m正規化は順6の課題と書く（UX） | 採る | 案3はスコープ外（§2）。順6への申し送りも書いた | §9 |
| 7 | 取消で、あとから付けた表情キーなどが消える（安全・UX） | 採る | 取消の警告の一覧（`studio_v05_legacy_import.py:1220-1247`）。再取込は空の作品だけ（`TARGET_NOT_EMPTY`、`:66`） | §4.6 |
| 8 | `UNIT_SEMANTICS_DIFFER` を全部やめると、残る差が見えない（UX） | 採る | `character` が無い旧作品は ① `camera.html` と差が残る（§3.4）。新しい理由コードは足さず、文言を直す。保存済みの記録は文言を持つので表示は変わらない（`studio_v05_legacy_import.py:498`） | §0、§3.4、§4.2、§6.1 |
| 9 | 古いコードで開いたときの影響の範囲が狭い（安全・UX）、外に出る文が違う（試験性） | 採る | `read()` は `Scene-instances file unreadable; original retained` に包む（`:170-173`）。`read()` を呼ぶ処理を grep で列挙した | §2 の注、§4.6、§7 |
| 10 | 「v0.5 を前の版へ戻さない運用」の根拠が無い（UX） | 採る | 根拠の文を消し、「L8a をマージした版で取り込み、前の版で開かない」という運用の注意にした | §2 の注、§4.6 |
| 11 | ε の根拠に Rₚ/s の項が無い（式） | 採る（案 a） | Δs の影響は `(Δs/s)·Rₚ`。`ε = 0.00001 × (1 + D + Rₚ/s)` にし、手計算の表も直した | §0、§6.3、§6.6 |
| 12 | 丸めた保存値を基準にする（式の案 b） | 採らない | 旧の画面は丸めていない旧の保存値を読む。基準を作るには試験の入力を変える必要があり、旧の画面の確認にならない | §6.6 |
| 13 | U1 のキー数が応答では9つ（試験性） | 採る | `mutate` は `read(..., assets)` を返す（`:367`） | §6.1 U1 |
| 14 | `test_studio_v05_legacy_import_plan.py:391` の `warnings` が漏れている（試験性） | 採る | bundle_a は `character` が値なので、L8a 後は 0。あわせて bundle_b・bundle_e（`character` なし）の期待も書いた | §6.1 |
| 15 | §8 の手順1が共通の完了条件1と衝突し、手順3の assert で外接箱まで進まない（試験性） | 採る | 測るだけ→1行出す→最後にまとめて判定、の作りを指定。手順1では試験のファイルをコミットしない | §6.3、§8 |
| 16 | 3D の試験が skip で黙って通る（試験性） | 採る | `harness.skip3d()` は three の有無だけを見る（`studio-harness.cjs:37-40`）。新しい試験に `BAI_REQUIRE_3D=1`、実素材に `BAI_REQUIRE_REAL=1` を置き、§8 で `# skip 0` を確かめる。共有の harness は変えない | §6、§6.3、§6.5、§8 |
| 17 | 対照の手順が実装できるほど決まっていない（試験性） | 採る | POST の項目は `project_id`（`server.py:1222`）。番号付きの手順にした | §6.3 |
| 18 | UI の注釈の試験が無い（試験性） | 採る | — | §6.3 の手順4 |
| 19 | §6.5 の実素材の試験が必須か分からない（試験性） | 採る | 所有者のPCで必須、skip は根拠にしない | §6.5、§8 |
| 20 | ケース F の手計算が無い（試験性） | 採る | 三角形1枚、u=0.01、s=2、Y −45°。最大 (0.0141421, 0.02, 0.0141421) | §6.3 |
| 21 | N1 が自分と自分を比べる（試験性） | 採る | 期待値を数で直接書く | §6.2 |
| 22 | 古い記録の作り方があいまい（試験性） | 採る | — | §5 |
| 23 | `unitsById` の後始末（式）、読込前に注釈が付かない（UX） | 採る（形を変える） | `reconcile` の呼び出しは `:1615` の1か所だけ。その直前に応答から表を作り直す形にし、`loadInstance`・`dispose` では触らない | §4.5 の3・4 |
| 24 | ID の綴り、役割の取り方、`#v06project`、timeout、`expectErrors`、行番号（試験性） | 採る | FBX の seed は `studio-p2-camera.test.cjs:281-282`、GLB は `:273-278` | §6.3 |
| 25 | 親設計の要約とのずれ（G・A の対、新しいファイル、`UNITS_CHANGED`）（式・試験性） | 採る | — | 親設計の WP-L8a 節と §5.6 |
| 26 | 項目名 `units` が中身と合わない（UX） | 採る（注釈だけ） | 値が1つの間は実害なし。値を足すときの注意を定数の注釈に書いた | §4.1 |
| 27 | 選択欄の注釈は計画外の機能か（UX） | 確認のみ | 取込の結果を説明する小さな表示で、承認範囲の内側と判断（批評者も同意） | — |
| 28 | GLB動作のダンス（S3）を写すか | L8a に入れない | 所有者の回答待ち（別のカード） | §0、§9 |
