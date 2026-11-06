# MP3の元区間・分割・長尺同期（2026-11-06）

順3、Issue #81/#39/#63/#82、AUDIO-001・DATA-002/008・RENDER-006。WAVの既存長尺証拠は保持し、未完のMP3を個別に検証する。原本、旧作品、元IDと区間は自動変更しない。

## 再現した差と限定修正

同じ3.017秒/44.1kHzのMP3を、Windows FFmpegと実Chromeは3.017007秒（133,050sample）として扱うが、Ubuntu FFmpeg6.1のformat.durationは3.056327秒。8kHzでもChrome/復号PCM3.083125秒に対し6.1のformat.durationは3.168秒。コンテナーの尺だけを使う現在のAPIでは、Linuxで末尾余白を配置可能と扱う。

MP3ファイルの尺だけはffprobeの復号frame.nb_samplesの合計/sample_rateで検査し、先頭/末尾のskip/discardを反映した再生可能尺を登録・配置・編集・分割・出力の共通APIで使う。FFmpegの版番号で分岐しない。外部probeは既存同様30秒で時間切れとし、不正値/復号失敗時に推定尺へ黙って戻さない。WAV/動画等の尺の方式は維持する。元尺を超えた旧クリップは保存を変えず理由付きで出力拒否し、無断トリムしない。既存API/両MCPの入力定義は変更しない。分割APIが両MCPへ未公開だったため、既存のハサミと同じ保存APIへ `bai_studio_clip_split` を追加する（project_id/clip_id/revision/split_at、時刻は作品秒）。

一次資料: [ffprobeのフレーム情報](https://ffmpeg.org/ffprobe.html)、[FFmpeg MP3 demuxerのskip/discard処理](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/mp3dec.c)。実版の出力・Chrome・PCMを判定根拠にし、現行ソースの内容を旧版の実測の代用にはしない。

## 受入れ条件

1. 44.1/48kHz、低レート8kHzの隔離MP3で、共通media-infoの尺が復号PCM/Chromeと一致。旧probe差、復号失敗/不正/時間切れの拒否を検査。WAV/動画経路は維持する。
2. 登録済みMP3（約14秒）を原本不変で隔離複製し、③手動UIの配置・元位置編集・分割移動・再伸長・保存再読込を確認。元サンプル位置と作品開始は別値として保持する。
3. 登録実曲WAV（230.2秒）由来の長尺MP3を44.1/48kHzで作り、非0開始・分割後の移動と再伸長、先頭無音/中間/末尾・途中シークを確認。派生MP3を原ネイティブMP3と区別する。24/29.97/60fpsの完成MP4を復号し、先頭/分割境界/空白/末尾を含む参照PCMと位置差1映像F以内、画像フレーム/本数/原本hashを照合する。
4. 標準MCP公式SDKとChromeネイティブWebMCPの同じ保存APIで設定・保存値・拒否を照合。ChromeのメディアcurrentTimeとデコード内容、スピーカー実音の検査は区別する。
5. Windows/Ubuntuの対象試験と実データ検証、失敗/skip/未実施を分けて記録する。利用者のdata/exportsと変更一覧を保持し、検証済みPRのみmain/手元8765へ同期する。

ミキサー、音声/楽曲行増設、全codec/全実作品、聴感/実スピーカーloopback、全媒体Undoは今回の完成範囲に含めない。順3全体・順4の54件読み/候補採用・順5の判定を完了へ変更しない。

モデル区分：高性能（原因調査・限定修正・実機検証）。


## 比較器の検証境界

8kHzへ変換済みの波形を小数位置で線形補間すると、高域のある音源では1サンプル未満の位相差が大きな相関低下になった。48kHzで元区間から参照タイムラインを作り、同じ48kHzの完成PCMを整数サンプル単位で照合する。近傍で合わなければ±2映像Fまで探索し、相関0.97超・差1映像F以内を満たさないものは失敗にする。1サンプル差の検出と40ms差（29.97fpsの1F超）の拒否を既知のランダム波形で対照検査する。相関の閾値は下げない。


## 検証結果

Windows・Ubuntu WSLとも対象Python38成功（MP3の新規14・既存元区間14・小数FPS10）、新Node3成功・skipなし。Windowsは手動UI、公式MCP SDK2.4の継続stdio、Chrome156ネイティブWebMCP、ブラウザーのメディア時刻/復号サンプルまで実行。Ubuntuは公式SDK/HTTP/FFmpegのみで、ブラウザーは未実行。Windowsの既存出力MCP/版管理回帰も2成功、型/構文成功。新ツール込みでstdio128・Chrome登録64を確認した。

同一のWindows生成MP3を両OSで読み直し、8kHzは3.083125秒、44.1kHzは3.0170068秒、48kHzは3.017秒で一致した。Ubuntu6.1のformat.durationはそれぞれ3.168/3.056327/3.048秒だった。別々の版で再エンコードしたMP3は同じ内容でも余白が違うため、バイナリが同じである比較と区別した。旧尺3.0563秒で保存された3.046秒のクリップは、保存を変えずに元尺超過として422を返すことを両OSで確認。

生成見本の3.017秒MP3を手動配置し、元素材0.25秒、作品開始1秒へ保存。ハサミで2秒の位置を分割し、右片を実マウスで4秒へ移し、両MCP経由の編集で作品3.5秒/元素材0.75秒/長さ1.5秒へ再伸長した。ページ再読込・保存値一致、境界分割/元尺超過の拒否と保存不変、180F MP4の7窓（有音4・無音3）、Chromeの再生位置4点とデコードサンプル数を照合した。確認画像は合成音と青一色画像だけ。

登録済みMP3はCC0見本のKenney UI Audio Preview（約14秒）で、実楽曲MP3原本とは区別する。登録実曲WAV230.2秒を読み取り専用の原本から、0.45秒の先頭無音つき44.1/48kHz MP3へ派生した。原本曲を新規ネイティブMP3と呼ばない。非0開始、115.5秒で分割、右片の移動と0.25秒再伸長、保存再読込、途中シークを行い、24/29.97/60fpsの約233秒の完成物を確認。各レートの完成物は5,585/6,974/13,963F、登録見本は29.97fps/485F。各OS7本・733窓（有音705・無音28）を照合し、最大位置差は1sample/48kHz（約0.0208ms）、最小相関はWindows0.991957・Ubuntu0.986011。先頭無音・分割後の空白・末尾も含む。原MP3/実曲WAV/利用者索引のhash/全バイトは前後一致。

これは出力PCMの位置検査であり、全フレームの主観品質や実スピーカーの聴感を合格にするものではない。ブラウザーではcurrentTime/メディアduration/デコード内容を確認し、OS音声出力のloopbackは実行していない。任意のMP3、ヘッダーなし/破損/全VBR、24時間級の性能、Linuxブラウザー/ネイティブWebMCP、新分割ツールの全媒体・全クライアントは未検証。混音音量一致・音声行増設・ミキサー・全Undoは残る。

## 失敗試行と対処

試験作成時に、lavfiの引用、再描画でのDOM差替え、移動前の値を使った境界拒否、作品終端を超えた出力Out、小数点を含む完成名の既存形式拒否で停止した。それぞれ生成式/完了待機/保存後の値/試験の背景長/拡張子なし名を直した。製品の禁止条件を緩めていない。8kHz線形参照と粗い48kHz探索では相関が不足し、独立した48kHzの原音/完成物で1サンプル差・相関0.9985を確認して比較器を修正した。近傍の整数サンプルを照合し、合わなければ±2Fを全探索する。既知の40ms遅延は拒否し、相関0.97の基準は維持した。

通常権限の先行pytestは一時フォルダー作成で拒否され、許可済み実行で38成功。長尺入力を指定しなかった先行試行・画像だけを更新した後の短い再実行は2成功・長尺1skipで、全入力を指定したWindows/Ubuntuの各3成功とは区別する。先行失敗を成功件数へ含めない。ログは通常納品先のlogs/へ保全する。

## 再実行・証拠・操作

WindowsはCHROMIUM_PATHを実Chromeへ、BAI_NATIVE_WEBMCP=1、BAI_TEST_CONCURRENCY=1、BAI_REAL_MMD_DATAを利用者dataへ、BAI_MP3_OUTを通常確認先へ指定して `node tests/run-guarded.cjs tests/studio-v05-mp3-timeline.test.cjs`。Ubuntuは/mnt側パスとBAI_MP3_API_ONLY=1を指定する。入力が無ければ長尺はskipし、成功と数えない。

Pythonは両OSで `python -X utf8 -m pytest -q tests/test_v05_mp3_duration.py tests/test_v05_render_fractional_fps.py tests/test_studio_v05_arrangement.py`（Ubuntuはpython3）。既存回帰は `tests/studio-v05-native-mcp-render.test.cjs` で、BAI_NATIVE_MIXED_VIDEOに既存の元AAC保持480pコピーを指定する。`npm run typecheck` とJSON構文/差分も検査した。

[Windowsの手動UI/両MCP](../../qa/mp3-timeline-chrome-20261106.json)、[UbuntuのSDK/API](../../qa/mp3-timeline-linux-20261106.json)、[Windows長尺](../../qa/mp3-timeline-real-win-20261106.json)、[Ubuntu長尺](../../qa/mp3-timeline-real-linux-20261106.json)、[同一MP3のWindows尺](../../qa/mp3-duration-shared-win-20261106.json)、[Ubuntu尺](../../qa/mp3-duration-shared-linux-20261106.json)、[生成見本だけの編集画面](../../qa/mp3-timeline-ui-20261106.png)。動画・画像・ログの通常納品先は `D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-06-mp3-timeline/`、Ubuntuはそのlinux/。Eagleへ自動登録しない。

手動操作は従来の配置/ハサミ/クリップ編集を使う。「開始（秒）」は作品内の配置、「元素材の開始（秒）」は原MP3の位置。MP3の長さは復号サンプルから確認する。古い保存が元尺を超える場合、原保存を残して理由を表示するため、明示して長さを直してから出力する。既に起動中の標準MCPクライアントは再接続で新ツールを認識する。DATA/AUDIO/RENDERの広いIDや順3全体は未完了で、順4/5の判断も維持する。
