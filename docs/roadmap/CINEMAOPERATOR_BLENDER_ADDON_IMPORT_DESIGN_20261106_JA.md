# BlenderアドオンのStudio取込とCinemaOperator撮影連携 — 設計（2026-11-06）

追跡Issue: [#238](https://github.com/baisound/BAI_CREATER_STUDIO/issues/238)。設計コミット: `145a54d`。

## 0. Owner指定と位置

Ownerは、Blenderアドオンの機能を模倣せず、Studioへプラグインを読み込むような操作で**実アドオンをそのまま利用**したい。最初の対象はTOKUGAWA ELECTRONICSのCinemaOperator 0.7.183。要件IDは新規 `CAM-019` とし、既存のカメラ連結・カット・時刻同期 `CAM-015`、レンズ・DOF `CAM-005`、撮影プレビュー/出力 `RENDER-001` を利用する。v0.5の順6「ステージ・撮影」に入れ、順1〜5の実施順は変更しない。本書は設計であり、実装・アドオン実行・映像品質の合格ではない。

## 1. 技術上の境界と採用する形

CinemaOperatorのPythonコードは `bpy`、`VIEW_3D` の領域、マウスのモーダル操作、Blenderの描画ハンドラを使用する。StudioのThree.js/ブラウザ上にBlenderのパネルをそのまま描画できない。**Studioの「Blenderアドオンを読み込む」入口から対応Blenderを起動し、アドオンの編集画面はBlenderで使う。確定した撮影結果だけをアダプターがStudioの同じ作品へ戻す。** Studio内のカメラUIをCinemaOperator UIの複製として作らない。

登録できるZIPとStudioで結果を使えるアドオンは区別する。初期アダプターはCinemaOperatorの確認済み版だけを対象とし、未対応アドオンを登録できても「Studioへの結果取込は未対応」と表示する。任意アドオンに共通の実行・変換互換性は約束しない。Blenderをローカルの別プロセスとして呼ぶ方式は、既存のGLB→VMD変換経路（`studio_v05_glb_vmd.py`）と整合するが、撮影UIを使う工程はBlenderの可視画面が必要である。

### 1.1 添付版を静的に確認した結果

- 配布セット `CinemaOperator_0.7.183_Distribution_DocsRev1 (1).zip`（SHA-256 `3da79e80acd64c2761dd2689d08fc3b706266981a64aa7adfbe75785b7f8a296`）の内側に、Blenderへ指定する `CinemaOperator_0.7.183_Release_DocsRev1.zip`（SHA-256 `5afbe14534a88e3a47b09f712fa42bd3f24b36862312bc369d84c288d3991cb9`）がある。内側の `cinema_operator/__init__.py` の `bl_info` は版 `(0, 7, 183)`、最小Blender `(5, 1, 0)`。同梱案内はBlender 5.1/5.2 LTSを対象とする。
- `cinema_operator/bake.py` の `bake_camera` は、範囲内の各整数フレームで評価済みカメラの位置、四元数、レンズ、センサー、シフト、クリップ、DOFを別のカメラへキー化する。`bake_program` は切替をBlenderのカメラマーカーへ残す。ここを結果取込の境界候補とする。
- 同梱 `LICENSING.txt` はPythonコードをGPL-3.0-or-later、フォントを各OFL、別添マニュアル・画像・動画・ブランドを別の権利として記す。アドオンZIPをリポジトリや配布物へ自動同梱しない。配布形態を変える場合は権利を改めて確認する。
- Blenderでのインストール、起動、Bake、Studioへの往復はまだ実行していない。静的なコード確認を実機合格としない。

## 2. 利用者の操作と状態

1. Studioの「カメラ・演出」内で **Blenderアドオンを読み込む** を選び、配布セットZIPまたは内側のインストール用ZIPを指定する。配布セットの場合は認識した内側ZIPの名前を表示し、ユーザーが選ぶ。ZIPを開いただけでPythonを実行しない。
2. Studioはサイズ・構造・展開先逸脱・重複名・圧縮爆弾・ハッシュを検査し、名称、アドオン版、要求Blender版、対応アダプター、実行時のローカルPythonコード利用、権利情報を表示する。登録はハッシュ別の別名保存とし、既存版を上書きしない。削除は作品で参照中なら拒否する。
3. 対象作品と撮影する区間を選び、素材・ステージ・モデル・動作・作品FPSをBlender用の**別名作業コピー**へ書き出す。形式ごとの再現可否を先に示す。PMX/VRM/FBX等を再現できない場合は、その素材を隠した近似シーンで完成扱いせず、操作を止める。元素材・既存作品を変更しない。
4. **Blenderで編集**を押すと、対応版Blenderで作業コピーと登録済みCinemaOperatorを開く。アドオンのUIで撮影し、Blender内のBake操作で確定する。Studioは未Bakeの状態を完成結果として取り込まない。
5. **撮影結果を取り込む**で、Bake済みカメラと切替マーカーからStudio用の別名候補を生成する。比較プレビュー、警告、入力/出力ハッシュを表示する。ユーザーが「この作品に採用」を押すまで既存カメラは維持する。取消、Undo/Redo、再読込で候補と採用状態を区別する。
6. 採用したカメラは作品の共通時計で評価し、編集プレビューとMP4が同じカメラ源・同じフレームを参照する。音声・モデルの時刻を変えない。出力非対応の撮影項目は明示し、見た目を保証しない。

初期画面では登録済みアドオン、版、対応Blender、結果取込の可否を短く示し、詳細の検査ログは折りたたむ。未対応・Blender不在・未Bake・素材欠損・版不一致は次の操作を示す。手動UIを主導線とし、WebMCP/標準MCPも同じ登録・検査・候補取込・採用サービスを使う。可視Blenderでの編集開始はローカルの明示操作を要し、遠隔MCPから任意ZIPを無断実行しない。

## 3. アダプターと保存契約

| 境界 | 入力と検査 | 出力・保持 |
|---|---|---|
| ZIP登録 | ZIP内の `bl_info` とファイル一覧を静的に読む。許可した形式・容量・展開先・ファイル数を制限。実行は別操作。 | ZIP SHA-256、表示名、版、対応Blender、アダプターID/版、権利情報。原本ZIPは不変。 |
| Studio→Blender | 作品ID、保存revision、素材ID/hash、配置変換、作品FPS、対象区間、出力縦横比を固定。形式別の素材ローダーがない場合は拒否。 | 同一作品の別名 `.blend` 作業コピーとmanifest。Studioのdata原本を読み書きしない。 |
| Blender→候補 | `cinema_baked` 印とBake範囲、カメラの評価済みワールド行列・投影情報・DOF、カメラ切替マーカーを検査。Bake範囲の欠落、重複切替、参照カメラ欠損は拒否。 | フレーム別位置・四元数・投影/レンズ・シフト・DOF・半開カット区間 `[start,end)` と、入力ZIP/Blender/アドオン/作品revision/hash。元 `.blend` は保持。 |
| 候補→作品 | 作品revisionが変わったら自動上書きせず再比較。採用対象の作品・区間と旧カメラ源を表示。 | 別名候補を原子的に採用し、旧版とUndo/Redoを保持。旧カメラ/VMDと衝突する区間はカメラ源を明示選択。 |

作品時刻を正本とし、Blenderの `fps/fps_base` と開始フレームから秒を有理数で換算する。作品FPSが異なる場合は作品フレームで評価する規則と端数処理を固定し、非整数FPS（例29.97）・開始0以外・カット直前直後を試す。Blender Z-upからStudio/Three.js座標への変換行列、単位、カメラ前方、四元数の符号を一つのfixtureで照合する。画角はBlenderの `lens` だけでなくsensor fit/寸法、縦横比、pixel aspect、shiftを含む投影として検査する。Studioのレンダラーが同等に描けないDOFやクリップ等はJSONに元値を保持し、プレビュー/MP4との差を警告する。値の破棄や無言の近似はしない。

### 3.1 共通操作と候補データの最小形

手動UI・WebMCP・標準MCPは同じサービス操作 `inspect/register/list/prepare/open/import_bake/adopt/remove` を呼ぶ。`inspect` はZIPを静的に読むだけ、`register` は版別保存、`prepare` は作品の別名コピー、`open` は可視Blenderの起動、`import_bake` は候補生成、`adopt` はrevision条件付き採用。外部プロセス起動を伴う `open` はローカルでの明示操作と対象ZIPの表示を要する。MCPがローカル操作を満たせないときは `requires_local_action` を返す。各操作の失敗は、`addon_unsupported`、`blender_version_mismatch`、`scene_asset_unavailable`、`bake_missing`、`project_revision_conflict`、`projection_unsupported`、`execution_failed` 等の機械可読理由と日本語の回復操作を共通化する。

候補の保存記録には `schema_version`、`candidate_id`、`project_id`、`source_revision`、`addon_zip_sha256`、`adapter_version`、`blender_version`、`scene_manifest_sha256`、`baked_blend_sha256`、`source_fps_num/den`、`project_fps_num/den`、`range`、`samples`、`cuts`、`unsupported_fields`、`review_status` を含める。`samples` は作品フレームと原Blenderフレームの対応、評価済みカメラ行列、投影値を持ち、`cuts` は半開区間とカメラ参照を持つ。候補は読み込み・比較に使い、`adopt` が成功するまで既存作品のカメラ評価へ混ぜない。

## 4. 実装順と停止条件

| 単位 | 終了条件 |
|---|---|
| A. ローカル登録 | 配布セットZIPと内側ZIPの判別、静的検査、版別登録・一覧・削除制約、未対応表示、Windows/Linuxの隔離試験。ZIP登録だけではStudioカメラ機能を「使用可能」にしない。 |
| B. Blenderシーン橋渡し | 小さな実素材の同じ位置・時刻・画角をStudioとBlenderで比較。PMX等の未対応形式を表にし、欠落を拒否。外部プロセスの失敗・停止・再起動で原本と採用済み作品を保持。 |
| C. CinemaOperatorアダプター | 対応Blenderで可視UI、Bakeと切替マーカーを実行し、別名候補へ読み戻す。addon更新・再登録時も旧版作業コピーを保持。 |
| D. 作品採用・出力 | `CAM-015` のカメラ源選択・カット評価に接続。保存再読込、Undo/Redo、プレビューとMP4のフレーム/画素比較。手動UI、共通API、WebMCP、標準MCPの可能範囲と制限を確認。 |

実装前にCinemaOperator現物、Blender 5.1/5.2、対象素材のBlender読込とBakeの実行可能性を検証し、結果の形式と権利条件を確定する。Aだけ先にできても、B〜Dを未完了として台帳に残す。順3の長尺出力、順4のPMX口/表情、順5のGLB→VMDを割り込んで遅らせない。

## 5. 試験契約と未検証

- 文書段階：台帳JSON/CSVのID・件数一致、相対リンク、ロードマップ順、実装していない項目の状態表記を検査する。
- 実装段階：無効/破損/多重ZIP、パス逸脱、過大ZIP、版不一致、重複、利用中削除、途中停止、原本hash、候補と採用の競合を検査する。任意アドオンを自動実行する試験は行わず、信頼したfixtureを使う。
- 実機段階：Blender可視UIでCinemaOperatorの作成・Bake・保存再読込を確認。GLB/PMX/ステージ/動作の形式別にStudioとBlenderの開始・中間・終了、カット境界前後、縦横比、29.97/30/60fpsを比較。実GPUのプレビューと完成MP4のカメラ画素・音画時刻を照合し、Windows/Linux、手動/両MCPの未確認を個別に記録する。

現時点ではZIPの静的確認とStudio既存経路との設計照合だけ。アドオン実行、一般的なBlenderアドオン互換、作品シーンの往復、レンダリング一致、ライセンスに関わる再配布判断は未検証である。

## 6. 参照した一次資料

- 添付配布セットの `START_HERE.txt`、`LICENSING.txt`、内側の `cinema_operator/__init__.py`、`bake.py`、`sequencer.py`（上記SHA-256に固定）。素材本体はGitへ追加しない。
- [Blender 5.2 LTSのアドオンZIP導入手順](https://docs.blender.org/manual/en/5.2/editors/preferences/extensions.html)、[Blender Python APIの画面コンテキスト制約](https://docs.blender.org/api/5.0/info_gotchas_operators.html)、[Blenderの別プロセス実行](https://docs.blender.org/api/5.1/info_tips_and_tricks.html)。
