# v0.5音声画面の実試聴 — 2026-10-24

関連: AUDIO-001、Issue #39/#69、v0.5最短制作経路の順2。機能台帳は「一部実装・未検証」のまま。

## 利用者に見える変更

音声画面で登録済みWAV/MP3を選び、実デコードした波形を見る。30fpsのフレーム位置で再生、一時停止、停止、前後1F・1秒、波形クリックのシークができる。作品上の開始フレームと原音声の頭出しフレームを、既存の音楽・ダンス配置APIへ保存し、再読込後に復元する。偽の波形・再生表示・単一EQスライダー・操作できるふりをしたミキサーは外した。録音・VST・ミキサーは未接続と画面に明記する。

## データの境界

`/api/assets` から利用可能な登録WAV/MP3を探し、`/api/library-assets/file/{id}` を読み込む。再生はWeb Audioのデコード済みデータを使い、音楽・ダンス画面と同じ `music-dance-clock.js` の30fps、`audioSchedule`、`waveformPeaks` で計算する。保存は `/api/music-dance/project` のリビジョンを `If-Match` に渡し、競合時は上書きを拒否する。モデル・モーション等の他フィールドは保持し、原本音声は編集しない。

このAPIは現段階では**共通の音楽・ダンス配置**であり、v0.5の個別作品IDとまだ結び付いていない。画面にも明記した。音声欄と実動作プレビューを同時に開いて片方に未保存変更がある場合、自動再読込で上書きしない。両画面で保存と再読込を明示して同期する。

## 試験結果

- WindowsのGoogle Chromeと隔離サーバーで、`node tests/run-guarded.cjs tests/studio-v05-audio-workspace.test.cjs` 1/1成功。隔離WAVの登録、実波形、1F・1秒移動、実再生中のフレーム進行、一時停止、停止、開始/頭出しの保存再読込を確認。モデル・モーション設定を保持し、外部変更後の409競合で上書きしないことを確認。
- `node tests/run-guarded.cjs tests/studio-v05-smoke.test.cjs` 4/4成功。`npm run typecheck`、JS構文、`git diff --check` 成功。利用者の`data/`と`exports/`のハッシュは試験前後で一致。

## 残る範囲

個別v0.5作品と同じ時刻への音声配置、PMX/VMD動作と音声の実GPU同期、動画への音声多重化、WebMCP/標準MCP、Linux、実素材の長尺MP3は未接続または未検証。EQ・VST・録音・ミキサーはAUDIO-001の対象外。カテゴリー別の進捗は [Issue #69](https://github.com/baisound/BAI_CREATER_STUDIO/issues/69) で追跡する。
