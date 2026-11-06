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
