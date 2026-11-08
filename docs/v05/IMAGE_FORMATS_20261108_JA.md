# 静止画像の形式別プレビューとMP4（2026-11-08）

順3、Issue #81/#37/#69。DATA-001/002/008/016、RENDER-001/006。登録済み画像と新規PNG/JPEG/WebP/BMPを同じ作品で確認し、未対応画像は欠落させず理由付きで拒否する。

## 契約と受入れ条件

- 既存の画像登録形式とMP4対応形式を増やさない。MP4の静止画像はPNG/JPG/JPEG/WebP/BMP。GIF/AVIF/EXRなどはプレビュー可否とMP4可否を分けて表示する。EXRは新規登録へ追加せず、旧登録を模した隔離fixtureで一覧と出力拒否を確認する。
- 対応形式の正本は出力側IMAGE_EXT。既存assets/capabilitiesへ対応形式を読取専用で公開し、素材詳細の案内へ渡す。対応形式であっても破損の無条件成功は約束しない。
- 既存登録画像1件と新規4形式、透過PNG/WebP・縦長BMP・EXIF向き6のJPEGを同じ作品へ配置。移動/長さ/重なりと保存再読込、手動UI/標準SDK/ネイティブWebMCP、PNG/JPEG/WebP/BMPの代表プレビュー/MP4を画素比較する。枠内はMP4と同じ黒を背景にし、編集領域の外側の色は維持する。
- 先頭/中間/切替前後/終端の画素とフレーム数、非0In、失敗時の既存完成物不変・配置/原本/index hash不変を確認。Windowsの実ChromeとUbuntu API/FFmpegを分ける。Linuxブラウザー/全画像・ICC/HDR/全EXIF/色管理全般/アニメーション画像出力/全Undoは未確認として維持。
- 検証済み差分をmainへ統合し、利用者data/exports/変更一覧を保全して8765と開いているChromeを同期する。順3全体、順4/5、既存の証拠ゲート/依存監査を完了にしない。

モデル区分：高性能（画像経路と保存互換・比較方法の判断、実装・検証）。

## 操作と結果

素材管理で画像を選ぶと、元画像の見本とは別にMP4対応状況を表示する。対応形式は出力側の正本から既存APIへ渡すため、登録できるGIF/AVIFもMP4対応とは表示しない。旧登録を模したEXRも一覧と理由表示を確認。出力は既存の同じ作品/範囲/ジョブを使う。未対応画像を保存したまま出力すると、画像名・対応形式を含む理由で拒否し、完成物を無断更新しない。対応形式のAPI情報がない旧サーバーでも素材一覧は保持し、「確認できません」と案内する。

- 実登録の `kenney_platformer_image`（CC0 WebP）を原ID/indexとともに隔離複製し、合成PNG/JPG/WebP/BMP/JPEGの5件を手動UIで新規登録。透過PNG/WebP、縦長BMP、EXIF Orientation=6のJPEGを同一作品に当初0.25秒遅い位置/1.5秒で置き、同じIDを0.25秒戻して2秒へ伸長、行ID保持を確認した。最後に2行で重ねた。30fps、全域450Fと非0Inの45〜434F/390Fの2本を再読込。先頭/切替前後/末尾21時刻で、元画像の可視表示・透過/色/縦横比・向きを確認。標準SDK/ChromeネイティブWebMCPで配置・出力、保存再読込・原本/index不変を確認した。
- 変更前は透過部/余白のプレビューがRGB[5,11,18]、MP4が[0,0,0]。全体のRGB平均絶対差は最大9.801。枠内の背景だけ黒へ合わせた後は透明部・余白が黒一致、160×90で21時刻の最大MAE5.159/255、全て基準6未満。細部の縮小/非可逆圧縮差を含むため全画素バイト一致とは扱わない。非0In版は同時刻の全域版とMAE1未満。Ubuntuは代表色/透過/縦横比/フレーム数と2版の画素一致を確認し、ブラウザー比較はWindowsに限定。
- GIF/AVIFは実ファイルを新規登録、EXRはFFmpegで生成した実ファイルを旧索引の形で隔離seedした（Ownerの既存EXR原本の確認ではない）。UIの未対応案内、SDKとChromeネイティブWebMCPの出力拒否、拒否後の保存配置/index不変と以前の完成MP4の再DL/hash一致を確認。EXRの新規登録やアニメーションのMP4化は追加していない。
- WebMCPの出力拒否がHTTP422だけになることを検出。render_job_startのみに限定してerror本文を保持した。ネイティブの文字列応答も解析して詳細理由を確認。503/HTMLを返す試験用プロキシでもJSON解析エラーへ化けずHTTP503を返す。
- Windows/Ubuntu各Python29・Node2成功0skip。関連プレビュー/3D透過重ね/画像行の回帰5成功、MCP出力/版管理2成功。型・差分空白検査成功。Linuxの最後のChrome専用の応答解析/意図した503試験はAPI側へ作用しない。実GPU/ICC・HDR/全EXIF・全画像・実ユーザー旧EXR/アニメーション画像出力/全Undo/色管理全般は未検証。

## 途中失敗

初回のネイティブ拒否試験は文字列レスポンスをオブジェクトと扱い失敗。解析後に、製品がHTTP番号しか返さない欠落を検出して上記修正を実施。意図した422をブラウザーエラー監視へ登録していなかった試験失敗も記録。並行Chrome中はソケット不足（ERR_NO_BUFFER_SPACE）と非同期の案内表示直後の検査失敗があり、表示待ちを行いBAI_TEST_CONCURRENCY=1の単独実行で最終2成功。元ログは保持し、並行一括が成功したとは扱わない。

## 証拠と再現

数値 `qa/image-formats-{baseline,chrome,linux,refusals-win,refusals-linux}-20261108.json`、合成代表画像 `qa/image-formats-{preview,unsupported}-20261108.png`。元入力とMP4/ログは `D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-08-image-formats/`。実画像はGitへ追加しない。

`python -X utf8 -m pytest -q tests/test_library_assets.py tests/test_v05_asset_import_v53.py tests/test_v05_asset_sources_v54.py tests/test_studio_v05_arrangement.py`。`node tests/run-guarded.cjs tests/studio-v05-image-formats.test.cjs`（BAI_REAL_MMD_DATAに既存data、BAI_IMAGE_OUTに確認先、WindowsはCHROMIUM_PATH、LinuxはBAI_IMAGE_API_ONLY=1）。変更前の計測は修正前HEADでBAI_IMAGE_BASELINE=1。

順3全体と広い機能ID、順4の読み/自然さ/最終候補採用、順5判定と既存ゲート2失敗/依存監査3件は維持する。


## mainと表示中の制作画面の同期

実装e5393d4、PR #272、main1ab7d08。利用者main・開発木をfast-forwardし、所有コマンドと実行中ジョブ0を確認して8765を非表示再起動（PID59796→6164）。HTML・素材管理JS・撮影枠CSS・WebMCPのHTTP実バイトがmainと一致、新しいmp4_image_formatsが5拡張子を返す。読取専用Chromeで撮影枠背景rgb(0,0,0)を確認。利用者の開いていたChromeタブ1055945512も再読込し、ホームと既存2作品の表示を確認、同じURLで保持した。利用者作品への試験登録/出力は行わず、data/exports/studio.zipの515ファイルhashと変更一覧は不変（data/logs除外）。

Issue #81の結果コメント6720895960で合成画像2枚が実表示され、1440×900と原画像hashが一致した。証拠はqa/image-formats-main-sync-20261108.json。表示中画面の確認画像はローカルlogs/image-formats-studio-synced-20261108.png、通常確認先にも複製。同期用スクリプトの初回はGIF/AVIFがimageだけに登録できるとの誤期待で失敗し、既存fx/material等を保つimage包含へ修正して成功（製品の変更なし）。文書のみの同期PR後は再起動を増やさず、最終mainと応答を照合する。
