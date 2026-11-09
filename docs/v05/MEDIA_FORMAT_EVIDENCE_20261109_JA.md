# 順3 G3-B1：形式・長尺・FPS・OS別の証拠（2026-11-09）

Issue [#81](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81)/[#37](https://github.com/baisound/BAI_CREATER_STUDIO/issues/37)、DATA-016・DATA-002/008・AUDIO-001・RENDER-001/006。基点main `d64f71a`、開始 `d0719c9`。承認済みの順3にある既存証拠の照合と、現行AAC320kb/sでの限定回帰。製品の対応形式・音量・時計・画面・保存形式は変更していない。

**短尺VFRと長尺CFRは確認済みだが、長尺VFRを通した証拠はない。** 今回、動画3形式の短尺と音声4codecの短尺/長尺を現行320kb/sで確認した。G3-B1の証拠整理は完了、G3-Bと順3全体は未完了。次はG3-B2の長尺VFRと元区間を検証する。

[機械可読の11行の表](../../qa/media-format-evidence-matrix-20261109.json)には、各行の入力由来・長さ・FPS・出力音声目標値・環境・操作入口・観測値・未確認範囲と、参照ファイルのGit保存内容（LF）のSHA-256を持たせた。Windows作業ツリーのCRLFをLFへ正規化して照合する。以下の成功は記載した入力/操作の範囲に限る。空欄を成功で埋めず、拒否を形式対応へ読み替えない。

## 形式と長さ

192k/320kは出力時に指定したAAC目標値。圧縮後の実平均値がこの数値に一致する意味ではない。変更前の192k結果は元時刻/保存/画素の証拠として残し、現行320kで再出力した結果と区別する。

| 証拠の行 | 入力・由来 | 長さと作品FPS | 出力AAC/環境 | 観測した範囲・正本 |
|---|---|---|---|---|
| VFR-SHORT-192 | 生成MP4 H264/AAC・WebM VP9/OpusはVFR、OGV Theora/Vorbisは固定20fps | 入力4秒/出力2.8秒、24・29.97・60・30fpsの4条件 | 192k/Windows Chrome・HTTP | 全403Fの元PTS明暗±1F、12 PCM窓は1F以内。[記録](VIDEO_FORMATS_VFR_20261106_JA.md) |
| VIDEO-SHORT-192 | 既存実登録Kenney MP4＋生成MP4/WebM/OGV、VFRはWebM | 入力各3秒/同一作品7.5秒、30fps | 192k/Windows・Ubuntu | 225F/非0In215F、元区間・空白・映像/音声。[Windows](../../qa/video-formats-chrome-20261108.json)・[Ubuntu](../../qa/video-formats-linux-20261108.json) |
| VIDEO-SHORT-320 | 上と同じ構成を現行条件で再実行 | 225F/215F、30fps | **320k/Windows・Ubuntu** | 各OS6 PCM窓と形式別45F、非0In全215Fの明暗比較。[Windows](../../qa/media-evidence-320k-video-chrome-20261109.json)・[Ubuntu](../../qa/media-evidence-320k-video-linux-20261109.json) |
| VIDEO-LONG-192 | 元からAACを持つ実4K動画の480pコピー＋別実曲。別対照はAAC44.1kHzを付けた派生動画 | 入力214秒/出力約229.5秒、Windows24・29.97・60fps、Ubuntu29.97fps | 192k/Windows Chrome・HTTP、Ubuntu HTTP | 実動画のPCM窓はWin351/Ubuntu117地点で差0sample。派生対照込み旧計940地点。[記録](LONG_MIXED_AUDIO_20261106_JA.md)。今回のPTS照合で**固定30fps**と確定 |
| VIDEO-LANES-192 | 同じ実動画＋生成した上段動画 | 入力214秒/6421F、29.97fps | 192k/Windows・Ubuntu | 2行の切替・保存と9音声窓。[Windows](../../qa/video-lanes-real-win-20261106.json)・[Ubuntu](../../qa/video-lanes-real-linux-20261106.json) |
| MP3-192 | 実登録MP3約14秒＋実WAV由来の長尺MP3 44.1/48kHz | 長尺の元WAV約230秒、24・29.97・60fps | 192k/Windows・Ubuntu | 各OS7出力/733 PCM窓、最大1sample差。原録音MP3と派生長尺はrawのkindで区別。[Windows](../../qa/mp3-timeline-real-win-20261106.json)・[Ubuntu](../../qa/mp3-timeline-real-linux-20261106.json) |
| AUDIO-4CODEC-192 | OGG Vorbis44.1k・Opus48k、FLAC32k、M4A AAC48k。生成チャープと実WAV派生 | 短尺各6.35秒→899F/818F、長尺5619F/約187.49秒、29.97fps | 192k/Windows・Ubuntu | 短尺30 PCM窓/OS、長尺92窓/OS。[元記録](AUDIO_FORMATS_20261108_JA.md) |
| AUDIO-4CODEC-320 | 上と同じ4codec・保存構成を現行条件で再実行 | 899F/818F/5619F、29.97fps | **320k/Windows・Ubuntu** | 短尺30窓/OSはlag0、長尺92窓/OSは最大1sample差。[Win短尺](../../qa/media-evidence-320k-audio-chrome-20261109.json)・[Ubuntu短尺](../../qa/media-evidence-320k-audio-linux-20261109.json)・[Win長尺](../../qa/media-evidence-320k-audio-real-chrome-20261109.json)・[Ubuntu長尺](../../qa/media-evidence-320k-audio-real-linux-20261109.json) |
| MIX-320 | 短尺WAV/MP3/動画内AAC、長尺は実登録WAV＋MP3 | 短尺240F/102F、実曲6924F、30/29.97fps | 320k/Windows・Ubuntu | ミュート6設定と実曲165固有200ms窓/OS（境界54含む）。長尺に動画内AACを含めた証拠ではない。[記録](AAC_320K_BOUNDARY_FIX_20261109_JA.md) |
| IMAGE-192 | 既存CC0 WebP＋新規PNG/JPEG/WebP/BMP、透過・EXIF6・縦長 | 450F/390F、30fps | 192k/Windows・Ubuntu | 21時刻で画素照合。画素証拠を維持、同じ画像構成の320k再出力は今回なし。[記録](IMAGE_FORMATS_20261108_JA.md) |
| REFUSALS | 音声のみ/カバーのみMP4・WebM・OGV、旧登録を模したMOV/EXR、GIF/AVIF | 短尺、30fps | 動画320k・画像は旧192k/Windows・Ubuntu | 理由付き拒否・旧完成物/index/配置保持。MOV等への対応追加ではない。[Win動画](../../qa/media-evidence-320k-refusals-chrome-20261109.json)・[Ubuntu動画](../../qa/media-evidence-320k-refusals-linux-20261109.json)・[画像](IMAGE_FORMATS_20261108_JA.md) |

## 操作入口と証拠の再利用

| 対象 | Windowsで今回観測 | Ubuntuで今回観測 | 推定しない範囲 |
|---|---|---|---|
| 短尺動画3形式 | 手動一括登録、ChromeのMP4/WebM実画素/シーク、SDK/ネイティブ配置・編集・保存再読込・出力 | API登録、公式SDKによる同じ作品/元区間/全域・非0In出力 | Ubuntuの手動UI/ブラウザー、OGVのChrome映像再生 |
| 短尺音声4codec | 手動一括登録、実波形、AudioContext復号/実再生、SDK/ネイティブ配置・分割・元区間、保存/出力 | API登録、公式SDKの編集/保存/出力 | スピーカー聴感・全Undo/Redo/ロック/競合。これらはG3-Cと区別 |
| 長尺音声4codec | SDK配置・保存値再取得、ネイティブ出力開始、公式SDK監視・完成物取得、PCM照合 | SDK/API・FFmpeg/PCM照合 | 長尺ケースでの手動タイムライン編集/プレビュー再生。短尺の成功を長尺へ拡張しない |

旧長尺のFPS試験、短尺VFR、画像、MCP版管理・失敗回収・3Dの証拠を毎回一括再実行しない。3D/保存静止カメラの長尺は[順3の現在位置](../roadmap/CURRENT_POSITION_AND_TASKS_20261108_JA.md)と[既存の3D試験契約](SCENE_STREAM_CAPTURE_20261106_JA.md)で継続管理し、2D形式表の合格と混同しない。各媒体の全Undo/Redoや失敗回収はG3-C/Dで個別照合する。

## 今回の検証

`tests/studio-v05-video-format-policy.test.cjs` と `tests/studio-v05-audio-formats.test.cjs` の新規ジョブに320000目標値を検査し、出力フレーム数/hashとともに測定JSONへ保存した。これで192k時代の結果から現行条件を推定する必要がなくなる。

Windows初回は**3成功・1失敗**。音声プレビューを再構成する間に要素が見つからず、試験の`e.src`参照で失敗した。空の一覧でも`every()`がtrueになる待機を非空条件へ直し、各素材の読み込みは再試行できるlocatorとmetadataを待ってから測定した。製品の音声欠落が再現したという判定はしていない。音声の最終再実行は**2成功・0失敗・0skip**（約53秒）。初回の動画2成功は保持し、同じ長尺音声の成功を足して5ケースと数えない。Windowsで成功を確認した固有ケースは4件。

Ubuntu WSLは**4成功・0失敗・0skip**（約123秒）。Windowsの待機修正前に始めたAPI_ONLY試験で、ブラウザー待機を通らない。両OSともガード対象data5ファイル/exports不在と入力・元indexの前後一致を確認した。[Windows初回ログ](../../qa/media-evidence-g3b1-win.log)・[Windows音声再実行](../../qa/media-evidence-g3b1-audio-win-final.log)・[Ubuntuログ](../../qa/media-evidence-g3b1-linux.log)。型・構文・JSON/CSV・証拠ファイルの参照/hash・差分を別に検査する。製品コード変更がないため、無関係なPython全件再実行は行っていない。

動画の内包音声6窓/OSは1作品F以内。音声4codec長尺は各92窓で最大1sample差/48kHz。これは時刻と代表窓の確認で、全サンプル完全一致やAACの主観品質ではない。元動画コピー6420Fの全PTSは0〜213.966667秒、間隔0.033333〜0.033334秒（表示丸め差1µs）だった。VFRの根拠に`avg_frame_rate`と`r_frame_rate`の差だけを使っていない。

音声4codec長尺の91.4秒窓には音量差が残る。今回の最小比はWindows **0.955042**、Ubuntu **0.950106**（それぞれ約4.50%/4.99%低下）。旧192kの同じ窓は0.952049/0.944269だった。形式試験の既存条件は相関>0.97・音量差7%以内であり、その成功をG3-Aの限定実曲試験の3%条件へ広げない。一般の音量品質は未完了を維持し、原因をこの照合だけで入力振幅やcodecへ断定しない。製品を自動減衰したり合否条件を緩めたりしていない。

再実行は次の通り（Windows PowerShell、作業ツリーのルート）。書込みは別ポート/隔離データと通常確認先のみ。

```powershell
$env:CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:BAI_REAL_MMD_DATA='D:/BAI/BAI_CREATER_STUDIO/BAI_Creator_Studio/data'
$env:BAI_VIDEO_OUT='D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-09-media-evidence'
$env:BAI_FORMATS_OUT=$env:BAI_VIDEO_OUT
$env:BAI_TEST_CONCURRENCY='1'
node tests/run-guarded.cjs tests/studio-v05-video-format-policy.test.cjs tests/studio-v05-audio-formats.test.cjs
npm run typecheck
```

UbuntuはLinuxのNode/FFmpegを使い、`BAI_VIDEO_API_ONLY=1`・`BAI_FORMATS_API_ONLY=1`を追加し、入力/出力を`/mnt/d/...`へ直す。出力先末尾は`/linux`。動画試験のポートはWindows9236/Ubuntu9237、音声は9214/9215。利用者の8765や原本へ保存しない。通常納品先は上記フォルダー、MP4とPNG・測定JSONを保持し、原本をGitや外部へ投稿しない。

## 次のG3-B2：長尺VFRと元区間

最初の代表ケースは、**既存214秒CFRコピーから隔離生成した、実映像由来のVFR MP4＋元AAC＋別実曲、29.97fps、現行320k**とする。短尺生成時計と長尺CFRの証拠の間を埋める。元からVFRだった実録画の代用合格にはしない。WebM/OGV長尺を同時に足さず、まず一つの欠測組合せを判定する。

1. 原本・コピー・index・旧MP4のhashを記録。映像をVFRへ派生し、内包AACはpacket/PTSを保持して照合する。登録上限400MiBは変えない。
2. 全映像PTSと異なる表示間隔を実測し、非0元位置/非0配置・分割/移動・保存再読込・非0Inで200秒以上のMP4へ出す。
3. 元PTSに基づく実フレームの画素参照を作り、先頭/中間/末尾/切替境界を±1作品Fで比較。出力F数、元区間、PCMの1F以内の時刻差と無音窓を検査する。
4. Windows Chrome/公式SDK/ネイティブとUbuntu SDK/APIを分け、原本/index/旧完成物保持、失敗・未確認を記録。必要な不具合が再現した場合だけ既存要件の経路を修正する。

自然発生した長尺実VFR、長尺WebM/OGV、現行320kの他FPS・複数動画行、Linuxブラウザー/実GPU/全codec、G3-A短窓/聴感とG3-C〜Fは残る。順4の54発話/候補最終採用、順5判定、既存証拠ゲート2失敗/依存監査3件も維持する。要件や優先順位は変更していない。

モデル区分：高性能（証拠照合・試験・判定）、サブエージェントなし。

証拠/試験コミット `2ce37c4`、[PR #280](https://github.com/baisound/BAI_CREATER_STUDIO/pull/280)。元PTSの[測定値と現存コピーhash](../../qa/media-evidence-native-pts-20261109.json)も正本へ保存した。型/構文・151ID順/既存12差異保持・11行の参照/hash・各出力/PCM/保持を検査成功。


## G3-B1のmain・制作画面同期

PR #280をmain2637f34へ統合。手元main/codex-next/作業木をffし、8765のPID75076の起動元、HTML/render-job-v69.js/webmcp.jsの全バイト一致・音声目標320000を確認。製品Python/JS/HTMLの変更はないため再起動/制作画面再読込なし。CUAで既存Chromeタブ1055945654のホームと2作品表示を確認し保持。利用者data/exports/studio.zipの515ファイルと変更一覧は前後一致（集約hash89b7599826236e16936fcb87ea33d705d29801d3515c1d8e78474896cfe4286d）。

[同期数値](../../qa/media-evidence-main-sync-20261109.json)。[Issue結果](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81#issuecomment-6740056657)の4枚はGitHub HTMLのimg要素と配信PNGのhash一致を確認（ブラウザー上のGitHubレイアウト検査ではない）。8765の文書URLは404だったため、初回Issue投稿の「文書も全バイト一致」を「制作画面HTML/JSの一致」へ訂正した。文書はローカル正本/GitHubで参照する。自動checksの登録はなく、ローカル試験と区別する。次は上記G3-B2、約5%の音量差・順3全体/順4/5の残件を保持。
