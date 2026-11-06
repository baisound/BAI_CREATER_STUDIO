# 保存ミュートを試聴とMP4へ接続（2026-11-06）

順3、Issue #81/#39、AUDIO-001/RENDER-006/DATA-002。既存のミュートボタンと保存API/両MCPはあるが、メディアプレビューとMP4グラフが保存値を読まないため、消したはずの音が出る。次の承認済み残件として、音声・楽曲・動画内音声に限って接続する。

## 挙動と保持範囲

- `muted` の `audio` / `music` / `video` に従い、その行に配置したメディアの音だけを消す。動画の映像とシーク/再生時計は維持する。解除時に同じ元位置で音を戻す。
- 元ファイル、クリップID/元位置/長さ、既存のlocked/order/heights/labelsと他のmuted値は保持する。音量設定・新規ミキサー・画像や3Dの表示制御は追加しない。
- UI操作は保存成功後すぐ反映し、API/両MCP等の外部操作は表示中の作品を短周期で読み直して反映する。遅い応答で新しいrevisionを巻き戻さない。再読込・作品切替・ページ終了で前作品の設定や音を持ち越さない。
- MP4は開始時の保存ミュートを固定し、ジョブの公開記録へ対象行/設定revisionを残す。処理中に変更した設定は次のジョブから使う。設定が読めなければ音ありへ黙って戻さず停止する。
- ミュートした音源も既存の原本hash/尺/形式検査へ通す。既存ミキシングの入力数を保ったまま音を0にし、別の音源を勝手に増幅しない。旧完成MP4は保持する。

## 受入れ条件

1. 音声・楽曲・音声付き動画を同じ隔離作品へ非0開始/元位置つきで置く。各行のON/OFF、全部ミュート、解除、保存再読込とクリップ不変を確認。
2. 実ChromeのHTMLMediaElement.muted、再生/シーク時刻と動画画素を観測。手動ボタン、公式SDK継続セッションとChromeネイティブWebMCPを同じ保存APIで照合する。スピーカーの実音/聴感とDOM検査は区別する。
3. 29.97fpsの完成MP4を再読込し、異なる周波数の3音源が選択した行だけ消え、他音源の強さと動画画素/全フレームを維持することをPCMで測る。全ミュートはAACトラックを含む無音。
4. 処理中に保存値が変わっても開始時の設定が固定され、次の出力が新設定を使うことを確認。古いrevision/不正トラックは拒否し保存不変。
5. 対象Python/Node/Chromeを実行し、Windows/Ubuntu、実素材の追加確認と未検証を分ける。利用者dataと入力hashを保持する。

モデル区分：高性能（原因確認・接続判断・実装・検証）。

## 結果

Windows：対象Python28成功・5 subtests成功、公式SDK/実Chrome156ネイティブWebMCPを含む通し2成功・skipなし、既存の手動画像行/動画内音声/完成物ダウンロード3成功、型検査/JS構文成功。完成物一覧の開始時ミュート表示を追加確認した再実行は1成功・実曲重複を避けた1skip。Ubuntu WSL：Python28成功、公式SDK/FFmpegの同じ通し2成功・skipなし（ブラウザーは実行していない）。

440/660/880Hz、44.1/48/32kHzの音声付きMP4/独立WAV/楽曲WAVを、29.97fps・作品開始0.5秒/元位置0.25秒で重ねた。6本の105F MP4を復号し、各行のミュート、全ミュート、解除を確認。Windowsの有音振幅は約723.9、消した周波数は最大0.005未満、全ミュートは0。解除後のMP4は最初の未ミュート出力と全バイト/hash一致。残した音源の強さの差は最大0.024未満で、動画の赤画素も保持した。設定変更直前に投入したジョブは旧設定で完了し、次のジョブは新設定になった。

既存の登録実曲230.2秒も原本を隔離複製して、開始1.1667秒、29.97fps/6,935Fでミュート/解除の2本を出力。ミュート後の復号PCMはWindows/Linuxとも全サンプル0。解除後46窓の元曲との位置差は最大2sample/8kHz（0.25ms）。最小相関はWindows0.99939、Ubuntu0.99721。元曲と利用者索引のhash/全バイトは前後一致した。

手動ボタン・外部SDK・ネイティブWebMCPの変更は、表示中のミュート状態/ボタン/HTMLMediaElement.mutedへ反映。再生とシークの時計、再読込・他作品への切替、古い応答を無視する動作、古いrevision/不正行の保存拒否とクリップ不変を確認した。設定破損は出力を拒否し、旧形式でmutedが無い場合は未ミュートとして扱う。

先行試行では、画面の行ボタン再描画を待たずに検査して失敗し、外部で作成した別作品の一覧再取得不足でも試験が停止した。試験の待機/再読込を直した。その後の全機能を通った試行も、既知のChrome `ERR_NO_BUFFER_SPACE` 1件で失敗したため、ログを保持して再実行した。最終試行はブラウザーエラー検査を含め成功。失敗を成功件数へ含めない。

## 証拠と再実行

[Chrome/両MCP/6本PCM](../../qa/track-audio-mute-chrome-20261106.json)、[Ubuntu/SDK/6本PCM](../../qa/track-audio-mute-linux-20261106.json)、[Windows実曲](../../qa/track-audio-mute-real-win-20261106.json)、[Ubuntu実曲](../../qa/track-audio-mute-real-linux-20261106.json)、[実画面](../../qa/track-audio-mute-ui-20261106.png)。動画と詳細原本は `D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-06-track-audio-mute/`、Linux成果物はその `linux/`。Eagleへ追加コピーしない。

Windows：`CHROMIUM_PATH` をインストール済みChromeへ、`BAI_NATIVE_WEBMCP=1`、`BAI_TEST_CONCURRENCY=1`、`BAI_REAL_MMD_DATA=<利用者data>` を指定し、`node tests/run-guarded.cjs tests/studio-v05-track-audio-mute.test.cjs`。`BAI_MUTE_OUT` は任意の通常確認先。実素材環境変数が無ければ実曲ケースだけskipする。

Ubuntu：同じ実曲dataの読み取りパスと `BAI_MUTE_API_ONLY=1` を指定して同じNode試験。Pythonは両OSで `python -X utf8 -m pytest -q tests/test_v05_track_audio_mute.py tests/test_v05_track_layout.py tests/test_v05_render_fractional_fps.py tests/test_studio_v05_render_names.py`。既存のNode回帰は `studio-v05-media-render`、`studio-v05-direct-timeline`、`studio-v05-render-downloads` の3試験。

## 操作と制限

タイムラインの音声/楽曲/動画行の［音］を押すと［消］になり、音だけをミュートする。解除は同じボタン。動画の映像は残る。外部API/両MCPの変更は表示中の画面へ約2秒周期で反映する。完成物一覧の「開始時の音声ミュート」で、その動画を作った設定を確認できる。

既存 `bai_studio_track_layout_get` / `bai_studio_track_flags_set` と既存POST `/timeline/flags` を使い、入力形式は変えない。ジョブの公開結果へ `audio_settings.layout_revision` と `audio_settings.muted_tracks` を追加した。処理中の変更は次の出力から使う。ミュートした音源も従来どおり存在/尺/形式/hashを検査し、欠損を隠さない。

今回の合格は音のON/OFFと保存・時刻保持。スピーカー実音のloopback/聴感、Linuxブラウザー/ネイティブWebMCP、全codec/全実作品は未検証。従来のブラウザーとMP4の混音音量の一致、音量フェーダー、ミキサー、行操作全体のUndo/Redo、複数動画/音声行の増設は未完了。画像/3D/動作行に残るmuted値は変更せず、この音声ミュートの作用対象には含めない。順3全体と広いIDを完成にしない。

## mainと制作画面の同期

実装・試験 `a50c566`、[PR #260](https://github.com/baisound/BAI_CREATER_STUDIO/pull/260)、mainマージ `93bb508`。手元mainと開発codex/nextをfast-forwardした。利用者515ファイルの集約SHA-256 `89b7599826236e16936fcb87ea33d705d29801d3515c1d8e78474896cfe4286d` と変更一覧は前後一致。

管理下のmain/server.pyの8765番PID51268と処理中ジョブ0件を確認し、最新mainのPythonで非表示再起動（PID31492）。HTMLと変更した4スクリプトの全バイトがmainと一致し、Chromeでも新しい `audioSettingsReady` と保存revisionの読込を確認。利用者作品に試験用ミュートを保存する操作はしていない。

[Issue #81の結果と画面画像](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81#issuecomment-6681376162)は実Chromeで1440×900pxの表示と画像hash一致まで確認済み。画像は隔離生成の赤動画/トーン素材のみ、秘密・個人情報・実曲/歌詞・EXIFなし。GitHubの書込み連携403は既存認証CLIで記録し、自動checksの登録が無いこともローカル検証と区別する。[同期の数値](../../qa/track-audio-mute-main-sync-20261106.json)。
