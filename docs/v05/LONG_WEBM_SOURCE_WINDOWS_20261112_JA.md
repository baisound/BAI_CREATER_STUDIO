# G3-B2：長尺WebMの元区間と入力時計（2026-11-12）

順3、Issue [#81](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81)/#37/#63/#39。DATA-016/002/008・AUDIO-001・RENDER-001/006。基点main `3facd74`、開始 `e2be423`、修正段階 `7634275`。**実映像由来の長尺WebM VP9/Opus代表は修正後にWindows/Ubuntuで成功。G3-B/順3全体は未完了。**

## 入力と比較契約

前回の[長尺MP4 VFR](LONG_VFR_SOURCE_WINDOWS_20261111_JA.md)と同じ実214秒の480p CFRコピー（SHA-256 `c895d1da79dfddb4c93210b778b74d727be225ac5c07a2c5d6c5a399093f89d6`）から、12枚中0/1枚目と末尾を選び、元PTSを保ってVP9/Opus192kの隔離WebMへ変換した。自然発生VFRや元4Kの直接登録ではない。400MiBの上限は変更していない。

入力WebMは33,844,787 bytes、SHA-256 `1bac1fa898bab3a5e66994f4a25ffd4b6ef1bec93b9135b945aa4d01266d065b`、1,071フレーム。全PTSを元選択フレームと比較し、WebMの1ms時計による最大丸め差0.333msを確認。音声は再圧縮しているためAACパケット同一性を要求しない。元動画とWebMの復号PCMを各OSの8kHz/mono、200msの106窓で比較し、全窓有音、位置差0sample、最小相関0.996385を確認した。同じWindows生成WebMをUbuntuにも渡し、別入力を生成していない。

別実WAVのhashは `201f379be031b89245b4c5dbca039c1b29adb85d80307cb91e08dee66ccfdd0c`。原動画コピー/実曲/index/入力WebM/前回完成物の前後hash、登録後の全バイト、ジョブに固定した入力hashとAAC320000目標値を照合した。試験は一時BAI_DATA_DIRと9240/9241番のみで実行。動画・曲・画素の実ファイルをGitHubへ投稿していない。

## 見つかった不具合と修正

修正前Windowsは成功したが、Ubuntu FFmpeg6.1.1では作品3.08秒の200ms窓が相関0.931031、gain0.924785となり失敗した。映像6,879Fの比較は通過していた。[失敗測定](../../qa/long-webm-linux-before-fix-20261112.json)・[ログ](../../qa/long-webm-linux-before-fix-20261112.log)を保持。

入力WebMはOpusプリロールのため音声streamのstart_timeが-0.007秒だが、最初の復号フレームPTSは両OSとも0。実出力と同じ音声切出しを単独で再現すると、Ubuntuの既定入力処理では元1.10/113.30秒の内容が56sample/8kHz＝7ms前倒しになり、Windowsでは0だった。`-copyts`のみを付けると両OSとも差0、`-copyts -start_at_zero`はUbuntuの差を戻した。[診断コード](../../qa/long-webm-clock-diagnostic-20261112.py)・[Windows結果](../../qa/long-webm-clock-win32-20261112.json)・[Ubuntu結果](../../qa/long-webm-clock-linux-20261112.json)。診断コードは記録先パスを今回のローカル確認先に固定しており、別環境では変更する。

製品のエンコード起動へ`-copyts`を明示した。既存グラフが元PTSから区間を切り出し、最後に作品の出力原点へ変換する設計に合わせた限定修正。動画内音声を独立音声のように一律STARTPTSへ戻さず、映像との相対時計を保つ。[FFmpeg公式のcopyts/start_at_zero仕様](https://www.ffmpeg.org/ffmpeg.html#Advanced-options)とも照合した。許容1F・相関0.97・画素MAE8は変更していない。音量/ミュート/フェード/対応形式/保存形式は変更していない。

## 保存・出力・実画面

前回と同じ作品区間を使用した。動画左は作品1.37秒/長112.20秒/元1.10秒、右は115.80秒/100.65秒/元113.30秒。独立音声左は3.13秒/120.44秒/元32.20秒、右は125.80秒/100.92秒/元152.64秒。SDK/WindowsネイティブWebMCPを交互に用いて配置、元位置変更、分割、右片の移動、保存再読込、元尺超過の拒否・保存値不変を確認した。

29.97fps、In15F/Out6893F、720p H264/AAC320000目標値の完成物を全バイト取得し、6,879F/229.52953秒を読み直した。32×18 RGB署名の全フレームを元PTS±1作品Fの候補と比較し、最大MAEは両OSとも1.304977/255（上限8）。400msずらす負例を区別できる地点は179。全解像度の色管理や意味的な音画品質の一般化ではない。

| 環境 | 最終結果 | 出力音声200ms窓 |
|---|---|---|
| Windows、Chrome156.0.8078.80、FFmpeg N-125994-gf944afd040-20260808 | Node1成功・失敗0・skip0 | 有音149窓は差0sample/8kHz、最小相関0.997892。静かな4窓はRMSで確認 |
| Ubuntu WSL、FFmpeg6.1.1-3ubuntu5、SDK/APIのみ | Node1成功・失敗0・skip0 | 有音149窓は差0sample、最小相関0.998368。静かな4窓はRMSで確認 |

今回の窓の最小gainはWin0.984561/Ubuntu0.983699。音量3%の全素材保証やG3-Aの短窓/聴感、別4codec長尺に残る約5%差を解決した意味ではない。静かな窓に測れないlag0を割り当てていない。

Windowsでは保存画面を再読込し、共通seek APIから10時刻を検査。動画がある8時刻は実Canvas画素と元時刻、ない2時刻は非アクティブ状態を確認。UI再生/一時停止で時計の進行も確認。スピーカー録音や手動登録の全経路は未実施。標準MCPは公式SDKの継続stdio、WebMCPは実native registerTool。UbuntuのWeb相当操作はSDKへ流すAPI_ONLYであり、Linuxブラウザー/ネイティブ確認ではない。

成功の[Windows測定](../../qa/long-webm-windows-20261112.json)・[Ubuntu測定](../../qa/long-webm-linux-20261112.json)、[Windowsログ](../../qa/long-webm-windows-final-20261112.log)・[Ubuntuログ](../../qa/long-webm-linux-final-20261112.log)。以前の5F出力と登録入力を維持し、Windowsの修正前長尺完成MP4も追加の保持対象にした。

## 再実行

Windows PowerShell、作業木ルートで実行する。実入力がなければskipであり成功ではない。

```powershell
$env:CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:BAI_REAL_MMD_DATA='D:/BAI/BAI_CREATER_STUDIO/BAI_Creator_Studio/data'
$env:BAI_NATIVE_MIXED_VIDEO='D:/BAI/BAI_CREATER_STUDIO/worktrees/test-temp/native-audio-20261106/native-audio-480p.mp4'
$env:BAI_LONG_VIDEO_FORMAT='webm'
$env:BAI_VFR_INPUT='D:/BAI/BAI_CREATER_STUDIO/worktrees/test-temp/long-webm-20261112/windows-native/real-derived-long-webm.webm'
$env:BAI_VFR_OUT='D:/BAI/BAI_CREATER_STUDIO/worktrees/test-temp/long-webm-20261112/windows-new-run'
$env:BAI_TEST_CONCURRENCY='1'
node tests/run-guarded.cjs tests/studio-v05-long-vfr-real.test.cjs
```

初回入力生成ではBAI_VFR_INPUTを未設定にする。Ubuntuは同じ入力を/mnt/d/...で指定し、BAI_VFR_API_ONLY=1、出力先を別名にしてLinuxのNode/FFmpeg/python3を使用。通常の確認先は`worktrees/test-temp/long-webm-20261112/`。Windowsの制限環境初回は隔離サーバー起動待ちで失敗し、通常権限環境で成功。Ubuntu起動スクリプトの初回CRLF失敗も別ログへ保存した。

形式証拠表は13行。前回MP4行の試験コードhashは、当時のGitコミット3414f8cのコードを指すgitCommitと併記し、現行コードhashと混同しない。

## 残る範囲

次はG3-B2の実映像由来長尺OGV Theora/Vorbis。自然発生VFR/全codec・他FPS/複数動画行・色/実GPU/Linuxブラウザー・全Undo/競合/並行負荷SDK時間切れ原因、G3-A短窓/聴感・別4codec約5%音量差、G3-C〜Fと順3全体は未完了。順4の54発話/候補採用、順5判定、既存証拠ゲート2失敗/依存監査3件も保持する。

モデル区分：高性能（診断・実装・検証）、サブエージェントなし。


## 関連回帰・台帳の検査

Windows/Ubuntuの対象Pythonは各31成功・0失敗・0skip。Windowsの型/Node構文成功。Windows Chromeの関連一括は3成功・1失敗・2任意実素材skipで、WebAudioプレビューの音量採取1窓が失敗した。同じコードの音量試験の単独再実行は1成功・0失敗・1任意実素材skip。一括自体は失敗のまま保持し、原因は未確定。製品MP4の音量判定での失敗ではなく、今回変更した入力FFmpegコマンドはHTMLプレビューの再生には使われない。許容値を変更していない。

既存MP424/60fps・WebM29.97fps・OGV30fps、OGG Vorbis/Opus・FLAC・M4Aの登録/保存/復号/出力、出力MCP/旧版保持の対象は成功。Linuxブラウザーは今回も未実施。[回帰数値](../../qa/long-webm-regression-20261112.json)・[一括ログ](../../qa/long-webm-regression-windows-20261112.log)・[単独ログ](../../qa/long-webm-mix-serial-20261112.log)。

151要件IDのJSON/CSVと6IDの同値追記、既存の12行のdetail差異が増えていないこと、13行全証拠hashと文書リンクを照合した。[台帳検査](../../qa/long-webm-ledger-validation-20261112.json)。実行ガードの作業木data5ファイル/exports不在と、原本/index/旧完成物の前後hashが一致。
