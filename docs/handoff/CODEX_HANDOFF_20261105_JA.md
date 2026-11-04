# Codex への引継ぎ（2026-11-05、Claude Code から）

所有者の依頼「切りの良いところでコーデックスへの引継ぎを作成してください」による。基準は main `87ba6b9`（PR #226 まで）。画面の呼び方は、①が `/` と `camera.html`、②が `/workspace/NN`、③が v0.5（`/studio/v05`）。いまの制作画面は③です。

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
- **所有者への確認が残っているもの：** 旧ダンスと旧タイムラインの動きが同じキャラで重なったときの優先（カードで質問中）。いまは既定の「タイムライン優先」で動いています（ダンスは置くが割り当てない）。

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
- **所有者のチェックアウト** `D:\BAI\BAI_CREATER_STUDIO\BAI_Creator_Studio` は、`7935400` のままです（main より約80コミット古い）。
  - 未コミットの `data/` の変更や未追跡のファイルがあります。
  - 許可なく更新・変更しないでください。`data/` は読み取りだけです。

## 6. 守ること（AGENTS.md の要点）

- 計画外の機能を足さない。承認済みのロードマップと所有者の指示の順に進める。
- 所有者のチェックアウトと data を変更しない。原本の SHA-256 を、作業の前後で照合する。
- 試験の skip・無効化はしない。実行しなかったもの・環境で通らなかったものは、未検証と書く。
- 作業の各段階で `python tools/work_state.py start/done --agent codex` を記録し、コミットと push に含める。
- コミットは日本語で、pathspec を指定して行う。force-push はしない。
- 所有者に動作確認は頼まない（Phase E の全機能が終わるまで）。見た目は開発側が画像を見て判定する。

モデル区分：引継ぎ文書の作成は高性能モデル。
