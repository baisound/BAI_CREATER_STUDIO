# P2 既存機能の新UI移植 詳細設計 v5 — 2026-10-20 【v5 承認済み（条件付き・最終判定 2026-10-20）：条件 C1〜C10 は本版に反映済み。WP-00a-1 から実装してよい。④〜⑦は各節の O-xx を決めてから（§3 の完了ゲートどおり）】

> 2026-10-21 オーナー追補：素材管理のモーションに見本画像と再生プレビューを求めるIssue #28、全3D画面の中ボタン操作を求めるIssue #29が追加された。本書内の「MOTION-016サムネイルは◇・無地タイル」の記述は当時の基準として残し、現在の実装・受け入れ条件は[追補設計](MOTION_016_ASSET_PREVIEW_NAVIGATION_20261021_JA.md)を優先する。他の◇項目の実装許可には拡張しない。

- 位置付け：所有者決定（2026-10-20、`docs/roadmap/ROADMAP_JA.md`「25画面UIモック先行」節）の **P2（既存機能を新UI `studio/` へ移植）** を、標準モデル（Sonnet 系）が設計判断なしで実装できる細かさまで決める詳細設計。**新機能の追加ではない。** 各項目は、旧画面（`index.html`・`camera.html` とそれらが読み込む JS）か既存の Python API に実在するコードを根拠にする。根拠のないものは「◇ 未実装のまま」に入れる。
- 作業の流れ順（所有者決定・固定）：①旧画面の動作記録（完了：`docs/ui/LEGACY_UI_INVENTORY_JA.md`）→ **②プロジェクト新規作成・保存/読込 → ③素材取り込み・素材管理 → ④キャラクター・ステージ読込と3D表示 → ⑤モーション（VMD）適用・タイムライン再生 → ⑥カメラ → ⑦書き出し**。本書は②〜⑦を扱う。②③はそのまま実装できる細かさで書く。④〜⑦も同じ章立てで書き、未決事項は O-xx として明示する。
- 正本の優先順位：`AGENTS.md`（スコープ凍結・モデル使い分け）＞ `docs/roadmap/ROADMAP_JA.md` の所有者決定 ＞ `docs/roadmap/PHASE_E_DETAILED_DESIGN_20261020_JA.md`（v4、条件付き承認。本書と接するのは §0・§2.7・§2.9・§2.11・§4・§7）＞ 本書。矛盾を見つけたら実装を止め、本書を直す。
- 基準コード：ブランチ `claude/project-thread-8gcwq2` の **`5865209`**（旧制作画面を本来の配置に戻したコミット）。v1 は `f473eeb` 基準だった。`5865209` で `index.html` の 52 行目以降が **20 行下へずれた**ため、本書の `index.html:行` はすべてずれた後の番号に直した。直した値は 2026-10-20 に読み直して確かめた（例：`ivLoad` 206行、`importFiles` 237行、`fetchProjectVersion` 371行、`externalProjectApply` 376行、`reconcile` の `setInterval` 455行、`studio-workflow-binding` 615行）。他のファイルの行番号は `f473eeb` から変わっていない。旧画面は今後も別の作業で変わることがあるので、**実装時は記載した関数名・要素IDで探す**（行番号は目安）。
- **旧制作画面の配置（`5865209` で戻した本来の配置）**：幅1101px以上では、ページ全体はスクロールしない。左にモーション一覧（独立スクロール）。中央は上に3Dプレビュー（`#threecanvas`・再生操作・モーション名）を固定し、下は独立スクロール領域。この領域に、素材登録・タブ・各パネルと、以前 `<main>` の外にあった節（骨格解析 `#skeleton-lab`、足接地 `#foot-qa`、AI `#bai-ai-manager`、IK `#bai-pose-editor` など）が入る。右は `#chain-side`（コンビネーション、独立スクロール）。この配置は `index.html` 末尾の `studio-layout-controller-v01420` が DOM を移して作り、要素IDは変わらない。幅1100px以下は従来どおり縦に積む（`LEGACY_UI_INVENTORY_JA.md`「本来の配置に復元」）。本書は旧画面を「どの機能がどの要素にあるか」の見本としてだけ使う。**旧画面の配置は新UIへ写さない**（R6）。新UIの配置は新UIモックの各画面のパネル構成に従う。
- **所有者決定（2026-10-20、`ROADMAP_JA.md` 4249bc0・8373b54）を本書に入れた**：
  - 主要シナリオは MMD の「歌ってみた」動画の制作。流れは VRM/PMX 読込 → ステージ配置 → カメラ設定 → BGM（歌音声）配置 → VMD/FBX 設置 → エフェクト → 踊らせて書き出し。P2 の通し確認（E2E、§2.9）と移植の優先の軸にする。
  - NF-014 のうち**ステージ配置の基本（位置・回転・大きさ）だけ**を P2 ④ に入れる（§2.4 ④-11）。ツリー編集・表示/影/ロックなどは未承認のまま。
  - 新UIの**未接続の区画は薄く表示**し、「未接続（まだ使えません）」と明示する。機能は消さない（§1.13、WP-00c）。
  - VMD に含まれる**表情・口パクのモーフ再生**は P2 ⑤ と通し確認で扱う（§2.5 ⑤-2）。自動リップシンクと表情の編集は、Phase E の次（F の前）に前倒しされた（順序：P2 → Phase E → リップシンク・表情モーフ → F → MMDエフェクト → C → D → G → H）。本書では扱わない。
  - 所有者は UI を自分で判定しない。各 WP の完了時の所有者確認は、**5手順以内の「これを試してください」**だけにする（§3.1）。
- 設計作業のモデル区分：本書の作成とレビューへの対応は高性能モデル（Opus 系）。実装の割当は §3。
- **所有者への確認（最初に読む。§5.4）**：**Q1 新規プロジェクトの作成**は、旧画面にも無く、作ると取り消しのできない上書きになるため、既定では ◇ 未実装のまま残す。P2 に入れる場合は指示が必要。ほかに Q2（旧画面の機能の中に削除してよいものはあるか）、Q3（⑥の後の旧 `camera.html` の扱い）、Q4（主要シナリオのうち、既存のコードが無い「BGM の配置」と「音声付き動画の書き出し」の扱い）がある。

---

## 変更履歴

### §2.5（⑤ モーション）の詳細化（2026-10-20、Opus。HEAD `8de3801`）

- §2.5 を WP-05a〜05g に分け、O-⑤-1〜8 を旧コードの行を根拠に決めた（§2.5(h)）。主な決定：82パターン表・連結再生・タイムライン・補正レイヤー・模式再生の計算はフォーク（`*.fork.js` は計5つ）、**新しいタブは作らない**（モックが正本。コンビネーションは SCR-05 の下部、タイムライン編集は SCR-13 の下部。O-⑤-3）、自動保存の競合は内容の比べ（O-⑤-4）、外部コマンドは表示中の画面だけ（O-⑤-5）、`clip`・`frame` は明示の［記録］だけ（O-⑤-7）、VRM への VMD は P2 に入れない（O-⑤-8）。
- S5 は最初の小さな WP-05a（SCR-13［編集］の PMX＋VMD・GLB/VRM のクリップの再生）で通す。Q5 には依存しない（依存点は §2.5(h) に明記）。
- 批評（1回、§2.5(j) 5-1〜5-13）を反映：`/api/mapping` と `/api/conversion-map` の混同（変換用の対応表は WP-07 へ）、§1.8 の `v01641_preview_guard.js` の誤り、最小 VMD にボーンの動きが無い（センター 30F を足す）、テストのポートの食い違い（§4.1 に注記）ほか。
- 連動して直した節：§1.2・§1.5（`studio:sync-command`）・§1.6-7・§1.8・§1.9・§2.7 O-⑦-1・§2.9 S5・§3（WP-05a〜05g、06b・07 の依存）・§3.1・§4.1・§4.2・§5.1 K12・§5.3・§5.4（Q6・Q2 の追加・O-⑤-8）。

### v4→v5（最終判定、2026-10-20）

**判定：条件付き承認（APPROVED WITH CONDITIONS）。** 判定者は高性能モデル（Opus 系）で、v4 を `server.py`・`project_state_bundle.py`・`bai_camera.py`・`camera.js`・`camera_3d.js`・`camera_project_bundle_ui.js`・`index.html`・`studio/` と突き合わせた（HEAD `eda0a46`。`5865209` からコードの変更は `tools/work_state.py` だけで、本書の行番号はすべて合っていた）。スコープ（AGENTS.md・ROADMAP_JA.md の 2026-10-20 所有者決定）への違反と、未承認の NF の混入は見つからなかった。B-1〜B-3・隔離ハーネス・厳格な読込の方針は正しい。次の条件 C1〜C10 は**どれも文書の修正だけで済む**ので、判定者が本版に反映した。標準モデル（Sonnet 系）は本版だけを見て WP-00a-1 から実装してよい。

| 条件 | 見つけた穴 | 本版での反映 | 反映先 |
|---|---|---|---|
| C1 | `POST /api/export-vmd-job`・`/api/run-vmd-conversion` は `BASE/exports/`（`data_dir()` の外、`server.py:732〜892`）に書き、Blender があれば実行もする。§2.9 S8 と WP-07 のテストがこれをサーバーまで送ると、隔離していても実リポジトリに書く（Phase E §2.9「この経路を呼ぶテストは無い」とも矛盾） | テストではこの2つの POST を必ず `page.route` で受け止め、サーバーへ送らない。確かめるのは「送られる本文」と「スタブの応答の表示」だけ | §2.7 O-⑦-3、§2.9 S8、§4.1 |
| C2 | §3.1 の所有者確認は `python server.py` を実 `data/` で動かし、保存の操作をさせる（所有者の制作状態を書き換える）。R11（AGENTS.md 規則7）とも食い違って読める | 確認は `data/` を写した試用フォルダを `BAI_DATA_DIR` で指して行う（Windows の手順付き）。§3.1 は任意の手順の提示で、完了条件にせず結果を待たない、と R11 に書いた | R11、§3、§3.1 |
| C3 | `POST /api/camera/project/reset` の「読めるのに退避が無ければ作ってから」が、読めない・正常・退避失敗のときにどうするか決まっていない（K10 の「退避に失敗したら初期化しない」が本文に無い） | 判定の順番を固定し、退避できないときは書かない。正常なファイルでも退避してから初期化する。テストを足した | §1.15 B-3 の 2b、§2.2(g)、K10 |
| C4 | B-4：`validate_workspace` は3キーの dict を組み立て直して返す（`project_state_bundle.py:49`）ので、受け付けるだけでは `stage` が保存で消える。既存の `stage` を残す処理の読み方、既存値が不正なとき、本文に `workspace` 自体が無いとき（`:98-99` でファイルごと削除）が未定義 | 関数単位で書き直した（`validate_stage`、`save_bundle` のマージ手順、不正な既存値は 400 で書かない、`workspace` 無しは今の動作のまま＝新UIと旧画面は必ず `workspace` を送ることをテストで固定） | §1.15 B-4、§2.4(g) |
| C5 | `cameraInvalid` の間も自動保存は動くが、保存後の `GET /api/project/bundle` は必ず 422 になる。その扱いと、カメラが外部で直った（tick が 200）ときの戻り方が未定義 | `cameraInvalid` の間は保存後の統合バンドルの GET をしない。tick が 200 を受けたら `cameraInvalid` を消し、7 の規則（未保存なし→読み直し、ありの→`externalChange`）に従う | §2.2(d)-4・7 |
| C6 | §2.9 S7「⑤の再生と⑥のカメラを同じ時刻で再生」は、PMX＋VMD とカメラを同期させる既存コードが無いので、新機能を作る読み方ができる | S7 は SCR-02（カメラホスト）の中の既存の同期（`camera_3d.js` が workspace の GLB クリップをカメラの時刻で動かす：`updateTime` 282行）だけで確かめる。モーフの確認は S5（SCR-13）に置く。⑤のビューポートと⑥の新しい同期は作らない | §2.9 S5・S7 |
| C7 | SCR-01 の `form:newProject` は5か所（`app.js:478` ヒーロー、`app.js:490` クイック操作、`screens.js:93` ツール、`screens.js:112` テンプレート3つ）。v4 はツールとヒーローしか書いていない | 5か所すべてを同じ `unimpl` にする | §2.2(b) |
| C8 | WP-00c 導線点検の項目1「今できること・移動先」の中身の決め方（40個の `un()`）と、項目4のラベルを消す条件が無い。`PH.LIP` の文言（`screens.js:31`「Phase F の後」）が所有者決定（リップシンク・表情は F の前）と合わない | `un()` の任意の第5引数 `next` と既定の文言・ボタンの規則を決めた。項目4は 3D ビューの区画が `real` になったら出さない。`PH.LIP` を直す | §3 WP-00c |
| C9 | `legacy-project-save` の2回目の保存は、B-2 の版の取り直し（非同期）より先に押すと `alert` で失敗する（`projectRevision` は IIFE の中なので外から読めない） | 同期の表示の後、`/api/project?envelope=1` の応答を `waitForResponse` で待ってから押す | §2.2(g) |
| C10 | 共通の完了ゲートの node テストの実行コマンドが文で書かれているだけ。既存の `test_camera_*.cjs/mjs` と `test_bundle_snapshot_consistency.py` は**リポジトリ直下**にある | `npm run test:node-all` を定義した。直下にあるテストのパスを明記した | §1.14、§3 共通ゲート、§4.3 |

- 判定者の申し送り（文書の修正ではないので条件に入れない）：OWNER-5（所有者は UI を自分で判定しない。5手順以内）は `ROADMAP_JA.md` の所有者決定の節に記録が無い。所有者決定として扱うなら、コーディネーターが `ROADMAP_JA.md` に1行足すこと。§3.1 は C2 により任意の手順として書いたので、記録が無くても実装は止まらない。
- 次の作業：P2-WP-00a-1（データの隔離）から。Sonnet で実装 → Opus でレビュー。

### v3→v4（批評3回目と所有者決定、2026-10-20）

| ID | 指摘・決定 | 対応 | 反映先 |
|---|---|---|---|
| 3-M1 | `test_bundle_snapshot_consistency.py:18` が、`GET /api/camera/project` のソースの文字列（`camera_project=camera_read`）を探している。B-3 で `read_project` に変えると失敗する。 | WP-00b で、この検査を振る舞いのテスト（同時の GET と POST で版が一致する）に置き換える。§1.14 の表に足し、Phase E §4.2 の WP-02d 行に注記した。 | §1.14、§3、Phase E §4.2 |
| 3-M2 | 壊れたカメラ保存データのとき、利用者に打つ手が無い（復旧の操作が WP-02a まで無い）。 | 両方を採る。(b) 承認済みの Phase E §2.7 の `POST /api/camera/project/reset` を、仕様どおり前倒しする（新UIは確認ダイアログを出す。台帳 `planned_in` に追加し、WP-02a の台帳にも注記する）。(a) 422 の文言に、退避名と手で直す手順を入れる。テストを足し、リスク K10 を足した。 | §1.15 B-3、§2.2(d)、§2.6、K10、Phase E §2.7・§4 注記、台帳 |
| 3-M3 | 保存の結果が、待っている間に始まった別の読込・保存を上書きすることがある。自動保存と同期の `tick()` が同時に動く。 | 世代番号 `saveSeq` を持ち、**await のたびに**確かめる（変わっていたら結果を捨てる）。自動保存は、動いている `tick()` の終わりを待ってから送る。偽の時計を使った単体テストを足した。 | §2.2(d)(g) |
| 3-M4 | (a) 同期の失敗で `status` を `error` にすると、画面全体が使えなくなる。(b) 統合バンドルが 422 のとき、カメラと関係の無いコンビネーションまで止まる。 | (a) 同期の失敗は `syncError` に入れ、`status` は `ready` のまま。(b) 422 でも、コンビネーションは封筒（`GET /api/project?envelope=1`）から読み込む。コンビネーションの自動保存・履歴は使える。止めるのは統合保存と SCR-02 の mount だけ。 | §1.4、§2.2(d) |
| 3-M5 | カメラ単独の保存（O-⑥-2）の後、統合バンドルの版が古くなり、次の［保存］が 409 になる。 | `camera.js` の保存成功の後に、無害なイベント `bai-camera-saved` を発火する（旧画面では誰も受けない。R5(c)）。`camera-host.js` はこれを受けて統合バンドルの版を取り直す。テスト：カメラ単独の保存の後に統合保存が 200。 | R5、§2.6、§2.2(g) |
| 3-M6 | ストアとカメラホストの間の workspace の受け渡しが往復し、1秒ごとの取得で frame が常に dirty になる。`catalog()` を呼ぶと選択肢が重複する。 | 伝えるのは**外部からの変更だけ**（`source` の印を付ける）で、`asset`・`clip` が違うときだけ `bai-camera-workspace-restore` を送る。`frame` は `bai-camera-bundle-restore` の `frame` で送るか、送らない。1秒ごとの取得はやめ、frame は SCR-02 を離れるときと［保存］の前に取る。**frame だけの変化は dirty にしない**（決定）。restore を必要なときしか呼ばないので、`catalog()` の重複は起きない（直さない）。O-⑤-7 に制約（`frame ≤ camera.duration`、`clip` は GLB のアニメーションの番号）を足した。 | §2.2(d)-9、§2.5、§2.6 |
| 3-M7 | `read_project` の細部が決まっていない。 | `validate(DEFAULT)` の複製を返す。`read_bytes` してから UTF-8 でデコードする。捕まえる例外は `ValueError, TypeError, KeyError, AttributeError, UnicodeDecodeError`。退避コピーを作れなければ `CameraProjectInvalid(backup=None)`。テストを足した。 | §1.15 B-3、§2.2(g) |
| 3-M8 | `camera_bundle_core.js` の読み込み方とテストの方法が決まっていない。assetRef の持ち主が曖昧。 | 単体テストは `vm` で読み込み、`globalThis.BAICameraBundleCore` を確かめる。`test_camera_html_wiring_recovery.py` を確かめ直す。`features/project.js` は `loadLegacyScript` で読み込み、型は `.d.ts`、読めなければ保存を無効にする。assetRef は保存のときにストアの `asset` から作る（カメラ側のフィールドではない）。Phase E §4.2・§7 に注記した。 | §1.8、§2.6、Phase E §4.2・§7 |
| 3-m1 | R5 の「次の2つだけ」と、並んでいる項目の数が合わない。 | 「次の3つだけ」に直した。 | §0 |
| 3-m2 | 旧画面のバグ修正のテストを1ファイルにまとめるかどうかが、4か所で食い違う。 | `tests/legacy-project-save.test.cjs` の1ファイルにまとめる、で統一した。 | §2.2(g)、§3、§4.1、§4.3 |
| 3-m3 | 旧 `camera.html` で［保存］を押すと 413 のコンソールエラーが出て、テストが失敗する。 | 413 を許可リストに入れ、`#status` に「保存失敗」が出ることを確かめる。 | §2.2(g) |
| 3-m4 | WP-06a の「前後で同じ」の確かめ方。 | `git worktree` で mount 化の前のコミットを別のディレクトリに取り出し、別のポートで同じ操作をして結果を比べる。 | §2.6 |
| 3-m5 | 封筒の分岐（B-1）にも try が無い。 | B-1 の一部として try を足し、想定外の例外は 500 にする。 | §1.15 |
| 3-m6 | Phase E §4 の WP-02a 行に前倒しの注記が無い。 | 注記した。 | Phase E §4 |
| 3-m7 | WP-02d より前に、ホストから workspace に何を送るか。 | `{frame, asset, clip}` だけ。 | §2.6 |
| 3-m8 | Q1 の回答を待つことが、台帳に出ていない。 | `P2_PORT_STATUS.json` の WP-01 の完了ゲートに「Q1：所有者回答待ち」を書く。 | §3 |
| 3-m9 | `CAMERA_OWNED_WORKSPACE_FIELDS`・`mergeWorkspace` が P2 では何もしないことが分かりにくい。 | 「P2 では何もしない（WP-02d で中身が入る）」と明記した。 | §2.6 |
| 3-m10 | `sequence/edit` の 422 が「旧画面への影響」に載っていない。 | 載せた。 | §1.15 |
| 3-サブコミット | WP-00b の中で、B-3 が一番危ない。 | B-3 を WP-00b の中の別のコミットにし、そのコミットだけ Opus でレビューする。 | §3 |
| OWNER-1 | 主要シナリオ（歌ってみた）の通し確認 | §2.9 を新設した：E2E テスト1本（`tests/studio-p2-e2e-main.test.cjs`、専用のポート）を P2 の段階ごとに伸ばし、最初から通し直して「どこまで通しで動いたか」を台帳に書く。BGM の配置と音声付き動画の書き出しは既存のコードが無いので、通し確認では「既存機能なし」として記録し、Q4 で所有者に確かめる。エフェクトは承認済みの後段なので飛ばす。所有者の確認したい一覧（素材取込〜書き出し）は、Phase E の各 WP の完了時に足す。 | §2.9、§3、§5.4、Phase E §7 注記 |
| OWNER-2 | NF-014 の一部（ステージ配置の基本）を P2 ④ に承認 | §2.4 に ④-11 を足した：SCR-06 の既存のトランスフォーム部品で、位置・回転・大きさを調整する。保存先は workspace の任意のキー `stage`（ストアが持つ。サーバーは、送られてこなければ既存の値を残す）。 | §2.4、§2.2(d)-9、§1.15 B-4、Phase E §2.8 注記 |
| OWNER-3 | 未接続の区画を薄く表示 | WP-00c に入れた：`status` が `real` 以外の区画を薄くし、「未接続（まだ使えません）」を付ける。操作は消さない。テストと状態表示が正直かのテストで一貫性を保つ。 | §1.13、§3 |
| OWNER-4 | VMD の表情・口パクのモーフ再生 | ⑤-2 に含めた。PMX は既存のコードの経路（three の `MMDLoader.loadAnimation`）がモーフのトラックも作るので移植する（実ファイルでは未検証）。VRM へ VMD を当てる経路は旧画面に無いので、未決事項（O-⑤-8）にした。 | §2.5 |
| OWNER-5 | 所有者は UI を自分で判定しない | 各 WP に5手順以内の「所有者確認手順」を足した。 | §3.1 |
| AUDIT | 導線点検 `docs/ui/NEW_UI_FLOW_AUDIT_20261020_JA.md`（0620206）§5 | 項目1〜5（表示の修正だけ）を WP-00c に入れた。項目6〜14 は「要所有者OK」として列挙だけした。 | §3、§5.4 |

### v2→v3（批評2回目、2026-10-20）

| ID | 指摘 | 対応 | 反映先 |
|---|---|---|---|
| 2-B1 | 新UIのカメラホスト（⑥）は `camera.js` をそのまま動かす。`GET /api/camera/project` は壊れたファイルでも既定値を返し、カメラ単独の保存（If-Match 無しでも書く）と `sequence/edit` はそのまま上書きする。統合バンドルだけを守っても、壊れたカメラ保存データが消える。 | 読込の厳格化を、カメラの `GET /api/camera/project`（両形式）・`POST /api/camera/project`・`POST /api/camera/sequence/edit` にも前倒しする（同じ `CameraProjectInvalid`／422 `camera_project_invalid`）。`camera-host.js` は `project.cameraInvalid` の間は mount せず、◇ CAM-G06 の説明を出す。旧 `camera.html` も既定値を黙って編集せずにエラーを出すようになる。これはデータ消失を防ぐバグ修正（B-3）として R5 に記録する。テスト：壊れたファイルで SCR-02 は mount しない、バイト列は変わらない、`camera.html` はエラーを出して保存しない。 | R5、§1.1、§1.15 B-3、§2.2(g)、§2.6、§3 WP-00b、Phase E §2.7 注記、台帳 |
| 2-M1 | 同期の `tick()` が、保存中や自動保存の待ちの間にも統合バンドルの版を比べ、自分の保存を外部の変更と取り違える。422・500 を「未接続」として扱っていた。 | `tick()` は `status==='ready' && !saving && !autosavePending` のときだけ動く。`saving` は保存後の GET が終わるまで true のまま。`tick()` で 422 を受けたら `cameraInvalid` の状態にし（未接続ではない）、500 は文言付きの `error` の状態にする。テスト：自動保存の後に「外部の変更」のトーストが出ない。 | §2.2(d)(g) |
| 2-M2 | GLB/VRM の再分類のテストが、`server.py:772` の保存名（SHA-256 先頭20桁＋**拡張子**）と合っていない（同じ中身の `.vrm` は保存名が違うので衝突しない）。 | テストを直した：`a.glb`（モーション）の後に同じバイト列の `b.glb`（モデル）で確認が出る。VRM は別のテストにし、同じ中身でも衝突しないことを確かめる。 | §2.3(d)(g) |
| 2-M3 | 統合保存の後の読み直し（`server.py:373`）まで厳格にすると、保存は成功したのに 422 を返す経路ができる。 | 厳格にするのは書く前の読込（369行）と GET（171行）だけ。373行は今のまま（非厳格）。WP-00b の完了ゲートに `test_bundle_snapshot_consistency.py` を足す。 | §1.15、§3 |
| 2-M4 | workspace の所有者が「フィールドの種類」で分けられておらず、カメラ画面のスナップショットが ④⑤ の `asset`・`clip`・`frame` を上書きする。 | フィールド単位で所有者を決めた：`asset`・`clip`・`frame` はストア（`features/project.js`）が持つ。カメラホストが送るのはカメラ側のフィールドだけ。ストアの変更は `bai-camera-workspace-restore` でホストに伝える。O-⑥-5 として決定済みにした。 | §2.2(d)-9、§2.6、Phase E §7 注記 |
| 2-M5 | 共有した `camera.js` で、Phase E の新機能が旧画面に出ないことを「要素の有無」だけで守っている。 | `mount(root,{host:'legacy'|'studio'})` にし、Phase E の新機能は `host==='studio'` のときだけ有効にする（要素の確認も続ける）。Phase E §7 に注記した。`isDirty()` は Phase E の `BAICameraDebug.getState().dirty` と同じ変数を読む。 | §2.6、K8、Phase E §7 注記 |
| 2-M6 | 統合保存・復元のロジック（復元前の検証、Phase E WP-02d で足す assetRef の記入・検証の緩和・フレームの整数化・423 の扱い）が、`camera_project_bundle_ui.js` と `features/project.js` の2か所に分かれる。 | DOM を使わない共有モジュール `camera_bundle_core.js`（UMD）を作る（WP-06c）。両方がこれを使う。Phase E WP-02d の注記を広げた。 | §1.8、§2.6、§3、付録B、Phase E §4.2 注記 |
| 2-m1 | `data-act="real"` のボタンが `runAction` を通る書き方になっていた。 | 実際に API を呼ぶボタンは、feature 部品が自分で `onclick` を付ける。`runAction` は `real` を扱わない。 | §1.6 |
| 2-m2 | `mount` の戻り値が2つのファイルでそろっていない。IIFE を消す書き方だった。 | 戻り値を `MountHandle` にそろえた。IIFE は残し、その中に `mount` を置く。 | §2.6 |
| 2-m3 | B-3 の細部：422 の本文に `backup` を入れる方法、`CameraProjectInvalid` が `ValueError` だと既存の `except` に捕まって 400 になる、統合バンドルの GET に try が無い、`FileNotFoundError` は `OSError` の一種。 | 422 は `self.send` で本文を直接送る（`backup` を含む）。`CameraProjectInvalid` は `Exception` を直接継承する。統合バンドルの GET に try を足し、想定外の例外は 500（文言付き）。`read_project` は `FileNotFoundError` を最初に判定する。 | §1.15 |
| 2-m4 | 読めないファイルのテストを `chmod` で作ると、root で動かすと読めてしまう。 | `monkeypatch` で `Path.read_bytes` に `PermissionError` を出させる。 | §2.2(g) |
| 2-m5 | ポート・実行の細部。 | 照合テストに専用のポート 8789、ID 包含テストに 8788 を割り当てた。`node --test --test-concurrency=2`。`run-guarded.cjs` はグロブを自分で展開し、`data/` が無い場合も扱い、開発用サーバー（8765）が動いていたら警告する。 | §4.1、§4.3 |
| 2-m6 | `beforeunload` のテストで dismiss すると、再読込が止まり後片付けが残る。 | `dialog.accept()` にした。 | §2.2(g) |
| 2-m7 | `legacy-project-save` が初回の読込を待たず、旧画面の `alert` で止まる。 | 初回の読込の完了を待ち、`dialog` の処理を登録して失敗にする。 | §2.2(g) |
| 2-m8 | WP-06a の変更が大きく、1コミットだと見直しにくい。 | 2コミットに分ける（`camera.js`、`camera_3d.js`）。 | §2.6、§3 |
| 2-m9 | WP-00a に、レビューが要る部分と要らない部分が混ざっている。 | 00a-1（データ隔離、Opus でレビュー）と 00a-2（ハーネス・テスト用ファイル）に分けた。 | §3 |
| 2-m10 | Q1 が目立たない。 | 冒頭と §5.4 の先頭に置いた。 | 冒頭、§5.4 |
| 2-m11 | `status:'real'` の数が違う（24 は行数で、出現は26）。 | 26 に直した。 | §1.1、§1.13 |
| 2-m12 | 名前の長さの検査で、JS の `length`（UTF-16 の単位）と Python の `len`（コードポイント）が違う。GLB/VRM の名前は二重にデコードされる。 | 制限として書いた（クライアントはコードポイントで数える。`%` を含む名前は警告する）。 | §2.3 |
| 2-m13 | 状態行を置く場所が SCR-18 と SCR-01 で決まっていない。 | SCR-18 は中央の最初の行（全幅）。SCR-01 は `projectCard` の中のタイトルの下。 | §2.2(b) |

### v1→v2（批評1回目、2026-10-20）

| ID | 指摘 | 対応 | 反映先 |
|---|---|---|---|
| 1-B1 | カメラ保存データ（`camera_project.json`）が壊れていても `bai_camera.read()` は既定値を返す（`bai_camera.py:76〜78`）。そのため新UIで統合保存すると、壊れたファイルが既定値で上書きされ、復旧できなくなる。G-06（Phase E WP-02a）が未実装のままでは P2 の保存は安全でない。 | Phase E §2.7 の一部を **P2-WP-00b** へ前倒しする：`read_project` の読込エラー分岐、`CameraProjectInvalid`、退避コピー、`bad(...,code)`。使うのは統合バンドルの GET/POST だけ（`read_bundle(strict=True)`）。旧 `read()` は WP-02a まで変えない。新UIは 422 を受けたら保存を止め、理由を表示する。テストは pytest と Playwright。 | §1.15 B-3、§1.3、§2.2(d)(f)(g)、§3 WP-00b、Phase E §2.7 注記、Phase E 台帳 `planned_in` |
| 1-B2 | WP-00b の完了ゲートが、実 `data/` で動く `tests/legacy-ui-layout.test.cjs` の環境で旧画面の［保存］を押すものだった（実データを書き換える）。ハーネスの記述も不足していた（ポートの衝突、Chromium 変数名、テストごとのハッシュ比較が並行実行と競合、エラーの許可リスト、終了順）。 | そのゲートを削除し、隔離データ上の専用テストに置き換えた。サーバーを使う既存テストの分類表を追加した。ポートを再割当した（legacy-ui-layout は 8798 のまま、Phase E camera-ui は 8791）。実データのハッシュは全体ラッパーで1回だけ比べる。`expectErrors` を追加し、ブラウザーを閉じてからサーバーを止める。 | §1.14、§3、§4.1、Phase E §2.9 注記 |
| 1-M1 | FBX は同じ種類・同じ名前だと確認なしで上書きされる（`server.py:961` の `fid`）。GLB/VRM は同じ中身だと、既存の登録の名前・種類が置き換わる（`server.py:772〜777`）。どちらも見落としていた。 | 事前確認を2種類追加した（クライアントで同じ `fid`・SHA-256 を計算して照合する）。テストも追加した。 | §2.3(d)(g) |
| 1-M2 | 1ファイルずつの取り込みは旧画面より後退している（旧 `#motions`・`#vmd-input` は `multiple`、`importFiles` はループで処理）。 | 複数のファイルを選べるようにする。1ファイルを1行として順番に処理する。一括のタグ付け・変換だけを NF-004 として残す。 | §2.3 |
| 1-M3 | 旧スクリプト群（リターゲット・レビュー・補正レイヤー・足接地 QA・2D 模式再生）を移植対象から外していた。 | ④⑤の移植対象として行ごとに書いた。IK（`pose_ik_ui.js`）と AI（`bai_ai_ui.js`）は⑦の後に移植する（既定は残す）。Q2 は「この中に削除してよいものはあるか」だけにした。 | §1.8、§2.4、§2.5、§2.8、§5.4 |
| 1-M4 | `camera.js` などをフォーク（分岐コピー）すると、Phase E のコードが2本に分かれる。 | 動作を変えない `mount(root)` 化に変更した（要素の取り方だけ `root` 基準にする）。`camera.html` は `mount(document)`、新UIは `mount(panelRoot)`。コードは1本で、Phase E と共有する。 | R2・R5、§1.7、§1.8、§2.6、K8、Q3 |
| 1-M5 | 旧 ESM（ルート直下）の型宣言と、写したコードの型検査の扱いが決まっていなかった。 | `tsconfig.json` の `paths` で `/camera_follow_config.js` などを型宣言ファイルへ対応させる。批評案の `declare module '/…'` は TS2436 で失敗することを tsc で確かめたので採らない。写したコードは `*.fork.js` に置き、`// @ts-nocheck`＋理由を付ける（一覧を固定）。 | §1.8、§1.12、§3 WP-00c |
| 1-M6 | `api.js` の誤りの分類が足りない（`error_code`・423・403・422 がない）。`too_large` の上限が 400MB で固定されていた。 | `serverCode`、`locked`・`forbidden`・`unprocessable`・`client` を追加。上限は呼び出しごとに指定する。WP-02d の後に必要な見出し（ヘッダー）と 423 を明記した。 | §1.3、§2.2、Phase E §4.2 注記 |
| 1-M7 | `runAction` の `nav:` はクエリを扱えない。v1 は `href:` で全体を読み直す方式だった。 | `navigate(id,{tab,query})` に変え、`nav:08?import=1` を読めるようにする。ダイアログを開いた後で `import=1` を消す。 | §1.6、§1.9、§2.3 |
| 1-M8 | ④の「制作に使う」が `workspace` 全体を置き換え、`frame` や今後のフィールドを消していた。 | 既存の値にマージする。`workspace` の所有者を1つに決めた（カメラ画面がカメラ関連を持ち、④は `asset` だけを書く）。コンビネーションが未作成なら警告する。 | §2.4、Phase E §7 注記 |
| 1-M9 | Phase E WP-03 の作業（データ隔離など）を前倒しすることが、Phase E 側の文書と台帳に書かれていない。 | Phase E §4 の表と §4.2 に「P2-WP-00a で実施予定」と注記した。台帳に P2 台帳への参照と `planned_in` を追加した。 | §3、Phase E §4・§4.2、`PHASE_E_IMPLEMENTATION_STATUS.json` |
| 1-M10 | O-⑥-2 の既定「カメラ単独の保存を廃止」は、Phase E の If-Match 設計より前に保存経路を変えてしまう。 | 既定を「WP-02d までカメラ単独の保存を残す」に変えた。 | §2.6、Phase E §7 注記 |
| 1-m1 | テスト専用の分岐 `__P2_TEST_SKIP_FBX_PARSE` が本番コードに入る。 | 削除した。上書きの確認を FBX の解析より**前**に行う。こうすれば置き換えのテストは確認画面で取り消せるので、解析は不要になる。最小 FBX の生成（標準ライブラリだけで ASCII FBX 7.4）は O-③-1 の任意項目にした。 | §2.3、K6 削除 |
| 1-m2 | R2（フォーク）と §2.6 が矛盾していた。 | R2 を書き直し、§2.6 と同じ方針にした（mount 化）。 | §0 |
| 1-m3 | ストアに `combinationMissing`・`syncRevision`・`lastCommandId` がない。 | 追加した。封筒の版 `projectRevision` と、部分ごとの未保存フラグ `dirty` も足した。`status` が `ready` でないときは、戻す・やり直すを何もしない操作にする。 | §1.4、§2.2 |
| 1-m4 | `restoreHistory` が `combination.selected` を変えていたが、旧 `restore` は変えない。 | 変えないようにした（`index.html:375` と同じ）。 | §2.2 |
| 1-m5 | 同期の初回は版を覚えるだけで、読込から初回までの変化を見逃す。 | 初回も統合バンドルの版を比べる。 | §2.2 |
| 1-m6 | 後始末が画面の切り替え時だけで、同じ画面の再描画では動かなかった。 | 後始末を `render()` のたびに実行する。テストも追加した。 | §1.6 |
| 1-m7 | 状態表示が正直かを確かめるテストが、正規表現で `screens.js` を読んでいた。 | `screens.js` を import する Node テストに変えた。`screens.js` から機能モジュールを import しないことを規則にした。完了ゲートで evidence のテストを実際に走らせる。シェル自体の機能（FAQ・テーマ・ヘルプ）は `shell:true` で例外にする。 | §1.13 |
| 1-m8 | トップバーの `#project-chip` はモックにない部品だった。 | 削除した。状態は SCR-18 の状態行とトーストで出す。 | §2.2 |
| 1-m9 | 「ファイルがある素材だけ表示」は旧画面にない機能だった。 | 削除した。 | §2.3 |
| 1-m10 | `bai.studio.lib.v1` の保存。 | 問題なし（変更なし）。 | §1.11 |
| 1-m11 | 新UIで明示保存だけにすると、旧画面の自動保存より後退する。 | **旧画面の自動保存を残す**：コンビネーションの編集は 450ms 後に `POST /api/project`（If-Match に封筒の版。B-1 修正が前提）で自動保存し、その後で統合バンドルの版を取り直す。明示の［保存］は統合バンドル（カメラ・workspace を含む）。タイムライン編集の 550ms 自動保存（`index.html:802`）は⑤で移植する。 | §2.2、§2.5、§5.3 |
| 1-m12 | 分類ラベル「モーション（VMD）」に FBX・GLB のモーションも入る。 | 「モーション」に変えた。 | §2.3 |
| 1-m13 | SCR-18 左の一覧部品の名前（キー）が決まっていなかった。 | `projectList` にした。 | §2.2 |
| 1-m14 | three の devDependency とロックファイルの扱い。 | WP-00a で `package.json` と `package-lock.json` を更新する。three が無ければ 3D のテストは skip し、「未検証」と記録する。 | §3、§4.1 |
| 1-m15 | ホームの「最近の素材」は取り込みに依存する。 | WP-03 へ移した。 | §2.3、§3 |
| 1-m16 | WP-06 の規模を小さく見積もっていた。 | XL に直し、06a〜06d に分けた。 | §2.6、§3 |
| 1-m17 | （K2 の補足）B-1 を直した後でも、旧画面が外部の変更を取り込むと `projectRevision=null`（`index.html:376`）になり、手動で再読込するまで保存できない。 | WP-00b で最小限のバグ修正をする（取り込み後に版を取り直す）。 | §1.15 B-2、§3 WP-00b |
| 1-m18 | （追加指示）旧制作画面の配置を本来の形に戻した（`5865209`）。 | 基準コミットと `index.html` の行番号を更新し、旧画面の構造の説明を新しい配置に合わせた。 | 冒頭、§1.1 |
| 1-M4 補足 | 批評は `camera_project_bundle_ui.js` も mount 化する案だった。 | **mount 化しない**。新UIではこのファイルを読み込まず、②の保存に統合する。使わないファイルを変えないことで、旧画面への変更を最小にする。 | §2.6 |

---

## 0. 原則（全作業パッケージ共通の約束）

| # | 約束 | 理由・根拠 |
|---|---|---|
| R1 | **ロジックを書き直さない**。計算・検証・保存の処理は既存の Python API（`server.py` と各 `*.py`）を**そのまま呼ぶ**。DOM に依存しない既存の JS モジュール（§1.8 の「共有」）は**ファイルをそのまま読み込む**。 | AGENTS.md「既存機能へ統合できるものは重複実装しない」。 |
| R2 | 旧画面の **DOM に依存する JS** の扱いは3つだけ。<br>(1) **カメラ画面**（`camera.js`・`camera_3d.js`）は、動作を変えずに **`mount(root)` 化**する（§2.6）。旧 `camera.html` と新UIが**同じファイル**を読む。<br>(2) **`index.html` インラインの計算・データ**（82パターン表、連結再生の位置合わせ、モデルの正規化式）は `studio/js/**/*.fork.js` へ写す（フォーク）。旧コードと同じ結果になることを照合テストで確かめる。<br>(3) **fetch で API を呼んで表示するだけの接着コード**（index.html の制作状態・素材登録・素材棚・同期、小さな旧 UI スクリプト群）は `api.js`（§1.3）で書き直す。ロジックは Python 側にあるので、書き直してもロジックの重複にはならない。 | 二重化を避ける（Phase E の改修が1か所に入る）。旧画面を変えるのは R5 の例外の範囲だけ。 |
| R3 | 新UIの各画面は、移植した部分から**サンプルデータを実データの結線に置き換える**。置き換えた部分では `samples.js` の参照を消す（画像を含む）。置き換えない部分はサンプルのまま残し、「サンプル表示」と明記する。 | 所有者決定「見た目の正本は新UIモック」。 |
| R4 | 状態バッジ（`実機能`／`既存・部分`／`サンプル表示`／`◇ 未実装`）は**正直に**更新する。`実機能` は「既存の Python API を読み書きし、その結果を表示している。かつ本書のブラウザーテストが合格している」場合だけ。テストが無いか失敗中なら `既存・部分` のままにする。偽の成功・偽の進捗・偽の数値は出さない。 | `docs/ui/STUDIO_DESIGN_SYSTEM_JA.md`「状態表示の契約」。P2 で定義を「読み取りのみ」から「読み書き」へ広げる（WP-00c で文書も更新）。 |
| R5 | **旧画面は配信を続ける。** 旧画面のファイルを変えてよいのは次の3つだけで、コミット本文に要件IDと理由を書く。<br>(a) **バグ修正**（B-1・B-2・B-3。§1.15）。B-3 の結果、旧 `camera.html` は壊れたカメラ保存データを既定値として黙って編集・保存しなくなり、エラーを出して止まる。データの消失を防ぐ修正で、コミット本文に「B-3（CAM-G06 の一部）：壊れたカメラ保存データの上書き防止」と書く。<br>(b) **動作を変えない mount 化**（WP-06a）。<br>(c) **動作を変えない共有モジュールへの抽出と、新UI連携用の通知**（WP-06c の `camera_bundle_core.js`。`camera_project_bundle_ui.js` の検証と本文作りを移し、`camera.html` に `<script>` を1行足す。WP-06a で `camera.js` の保存成功の後に `window` イベント `bai-camera-saved` を発火する。旧画面では誰も受け取らないので、動作は変わらない）。<br>旧画面に新機能は足さない。共有したカメラコードに Phase E が加える機能は、`host==='studio'` で mount したときだけ有効にし、要素の有無も確かめる（K8）。新UIへの移植が終わっても旧画面は削除しない。 | ROADMAP_JA.md 所有者決定、AGENTS.md スコープ凍結。 |
| R6 | **見た目・レイアウトの正本は新UIモック**（ナイト配色、左サイドメニュー、各画面のパネル構成）。旧画面の見た目や配置（§冒頭の3列配置を含む）には合わせない。モックの部品を流用する。新しい部品を作るときも、モックのトークン（`studio/styles/tokens.css`）とクラスを使う。 | 所有者決定。 |
| R7 | **NF 候補（NF-001〜023）は実装しない**。モックにだけある機能（お気に入りのハート、コレクション、一括操作、素材の場所タブなど）は見た目を残し、押すと `◇ 未実装` の説明ダイアログを出す。 | AGENTS.md スコープ凍結、ROADMAP_RECONCILED。 |
| R8 | **非破壊**。既存 API の中で「上書き・置き換え・削除・再分類を伴う動作」（§2.3 の表）を新UIから呼ぶときは、必ず事前に影響を表示して確認を取る。画面内の未保存の変更を、確認なしに外部の内容で上書きしない。読めない保存データを既定値で上書きしない（B-3）。 | AGENTS.md「非破壊・後方互換」。 |
| R9 | 1つの作業パッケージ（WP）は1〜数コミット。各コミットで P2 進捗台帳（`docs/roadmap/P2_PORT_STATUS.json`、WP-00c で新設）・テスト結果・未検証事項を更新する。Phase E 台帳に影響する変更は `PHASE_E_IMPLEMENTATION_STATUS.json` の `planned_in`／`recovery_notes` にも1行書く。 | AGENTS.md 規則6。 |
| R10 | **WebMCP・標準MCP**：標準MCP（`mcp_server.py`）は HTTP API を呼ぶので、新UIが同じ API を使う限り変更は不要。WebMCP（`webmcp.js`）は旧画面の要素IDを `document.getElementById` で操作するため、新UIでは読み込まない。新UIへの WebMCP 登録は Phase E WP-02c（scope `camera_page`）以降に扱い、P2 では `◇ 未実装` と明記する。 | `webmcp.js:4`。 |
| R11 | ユーザー側の動作確認を**完了の条件にしない**（AGENTS.md 規則7）。WP の完了は自動テストだけで判定する。§3.1 の所有者確認手順は、所有者が任意で試せる手順を作業報告に載せるだけで、結果を待たない（v5 C2）。自動テストは SwiftShader 上の Chromium で行い、**GPU 実機は未検証**と記録する。 | AGENTS.md。 |

---

## 1. アーキテクチャ

### 1.1 現状の事実（コードで確認）

**新UI（外殻）**
- `studio/index.html`：読み込むスクリプトは `<script type="module" src="/studio/js/app.js">`（42行目）だけで、importmap はない。トップバーに `.mock-chip`「UIモック（仮画像）」（23行目）がある。
- `studio/package.json` が `{"type":"module"}` なので、Node から `studio/js/screens.js` を直接 import できる（2026-10-20、Node 22 で確認：`SCREENS` 25件）。`screens.js` が import するのは `samples.js` だけ。
- `studio/js/app.js`：
  - UI設定：`bai.studio.prefs.v1`（13〜25行）をブラウザーに保存する。対象はテーマ・密度・タイムラインの折りたたみだけ。
  - ルーター：`parseLocation()`（32〜39行）が `/workspace/NN?tab=` を読む。`navigate(id,{replace,tab})`（41〜50行）は History API を使い、**`tab` 以外のクエリを作れない**。
  - 描画：`render()`（665〜702行）は毎回 `main.textContent=''`（671行）で画面全体を作り直す。**画面を作り直すときの後始末（requestAnimationFrame・WebGL の破棄）の仕組みがない。**
  - 操作の振り分け：`runAction()`（137〜145行）は `unimpl`／`nav:`／`href:`／`form:`／`mock:` を扱う。`nav:` は `navigate(act.slice(4))` で、クエリを付けられない。API への書き込みはない。
  - 部品 `control()`（194〜225行）。`live` 部品（217行→`liveBlock()` 258〜276行）が、`live.js` の GET を表示する唯一の実データ経路。
  - 特別な描画：左 `custom:'assetCats'`（323行）、中央 `type:'library'`（336行）、右タブ `custom:'assetDetail'`（309行）。素材管理の状態 `lib`（513〜514行）は画面内のメモリにある。`refreshLibrary()`（519〜527行）が DOM を直接差し替える。
  - ホーム `homeView()`（470〜509行）：「最近のプロジェクト」は `PROJECTS`（サンプル、483〜487行）、「最近の素材」は `ASSETS` の固定4件（499〜502行）。
  - ビューポート `viewport()`（373〜387行）：画像と「3D描画は未接続」の表示だけ。
  - `window.baiStudio`（720行）：画面一覧と `navigate` を公開する（読み取り専用）。
- `studio/js/live.js`：`get()`（12〜21行、失敗時は `{ok:false,error}`）と、読み取り先の一覧 `LIVE`（24〜33行）。
- `studio/js/screens.js`：25画面の定義。`PH.P2` の文言が「Phase E の後に実施」のまま（36行。所有者決定で古くなった）。主な画面：SCR-01（82行〜）、SCR-08（273行〜）、SCR-12（352行〜）、SCR-13（376行〜）、SCR-18（494行〜）、SCR-23（599行〜）。`status: 'real'` は26か所（パネル状態の表とカードの合計。`grep -o` で数えた。1行に2つある行がある）。フォーム `FORMS.newProject`（661〜670行）は入力を検証するだけで、保存しない。
- `studio/js/samples.js`：`ASSET_CATS`（15〜25行。`motion` のラベルは「モーション（VMD）」）、`ASSETS`（28行〜）、`PROJECTS`（62行〜）、`RENDERS`（70行〜）。
- `studio_routes.py`：`/workspace(/NN)` には外殻を返す（17・26〜27行）。`/studio/` 配下は拡張子の許可リスト（6〜15行：html/css/js/json/webp/png/jpg/svg）とパス走査の拒否（31〜38行）で配信する。**`studio/` 配下に置いた .js は追加の設定なしで配信される。**
- `tsconfig.json`：`include` は `studio/js/**/*.js` だけ。`checkJs`・`strict`・`moduleResolution: bundler`。ルート直下の旧ファイルは型検査の対象外。
- テスト：`tests/studio-ui.test.cjs`（Playwright、ポートは `STUDIO_TEST_PORT` で既定 8799。**実 `data/` を使うサーバーを起動する**。7件）と `tests/test_studio_routes.py`。`studio-ui.test.cjs` の「every action button on every screen responds」は、`button[data-act]`（`href`・`nav` 以外）を全部押し、トーストかダイアログが出ることを確かめる。

**サーバー（既存 API、`server.py`）**
- 読み取り：`/api/project/bundle`（168〜173行）、`/api/camera/project`（174〜177行）、`/api/assets`（289〜290行。`unified_assets()` は 85〜109行）、`/api/mmd-assets`（291〜292行）、`/api/mmd-file/<slot>/<name>`（293〜307行）、`/api/project`（316〜325行。B-1）、`/api/favorites`（326〜329行）、`/api/integrated-v02/catalog`（330〜334行）、`/api/integrated-v02/asset/<file>`（335〜348行）、`/api/manifest`（349行）、`/api/file/<id>`（350〜355行）、`/api/server-version`（241〜242行）、`/api/sync`（310〜311行）。
- 書き込み：
  - `POST /api/project/bundle`（359〜376行）：本文は 4MB まで（362行、超えると 413）。**If-Match が必須**で、無ければ 428、不一致なら 409。
  - `POST /api/camera/project`（427〜438行）：If-Match は任意。
  - `POST /api/integrated-v02/upload`（762〜778行）、`POST /api/pmx-zip-upload`（779〜829行）、`POST /api/mmd-upload`（830〜845行）、`POST /api/upload`（FBX、956〜973行）。
  - `POST /api/project`（895〜917行）：本文は 3MB まで。If-Match は任意で、付いていれば `camera_revision(現在の内容)` と比べ、違えば 409。成功すると `{ok, revision}` を返す。同じ処理が 918〜940行に重複しているが、到達しないだけで害はない。
  - `POST /api/favorites`（941〜950行）、`POST /api/timeline-editor`（668〜686行）。
  - エラー応答 `bad(status,msg)`（163行）は `{"error": msg}` だけを返し、`error_code` を返す経路はまだない。
- 保存バンドル `project_state_bundle.py`：
  - `validate_bundle()`（52〜62行）、`validate_workspace()`（36〜49行。`asset` は `.glb`/`.vrm` のファイル名か空文字だけ）。
  - `read_bundle()`（65〜72行）は、カメラを `bai_camera.read()` で読む。`read()`（`bai_camera.py:76〜78`）は、ファイルが読めない・JSON が不正・検証に失敗、の**どの場合も黙って `validate(DEFAULT)` を返す**（B-3）。
  - `save_bundle()`（75〜124行）は**カメラを必ず書く**。本文に `workspace` が無いと、既存の workspace ファイルを**削除する**（95〜98行）。
  - `bundle_revision()`（127〜129行）。
- 同期：`sync_bump()`（141〜144行）を呼ぶのは `POST /api/project` と `POST /api/project/bundle` だけ。`POST /api/camera/project` は呼ばない（427〜438行）。

**旧画面の該当コード（移植の見本。`index.html` は `5865209` の行）**
- 制作状態（コンビネーション）：`index.html:361〜383`。
  - 既定値（364行）、`ui()`（370行）、`fetchProjectVersion()`（371行）、`save()`（372行。`selected`・`playbackSpeed` を画面の値で上書きしてから、If-Match 付きで `POST /api/project` に送る）。
  - `autosave()`（373行、450ms）、`record()`（374行）、`restore(i)`（375行。`selected` は変えない）。
  - `externalProjectApply`（376行。`projectRevision=null` にする）、ボタンの結線（378〜382行）、起動時の読込（383行）。
- 統合状態の保存・復元：`camera_project_bundle_ui.js`（全20行。保存は18行、復元は19行、復元前の検証 `validateRestore` は7〜14行）。
- 外部変更の同期：`index.html:420〜456`。`reconcile` が `/api/sync` を 1200ms ごとに取得する（`setInterval` は455行）。変更があると、**封筒なし**の `GET /api/project`（431行）を取り、`externalProjectApply` に渡す（432行）。
- 素材：
  - 拡張子による登録先の振り分け：`index.html:615〜646`（`studio-workflow-binding`）。
  - 登録の入口：GLB/VRM（`index.html:572`）、PMX ZIP（`index.html:524〜547`。サーバー版の機能確認は 533〜536行）、VMD（`uploadMmd()` 325〜336行。`#vmd-input` は `multiple`）、FBX（`importFiles()` 237行。`#motions` は `.fbx` の `multiple`。選んだファイルをループで FBXLoader に読ませてから1つずつ送る）。
  - 素材棚：`refreshShelf()`（764行）、`openAsset()`（726〜749行）、絞り込み（750〜762行）。
- 3D：
  - GLB/VRM：`ivLoad()`（206行。高さを 2.0 に正規化）。
  - PMX：`loadPmx()`（305〜316行。高さ 1.8）。
  - FBX：`fitModel()`（231行。高さ 1.95）。
  - VMD の適用（340〜347行）：`AnimationMixer` だけで、IK・物理はない。
  - 2D 模式アニメーション（`index.html:71` の `<details>`「従来の2D模式アニメーション」、要素 `prev`・`play`・`next`・`speed`・`seek`）。
  - カメラ画面の `camera_3d.js:278〜280`（`loadAsset`。高さを 2.0 に正規化、GLB/VRM のみ）。

**見つけた既存の不具合（P2 の前提として直す。§1.15）**
- **B-1（DATA-008）**：`GET /api/project` の分岐が 316行と 321行に重複しており、最初の分岐（316〜320行）が `?envelope=1` を無視して生データを返す。321〜325行の封筒（`{project, revision}`）付きの応答には到達しない。このため旧画面の `fetchProjectVersion()`（`index.html:371`）は常に「保存データの版を取得できません」で失敗し、**旧画面のコンビネーションの保存（`project-save`）と読込（`project-load`）が動かない**。2026-10-20 に `curl /api/project?envelope=1` が `{}` を返すことを確認した。既存テストの `test_legacy_project_client_revision.py:10` は文字列が2回出ることを確かめるだけで、実際の応答を検査していない。
- **B-2**：B-1 を直しても、旧画面は外部の変更を取り込むたびに `projectRevision=null` に戻る（`index.html:376`）。`reconcile` は封筒なしの `GET /api/project`（431行）を使うので版が分からず、手動で［読込］するまで保存できない。新UIで保存した後には必ずこの状態になる。
- **B-3（G-06 の一部）**：上の `read()` の動作のため、壊れたカメラ保存データがあると、次の経路で元のファイルが既定値に置き換わり、退避コピーも作られない。
  - 統合バンドルの GET（171行）が既定のカメラを「正常」として返し、それを読んで保存した画面（旧 `camera.html` の統合保存、新UIの②）が上書きする。
  - `GET /api/camera/project`（174〜177行）が既定値を返し、`camera.js`（226行で読込）が既定値を編集して `POST /api/camera/project` で保存する。この POST は If-Match が無ければ読まずに書く（434行）。
  - `POST /api/camera/sequence/edit`（415〜426行）が既定値に編集を当てて保存する（423〜424行）。
  - 新UIの⑥は `camera.js` をそのまま動かすので、同じ経路を通る。

### 1.2 モジュール構成（新規ファイルと責務）

すべて ES モジュールで、先頭に `// @ts-check` を書く（`*.fork.js` を除く。§1.8）。フレームワークは使わない。`studio/js/` 配下に置く（`studio_routes.py` の変更は不要）。

| ファイル | 責務 | 作るWP |
|---|---|---|
| `studio/js/api.js` | 既存 HTTP API の呼び出し窓口（§1.3）。fetch/XHR はすべてここを通す。 | WP-00c |
| `studio/js/store.js` | 小さな状態ストア（§1.4）。 | WP-00c |
| `studio/js/bus.js` | 画面間のイベント（§1.5）。 | WP-00c |
| `studio/js/state-box.js` | 読込中・空・失敗・未接続の共通表示（§1.10）。 | WP-00c |
| `studio/js/legacy.js` | 共有する旧 JS（UMD）を1回だけ読み込む（§1.8）。 | WP-00c |
| `studio/js/legacy-globals.d.ts`、`studio/types/legacy/*.d.ts` | 旧ファイルの型宣言（§1.8）。 | WP-00c |
| `studio/js/features/index.js` | 画面の結線の登録簿（§1.6）。`FEATURES` を export する。 | WP-00c |
| `studio/js/features/project.js` | ②の読込・自動保存・統合保存・履歴・外部変更の検知。 | WP-01 |
| `studio/js/features/project-view.js` | ②の画面部品（SCR-18・SCR-01）。 | WP-01 |
| `studio/js/features/assets-model.js` | ③の素材一覧の分類・絞り込み（純関数。DOM なしで、Node で単体テストする）。`ASSET_CATS` もここへ移す。 | WP-02 |
| `studio/js/features/assets-view.js` | ③の素材管理画面（SCR-08 の左・中央・右）。 | WP-02 |
| `studio/js/features/import-rules.js` | ③の取り込み規則（純関数：拡張子→送り先・種類・事前検査・衝突の判定）。 | WP-03 |
| `studio/js/features/import.js` | ③の取り込みダイアログ・キュー・送信。 | WP-03 |
| `studio/js/viewport/three-host.js` | ④の three.js ビューポートの生成と破棄（SCR-12/13/05 用）。 | WP-04 |
| `studio/js/viewport/model-loader.js` ＋ `normalize.fork.js` | ④ GLB/VRM/PMX/FBX の取得と解析（新規）。正規化の式は旧コードのフォーク（`normalize.fork.js`）。 | WP-04 |
| `studio/js/features/character-view.js` | ④ SCR-12。 | WP-04 |
| `studio/js/features/retarget-view.js` | ④ リターゲット検証（`retarget_ui.js` 等の接着コードの書き直し。§2.4）。 | WP-04b |
| `studio/js/motion/player.js`・`vmd.js`、`features/motion-view.js` | ⑤ SCR-13［編集］の1体の再生（PMX＋VMD、GLB/VRM のクリップ）と記録・外部コマンド（§2.5(c)）。 | WP-05a・05b |
| `studio/js/motion/patterns.fork.js`・`fbx-clips.js`、`features/chain-view.js`・`favorites.js` | ⑤ SCR-05 の82パターン・お気に入り・コンビネーション・A/B の 3D・連結再生（§2.5(c)）。 | WP-05c・05d |
| `studio/js/motion/chain.fork.js`・`layers.fork.js`、`features/motion-timeline.js` | ⑤ SCR-13 下部のタイムライン編集と補正レイヤー（§2.5(c)）。 | WP-05e |
| `studio/js/features/motion-review.js` | ⑤ 転写タイムライン・キー候補の比較・足の接地の QA（§2.5 ⑤-11・12・14）。 | WP-05f |
| `studio/js/motion/schematic.fork.js` | ⑤ 2D・3D の模式再生（§2.5 ⑤-10・15）。 | WP-05g |
| `studio/js/camera/camera-host.js`、`camera/legacy-ids.json`、`styles/camera-host.css` | ⑥ カメラ画面のホスト（`mount(root)` の受け皿。§2.6）。 | WP-06b |
| `studio/js/features/export-view.js` | ⑦。 | WP-07 |
| `studio/styles/features.css` | 新しい部品の見た目（トークンだけを使う）。`studio/index.html` で `app.css` の後に読む。 | WP-00c |

既存ファイルの変更：
- `app.js`：結線、後始末、`data-act="real"`、`navigate` のクエリ対応。
- `screens.js`：パネル状態、`feature` 部品、`evidence`／`shell`、`PH.P2` の文言。機能モジュールは import しない（§1.13）。
- `ui.js`：原則として変えない。必要な部品は新しいファイルに置く。
- `live.js`：`get()` の中身を `api.getJson()` の呼び出しに置き換える。戻り値の形 `{ok,data}|{ok:false,error}` は保つ。
- `studio/index.html`：importmap、`features.css`、`#keepalive`。

### 1.3 API クライアント `studio/js/api.js`

```js
/** @typedef {'offline'|'timeout'|'aborted'|'conflict'|'revision_required'|'too_large'|'bad_request'|'not_found'|'forbidden'|'locked'|'unprocessable'|'client'|'unavailable'|'server'|'bad_json'} ApiErrorCode */
/** @typedef {{ok: true, status: number, data: any}} ApiOk */
/** @typedef {{ok: false, status: number, code: ApiErrorCode, message: string, serverMessage: string|null, serverCode: string|null, body: any}} ApiErr */
/** @typedef {ApiOk | ApiErr} ApiResult */
/** @typedef {{ifMatch?: string, headers?: Record<string,string>, timeoutMs?: number, signal?: AbortSignal, limitLabel?: string}} ApiOpts */

export async function getJson(path, opts = {}) {}        // GET, cache:'no-store', Accept: application/json。timeoutMs 既定 15000
export async function postJson(path, body, opts = {}) {} // Content-Type: application/json。ifMatch があれば If-Match、headers を追加。timeoutMs 既定 30000
export async function getBinary(path, opts = {}) {}      // ArrayBuffer（3D 素材用）。timeoutMs 既定 120000
export function uploadFile(path, file, { contentType = 'application/octet-stream', onProgress, timeoutMs = 600000, limitLabel = '400MB' } = {}) {} // XMLHttpRequest。onProgress({loaded,total}) は送信バイトの実測だけ。戻り値は {promise, abort}
export function messageFor(err) {} // ApiErr → 日本語1文（下表）
export const MAX_UPLOAD_BYTES = 400 * 1024 * 1024;   // server.py:59 の MAX_SIZE と同じ値（テストで一致を確かめる）
export const LIMITS = Object.freeze({ upload: '400MB', bundle: '4MB', project: '3MB' }); // 現在の上限（server.py:59 / 362 / 896）。Phase E WP-02b で bundle 等が 8MB/16MB に変わったら、ここだけを直す
```

- 判定：
  - `fetch` が例外を出したら `offline`。`AbortError` のうち、時間切れなら `timeout`、利用者の取消なら `aborted`。
  - 応答が `res.ok` なのに本文を JSON として読めなければ `bad_json`。
  - 状態コード：409→`conflict`、428→`revision_required`、413→`too_large`、400→`bad_request`、403→`forbidden`、404→`not_found`、422→`unprocessable`、423→`locked`、503→`unavailable`、その他の 4xx→`client`、その他の 5xx→`server`。
  - エラー応答の本文が JSON なら `body` に入れる。`body.error` は `serverMessage` に、`body.error_code` は `serverCode` に入れる（B-3 の `camera_project_invalid`、Phase E 付録C のコード）。
- 日本語の文言（`messageFor`、固定）：

| code | 文言 |
|---|---|
| offline | 未接続：サーバーに接続できません。Python サーバー（npm start）が動いているか確認してください。 |
| timeout | 時間切れ：サーバーの応答がありません。もう一度お試しください。 |
| aborted | 取り消しました。 |
| conflict | 他の画面・MCP でサーバー側が更新されています。再読込してから操作してください。 |
| revision_required | 保存元の版がわかりません。再読込してください。 |
| too_large | ファイルまたはデータが大きすぎます（上限 {limitLabel}）。 |
| bad_request | 受け付けられませんでした：{serverMessage}（serverMessage が無ければ「入力を確認してください」） |
| forbidden | この操作は許可されていません：{serverMessage} |
| not_found | 見つかりません：{serverMessage} |
| unprocessable | 保存データを読めません：{serverMessage}（`serverCode==='camera_project_invalid'` は §2.2 の専用文言を使う） |
| locked | 復旧待ちのため保存できません：{serverMessage}（Phase E WP-02d の `recovery_pending`。WP-02d の後で使う） |
| client | 受け付けられませんでした（HTTP {status}）：{serverMessage} |
| unavailable | 利用できません：{serverMessage} |
| server | サーバーでエラーが起きました（HTTP {status}）。診断ZIP（24 診断・品質）で状況を確認できます。 |
| bad_json | サーバーの応答を読めませんでした（HTTP {status}）。 |

- 送信前の検査は呼び出し側（`import-rules.js` など）で行う。api.js は検査しない。
- `live.js` の `get()` は `getJson()` を呼び、失敗したら `{ok:false, error: messageFor(r)}` を返す（表示の形は変えない）。
- **Phase E WP-02d の後の追記（今は実装しない）**：統合保存に `X-Bai-Camera-Revision`・`X-Bai-Workspace-Revision` の見出しが必須になり、復旧待ちのときは 423 `recovery_pending` が返る（Phase E §2.4・§2.8）。そうなったら `features/project.js` の `saveProject()` で `headers` に2つの版を付け、423 では `locked` の文言を出して保存を止める。WP-02d の実装時に、Phase E §4.2 の WP-02d 行に従ってこのファイルとテストを直す。

### 1.4 状態ストア `studio/js/store.js`

```js
/** @template T @param {T} initial */
export function createStore(initial) {
  // returns { get(): T, set(patch: Partial<T>, reason: string): void, subscribe(fn: (state: T, reason: string) => void): () => void }
}
export const project = createStore({
  status: 'idle',            // 'idle'|'loading'|'ready'|'error'
  bundle: null,              // GET /api/project/bundle の data（combination は欠けていれば既定値で補う）
  base: null,                // 読込時の { combination, camera, workspace } の複製（外部変更の判定に使う）
  revision: null,            // 統合バンドルの版（bundle_revision）
  projectRevision: null,     // コンビネーション単体の版（GET /api/project?envelope=1 の revision。B-1 修正が前提）
  combinationMissing: false, // project_state.json が無い
  dirty: { combination: false, workspace: false, camera: false },
  autosavePending: false, saving: false,
  error: null,               // ApiErr（読込の失敗だけ。status は 'error'）
  syncError: null,           // ApiErr（同期 tick の失敗。status は 'ready' のまま。3-M4）
  saveSeq: 0,                // 世代番号。読込・自動保存・統合保存を始めるたびに +1。await の後で値が変わっていたら結果を捨てる（3-M3）
  cameraInvalid: null,       // { backup: string|null }。B-3 の 422 を受けたとき。status は 'ready' のまま（コンビネーションは使える。3-M4）
  externalChange: false, syncRevision: null, lastCommandId: null, loadedAt: null,
});
export const assets  = createStore({ status: 'idle', items: [], error: null, loadedAt: null });
export const imports = createStore({ rows: [] }); // このページを開いている間だけ（保存しない）
```
- `set` は浅いマージ。`dirty` を変えるときは `set({ dirty: { ...get().dirty, workspace: true } })` のように丸ごと渡す。`subscribe` の解除関数は画面の後始末（§1.6）に登録する。
- 「未保存がある」は `dirty.combination || dirty.workspace || dirty.camera || autosavePending || saving` で判定する（関数 `hasUnsaved()` を export する）。
- 制作データは**ブラウザーに保存しない**（再読込したら必ずサーバーから読み直す）。ストアの寿命はページの寿命と同じ。

### 1.5 イベントバス `studio/js/bus.js`

```js
export const bus = new EventTarget();
export function emit(name, detail) { bus.dispatchEvent(new CustomEvent(name, { detail })); }
export function on(name, fn) { const h = (e) => fn(e.detail); bus.addEventListener(name, h); return () => bus.removeEventListener(name, h); }
```
イベント名は次の表で固定する（増やすときは本書を更新する）：

| 名前 | detail | 発生元 |
|---|---|---|
| `studio:project-loaded` | `{revision}` | project.js |
| `studio:project-saved` | `{revision, kind: 'autosave'|'bundle'}` | project.js |
| `studio:asset-imported` | `{id}`（`/api/assets` の id） | import.js |
| `studio:assets-refresh` | `{}` | 外部同期（`refresh_assets` コマンド）・取り込みの後 |
| `studio:model-loaded` | `{assetId, format, scale, offset}` | ④ viewport |
| `studio:sync-command` | `{id, action, name, slot, target}`（`refresh_assets` 以外の外部コマンド。同じ `id` は1回だけ） | project.js の `tick`（WP-05b。§2.5 O-⑤-5） |

旧カメラ画面の `window` イベント（`bai-camera-*`。`camera.js:208〜210`、`camera_3d.js:290〜293`、`camera_project_bundle_ui.js:5〜6・16・19`）は、mount したカメラコードの中でそのまま使う。新UIのバスとの橋渡しは `camera-host.js` だけが行う（§2.6）。

### 1.6 画面の結線方式と後始末

1. **部品の型 `feature` を1つ追加する**：`screens.js` の Control に `{t:'feature', key:'projectSummary', ...opts}` を書けるようにし、`app.js` の `control()` に `case 'feature': return FEATURES[c.key](ctx, c);` を足す。左パネル・中央・右タブにある既存の `custom` の仕組み（`app.js:309, 323, 336`）は残す。`custom` の値は `FEATURES` のキーにそろえる（`assetCats`→`assetCategories`、`assetDetail`→`assetDetail`、SCR-18 左は `projectList`、中央 `type:'library'`→`type:'feature', key:'assetLibrary'`）。`screens.js` はキーの文字列だけを持ち、`features/*.js` を import しない（§1.13）。
2. **`ctx` の形**：`{ screenId, params: URLSearchParams, navigate, onCleanup(fn) }`。部品は、購読の解除・タイマーの停止・three.js の破棄を `onCleanup` に登録する。
3. **後始末は `render()` のたびに行う**：`app.js` に `let cleanups = [];` を置く。`render()` の先頭（671行の `main.textContent=''` の直前）で `for (const f of cleanups.splice(0)) { try { f(); } catch (e) { console.error(e); } }` を実行する。**同じ画面の再描画（タブ切替・テーマ変更など、`render()` を呼ぶ処理すべて）でも実行する。** 部品は再描画のたびに作り直されるので、登録も毎回やり直される。常駐させる部品（⑥のカメラホスト）だけは後始末で破棄せず、`#keepalive` へ移す（§2.6）。
4. **部分再描画**：実データの部品は、自分の根要素だけを作り直す。`refreshLibrary()` のように画面全体の DOM を差し替える処理は、③の移植でサンプル版ごと削除する。
5. **ボタンの印**：実際に API を呼ぶボタンには `data-act="real"` を付ける。このボタンは feature 部品が自分で `onclick` を付けて処理し、`runAction` には渡さない（`runAction` は `real` を扱わない）。`tests/studio-ui.test.cjs` の総当たりテスト（「every action button…」）の対象から `real` を外し（`:not([data-act="real"])` を足す）、各 WP の専用テストで検査する。`unimpl`・`mock`・`form` はこれまでどおり総当たりの対象にする。
6. **`navigate` のクエリ対応**：`navigate(id, { replace, tab, query })`。`query` は `Record<string,string>` で、`tab` と合わせて `URLSearchParams` に組み立てる。`runAction` の `nav:` は `nav:08?import=1&cat=motion` の形を読み、`?` の前を画面ID、後ろを `query` として `navigate` に渡す。`href:` は外部ページ（旧画面など）にだけ使う。
7. **`window.baiStudio` の拡張**（読み取り専用、テスト用）：`project: { getState: () => project.get() }`、`assets: { getState: () => assets.get() }`、④で `viewport: { getState() }`、⑤で `motion: { getState, probe }`（05a）・`chain: { getState, probe }`（05d）・`timeline: { getState }`（05e。形は §2.5(d)）、そして `cleanupCount: () => cleanups.length`。書き込みの関数は公開しない。
8. **後始末のテスト**（`tests/studio-ui.test.cjs` に追加、WP-00c）：実データの部品（`live`）がある画面でタブを10回切り替え、`baiStudio.cleanupCount()` が増え続けないこと（毎回、同じ数に戻ること）を確かめる。

### 1.7 3D ビューポートの埋め込み（④⑤⑥共通の決定）

- **キャラクター・モーション画面（SCR-12/13/05）**：新規の `studio/js/viewport/three-host.js` で作る。モデルの取得と解析は `model-loader.js`（新規）が行い、正規化の式は旧コードのフォーク `normalize.fork.js` に置く。
- **カメラ画面（SCR-02）**：`mount(root)` 化した `camera_3d.js` を**そのまま**使う（§2.6）。three-host は使わない。
- 理由（コードで確認）：
  - `camera_3d.js` は読み込んだ時点で、24個の要素IDを `$()` で取得する（例：`$('camera-asset-status')` 6行目）。関数を export しておらず、モデルの読み込み `loadAsset()`（278行）もモジュールの中に閉じている。そのため SCR-12 からは部品として呼べない。
  - 旧制作画面の `ivLoad()`（`index.html:206`）はインラインなので読み込めない。
  - 両者の正規化は同じ式（高さ 2.0、XZ の中心を原点、足を y=0）。この式を `normalize.fork.js` に写し、照合テスト（§2.4）で一致を確かめる。`camera_3d.js` 側の式は変えない（v1 の O-⑥-3 は、mount 方式にしたので不要になった）。
- three.js は旧画面と同じ **three@0.160.1**。`studio/index.html` の `<head>` に、`camera.html` と同じ importmap（`{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/"}}`）を、`app.js` の `<script type="module">` より前に置く。three は**3D 画面を開いたときだけ** `await import('three')` で読み込む（ホームなどの表示を遅くしない）。
- `createViewport(container, { background })` は `{ scene, camera, renderer, controls, setObject(obj), clear(), resize(), dispose(), getState() }` を返す。
  - 操作には `OrbitControls`（旧制作画面と同じ `three/addons/controls/OrbitControls.js`、`index.html:139`）を使う。大きさは `ResizeObserver` で追従する。
  - `dispose()` は rAF の停止、`renderer.dispose()`、`renderer.forceContextLoss()`、ジオメトリ・マテリアル・テクスチャの dispose を行う。必ず `ctx.onCleanup` に登録する。
  - three-host は同時に1つだけ存在する（⑥のホストは別。§2.6）。
- 失敗したときの表示：
  - WebGL を作れない（例外）：ビューポートに「3D 表示を開始できません（WebGL が使えません）。」と出す。状態は `◇` ではなく `既存・部分` のままにし、操作は無効にする。
  - CDN から three を取れない：「3D ライブラリ（three.js）を読み込めません。インターネット接続を確認してください。」（旧画面も同じ CDN に依存している。§5 K3）。
- `getState()` は `{ loaded: boolean, assetId: string|null, format: string|null, scale: number|null, offset: [x,y,z]|null, renderer: string }` を返す。`renderer` は `WEBGL_debug_renderer_info` の文字列で、取れなければ `'unknown'`。

### 1.8 旧 JS の扱い（ファイルごとの決定）

| 旧ファイル | DOM 依存 | 決定 | 移植先・時期 |
|---|---|---|---|
| `camera_rig.js`, `camera_framing.js`, `camera_lens.js`, `camera_dof.js`, `camera_focus_tracking.js`, `camera_focus_consistency.js`, `camera_sequence_playback.js`, `camera_vmd_local.js` | なし（UMD。`root.BAI*` に公開） | **共有**：新UIからも `<script src="/camera_rig.js">` などでそのまま読む（`legacy.js`）。 | ⑥。`server.py:166` の配信許可リストに既にある。 |
| `camera_follow_config.js`, `camera_follow_smoothing.js` | なし（ESM。export あり） | **共有**：`import { classifyBone } from '/camera_follow_config.js'` で直接 import する。 | ④（ボーン一覧）。配信許可済み。 |
| `camera.js`, `camera_3d.js` | あり（94個・24個の要素ID） | **動作を変えない `mount(root)` 化**（WP-06a）をして共有する。 | ⑥（§2.6）。 |
| `camera_project_bundle_ui.js` | あり（3個） | 新UIでは読まない（②の保存に統合）。DOM を使わない部分（復元前の検証 `validateRestore`、保存の本文作り）を共有モジュール `camera_bundle_core.js` へ動作を変えずに移す。 | ⑥（§2.6、WP-06c）。 |
| `camera_bundle_core.js`（新規、ルート直下、UMD、`window.BAICameraBundleCore`） | なし | **共有**：`camera_project_bundle_ui.js` と `features/project.js` の両方が使う（新UIは `loadLegacyScript` で読み、読めなければ統合保存を無効にする。単体テストは `vm` で読む。3-M8、§2.6 の 3）。Phase E WP-02d の追加（assetRef の記入、検証の緩和、フレームの整数化、423 の扱い）もここに入れる。`server.py:166` の配信許可リストに足す。 | ⑥（WP-06c） |
| `v01641_preview_guard.js`（ESM。`inspectPreviewKeys` を export） | なし | **共有**：⑤-12 で `import` する（`v01633_35_scrub.js:5` も import している。v5 の「P2 では使わない」は誤りで、§2.5 批評 5-2 で直した）。`tsconfig.json` の `paths` に型宣言を足す。 | ⑤（WP-05f） |
| `camera_easing.js`, `camera_cinematic.js`, `camera_vmd_preview.js` | なし | P2 では使わない（camera.html も読んでいない。Phase E §2.11）。 | — |
| `index.html` インライン：制作状態・素材登録・素材棚・同期 | あり | **接着コードを `api.js` で書き直す**（R2-3）。 | ②③ |
| `index.html` インライン：3D の正規化の式 | あり | **フォーク** `viewport/normalize.fork.js`。 | ④ |
| `index.html` インライン：82パターン表（80行）・FBX 連結再生（`clipOffset` 257行・`chainFrame` 291〜299行）・タイムライン再生（`timelineFrame` 260〜290行）・2D/3D 模式再生（95〜113行・228行・243〜250行） | あり | 表と計算は**フォーク**（`motion/patterns.fork.js`・`motion/chain.fork.js`・`motion/schematic.fork.js`）、表示は新しく作る。 | ⑤（O-⑤-1/2、§2.5） |
| `retarget_ui.js`（34行。`#sk-source` が無ければ何もしない） | あり | 接着コードを書き直す。 | ④（§2.4 ④-9） |
| `v01629_mesh_compare.js`（26行、three を使う） | あり | 接着コードを書き直す。three での描画は three-host を使う（O-④-5）。 | ④（§2.4 ④-10） |
| `v01630_32_review.js`、`v01633_35_scrub.js`（three を使う）、`v01636_40_playback.js`、`foot_qa_ui.js` | あり | 接着コードを書き直す（O-⑤-6）。 | ⑤（§2.5 ⑤-11〜⑤-14） |
| `motion_layers.js` | あり | 計算（`safe`・`values`・`apply`）は**フォーク** `motion/layers.fork.js`、保存と表示は書き直す。 | ⑤（§2.5 ⑤-13、WP-05e） |
| `pose_ik_ui.js`（21行）、`bai_ai_ui.js`（25行） | あり | 接着コードを書き直す。 | **⑦の後**（§2.8。既定は残す。Q2） |
| `webmcp.js` | あり | P2 では新UIに読み込まない（R10）。 | Phase E WP-02c |

**型の扱い（WP-00c。2026-10-20 に tsc で確認）**
- ルート直下の旧 ESM を `import '/camera_follow_config.js'` で読むと、tsc は TS2307（モジュールが見つからない）になる。批評案の `declare module '/camera_follow_config.js'` は、`/` で始まる名前が相対パス扱いになるため **TS2436 で失敗する**。
- そこで `tsconfig.json` の `compilerOptions.paths` に `{"/camera_follow_config.js": ["./studio/types/legacy/camera_follow_config.d.ts"], "/camera_follow_smoothing.js": ["./studio/types/legacy/camera_follow_smoothing.d.ts"], "/camera_3d.js": ["./studio/types/legacy/camera_3d.d.ts"]}` を足し、宣言ファイルを置く。この方式で型が効くことを、作業用ディレクトリで tsc 5 で確かめた。
- `window.BAICameraRig` などの UMD と `window.BAICameraPage`（§2.6）は、`studio/js/legacy-globals.d.ts`（`interface Window { … }`、`any` で宣言）に書く。`tsconfig.json` の `include` に `studio/js/**/*.d.ts` と `studio/types/**/*.d.ts` を足す。
- **写したコード**は `*.fork.js` という名前にして、先頭に `// @ts-nocheck 旧コード <file>:<行> @5865209 のフォーク。照合テスト <テスト名> で一致を保証` を書く。対象は次の5つで固定する：`viewport/normalize.fork.js`、`motion/patterns.fork.js`、`motion/chain.fork.js`、`motion/layers.fork.js`、`motion/schematic.fork.js`（後ろの2つは §2.5 で追加）。増やすときは本書を更新する。`tests/test_screen_status_honesty.mjs`（§1.13）の中で、`@ts-nocheck` が `*.fork.js` にしか無いことも確かめる。新しく書くコードは必ず型検査を通す。

`studio/js/legacy.js`：
```js
const loaded = new Map(); // src -> Promise<void>
/** 共有 UMD を1回だけ <script> で読み込む。読み込みに失敗したら reject する（呼び出し側が状態を表示する）。 */
export function loadLegacyScript(src) {}
/** 例：await loadLegacyScripts(['/camera_rig.js', '/camera_framing.js']) は書いた順番どおりに読む */
export async function loadLegacyScripts(list) {}
```

### 1.9 ルーティング

- 既存の `/workspace/NN?tab=<id>` を保つ。P2 で使う追加のクエリは次のとおり。どれも任意で、再読込すると同じ表示に戻る。

| クエリ | 画面 | 意味 |
|---|---|---|
| `asset=<id>` | 08, 12 | 選択中の素材（`/api/assets` の id、`encodeURIComponent`） |
| `import=1` | 08 | 取り込みダイアログを開く（SCR-23・SCR-01 から遷移）。開いたら `history.replaceState` で `import` を消す（戻る・再読込でダイアログが再び開かないように） |
| `cat=<id>` | 08 | 左の分類（`char`、`motion`、…、`all`） |
| `mode=compare\|edit` | 13 | SCR-13 のモード（既定 `compare`。§2.5(b)、WP-05a） |
| `asset=<id>`・`vmd=<id>`・`clip=<n>` | 13 | ［編集］の対象モデル・当てた VMD・GLB/VRM のクリップ番号（WP-05a） |

- 選択を変えたら、`history.replaceState` でクエリだけを更新する（タブ切替の既存処理 `app.js:310〜316` と同じ方法）。
- 画面を移っても `project`・`assets`・`imports` のストアは保たれる（同じページの中なので）。

### 1.10 読込中・空・失敗・未接続の表示

`state-box.js`：`stateBox({ kind: 'loading'|'empty'|'error'|'offline', title, message, retry? })` が `HTMLElement` を返す。見た目は既存の `.empty`（`app.css`）を流用し、`kind` を `data-kind` に入れる。`retry` があれば「↻ 再読込」ボタン（`data-act="real"`）を付ける。
- 読込中の表示は、300ms 以上かかったときだけ出す（ちらつきを防ぐ）。
- 「未接続」は `offline`・`timeout` のとき。失敗は `ApiErr` の `messageFor()` の文言をそのまま出す。
- 空（0件）は「まだありません」と、次の操作への導線（例：素材管理なら「素材を取り込む」）。

### 1.11 UI 設定の保存

- 既存の `bai.studio.prefs.v1`（テーマ・密度・タイムラインの折りたたみ）はそのまま。
- 追加するのは `bai.studio.lib.v1` で、素材管理の表示形式（`view: 'grid'|'list'`、`size: 1..3`、`sort`、`fmt`）だけを入れる。読み書きは try/catch で囲み、失敗しても既定値で動くようにする。
- 制作データ・選択中の素材・未保存の編集は保存しない（§1.4）。

### 1.12 静的配信

- `studio/js/**`・`studio/styles/**` の新しいファイルは、`studio_routes.py` の既存の規則で配信される（追加の設定は不要）。`.d.ts` は型検査専用で、ブラウザーは読まない。
- 共有する旧 JS は、`server.py:166` の許可リスト（`camera_*.js` 15件）から配信される。⑥で `camera.js`・`camera_3d.js` を新UIから読むときも、既に許可されているので変更はいらない。WP-06c で新しく作る `camera_bundle_core.js` だけは許可リストに足す（§2.6）。ほかに必要な旧ファイルが出たら、`server.py:166` に足し、`tests/test_studio_routes.py` に 200 の確認を足す。
- three.js は CDN（importmap）から読む。テストでは Playwright の `context.route` でローカルのファイルに差し替える（§4）。

### 1.13 状態バッジと台帳の更新規則

- `screens.js` の Panel に、任意のフィールド `evidence?: string`（`<テストファイル>::<テスト名>`）と `shell?: true` を足す。
  - `status:'real'` のパネルは `evidence` が必須。
  - `shell:true` は、シェル自体が機能を果たしているパネル（FAQ・テーマ・ヘルプ）に付ける。この場合の `evidence` は `tests/studio-ui.test.cjs` のテストでよい。
  - WP-00c で、既存の `real` 26か所（`grep -o "status: *'real'"` の数）に `evidence` か `shell` を書く。
- 新しいテスト `tests/test_screen_status_honesty.mjs`（`node --test`）：
  - `studio/js/screens.js` を **import** し、`status:'real'` の各パネルに `evidence` があること、そのファイルが存在すること、テスト名の文字列がそのファイルの中にあることを確かめる。
  - あわせて次も確かめる：`screens.js` の import 先が `./samples.js` だけであること、`shell:true` のパネルの `evidence` が `tests/studio-ui.test.cjs` を指していること、`@ts-nocheck` が `*.fork.js` にしかないこと（§1.8）。
- **未接続の区画の薄い表示（OWNER-3、WP-00c）**：
  - 対象：`status` が `partial`（既存・部分）・`mock`（サンプル表示）・`unimpl`（◇ 未実装）の区画（パネル・カード・左右の一覧・右タブの節）。`real` の区画は通常の表示。
  - 表示：区画の根要素に `data-dim="1"` を付け、CSS（`features.css`、トークンだけを使う）で文字と部品の不透明度を下げる。見出しの横に、バッジに加えてラベル「未接続（まだ使えません）」を付ける。**操作は消さず、押せるまま**にする（押したときの ◇ ダイアログや案内はこれまでどおり）。キーボードのフォーカスも通常どおり。
  - 区画の状態は `screens.js` の `status` だけから決める（別の印を作らない）。移植で `status` を `real` に変えると、自動で通常の表示に戻る。
  - テスト：`tests/studio-ui.test.cjs` に `unconnected sections are dimmed and labelled` を足す。25画面を開き、`data-status` が `real` 以外の区画にはすべて `data-dim="1"` とラベルがあり、`real` の区画には無いことを確かめる。区画の中のボタンを1つずつ押して、反応すること（トーストかダイアログ）も確かめる。
  - 正直さの一貫性：`tests/test_screen_status_honesty.mjs` で、`real` の区画に `evidence` か `shell` があることを確かめる（上記）。こうすると「通常の表示なのに未接続」も「薄いのに実機能」も起きない。
- **完了ゲート**：各 WP の最後に、`evidence` に書かれたテストファイルを全部実行する（`node tools/run_evidence_tests.mjs`。`screens.js` から一覧を作り、`node --test` に渡すだけの小さなスクリプト。WP-00c で作る）。
- `tools/gen_screen_matrix.mjs`：`API` の対応（6行）を `real: 'existing_api_read_write'` にする。`blockers` の文言（21行）の「after Phase E per owner decision」を「P2 (before Phase E, owner decision 2026-10-20)」に直す。`evidence` を行に出力する。各 WP の最後に再生成し、コミットに含める。
- `screens.js:36` の `PH.P2` を `'P2 既存機能の新UI移植（Phase E より前・作業の流れ順。所有者決定 2026-10-20）'` に直す。あわせて `screens.js:31` の `PH.LIP`（今は「Phase F の後」）を `'リップシンク・表情モーフ（承認済み・Phase E の後、F の前。所有者決定 2026-10-20）。MMDエフェクトは F の後'` に直す（v5 C8。ROADMAP_JA.md の前倒しの決定に合わせる文言だけの修正）。`docs/ui/STUDIO_DESIGN_SYSTEM_JA.md:3` の「P2、Phase E の後」も同じように直す（WP-00c）。

### 1.14 既存テストへの影響

**サーバーを使う既存テストの分類**（2026-10-20 に確認）

| 種類 | テスト | P2 での扱い |
|---|---|---|
| サーバーを別プロセスで起動 | `tests/studio-ui.test.cjs`（8799、実 `data/`）、`tests/legacy-ui-layout.test.cjs`（`LEGACY_UI_TEST_PORT` 既定 8798、実 `data/`、`process.env.CHROMIUM`、`PYTHON`） | WP-00a-2 で共通ハーネス（§4）に移し、一時データディレクトリを使う。ポートは今のまま。`legacy-ui-layout.test.cjs` は、別作業（`5865209`）の変更が入った後に移す。 |
| 同じプロセスで `import server` し、`ThreadingHTTPServer(('127.0.0.1',0), server.Handler)` を使う | `tests/test_camera_focus_endpoint.py`、`tests/test_legacy_ui_minimal_fix.py` | ルートの `conftest.py`（WP-00a-1）が import より前に `BAI_DATA_DIR` を設定するので、変更しなくても隔離される。WP-00a-1 で隔離されていることを確かめる。 |
| ログのモジュールを import | `tests/test_logging.py`（`diagnostic_logging`） | 同上（`LOG_DIR` が `data_dir()/'logs'` になる）。 |
| ソースの文字列だけを検査（サーバーなし） | `tests/dev-workflow.test.cjs`、`tests/test_v01618_humanoid_ui.py`、`test_v01630_32_review.py`、`test_v01633_35_keyframe_review.py`、`test_camera_dof.cjs`、`test_camera_lens.cjs` ほか | データには触れない。WP-06a で該当するもの（下表）は、mount 化に合わせて直す。 |

**WP ごとに直すテスト**

| テスト | 変更 | WP |
|---|---|---|
| `tests/studio-ui.test.cjs`、`tests/legacy-ui-layout.test.cjs` の起動処理 | 共通ハーネス（§4）に移す。 | WP-00a-2 |
| `tests/studio-ui.test.cjs`「every action button…」 | 対象から `[data-act="real"]` を外す。後始末のテスト（§1.6-8）を足す。 | WP-00c |
| `test_legacy_project_client_revision.py:8〜11` | 文字列の出現回数ではなく、実際の HTTP 応答を検査する `tests/test_project_envelope.py` に置き換える（B-1）。 | WP-00b |
| `test_bundle_snapshot_consistency.py:18`（**リポジトリ直下**のファイル。`'with PROJECT_LOCK:\n                camera_project=camera_read'` の文字列を探す検査） | B-3 で `GET /api/camera/project` が `read_project` を使うと失敗する。**振る舞いのテストに置き換える**：同じプロセスでサーバーを起動し、`POST /api/camera/project` と `GET /api/camera/project?envelope=1` を並行で20回ずつ送り、各 GET の `revision` がその `project` から計算した `camera_revision` と一致すること（ロックの中で読んでいること）を確かめる。17行の検査（統合保存の版をロックの中で返す）はそのまま残す（3-M1）。 | WP-00b |
| `tests/studio-ui.test.cjs`「unimplemented actions…」SCR-18 の「復元…」 | ②で `form:confirmRestore` が実際の再読込に変わるので、この行を削除し、②のテストへ移す。 | WP-01 |
| 同 SCR-01 の新規プロジェクトのフォーム | Q1 の既定で［新規プロジェクト］が ◇ になる。フォームの検証の検査を削除し、「◇ ダイアログに DATA-008 が出る」検査に置き換える。Q1 が承認されたら元に戻す。 | WP-01 |
| 同「read-only live data…」SCR-18 | `[data-live="projectBundle"]` は `[data-feature="projectSummary"]` になる。 | WP-01 |
| `camera.js`・`camera_3d.js`・`camera.html` のソース文字列を検査するテスト：`test_bai_camera.py`、`test_bundle_revision.py`、`test_bundle_snapshot_consistency.py`、`test_camera_3d_focus_contract.py`、`test_camera_bone_follow_wiring.py`、`test_camera_bundle_preflight.cjs`、`test_camera_dof.cjs`、`test_camera_focus_fail_closed.cjs`、`test_camera_focus_overlay.cjs`、`test_camera_focus_update_order.cjs`、`test_camera_focus_vmd_range.cjs`、`test_camera_follow_project.py`、`test_camera_html_wiring_recovery.py`、`test_camera_lens.cjs`、`test_camera_model_bounds_wiring.py`、`test_camera_project_bundle_ui.py`、`test_camera_projection_wiring.py`、`test_camera_rail_handles.py`、`test_camera_rig_store.py`、`test_camera_sequence_ui.py`、`test_camera_vmd_local.py`、`test_camera_vmd_render_priority.py`、`test_camera_vmd_timeline_wiring.py`、`test_camera_workspace_contract.py`、`test_project_state_bundle.py`、および `tests/legacy-ui-layout.test.cjs`・`tests/studio-ui.test.cjs`・`tests/test_studio_routes.py` | mount 化の後も全件を走らせる。失敗したものは、**同じ意味の検査**に直す（例：`const $=id=>document.getElementById(id)` を探していた検査は、`root.querySelector('#'+CSS.escape(id))` を探す検査にする）。検査の意味を弱めない。直した一覧はコミット本文に書く。 | WP-06a |

### 1.15 前提として直す既存不具合（すべてバグ修正。新機能ではない）

- **B-1**（DATA-008）：`server.py:316〜320` の重複した分岐を削除し、321〜325行（封筒付き）を残す。
  - 期待する動作：`GET /api/project` はこれまでどおり生データを返す。`GET /api/project?envelope=1` は `{"project": <生データ>, "revision": camera_revision(<生データ>)}` を返す。ファイルが無いときは `{"project": {}, "revision": camera_revision({})}`。
  - 残す封筒の分岐（321〜325行）は今 try が無く、`project_state.json` が JSON として壊れていると例外がハンドラーの外へ出る。B-1 の一部として try で囲み、例外は 500 `{error:'制作状態（project_state.json）を読めませんでした'}` にする（3-m5）。
  - `POST /api/project` の重複（918〜940行）は到達しないだけで害がないので、触らない（変更を最小にする）。
  - これで旧画面の保存・読込が直る（見た目は変えない）。コミット本文に「DATA-008：旧制作画面のコンビネーション保存が常に失敗していた不具合の修正。新機能ではない」と書く。
- **B-2**：`index.html` の `externalProjectApply`（376行）で、適用が終わった後（`info(...)` の後）に次の1文を足す。
  ```js
  fetchProjectVersion().then(v=>{if(JSON.stringify(v.project)===JSON.stringify(obj))projectRevision=v.revision}).catch(()=>{});
  ```
  - 取り込んだ内容とサーバーの内容が同じときだけ版を戻す（違えば、次の同期でもう一度取り込まれる）。失敗しても今の動作（`null` のまま）と同じなので、悪くなることはない。
  - `index.html` は別作業（`5865209`）で配置を戻したばかりなので、その変更の後に当てる。変えるのはこの1文だけ。
  - コミット本文に「B-2：外部同期の後に旧制作画面で保存できなくなる不具合の修正」と書く。
- **B-3**（G-06 の一部の前倒し。Phase E §2.7 の仕様どおり）：
  1. `bai_camera.py` に `class CameraProjectInvalid(Exception)`（`message`、`backup_name`）と `read_project(path) → (project, dropped_fields)` を新しく作る。**`CameraProjectInvalid` は `Exception` を直接継承する**。`ValueError` を継承すると、既存の `except (ValueError,TypeError,KeyError)`（例：`server.py:426, 438`）に捕まって 400 になるため。作るのは**読込エラーの分岐だけ**で、次の順番で判定する。
     - `FileNotFoundError`（**最初に判定する**。`OSError` の一種なので、後に置くと下の分岐に入る）：`DEFAULT` を返し、ファイルは書かない。
     - その他の `OSError`（権限・ロックなど）：`backup_name=None` で `CameraProjectInvalid` を投げる。
     - 読み方（3-M7）：`raw = Path(path).read_bytes()` で読み、`json.loads(raw.decode('utf-8'))` して `validate()` する。JSON が不正・検証に失敗、とみなす例外は `ValueError, TypeError, KeyError, AttributeError, UnicodeDecodeError`（`json.JSONDecodeError` と `UnicodeDecodeError` は `ValueError` の一種だが、意図を示すために並べて書く）。ファイルが無いときは `validate(copy.deepcopy(DEFAULT))`（`DEFAULT` を直接返して、呼び出し側に書き換えられないように複製する）。
     - JSON が不正・検証に失敗：生のバイト列の `sha8` を求める。読んだファイルと同じフォルダに `camera_project.invalid-<sha8>-*.json` が無ければ、`camera_project.invalid-<sha8>-<YYYYmmddTHHMMSSZ>.json` に生のバイト列をコピーする（同じ内容なら1回だけ）。元のファイルは動かさずに `CameraProjectInvalid` を投げる。**退避コピーを作れなかったとき**（書き込みの `OSError`）は、`CameraProjectInvalid(backup=None)` を投げる（読めないことは伝え、退避が無いことも正直に出す）。
     - `dropped_fields` は P2 では常に `[]` を返す（未知のフィールドを検出する処理は WP-02a のまま）。
     - **旧 `read()` は変えない**（WP-02a で `read_project(path)[0]` にする）。焦点・サンプル・シーケンス評価の GET（`/api/camera/focus`・`sample`・`sequence/evaluate`）は読むだけで書かないので、WP-02a まで `read()` のまま。
  2. `server.py:163` の `bad` を `def bad(self,status,msg,code=None)` にする（Phase E §2.4 と同じ形）。`code` があれば本文に `error_code` を足す。既存の呼び出しは変えない。**422 は `bad` を使わず**、`self.send(422, json.dumps({'error':msg,'error_code':'camera_project_invalid','backup':exc.backup_name},ensure_ascii=False).encode())` で本文を直接送る（`backup` を含めるため）。共通の小さな関数 `send_camera_invalid(self, exc)` にまとめる。`error` の文言は、退避名と手で直す手順を含める（3-M2(a)）：`'カメラ保存データ（camera_project.json）を読めません。元のファイルはそのままです。退避コピー：{backup または なし}。手で直す場合：サーバーを止め、data/camera_project.json を退避コピーと見比べて直すか、別の場所へ移してから、サーバーを起動し直してください。初期状態から始める場合は、新UIの［初期状態から始める…］を使ってください（退避コピーは残ります）。'`（理由は `CameraProjectInvalid.message` に入れてログにだけ出す）。
  2b. **`POST /api/camera/project/reset` の前倒し**（3-M2(b)。承認済みの Phase E §2.7 の仕様どおり）：本文 `{"confirm":"reset-camera-project"}` が必須（本文が無い・JSON でない・値が違うときは `bad(400,'確認の文字列がありません',code='confirmation_required')`）。応答は `{backup}`（退避名か `null`）。`PROJECT_LOCK` の中で行い、`sync_bump()` は呼ばない（カメラの保存と同じ）。新UIの使い方は §2.2(d)-2。Phase E WP-02a はこれを作り直さず、そのまま使う（Phase E §2.7 に注記）。
     - **判定の順番（v5 C3。Phase E §2.7 の「退避を確認（読めるのに無ければ作る）」を、バイト列が読めるかどうかで読む）**。`bai_camera.py` に `reset_project(path) → backup_name|None` を作り、サーバーはこれを呼ぶだけにする。
       1. ファイルが無い（`FileNotFoundError`）：`save(path, copy.deepcopy(DEFAULT))` して `None` を返す。
       2. `read_bytes()` が他の `OSError`：**何も書かず**に `CameraProjectInvalid(backup=None)` を投げる（サーバーは `send_camera_invalid` で 422）。退避できないものは初期化しない（K10）。
       3. バイト列が読めた：中身が正常でも不正でも、`read_project` と同じ規則（同じフォルダ、`camera_project.invalid-<sha8>-*.json` が既にあれば作らない）で退避を確かめる。正常なファイルも退避するのは、確認ダイアログを出してから押すまでの間に外部で直された場合でも、中身を失わないため（名前の `invalid-` は Phase E §2.7 の退避ファイルのダウンロードの名前の規則に合わせたもの）。
       4. 退避の書き込みが `OSError`：**何も書かず**に `CameraProjectInvalid(backup=None)` を投げる（422）。
       5. 退避がある（作った、または既にあった）ときだけ `save(path, copy.deepcopy(DEFAULT))` し、退避名を返す。
     - テスト（`tests/test_bundle_camera_invalid.py` に足す）：2 と 4（`monkeypatch` で `OSError` を出させる）でファイルのバイト列が変わらず 422。正常なファイルの reset で退避が1つでき、中身が元のバイト列と同じ。同じ壊れたファイルで2回 reset しても退避は1つ。
  3. `project_state_bundle.read_bundle(combination_path, camera_path, strict=False)`：`strict=True` のときだけ `read_project` を使う。
  4. 厳格に読む（`strict=True`／`read_project`）のは、次の場所だけ。`CameraProjectInvalid` を捕まえたら 2 の 422 を返す。どこも**書く前に読む**ので、壊れたファイルは上書きされない。
     - 統合バンドルの GET（171行）。今は try が無いので try で囲み、`CameraProjectInvalid` は 422、想定外の例外は 500 `{error:'統合保存データを読めませんでした: <例外の種類>'}` にする。
     - 統合バンドルの POST の、書く前の読込（369行）。**保存後の読み直し（373行）は非厳格のまま**にする（書いた直後のファイルは検証済みで、ここで 422 を返すと「保存は成功したのに失敗と表示する」経路ができるため）。
     - `GET /api/camera/project`（両形式、174〜177行）。
     - `POST /api/camera/project`（427〜438行）：**If-Match の有無にかかわらず**、書く前に `read_project` で読む（ファイルが無ければ通す）。If-Match があれば、その結果の版と比べる。
     - `POST /api/camera/sequence/edit`（422〜423行）：`edit(read_project(path)[0], request)`。
  5. 旧画面への影響（すべて安全側。コミット本文に書く）：
     - `camera_project_bundle_ui.js` は、422 を受けると `data.error` を `#bundle-status` に出して止まる（既存の `api()` が `!r.ok` で例外を出すので、変更は不要）。
     - `camera.js` の読込（226行）は今 `r.json()` をそのまま `envelope` として使うので、422 の本文を受けると `project.duration` で TypeError になり、「読み込みエラー: Cannot read properties of undefined…」と分かりにくい文言を出す。**最小のバグ修正として**、`.then(r=>r.json())` を `.then(r=>r.json().then(j=>{if(!r.ok)throw Error(j.error||('HTTP '+r.status));return j}))` に変える（この1か所だけ）。`project` は未設定のままなので編集は始まらず、［保存］を押しても本文が空になって 413 になり、サーバー側の 4 でも 422 になるので書かれない。
     - `POST /api/camera/sequence/edit`（旧 `camera.js` のシーケンス編集から呼ばれる）も 422 になり、`camera.js` は既存の失敗表示を出して止まる（3-m10）。
     - MCP など HTTP でカメラを読む外部の利用者も、壊れたファイルのときは 422 を受ける（今までは既定値を受けていた）。
- 新UIの②の自動保存は B-1 に依存する。②の統合保存と⑥は B-3 に依存する。どれも WP-01 より前（WP-00b）に直す。
- **B-4（ステージ配置の保存先。OWNER-2、WP-04 で行う。不具合ではなく承認済みの機能のための最小の変更）**：
  - `project_state_bundle.validate_workspace` が、`frame`・`asset`・`clip` に加えて、任意のキー `stage` を受け付けるようにする（今は3つのキーと完全一致でないと拒否する：36〜49行）。`stage` は `null` か `{asset, position, rotation, scale}`：
    - `asset`：`/api/assets` の id の文字列（250文字以内、`integrated:`・`mmd:A:`・`mmd:B:`・`fbx:` のどれかで始まる）。
    - `position`：有限の数3つ（各 −1000〜1000、メートル）。`rotation`：有限の数3つ（各 −360〜360、度）。`scale`：0.01〜100 の有限の数。
  - `save_bundle` の規則：本文の `workspace` に `stage` のキーが**無ければ、既存の workspace ファイルの `stage` を残す**。`stage: null` なら消す。値があれば置き換える。こうすると、`stage` を知らない旧 `camera.html` の統合保存（`{frame,asset,clip}` だけを送る）が、ステージ配置を消さない。
  - **関数単位の書き方（v5 C4）**。今の `validate_workspace` は3キーの dict を組み立て直して返す（49行）ので、受け付けるだけでは `stage` が保存で消える。次のとおりに直す。
    - `validate_stage(value) → None|dict`：`None` はそのまま返す。dict はキーがちょうど `{asset, position, rotation, scale}` で、上の範囲を満たすときだけ、新しい dict（数は `float`）を返す。それ以外は `ValueError('invalid workspace stage')`。`bool` は数として受け付けない。
    - `validate_workspace(value)`：キーの条件を「`{frame, asset, clip}` を全部含み、ほかは `stage` だけ」に変える。返す dict は今の3キーに、本文に `stage` のキーがあるときだけ `'stage': validate_stage(value['stage'])` を足す（キーが無ければ返す dict にも `stage` を入れない。これで「無い」と「`null`」を区別できる）。
    - `save_bundle`：`'workspace' in payload` のとき、`'stage' not in payload['workspace']` で、かつ既存の workspace ファイルがあれば、`before_wp` を `json.loads` して `stage` を取り出し、`validate_stage` を通してから `payload['workspace']['stage']` に入れる（`None` でもキーとして入れる）。既存のファイルが JSON として読めない、または既存の `stage` が不正なら、`ValueError` で**何も書かずに** 400 にする（黙って捨てない）。この処理は `camera_save` より前、`try` の前に行う。書くときに `stage` が `None` なら、ファイルに `"stage": null` を残さず、キーごと消す。
    - 本文に `workspace` のキー自体が無いときは、今までどおり workspace ファイルを削除する（98〜99行。`stage` も消える）。新UI（§2.2(d)-5：`bundle.workspace` が `null` でなければ必ず送る。`stage` を置いた時点で `workspace` は `null` でなくなる）と旧 `camera.html`（`camera_project_bundle_ui.js:18`：必ず `workspace` を送る）は、この経路を通らない。テストで固定する（下）。
    - `read_bundle` は workspace ファイルをそのまま返す（今のまま）。`camera_bundle_core.validateRestore` と `camera_3d.js` の restore は知らないキー `stage` を無視する（`camera_project_bundle_ui.js:11〜14` は `stage` を見ない）。
  - Phase E WP-02d の workspace の拡張は、この `stage` を残す（Phase E §2.8 に注記した）。
  - テスト：`test_project_state_bundle.py`（リポジトリ直下）に、`stage` の正常・範囲外・未知のキーの拒否、`stage` なしの保存で既存の値が残ること、`stage: null` で消えること（ファイルに `stage` のキーが無い）、既存の `stage` が不正なときは 400 相当の `ValueError` で3つのファイルのバイト列がどれも変わらないこと、`workspace` 無しの本文では workspace ファイルが削除されること（今の動作の固定）を足す。`test_camera_workspace_contract.py` が3つのキーとの完全一致を前提にしていれば、同じ意味の検査に直す。

---

## 2. ステップ別の詳細

各ステップは同じ章立てで書く：(a) 移植する機能、(b) 移植先（画面・パネル）、(c) 使う既存 API・コード、(d) 新UIの動作、(e) 置き換えるサンプル、(f) 受け入れ条件、(g) テスト、(h) ◇ 未実装のまま残すもの。

### 2.2 ② プロジェクト新規作成・保存/読込（WP-01、実装できる細かさ）

#### (a) 移植する機能

| # | 旧画面の機能 | 根拠 | 新UIでの扱い |
|---|---|---|---|
| ②-1 | 制作状態の読込（起動時に自動、`project-load` で手動） | `index.html:379, 383`、`camera_project_bundle_ui.js:19` | 移植する。読込元は統合バンドル `GET /api/project/bundle` と `GET /api/project?envelope=1`。 |
| ②-2 | コンビネーションの自動保存（編集から 450ms 後） | `index.html:372〜374` | 移植する（`POST /api/project`、If-Match 付き）。 |
| ②-3 | 統合状態の保存（コンビネーション＋カメラ＋作業参照 workspace） | `camera_project_bundle_ui.js:18`、`server.py:359〜376` | 移植する。新UIの明示の［保存］。 |
| ②-4 | 編集履歴の一覧・戻す・やり直す・選んで復元 | `index.html:370, 375, 380〜381` | 移植する（コンビネーションの `history`・`cursor`）。 |
| ②-5 | 外部（MCP・他の画面）の変更の取り込み | `index.html:420〜456`、`index.html:376` | 移植する。ただし**未保存の変更がある間は上書きしない**（R8。旧画面は確認なしで上書きしていた）。 |
| ②-6 | 新規プロジェクトの作成 | 旧画面に無い（`LEGACY_UI_INVENTORY_JA.md` ①「旧UIに該当UIなし」） | **既定では ◇ 未実装のまま**（Q1）。 |
| ②-7 | 版（revision）による同時編集の検知 | `server.py:363〜372`（409/428）、`server.py:908〜914`（409） | 移植する（If-Match と 409 の扱い）。 |

#### (b) 移植先

- **SCR-18 プロジェクト保存・復元・バージョン管理**（`screens.js:494〜513`）
  - ツール（`tools`）：`現行カメラ画面で保存・復元`（href）を削除し、`{t:'feature', key:'projectToolbar'}` を置く。中身は［保存］（primary、`data-act="real"`）と［再読込］（`data-act="real"`）。既存の `復元…`（`form:confirmRestore`）は、確認付きの［再読込］に置き換える（フォーム定義 `FORMS.confirmRestore` は削除する）。`ポータブルZIP`（◇、DATA-012）は残す。
  - 状態行（`{t:'feature', key:'projectStatus'}`、`role="status" aria-live="polite"`）。置き場所は**中央の最初の行**で、`span:12`（全幅）のカード「状態」として、既存の中央カード1〜3の前に置く。この状態行に、次のどれかを出す：`未読込`／`読込中…`／`保存済み`／`自動保存待ち…`／`保存中…`／`未保存の変更があります（［保存］で保存）`／`未接続`／`サーバー側が更新されました`／`カメラ保存データを読めません`。v1 で予定していたトップバーの `#project-chip` は作らない（モックに無い部品なので）。他の画面では、状態が変わったときのトーストで知らせる。
  - 左の `プロジェクト`（`custom:'projectList'`）：一覧に1件「現在の制作状態」（`meta` は最終更新時刻）。`status:'real'`。
  - 中央カード1「現在の制作状態（読み取り）」：タイトルを「現在の制作状態」に変え、`{t:'feature', key:'projectSummary'}` にする。`status:'real'`。
  - 中央カード2「バージョン」：`{t:'feature', key:'projectHistory'}`（版の短縮表示と編集履歴）。`status:'real'`。カードの中の「版を比較」は ◇（DATA-009）のまま。
  - 中央カード3「アーカイブ」：◇ のまま。
  - パネルの状態：`保存・復元` は real、`バージョン` は real（note：「編集履歴はコンビネーションのみ。任意の版との差分比較は未実装」）、`プロジェクト一覧` は real（note：「単一の制作状態」）。他は今のまま。
- **SCR-01 ホーム**（`screens.js:82〜116`、`app.js:470〜509`）
  - 「最近のプロジェクト」：`PROJECTS` のサンプル4枚（`app.js:483〜487`）を、`projectCard` 部品（1枚）に置き換える。カードを押すと SCR-18 へ移る。カードの中で、タイトルの下の1行に、SCR-18 と同じ `projectStatus` の文言を小さく出す（部品は同じものを `compact:true` で使う）。サンプル画像は使わず、形式アイコンの無地のタイルにする。注記「複数のプロジェクト管理は未実装です（新規作成は ◇）」。`status:'real'`。
  - ［新規プロジェクト］（`form:newProject`）：Q1 の既定に従い **`unimpl`** にする。対象は SCR-01 の**5か所すべて**（v5 C7）：`app.js:478`（ヒーロー）、`app.js:490`（クイック操作の「新規プロジェクト」）、`screens.js:93`（ツール）、`screens.js:112`（テンプレートの「ダンスMV」「カメラ試験」「空のプロジェクト」）。`grep -n "form:newProject" studio/js` が0件になることをテストの前に確かめる。why・ids・phase は5か所とも次と同じ。why は「現在のサーバーは制作状態を1つだけ保持します。新しい制作状態を作る機能は未実装です（DATA-008 の範囲外、テンプレートからの作成は NF-019）」、ids は `['DATA-008','NF-019']`、phase は `PH.P2`。`FORMS.newProject` は削除しない（Q1 が承認されたら使う）。

#### (c) 使う既存 API・コード

| 操作 | API | 旧コード（見本） |
|---|---|---|
| 読込 | `GET /api/project/bundle` → `{schema, combination|null, camera, workspace|null, complete, revision}`（`server.py:168〜173`）。カメラが壊れていれば 422 `camera_project_invalid`（B-3）。あわせて `GET /api/project?envelope=1` → `{project, revision}`（B-1） | `camera_project_bundle_ui.js:4, 19`、`index.html:371` |
| 自動保存 | `POST /api/project`、`If-Match: <projectRevision>`、本文はコンビネーション → `{ok, revision}`（`server.py:895〜917`、3MB まで） | `index.html:372〜373` |
| 統合保存 | `POST /api/project/bundle`、`If-Match: <revision>`、本文 `{schema:1, combination, camera, workspace?}` → `{ok, schema, revision}`（`server.py:359〜376`、4MB まで） | `camera_project_bundle_ui.js:18` |
| 外部変更の検知 | `GET /api/sync` → `{revision, commandId, command}`（`server.py:310〜311, 138〜148`） | `index.html:425〜455` |
| 既定のコンビネーション | `{schema:1,title:'無題のプロジェクト',timeline:[],history:[],cursor:-1,selected:0,playbackSpeed:1,updatedAt:''}` | `index.html:364`（そのまま写す） |
| 履歴の復元 | クライアント内の処理（`timeline = clone(history[i].timeline)`、`cursor = i`、`playbackSpeed = history[i].playbackSpeed || 1`。`selected` は変えない） | `index.html:375` |

#### (d) 新UIの動作（`features/project.js`）

```js
export const DEFAULT_COMBINATION = Object.freeze({ schema: 1, title: '無題のプロジェクト', timeline: [], history: [], cursor: -1, selected: 0, playbackSpeed: 1, updatedAt: '' });
export async function loadProject({ discardLocal = false } = {}) {}  // 未保存があって discardLocal=false なら、何もせずに false を返す
export function restoreHistory(index) {}                               // status!=='ready' または範囲外なら何もしない
export const undo = () => restoreHistory(project.get().bundle?.combination.cursor - 1);
export const redo = () => restoreHistory(project.get().bundle?.combination.cursor + 1);
export function setWorkspaceFields(fields, { source = 'store' } = {}) {} // asset/clip/frame/stage を書く唯一の経路（下の 9）
export const setWorkspaceAsset = (filename) => setWorkspaceFields({ asset: filename }); // ④ が使う（§2.4）
export async function saveProject() {}                                 // 統合保存（下の 5）
export function startExternalSync() {}                                 // 1回だけ呼ぶ。app.js の起動時
export function hasUnsaved() {}
export function summarize(bundle) {}                                   // 表示用の純関数（下の表）
```

1. **起動時**：`app.js` の最後（`buildNav()` の後）で `loadProject()` と `startExternalSync()` を呼ぶ（どの画面から開いても1回だけ）。
2. **読込** `loadProject()`：
   - `status:'loading'` にして、`GET /api/project/bundle` と `GET /api/project?envelope=1` を並行で取る。
   - 両方成功したら：
     - `envelope.project` と `bundle.combination ?? {}` を JSON として比べる。違えば読込中に変更があったので、1回だけ取り直す。それでも違えば `status:'error'`（「保存データを一貫した状態で読めませんでした。再読込してください。」）。
     - 一致すれば、`bundle = data` にする。`combination` が `null` なら、**ストアの中でだけ** `structuredClone(DEFAULT_COMBINATION)` を入れ、`combinationMissing: true` にする。
     - `base = structuredClone({combination: data.combination, camera: data.camera, workspace: data.workspace})`、`revision = data.revision`、`projectRevision = envelope.revision`、`dirty` を全部 false、`status:'ready'`、`loadedAt = Date.now()`、`emit('studio:project-loaded')`。
   - 統合バンドルが 422 で `serverCode==='camera_project_invalid'` のとき（3-M4(b)）：**コンビネーションは封筒から読み込んで使えるようにする**。
     - `bundle = {schema:1, combination: envelope.project が空 {} なら null／そうでなければ envelope.project, camera: null, workspace: null, complete: false, revision: null}`、`combinationMissing` は上と同じ規則、`projectRevision = envelope.revision`、`revision = null`、`cameraInvalid = {backup: body.backup}`、**`status:'ready'`**。
     - 使えるもの：コンビネーションの履歴・戻す・やり直す・自動保存（`POST /api/project` はカメラを読まない）。止めるもの：統合保存（［保存］は無効）、workspace の変更（`setWorkspaceFields` は何もせずトースト「カメラ保存データを読めないため、作業中の素材は変えられません」）、SCR-02 の mount（§2.6）。
     - 状態行と SCR-18 に、サーバーの `error` の文言（退避名と手で直す手順を含む：§1.15 B-3）をそのまま出す。その下に［初期状態から始める…］（`data-act="real"`）を置く。押すと確認ダイアログ「カメラの保存データを初期状態に戻します。今のファイルは退避コピー（{backup}）として残ります。よろしいですか？」（［初期状態に戻す］［キャンセル］）を出し、確定したら `POST /api/camera/project/reset`（本文 `{"confirm":"reset-camera-project"}`、§1.15 B-3 の 2b）を送り、成功したら `loadProject({discardLocal:false})` で読み直す。退避ファイルのダウンロードと中身の確認（invalid-preview）は Phase E WP-02a のまま ◇（ids `['CAM-G06']`、phase「Phase E WP-02a」）。
   - その他の失敗：`status:'error'`、`error` を入れる。
   - **世代番号（3-M3）**：`loadProject` の最初に `const my = ++saveSeq` とし、**すべての await の後で** `my === project.get().saveSeq` を確かめる。違えば（その間に別の読込・保存が始まった）、結果を捨てて何もせずに戻る。自動保存・統合保存・`tick()` の読み直しも同じ規則に従う。
3. **履歴の復元** `restoreHistory(i)`：
   - 実行するのは `status==='ready'` かつ `0 ≤ i < history.length` のときだけ。
   - 変えるのは次の3つ：`combination.timeline = structuredClone(history[i].timeline)`、`combination.cursor = i`、`combination.playbackSpeed = history[i].playbackSpeed || 1`。**`selected` と `history` 配列は変えない**（旧 `restore` と同じ）。
   - `dirty.combination = true` にして、自動保存の予約（下の 4）をする。
4. **自動保存**（旧 `autosave()` と同じく 450ms 後。`index.html:373`）：
   - コンビネーションが変わるたびにタイマーを引き直し（`autosavePending:true`）、450ms 後に `autosave()` を実行する。
   - 送る前に、動いている `tick()` があれば、その終わりを待つ（`await syncInFlight`。3-M3）。待っている間に `saveSeq` が変わったら送らない。
   - `saving` 中なら、終わってからもう一度予約する（旧と同じ）。`status!=='ready'` のときは予約しない（`cameraInvalid` のときも、コンビネーションの自動保存は行う。3-M4(b)）。
   - 本文は `{ ...combination, updatedAt: new Date().toISOString() }`（`selected`・`playbackSpeed` はストアの値のまま）。`POST /api/project` に `If-Match: projectRevision` を付けて送る。
   - 200 のとき：
     - `projectRevision = data.revision`、`bundle.combination = 送った本文`、`base.combination = 送った本文`、`combinationMissing:false`、`dirty.combination:false`、`autosavePending:false`。
     - `saving` は、このあとの GET が終わるまで true のままにする（その間に `tick()` が動くと、自分の保存を外部の変更と取り違えるため）。
     - 続けて `GET /api/project/bundle` を取る。`combination` が送った本文と等しく、かつ `camera`・`workspace` が `base` と等しければ、`revision = data.revision` だけを更新する。違えば、外部の変更として下の 7 と同じ処理をする。
     - **`cameraInvalid` の間（v5 C5）**：この GET は必ず 422 になるので**送らない**（`revision` は `null` のまま、`saving` はここで false に戻す）。カメラが直ったかどうかは 7 の tick だけが判定する。
     - 状態行は「保存済み」。`emit('studio:project-saved',{kind:'autosave'})`。トーストは出さない（旧画面と同じく静かに保存する）。
   - 409 のとき：自動保存を止める（`autosavePending:false`、`dirty.combination` は true のまま）。ダイアログ「サーバー側が更新されています」を出す。本文は「他の画面（現行の制作画面・カメラ画面）や MCP が先に保存しました。この画面の変更はまだ残っています。」、ボタンは［再読込して変更を破棄］（`loadProject({discardLocal:true})`）と［閉じる］。**マージはしない。**
   - 400 のとき：「自動保存できませんでした：{serverMessage}」。`dirty` は残す。413 は `too_large`（`limitLabel: LIMITS.project`）。
   - offline/timeout のとき：「未接続：自動保存できませんでした。変更はこの画面に残っています。」と出し、`dirty` は残す。回復したら（下の 7 の tick が成功したら）もう一度予約する。
5. **統合保存** `saveProject()`（［保存］）：
   - 未保存が何も無い（`hasUnsaved()===false`）なら、何もせずにトースト「変更はありません」（`kind:'real'`）。`saving` 中なら何もしない（ボタンは無効になっている）。
   - 自動保存の待ちがあれば、タイマーを取り消して統合保存に含める。動いている `tick()` があれば、その終わりを待ってから送る。`const my = ++saveSeq` を取り、await のたびに確かめる（3-M3）。
   - 本文は `{ schema: 1, combination: { ...combination, updatedAt: new Date().toISOString() }, camera: bundle.camera }`。**`bundle.workspace` が `null` でなければ、必ず `workspace` を含める**（含めないとサーバーが workspace のファイルを削除する：`project_state_bundle.py:95〜98`）。
   - ⑥の後は、カメラホストが読み込み済みなら `camera`・`workspace` をホストから集める（§2.6）。
   - `combinationMissing` のときは、確認ダイアログ「コンビネーション（project_state.json）はまだ作られていません。保存すると空のコンビネーションも一緒に作られます。」で［続ける］［キャンセル］を選ばせる。
   - `POST /api/project/bundle` に `If-Match: revision` を付けて送る（`limitLabel: LIMITS.bundle`）。
   - 200 のとき（`saving` は、このあとの GET が終わるまで true のまま）：`revision = data.revision`、`bundle.combination = 送った combination`、`base` を送った内容で更新、`combinationMissing:false`、`dirty` を全部 false。続けて `GET /api/project?envelope=1` を取り、`project` が送った combination と等しければ `projectRevision` を更新する（違えば外部の変更として 7 の処理）。トースト「保存しました（コンビネーション・カメラ・作業中の素材参照）。」（`kind:'real'`）、`emit('studio:project-saved',{kind:'bundle'})`。
   - 409：4 と同じダイアログ。422 `camera_project_invalid`：2 と同じ表示にして保存を止める。428：`revision_required`（通常は起きない）。400：「保存できませんでした：{serverMessage}」（例：`invalid combination cursor`）、`dirty` は残す。offline/timeout：「未接続：保存できませんでした。変更はこの画面に残っています。」
6. **再読込**（［再読込］と、`復元…` の確認の後）：未保存があれば確認ダイアログ「保存していない変更を破棄して、サーバーの保存済み状態を読み込みますか？」（［破棄して読み込む］［キャンセル］）を出す。未保存が無ければ、そのまま `loadProject({discardLocal:true})`。
7. **外部変更** `startExternalSync()`：`setInterval(tick, 1200)`（旧と同じ間隔）と、`document.visibilitychange`（画面が表示に戻ったとき）で `tick()` を呼ぶ。
   - `tick()` は同時に1つしか動かさない。**`status==='ready' && !saving && !autosavePending` でなければ、何もせずに戻る**（保存の途中の版を外部の変更と取り違えないため。`saving` は保存後の GET が終わるまで true：上の 4・5）。条件を満たしたら `GET /api/sync` を取る。
   - **初回**は、`syncRevision` と `lastCommandId` を覚えたうえで、`GET /api/project/bundle` の `revision` を `project.revision` と比べる（読込から初回までの間の変化を見逃さないため）。
   - 2回目以降は、`revision` が変わったときだけ `GET /api/project/bundle` を取る。
   - 比べた結果、`data.revision === project.revision` なら何もしない（自分の保存による変化）。違うとき：
     - 未保存が無い：読み込み直して、トースト「外部の変更を読み込みました」（`kind:'real'`）。
     - 未保存がある：`externalChange:true` にし、状態行に「サーバー側が更新されました。保存されていない変更があるため、自動では読み込みません。［再読込して変更を破棄］」と出す。自動保存の待ちがあれば、それも止める（送れば 409 になるだけなので）。
   - `visibilitychange` のときは `/api/sync` を見ずに、直接 `GET /api/project/bundle` の `revision` を比べる（カメラ画面の保存 `POST /api/camera/project` は `sync_bump` を呼ばないため：`server.py:427〜438`）。
   - `command`（`play_chain` など、`server.py:846〜862`）のうち、②で扱うのは `refresh_assets` だけ（`emit('studio:assets-refresh')`）。他のコマンドは無視する（⑤⑥で扱う。旧画面は `index.html:435〜450`）。`commandId` が `lastCommandId` と同じなら処理しない。
   - `tick()` の中の統合バンドルの GET が 422 `camera_project_invalid` なら、「未接続」ではなく 2 の 422 と同じ状態（`cameraInvalid`、`status:'ready'`、コンビネーションは使える）にする。
   - **`cameraInvalid` の間に tick の GET が 200 を返したとき（v5 C5。外部でカメラのファイルが直された）**：`project.revision` は `null` なので必ず「違う」になる。未保存が無ければ `loadProject({discardLocal:true})` で読み直す（成功すれば `cameraInvalid:null`）。未保存があれば `cameraInvalid` は残したまま `externalChange:true` にし、状態行に「カメラ保存データが読めるようになりました。［再読込して変更を破棄］で読み込めます。」と出す（未保存の変更を上書きしない：R8）。
   - **同期の失敗は `syncError` に入れ、`status` は `ready` のまま**（3-M4(a)）。500 などのサーバーエラーは、状態行に `messageFor(syncError)` を出す（自動では読み込まない。次の tick が成功したら `syncError:null` に戻す）。画面の操作は止めない。
   - `tick()` は始まるときに `syncInFlight` に自分の Promise を入れ、終わったら消す（自動保存・統合保存が待てるように）。
   - 通信の失敗（offline/timeout）も `syncError` に入れる。例外は出さない。状態行に「未接続」と出し、回復したら元の表示に戻す。
8. **離脱の警告**：`window.addEventListener('beforeunload', e => { if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; } })`。画面内の移動（SPA）では警告しない（ストアは保たれるので）。
9. **workspace のマージ規則**（④⑤⑥共通。`setWorkspaceAsset` などが使う）：
   - **フィールド単位の所有者**（2-M4。O-⑥-5 として決定済み）：
     - `asset`・`clip`・`frame` は**ストア**（`features/project.js`）が持つ。書く経路は `setWorkspaceFields({asset?, clip?, frame?, stage?}, {source})` の1つだけ。④は `asset` を、⑤は `clip`・`frame` を（O-⑤-7）、⑥のカメラホストは利用者がカメラ画面でモデル・クリップ・再生位置を変えたときに、この関数で書く。
     - それ以外のフィールド（Phase E WP-02d で足すカメラ側のもの。今は無い）は**カメラホスト**が持つ。統合保存のとき、ホストのスナップショット（`bai-camera-workspace-snapshot`）から、カメラ側のフィールドの一覧 `CAMERA_OWNED_WORKSPACE_FIELDS`（`camera_bundle_core.js` に定義。P2 の時点では空の配列）に入っているものだけを取る。スナップショットの `asset`・`clip`・`frame` は使わない。
     - ストアからホストへ伝えるのは**外部からの変更だけ**（3-M6）。`setWorkspaceFields(fields, {source})` の `source` は `'store'`（④⑤・再読込）か `'host'`（カメラホスト自身）。`source==='host'` の変更はホストへ返さない。`source==='store'` で、**`asset` か `clip` がホストの今の値と違うときだけ** `bai-camera-workspace-restore` を送る（`camera_3d.js` の restore は `catalog()` を呼んで選択肢を作り直すので、必要なときしか呼ばない）。`frame` だけが違うときは restore を送らず、カメラの統合状態の復元（`bai-camera-bundle-restore` の `frame`）で送るときだけ伝える。ホストが SCR-02 にいないときは、SCR-02 に戻ったときに1回だけ同じ判定をする。
     - **`stage`**（OWNER-2、§2.4 ④-11）もストアが持つ。カメラホストには送らない（`camera_3d.js` は知らないキーを無視する）。
   - 値の作り方：`{ ...(bundle.workspace ?? { frame: 0, asset: '', clip: null }), ...変更したフィールド }`。`asset` が変わり、`clip` が指定されていないときだけ `clip: null` にする。他のフィールドは残す。`setWorkspaceAsset(filename)` は `setWorkspaceFields({asset: filename})` の別名。
   - `asset`・`clip`・`stage` を変えたら `dirty.workspace=true` にする（保存は［保存］で行う）。**`frame` だけの変化は dirty にしない**（決定、3-M6。再生位置は作業の状態であり、それだけで保存を促さない。他の変更と一緒に保存されるときに最新の値が入る）。
10. **表示**（`project-view.js`。`summarize(bundle)` の出力を使う）：

| 表示項目 | 値 | 例 |
|---|---|---|
| タイトル | `combination.title`（`combinationMissing` なら「（未保存）」を付ける） | 無題のプロジェクト |
| 最終更新 | `combination.updatedAt` を `toLocaleString('ja-JP')`。空なら「—」 | 2026/10/20 14:28:00 |
| コンビネーション | `timeline.length` 件、履歴 `history.length` 件（現在 `cursor+1` 番目） | 2件・履歴3件（3番目） |
| カメラ | `camera.keys.length` キー、`camera.duration` フレーム、`camera.fps` fps | 2キー・300F・30fps |
| 作業中の素材 | `workspace.asset`（空なら「なし」）、`workspace.clip`、`workspace.frame` | char.vrm・クリップ0・F 0 |
| 統合保存 | `complete` が true なら「保存済み」、false なら「コンビネーション未保存（保存すると作成されます）」 | — |
| 版 | `revision.slice(0, 12)`（`title` 属性に全体） | 6d1875cf2667 |

   - 編集履歴（`projectHistory`）：`history` は保存順のまま、一覧だけ新しい順にする（`(i+1). 日時 ラベル`）。表示行には元のインデックス `i` を保持する。`cursor` の行に「現在」と付ける。行を選ぶと［この時点に戻す］（`restoreHistory(i)`）が使える。［戻す］は `cursor <= 0` のとき、［やり直す］は `cursor >= history.length-1` のとき無効（`index.html:370` と同じ条件）。`status!=='ready'` のときは全部無効。履歴が0件なら空表示「履歴はまだありません。コンビネーションを編集すると記録されます（現行の制作画面、または ⑤ の移植後）。」
   - ［保存］が無効になる条件：`hasUnsaved()===false`、`saving`、`status !== 'ready'`、`cameraInvalid` のどれか。
11. **アクセシビリティ**：状態行は `role="status"`。ダイアログは既存の `openModal()`（Esc・フォーカス固定）を使う。

#### (e) 置き換えるサンプル

`app.js:483〜487` の `PROJECTS` の表示、`screens.js:509` の `live('projectBundle')`、`FORMS.confirmRestore`（`screens.js:676〜681`）、SCR-18 左パネルの固定 `{id:'cur', meta:'サーバー'}`。`samples.js` の `PROJECTS` は SCR-01 から参照されなくなるので削除する（他に参照が無いことを `grep` で確かめてから）。

#### (f) 受け入れ条件

1. 一時データ（§4）に置いた `project_state.json`・`camera_project.json`・`project_state.workspace.json` の内容が、SCR-18 と SCR-01 に表の書式で出る。
2. ［戻す］の 450ms 後に、`project_state.json` の `cursor`・`timeline` が変わる。`If-Match` は読込時の封筒の版。`selected` は変わらない。`project_state.workspace.json` と `camera_project.json` は変わらない（JSON として等しい）。その後の統合保存が 409 にならない（版を取り直しているので）。
3. ［戻す］の直後（450ms 以内）に［保存］を押すと、統合バンドルが1回だけ送られ、`POST /api/project` は送られない。workspace のファイルは残る。
4. 読込の後で別の経路から保存すると（409 が起きる状況）、新UIの保存は拒否され、ファイルは別の経路の内容のまま。ダイアログから再読込すると新しい内容が出る。
5. `project_state.json` が無い状態で何も編集しなければ、［保存］は無効で、ファイルは作られない。
6. 壊れた `camera_project.json` があると、SCR-18 に「読めません」と退避名が出て、［保存］が無効になる。ファイルのバイト列は変わらず、退避コピーが1つだけできる。
7. 外部から `POST /api/project` で保存すると、未編集なら3秒以内に表示が更新される。
8. 自動保存の通信中に再読込すると、`beforeunload` が発生する。
9. 旧制作画面（隔離データ）で、B-1・B-2 の修正後に［保存］が成功する。外部の変更を取り込んだ後でも、続けて［保存］が成功する。
10. 実 `data/` のハッシュが変わらない（§4）。型検査と既存テストがすべて合格する。

#### (g) テスト（追加）

`tests/studio-p2-project.test.cjs`（Playwright、ポートは `P2_PROJECT_PORT` で既定 8797、§4 のハーネス）：

| テスト名 | 主な検査 |
|---|---|
| `SCR-18 shows the real production state` | 種データ（コンビネーション2件・履歴3件で cursor=2、カメラ2キー・300F、workspace `{frame:0, asset:'', clip:null}`）を使う。`[data-feature="projectSummary"]` に「2件」「履歴3件（3番目）」「2キー」「300F」が出て、版の先頭12文字が `GET /api/project/bundle` の `revision` と一致する。カードの見出しに `.badge-real` がある。 |
| `undo autosaves the combination with the envelope revision` | ［戻す］を押し、`page.waitForRequest` で `POST /api/project` を待つ。`If-Match` が `GET /api/project?envelope=1` の `revision` と一致し、送るまでの時間が 400ms 以上であることを確かめる。保存後の `project_state.json` は `cursor===1`、`timeline` が history[1] と同じ、`selected` は種データのまま。workspace とカメラのファイルは JSON として変わらない。状態行は「保存済み」。続けて［戻す］→（450ms 以内に）［保存］で統合保存が 200 になる。 |
| `save sequencing is guarded against overlapping loads and ticks`（`tests/studio-p2-project-logic.test.mjs`、`node --test`、ブラウザー不要） | `features/project.js` の中の、DOM を使わない部分（`createProjectController({fetchJson, now, setTimeout, clearTimeout})` のように依存を渡せる形にする）を、偽の時計と偽の fetch で動かす（3-M3）。①自動保存の応答を待つ間に `loadProject` を始めると、自動保存の結果は捨てられる。②`tick()` の GET を保留にしたまま［戻す］をすると、450ms たっても `POST /api/project` は送られず、tick が終わってから送られる。③統合保存の応答の後の GET を保留にしている間、tick は何もしない。 |
| `own autosave is not reported as an external change` | ［戻す］の後、自動保存と保存後の GET が終わるまで待ち、さらに3秒（`tick` が2回以上動く時間）待つ。トースト「外部の変更を読み込みました」と状態行「サーバー側が更新されました」が一度も出ない（`MutationObserver` で記録して確かめる）。統合保存の後も同じ。 |
| `explicit save flushes the pending autosave into the bundle` | ［戻す］の直後に［保存］を押す。`POST /api/project/bundle` が1回、`POST /api/project` が0回（2秒待って確かめる）。workspace のファイルが残っている。 |
| `autosave conflict keeps local edits and offers reload` | `page.route('**/api/sync', r => r.abort())` で同期を止める。読込の後、テストから Node の fetch で `POST /api/project`（timeline 3件）を送る。UI で［戻す］を押すとダイアログに「他の画面」が出て、ファイルは3件のまま。［再読込して変更を破棄］を押すと「3件」が出る。 |
| `bundle conflict keeps local edits` | 同期を止めて、外部から `POST /api/project/bundle`（正しい版、camera.duration=400）を送る。［戻す］の直後に［保存］を押すとダイアログが出て、ファイルの duration は 400 のまま。 |
| `invalid camera file blocks bundle saving but keeps the combination usable` | 種データの `camera_project.json` を `{"broken":` にする。状態行に退避名 `camera_project.invalid-` と「手で直す場合」の手順が出る。［保存］は `disabled`。［戻す］は使え、450ms 後に `POST /api/project` が 200 になり `project_state.json` が変わる（3-M4(b)）。カメラファイルのバイト列は変わらず、退避コピーは1つ。テストから直接 `POST /api/project/bundle`（`If-Match: x`）を送っても 422 で、バイト列は変わらない。 |
| `reset from the invalid state requires confirmation and keeps the backup` | 上の状態で［初期状態から始める…］を押すと確認ダイアログが出る。［キャンセル］なら `POST /api/camera/project/reset` は0回。もう一度押して［初期状態に戻す］なら1回送られ、カメラファイルが既定値になり、退避コピーは残り、状態行が通常に戻って［保存］が使える（3-M2）。 |
| `camera file broken after load is reported, not treated as offline` | 正常なデータで開いた後、テストからカメラファイルを壊し、外部から `POST /api/project` を送る。次の `tick` で状態行が「カメラ保存データを読めません」になり（「未接続」ではない）、［保存］が無効になる。 |
| `server error during sync keeps the page usable` | 開いた後、`page.route('**/api/project/bundle', r => r.fulfill({status:500, body:'{"error":"x"}'}))` にして外部から `POST /api/project` を送る。状態行に「サーバーでエラーが起きました（HTTP 500）」が出る。`baiStudio.project.getState().status` は `'ready'` のままで、［戻す］が使える（3-M4(a)）。route を外すと、次の tick で状態行が元に戻る。 |
| `missing combination is not created without an edit` | `project_state.json` が無い。表示は「コンビネーション未保存」で、［保存］は `disabled`。10秒待っても `project_state.json` は無い。 |
| `external change reloads when clean` | テストから `POST /api/project`（timeline 3件、If-Match なし）を送ると、3秒以内に「3件」が出て、トースト「外部の変更を読み込みました」が出る。 |
| `beforeunload guard while autosave is in flight` | `page.route` で `POST /api/project` を保留にする（応答しない）。［戻す］の 500ms 後に `page.reload()` すると、`page.on('dialog')` の type が `beforeunload` になる。`dialog.accept()` で再読込を続けさせる（dismiss すると再読込が止まり、`page.reload()` が終わらない）。 |
| `home shows one real project card and no sample projects` | SCR-01 に `[data-feature="projectCard"]` が1つあり、`City_Night_MV` の文字が無い。［新規プロジェクト］で ◇ ダイアログ（「DATA-008」を含む）が出る。 |
| `offline shows 未接続 and disables save` | `page.route('**/api/project/bundle', r => r.abort())` の状態で開くと、`[data-kind="offline"]` と「未接続」が出て、［保存］は無効。 |
| （dirty 中に外部変更を受けて警告するテスト） | ②には長く残る未保存が無いので、WP-04（`setWorkspaceAsset` で dirty にする）に置く（§2.4(g)）。 |

`tests/legacy-project-save.test.cjs`（Playwright、ポートは `P2_LEGACY_PORT` で既定 8790、§4 のハーネスで隔離データ、WP-00b）：最初に `page.on('dialog', d => { failures.push(d.message()); d.dismiss(); })` を登録する（旧画面は失敗を `alert` で出すので、出たらテストを失敗にする）。旧 `/index.html` を開き、起動時の読込が終わるのを待つ（`#project-info` に「件の履歴」が出るまで。`index.html:369` の `info()` の書式）。`#project-save` を押すと、`#project-info` に「保存済み」が出る。テストから `POST /api/project` を送ると、`#project-info` に「MCPから更新を同期しました」が出る。**その後、B-2 の版の取り直し（`GET /api/project?envelope=1`）の応答を `page.waitForResponse(r => r.url().includes('/api/project?envelope=1') && r.ok())` で待ってから**（v5 C9。`projectRevision` は `index.html` の IIFE の中にあって外から読めないので、通信で待つ。待ち始めは「同期しました」を待つ前に登録する）、もう一度 `#project-save` を押すと、また「保存済み」が出る（B-2）。three が無いときは skip する（§4.1）。

**同じファイル `tests/legacy-project-save.test.cjs` の2つ目のテスト**（旧 `camera.html`。3-m2 で1ファイルに統一）：壊れたカメラファイルで旧 `/camera.html` を開くと、`#status` に「読み込みエラー」とサーバーの文言「カメラ保存データ（camera_project.json）を読めません」が出る。`#save` を押すと `#status` に「保存失敗」が出て、カメラファイルのバイト列は変わらない。このとき空の本文の保存が 413 になり、コンソールにエラーが出るので、`expectErrors(page,[/413/,/camera_project/])` で許可する（3-m3）。

`tests/test_project_envelope.py`（pytest、WP-00b。サーバーは同じプロセスで起動し、ルートの `conftest.py` で一時データを使う）：`GET /api/project?envelope=1` が `{"project":…, "revision":…}` を返し、`revision == camera_revision(project)` であること。`GET /api/project` が生データを返すこと。ファイルが無いときは `{"project": {}, …}` であること。

`tests/test_bundle_camera_invalid.py`（pytest、WP-00b）：壊れたカメラファイルを置くと、`GET /api/project/bundle` が 422 `camera_project_invalid` で `backup` に名前を返し、退避コピーが同じフォルダに1つだけでき、元のファイルのバイト列は変わらないこと。同じ内容でもう一度 GET しても、退避コピーは1つのままであること。`POST /api/project/bundle`（正しい If-Match を付けても）が 422 で、バイト列が変わらないこと。ファイルが無いときは 200 で、既定のカメラを返し、ファイルは作られないこと。読めないファイルでは `backup:null` になること。読めないファイルは `chmod` では作らない（root で動かすと読めてしまう）。`monkeypatch.setattr(pathlib.Path, 'read_bytes', …)` で、対象のパスのときだけ `PermissionError` を出させる。`CameraProjectInvalid` が `ValueError` の一種でないこと。統合バンドルの POST の後の読み直し（373行）が非厳格のままであること（保存後に 200 が返る）。
- カメラの経路（2-B1）：壊れたファイルのとき、`GET /api/camera/project`（両形式）、`POST /api/camera/project`（If-Match なしと、ありの両方）、`POST /api/camera/sequence/edit` がすべて 422 `camera_project_invalid` を返し、バイト列が変わらず、退避コピーが1つだけであること。ファイルが無いときは、`POST /api/camera/project` が今までどおり保存できること。旧 `bai_camera.read()` が今のまま既定値を返すこと（WP-02a まで互換を保つ）。
- `read_project` の細部（3-M7）：UTF-8 として不正なバイト列（`b'\xff\xfe'`）・JSON の配列（`[]`）・必須キーの型違いのそれぞれで 422 と退避1つ。ファイルが無いときに返した値を書き換えても、次の呼び出しの既定値が変わらない（複製している）。退避の書き込みを `monkeypatch` で `OSError` にすると `backup:null` で 422、元のファイルは変わらない。
- `POST /api/camera/project/reset`（3-M2(b)）：本文なし・違う文言で 400 `confirmation_required`、正しい本文で、壊れたファイルなら退避（既にあれば作らない）してから既定値を保存し `{backup:<名前>}`、ファイルが無ければ `{backup:null}` で既定値を保存。


#### (h) ◇ 未実装のまま

新規作成（Q1）、複数プロジェクトの一覧・切替（DATA-008 の範囲外）、テンプレートからの作成（NF-019）、版の差分比較・任意の版への復元（DATA-009）、クラッシュ復元（DATA-010）、ポータブルZIP・アーカイブ（DATA-012）、素材参照の健全性検査（DATA-015）、ファイルへの書き出し・ファイルからの読込（旧画面に無い）、壊れたカメラ保存データの復旧操作（Phase E WP-02a）。

---

### 2.3 ③ 素材取り込み・素材管理（WP-02 一覧、WP-03 取り込み。実装できる細かさ）

#### (a) 移植する機能

| # | 旧画面の機能 | 根拠 | 新UIでの扱い |
|---|---|---|---|
| ③-1 | 統合素材一覧（FBX・GLB/VRM・PMX・VMD を1つに） | `server.py:85〜109, 289〜290`、`index.html:764` | 移植する（SCR-08 中央）。 |
| ③-2 | 名前で検索・形式で絞り込み | `index.html:750〜753` | 移植する。 |
| ③-3 | ファイルの有無（`available`）の表示 | `index.html:755〜759`（「ファイルなし」） | 移植する。 |
| ③-4 | 選んだファイルを拡張子で登録先へ振り分ける | `index.html:615〜646` | 移植する（取り込みダイアログ）。 |
| ③-5 | GLB/VRM の登録（VRM はモデル固定、GLB の既定はモーション） | `index.html:572, 631`、`server.py:762〜778` | 移植する。 |
| ③-6 | PMX＋テクスチャの ZIP 登録（スロット A/B。事前にサーバー版の機能を確認） | `index.html:524〜547`、`server.py:779〜829` | 移植する。 |
| ③-7 | VMD の登録（**複数選択**） | `index.html:325〜336, 339`、`server.py:830〜845` | 移植する。 |
| ③-8 | FBX の登録（**複数選択**。モーション／モデルA／モデルB。送る前に FBXLoader で読めるか、モーションならアニメーションがあるかを確かめる） | `index.html:237〜238`、`server.py:956〜973` | 移植する。 |
| ③-9 | 登録後に一覧を更新し、登録した素材を選ぶ | `index.html:572`（`studio:asset-imported`）、`771` | 移植する。 |
| ③-10 | 素材を開く（3D 表示・PMX 表示・VMD の選択） | `index.html:726〜749` | ④⑤で移植する（③では「3D で表示」ボタンを ◇ にしておき、④の完了時に結線する）。 |
| ③-11 | PMX の個別ファイル＋テクスチャの複数選択による登録 | `index.html:337〜338` | **移植しない**（AGENTS.md「PMX登録の現行方針：個別複数選択UIは再導入しない」）。 |

#### (b) 移植先

- **SCR-08 素材管理・アセットライブラリ**（`screens.js:273〜297`、`app.js:513〜613`）。モックの構成をそのまま使う。左は分類と件数。中央は場所タブ・検索・形式・並び替え・グリッド/リスト・大きさ・カード・インポートキュー。右はプレビュー・情報・タグ・依存素材・操作。
  - ツール：
    - `現行画面で素材を登録`（href）を［素材を取り込む…］（primary、`data-act="real"`、`openImportDialog()`）に変える。
    - `一括インポート`（◇ NF-004）は残す。why を「一括のタグ付け・変換は未実装です（複数ファイルの取り込みは［素材を取り込む…］でできます）」に直す。
    - `並び替え`（select、`screens.js:285`）は中央バーの並び替えと重複するので、ツールから削除する。
  - パネルの状態：`素材カテゴリ` は real。`検索・タグ` は real（note：「名前・形式で検索。タグは未実装」）。`メタデータ` は real（note：「登録情報のみ。作者・ライセンスは未記録」）。`インポートキュー` は real。`サムネイル` は ◇（MOTION-016）。`依存参照` は ◇（REVIEW-010）。
- **SCR-23 外部連携**（`screens.js:599〜617`）：中央カード「インポート」の `link('現行画面で素材を登録','/')` を `btn('素材を取り込む','nav:08?import=1')` に変える（§1.6-6 のクエリ対応を使う）。パネル `インポート` を real にする（evidence は③のテスト）。
- **SCR-01 ホーム**「最近の素材」（`app.js:499〜502`。**WP-03** で作業）：固定のサンプル4件を、**このページで取り込んだ素材**（`imports` ストアの完了した行、新しい順に最大4件）に置き換える。0件なら空表示「このページではまだ素材を取り込んでいません。」と［素材管理へ］を出す。`/api/assets` には登録日時が無いので、「最近」を全素材から求めない（偽の「最近」を出さないため）。

#### (c) 使う既存 API・コード

| 操作 | API | 応答・注意 |
|---|---|---|
| 一覧 | `GET /api/assets` → `{items:[{id, name, format, kind, source, available, previewable, filename?}]}` | `id` は `fbx:<24桁>`・`integrated:<保存名>`・`mmd:<A|B|vmd>:<名前>`（`server.py:91, 103, 109`）。 |
| サーバー版 | `GET /api/server-version` → `{version, features}` | PMX ZIP を送る前に、`features` に `pmx_zip_upload` があるか確かめる（`index.html:533〜536`）。 |
| GLB/VRM の登録 | `POST /api/integrated-v02/upload?kind=model|motion&name=<名前>`、本文はファイル | 名前は `[^/\\\x00]{1,180}\.(glb|vrm)`。VRM は `kind=model` だけ。先頭4バイトが `glTF`。成功すると `{ok, name, asset, kind}`（`asset` は SHA-256 の先頭20桁＋拡張子の小文字）。**同じ中身なら同じ保存名になり、既存の登録（名前・種類）は今回の名前・種類に置き換わる**（`server.py:772〜777`：同じ `filename` の行を消して追加し直す）。 |
| PMX ZIP の登録 | `POST /api/pmx-zip-upload?slot=A|B`、`Content-Type: application/zip` | PMX がちょうど1つ、展開後 600MB・1500ファイル以下。成功すると `{ok, slot, model, model_path, files}`。**同じ相対パスの既存ファイルは上書き**される（無関係なファイルは消さない：`server.py:819〜823`）。 |
| VMD の登録 | `POST /api/mmd-upload?slot=vmd&name=<名前>` | 名前は180文字以内で、`/`・`\` と先頭の `.` は不可、拡張子は `.vmd`。**同じ名前は確認なしで上書き**される（`server.py:840〜844`）。 |
| FBX の登録 | `POST /api/upload?kind=motions|modelA|modelB&name=<名前>` | `.fbx`、250文字以内。成功すると `{ok, id}`。`id = sha256(kind + '\0' + name)` の先頭24桁（`server.py:961`）。**同じ種類・同じ名前なら確認なしで上書き**される。`modelA`/`modelB` は、同じ枠の既存モデルの登録を外して元のファイルを削除する（`server.py:963〜971`）。 |
| 上限 | 本文 400MB（`server.py:59` の MAX_SIZE、`server.py:719〜722`） | クライアントで事前に拒否する。 |

#### (d) 新UIの動作

**分類（`assets-model.js`、純関数）**

```js
export const ASSET_CATS = [/* samples.js:15〜25 から移す。motion のラベルだけ「モーション」に変える */];
/** @returns {'char'|'motion'} 一覧の item を左の分類へ */
export function categoryOf(item) {
  if (item.source === 'fbx') return item.kind === 'motions' ? 'motion' : 'char';  // kind: modelA|modelB|motions
  if (item.source === 'integrated') return item.kind === 'model' ? 'char' : 'motion';
  if (item.source === 'mmd') return item.format === 'PMX' ? 'char' : 'motion';    // PMX→char, VMD→motion
  return 'motion';
}
export function sourceLabel(item) {} // fbx→'FBX登録（モデルA）'等、integrated→'GLB / VRM 登録'（catalog 由来も同じ）、mmd→'MMD スロットA'/'MMD スロットB'/'MMD VMD'
export function filterAssets(items, { cat, q, fmt, sort }) {} // q は name の小文字の部分一致、fmt は format の完全一致、sort は 'api'|'name'|'format'
export function countByCategory(items) {} // {all, char, motion, stage:0, prop:0, mat:0, fx:0, audio:0, video:0, image:0}
```
- 左の分類は `ASSET_CATS` の順序・ラベル・アイコンを使い、件数は `countByCategory` の実数にする。`motion` のラベルは「モーション」にする（FBX・GLB のモーションも入るので。旧ラベル「モーション（VMD）」は誤解を招く）。
- `char`・`motion` 以外（ステージ・小物・マテリアル・エフェクト・オーディオ・動画・画像）は、今の API に登録手段が無いので常に0件。選ぶと空表示「この種類の素材を登録する機能はまだありません。」と ◇ の説明を出す（ids はステージ `LYRIC-009`、オーディオ `LYRIC-006`、その他 `NF-004`。phase は screens.js の該当画面と同じ）。
- `ASSET_CATS` は `samples.js` から `features/assets-model.js` へ移し（データの定義であってサンプルではないので）、`samples.js` からは削除する。
- 「お気に入り」「コレクション」（`app.js:536〜538`）：見た目は残し、選ぶと ◇ を出す（お気に入り：素材のお気に入りは未実装〔旧画面のお気に入りはコンビネーションだけ〕、ids `['NF-004']`）。件数は「—」と表示する。

**中央（`assetLibrary`）**
- 場所タブ（`app.js:549〜550`）：選べるのは「ライブラリ」（＝ `/api/assets` 全体）だけ。他（ローカル／プロジェクト内／クラウド／最近追加／使用中）は ◇（クラウドは NF-013、他は NF-004）。
- 一括ボタン（`app.js:551〜554`）：3つとも ◇ のまま（既存の why を保つ）。
- 検索・形式・並び替え・グリッド/リスト・大きさ：既存の部品をそのまま実データに使う。
  - 形式の選択肢は、実データに現れる `format` の集合（`FBX, GLB, VRM, PMX, VMD`）。
  - 並び替えは `登録順`（API の順）・`名前順`・`形式順`。
  - 表示の設定は `bai.studio.lib.v1` に保存する（§1.11）。
  - v1 で予定していた「ファイルがある素材だけ表示」は、旧画面に無いので作らない。
- カード：サムネイル画像は使わない（MOTION-016 は未実装）。無地のタイルに形式（例「VRM」）と分類のアイコン（`user`／`motion`、`icons.js`）を出す。`available === false` は薄く表示し、「ファイルなし」のピル（旧画面と同じ語）を付ける。カードに `data-asset-id` を付ける。ハート（`fav`）は見た目を残して ◇ にする。
- 件数の表示（`app.js:593`）：「N件（サンプル）」を「N件」にする。
- 状態：読込中・失敗・未接続は `stateBox`（再読込付き）で出す。0件（素材なし）は「まだ素材がありません。［素材を取り込む…］」。
- 一覧の更新：画面を表示したとき `assets.status === 'idle'` なら読み込む。`studio:asset-imported`・`studio:assets-refresh` で読み直す。［↻］（`data-act="real"`）で手動で読み直せる。

**インポートキュー（中央の下、`app.js:579〜588` を置き換える）**
- タブ「インポートキュー（N）」の N は `imports.rows.length`。他の3タブ（同期ステータス／依存関係の確認／最近のダウンロード）は既存どおり ◇ の空表示。
- 行：ファイル名・種類（下表の表示名）・進み具合・状態。
  - 進み具合は送信中だけ実測する（XHR の `upload.onprogress` の `loaded/total`）。送信が終わってサーバーの応答を待つ間は「サーバーで処理中…」と出し、バーは不定表示（`data-indeterminate`）にして % は出さない。
  - 状態は `待機中`／`確認中`／`送信中 42%`／`サーバーで処理中…`／`完了`／`失敗：<理由>`／`取り消し`／`スキップ（確認で除外）` のどれか。
- 失敗した行には［もう一度］（同じファイルでやり直す。衝突の確認もやり直す）。送信中は［取り消し］（`abort()`）。行を消すのは［一覧から消す］（画面の中だけ。サーバーのファイルは消えないことを title に書く）。
- 注記「このページを開いている間の記録です（保存されません）」。

**右（`assetDetail`、`app.js:597〜613` を置き換える）**
- プレビュー：サンプル画像は使わず、形式のタイル（大）を出す。④の完了後は、GLB/VRM/PMX/FBX のモデルなら［3D で表示］で SCR-12 へ移る（`navigate('12',{query:{asset:id}})`）。③の時点では［3D で表示］は ◇（why：「3D 表示は ④ の移植で結線します」、ids `['MOTION-003']`、phase `PH.P2`）。
- 情報（`real`）：名前、形式、分類、登録元（`sourceLabel`）、ID（等幅で、選択してコピーできる文字）、ファイル（`available` なら「あり」、無ければ「なし（再登録してください）」）、保存名（integrated だけ `filename`、title は「SHA-256 先頭20桁＋拡張子」）、作成者・ライセンスは「未記録」（note：REVIEW-010 は未実装）。
- タグ・説明：◇（タグは未実装、`NF-004`）。依存素材：◇（`REVIEW-010`）のままにし、並びの表示例は削除する（実データでない画像を出さない）。
- 操作：「シーンで使う」は ◇（NF-014）、「置換」は ◇（REVIEW-010）、「エクスポート」は ◇（NF-010）のまま。**削除ボタンは置かない**（削除の API が無い）。

**取り込み（`import-rules.js` の純関数と `import.js`）**

```js
/** @typedef {'integrated'|'pmxZip'|'vmd'|'fbx'} Route */
/** @returns {{ok:true, route:Route, label:string, kinds:{value:string,label:string}[], defaultKind:string, warnings:string[]} | {ok:false, error:string}} */
export function classifyImport(name, size) {}
export const IMPORT_ACCEPT = '.glb,.vrm,.zip,.vmd,.fbx';
/** 送り先ごとの、既存の素材との衝突。純関数（ハッシュは呼び出し側で計算して渡す） */
/** @returns {{kind:'overwrite'|'reclassify'|'replaceModel'|'slotOverwrite', message:string}|null} */
export function conflictOf(entry, items, { contentSha20, fbxId }) {}
/** 1回の取り込みの中での矛盾（同じ枠に2つ等） */
export function batchErrors(entries) {} // → string[]
export function fbxIdFor(kind, name) {} // Promise<string>：crypto.subtle.digest('SHA-256', utf8(kind + '\0' + name)) の hex 先頭24桁（server.py:961 と同じ）
```

| 拡張子 | route | 表示名 | 種類の選択 | 既定 | 名前の検査（送信前） |
|---|---|---|---|---|---|
| `.glb` | integrated | GLB（モデル／モーション） | モーション／モデル | モーション（`index.html:631` と同じ） | `/^[^/\\\x00]{1,180}\.glb$/i` |
| `.vrm` | integrated | VRM モデル | なし（モデル固定） | model | `/^[^/\\\x00]{1,180}\.vrm$/i` |
| `.zip` | pmxZip | PMX モデル＋テクスチャ ZIP | 登録先：モデルA／モデルB | A | なし（中身はサーバーが検査する） |
| `.vmd` | vmd | VMD モーション | なし | — | 180文字以内、`/`・`\` を含まない、`.` で始まらない |
| `.fbx` | fbx | FBX | モーション／モデルA（置き換え）／モデルB（置き換え） | モーション（`index.html:640` と同じ） | 250文字以内 |
| その他 | — | — | — | — | `{ok:false, error:'この形式には対応していません（GLB・VRM・PMX ZIP・VMD・FBX）。'}` |

共通：`size > MAX_UPLOAD_BYTES` なら `{ok:false, error:'400MB を超えるファイルは登録できません。'}`。`size === 0` なら `{ok:false, error:'空のファイルです。'}`。

名前の検査の制限（2-m12）：
- **文字数の数え方**：サーバーの長さの制限（180・250文字）は Python の `len` で、コードポイントの数。JS の `name.length` は UTF-16 の単位の数なので、絵文字などで多く数えてしまう。クライアントでは `[...name].length`（コードポイント）で数える。正規表現の `{1,180}` も同じなので、`/u` フラグを付けて書く。
- **二重のデコード**：GLB/VRM の登録は、`parse_qs` でデコードした名前をもう一度 `unquote` する（`server.py:764`）。そのため、`%41` のように `%` と16進数を含む名前は、別の名前で登録される。サーバーは変えない（R1）。クライアントは名前に `%` が含まれていたら、行に警告「名前に % が含まれているため、登録される名前が変わることがあります」を出す（送信は止めない）。FBX・VMD は1回だけデコードされるので、この問題はない。

取り込みダイアログ（`openImportDialog()`、既存の `openModal()`）：
1. **ファイルの選択**：`<input type="file" accept=IMPORT_ACCEPT multiple>` で、**複数のファイルを選べる**（旧画面の `#motions`・`#vmd-input` と同じ）。選んだファイルごとに1行を作り、`classifyImport` の結果（表示名・種類の選択・警告）を出す。種類は行ごとに選ぶ。不可のファイルは理由を出してその行だけ除外し、取り込めるファイルが0件なら［取り込む］を無効にする。一括のタグ付け・変換は NF-004 なので作らない。
2. **1回の取り込みの中での矛盾**（`batchErrors`）：同じ回に「FBX モデルA が2つ」「FBX モデルB が2つ」「PMX ZIP の同じスロットが2つ」「同じ名前の VMD が2つ」「同じ種類・同じ名前の FBX が2つ」があれば、該当する行に「1回の取り込みで同じ登録先に置けるのは1つです」と出し、［取り込む］を無効にする（後のファイルが先のファイルを黙って上書きするのを防ぐ）。
3. **上書き・置き換え・再分類の事前確認（R8）**：［取り込む］を押したら、**ファイルの解析（FBXLoader）より前に**、全部の行について `conflictOf` を計算する。1つでも当てはまれば、確認ダイアログを1つ出し、該当するファイルとその影響を一覧で示す。ボタンは［すべて続ける］［該当ファイルを除いて続ける］［キャンセル］。
   - VMD：`id === 'mmd:vmd:' + name` が既にある →「同じ名前の VMD『{name}』があります。上書きすると元の内容は戻せません。」
   - FBX（同じ種類・同じ名前）：`'fbx:' + await fbxIdFor(kind, name)` が既にある →「同じ名前の FBX『{name}』（{種類}）があります。上書きすると元の内容は戻せません。」
   - FBX の modelA/modelB（別の名前）：同じ `kind` の FBX が既にある →「モデル{A|B}の現在の FBX『{既存の name}』は登録が外れ、元のファイルが削除されます。」（既存が無くても、種類の選択の横に「置き換え」の説明を常に出す）。
   - PMX ZIP：選んだスロットに PMX が既にある（`id` が `mmd:<slot>:` で始まり、`format==='PMX'`）→「モデル{slot}には既に PMX が登録されています。ZIP の中と同じパスのファイルは上書きされます（他のファイルは残ります）。」
   - GLB/VRM（同じ中身）：`file.arrayBuffer()` を `crypto.subtle.digest('SHA-256', …)` して、hex の先頭20桁＋拡張子の小文字を求める。`'integrated:' + それ` が既にあり、名前か種類が違う →「同じ内容の素材『{既存の name}』（{既存の種類}）が登録済みです。続けると、名前と種類が『{name}』（{種類}）に置き換わります（ファイルは同じものです）。」名前も種類も同じなら確認は出さない（結果が変わらないので）。拡張子が違えば保存名も違うので、同じ中身の `.glb` と `.vrm` は衝突しない。大きいファイルはハッシュの計算に時間がかかるので、行の状態を「確認中」にする。
4. **送信前の追加の検査**（行ごとに、キューで順番に行う）：
   - pmxZip：`GET /api/server-version`。失敗したら「サーバーのバージョンを確認できません。旧版のサーバーが起動している可能性があります。サーバーを止めて起動し直してください。」。`features` に `pmx_zip_upload` が無ければ「サーバーが PMX ZIP 登録に対応していません（現在のバージョン：{version}）。」（文言は `index.html:534〜536` から写す）。
   - fbx：`three/addons/loaders/FBXLoader.js` を動的に import し、`file.arrayBuffer()` を `new FBXLoader().parse(buf, '')` で解析する。例外が出たら「FBX として読み込めません：{message}」。種類がモーションで `animations.length === 0` なら「{name} にアニメーションがありません」（`index.html:237` と同じ）。three を読めなければ「FBX の確認に必要な 3D ライブラリを読み込めません。」で中止する（確認しないまま送ることはしない）。
5. **送信**：`uploadFile()` を使う。URL は上の表の API。`Content-Type` は、pmxZip が `application/zip`、他は `application/octet-stream`（旧と同じ）。
6. **結果**：
   - 成功：行を「完了」にする。`assets` を読み直し、登録した素材の id を求めて選択する（`?asset=` を更新）。`emit('studio:asset-imported', {id})`。
     - id の求め方：integrated は `'integrated:' + data.asset`、pmxZip は `'mmd:' + data.slot + ':' + data.model_path`、vmd は `'mmd:vmd:' + name`、fbx は `'fbx:' + data.id`。
     - 読み直した後に見つからなければ「登録しましたが一覧に見つかりません（再読込してください）」。
     - トースト「登録しました：{name}」（`kind:'real'`）。複数のときは最後に「{n}件を登録しました（失敗 {m}件）」。PMX ZIP は「登録完了：{model_path}、素材{files}件」。
   - 失敗：行を「失敗：{messageFor(err)}」にする。`bad_request` の serverMessage は、日本語（GLB/VRM 系）でも英語（PMX ZIP の `PMX ZIP rejected: …` など）でもそのまま出す。他の行の処理は続ける。
7. 同時に送るのは1件だけ。キューに積んだ順に1件ずつ処理する（ダイアログを閉じても続ける）。

#### (e) 置き換えるサンプル

`ASSETS`（`samples.js:28〜59`）の SCR-08・SCR-01 での使用、`app.js:513〜514` の `lib`（`favs` を含む）、`COLLECTIONS` の件数、キューの表示例3行（`app.js:581`）、詳細の依存素材の画像の列（`app.js:599, 607`）。`ASSETS` は SCR-11（`screens.js:348`、画像管理のサンプル）が引き続き使うので、`samples.js` には残す。

#### (f) 受け入れ条件

1. 種データ（§4）の素材が、分類・件数・形式・ファイルの有無とともに SCR-08 に出る。サンプルの素材名（例「夜の神社」）は SCR-08 に出ない。分類のラベルは「モーション」。
2. GLB・VRM・PMX ZIP・VMD を新UIから登録でき、一時データディレクトリの決まった場所に保存され、一覧に出て選ばれる。複数のファイルを選ぶと、1ファイル1行で順番に登録される。
3. FBX の壊れたファイルは送られずに拒否される。上書き・置き換え・再分類になる取り込み（VMD の同名、FBX の同名、FBX のモデル枠、PMX のスロット、GLB/VRM の同じ中身で名前か種類が違う）は、確認を経ないと送られない。［該当ファイルを除いて続ける］では、該当しないファイルだけが送られる。
4. サーバーの拒否理由が行に出る。送信中に取り消せる。
5. モックにだけある機能（お気に入り・コレクション・場所タブ・一括操作・タグ・依存素材・シーンで使う・置換・エクスポート）は ◇ の説明が出て、何も保存されない。
6. ホームの「最近の素材」には、このページで取り込んだものだけが出る（WP-03）。
7. 実 `data/` のハッシュが変わらない。型検査と既存テストが合格する。

#### (g) テスト（追加）

- `tests/studio-p2-import-rules.test.mjs`（`node --test`、ブラウザー不要）：
  - `classifyImport` の表（上の6行に加え、上限・空・長すぎる名前・`a/b.vmd`・`.hidden.vmd`）。
  - `conflictOf` の5種類と「同じ名前・同じ種類の GLB は確認なし」。`batchErrors` の5種類。
  - `fbxIdFor('motions','a.fbx')` が Python の `hashlib.sha256(b'motions\0a.fbx').hexdigest()[:24]` と一致すること（期待値はテストの中に固定し、作るときに Python で求める）。
  - `categoryOf`・`sourceLabel`・`filterAssets`・`countByCategory` を表で検査する。
  - `MAX_UPLOAD_BYTES === 400*1024*1024` と、`server.py` の `MAX_SIZE=400*1024*1024` の文字列が一致すること。
- `tests/studio-p2-assets.test.cjs`（Playwright、ポートは `P2_ASSETS_PORT` で既定 8796）：

| テスト名 | 主な検査 |
|---|---|
| `library lists real assets by category` | 種データ：integrated モデル1（ファイルあり）、integrated モーション1（ファイルなし）、mmd VMD 1、mmd A の PMX 1、FBX motions 1（ファイルあり）。左の「キャラクター」が2、「モーション」が3、「すべての素材」が5。ファイルなしのカードに「ファイルなし」。「夜の神社」が無い。 |
| `search and format filter work on real data` | 検索語で1件、形式「VMD」で1件。 |
| `detail shows registration facts` | カードを選ぶと、右に ID・登録元・保存名（integrated）が出る。URL に `asset=` が付く。再読込しても同じものが選ばれている。 |
| `import dialog opens from nav query and clears it` | `/workspace/23` で［素材を取り込む］を押すと、全体の再読込なしで（`page.on('load')` が0回）SCR-08 のダイアログが開き、URL から `import=1` が消える。 |
| `import GLB and VRM` | `tests/fixtures/synthetic_test_model.glb` を `a.glb`・GLB（モーション）として取り込むと、行が「完了」になり、一時データに `integrated_v02/assets/<sha20>.glb` ができ、一覧に出て選ばれる。同じバイト列を `b.glb`・GLB（モデル）として取り込むと、**再分類の確認**（「名前と種類が…置き換わります」）が出る（保存名が同じ `<sha20>.glb` になるため：`server.py:771〜775`）。［すべて続ける］で `user_assets.json` の該当行が `name:'b.glb'`・`kind:'model'` の1行になる。 |
| `same bytes as VRM do not conflict with GLB` | 上と同じバイト列を `c.vrm` として取り込むと、種類の選択は出ず、確認も出ない（保存名が `<sha20>.vrm` で別のファイルになるため）。`user_assets.json` に `.glb` と `.vrm` の2行がある。 |
| `multiple files import sequentially` | GLB と VMD を一度に選ぶと、2行になり、`/api/integrated-v02/upload` と `/api/mmd-upload` が順番に（重ならずに）1回ずつ送られる。 |
| `batch with two FBX for the same model slot is rejected` | 2つの FBX を両方ともモデルA にすると「同じ登録先に置けるのは1つです」が出て、［取り込む］が無効。 |
| `import PMX ZIP checks server version first` | `tests/fixtures/minimal_pmx.zip`（§4）をスロット A に送る。`/api/server-version` へのリクエストが `/api/pmx-zip-upload` より先。成功の文言に `model_path` が入る。`mmd_assets.json` の A に PMX がある。 |
| `VMD overwrite requires confirmation` | VMD を2回取り込むと、2回目で確認が出る。［キャンセル］なら `/api/mmd-upload` へのリクエストは1回だけ。 |
| `FBX same-name overwrite requires confirmation` | 種データに FBX motions `walk.fbx`（`id` は `fbx:` ＋ Python で求めた24桁）がある。`walk.fbx`（中身はランダム）をモーションとして選ぶと、解析より前に確認が出る。［キャンセル］なら `/api/upload` は0回。 |
| `FBX model replacement warns before parsing` | 種データに FBX modelA がある。別の名前の FBX（中身はランダム）をモデルA にすると、確認に既存の名前と「元のファイルが削除されます」が出る。［キャンセル］なら `/api/upload` は0回。確認が解析より前なので、正しい FBX は要らない。 |
| `FBX is validated before upload` | 衝突しない名前の `bad.fbx`（ランダム256バイト）をモーションにすると、行が「失敗：FBX として読み込めません…」になり、`/api/upload` は0回。 |
| `server rejection is shown` | `page.route('**/api/integrated-v02/upload**', r => r.fulfill({status:400, body:JSON.stringify({error:'GLB/VRM形式として認識できません'})}))` の状態で取り込むと、行にその文言が出る。 |
| `home shows only assets imported in this page` | 取り込みの前は空表示。1件取り込むと、SCR-01 にその1件が出る。 |
| `mock-only controls explain themselves` | ハート・「コレクション」・場所タブ「クラウド」・「一括タグ付け」・タグ欄・「シーンで使う」で ◇ ダイアログが出る。 |

#### (h) ◇ 未実装のまま

サムネイルの生成（MOTION-016）、素材の削除・名前の変更（API が無い）、タグ・お気に入り・コレクション・一括のタグ付けと変換（NF-004）、クラウド（NF-013）、依存参照・ライセンス・作者の記録（REVIEW-010）、重複の検出表示（DATA-013。取り込み時の衝突の確認だけは R8 として行う）、ステージ・小物・音声・画像などの登録（API が無い）、ドラッグ＆ドロップでの取り込み（旧画面に無い）、PMX の個別ファイル登録（方針で廃止）。

- **O-③-1**（任意）：FBX の正常な登録・表示を自動テストするための、最小の ASCII FBX 7.4 を標準ライブラリだけで作る `tools/make_test_fbx.py`。作れたら、`import FBX motion succeeds` のテストを足す。作れなければ「FBX の正常登録は未検証」と台帳に書く。テスト専用の分岐は本番コードに入れない。

---

### 2.4 ④ キャラクター・ステージ読込と3D表示（WP-04、WP-04b。章立ては同じ。O-④-1〜7 は 2026-10-20 に Opus で決定済み：(h)）

#### (a) 移植する機能

| # | 機能 | 根拠 |
|---|---|---|
| ④-1 | GLB/VRM の 3D 表示（`/api/integrated-v02/asset/<file>`、GLTFLoader、高さ 2.0 に正規化） | `index.html:206`、`camera_3d.js:278` |
| ④-2 | PMX の 3D 表示（`/api/mmd-file/<slot>/<name>`、MMDLoader、テクスチャは相対パス） | `index.html:302〜316` |
| ④-3 | FBX モデルの 3D 表示（`/api/file/<id>`、FBXLoader） | `index.html:231, 236` |
| ④-4 | 視点の回転・ズーム（OrbitControls） | `index.html:139` |
| ④-5 | ボーン一覧と分類（`classifyBone`） | `camera_3d.js:98`（`discoverBones`）、`camera_follow_config.js`（共有） |
| ④-6 | 素材一覧からモデルを開く | `index.html:726〜749`（`openAsset`） |
| ④-7 | 作業中のモデルを制作状態に記録（`workspace.asset`、GLB/VRM のみ） | `camera_3d.js:290〜292`（workspace の `asset`）、`project_state_bundle.py:36〜49` |
| ④-8 | ステージ専用の読込（大型ステージの分割読込・ステージ素材の種類） | 旧画面に無い（`LEGACY_UI_INVENTORY_JA.md` ③）→ ◇（LYRIC-009、Phase G）。④-11 は、登録済みのモデル素材をステージとして置くだけ |
| ④-9 | 骨格解析・リターゲット準備（`#skeleton-lab`）：素材の選択、骨格・レストポーズの検査、ボーン対応の提案・プレビュー、キャリブレーション、比較、プロファイル | `retarget_ui.js`（34行）。API は `/api/assets` と `/api/retarget/` 配下の `calibration`・`compare`・`explicit-rest-preview`・`glb-clip-hierarchy-inspection`・`glb-clip-rest-preview`・`mapping-preview`・`motion-channels`・`pose-proposal`・`profile-for-pair`・`profiles`・`rest-hierarchy-inspection`・`rest-pose-inspection`・`root-preview`・`vrm-humanoid-preview`・`vrm-local-transfer-preview`・`world-rest-motion-preview` |
| ④-10 | GLB/VRM のポーズ比較（実験。モデルは変えない） | `v01629_mesh_compare.js`（26行、three を使う。API は `/api/retarget/vrm-local-transfer-preview`） |
| ④-11 | **ステージ配置の基本（OWNER-2：NF-014 の一部を承認）**：登録済みのモデル素材1つをステージとして置き、位置・回転・大きさを調整して制作状態に保存する | 所有者決定 2026-10-20（`ROADMAP_JA.md` 4249bc0・8373b54）。表示は④-1〜④-3 のローダーを使い回す。保存先は §1.15 B-4。旧画面には無い（承認済みの追加） |

#### (b) 移植先

- SCR-12 キャラクター管理（`screens.js:352〜374`）：
  - 左「キャラクター」：`categoryOf === 'char'` の実素材にする（サンプル6件を置き換える）。
  - 中央：three-host のビューポート。
  - 右タブ：「ボーン」は実際のボーン一覧（④-5）。「モーフ」「物理」は ◇。「リターゲット」は、④-9・④-10 の移植先（SCR-13。O-④-5 決定）へのリンクにする（WP-04b。それまでは既存の旧画面へのリンクのまま）。
  - ツールの `現行画面でモデルを表示`（href）は、旧画面との比較用に残す。
- SCR-06 シーン・ステージ・素材配置（`screens.js:228〜245`）は、④-11 の分だけ結線する（WP-04）：
  - 中央：three-host のビューポート（§1.7）。作業中のキャラクター（`workspace.asset`）とステージを並べて表示する。
  - 右「トランスフォーム」タブ：モックの既存の部品をそのまま使う。位置 X/Y/Z（−50〜50 m、0.1 刻み）、回転 Y（−180〜180°）、拡大（0.1〜10 倍、0.1 刻み）。モックに無い回転 X/Z は足さない（新しく置くときは 0。既に保存された X/Z は変えずに残す。O-④-7 決定）。
  - ステージの素材の選択：モックのパネル一覧にある「アセットブラウザー」（`screens.js:235`）は、右のタブに置き場所が無い。そこで「トランスフォーム」タブの先頭に節「ステージの素材」（選択欄1つと［ステージを外す］）を足し、パネル「アセットブラウザー」の実体とする（承認済みの④-11 に要る最小の部品。見た目の追加なので WP-04 の Opus のレビューで確かめる）。選べるのは③の素材一覧のうちモデルの素材（GLB/VRM の `integrated:`、PMX の `mmd:A:`/`mmd:B:`、FBX モデルの `fbx:`）だけ。新しい種類・新しいスロットは作らない。
  - ツールの `ステージを読み込む`：WP-00c で予定の表示を「P2 ④」に直しておき（導線点検の項目3）、WP-04 で実際のボタン（`data-act="real"`。「トランスフォーム」タブの「ステージの素材」の選択欄へ移る）に変える。大型ステージの分割読込（LYRIC-009、Phase G）は作らない。
  - 左「シーンツリー」、「表示・依存関係」、表示/影/ロック、座標系の切替、ライトは ◇ のまま（NF-014 の残り。未承認）。§1.13 の薄い表示のまま。
- SCR-08 の詳細の［3D で表示］を結線する。

#### (c) 使う既存 API・コード

`GET /api/integrated-v02/asset/<filename>`（未登録・ファイルなしは 404、カタログが使えなければ 503：`server.py:335〜348`）、`GET /api/mmd-file/<slot>/<name>`（`server.py:293〜307`）、`GET /api/file/<id>`（`server.py:350〜355`）、`GET /api/assets`、④-9・④-10 の `/api/retarget/*`。

`model-loader.js`（新規）と `normalize.fork.js`（フォーク。関数ごとに元の行を書く）：
```js
// normalize.fork.js
export const TARGET_HEIGHT = { GLB: 2.0, VRM: 2.0, PMX: 1.8, FBX: 1.95 }; // index.html:206 / 310 / 231, camera_3d.js:278
export function normalizeModel(object, format, THREE) {} // 戻り値は {scale, offset:[x,y,z]}。GLB/VRM：高さを TARGET_HEIGHT に、XZ の中心を原点に、足を y=0 に（index.html:206 と同じ式）。PMX/FBX：高さを TARGET_HEIGHT（1.8/1.95。O-④-1 決定）に、足を y=0、XZ の中心を原点に（旧画面の ±1.4 の配置と向きの回転は2体を並べるためのものなので、単体の表示では行わない：O-④-3 決定）
export function stageUnitScale(object, format) {} // O-④-6 決定：ステージの 1 単位あたりのメートル。PMX 0.08、GLB/VRM 1、FBX は object.userData.unitScaleFactor / 100（無ければ 0.01）
// model-loader.js
export async function loadModel(item, THREE, loaders) {} // item は /api/assets の行。戻り値は {object, animations, format}
```

#### (d) 新UIの動作

- 左で選ぶと `?asset=<id>` になり、中央で読み込む（読込中を表示）。成功したら HUD に「名前・形式・クリップ N 件・頂点数」を出し、`emit('studio:model-loaded')`。
- 失敗したとき：404 は「元ファイルが見つかりません。素材を再登録してください。」（`index.html:727` の文言）。読込中の例外は「3D 表示できませんでした：{message}」。`available === false` の素材は選べるが、読み込まずに同じ文言を出す。
- 右「ボーン」：`object.traverse` で `isBone` を集め、名前と `classifyBone(name)` の分類を表にする（検索付き）。ボーンが無ければ「ボーンがありません（静的モデル）」。
- ［このモデルを制作に使う］（GLB/VRM のときだけ有効、`data-act="real"`）：`setWorkspaceAsset(item.filename)` を呼ぶ（§2.2(d)-9 のマージ規則）。④が書くのは `asset` だけで、`frame` と他のフィールドは残す。`asset` が変わったときだけ `clip` を `null` にする。
  - `combinationMissing` のときは、ボタンの横に「保存すると、空のコンビネーション（project_state.json）も一緒に作られます。」と常に出す。
  - 押した後のトーストは「作業中の素材を {name} にしました。［保存］で保存されます。」で、SCR-18 へのリンク（`nav:18`）を付ける。
  - PMX/FBX のときはボタンを無効にし、title に「統合保存に記録できるのは GLB/VRM だけです（project_state_bundle.py の制限）」と書く。
- ツール「選択」は ◇（オブジェクトの選択は旧画面に無い）。「回転」は OrbitControls を有効にする（既定）。
- 画面を離れたら three-host を破棄する（§1.6、§1.7）。
- **O-④-4（決定済み）**：workspace の所有者を1つにする規則（§2.2(d)-9）。Phase E §7 にも注記した。
- **ステージ配置（④-11、SCR-06）**：
  - 「ステージの素材」で選ぶと、④-1〜④-3 と同じローダーで読み込み、ステージとして置く。**高さの正規化も中心合わせもしない**（ステージは実寸で、ファイルの原点をそのまま `position` に置く）。単位の換算だけ行う：PMX は 1 単位 = 0.08 m、GLB/VRM は 1 単位 = 1 m、FBX はファイルの `UnitScaleFactor`（1 単位あたりの cm）÷ 100（無ければ 0.01）。表示の拡大は「単位の換算 × 保存した `scale`」。保存する `scale` は利用者の倍率だけ（換算は含めない）。回転は度をラジアンにして three の既定の順（XYZ）で当てる。換算の値は実ファイルで未検証（O-④-6 決定）。
  - 作業中のキャラクター（`workspace.asset`。GLB/VRM だけ）は `camera_3d.js` と同じ正規化（高さ 2.0・足 y=0・XZ の中心を原点）で置く。ステージの位置・大きさは、この「カメラ画面と同じ世界」の座標で保存する（O-④-6 決定）。**【2026-10-20 に上書き：キャラクターも正規化せず、ステージと同じ単位の換算だけで置く。§2.4(h) の O-④-6 の下の「上書き」を参照】**
  - スライダーを動かすと、表示にすぐ反映し、`setWorkspaceFields({stage:{asset, position:[x,y,z], rotation:[0,ry,0], scale}}, {source:'store'})` を呼ぶ（§2.2(d)-9。dirty になり、保存は［保存］）。範囲外の値はスライダーの範囲で丸める（サーバーも §1.15 B-4 の範囲で拒否する）。
  - ［ステージを外す］で `stage:null` にする。読込に失敗したら、④(d) の失敗の文言を出し、`stage` は変えない。
  - 起動時・読込時に `workspace.stage` があれば、その素材を読んで同じ配置で置く。素材が一覧に無ければ「ステージの素材が見つかりません：{asset}」と出し、`stage` は消さない（利用者が［ステージを外す］で消す）。
  - 区画の状態：「3Dビュー」「トランスフォーム」「アセットブラウザー」は `real`（`evidence` は下のテスト）。他は今のまま。

#### (e) 置き換えるサンプル

SCR-12 左の6件、中央の `img:'viewport-character'`、右「ボーン」の固定8件（`screens.js:369`）、SCR-08 の詳細の［3D で表示］の ◇。

#### (f) 受け入れ条件（案）

- 合成 GLB（§4）を登録し、SCR-12 で選ぶと、キャンバスに背景以外のピクセルが1つ以上ある。`baiStudio.viewport.getState()` が `{loaded:true, scale:≈1, offset:≈[0,0,0]}`（誤差 1e-9。合成モデルは高さ 2.0・中心 0 だから）。ボーン一覧に10本（`hips`〜`foot_r`）が出る。
- ［このモデルを制作に使う］の後、`workspace.frame` は種データの値のまま。［保存］の後のファイルで `asset` だけが変わっている。
- PMX（O-④-2 決定）：`minimal_pmx.zip` を③で A に登録し、SCR-12 で `model/test.pmx` を選ぶと、キャンバスに背景以外のピクセルが1つ以上あり、`getState()` が `{loaded:true, format:'PMX', scale:≈1.8}`（最小 PMX は高さ 1.0、誤差 1e-6）。ボーン一覧に1本（`センター`）が出る。テクスチャ `tex/a.png` を `/api/mmd-file/A/tex/a.png` から読む（404 が出ない）。
- PMX・FBX をステージに選ぶと、表示の拡大が単位の換算（PMX 0.08、`minimal_model.fbx` は `UnitScaleFactor` が無いので 0.01）× `scale` になる（`getState().stage`、誤差 1e-9）。
- ステージ配置（④-11）：合成 GLB をステージに選び、位置 X=3・回転 Y=90・拡大 2 にして［保存］すると、workspace ファイルの `stage` が `{asset:'integrated:…', position:[3,0,0], rotation:[0,90,0], scale:2}` になる。読み直すと同じ配置（`baiStudio.viewport.getState().stage`、誤差 1e-9）。`frame`・`asset`・`clip` は変わらない。

#### (g) テスト（案）

- `tests/studio-p2-viewport.test.cjs`（ポート 8795）：
  - `glb renders and normalizes like the camera page`（上記）。
  - `viewport is disposed on leave`：SCR-12 から SCR-08 へ移ったとき、`WEBGL_lose_context` が呼ばれたことを、`page.evaluate` で仕込んだスパイで確かめる。
  - `missing file shows re-register message`。
  - `workspace asset merge keeps frame and other fields`：種データの workspace は `{frame:42, asset:'a.glb', clip:1}`。別の GLB を選ぶと、保存後に `{frame:42, asset:'<新しい名前>', clip:null}` になる。
  - `workspace asset is set only for GLB/VRM`。
  - `missing combination warns before creating it`。
  - `external change warns while workspace is dirty`（②から移したテスト）：dirty にした後で外部から `POST /api/project` を送ると、表示は変わらず、警告文「自動では読み込みません」が出る。
  - `stage placement saves and restores`（上記の受け入れ条件）。
  - `stage is kept when legacy camera bundle save omits it`：ステージを保存した後、旧 `camera.html` の形の本文（`workspace` が `{frame,asset,clip}` だけ）で `POST /api/project/bundle` を送っても、`stage` が残る（§1.15 B-4 の画面側の確認）。
  - `bundle body always carries workspace once stage is set`（v5 C4）：workspace ファイルが無い種データで、ステージだけを置いて［保存］すると、`POST /api/project/bundle` の本文に `workspace`（`stage` を含む）があり、保存後のファイルに `stage` がある。
  - `stage missing asset keeps value`：`stage.asset` を一覧に無い id にした種データで開くと、文言が出て、保存しても `stage` が残る。
- 照合（`tests/studio-p2-normalize-parity.test.cjs`）：同じ合成 GLB を `/camera.html` の［3Dモデルを表示］で読む。`camera_3d.js` のモデルは `window` から辿れないので、`publishModelFraming` の `bai-camera-model-bounds` イベントの `min/max` を受け取る。それと新UIの包囲箱が、誤差 1e-6 で一致することを確かめる。

#### (h) ◇ 未実装のまま／未決

ステージ専用の読込（LYRIC-009）、NF-014 のうち ④-11 以外（シーンツリーの編集・表示/影/ロック・依存関係・ライト・複数のステージ・小物）、モーフの編集（LIP-004）、物理（MOTION-021）、衣装（NF-005）、ウェイトの編集（NF-023）、オブジェクトの選択（ビューポート上で掴んで動かす操作を含む）。
- **O-④-1**：PMX/FBX の単体表示の正規化（旧の 1.8/1.95 を保つか、2.0 にそろえるか）。
  - **決定（2026-10-20、Opus）：旧の値を保つ（PMX 1.8、FBX 1.95、GLB/VRM 2.0）。** SCR-12 の単体表示だけに使い、保存はしない（`getState().scale` に出すだけ）。
  - 理由：単体表示の高さは、他の物（ステージ・カメラ）と並べないので、値そのものに意味はない。旧画面と同じ値なら、所有者確認（§3.1）で旧画面と新UIを横に並べて見え方を比べられる。下流で使う正規化は `camera_3d.js` の GLB/VRM 2.0 だけで（⑥・Phase E のカメラ）、PMX/FBX の単体表示の値に頼るものは無い。2.0 にそろえると、旧画面との差が「移植の誤り」か「意図した変更」か見分けにくくなるだけで得るものが無い。
- **O-④-2**：PMX の自動テスト用の最小モデルを作れるか。
  - **決定（2026-10-20、Opus）：作れた。** `tools/make_test_pmx.py`（標準ライブラリだけ）が PMX 2.0 の最小構成（頂点3・面1・テクスチャ1 `tex/a.png`・材質1・ボーン1 `センター`・頂点モーフ1 `あ`・表示枠2・剛体0・ジョイント0、UTF-16LE、インデックス 1 バイト、高さ 1.0）を作る。`tools/make_test_pmx_zip.py` がそれを `model/test.pmx` として `tests/fixtures/minimal_pmx.zip` に入れる（ダミーを置き換えた。③の登録のテストも同じ ZIP で合格）。
  - 確認：`tests/studio-p2-pmx-fixture.test.cjs` が、three@0.160.1 の `MMDParser` で解析し（頂点3・面1・材質1・ボーン1・モーフ「あ」）、Chromium（SwiftShader）で旧画面と同じ `MMDLoader` で読んで、`SkinnedMesh`・モーフ辞書 `{あ}`・相対パスのテクスチャの読込・描画されたピクセルを確かめる。`tests/test_make_test_pmx.py` が、コミットした ZIP と生成スクリプトの出力のバイト一致を確かめる。three が無い環境では 3D の2件が skip（理由付き）。
  - 残る未検証：実在の PMX（多材質・IK・剛体・物理・スフィア・トゥーンの個別テクスチャ・PMX 2.1）と GPU。最小 PMX は形式の入口を確かめるだけ。§2.5 のモーフ「あ」の再生テスト（OWNER-4）と §2.9 S5 は、この最小 PMX で「未検証」ではなく実際に確かめる。
- **O-④-3**：A/B の2体を並べる表示（`index.html:231, 310` の ±1.4 の配置と ±90° の向き）。
  - **決定（2026-10-20、Opus）：WP-04 では作らず、⑤（WP-05d。SCR-05 の A/B の 3D と連結再生：§2.5(d)）で扱う。** SCR-12 と SCR-06 は1体（SCR-06 はキャラクター1体＋ステージ1つ）。
  - 理由：±1.4 と向きの回転は、旧画面の A/B の連結再生（2体が向き合って交互に動く）のための配置で、単体の表示・ステージ配置には要らない。歌ってみたの主な形（キャラクター1体＋ステージ＋ダンス VMD）でも1体で足りる。⑤で連結再生を移すときに、旧の値（±1.4・±90°）をそのまま写す。
- **O-④-5**：④-9・④-10 の画面の割り付けと、`v01629_mesh_compare.js` の three 表示を three-host に載せる方法。
  - **決定（2026-10-20、Opus）：SCR-13 にまとめる（既定どおり）。** SCR-12 の「リターゲット」タブは、今ある［VMD編集・リターゲット（13）へ］（`nav:13`、`screens.js:392`）だけにする。
    - ④-9（骨格解析・リターゲット準備）：SCR-13 の右の既存のタブ「ボーンマップ」（`screens.js` の `id:'map'`）に入れる。新しいタブは作らない。素材の選択は③の素材一覧（`/api/assets`）の選択欄にし、各 `/api/retarget/*` の応答は表と JSON の表示にする（`retarget_ui.js` が今出しているものと同じ項目。項目を増やさない）。
    - ④-10（ポーズ比較）：SCR-13 の中央のビューポートを three-host にする。比較の間だけ、元の静止姿勢と補正候補の2つのオブジェクトを、旧と同じ x = −1.15 / +1.15（足を y=0、各自の XZ の中心を合わせる。`v01629_mesh_compare.js` の配置）に並べる（`setObject` を拡張せず、`scene` に2つ目を足して `clear()` で一緒に消す）。モデルは GLB/VRM の `integrated:` の素材から選ぶ（ファイル選択は使わない）。「試験的で、正確なポーズを保証しない」の同意のチェック（旧の文言）は残す。モデルは変えない（旧と同じ）。中央の4分割（モックの `quad`）は、1つのビューポートに置き換え、4分割は ◇ のまま。
  - 理由：SCR-13 は画面名が「モーションVMD編集・リターゲティング」で、モックにも「ボーンマップ」（`retarget_ui.js` を指す）と「3D比較」の区画が既にある。SCR-12 に置くと、同じ機能の入口が2つになる。three-host は同時に1つ（§1.7）なので、2体は同じ scene に並べるのがいちばん小さい。
- **O-④-6**：ステージの単位の換算と、FBX の単位。
  - **決定（2026-10-20、Opus）：PMX 0.08 m/単位、GLB/VRM 1 m/単位、FBX は `UnitScaleFactor ÷ 100` m/単位（無ければ 0.01）。** 換算は表示のときだけ掛け、保存する `scale` は利用者の倍率だけ。ステージは正規化も中心合わせもせず、ファイルの原点を `position` に置く。キャラクター（GLB/VRM）は `camera_3d.js` と同じ高さ 2.0 の正規化で置き、ステージの値はその世界の座標で保存する。
  - 理由：
    - glTF（GLB/VRM）は仕様で 1 単位 = 1 m。PMX は仕様に単位が無いが、MMD の 1 単位 ≈ 8 cm が広く使われる換算（Blender の mmd_tools の既定の読込倍率 0.08 と同じ）。
    - FBX は `GlobalSettings` の `UnitScaleFactor`（1 単位あたりの cm。既定は 1 = cm）を持つ。three@0.160.1 の `FBXLoader` はこの値を `userData.unitScaleFactor` に入れるだけで、大きさには掛けない（`FBXLoader.js:1509〜1511`）。「読込時の単位をそのまま」にすると、cm の FBX（Mixamo など）は 100 倍の大きさになる。
    - 配布の MMD ステージは、原点が床の中心になるように作られ、ダンス VMD のセンターの移動もその原点を前提にしている。中心合わせをすると、ステージと踊りの位置がずれる。
    - キャラクターを `camera_3d.js` と同じ世界に置けば、⑥のカメラ画面でステージを並べたときに、保存した値をそのまま使える。代わりに、実寸 1.6 m の VRM は 2.0 m に見えるので、実寸のステージに対して約 1.25 倍になる。合わないときは利用者が「拡大」で合わせる（保存される）。
  - 未検証：実在の PMX・GLB・FBX のステージでの見え方、GPU。台帳の `unverified` に書く。所有者確認で明らかにおかしければ、値の見直しは WP-04 の Opus レビューで決める。
- **上書き（2026-10-20、開発側の判断）**：上の O-④-6 のうち「キャラクター（GLB/VRM）は `camera_3d.js` と同じ高さ 2.0 の正規化で置き、ステージの値はその世界の座標で保存する」と、理由の最後の「実寸 1.6 m の VRM は 2.0 m に見えるので、実寸のステージに対して約 1.25 倍になる」は採らない。歌ってみたの主な使い方は、MMD の PMX キャラクターと MMD 用ステージの組み合わせで、どちらも MMD の単位で作られているので、正規化するとキャラクターだけが大きさの関係を崩す。そこで SCR-06 のシーンでは、キャラクターも高さを正規化せず（中心合わせもせず、ファイルの原点をそのまま置く）、ステージと同じ単位の換算（PMX 0.08 m/単位、GLB/VRM 1 m/単位、FBX は `UnitScaleFactor` ÷ 100 m/単位）だけを掛ける。これで MMD と同じ大きさの関係になる。高さの正規化（O-④-1 の値：GLB/VRM 2.0・PMX 1.8・FBX 1.95）は、単体のプレビュー表示（SCR-12 などのキャラクター単体の画面）にだけ使う。その結果、保存する `workspace.stage` の位置・倍率は「単位を換算しただけのシーンの世界」の座標になり、`camera_3d.js` の世界（キャラクターを高さ 2.0 に正規化したもの）とは、キャラクターが 2.0 m でない場合に一致しない。⑥でカメラ画面にステージを並べるときの換算は、WP-06b の配置表（O-⑥-4）で決める（P2 の WP-04 ではカメラ画面にステージを出さないので影響しない）。また `workspace.asset` は GLB/VRM だけを保存できる（§1.15、project_state_bundle.py の制限）ので、SCR-06 のキャラクターは実際には GLB/VRM（1 m/単位）で、PMX のキャラクターを SCR-06 に置く経路は無い。PMX の換算（0.08）は、同じ部品（`viewport/scene-parts.js`）で最小 PMX と GLB のステージを同じシーンに置くテスト（`tests/studio-p2-viewport.test.cjs` の `pmx character and glb stage share the scene in mmd units`）で、PMX の高さがファイルの単位×0.08 m になることを確かめる。
  - **Opus レビューの注記（2026-10-20、WP-04）**：PMX のキャラクターを SCR-06 に置けないのは、⑥（WP-06b O-⑥-4 は要素IDの配置表）で整理される予定の事項ではなく、計画の空白である。`workspace.asset` は GLB/VRM 限定（§1.15）で、⑥のカメラ画面（`camera_3d.js:278` の `loadAsset`）も GLB/VRM しか読まず、Phase E §2.8 の workspace の拡張にも PMX のキャラクターの保存先は無い。主要シナリオ（PMX → ステージ配置 → カメラ）を PMX で通すには、(1) workspace に任意のキー（例 `character:{asset:"mmd:A:…"}`。B-4 と同じ「本文に無ければ既存の値を残す」規則）を足す保存形式の変更と、(2) ⑥のカメラ画面での PMX の表示（MMDLoader）が要る。どちらも承認済みの範囲に無い計画の追加なので、WP-04 では直さず、所有者の判断を待つ（台帳 `P2_PORT_STATUS.json` の WP-04 `unverified`、WORK_STATE の所有者への質問 Q5）。なお、PMX はステージの素材（`mmd:A:`/`mmd:B:`）としては今も SCR-06 に置ける。
- **O-④-7**：回転 X/Z。
  - **決定（2026-10-20、Opus）：P2 では部品を足さない。** 新しく置くときの X/Z は 0。読み込んだ `workspace.stage.rotation` の X/Z が 0 でなければ、表示に当て、保存でもその値を変えずに残す（画面が編集しない値は消さない。§2.2(d)-9 のマージ規則と同じ考え方）。
  - 理由：ステージは床に水平に置くのが普通で、向きは Y だけで足りる。モックに部品が無く、足すと機能の追加になる（スコープ凍結）。保存形式は3つの値を持つので、後で部品を足しても形式は変わらない。

---

### 2.5 ⑤ モーション（VMD）適用・タイムライン再生（WP-05a〜05g。2026-10-20 に Opus で詳しくした。O-⑤-1〜8 は (h) で決定済み。所有者確認待ちは (i)）

- 基準：HEAD `8de3801`（`index.html` は `5865209` の行番号のまま。`server.py` は WP-00b〜04b の変更で行がずれたので、**本節の `server.py:行` は `8de3801` の番号**）。旧画面は今後も変わることがあるので、実装時は関数名・要素IDで探す。
- 本節の前提（WP-04・04b で実装済み）：`viewport/three-host.js`（同時に1つ。描画は必要なときだけ `invalidate()`）、`viewport/model-loader.js`（`loadLibs`・`loadModel`・`modelSource`）、`viewport/normalize.fork.js`（O-④-1 の高さ）、SCR-13 の右タブ「ボーンマップ」（`retargetPanel`）と中央の「3D比較」（`retargetViewport`）、`features/project.js` の `setWorkspaceFields`。
- **主シナリオ S5 を最初の小さな WP（05a）で通す**。05a は SCR-13 で「PMX＋VMD（表情モーフを含む）」と「GLB/VRM の中のクリップ」を再生するだけで、②の保存経路にも FBX にも触らない。

#### (a) 移植する機能（根拠付き。v5 の候補一覧を旧コードと照合して直した）

| # | 機能 | 根拠（旧コード） | WP |
|---|---|---|---|
| ⑤-1 | GLB/VRM の中のアニメーションの選択・再生・停止（位置を保つ）・シーク | `index.html:206〜207`（`ivLoad` が `ivClips` を作り、クリップがあれば `ivStart`）、`:212〜213`（`iv-play`・`integratedPreviewV02.stop`「停止しました（現在位置を保持）」）、`:162`・`:217`（`iv-seek`、0.01 秒刻み、`mixer.setTime`）、`:203`（`dt=min(delta,.1)`） | 05a |
| ⑤-2 | PMX に VMD を当てて再生（`MMDLoader.loadAnimation(url, mesh)`＋`AnimationMixer`。IK・物理なし）。VMD の表情・口パクのモーフも同じ呼び出しで再生される（OWNER-4） | `index.html:340〜348`（`vmd-play`）、`:349〜352`（`pmx-reset`）、`:356`（`updateMMD`、`dt=min(…,.08)`） | 05a（1体）、05d（A/B の2体） |
| ⑤-3 | 82パターンの一覧・分類・検索・👑（全手順に実FBXがある） | `index.html:80`（`rows`）、`:81`（`names`）、`:82〜90`（分類・`list()`・👑）、`:92`（`select`、尺の規則）、`:233`（`motionAvailability`）、`:229`（`norm`）、`:232`（`choose`） | 05c |
| ⑤-4 | コンビネーション（追加・並べ替え・削除・全消去）と編集履歴（②の `history` に積み、②の自動保存で保存） | `index.html:118〜128`（`chain`・`renderChain`・`chain-add`・`chain-clear`）、`:368`（`snapshot`）、`:374`（`record`）、`:383`（最初の「初期状態」）、`:382`（速度の変更で自動保存） | 05c（編集）、05d（連結再生） |
| ⑤-4b | 連結再生（A の FBX にコンビネーションを順に当て、前の手順の腰の移動を積み上げる）・停止 | `index.html:257`（`clipOffset`）、`:291〜299`（`chainFrame`）、`:124`（`stopCombo`）、`:128`（`chain-play`）、`:231`（`fitModel`：高さ 1.95・±1.4・±90°） | 05d |
| ⑤-5 | お気に入りのコンビネーション（保存・検索・読み込み・削除） | `index.html:129〜133`、`GET/POST /api/favorites`（`server.py:340〜343`・`972〜981`） | 05c |
| ⑤-6 | タイムライン編集（クリップの開始F・長さF・速度・補間F、削除、追加、コンビネーションからの取り込み、保存・復元）と **550ms の自動保存**、タイムライン再生（再生・停止・シーク） | `index.html:790〜815`（`transport`：794、`safe`：800、`save`：801、`queue` 550ms：802、取り込み：811、追加：812）、`:260〜290`（`timelineFrame`）、`GET/POST /api/timeline-editor`（`server.py:301〜302`・`698〜713`） | 05e |
| ⑤-7 | **パターンの手順名→登録済みFBX の対応表**（「このパターンの実FBX対応表」）の編集と保存。v5 は「ボーン対応表」と書き、`/api/conversion-map` と混同していた（批評 5-1） | `index.html:233`（`updateMapping`）、`:235`（`saveMapping` → `POST /api/mapping`、`server.py:982〜986`）、`:236`（`manifest.mapping` を復元） | 05d |
| ⑤-8 | 作業中のクリップ・再生位置を制作状態へ（`workspace.clip`・`workspace.frame`） | `camera_3d.js:281〜282`（`setClip`・`updateTime`：時刻＝`frame/fps`）、`:290〜292`（スナップショット） | 05b |
| ⑤-9 | 外部同期のコマンド（`play_chain`・`stop_chain`・`preview_motion`・`preview_vmd`・`integrated_preview`。`open_pmx`・`integrated_retarget` は受けない：O-⑤-5） | `index.html:435〜450`、`POST /api/sync-command`（`server.py:876〜891`） | 05b（SCR-13 側）、05c・05d（SCR-05 側） |
| ⑤-10 | 2D 模式アニメーション（前・再生・次・速度・シーク） | `index.html:71`、`:92〜115`（`select`・`pose`・`fighter`・`draw`・`tick`） | 05g |
| ⑤-11 | 転写タイムライン・QA・JSON 保存（読み取りのみ） | `v01630_32_review.js`（26行、`POST /api/retarget/review-bundle`：`server.py:561〜571`） | 05f |
| ⑤-12 | キー候補のフレーム比較（three）と試験フレーム再生 | `v01633_35_scrub.js`（36行、`POST /api/retarget/keyframe-review`：`server.py:550〜560`、`v01641_preview_guard.js` の `inspectPreviewKeys` を import）、`v01636_40_playback.js`（35行、API なし） | 05f |
| ⑤-13 | 非破壊のモーション補正レイヤー（タイムライン再生のときにだけ当てる） | `motion_layers.js`（29行。`safe`：15、`queue` 500ms：18、キー追加：21、`values`：25、`apply`：26）、`index.html:279`（`timelineFrame` の中で `apply`）、`GET/POST /api/motion-layers`（`server.py:299〜300`・`677〜697`） | 05e |
| ⑤-14 | 足の接地・足滑りの診断（サンプル JSON・BVH・両足） | `foot_qa_ui.js`（7行）、`index.html:819` の `#foot-qa`、`POST /api/qa/foot-contact`・`bvh-foot-world`・`dual-foot-preview`（`server.py:500〜528`） | 05f |
| ⑤-15 | **82パターンの 3D 模式再生**（A/B の2体。実FBX が割り当てられていればその FBX を、無ければダミー人形を、パターンの時刻で動かす）。v5 の一覧に無かった旧機能（批評 5-8） | `index.html:228`（`dummy`）、`:241`（`motionState`）、`:242`（`keywords`）、`:243〜254`（`animateActor`）、`:358`（`frame` の既定の描画） | 05g |
| — | （⑦へ移す）変換用ボーン対応表 `/api/conversion-map` の編集（`#vmd-bonemap`・`vmd-map-save`） | `index.html:416〜417`、`server.py:893〜900` | WP-07（O-⑦-1） |

#### (b) 移植先（決定。モックのタブは増やさない：O-⑤-3）

| 画面 | 区画（モックの既存のもの） | 中身 | WP |
|---|---|---|---|
| SCR-13 | モード切替（モックの既存の［比較］［編集］、`screens.js` の `modes`） | 今の「表示の切替のみ」のトーストをやめ、`?mode=compare`（既定）／`?mode=edit` に結線する。［比較］は今の `retargetViewport`（WP-04b）、［編集］は ⑤ の再生ビュー | 05a |
| SCR-13 | 中央（`center`） | ［編集］のとき：three-host の再生ビュー（`motionViewport`）。下に操作の帯（対象モデル・クリップ・再生・停止・位置・状態行）。［比較］のときは今のまま（05f で ⑤-12 の節を帯に足す） | 05a、05f |
| SCR-13 | 左「VMDライブラリ」（今は `mock`） | `/api/assets` の VMD（`mmd:vmd:*`）の一覧（検索付き）。行を押すと、対象モデルに当てて再生する（［比較］モードなら［編集］に移ってから） | 05a |
| SCR-13 | 下部タイムライン（パネル「編集タイムライン」DATA-001。今は `mock`） | ⑤-6 のタイムライン編集と再生、⑤-13 の補正レイヤー（折りたたみ）。モックのサンプルのトラック（センター・上半身・足IK・表情・ダンサー・接触）は「サンプル表示」として薄く残す | 05e |
| SCR-13 | 右「ボーンマップ」タブ（WP-04b） | 末尾に折りたたみの節「転写タイムライン・QA（試験）」（⑤-11）。旧画面でも同じ `#skeleton-lab` の中にあり、同じ元・対象の選択を使う | 05f |
| SCR-13 | 中央［比較］の帯 | 「キー候補のフレーム比較（試験）」（⑤-12） | 05f |
| SCR-13 | 右「足IK」タブの節「足IK・接地」（今は `partial`） | ⑤-14 | 05f |
| SCR-05 | 左「モーション検索」（パネルの注記が「82パターンの検索・分類・お気に入り」） | ⑤-3 の一覧（検索・分類・👑）と ⑤-5 のお気に入り。左パネルの中の切替［パターン］［★ お気に入り］（旧 `tab-catalog`・`tab-favorites` と同じ2つ） | 05c |
| SCR-05 | 下部タイムライン（パネル「タイムライン」、トラック「体」「表情」） | ⑤-4 のコンビネーション。トラック「体」＝コンビネーションの手順（並び順だけを表す同じ幅のブロック）。帯に［▶ 連結再生］［■ 停止］（05d）・［全消去］・［★ お気に入りに保存］、選んだ手順の［↑］［↓］［削除］。トラック「表情」は ◇（LIP-009）のまま | 05c、05d |
| SCR-05 | 中央（今は画像） | three-host の A/B の 3D（FBX モデル・PMX・ダミー）。下の帯に「このパターンの実FBX対応表」（⑤-7）、スロット別の PMX 表示と VMD（MOTION-009）、05g で模式再生の操作と 2D の折りたたみ | 05d、05g |
| SCR-05 | 右「レイヤー」タブの節「再生」（今は `mock`） | 速度（0.5×・1×・1.5×・2×。旧 `#speed` と同じ値）＝ `combination.playbackSpeed`。「ループ再生」は旧画面に止める設定が無い（パターンも連結も常にループ）ので、オンのまま操作できない表示にし、title に「旧画面と同じく常にループします」 | 05c |
| SCR-12 | — | ⑤-1 は置かない（v5 の案から変更。入口を SCR-13 の1つにする。O-④-5 と同じ考え方） | — |

- 新しいタブは作らない。足すのは**既存の区画の中の部品だけ**（SCR-13 中央の帯の［対象モデル］、SCR-05 左の［パターン］［★ お気に入り］の切替、SCR-05 中央の帯、SCR-13「ボーンマップ」の末尾の折りたたみ）。WP-04（④-11「ステージの素材」）・WP-04b（中央の帯）と同じ扱いで、各 WP の Opus/Sonnet のレビューで見た目を確かめる。
- `app.js` の変更（05a・05c・05e）：①SCR-13 の `modeSwitch` を `navigate('13',{replace:true, tab, query:{...今のクエリ, mode}})` にし、`aria-pressed` を `params.get('mode')` から決める（SCR-27 の扱いと同じ形。他の画面はトーストのまま）。ボタンに `data-mode="compare"`／`"edit"` を付ける。②`bottom` に `{type:'feature', key, status, evidence}` を書けるようにし、`render()` で `s.bottom.type==='feature'` なら `bottomPane` の代わりに、同じ外枠（`section.pane.pane-bottom`、折りたたみボタン、`prefs.bottomCollapsed`）の中に `FEATURES[key](ctx, c)` を置く（`featureBottom(s)`。`Screen['bottom']` の型に足す）。

#### (c) 使う既存 API・コードと新しいモジュール

**既存 API**（どれも `api.js` 経由。サーバーは変えない：R1）

| API | 使う WP | 備考 |
|---|---|---|
| `GET /api/assets` | 05a | VMD は `mmd:vmd:<name>`、PMX は `mmd:A|B:<name>`、GLB/VRM は `integrated:<file>`、FBX は `fbx:<id>`（`kind` が `modelA`・`modelB`・`motions`） |
| `GET /api/mmd-file/vmd/<name>` | 05a・05d | `MMDLoader.loadAnimation` が自分で取得する（`model-loader.js` の PMX と同じ）。URL は `encodeURIComponent(name)` |
| `GET /api/integrated-v02/asset/<file>`・`GET /api/mmd-file/<slot>/<name>`・`GET /api/file/<id>` | 05a・05d・05e | `model-loader.js` の `loadModel` をそのまま使う |
| `GET /api/manifest`（`files`・`mapping`）、`POST /api/mapping`（本文は対応表の全体） | 05c・05d | `server.py:363`、`982〜986`。`mapping` は「手順名→登録名の正規化キー」 |
| `GET/POST /api/favorites`（本文はお気に入りの配列の全体） | 05c | `server.py:340〜343`、`972〜981`（1000件・各200手順まで） |
| `GET/POST /api/timeline-editor` | 05e | POST は `{schema:1, clips:[{name,start,duration,speed,blend}]}`、200件・各値の範囲は `server.py:704〜709`。If-Match なし。`sync_bump` を呼ばない |
| `GET/POST /api/motion-layers` | 05e | POST は `{schema:1, layers:[{name,bone,enabled,keys:[{frame,x,y,z}]}]}`、32レイヤー・各500キー・角度 ±180（`server.py:681〜692`）。If-Match なし。GET に版も時刻も無い |
| `POST /api/retarget/review-bundle`・`keyframe-review` | 05f | 本文 `{source, target, fps:30, coordinate_convention_confirmed:true}`。GLB/VRM 以外は 400 |
| `POST /api/qa/foot-contact`・`bvh-foot-world`・`dual-foot-preview` | 05f | 本文は旧画面と同じ（下の 05f） |
| `GET /api/sync`（②の tick が読む） | 05b | `command` の `{id, action, name?, slot?, target?}` |

**新しいモジュール**（`// @ts-check`。`*.fork.js` を除く）

```js
// studio/js/motion/player.js（05a）— 1体のモデルに1つのモーションを当てる。DOM を使わない（rAF は呼び出し側）。
/** @typedef {{kind: 'vmd'|'clip', id: string, clipIndex: number|null, duration: number}} MotionInfo */
export function createPlayer(THREE) {}
// 戻り値 { setModel(object, format, animations), clearModel(), applyClip(index), applyVmd(clip, id), play(), pause(), seek(sec), update(dt),
//          state(): {format, motion: MotionInfo|null, playing: boolean, time: number}, probe({bones?: string[], morphs?: string[]}), dispose() }
//  - setModel：前のモデルの mixer を stopAllAction して捨てる。モーションは null、playing=false、time=0。
//  - applyClip(i)：animations[i] を mixer.clipAction(...).reset().play()（index.html:207、camera_3d.js:281 と同じ）。範囲外は Error('クリップがありません')。
//  - applyVmd(clip, id)：前の action を止め、mixer.clipAction(clip).reset().play()（index.html:345）。
//  - play()/pause()：playing を切り替えるだけ。pause は位置を保つ（index.html:213「現在位置を保持」）。
//  - seek(t)：0〜duration に丸めて mixer.setTime(t)（index.html:162 と同じ）。
//  - update(dt)：playing のときだけ mixer.update(dt)。time は action.time（ループは three の既定 LoopRepeat。旧と同じ）。
//  - probe：bones は object.getObjectByName(name) の position（ローカル）を [x,y,z] で、morphs は最初の morphTargetDictionary を持つメッシュの
//    morphTargetInfluences[dict[name]] を返す。無い名前は null。テスト用の読み取りだけ（書き込みはしない）。

// studio/js/motion/vmd.js（05a）
export function vmdUrl(item) {}                 // item.id 'mmd:vmd:<name>' → '/api/mmd-file/vmd/' + encodeURIComponent(name)
export function loadVmdClip(libs, url, mesh) {} // new libs.MMDLoader().loadAnimation(url, mesh, resolve, undefined, reject) を Promise に（index.html:344 と同じ）。404 は NotFoundError
export function canApplyVmd(format) {}          // 'PMX' だけ true。'VRM'・'GLB'・'FBX' は false（O-⑤-8）

// studio/js/motion/fbx-clips.js（05c：名前だけ、05d：解析とキャッシュ）
export async function loadManifest() {}          // GET /api/manifest → {motions: [{id,name,key}], models: {A: entry|null, B: entry|null}, mapping}
export function motionKeys(manifest) {}          // Set<key>。key = normClipName(name)。kind==='motions' だけ（index.html:236 と同じく modelA/B は入れない）
export async function getClip(key, libs) {}      // 05d：GET /api/file/<id> → FBXLoader.parse → animations[0]。無ければ Error('<name> にアニメーションがありません')（index.html:236 の文言）。ページの間キャッシュ
export async function saveMappingEntry(step, key) {} // 05d：GET /api/manifest で最新の mapping を取り、step だけ変えて POST /api/mapping（key が '' なら削除）

// studio/js/motion/patterns.fork.js（05c。index.html:80〜92・229・232〜233・241〜242 のフォーク）
export const ROWS;      // index.html:80 の rows と JSON として同じ
export const NAMES;     // :81
export const KEYWORDS;  // :242
export function normClipName(x) {}                  // :229 の norm
export function clipKeyFor(step, manual, keys) {}   // :232〜233 の clips.get(manual[step])||choose(step) を「キー」で行う。見つからなければ null
export function isAvailable(row, keys, manual) {}   // :233 の motionAvailability
export function durationOf(row) {}                  // :92 の r.duration ?? max(2.6, 手順数×1.05+.8)
export function describe(row) {}                    // :92 の説明文の3通り
export function motionState(row, time, duration) {} // :241（05g）

// studio/js/motion/chain.fork.js（05d・05e。index.html:257・291〜299・260〜290・794・800 のフォーク。DOM を参照する部分は戻り値にした）
export function clipOffset(clip, t, THREE) {}             // :257。[dx, 0, dz]
export function chainLocate(lengths, clock) {}            // :291。{clock(ループ後), index, remain}
export function chainShift(prevClips, THREE) {}           // :294。前の手順の clipOffset(prev, prev.duration) の和
export function safeTimelineClip(c) {}                    // :800 の safe
export function timelineEnd(clips) {}                     // :794 の max(1, …start+duration)
export function timelineAdvance(position, dt, clips) {}   // :794 の advance。{position, ended}
export function timelineSelect(clips, frame) {}           // :265〜266。{clip, index}|null（start で並べ、frame∈[start,start+duration) の最後）
export function timelineLocalTime(clipDuration, c, frame) {} // :270
export function timelineShift(prevPairs, THREE) {}        // :283〜286（prevPairs = [{clip, c}]）

// studio/js/motion/layers.fork.js（05e。motion_layers.js:15・25〜26 のフォーク）
export function safeLayer(o) {}
export function layerValues(keys, frame) {}
export function applyLayers(model, layers, frame) {}

// studio/js/motion/schematic.fork.js（05g。index.html:95〜113・228・243〜250 のフォーク）
export function pose(act, p) {}                         // :95〜109
export function fighterSvg(x, flipped, act, p, color) {} // :110〜112 の SVG 文字列
export function drawPattern(row, now, duration) {}       // :113 → {svgA, svgB, phase, hit}
export function buildDummy(THREE, idx) {}                // :228（material も同じ色）
export function animateDummy(actor, key, normalized) {}  // :243〜250

// studio/js/viewport/normalize.fork.js に足す（05d）
export function fitActorFbx(object, idx, THREE) {}  // index.html:231（高さ 1.95、足 y=0、x=±1.4、rotation.y=±π/2。XZ の中心合わせはしない＝旧のまま）
export function placeActorPmx(mesh, idx, THREE) {}  // index.html:310〜312（高さ 1.8、x=±1.4、rotation.y=±π/2）

// studio/js/features/motion-view.js（05a・05b）  : motionCenter, motionViewport, vmdLibrary
// studio/js/features/motion-timeline.js（05e）    : motionTimeline（SCR-13 の bottom）
// studio/js/features/motion-review.js（05f）      : reviewBundle, keyframeReview, footQa
// studio/js/features/chain-view.js（05c・05d・05g）: patternList, chainTimeline, chainViewport, playbackSettings
// studio/js/features/favorites.js（05c）          : loadFavorites, upsertFavorite, deleteFavorite（各操作の前に GET で最新を取り、全体を POST）
```

- `*.fork.js` の固定一覧（§1.8）に `motion/layers.fork.js`・`motion/schematic.fork.js` を足す（計5つ）。`normalize.fork.js` に関数を足すのは同じファイルなので一覧は変わらない。
- `v01641_preview_guard.js`（DOM なしの ESM、`server.py:241` で配信済み）は ⑤-12 で `import { inspectPreviewKeys } from '/v01641_preview_guard.js'` で共有する。§1.8 の表の「P2 では使わない」は誤り（`v01633_35_scrub.js:5` が import している）なので直した（批評 5-2）。`tsconfig.json` の `paths` に `/v01641_preview_guard.js` と型宣言 `studio/types/legacy/v01641_preview_guard.d.ts` を足す（05f）。
- **②への追加（`features/project.js`。05b・05c。Opus でレビュー）**：
  - 05b：`tick()` の中で、`refresh_assets` 以外の `command` も、`!first && cmdId !== lastCommandId` のときに `ui.emit('studio:sync-command', {id, action, name, slot, target})` する（`refresh_assets` の扱いは今のまま）。§1.5 のイベント表に `studio:sync-command` を足す。
  - 05c：`editCombination(timeline, {label = 'コンビネーション変更', selected})`、`setCombinationSpeed(speed)`、`setCombinationSelected(id)` を `createProjectController` に足して export する（下の 05c）。

#### (d) 新UIの動作（WP ごと）

**WP-05a：SCR-13［編集］の1体再生（⑤-1・⑤-2、O-⑤-8 の ◇）— S5 を通す**

1. モード：`?mode=edit` のとき、中央の `motionCenter` が `motionViewport` を描く。それ以外は `retargetViewport`（今のまま）。three-host は同時に1つなので、モードを切り替えると前のビューポートは §1.6 の後始末で dispose される。
2. 対象モデル（帯の選択欄 `[data-role="motion-model"]`）：③の素材一覧のうち `available` な PMX（`mmd:A:`・`mmd:B:`）と GLB/VRM（`integrated:`）。表示は「形式｜名前（スロット）」。初期値は `?asset=` → 無ければ旧画面と同じく A の最初の PMX、無ければ B の最初の PMX（`index.html:353〜355`）→ それも無ければ未選択。選ぶと `history.replaceState` で `?asset=` を更新し、`loadModel` で読み、`normalizeModel`（O-④-1 の高さ：PMX 1.8・GLB/VRM 2.0）で置く（SCR-12 の単体表示と同じ）。`player.setModel(object, format, animations)`。
3. クリップ（帯の `[data-role="motion-clip"]`）：GLB/VRM でアニメーションがあるときだけ有効。項目は「名前（なければ `Animation n`）（d.dd s）」（`index.html:206` と同じ書式）。モデルを読んだら、クリップがあれば 0 を当てて再生を始める（旧 `ivLoad` → `ivStart`）。`?clip=` があればその番号。
4. VMD（左「VMDライブラリ」`vmdLibrary`）：`/api/assets` の `mmd:vmd:*`（`available`）を名前順に出す（検索付き）。行を押したとき：
   - ［比較］モードなら、`navigate('13', {replace:true, tab, query:{...今のクエリ, mode:'edit', vmd:id}})` してから当てる。
   - 対象モデルが PMX：状態行「VMDを読み込み中…」→ `loadVmdClip` → `player.applyVmd` → `play()`。状態行「{モデル名} : {VMD名} を再生中」（`index.html:346` の書式）。`?vmd=` を更新。失敗は「VMD読み込み失敗: {message}」（`:347`）。404 は `MISSING_FILE_TEXT`。
   - 対象モデルが VRM・GLB・未選択：**O-⑤-8**。VMD を取得しない。VRM/GLB なら `showUnimplemented({name:'VRM・GLB への VMD の適用', why:'旧画面の VMD の再生は PMX だけです（index.html:340〜347）。VRM へ VMD のボーンを当てる対応表は承認済みの計画にありません（表情・口形のモーフの対応はリップシンク・表情フェーズ LIP-004 の範囲）。PMX のモデルを選んでください。', ids:['MOTION-006','LIP-004'], phase: PH.P4})`。未選択なら状態行「まずモデルを選んでください」（`index.html:342` と同じ意味）。
5. 再生の操作（帯）：［▶ 再生］／［❚❚ 一時停止］（`[data-role="motion-play"]`）、［■ 停止］（`motion-stop`：一時停止して状態行「停止しました（現在位置を保持）」）、位置（`input[type=range]` `motion-seek`、0〜duration、`step=0.01`）と「t / d 秒」（`index.html:163` の書式。小数2桁）。位置を動かすと `player.seek(Number(value))`（一時停止のままでも姿勢が変わる。`ivSetTime` と同じ）。VMD にも同じ位置の操作を使う（旧画面の VMD には位置の操作が無かった。§5.3）。
6. 毎フレーム：再生中だけ `requestAnimationFrame` のループを回し、`dt = min(clock.getDelta(), 0.1)`（`index.html:203`）で `player.update(dt)` → `viewport.invalidate()` → 位置の表示を更新する。一時停止で止める（rAF を残さない）。画面を離れたら `ctx.onCleanup` で rAF を止め、`player.dispose()` と three-host の `dispose()`。
7. ［表示解除］（`motion-clear`、旧 `pmx-reset` の1体版）：モデルとモーションを外す。
8. `window.baiStudio.motion = { getState: () => ({ mode, modelId, format, motion, playing, time, duration }), probe: (q) => player.probe(q) }`（読み取り専用。§1.6-7 に足す）。モデルの読み込みの完了は `getState().modelId` と `baiStudio.viewport.getState().loaded`。
9. 区画の状態：SCR-13 のパネル「VMDライブラリ」と、新しく足すパネル「VMD再生（編集モード）」（`ids:['MOTION-006','DATA-014']`）を `real`（evidence は下の 05a のテスト）。左の `left.status` も `real`。

**WP-05b：制作状態への記録（⑤-8、O-⑤-7）と外部コマンドの受け口（⑤-9、O-⑤-5）**

1. 帯に［この再生位置を制作に記録］（`[data-role="motion-record"]`、`data-act="real"`）。有効になる条件：対象モデルが `integrated:` の GLB/VRM で、`item.filename === project.bundle.workspace?.asset`、かつ `status==='ready'` で `cameraInvalid` が無い。無効のときの title：違うモデル「作業中の素材（{asset|なし}）と違うモデルです。キャラクター管理（12）の［このモデルを制作に使う］で選んでから記録してください。」、PMX/FBX「制作状態に記録できるのは GLB/VRM のクリップだけです（project_state_bundle.py の制限）」。
2. 押したとき：`fps = bundle.camera?.fps ?? 30`、`frame = Math.round(player.state().time * fps)`。`bundle.camera` があり `frame > camera.duration` なら `frame = camera.duration` にし、状態行に「再生位置をカメラの長さ（{duration} フレーム）までに丸めて記録しました」。`clip` は再生中のクリップの番号（VMD やクリップ無しのときは `null`）。`setWorkspaceFields({clip, frame}, {source:'store'})`。`clip` が変われば dirty（［保存］で保存）、`frame` だけなら dirty にしない（§2.2(d)-9）。トースト「作業中のクリップ {clip}・再生位置 F {frame} を記録しました。［保存］で保存されます。」。
3. 開いたとき：対象モデルが `workspace.asset` と同じなら、クリップの初期値を `workspace.clip`（`null` なら 0）、位置を `workspace.frame / fps`（duration で丸める）にして一時停止で始める（`camera_3d.js` の restore と同じ向きの復元。自動再生はしない）。
4. 外部コマンド（O-⑤-5）：`motion-view.js` が `on('studio:sync-command', …)` を購読し、**SCR-13 が表示されているときだけ**反応する（購読の解除は `ctx.onCleanup`）。
   - `preview_vmd {name, slot}`：［編集］へ移り、対象モデルを `slot`（既定 A）の最初の PMX にし、`mmd:vmd:<name>` を当てて再生する（`index.html:446`）。無ければ状態行に「外部からの指示：{name} が見つかりません」。
   - `integrated_preview {name}`：［編集］へ移り、`integrated:<name>` を読み、クリップ 0 を再生する（`index.html:447`）。
   - `open_pmx`・`integrated_retarget`：受けない（`open_pmx` は旧画面の中のタブ切替で新UIに当たる操作が無い。`integrated_retarget` は旧画面の仮転写 `ivTransfer`（`index.html:199`）で、REVIEW-001 の範囲として旧画面のまま：(h)）。
   - SCR-13 が表示されていないときは何もせず、トースト（`kind:'real'`）「外部から再生の指示（{action}）がありました。モーション画面（05・13）を開いているときだけ反応します。」を1回出す（同じ `id` では出さない）。
   - SCR-05 側（`play_chain`・`stop_chain`・`preview_motion`）は 05c・05d で同じ規則で足す。

**WP-05c：SCR-05 の一覧・お気に入り・コンビネーションの編集（⑤-3・⑤-4・⑤-5。3D なし）**

1. 左「モーション検索」（`patternList`）：切替［パターン］［★ お気に入り］（`[data-role="pattern-tab"]`）。［パターン］は `ROWS` を、検索（`id title mixamo` を小文字で部分一致：`index.html:85`）と分類（`category` の一覧：`:82`）で絞る。行の表示は `NN タイトル`、👑 は `isAvailable(row, motionKeys(manifest), manifest.mapping)`、凡例「👑 {n}件：色付き＝全モーションを実FBXで再生可能」（`:87`）。行を押すと選択（`setCombinationSelected(row.id)`：ストアの `combination.selected` を書くが dirty にしない。旧画面も選択だけでは保存しない）。選択中の行の下に Mixamo 検索名（実行順）を出す（`:92` の `searchname`）。
   - 手順名と登録の照合は名前だけで行う（`motionKeys`）。旧画面は起動時に全 FBX を解析し、アニメーションの無いファイルを「未登録」にしていた（`:236`）。新UIは解析しない（§5.3）。解析で失敗するファイルは、05d の再生のときに「{name} にアニメーションがありません」と出す。
2. ［＋ コンビネーションに追加］（左パネルの上、`[data-role="chain-add"]`）：選択中の行が `isAvailable` でなければトースト「このモーションは実FBXが未登録です。FBXを登録・割当してから追加してください。」（`:126` の文言。`alert` はトーストに置き換える）。登録済みなら行の `steps` をすべて `{name}` で末尾に足す（`:126`）→ `editCombination`。
3. 下部（`chainTimeline`）：トラック「体（コンビネーション）」に手順を同じ幅のブロックで並べる（`(i+1). name`。長さは表さない。`title` に「並び順だけを表します（長さは再生時に決まります）」）。ブロックを押すと選択し、帯の［↑］［↓］［削除］が使える（`:123` と同じ：入れ替え・削除）。［全消去］（`chain-clear`）は確認なし（旧と同じ）。どれも `editCombination`。件数「{n}件」と案内（`index.html:500〜508` の `chain-feedback` の文言）を帯に出す。トラック「表情」は ◇（`un('表情キー', …, ['LIP-009'], PH.LIP)`、薄い表示）。
4. `editCombination(timeline, {label})`（②の controller。旧 `record` と同じ規則：`index.html:374`）：
   - `status!=='ready'` なら何もしない。`timeline` は `[{name}]` だけに正規化する。
   - `history` が空なら、先に「初期状態」（`{label:'初期状態', at, timeline: 今の timeline, selected, playbackSpeed}`）を積み `cursor=0` にする（`:383` と同じ）。
   - `history[cursor].timeline` と新しい `timeline` が JSON として同じなら、`combination.timeline` だけ変えて終わる（履歴も自動保存も増やさない）。
   - 違えば `history = history.slice(0, cursor+1)` に `{label, at:new Date().toISOString(), timeline, selected, playbackSpeed}` を足し、101件以上なら先頭を捨て（100件まで）、`cursor = history.length-1`。`selected` は SCR-05 で選んだ行の id（無ければ `combination.selected || 1`）、`playbackSpeed` はストアの値。
   - `combination.timeline = timeline`、`dirty.combination = true`、`scheduleAutosave()`（450ms。§2.2(d)-4 のまま）。
   - `setCombinationSpeed(v)`：`v ∈ {0.5,1,1.5,2}` だけ。`combination.playbackSpeed = v`、dirty、自動保存（`:382` と同じく履歴には積まない）。
   - ②の戻す・やり直す（`restoreHistory`）でコンビネーションが変わると、SCR-05 の下部はストアを購読しているので表示が変わる。
5. 右「レイヤー」の節「再生」（`playbackSettings`）：速度の選択欄を `combination.playbackSpeed` に結ぶ（変えたら `setCombinationSpeed`）。「ループ再生」は (b) のとおり。
6. お気に入り（左の［★ お気に入り］）：検索（空白で区切った語がすべて `name tags steps` に含まれる：`:131`）、カード「{name} ({n}動作)」「#tag …」［読み込み］［削除］。
   - ［読み込み］：`editCombination(fav.steps の複製)` し、画面の中の `activeFavorite = fav`（`:131`）。
   - ［★ お気に入りに保存］（下部の帯）：ダイアログ（`openModal`）で名前（既定は `activeFavorite?.name || '新規コンビネーション'`）とタグ（既定 `activeFavorite?.tags.join(', ') || '格闘, コンボ'`、`[,，\n]` で分けて重複を除く）を入れる（`:129` の `prompt` 2回の置き換え）。名前が空なら「名前が必要です」。`upsertFavorite({id: activeFavorite?.id || 'combo-'+Date.now(), name, tags, steps})`：**GET で最新の一覧を取り**、同じ id があれば置き換え、無ければ末尾に足して POST（MCP の `mixamo_save_favorite` が足したものを消さないため。§5.3）。成功で［★ お気に入り］に切り替え、案内「「★ お気に入り」に「{name}」を保存しました。」。失敗「保存失敗: {message}」。
   - ［削除］：確認ダイアログ「このお気に入りを削除しますか？」→ GET で最新を取り、その id を除いて POST。失敗「削除の保存に失敗しました」。
7. 外部コマンド `preview_motion {name}`：SCR-05 表示中だけ、`steps` に `name` を含むか `title===name` の最初の行を選ぶ（`index.html:441`。旧画面は存在しない関数 `selectRow` を呼んでいて何もしていなかった：§5.3）。
8. 区画：SCR-05 のパネル「モーション検索」「タイムライン」と左・下部を `real`。SCR-05 のパネル「VMD再生」の注記を「VMD の再生は 13（編集モード）。A/B の2体は 05d」に直す（状態は 05d まで `partial`）。

**WP-05d：SCR-05 の 3D（A/B の2体・連結再生・対応表・スロット別の VMD。⑤-2・⑤-4b・⑤-7、MOTION-009、O-④-3）**

1. 中央（`chainViewport`）：three-host。開いたら `loadManifest()` し、`models.A`・`models.B`（`kind` が `modelA`・`modelB`）があれば `loadModel` → `fitActorFbx(object, 0|1)`。PMX：A/B それぞれ、`mmd:A:`・`mmd:B:` の最初の PMX があれば `placeActorPmx` で置き、同じスロットの FBX を隠す（`index.html:309, 353〜355`）。スロットごとの選択欄［表示］（`[data-role="actor-a"]`・`actor-b`）：「FBX モデル」「PMX：{name}」（そのスロットの PMX の数だけ）、［PMX 表示解除］で FBX に戻す（`:349〜352`）。どちらも無いスロットは空（ダミーは 05g）。
2. スロット別の VMD（MOTION-009）：帯の［対象］（A/B）・［VMD］の選択欄・［▶ PMXでVMDを再生］（`:77`・`:340〜348` と同じ）。対象のスロットが PMX 表示でなければ「まずPMXモデルとVMDを選択してください」。スロットごとに `createPlayer` を持ち、毎フレーム `dt=min(…,0.08)`（`:356`）で両方を `update`。
3. 連結再生（［▶ 連結再生］`chain-play`・［■ 停止］`chain-stop`。下部の帯）：
   - コンビネーションが空ならトースト「チェインにモーションを追加してください」（`:128`）。
   - A が FBX モデルでない（無い）とき：状態行「チェイン再生には実FBXモデルAと登録済みモーションが必要です」（`:291`）で始めない。A が PMX 表示なら、FBX 表示に切り替えてから始め、トースト「連結再生のため、A を FBX モデルの表示に戻しました」（旧画面は PMX の陰で FBX が動いて見えなかった：§5.3）。
   - 手順ごとに `getClip(clipKeyFor(step.name, mapping, keys))` を解析して集める（失敗した手順があれば、その名前を状態行に出して始めない）。`lengths = clip.duration`。
   - 毎フレーム：`clock += dt × playbackSpeed`（`dt=min(…,0.08)`）→ `chainLocate(lengths, clock)` → 手順が変わったら `stopAllAction` して新しい action を `reset().play()`（`:295`）→ `action.time = remain; mixer.update(0)` → `chainShift(前の手順のクリップ)` を `baseline + shift × scale.x`（x・z だけ）で A の位置に当てる（`:293〜298`）。`baseline` は最初の再生のときの A の位置（`userData.chainBaseline` と同じく1回だけ覚える）。状態行「チェイン {i+1}/{n} — {name} / {clock.toFixed(2)}s」（`:299`）。
   - ［■ 停止］：`clock=0`、再生をやめ、`activeFavorite=null`（旧 `stopCombo`：`:124` と同じ）。状態行「再生を停止しました。」（`:498〜500`）。
   - 外部コマンド `play_chain`・`stop_chain`：SCR-05 表示中だけ、ボタンと同じ処理（`:438〜439`）。
4. 対応表（⑤-7。中央の帯の折りたたみ「このパターンの実FBX対応表」）：選択中の行の重複のない手順ごとに、選択欄［自動一致 / 未割当］＋登録済みのモーション（`motions` の `key`、表示は `name`）。今の値は `mapping[step]`。変えたら `saveMappingEntry(step, key)` → 👑 を計算し直す（`:233`）。失敗は状態行に「対応表を保存できませんでした：{message}」（旧は console だけ）。
5. `window.baiStudio.chain = { getState: () => ({ actors: [{kind:'fbx'|'pmx'|null, id}, …], playing, clock, index, remain, steps }), probe: (q) => …（A のオブジェクトの名前付きノードの position。05a の probe と同じ形） }`。
6. 区画：SCR-05 の中央（「Motion Preview」）とパネル「VMD再生」（MOTION-006・009）を `real`。SCR-05 の「サンプル再生（3D未接続）」の表示は、3D ビューの区画が `real` になるので自動で消える（WP-00c の規則）。

**WP-05e：SCR-13 のタイムライン編集・再生と補正レイヤー（⑤-6・⑤-13、O-⑤-4）**

1. 下部（`motionTimeline`）：帯に［コンビネーションから取り込む］［＋ クリップ追加］［▶ タイムライン再生］［■ 停止］、位置（`0〜timelineEnd`、1F 刻み）と「{F}F / {end}F」、［保存］［復元］、状態行（`index.html:791` と同じ並び）。レーン「クリップ」にクリップを `start/end` の比で置き（`:803〜807`。押すとその行へスクロール）、下に行ごとの「開始F・長さF・速度・補間F」の数値欄と［削除］（範囲は `:805` と同じ：開始 0〜1000000、長さ 1〜100000、速度 0.1〜4（0.1刻み）、補間 0〜120。範囲外・非数は元の値に戻す）。クリップが無ければ「クリップがありません。「コンビネーションから取り込む」または「＋ クリップ追加」を選択してください。」（`:808`）。
2. 取り込み：ストアの `combination.timeline` から、`start` を 0 から 90 ずつ増やし `duration:90, blend:6, speed:1`（`:811`）。空なら「先にコンビネーションを追加してください」。
3. 追加：ダイアログで名前（候補は `datalist` にコンビネーションの手順名と登録済みの FBX 名。既定は最初の手順名）。末尾のクリップの終わりから `duration:90, blend:6`（`:812`）。
4. 自動保存（O-⑤-4）：編集のたびに状態行「未保存の変更があります」、550ms 後に保存（`:802`）。保存の手順（`createTimelineSync`。偽の時計・偽の fetch で単体テストできる形にする）：
   1. 競合中なら何もしない。
   2. `GET /api/timeline-editor` を取り、`clips.map(safeTimelineClip)` が、この画面が最後に読んだ／保存した内容（`base`）と JSON として同じか比べる。**違えば競合**：自動保存を止め、状態行「サーバー側のタイムラインが更新されています（他の画面・MCP）。この画面の変更はまだ保存していません。」と［再読込して変更を破棄］［この画面の内容で上書き保存］を出す。上書きは確認ダイアログの後、比べずに POST する。
   3. 同じなら `POST /api/timeline-editor {schema:1, clips}`。200 なら `base = clips`、状態行「保存済み：{HH:MM:SS}」（`:801`）。失敗は「保存失敗：{message}」で未保存のまま（次の編集で再び予約）。
   - 比べるのは内容で、`updatedAt` は使わない（同じ方式を版も時刻も持たない `/api/motion-layers` にも使えるため。§(h) O-⑤-4）。GET と POST の間に他から書かれる隙は残る（サーバーに If-Match が無いので、クライアントだけでは閉じられない。旧画面は確かめずに上書きしていたので、今より悪くはならない）。
   - ［保存］は待たずに同じ手順を実行する。［復元］は未保存があれば確認「保存済みの編集状態を読み込みますか？」（`:813`）。
   - 画面を離れるとき：予約中の保存があれば**すぐに実行する**（取り消さない）。`beforeunload` は、未保存か保存中なら警告する（この画面を開いている間だけ登録する）。
5. タイムライン再生：対象モデル（05a の選択欄に、05e で FBX モデル `fbx:`（`kind` が `modelA`・`modelB`）を足す）が FBX のときだけ有効。FBX でなければ［▶］を無効にし、title「タイムライン再生には FBX のモデルが必要です（旧画面と同じ。モデルA など）」。05a の1体再生とは同時に動かさない（どちらかを始めたら、もう一方を一時停止する。旧 `tls-play` が `stopCombo` を呼ぶのと同じ考え方）。
   - 毎フレーム（再生中）：`timelineAdvance(position, elapsed, clips)`（時計は実経過秒で進める。タブやGPUの遅延で1フレームが長くなっても時刻差を蓄積しない。3D姿勢更新だけ `step=min(elapsed,0.08)` に制限する。終わりに着いたら停止し「終端に到達しました」）→ `timelineSelect(clips, frame)`。無ければ action を止めて「タイムライン：待機 {F}F」。あれば登録済みの `getClip`、手順が変わったら新しい action を `reset().play()`、補間 `fade = min(blend/30, clip.duration)` で `crossFadeTo`（`:272〜278`）→ `action.time = max(0, local − step); mixer.update(step)`（`:279`）→ `applyLayers(model, layers, frame)`（⑤-13）→ `timelineShift` で位置（`:281〜288`）。状態行「タイムライン {F}F / {name} / 速度 {speed}x」。
   - 位置の操作は `position` を変えるだけ（旧 `:798` と同じ。一時停止中は姿勢を変えない）。
6. 補正レイヤー（⑤-13。下部の折りたたみ「非破壊モーション補正レイヤー」）：［＋ レイヤー］［◆ キー追加］（タイムラインの今の F に `{x:0,y:0,z:0}`。同じ F にあれば「{F}F にはキーが既にあります」）［保存］［復元］、レイヤーごとに選択・有効・名前・ボーン名・キーの x/y/z（度）・［削除］（`motion_layers.js:19〜24`）。保存は 500ms の自動保存（`:18`）で、手順は 4 と同じ内容比べ（`GET /api/motion-layers` の `layers.map(safeLayer)` と `base`）。
7. 外部の MCP（`mixamo_timeline_set`・`mixamo_motion_layers_set`：`mcp_server.py:98・100`）の書き込みは 4 の比べで競合として見つかる（開いている間に自動では読み直さない。`sync_bump` が呼ばれないため）。
8. `window.baiStudio.timeline = { getState: () => ({ clips, frame, playing, end, dirty, conflict, active: {index, name}|null, layers: layers.length }) }`。
9. 区画：SCR-13 のパネル「編集タイムライン」を `real`。下部の `status` を `real`（サンプルのトラックは薄い表示のまま）。

**WP-05f：SCR-13 の検証ツール（⑤-11・⑤-12・⑤-14、O-⑤-6）**

1. ⑤-11（「ボーンマップ」タブの末尾、折りたたみ「転写タイムライン・QA・JSON保存（試験）」）：同意のチェック「共通座標系であることを確認（VRM正規化・ひねりは未校正）」、［解析・品質診断］、［検証JSONを保存］（`v01630_32_review.js:8〜14` の文言）。元・対象は `retargetPanel` の選択（ストア `rt`）。同意が無ければ「解析失敗: 座標系の確認が必要です」。結果は旧と同じ5行（品質・対象フレーム・対象ボーン・回転キー候補・診断警告・「VMD出力: 禁止（未校正）」）と `warnings` の先頭15件の JSON（`:23`）。保存はブラウザーのダウンロード（`BAI_retarget_review_unverified.json`。サーバーには書かない）。
2. ⑤-12（中央［比較］の帯、2つ目の節「キー候補・フレーム比較（試験）」）：同意のチェック「転写先モデルと同じモデルで、未校正の比較であることを確認した」、［キー候補を取得］、フレーム（range）、［試験フレーム再生］［停止］［次のフレーム］・更新速度 5/10/15 FPS（既定 10）・「未検証プレビュー・モデル保存なし」（`v01636_40_playback.js`）、［検証用キーJSONを保存］（`BAI_UNVERIFIED_keyframes.json`）。
   - 比べるモデルは、旧画面のローカルファイルの選択（`v01633_35_scrub.js:10`）の代わりに、**対象の素材（`rt.target`）を `/api/integrated-v02/asset/` から読む**（④-10 と同じ置き換え。旧の「選んだファイルが対象と一致するか」の確認が要らなくなる）。対象が GLB/VRM の `integrated:` でなければ「GLB/VRM の対象を選んでください」。150MB を超えたら「150MB以下のモデルのみ」（`:29`）。
   - 応答の検査は旧と同じ：`quality_gate==='blocked_for_production' && vmd_export_allowed===false` でなければ「未校正品質ゲートが不正です」、`inspectPreviewKeys(keys, nodeCount)`（`nodeCount` は GLTFLoader の `parser.json.nodes.length`）で不正なら、その `errors`。要求の世代番号（`requestEpoch`）で古い応答を捨てる（`:20〜21, 29`）。
   - 表示：three-host の `content` を `clear()` し、同じ GLB を2回解析して、高さ 1.9 に拡大、足 y=0、x = −1.1 / +1.1（各自の XZ の中心を合わせる。`v01633_35_scrub.js:25`。④-10 の ±1.15 とは別の旧の値）。`showFrame(n)`：右のモデルの全ノードを元の回転に戻し、`frame===n` のキーの `rotation_xyzw` を `target_node` に当てる（同じノードは最初の1つだけ）。状態行「フレーム {n}：候補 {applied} ボーン。未校正・プレビューのみ。VMD出力は禁止。」（`:28`）。
   - 元・対象・同意が変わったら結果を捨てる（`:31〜34`）。試験フレーム再生は画面が隠れたら止める（`v01636_40_playback.js:32`）。
3. ⑤-14（右「足IK」タブの節「足IK・接地」）：モックの部品を結線する。「床の高さ」スライダー＝`ground_y`（数値欄はスライダーの範囲 −0.5〜0.5 m の外も入力できるようにする。旧の数値欄に範囲が無いため）。［接地を再計算］＝旧［診断する］：`POST /api/qa/foot-contact {samples, ground_y, propose_root_offsets:true}`。サンプルは折りたたみ「サンプルの編集（上級者向け）」の JSON 欄（既定値は `index.html:819` の4点）。BVH：ファイル（2MB まで。超えたら「2MB以内のBVHを選択してください」）・足ボーン名（既定 `LeftFoot`）・サンプル間隔（1〜1000）→ `POST /api/qa/bvh-foot-world {bvh_text, foot_bone, stride, ground_y, diagnose:true}`。両足：右足サンプルの JSON 欄（既定は `foot_qa_ui.js:5` の4点）→ `POST /api/qa/dual-foot-preview {left_samples, right_samples, ground_y}`。結果はどれも JSON を `pre` に出す。失敗は「診断失敗: …」「解析失敗: …」（旧の文言）。「接地補正」のトグルは旧画面に無い設定なので、操作できない表示にし、title「旧画面には無い設定です（診断は常に補正候補を出します）」。
4. 区画：SCR-13 のパネル「足IK」を `real`。「ボーンマップ」「ポーズ比較（2体）」の evidence はそのまま（05f の節は同じパネルの中）。

**WP-05g：SCR-05 の模式再生（⑤-10・⑤-15）**

1. 選択中のパターンの時計（`now`・`duration = durationOf(row)`・`playing`（既定 true：旧と同じ）・速度＝`combination.playbackSpeed`）を `chain-view.js` に持つ。中央の帯に［◀ 前］［❚❚ 一時停止／▶ 再生］［次 ▶］と位置（ms 刻み：`index.html:93`）。行の選択で `now=0`。説明文は `describe(row)`。
2. 3D：連結再生も 05a の再生もしていないとき、毎フレーム `motionState(row, now, duration)` で A/B の手順を決め、`animateActor`（`:243〜254`）と同じ規則で動かす：実FBX があれば `clipKeyFor` のクリップを `normalized × duration` の時刻で、無ければダミー人形（`buildDummy`・`animateDummy`）。A/B にモデルが無いスロットにはダミーを置く（`:229`）。状態行「A: 実FBX|3D模式|未割当 / B: … — {title}」（`:358`）。
3. 2D：中央の帯の下に折りたたみ「従来の2D模式アニメーション」（`index.html:71`）。`drawPattern` の SVG を `textContent` ではなく、`h('svg')` の中に組み立てる（文字列の `innerHTML` を使わない。値は数だけなので、`DOMParser` で SVG として読む方法でもよい）。
4. 区画：SCR-05 の中央は 05d で `real`。05g で状態行と模式の部品を足す。

#### (e) 置き換えるサンプル

SCR-13：左 `items('Dance', 6, …)`、下部の `tracks` の固定キー（クリップのレーンを足し、残りは薄いサンプルのまま）、`modes` のトースト。SCR-05：左 `items('Motion', 8, …)`、中央の `img:'viewport-character'` と HUD・`foot`、右「再生」の `sel`・`tg`、下部の `tracks`（「体」を実データにし、「表情」は ◇）。

#### (f) 受け入れ条件（WP ごと。どれも自動テストで確かめる）

**05a**
1. 一時データに最小 PMX（`minimal_pmx.zip` の `model/test.pmx` を A）と `minimal.vmd`（(g) の生成スクリプトで センター 30F を足したもの）を登録した状態で、SCR-13［編集］で PMX を選ぶと、`baiStudio.viewport.getState()` が `{loaded:true, format:'PMX', scale:≈1.8}`（誤差 1e-6）、キャンバスに背景以外の画素が 50 以上。
2. VMD の行を押すと `getState().motion` が `{kind:'vmd', id:'mmd:vmd:minimal.vmd', duration:≈1.0}`（誤差 1e-6）、`playing:true`。位置を 1.0 にすると `probe({morphs:['あ'], bones:['センター']})` の `あ` が 1（誤差 1e-6）、センターの y が位置 0 のときより 1.0 大きい（誤差 1e-4）。位置 0.5 では `あ` が 0 より大きく 1 より小さい。
3. 合成 GLB（VRM として登録）を選ぶと、クリップの選択欄に `test30 (1.00s)` があり、自動で再生が始まる。位置 0.5 で `probe({bones:['hips']})` の z が 0.5（誤差 1e-6。`make_test_glb.py` の `_hips_z`）。［■ 停止］の後 1 秒待っても `time` が変わらない。
4. VRM を選んで VMD の行を押すと、◇ ダイアログに「VMD」と「PMX」が出て、`/api/mmd-file/vmd/` への要求が0回。
5. ［比較］と［編集］の切替でクエリの `mode` が変わり、再読込しても同じモード・同じモデル（`?asset=`）が出る。［比較］では今の `retargetViewport` のテストがすべて合格のまま。
6. SCR-13 から SCR-08 へ移ると、`WEBGL_lose_context` が呼ばれ、rAF のループが残らない（`baiStudio.motion` の `getState().playing` が読めない＝ビューが無い、または `requestAnimationFrame` のスパイの呼び出しが止まる）。
7. 通し確認 S5 が `pass`（(g) の E2E）。

**05b**
1. 作業中の素材の GLB を SCR-13 で選び、位置 0.5 で［この再生位置を制作に記録］→［保存］すると、workspace のファイルが `{frame:15, clip:0}`（`asset`・`stage` は変わらない）。
2. カメラの `duration` を 10 にした種データでは `frame` が 10 になり、丸めの文言が出る。
3. 位置だけ変えて記録しても `dirty.workspace` は false のまま（`frame` だけの変化）。クリップが変われば true。
4. 別の GLB・PMX では［記録］が無効で、title が (d) の文言。`cameraInvalid` のときも無効。
5. 外部から `POST /api/sync-command {action:'preview_vmd', name:'minimal.vmd', slot:'A'}` を送ると、SCR-13 表示中は3秒以内に VMD の再生が始まる。SCR-08 表示中はトーストだけが出て、SCR-13 に移っても再生は始まらない。同じコマンドで2回反応しない。

**05c**
1. FBX `Boxing Leading Hand Jab.fbx`（中身は `minimal_motion.fbx`）を `motions` で登録した種データで、SCR-05 のパターン1に 👑 があり、凡例が「👑 1件」以上。`ROWS` が `index.html:80` の配列と JSON として同じ（Node のテスト）。
2. パターン1を選んで［＋ コンビネーションに追加］→ 450ms 後に `POST /api/project` が1回、保存後の `project_state.json` の `timeline` が `[{name:'Boxing Leading Hand Jab'}]`、`history` が2件（「初期状態」と「コンビネーション変更」）、`cursor:1`。`selected` は 1。
3. 未登録のパターンを追加すると、トーストの文言が出て `POST /api/project` は送られない。
4. 2件にして［↓］で入れ替える・［削除］・［全消去］のそれぞれで、`timeline` と `history` が旧 `record` の規則どおりになる（同じ内容への変更では履歴が増えない）。②の［戻す］でトラックの表示が戻る。
5. 速度を 1.5 にすると `playbackSpeed:1.5` が自動保存され、`history` は増えない。
6. お気に入りに保存すると `favorites.json` に `{id:'combo-…', name, tags, steps}` が増える。保存の前にテストから別のお気に入りを `POST /api/favorites` で足しておいても、それが消えない。［読み込み］でコンビネーションが置き換わり、［削除］で消える（確認ダイアログの［キャンセル］では消えない）。
7. 外部コマンド `preview_motion`（`name:'Back Hand Cross'`）でパターン2が選ばれる（SCR-05 表示中だけ）。

**05d**
1. `minimal_model.fbx` を `modelA` で登録すると、A が x=−1.4・rotation.y=π/2・高さ 1.95（誤差 1e-6）で置かれる。`index.html:231` の式を写した照合（Node）と一致。
2. 05c の 1 の状態でパターン1を2回追加し、［▶ 連結再生］すると、`baiStudio.chain.getState()` の `playing:true`、同じ評価の中の `probe` の `Tri` の x と `remain` の差が 1e-3 以内（`minimal_motion.fbx` は 1 秒で x が 0→1）。`clock` が 1 を超えると `index:1`。A の位置の x は −1.4 のまま（`clipOffset` は腰のトラックが無いので 0）。［■ 停止］で `playing:false`・`clock:0`。
3. `clipOffset`・`chainLocate`・`chainShift` が、腰の移動のある合成クリップで、`index.html:257` の関数を `vm` で取り出して実行した結果と一致する（Node）。`chainLocate` はループ・境界（ちょうど手順の長さ）を含む。
4. 対応表で、手順 `Back Hand Cross` を登録名 `boxingleadinghandjab` に割り当てると、`manifest.json` の `mapping` に入り、パターン2に 👑 が付く。保存の前にテストから別の `mapping` のキーを足しておいても消えない。
5. PMX を A に登録すると A は PMX 表示になり、［▶ PMXでVMDを再生］で A の `あ` が動く。B は FBX のまま。連結再生を始めると A が FBX 表示に戻り、トーストが出る。
6. 外部コマンド `play_chain`・`stop_chain` が SCR-05 表示中だけ効く。

**05e**
1. タイムラインの数値を変えると 550ms 後に `POST /api/timeline-editor` が1回で、その前に `GET` が1回ある。保存後のファイルの `clips` が画面と同じ。
2. 画面を開いた後で、テストから別の `clips` を POST しておくと、次の編集の自動保存で POST が送られず、競合の文言と2つのボタンが出る。［再読込して変更を破棄］でテストの内容が出る。［この画面の内容で上書き保存］で確認の後、画面の内容になる。
3. 補正レイヤーも同じ（500ms、内容の比べ、競合）。
4. FBX モデル A を選び、クリップ `{name:'Boxing Leading Hand Jab', start:0, duration:90, speed:1, blend:0}` で［▶ タイムライン再生］すると、`baiStudio.timeline.getState().playing:true`、同じ評価の中の `probe` の `Tri` の x と `frame/30` の差が 2/30 以内（`dt` の分）。終わり（90F）で止まり「終端に到達しました」。PMX を選んでいると［▶］が無効。
5. ボーン `Tri`・キー 0F `{x:0,y:90,z:0}` の補正レイヤーがあると、再生中の `Tri` の rotation.y が、レイヤー無しのときより π/2 大きい（誤差 1e-3）。
6. 予約中の自動保存があるまま SCR-08 へ移ると、POST がすぐに送られる。
7. `timelineAdvance`・`timelineSelect`・`timelineLocalTime`・`timelineShift`・`safeTimelineClip`・`layerValues` が、旧の式（`index.html:794・800・265〜286`、`motion_layers.js:25` を `vm` で取り出したもの）と一致する（Node）。偽の時計・偽の fetch で、自動保存の 550ms・競合の判定・画面を離れるときの即時保存を確かめる（Node）。

**05f**
1. ⑤-11：同意なしでは `POST /api/retarget/review-bundle` が0回。同意ありで合成 GLB の元・対象（同じ GLB）を選ぶと1回送られ、本文が `{source, target, fps:30, coordinate_convention_confirmed:true}`、結果に「品質:」と「VMD出力: 禁止（未校正）」が出る。［検証JSONを保存］でダウンロードのファイル名が `BAI_retarget_review_unverified.json`。
2. ⑤-12：同意ありで［キー候補を取得］すると、`page.route` で返したスタブ（`quality_gate:'blocked_for_production', vmd_export_allowed:false, keys:[{frame:0,target_node:<hips の番号>,rotation_xyzw:[0,0.7071068,0,0.7071068]}]`）が当たり、`baiStudio.viewport.getState().keyReview` が `{objects:2, applied:1}`、2体の x の中心が −1.1／+1.1（誤差 1e-6）、高さ 1.9。`quality_gate` が違うスタブでは「未校正品質ゲートが不正です」で表示しない。範囲外の `target_node` では `inspectPreviewKeys` の文言。（実 API は合成 GLB では 400 になりうるので、表示の確認はスタブで行う。実 API への送信の本文は 1 と同じく確かめる）
3. ⑤-14：［接地を再計算］で `POST /api/qa/foot-contact` の本文が `{samples:<既定の4点>, ground_y:<スライダーの値>, propose_root_offsets:true}`、結果の JSON が出る（実サーバー）。BVH（テストの中で作る2フレームの BVH）で `bvh-foot-world` の結果が出る。2MB を超える BVH は送らない。両足の診断も実サーバーで結果が出る。

**05g**
1. パターン1を選ぶと `describe` の文と Mixamo 検索名が出て、2D の SVG に `fighterA`・`fighterB` の図がある。`pose`・`drawPattern` が `index.html:95〜113` の関数を `vm` で取り出した結果と一致する（Node）。
2. FBX モデルが無いとき A/B にダミー人形が置かれ、再生中に腕の関節の回転が変わる（`baiStudio.chain.probe`）。実FBX が割り当てられた手順では A が実FBX のクリップで動く（状態行「A: 実FBX」）。
3. 連結再生中は模式再生が A を動かさない（連結の `remain` との関係が 05d の 2 のまま）。

#### (g) テスト

| ファイル | 種類・ポート | WP | 主な検査 |
|---|---|---|---|
| `tests/studio-p2-motion.test.cjs` | Playwright、`P2_MOTION_PORT` 既定 **8793**（§4.1 の予約どおり） | 05a・05b・05e・05f | 05a：`pmx with vmd plays bones and morphs`（(f) 05a の1・2）、`glb clip plays and seeks`（3）、`vmd on vrm shows unimplemented and fetches nothing`（4）、`mode switch is kept in the url`（5）、`motion viewport is disposed on leave`（6）。05b：`record clip and frame into workspace`、`frame is capped to camera duration`、`frame-only record is not dirty`、`record is disabled for other models`、`sync command preview_vmd only on SCR-13`。05e：`timeline autosave checks the server first`、`timeline conflict keeps local edits`、`motion layers conflict`、`timeline playback on fbx model`、`layer rotates the bone during playback`、`pending timeline save is flushed on leave`。05f：`review bundle requires consent`、`keyframe review places two models and applies keys`（スタブ）、`keyframe review rejects bad gate`、`foot qa calls the three apis` |
| `tests/studio-p2-chain.test.cjs` | Playwright、`P2_CHAIN_PORT` 既定 **8784**（新規。§4.1 に足す） | 05c・05d・05g | 05c：`pattern list marks registered fbx with a crown`、`add to combination records history and autosaves`、`unregistered pattern is not added`、`reorder delete clear follow record rules`、`speed autosaves without history`、`favorites keep entries added elsewhere`、`preview_motion selects the row`。05d：`fbx model a is placed like the legacy page`、`chain playback follows the clip clock`、`mapping keeps keys added elsewhere`、`pmx slot vmd and chain switch`、`play_chain and stop_chain`。05g：`pattern preview draws 2d and animates dummies` |
| `tests/studio-p2-motion-fork.test.mjs` | `node --test`（ブラウザー不要。three は `THREE_DIR`／`node_modules/three` を `import`。無ければ three を使う検査だけ skip（理由付き）） | 05c・05d・05e・05g | 照合：`ROWS`・`NAMES`・`KEYWORDS` と `index.html:80〜81・242`（正規表現で取り出して `JSON.parse`／`Function`）。`clipOffset`・`pose` など1行で書かれた旧関数は、`index.html` から `function 名(` から対応する `}` までを取り出して `new Function` で作り、同じ入力で比べる。`chainFrame`・`timelineFrame` のように DOM に絡む関数は取り出さず、旧の式を写した期待値（本節の (d) の式）と比べる。`motion_layers.js:25` の `values` も同じ方法。O-⑤-1 の既定にあった `tests/test_motion_patterns_parity.py` は作らない（フォークは JS なので、Node で直接 import して比べる方が確実） |
| `tests/studio-p2-motion-logic.test.mjs` | `node --test` | 05c・05e | ②の controller の `editCombination`（偽のストア・偽の時計。旧 `record` の規則：初期状態・同じ内容・100件・`cursor` の後ろを捨てる）、`setCombinationSpeed`、`createTimelineSync`（550ms・500ms、内容の比べ、競合、即時保存、失敗の後の再予約） |
| `tests/studio-p2-e2e-main.test.cjs` の S5 | 既存（8787） | 05a・05b・05d | 下の S5 |
| `tests/studio-ui.test.cjs` | 既存 | 05a・05c | 総当たりの対象から `real` が外れることの確認（SCR-05・13 のサンプルのボタンが減る）。SCR-13 の modes が SCR-13 では URL を変え、他の画面ではトーストのまま |

- **テスト用ファイルの変更（05a）**：`tools/make_test_vmd.py` のボーンキーを2件にする（`センター` の 0F 位置 (0,0,0) と **30F 位置 (0,1,0)**、回転は単位）。`tests/fixtures/minimal.vmd` を作り直してコミットする。`tests/test_make_test_vmd.py`（新規、pytest）でコミットしたファイルと生成結果のバイト一致を確かめる（`test_make_test_pmx.py` と同じ形）。`minimal.vmd` を使う既存のテストは `studio-p2-assets.test.cjs` の登録だけで、中身に依存しない。§4.2 の表も直す。
- **FBX の種データ**：テストの中で `data/files/<fid>.fbx` と `data/manifest.json` を作る（`fid = sha256(kind + '\0' + name)` の先頭24桁、`server.py:988` と同じ）。名前 `Boxing Leading Hand Jab.fbx`（中身 `minimal_motion.fbx`、`motions`）と `model.fbx`（中身 `minimal_model.fbx`、`modelA`）。
- **通し確認 S5（`tests/studio-p2-e2e-main.test.cjs`）**：`kind:'active', needs3d:true` にする。手順：①SCR-08 の取り込みで `minimal_pmx.zip`（A）と `minimal.vmd` を1回で取り込む。②SCR-13 を開き［編集］（`[data-mode="edit"]`）。③PMX を選び、VMD の行を押し、位置 1.0 で `あ`=1・センターの y が +1.0。④S1 の VRM（`ctx.vrmId`）を選び、位置 0.5 で `hips` の z=0.5。⑤（05b で足す）［この再生位置を制作に記録］→［保存］で workspace の `clip:0, frame:15`（S7 が使う）。⑥（05d で足す）SCR-05 で FBX のコンビネーションを連結再生し、`Tri` が動く（FBX の素材は E2E の中で取り込む：③の取り込みで `Boxing Leading Hand Jab.fbx` をモーション、`model.fbx` をモデルA）。S5 は 05a で `pass` になり、05b・05d は手順を足しても `pass` のままであること（後退させない）。S3 が WP-06 まで `skip`（未着手）なので、`furthest_step` は WP-06c まで S2 のまま変わらない（§2.9(b) の規則どおり。S5 の `pass` は WP-05a の完了ゲートで確かめる）。

#### (h) ◇ 未実装のまま／決定（O-⑤）

◇ のまま：表情レイヤー・表情の編集（LIP-009）、自動リップシンク（LIP-*）、VRM・GLB への VMD の適用（O-⑤-8）、曲線の編集（DATA-003）、3視点比較・同期比較・仮転写 `ivTransfer`（REVIEW-001 の範囲。旧画面の統合プレビューのまま。外部コマンド `integrated_retarget` も旧画面だけが受ける）、MMD の IK・物理（旧画面にも無い）、SCR-13 の4分割（REVIEW-001）、SCR-13 の右「曲線」「表情・リップ」「比較・版」「複数ダンサー」「格闘」「追加動作」タブ（今のまま）、SCR-05 の「表情レイヤー」「ボーン設定」、PMX の物理・剛体。

- **O-⑤-1（決定）**：82パターン表は `motion/patterns.fork.js` へ写す（データのフォーク）。照合は Node（`tests/studio-p2-motion-fork.test.mjs`）で `index.html:80` の `const rows=[…];` を取り出して `JSON.parse` し、`ROWS` と `deepStrictEqual`。`names`（`:81`）・`keywords`（`:242`）・`norm`（`:229`）・尺の規則（`:92`）も同じファイルに写して照合する。旧画面は変えない。
  - 理由：表は `index.html` のインラインで、import できない（R2-(2)）。v5 の既定は pytest だったが、写した先が JS なので Node で import して比べる方が、文字列の取り出しを1回で済ませられる。
- **O-⑤-2（決定）**：連結再生とタイムライン再生の計算は `motion/chain.fork.js` へ**関数単位**で写す。DOM を参照する部分（`msg.textContent`・`$('speed')`・`tr.pause(...)`）は呼び出し側に残し、関数は値を返すだけにする（(c) の一覧）。照合は、1行で完結する旧関数（`clipOffset`：`index.html:257`）は `index.html` から取り出して実行して比べ、DOM に絡む `chainFrame`（`:291〜299`）・`timelineFrame`（`:260〜290`）は、本節 (d) に写した式からの期待値で比べる。
  - 理由：`chainFrame` は `window.getComboState()`・`document.getElementById('speed')`・`actors` を直接読むので、そのまま `vm` で動かすには偽物が多すぎて、照合の意味が薄い。式は数行なので、期待値を手で書く方が読みやすい。
  - 旧の行番号の訂正：v5 は「`chainFrame`・`clipOffset`、`index.html:291〜301`」と書いていた。`clipOffset` は 257 行、`chainFrame` は 291〜299 行（`5865209`）。
- **O-⑤-3（決定：モックを変えない案）**：新しいタブは作らない。コンビネーションは SCR-05 の下部タイムライン（モックのパネル「タイムライン」のトラック「体」）で表示・編集し、帯の操作は下部の枠の中に置く。お気に入りは SCR-05 左（モックのパネル「モーション検索」の注記が「82パターンの検索・分類・お気に入り」）。タイムライン編集（⑤-6）は SCR-13 の下部（パネル「編集タイムライン」DATA-001）。
  - 理由：所有者決定「見た目・レイアウトの正本は新UIモック」（ROADMAP_JA.md:108、R6）。v5 の既定（SCR-13 に新しいタブ「コンビネーション」）はモックのタブ構成を変える。モックには、コンビネーション（順番に並んだモーション）とタイムライン編集（開始・長さを持つクリップ）の置き場所が、それぞれ SCR-05 と SCR-13 の下部に既にある。下部の枠は今 `bottomPane`（サンプル専用）が描くので、`app.js` に `type:'feature'` の下部を足す（(b)）。これは部品の置き換えで、区画は増えない。
  - 残る点：SCR-05 は画面名が「初期構想」で、導線点検の項目8（要所有者OK、未承認）は初期構想の画面をメニューの初期表示から外す案である。項目8 が承認されたときの扱いは (i) の Q6 で確かめる。
- **O-⑤-4（決定）**：タイムライン（550ms）と補正レイヤー（500ms）の自動保存は旧画面どおり再現する。保存の前に GET し、**内容**が最後に読んだ／保存した内容と違えば競合として止める（(d) 05e の 4）。`updatedAt` は使わない。
  - 理由：`/api/timeline-editor` は If-Match が無い（`server.py:698〜713`）。`updatedAt`（`time.time()`）はあるが、`/api/motion-layers` には版も時刻も無い（`server.py:677〜697`）。同じ方式（内容の比べ）を両方に使う。サーバーに If-Match を足すのは保存形式・API の変更（R1 の外）なので行わない。GET と POST の間の隙は残る（リスク K12）。旧画面は確かめずに上書きしていたので、これより悪くはならない。
- **O-⑤-5（決定）**：新UIが受けるのは `play_chain`・`stop_chain`・`preview_motion`（SCR-05 表示中）と `preview_vmd`・`integrated_preview`（SCR-13 表示中）だけ。他の画面では反応せず、トーストで知らせる。`open_pmx`・`integrated_retarget` は受けない。`refresh_assets` は②のまま。
  - 理由：旧画面と新UIを同時に開くと両方が反応する（K2 と同じ種類の問題）。表示していない画面を勝手に開くと、利用者の作業中の画面を奪う。表示している画面だけが反応すれば、利用者が見ている所でだけ再生が始まる。`open_pmx` は旧画面の中央タブの切替で、新UIに当たる操作が無い。`integrated_retarget` は旧画面の仮転写で、移植の対象外（REVIEW-001）。
- **O-⑤-6（決定）**：⑤-11 は SCR-13「ボーンマップ」タブの末尾の折りたたみ。⑤-12 は SCR-13 中央［比較］の帯の2つ目の節で、three の表示は `retargetViewport` の three-host の `content` に2体を置く（④-10 と同じ方法。同時に1つの規則を守る）。⑤-14 は SCR-13 右「足IK」タブ（モックの既存の節）。⑤-13 は SCR-13 の下部（タイムラインの中。旧画面でも `#timeline-studio` の中）。新しいタブは作らない。
  - 理由：旧画面で ⑤-11・⑤-12 は `#skeleton-lab`（④-9 の移植先＝「ボーンマップ」）の中にあり、同じ元・対象の選択（`sk-source`・`sk-target`）を使う。⑤-12 は three で2体を並べるので、④-10 と同じビューポートに置くのがいちばん小さい。足の接地はモックに「足IK・接地」の節が既にある。
- **O-⑤-7（決定）**：`clip`・`frame` は**明示の操作［この再生位置を制作に記録］のときだけ**書く（再生を止めたとき・クリップを選んだときには書かない）。書けるのは、対象モデルが `workspace.asset` と同じ GLB/VRM のときだけ。`frame = round(time × camera.fps)`（`camera.fps` が無ければ 30）を `camera.duration` で頭打ちにする。`clip` は GLTF の `animations` の番号（`camera_3d.js:281` と同じ並び。同じ `GLTFLoader` を使うので一致する）。PMX＋VMD・FBX は `clip` に書かない。
  - 理由：⑥のカメラ画面は `frame/fps` をクリップの時刻にする（`camera_3d.js:282`）ので、同じ単位で書く。止めたときに自動で書くと、利用者が意図しない `clip` の変更で未保存になる（`clip` は dirty になる）。別のモデルの番号を書くと、⑥で違うクリップが再生される。
- **O-⑤-8（決定、既定どおり）**：P2 では VRM・GLB への VMD の適用を入れない。押したときの ◇ の文言は (d) 05a の 4。v5 の既定の文言「リップシンク・表情フェーズ（Phase E の次）で扱います」は、計画の記載と合わない（リップシンク・表情フェーズが扱うのは VRM/PMX の**口形・表情のモーフの対応**で、VMD の**ボーン**を VRM に当てる計画は承認済みの文書に無い：`EARLY_LIP_EXPRESSION_MME_DESIGN_JA.md:7・14`）。そこで phase は `PH.P4`（未承認）にし、モーフの対応は LIP-004 と書き分けた（批評 5-3）。
- **Q5 との関係（決定）**：WP-05 の設計は Q5 の答えに依存しない。SCR-13 の PMX＋VMD の再生（S5）は workspace を使わない。依存するのは次の2点だけで、どちらも WP-05 の範囲の外：
  - Q5 が「入れる」になったとき、PMX＋VMD の組（どの PMX にどの VMD を当てたか）を制作状態に記録する先が要る（今の workspace には無い。`workspace.character` などの設計の中で決める）。そのときは ⑤-8 の［記録］を PMX にも広げるかを、その設計で決める。
  - S7（踊らせる）を PMX で通すには、⑥のカメラ画面（`camera_3d.js`）で PMX＋VMD を再生する必要がある（Q5 の (2)）。WP-05 は⑥に PMX の再生を足さない。
  - Q5 が「入れない」（既定）のままなら、S7 は今のとおり GLB/VRM のクリップ（05b で記録した `clip`・`frame`）で通す。

#### (i) 所有者確認待ち（既定のまま進める。§5.4 にも書いた）

- **Q6 SCR-05（初期構想）の使い方**：既定は、SCR-05 を FBX の82パターン・お気に入り・コンビネーション・A/B の2体表示（MOTION-009）の画面として使う（モックのパネルの注記どおり）。導線点検の項目8（初期構想の画面をメニューの初期表示から外す）が承認された場合も、SCR-05 は消さず、SCR-13 のツールに［コンビネーション（05）へ］のリンクを残す。
- **Q2 の追加**：⑤-10（2D 模式）と ⑤-15（3D 模式・ダミー人形）は格闘の82パターン向けの表示で、歌ってみたの主シナリオでは使わない。既定は「移植する」（WP-05g を最後に置く）。移さずに旧画面のリンクだけで残してよければ指示してください（05g を外すだけで、他の WP に影響しない）。
- **O-⑤-8**：既定どおり P2 では入れない。VRM で VMD を使いたい場合は、計画への追加として指示してください。

#### (j) 批評（2026-10-20、Opus。別の視点で1回：旧コードとの食い違い・テストできない受け入れ条件・スコープ）

| ID | 見つけたこと | 本節での反映 |
|---|---|---|
| 5-1 | v5 の ⑤-7「ボーン対応表（FBX→モデル）」は、`/api/mapping`（パターンの手順名→登録FBX の対応、`index.html:233〜235`）と `/api/conversion-map`（VMD 変換用のボーン対応、`:416〜417`）の2つを混ぜていた | ⑤-7 を手順名の対応表に限定し、変換用の対応表は WP-07（O-⑦-1）へ移した |
| 5-2 | §1.8 の表は `v01641_preview_guard.js` を「P2 では使わない」としていたが、⑤-12 の `v01633_35_scrub.js:5` が import している | ⑤-12 で import して共有すると決め、§1.8 の表を直した |
| 5-3 | O-⑤-8 の既定の文言が、リップシンク・表情フェーズが VMD のボーンを VRM に当てるかのように読めた。計画の文書にその記載は無い | ◇ の phase を `PH.P4`（未承認）にし、モーフの対応（LIP-004）と書き分けた |
| 5-4 | 最小 VMD はボーンキーが 0F の1件だけで、S5 の「ボーンが動く」を PMX で確かめられなかった（モーフしか動かない） | `make_test_vmd.py` に センター 30F のキーを足し、バイト一致のテストを足す（05a） |
| 5-5 | 旧のタイムライン再生は、一時停止中に位置を動かしても姿勢を変えない（`index.html:798`）。v5 のテスト案「連結再生のフレーム位置」は、位置を指定して姿勢を読む前提で、旧の動きでは確かめられない | 連結・タイムラインは「再生中の同じ評価の中で、状態の時刻と姿勢の関係」を確かめる形にした（05d の 2、05e の 4）。05a の1体再生は旧 `ivSetTime` と同じく一時停止中も姿勢を変えるので、位置を指定して確かめる |
| 5-6 | v5 の O-⑤-4 の「`updatedAt` を比べる」は、`/api/motion-layers` に時刻が無いので補正レイヤーに使えない。また POST の応答に `updatedAt` が無いので、自分の保存の後の値が分からない | 内容の比べに変えた。残る隙はリスク K12 に書いた |
| 5-7 | 1体だけの SCR-13 にすると、旧画面の PMX の A/B 2体表示（MOTION-009「PMX二体プレビュー」、`index.html:305〜317`）が新UIから消える | SCR-05 の A/B の 3D（05d）に置いた |
| 5-8 | v5 の一覧に、パターンを選んだときの 3D の模式再生（ダミー人形・実FBX、`index.html:228・243〜254・358`）が無かった | ⑤-15 として足し、05g に置いた。主シナリオで使わないので Q2 の対象にした |
| 5-9 | v5 の (b) は ⑤-1 を SCR-12 にも置いていた。SCR-13 と入口が2つになる | SCR-13 だけにした |
| 5-10 | テストのポートが §4.1 の表と実装で食い違う：`studio-p2-normalize-parity` は実装 8794（表 8789。8794 は `studio-p2-camera` の予約）、`studio-p2-retarget` は実装 8791（表に無い。8791 は Phase E `camera-ui` の予約）、`studio-harness.test.cjs` は 8785（表に無い） | WP-05 の新しいテストは空いている 8793・8784 を使う。食い違いは §4.1 の表に注記した。直すのは、衝突が実際に起きる WP-06b（8794）と Phase E WP-03（8791）の前（WP-05 の範囲外。台帳の WP-06b の notes に書いた） |
| 5-11 | スコープ：VMD に位置の操作（シーク）を付けるのは旧画面に無い操作 | 05a は GLB の再生と同じ操作部品を VMD にも使う、と決めた（新しい計算は無い）。§5.3 に書き、異論があれば外せる（外すと S5 のモーフの確認は再生中の時刻との関係で行う） |
| 5-12 | スコープ：お気に入り・対応表の保存の前に GET し直すのは、旧画面に無い動き | 保存の本文は旧と同じ（全体の置き換え）で、外部（MCP）が足したものを消さないための安全側の変更。§5.3 に書いた |
| 5-13 | テストできない条件：05a の「rAF のループが残らない」は、そのままでは観測しにくい | `requestAnimationFrame` を `page.addInitScript` で数えるスパイにし、画面を離れた後 500ms で呼び出しが増えないことで確かめる（ほかの画面の rAF は 08 には無い。増えたら失敗の理由に呼び出し元を出す） |

---

### 2.6 ⑥ カメラ（WP-06a〜06d。Phase E の UI の土台。規模 XL。未決は O-⑥）

#### (a) 移植する機能

`camera.html` の全機能（`LEGACY_UI_INVENTORY_JA.md` ⑤の表）：
- キーフレームの編集・Undo/Redo・保存（`camera.js:187, 210, 226`）。
- 再生・コマ送り・スクラブ、表示範囲。
- 2D 構図プレビュー（`#preview`）、自由視点の 3D と撮影カメラの 3D（`camera_3d.js`）。
- 表示モデル・クリップ・追従ボーン・追従設定と区間のキー化。
- カスタム撮影構図、CAM-015 のショット・シーケンス編集（`/api/camera/sequence/edit`）。
- フォーカス診断・範囲診断・DOF の近似プレビュー、構図診断、撮影リグ（ベータ）。
- MMD カメラ VMD の検査・読込・試験再生・書き出し（`/api/camera/vmd/*`）。
- 統合状態の保存・復元（②に統合する）。

#### (b) 移植先と方式（決定）

- **方式：動作を変えない `mount(root)` 化 ＋ 要素ID互換ホスト ＋ 常駐（keep-alive）**。コードは1本で、旧 `camera.html` と新UIが同じファイルを読む（フォークしない）。
  1. **WP-06a：mount 化**（旧ファイルの変更。R5 (b)）。**2コミットに分ける**：①`camera.js` とそのテストの直し、②`camera_3d.js` とそのテストの直し。各コミットで全テストを通す。
     - 共通の形（2-M5・2-m2）：`mount(root, { host })`。`host` は `'legacy'`（`camera.html`）か `'studio'`（新UI）で、省略すると `'legacy'`。戻り値は2つのファイルで同じ形の `MountHandle = { host, root, isDirty(): boolean }`（`camera_3d.js` には未保存の状態が無いので、`isDirty` は常に `false` を返す）。同じ `root` でもう一度呼ぶと、同じハンドルを返す（何もしない）。別の `root` で呼ぶと `Error('camera page is already mounted')` を投げる。
     - `camera.js`：**IIFE（`(()=>{'use strict'; … })()`）は残し**、その中身を IIFE の中の `function mount(root,{host='legacy'}={}){ … }` に移す（モジュールの外に変数を漏らさない）。
       - 要素の取得を `const $=id=>root.querySelector('#'+CSS.escape(id))` に変える（今は1行目で `document.getElementById`）。
       - `document.querySelector` の箇所（87行の `.preview-shell`・`.camera-frame`、97行の `[data-camera-move]`、213行の `.dual-views`）を `root.querySelector(All)` に変える。
       - `document.createElement`（13・76・94・211行）と `window` のリスナー（213行の `beforeunload`〔未保存〕・`resize`）は変えない。
       - IIFE の最後に `window.BAICameraPage={mount, handle:()=>handle}; if(!window.BAI_CAMERA_MANUAL_MOUNT)mount(document,{host:'legacy'});` を書く。
       - `isDirty()` は内部の変数 `dirty`（`camera.js:1, 7`）を返す。Phase E WP-03 で足す `BAICameraDebug.getState().dirty` も、**同じ変数**を読むようにする（Phase E §7 に注記した）。
     - `camera_3d.js`（ESM なので IIFE は無い）：`import` 文は先頭に残す。残りの最上位の処理を `export function mount(root,{host='legacy'}={}){ … }` に移す。
       - `$` を同じ形に変え、`document.getElementById('vmd-follow-timeline')`（67・137・286行）を `$('vmd-follow-timeline')` に変える。
       - `window` の `blur`（240行）は変えない。`keydown` は要素に付いている（356行）ので変えない。
       - 最後に `if(!window.BAI_CAMERA_MANUAL_MOUNT)mount(document,{host:'legacy'});` を書く。
     - **`camera.html` は変えない**（フラグが無ければ今と同じ順番・同じ時点で `mount(document)` が動く）。
     - `camera_project_bundle_ui.js` は新UIでは読まないので、mount 化しない（1-M4 補足）。WP-06c で、DOM を使わない部分だけを共有モジュールへ移す（下の 3）。
     - 字下げは変えない（差分を最小にし、ソースの文字列を検査するテストへの影響を減らす）。
     - 完了条件：§1.14 の一覧のテストと、カメラ関係の全テスト・`legacy-ui-layout`・`studio-ui` が合格する。直したテストの一覧をコミット本文に書く。旧画面の操作で動作が変わらない（Phase E WP-03 の `camera-ui.test.cjs` がまだ無いので、WP-06a では `tests/studio-p2-camera.test.cjs` の中で旧 `camera.html` を開く同じ操作の検査（キー追加→Undo→保存→再読込で復元）を、mount 化の前後で走らせ、結果が一致することを確かめる）。前後の比べ方（3-m4）：`git worktree add ../bai-before <mount化の直前のコミット>` で前の版を別のディレクトリに取り出し、`tests/helpers/studio-harness.cjs` で前の版をポート 8786、今の版を 8794 で起動する。同じ操作を両方に行い、`#status` の文言・キーの数と値・保存したファイルの JSON が一致することを確かめる。比べた後で `git worktree remove ../bai-before` で消す（このテストは WP-06a の確認のためだけに手で走らせ、`npm test` には入れない。結果はコミット本文に書く）。
  2. **WP-06b：ホスト**。`studio/js/camera/camera-host.js` が、mount したコードが参照する全ての要素ID・クラス・属性を、**新UIモックの SCR-02 のパネル構成の中に**配置した DOM を作る。
     - 配置：左はショット（シーケンスの一覧）。中央は `#scene` と `#preview` のキャンバス。右のタブはカメラ／フォーカス／レール／補間。下部は `#track` を含むタイムライン。配置表は O-⑥-4。
     - 見た目は `studio/styles/camera-host.css`（`.camera-host` の中だけに効く。`camera.css` は読まない）。
     - **壊れたカメラ保存データのときは mount しない**（2-B1）：`project.cameraInvalid` が立っている間（§2.2(d)-2）は、ホストを作らず、SCR-02 の中央に ◇ の説明「カメラ保存データ（camera_project.json）を読めないため、カメラ画面を開けません。元のファイルはそのままです。退避コピー：{backup ?? 'なし'}。」と、§2.2(d)-2 の［初期状態から始める…］（同じ確認ダイアログ、同じ `POST /api/camera/project/reset`）を出す（3-M2。退避ファイルのダウンロードと中身の確認は Phase E WP-02a のまま ◇、ids `['CAM-G06']`）。`cameraInvalid` が消えたら（［再読込］で正常に読めたら）、次に SCR-02 を開いたときに mount する。mount した後で壊れたことが分かった場合は、ホストを `#keepalive` に移したままにして同じ説明を出す（サーバー側の 422 で書き込みは止まる：§1.15 B-3）。
     - workspace としてホストに送るのは `{frame, asset, clip}` だけ（3-m7。WP-02d より前。`stage` などストアだけが持つキーは送らない）。
     - DOM を作った後で、`window.BAI_CAMERA_MANUAL_MOUNT=true` を立てる。次に `camera.html` と**同じ順番**で共有 UMD（`/camera_vmd_local.js`、`/camera_rig.js`、`/camera_framing.js`、`/camera_lens.js`、`/camera_dof.js`、`/camera_focus_tracking.js`、`/camera_focus_consistency.js`、`/camera_sequence_playback.js`）と `/camera.js`（classic script）を `legacy.js` で読む。その後 `BAICameraPage.mount(hostRoot,{host:'studio'})` を呼び、`(await import('/camera_3d.js')).mount(hostRoot,{host:'studio'})` を呼ぶ。どれも1回だけ。
     - 包含の検査（`tests/studio-p2-camera-ids.test.mjs`）：
       - `camera.js`・`camera_3d.js` のソースから `$('…')` の ID、`querySelector` のクラス・属性セレクターを抜き出し、`studio/js/camera/legacy-ids.json`（WP-06b で生成。2026-10-22 の現物 `camera.html` には ID が **124個**ある）と、ホストが作る DOM（Playwright で列挙）に全部が含まれることを確かめる。配置先と差分は [WP-06b 要素配置表](P2_WP06_CAMERA_ID_PLACEMENT_JA.md)。
       - **重複IDの検査**：新UIのページ全体で `[id]` が一意であること。`root` 基準で取るので、重複してもカメラのコードは壊れないが、`label for` や `document.getElementById` を使う他のコードが壊れるのを防ぐ。
     - **常駐**：mount したコードは作り直せないので、ホストの根要素はページの中で1つだけ作る。SCR-02 を離れるときは `#main` から外し、非表示の `#keepalive`（`studio/index.html` の `<body>` の直下に足す）へ移す。戻ったら `#main` に戻して、`window.dispatchEvent(new Event('resize'))` を送る。§1.6 の後始末では破棄しない。SCR-03/04/14/15/16 は、⑥の時点では SCR-02 の該当タブ（`?tab=focus` など）へのリンクにし、同じホストを2つ作らない。
  3. **WP-06c：②との統合**（統合保存の窓口は②の［保存］。カメラ単独の保存は O-⑥-2 のとおり残す）。
     - **共有モジュール `camera_bundle_core.js`**（2-M6。ルート直下、UMD、`window.BAICameraBundleCore`、DOM を使わない）を作る。中身は、`camera_project_bundle_ui.js` から**動作を変えずに移す**部分と、P2 で必要な定数：
       - `validateRestore(bundle)`（今の `camera_project_bundle_ui.js:7〜14` をそのまま移す）。
       - `buildBundleBody({combination, camera, workspace})`（今の18行の本文作りを関数にしたもの）。
       - `CAMERA_OWNED_WORKSPACE_FIELDS = []`（§2.2(d)-9）と、`mergeWorkspace(storeWorkspace, hostSnapshot)`（ストアの `asset`・`clip`・`frame`・`stage` に、ホストのスナップショットのカメラ側フィールドだけを重ねる）。**P2 の時点では一覧が空なので、`mergeWorkspace` は実質ストアの値の複製を返すだけで、何もしない**（3-m9。WP-02d でカメラ側のフィールドが入ったときに意味を持つ。先に形だけ作るのは、旧画面と新UIの規則を最初から同じ場所に置くため）。
       - **assetRef の持ち主（3-M8）**：Phase E WP-02d の assetRef は、保存のときに**ストアの `asset`** から作る（カメラ側のフィールドではないので、`CAMERA_OWNED_WORKSPACE_FIELDS` には入れない）。Phase E §4.2・§7 に注記した。
       - Phase E WP-02d で足すもの（assetRef の記入、`validateRestore` の緩和、`workspace.frame` の整数化、423 `recovery_pending` の扱い）も、このモジュールに入れる（Phase E §4.2 の WP-02d 行に注記した）。こうすれば、旧画面と新UIの両方に同じ規則が入る。
       - `camera_project_bundle_ui.js` はこのモジュールを呼ぶように変える（動作は変えない。R5 (c)）。`camera.html` に `<script src="/camera_bundle_core.js" defer>` を `camera_project_bundle_ui.js` の前に1行足し、`server.py:166` の配信許可リストに足し、`tests/test_studio_routes.py` に 200 の確認を足す。`test_camera_project_bundle_ui.py`・`test_camera_bundle_preflight.cjs`・`test_bundle_snapshot_consistency.py` のソース文字列の検査を、同じ意味の検査に直す。
       - 単体テスト `tests/test_camera_bundle_core.cjs`（`node --test`。`validateRestore` の今までの全ての拒否条件、`mergeWorkspace` の所有の規則）。読み込み方（3-M8）：`fs.readFileSync('camera_bundle_core.js')` を `vm.runInNewContext(src, ctx)`（`ctx = {window: {}, globalThis: ctx}` の形で、`globalThis.BAICameraBundleCore` と `window.BAICameraBundleCore` の両方を確かめる）で読み、ブラウザーでもテストでも同じファイルを使う。UMD の先頭は `(function(root){ … root.BAICameraBundleCore = api; })(typeof window !== 'undefined' ? window : globalThis);` の形にする。
       - `tests/test_camera_html_wiring_recovery.py`（`camera.html` のスクリプトの順番と直接の要素を検査している）を確かめ直し、`camera_bundle_core.js` が `camera_project_bundle_ui.js` より前にあることの検査を足す。
       - 新UIでの読み込み（3-M8）：`features/project.js` は、統合保存を初めて使うときに `legacy.js` の `loadLegacyScript('/camera_bundle_core.js')` で1回だけ読み、`window.BAICameraBundleCore` を使う。型は、import ではなく `window` の UMD なので `paths` は使わず、`studio/js/legacy-globals.d.ts` の `interface Window` に `BAICameraBundleCore` を**関数の形まで**書く（`validateRestore(bundle): void`、`buildBundleBody(x): object`、`mergeWorkspace(store, snapshot): object`、`CAMERA_OWNED_WORKSPACE_FIELDS: readonly string[]`。他の UMD のような `any` にはしない。§1.8）。**読めなかったら**（404・例外）、［保存］を無効にし、状態行に「保存の部品を読み込めませんでした。再読込してください。」を出す（コンビネーションの自動保存は使える。黙って別の本文で保存しない）。
     - `saveProject()` は、ホストが mount 済みなら、`window` イベント `bai-camera-bundle-snapshot`（`camera.js:208`）でカメラの状態を、`bai-camera-workspace-snapshot`（`camera_3d.js:290`）で workspace を集める（`camera_project_bundle_ui.js:5〜6, 18` と同じ方法）。本文は `buildBundleBody({ combination, camera, workspace: mergeWorkspace(store.workspace, snapshot) })` で作る。
     - **workspace の所有（O-⑥-5、決定済み。2-M4）**：§2.2(d)-9 のとおり。利用者がカメラ画面でモデル・クリップ・再生位置を変えたときは、ホストがストアの `setWorkspaceFields` を呼ぶ。そのため `camera-host.js` は、`bai-camera-workspace-snapshot` を **SCR-02 を離れるときと［保存］の前だけ**に取り（3-M6。1秒ごとには取らない）、`asset`・`clip`・`frame` が前回と違えば `setWorkspaceFields(changed, {source:'host'})` でストアに書く（`frame` だけの違いは dirty にしない）。ストア側の変更（④⑤）は、§2.2(d)-9 の規則（外部からの変更で、`asset` か `clip` が違うときだけ）で `bai-camera-workspace-restore` を送る。
     - **カメラ単独の保存の後（3-M5）**：`camera.js` の保存が成功したところ（210行の `serverRevision=j._revision||null;dirty=false;status('保存しました')` の直後）に、`window.dispatchEvent(new CustomEvent('bai-camera-saved',{detail:{revision:serverRevision}}))` を1文足す（旧画面では誰も受けないので、動作は変わらない。R5(c)）。`camera-host.js` はこれを受けて `GET /api/project/bundle` を取り、`revision` を取り直す（`camera` は `base` にも入れる。そうしないと次の［保存］が 409 になる）。
     - 再読込のときは、`validateRestore` を通してから、`bai-camera-workspace-restore`・`bai-camera-bundle-restore`（`camera_3d.js:293`、`camera.js:209`）で反映する（`camera_project_bundle_ui.js:19` と同じ順番）。
     - `dirty.camera` は `MountHandle.isDirty()` から取る（O-⑥-1、決定）。SCR-02 を表示している間は1秒ごと、［保存］の前、`beforeunload` の判定のときに読む。
  4. **WP-06d**：Phase E §7 に読み替え表（O-⑥-4 の配置表から作る）を追加し、高性能モデルで1回レビューする（Phase E §0 の条件）。
- **理由**：`camera.js` は 227 行の中で 94個の要素IDを直接参照しており、Phase E WP-00a〜17 がこの中身を改修する予定。フォークすると、Phase E の改修と G-xx の修正を2か所に入れることになり、ずれる。mount 化なら変えるのは要素の取り方だけで、動作は変わらない。Phase E の変更は1か所に入る。
- **K8（Phase E の改修の約束）**：共有した `camera.js`・`camera_3d.js` に Phase E が足す新機能は、**`host==='studio'` のときだけ有効にする**（2-M5）。バグ修正（G-xx）は `host` に関係なく両方に入れる。加えて、新機能のコードは `camera.html` に無い要素を使うことがあるので、必ず `const el=$('new-id'); if(el){ … }` の形で要素が無い場合も守る。こうして `camera.html` では何も起きないようにする（旧画面に新機能を出さない：R5）。Phase E の各 WP の完了ゲートに「旧 `camera.html` を開いて pageerror が0件」を足す（Phase E §7 に注記した）。

#### (c)〜(g)

- **O-⑥-1（決定）**：`camera.js` の未保存の状態は、`MountHandle.isDirty()`（内部の変数 `dirty`。Phase E の `BAICameraDebug.getState().dirty` と同じ変数）で読む。mount 化の①のコミットで足す。旧画面からは呼ばれないので、動作は変わらない。
- **O-⑥-5（決定、2-M4）**：workspace のフィールド単位の所有（§2.2(d)-9、上の 3）。
- **O-⑥-2**（既定を変えた：1-M10）：カメラ画面単独の［保存］（`#save` → `POST /api/camera/project`、`camera.js:210`）は、**Phase E WP-02d まで残す**。新UIのホストにも `#save` を見える形で置き、モックの SCR-02 のツールの位置に「カメラだけ保存」として出す。WP-02d で統合保存が完成したら、Phase E §7 の読み替え表に従って一本化する。
- **O-⑥-4**：要素IDの配置表（どの ID をモックのどのパネル・タブに置くか）。[WP-06b 要素配置表](P2_WP06_CAMERA_ID_PLACEMENT_JA.md)と `legacy-ids.json` に現物124 IDを記録した。独立した高性能モデルのレビューは未実施として台帳に残す。これが Phase E §7 の読み替え表の元になる。
- 削除：v1 の O-⑥-3（正規化の置き換え）は、mount 方式にしたので不要になった（§1.7）。
- テスト：`tests/studio-p2-camera.test.cjs`（ポート 8794）。
  - 旧 `camera.html` に対する既存の Playwright 相当の操作（キー追加→Undo→保存→再読込で復元、合成 GLB を両方のビューに描画）が、新UIのホストでも同じ結果になる。
  - 包含と重複IDの検査。
  - 常駐（SCR-02→08→02 でキーが残っている）。
  - カメラ単独の保存と統合保存の両方が、それぞれのファイルに正しく書く。
  - `camera host does not mount on an unreadable camera file`（2-B1）：壊れたカメラファイルで SCR-02 を開くと、◇ の説明と退避名が出る。`window.BAICameraPage` が未定義のまま（`/camera.js` が読まれていない）。カメラファイルのバイト列は変わらない。
  - `camera owns only camera fields`：ストアの workspace が `{frame:42, asset:'a.glb', clip:1}` のとき、SCR-12 で別の GLB を選んでから SCR-02 を開くと、ホストにそのモデルが表示される（`bai-camera-workspace-restore` が届く）。統合保存の本文の `asset`・`clip`・`frame` はストアの値。
  - `host flag gates studio-only features`：`camera.html` と新UIの両方を開き、`MountHandle.host` がそれぞれ `'legacy'`・`'studio'` であること。
  - `camera-only save then bundle save succeeds`（3-M5）：ホストでキーを足して「カメラだけ保存」を押し、続けて②の［保存］を押すと 200（409 にならない）。`bai-camera-saved` が1回届く。
  - `camera reset from host`（3-M2）：壊れたカメラファイルで SCR-02 を開き、［初期状態から始める…］→［初期状態に戻す］で、ホストが mount され、退避ファイルが残る。
  - `no workspace restore on frame-only change`（3-M6）：SCR-12 の再生位置だけを変えて SCR-02 に戻っても、`bai-camera-workspace-restore` が届かない（スパイで数える）。`dirty.workspace` は false のまま。
- Phase E との接続：WP-06d の完了で、Phase E §7 の「UI 部分は読み替え表の追加・レビュー後」の条件が満たされる。

#### (h) ◇ 未実装のまま

Phase E の未完成の機能すべて（CAM-001〜018 の未達の部分。Phase E 側で実装する）、SCR-03/04/14/15/16 の独立画面化（⑥ではリンク）、WebMCP `camera_page`（Phase E WP-02c）。

- **Q3（所有者への確認）**：⑥の後、旧 `camera.html` での編集をどうするか。既定は**編集できるまま残し**、上部に案内「新UIのカメラ画面（/workspace/02）をお使いください」を1行出す。案内は文言だけの表示で機能ではない。ただし旧画面の見た目の変更なので、所有者の承認を得てから入れる。読み取り専用にする案は、Phase E WP-02a〜d と同時に旧画面を変えることになるので、既定にはしない。

---

### 2.7 ⑦ 書き出し（WP-07。未決は O-⑦）

#### (a) 移植する機能

| # | 機能 | 根拠 |
|---|---|---|
| ⑦-1 | FBX の連結を VMD に変換するジョブの作成（ボーン対応の JSON が必須） | `index.html:418`（`#vmd-job`）、`POST /api/export-vmd-job`（`server.py:873〜894`） |
| ⑦-2 | Blender での変換の実行と状態の取得 | `POST /api/run-vmd-conversion`（`server.py:723〜761`。`confirm:true` が必須、Blender が無ければ 503）、`GET /api/conversion-status`（`server.py:308〜309`） |
| ⑦-3 | カメラ VMD の書き出し | ⑥のホストの中（`camera.js:76`、`/api/camera/vmd/native/export`） |
| ⑦-4 | 診断 ZIP | `GET /api/diagnostics/export`（既に SCR-20/24 にリンクがあり、実機能） |

#### (b) 移植先

SCR-23 の中央のカード「エクスポート」（`screens.js:607` のパネル）に⑦-1・⑦-2 を置く。SCR-13 のツール「VMDを書き出す」（◇、`screens.js:390`）は SCR-23 への遷移に変える。SCR-17・SCR-07（動画のレンダリング）は ◇ のまま（Phase F）。

#### (c)〜(g)

- **O-⑦-1**：⑦-1 はコンビネーション（⑤、WP-05c）に依存する。VMD 変換用のボーン対応表 `/api/conversion-map` の編集（`index.html:416〜417`、`#vmd-bonemap`・`vmd-map-save`）は §2.5 の詳細化で⑤から⑦へ移した（§2.5 批評 5-1。⑤-7 はパターンの手順名→登録FBX の対応表 `/api/mapping` で、別物）。⑤の完了後に詳しくする。
- **O-⑦-2**：Blender の実行には 240 秒かかることがある（`server.py:745`）。新UIでの待ち方（`/api/conversion-status` を1秒ごとに取る、画面を離れても続ける）を決める。偽の進捗は出さない（出すのは「実行中（経過 N 秒）」だけ）。
- **O-⑦-3**：書き出し先は `exports/`（`data_dir()` の外。Phase E §2.9 の「対象外の書出し先」）。テストでは Blender を呼ばず、503 の表示だけを確かめる（Blender の実行は開発環境で未検証）。
- **テストの決まり（決定、v5 C1）**：`POST /api/export-vmd-job` は隔離していても実リポジトリの `exports/vmd_conversion_job.json` を書き（`server.py:891〜892`）、`POST /api/run-vmd-conversion` は Blender があれば実行して `exports/chain_motion.vmd` を書く（`server.py:732〜761`）。そのため、**テスト（`studio-p2-export`・§2.9 の S8）ではこの2つを必ず `page.route` で受け止め、サーバーへ送らない**（`route.fulfill` でスタブの応答を返す。ジョブは `{ok:true, job:'exports/vmd_conversion_job.json', …}`、変換は `{status:503, body:'{"error":"Blender not found"}'}`）。確かめるのは、送られる本文（`page.waitForRequest` で取る）と、スタブの応答の画面の表示だけ。`route` を登録する前にボタンを押すコードを書かない。`run-guarded.cjs` の `exports/` のハッシュの確認が最後の砦になる。`/api/camera/vmd/native/export` はバイト列を返すだけで書かないので、そのまま送ってよい。

#### (h) ◇ 未実装のまま

動画・画像のレンダリング（Phase F）、出力のプリセット・キュー・AOV（RENDER-*、NF-018）、素材単体の書き出し（NF-010）、ポータブル ZIP（DATA-012）。

---

### 2.8 ⑦の後：IK・AI（WP-08。既定は移植する）

| # | 機能 | 根拠 | 移植先（案） |
|---|---|---|---|
| ⑧-1 | 手動 IK のポーズ補助（基礎版） | `pose_ik_ui.js`（21行、`#bai-pose-editor`）、`/api/pose/last`・`/api/pose/save`・`/api/pose/solve` | SCR-13 の右タブ（O-⑧-1） |
| ⑧-2 | AI 管理（`#bai-ai-manager`） | `bai_ai_ui.js`（25行）、`/api/ai/*` | SCR-19（WebMCP・標準MCP・AIエージェント統合）（O-⑧-1） |

- 方式は R2-3（接着コードを `api.js` で書き直す）。⑦の完了後に、Opus で本節を詳しくする（割り付け・テスト）。Q2 で削除してよいと決まったものは移植しない。

---

### 2.9 主要シナリオの通し確認（E2E。OWNER-1）

所有者決定（2026-10-20）の主要シナリオ「歌ってみた」動画の制作を、新UIの上で最初から最後まで通す自動テストを1本持ち、P2 の段階ごとに伸ばす。目的は「部品ごとには動くが、続けて使うと止まる」を早く見つけることと、所有者に「今どこまで通しで動くか」を1つの数で示すこと。

#### (a) テスト

- ファイル：`tests/studio-p2-e2e-main.test.cjs`（Playwright、ポート **8787**、`P2_E2E_PORT`。§4.1）。`tests/helpers/studio-harness.cjs` で一時データディレクトリを作り、実 `data/` は使わない。
- 1つのブラウザーのページで、**画面の操作だけで**（API を直接呼ばずに）次の手順を順に行う。手順ごとに `test.step` を分け、どこで止まったかが分かるようにする。

| 手順 | 内容 | 使う機能 | 有効になる WP | 確かめること |
|---|---|---|---|---|
| S1 | VRM/PMX の読込 | ③の取り込み（合成 GLB を VRM 相当として登録）、④の表示、［このモデルを制作に使う］ | WP-03、WP-04 | キャンバスにモデルが描画され、`workspace.asset` が入る |
| S2 | ステージの配置 | ④-11 | WP-04 | 位置・回転・大きさを変えて保存し、読み直しても同じ |
| S3 | カメラの設定 | ⑥のホスト（キーを2つ足す） | WP-06b・06c | 統合保存の後、カメラのファイルにキーが2つ |
| S4 | BGM（歌の音声）の配置 | **既存のコードが無い**（音声の登録 API・タイムラインの音声トラックは旧画面に無い。LYRIC-006 は未承認） | — | **「既存機能なし」として記録**し、飛ばす（Q4） |
| S5 | VMD/FBX の設置 | ⑤-2（PMX＋VMD）、⑤-1（GLB/VRM のクリップ）、⑤-8（`clip`・`frame` の記録）、⑤-4b（FBX のコンビネーションの連結再生） | WP-05a（05b・05d で手順を足す） | SCR-13［編集］で最小 PMX に `minimal.vmd` を当て、位置 1.0 秒で `センター` の y が +1.0・モーフ `あ` が 1（`baiStudio.motion.probe`）。S1 の VRM のクリップ 0 を位置 0.5 秒にすると `hips` の z が 0.5。05b で［この再生位置を制作に記録］→［保存］で workspace が `clip:0, frame:15`。05d で SCR-05 の連結再生で FBX のメッシュが動く。詳細は §2.5(g) |
| S6 | エフェクト | 承認済みの後段（MMDエフェクトのフェーズ） | — | 飛ばす（「後段のフェーズ」として記録） |
| S7 | 踊らせる（再生） | **SCR-02（⑥のホスト）の中の既存の同期だけ**を使う：`camera_3d.js` は workspace の GLB のクリップをカメラの時刻で動かす（`updateTime`、282行）。⑤のビューポートと⑥のカメラを新しく同期させる処理は**作らない**（既存コードに無い。v5 C6） | WP-06c | SCR-02 で workspace の合成 GLB（クリップ0）とカメラのキー2つを再生すると、モデルのボーン（`hips`）が動き、カメラの位置がキーの間で補間される（`#status` のフレームと `bai-camera-pose` の値で確かめる） |
| S8 | 書き出し | 既存は VMD（⑦-1・⑦-2）とカメラ VMD（⑦-3）だけ。**音声付き 1080p の動画の書き出しは既存のコードが無い**（Phase F の RENDER-001・006、計画・未検証） | WP-07 | ⑦-1・⑦-2 の要求の本文が正しく作られ、スタブの応答（ジョブ作成の成功・Blender が無い 503）が画面に出る。**この2つは `page.route` で受け止め、サーバーへ送らない**（`exports/` は隔離の外。§2.7 のテストの決まり、v5 C1）。カメラ VMD はサーバーへ送ってよい（書かない）。動画は「既存機能なし」として記録（Q4） |

- まだ有効になっていない手順（その WP が終わっていない）は `skip` にし、理由に WP の名前を書く。「既存機能なし」「後段のフェーズ」の手順も `skip` にし、理由をそのまま書く。**skip を合格と数えない**。

#### (b) 台帳への記録

- `docs/roadmap/P2_PORT_STATUS.json` に `e2e_main` を持つ：`{ "furthest_step": "S3", "steps": [{"id":"S1","result":"pass|fail|skip","reason":"…"}, …], "commit": "<短いSHA>", "checked_at": "<ISO8601>" }`。
- `furthest_step` は「S1 から切れ目なく `pass` が続いた最後の手順」。`skip`（既存機能なし・後段）は切れ目と数えずに飛ばして続ける。未着手の WP による `skip` と `fail` は切れ目になる。
- 結果は `node tools/record_e2e_main.mjs`（WP-00a-2 で作る小さなスクリプト。テストの JSON レポーターの出力を読み、上の形に書く）で書く。手で書かない。

#### (c) WP の完了ゲート

- 各 WP の完了ゲートに「`tests/studio-p2-e2e-main.test.cjs` を**最初から**通して実行し、`furthest_step` が前の値より後退していない」を足す（§3）。後退していたら、その WP は完了にしない。
- 新しく有効になる手順の WP（上の表）は、その手順を `pass` にすることも完了ゲートに含める。

#### (d) 所有者の確認したい一覧との対応（Phase E へ引き継ぐ）

所有者の挙げた一覧（素材取込、カメラワーク、フォーカス・DOF、シーケンス、カメラレール、カメラ VMD の入出力、マルチカメラ、書き出し）は、次のように割り付ける。P2 の範囲は上の S1〜S8 だけで、残りは Phase E の各 WP の完了時に、同じ E2E のファイルへ手順を足す（Phase E §7 に注記した）。

| 項目 | 担当 |
|---|---|
| 素材取込 | P2 ③（S1） |
| カメラワーク | P2 ⑥（S3）、Phase E WP-05〜09 |
| フォーカス・DOF | Phase E WP-04 |
| シーケンス | Phase E WP-12・13 |
| カメラレール | Phase E WP-07 |
| カメラ VMD の入出力 | P2 ⑦-3（S8 の一部）、Phase E WP-12・13 |
| マルチカメラ | Phase E WP-12・16 |
| 書き出し | P2 ⑦（S8 の VMD）、動画は Phase F |

#### (e) ◇ 既存機能なし（Q4 で所有者に確かめる）

- **BGM の配置**（S4）：音声の素材の登録・タイムラインへの配置・再生の同期のコードは、旧画面にも API にも無い。P2 は既存機能の移植なので入れない。
- **音声付き動画の書き出し**（S8）：動画のレンダリングは Phase F（RENDER-001・006、計画・未検証）。
- どちらも、通し確認では「既存機能なし」と記録するだけで、新機能として作らない。前倒しするかどうかは Q4 で所有者が決める。

---

## 3. 作業パッケージ（P2-WP）と順番

| WP | 内容 | 依存 | 規模 | モデル | 完了ゲート（すべて満たす） |
|---|---|---|---|---|---|
| **P2-WP-00a-1** | データの隔離：`bai_paths.py`・ルートの `conftest.py`・`tests/test_data_isolation.py`（Phase E §2.9 の仕様どおり。**Phase E WP-03 の前倒し**）。`server.py` の `DATA` ほか、`diagnostic_logging.py`・`qa_capture.py` の保存先を `data_dir()` から作る | なし | S〜M | Sonnet で実装 → **Opus でレビュー**（全ての保存先を切り替える＝データ破損のリスク） | pytest 全件が合格。`test_data_isolation.py` で実 `data/`・`exports/` のハッシュが前後で一致。§1.14 の「同じプロセス」のテストが一時ディレクトリを使っていることを確認。`PHASE_E_IMPLEMENTATION_STATUS.json` の `planned_in` の該当行の `status` を `done` にし、コミットを書く。 |
| **P2-WP-00a-2** | ハーネスとテスト用ファイル：`tests/helpers/studio-harness.cjs`・`tests/run-guarded.cjs`（§4）、devDependencies に `"three": "0.160.1"`（`package.json` と `package-lock.json`）、`tools/make_test_glb.py`（Phase E §2.9 の合成モデルの仕様）、`tools/make_test_vmd.py`、`tools/make_test_pmx_zip.py`、`tests/studio-ui.test.cjs`・`tests/legacy-ui-layout.test.cjs` をハーネスへ移す。通し確認の土台（§2.9）：`tests/studio-p2-e2e-main.test.cjs`（S1〜S8 がすべて `skip` で理由付きの状態）と `tools/record_e2e_main.mjs` | 00a-1（`legacy-ui-layout` の移行は `5865209` の後） | M | Sonnet | node 全件が `run-guarded.cjs` の下で合格し、実データのハッシュが一致。three が無い環境で 3D のテストが skip になり、理由が出る。 |
| **P2-WP-00b** | 不具合の修正（§1.15）：B-1（`server.py:316〜320` の削除）、B-2（`index.html` の `externalProjectApply` に1文）、B-3（`read_project` のエラー分岐・`CameraProjectInvalid`・退避・`bad(...,code)`・`send_camera_invalid`・`read_bundle(strict)`・統合バンドルの GET（try と 500 を含む）と POST の書く前の読込・`GET/POST /api/camera/project`・`POST /api/camera/sequence/edit` の 422、`camera.js:226` の読込エラーの文言の1か所）、2b（`POST /api/camera/project/reset` の前倒し。3-M2）。テストは `tests/test_project_envelope.py`、`tests/test_bundle_camera_invalid.py`（reset のテストを含む）、`tests/legacy-project-save.test.cjs`（旧画面のテストはこの1ファイルにまとめる。3-m2）。`test_legacy_project_client_revision.py` の該当する検査を置き換え、`test_bundle_snapshot_consistency.py:18` のソース文字列の検査を振る舞いのテストに置き換える（3-M1、§1.14）。**コミットの分け方（3-サブコミット）**：①B-1・B-2（小さい修正）、②B-3 と 2b（`read_project`・422・reset）。**②のコミットだけ Opus でレビューする**（①は Sonnet の自己確認でよい） | 00a-1, 00a-2 | M | Sonnet で実装 → **Opus でレビュー**（B-3 のコミット。保存経路の変更） | 新しいテストが合格。既存の `test_bai_camera.py`・`test_project_state_bundle.py`・`test_bundle_revision.py`・**`test_bundle_snapshot_consistency.py`**・`test_camera_focus_endpoint.py`・`test_camera_sequence_ui.py` が合格（旧 `read()` の互換、373行の非厳格）。実 `data/` を使うテストは無い。Phase E 台帳の G-06 の行に「一部（エラー分岐、統合バンドルとカメラの GET/POST・sequence/edit）P2-WP-00b で実施」を、`planned_in` の reset の行（WP-02a → P2-WP-00b）の `status` を `done` にして記録。 |
| **P2-WP-00c** | 新UIの土台：`api.js`・`store.js`・`bus.js`・`state-box.js`・`legacy.js`・`features/index.js`・`legacy-globals.d.ts`・`studio/types/legacy/*.d.ts`・`tsconfig.json` の `paths`／`include`・`features.css`。`app.js` の `feature` 部品・後始末（毎回の render）・`data-act="real"`・`navigate` のクエリ。`studio/index.html` の importmap・`#keepalive`。`screens.js` の `evidence`／`shell`・`PH.P2` の文言。`tests/test_screen_status_honesty.mjs`、`tools/run_evidence_tests.mjs`、`gen_screen_matrix.mjs` の更新、`STUDIO_DESIGN_SYSTEM_JA.md` の契約の文言、`docs/roadmap/P2_PORT_STATUS.json` の新設。`*.fork.js` の規則（§1.8）。**未接続の区画の薄い表示**（OWNER-3、§1.13）。**導線点検 §5 の項目1〜5（表示の修正だけ。機能は増やさない）**：①◇ ダイアログ（`showUnimplemented`）に「今できること」の1行と移動先のボタン（旧画面で行う手順へのリンク、または P2 のどの段階で入るか）を必ず付ける（**決め方、v5 C8**：`screens.js:46` の `un(label, why, ids, phase, next?)` に任意の第5引数 `next = {text, label, act}` を足す。`next` を書くのは、**同じ画面の `tools` に既に `href:` の旧画面へのリンクがある `un()` だけ**で、`text` は「今は現行画面で行えます。」、`label`・`act` はそのリンクと同じ（押すと②の確認を通る）。それ以外は書かず、`showUnimplemented` が既定で「この機能は「{phase}」で入る予定です。今はこの画面では使えません。」と［ホームへ］（`nav:01`）を出す。`app.js` の直書きの `showUnimplemented`（458行など）も同じ既定に従う。新しい行き先・新しい機能は作らない）、②旧画面へ移るリンク（素材登録など。08・12・06・23）を押したら確認「新UIから離れます。戻るには左上の『新UI』リンクを使ってください」を出す（［移動する］［キャンセル］）、③SCR-06 の `ステージを読み込む` の予定を「P2 ④」に直す（`screens.js:238` の `un(...)` の phase を `PH.P2` に、説明を「ステージの配置は P2 ④（WP-04）で使えるようになります。大型ステージの分割読込は Phase G（LYRIC-009）です。」に、ids を `['NF-014', 'LYRIC-009']` にする）、④模擬の再生・位置スライダー・シーンツリーのある画面（02・05・06・13）の上部に「サンプル再生（3D未接続）」を常に出す（v5 C8：出す条件は「その画面の 3D ビューの区画の `status` が `real` でない」こと。WP-04・05・06 で `real` にしたら自動で消える。別の印は作らない）、⑤ホームの仮のプロジェクトのカードに「サンプル」のリボンを付け、その下に「今のサーバーの制作状態は1つです。［プロジェクト保存・復元（18）］で確認できます」の1行を出す | 00a-2 | M | Sonnet で実装 → **Opus でレビュー**（全画面の土台） | 型検査が合格。`studio-ui.test.cjs` が全件合格（見た目・動作の後戻りなし。後始末のテストを含む）。`api.js` の単体テスト（`tests/studio-p2-api.test.mjs`：`fetch` を差し替えて、状態コードと `error_code` の割当、`limitLabel` を確かめる）。honesty テストが合格。`unconnected sections are dimmed and labelled` が合格。導線点検の項目1〜5 のテスト（`tests/studio-ui.test.cjs` に `unimplemented dialog shows next action`・`leaving to legacy page asks first`・`stage load is scheduled for P2`・`mock playback is labelled as sample`・`sample project cards are marked` を足す）が合格。 |
| **P2-WP-01** | ② プロジェクト（§2.2） | 00b, 00c | M | Sonnet で実装 → **Opus でレビュー**（上書き・競合・自動保存・世代番号） | §2.2(f) の全項目、§2.2(g) の全テスト（`tests/studio-p2-project-logic.test.mjs` の偽の時計のテストを含む）が合格、マトリクスを再生成。`P2_PORT_STATUS.json` の WP-01 の `notes` に「Q1（新規作成）：所有者回答待ち。既定は ◇ のまま」を書く（3-m8。回答が来たら、その内容と日付に書き換える） |
| **P2-WP-02** | ③ 素材一覧（§2.3 の一覧・分類・詳細・キューの表示枠） | 00c | S〜M | Sonnet | §2.3(f) の 1・5、`studio-p2-import-rules`（分類の部分）と `studio-p2-assets` の一覧の3件が合格 |
| **P2-WP-03** | ③ 取り込み（§2.3 の取り込み規則・複数選択・ダイアログ・衝突の確認・送信）とホームの「最近の素材」 | 02 | M | Sonnet で実装 → **Opus でレビュー**（置き換え・上書き・再分類の確認） | §2.3(f) の 2〜4・6、取り込みのテストが全件合格 |
| **P2-WP-04** | ④ 3D 表示（§2.4 の ④-1〜④-8）と**ステージ配置の基本（④-11、OWNER-2）**、§1.15 B-4（`stage` の保存先） | 03（素材の登録が必要）、O-④-1〜3・6・7（**決定済み** 2026-10-20、Opus。§2.4(h)） | L | O-④ を Opus で決める → Sonnet で実装 → B-4 は **Opus でレビュー**（保存形式の変更） | §2.4(f)、viewport・照合のテスト、`test_project_state_bundle.py` の `stage` の追加分が合格。GPU と単位の換算（O-④-6）の未検証を台帳に記録 |
| **P2-WP-04b** | ④ リターゲット検証の移植（④-9・④-10） | 04、O-④-5（**決定済み** 2026-10-20、Opus。§2.4(h)） | M | Sonnet | 各 API の応答の表示のテスト（隔離データ、合成 GLB） |
| **P2-WP-05a** | ⑤ SCR-13［編集］モードの1体の再生：PMX＋VMD（モーフを含む）、GLB/VRM のクリップ、VMD ライブラリ、モード切替の結線、`make_test_vmd.py` の センター 30F、**S5 を有効にする**（§2.5(d)05a） | 04、04b | M | Sonnet で実装 → Sonnet でレビュー（`app.js` の `featureBottom`・`modeSwitch` は Opus でレビュー） | §2.5(f)05a、S5 が `pass` |
| **P2-WP-05b** | ⑤ `clip`・`frame` の記録（O-⑤-7）と外部同期のコマンド（O-⑤-5。`studio:sync-command`） | 05a | S〜M | Sonnet で実装 → **Opus でレビュー**（②の controller と workspace の所有） | §2.5(f)05b、S5 が `pass` のまま |
| **P2-WP-05c** | ⑤ SCR-05：82パターンの一覧・お気に入り・コンビネーションの編集（②の `history`・自動保存）・速度 | 05a（`app.js` の下部の feature）、01 | M | Sonnet で実装 → **Opus でレビュー**（`editCombination` が②の保存に書く） | §2.5(f)05c、照合テスト（`ROWS` ほか） |
| **P2-WP-05d** | ⑤ SCR-05：A/B の 3D（FBX・PMX）・連結再生・手順名の対応表（⑤-7）・スロット別の PMX＋VMD（MOTION-009） | 05c | M〜L | Sonnet | §2.5(f)05d、S5 が `pass` のまま |
| **P2-WP-05e** | ⑤ SCR-13 下部：タイムライン編集・再生と補正レイヤー（内容の比べによる競合の検知。O-⑤-4） | 05a | M〜L | Sonnet で実装 → **Opus でレビュー**（自動保存と競合） | §2.5(f)05e |
| **P2-WP-05f** | ⑤ 転写タイムライン・QA（⑤-11）、キー候補のフレーム比較（⑤-12）、足の接地（⑤-14） | 05a、04b | M | Sonnet | §2.5(f)05f |
| **P2-WP-05g** | ⑤ 2D・3D の模式再生（⑤-10・⑤-15）。**Q2 の追加で外せる**（§2.5(i)） | 05d | S〜M | Sonnet | §2.5(f)05g |
| **P2-WP-06a** | ⑥ mount 化（§2.6 の 1。`mount(root,{host})`・`MountHandle`）。**2コミット**（`camera.js`、`camera_3d.js`） | 01、00a-2 | M | Sonnet で実装 → **Opus でレビュー**（旧画面の変更） | §2.6 の 1 の完了条件（各コミットで） |
| **P2-WP-06b** | ⑥ ホスト・配置表・包含と重複IDのテスト・常駐 | 06a、04、05b（workspace の clip・frame）、O-⑥-4 の配置表 | L | **Opus で配置表を決める** → Sonnet で実装 | `studio-p2-camera` のホストの部分が合格 |
| **P2-WP-06c** | ⑥ ②の保存との統合：`camera_bundle_core.js`（共有モジュール、`camera_project_bundle_ui.js` からの抽出、`camera.html` に1行）、workspace の所有（O-⑥-5）、`dirty.camera`（O-⑥-1）、`camera.js` の `bai-camera-saved`（3-M5） | 06b | M | Sonnet で実装 → **Opus でレビュー** | 統合保存・カメラ単独の保存の後の統合保存（200）・`test_camera_bundle_core.cjs`（`vm` で読む）・`test_camera_html_wiring_recovery.py`・直したソース文字列のテストが合格 |
| **P2-WP-06d** | ⑥ Phase E §7 の読み替え表 | 06c | S（文書） | **Opus** | 読み替え表のレビュー完了 |
| **P2-WP-07** | ⑦ 書き出し（§2.7）。VMD 変換用のボーン対応表 `/api/conversion-map` の編集を含む（§2.5 から移した） | 05c | M | O-⑦ を Opus で決める → Sonnet | §2.7 の受け入れ条件（Blender の実行は未検証として記録） |
| **P2-WP-08** | IK・AI（§2.8） | 07、Q2 | M | Opus で詳しくする → Sonnet | 詳しくした版の受け入れ条件 |
| **P2-WP-99** | 締め：マトリクス・監査文書（`STUDIO_UI_AUDIT_JA.md` の件数表）・台帳・旧画面との比較（`tools/legacy_ui_inventory.mjs` を新UIにも走らせる版は作らない。手順書にテストの一覧を書く） | 08 | S | Sonnet（文書） | 未検証の一覧（§5.2）を台帳に写す |

WP-06 全体の規模は **XL**（v1 では L としていたが、旧画面の変更・テストの直し・ホスト・統合・文書の4段階に分けて見積もり直した）。

共通の完了ゲート（各 WP）：
- `npm run typecheck`、`python -m pytest -q`（全件。リポジトリ直下の `test_*.py` と `tests/` の両方）、`npm run test:node-all`（§4.3。既存の `tests/*.test.cjs`、**リポジトリ直下**の `test_camera_*.cjs`・`test_camera_*.mjs`、新しいテストを、実データのハッシュの確認で包んで実行。v5 C10）、`npm run test:studio`。
- `node tools/run_evidence_tests.mjs`（§1.13）。
- `node tools/gen_screen_matrix.mjs` の再生成の差分をコミットに含める。
- `P2_PORT_STATUS.json` の該当する WP を更新する（`state`・`commits`・`tests`・`unverified`）。
- 作業報告にモデルの区分を1行で書く（AGENTS.md）。
- **通し確認（§2.9、OWNER-1）**：`tests/studio-p2-e2e-main.test.cjs` を最初から通して実行し、`node tools/record_e2e_main.mjs` で `P2_PORT_STATUS.json` の `e2e_main` を更新する。`furthest_step` が前の値より後退していないこと。その WP で有効になる手順（§2.9(a) の表）が `pass` であること。
- **所有者確認手順（§3.1、OWNER-5）**：その WP の手順を作業報告の最後にそのまま載せる。所有者の結果（できた／止まった場所）は `P2_PORT_STATUS.json` の `owner_check` に書く。所有者の確認を待つ間も次の WP へ進んでよい（止まった場所の報告が来たら、その WP の不具合として直す）。

`docs/roadmap/P2_PORT_STATUS.json` の形（WP-00c で作る）：
```json
{
  "schema": "bai.p2_port_status.v1",
  "design": "docs/roadmap/P2_PORT_DETAILED_DESIGN_20261020_JA.md",
  "baseline_commit": "5865209",
  "precedes": "Phase E（docs/roadmap/PHASE_E_IMPLEMENTATION_STATUS.json の p2_port を参照）",
  "work_packages": [
    {"id": "P2-WP-00a-1", "step": "基盤", "state": "not_started", "commits": [], "tests": [], "unverified": [], "notes": "", "owner_check": null}
  ],
  "e2e_main": {"furthest_step": null, "steps": [], "commit": null, "checked_at": null}
}
```
`state` は `not_started`／`in_progress`／`implemented`（コードがあり、テストは一部）／`verified`（本書のテストが全件合格）。`verified` でも、GPU・実データは `unverified` に残す。`owner_check` は `null` か `{"date":"…","result":"ok|stuck","note":"止まった場所"}`。

### 3.1 所有者確認手順（OWNER-5。各 WP の完了時に、5手順以内）

所有者は UI を自分で判定しない。確かめてもらうのは「書いたとおりに操作して、書いたとおりになるか」だけ。**任意の手順で、WP の完了条件にはしない**（R11、AGENTS.md 規則7。結果を待たずに次の WP へ進む）。うまくいかなかったら、**止まった手順の番号と、画面に出た文言**だけを報告してもらう。

**前提（どの WP も同じ。v5 C2：所有者の本物の制作データを書き換えないため）**：下の手順には保存の操作が含まれる。本物の `data/` で行うと、所有者の制作状態・カメラ・素材の登録が書き換わる。そこで、`data/` を写した**試用フォルダ**で起動する。作業報告には次の手順をそのまま載せる。
1. `D:\BAI\BAI_CREATER_STUDIO\data` フォルダを丸ごと `D:\BAI\試用データ` へコピーする（2回目以降はコピーし直さなくてよい）。
2. PowerShell で `cd D:\BAI\BAI_CREATER_STUDIO` の後、`$env:BAI_DATA_DIR='D:\BAI\試用データ'; python server.py 8765` を実行する（コマンドプロンプトなら `set BAI_DATA_DIR=D:\BAI\試用データ` の後に `python server.py 8765`）。
3. ブラウザーで `http://127.0.0.1:8765/workspace/01` を開く。終わったらサーバーを止める（本物の `data/` は変わっていない）。
- `BAI_DATA_DIR` は WP-00a-1 で入る。**WP-00a-1 より前の手順は作らない**（00a-1・00a-2・00b の確認は 00b の完了後にまとめて出す）。書き出し（WP-07）の `exports/` は試用フォルダの外なので、07 の手順は「変換を押す」までにし、実行の確認（Blender）は求めない。

| WP | これを試してください |
|---|---|
| 00a-1・00a-2・00b | ①旧制作画面（`/`）でコンビネーションに1つ足す。②旧画面を再読込して、足したものが残っている。③旧 `camera.html` で［保存］を押し、「保存しました」と出る。（00b の修正で旧画面が今までどおり動くことの確認。新UIの変化は無い） |
| 00c | ①左のメニューで「シーン・ステージ」を開く。②まだ使えない区画が薄く表示され、「未接続（まだ使えません）」と書かれている。③薄い区画のボタンを押すと、「今できること」と移動先のボタンがある説明が出る。④「素材を取り込む」を押すと、「新UIから離れます」の確認が出る。⑤ホームの仮のカードに「サンプル」の印がある。 |
| 01 | ①「プロジェクト保存・復元（18）」を開き、今のプロジェクトの名前とカメラの件数が出る。②旧制作画面でコンビネーションに1つ足す。③新UIに戻ると、数秒で件数が変わる。④新UIで［保存］を押し、「保存しました」と出る。⑤ブラウザーを閉じて開き直しても、同じ内容が出る。 |
| 02 | ①「素材管理（08）」を開く。②旧画面で登録した素材が一覧に出る。③検索欄に素材の名前の一部を入れると絞り込まれる。④素材を1つ選ぶと、右に形式と大きさが出る。 |
| 03 | ①08 の「素材を取り込む」で、手元の GLB か VRM を1つ選ぶ。②形式が自動で表示され、［取り込む］を押す。③一覧に増える。④サーバーを再起動して 08 を開いても残っている。 |
| 04 | ①「キャラクター管理（12）」で取り込んだモデルを選ぶ。②中央にモデルが表示され、マウスで回せる。③［このモデルを制作に使う］を押し、［保存］する。④「シーン・ステージ（06）」でステージにするモデルを選び、位置・回転・大きさのスライダーを動かすと、表示が変わる。⑤［保存］して再読込しても、同じ位置にある。 |
| 04b | ①「モーションVMD編集（13）」の右の「リターゲット」タブを開く。②素材を選び、［ボーン対応の提案］を押す。③表が出る（エラーが出ない）。 |
| 05a | ①「モーションVMD編集（13）」で上の［編集］を押す。②対象モデルに PMX を選び、左の VMD を1つ押す。③［▶ 再生］でモデルが動き、VMD に表情が入っていれば口や表情も動く。④［停止］で止まり、位置がそのまま残る。 |
| 05b | ①13［編集］で GLB/VRM のモデル（制作に使うもの）を選び、クリップを再生して止める。②［この再生位置を制作に記録］を押し、［保存］する。③「カメラ（02）」を開くと、同じクリップの同じ位置になっている（WP-06 の後）。 |
| 05c | ①「モーション選択（05）」の左で、👑 の付いたパターンを1つ押し、［＋ コンビネーションに追加］を押す。②下のタイムラインに増える。③旧制作画面（`/`）を再読込すると、同じものが入っている。 |
| 05d | ①05 で中央に3Dのモデルが2体出る。②［▶ 連結再生］でモデルAがコンビネーションの順に動く。③［■ 停止］で止まる。 |
| 05e | ①13［編集］の下のタイムラインで［＋ クリップ追加］を押し、長さを変える。②1秒待ってから再読込しても長さが残っている。③［▶ タイムライン再生］で FBX のモデルが動く。 |
| 05f | ①13 の右「ボーンマップ」の一番下の「転写タイムライン・QA・JSON保存（試験）」を開く。②同意にチェックして［解析・品質診断］を押す。③結果か、エラーの文言が出る（画面が止まらない）。 |
| 05g | ①05 でパターンを1つ押す。②2D の図とダミー人形が動く。 |
| 06a | ①旧 `camera.html` を開く。②キーを1つ足し、［保存］する。③再読込してもキーが残っている。（旧画面が今までどおり動くことの確認） |
| 06b・06c | ①「カメラ（02）」を開く。②キーを2つ足す。③他の画面へ移ってから 02 に戻っても、キーが残っている。④［保存］して再読込しても残っている。⑤旧 `camera.html` を開くと、同じキーが見える。 |
| 06d | 文書だけなので、所有者の確認は無い。 |
| 07 | ①「外部連携（23）」の「エクスポート」で、コンビネーションの VMD 変換を押す。②「実行中（経過 N 秒）」か、Blender が無い旨の文言が出る（どちらでも正しい）。 |
| 08 | WP-08 を詳しくするときに決める。 |
| 99 | ①ホームから「制作の流れ」の順に画面を開き、薄い区画の数が P2 の前より減っている。②作業報告の「今どこまで通しで動くか」（§2.9 の `furthest_step`）を読む。 |

---

## 4. テストの土台

### 4.1 共通ハーネス `tests/helpers/studio-harness.cjs`（WP-00a-2）

```js
// 返り値: { base, dataDir, stop(), launchBrowser(), newPage(browser, { expectErrors }) }
async function startServer({ port, seed = {} }) {}
// page に許可するエラーを登録する（正規表現の配列）。テストの最後に、許可されていないエラーが0件であることを確かめる
function expectErrors(page, patterns) {}
```
- **データの隔離**：`fs.mkdtempSync(os.tmpdir() + '/bai-p2-')` を作り、`integrated_v02/catalog.json` に `{"models":[],"motions":[]}` を置き、`seed`（相対パス→内容の辞書。バイナリは Buffer）を書く。`python server.py <port>` を `env: { ...process.env, BAI_DATA_DIR: dataDir }` で起動し、`/api/server-version` が 200 になるまで待つ（最大12秒）。Python は `process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')`（`legacy-ui-layout.test.cjs:14` と同じ）。
- **終了の順番**：`test.after` では、**ブラウザーを閉じてから** `stop()` を呼ぶ（逆だと、閉じる途中の通信がエラーとして残る）。`stop()` はサーバーを止めて一時ディレクトリを消す（環境変数 `KEEP_TEST_DATA=1` なら残してパスを表示する）。
- **隔離の外へ書く API**（v5 C1）：`POST /api/export-vmd-job`・`POST /api/run-vmd-conversion` は `BASE/exports/` に書く。どのテストもこの2つをサーバーへ送らない（§2.7 のテストの決まり）。ハーネスは `newPage` の中で、この2つの URL への要求がテストの `route` で処理されずにサーバーへ届いたら失敗にする（`context.route` の最後の受け手として `route.abort()` し、失敗の一覧に入れる）。
- **前提**：`bai_paths.py`（Phase E §2.9）が、`server.py` の `DATA`・`RETARGET_FILE`・`AI_CONFIG`、`diagnostic_logging.py` の `LOG_DIR`、`qa_capture.py` の `ROOT` を `data_dir()` から作ること。これが無いとアップロードが実 `data/` に書かれてしまうので、**書き込みのテストは WP-00a-1 の完了まで作らない**。
- **実データの保護**（`tests/run-guarded.cjs`）：リポジトリの `data/` 全体（`logs/` を含む）と `exports/` の、相対パス＋内容の sha256 を**1回だけ**計算する（`data/`・`exports/` が無いときは「無い」ことを記録し、終わった後も無いことを確かめる）。引数のグロブ（`tests/studio-p2-*.test.cjs` など）は**自分で展開する**（Windows の cmd はグロブを展開しないため。一致が0件ならエラー）。開始前に `127.0.0.1:8765`（`npm start` の開発用サーバー）に接続できたら、「開発用サーバーが動いています。実データに書き込むとハッシュの確認が失敗します」と警告する（止めはしない）。そのうえで `node --test --test-concurrency=2`（展開したファイル）を子プロセスとして実行し、終わった後にもう一度計算して比べる。違えば、変わったパスの一覧を出して失敗にする。テストのファイルごとの before/after では比べない（並行で動く他のテストのログ書き込みと競合するため）。pytest 側は `tests/test_data_isolation.py`（Phase E §2.9）が同じことをする。
- **three**：`node_modules/three`（devDependency の `three@0.160.1`。`npm ci` で入る）を使う。環境変数 `THREE_DIR` で上書きできる（`tools/legacy_ui_inventory.mjs:11` と同じ）。`context.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.1\/(.*)/, …)` でローカルのファイルを返す（`tools/legacy_ui_inventory.mjs:19〜25` の方式を写す）。three が無いとき、3D を使うテストは `skip`（理由「three.js がローカルにありません（npm ci）」）にして、未検証として記録する。
- **Chromium**：`executablePath = process.env.CHROMIUM_PATH || process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? そのパス : undefined)`（`legacy-ui-layout.test.cjs:15` は `CHROMIUM`、Phase E §2.9 は `CHROMIUM_PATH` なので両方を読む）。`args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']`（`tools/legacy_ui_inventory.mjs:83` と同じ）。3D のテストは `WEBGL_debug_renderer_info` の文字列を結果に出し、SwiftShader／llvmpipe なら「GPU 未検証」とする。
- **ポート**（ファイルごとに別のサーバー。環境変数で上書きできる）：

| テスト | 既定のポート | 環境変数 |
|---|---|---|
| `studio-ui`（既存） | 8799 | `STUDIO_TEST_PORT` |
| `legacy-ui-layout`（既存） | 8798 | `LEGACY_UI_TEST_PORT` |
| `studio-p2-project` | 8797 | `P2_PROJECT_PORT` |
| `studio-p2-assets` | 8796 | `P2_ASSETS_PORT` |
| `studio-p2-viewport` | 8795 | `P2_VIEWPORT_PORT` |
| `studio-p2-normalize-parity` | 8789 | `P2_PARITY_PORT` |
| `studio-p2-camera-ids`（ホストの DOM を列挙する部分） | 8788 | `P2_CAMERA_IDS_PORT` |
| `studio-p2-camera` | 8794 | `P2_CAMERA_PORT` |
| `studio-p2-motion`（WP-05a・b・e・f） | 8793 | `P2_MOTION_PORT` |
| `studio-p2-chain`（WP-05c・d・g。§2.5 で追加） | 8784 | `P2_CHAIN_PORT` |
| `studio-p2-export` | 8792 | `P2_EXPORT_PORT` |
| Phase E `camera-ui`（Phase E WP-03） | **8791**（Phase E §2.9 の既定 8798 を変更。Phase E §2.9 に注記した） | `CAMERA_UI_TEST_PORT` |
| `legacy-project-save`（旧画面のバグ修正のテストは、この1ファイルにまとめる。3-m2） | 8790 | `P2_LEGACY_PORT` |
| `studio-p2-e2e-main`（§2.9） | 8787 | `P2_E2E_PORT` |
| WP-06a の前後比較（手で実行。前の版） | 8786 | `P2_BEFORE_PORT` |

- **実装との食い違い（§2.5 の詳細化で確認、`8de3801`。§2.5 批評 5-10）**：`studio-p2-normalize-parity` は実装の既定が **8794**（表は 8789。8794 は `studio-p2-camera` の予約）、`studio-p2-retarget`（WP-04b）は実装の既定が **8791**（表に無い。8791 は Phase E `camera-ui` の予約）、`studio-harness.test.cjs` は **8785**（表に無い）。同時に走らせると衝突するので、`studio-p2-camera`（WP-06b）と Phase E `camera-ui`（Phase E WP-03）を作る前に、実装側を表の値（parity 8789、retarget は空いている番号）に直す。WP-05 の新しいテストは 8793・8784 を使い、衝突しない。

- **エラーの監視**：`pageerror` とコンソールの `error` を集め、各テストの最後に、`expectErrors` で許可したもの以外が0件であることを確かめる（既存の `studio-ui.test.cjs:36〜37` と同じ考え方）。意図して 404/400/409/422 を起こすテストは、その URL と文言の正規表現を許可する。

### 4.2 テスト用ファイル（`tests/fixtures/`。生成スクリプトで作り、コミットする。元の素材ではない）

| ファイル | 生成 | 中身 |
|---|---|---|
| `synthetic_test_model.glb` ＋ `.expected.json` | `tools/make_test_glb.py`（標準ライブラリだけ） | Phase E §2.9 の合成モデル（直方体・ボーン10本・アニメ30F）。 |
| `minimal.vmd` | `tools/make_test_vmd.py` | `Vocaloid Motion Data 0002` のヘッダー＋モデル名20バイト＋ボーンキー**2件**（`センター` の 0F で位置 (0,0,0)、**30F で位置 (0,1,0)**。回転は単位。WP-05a で足す：§2.5 批評 5-4）＋モーフのキー2件（`あ` の 0F で 0、30F で 1。OWNER-4）＋他の件数は0。`tests/test_make_test_vmd.py` でバイト一致を確かめる。 |
| `minimal_pmx.zip` | `tools/make_test_pmx_zip.py` | `model/test.pmx`（O-④-2 の最小 PMX 2.0。`tools/make_test_pmx.py` の `build_pmx()`。③の登録と④⑤の表示・モーフのテストに使う）＋ `model/tex/a.png`（1×1）。 |
| `bad.fbx` | テストの中で生成 | ランダムな256バイト。 |
| 壊れたカメラ | テストの中で生成 | `{"broken":`（B-3）。 |

### 4.3 実行コマンド（`package.json` に足す）

```
"test:p2": "node tests/run-guarded.cjs \"tests/studio-p2-*.test.cjs\" \"tests/studio-p2-*.test.mjs\" tests/legacy-project-save.test.cjs tests/test_screen_status_honesty.mjs tests/test_camera_bundle_core.cjs",
"test:p2-py": "python -m pytest -q tests/test_project_envelope.py tests/test_bundle_camera_invalid.py tests/test_data_isolation.py",
"test:p2-e2e": "node tests/run-guarded.cjs tests/studio-p2-e2e-main.test.cjs && node tools/record_e2e_main.mjs",
"test:node-all": "node tests/run-guarded.cjs \"tests/*.test.cjs\" \"tests/*.test.mjs\" \"test_camera_*.cjs\" \"test_camera_*.mjs\" tests/test_screen_status_honesty.mjs tests/test_camera_bundle_core.cjs"
```
- `test:node-all`（v5 C10）は WP-00a-2 で足す。その時点でまだ無いファイル（`test_screen_status_honesty.mjs` は WP-00c、`test_camera_bundle_core.cjs` は WP-06c）は、作る WP で足す（無いファイルを名指しすると `run-guarded.cjs` がエラーにするので、先に書かない）。グロブはどれも `run-guarded.cjs` が展開する。直下の `test_camera_*.cjs/mjs` は今ある13件（`ls test_camera_*.cjs test_camera_*.mjs`）。
`npm run test:studio` は今のまま（ハーネスへ移した後も同じ名前）。`tests/studio-p2-project-logic.test.mjs` は `tests/studio-p2-*.test.mjs` のグロブに含まれる。`studio-p2-e2e-main` も `test:p2` のグロブに含まれるが、台帳への記録は `test:p2-e2e` で行う。

---

## 5. リスク・未検証・所有者への確認

### 5.1 リスク

| # | リスク | 対策 |
|---|---|---|
| K1 | データの隔離が漏れて、テストが実 `data/` を書き換える | WP-00a-1 を Opus でレビューする。`run-guarded.cjs` と `test_data_isolation.py` で全体の前後を比べる。書き込みのテストは WP-00a-1 の完了後に作る。 |
| K2 | 新UIと旧画面を同時に開き、両方で保存する | 統合バンドルとコンビネーションの If-Match（409）で検知する。B-1・B-2 の修正後は、旧画面も If-Match 付きで保存し、外部の変更を取り込んだ後も保存できる。旧画面の外部同期は確認なしで上書きする（`index.html:376`）が、これは既存の動作なので P2 では変えない（変えると旧画面への新機能になる）。新UIのヘルプ（SCR-25 FAQ）に「新旧の画面で同時に編集しないでください」と1行足す。 |
| K3 | three.js を CDN から読むので、インターネットが無いと 3D が動かない | 旧画面と同じ制約。状態の表示で理由を出す。ローカルからの配信は本書の範囲外（未承認）。 |
| K4 | ⑥の常駐の方式で、非表示の間にキャンバスの大きさが0になり、描画がおかしくなる | 戻ったときに `resize` を送る。⑥のテストで往復を確かめる。 |
| K5 | フォークした部分（`*.fork.js` の3つ）が旧コードとずれる | 先頭のコメントに元の行と基準コミットを書く。照合テストで一致を保つ。フォークは計算・データだけに限る。 |
| K6 | GLB/VRM の衝突の確認で、大きいファイルのハッシュを計算すると、メモリと時間がかかる | ファイル全体の `ArrayBuffer` を読むのは送信でも同じなので、増えるのは計算の時間だけ。行の状態を「確認中」にする。400MB を超えるファイルは事前に拒否する。 |
| K7 | 素材の「上書き」系の API は、確認なしで上書き・削除・再分類する | 新UIで事前に確認する（§2.3）。サーバーは変えない（R1）。 |
| K8 | 共有した `camera.js`・`camera_3d.js` に Phase E が足す UI のコードが、`camera.html` で例外を出したり、新機能を見せたりする | 新機能は `host==='studio'` のときだけ有効にし、要素が無い場合も必ず守る（§2.6）。Phase E の各 WP の完了ゲートに「旧 `camera.html` で pageerror 0件」を足す（Phase E §7 に注記）。 |
| K9 | 自動保存（450ms）と統合保存、外部の同期が重なる | 保存は同時に1つ（`saving`）。自動保存の待ちは統合保存に含める。外部の変更を検知したら自動保存の待ちを止める。世代番号 `saveSeq` を await のたびに確かめ、自動保存は `tick()` の終わりを待つ（3-M3）。§2.2(g) の競合のテストと偽の時計のテストで確かめる。 |
| K10 | ［初期状態から始める…］（カメラ保存データの初期化、3-M2）で、壊れたファイルの中のカメラの状態が新UIから見えなくなる | 初期化の前に必ず確認ダイアログを出し、今のファイルは（正常でも）退避コピーとして残す（消さない。読めない・退避に失敗したら初期化しない：§1.15 B-3 の 2b の判定の順番、v5 C3）。422 の文言に退避名と手で直す手順を入れる。退避ファイルのダウンロードと中身の確認は Phase E WP-02a。 |
| K11 | ステージの保存（`workspace.stage`、§1.15 B-4）を知らない旧 `camera.html` の統合保存が、ステージ配置を消す | サーバーは、本文に `stage` のキーが無ければ既存の値を残す（B-4）。§2.4(g) の `stage is kept when legacy camera bundle save omits it` で確かめる。 |
| K12 | タイムライン・補正レイヤーの自動保存（WP-05e）は、保存の直前に GET して内容を比べるが、GET と POST の間に旧画面・MCP が書くと、その変更を上書きする（`/api/timeline-editor`・`/api/motion-layers` に If-Match が無い。O-⑤-4） | 隙は数十ミリ秒で、旧画面（確かめずに上書き）より狭い。サーバーに If-Match を足すのは API の変更（R1 の外）なので P2 では行わない。お気に入り・手順名の対応表（全体の置き換え）も同じ方式（直前の GET）で、同じ隙が残る。 |

### 5.2 未検証事項（実装後もこのままなら台帳の `unverified` に書く）

- 実際の GPU での描画（SwiftShader だけで確かめる）。
- 実際のモデル・モーション（VRM・PMX・FBX・VMD の実ファイル）。合成ファイルでしか確かめない。正しい最小の FBX を作る手段が決まっていない（O-③-1）ので、FBX の正常な登録と 3D 表示は未検証になる見込み。
- Blender による VMD の変換（⑦）。
- Windows での動作（開発環境は Linux）。
- 外部の AI・MCP クライアントからの同時操作（②の外部同期は HTTP で模擬するだけ）。
- 1180px・820px・390px 以外の画面幅。
- 旧制作画面の新しい配置（`5865209`）と新UIを同時に開いたときの動作（K2 の範囲で、テストは保存の往復だけ）。
- VMD の表情・口パクのモーフの再生（⑤-2）。最小 PMX（O-④-2、作成済み）で自動テストはできるが、実在の PMX のモーフは未検証。
- ステージの単位の換算（O-④-6）。

### 5.3 判断として決めたこと（確認は不要。異論があれば指摘してください）

- 素材一覧の並び替え・グリッド/リスト・大きさは、モックで既に動いている**表示だけの機能**として実データに使う（データは変えない）。
- コンビネーションの編集は、旧画面と同じく **450ms 後に自動保存する**。カメラ・作業中の素材参照を含む統合保存は［保存］で行う（1-m11）。タイムラインの 550ms の自動保存は⑤で移植する。
- 外部の変更は、未保存の変更を上書きしない（旧画面より安全側）。
- 「最近の素材」には、このページで取り込んだものだけを出す（API に登録日時が無いので）。
- 取り込みは複数のファイルを選べる。一括のタグ付け・変換は作らない（NF-004）。
- workspace は1つの所有者の規則に従ってマージする（§2.2(d)-9）。
- 再生位置（`frame`）だけの変化では未保存にしない（3-M6）。
- 同期の失敗では画面を止めず、`syncError` に出すだけにする（3-M4）。
- ⑤（§2.5 の詳細化で決めたこと）：
  - SCR-13 の1体の再生は、GLB/VRM のクリップと同じ位置の操作（シーク）を PMX＋VMD にも付ける（旧画面の VMD には位置の操作が無い。新しい計算は無く、同じ部品を使うだけ。批評 5-11）。
  - SCR-05 の 👑（実FBX がある）の判定は名前だけで行い、旧画面のように起動時に全 FBX を解析しない。アニメーションの無いファイルは再生のときに旧と同じ文言で知らせる。
  - お気に入り（`/api/favorites`）と手順名の対応表（`/api/mapping`）は、本文は旧と同じ全体の置き換えのまま、保存の直前に GET し直して最新に自分の変更を重ねる（外部が足したものを消さない。批評 5-12、K12）。
  - 旧画面の外部コマンド `preview_motion` は存在しない関数 `selectRow` を呼んでいて動かない（`index.html:442`）。新UIは「その行を選ぶ」として実装する。旧画面のこの不具合は WP-05 では直さない（直すなら §1.15 のバグ修正として足し、別のコミットにする）。
  - SCR-05 で［▶ 連結再生］を押すと、スロット A に PMX を表示していても FBX のモデルに戻す（旧 `chain-play` と同じ）。
  - `clip`・`frame` は明示の操作［この再生位置を制作に記録］のときだけ書く（O-⑤-7）。

### 5.4 所有者への確認（既定のまま進める）

- **【最初に確認してほしいこと】Q1 新規プロジェクトの作成**：今のサーバーは制作状態を1つだけ持ち（`data/project_state.json` と `data/camera_project.json`）、旧画面にも「新規作成」は無い。新規作成を「今の制作状態を空に戻す」として作ると、取り消しのできない上書きになる（バックアップの機能が無い）。**既定：P2 では新規作成を ◇ 未実装のまま残し、保存・読込・履歴だけを移植する。** 「空に戻す（確認の入力つき）」を P2 に入れる場合は指示してください（WP-01 への小さな追加で入ります）。
- **Q2 旧画面の機能の中に、削除してよいものはあるか**：v2 では、旧画面の機能はすべて移植する予定にした（④-9・④-10、⑤-10〜⑤-14、⑧-1・⑧-2）。この中に、新UIへ移さずに旧画面のリンクだけで残してよいもの（または不要なもの）があれば指示してください。**既定：すべて残して移植する。**
- **Q3 ⑥の後の旧 `camera.html`**：§2.6(h) のとおり。**既定：編集できるまま残し、案内を1行出す（案内は承認の後）。**
- **Q4 主要シナリオのうち、既存のコードが無いもの**（§2.9(e)）：「BGM（歌の音声）の配置」と「音声付きの 1080p 動画の書き出し」は、旧画面にも API にもコードが無い。P2 は既存機能の移植なので入れられない。**既定：通し確認では「既存機能なし」と記録するだけにし、BGM は未承認（LYRIC-006）、動画の書き出しは Phase F（RENDER-001・006）のまま。** 前倒しする場合は、計画への追加として指示してください。
- **Q5 キャラクター形式の配置（Owner回答済み、2026-10-21）**：後続のOwner直接指定により、キャラクターを配置できる各機能で GLB・VRM・PMX・FBX を扱う。旧既定の「PMXはP2では入れない」を解除する。保存形式、画面ごとの範囲、互換性、検証は `CHARACTER_PLACEMENT_ALL_FORMATS_20261021_JA.md` と Issue #50 を正本として追加する。スキニング・weightsは操作しない。
- **Q6 SCR-05（初期構想「モーション選択」）の使い方**（§2.5(i)、2026-10-20 追加）：**既定：SCR-05 を FBX の82パターン・お気に入り・コンビネーション・A/B の 3D の画面として使う**（モックのパネルの注記どおり。新しいタブは作らない：O-⑤-3）。導線点検の項目8（初期構想の画面をメニューの初期表示から外す）が承認されても SCR-05 は消さず、SCR-13 から［コンビネーション（05）へ］のリンクで開けるようにする。
- **Q2 の追加（⑤-10・⑤-15）**（§2.5(i)）：2D の模式再生とダミー人形の 3D 模式再生は格闘の82パターン向けで、歌ってみたの主シナリオでは使わない。**既定：移植する**（WP-05g を⑤の最後に置く）。旧画面のリンクだけで残してよければ指示してください（05g を外すだけで他に影響しない）。
- **O-⑤-8 VRM・GLB への VMD の適用**（§2.5(h)）：**既定：P2 では入れない**（旧画面の VMD 再生は PMX だけ。承認済みの計画にも無い）。押すと ◇（phase `PH.P4`、未承認）の説明を出す。使いたい場合は計画への追加として指示してください。
- **導線点検（`docs/ui/NEW_UI_FLOW_AUDIT_20261020_JA.md` §5）の項目6〜14【要所有者OK】**：表示の修正だが、画面の構成・メニュー・文言を変えるので、所有者の承認があるまで入れない（項目1〜5 は WP-00c に入れた）。
  - 6：共通の上部バーに「保存・復元」の入口と未保存の表示の枠を置く（実際の保存は WP-01）。
  - 7：左のメニューを作業の流れの順に並べ替え、使う頻度の低いグループを折りたたむ。
  - 8：重複する画面（04/16、05/13、07/17）のうち初期構想の画面を「統合先へ」と明示し、メニューの初期表示から外す（画面は消さない）。
  - 9：ヘルプ（25）のウェルカムを「制作の流れ（①〜⑦）」の表にし、文言を利用者向けにする。
  - 10：右パネル「実装状態」を既定で閉じる（開発者表示に隠す）。
  - 11：ホームの同じ機能のボタン（新規作成が4〜6個）を2か所に整理する。
  - 12：1280px の幅でホームの文が重なる・02 の右タブが見切れるのを直す。
  - 13：18 の内部値（schema・revision）を要約して表示し、詳細は折りたたむ（WP-01 の実データの表示と一緒に）。
  - 14：取り込みキューの「表示例」を、実際の取り込み（WP-03）まで「例」と明記するか隠す。

---

## 付録A 本書で使う既存 API の一覧（P2 で新UIから呼ぶもの）

| API | メソッド | 使うステップ | 根拠（server.py） |
|---|---|---|---|
| `/api/project/bundle` | GET / POST（If-Match 必須。B-3 の後はカメラが壊れていれば 422） | ②⑥ | 168〜173 / 359〜376 |
| `/api/project` | GET（`?envelope=1`。B-1）/ POST（If-Match。自動保存） | ② | 316〜325 / 895〜917 |
| `/api/sync` | GET | ② | 310〜311 |
| `/api/assets` | GET | ③④⑤ | 289〜290 |
| `/api/server-version` | GET | ③ | 241〜242 |
| `/api/integrated-v02/upload` | POST | ③ | 762〜778 |
| `/api/pmx-zip-upload` | POST | ③ | 779〜829 |
| `/api/mmd-upload` | POST（slot=vmd のみ） | ③ | 830〜845 |
| `/api/upload` | POST | ③ | 956〜973 |
| `/api/integrated-v02/asset/<file>` | GET | ④⑤ | 335〜348 |
| `/api/mmd-file/<slot>/<name>` | GET | ④⑤ | 293〜307 |
| `/api/file/<id>` | GET | ④⑤ | 350〜355 |
| `/api/retarget/*`（§2.4 ④-9 の16本と `review-bundle`・`keyframe-review`） | GET/POST | ④⑤ | 各ハンドラー（WP-04b で記録。`review-bundle`・`keyframe-review` は `8de3801` の 561〜571・550〜560：§2.5(c)） |
| `/api/motion-layers`、`/api/qa/*` | 各種 | ⑤ | 同上 |
| `/api/favorites` | GET / POST | ⑤ | 326〜329 / 941〜950 |
| `/api/timeline-editor` | GET / POST | ⑤ | 287〜288 / 668〜686 |
| `/api/mapping`、`/api/manifest`、`/api/conversion-map` | POST / GET / GET・POST | ⑤⑦ | 951〜955 / 349 / 312〜315・863〜872 |
| `/api/camera/*` | 各種 | ⑥ | 174〜200, 377〜438 |
| `/api/export-vmd-job`、`/api/run-vmd-conversion`、`/api/conversion-status` | POST / POST / GET | ⑦ | 873〜894 / 723〜761 / 308〜309 |
| `/api/diagnostics/export` | GET | ⑦（既存のリンク） | 216〜218 |
| `/api/pose/*`、`/api/ai/*` | 各種 | ⑦の後 | 同上（WP-08 で記録） |

## 付録B 旧画面のファイルの変更（R5 の確認用）

| ファイル | P2 で変えるか | WP | 内容 |
|---|---|---|---|
| `server.py` | 変える（バグ修正、承認済みの前倒し） | 00b、06c | B-1 の重複分岐の削除と try。B-3 の `bad(code)`・`send_camera_invalid`、統合バンドルとカメラの GET/POST・sequence/edit の 422（00b）。`POST /api/camera/project/reset`（Phase E §2.7 の仕様どおりの前倒し、2b、00b）。配信許可リストに `camera_bundle_core.js`（06c） |
| `bai_camera.py`、`project_state_bundle.py` | 変える（バグ修正、Phase E §2.7 の一部の前倒し、OWNER-2） | 00b、04 | B-3（`read_project`・`CameraProjectInvalid`・reset）。`project_state_bundle.py` の `validate_workspace`・`save_bundle` に任意のキー `stage`（B-4、04） |
| `index.html` | 変える（バグ修正の1文） | 00b | B-2 |
| `camera.js` | 変える（バグ修正の1か所、動作を変えない mount 化、無害な通知イベント） | 00b、06a、06c | 226行の読込エラーの文言（B-3）、§2.6 の 1、保存成功の後の `bai-camera-saved` の発火1文（3-M5。旧画面では誰も受けない） |
| `camera_3d.js` | 変える（動作を変えない mount 化） | 06a | §2.6 の 1 |
| `camera_project_bundle_ui.js`、`camera.html` | 変える（動作を変えない共有モジュールへの抽出、`<script>` 1行） | 06c | §2.6 の 3 |
| `camera_bundle_core.js` | 新規（共有、DOM なし） | 06c | §2.6 の 3 |
| `camera.css`、`webmcp.js`、旧画面専用の `*_ui.js`・`v016*.js`、`motion_layers.js` | 変えない | — | — |
| 共有の UMD（`camera_rig.js` など） | P2 では変えない（Phase E で変わる） | — | — |
