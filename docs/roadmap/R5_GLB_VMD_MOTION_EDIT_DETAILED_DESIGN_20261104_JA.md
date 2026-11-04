# 順5 GLB→VMDとモーション編集 — 詳細設計（2026-11-04）

対象は[再構築ロードマップ](V05_REBUILT_ROADMAP_20261102_JA.md)の順5「GLB→VMD・骨編集」（`MOTION-003/004/005/006/007/010`）と [Issue #102](https://github.com/baisound/BAI_CREATER_STUDIO/issues/102)。画面は③（`/studio/v05`）だけを扱う。この文書は設計であり、実装・試験・完成の証拠ではない。既存の[変換記録](../v05/GLB_TO_VMD_20261024_JA.md)と[MOTION-010詳細設計](MOTION010_V05_DETAILED_DESIGN_20261024_JA.md)を前提にし、重ねて実装しない。


> **状態（2026-11-05）：草案。このままでは実装に使わない。** 作成後に独立した批評を3つの観点で行い、技術の正しさは確認中、抜けと試験可能性で止まる級4件、範囲と順序で高2件の指摘を受けた（§8）。§8 の直しを反映し、もう一度判定を受けてから実装する。さらに、ロードマップの次の実施順3・4に残りがあるため、順5の実装はその後に始める。

## 0. 先に結論（初めて読む人向け）

③では、登録済みのGLBダンスを作品内のPMX用VMDへBlenderで変換し、同じ作品に置ける。骨の対応も画面で直して保存できる。さらにMOTION-010の骨補正（FK/IK・レイヤー・別名VMD候補・採用・復元）も実PMXで限定確認されている。

まだ足りないのは主に次の5つ。

1. **変換結果が正しいかを測っていない。** 今は「VMDが出来て、姿勢が変わった」までしか確かめていない。GLBとPMXの初期姿勢（Tポーズ／Aポーズ）の違い、PMXの付与（D骨・腰キャンセル）、足IKを、変換コードが扱っていない（§1.2）。
2. **変換の失敗や結果が画面に十分出ない。** 未対応骨、出力の検査結果、「目視未確認」の状態が、変換直後の一行にしか出ない。台帳の破損時に登録一覧を空で上書きしうる欠陥もある。
3. **骨対応プロファイルの取消・共有がない**（`MOTION-005` の「共有」）。
4. **標準MCP・WebMCPからGLB→VMDを使えない。** MOTION-010の標準MCPの道具も画面より古い。
5. **GLB由来のVMDに補正をかけて作品出力するまでの通し試験**、別PMXでの確認、Linuxでの確認がない。

これを7つの作業単位（WP-R5-1〜7）で順に埋める（§3）。

## 1. 現状（コード上の根拠）

### 1.1 実装済み（③）

| 機能 | 根拠 |
|---|---|
| 候補一覧（登録GLB動作×作品に置いたPMX） | `studio_v05_glb_vmd.py:45-57`、`server.py:517-526` |
| 骨対応の表示・保存（改訂番号付き、PMXハッシュ＋GLB骨構造で識別、破損ファイルは初期化しない） | `studio_v05_glb_vmd_map.py:103-182`、`server.py:527-537,1068-1083` |
| Blender変換（30fps標本化、単一アクション、別名 `mmd/vmd/glb_v05_<uuid>.vmd`、入力ハッシュ照合、台帳に `needs_visual_validation`） | `studio_v05_glb_vmd.py:75-152`、`tools/glb_to_vmd_candidate.py:41-142` |
| 画面：素材欄「GLBダンス → PMX用VMD」、骨対応表、変換→作品のモーション行へ配置→PMXインスタンスへ結合 | `studio/v05/js/glb-vmd-ui-v102.js:1-108` |
| 足接地の読み取り診断（2秒、つま先骨） | `multi-model-ui-v58.js:1364-`（`sampleFootContact`）、`server.py:1793` |
| MOTION-010：作品別補正キー・レイヤー・FK/IK・別名VMD候補（whole/interval/legacy_sparse）・ブラウザ実PMX検査・採用・復元 | `studio_v05_motion_edits.py`、`studio_v05_vmd_candidate.py:42-115`、`studio_v05_vmd_adoption.py:126-239`、`multi-model-ui-v58.js:2009-2120`、`pmx-vmd-candidate-validation-v120.js:60-` |
| WebMCP（③内 `document.modelContext`）：プレビュー、FK補正の取得・変更、候補作成 | `multi-model-ui-v58.js:2565-2632` |
| 標準MCP：FK補正の取得・変更、候補作成 | `mcp_server.py:68-70,208-210` |
| 試験：骨対応3件（pytest、1件は実データ）、実GLB/PMXのブラウザ1件 | `tests/test_studio_v05_glb_vmd_map.py`、`tests/studio-v05-glb-vmd-real.test.cjs` |

### 1.2 コードを読んで分かった問題（実データでは未測定）

以下はコードと Three.js r160 の実装から導いた推定で、所有者の実PMXでは未測定。WP-R5-4 の測定で確かめる。

| 番号 | 問題 | 根拠 |
|---|---|---|
| P1 | **初期姿勢の差を補正しない。** PMXの各骨の世界回転を「GLBの今の世界回転 × GLBの初期世界回転の逆」で作る。GLBがTポーズ、PMXがAポーズなら、腕は最初から最後まで約30〜40°ずれる。 | `tools/glb_to_vmd_candidate.py:80-81,114-117` |
| P2 | **付与（grant）を無視する。** 既定の対応では `左足` と `左足D` の両方へ同じ回転を書く。Three.js の付与は「自分のキー × 付与元の回転」を掛ける（`MMDAnimationHelper.js` の `GrantSolver.addGrantRotation`）。`足D` が `足` から付与率1を受けるPMXでは、脚の回転が二重にかかる。`腰キャンセル`（付与率−1）も親の世界回転の計算に入っていない。 | `studio_v05_glb_vmd_map.py:19-20`、`glb_to_vmd_candidate.py:107-119`。three r160 `MMDAnimationHelper.js` の `updateOne`/`addGrantRotation` |
| P3 | **足IKのターゲットにキーを書かない。** ③の再生はIKを常に解く（`studio/js/motion/player.js:48-49,69-75`）。`足ＩＫ`・`つま先ＩＫ` は初期位置のままなので、脚のFKキーはIKに上書きされうる。VMDの「IKのON/OFF」区画で切る方法は、three r160 の VMD 読込（`mmdparser.module.js` の `parseVmd`）がこの区画を読まないため、③では効かない。 | `glb_to_vmd_candidate.py:30-34,131-133` |
| P4 | 身長の比が、PMXの全骨（髪・装飾を含む）のY幅から作られる。上下の移動量が過大・過小になりうる。上下の基準も先頭フレームの腰なので、しゃがんだ姿勢で始まる動作では床から浮く。 | `glb_to_vmd_candidate.py:82-88,121-124` |
| P5 | **MMD台帳の破損時に一覧を消しうる。** `read_mmd()` は読めないとき空の一覧を返す。変換はその上に1件だけ追記して保存するため、壊れた `mmd_assets.json` を「新VMD1件だけ」の一覧で置き換える。採用処理には厳格な読込が既にある。 | `server.py:169-174`、`studio_v05_glb_vmd.py:133-141`、比較 `studio_v05_vmd_adoption.py:84-93` |
| P6 | 骨名が Mixamo 系でないGLBでは、骨対応表そのものが開けない。表示前の `inspect` が最小骨数の検証で例外になるため、手で直す機会がない。 | `studio_v05_glb_vmd_map.py:131-132,150-161` |
| P7 | 変換結果の `unmapped`（対応なし骨）をサーバーが捨て、画面にも出ない。出力VMDの読み戻し検査（骨名・キー数・長さ）もない。台帳の `needs_visual_validation` は画面に出ない。 | `studio_v05_glb_vmd.py:114-121,145-152`、`glb-vmd-ui-v102.js:103` |
| P8 | 標準MCPの `api()` は12秒で打ち切る。Blender変換（実GLB60秒で数分）を呼べない。MCPにGLB→VMDの道具が無い。MOTION-010の標準MCPの道具は `arm-set`・`keys`・`position`・`solo`・候補の `mode` を欠き、採用・復元も無い。 | `mcp_server.py:11-17,209-210`、比較 `multi-model-ui-v58.js:2576-2614`、`server.py:1130-1146` |

### 1.3 実行環境の制約（この設計を書いた環境）

このクラウド環境（Linux）には Blender が無く、`BAI_REAL_MMD_DATA` も設定されていない。実GLB・実PMX・実GPUは触っていない。§1.2 は実測ではない。

## 2. 範囲

### 2.1 範囲内（Issue #102・ロードマップ順5の残件に限る）

- GLB→PMX VMD変換の正しさ（初期姿勢・付与・足IK・身長、`MOTION-004`）と、変換結果の機械検査・測定・表示（Issue #102「骨キー・長さ・元GLBとの対応を検査」「骨不足・不一致、出力先、未確認の品質を明示」）。
- 失敗経路（無動作GLB、骨不足、古い改訂、Blender失敗、台帳破損）での原本保持と理由表示。
- 骨対応プロファイルの取消・やり直し・共有入出力（`MOTION-005`「保存・共有・再利用」）。
- 手動UI・共通API・WebMCP・標準MCPの対応範囲（Issue #102「確認方法」）。
- GLB由来VMDにMOTION-010の補正をかけ、別名候補→実PMX検査→採用→短いMP4まで通す試験（ロードマップ残件「すべての補正候補の採用判定と作品出力」）。
- 別PMX（登録済みの201骨・246骨PMX）での確認と、Linuxでの変換経路の自動試験。

### 2.2 範囲外（作らない）

- 足接地の**自動補正**（`MOTION-011` の修正機能）。順5では足IKへのGLB足位置の焼き込みと既存の接地診断だけを使う（§5 Q1）。
- 物理ON（揺れ物）のプレビュー・出力（§5 Q2）。③は物理OFFのまま。
- 標準名でないPMX（英語名など）への対応先の付け替え（§5 Q3）。
- BVH・VRM・FBX動作からの変換、複数アクションGLB、Mixamo以外の自動対応表。
- 旧①②画面の変更。②の `/workspace/08` やSCR-23のFBX変換（`/api/export-vmd-job`）には触れない。
- 変換VMDの「所有者採用」状態。AGENTS.md の規則7により、Phase E 全機能が終わるまで所有者確認を求めない。機械検査の合否と所有者の採用は分けて記録する。
- MOTION-010の新しい操作（look-at、重みキー、レイヤー並べ替えなど、MOTION-010設計 §8 で作らないと決めたもの）。

## 3. 作業単位（この順に実装する）

各WPは「実装→自動試験→台帳・ロードマップ・`docs/v05/GLB_TO_VMD_20261024_JA.md` 追記→`work_state.py done`→コミット」で1区切り。WPの途中で次へ進まない。

共通の約束：

- 理由コードは `ConversionError(message, status, code)` / `MappingError(message, status, code)` の第3引数で持つ。`server.py` は `self.bad(exc.status, str(exc), exc.code)` で返す（`server.py:239-242` は `error_code` に対応済み）。画面は `error_code` を §4 の日本語文へ写して表示し、英語の `error` を補足に出す。
- 新しいJSONファイルは「一時ファイルへ書き→`os.replace`」で保存する。読めないファイルは初期化せず 422 を返す。
- 原本（GLB・PMX・既存VMD・旧VMD）は読むだけ。変換で作るファイルは常に新しい名前。

### WP-R5-1 安全修正と理由コード（P5・P6・P7の一部）

要件：`MOTION-003/005/007`、Issue #102 の失敗経路。AGENTS.md「スコープ凍結」5の必要不可欠なバグ修正（P5 はデータ消失、P6 は手動修正ができない）。

変更：

1. `studio_v05_glb_vmd.py`
   - `ConversionError.__init__(self, message, status=400, code=None)`。`self.code = code`。既存の全 `raise` に §4 のコードを付ける。
   - `convert()` の引数 `read_mmd` を `mmd_index_path`（`Path`）に置き換え、中で新関数 `read_mmd_strict(path)` を呼ぶ。判定は `studio_v05_vmd_adoption._registry` と同じ（無ければ `{'A':[],'B':[],'vmd':[]}`、読めない・`vmd` が list でなければ `ConversionError(..., 422, 'mmd_registry_unreadable')`）。`server.py:1102-1104` の呼出しを `MMD_META` を渡す形へ変える。`write_mmd` はそのまま。既存の `tests/test_studio_v05_glb_vmd_map.py::test_missing_blender_keeps_real_inputs` も新しい引数に合わせる。
   - `convert()` に `blender_argv=None`（与えたときは `shutil.which` を使わずこの配列を実行ファイルとして使う。試験用）と `timeout_seconds=600` を足す。
   - `server.py:1084-1111` の既存の拒否にもコードを付ける：候補に無いGLB/PMXは `target_not_in_project`、`CONVERT_LOCK` が取れないときは `conversion_busy`。
   - 返り値に `unmapped`（Blenderの結果から）、`output_name`、`converter_version` を加える。台帳の行にも `unmapped` を残す。
2. `studio_v05_glb_vmd_map.py`
   - `MappingError` に `code` を足す。`source_skeleton` の各 `raise` を §4 のコードにする。
   - `validate()` はそのまま例外を出す。新関数 `check(overrides, source_names, target_names)` は `(effective_or_partial, problem)` を返し、例外を出さない。`problem` は `None` か `{'code':..., 'message':...}`。
   - `inspect()` は `check()` を使い、返り値に `valid: bool` と `problem` を加える。`effective` は不足でも作れる範囲を返す。`save()` は従来どおり `validate()` で拒否する。
3. `glb-vmd-ui-v102.js`
   - `inspect` が `valid:false` のとき、表は出し、［変換して配置］は無効にして `problem` を表示する。
   - 変換成功時は、骨数、未対応骨（最大20件と残数）、出力ID、「目視未確認（機械検査前）」を表示する。

試験（pytest、Blender不要。Linuxでも走る）：

- 新 `tools/make_test_humanoid_pmx.py`：`build_humanoid_pmx(*, d_bones=True, waist_cancel=True, foot_ik=True) -> bytes`。PMX 2.0、UTF-16LE、骨は `全ての親`・`センター`・`グルーブ`・`腰`・`上半身`・`上半身2`・`首`・`頭`・`下半身`・左右の `肩/腕/ひじ/手首`・左右の `足/ひざ/足首/つま先`、`d_bones` なら左右の `足D/ひざD/足首D/足先EX`（`足D` は `足` から回転付与率1、`ひざD`・`足首D` も同様）、`waist_cancel` なら左右の `腰キャンセル`（`腰` から付与率−1、`足D` の親）、`foot_ik` なら左右の `足ＩＫ`（対象 `足首`、リンク `ひざ`（角度制限あり）・`足`）と `つま先ＩＫ`（親 `足ＩＫ`、対象 `つま先`、リンク `足首`）。頂点は3点・面1・材質1（`make_test_pmx.py` と同じ最小構成）。骨位置は人体の比率（身長約20単位、Aポーズで腕は水平から35°下）。`pmx_bones.parse` で読めることを試験する。
- 新 `tests/glb_fixture.py`：`build_mixamo_glb(path, *, animated=True, joints=MIXAMO_51)`。JSONチャンクだけのGLB（ヘッダーの全長＝ファイル長）。`skins` 1件、`animations` 1件（`animated=False` なら0件）、ノード名 `mixamorig:Hips` など。Tポーズのrest。
- 新 `tests/fake_blender.py`：偽Blender。試験は `blender_argv=[sys.executable, 'tests/fake_blender.py']` で `convert()` を呼ぶ（WindowsでもLinuxでも同じ。実行権限や `.cmd` は使わない）。台本は `-b -t 2 --python <script> -- --job <job.json>` を受け、環境変数 `BAI_FAKE_BLENDER_MODE` に従い、`ok`（ジョブの入力から本物と同じ形の結果行を作り、正しいVMD 3フレームと参照ファイルを書く）、`exit1`、`no_marker`、`bad_hash`、`bad_header`、`huge`、`sleep`（試験では `timeout_seconds=2`）を再現する。`subprocess.run` に渡す環境は親の環境をそのまま継ぐ。
- 新 `tests/test_studio_v05_glb_vmd_convert.py`：
  - 各 `fake_mode` で、HTTP相当の status と `code`、`mmd/vmd` に新ファイルが無いこと、原GLB/PMXのSHA-256不変。
  - 壊れた `mmd_assets.json`（`{invalid`）で `mmd_registry_unreadable`・422、ファイルのバイト列が不変、出力VMDが残らない。
  - 無動作GLB（`glb_single_action_required`）、骨10本（`glb_skeleton_incomplete`）、存在しない骨名（`map_bone_unknown`）、古い改訂（`map_revision_conflict`・409）。
  - 非Mixamo名のGLBで `inspect` が `valid:false` と表を返し、`save` は不足のまま拒否、手で15骨以上を対応させると保存できる。

完了条件：上の pytest がすべて成功（スキップ0）。既存 `tests/test_studio_v05_glb_vmd_map.py` も成功。`npm run typecheck` 成功。

未検証として残す：実Blender、実画面（WP-R5-4でまとめて確認）。

### WP-R5-2 変換VMDの読み戻し検査（P7）

要件：`MOTION-006/007`、Issue #102「骨キー・長さ・元GLBとの対応を検査」。

変更（`studio_v05_glb_vmd.py`）：

- Blender結果の必須項目を増やす：`keyed_bones`（VMDに書いた骨名の配列。WP-R5-3以降はIK骨を含む）、`frames`、`source_duration_seconds`（GLBアクションの長さ）。
- 新関数 `verify_output(path, result, target_names) -> dict`。`vmd_readback.read_vmd_bones(path)` で読み、次をすべて満たさなければ `ConversionError(..., 422, 'vmd_output_invalid')`：
  1. 全骨名がPMXの骨名に含まれる。骨名の集合が `keyed_bones` と一致。
  2. 骨ごとのキーが `0..frames-1` を1回ずつ持つ（重複・欠番なし）。総キー数＝`len(keyed_bones) × frames`。
  3. `(frames-1)/30` と `source_duration_seconds` の差が 1/30 秒以内。
  4. `remaining_bytes == 20`（モーフ・カメラ・照明・影・IKの件数がすべて0）。
- 返す検査結果（台帳の `verification` と応答に入れる）：`{"status":"binary_verified_not_visual","bone_names":N,"bone_keys":K,"frames":F,"duration_seconds":D,"source_duration_seconds":S}`。

試験：`tests/test_studio_v05_glb_vmd_convert.py` に、偽Blenderの `ok_extra_bone`（PMXに無い骨名）、`ok_gap`（フレーム欠番）、`ok_short`（長さ不一致）を足し、どれも 422・出力なし・台帳不変を確かめる。正常系で `verification` が台帳と応答に入る。

完了条件：pytest 成功。台帳の追記項目を本書 §3 WP-R5-3 の台帳形と一致させる。

### WP-R5-3 変換 v2：初期姿勢・付与・足IK・身長（P1〜P4）

要件：`MOTION-004`（初期姿勢・軸・身長・スケール）、`MOTION-007`。

方針：姿勢の計算をBlenderから切り離し、純粋なPython（`bpy` なし）の新モジュール `studio_v05_glb_vmd_solve.py` に置く。Blender台本は「GLBを標本化してこのモジュールに渡し、VMDと参照ファイルを書く」だけにする。旧方式（v1）は `job['converter_version']=1` で残し、測定の比較に使う。画面と既定は v2。

座標：計算はすべて「変換空間」で行う。変換空間は既存台本の `axis = Quaternion((1,0,0),-π/2)` 適用後の右手系Y上（`glb_to_vmd_candidate.py:78`）で、Three.js が読み込んだPMXのモデル空間（MMDのzを反転）と同じ向き。PMXの骨位置 `p=(x,y,z)` は `(x,y,-z)` として使う。VMDへは従来どおり回転 `(-qx,-qy,qz,qw)`、位置 `(x,y,-z)` で書く（`glb_to_vmd_candidate.py:131-133`）。四元数は `(w,x,y,z)` の tuple。

`studio_v05_glb_vmd_solve.py` の関数：

1. `quat_mul, quat_inv, quat_rotate, quat_normalize, quat_from_to(a,b)`（最短弧。反対向きは垂直軸で180°）、`slerp_three(qb, t)`：単位四元数から `qb` への補間を **three r160 `Quaternion.slerp` と同じ手順**で行う（`t==0`/`t==1` の早期返却、`cosHalfTheta<0` の符号反転、`sqrSinHalfTheta <= Number.EPSILON` の分岐を含む。付与率−1の外挿もこの式に従う）。
2. `ALIGN_CHILD`：初期姿勢を合わせる骨と、その向きを決める子の表。左右とも：`肩→腕`、`腕→ひじ`、`ひじ→手首`、`手首→中指１`、`足→ひざ`、`ひざ→足首`、`足首→つま先`、`足D→ひざD`、`ひざD→足首D`、`足首D→足先EX`、`上半身→上半身2`（無ければ `首`）、`上半身2→首`、`首→頭`、各指 `１→２`、`２→３`、親指は `０→１`、`１→２`。表に無い骨と、子かその対応GLB骨が無い骨は合わせない（恒等）。
3. `align_table(pmx_bones, effective, source_rest_heads) -> {target_index: q_align}`。`d_pmx = pos(子) − pos(骨)`、`d_glb = head(子の対応GLB骨) − head(対応GLB骨)`（rest、変換空間）。`q_align = quat_from_to(d_pmx, d_glb)`。
4. `solve_frame(pmx, mapped, center_delta) -> (final_local, world_rot, world_pos)`。
   - `mapped`：`{target_index: R_want}`。`R_want = delta_S × q_align_T`、`delta_S = 今のGLB世界回転 × rest世界回転の逆`（既存の式）。
   - `final_local(i)` をメモ化して求める（循環は `ConversionError('grant_cycle')`）：
     - 付与 `g`：骨のflagsに `0x100`（回転付与）があり `0x80`（ローカル付与）が無いとき、`g = slerp_three(final_local(src), ratio)`。それ以外は恒等（three r160 と同じく位置付与・ローカル付与は無視）。
     - 対応骨：`want_local = world_rot(親)^-1 × R_want`、書くキー `raw_local = want_local × g^-1`、`final_local = want_local`。
     - 非対応骨：`raw_local = 恒等`（キーを書かない）、`final_local = g`。
     - `world_rot(i) = world_rot(親) × final_local(i)`（親なしは恒等）。
   - 位置：`world_pos(i) = world_pos(親) + world_rot(親)⊗(rest(i) − rest(親)) + world_rot(親)⊗key_pos(i)`。`key_pos` は `センター` だけ `world_rot(親)^-1 ⊗ center_delta`。
   - IK は解かない（次の焼き込みでIKの目標をFKの結果に合わせる）。
5. `bake_ik(pmx, world_rot, world_pos, solvable) -> {ik_index: key_position}`。PMXのIK骨（flags `0x20`）を階層の浅い順に処理する。全リンク骨が `solvable`（対応骨か、対応骨から回転付与を受ける骨）のときだけ焼く。IK骨の世界位置を対象骨のFK世界位置に合わせる：`key = world_rot(親)^-1 ⊗ (world_pos(対象) − world_pos(親)) − (rest(IK) − rest(親))`。親が先に焼いたIK骨なら、その焼いた位置を親の世界位置に使う（IK骨の回転は恒等）。焼けないIK骨は `ik_unbaked` に名前を残す。
6. `scale_and_center(...)`：身長比は「脚の長さ」の比、`s = mean_LR(PMX y(足) − y(足首)) / mean_LR(GLB z(UpLeg head) − z(Foot head))`。どちらかの骨が無ければ旧方式（全骨Y幅）に戻し、`scale_method:'full_height_fallback'`。上下の基準はGLBのrestの腰の高さ、水平は先頭フレームの腰。restの腰と先頭フレームの腰の高さの差が脚の長さの半分を超えるときは先頭フレームを使い、`center_reference:'first_frame_fallback'` を警告に入れる。`center_delta = (hip(t) − ref) × s`。
7. `reference_samples(...)`：測定用の参照。標本時刻は0秒、以後1秒ごと、最後のフレーム（最大240点。超えるときは均等に間引く）。各時刻に：
   - `directions`：`CHECK_PAIRS`（左右の `腕→ひじ`、`ひじ→手首`、`足→ひざ`、`ひざ→足首`、あれば `足D→ひざD`、`ひざD→足首D`、および `上半身→首`、`首→頭`）ごとに、GLB由来の期待方向 `delta_S ⊗ normalize(d_glb)`（単位ベクトル、変換空間）。
   - `positions`：`左足首`・`右足首`・`左つま先`・`右つま先` のFK世界位置（変換空間、PMX単位）。

`tools/glb_to_vmd_candidate.py` の変更：

- `sample(job)` は標本化だけ行い、`studio_v05_glb_vmd_solve` を呼ぶ。v2 では各フレームで `solve_frame` → `bake_ik` → キー行。対応骨は `raw_local` を書く（四元数の符号は直前フレームと内積が負なら反転、既存の `previous` の処理）。IK骨は回転恒等・位置 `key` を書く。`センター` は `key_pos`。
- 参照を `job['reference_output']` に JSON で書く：`{"schema":1,"converter_version":2,"fps":30,"coordinate":"three_pmx_model_space","samples":[{"t":秒,"frame":VMDフレーム,"directions":{"左腕>左ひじ":[x,y,z],...},"positions":{"左足首":[x,y,z],...}}]}`。
- 結果に `converter_version`、`keyed_bones`、`ik_baked`、`ik_unbaked`、`aligned_bones`、`grant_compensated`、`scale`、`scale_method`、`center_reference`、`source_duration_seconds` を足す。

`studio_v05_glb_vmd.py` の変更：

- `convert(..., converter_version=2)`。ジョブに `converter_version` と `reference_output` を渡す。成功時、参照を `data/studio_v05_glb_vmd_reports/<VMD名>.reference.json` へ移す（既存なら `vmd_output_invalid`、出力は捨てる）。
- 台帳の行（`mmd_assets.json` の `vmd` 配列に追記、既存行は変えない）：

```json
{"name":"glb_v05_<hex>.vmd","size":0,"sha256":"…","source_asset_id":"integrated:…","target_asset_id":"mmd:A:…",
 "source_sha256":"…","target_sha256":"…","review_status":"needs_visual_validation",
 "mapping_profile_key":"…","mapping_revision":3,"converter_version":2,
 "unmapped":["…"],"ik_baked":["左足ＩＫ","右足ＩＫ","左つま先ＩＫ","右つま先ＩＫ"],"ik_unbaked":[],
 "scale":12.3,"scale_method":"leg_length","center_reference":"rest",
 "verification":{"status":"binary_verified_not_visual","bone_names":63,"bone_keys":113463,"frames":1801,"duration_seconds":60.0,"source_duration_seconds":60.0333},
 "reference_file":"glb_v05_<hex>.vmd.reference.json","reference_sha256":"…"}
```

- `server.py` のPOST `/api/studio/v05/motion/glb-vmd` は任意の `converter_version`（1か2、既定2）を受ける。画面は2だけを送る。v1 は試験と比較専用で、v1の出力は `reference_file` を持たない。

試験（pytest、Blender不要）：新 `tests/test_studio_v05_glb_vmd_solve.py`。`make_test_humanoid_pmx` を `pmx_bones.parse` で読んだ骨と、合成のGLB rest（Tポーズ）を使う。

1. 動きなし（`delta`＝恒等）で、合わせた骨の方向がGLBのrest方向と1e-6以内（Aポーズ→Tポーズ）。合わせない設定（`ALIGN_CHILD` 空）では方向がPMXのrestのまま。
2. 付与：試験側に three r160 の付与を写した評価器（`final = raw × slerp_three(final(src), ratio)`、ソートは deform_layer→index）を置き、`raw_local` を入れて再評価した対応骨の世界回転が `R_want` と1e-6以内。`足D`（付与率1）・`腰キャンセル`（付与率−1）を含むPMXと含まないPMXの両方。
3. IK焼き込み：焼いた `足ＩＫ`・`つま先ＩＫ` の世界位置が、対象骨のFK世界位置と1e-6以内。`つま先ＩＫ` は親が `足ＩＫ`。リンクが対応していないIK骨は `ik_unbaked`。
4. 付与の循環で `grant_cycle`。
5. 身長比と上下基準：脚の長さの比が既知値と一致。restと先頭フレームの差が大きいときは `first_frame_fallback`。
6. `slerp_three` を共通fixture `tests/fixtures/three_r160_slerp_cases.json`（t=−1, 0.5, 1、内積が負の例、ほぼ同じ回転の例）と1e-12で比較する。fixtureの正しさは Node の新 `tests/three-slerp-fixture.test.mjs` が確かめる。この試験は three r160 の `Quaternion.slerp`（MIT、出典とバージョンを注記）をそのまま写した関数でfixtureの値を再計算する。リポジトリは three を `node_modules` に持たず、③はCDNから読むため、写しで照合する。

試験（実Blender、`MIXAMO_BLENDER` と `BAI_REAL_MMD_DATA` が無ければスキップ）：`tests/test_studio_v05_glb_vmd_blender_real.py`。実GLB・実PMXを一時領域へ複製し、v1とv2で変換し、両方とも WP-R5-2 の検査に通ること、v2 の `ik_baked` に左右の `足ＩＫ` があること、原本SHA-256不変を確かめる。見た目の合否はここでは判定しない。

完了条件：Blender不要の試験がすべて成功。実Blender試験は実行できた環境と結果を記録（できなければ未検証と書く）。

未検証として残す：three の IK（CCD、膝の角度制限）が焼いた目標へ実際に届くか、見た目。→ WP-R5-4。

### WP-R5-4 実PMXでの機械測定・記録・変換済み一覧

要件：Issue #102「対象PMXへ適用して複数時刻の実変形…を比較」「変換ジョブ成功だけで合格とは表示せず」、`MOTION-004/006`。

測定の考え方：③の実際の再生（IK・付与ON、物理OFF）で、参照の各時刻へ動かし、PMXの骨の向きと足の位置をGLB由来の期待値と比べる。機械の合否と所有者の採用は分ける。

変更：

1. 新 `studio/v05/js/glb-vmd-quality-v102.mjs`（DOMなし、Nodeで試験できる）
   - `compareSample(reference, probed) -> {dirErrorsDeg:{pair:deg}, posErrors:{bone:units}}`。方向は `pos(子) − pos(骨)` を正規化して期待方向との角度（度）。位置は差の長さ。
   - `summarize(samples) -> {passed, maxDirDeg, meanDirDeg, maxPosError, worst:{pair,t}, worstPos:{bone,t}, samples:n}`。合格は「方向の最大≤15°、方向の平均≤5°、位置の最大≤0.5 PMX単位」。値は暫定の機械ゲートとして結果に `thresholds` を書き、所有者の採用とは呼ばない。
2. `multi-model-ui-v58.js`
   - `poseProbe` の隣に `modelSpaceProbe(instanceId, boneNames)` を足す（最大16骨、`inverse(target.object.matrixWorld) × bone.matrixWorld` の平行移動を返す）。
   - `async function sampleGlbVmdQuality(instanceId, clipId, reference, onProgress)`。`sampleFootContact`（`multi-model-ui-v58.js:1364-`）と同じ前提確認・中断条件・終了時の元時刻への復帰を使う。加えて：その行（`motionPlan.rows` の `clip_id`）が対象インスタンスに `ready` で読込済み、同じ (instance, clip) に有効なMOTION-010補正レイヤーが無い（あれば `quality_edits_present`）、再生中でない。各標本を `row.start + t` へ `motionCoordinator.seek` し、必要な骨を16件ずつ `modelSpaceProbe`。結果は `{samples:[{t, dirErrorsDeg, posErrors}], summary}`。
   - `BAIStudioMultiScenePreview` に `sampleGlbVmdQuality` を公開する。
3. 新API（`server.py` と新関数を `studio_v05_glb_vmd.py` に置く）
   - `GET /api/studio/v05/motion/glb-vmd/outputs` → `outputs(data, items)`。台帳の `vmd` のうち `name` が `glb_v05_` で始まり `source_asset_id` を持つ行を返す。各行に、存在（`available`）、`converter_version`（無ければ1）、`reference_available`、最新の測定の要約。台帳が読めなければ 422 `mmd_registry_unreadable`。
   - `GET /api/studio/v05/motion/glb-vmd/reference?asset_id=mmd:vmd:<name>` → 参照JSON。ファイルのSHA-256が台帳と違えば 409 `quality_reference_changed`。v1 は 404 `quality_reference_missing`。
   - `POST /api/studio/v05/motion/glb-vmd/quality`、本文 `{vmd_asset_id, model_asset_id, project_id, instance_id, clip_id, reference_sha256, samples}`（キーはこれだけ、64KiB以内）。サーバーは、VMD・参照のSHA-256が台帳と一致、`model_asset_id` のPMXのSHA-256が台帳の `target_sha256` と一致（違えば 409 `quality_identity_mismatch`）、`samples` の数と `t` が参照と一致、全数値が有限、を確かめる。要約は **サーバーが `samples` から計算し直す**（`summarize` と同じ規則を Python の `summarize_quality()` に実装）。`data/studio_v05_glb_vmd_reports/<VMD名>.quality.json` に `{"schema":1,"measurements":[…]}` として追記（最大20件、古い順に落とす）。各件は `{measured_at, project_id, instance_id, clip_id, model_sha256, summary, samples, status}`、`status` は `machine_check_passed_owner_unreviewed` か `machine_check_failed`。台帳の `review_status` は変えない。
4. `glb-vmd-ui-v102.js`
   - 「変換済みVMD」区画（折りたたみ、内部スクロール）：出力一覧から、選択中のPMXに対する行を表示。列は作成元GLB、方式（v1は「旧方式：初期姿勢・IK補正なし」）、未対応骨数、IK焼き込み、検査状態（「機械検査前」「機械検査 合格・目視未確認」「機械検査 不合格」）。
   - 各行の［品質を測る］：3Dプレビューが開いていて、その出力がこの作品の対象インスタンスへ配置済みのときだけ有効。無効の理由を表示（「3Dプレビューを開いてください」「この作品に未配置です」「補正レイヤーを外してください」など）。押すと参照を取得→`sampleGlbVmdQuality`→POST→一覧を再取得。最悪の骨と時刻を表示する。
   - 文言：「合格」単独では書かない。常に「機械検査」「目視未確認」を付ける。

Undo・保存再読込：測定は記録の追加だけで、Undoは無い（過去の記録は残る）。ページ再読込後も一覧と最新の要約が同じに出ることを試験する。

試験：

- Node：新 `tests/studio-v05-glb-vmd-quality.test.mjs`。`compareSample`・`summarize` を共通fixture `tests/fixtures/glb_vmd_quality_case.json`（閾値の境界上・超過・NaN拒否を含む）で確かめる。
- pytest：新 `tests/test_studio_v05_glb_vmd_quality.py`。同じfixtureで `summarize_quality()` がJSと同じ要約を返す。POSTの拒否（ハッシュ違い・PMX違い・標本数違い・非有限）、21件目で最古が落ちる、ファイル破損で422・不変。
- 実データ（`BAI_REAL_MMD_DATA`・`MIXAMO_BLENDER`・`CHROMIUM_PATH`、無ければスキップ）：新 `tests/studio-v05-glb-vmd-quality-real.test.cjs`。`tests/studio-v05-glb-vmd-real.test.cjs` と同じ隔離サーバー方式で、実GLB→v1とv2の変換→それぞれ別クリップとして配置→3Dプレビューで測定→記録→再読込→一覧の一致。v1とv2の要約値、最悪の骨・時刻、`ik_unbaked`、描画器名（SwiftShaderか実GPUか）を結果文書に書く。原本SHA-256不変。`node tests/run-guarded.cjs` で実行する。

完了条件：Node・pytestが成功。実データ試験は、実行環境があれば実行し、v2 が機械ゲートに通るか通らないかを**どちらでも数値で**記録する。通らない場合は不合格として記録し、原因（どの骨・時刻か）を `docs/v05/GLB_TO_VMD_20261024_JA.md` に書き、閾値を緩めて合格にしない。v2 の不合格が P1〜P3 の推定と違う原因なら、この設計の該当箇所を改訂してから直す。

未検証として残す：見た目の自然さ（手首のねじれ、指、足裏の接触）、所有者の採用。

### WP-R5-5 骨対応プロファイルの取消・やり直し・共有（MOTION-005）

変更（`studio_v05_glb_vmd_map.py`、`studio_v05_glb_vmd.py`、`server.py`、`glb-vmd-ui-v102.js`）：

- プロファイル行に `history`（以前の `overrides` の配列、最大50、古いものから落とす）と `redo`（配列）を足す。古い行（無い）は空として読む。`save` と `import` は変更前の `overrides` を `history` の末尾へ積み、`redo` を空にする。`undo` は `history` の末尾を取り出して今の値にし、変更前の値を `redo` の末尾へ積む。`redo` はその逆。どれも1操作＝1 revision。
- `POST /api/studio/v05/motion/glb-vmd/map` に任意の `action`：`save`（既定）・`undo`・`redo`・`import`。どれも `revision` が今の値と一致しなければ 409 `map_revision_conflict`。成功で `revision+1`。積むものが無ければ 409 `map_history_empty`。
- 書き出し：`GET /api/studio/v05/motion/glb-vmd/map/export?source_id=&target_id=` → 添付ファイル `bai-glb-pmx-map.json`：`{"schema":"bai-glb-pmx-map/1","target_sha256":…,"source_skeleton_sha256":…,"target_bones":[…],"source_bones":[…],"overrides":{…},"revision":n}`。
- 読み込み：`action:'import'`、`document` に上の形（16KiB以内）。`schema` 違いは 400 `map_import_schema_invalid`。`target_sha256` か `source_skeleton_sha256` が今と違えば、`apply_to_current:true` が無い限り 409 `map_import_identity_mismatch`（画面は確認ダイアログで「別のPMXまたは骨構造用です。骨名が合うものだけ使いますか」と聞き、はいなら再送）。`overrides` は今の骨で `validate()` し、合わない骨名は 400 `map_bone_unknown`（部分適用しない）。
- 画面：骨対応欄に［元に戻す］［やり直す］［書き出し］［読み込み］。変換中は無効。保存・取消後は表を再取得する。

試験（pytest）：保存→取消→やり直しで `overrides` と `revision` の列が期待どおり、古い改訂は409、51回保存で `history` が50、書き出し→別の一時dataへ読み込みで同じ `effective`、identity違いの409と `apply_to_current` での適用、不正な骨名で全体拒否・ファイル不変、旧形式の行（`history` なし）を読める。

完了条件：pytest 成功、`npm run typecheck` 成功。画面の操作は WP-R5-7 の実データ試験で1回確かめる。

### WP-R5-6 標準MCP・WebMCP（P8）

要件：AGENTS.md「AIなしで手動操作できること。WebMCP・標準MCPは補助で同じAPI」、Issue #102 の入口別記録。

標準MCP（`mcp_server.py`）：

- `api(path, payload=None, timeout=12)` にする。変換だけ `timeout=660`。
- 新しい道具（名前・HTTP）：
  - `bai_studio_glb_vmd_candidates`（GET candidates、`project_id`）
  - `bai_studio_glb_vmd_map_get`（GET map、`source_id`,`target_id`）
  - `bai_studio_glb_vmd_map_mutate`（POST map、`source_asset_id`,`target_asset_id`,`revision`,`action`,`overrides`,`document`,`apply_to_current`）
  - `bai_studio_glb_vmd_convert`（POST glb-vmd、`project_id`,`source_asset_id`,`instance_id`,`profile_revision`）。説明に「配置はしない。`bai_studio_clip_place` と `bai_studio_scene_motion_target_set` で置く。目視未確認」と書く。
  - `bai_studio_glb_vmd_outputs`（GET outputs）
- 既存の道具をAPIに合わせる：`bai_studio_pmx_fk_edits_mutate` に `arm-set`、`keys`（2件）、`key.position`、`settings.solo` を足す（WebMCP `multi-model-ui-v58.js:2576-2592` と同じ形）。`bai_studio_pmx_vmd_candidate_create` に `mode`（`whole`/`interval`/`legacy_sparse`）と、説明を「保存済み補正から別名候補を作る。実PMX検査・配置はしない」に直す。新 `bai_studio_pmx_vmd_candidate_restore`（POST restore）。採用はブラウザの実PMX検査結果が要るため標準MCPには置かない（説明に明記）。
- 品質測定は標準MCPに置かない（GPUの描画が要る）。記録の読み取りは `outputs` で行う。

WebMCP（③、`multi-model-ui-v58.js` の登録表）：

- `bai_studio_glb_vmd_quality_measure`（`project_id`,`instance_id`,`clip_id`,`vmd_asset_id`）：参照取得→`sampleGlbVmdQuality`→POST。結果の要約を返す。
- `bai_studio_pmx_vmd_candidate_validate_adopt`（`project_id`,`candidate_id`）：画面の［検査］［採用］と同じ処理。`fkValidate`/`fkAdopt` のクリック処理（`multi-model-ui-v58.js:2046-2105`）の中身を `validateCandidate(data)` と `adoptCandidate(report)` に切り出し、ボタンと道具の両方から呼ぶ。ボタンの挙動は変えない。
- 既存の `bai_studio_pmx_vmd_candidate_create` に `mode` を足す。
- GLB→VMDの変換・骨対応の道具は、WebMCPでは同じ名前で `glb-vmd-ui-v102.js` に登録する（`document.modelContext?.registerTool` があるときだけ。中身は上と同じHTTP）。

試験：

- pytest 新 `tests/test_studio_v05_glb_vmd_mcp.py`（`tests/test_studio_v05_legacy_import_mcp.py` と同じ形）：道具が一度ずつ載る、スキーマ、`run` がHTTPの道へ写る（`api` を差し替え）、変換だけ timeout 660。
- Node 新 `tests/studio-v05-glb-vmd-webmcp.test.mjs`：`glb-vmd-ui-v102.js` と `multi-model-ui-v58.js` の登録表を文字列として読み、道具名・必須引数・標準MCPと同じHTTPの道であることを照合する（実ブラウザでの呼出しは未検証と書く）。

完了条件：上の試験が成功。標準MCPの実クライアント、WebMCPの実ブラウザでの呼出しは未検証として記録する。

### WP-R5-7 実データの通し試験・別PMX・Linux・記録

要件：ロードマップ残件「すべての補正候補の採用判定と作品出力」「他PMXへの一般化」「MCP/Linux」。

1. 通し（新 `tests/studio-v05-glb-vmd-edit-output-real.test.cjs`、`BAI_REAL_MMD_DATA`・`MIXAMO_BLENDER`・`CHROMIUM_PATH` が無ければスキップ、`run-guarded` で実行）：隔離サーバーで、実GLB→v2変換→作品へ配置・結合→品質測定→頭骨に一定FK補正（Y10°）→`whole` 候補→画面の［検査］（実PMX全骨・全フレーム）→［採用］→再読込で採用の復元→F0〜F2の3フレームMP4を書き出し、補正前（元のGLB由来VMD）と画素差があること→［元に戻す（restore）］で元VMDのクリップへ戻ること。原本SHA-256不変。既存の部品で通らない箇所は、その既存要件の不具合として直し、記録する。
2. 別PMX：同じ試験の前半（変換→測定）を、登録PMXのうち内容が異なるもの（最大3つ、SHA-256で重複除外）で回す。各PMXの要約値・`ik_unbaked`・`unmapped` を表に書く。
3. 骨対応の画面操作：骨1本の対応を変える→保存→［元に戻す］→［やり直す］→書き出し→読み込み、の画面操作を1回、同じ試験の中で行う。
4. Linux：このクラウド環境（Linux）で WP-R5-1〜6 の Blender不要の試験をすべて回し、結果を書く。実Blender on Linux は、Blenderが入った環境でだけ `tests/test_studio_v05_glb_vmd_blender_real.py` を回す（無ければ未検証）。
5. 記録：`docs/v05/GLB_TO_VMD_20261024_JA.md` に追補（実行コマンド、環境、成功/失敗/スキップ、素材とハッシュ、数値、未検証）。`FEATURE_DETAIL_JA.md` の `MOTION-003/004/005/006/007/010` に追補1段落ずつ。`FEATURE_REGISTER.json` の `status` は「要検証」のまま変えない（所有者の採用・全ACが無いため）。ロードマップ順5の行を更新。Issue #102 へのコメントは、オーナーの依頼がある場合だけ行う。

完了条件：Blender不要の全試験が成功。実データ試験は、実行できた範囲と結果（不合格を含む）と、実行できなかった層を区別して記録済み。

## 4. 理由コードと画面の文

| code | HTTP | 画面の文（`glb-vmd-ui-v102.js` の表） |
|---|---|---|
| `glb_not_registered` / `pmx_not_registered` | 400 | 登録済みのGLB動作／PMXを選んでください。 |
| `target_not_in_project` | 400 | この作品の3DシーンにあるPMXを選んでください。 |
| `glb_header_invalid` | 400 | GLBファイルとして読めません。 |
| `glb_single_action_required` | 400 | アニメーションが1つだけ入ったGLBが必要です（無動作・複数動作は変換できません）。 |
| `glb_no_channels` | 400 | GLBのアニメーションに動きのデータがありません。 |
| `glb_skeleton_incomplete` | 400 | GLBの骨が不足しているか、骨名が重複しています。 |
| `map_bone_unknown` | 400 | 存在しない骨名が含まれています。 |
| `map_required_bones_missing` | 400 | 腰と左右の足を含む15本以上の対応が必要です。 |
| `map_revision_conflict` | 409 | 骨対応が別の画面で変わりました。読み直してください。 |
| `map_history_empty` | 409 | 戻す（やり直す）操作がありません。 |
| `map_file_unreadable` | 422 | 骨対応の保存ファイルが読めません。元のファイルは残しています。 |
| `map_import_schema_invalid` | 400 | 骨対応のファイル形式が違います。 |
| `map_import_identity_mismatch` | 409 | 別のPMXまたは骨構造用の骨対応です。 |
| `blender_missing` | 503 | Blenderが見つかりません。MIXAMO_BLENDERを設定してください。 |
| `blender_timeout` | 504 | Blenderの変換が10分を超えました。 |
| `blender_failed` | 422 | Blenderの変換に失敗しました（詳細を下に表示）。 |
| `blender_result_invalid` | 422 | 変換結果を確認できません（結果行・入力ハッシュの不一致）。 |
| `input_changed` | 409 | 変換中に元のGLB／PMXが変わりました。 |
| `vmd_output_invalid` | 422 | 出来たVMDが検査に通りません。登録していません。 |
| `mmd_registry_unreadable` | 422 | MMD素材の一覧ファイルが読めません。元のファイルは変更していません。 |
| `conversion_busy` | 409 | 別の変換が実行中です。 |
| `grant_cycle` | 422 | PMXの付与設定が循環しているため変換できません。 |
| `quality_reference_missing` | 404 | 旧方式の変換のため、品質を測れません。新しく変換してください。 |
| `quality_reference_changed` / `quality_identity_mismatch` | 409 | 測定の前提（VMD・参照・PMX）が変わりました。 |
| `quality_edits_present` | 409（画面内） | この動作に補正レイヤーがあります。外してから測ってください。 |
| `quality_report_invalid` | 400 | 測定結果の形式が不正です。 |

どの失敗でも、原GLB・PMX・既存VMD・台帳を変えない。`vmd_output_invalid` 以後は出力VMDを一時領域ごと消す（登録前なので利用者のファイルではない）。登録後に配置・結合だけが失敗した場合は、従来どおり別名VMDのIDを表示して残す（`glb-vmd-ui-v102.js:105`）。

## 5. 所有者への質問（返事が無ければ既定で進める）

- **Q1 足接地の自動補正（`MOTION-011`）を順5に含めますか。** 既定：含めない。順5ではGLBの足の位置を足IKへそのまま写し（WP-R5-3）、既存の接地診断で観測値を記録するだけにする。
- **Q2 物理（髪・服の揺れ）をONにした確認を順5の完了条件に含めますか。** 既定：含めない。③は物理OFFのまま、未検証として記録する（物理プレビューは②の曲とダンスにある）。
- **Q3 骨名が標準（日本語）でないPMXへの対応先の付け替えを順5に含めますか。** 既定：含めない。登録済みPMXは標準名で確認できたものを使い、標準名でないPMXは「対応不足」として変換を止める（WP-R5-1）。

## 6. 未検証のまま残るもの（順5完了時点でも）

- 見た目の自然さ（ねじれ・指・足裏）と所有者の採用。機械ゲートの合格は採用ではない。
- 測定の標本値はブラウザが送る。サーバーは形・前提のハッシュを確かめ、要約を計算し直すが、標本値そのものが描画どおりかは保証しない（画面では「機械検査」と表示する）。
- three の処理順で、`足D` などの付与骨がIKの前後どちらの `足` を使うか（WP-R5-4 の `足D` の方向誤差で観測する）。
- 物理ON、MMD本体での再生、実GPUでの長尺MP4、300Fを超える3D出力（順3の制約）。
- 標準MCPの実クライアント、WebMCPの実ブラウザでの呼出し。
- 実Blender on Linux（Blenderのある環境で実行しない限り）。
- 標準名でないPMX、Mixamo以外のGLB骨名の自動対応、複数アクションGLB。

## 7. 設計の批評と判定（2026-11-04）

依頼では、独立した批評役3つと判定役1つを別のエージェントとして起動する予定だった。この実行では別エージェントを起動する道具が使えなかった。そのため同じ作成者が、初稿を書いた後に観点を分けて3回批評し、最後に判定して本文を直した。独立した第三者レビューとは称しない。後で独立レビューを行う場合は、この表に回を足す。

| 回 | 観点 | 主な指摘 | 判定 | 反映 |
|---|---|---|---|---|
| 1 | 正しさ（コードとの照合） | (a) three は付与元の「付与後のローカル回転」を使う。付与前の値では `腰キャンセル`→`足D` の連鎖でずれる。(b) VMDのIK区画でIKを切る案は、three r160 がその区画を読まないため③で効かない。(c) 付与率−1は three の slerp の外挿と同じ式でないと一致しない。(d) 測定の座標は、Three.js が読んだPMXのモデル空間（MMDのz反転）で、インスタンスの移動・単位は `object.matrixWorld` の逆で外す必要がある。 | 全部採用 | WP-R5-3 の `final_local` を付与後の値で定義。IK区画案を捨て、IK目標の焼き込みに統一。`slerp_three` を three と同じ手順で写し、共通fixtureで照合。WP-R5-4 に `modelSpaceProbe` を置いた。 |
| 2 | 抜け・試験可能性 | (a) Blenderの無い環境で変換経路を何も試せない。(b) 偽Blenderを実行ファイルとして呼ぶとWindowsで動かない。(c) `convert()` の引数を変えると既存の実データ試験が壊れる。(d) 補正レイヤーが効いたまま測ると、変換の誤差と補正が混ざる。(e) 測定をブラウザの自己申告だけで記録すると要約が信用できない。(f) 非Mixamo名のGLBで表が開けない（P6）。(g) プロファイルの取消・やり直しの積み方が曖昧。 | (a)〜(d)(f)(g) 採用、(e) 一部採用 | 偽Blender・合成PMX/GLBを WP-R5-1 に追加し、`blender_argv`・`timeout_seconds` で呼ぶ形にした。既存試験の修正を明記。補正レイヤーがあるときは測定を拒否。サーバーが標本から要約を計算し直す。標本値の真正さは保証できないことを §6 に明記。P6 を WP-R5-1 に入れた。取消・やり直しの規則を WP-R5-5 に書いた。 |
| 3 | 範囲の逸脱 | (a) 足接地の自動補正・物理・非標準名PMXは順5の要件IDに含まれず、入れると計画外。(b) プロファイルの取消・共有は `MOTION-005` の「共有」と実装チェックの「Undo/Redo」にあり範囲内。(c) MCPの道具を作り直すのは過剰で、APIとの差分だけ直す。(d) v1 方式を消すと旧VMDとの比較ができない。(e) 「変換済みVMD」一覧は新機能に見えるが、Issue #102 の「未確認の品質を明示」の実装で範囲内。 | 全部採用 | (a) は §2.2 と Q1〜Q3 へ。(c) WP-R5-6 を差分の追加に限定。(d) v1 を試験・比較専用で残す（既存のv1出力はそのまま使える）。(e) 一覧は表示と測定の起動だけに限り、削除・名前変更などは作らない。 |

判定：上を反映した本書を、順5の実装入口として採用する。WP-R5-1→7 の順に進める。WP-R5-4 の実測で §1.2 の推定（P1〜P3）が外れた場合は、実装を続ける前に該当WPの設計を改訂する。この判定は設計の採用で、実装・品質・所有者採用の完了ではない。

モデル区分：調査・設計・批評・判定は高性能モデル。実装（WP-R5-1〜7）は標準モデルを想定。

## 8. 独立した批評（2026-11-05、未反映）

作成者とは別の批評役が、観点ごとに読んだ。指摘は次の版で反映し、判定を受け直す。

### 8.1 範囲とロードマップ順
- **【高】順序。** 次の実施順3（#39/#63/#81）と4（#187）が終わっていない。順3の残り：動画内音声、300フレーム超の3D出力、全区間で音と画の差1フレーム以内、同名完成物の版管理、保存カメラが無いときの自動構図、16:9より縦長の欄、出力のMCP。順4の残り：実PMXで元VMDと比べた顔・身体、採用口形を含む完成MP4、実際の歌声のSRT境界、実長尺VMDでの合成候補、開始0秒以外のクリップと整数でないFPS、LIPの標準MCP・WebMCP。順2にも残り（PMX ZIP・VMDの③からの直接登録、GLBステージ・動画の見本を③で作る、MP3・WebM・JPEG）。
- **【高】§2.2 の3件（足接地・物理・他PMXへの一般化）はロードマップ順5の残件そのもの。** 「範囲外（作らない）」ではなく「今回の作業単位では扱わず、順5の残件として未完成のまま残す」に直す。返事が無くても順5を完了にしない。
- **【中】WP-R5-4 の製品向け品質測定（ボタン・API・履歴・WebMCPの道具）は承認範囲の外。** 測定は実データ試験の中だけで使い、画面は台帳の `verification` などと「目視未確認」を出すだけにする。作るかどうかは所有者に聞く。
- 【中】「すべての補正候補の採用判定と作品出力」の範囲が狭い（`interval`・`legacy_sparse`・IK補正も通す）。【低】ログの記録が無い。【低】HTTP で v1 を指定できる入口は不要。
- 質問の見直し：Q2 は「③で物理ONの確認か、MOTION-021 の物理ベイクか、順5から外すか」を聞く形に。Q3 の既定は「手動対応でどの骨にも割り当て可、v2 の補正は標準名の骨だけ」に。足りない質問：品質測定機能を作るか、順3・4の実データ確認を待たずに順5を進めてよいか。

### 8.2 抜け・曖昧さ・試験可能性
- **止まる級：** (1) Blender 台本の中の失敗に理由コードを付ける約束が無い（`BAI_GLB_VMD_ERROR` 行と終了コード2など）。(2) `inspect()` を `valid:false` で返すと `convert()` が骨不足のまま Blender を走らせる。起動前に拒否する。(3) 骨対応の読み込みで、確認文（合うものだけ使う）と拒否の規則（部分適用しない）が食い違う。(4) 品質記録の64KiB上限が最大240標本に収まらない。平均の取り方も未定。
- **直すべき：**
  - three r160 は `node_modules` に実在する（`package.json` devDependencies）。付与・IKの照合は本物の `MMDLoader`・`MMDAnimationHelper`・`CCDIKSolver` で行える。
  - 実データ試験は `BAI_REQUIRE_REAL=1` で skip を失敗にする。
  - 各WPで `PHASE_E_IMPLEMENTATION_STATUS.json` に行を足す。
  - `npm run typecheck` は `studio/v05/js` を検査しないので `node --check` と単体試験に置き換える。
  - サーバー窓口のキー集合と上限、MCP の `project_id`→`?id=`、`.bad(..., exc.code)` の3か所。
  - 偽Blenderの出力の形をWPごとに表にする。
  - 例外→理由コードの対応表。
  - 品質記録の照合・排他・壊れたときの扱い。
  - 測定の時刻対応（in点0・速度1・重なり無しに限る）。
  - WP-R5-7 の丸投げ（MP4 の画素比較、別PMXの選び方）。
  - WP を小さく分ける（1a/1b/1c、3a/3b、4a/4b）。
- WORK_STATE の古い記載（L8a の回答待ち）は 2026-11-05 の引継ぎで直した。

### 8.3 技術の正しさ
確認中。結果は次の版で反映する。
