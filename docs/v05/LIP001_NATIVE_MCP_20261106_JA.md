# 口パク工程の公式SDKとネイティブWebMCP（2026-11-06）

Issue #187、LIP-001/CORE-003/004。既存のSRT→読み→下書き→別名モーフVMD候補→採用操作を、実クライアントとネイティブブラウザーから確認する。製品の保存処理や原本データは変更しない。実歌詞54発話の読みは全行未確認のまま保つ。

## 変更と試験範囲

既存 `tests/studio-v05-lip-mcp.test.cjs` の1要求ごとの独自STDIO送信を、固定済み公式SDK 2.4.0の継続セッションへ置き換えた。CP932でPythonを起動し、初期化/一覧/ツール呼出しを実行する。従来の注入WebMCP試験も、注入した契約試験として残す。

`BAI_NATIVE_WEBMCP=1` の追加試験はChrome156の `--enable-features=WebMCPTesting` で本物のregisterTool/getTools/executeToolを使う。APIの注入はしない。ネイティブ実行の戻り値がJSON文字列となる点を試験ヘルパーで正規化する。これは製品の不具合修正ではない。

生成した最小PMXと、1〜2秒の「あ」の検証用SRTを隔離作品に使う。作品FPSは29.97。SRTの日本語バイトを2つの別名で取り込み、9操作の一意登録、公式SDKとWebMCPの取得値一致、誤Base64拒否とrevision不変、古いrevision拒否、読みと区間候補、下書き保存/重み変更、dry-runと実VMD候補のhash一致、実ファイルのhash、明示採用/Undo/Redo/解除を検査する。ページ再読込後も元SRT2件・読み・下書きが同じ値で取得できる。入力PMX・SRTと共有data/exportsは不変。

このテスト内のconfirmed/adoptは検証fixtureの隔離作品だけである。Ownerの実歌詞や口形を確定・採用した意味ではない。別名VMD候補はダウンロードしてhashを検査するが、身体VMDとの合成・3D自然さ・長尺MP4はこの試験に含めない。

## 結果と再実行

- Windows: 2成功・0失敗・0skip。公式SDK127ツールと、9対象操作の注入/ネイティブWebMCP、29.97fps、保存再読込を確認。型検査・JS構文・差分空白検査も成功。
- Ubuntu WSL: 公式SDKの同じ工程1成功・ネイティブブラウザー1skip・失敗0。ブラウザーを使わないSDK_ONLYモードと明示する。
- ガードdata5ファイル/exports無し、および原SRT/PMXのhashが一致。テストの最小PMX一時ファイルも、生成したディレクトリを検査してから後始末する。
- 最初のネイティブ試験は文字列応答をオブジェクトとして検査して失敗した。正規化後にWindowsの2件を再実行して成功した。途中の失敗を成功へ含めない。

WindowsはCHROMIUM_PATHにインストール済みChromeを指定し、BAI_NATIVE_WEBMCP=1、BAI_TEST_CONCURRENCY=1で `node tests/run-guarded.cjs tests/studio-v05-lip-mcp.test.cjs`。UbuntuはBAI_LIP_SDK_ONLY=1、BAI_TEST_CONCURRENCY=1を指定して同じ試験を実行する。通常のフラグなしのゲートは公式SDK＋注入WebMCPの1件を行い、ネイティブ試験を明示skipにする。

## 残る確認

実歌声SRT54発話の読み確定・口形の自然さ・Owner採用、実曲の元身体VMDとの合成と歌声入り長尺MP4、他クライアント設定、他ブラウザー、Linuxブラウザー/GPUは未検証。LIP-001全体は部分実装のまま。順5の実装開始条件を満たしたことにはしない。

## 前段の同期結果

PR #252をmain `7a62d20`へマージし、利用者mainと開発codex/nextをfast-forwardした。8765番のwebmcp.jsはmainとバイト一致。利用者515ファイルと変更一覧は不変、集約hash `89b7599826236e16936fcb87ea33d705d29801d3515c1d8e78474896cfe4286d`。利用者データを書き換えるブラウザー操作はしていない。

モデル区分: 試験の拡張と記録は標準モデル相当。

後続：[合成候補APIの2操作も公式SDK/Chromeネイティブで確認](LIP001_NATIVE_COMPOSITE_20261106_JA.md)。9操作の検証と合わせても、実歌声・自然さ・実曲合成長尺の合格ではない。
