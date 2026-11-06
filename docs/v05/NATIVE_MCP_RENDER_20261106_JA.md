# 公式MCPクライアントとChromeネイティブWebMCP（2026-11-06）

対象: 順3、Issue #81、`RENDER-006`。手動UI/APIとの元位置・画像行の同一操作は`AUDIO-001`/`DATA-008`の必要な接続修正として扱う。PR #244を開発ブランチcodex/nextへ`f433eff`で統合し、ローカル開発ブランチも早送りした。main/利用者dataは変更しない。

## 狙いと入力契約

これまで標準MCPはJSON-RPCを直接組み立てたSTDIO試験、WebMCPはregisterTool互換スタブの試験だった。今回は公式`@modelcontextprotocol/client` 2.4.0のClient/StdioClientTransportによる初期化・一覧・呼出しと、Chrome 156.0.8078.80の実`document.modelContext`による登録・発見・呼出しを検証する。AIモデルへ自然文で判断させる試験や、Codex/Claudeの利用者設定の書換えは行わない。

原本を使う試験は前回確認したAAC保持の480p実動画（SHA-256 `c895d1da79dfddb4c93210b778b74d727be225ac5c07a2c5d6c5a399093f89d6`、64,275,577 bytes）と登録実曲WAVを隔離登録する。4K原本をチャットへ読み込んだり追加の4Kコピーを作ったりしない。完成物は試験用BAI_DATA_DIRへ書き、元入力/index/data/旧完成物のhashを保つ。

## 必要な接続修正

MCPの`bai_studio_clip_edit`には手動UI/APIの`source_start`と`lane`、`bai_studio_clip_place`には`lane`が定義されていなかった。実ブラウザーへ登録された入力定義も同じ不足がある。新しい編集処理を作らず、非負の元位置と1以上の画像行番号を既存両MCPの入力定義へ追加し、既存HTTP APIの元素材尺/実在行/revision検証へ渡す。

## 受け入れ条件

1. 公式SDKがSTDIOでサーバーを起動しinitializeを完了する。UTF-8の日本語名とツール定義、状態取得・エラーが正しく往復する。SDKは開発依存のみ、サーバーはPython標準ライブラリのまま。
2. Chromeの専用試験プロファイルだけでWebMCPTestingを有効化する。`registerTool`はネイティブ関数であり、実v0.5ページから63ツールを重複/登録エラーなく取得・実行できる。スタブや別のexecute関数へ差し替えない。
3. 同じ作品の元位置・行番号・FPS・保存範囲を両入口から取得/保存し、範囲外の元位置や古いrevisionは状態を変えずに拒否する。保存再読込後も手動画面で確認できる。
4. 公式SDKで長尺MP4を開始し、ネイティブWebMCPで完成確認・リンク取得、WebMCPで別版作成、SDKで明示置換を行う。同じ不変ファイルのhashを各入口で照合する。原本は上書きしない。
5. WebMCPで旧版を復元し、SDKで現行/旧版/別版を再確認する。古い置換/復元条件は拒否し、すべての既存MP4を保持する。UIの履歴とファイルを再読込する。
6. 対応ブラウザーが無い環境のネイティブ試験は未実施/スキップと明記する。LinuxではSDKからの実出力・版管理を確認し、ブラウザーの検証を推定しない。

## 根拠と開始時確認

- [公式MCP SDKのクライアント接続](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/connect.md)。npm公開版2.4.0、Node>=20を確認し、バージョンを固定する。
- [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)。実ブラウザーのgetTools/executeToolを使う。
- 開始時の軽量プローブで63ツール登録・エラー0・実capabilities呼出しを確認した。公式SDKも127ツールの一覧を取得した。この時点のプローブと、下記の最終受け入れ試験は区別する。
- npm auditのhigh1/moderate2は追加前と同じfollow-redirects1.16.1/minimatch10.2.6/nodemon3.1.14であり、新SDKの追加によるものではない。この接続作業に既存依存全体の更新を混ぜない。

## 日本語STDIOの追加修正

従来の試験はPythonをUTF-8で明示起動していたが、通常の起動条件を想定して`PYTHONUTF8=0`・`PYTHONIOENCODING=cp932`を指定し、`-X utf8`を外すと、日本語要求で公式SDKの接続が`Connection closed`となった。

`mcp_server.py`の実行入口で、最初の要求を読む前にstdin/stdout/stderrをUTF-8へ設定する。stdoutはLFでJSON-RPCだけを出し、診断はstderrへ分ける。利用者の環境変数・クライアント設定・他プロセスは変更しない。Python標準ライブラリだけで動く点は維持する。[MCPのSTDIOと出力分離](https://modelcontextprotocol.io/specification/2024-11-05/basic/transports)に従い、公式SDKのUTF-8通信を安定させる。

## 最終実行結果

`tests/studio-v05-native-mcp-render.test.cjs`を追加した。公式SDKから同じサーバーを起動し、すべてのSDK試験でCP932条件を強制する。Chromeは156.0.8078.80のheadless専用プロファイルで`--enable-features=WebMCPTesting`を設定し、実v0.5ページを読み込む。ブラウザー標準のregisterTool/getTools/executeToolを呼び、スタブへ置き換えない。

| 試験 | 最終結果 |
|---|---|
| Windows: 新SDK/ネイティブ試験＋既存出力MCP/LIP MCP | 4成功・0失敗・0スキップ。公式SDK127ツール、実Chrome63ツール・重複0・登録エラー0。日本語の作品/完成物名が往復した。 |
| Windows: SDK＋ネイティブWebMCPの同一作品長尺 | 6,879F・約229.53秒・102,101,059 bytes。SDKで開始し、ネイティブWebMCPで完成確認/リンク取得。新版をWebMCPで作り、SDKで明示置換、WebMCPで旧版復元。3 MP4の内容hashと現行/旧版/別名状態を照合。 |
| Ubuntu WSL: 同じ公式SDKの長尺・版管理 | 1成功・ネイティブブラウザー1スキップ・失敗0。6,879F・約229.53秒・102,196,176 bytes。CP932条件でも日本語名・元位置・3 MP4保持・復元/古い条件拒否が通った。Linuxブラウザーの成功とは扱わない。 |
| Python: 旧作品MCP/版管理の回帰 | 8成功＋5 subtests。 |
| 型/構文/原本保護 | 型検査成功。Nodeガードのdata5ファイル/exports不在と、入力動画/WAV/indexの前後hashが一致。Python/Node構文・台帳JSON/CSVのID順一致・差分空白検査も成功。 |

長尺の配置は動画を作品1.37秒・元1.1秒・212.85秒、実曲WAVを作品3.13秒・元2.2秒・221.36秒、背景を232秒とし、29.97fpsのF15〜F6893を出力する。試験用の原本は確認済み480pコピーと登録WAVで、4K原本へは触れない。

元位置はSDKで0.75秒を保存後、ネイティブWebMCPで1.1秒へ変更し、SDKで再読込、実画面の編集欄でも1.1秒を確認した。画像行は既存行1の送信を確認した。範囲外元位置400、古い置換条件409、古い復元条件409を拒否して状態が変わらないことを確認する。ブラウザー側の意図した400/409はそれぞれ1件だけを明示許可し、他のエラーを隠さない。

最初の試験は未公開のsource_start定義で失敗した。修正後の初回ネイティブ試験は、意図した400/409を未許可のconsoleエラーとして扱って失敗したため、拒否と不変を検査したうえで件数を限定して許可した。さらにCP932での接続切れを再現し、STDIO設定修正後に上記の全最終試験をやり直した。途中の失敗を成功へ数えない。

## 再実行と依存

開発者は`npm ci`で固定した公式SDK 2.4.0を入れる。アプリ/MCPサーバーの実行時依存は増やさず、SDKはテストのdevDependencyのみ。新規追加パッケージのライセンスはApache-2.0/MIT/ISCを確認した。

Windowsは`CHROMIUM_PATH`、`BAI_NATIVE_WEBMCP=1`、`BAI_REAL_MMD_DATA`、`BAI_NATIVE_MIXED_VIDEO`（確認済み480pコピー）、`BAI_TEST_CONCURRENCY=1`を指定し、`node tests/run-guarded.cjs tests/studio-v05-native-mcp-render.test.cjs tests/studio-v05-render-mcp.test.cjs tests/studio-v05-lip-mcp.test.cjs`を使う。

Ubuntuでは入力を`/mnt/d/...`へ置換し、`BAI_SDK_MCP_LONG=1`で新試験を実行する。ネイティブWebMCPのフラグを付けず、SDK長尺だけを検証する。入力を省いた通常ゲートは画像3F/1F/2Fの軽いSDK版管理試験となり、ネイティブ試験は明示スキップされる。

## 残る範囲

Codex/Claude等の利用者設定での接続、自然文からのAIによるツール選択、他SDK/ブラウザー、クロスオリジン、画像行の増設/削除、LIPのネイティブ呼出し、Linuxネイティブブラウザー/3D、2GiB級の完成物版管理は未検証。今回の版管理実測は約102MBであり、全容量上限への一般化ではない。順3全体の完了判定ではない。

モデル区分: 標準モデルで実装・検証・記録。
