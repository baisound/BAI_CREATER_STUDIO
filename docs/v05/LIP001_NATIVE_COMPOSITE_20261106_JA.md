# 合成VMD候補の公式SDK・ネイティブWebMCP（2026-11-06）

Issue #187、LIP-001/CORE-003/004。既存の画面合成候補試験を実クライアントへ拡張し、元VMD・採用口形・手動キーからの別名候補が、画面/公式SDK/ネイティブWebMCPで同じ内容になるかを照合する。製品の処理は変えない。

## 試験契約と変更

`tests/studio-v05-lip-composite-ui.test.cjs` の独自STDIO要求を公式SDK2.4.0の継続接続へ変更した。PythonをCP932条件で起動し、日本語を含む応答を照合する。通常試験は従来の注入WebMCPも維持し、BAI_NATIVE_WEBMCP=1では別ケースとしてChrome156のWebMCPTestingによる本物のregisterTool/getTools/executeToolを使う。ネイティブケースへAPIを注入しない。

隔離の最小PMXと元VMD（あモーフ4キー）、1〜2秒の検証用SRTを使う。画面から読み/下書き/別名口形候補/明示採用/合成候補まで操作する。口形モーフと手動表情キーを含む合成候補を、製品の全キー読み直し結果、別パーサーの91モーフキー、F45の重み0.4とF90の重み0.5で照合する。

画面の合成候補、公式SDKのdry-run、WebMCPのdry-runのSHA-256が一致し、WebMCPで作った実VMDを取得すると画面候補とバイト同一であることを確認する。古いscene revisionの拒否後も候補は同じバイトで取得できる。手動キーに不連続を追加すると画面とWebMCPの両方で422を返し、以前の候補リンクも失効409となる。許可したブラウザーエラーは、実際に拒否を検査した409を1回、422を2回に限定して件数も照合する。元PMX/元VMDはバイト一致、共有data/exportsはガードで保護する。

## 結果と再実行

最終再実行はWindows 2成功・0失敗・0skip。公式SDK127ツール、ネイティブ対象2ツールの一意登録、全キー読み直しと91モーフキー、画面/SDK/WebMCPのhash・バイト一致、409を1件/422を2件の拒否と原本保持を確認。型・構文・差分空白検査も成功。Linuxでこの合成UI試験は未実行。初回はSDK/注入ケースが成功し、ネイティブケースの操作・バイナリ照合後にChromeがERR_NO_BUFFER_SPACEを記録して失敗した。操作の照合だけを理由にその試験を成功へ変えず、隔離再実行の結果を別記する。

WindowsはCHROMIUM_PATHにChromeを指定し、BAI_NATIVE_WEBMCP=1・BAI_TEST_CONCURRENCY=1で `node tests/run-guarded.cjs tests/studio-v05-lip-composite-ui.test.cjs`。通常のフラグなしゲートはSDK/注入の1件を実行し、ネイティブは明示skip。追加依存・製品コード変更はない。

## 残る確認

生成PMX/VMD/SRTの小さな隔離作品に限定する。実歌詞54発話の読み・自然さ・Owner採用、実曲の元VMD/採用口形の歌声入り長尺MP4、別PMXの合成結果、利用者のMCPクライアント設定、Linuxブラウザーとこの合成UI試験は未検証。実歌詞を自動確定しない。LIP-001は部分実装を維持する。

## 前段の同期

PR #253をmain `32ad26b`へ反映し、利用者mainと開発codex/nextをfast-forwardした。8765番の変更JS/CSS・v0.5ページはmainとバイト一致。利用者515ファイルと変更一覧は不変、集約hash `89b7599826236e16936fcb87ea33d705d29801d3515c1d8e78474896cfe4286d`。利用者データを書き換えるブラウザー操作はしていない。

モデル区分: 既存試験の拡張と記録は標準モデル相当。
