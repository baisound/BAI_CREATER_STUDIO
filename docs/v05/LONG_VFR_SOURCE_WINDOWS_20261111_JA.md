# G3-B2：長尺VFRの元区間・分割境界の同期（2026-11-11）

順3、Issue [#81](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81)/[#37](https://github.com/baisound/BAI_CREATER_STUDIO/issues/37)/#63/#39、DATA-016/002/008・AUDIO-001・RENDER-001/006。基点main `3639dc7`、開始 `0b21686`。次の未確認ケースとして、実映像由来の長尺VFR MP4を検証した。**この代表ケースは成功。製品コードの修正は不要だった。G3-B/順3全体は未完了。**

## 入力と保持

自然発生した実録画のVFRではなく、以前確認した214秒の実動画480pコピーから作る隔離派生入力。元コピーは854×480・固定30fps、SHA-256 `c895d1da79dfddb4c93210b778b74d727be225ac5c07a2c5d6c5a399093f89d6`。元4K動画の直接登録/再検証ではなく、400MiB上限は変更していない。

映像は12枚ごとの0/1枚目と末尾を選び、元PTSを保ってH264/CRF18へ再圧縮。音声は`-c:a copy`で保持した。生成物は47,725,009 bytes、SHA-256 `4294f4f5b680dafd823d4a2d094608c509368fe228eff799561178376b5d1bbd`。全1,071FのPTSは0〜213.966667秒、表示間隔0.033333〜0.366667秒。`avg_frame_rate`の値だけでVFRと判定していない。

元AACの全10,033パケットを、payload SHA-256・PTS・DTS・duration・sizeまで各OS内で比較し一致した。Windowsの生JSON署名は `ec6599d7d5f13039f2b0a09ce6ace316dec811b2e222d87d6cd02c2ff2752772`。Windowsで作った同じVFRファイルをUbuntuにも読み取り専用で渡し、OS間で別の入力を作っていない。

FFmpeg版をまたぐ生JSONの署名は同一ではない。末尾1パケットをWindowsはduration1024/破棄余白768、Ubuntuはduration256と報告する。payload/PTS/DTS/sizeは一致し、durationからdiscard_paddingを引いた比較では4表（各OSの元/VFR）全てが一致した。[差分行と正規化結果](../../qa/long-vfr-aac-normalized-20261111.json)。この表現差を時刻ずれや再圧縮と誤認しない。

別曲は既存登録WAV（SHA-256 `201f379be031b89245b4c5dbca039c1b29adb85d80307cb91e08dee66ccfdd0c`）。元コピー/実曲/index/同じVFR/前回の完成MP4のhashを前後比較。試験の登録先・作品・出力は別ポート/一時BAI_DATA_DIRのみ。原動画・実曲・完成MP4・画素はGitや外部サービスへ投稿せず、数値と試験コードだけを正本へ保存した。

## 保存した区間と操作

29.97fpsの一つの作品で、青画像を232秒置き、先に5Fの完成MP4を作って保持対象にした。その後SDK/WindowsネイティブWebMCPを交互に使い、以下を保存・読み直した。

| 片 | 作品開始 | 長さ | 元位置 | 操作 |
|---|---:|---:|---:|---|
| 動画左 | 1.37秒 | 112.20秒 | 1.10秒 | 元0以外へ変更し、作品113.57秒で分割 |
| 動画右 | 115.80秒 | 100.65秒 | 113.30秒 | 分割後の右片を2.23秒後へ移動 |
| 独立音声左 | 3.13秒 | 120.44秒 | 32.20秒 | 作品123.57秒で分割 |
| 独立音声右 | 125.80秒 | 100.92秒 | 152.64秒 | 分割後の右片を2.23秒後へ移動 |

動画の元位置を214秒へ超過させる変更は拒否され、保存値不変。新しい完成後も最初の5Fの不変ファイルを取得でき、hash一致した。既存の元PTSを保つ映像処理と、動画内音声の相対時計をそのまま使い、音量/フェード/時計/対応形式を変更していない。

## 判定方法と結果

In15F、Out6893Fの非0範囲を720p H264/AAC320000目標値で出力。両OSとも**6,879F・229.52953秒**を完成物から読み直した。ジョブに固定された音声目標値、登録入力hash、ダウンロードした全バイトのhashも照合した。

映像は元VFRの全PTSと32×18 RGBの画素署名を独立に抽出。保存区間から各出力Fの元時刻を計算し、±1作品Fに重なる全表示区間を候補として比較した。6,879Fすべての最小MAEは両OSで最大 **1.337385/255**（試験上限8）。400msずらした参照なら上限を超える地点が179あり、変化のない画面だけで成功したわけではない。低解像度署名の一致を、全解像度の色/画質の忠実度や意味的な音画同期の全F保証には広げない。

音声は動画AACと別WAVを8kHz/mono PCMへ別々に復号し、保存した左右片の元位置・作品位置・無音区間から参照を構成。2秒間隔と全開始/終了/分割・再開境界の前後を含む200ms窓を±2F探索し、時刻差1F以内・相関>0.97を条件にした。

| 環境 | 成功件数 | 完成物/画素 | PCM153窓の内訳 |
|---|---|---|---|
| Windows、Chrome156.0.8078.80、FFmpeg N-125994-gf944afd040-20260808 | Node1成功・0失敗・0skip（最終単独約68秒） | 6,879F、最大MAE1.337385 | **有音149窓は差0sample**、最小相関0.997879。無音/静かな4窓はRMSで確認し、測れないlagを0としていない |
| Ubuntu WSL、FFmpeg6.1.1-3ubuntu5、SDK/APIのみ | Node1成功・0失敗・0skip（約96秒） | 同じ6,879F/最大MAE | **有音149窓は差0sample**、最小相関0.997850。静かな4窓はRMSで確認 |

今回の窓の最小音量比はWindows0.991097/Ubuntu0.984009。音量3%条件を今回の合否へ追加したものではなく、別の4codec長尺に残る約5%差やG3-Aの短窓/聴感を解決した意味ではない。

Windowsでは画面再読込後、共通のプレビューseek APIから作品1.5/40/113.4/114.5/115.9/124.2/126.4/200/216.2/228秒付近へ移動。動画がある8時刻は実Canvas画素と元区間を照合し最大MAE4.482639、動画がない2時刻は非アクティブの区間として記録。200秒からはUIの再生/一時停止を押し時計の進行も確認した。手動シークボタンやスピーカー録音、手動登録の全経路の再試験ではない。

標準MCPは公式Client/StdioClientTransport、Windowsは実`document.modelContext.registerTool`がnative関数のChromeで配置/編集/分割/出力を実行。Ubuntuの`web`相当呼出しはSDKへ渡すAPI_ONLYであり、LinuxネイティブWebMCP/ブラウザーを試したとは扱わない。

両OSとも既存の非整数FPS Python試験10成功・0skip。Windows型/Node構文・JSON/CSVと参照/hash検査も実施。ガード対象data5ファイル/exports不在と入力/index/旧完成物は前後一致。

## 先行失敗を保持

- Windows初回：確認先フォルダーを作る前のコピーでENOENT。試験の保存順を修正。AACパケット照合はそこまで成功したが、全体は失敗。
- Windows2回目：Canvasの既定縮小とFFmpeg areaの違いが混ざりMAE16.889。元解像度Canvasから画素を平均する測定へ直し、最終プレビューを確認。製品の映像不具合と判定していない。
- Windows3回目/Ubuntu初回：作品133.333333秒の比較候補から元130.8秒の短い表示区間を落とした。実出力はこの元フレームとMAE0.799190で一致し、時刻差は1F以内。3点だけの参照抽出を全候補へ修正し、許容1F・上限MAE8は緩めなかった。[保存済み出力の切分け](../../qa/long-vfr-pixel-diagnostic-20261111.json)。RGB/gray/Yの比較から、色の違いを原因と断定していない。
- Windows4回目：Ubuntu長尺とPython回帰の並行実行中、標準MCPのジョブ取得が12秒で時間切れ。未完走を成功に数えず、同じ最終コードの単独再実行で完走した。並行負荷での時間切れの原因は未確定、MCPの製品timeoutは変更していない。

最終試験は[Windows測定JSON](../../qa/long-vfr-windows-20261111.json)・[Ubuntu測定JSON](../../qa/long-vfr-linux-20261111.json)、[Windowsログ](../../qa/long-vfr-win-serial-20261111.log)・[Ubuntuログ](../../qa/long-vfr-linux-final-20261111.log)。全ての先行ログも同じqaの`long-vfr-*-20261111.log`へ保持した。Windows完成物SHA-256 `6cd186de1b358f7ba9caac8c94e2586054f74fba5b639252c1d9b9d0f61e71d0`、Ubuntu `1ba2a93e0ddbc3fc039f50c252a26894c1560d0c34f1f9cc220f293cd643a162`。

## 再実行

Windows PowerShell、作業ツリーのルートで実行する。

```powershell
$env:CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:BAI_REAL_MMD_DATA='D:/BAI/BAI_CREATER_STUDIO/BAI_Creator_Studio/data'
$env:BAI_NATIVE_MIXED_VIDEO='D:/BAI/BAI_CREATER_STUDIO/worktrees/test-temp/native-audio-20261106/native-audio-480p.mp4'
$env:BAI_VFR_OUT='D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-11-long-vfr/windows-new-run'
$env:BAI_TEST_CONCURRENCY='1'
node tests/run-guarded.cjs tests/studio-v05-long-vfr-real.test.cjs
python -X utf8 -m pytest -q tests/test_v05_render_fractional_fps.py
npm run typecheck
```

入力がなければNode試験はskip。生成済み同じVFRを再利用するときは`BAI_VFR_INPUT`へそのファイル、既存完成物を追加保護するときは`BAI_VFR_PREVIOUS_OUTPUT`へMP4を指定する。両方とも前後hashを比較し、書き換えない。初回生成分を含む通常確認先は`D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-11-long-vfr/`。`windows-first/windows/windows-third/windows-final`は先行失敗、`windows-serial`と`linux-final`が最終成功。

Ubuntuは同じ試験をLinuxのNode/FFmpegと`python3`で実行。入力は`/mnt/d/...`へ直し、上記の同じVFRを指定、`BAI_VFR_API_ONLY=1`を追加し出力先を分離する。Windows9240番/Ubuntu9241番。8765へ試験データを保存しない。

## 次の位置

G3-B2の最初の代表ケース（実映像由来・MP4 VFR/元AAC・別WAV・29.97fps/320k）は検証済み。次の形式別長尺ケースは**実映像由来のWebM VP9/Opus**で、元PTS/分割/保存/非0In/画素/PCMと保持を同じ契約で照合する。OpusはAACパケット同一性を要求せず、変換前後の音声時刻と測定根拠を区別する。

自然発生した長尺VFR、長尺WebM/OGV、他FPS/全codec/複数動画行・色管理/実GPU・Linuxブラウザー・全Undo/競合・並行負荷時のSDK時間切れ・G3-A短窓/聴感と約5%音量差、G3-C〜F、順3全体は未完了。順4の54発話/候補採用・順5判定・既存証拠ゲート2失敗/依存監査3件も維持する。

モデル区分：高性能（比較設計・試験実装・検証）、サブエージェントなし。

証拠/試験コミット `3414f8c`、[PR #282](https://github.com/baisound/BAI_CREATER_STUDIO/pull/282)。12行の証拠はこのGit保存内容のSHA-256で照合。AAC末尾は両OSでdurationの報告形が異なるが、破棄余白を引いた4表は一致。
