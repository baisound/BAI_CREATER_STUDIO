# G3-A3：新規MP4のAAC境界品質（2026-11-09）

順3、AUDIO-001・RENDER-004/006・DATA-002/008、#81/#39/#63。[G3-A2の対照](AAC_INPUT_LEVEL_DIAGNOSTIC_20261109_JA.md)により、音量を保ったAAC320kb/sはWindows/Ubuntuの200ms54窓で3%以内、256kb/sは未達と確認した。既知の192kb/s境界差に対する必要修正として、既存MP4プリセットの新規出力を320kb/sへ変更する。

## 受け入れ条件

- 元音量加算・保存ミュート・元区間/作品時計・FPS/In/Outを保持する。自動減衰・フェード・新しいミキサー/ユーザー操作は追加しない。
- 新規MP4ジョブへAACの目標320000bit/sを固定し、実エンコードで使用する。capabilityと出力画面で実設定を案内し、音声品質の変更で容量が増えることを伝える。旧完成物・旧履歴は書き換えない。
- 既存実曲+登録MP3を同じ29.97fps作品/元区間/6924Fで製品API・両MCPから出力。既存117安定窓と6境界の前後9位置/200msの54窓で、音量比3%以内・相関0.98超・探索±4sample内の時刻差を検証する。既知210秒窓を必ず含む。
- 短尺の手動ミュート/解除・通常/各種類ミュート/全ミュート・非0In・Chrome実再生PCMを回帰。全ミュートPCM0、解除後の出力一致、原本/index/保存配置と以前の完成物を保持する。
- Windows実Chrome/公式SDK/ネイティブWebMCPとUbuntu SDK/FFmpegを区別する。20/50ms等の短窓・全作品/codecの無劣化・実スピーカー聴感・任意素材の非クリップ保証、G3-A/順3全体は未完了を維持。
- 変更した要件の台帳/試験結果を保存し、検証済みPRをmainへ反映して利用者main/8765/開いている画面を同期する。

音声だけの対照では192→320kb/sで容量が約1.66倍。MP4全体の増分は映像に依存し、旧完成物に作用しない。モデル区分：高性能（原因から必要修正への判断・実装・検証）。


## 実装と結果

AAC_BITRATE=320000を出力の正本とし、新規ジョブのaudio_bitrateへ固定してコマンドへ使用。既存capabilitiesへ同じ読取専用値を返す。画面は現在の目標値と容量増を案内し、完成物に記録がある場合だけAAC値を表示する。旧履歴へ320kを推測で表示しない。録音/EQ/ミキサーや入力倍率の設定は追加せず、amix/元区間/時計は維持した。

Windows実Chrome/SDK/ネイティブとUbuntu SDK/FFmpegで各Node2成功0skip。各OSで通常/種類別ミュート/全ミュート/解除の240F×6、非0In102Fと実曲6924Fを再読込。元のプレビュー実再生PCM/元音量・全ミュートPCM0・解除後の出力hash一致・保存再読込を確認。出力画面に320kb/s/容量増の案内と完成物の目標値が表示されることも確認した。

長尺は既存117安定窓と6境界×9位置/200msの54窓（重複6を除き165窓）を全て測定。Windowsの比0.974189916〜1.000425343、Ubuntu0.971967742〜0.999740817、全窓lag0sample/48kHz、相関はWindows0.998909以上/Ubuntu0.997446以上。既知210秒直後はWindows0.978362/Ubuntu0.974363で3%以内となり、前のUbuntu192kの0.959620の未達をこの代表作品で解消。20/50ms等の短窓や任意曲の品質へ一般化しない。

新しい長尺MP4はWindows9,705,210bytes/Ubuntu9,861,417bytes。旧192kのWindows6,051,745bytes/Ubuntu6,148,648bytesは前後hash一致で保持。原WAV/MP3・索引・保存クリップも不変。以前の完成物は再生成しない。

Windows Python28+5subtests・Ubuntu Python28成功0skip、型検査成功。関連MCP出力/版管理2成功、完成物DLは一括時ERR_NO_BUFFER_SPACEで1失敗、元ログを保持して当該試験だけ単独再実行し1成功（実DL4回/旧版/25履歴/390pxを確認）。最初の一括を合格と扱わない。診断段階のWindows384kb/s未完走はA2に記録し、製品には採用していない。

## 限界と次工程

G3-A3の既知200ms境界差と安定窓は限定修正/検証済み。AACは可逆ではなく、短窓品質・実スピーカー聴感・全codec/全作品・任意素材の非クリップ保証は未確認、G3-Aと順3全体は完成にしない。次はG3-B1で既存の形式/長尺/FPS/OSの証拠表を整理して欠測を確定する。過去の192k証拠は過去の条件として保持し、320kの全面再試験に読み替えない。

## 証拠と再現

qa/aac-320k-{mix,mix-real}-{chrome,linux}-20261109.json、qa/aac-320k-output-20261109.png。MP4/ログはD:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-09-aac-320k/とlinux/。実音声はGitへ追加しない。

node tests/run-guarded.cjs tests/studio-v05-audio-mix-level.test.cjs。BAI_REAL_MMD_DATAは実dataの読取元、BAI_OLD_MIX_OUTは2026-11-08-audio-mix-level、BAI_MIX_OUTは新規確認先。WindowsはCHROMIUM_PATH、UbuntuはBAI_MIX_API_ONLY=1。Pythonはtest_v05_track_audio_mute/test_v05_render_fractional_fps/test_studio_v05_render_range/test_studio_v05_render_namesの4ファイルを-X utf8で実行した。


## mainと表示中画面の同期

A2診断9470ee3、A3実装d0b4665、PR #278、mainc1f5f8b。利用者main/既存開発木をfast-forward。所有コマンドと保存実行中ジョブ0を確認した8765を非表示再起動（62952→75076）。HTTPのHTML/出力JS/WebMCP実バイトがmainと一致し、稼働中APIのaudio_bitrate=320000を確認。data/exports/studio.zipの515ファイルhashと変更一覧は不変（data/logs除外）。

前回タブ1055945512は存在せず、現在のChrome一覧から同URLの開いているタブ1055945654を確認。ホーム/既存作品の状態を確認して再読込し、ホームの表示と新しい音声案内要素の生成を確認、同URLで保持。ホーム上の案内本文は出力タブを準備するまで空であり、320の可視案内は隔離Chromeの製品試験で確認したものと区別する。利用者作品へ試験出力・登録は行っていない。ローカル確認画像logs/aac-320k-studio-synced-20261109.pngを通常確認先へも保存した。

Issue #81コメント6725379382の合成出力画面画像は実表示・1440×900・原画像hash一致。正本qa/aac-320k-main-sync-20261109.json。文書のみの同期PR後は不要な再起動を増やさず最終mainと応答・保全を確認する。
