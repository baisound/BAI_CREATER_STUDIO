# WP-L8a 見た目の大きさをそろえる：詳細設計（2026-11-04）

対象: [旧保存→v0.5取込設計](LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md)の WP-L8a（§2.3 の差を解消する）。Issue #63/#69。要件ID は `DATA-008`（主）。画面の呼び方は、①が `/` と `camera.html`、②が `/workspace/NN`、③が v0.5（`/studio/v05`）。

前提: [再構築ロードマップ](V05_REBUILT_ROADMAP_20261102_JA.md)の「次の実施順3」（保存したステージ・カメラのプレビューとMP4の一致）は #214 でマージ済み。順3で、③のプレビューとMP4は同じ `multi-model-ui-v58.js` の読込と同じ場面インスタンスの変換を通ることが確かめられた（[調査表](../v05/SHARED_STATE_OUTPUT_AUDIT_20261104_JA.md) §1・§2）。この設計はその約束を変えない。

この文書は設計だけを扱う。コードと試験はまだ書いていない。行番号は main の `9c15d43` での値。実装する人は、この文書の「変更する箇所」（§4）と「試験」（§6）をそのまま使う。迷う箇所が出たら、推測で埋めずにこの文書を直してから進める。

## 0. 結論

- **原因。** ③は場面インスタンスを読むたびに、形式ごとに大きさを決め直す（GLB・VRMは高さ2.0m、FBXは1.95m、PMXは0.08倍＋足をy=0へ）。旧の画面は、素材の単位の換算（PMX 0.08、GLB・VRM 1、FBX は UnitScaleFactor÷100）だけを掛け、ファイルの原点のまま置く。取込は旧の数値をそのまま写すので、S01ステージ（GLB）は③で2mに縮み、キャラクターがその内側に入った。
- **選んだ案。** 取込で置いた場面インスタンス（キャラクター M3・ステージ M4）にだけ、印 `"units": "legacy"` を付ける。③の読込は、この印があるときだけ旧と同じ式（素材の単位の換算だけ、位置を動かさない）で置く。印が無いインスタンスは、いまのコードの道をそのまま通る。
- **換算式。** 旧の値 p（位置）、r（回転・度）、s（倍率）を、③の transform に `{position: p, rotation: r, scale: [s, s, s]}`、印 `units: "legacy"` で写す。③の読込は、印があれば object の拡大を u（素材の単位）にし、位置を動かさない。世界座標は `p + R(r)·(s·u·v)` となり、旧の式と同じになる（§3）。
- **しきい値。** ③と旧の画面で、同じ実素材の世界座標の外接箱（最小・最大の6成分）の差が、すべて `ε = 0.00001 × (1 + D)` m 以内（D は旧の外接箱の対角の長さ[m]）。印を付けない対照では、差が `100ε` 以上になることも確かめる（§6.6）。
- **既存の③の作品。** 印は取込だけが付ける。HTTP・MCP・画面からは付けられない。既存の保存ファイルは書き換えない。印の無いインスタンスの読込は、今のコードと同じ式・同じ順で動く。既存の作品の見た目は変わらない（§7）。
- **所有者への質問。** なし（§10）。

## 1. 調べた事実

### 1.1 旧（①②）の置き方

| 画面 | 読む保存値 | 置き方 | 根拠 |
|---|---|---|---|
| ① `camera.html`（キャラクター、`workspace.character` が値のとき） | `workspace.asset`、`workspace.character` | 素材を読み込んだ `content` を、向き用の空のグループ（回転0）に入れ、その外側の `model` に「位置 p、回転 r（度→ラジアン、XYZ順）、拡大 u×s」を当てる。高さの正規化も、中心合わせも、足合わせもしない | `camera_3d.js:297-305`、`studio/js/viewport/character-placement.js:22-28`、`studio/js/viewport/placement.js:25-31` |
| ① `camera.html`（キャラクター、`workspace.character` が無い・null） | `workspace.asset` | 高さを PMX 1.8m／FBX 1.95m／GLB・VRM 2.0m に合わせ、XZの中心を原点へ、足を y=0 へ。VRM だけ π 回す。外接箱は頂点から測る（`setFromObject(…, true)`） | `camera_3d.js:306-311` |
| ① `camera.html`（ステージ） | — | **ステージを描かない。** `camera_3d.js` は `workspace.stage` を読まない（`stage` を含むのは `camera_3d.js:5` の import と `:304` の単位の関数の呼び出しだけ）。`camera.html` にもステージの要素は無い | `camera_3d.js` 全体、`camera.html` |
| ② SCR-06 `/workspace/06`（ステージ） | `workspace.stage` | `buildPlaced` で `content` を、単位 u を掛けたグループに入れ、`applyStage` でそのグループに「位置 p、回転 r、拡大 u×s」を当てる。正規化も中心合わせもしない | `studio/js/viewport/scene-parts.js:18-34`、`studio/js/features/scene-view.js:302-318,338` |
| ② SCR-06（キャラクター） | `workspace.asset`、`workspace.character`（無ければ既定値 `{[0,0,0],[0,0,0],1}`） | ステージと同じ式。`character` が無いときも既定値で同じ式 | `studio/js/features/scene-view.js:43-48,280-296,339` |
| ② SCR-10 曲とダンス（ダンスのモデル） | `music_dance_project.json` の `model_id` | PMX は0.08倍のあと足を y=0 へ。それ以外は `normalizeModel`（高さを目標へ、中心と足を合わせる）。**③の既定と同じ式** | `studio/js/features/music-dance-view.js:272-278` |

素材の単位 u は `stageUnitScale`（`studio/js/viewport/normalize.fork.js:58-65`）で、PMX 0.08、FBX は `userData.unitScaleFactor ÷ 100`（無ければ0.01）、GLB・VRM は 1。

①の `camera.html` はステージを描かない。旧の保存値 `workspace.stage` を描く画面は、② SCR-06 だけ。キャラクターとステージを同じ場面に描く画面も SCR-06 だけ。`workspace.character` が値のときは、① `camera.html` と ② SCR-06 は同じ式になる。

### 1.2 ③の置き方（いまのコード）

| 段階 | 処理 | 根拠 |
|---|---|---|
| 読込 | `loadModel` で object を作る（①②と同じ読込関数） | `studio/v05/js/multi-model-ui-v58.js:1494-1497`、`studio/js/viewport/model-loader.js:84-121` |
| 正規化 | PMX：object の拡大を0.08にし、頂点から測った外接箱の最小yだけ上げる。それ以外：`normalizeModel`（高さ GLB・VRM 2.0／FBX 1.95、XZの中心を原点、足をy=0。外接箱は `setFromObject(object)`＝頂点ではなく形状の箱から測る） | `multi-model-ui-v58.js:1499-1504`、`normalize.fork.js:5,13-25` |
| 置く | object を `BAI_Inst_<ID>` のグループ（root）に入れる。root に保存値の「位置、回転（度→ラジアン、XYZ順）、拡大（3成分）」を当てる | `multi-model-ui-v58.js:1505-1506`、`studio/v05/js/shared-scene-v57.js:27-41`、`studio/v05/js/multi-model-runtime-v58.js:56,76` |
| 保存値 | `transform = {position[3], rotation[3](度), scale[3]}`。小数点以下6桁に丸める | `studio_v05_scene_instances.py:104-114`、`studio_v05_scene_model.py:54-59` |
| 同じ処理の別の場所 | 単体の動作プレビュー（`actual-motion-loader-v22.js:39-43`）にも同じ正規化がある。場面インスタンスは使わない | `studio/v05/js/actual-motion-loader-v22.js:29-45` |

プレビューとMP4の書き出しは、どちらも `multi-model-ui-v58.js` の同じ `loadInstance` を通る（MP4は `?scene_capture=1` で同じ画面を開く。`multi-model-ui-v58.js:26`）。

### 1.3 取込（WP-L3）が今していること

- M3・M4 は、旧の値をそのまま transform にする（`studio_v05_legacy_import.py:231-236` の `_transform`、`:506-519` の `place`）。警告 `UNIT_SEMANTICS_DIFFER` を付ける（`:519`）。
- 曲とダンスのモデル（S1）は、既定の transform で置き、`PLACED_AT_ORIGIN` を付ける（`:283-286`）。
- 適用は `studio_v05_scene_instances.mutate(action="add", …)` を呼ぶ（`:913-916`）。

### 1.4 実データでの差（WP-L9）

所有者の旧保存は、キャラクターなし（`workspace.asset` が空）、ステージ S01「灰色の境界スタジオ」（位置0・回転0・大きさ1）。③に読み込んだ後の外接箱は次のとおりだった（[実データ確認](../v05/LEGACY_IMPORT_REAL_DATA_20261104_JA.md)、測り方は `tools/legacy_import_real_check_ui.cjs:89-93`、`frameProbe` の `root`）。

| インスタンス | 大きさ [m] | 最小 | 最大 |
|---|---|---|---|
| S01ステージ（M4） | (2, 2, 2) | (−1, 0, −1) | (1, 2, 1) |
| PMX（S1、曲とダンスのモデル） | (1.155, 1.731, 0.867) | (−0.334, 0.132, −0.375) | (0.821, 1.863, 0.492) |

S01 は③で高さ2mへ縮み、XZの中心を原点へ動かされた。旧の SCR-06 では、S01 はファイルの原点のまま、元の大きさ（u=1、s=1）で描かれる。S01 の元の大きさは WP-L9 では測っていない。L8a の実データ確認（§6.4）で測る。

PMX は S1 の素材で、旧では SCR-10 が③と同じ式で描く（§1.1）。この PMX の見た目は、L8a の前後で変わらない。

## 2. 案の比較

| 観点 | 案1 取込で数値を換算する | **案2 取込で置いたものだけに印を付ける（採用）** | 案3 ③の正規化そのものを変える |
|---|---|---|---|
| やること | 取込の時点で、③の正規化を打ち消す scale と位置を計算して保存する（式は §3.5） | 取込の場面インスタンスに `units: "legacy"` を付ける。③の読込は、印があるときだけ正規化の代わりに単位の換算を掛ける | ③の読込から正規化を外す（または ステージだけ外す） |
| 既存の③の作品 | 変わらない | 変わらない（印が無いので、いまの道を通る） | **変わる。** 既存の作品のステージ・モデルの大きさと位置がすべて変わる |
| 正確さ | 素材ごとに、③が測る外接箱（形状の箱、PMXは頂点）と同じ値が要る。サーバー（Python）には three.js が無い。静止GLBは accessor の min/max とノードの行列で再現できるが、スキン付きGLB・VRM（`SkinnedMesh.computeBoundingBox` が骨の行列で頂点を動かす）とFBXは再現できない。画面で測って送る方法は、MCP・HTTPからの取込で使えない | 旧と同じ three.js の読込結果に、旧と同じ式を当てる。全形式で式が一致する。外接箱を測らない | — |
| 往復（R2・R4） | 保存値が旧の値と違う。逆変換に、記録した正規化の値が要る。③で倍率を変えると、旧の位置と倍率の両方が変わる | 保存値は旧の値のまま。いまの逆変換がそのまま使える | — |
| 触るファイル | 取込モジュール、新しい外接箱の読み取り（GLB・PMX）。それでもスキン付き・FBXは残る | 取込モジュール、場面インスタンスの保存の検査（項目1つ）、③の読込（分岐1つ）、③の実行部（引数1つ） | ③の読込。既存作品の作り直しや移行が要る |
| 保存の形 | 変えない | 場面インスタンスに任意の項目 `units` を1つ足す（値は `"legacy"` だけ）。この版より古いコードでは、印付きの作品の3D場面を読めない（下の注） | 変えない |
| スコープ凍結 | L8a の候補 (b)。承認範囲 | L8a の候補 (a)。承認範囲。効果は取込で置いたものだけに及ぶ | 取込以外の作品の見た目を変えるので、**承認範囲の外** |

**採用は案2。** 理由は次の3つ。

1. 案3は取込以外の作品を変えるので、所有者の「既存の作品の見た目は変えない」とスコープ凍結に反する。
2. 案1は「取込だけで換算する」点では最も小さく見えるが、③と同じ外接箱をサーバーで再現できない形式（スキン付きGLB・VRM、FBX）が残る。画面で測る方法は、HTTP・MCPの取込で結果が変わる。外接箱を再現する新しい読み取り部品は、計画にない大きな追加になる。
3. 案2は、取込で置いたものにだけ効く（効果は「取込だけの換算」と同じ）。全形式で旧と同じ式になり、測る処理が要らない。保存値が旧の値のままなので、取消・逆変換・往復試験（R2〜R4）を変えずに済む。

注（古いコードとの関係）：印付きのインスタンスを含む作品は、この版より古いコードで開くと「Invalid scene instance fields; original retained」で3D場面を読めない（`studio_v05_scene_instances.py:58-60`）。元のファイルは書き換えられない。新しいコードは、印の無い古いファイルをそのまま読む。v0.5 は前の版へ戻して使う運用をしていないため、この制限は操作説明書に書くだけにする。

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

このとき `W③(v) = p + R(r)·(s·u·v) = W旧(v)`。倍率は数なので、u を object に、s を root に分けても、旧のように u×s を外側の1つのグループに掛けても、世界座標は同じになる。スキン付きのメッシュも、three.js の attached の束縛は `updateMatrixWorld` のたびに `matrixWorld` から逆行列を取り直す（`node_modules/three/src/objects/SkinnedMesh.js` の `updateMatrixWorld`）。外接箱を測る両方の側（`camera_3d.js:269`、`multi-model-ui-v58.js` の `frameProbe`）が測る前に `updateMatrixWorld(true)` を呼ぶので、どちらの置き方でも同じ頂点になる。

印が無いときは、いまの式（§3.2）のまま。

### 3.4 取込の項目ごとの扱い

| 項目 | 旧で描いていた画面 | 印 | transform | 理由コード |
|---|---|---|---|---|
| M3 キャラクター、`character` が値 | ① `camera.html` と ② SCR-06（同じ式） | `"legacy"` | 旧の値（いまと同じ） | なし（`UNIT_SEMANTICS_DIFFER` を出さない） |
| M3 キャラクター、`character` が無い・null | ② SCR-06 は既定値で同じ式。① `camera.html` は高さを合わせる（§1.1） | `"legacy"` | 既定値 `{[0,0,0],[0,0,0],[1,1,1]}`（いまと同じ） | なし |
| M4 ステージ（値のとき） | ② SCR-06 だけ（① はステージを描かない） | `"legacy"` | 旧の値（いまと同じ） | なし |
| S1 曲とダンスのモデル（M3 と別の素材） | ② SCR-10。③の既定と同じ式 | 付けない | 既定値（いまと同じ） | `PLACED_AT_ORIGIN`（いまと同じ） |
| S1 で M3 と同じ素材 | M3 のインスタンスを共有（いまと同じ） | M3 の印に従う | — | いまと同じ |

M3 で `character` が無いときの基準は ② SCR-06 にする。理由：③はステージとキャラクターを同じ場面に置く。旧でその2つを同じ場面に描くのは SCR-06 だけで、SCR-06 は `character` が無いときも既定値で同じ式を使う。① `camera.html` はキャラクターだけを単体で、高さを合わせて描く。この差は旧の2つの画面のあいだにもともとある差で、L8a では SCR-06 に合わせる。§9 に残りとして書く。

### 3.5 参考：案1の数値換算式（採らない）

案1で③の正規化を打ち消すには、`S' = u·s / n`、`P' = p − (u·s / n)·R(r)·o` が要る。n と o は素材ごとに③の three.js が測る外接箱で決まる（§3.1）。この値をサーバーで同じに作れない形式があるため、案1は採らない（§2）。

## 4. 変更する箇所

ここに無いファイルは変えない（§4.7）。

### 4.1 `studio_v05_scene_instances.py`（場面インスタンスの保存）

1. 定数を足す（`MAX_INSTANCES = 32` の行 `:19` の次）。

   ```python
   UNITS_LEGACY = "legacy"  # WP-L8a：旧画面と同じ式（素材の単位の換算だけ）で置く印。取込だけが付ける
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

3. `place` の手順（`:515-516`）に `"units": LEGACY_UNITS` を足す。

   ```python
   step = {"kind": "scene_add", "role": role, "status": "pending", "asset_id": asset_id,
           "transform": _transform(legacy_transform), "units": LEGACY_UNITS,
           "pre_ids": [], "instance_id": None}
   ```

4. 同じ関数の `add(...)`（`:519`）の理由コードを空にする：`add(iid, pointer, label_key, "mapped", [], legacy_value, name=name)`。
5. `MESSAGES` と `KINDS` の `UNIT_SEMANTICS_DIFFER`（`:47`、`:87`）は**消さない**。L8a より前に取り込んだ記録の表示（`legacy-import-ui-v188.js:15`）が使う。各行の後ろに注釈 `# WP-L8a 以降の plan は出さない。L8a より前の取込記録の表示に使う` を付ける。
6. S1（`:283-286`）は変えない。`units` を付けない。
7. `_run_step` の `scene_add`（`:914-916`）で、印を渡す。

   ```python
   after = studio_v05_scene_instances.mutate(
       roots.scene, roots.legacy, roots.catalog, pid, action="add", revision=before["revision"],
       assets=assets, asset_id=step["asset_id"], transform=step["transform"], units=step.get("units"))
   ```

   `step.get` にするのは、S1 の手順と、L8a より前に書かれた途中の記録（`units` が無い）を同じ道で扱うため。

8. 打ち消し（`_undo_scene_add`、`:1145-1159`）と取消（`revert`）は変えない。インスタンスを消せば印も消える。
9. 試験専用の逆変換（`_export_legacy_for_test`、`:1364-1451`）に、印の照合を足す。キャラクター（`:1402-1419`）とステージ（`:1420-1431`）のそれぞれで、`asset_ok(...)` の直後に次を入れる。

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

拡張子を `.mjs` にするのは、Node の単体試験（§6.2）から直接 import するため。`pmx-lip-overlay-v199.mjs` と同じく、`multi-model-ui-v58.js` から ES module として読み込む。`studio/v05/index.html` は変えない（import で読まれる）。

### 4.5 `studio/v05/js/multi-model-ui-v58.js`（③の読込と画面）

1. import（`:11`）を置き換える。`normalizeModel` はこのファイルでは `:1504` だけで使っているので、その import は消す。

   ```js
   import {placeInstanceObject,LEGACY_UNITS} from './instance-units-v189.mjs';
   ```

2. 文言の既定（`:28-34` の `tr` の表）に2つ足す：`legacyUnits:'（旧の大きさ）'`、`legacyUnitsHint:'旧画面と同じ大きさで置いています（旧保存の取込で置いたもの）'`。
3. 印を表示用に覚える変数を、`:37` の `let` の並びの次の行に足す：`const unitsById=new Map();`
4. `loadInstance`（`:1494`）の引数に `units` を足し、`:1499-1504` を置き換える。

   ```js
   async loadInstance({asset,instanceId,units}){
     const loaded=await loadModel(asset,libs);
     const object=loaded.object;
     try{
       placeInstanceObject(object,loaded.format,units,libs.THREE);
       unitsById.set(instanceId,units??null);
       const root=new libs.THREE.Group();
       ...（:1505 以降は変えない）
   ```

   `dispose()`（`:1522`）の先頭に `unitsById.delete(instanceId);` を足す。
5. 選択欄（`updateStatus`、`:384`）の選択肢に、印のあるものだけ注釈を付ける。

   ```js
   for(const id of s.ids){
     const legacy=unitsById.get(id)===LEGACY_UNITS;
     const option=new Option(id+(legacy?tr('legacyUnits'):''),id);
     if(legacy)option.title=tr('legacyUnitsHint');
     choose.add(option);
   }
   ```

   値（`value`）は今と同じIDなので、選択の処理と既存の試験（`selectOption(ID)`）は変わらない。

### 4.6 文書

- [取込の操作説明書](../v05/LEGACY_IMPORT_GUIDE_JA.md)に3文足す：「旧保存のキャラクターとステージは、旧画面（②のシーン・ステージ）と同じ大きさで置きます。3D場面の選択欄では『（旧の大きさ）』と表示します。この版より前に取り込んだ作品は大きさが合っていないので、［取込を取消］のあと、もう一度［取り込む］を押してください。」
- [取込設計](LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md)の WP-L8a 節に「実装済み・試験結果・未検証」を1〜3行で追記する（共通の完了条件3）。

### 4.7 変えないもの

| ファイル | 変えない理由 |
|---|---|
| `server.py`（`:1222-1223` の `allowed`）、`mcp_server.py`、`webmcp.js` | 印は取込だけが付ける。手で付ける操作は承認されていない |
| `camera_3d.js`、`studio/js/**`（`normalize.fork.js`・`scene-parts.js`・`placement.js`・`character-placement.js` を含む） | ①②の見た目と、①②の照合試験（`tests/studio-p2-normalize-parity.test.cjs`）を変えない |
| `studio/v05/js/actual-motion-loader-v22.js` | 単体の動作プレビュー。場面インスタンスを使わない |
| `studio/v05/js/shared-scene-v57.js`、`spatial-*.js` | root の transform の当て方は変えない |
| `studio_v05_media_render.py`、`tools/render_v05_scene_frames.cjs` | MP4は同じ画面を開くので、印は自動で効く |
| `studio_v05_legacy_import_record.py` | 手順の項目の検査は n・kind・status だけ（`:100-111`）。`units` を足しても通る |
| 既存の場面インスタンスのファイル、既存の取込記録 | 移行しない。書き換えない |

## 5. 取消・逆変換・往復試験との整合

| 試験 | L8a 後 | 確かめ方 |
|---|---|---|
| R1 元を壊さない | 変わらない。印は v0.5 の場面インスタンスのファイルにだけ書く | 既存の R1 の試験をそのまま通す |
| R2 往復一致 | 保存値が旧の値のままなので、いまの逆変換で元の bundle に戻る。印が一致するので `UNITS_CHANGED` は出ない | 既存の R2（bundle_a〜j）に、「M3・M4 のインスタンスに `units == "legacy"`、S1 のインスタンスに `units` が無い」を足す |
| R3 取消 | インスタンスを消すので印も消える。取消のあと `instances` が取込前と等しい | 既存の R3 をそのまま通す |
| R4 編集後の逆変換 | ③で印付きのインスタンスの倍率・位置を変えると、旧と同じ意味の数値なので、そのまま旧の `scale`・`position` に出る | 既存の R4 をそのまま通す。追加：印を消した `current` を手で作る → `/workspace/stage` に `UNITS_CHANGED`、`workspace.stage` は元の値、`changed` は空 |
| L8a より前の記録 | 手順にもインスタンスにも印が無い。取消・逆変換はいまと同じ。見た目は③の既定のまま | 印の無い記録（いまの fixture の手順から `units` を消したもの）で R2・R3 が通る |

L8a より前に取り込んだ作品は自動では直さない。直すには、利用者が［取込を取消］→［取り込む］を行う（§4.6 の説明書）。自動で印を足すと、取り込んだあとに利用者が③で合わせた大きさが変わってしまうため。

## 6. 試験

共通：[共通試験手順](../handoff/TESTING_GUIDE_JA.md)に従う。取込の試験では skip を使わない。3D描画の試験は `harness.skip3d()` で飛ばされたら「未検証」と記録し、合格にしない。

### 6.1 Python の単体試験

`tests/test_studio_v05_scene_instances_units.py`（新規。`tmp_path` に catalog と作品1件を作る。`test_v05_scene_instances_v57.py` の作り方に合わせる）

| # | 内容 | 期待 |
|---|---|---|
| U1 | `mutate(action="add", units="legacy", …)` | 応答と保存ファイルの行に `"units": "legacy"`。キーは7つ |
| U2 | `units="other"` で add | `SceneInstancesError`、ファイルは変わらない |
| U3 | `action="update"` に `units="legacy"` | `SceneInstancesError` |
| U4 | 印付きの行を `update`（transform・visible・locked） | 印が残る |
| U5 | 印付きの行を `remove` | 行ごと消える |
| U6 | L8a より前の形のファイル（6キーの行だけ）を `read`、`update` | 読める。書いたファイルの行に `units` が無い。行のキーの集合が6つのまま |
| U7 | 保存ファイルの行に `"units": "x"` を書いて `read` | `Invalid scene instance units; original retained`、ファイルは変わらない |
| U8 | HTTP：`POST /api/studio/v05/scene/instances` に `units` を付けて add（`tests/test_studio_v05_legacy_import_http.py` と同じ起動方法） | 400 `Invalid scene instances fields` |

既存の試験の直し（期待値を L8a の仕様に合わせる。ほかは変えない）：

- `tests/test_studio_v05_legacy_import_plan.py:141-146`：character とステージの手順の期待に `"units": "legacy"` を足す。
- 同 `:150`：M3・M4 の `codes` を `[]` にする。`:252`：`m4["codes"] == []`。
- 同 `:203-247`（M3・M4 の手順を見る試験）：取り出した `step` に `step["units"] == "legacy"` を足す。
- `tests/test_studio_v05_legacy_import_music_dance.py`：S1 の手順に `units` が**無い**ことを1行足す（`"units" not in step`）。
- `tests/test_studio_v05_legacy_import_timeline_editor.py:138` の説明文の「（M3・M4 の UNIT_SEMANTICS_DIFFER は除く）」を「（M3・M4 は警告を出さない）」に直す（式は変えない）。
- `tests/test_studio_v05_legacy_import_apply.py`・`_http.py`・`_mcp.py`・`_roundtrip.py`：インスタンスの行を辞書で丸ごと比べている箇所があれば、M3・M4 に `"units": "legacy"` を足す。`grep -n '"parent_id"' tests/test_studio_v05_legacy_import_*.py` で探す。
- `tests/test_studio_v05_legacy_import_roundtrip.py`：§5 の追加（R2 の印、`UNITS_CHANGED`、印の無い古い記録）。
- `tests/test_studio_v05_legacy_import_plan.py:73` の `EXPECTED`（§3.4 の表との一致）は変えない（`UNIT_SEMANTICS_DIFFER` は残すため）。

### 6.2 Node の単体試験

`tests/studio-v05-instance-units.test.mjs`（新規。`three` は `node_modules/three/build/three.module.js` から import する。WebGL は使わない。この試験は three が必須なので、`node_modules/three` が無ければ skip せずに失敗にする）

| # | 内容 | 期待 |
|---|---|---|
| N1 | 箱のメッシュ（min (2,−0.5,−5)、max (12,3.5,1)）を Group に入れた object、format `GLB`、units `null` | `placeInstanceObject` の後の object の拡大・位置が、旧の `:1499-1504` のコードを試験の中に写した関数の結果と、成分ごとに `===` で等しい（拡大0.5、位置 (−3.5, 0.25, 1)） |
| N2 | 同じ object、units `undefined` | N1 と同じ |
| N3 | format `PMX`、units `null`（PMX の代わりに通常の Mesh で式だけ確かめる） | 拡大0.08、位置 y = −0.08×(−0.5) = 0.04 |
| N4 | format `GLB`、units `'legacy'` | 拡大1、位置 (0,0,0)。戻り値 `{mode:'legacy', unit:1}` |
| N5 | format `PMX`、units `'legacy'` | 拡大0.08、位置 (0,0,0) |
| N6 | format `FBX`、`object.userData.unitScaleFactor = 2.54`、units `'legacy'` | 拡大0.0254 |
| N7 | units `'other'` | 例外 |

`test_v05_multi_model_v58.cjs`（`node test_v05_multi_model_v58.cjs` で単独実行）に2つ足す：(1) `loadInstance` が受け取る引数に `units` があり、行の `units` と同じ（無い行は `null`）。(2) 同じIDで `units` が変わった応答を `reconcile` に渡すと、古いものを捨てて読み直す。

### 6.3 ブラウザの比較試験（③と①②を同じ素材で比べる）

新規 `tests/studio-v05-legacy-units-l8a.test.cjs`。`harness.skip3d()` 付き。ポート 8944。隔離サーバー1つで、ケースごとに旧保存を書き直し、新しい作品へ取り込む。

**素材**

- 新しい補助 `tests/helpers/box-glb.cjs`：`boxGlb(min, max) -> Buffer`。三角形12枚の直方体1つだけの GLB（JSON：`asset.version "2.0"`、`scene 0`、ノード1つ、メッシュ1つ、`POSITION`（FLOAT VEC3、8頂点、`min`・`max` 付き）と `indices`（UNSIGNED_SHORT、36個）。JSON チャンクは空白で、BIN チャンクは0で4バイト境界に詰める）。材質は付けない。
- ステージ：`boxGlb([2,-0.5,-5],[12,3.5,1])` を `/api/library-assets/upload?kind=stage&name=box_stage.glb` で登録（`tests/helpers/legacy-import-seed.cjs:34-35` と同じ呼び方）。
- GLBキャラクター：`boxGlb([0.5,0.1,-0.2],[1.1,1.7,0.2])` を、`startServer` の seed で `integrated_v02/assets/cccccccccccccccccccc.glb` と `integrated_v02/user_assets.json`（`kind: 'model'`）に置く（`tests/studio-p2-camera.test.cjs:270-277` と同じ形）。
- PMX：`tests/fixtures/minimal_pmx.zip` を `/api/pmx-zip-upload?slot=A&name=minimal_pmx.zip` で登録し、`/api/assets` で `format === 'PMX'` のIDを取る（`legacy-import-seed.cjs:30-31,38-39`）。
- FBX：`tests/fixtures/minimal_model.fbx` を seed で `manifest.json`（`kind: 'modelA'`）と `files/f-model.fbx` に置く（`tests/studio-p2-camera.test.cjs:278-279`）。ID は `fbx:f-model`。

**ケース**（旧の `project_state.workspace.json`。どれも `frame: 0`、`clip: null`）

| ケース | `asset` | `character` | `stage` |
|---|---|---|---|
| S | `''` | なし | 箱ステージ、位置 (1, 0, −2)、回転 (0, 90, 0)、倍率 1.5 |
| G | `cccccccccccccccccccc.glb`（接頭辞なしの旧形式） | 位置 (0.5, 0, 1)、回転 (0, 0, 0)、倍率 1.25 | S と同じ |
| P | PMX のID | 位置 (−1, 0, 0.5)、回転 (0, 30, 0)、倍率 1.2 | なし |
| F | `fbx:f-model` | 位置 (0, 0, 0)、回転 (0, −45, 0)、倍率 2 | なし |
| A | `cccccccccccccccccccc.glb` | なし（項目ごと書かない） | なし |

`project_state.json` は `{schema:1, timeline:[], history:[], cursor:-1, title:'L8a-<ケース>'}`、`camera_project.json` は `{schema:1, fps:30, duration:300, keys:[{frame:0, position:[0,1.6,5], target:[0,1,0], fov:40}]}`。

**手順**（ケースごと）

1. 旧の3ファイルを `server.dataDir` に書き、`createProjectWithSnapshot`（`legacy-import-seed.cjs:69-74`）で作品とスナップショットを作る。
2. `GET /api/studio/v05/project/legacy-import-preview?id=<ID>` の `expected` を使い、`POST /api/studio/v05/project/legacy-import/apply` に `{id, expected, include: [], fps_policy: 'keep_if_same', confirm: true}` を送る。
3. `GET /api/studio/v05/scene/instances?id=<ID>` で、取り込んだ全インスタンスに `units: 'legacy'` があることを確かめる。
4. ③：`/studio/v05/index.html` を開き、作品カードの `[data-openproject]` で作品を開き、`#v70sceneOpen` を押す。`BAIStudioMultiScenePreview.status().loaded` がインスタンス数になるまで待つ。インスタンスごとに `frameProbe(id)` を読む（`multi-model-ui-v58.js:2533-2547`）。
5. ② SCR-06：`/workspace/06` を開き、`window.baiStudio.project.getState().status === 'ready'` と `window.baiStudio.assets.getState().status === 'ready'` を待つ（`tests/studio-p2-viewport.test.cjs:170-172`）。ステージがあるケースは `window.baiStudio.viewport.getState().stage?.assetId === ステージのID`、キャラクターがあるケースは `getState().character?.assetId === キャラクターのID` を待つ。`getState().bounds` を読む（`studio/js/viewport/three-host.js:293-299`。content に入るのはキャラクターとステージだけ：`scene-view.js:295,315`）。
6. ① `camera.html`（ケース G・P・F。A は値を記録するだけ）：`/camera.html` を開く。`window.addEventListener('bai-camera-model-bounds', …)` で `detail.source === 'model'` の最後の値を記録する。`page.once('dialog', d => d.accept())` を置いて `#bundle-load` を押し（`camera_project_bundle_ui.js:11`）、`#bundle-status` に「復元しました」が出るのを待ってから、記録した最後の値を読む（`camera_3d.js:267-276`、頂点から測る外接箱）。
7. 比べる（下の表）。

| 対 | 旧の値 | ③の値 | 測り方の一致 |
|---|---|---|---|
| ステージ（S） | SCR-06 の `bounds` | ステージの `frameProbe(id).root` | どちらも形状の箱（`setFromObject(…)`） |
| キャラクター（G・P・F） | `camera.html` の `bai-camera-model-bounds` | キャラクターの `frameProbe(id).precise` | どちらも頂点（`setFromObject(…, true)`） |
| 場面全体（G） | SCR-06 の `bounds`（キャラクター＋ステージ） | 2つの `frameProbe(id).root` の和 | どちらも形状の箱 |
| キャラクター（A） | SCR-06 の `bounds`（既定の配置） | `frameProbe(id).root` | どちらも形状の箱。`camera.html` の値は記録だけして比べない（§3.4） |

スキン付きのメッシュ（PMX・FBX）は、形状の箱で測ると three.js が `SkinnedMesh.boundingBox` を最初に測ったときの値を使い回す（`node_modules/three/src/math/Box3.js` の `expandByObject`）。測った時点の骨の行列が画面ごとに違いうるので、P・F は頂点で測る `camera.html` とだけ比べ、SCR-06 とは比べない。形状の箱で比べる対（S・G・A）は、スキンの無い直方体の GLB だけを使う。

**合否**

- 各対で、最小・最大の6成分すべてが `|③ − 旧| ≤ ε`。`ε = 0.00001 × (1 + D)` m、D は旧の外接箱の対角の長さ [m]（§6.6）。
- ケース S の旧の値が、手で計算した値と ε 以内で一致する：最小 (−6.5, −0.75, −20)、最大 (2.5, 5.25, −5)（D = √342 ≈ 18.493、ε ≈ 0.000195）。基準の画面そのものが正しいことを確かめるため。
- ケース G の `camera.html` の値が、手で計算した値と ε 以内で一致する：最小 (1.125, 0.125, 0.75)、最大 (1.875, 2.125, 1.25)（D ≈ 2.194、ε ≈ 0.0000319）。
- **対照（試験の感度）**：同じサーバーで空の作品を作り、`POST /api/studio/v05/scene/instances`（`action: 'add'`、印なし）で、ケース S のステージとケース G のキャラクターを同じ transform で置く。③で開いた `frameProbe` と旧の値の差の最大が `100ε` **以上**であること。計算上の値は、ステージが最小 (−1.25, 0, −5.75)・最大 (3.25, 3, 1.75)（差の最大 14.25m）、GLBキャラクターが `precise` で最小 (0.03125, 0, 0.6875)・最大 (0.96875, 2.5, 1.3125)（差の最大 1.09375m）。L8a の変更を入れる前のコードでは、上の合否が失敗し、この対照と同じ値になることを、実装の最初に一度確かめて記録する。
- `harness.assertNoErrors(page)`。PMX の読込で出る既知の警告は、`tests/studio-v05-legacy-import-ui-3d.test.cjs:18` と同じ `expectErrors` を使う。
- 試験の最後に、各ケースの旧と③の値、ε、差の最大を JSON で1行出す（記録用）。

### 6.4 実データでの確認（WP-L9 の台本を広げる）

所有者のPCで開発側が実行する（所有者に確認は頼まない）。台本 `tools/legacy_import_real_check.py` と `tools/legacy_import_real_check_ui.cjs` に、次を足す。

1. `_ui.cjs` の3D場面の外接箱（`:89-93`）のあとで、同じ隔離サーバーの `/workspace/06` を開き、§6.3 の手順5と同じ待ち方で `getState().bounds` を読む。
2. 取込記録（`GET /api/studio/v05/project/legacy-import?id=<ID>`）の手順から、`role` が `character`・`stage` のインスタンスIDを取り、③の `frameProbe(id).root` の和を作る。SCR-06 の `bounds` はキャラクターとステージの和なので、この和と比べる。旧保存の `workspace.asset` が空でない（M3 がある）ときは、キャラクターがスキン付きでありうるため（§6.3 の注）、この対は記録だけにして合否に使わない。
3. 旧保存の `workspace.character` が値なら、`/camera.html` で §6.3 の手順6を行い、キャラクターの `precise` と比べる。値でなければ「比べない（基準は SCR-06）」と書く。
4. 出力の JSON に `l8a: {pairs: [{name, legacy: {min, max}, v05: {min, max}, eps, max_abs_diff, pass}], pass}` を足す。`report_JA.md` に、対ごとに「旧・③の大きさ・最小・最大、差の最大、ε、合否」を1行ずつ書く。
5. 曲とダンスのモデル（S1、印なし）の外接箱の中心が、ステージの外接箱の内側にあるかを `inside_stage: true/false` で記録する（合否には使わない。見た目の判定の手がかり）。
6. 画像 `05_scene_3d.png`・`06_scene_3d_focus_character.png` を撮り直す。開発側が「キャラクターが見える」かを目で見て `docs/v05/LEGACY_IMPORT_REAL_DATA_<日付>_JA.md` に書く。
7. Chrome が無ければ、L8a は「未検証」と書き、合格にしない。
8. ステージの対が ε を超えたときは、しきい値を広げない。S01 にスキン付きのメッシュがあるか（`frameProbe(id).root` と `precise` の差）を記録し、§6.3 の注（スキン付きのメッシュの形状の箱）に当たるかを調べてから、この文書を直す。

台本の単体試験 `tests/test_legacy_import_real_check.py` に、`l8a` の報告の書き方（合格・不合格・未検証の3通り）を1件足す。

実データの合格条件：M3 が無い旧保存（所有者のいまの旧保存）では、SCR-06 との対（＝ステージ S01）が ε 以内。M3 がある旧保存では、`camera.html` とのキャラクターの対（頂点の箱）が ε 以内で、SCR-06 との対は記録だけ。

### 6.5 既存の③の作品への影響の試験

| 試験 | 期待 |
|---|---|
| §6.1 の U6（印の無い古いファイル） | 読めて、書いても印が増えない |
| §6.2 の N1〜N3（印なしの式が旧のコードと `===` で等しい） | 等しい |
| 既存の3D試験を、変更前と同じ環境で実行：`tests/studio-v05-legacy-import-ui-3d.test.cjs`、`tests/studio-v05-composite-scene-preview.test.cjs`、`tests/studio-v05-scene-mp4.test.cjs`、`tests/studio-real-stage.test.cjs`、`tests/studio-p2-normalize-parity.test.cjs`、`node test_v05_multi_model_v58.cjs` | すべて合格。失敗したら、変更前のコードでも同じ失敗かを確かめて記録する |
| 実素材がある環境で `tests/studio-v05-saved-composition-real.test.cjs`（`BAI_REAL_MMD_DATA` 指定、実GPU） | 合格。重なり（IoU）と重心のずれを、順3の記録（0.886・0.005）と並べて記録する。この試験の作品は印を持たないので、値は同じになるはず。違えば原因を調べる |
| `python -m pytest -q`、`npm run test:node-all`、`npm run typecheck` | 既存の失敗（`test_v05_timeline_drag_static` 1件、node-all の既知の失敗）の件数が増えない |

### 6.6 しきい値の根拠

- 案2では、③と旧が同じ three.js の読込結果に同じ式を当てる。理論上の差は0。
- 差が出るのは丸めだけ。③は保存値を小数点以下6桁に丸める（`studio_v05_scene_model.py:59`）。旧の値が7桁以上のとき、位置の差は最大 5×10⁻⁷ m、倍率の差は最大 5×10⁻⁷ で、外接箱では最大 5×10⁻⁷ × D 程度になる。three.js の行列は倍精度なので、計算の差はこれより十分小さい。
- この丸めの上限 `5×10⁻⁷ × (1 + D)` に20倍の余裕を取り、`ε = 0.00001 × (1 + D)` m とした。例：キャラクター（D≈2.2）で約0.03mm、100mのステージ（D≈173）で約1.7mm。
- 実データで直す差（S01 が2mに縮む、キャラクターが2.0m・1.95mへ合わせられる）は、少なくとも数cm〜数十mで、ε より何桁も大きい。対照の `100ε` は、この差が確かに検出できることを確かめるための下限。
- 画面の画素では比べない。①の `camera.html` はステージを描かず、①と③は画角・枠の形・背景が違うので、画素の比較は、大きさの一致ではなく画面の作りの違いを測ってしまう。③のプレビューとMP4の画素の一致は、順3の試験（`studio-v05-saved-composition-real.test.cjs`）で保たれている。

## 7. 既存の③の作品への影響

- **保存ファイル。** 既存の場面インスタンスのファイルは移行しない。印の無い行は、L8a 後も同じ検査を通る（`_ROW_KEYS` と同じ6つ）。保存し直しても印は増えない（§6.1 U6）。
- **見た目。** 印の無いインスタンスは、`placeInstanceObject` の「印なし」の道を通る。式も順も `multi-model-ui-v58.js:1499-1504` と同じ（§6.2 N1〜N3）。プレビューとMP4は同じ画面を通るので、MP4も変わらない。
- **操作。** HTTP・MCP・WebMCP・画面から印は付けられない（`server.py:1222-1223` を変えない。§6.1 U8）。③で新しく置くステージ・モデルは、これまでどおり正規化される。
- **L8a より前に取り込んだ作品。** 変えない。大きさを旧に合わせたいときは、利用者が取消と再取込をする（§5）。
- **古い版のコード。** 印付きの作品を、この版より古いコードで開くと3D場面を読めない（元のファイルは残る。§2 の注）。

## 8. 実装の順と完了条件

実装は標準モデルで、次の順に行う。各段で共通の完了条件（[取込設計 §8](LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md) の「各WPの完了条件」1〜5）を満たしてコミットする。

1. §6.3 の試験を先に書き、変更前のコードで失敗すること（対照と同じ値になること）を確かめて記録する。
2. §4.1（保存）と §6.1 の U1〜U8。
3. §4.2（取込）と §6.1 の既存試験の直し、§5 の往復試験の追加。
4. §4.3〜§4.5（③の読込と画面）と §6.2。
5. §6.3 が合格。§6.5 の回帰が合格。
6. §4.6 の文書、台帳（`FEATURE_REGISTER.json`・`.csv` の `DATA-008` の `detail`、`FEATURE_DETAIL_JA.md`、`TRACEABILITY_JA.md`、`PHASE_E_IMPLEMENTATION_STATUS.json`）、Issue #69 へのコメント。
7. §6.4 を所有者のPCで実行し、結果を `docs/v05/LEGACY_IMPORT_REAL_DATA_<日付>_JA.md` に書く。

**L8a の完了条件**：§6.1〜§6.3・§6.5 がすべて合格（3D試験が skip された環境の結果は完了の根拠にしない）、§6.4 が所有者の実データ・実GPUで合格。`DATA-008` の台帳の状態は `要検証` のまま（L8b が残るため。取込設計 §9）。

## 9. 残るもの・範囲外

- ① `camera.html` が `character` の無い旧作品で描く「高さを合わせた」見た目には合わせない。基準は ② SCR-06（§3.4）。この旧作品では、③のキャラクターの大きさが `camera.html` と違うことがある（PMX は1.8mではなく素材の単位の大きさ、VRM は向きが π 違う）。
- GLB の内蔵アニメーション（`workspace.clip`）、照明、カメラの動きは L8a の範囲外（M5〜M8 のまま。カメラは WP-L8b）。
- 曲とダンスのモデル（S1）は印を付けない。旧の SCR-10 と同じ見た目で、L8a の前後で変わらない。
- 取込後の作品の MP4 は、順3で「プレビューと同じ画面を通る」と確かめた範囲で一致する。取込後の作品での MP4 の実行は、L8a では行わない（WP-L9 の未検証のまま）。
- 標準MCP・WebMCPからの取込は、同じ `apply` を通るので印も付くが、実クライアントでの確認は未検証のまま。Linux も未検証。

## 10. 所有者への質問

なし。案の選択は、取込設計 §10.1 のとおり開発側で決める技術の判断。`character` が無い旧作品の基準（§3.4）も、旧で2つを同じ場面に描く唯一の画面（SCR-06）に合わせるという技術の判断で決めた。

モデル区分：調査と設計は高性能モデル。実装は標準モデルで行う。
