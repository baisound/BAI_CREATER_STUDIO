# 容量境界とサーバー停止後の復旧（2026-11-06）

対象: v0.5順3、Issue [#81](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81)、`RENDER-001/006`。PR #242はレビュー後、開発ブランチ`codex/next`へ`e5cc23a`で統合し、ローカルの開発ブランチも早送りした。mainへの統合ではない。

## 利用者に見える変更

Windowsで書き出し中にサーバーを強制終了しても、登録済み素材と以前の完成MP4を保持する。再起動後に書き出し履歴を読むと、中断したジョブと一時ファイルの回収結果を表示する。新しい書き出しを開始して再試行できる。中断したフレームからの自動継続は行わない。

## 実装と境界

- Windowsではジョブごとに名前なし・非継承のJob Objectを作り、`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`を設定する。描画Node、その配下のChrome、FFV1エンコーダー、最終FFmpeg、ジョブ内の再読込ffprobeを所属させる。通常終了時とサーバー強制終了時のハンドル解放で対象を終了する。所属に失敗した場合も起動したプロセスを止めてジョブを失敗にする。仕様の根拠: [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)。
- `Popen`からJob Objectへの所属までの短い時間は原子的ではない。所属直前にサーバーが停止する瞬間まで保証した試験ではない。別途起動した利用者のブラウザーや8765番サーバーは対象にしない。
- 一時領域の削除は、検証済みUUIDの`jobs/<id>.frames`と`files/<id>.part.mp4`だけ。解決後のパスを確認し、外部へのjunction/symlinkは削除せず回収保留とする。ロック中は保留を記録し、次の履歴読込で再試行する。原本、確定済みMP4、旧版MP4、診断ログは削除しない。
- 旧版の確定済み索引・hash照合による既存の確定復旧を先に試す。未確定の出力を中断ジョブからダウンロード可能にしない。実行中のジョブは回収対象から外す。
- 上限は引き続き720p・36,000F・600秒・3D可逆中間動画2,147,483,648 bytes。時間・フレーム超過は開始前、容量超過は描画中と描画終了時に拒否する。容量は200ms間隔で監視するため書込みが境界で厳密停止するという意味ではない。
- 全フレーム再読込の制限時間は、3D中間動画を最大120秒から`max(120, min(1200, 出力秒数×2))`へ、完成MP4を最大60秒から`max(60, min(1200, 出力秒数×2))`へ変更。全フレーム数・形式・寸法を照合する検査は維持する。

## 試験契約と実行結果

Windows、Python 3.12、インストール済みChrome `C:/Program Files/Google/Chrome/Application/chrome.exe`、ローカルFFmpeg/ffprobe、隔離`BAI_DATA_DIR`を使用。合成GLBと付属画像を使い、利用者の素材・稼働サーバーへ書き込まない。

| 試験 | 結果・判定範囲 |
|---|---|
| `python -X utf8 -m pytest -q tests/test_v05_render_recovery.py tests/test_studio_v05_render_names.py tests/test_v05_capture_process_cleanup.py` | 15成功、5 subtests成功。2GiB-1/同値を許可、+1 byteを拒否。実FFmpegと制御したPNG生成プロセスを1024 bytesの試験上限で停止し、一時領域回収・旧出力保持を確認。実Windows所有親の強制終了後、子・孫プロセスのOSハンドル終了を確認。ロック保留と再試行、junction保護、実行中ジョブ保護、ffprobe相当プロセスの時間切れ回収も確認。 |
| `node tests/run-guarded.cjs tests/studio-v05-render-restart.test.cjs tests/studio-v05-media-render.test.cjs` | 最終変更後2成功・0失敗・0スキップ。APIで36,001F/600秒超を拒否、36,000F/600秒を許可。描画中と最終エンコード中の隔離サーバーを強制終了し、再起動・中断表示・一時領域回収・旧MP4 hash保持・新規10Fジョブ成功・画面の履歴表示を確認。 |
| `BAI_TEST_REAL_SCENE_CAPACITY=1`で容量超過のPython試験1件 | 1成功・0失敗・0スキップ、23.42秒。最終試験は実MP4 fixtureを既存完成物として配置し、その内容不変も確認。実FFmpeg/FFV1/BGRA中間動画が2,159,017,984 bytesへ達した時点で製品上限2,147,483,648 bytesの超過を検出。生成側とencoderの2プロセス終了、一時領域回収、以前の出力保持を確認。入力は再現可能な1280×720合成ノイズPNGを逐次送信し、全フレームのメモリ保持はしない。先行試験は2,165,047,296 bytesで検出した。監視周期内の超過量は変動する。 |
| `BAI_SCENE_BOUND_FRAMES=36000`で`node tests/run-guarded.cjs tests/studio-v05-scene-long-mp4.test.cjs` | 修正後1成功・0失敗・0スキップ、721.29秒。非0開始F60から36,000F/600秒、RTX 4070 SUPER/D3D11の実GPU描画。中間FFV1/BGRAは180,842,649 bytes、全36,000F再読込を経てH.264/AAC MP4を確定。先頭/末尾の3D画素・透過背景・画面再読込・途中編集による失敗時の旧MP4 hash保持を確認。初回は全フレーム再読込が120秒で時間切れとなり1失敗したため、上記制限時間を修正した。両実行とも素材hashは前後一致。 |
| Ubuntu WSL Python 3.12.3で上記Python3ファイル | 13成功・2スキップ・0失敗。Windows限定の親強制終了・taskkill試験2件はスキップ。容量超過・回収・通常の完成物保存経路は成功。Linux強制終了後の子孫回収の合格ではない。 |
| `npm run typecheck`・構文・差分空白 | 型検査成功。Python/Node構文・JSON/CSVのID順一致・差分空白検査も成功。 |

Node試験は`CHROMIUM_PATH`と`BAI_TEST_CONCURRENCY=1`を設定して実行。`run-guarded`は当該作業ツリーの`data/`5ファイルと`exports/`不在の前後一致を検査する。実素材を使う別試験の採用・品質判定へ広げない。

## 残件と未検証

2GiB超過の実停止を合成入力で確認した。2GiB同値・±1 byteは数値判定であり、その3サイズの実動画をそれぞれ出力した検証ではない。電源断・OSクラッシュ・ディスク不足、全停止時点、Linuxでのサーバー強制終了後の子孫回収、実MCPクライアント、元から音声を持つ実動画の長尺混合、全モデルの物理/外観、時刻付きカメラは未検証。Linuxは通常の既存処理を保持し、Windows Job Objectの強制終了保証を適用しない。順3全体の完了判定ではない。

モデル区分: 標準モデルで実装・試験・文書更新。
