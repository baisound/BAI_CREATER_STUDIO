# 動画形式の案内と映像なし素材の拒否（2026-11-08）

順3、Issue #81/#37/#69。DATA-002/008/016、RENDER-001/006。既存登録MP4と新規MP4/WebM/OGVを同じ作品で確認し、旧登録MOVは出力未対応を明示する。既存の[VFR契約と証拠](VIDEO_FORMATS_VFR_20261106_JA.md)を維持する。

## 契約と受け入れ条件

- 登録・出力の対応形式を増やさない。登録MP4/WebM/OGV、MP4出力のVIDEO_EXTを正本とし、既存assets/capabilitiesへmp4_video_formatsを加える。詳細欄は登録/ブラウザー再生/出力対応を分け、情報欠落時にも素材一覧を維持する。
- 旧MOVは隔離した旧索引fixtureで確認。登録APIへ追加せず、MP4出力ではクリップ名と対応形式を含めて拒否する。元ファイルを変換・上書きしない。
- 動画扱いのファイルに有効な寸法の映像ストリームがなければ、共通media-info/配置・出力の境界で拒否する。attached_picのカバー画像だけを動画映像と数えない。既存の音声形式・カバーアート判定は保つ。
- 手動UI、標準SDKとChromeネイティブWebMCPで操作。拒否後の保存値、原本/index、以前の完成物が変わらないことを確認する。WebMCPの配置も既存の出力と同じ限定エラー本文処理を使い、HTTP番号だけに理由を落とさない。
- 同じ作品で元位置0.25秒・移動/伸長、保存再読込、先頭/中間/終端・空白・非0InのプレビューとMP4を照合する。VFRの実PTSも検査する。Windowsの実ChromeとUbuntu API/FFmpegを区別する。

モデル区分：高性能（既存経路と保存互換の判断・実装・検証）。

## 利用者への変更と原因

素材管理の動画詳細へ、MP4対応状況と対応形式を表示する。対応拡張子でもコーデックによりブラウザー再生できないこと、映像の有無を配置・出力時に調べることを案内する。旧サーバーから新項目が返らない場合は対応不明とし、一覧を消さない。

従来のプローブはdurationとaudioだけを返し、映像なしMP4でも2.0秒/audio=trueとなっていた。動画種別であることを前提として配置でき、後段のFFmpegグラフまで映像の不足を検出できなかった。width/height・attached_picを読み、有効な映像なしなら「動画の映像トラックが見つかりません」と保存前に拒否する。既に保存された旧クリップも出力スナップショットで拒否し、保存済み内容を自動修復・変更しない。これは全映像フレームの復号検査ではなく、壊れた全codecの検出を保証しない。

## 確認した範囲

`tests/studio-v05-video-format-policy.test.cjs`。実登録のKenney Platformer Demo MP4（CC0、3秒・音声なし）を原ID/indexのまま隔離複製。新規のH.264/AAC MP4・VP9/Opus WebM・Theora/Vorbis OGVは3秒の合成明暗時計と時変周波数音声を生成し、Windowsでは手動UIで一括登録した。WebMは50/350msの実PTS間隔を確認。全4本を同じ作品へ配置し、同じIDで0.25秒戻して1秒から1.5秒へ伸ばし、source_start=0.25を保存した。

30fpsの全域225F、非0InのF9〜223/215Fを生成・再読込。3形式の各45Fは元PTS明暗と±1出力F内で一致、行間の空白も黒、非0In版の215Fは全域版の対応時刻の明暗と一致。Windows Chromeは既存MP4/新MP4/WebMを各2時刻の実画素で照合し、OGVは映像幅0の理由表示を確認した。OGVがChromeで再生成功したとは扱わない。

各新規動画の2窓を8kHz PCM相関で照合。WindowsはMP4/WebM差0sample、OGV差21/32sample（最大4ms、相関0.9860以上）。UbuntuはMP4/OGV差0、WebM差56sample（7ms）。すべて1出力F以内。短尺の代表サンプルであり、長尺や任意codecの全区間一致を証明しない。

音声だけのMP4 AAC/WebM Opus/OGV Vorbis、カバー画像付きMP4を新規登録し、手動UI・SDK/ネイティブ配置の拒否と旧保存fixtureからの出力拒否を確認。旧MOVは実MOVファイルを旧索引に隔離seedし、登録拒否・一覧/詳細・出力理由を確認した。MOVの新規登録やMP4化は実装していない。拒否で原本/index・配置・以前の完成MP4のDL/hashが変わらないことを確認した。

Windows/Ubuntu各Python47成功0skip、Node2成功0skip。Windowsの最終試験は手動配置の拒否表示も確認。Ubuntuはそのブラウザー専用追加に作用しないAPI側を実行した。型・Node構文・差分空白検査成功。関連回帰4成功は末尾へ記録。

## 途中失敗・未検証

最初の通し試験は末尾クリップの終了7.5秒を超える8秒まで出力しようとして範囲APIの正常な拒否に失敗。試験を実終端225Fへ訂正し、成功を確認した。シェル内Pythonの引用符による一度の編集失敗はソースを変更せず、構造化パッチで編集した。映像なしのプローブの変更前観測はqa/video-probe-baseline-20261108.json、旧APIの実行結果ではない。

Linuxブラウザー/ネイティブ・実GPU、全codec/VFR・原4K/長尺・回転メタデータ/色空間・多重映像/音声選択・全破損検出・スピーカー聴感・全Undo、Ownerが実際に持つ旧MOVは未確認。順3全体、順4の54件読み・自然さ/最終候補採用、順5判定と既存ゲート2失敗/依存監査3件は維持する。

## 証拠と再実行

数値はqa/video-{formats,refusals}-{chrome,linux}-20261108.json、合成確認画像はqa/video-{formats-supported,formats-unsupported,no-picture-refusal}-20261108.png。MP4/元入力のうち保持対象・全ログはD:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-08-video-formats/。実登録原本はGitへ追加しない。

`python -X utf8 -m pytest -q tests/test_library_assets.py tests/test_v05_asset_import_v53.py tests/test_studio_v05_arrangement.py tests/test_v05_audio_formats.py tests/test_v05_render_fractional_fps.py`。

`node tests/run-guarded.cjs tests/studio-v05-video-format-policy.test.cjs`。BAI_REAL_MMD_DATAは利用者dataの読取元、BAI_VIDEO_OUTは通常確認先、WindowsはCHROMIUM_PATH、UbuntuはBAI_VIDEO_API_ONLY=1。8765や利用者作品へ試験登録・出力しない。


## 関連回帰

Windowsで既存studio-v05-video-formats-vfr（24/29.97/60fps・内部4条件）、studio-v05-image-formats（2件）、studio-v05-render-mcp（1件）の計4件成功0skip。計403FのVFR代表明暗/12PCM窓、画像透過/拒否とMCP版管理を再確認した。型検査も成功。配信バイト照合追加後は、新試験だけWindows/Ubuntuで再実行し、各2成功0skip、登録・原本の同一SHA-256を確認した。


## mainと表示中制作画面の同期

実装75a517f、PR #274、maincaac129。利用者main/開発木をfast-forwardし、所有コマンドと保存実行中ジョブ0を確認した8765だけを非表示再起動（PID6164→62952）。HTML/素材管理JS/WebMCPのHTTP実バイトがmainと一致し、既存APIがmp4_video_formats=mp4/ogv/webmを返す。mainのプローブも別の合成音声MP4でvideo=falseを確認。利用者作品へ試験登録・出力せず、data/exports/studio.zipの515ファイルhash・変更一覧は不変（data/logs除外）。

開いていたChromeタブ1055945512のホームを確認後、再読込して既存2作品とホームの表示を確認し、同じURLを保持。ローカル確認画像logs/video-policy-studio-synced-20261108.pngを通常確認先にも保存した。Issue #81コメント6721777867の合成画像3枚は実表示・1440×900・原画像hash一致。同期証拠qa/video-policy-main-sync-20261108.json。文書のみの同期PR後は不要な再起動を増やさず、最終mainと応答・保持を再照合する。

台帳の機械的記録でCSVの既存BOMを読み落とし、一度中断。utf-8-sigで保持して追記した。全JSON/CSV一致の追加確認は既存12IDのdetail差異で不一致となったため、変更前と差異IDが同じことを確認し、今回の5IDへ同じ追記を行った事実と区別した。151件のID数と証拠JSONの読戻しを確認し、差異の全件解消とは扱わない。
