# LIP-001 口形の手動下書き（Issue #187）

## 実装範囲

v0.5 の口形候補から、発話ごとに開始F・終了F・A/I/U/E/O/Closed/Rest・強さ0〜1を編集し、別の下書き台帳へ保存・再読込する。強さ0は有効な手動値。保存は作品別 revision を照合し、SRT原本 SHA-256、読み版、作品FPSに結ぶ。元SRT・読み・元VMDは書き換えない。下書きは常に未採用で、VMDへは出力しない。

発話の元 `[startMs,endMs)` をフレーム換算した範囲から出る編集、ゼロ長、区間重複、不正な口形や強さは拒否する。SRT原本・読み・FPSが変わった下書きは残し、`source_changed` / `reading_changed` / `fps_changed` と表示して更新を無効にする。候補を再計算すると新しい下書きへ置き換えられる。元SRTの時間重なりや短区間の警告は候補表示に残り、最終出力の許可とは扱わない。

時刻から作品Fへの一回換算を共通契約の `nearest, ties-to-even` に合わせ、ちょうど半Fの 0.5/1.5/2.5/3.5 を 0/2/2/4 とする。

保存 API は `GET/POST /api/studio/v05/lip/drafts`。保存先は `data/studio_v05_lip_drafts/<project_id>.json`。現在の v0.5 手動UIとこのAPIだけを接続した。統合 `production.lip`、WebMCP/標準MCP、採用キー、Undo/Redo、モーフVMD、実音声同期は続く。

## 確認

- 隔離 HTTP/Python 下書き・候補・読み・SRT回帰: 6/6。24fpsで境界・強さ0を保存/再読込し、古い revision、逆順/重複、範囲外、強さ範囲外、未知口形を拒否。読み・FPS・原本の変更で下書きが失効。元SRTと読みバイトは下書き保存後に不変。
- 隔離 Windows Chrome `tests/studio-v05-srt-source-ui.test.cjs`: 1/1。候補から境界、口形、強さを変更して保存・画面再読込、別作品で混入なしを確認。実データ監視 `data` 7ファイル、`exports` 0ファイルのハッシュ一致。
- `npm run typecheck`、Python/JS構文、JSON・差分検査成功。人工 SRT の画面操作であり、実ユーザーSRT、歌音声との同期、実PMXの口形再生、別名VMD出力、Linuxは未検証。

モデル区分: 設計と実装・試験とも標準モデルを使用。
