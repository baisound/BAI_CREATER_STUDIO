# 動画・音声素材の詳細と再生可否（2026-11-06）

Issue #37/#81、要件 DATA-016/UX-004。③v0.5と②素材管理の既存の見本・再生を仕上げる。対応codecの追加や原本変換は行わない。

## 変更と確認条件

- 登録ファイルがあることと、このブラウザーで再生できることを別々に表示する。OGV/Theoraの音声だけ復号して映像サイズが0になる場合も、再生不可の理由を表示し、空の動画・操作を隠す。
- 映像フレームが無い動画から空の見本PNGを保存しない。
- ③の素材選択・追加画面への切替は前の媒体を停止し、srcを解放する。制作画面への移動でも停止する。
- ②の背景で別素材の見本画像ができても、選択中の動画・音声を作り直さない。素材や元ファイルが変われば通常通り停止・破棄する。
- 同じ登録IDを保存再読込しても理由が表示され、登録バイトのSHA-256は変わらない。

## 試験

`tests/studio-v05-asset-media-readability.test.cjs` は隔離サーバーにFFmpegで生成したMP4(H.264/AAC)、WebM(VP9/Opus)、OGV(Theora/Vorbis)、MP3、WAVを登録する。実Chromeの両画面で対応形式の時刻進行・停止、OGVの映像幅0と非表示・操作無効、見本POSTが無いこと、見本通知後も同じ動画要素で再生を維持すること、再読込、入力と登録後のhash一致を検査する。利用者dataを試験サーバーの保存先にしない。

初期試験では②の見本通知で再生要素が作り直される問題を検出した。またCSSのdisplay指定がhidden属性を上書きしていたため、対象videoの非表示規則を追加した。別の制限付き実行では隔離HTTPサーバーが起動せず未実行となった。いずれも最終成功件数には含めない。

最終対象試験は1成功・0失敗・0skip。関連する素材管理・v0.5・VFRの一括39件は38成功/1失敗（v0.5一覧でWindows ERR_NO_BUFFER_SPACE）。失敗したファイルの単独再実行は4成功で、同じ失敗は再現しなかった。一括実行そのものは全成功と扱わない。型検査と差分空白検査は成功。ガードのdata5ファイル/exports無し、および生成した入力5形式と登録後のhashが一致。

実行: CHROMIUM_PATHにインストール済みChromeを指定し、BAI_TEST_CONCURRENCY=1で `node tests/run-guarded.cjs tests/studio-v05-asset-media-readability.test.cjs tests/studio-p2-assets.test.cjs tests/studio-v05-smoke.test.cjs tests/studio-v05-video-formats-vfr.test.cjs`。単独再実行は同コマンドの末尾を `tests/studio-v05-smoke.test.cjs` のみにした。`npm run typecheck` も成功。

## 残る範囲と使い方

再生不可の表示が出た素材は元ファイルを保持している。対応形式へ別名変換して登録する。今回の試験は生成した5形式とWindows Chromeに限定する。実動画の全codec、他ブラウザー、Linuxブラウザー、③自身での動画見本生成、MCPによる詳細画面操作は未検証。DATA-016全体を完成へ変更しない。既存の誤った見本画像の一括削除・再生成も行わない。

モデル区分: 実装・検証・記録は標準モデル相当。
