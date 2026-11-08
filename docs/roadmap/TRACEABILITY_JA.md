# 会話履歴と機能IDのトレーサビリティ

会話に挙がった機能を主題でまとめた対応表。1対多の対応を許容し、類似機能は別の重複実装を作らない。

| 会話での要求・言及 | 管理先 | 統合判断 |
|---|---|---|
| v0.5で既存登録素材を使い、素材登録→同じ作品のタイムライン配置→プレビュー→書き出しを最短で通す。PMX表情・口・ダンスを専門機能の先頭に、GLB→VMD、GLBステージ、カメラ、モーション、字幕を同じ制作状態へ順次接続（2026-10-23 Owner指定、2026-11-02再構築） | DATA-001/008/016、AUDIO-001、MOTION-003〜007/010、LIP-001/004/006/007/009、CAM-001/003〜007/015/016/018、RENDER-001/002/004〜006、LYRIC-001〜005、NF-014 | [v0.5最短制作経路](V05_MINIMUM_WORKFLOW_20261023_JA.md)に承認済み順序、[再構築ロードマップ](V05_REBUILT_ROADMAP_20261102_JA.md)に現在の欠落と次の終了条件を記録。Issue #37の素材登録とIssue #63の画面間接続を同じ作品・時刻・保存状態で検証。既存IDの完成度は変更しない |
| 最初の50、次の50、82パターン、Mixamo英語名、3/4連続、Kip Up | MOTION-001, DANCE-010〜011 | モーションカタログ/チェイン |
| HTML 2D/3D、FBX/PMX読込・復元、BAT/SH | CORE-006, MOTION-002, MOTION-009 | 基本ビューワー |
| 登録済みモーションから右サイドで編集、タブ、お気に入り・タグ | DATA-002, DATA-011 | 編集＋テンプレートライブラリ |
| v0.5の画像行追加・移動・空行削除と共通出力（#80/#81、順3の既存残件） | DATA-002, CORE-004, RENDER-001/006 | 手動UI/APIの安定行IDを両MCPへ接続。[同じ作品の保存・プレビュー・MP4照合](../v05/IMAGE_LANES_NATIVE_MCP_20261106_JA.md)。他媒体の行追加は範囲外 |
| 素材一覧で動くグレーマン、キャラクター正面画像、ステージ内部の自動撮影（2026-10-21 Owner指定） | MOTION-016, DATA-016 | 原本を保持し、再生見本と版付きPNGを既存素材管理へ統合。実装・未検証は[素材見本の記録](ASSET_VISUAL_PREVIEWS_20261021_JA.md) |
| 制作状態保存/読み込み、履歴・復元、ローカルGit/タグ | DATA-008〜010, CORE-008 | プロジェクト保存とコード管理は別 |
| 全キャラクター配置面でGLB/VRM/PMX/FBXを選ぶ（2026-10-21 Owner直接指定、Issue #50） | DATA-008、P2-WP-04/05/06/07 | 既存の`workspace.asset`と任意の`workspace.character`へ統合し、形式別に保存できないモーションは明示。[実装・検証](CHARACTER_PLACEMENT_ALL_FORMATS_20261021_JA.md) |
| 旧保存をv0.5の作品IDへ非破壊に写す・取り消す（Issue #63/#69、2026-11-04） | DATA-008（CORE-004・UX-007・OBS-004を添える） | WP-L1（確認の純関数と固定fixture試験）・WP-L2（取込記録のストア）・WP-L3（収集・適用・打ち消し・取消）・WP-L4（試験専用の逆変換と往復試験）とWP-L7a（曲とダンスの開始時刻）・WP-L7b（旧タイムライン編集の動作の開始時刻）・WP-L5（HTTPとMCP）・WP-L6（v0.5の画面：作品カードのボタン1つと確認・取消の対話画面、隔離Chromeの試験）のみ実装。L9・見た目の大きさ・カメラの動きは未実装。[設計](LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md)。WP-L9（実データでの確認、R1〜R4合格、[証拠](../v05/LEGACY_IMPORT_REAL_DATA_20261104_JA.md)） WP-L7a 補足（2026-11-04 所有者決定「GLBも写す」）：曲とダンスのGLB動作のダンスを、変換せずに開始時刻ごと置いてダンスのモデルへ割り当てる（長さは既存の glb_channels、旧タイムライン編集と重なるときは割り当てない、実データでは未確認）。WP-L8a（見た目の大きさ、換算は一致、所有者の回答「旧の大きさ」で L1 により完了、L4/L5 の構図は順6、[証拠](../v05/LEGACY_IMPORT_L8A_REAL_DATA_20261104_JA.md)） |
| WebMCP/標準MCP/双方向同期、AI無し動作 | CORE-001〜005, CORE-011〜012 | 共通操作APIを正本に |
| FBX→PMX→VMD、GLB/BVH/VRM、一括・比較 | MOTION-003〜009, MOTION-014 | ユニバーサルコンバーター |
| 動画と音楽でダンサーA/B入替、各人振付 | DANCE-001〜007 | マルチダンサー管理 |
| 位置交換・回避候補を人が補正・確定、登録済み小道具の持ち替え、VMD一括出力の一部成功（2026-10-20 所有者決定） | DANCE-002/006/007/012 | O-DANCE-01/02/03 を A/A/A で承認。[B1判断資料](../specs/B1_MULTI_DANCER_DECISIONS_JA.md)。警告のみ・単一保持のみは未完成、原本と既存完成物を保護。実装・実機検証は未了 |
| 攻防、掴み、接触、ノックダウンと起き上がり | DANCE-008〜011 | 格闘・接触モジュール |
| 接点差と同一フレーム映像の併記、再現性確認後のベイク再利用、登録済み可動ピボットのイベント連動（2026-10-20 所有者決定） | DANCE-008/009, MOTION-021, LYRIC-010 | `O-COMBAT-01/02/03=A/A/A`。[B4決定記録](../specs/B4_COMBAT_STAGE_DECISIONS_JA.md)。自動合否・物理安全を断定せず、未承認ゲームロジックは加えない。機能の実機検証は未了 |
| SRT、音声同期、リップVMD、作者手癖、モデル別保存 | LIP-001〜008 | リップ最適化 |
| 歌音声の読込・実波形・開始位置・頭出し・映像同期（2026-10-20 所有者決定、2026-10-21/22 後続直接指定） | AUDIO-001 | PMX＋MVNT GLB＋実曲の同期プレビューを先行（[Issue #39](https://github.com/baisound/BAI_CREATER_STUDIO/issues/39)）。踊るモデルのGLB/VRM/PMX/FBX選択を[Issue #50](https://github.com/baisound/BAI_CREATER_STUDIO/issues/50)で追加し、後続指定でダンスVMD/FBXを#39へ追加。BVHは[Issue #55](https://github.com/baisound/BAI_CREATER_STUDIO/issues/55)に延期（[実装契約](AUDIO_DANCE_SYNC_20261021_JA.md)）。MP4多重化の RENDER-006、拍解析の LYRIC-006 と分離 |
| VMD集合の制作傾向、顔映像の既定非保存、時刻付き拍マーカー同期正本（2026-10-20 所有者決定） | LIP-005/011, LYRIC-006 | `O-MUSIC-01/02/03=A/A/A`。[B2決定記録](../specs/B2_MUSIC_EXPRESSION_DECISIONS_JA.md)。申告作者の本人性は推定せず、顔映像は明示選択時だけ参照保持。拍マーカーは音声サンプル位置で保存。機能は未実装・未検証 |
| 投稿用MP4の環境別実測、同名完成物の版名・旧版退避、透過の初期RGBA PNG連番（2026-10-20 所有者決定） | RENDER-002/004/005/006 | O-RENDER-01/02/03 を A/A/A で承認。[A2決定記録](../specs/A2_RENDER_DECISIONS_JA.md)。音声付きMP4は AUDIO-001 に依存。実装・実機検証は未了 |
| 表情/視線/瞬き、フェイシャルキャプチャ | LIP-009〜011 | 顔トラック |
| カメラVMD切出し、類似分類・ライブラリ・キー | CAM-001〜003, CAM-013〜016 | カメラエディター |
| 長方形画角、F値、レンズ、撮影技法すべて | CAM-004〜012, CAM-017〜018 | 3D撮影リグ/非対応パラメータはJSON |
| グリーンバック/任意色/透過、解像度/FPS/コーデック | RENDER-001〜010 | レンダリング |
| Ray-MMD、霧・塵・桜・きらめき・影・ボケ／ブラー | RENDER-011〜015、CAM-005、E-FOCUS-01/02、F-DOF-01 | 素材登録／内蔵FX／区間演出／設定／MMD向け出力を分離。ピントのボケはカメラ機能が所有し、FX側は参照・重ね合わせ検証だけを行う |
| JIZURA統合・リリック・WebMCP | LYRIC-001〜005 | 上流ソース/ライセンス分離 |
| JIZURA段階統合、フォント欠損時の代替選択、PMX部分出力（2026-10-20 所有者決定） | LYRIC-001/004/008 | `O-LYRIC-01/02/03=A/A/A`。[B3決定記録](../specs/B3_LYRICS_STAGE_DECISIONS_JA.md)。版・権利・依存を監査し、見た目差分と変換欠落を明示。機能は未実装・未検証 |
| 音楽ビート・絵コンテ・ショット管理 | LYRIC-006〜007 | 共通タイムラインの演出層 |
| Blenderマップ→MMD PMXステージ | LYRIC-008〜010 | ステージコンバーター |
| ポーズ、時間変更、レイヤー、非破壊、比較 | DATA-003〜007, MOTION-010, MOTION-014〜020 | モーションスタック |
| 20追加提案（未選択すべて） | DATA, MOTION, DANCE, LIP, CAM, RENDER, LYRIC | 全件登録、詳細台帳に吸収 |
| 撮影用途プリセット、カメラ自動ディレクター | CAM-013〜018 | カメラテンプレート統合 |
| 監査、素材重複、クラッシュ復元、ポータブルZIP | DATA-010, DATA-012〜015, RENDER-009 | 横断基盤 |
| ステージ・小物・材質・エフェクト・音声・動画・画像を制作の入口から取り込み、メタタイトル・実見本・波形・再生・詳細を確認（2026-10-21 所有者指定） | DATA-016、REVIEW-010 | [Issue #37](https://github.com/baisound/BAI_CREATER_STUDIO/issues/37)を最優先。素材管理・保存API・出典記録。演出への適用は既存の個別要件に残す |
| 提供S01 GLBを原点で配置し、室内表示・XYZ調整・保存再読込（2026-10-21 所有者指定） | NF-014、DATA-016 | [Issue #40](https://github.com/baisound/BAI_CREATER_STUDIO/issues/40)、[実装・検証記録](STAGE_LIGHT_RIG_20261021_JA.md)。原本GLBは保持 |
| 受領7ステージの更新、約661 MiBのGLBをGPU描画で使い、端末負荷を抑える（2026-10-21 所有者指定） | DATA-016、NF-014 | [Issue #44](https://github.com/baisound/BAI_CREATER_STUDIO/issues/44)、[負荷と実測](STAGE_PACK_GPU_20261021_JA.md)。自動3D読込を抑止し、原本と既存制作状態を保持 |
| 受領S03/S04/S06/S07の内蔵ライトを別名GLBから除去し、S01・無関係素材のライトを保持（2026-10-21 所有者指定） | NF-014、LIGHT-001、DATA-016 | [Issue #46](https://github.com/baisound/BAI_CREATER_STUDIO/issues/46)、[別名GLBと検証](STAGE_LIGHTLESS_ZOOM_20261021_JA.md)。S05/S06の発光材質は残課題 |
| シーン視点を注視点や床の位置を越えて移動（2026-10-21 所有者指定） | VIEW-001、NF-014 | [Issue #47](https://github.com/baisound/BAI_CREATER_STUDIO/issues/47)、[隔離テスト](STAGE_LIGHTLESS_ZOOM_20261021_JA.md)。LAST CHASE全景の再試験は端末フリーズ歴により未実施 |
| 3点照明を初期例とし、多灯を個別追加、RGB・強度・変形をライト単位のキーで編集（2026-10-21 後続所有者指定） | LIGHT-001、UX-001〜008 | [Issue #40](https://github.com/baisound/BAI_CREATER_STUDIO/issues/40)、[設計と根拠](STAGE_LIGHT_RIG_20261021_JA.md)。VMDの単一ライト記録へ無断縮約しない |
| メイン透視を右に保ち、選択した正面・背面・左・右・上・下を左の補助ビューに同時表示（2026-10-21 後続所有者訂正） | VIEW-001、LIGHT-001、UX-002 | [Issue #40](https://github.com/baisound/BAI_CREATER_STUDIO/issues/40)、[参照記事](https://mononoco.com/creative/ue/screen-split)、[実測](STAGE_LIGHT_RIG_20261021_JA.md)。補助ビューの外殻非表示は描画中だけ、右メインと原本を保持 |
| 新UIのFBX連結からVMD変換ジョブを作成し、ローカルBlender実行の状態を表示（P2-WP-07） | MOTION-006/007、DATA-001 | [Issue #49](https://github.com/baisound/BAI_CREATER_STUDIO/issues/49)、[WP-07監査と検証](P2_WP07_EXPORT_AUDIT_20261022_JA.md)。SCR-23で既存APIへ接続。自動テストではexportsへの書込を遮断し、実Blender品質とMCPは未検証 |
| MMDカメラ補間曲線のVMD読取順を検証し、非対称曲線のプレビューを一致させる | CAM-001/016 | [Issue #58](https://github.com/baisound/BAI_CREATER_STUDIO/issues/58)、[Phase E設計§3](PHASE_E_DETAILED_DESIGN_20261020_JA.md)。公開実装と現行デコーダに差があり、実MMD比較は未検証。WP-13で原本保持のまま検証・修正 |

## 未実装/実装済みの見分け方

会話で「実装した」と述べた内容は完成証明ではない。ソースの該当箇所、テスト実施記録、ブラウザ・PMX・Blender実機での結果が揃うまで `要検証` とする。

## 追加決定：OBS-001〜OBS-009
要件台帳 → [詳細仕様](PHASE_00_LOGGING_FIRST_JA.md) → [Phase 00](PHASE_00_INTEGRATION_JA.md) → 共通API/UI/WebMCP/標準MCPの実装・試験（未実装）。

## 追加決定：リグ編集（2026-10-20 所有者）
- 「リグを操作してモーションとカメラを編集する（UE のコントロールリグ／Sequencer 方式）」→ 既存ID `MOTION-010`（モーションスタックの行）と `CAM-003`・`CAM-006`・`CAM-007`（カメラエディター／3D撮影リグの行）の詳細として [リグ編集仕様](RIG_EDITING_SPEC_20261020_JA.md)。新IDは作らず、2026-10-23以降の実施順はv0.5最短制作経路を優先する。MOTION-010の[PMX先行詳細設計・3回の批評・段階A判定](MOTION010_V05_DETAILED_DESIGN_20261024_JA.md)、[数値FK補正の部分接続・実PMX試験](../v05/MOTION010_FK_STAGE_A_20261024_JA.md)、[レイヤーと作品キーの追加](../v05/MOTION010_FK_LAYER_TIMELINE_20261024_JA.md)、[FK補正入り完成MP4の3F画素比較](../v05/MOTION010_FK_MP4_20261024_JA.md)、[実PMX骨階層・3Dマーカー選択](../v05/MOTION010_BONE_SELECT_20261024_JA.md)、[実PMX骨の3D回転ハンドル](../v05/MOTION010_FK_3D_ROTATE_20261024_JA.md)、[局所位置差分の数値補正](../v05/MOTION010_FK_POSITION_20261024_JA.md)、[実PMX骨の3D位置ハンドル](../v05/MOTION010_FK_3D_TRANSLATE_20261024_JA.md)、[実PMXの足IKターゲットと再生補正](../v05/MOTION010_PMX_FOOT_IK_TARGET_20261024_JA.md)を2026-10-24に記録。IK/FK切替・別名VMD等とCAM側の設計改訂・判定は別で、未完了。
- MOTION-010段階Cの[別名VMD骨区画writer](../v05/MOTION010_VMD_BINARY_REWRITE_20261024_JA.md)は、実VMDの非骨suffixと未編集骨を保持する構造検査まで。補正キー焼き込み・実PMX往復は未接続。
- MOTION-010の[全区間一定補正VMD候補](../v05/MOTION010_VMD_CONSTANT_CANDIDATE_20261024_JA.md)は、実PMX頭骨300フレームの限定往復を確認。候補UI/API/MCPを共通化した。この段階では時間変化キーと一般化した採用判定は未接続。
- MOTION-010の[時間変化FK補正VMD候補](../v05/MOTION010_VMD_TEMPORAL_CANDIDATE_20261024_JA.md)は、作品FPS全フレームの局所誤差ゲートと実PMX頭骨600フレームの限定往復を確認。IK/grantを含む一般化した採用判定と作品配置は未接続。
- MOTION-010の[左足IKを含む別名候補](../v05/MOTION010_VMD_FOOT_IK_CANDIDATE_20261024_JA.md)は、終了境界の補正と実PMXの左足IKターゲット・左右足首600作品フレームの限定往復を確認。一般化した採用判定と作品配置は未接続。
- MOTION-010の[24fps・前後なじませ候補](../v05/MOTION010_VMD_FPS_FADE_CANDIDATE_20261024_JA.md)は、不要な境界キーを避けて元VMD曲線を保持し、実PMX頭骨240作品フレームの限定往復を確認。一般化した採用判定と作品配置は未接続。

## UI/UX設計方針（最新ユーザー決定）
- 「1画面に詰め込まず、固定領域・内部スクロール、タブ、注釈、ホバー説明、説明書不要の操作性」→ `UX-001`〜`UX-008`、[詳細仕様](UI_UX_DESIGN_STANDARD_JA.md)。
- 「AGENTS.MDおよびその他MDを作成してコミット」→ ルート [`AGENTS.md`](../../AGENTS.md) と本ドキュメント更新。

- 2026-11-06 開発継続（#37/#81、DATA-016/RENDER-006）→ [WebM/OGV/VFRの検証と修正](../v05/VIDEO_FORMATS_VFR_20261106_JA.md)。元時刻保持と③編集の再生不可表示。実形式全般の完成判定は保留。

- 2026-11-06 Owner: 全体の現在地と工数を簡単な言葉で説明し開発を継続 → [全体整理](CURRENT_POSITION_AND_EFFORT_20261106_JA.md)、#69。新しい完了率や優先順位の変更ではない。
- 2026-11-06 Owner: 完成した動画を一覧から選んでダウンロード → #248、RENDER-001/006/007、NF-017の一覧/受取り部分のみ直接承認。[実装・試験](../v05/RENDER_DOWNLOAD_LIST_20261106_JA.md)。統計等は追加しない。


### 2026-11-06 承認済み順3の継続

Ownerの「順3の次の未完成項目を進め、検証済みをmain/制作画面へ同期」→ #81/#63の複数動画行。DATA-002/008、RENDER-001/006へ統合。[設計・観測・失敗/未検証](../v05/VIDEO_LANES_20261106_JA.md)。試験待機の必須依存修正は#61。同じ要件の続きで優先順位は変更しない。


### 2026-11-06 承認済み順3のMP3残件

Ownerの「次の未完成項目を進め、検証済みをmain/制作画面へ同期」→ #81/#39/#63のMP3元位置・分割・長尺。必要な#82の既存ハサミを両MCPへ接続。[範囲・結果・未検証](../v05/MP3_TIMELINE_SYNC_20261106_JA.md)。新ミキサーや優先順位の変更は行わない。


### 2026-11-07 複数音声・楽曲行（順3）

2026-11-07、#81の複数音声・楽曲行（各最大16・安定ID・空行のみ削除）を手動UI/API/両MCPへ接続。旧保存/名前互換、元区間・分割/移動・保存再読込、種類ごとの全行ミュートと混音を限定確認。Windows/Ubuntu各Python58・Node2成功、Windows関連回帰6成功2実データskip。実曲WAVと登録MP3を重ねた29.97fps/6924Fの完成MP4で各119窓（有音117）のPCM時刻差0/8kHz。Linuxブラウザー/聴感/混音音量一致/行別ミキサー/全Undoは未完了。docs/v05/AUDIO_MUSIC_LANES_20261107_JA.md


### 2026-11-08 混音の音量一致（順3）

2026-11-08、#81の混音音量一致を限定修正。MP4のamix暗黙正規化を外し、既存HTMLプレビューの元音量加算へ一致させた。変更前は入力数/終端で約1/4→1/3→1/2、修正後の合成PCM音量比はWin0.9992〜1.0001/Linux0.9962〜1.0016。Chrome実再生のWebAudio採取は約1倍。Windows/Ubuntu各Node2成功、Python各28（Win追加subtests5）、回帰3成功2任意実データskip。実WAV+登録MP3の6924F/各117安定窓は音量比±3%・時刻差0sample/48kHz。切替直後AAC過渡/OSスピーカー聴感/全素材/ミキサーは未完了。既存完成物は保持。docs/v05/AUDIO_MIX_LEVEL_20261108_JA.md


### 2026-11-08 音声の形式別経路（順3）

2026-11-08、#81/#37のOGG(Vorbis/Opus)・FLAC・M4A(AAC)を登録/実尺/元区間・分割/Chromeプレビュー/MP4へ接続。署名/MIME/共通取込判定・音声波形の形式制限を同期。Vorbisの切出し約139sample/48kHz差を独立音声の事前時刻正規化で修正し、動画内音声の相対時計は保持。Windows/Ubuntu各Python50・Node2成功、関連回帰24成功1実データskip。899F/818Fの各30窓は差0sample、実曲由来4代表codecの5619F/各92窓は最大1sample/48kHz。全codec/聴感/Linuxブラウザー・AAC再圧縮品質などは未完了。docs/v05/AUDIO_FORMATS_20261108_JA.md


### 2026-11-08 静止画像の形式別表示・出力（順3）

2026-11-08、#81/#37の代表静止画像を限定検証。既存登録CC0 WebPと新規PNG/JPEG/WebP/BMP、EXIF向き6・透過・縦長・重なりを同じ作品で保存再読込/450F・非0In390Fへ出力。撮影枠内の暗青色とMP4黒の差を修正し、21時刻のChrome/MP4比較は最大MAE5.159/255、透明部/余白は黒一致。MP4画像形式を既存capabilityから素材詳細へ渡し、GIF/AVIF/旧登録を模した実EXRは理由付き拒否し旧完成物を保持。WebMCP書出しのHTTP番号だけになる拒否理由も限定修正。Windows/Ubuntu各Python29・Node2成功、回帰7成功。全画像/ICC・HDR/全EXIF/Linuxブラウザー・動的画像出力/全Undo/順3全体は未完了。docs/v05/IMAGE_FORMATS_20261108_JA.md
