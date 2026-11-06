# 順5 GLB→VMDとモーション編集 — 詳細設計（2026-11-04）

> 2026-11-06、Issue #234 の配置整理に合わせて Python の参照先パスを更新した。行番号と設計上の判定は再評価していないため、実装時には現行コードで確認する。対応表は [Python移動表](PYTHON_PACKAGE_FILE_MAP_20261106.csv)。

> 2026-11-05 改訂草案。§8 の停止級を本文へ反映した。実コード・実PMXとの再照合と独立した再判定は未実施であり、以下の WP を実装の確定指示として扱わない。

対象は[再構築ロードマップ](V05_REBUILT_ROADMAP_20261102_JA.md)の順5「GLB→VMD・骨編集」（`MOTION-003/004/005/006/007/010`）と [Issue #102](https://github.com/baisound/BAI_CREATER_STUDIO/issues/102)。画面は③（`/studio/v05`）だけを扱う。この文書は設計であり、実装・試験・完成の証拠ではない。既存の[変換記録](../v05/GLB_TO_VMD_20261024_JA.md)と[MOTION-010詳細設計](MOTION010_V05_DETAILED_DESIGN_20261024_JA.md)を前提にし、重ねて実装しない。


> **状態（2026-11-05）：改訂草案。実装は未着手。** 独立批評の停止級と範囲・試験の主要指摘を反映した（§8.4）。再判定はまだ受けていない。ロードマップの次の実施順3・4にも実素材・Owner判断の残件があるため、順5の実装はその後に始める。Ownerが順序を変更した場合は、その直接指示を記録する。

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
| 候補一覧（登録GLB動作×作品に置いたPMX） | `bai_studio/v05/motion/glb_vmd.py:45-57`、`server.py:517-526` |
| 骨対応の表示・保存（改訂番号付き、PMXハッシュ＋GLB骨構造で識別、破損ファイルは初期化しない） | `bai_studio/v05/motion/glb_vmd_map.py:103-182`、`server.py:527-537,1068-1083` |
| Blender変換（30fps標本化、単一アクション、別名 `mmd/vmd/glb_v05_<uuid>.vmd`、入力ハッシュ照合、台帳に `needs_visual_validation`） | `bai_studio/v05/motion/glb_vmd.py:75-152`、`tools/glb_to_vmd_candidate.py:41-142` |
| 画面：素材欄「GLBダンス → PMX用VMD」、骨対応表、変換→作品のモーション行へ配置→PMXインスタンスへ結合 | `studio/v05/js/glb-vmd-ui-v102.js:1-108` |
| 足接地の読み取り診断（2秒、つま先骨） | `multi-model-ui-v58.js:1364-`（`sampleFootContact`）、`server.py:1793` |
| MOTION-010：作品別補正キー・レイヤー・FK/IK・別名VMD候補（whole/interval/legacy_sparse）・ブラウザ実PMX検査・採用・復元 | `bai_studio/v05/motion/motion_edits.py`、`bai_studio/v05/motion/vmd_candidate.py:42-115`、`bai_studio/v05/motion/vmd_adoption.py:126-239`、`multi-model-ui-v58.js:2009-2120`、`pmx-vmd-candidate-validation-v120.js:60-` |
| WebMCP（③内 `document.modelContext`）：プレビュー、FK補正の取得・変更、候補作成 | `multi-model-ui-v58.js:2565-2632` |
| 標準MCP：FK補正の取得・変更、候補作成 | `mcp_server.py:68-70,208-210` |
| 試験：骨対応3件（pytest、1件は実データ）、実GLB/PMXのブラウザ1件 | `tests/test_studio_v05_glb_vmd_map.py`、`tests/studio-v05-glb-vmd-real.test.cjs` |

### 1.2 コードを読んで分かった問題（実データでは未測定）

以下はコードと Three.js r160 の実装から導いた推定で、所有者の実PMXでは未測定。WP-R5-4 の測定で確かめる。

| 番号 | 問題 | 根拠 |
|---|---|---|
| P1 | **初期姿勢の差を補正しない。** PMXの各骨の世界回転を「GLBの今の世界回転 × GLBの初期世界回転の逆」で作る。GLBがTポーズ、PMXがAポーズなら、腕は最初から最後まで約30〜40°ずれる。 | `tools/glb_to_vmd_candidate.py:80-81,114-117` |
| P2 | **付与（grant）を無視する。** 既定の対応では `左足` と `左足D` の両方へ同じ回転を書く。③は `MMDAnimationHelper({pmxAnimation:true})` で `_animatePMXMesh` / `updateOne` を使い、変形階層順に付与とIKを評価する。`足D` が `足` から付与率1を受けるPMXでは回転が重なる可能性がある。`腰キャンセル`（付与率−1）も親の世界回転の計算に入っていない。最終的なずれは実PMXで測る。 | `bai_studio/v05/motion/glb_vmd_map.py:19-20`、`glb_to_vmd_candidate.py:107-119`、`player.js:74`、three r160 `MMDAnimationHelper.js:542-549,979-1030` |
| P3 | **足IKのターゲットにキーを書かない。** ③の再生はIKを常に解く（`studio/js/motion/player.js:48-49,69-75`）。`足ＩＫ`・`つま先ＩＫ` は初期位置のままなので、脚のFKキーはIKに上書きされうる。VMDの「IKのON/OFF」区画で切る方法は、three r160 の VMD 読込（`mmdparser.module.js` の `parseVmd`）がこの区画を読まないため、③では効かない。 | `glb_to_vmd_candidate.py:30-34,131-133` |
| P4 | 身長の比が、PMXの全骨（髪・装飾を含む）のY幅から作られる。上下の移動量が過大・過小になりうる。上下の基準も先頭フレームの腰なので、しゃがんだ姿勢で始まる動作では床から浮く。 | `glb_to_vmd_candidate.py:82-88,121-124` |
| P5 | **MMD台帳の破損時に一覧を消しうる。** `read_mmd()` は読めないとき空の一覧を返す。HTTPでは候補取得が先に失敗する場合もあるが、Blender実行中の台帳破損や `vmd` が dict になった場合、変換は1件だけの一覧で置換しうる。採用処理には厳格な読込が既にある。 | `server.py:169-174`、`bai_studio/v05/motion/glb_vmd.py:133-141`、比較 `bai_studio/v05/motion/vmd_adoption.py:84-93` |
| P6 | 骨名が Mixamo 系でないGLBでは、骨対応表そのものが開けない。表示前の `inspect` が最小骨数の検証で例外になるため、手で直す機会がない。 | `bai_studio/v05/motion/glb_vmd_map.py:131-132,150-161` |
| P7 | 変換結果の `unmapped`（対応なし骨）をサーバーが捨て、画面にも出ない。出力VMDの読み戻し検査（骨名・キー数・長さ）もない。台帳の `needs_visual_validation` は画面に出ない。 | `bai_studio/v05/motion/glb_vmd.py:114-121,145-152`、`glb-vmd-ui-v102.js:103` |
| P8 | 標準MCPの `api()` は12秒で打ち切る。Blender変換（実GLB60秒で数分）を呼べない。MCPにGLB→VMDの道具が無い。MOTION-010の標準MCPの道具は `arm-set`・`keys`・`position`・`solo`・候補の `mode` を欠き、採用・復元も無い。 | `mcp_server.py:11-17,209-210`、比較 `multi-model-ui-v58.js:2576-2614`、`server.py:1130-1146` |

### 1.3 実行環境の制約（この設計を書いた環境）

初稿を書いたクラウド環境（Linux）には Blender が無く、`BAI_REAL_MMD_DATA` も設定されていなかった。§1.2 の P1〜P4 は初稿時のコードからの推定であり、順5の実PMX測定ではない。2026-11-05 に別件の LIP-001 では Owner PC の実PMX・実VMDを使ったが、GLB→VMD の品質測定には流用しない。

## 2. 範囲

### 2.1 範囲内（Issue #102・ロードマップ順5の残件に限る）

- GLB→PMX VMD変換の正しさ（初期姿勢・付与・足IK・身長、`MOTION-004`）と、変換VMDの読み戻し検査、隔離試験内の実PMX測定、台帳の検証状態の読み取り表示（Issue #102「骨キー・長さ・元GLBとの対応を検査」「骨不足・不一致、出力先、未確認の品質を明示」）。
- 失敗経路（無動作GLB、骨不足、古い改訂、Blender失敗、台帳破損）での原本保持と理由表示。
- 骨対応プロファイルの取消・やり直し・共有入出力（`MOTION-005`「保存・共有・再利用」）。
- 手動UI・共通API・WebMCP・標準MCPの対応範囲（Issue #102「確認方法」）。
- GLB由来VMDにMOTION-010の補正をかけ、別名候補→実PMX検査→採用→短いMP4まで通す試験（ロードマップ残件「すべての補正候補の採用判定と作品出力」）。
- 別PMX（登録済みの201骨・246骨PMX）での確認と、Linuxでの変換経路の自動試験。

### 2.2 今回の作業単位には含めない順5の残件

- 足接地の**自動補正**（`MOTION-011` の修正機能）。今回の WP は足IKへの位置の焼き込みと既存の接地診断まで。接地補正は順5の未完成要件として残す（§5 Q1）。
- 物理ON（揺れ物）のプレビュー・出力（§5 Q2）。今回の測定は物理OFF。物理の扱いを順5から消さず、別の判断を要する残件とする。
- 標準名でないPMXへの変換品質の一般化（§5 Q3）。骨対応表では任意の実在骨名を手で指定できるようにするが、今回の v2 補正と品質判定は標準名の骨を持つ PMX に限る。一般化は未完成。

### 2.3 今回の承認範囲外

- BVH・VRM・FBX動作からの変換、複数アクションGLB、Mixamo以外の自動対応表。
- 旧①②画面の変更。②の `/workspace/08` やSCR-23のFBX変換（`/api/export-vmd-job`）には触れない。
- 変換VMDの「所有者採用」状態。AGENTS.md の規則7により、Phase E 全機能が終わるまで所有者確認を求めない。機械検査の合否と所有者の採用は分けて記録する。
- MOTION-010の新しい操作（look-at、重みキー、レイヤー並べ替えなど、MOTION-010設計 §8 で作らないと決めたもの）。

## 3. 作業単位（この順に実装する）

各WPは「実装→自動試験→台帳・ロードマップ・`docs/v05/GLB_TO_VMD_20261024_JA.md` 追記→`work_state.py done`→コミット」で1区切り。WPの途中で次へ進まない。

共通の約束：

- 理由コードは `ConversionError(message, status, code)` / `MappingError(message, status, code)` の第3引数で持つ。`server.py` は `self.bad(exc.status, str(exc), exc.code)` で返す（`server.py:239-242` は `error_code` に対応済み）。画面は `error_code` を §4 の日本語文へ写して表示し、英語の `error` を補足に出す。
- `server.py` の map GET/POST、convert POST の例外ハンドラはいま `self.bad(exc.status,str(exc))` なので、各窓口で必ず第3引数 `exc.code` を渡す。各 POST の許可キー集合と本文上限を試験で固定する。convert は既存の必須 `project_id/source_asset_id/instance_id` と任意 `profile_revision` だけ、8192 バイト以内。map POST は action ごとの許可キーを定義して 65536 バイト以内、import 文書の最大骨数・名前長・履歴数も検査する。`project_id` は GET では `?id=` に写す。
- 新しいJSONファイルは「一時ファイルへ書き→`os.replace`」で保存する。読めないファイルは初期化せず 422 を返す。
- 原本（GLB・PMX・既存VMD・旧VMD）は読むだけ。変換で作るファイルは常に新しい名前。
- 各 WP を 1a（入力保護・理由コード）/1b（骨対応の拒否）/1c（画面の理由）、3a（純粋計算）/3b（Blender・実 three 照合）、4a（数値比較）/4b（実素材証拠）の単位へ分けてコミットしてよい。依存順は保ち、各小単位でも `WORK_STATE`・台帳・試験記録を同期する。

### WP-R5-1 安全修正と理由コード（P5・P6・P7の一部）

要件：`MOTION-003/005/007`、Issue #102 の失敗経路。AGENTS.md「スコープ凍結」5の必要不可欠なバグ修正（P5 はデータ消失、P6 は手動修正ができない）。

変更：

1. `bai_studio/v05/motion/glb_vmd.py`
   - `ConversionError.__init__(self, message, status=400, code=None)`。`self.code = code`。既存の全 `raise` に §4 のコードを付ける。
   - `convert()` の引数 `read_mmd` を `mmd_index_path`（`Path`）に置き換え、中で新関数 `read_mmd_strict(path)` を呼ぶ。判定は `studio_v05_vmd_adoption._registry` と同じ（無ければ `{'A':[],'B':[],'vmd':[]}`、読めない・`vmd` が list でなければ `ConversionError(..., 422, 'mmd_registry_unreadable')`）。変換前に厳格に読み、変換ロック内の登録直前にも再読込する。実際の破損経路は、Blender 実行中の台帳破損または `vmd` が dict の場合。HTTP では候補外なら先に `target_not_in_project` で拒否される。`server.py:1102-1104` の呼出しを `MMD_META` を渡す形へ変える。`write_mmd` はそのまま。既存の `tests/test_studio_v05_glb_vmd_map.py::test_missing_blender_keeps_real_inputs` も新しい引数に合わせる。
   - `inspect()` が `valid:false` でも、変換 API は必ず Blender 起動前に現在の profile revision と骨対応の `validate()` を再実行し、`map_required_bones_missing` 等で拒否する。画面のボタン無効化だけを保護としない。
   - `convert()` に `blender_argv=None`（与えたときは `shutil.which` を使わずこの配列を実行ファイルとして使う。試験用）と `timeout_seconds=600` を足す。
   - `server.py:1084-1111` の既存の拒否にもコードを付ける：候補に無いGLB/PMXは `target_not_in_project`、`CONVERT_LOCK` が取れないときは `conversion_busy`。
   - 返り値に `unmapped`（Blenderの結果から）、`output_name`、`converter_version` を加える。台帳の行にも `unmapped` を残す。Blender 台本は既知の入力・計算エラーを `BAI_GLB_VMD_ERROR:{"code":"...","message":"..."}` の1行と終了コード2で返す。サーバーは許可済みコードだけを 422 へ写し、未知の行・異常終了・タイムアウトはそれぞれ `blender_result_invalid` / `blender_failed` / `blender_timeout` とする。標準出力の任意文字列を HTTP の理由コードとして採用しない。
2. `bai_studio/v05/motion/glb_vmd_map.py`
   - `MappingError` に `code` を足す。`source_skeleton` の各 `raise` を §4 のコードにする。
   - `validate()` はそのまま例外を出す。新関数 `check(overrides, source_names, target_names)` は `(effective_or_partial, problem)` を返し、例外を出さない。`problem` は `None` か `{'code':..., 'message':...}`。
   - `inspect()` は `check()` を使い、返り値に `valid: bool` と `problem` を加える。`effective` は不足でも作れる範囲を返す。`save()` は従来どおり `validate()` で拒否する。
3. `glb-vmd-ui-v102.js`
   - `inspect` が `valid:false` のとき、表は出し、［変換して配置］は無効にして `problem` を表示する。
   - 変換成功時は、骨数、未対応骨（最大20件と残数）、出力ID、「目視未確認（機械検査前）」を表示する。

試験（pytest、Blender不要。Linuxでも走る）：

- 新 `tools/make_test_humanoid_pmx.py`：`build_humanoid_pmx(*, d_bones=True, waist_cancel=True, foot_ik=True) -> bytes`。PMX 2.0、UTF-16LE、骨は `全ての親`・`センター`・`グルーブ`・`腰`・`上半身`・`上半身2`・`首`・`頭`・`下半身`・左右の `肩/腕/ひじ/手首`・左右の `足/ひざ/足首/つま先`、`d_bones` なら左右の `足D/ひざD/足首D/足先EX`（`足D` は `足` から回転付与率1、`ひざD`・`足首D` も同様）、`waist_cancel` なら左右の `腰キャンセル`（`腰` から付与率−1、`足D` の親）、`foot_ik` なら左右の `足ＩＫ`（対象 `足首`、リンク `ひざ`（角度制限あり）・`足`）と `つま先ＩＫ`（親 `足ＩＫ`、対象 `つま先`、リンク `足首`）。頂点は3点・面1・材質1（`make_test_pmx.py` と同じ最小構成）。骨位置は人体の比率（身長約20単位、Aポーズで腕は水平から35°下）。`pmx_bones.parse` で読めることを試験する。
- 新 `tests/glb_fixture.py`：`build_mixamo_glb(path, *, animated=True, joints=MIXAMO_51)`。JSONチャンクだけのGLB（ヘッダーの全長＝ファイル長）。`skins` 1件、`animations` 1件（`animated=False` なら0件）、ノード名 `mixamorig:Hips` など。Tポーズのrest。
- 新 `tests/fake_blender.py`：偽Blender。試験は `blender_argv=[sys.executable, str(Path('tests/fake_blender.py').resolve())]` で `convert()` を呼ぶ（WindowsでもLinuxでも同じ。実行権限や `.cmd` は使わない）。台本は `-b -t 2 --python <script> -- --job <job.json>` を受け、環境変数 `BAI_FAKE_BLENDER_MODE` に従い、`ok`、`exit1`、`no_marker`、`bad_hash`、`bad_header`、`huge`、`sleep`（試験では `timeout_seconds=2`）、`corrupt_registry` を再現する。`subprocess.run` に渡す環境は親の環境をそのまま継ぐ。

偽Blenderの正常結果の契約は WP ごとに増やす。WP-R5-1 の `ok` は既存の結果マーカー・入力SHA-256・出力VMD/フレーム数だけ。WP-R5-2 では `keyed_bones`・`source_duration_seconds` と全骨の連続キーを加える。WP-R5-3 では v2 の `reference_output`・IK/付与/倍率の診断を加える。前段階の試験が後段階の未実装フィールドを要求しない。
- 新 `tests/test_studio_v05_glb_vmd_convert.py`：
  - 各 `fake_mode` で、HTTP相当の status と `code`、`mmd/vmd` に新ファイルが無いこと、原GLB/PMXのSHA-256不変。
  - 壊れた `mmd_assets.json`（`{invalid` または `vmd` が dict）で `mmd_registry_unreadable`・422、ファイルのバイト列が不変、出力VMDが残らない。偽 Blender の `corrupt_registry` モードで実行中に台帳を壊した場合も登録直前の再読込で止まり、破損バイト列を上書きしない。
  - 無動作GLB（`glb_single_action_required`）、骨10本（`glb_skeleton_incomplete`）、存在しない骨名（`map_bone_unknown`）、古い改訂（`map_revision_conflict`・409）。
  - 非Mixamo名のGLBで `inspect` が `valid:false` と表を返し、`save` は不足のまま拒否、手で15骨以上を対応させると保存できる。

完了条件：上の pytest がすべて成功（スキップ0）。既存 `tests/test_studio_v05_glb_vmd_map.py` も成功。変更した JS は `node --check` と対象の Node 試験で確認する。`npm run typecheck` は `studio/v05/js` を検査しないため代用しない。

未検証として残す：実Blender、実画面（WP-R5-4でまとめて確認）。

### WP-R5-2 変換VMDの読み戻し検査（P7）

要件：`MOTION-006/007`、Issue #102「骨キー・長さ・元GLBとの対応を検査」。

変更（`bai_studio/v05/motion/glb_vmd.py`）：

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
3. `align_table(pmx_bones, effective, source_rest_heads) -> {target_index: q_align}`。`d_pmx = pos(子) − pos(骨)`、`d_glb = head(子の対応GLB骨) − head(対応GLB骨)`（rest、変換空間）。GLB の rest head・脚長は `axis @ (arm_world @ head_local)` で統一して取る。`q_align = quat_from_to(d_pmx, d_glb)`。
4. `solve_frame(pmx, mapped, center_delta) -> (final_local, world_rot, world_pos)`。
   - `mapped`：`{target_index: R_want}`。`R_want = delta_S × q_align_T`、`delta_S = 今のGLB世界回転 × rest世界回転の逆`（既存の式）。
   - `final_local(i)` をメモ化して求める（循環は `ConversionError('grant_cycle')`）：
     - 付与 `g`：骨のflagsに `0x100`（回転付与）があり `0x80`（ローカル付与）が無いとき、`g = slerp_three(final_local(src), ratio)`。`cosHalfTheta>=1` の早期終了を含め three r160 と同じ計算にする。それ以外は恒等（three r160 と同じく位置付与・ローカル付与は無視）。循環拒否は three 自体の例外ではなく、今回の変換で不確かな結果を登録しないための意図的な厳格化。
     - 対応骨：`want_local = world_rot(親)^-1 × R_want`、書くキー `raw_local = want_local × g^-1`、`final_local = want_local`。
     - 非対応骨：`raw_local = 恒等`（キーを書かない）、`final_local = g`。
     - `world_rot(i) = world_rot(親) × final_local(i)`（親なしは恒等）。
   - 位置：`world_pos(i) = world_pos(親) + world_rot(親)⊗(rest(i) − rest(親)) + world_rot(親)⊗key_pos(i)`。`key_pos` は `センター` だけ `world_rot(親)^-1 ⊗ center_delta`。
   - IK は解かない（次の焼き込みでIKの目標をFKの結果に合わせる）。
5. `bake_ik(pmx, world_rot, world_pos, solvable) -> {ik_index: key_position}`。③は `MMDAnimationHelper({pmxAnimation:true})` の `_animatePMXMesh` / `updateOne` で変形階層順に骨を処理し、IK はその骨の番に解く。したがって階層の浅さだけで焼き込み順を決めない。IK 解決より後の付与が対象・リンクに影響する場合は、最終 FK 足首位置を目標にしても一致しない。まず PMX の変形順と付与・IK の依存を検査し、順序依存が解けない骨は `ik_unbaked` に `ik_order_dependent` の理由を記録して焼かない。解ける場合だけ、全リンク骨が `solvable`（対応骨か、対応骨から回転付与を受ける骨）であることを確認し、対象の FK 世界位置を float32 に丸めた後、`key = world_rot(親)^-1 ⊗ (world_pos(対象) − world_pos(親)) − (rest(IK) − rest(親))` を計算する。親が先に焼いたIK骨なら、その焼いた位置を親の世界位置に使う。膝の CCDIK 角度制限（1e-5 を超えると Euler で制限される）のため、足首だけでなく膝の方向誤差も別に記録する。
6. `scale_and_center(...)`：脚長比 `s = mean_LR(PMX y(足) − y(足首)) / mean_LR(GLB y(UpLeg head) − y(Foot head))` を使う。GLB の各 head は上記の変換空間で取る。必要な `足`・`足首` または GLB の対応骨が無ければ推測した全骨Y幅へ戻さず `scale_reference_missing` で拒否する。両脚の値は有限・正、比率は `0.05 <= s <= 100` とし、外側は `scale_out_of_range` で拒否する。上下の基準はGLBのrestの腰の高さ、水平は先頭フレームの腰。restの腰と先頭フレームの腰の高さの差が脚の長さの半分を超えるときは先頭フレームを使い、`center_reference:'first_frame_fallback'` を警告に入れる。`center_delta = (hip(t) − ref) × s`。
7. `reference_samples(...)`：測定用の参照。標本時刻は0秒、以後1秒ごと、最後のフレーム（最大240点。超えるときは均等に間引く）。各時刻に：
   - `directions`：`CHECK_PAIRS` は直接の親子だけ（左右の `腕→ひじ`、`ひじ→手首`、`足→ひざ`、`ひざ→足首`、あれば `足D→ひざD`、`ひざD→足首D`、および `首→頭`）。`上半身→首` のように中間骨をまたぐ組は除く。期待方向は `R_want(骨) ⊗ normalize(d_pmx)`（単位ベクトル、変換空間）とし、GLB の骨間ベクトルをもう一度回さない。
   - `positions`：`左足首`・`右足首`・`左つま先`・`右つま先` のFK世界位置（変換空間、PMX単位）。

`tools/glb_to_vmd_candidate.py` の変更：

- `sample(job)` は標本化だけ行い、`studio_v05_glb_vmd_solve` を呼ぶ。v2 では各フレームで `solve_frame` → `bake_ik` → キー行。対応骨は `raw_local` を書く（四元数の符号は直前フレームと内積が負なら反転、既存の `previous` の処理）。IK骨は回転恒等・位置 `key` を書く。`センター` は `key_pos`。
- 参照を `job['reference_output']` に JSON で書く：`{"schema":1,"converter_version":2,"fps":30,"coordinate":"three_pmx_model_space","samples":[{"t":秒,"frame":VMDフレーム,"directions":{"左腕>左ひじ":[x,y,z],...},"positions":{"左足首":[x,y,z],...}}]}`。
- 結果に `converter_version`、`keyed_bones`、`ik_baked`、`ik_unbaked`、`aligned_bones`、`grant_compensated`、`scale`、`scale_method`、`center_reference`、`source_duration_seconds` を足す。`ik_unbaked` は `[{"name":"左足ＩＫ","reason":"ik_order_dependent"}]` の形で理由を必須にする。空配列は全対象IKを焼けた場合だけ。

`bai_studio/v05/motion/glb_vmd.py` の変更：

- `convert(..., converter_version=2)`。ジョブに `converter_version` と `reference_output` を渡す。成功時、参照を `data/studio_v05_glb_vmd_reports/<VMD名>.reference.json` へ移す（既存なら `vmd_output_invalid`、出力は捨てる）。
- 台帳の行（`mmd_assets.json` の `vmd` 配列に追記、既存行は変えない）：

```json
{"name":"glb_v05_<hex>.vmd","size":0,"sha256":"…","source_asset_id":"integrated:…","target_asset_id":"mmd:A:…",
 "source_sha256":"…","target_sha256":"…","review_status":"needs_visual_validation",
 "mapping_profile_key":"…","mapping_revision":3,"converter_version":2,
 "unmapped":["…"],"ik_baked":["左足ＩＫ","右足ＩＫ","左つま先ＩＫ","右つま先ＩＫ"],"ik_unbaked":[],
 "scale":12.3,"scale_method":"leg_length","center_reference":"rest",
 "verification":{"status":"binary_verified_not_visual","bone_names":63,"bone_keys":113526,"frames":1802,"duration_seconds":60.0333,"source_duration_seconds":60.0333},
 "reference_file":"glb_v05_<hex>.vmd.reference.json","reference_sha256":"…"}
```

- `server.py` のPOST `/api/studio/v05/motion/glb-vmd` は v2 だけを作る。HTTP 本文に `converter_version` は追加しない。v1 は既存登録物を保持し、Python の試験と比較専用の内部引数としてだけ残す。v1の出力は `reference_file` を持たない。`limit_frames` は `floor(duration_seconds * 30) + 1` と最後の標本を含む上限として定義し、`(frames-1)/30` と原動作長の差を 1/30 秒以内で検査する。

試験（pytest、Blender不要）：新 `tests/test_studio_v05_glb_vmd_solve.py`。`make_test_humanoid_pmx` を `pmx_bones.parse` で読んだ骨と、合成のGLB rest（Tポーズ）を使う。

1. 動きなし（`delta`＝恒等）で、合わせた骨の方向がGLBのrest方向と1e-6以内（Aポーズ→Tポーズ）。合わせない設定（`ALIGN_CHILD` 空）では方向がPMXのrestのまま。
2. 付与：試験側に three r160 の付与を写した評価器（`final = raw × slerp_three(final(src), ratio)`、ソートは deform_layer→index）を置き、`raw_local` を入れて再評価した対応骨の世界回転が `R_want` と1e-6以内。`足D`（付与率1）・`腰キャンセル`（付与率−1）を含むPMXと含まないPMXの両方。
3. IK焼き込み：焼いた `足ＩＫ`・`つま先ＩＫ` の世界位置が、対象骨のFK世界位置と1e-6以内。`つま先ＩＫ` は親が `足ＩＫ`。リンクが対応していないIK骨は `ik_unbaked`。
4. 付与の循環で `grant_cycle`。
5. 身長比と上下基準：脚の長さの比が既知値と一致。restと先頭フレームの差が大きいときは `first_frame_fallback`。
6. `slerp_three` を共通fixture `tests/fixtures/three_r160_slerp_cases.json`（t=−1, 0.5, 1、内積が負の例、ほぼ同じ回転、`cosHalfTheta>=1` の例）と1e-12で比較する。fixtureは `node_modules` の実 three@0.160.1 の `Quaternion.slerp` から生成し、`tests/three-slerp-fixture.test.mjs` が同じ実パッケージで再計算する。付与と IK も `MMDLoader`・`MMDAnimationHelper`・`CCDIKSolver` の実処理で合成 PMX を照合し、写した評価器だけで合格としない。

試験（実Blender、`MIXAMO_BLENDER` と `BAI_REAL_MMD_DATA` が無ければスキップ）：`tests/test_studio_v05_glb_vmd_blender_real.py`。実GLB・実PMXを一時領域へ複製し、v1とv2で変換し、両方とも WP-R5-2 の検査に通ること、v2 の `ik_baked` / `ik_unbaked` と理由、原本SHA-256不変を確かめる。`BAI_REQUIRE_REAL=1` のときは実素材・Blenderが無ければ失敗にする。見た目の合否はここでは判定しない。

完了条件：Blender不要の試験がすべて成功。実Blender試験は実行できた環境と結果を記録（できなければ未検証と書く）。

未検証として残す：three の IK（CCD、膝の角度制限）が焼いた目標へ実際に届くか、見た目。→ WP-R5-4。

### WP-R5-4 実PMXの機械測定と記録（試験専用）

要件：Issue #102「対象PMXへ適用して複数時刻の実変形を比較」「変換ジョブ成功だけで合格とは表示しない」、`MOTION-004/006`。測定は隔離した実データ試験の中だけで行う。製品向けの［品質を測る］ボタン、品質 POST/履歴 API、測定用 WebMCP はこの WP では作らない。これらを製品機能にするかは §5 Q4 の判断を待つ。

1. `tests/studio-v05-glb-vmd-quality-real.test.cjs` は実GLBと実PMXを一時領域に複製し、v1/v2を変換して別クリップに配置する。比較するクリップは作品の in 点0・速度1・同一インスタンスで動作の重なり無しに限定し、条件外は測定不能と記録する。実際の③の `MMDAnimationHelper({pmxAnimation:true})` で各参照時刻を seek し、物理OFFで骨のモデル空間位置を読む。インスタンスの移動・単位を `object.matrixWorld` の逆で除く。最後の時刻は `min(t, row.duration - 1/60)` とし、クリップ外を読まない。有効な MOTION-010 補正レイヤーがあれば変換の誤差と混ざるため測定を拒否する。
2. 共通の比較関数は各直接親子ペアの角度誤差と、左右足首・つま先の位置誤差を出す。角度の平均は「全標本×全有効ペア」の各角度を同じ重みで足し、個数で割る。最大角度・最大位置は全件の最大。欠損・NaN・ゼロ長方向は測定不能として失敗させ、分母から黙って外さない。暫定の機械閾値は最大角度15°、平均角度5°、最大位置0.5 PMX単位。膝の方向誤差を独立に記録し、IKが `ik_order_dependent` / `ik_unbaked` のモデルを品質合格にしない。閾値超過を緩めて合格にしない。
3. 測定結果は製品の `data/` へ書かず、試験の証拠先へ `reference_sha256`、GLB/PMX/VMDの SHA-256、クリップ条件、全標本、閾値、要約、最悪の骨と時刻、描画器を保存する。入力原本と共有 `data/` の前後ハッシュを照合する。保存した JSON は厳格に読み戻し、標本数・参照時刻・有限性・ハッシュを再検査して同じ要約を再計算する。失敗・中断・壊れた証拠ファイルは成功として扱わない。排他と原子的な別名保存は試験側の証拠ファイルにだけ適用する。
4. 製品 UI は既存台帳の `verification`、未対応骨、IK未焼き込み、`review_status:needs_visual_validation` を読み取り表示する。「機械検査」または「目視未確認」の範囲を超える完成表示はしない。台帳の状態を測定結果から自動更新しない。

試験は Node の比較関数の境界値・NaN・欠損の単体試験と、上記の隔離実素材試験。実素材・Blender・Chromeが欠ける場合は未検証と記録し、`BAI_REQUIRE_REAL=1` なら skip ではなく失敗にする。v1とv2の数値を並べ、v2が不合格なら最悪の骨・時刻・原因を `docs/v05/GLB_TO_VMD_20261024_JA.md` に記す。機械合格は自然さやOwner採用を示さない。

### WP-R5-5 骨対応プロファイルの取消・やり直し・共有（MOTION-005）

変更（`bai_studio/v05/motion/glb_vmd_map.py`、`bai_studio/v05/motion/glb_vmd.py`、`server.py`、`glb-vmd-ui-v102.js`）：

- プロファイル行に `history`（以前の `overrides` の配列、最大50、古いものから落とす）と `redo`（配列）を足す。古い行（無い）は空として読む。`save` と `import` は変更前の `overrides` を `history` の末尾へ積み、`redo` を空にする。`undo` は `history` の末尾を取り出して今の値にし、変更前の値を `redo` の末尾へ積む。`redo` はその逆。どれも1操作＝1 revision。
- `POST /api/studio/v05/motion/glb-vmd/map` に任意の `action`：`save`（既定）・`undo`・`redo`・`import`。どれも `revision` が今の値と一致しなければ 409 `map_revision_conflict`。成功で `revision+1`。積むものが無ければ 409 `map_history_empty`。
- 書き出し：`GET /api/studio/v05/motion/glb-vmd/map/export?source_id=&target_id=` → 添付ファイル `bai-glb-pmx-map.json`：`{"schema":"bai-glb-pmx-map/1","target_sha256":…,"source_skeleton_sha256":…,"target_bones":[…],"source_bones":[…],"overrides":{…},"revision":n}`。
- 読み込み：`action:'import'`、`document` に上の形（64KiB以内）。`server.py` の map POST 本文上限も 16384 から 65536 バイトへ上げ、未知キー・配列/文字列の個別上限を定める。`schema` 違いは 400 `map_import_schema_invalid`。`target_sha256` か `source_skeleton_sha256` が今と違えば、`apply_to_current:true` が無い限り 409 `map_import_identity_mismatch`。画面は「別のPMXまたは骨構造用です。すべての骨名を検査してから、全件を適用しますか」と確認する。`apply_to_current:true` でも `overrides` の全件を今の骨で `validate()` し、1件でも合わなければ 400 `map_bone_unknown` で全体を拒否する。部分適用・不明骨の黙った除外はしない。
- 画面：骨対応欄に［元に戻す］［やり直す］［書き出し］［読み込み］。変換中は無効。保存・取消後は表を再取得する。

試験（pytest）：保存→取消→やり直しで `overrides` と `revision` の列が期待どおり、古い改訂は409、51回保存で `history` が50、書き出し→別の一時dataへ読み込みで同じ `effective`、identity違いの409と `apply_to_current` での適用、不正な骨名で全体拒否・ファイル不変、旧形式の行（`history` なし）を読める。

完了条件：pytest 成功、変更した JS の `node --check` と対象 Node 試験が成功。画面の操作は WP-R5-7 の実データ試験で1回確かめる。

### WP-R5-6 標準MCP・WebMCP（P8）

要件：AGENTS.md「AIなしで手動操作できること。WebMCP・標準MCPは補助で同じAPI」、Issue #102 の入口別記録。

標準MCP（`mcp_server.py`）：

- `api(path, payload=None, timeout=12)` にする。変換だけ `timeout=660`。
- 新しい道具（名前・HTTP）：
  - `bai_studio_glb_vmd_candidates`（GET candidates、道具引数 `project_id` を既存 HTTP の `?id=` へ写す）
  - `bai_studio_glb_vmd_map_get`（GET map、`source_id`,`target_id`）
  - `bai_studio_glb_vmd_map_mutate`（POST map、`source_asset_id`,`target_asset_id`,`revision`,`action`,`overrides`,`document`,`apply_to_current`）
  - `bai_studio_glb_vmd_convert`（POST glb-vmd、`project_id`,`source_asset_id`,`instance_id`,`profile_revision`）。説明に「配置はしない。`bai_studio_clip_place` と `bai_studio_scene_motion_target_set` で置く。目視未確認」と書く。
- 既存の道具をAPIに合わせる：`bai_studio_pmx_fk_edits_mutate` に `arm-set`、`keys`（2件）、`key.position`、`settings.solo` を足す（WebMCP `multi-model-ui-v58.js:2576-2592` と同じ形）。`bai_studio_pmx_vmd_candidate_create` に `mode`（`whole`/`interval`/`legacy_sparse`）と、説明を「保存済み補正から別名候補を作る。実PMX検査・配置はしない」に直す。新 `bai_studio_pmx_vmd_candidate_restore`（POST restore）。採用はブラウザの実PMX検査結果が要るため標準MCPには置かない（説明に明記）。
- 試験専用の品質測定とその証拠ファイルは標準MCPに置かない。

WebMCP（③、`multi-model-ui-v58.js` の登録表）：

- `bai_studio_pmx_vmd_candidate_validate_adopt`（`project_id`,`candidate_id`）：画面の［検査］［採用］と同じ処理。`fkValidate`/`fkAdopt` のクリック処理（`multi-model-ui-v58.js:2046-2105`）の中身を `validateCandidate(data)` と `adoptCandidate(report)` に切り出し、ボタンと道具の両方から呼ぶ。ボタンの挙動は変えない。
- 既存の `bai_studio_pmx_vmd_candidate_create` に `mode` を足す。
- GLB→VMDの変換・骨対応の道具は、WebMCPでは同じ名前で `glb-vmd-ui-v102.js` に登録する（`document.modelContext?.registerTool` があるときだけ。中身は上と同じHTTP）。

試験：

- pytest 新 `tests/test_studio_v05_glb_vmd_mcp.py`（`tests/test_studio_v05_legacy_import_mcp.py` と同じ形）：道具が一度ずつ載る、スキーマ、`run` がHTTPの道へ写る（`api` を差し替え）、変換だけ timeout 660。
- Node 新 `tests/studio-v05-glb-vmd-webmcp.test.mjs`：隔離ブラウザに `document.modelContext.registerTool` を注入し、実登録・引数検証・HTTP 呼出し・保存再読込を照合する。文字列照合だけを合格根拠にしない。ネイティブ WebMCP 呼出しは対応ブラウザが無い場合に未検証と明記する。

完了条件：上の試験が成功。標準MCPの実クライアント、WebMCPの実ブラウザでの呼出しは未検証として記録する。

### WP-R5-7 実データの通し試験・別PMX・Linux・記録

要件：ロードマップ残件「すべての補正候補の採用判定と作品出力」「他PMXへの一般化」「MCP/Linux」。この WP の試験成功だけで順5全体を完成にしない（§2.2）。

1. 通し：新 `tests/studio-v05-glb-vmd-edit-output-real.test.cjs` を `run-guarded` の隔離サーバーで実行する。実GLB→v2変換→作品へ配置・結合→WP-R5-4の試験専用測定→補正→候補の実PMX全骨・全フレーム検査→採用→再読込→MP4→restore の経路を、`whole`、`interval`、`legacy_sparse`、IK補正で個別に通す。元 VMD と候補 VMD のSHA-256、全キー数と非対象区間、Undo/Redo、原本と共有 `data/` の前後ハッシュを記録する。採用失敗時は登録済み元VMDへの復帰を確認する。
2. MP4 の画素判定：各補正の影響がある時刻と範囲外の時刻を1つ以上選び、同じカメラ・解像度・エンコーダ設定で元と採用後のMP4を作る。H.264 をデコードした同位置 RGB を比較し、チャンネル差16以上の画素数、全画素数、差の最大値を保存する。対象の骨が見える ROI で影響時刻の差画素を100以上とし、範囲外は同一入力を2回書き出したときの基準ノイズ以下とする。ROI は試験前に固定し、失敗後に変更しない。IK補正では足・膝を含む ROI と骨位置差も測る。3フレーム MP4 だけでは区間の前後を見られないため、各ケースの検査時刻を含む範囲で出力する。
3. 別PMX：登録済みPMXから SHA-256 が異なる実ファイルを最大3件選ぶ。先に各候補の骨名、付与、足IKと利用許諾を記録し、同じ内容の複製を別モデルとして数えない。標準骨が揃うものでは変換→WP-R5-4測定を行い、非標準名・不足骨は手動対応で解決できる範囲と v2 補正の未対応範囲を分けて報告する。各PMXの数値、`ik_unbaked` と理由、`unmapped` を表にする。
4. 骨対応の画面操作：骨1本の対応を変更→保存→Undo→Redo→書き出し→読み込み、を実ブラウザで一回行い、再読込後の改訂番号と対応を確認する。標準MCPは継続 stdio セッションで、WebMCP は注入契約と対応ブラウザのネイティブ呼出しを別々に記録する。
5. Linux：WP-R5-1〜6 の Blender不要の試験を実行し、環境・件数・失敗・スキップを書く。Linux に実Blenderがあれば実変換も行う。実素材を必要とするゲートで `BAI_REQUIRE_REAL=1` を指定した場合、素材・Blender・ブラウザ不足は失敗とし、暗黙の skip を合格にしない。
6. 記録：`docs/v05/GLB_TO_VMD_20261024_JA.md` に実行コマンド、環境、素材SHA-256、数値、診断ログの場所、未検証を追記する。各 WP のコミットで `PHASE_E_IMPLEMENTATION_STATUS.json`、ロードマップ、`FEATURE_DETAIL_JA.md`、`FEATURE_REGISTER.json` の該当要件IDと試験結果を紐付ける。`WORK_STATE.json` は作業位置だけに使う。Issue #102 に結果・PRを結び、未完了の残件は閉じない。

完了条件：対象の自動試験は成功、実データの各ケースは実行結果または実行不能な理由が記録済み。機械ゲート不合格、未確認の自然さ、足接地・物理・非標準PMXの残件を完成扱いにしない。

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
| `scale_reference_missing` / `scale_out_of_range` | 422 | 足の長さを安全に求められません。骨対応とモデルを確認してください。 |
| `ik_order_dependent` | 診断結果 | このPMXの付与とIKの順序では足IKを焼き込めません。品質合格にしません。 |

Blender 台本の既知失敗は `BAI_GLB_VMD_ERROR` 行と終了コード2で伝える。GLB読込・アクション数・骨標本化・PMX読込・座標/倍率・VMD書込を、それぞれ `glb_header_invalid` / `glb_single_action_required` / `glb_skeleton_incomplete` / `pmx_not_registered` / `scale_reference_missing` または `scale_out_of_range` / `vmd_output_invalid` に写す。未分類の Python 例外は `blender_failed` として詳細を診断ログへ残す。結果行・入力ハッシュの欠落や不一致は `blender_result_invalid`、実行中の入力変更は `input_changed`。同じ例外を HTTP 窓口と試験の両方で同じコードにする。

どの失敗でも、原GLB・PMX・既存VMD・台帳を変えない。`vmd_output_invalid` 以後は出力VMDを一時領域ごと消す（登録前なので利用者のファイルではない）。登録後に配置・結合だけが失敗した場合は、従来どおり別名VMDのIDを表示して残す（`glb-vmd-ui-v102.js:105`）。

## 5. Owner判断が必要な範囲（未回答でも今回の設計整理は進める）

- **Q1 足接地の自動補正（`MOTION-011`）を順5のどの WP で扱うか。** 今回の WP-R5-1〜7 に入れる承認はまだ無い。既存の接地診断と足IK焼き込みだけを設計し、自動補正は順5の未完成残件にする。
- **Q2 物理（髪・服の揺れ）の確認方法。** ③で物理ONの実再生を作るか、`MOTION-021` の物理ベイクを使うか、順5から外すよう要件を変更するか。決定まで今回の測定は物理OFFとし、順5の物理残件を完成にしない。
- **Q3 標準名でないPMXへの対応。** 既定は「手動対応表で任意の実在骨名を選べる。ただし v2 の初期姿勢・付与・IKの補正は標準名のPMXだけ」。別名骨への一般化は順5に残る。
- **Q4 製品向けの品質測定機能を作るか。** 今回の WP-R5-4 は隔離試験専用。ボタン、測定 POST/履歴 API、測定 WebMCP の追加は、Ownerが必要と決めた場合に別途設計する。
- **Q5 順3・4の実素材確認が残る間に順5の実装へ入るか。** 承認済みの順序は順3→4→5。今回の設計整理は進めるが、実装の繰り上げは Owner が直接決めるまで行わない。

## 6. 今回の WP 終了後にも残る未検証と未完成要件

- 見た目の自然さ（ねじれ・指・足裏）と所有者の採用。機械ゲートの合格は採用ではない。
- 測定の標本値はブラウザが送る。サーバーは形・前提のハッシュを確かめ、要約を計算し直すが、標本値そのものが描画どおりかは保証しない（画面では「機械検査」と表示する）。
- three の処理順で、`足D` などの付与骨がIKの前後どちらの `足` を使うか（WP-R5-4 の `足D` の方向誤差で観測する）。
- 物理ON、MMD本体での再生、実GPUでの長尺MP4、600Fを超える3D出力と実素材での長尺音画同期（順3の残件）。600F の隔離 MP4 は 2026-11-05 に確認済み。
- 標準MCPの実クライアント、WebMCPの実ブラウザでの呼出し。
- 実Blender on Linux（Blenderのある環境で実行しない限り）。
- 標準名でないPMX、Mixamo以外のGLB骨名の自動対応、複数アクションGLB。

## 7. 初稿の判定履歴（2026-11-04、後続批評で失効）

2026-11-04 の初稿では、作成者が観点を分けて自己批評し、WP-R5-1〜7を実装入口と判定した。独立した第三者レビューではない。2026-11-05 に別の批評役が §8 の停止級を発見したため、この実装入口判定は失効した。§8 の指摘を本文へ反映しても、コード・実PMX・threeの評価順との再照合と独立した再判定が終わるまでは、設計を採用済みと記録しない。

モデル区分：初稿の調査・設計は高性能モデル。今回の批評反映と再照合は高性能モデル。実装段階は要件と受け入れ条件が固まった後に標準モデルを使う。

## 8. 独立した批評（2026-11-05、指摘原文と反映状況）

作成者とは別の批評役が、観点ごとに読んだ。以下は当時の指摘原文であり、後の本文と食い違う表現を履歴として残す。改訂内容は §8.4 に示す。独立した再判定は未実施。

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
§1.1/§1.2 の file:line はすべて一致した。次の点も three@0.160.1 と照合して正しいと確認した：付与率の式（ratio=−1 は逆回転）、z反転、IK骨の位置キーの式、VMD の IK 区画を three が読まないこと（`mmdparser.module.js:11176-11180`）。

- **止まる級：③の評価順の扱い。** ③は `MMDAnimationHelper({pmxAnimation:true})` を使う（`player.js:74`）。そのため評価は `_animatePMXMesh`／`updateOne`（`MMDAnimationHelper.js:542-549,979-1030`）を通る。この経路では、骨を変形階層の順に1本ずつ処理し、IK はその骨の番に解く。IK 骨より後に処理される付与骨（例：`腰キャンセル`）は、IK を解く時点ではまだ付与前の値なので、最終FKの足首位置を焼いても足がずれる。焼き込みと試験用の評価器は、この順序どおりに実装する。少なくとも、この形のモデルは `ik_unbaked`（`ik_order_dependent`）として記録する。P2 の根拠もこの経路に直す。
- **直すべき：**
  - CCDIK の膝の角度制限。1e-5 を超えると Euler で切り詰め、ねじれが消える（`CCDIKSolver.js:152,187-195`）。ひざの誤差は個別に報告し、焼く位置は float32 に丸めた後の値で計算する。
  - Blender の中の失敗に理由コードを付ける手段が無い（§8.2 と同じ）。three は付与の循環を例外にしないので、拒否は意図的に厳しくした判断だと書く。
  - `convert()` が Blender の前に `validate()` しない（§8.2 と同じ）。
  - 参照方向 `delta_S⊗d_glb` は、複数区間をまたぐ組（`上半身→首`）で偽の不合格になる。期待方向は `R_want(骨)⊗normalize(d_pmx)`、CHECK_PAIRS は直接の親子に限る。
  - GLB の rest・脚長の座標は、すべて `axis @ (arm_world @ head_local)` で取る。s の妥当範囲と、PMX に `足`・`足首` が無いときの扱いを決める。
  - P5 の再現条件。HTTP では先に 400 `target_not_in_project` になる。実際に一覧が消えるのは、Blender の実行中に壊れた場合と、`vmd` が dict の場合。早めの厳格な読込とロック内の再読込、偽Blender の `corrupt_registry` で試す。
  - 骨対応の読み込みの規則の矛盾と、本文上限 16384 の引き上げ（§8.2 と同じ）。
  - 品質POSTの64KiB上限（§8.2 と同じ）。
  - 最後の標本の時刻が区間の外になる。`min(t, row.duration−1/60)` にする。
- **細かい点：**
  - `slerp` の `cosHalfTheta>=1` の早期終了。四元数の並びは x,y,z,w。
  - pmx_bones の項目名は `inherit_parent_index`・`inherit_ratio`・`ik.target_index`/`links`。
  - MCP の `project_id`→`?id=`。
  - 台帳の例 frames=1801 は 1802 の誤り。`limit_frames` と長さ検査の関係を決める。
  - v1 の `mixamorig:` 接頭辞での KeyError（`glb_to_vmd_candidate.py:105-106`）。
  - 偽Blender は絶対パスで呼ぶ。
  - `腰` の無いPMXは必ず拒否される。

### 8.4 2026-11-05 改訂草案への反映

| 指摘 | 今回の反映 | 再判定に必要な確認 |
|---|---|---|
| 順序と残件 | §2.2、§5 Q1〜Q5、WP-R5-4/7。順3・4の残りと順5の足接地・物理・非標準PMXを未完成として維持 | Ownerの順序判断。順3・4の実素材結果 |
| Blender/台帳/骨対応の停止級 | WP-R5-1と§3共通契約。起動前検証、実行中の台帳破損、理由コード、入力上限を規定 | 異常入力と並行変更の実装・試験 |
| 変換の数値と実評価順 | WP-R5-3。③の PMX 評価順、IK順序依存、膝制限、参照方向、座標、脚長を規定 | 実 three@0.160.1 と実PMXの数値照合。`ik_order_dependent` が出たモデルを合格にしない |
| 品質測定の範囲・試験 | WP-R5-4を隔離試験に限定。製品ボタン・API・履歴・道具は Q4 待ち。標本時刻、平均、ハッシュを規定 | 実素材試験の出力・原本ハッシュ・画素比較 |
| 骨対応の移入とMCP | WP-R5-5/6。全件拒否、64KiB、`project_id`→`?id=`、実呼出しを規定 | 実 HTTP、継続 stdio、注入 WebMCP、対応ブラウザでのネイティブ呼出しを区別 |

再判定前に残る本文の詳細：Python の四元数は `(w,x,y,z)`、three の API は `(x,y,z,w)` とし、境界で明示的に並べ替える。`pmx_bones` の付与項目は `inherit_parent_index`・`inherit_ratio`、IKは `ik.target_index`・`ik.links` を使う。v1 は既存 VMD の比較専用として保持し、`mixamorig:` 接頭辞がある入力での `KeyError` を回帰試験へ加える。`腰` を持たないPMXは v2 の必須骨対応が成立しないため、Blender 起動前に理由コード付きで拒否する。

この節は批評への対応表であり、再判定・実装・実素材の合格を意味しない。
