# Codex への引継ぎ（2026-11-05、Claude Code から）

## 2026-11-06 最新追補：mainまでの統合と手元更新

Ownerの直接指定により、検証済みPRは随時mainまで統合する。PR #246を開発ブランチへ、PR #233をmainへマージ済み（実装のmainマージ `b994cef`）。利用者のmainをfast-forwardし、8765番サーバーをそのmainの絶対パスで非表示再起動した。data等504ファイルのSHA-256と利用者の変更一覧は前後一致。Python全件986成功・22スキップ、対象Chrome7成功・1スキップ。証拠試験全体は163成功・2失敗・2スキップで、音楽配置待機の非再現と8811番占有を未解決として保持する。[統合・同期の記録](MAIN_INTEGRATION_20261106_JA.md)を先に読む。下の「mainは3013135」「PR233は下書き」は以前の実施時点の履歴である。

所有者の依頼「切りの良いところでコーデックスへの引継ぎを作成してください」による。基準は main `87ba6b9`（PR #226 まで）。画面の呼び方は、①が `/` と `camera.html`、②が `/workspace/NN`、③が v0.5（`/studio/v05`）。いまの制作画面は③です。

## 2026-11-06 追補：Python整理の統合と作業環境

- PR #236（プレビュー終端）と PR #235（Python配置整理）を、この順に開発ブランチ `codex/next` へ統合した。#235のマージコミットは `8cc3101`。mainは `3013135` のまま、PR #233は下書き。Windows/UbuntuのPython全件は各965成功・22スキップ。Node全件の5失敗と実GPU・外部Blender等の未検証は [配置整理の記録](../roadmap/PYTHON_PACKAGE_LAYOUT_20261105_JA.md) に残す。
- Ownerの直接指示により、完了済み6つのGit worktree（`_claude_v05_work`、`_preview_new_ui`、`worktrees/music-dance`、`worktrees/pr-integration`、`worktrees/specs`、`worktrees/v05-direct-timeline`）を解除してローカルから削除した。固有のサンプル原本6件はmainの `data/sample_imports_20261021/`、プレビュー用データ9件は `data/backups/archived_worktree_preview_new_ui_20261106/` にSHA-256を照合して保全した。未コミット変更のある `worktrees/v05-integration` と `worktrees/workflow`、開発中の `_codex_work` は維持した。
- 削除前に動いていた8765番の旧Pythonサーバーは `_preview_new_ui` のコードから静的画面を配信していた。作業ツリー解除後、APIは200だが `/studio/v05/index.html` が404になったため、旧プロセスを停止し、mainの `server.py` を `BAI_DATA_DIR=<main>/data` で非表示起動した。切替後は `/api/server-version`、作品一覧、v0.5画面がすべて200。mainの `data/` 503ファイル（`data/logs/` を除く）の前後SHA-256集約値 `8079e2113119b48b85e41d55e87684a6853ce28ad0397275f0891601e98746ab` は一致した。以前の「8765番は `_preview_new_ui` から起動」の記述はこの時点では古い。
## 0. 作業フォルダ（最初に必ず読む）

| 項目 | 値 |
|---|---|
| Codex が作業するフォルダ | `D:\BAI\BAI_CREATER_STUDIO\_codex_work` |
| ブランチ | `codex/next`（2026-11-05 に origin/main `35b34c1` から作成） |
| リポジトリ | `https://github.com/baisound/BAI_CREATER_STUDIO.git`（remote 名 `origin`） |
| 依存（node_modules） | このフォルダで `npm ci` 済み（three・playwright を含む） |

- `git fetch`・`git pull`・コミット・push は、**すべて `D:\BAI\BAI_CREATER_STUDIO\_codex_work` で**行う。最新の main を取り込むときは、このフォルダで次を実行する。
  ```
  git fetch origin
  git merge --ff-only origin/main
  ```
  早送りできない（自分のコミットがある）ときは `git merge origin/main` で取り込み、force-push はしない。
- 所有者のメインフォルダ `D:\BAI\BAI_CREATER_STUDIO\BAI_Creator_Studio` では、**作業しない**。所有者が動作確認に使うフォルダで、未コミットの `data/` の変更と未追跡のファイルがある。
  - このフォルダは、**main へのマージのたびに最新の main へそろえる**（所有者の指示、2026-11-05）。手順は [マージ後の同期](MAIN_SYNC_AFTER_MERGE_JA.md)。`git pull --ff-only origin main` だけを使い、前後で `data/` の hash と未コミット変更の一覧が同じことを確かめる。stash・reset・clean・checkout で変更を捨てない。
  - 2026-11-05 に `7935400` から `53da7d1` へ早送りした（`data/` の495ファイルの hash は前後で一致）。
- このフォルダは、所有者のチェックアウトの `.git` を共有する worktree。ほかの worktree（`_claude_v05_work`・`_preview_new_ui`・`worktrees\*`）は別の作業者のものなので触らない。
- **データ：** 所有者の素材は `D:\BAI\BAI_CREATER_STUDIO\BAI_Creator_Studio\data`。読み取り専用として扱う。
  - 試験は `BAI_REAL_MMD_DATA` にこのパスを渡し、隔離サーバーへ複製して使う（§4）。
  - 所有者のデータを `BAI_DATA_DIR` にしてサーバーを開くと、画面で保存したときに書き込まれる。所有者の許可なくそうしない。
- **ポート：** `8765` では、所有者用のローカルサーバー（`_preview_new_ui` から起動）が動いている。Codex がサーバーを起動するときは別のポートを使う。

最初に [AGENTS.md](../../AGENTS.md)、`python tools/work_state.py show`、[再構築ロードマップ](../roadmap/V05_REBUILT_ROADMAP_20261102_JA.md)（正本）、[共通試験手順](TESTING_GUIDE_JA.md)を読んでください。

## 1. いまの位置

- **切りの良いところで止めています。** 所有者のPC（Windows）で Claude Code が進めていた作業は、すべて main に入っています。PCの作業用の木 `D:\BAI\BAI_CREATER_STUDIO\_claude_v05_work`（ブランチ `claude/v05-next`）に、未コミットの変更はありません。
- **順5の設計は草案です。** 順5（GLB→VMDとモーション編集、Issue #102）の詳細設計を [R5詳細設計](../roadmap/R5_GLB_VMD_MOTION_EDIT_DETAILED_DESIGN_20261104_JA.md) に置きました。独立した批評で止まる級の指摘を受け、まだ反映していません（同文書 §8）。このまま実装しないでください。
- **次にやること（ロードマップの順どおり）：** 先に、次の実施順3・4の残りを片付けます。
  - **順3**（#39/#63/#81）
    - 動画内音声
    - 300フレームを超える3D出力
    - 全区間で音と画の差を1フレーム以内にする
    - 同名の完成物の版管理
    - 保存カメラが無いときの自動構図
    - 16:9より縦長の欄
    - 出力の標準MCP・WebMCP
  - **順4**（#187）
    - 開始0秒以外のクリップと、整数でないFPS
    - LIPの標準MCP・WebMCP
    - 実PMX・採用口形を含む完成MP4・実際の歌声のSRT・実長尺VMDでの確認（所有者のPCで行う）
  - 一覧は R5詳細設計 §8.1 にあります。各項目は、その時点のロードマップと台帳で、まだ残っているかを確かめてから着手してください。
  - 順5は、そのあとで設計の §8 を反映し、判定を受け直してから実装します。所有者が別の順を指示したら、そちらを優先してください。
- **所有者の決定（2026-11-05）：** 旧ダンスと旧タイムラインの動きが同じキャラで重なったときは「タイムライン優先」（ダンスは置くが割り当てない）。実装済み（#225）。

## 2. 2026-11-04 までに終わったこと（すべて main）

| 内容 | 記録 |
|---|---|
| ③の素材管理だけで、実素材8形式（VRM・FBXモデル・FBX動作・GLB動作・GLBステージ・WAV・画像・動画）の登録・見本・再読込を確認。②の `/workspace/08` を開かずに VRM・FBX・GLB動作を直接登録でき、見本・回転表示・動作の再生も③で行う | [直接登録の設計と結果](../v05/DIRECT_MODEL_MOTION_IMPORT_DESIGN_20261104_JA.md)、[形式別の結果](../v05/REAL_FORMAT_IMPORT_20261104_JA.md) |
| FBXモデルの見本が黒い影絵になる不具合（テクスチャの読込前に描いていた）と、容量「不明」の表示を修正 | 同上の追補 |
| ③のプレビューに出力と同じ16:9の枠を置き、保存ステージ位置と保存カメラで、プレビューとMP4の構図を一致させた（IoU 0.886、重心のずれ0.005） | [調査表と修正](../v05/SHARED_STATE_OUTPUT_AUDIT_20261104_JA.md) |
| 旧保存→v0.5取込の WP-L1〜L7b・L9。所有者の実データで R1〜R4（原本不変・往復・取消・編集後の逆変換）がすべて合格 | [取込設計](../roadmap/LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md)、[実データ確認](../v05/LEGACY_IMPORT_REAL_DATA_20261104_JA.md)、[操作説明書](../v05/LEGACY_IMPORT_GUIDE_JA.md) |
| 曲とダンスのGLB動作のダンスも、開始時刻ごと写す（WP-L7a 補足、#225） | 取込設計の §3.2 |
| WP-L8a：取込で置いたキャラクター・ステージに印 `units: "legacy"` を付け、③は旧画面と同じ大きさで置く。比較の試験で旧画面との差0、実PMXで4.4e-16。所有者の回答「旧の大きさ」で完了 | [詳細設計](../roadmap/WP_L8A_VISUAL_SCALE_DETAILED_DESIGN_20261104_JA.md)、[実データ確認](../v05/LEGACY_IMPORT_L8A_REAL_DATA_20261104_JA.md) |
| 口パク合成の比較器を製品APIと画面へ接続（#187）。境界は1フレームかけて滑らかに変える（所有者の決定） | ロードマップの 11/04 の節 |

## 3. 申し送り（未完了・判断済みのこと）

- **順6への申し送り：** WP-L8a で S01（±50m）を旧の大きさで置いたため、③の3D場面は開くたびに `viewport.fit()` でカメラを外殻の外 (105, 70, 234) まで引きます。曲とダンスのモデルは見えません（床の上には正しく立っています）。大きなステージの内側にキャラクターがいる作品の最初の構図は、順6（GLBステージと撮影・保存カメラ、#63）で扱います。それまでは、視点を保存すれば、保存した視点が使われます。
- **WP-L8b：** ①の旧カメラのキーとカットは、取込記録に保管だけしています（所有者の回答「保管だけ」）。③に時刻付きカメラの保存先ができる順6で写します。MP4は③の保存カメラ（静止1つ）だけを使います。
- **`DATA-008`：** 要検証のまま（L8b が残るため）。
- **未検証：** WebMCP・標準MCPからの取込と登録、Linux、取込後の作品のMP4書き出し、PMX ZIP・VMDの③からの登録（まだ②経由）、GLBモデル・ステージ・動画の見本を③で作ること。

## 4. このPCでの試験の実行方法

所有者のPCで実素材と実GPUを使う試験は、次の環境変数で動かします。

| 変数 | 値の例 | 用途 |
|---|---|---|
| `BAI_REAL_MMD_DATA` | `D:\BAI\BAI_CREATER_STUDIO\BAI_Creator_Studio\data` | 所有者の実素材（読み取りだけ。試験は隔離サーバーへ複製する） |
| `CHROMIUM_PATH` | `C:\Program Files\Google\Chrome\Application\chrome.exe` | ブラウザ試験 |
| `BAI_TEST_CONCURRENCY` | `1` | Windows では1並列で回す |
| `BAI_REAL_GPU` | `1` | 対応する試験で、SwiftShader ではなく実GPU（RTX 4070 SUPER/D3D11）で描く |
| `BAI_REQUIRE_3D` / `BAI_REQUIRE_REAL` | `1` | 3D・実素材の試験が skip で黙って通らないようにする（WP-L8a の試験） |
| `MIXAMO_BLENDER` | `D:\BAI\BAI 3D Model\tools\blender-5.2.2-windows-x64\blender.exe` | GLB→VMD の実変換の試験 |
| `PYTHONUTF8` | `1` | pytest の一部が cp932 で読めずに落ちるのを防ぐ |

- 旧保存取込の実データ確認は、1つのコマンドで通ります：`python tools/legacy_import_real_check.py --data "<所有者のdata>" --out "D:\BAI\BAI_CREATER_STUDIO\_Claude確認画像\<日付>-legacy-import"`。L5（目視）は `--relabel --l5 見える|見えない` で書き込みます。
- 確認画像は、所有者が開けて消せる `D:\BAI\BAI_CREATER_STUDIO\_Claude確認画像\<日付付きフォルダ>\` に置きます。
- **既知の失敗（今回の変更と無関係と確かめたもの）：**
  - `test_v05_timeline_drag_static`（pytest）。
  - `studio-v05-pane-layout`（main でも失敗）。
  - 実VMD試験（`studio-real-asset-visuals` の VMD）の警告「unknown char code」。
- **不安定なもの：**
  - 隔離サーバーへの接続が、ときどき `ERR_CONNECTION_TIMED_OUT` になる。②の画面が起動途中で止まったり、ステージの登録が失敗したりする。大きなWAVを同時に流すと、Chromeの1ホスト6接続が埋まることは確かめたが、ほかの原因は特定していない。
  - `npm run test:node-all` をまとめて流すと、②の `studio-ui`・`studio-p2-viewport`、③の `studio-v05-split-snap-labels` のどれかが落ちることがある。それぞれ単独では成功する。
  - 11/04 の午前には、`arm-ik-geometry-real`・`full-pmx-dance`・`vmd-constant-real` が、修正前のコードでも失敗していた。

## 5. このPCで動いているもの

- **ローカルサーバー：** `http://127.0.0.1:8765/studio/v05/index.html`。
  - プログラムは `D:\BAI\BAI_CREATER_STUDIO\_preview_new_ui`（`87ba6b9` に合わせた作業用の木）。
  - データは所有者の data（`BAI_DATA_DIR` で指定）。
  - 所有者がブラウザで使うためのもの。止めるときは所有者に確かめてください。
- **所有者のメインフォルダ** `D:\BAI\BAI_CREATER_STUDIO\BAI_Creator_Studio` は、2026-11-05 に最新の main（`53da7d1`）へそろえた。
  - 未コミットの `data/` の変更や未追跡のファイルがある。作業はしない。`data/` は読み取りだけ。
  - マージのたびに、§0 の手順で最新の main へそろえる（早送りだけ。変更を捨てる操作はしない）。

## 6. 守ること（AGENTS.md の要点）

- 計画外の機能を足さない。承認済みのロードマップと所有者の指示の順に進める。
- 所有者のチェックアウトと data を変更しない。原本の SHA-256 を、作業の前後で照合する。
- 試験の skip・無効化はしない。実行しなかったもの・環境で通らなかったものは、未検証と書く。
- 作業の各段階で `python tools/work_state.py start/done --agent codex` を記録し、コミットと push に含める。
- コミットは日本語で、pathspec を指定して行う。force-push はしない。
- 所有者に動作確認は頼まない（Phase E の全機能が終わるまで）。見た目は開発側が画像を見て判定する。

モデル区分：引継ぎ文書の作成は高性能モデル。

## 2026-11-06後続：実歌声とOwner選択の既存口形

- PR #255/#256をmainへ反映し、実装/証拠基点は `a13d16d`。利用者main・開発codex/next・8765番まで同期済み、利用者515ファイルと変更一覧は不変。
- Owner回答は「実曲VMDに入っている既存の口形を使う」。29.97fps・非0開始・実歌声全区間の6,924F/約231秒MP4を実GPUで確認し、9口モーフ/画素、190有音窓のPCM位置差最大2sample/8kHz、保存再読込と原本保持を照合した。新規の読み確定・採用層は作っていない。
- 元口形はF6359（約212秒）で終わり、発話51〜54を含まない。元歌声にはその区間にも信号がある。既存口形を無断補完せず、実歌詞54件の未確定・自然さ・実歌詞からの新規候補採用を残す。順5の入口条件が満たされたとは扱わない。
- [長尺結果・入力監査・再実行・確認動画の保存先](../v05/LIP001_REAL_VOCAL_LONG_20261106_JA.md)を読む。画像はIssue #187にも添付/表示確認済み。Linux長尺GPU・全モデル/物理は未検証。

## 2026-11-06 最新追補：末尾4発話を別名候補へ補完

- Ownerは後続で「末尾4発話も、原本を残した別名候補で補完」を直接指定した。上の補完しない方針を発話51〜54に限って更新し、PR #258をmain `8b7429d`へ統合。実装/証拠 `3542a52`。原本や既存作品は保持する。
- 元7入力をhash固定し、同じ仮名/生成方式と歌声100Hz包絡で5母音×541Fの2,705キーだけを追加。原4,760モーフ・351,951骨・補間・末尾区画を保持。4発話32モーラと音量包絡1,801窓、実PMX原本/候補の開閉・前半口形/7骨一致、保存再読込を確認。
- 29.97fps/非0開始、6,924F/231.031秒の実歌声入りMP4をRTX 4070 SUPERで出力。17画素点MAE最大0.302/255、190有音窓のPCM差最大0.25ms。Windows/Ubuntu対象Python各20成功、型/構文成功、実GPU長尺1成功。タイムアウト等の失敗試行も保持した。
- 手元main・開発codex/nextと8765番を同期。利用者515ファイルと変更一覧は不変。v0.5 HTML/2スクリプトの実バイト一致、Chrome読込、Issue #187の画像表示/hashまで確認済み。
- 通常納品先 `D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-06-lip-tail-four-candidate/` の候補は `KYOKAI_TAIL51-54_CANDIDATE_b1dc33ace3d3.vmd`、長尺は `tail-four-candidate-real-vocal-29.97fps.mp4`。既存作品への自動割当はしていない。
- 4発話の候補の最終採用、全54件の読み一括確定、全語の自然さ、全モデル/物理/Linux長尺GPUは別判定。順4全体や順5入口を完了にしない。[結果と再実行](../v05/LIP001_TAIL_FOUR_CANDIDATE_20261106_JA.md)、[同期数値](../../qa/lip-tail-four-main-sync-20261106.json)。

## 2026-11-06 最新追補：順3の音声ミュートを試聴とMP4へ接続

- Ownerの「承認済みロードマップの次の未完成項目を進める」指定により、#81/#39の保存ミュート未接続を修正した。実装 `a50c566`、PR #260をmain `93bb508`へ統合。音声・楽曲・動画内音声だけを対象とし、画像/3D/動作の表示制御や新ミキサーは追加していない。
- UI保存は即時、外部API/両MCPは約2秒周期で試聴へ反映。映像と再生時計を維持し、ジョブは開始時設定を固定して完成物一覧へ表示する。処理中の設定変更は次の出力から。ミュート原本もhash等の検査へ通し、混音の入力数を保って別音源を増幅しない。
- Windows：手動UI/公式SDK/Chrome156ネイティブWebMCPと実曲長尺のNode2成功、対象Python28成功＋5 subtests、既存回帰3成功。Ubuntu：SDK/FFmpeg Node2成功、Python28成功。3音源6本・実曲230.2秒/29.97fps6935Fのミュート/解除を確認。全ミュートPCM0、解除後46窓の時刻差最大0.25ms。元曲/索引とクリップを保持。先行UI待機/作品一覧不足・既知NO_BUFFER_SPACE失敗も記録済み。
- 手元main/codex-nextへ同期し、処理中ジョブ0と管理PIDを確認後8765を最新mainで非表示再起動。変更スクリプト4件/HTMLのbyte一致とChrome新設定読込を確認。利用者515ファイルと変更一覧は不変。Issue #81の画面画像は実表示/hash確認済み。
- [操作・試験・再実行・未検証](../v05/TRACK_AUDIO_MUTE_20261106_JA.md)、[同期数値](../../qa/track-audio-mute-main-sync-20261106.json)。確認動画/画像は `D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-06-track-audio-mute/`、Linuxはそのlinux/。
- 次は順3 #81の形式別/複数行/混音音量・保存等の未完受入れ条件を照合して進める。実スピーカー聴感、Linuxブラウザー、全codec/全作品、混音音量の全体一致/ミキサー/行全体Undoは未検証。順4の54件読み/自然さ/候補最終採用と、未判定の順5を保持し、この限定修正を段階全体の完成にしない。


## 2026-11-06 最新追補：順3の複数動画行と重なり出力

- Ownerの「順3の次の未完成項目を進め、検証できた変更はmain/制作画面へ同期」を継続し、#81/#63の動画複数行を接続。実装 `2df1393`、PR #262をmain `cba7fc9`へ統合した。DATA-002/008・RENDER-001/006の部分実装で、順3全体は未完了。
- 動画行は最大16・安定ID、空行削除後も他番号と元クリップ/区間を保持し、削除番号は再利用しない。手動UI/API/両MCPとプレビュー/MP4へ接続。動画どうしは番号の大きい行が手前、音声は混ぜる。ミュートとロックは動画全行共通。画像/音声/楽曲の既存設定と原本は保持。
- 29.97fpsで内部映像切替が1F早まる不具合と、保存再生位置へのシーク後に「動画なし」注記が残る不具合を修正。必要な#61依存としてPlaywright1.56.1のasync待機を完了値で判定するhelperへ置換した。
- Windows: Python53成功、手動UI/公式SDK/Chrome156ネイティブWebMCP1、実動画長尺1、関連回帰25・最後のプレビュー2、型/構文成功。Ubuntu: Python43、SDK/FFmpeg1、実動画長尺1。180Fの12境界画素・3内包音源/全動画ミュート、6421F/約214秒の9窓PCM位置差0sample、保存再読込・入力hash不変を確認。先行P2待機・通信不足・起動失敗を成功へ含めず記録済み。
- 手元main/codex-nextを同期。管理下の8765番を処理中出力0件確認後に非表示再起動し、HTML/変更JS全バイト一致とChromeで新操作・新保存項目を確認。利用者515ファイル/変更一覧は不変。Issue #81の生成色動画だけの画像は実表示/hash一致まで確認。
- [操作・試験・再実行と未検証](../v05/VIDEO_LANES_20261106_JA.md)、[同期数値](../../qa/video-lanes-main-sync-20261106.json)。通常納品先は `D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-06-video-lanes/`。全codec/実作品・原4K直接・Linuxブラウザー/ネイティブ・聴感・混音音量一致/ミキサー・音声行増設・行全体Undoは未完了。
- 次は順3 #81の残り（音声形式別・複数音声/楽曲行・混音音量/保存等）を現行証拠と照合して次の未完成受入れ条件へ進める。順4の54件読み/自然さ/候補最終採用と未判定の順5は保持。モデル区分：原因判断・実装・検証・引継ぎは高性能。


## 2026-11-06 最新追補：順3のMP3実尺・分割と長尺同期

- Ownerの次の未完成項目指定を継続し、#81/#39/#63/#82のMP3を検証。実装 `638fb30`、PR #264をmain `7e63b5c`へ統合。AUDIO-001・DATA-002/008・RENDER-006の部分接続で、順3全体は未完了。
- Ubuntu旧FFmpegのMP3 format.durationが圧縮余白を含む問題を修正し、MP3のみ復号frame.nb_samples/sample_rateで実尺を検査。旧保存や原本を自動変更せず、元尺超過は保存不変で理由付き拒否。WAV/動画の尺の方式は保持する。30秒のprobe時間切れ/復号不良は推定尺へ戻さない。
- 既存ハサミを `bai_studio_clip_split` で両MCPへ接続（project_id/clip_id/revision/split_at、作品秒）。同じAPIの元区間・ロック/境界/revision検査を使う。新ミキサー/音声行増設は含めない。起動中の標準MCPクライアントは再接続で新定義を読む。
- Windows/Ubuntu各Python38・Node3成功。Windowsは手動UI/公式SDK/Chromeネイティブ、Ubuntu SDK/FFmpeg。既存MCP出力/版管理回帰2成功、型/構文成功。登録原MP3約14秒のCC0見本＋実WAV230.2秒由来44.1/48kHz MP3を3FPSへ出力し、各OS7本/733窓の位置差最大1sample/48kHz、原本/索引不変を確認。実楽曲MP3原本を長尺で検証したとの意味にしない。比較器の1sample検出/40ms拒否、先行失敗/skipも記録済み。
- 手元main/codex-nextと8765を同期。管理サーバーを処理中出力0件確認後に非表示再起動し、実尺・変更JS/HTML byte一致・標準128/Chrome本体64の分割ツールを読取確認。実画面には既存3D/FK側5ツールもあり総数69。利用者515ファイルと変更一覧は不変。Issue #81の生成見本画像も実表示/hash照合済み。
- [操作・試験・失敗/未検証・再実行](../v05/MP3_TIMELINE_SYNC_20261106_JA.md)、[同期数値](../../qa/mp3-timeline-main-sync-20261106.json)。通常納品先 `D:/BAI/BAI_CREATER_STUDIO/_Claude確認画像/2026-11-06-mp3-timeline/`（Linuxはlinux/、試行ログはlogs/）。Eagle自動登録なし。
- 次は順3 #81の残り（音声形式別・複数音声/楽曲行・混音音量/保存等）を現行証拠と照合する。全MP3/全実曲原MP3・裸/破損/全VBR・24時間性能・Linuxブラウザー/ネイティブ・実スピーカー・音量一致/ミキサー/音声行増設/全Undo・新分割MCPの全媒体は未検証。順4の54件読み/自然さ/末尾候補の最終採用と、未判定の順5は維持。モデル区分：調査・実装・検証・引継ぎは高性能。


## 2026-11-07 順3：複数音声・楽曲行

Issue #81、AUDIO-001・DATA-002/008・RENDER-006。実装1f4719f、PR #266、main cefc0cc。音声/楽曲各最大16行・空行削除・安定ID、元区間/分割/移動・名前/保存再読込、全行ミュートと従来混音を手動UI/API/両MCPへ接続した。旧保存を読取だけで書き換えない。Windows/Ubuntu各Python58・Node2成功。実曲WAV+登録MP3を重ねた6924F/29.97fps/各119窓の時刻差0sample/8kHz。Windows回帰6成功2任意実データskip・最終UI1成功1長尺skip、型成功。初回短尺は外部MCP後の画面再読込不足で待ち失敗、明示再読込して成功。

利用者main/開発木と8765を同期。既存8765は停止していたため非表示起動PID79656、HTML/変更JS実バイトと読み取りChromeの新UI/両MCP9actionを確認。利用者515ファイルと変更一覧は不変、Issue画像は実表示/hash確認。証拠 `qa/audio-music-lanes-main-sync-20261107.json` と [仕様/試験](../v05/AUDIO_MUSIC_LANES_20261107_JA.md)。正常な原本を保持。

次は順3 #81に残る混音音量一致/音量調整・ミキサー等を既存受入れ条件と現行証拠へ照合し、次の未完成項目を進める。Linuxブラウザー/聴感/全形式/全Undo・一般外部編集の自動同期は未完了。順3全体、順4の54件読み/自然さ/候補最終採用、未判定の順5を完成扱いにしない。証拠ゲート2失敗/依存監査3件は維持。モデル区分は高性能（接続判断・実装・検証）。


## 2026-11-08 順3：プレビューとMP4の混音音量一致

Issue #81/#39/#63、AUDIO-001・RENDER-006・DATA-002/008。実装3fbbbf5、PR #268、main3cfae54。FFmpegの暗黙amix正規化による1/4→1/3→1/2の減衰変化をnormalize=0で取り除き、既存HTMLの元音量加算へ一致させた。旧完成物は保持し、新規出力だけ作用。新しいミキサー/EQはAUDIO-001対象外であり、この継続依頼で追加する許可と扱わない。

Windows/Ubuntu各Node2・Python28（Win追加subtests5）成功、回帰3成功2任意実データskip、型成功。実Chrome再生PCM、合成7出力、実WAV+登録MP3の6924F/各117安定窓を確認し、音量差±3%・時刻差0sample/48kHz。切替直後Linux210秒は3%条件に不合格、安定窓と分離して未確認のまま。試験の権限/CRLF/終端超過/Chrome通信・先読み待ち/長窓FFTの途中失敗は [仕様と試験](../v05/AUDIO_MIX_LEVEL_20261108_JA.md) に記録。OSスピーカー聴感と任意素材の非クリップ保証、全形式/Linuxブラウザー/全Undoは未完了。

利用者main/開発木/8765を同期。所有コマンド・実行中ジョブ0確認後の非表示再起動PID56912、mainの新グラフ/ソースhashとHTTP実バイト/読み取りChromeを確認。利用者515ファイル・変更一覧は不変。初期選択に音声要素はなく利用者作品へ試験出力していない。証拠 `qa/audio-mix-level-main-sync-20261108.json`。

次は順3 #81に残る形式別OGG/FLAC/M4A等の対応/拒否と、切替境界品質など既存受入れ条件を照合し、次の未完成・承認済み項目へ進める。順3全体を完了にせず、順4の54件読み/自然さ/候補最終採用、未判定の順5と証拠ゲート2失敗/依存監査3件を維持。モデル区分：高性能（判断・実装・検証）。


## 2026-11-08 順3：OGG・FLAC・M4Aと表示中ブラウザー

Issue #81/#37/#39/#63、DATA-016・AUDIO-001・DATA-002/008・RENDER-006。実装95fcbd2、PR #270、main0c04ed3。OGG Vorbis/Opus・FLAC・M4A AACの署名/MIME・共通取込/素材管理/音声実波形・実尺/元区間/分割・プレビュー/MP4を接続。復号サンプル数で余白を抑え、Vorbis切出しの約139sample/48kHz差は独立音声の事前時刻正規化で0へ。動画内音声の相対時計は保持。M4A映像（カバーアート以外）、破損/種類不正/未対応形式は理由付きで配置を拒否する。

Windows/Ubuntu各Python50・Node2成功0skip。短尺899F/818F各30窓差0、実曲由来4代表codecの5619F/各92窓は最大1sample/48kHz。回帰24成功1任意実データskip、型成功。途中のポート競合/試験式/画面入口/静音判定/Vorbis時刻差/Linux短窓相関不足と再実行を [仕様/証拠](../v05/AUDIO_FORMATS_20261108_JA.md) に保存。全codec（ALAC等）/聴感/Linux実ブラウザー/全実作品・AAC再圧縮品質/音量完全一致・ミキサー/全Undoは未完了。

依頼どおり8765を起動してChromeタブ1055945512を表示・保持し、main後に再起動PID59796/ブラウザー再読込。main/開発木の同期、HTTP実バイト・新形式capability・読み取りChrome案内/Issue画像表示/hashを確認。利用者515ファイルと変更一覧は不変。利用者作品へ試験登録/出力は行っていない。証拠 `qa/audio-formats-main-sync-20261108.json`。

次は順3 #81の画像/動画等の形式別対応・拒否や切替境界品質など、既存受入れ条件と現行証拠を照合して次の未完成項目へ進める。順3全体・順4の54件読み/自然さ/最終候補採用と順5判定、証拠ゲート2失敗/依存監査3件は維持。AUDIO-001対象外のミキサー/EQをこの継続依頼だけで追加しない。モデル区分：高性能（判断・実装・検証）。


## 2026-11-08 順3：画像形式のプレビューと出力理由

Issue #81/#37、DATA-001/002/008/016・RENDER-001/006。実装e5393d4、PR #272、main1ab7d08。既存登録CC0 WebPと新規PNG/JPEG/WebP/BMP、透過・縦長・EXIF向き6・2行重なりを同じ作品の保存/復元からMP4へ確認。枠内背景を黒へ合わせ、ChromeとMP4の透明部/余白を一致。21時刻最大MAE5.159/255、全域450Fと非0In390Fを確認。capabilityの出力正本から素材詳細へ案内し、GIF/AVIF/旧登録を模したEXRは出力理由を表示。WebMCPの出力拒否もHTTP番号だけに落とさず理由を保持。登録/出力形式の拡張は行っていない。

Windows/Ubuntu各Python29・Node2成功0skip、関連回帰7成功・型成功。初回/並行試験の失敗と修正、限界は[仕様/証拠](../v05/IMAGE_FORMATS_20261108_JA.md)へ記録。main/開発木/8765を同期し、非表示再起動PID6164、新capability・HTTP実バイトと黒背景を確認。開いていたChromeタブ1055945512を再読込して保持。利用者515ファイル/変更一覧は不変。Issue画像2枚も実表示/hash一致。証拠qa/image-formats-main-sync-20261108.json。モデル区分：高性能（判断・実装・検証）。

次は順3 #81に残る動画等の形式別対応/拒否や切替境界品質を既存受入れ条件と照合して次の未完成項目へ進める。Linuxブラウザー/実GPU/全画像・ICC/HDR/全EXIF/大画像/アニメーション画像出力/実ユーザー旧EXR/全Undoは未検証。順3全体、順4の54件読み・自然さ/最終候補採用、未判定の順5と証拠ゲート2失敗/依存監査3件を維持。ミキサー/EQ等の未承認拡張を追加しない。


## 2026-11-08 順3：動画形式の案内と映像なし素材の拒否

Issue #81/#37、DATA-002/008/016・RENDER-001/006。実装75a517f、PR #274、maincaac129。登録済みMP4＋新規MP4/WebM/OGVを同一作品へ保存/復元して225F・非0In215F、VFR時刻・代表画素・6PCM窓を照合。Windows差最大32sample/8kHz、Ubuntu最大56sample/8kHzで1出力F以内。OGVのChrome映像幅0は理由表示し、再生成功としない。出力の正本VIDEO_EXTを既存capability/動画詳細へ案内し、旧MOVは未対応を明示。音声のみ3形式とカバー画像だけのMP4を保存前・旧保存からの出力前に拒否。SDK/ネイティブ/手動UIで作品・原本/index・完成物保持を確認。登録/出力形式は増やしていない。

Windows/Ubuntu各Python47・Node2成功0skip、既存VFR/画像/出力MCPの回帰4成功・型成功。範囲超過の試験失敗と訂正、CSV記録BOM/既存12ID差異も[仕様/証拠](../v05/VIDEO_FORMAT_POLICY_20261108_JA.md)に記録。利用者main/開発木を同期し、所有8765を非表示再起動PID62952、HTTP実バイト/新capability/mainプローブを確認。開いていたChromeタブ1055945512も再読込して保持、515ファイルhash/変更一覧は不変。Issue画像3枚の実表示/hash一致。証拠qa/video-policy-main-sync-20261108.json。モデル区分：高性能（判断・実装・検証）。

次は順3 #81に残る切替直後のAAC音声品質・他codec/長尺VFRなどの既存受け入れ条件と未検証記録を照合して進める。全codec/VFR/長尺/原4K/回転/色空間/多重ストリーム・Linuxブラウザー/実GPU/聴感/全Undo・Ownerの実旧MOVは未確認。順3全体、順4の54件読み/自然さ・最終候補採用、順5判定と既存ゲート2失敗/依存監査3件を維持。未承認ミキサー/EQへ拡張しない。


## 2026-11-08 ロードマップ報告・細分化再検討・G3-A1着手

Owner依頼に対応し、[最新7段階一覧・現在地](../roadmap/CURRENT_POSITION_AND_TASKS_20261108_JA.md)を作成。現在は順3、順1/2の残件と順4の一部先行を保持。順3はG3-A音の境界、B形式/長尺、C編集保存/各入口、D故障/完成物保持、E構図/依存、F終了判定の6単位へ整理した。既存の証拠を再利用し、全形式等の無制限な網羅を終点にしない一方、既存必須条件を緩めない。

次タスクG3-A1へ着手し、保存済みMP4のLinux210秒直後の音量比0.959620を再現。Windows0.970141。参照PCMを直接AAC192kへ圧縮した対照は各OSの完成物と162/162窓のPCM hash一致。制作の配置/混合フィルターを外しても境界差が再現することを確認。参照peak1.282292/範囲超過48チャンネルサンプルも記録。[診断と限界](../v05/AAC_BOUNDARY_DIAGNOSTIC_20261108_JA.md)。G3-A1の診断/原本保持は検証済み、品質未達とG3-A全体は未完了。次はG3-A2で入力振幅とAAC過渡の寄与を分離する。自動減衰/フェード/ミキサー等を追加せず、必要な既存経路の修正だけを検討する。

実装/報告1a4829f、PR #276、mainf7a15ea。Windows/Ubuntu実FFmpeg、Node構文、両証拠の読戻し/同一参照PCM・原本/索引/旧完成物不変を確認。151IDと既存JSON/CSV12差異は保持。手元main/開発木を同期、515ファイル/変更一覧不変、8765の実バイトはmainと一致。製品UIは前回検証済み内容と同じ、ブラウザー再操作は今回未実施。証拠qa/roadmap-aac-main-sync-20261108.json。モデル区分：高性能（要件/証拠照合・原因診断）。順3全体/順4の読み54件・自然さ/最終候補採用、順5判定と既存ゲート2失敗/依存監査3件を維持。


## 2026-11-09 順3 G3-A2/A3：入力振幅分離とAAC320kの境界修正

Issue #81/#39/#63、AUDIO-001・RENDER-004/006・DATA-002/008。A2診断9470ee3：振幅0.75/0.5で改善、48値のクリップだけではUbuntuの既知境界差は3%未達。振幅1のAAC320k対照では両OSの54個の200ms窓が3%以内。Windows384kはCPU使用が継続して未完走、所有PID48336だけ停止し保持。診断に120秒上限/途中保存を追加した。[A2結果](../v05/AAC_INPUT_LEVEL_DIAGNOSTIC_20261109_JA.md)。

A3実装d0b4665、PR #278、mainc1f5f8b：新規MP4の目標AAC320000bit/sをジョブへ固定し、capability/出力画面/記録のある完成物へ案内。旧192k出力/履歴、入力音量/時計/ミュート/元区間は保持。実曲+登録MP3の6924F/29.97fpsは両OS165固有200ms窓（既存117+境界54、重複6）の比3%以内、lag0/48kHz、既知210秒はWin0.978362/Linux0.974363。新MP4はWin9,705,210/Linux9,861,417bytes、旧192k2本は前後hash一致。短いミュート6条件/非0In/Chrome実再生PCM/両MCPも確認。Windows/Ubuntu各Node2・Python28（Win追加5subtests）、型成功。関連MCP/版管理2成功、DL一括はソケット不足失敗後に単独1成功。元の失敗ログを保持。[A3条件/証拠](../v05/AAC_320K_BOUNDARY_FIX_20261109_JA.md)。

main/開発木・8765を同期し、所有サーバーを非表示再起動PID75076、新cap320000/HTTP実バイトを確認。現在開いていたChromeタブ1055945654を再読込しホームを保持。515ファイル/変更一覧は不変、Issue合成画像の実表示/hash一致。証拠qa/aac-320k-main-sync-20261109.json。モデル区分：高性能（原因分離・必要修正・実機検証）。

次はG3-B1：既存の形式/長尺/FPS/OSの証拠表を整理し、既検証と欠測を確定する。過去192kの条件を新320kへ全面昇格しない。20/50ms短窓・聴感/全codec/全作品/任意素材の非クリップ保証・Linuxブラウザー/Windows384、G3-A/順3全体は未完。順4の54読み・自然さ/最終候補採用、順5判定と既存ゲート2失敗/依存監査3件を維持。新ミキサー/EQ等へ拡張しない。


## 2026-11-09 G3-B1の位置

2026-11-09 G3-B1、形式/長尺/FPS/codec/OS/操作入口の11行を証拠hash付きで照合。旧AAC192kと現行320kを区別し、動画MP4/WebM/OGV短尺30fps・音声OGG Vorbis/Opus/FLAC/M4A短尺と5619F長尺29.97fpsをWin/Ubuntu各4固有ケースで確認（Win初回1失敗は保持、音声待機修正後2成功）。実214秒動画はPTSでCFR30fpsを確認、長尺VFRの証拠なし。次G3-B2は実映像由来の隔離VFR MP4＋元AAC/別曲を29.97fps/320kで検証。全codec/聴感/Linuxブラウザー・G3-B/順3全体は未完了。docs/v05/MEDIA_FORMAT_EVIDENCE_20261109_JA.md

[11行の証拠表と次の受入れ条件](../v05/MEDIA_FORMAT_EVIDENCE_20261109_JA.md)。G3-B1は証拠照合の終了であり、G3-B/順3全体は未完了。製品仕様と承認済み順序は変更しない。モデル区分：高性能（照合・試験・判定）。

音声4codec長尺91.4秒は音量比Win0.955042/Ubuntu0.950106で、既存7%条件内だがG3-Aの3%一般化は未達・原因未診断。


## G3-B1のmain・制作画面同期

PR #280をmain2637f34へ統合。手元main/codex-next/作業木をffし、8765のPID75076の起動元、HTML/render-job-v69.js/webmcp.jsの全バイト一致・音声目標320000を確認。製品Python/JS/HTMLの変更はないため再起動/制作画面再読込なし。CUAで既存Chromeタブ1055945654のホームと2作品表示を確認し保持。利用者data/exports/studio.zipの515ファイルと変更一覧は前後一致（集約hash89b7599826236e16936fcb87ea33d705d29801d3515c1d8e78474896cfe4286d）。

[同期数値](../../qa/media-evidence-main-sync-20261109.json)。[Issue結果](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81#issuecomment-6740056657)の4枚はGitHub HTMLのimg要素と配信PNGのhash一致を確認（ブラウザー上のGitHubレイアウト検査ではない）。8765の文書URLは404だったため、初回Issue投稿の「文書も全バイト一致」を「制作画面HTML/JSの一致」へ訂正した。文書はローカル正本/GitHubで参照する。自動checksの登録はなく、ローカル試験と区別する。次は上記G3-B2、約5%の音量差・順3全体/順4/5の残件を保持。


## 2026-11-11 G3-B2と次の位置

2026-11-11 G3-B2、実214秒CFRコピー由来のVFR MP4（1071F/33〜367ms、元AAC10033packet/PTS保持）と別実WAVを同じ作品で分割/移動/保存し、29.97fps/320kの非0In出力6879F/229.52953秒をWin/Ubuntuで確認。全出力Fの32x18署名は元PTS±1F候補と最大MAE1.337385、PCM153窓中有音149窓は差0sample、静かな4窓はRMS。Windows実Chrome/SDK/ネイティブ、Ubuntu SDK/API、各Node1/Python10成功。測定器の先行失敗と並行時SDK時間切れを保持、製品コード変更なし。自然発生VFR/他codec/聴感/順3全体は未完。docs/v05/LONG_VFR_SOURCE_WINDOWS_20261111_JA.md

[入力/操作/測定と先行失敗](../v05/LONG_VFR_SOURCE_WINDOWS_20261111_JA.md)。次は実映像由来の長尺WebM VP9/Opusを同じ時刻/保存/出力契約で検証。G3-B/順3全体・約5%音量差/聴感、順4/5と既存ゲート/依存監査は未完了を維持。モデル区分：高性能（設計・試験実装・検証）。

証拠/試験コミット `3414f8c`、[PR #282](https://github.com/baisound/BAI_CREATER_STUDIO/pull/282)。12行の証拠はこのGit保存内容のSHA-256で照合。AAC末尾は両OSでdurationの報告形が異なるが、破棄余白を引いた4表は一致。


## mainと制作画面の同期

PR #282はmain f4dbe44へ統合済み。手元main/codex-next/作業木をffし、PID75076の絶対起動元、8765のHTML/render-job-v69.js/webmcp.js全バイト一致と320000目標値を確認。製品Python/JS/HTMLに変更がないため再起動/再読込なし。Chromeタブ1055945654のホーム/既存2作品をCUAで観測して表示を保持。利用者data/exports/studio.zipの515ファイルと変更一覧は前後一致（集約hash89b7599826236e16936fcb87ea33d705d29801d3515c1d8e78474896cfe4286d）。

[同期数値](../../qa/long-vfr-main-sync-20261111.json)・[Issue結果](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81#issuecomment-6787848290)。GitHub自動checksの登録なし、ローカル検証と区別。次は長尺WebM VP9/Opus、順3全体と既存の未確認は維持。


## 2026-11-12 G3-B2：長尺WebM代表と入力時計修正

2026-11-12 G3-B2、実214秒CFRコピー由来WebM VP9/Opus（1071F・元PTS最大丸め0.333ms）と別実WAVを分割/移動/保存再読込し、非0In・29.97fps/320kの6879FをWin/Ubuntuで確認。Ubuntu旧FFmpegの負の開始時刻による7ms前倒しを-copytsで修正。全F署名±1F・PCM153窓中有音149窓差0sample/静かな4窓RMS、入力Opus変換106窓も差0sample。Win実Chrome/公式SDK/ネイティブ、Ubuntu SDK/API。自然発生VFR・OGV・全codec/聴感/順3全体は未完。docs/v05/LONG_WEBM_SOURCE_WINDOWS_20261112_JA.md

[測定・不具合・再実行](../v05/LONG_WEBM_SOURCE_WINDOWS_20261112_JA.md)。次はG3-B2の長尺OGV Theora/Vorbis。元の未完と承認順を維持。モデル区分：高性能（診断・実装・検証）、サブエージェントなし。


## mainと制作画面の同期

[PR #284](https://github.com/baisound/BAI_CREATER_STUDIO/pull/284)はmain `3af3fe1`へ統合済み。利用者main/既存codex-nextをfast-forwardし、所有パスを確認した8765番のPythonをPID75076から21332へ非表示再起動して、製品の入力PTS保持修正を読み込ませた。HTML/render-job-v69.js/webmcp.jsはmainと全バイト一致、出力capabilityの320000目標値も確認。

Chrome既存タブ1055945654のホームと既存2作品を確認し開いたまま保持。HTML/JS変更がないため画面の強制再読込は不要。利用者data/exports/studio.zipの515ファイルと変更一覧は前後一致（集約hash `89b7599826236e16936fcb87ea33d705d29801d3515c1d8e78474896cfe4286d`）。[同期数値](../../qa/long-webm-main-sync-20261112.json)。GitHubの自動check登録はなく、ローカル検証と区別。次は長尺OGV。順3全体と他の既存未確認は維持する。


## 2026-11-12 優先度の修正とG3-Cの編集履歴

Owner後続指定：長尺OGVを必須の次作業にしたのはAgentの判断だった。Ownerは要望していない/優先度低いとして次へ指示。互換性残件として残し、当面は実制作の編集・保存・書出し復旧を優先する。7段階・既存要件は削除しない。

2026-11-12 G3-C、素材クリップの配置/単体編集/分割/削除/一括移動/従来の対象モデル指定に最大32操作・8MiBの保存Undo/Redoを接続。手動UI/API/公式SDK/ネイティブWebMCP、revision/ロック/削除済み行/異常履歴/書込失敗拒否を検証。Win/Ubuntu各240FのUndo後の復号画素署名・PCMが操作前と一致しRedo後は編集後へ戻る。合成素材と同じ実録画由来MP4の短区間を各OSで確認。行削除選択の再描画リセットも修正。OGV長尺はOwner指定で低優先。G3-C/順3全体は未完。docs/v05/CLIP_EDIT_HISTORY_20261112_JA.md

[操作と境界・検証](../v05/CLIP_EDIT_HISTORY_20261112_JA.md)。G3-C全体・アプリ全体Undoの完了ではない。次はG3-Dの出力失敗/再開・既存完成物保持の欠測を既存証拠から絞る。モデル区分：高性能、サブエージェントなし。


## main・制作画面の同期

[PR #286](https://github.com/baisound/BAI_CREATER_STUDIO/pull/286)をmain078c1b6へ統合。利用者main/既存codex-nextをfast-forwardし、起動元を確認した8765番のPythonをPID21332から34300へ非表示再起動。HTML/asset-workflow-v06.js/webmcp.jsの全バイトがmainと一致し、既存作品のGETに新しいedit_history件数が返ることを確認した。履歴snapshotをGETへ送っていない。

旧Chromeタブ1055945654は取得できなかったため、同じ制作URLを同じChromeの新タブ1055946273で開き、タイムライン編集の新しい2ボタンと既存2クリップを確認して保持した。過去の履歴がない旧作品では両ボタン無効で、新しい編集から保存履歴が作られる。既存作品へ試験編集を加えていない。

利用者data/exports/studio.zipの515ファイルと変更一覧は前後一致。集約SHA-256は89b7599826236e16936fcb87ea33d705d29801d3515c1d8e78474896cfe4286d。[同期証拠](../../qa/clip-history-main-sync-20261112.json)。[Issueの確認画像](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81#issuecomment-6807836348)は合成素材だけで、配信PNGと確認原本のバイト一致も確認。

GitHub自動checkの登録なし。ローカル検証と区別する。次はG3-Dの出力失敗/再開・旧完成物保持の不足。OGV長尺は低優先、G3-C/順3全体や既存未解決は維持する。


## 2026-11-13 G3-D：書き出し失敗からの復旧と完成動画保護

2026-11-13 G3-D、保存容量/権限/起動失敗からの再試行と旧完成動画を保護。検証済み確定出力の最終状態保存失敗は名前有無とも回収し、一時領域を解放。受取/旧版復元で保存SHA-256を照合し同容量の改変を拒否。書けない中断履歴や名前台帳の破損/ロックがあっても読める完成物を表示。Win Python33成功・Ubuntu31成功/Windows限定2skip。実FFmpeg/実録画短区間30F、Win実Chrome157 UI/SDK/ネイティブWebMCP、Ubuntu SDK/APIで旧MP4/台帳/原本不変と別版再試行を確認。物理ディスク枯渇/電源断/全停止点やG3-D/順3全体は未完。docs/v05/RENDER_FAILURE_PROTECTION_20261112_JA.md

[受け入れ条件・再現手順・結果](../v05/RENDER_FAILURE_PROTECTION_20261112_JA.md)。既存の10分/2GiB・強制再起動の証拠を保持。次はG3-E1で保存した制作状態/構図の順3必須条件と順6の依存を照合し、G3-Fで残る終了条件を整理する。既知未達を完了扱いにしない。モデル区分：高性能（保存安全性の診断・実装・検証）、サブエージェントなし。


## mainと制作画面の同期（2026-11-13）

[PR #288](https://github.com/baisound/BAI_CREATER_STUDIO/pull/288)をmain0afff1aへ統合。実装c602c17、ログ書式ca1d77d。利用者mainと既存codex-nextをfast-forward。8765番と以前のPID34300は停止済みで、競合がないことを確認して利用者main/server.pyをPID4124で非表示起動した。HTML/render-job-v69.js/webmcp.jsは利用者mainと配信内容が全バイト一致し、GET完成物一覧に新しいunreadable_count=0が返る。

Chromeの旧タブ1055946273は取得できず、現在の一覧にも制作URLはなかった。同じChromeに同じURLの新タブ1055946470を開き、書き出し画面で既存作品・完成動画3件（旧版を含む）を確認し保持。既存2クリップへ試験編集を加えていない。CUA画面撮影は5秒で時間切れとなったため、実画面の確認はAX表示による。公開した画像は隔離試験の合成素材だけで、利用者素材は投稿していない。

利用者の素材/作品/完成動画/exports/studio.zipの515ファイルとdirty一覧は前後一致。集約SHA-256は89b7599826236e16936fcb87ea33d705d29801d3515c1d8e78474896cfe4286d。[同期数値](../../qa/render-protection-main-sync-20261113.json)。[IssueのPNG](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81#issuecomment-6827468757)は公開配信のPNG MIME/内容とOwner確認原本の一致も確認。GitHub自動checkの登録はなく、ローカル検証と区別する。次はG3-E1。G3-D/順3全体や既存未解決は維持し、OGV長尺は低優先のまま。


## 2026-11-13 G3-E1：保存制作状態と構図

2026-11-13 G3-E1、保存配置/表示/固定/静止カメラを作品切替・再読込後にUI/API/公式SDK/ネイティブWebMCPで照合。合成GLBの保存カメラ有無・半透明を通常/縦長欄の6条件で非0In15〜17F/30fpsの実MP4と比較し、IoU>0.85/重心差<0.01/内部RGB平均差<=8を確認。3D中間層のマイクロ秒丸めで末尾1Fが欠ける不具合をFPSの正確な時刻単位へ修正。24/29.97/30/60fps×1/3/17Fと時系列色を検証。正常3Dの内部記録を未読履歴に数える不具合も修正。Win Python69成功/Ubuntu68成功・Win限定1skip、Win実Chrome157/RTX4070SUPERの最終Node4成功。実PMX/S01と動作/保存障害回帰も確認。順3全体は未完。docs/v05/SAVED_STATE_COMPOSITION_20261113_JA.md

[契約・依存照合・実測と失敗記録](../v05/SAVED_STATE_COMPOSITION_20261113_JA.md)。静止カメラ/自動構図の既存合格を保持。順6の旧カメラ取込はOwnerが時刻付きで写すと決定済みで、判断待ちの再質問は不要。大型S01は旧の大きさ優先を維持し初期構図は順6。次はG3-F1でA〜Eの証拠/必須未達/環境制限/後段依存を対応付け、順3の終了判定を整理する。未解決を残したまま順3全体を完了にしない。モデル区分：高性能（仕様照合・不具合診断・実装・検証）、サブエージェントなし。
