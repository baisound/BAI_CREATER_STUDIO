# 旧保存→v0.5取込の実データ確認（WP-L9、2026-11-04）

対象: `DATA-008`、Issue #63/#69、[設計書](../roadmap/LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md)の WP-L9。画面の呼び方は、①が `/` と `camera.html`、②が `/workspace/NN`、③が v0.5（`/studio/v05`）。

所有者のPCで、開発側が1つのコマンドを実行して確かめた。所有者に動作確認は頼んでいない。実データでの確認は通ったが、見た目の大きさ（WP-L8a）とカメラの動き（WP-L8b）が残るため、`DATA-008` は完了扱いにしない。

## 実行したコマンド

```
set CHROMIUM_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
python tools/legacy_import_real_check.py --data "D:\BAI\BAI_CREATER_STUDIO\BAI_Creator_Studio\data" --out "D:\BAI\BAI_CREATER_STUDIO\_Claude確認画像\20261104-legacy-import"
```

設計書の例にある `D:\BAI\BAI_CREATER_STUDIO\data` は、このPCには無い。所有者の data は `BAI_Creator_Studio\data` にある。

台本（`tools/legacy_import_real_check.py`）の流れは次のとおり。

1. 元のSHA-256を取る。対象は、旧の3ファイル、`music_dance_project.json`、`timeline_editor.json`、`manifest.json`、`mmd_assets.json`、`integrated_v02/` の索引、`library_assets/index.json`、それに参照している素材の原本です。そのうえで、一時フォルダへ読み取りだけで複製する。
2. 複製を `BAI_DATA_DIR` にして、`server.py` を空いているポートで起動する。
3. 作品を作り、スナップショットを保存し、確認する（曲とダンス・旧タイムライン編集の両方を含める）。
4. 適用は、③の作品カードの［旧保存を取り込む…］から取込ダイアログで行う（`tools/legacy_import_real_check_ui.cjs`、実GPUのChrome）。
5. 記録を読み込み、R2・R4（試験専用の逆変換）を判定する。
6. 再生位置を3回動かしてから取り消し、R3を判定する。
7. 元のhashを取り直してR1を判定し、`report_JA.md` と `report.json` を書く。

Chromeか Node.js が無いときは、HTTPで適用し、画像は未検証と書く。

## 結果

| 判定 | 結果 | 内容 |
|---|---|---|
| R1 元を壊さない | 合格 | 元の160ファイル（117.3 MiB）のSHA-256が前後で一致した。一時領域の旧保存とスナップショットも、適用・取消の前後で不変。別に記録している13ファイル（このPCでの作業全体を通した原本）も一致 |
| R2 往復一致 | 合格 | 取込の直後に逆変換すると、元の bundle と深く等しい。`changed`・`unrepresentable` は空 |
| R3 取消 | 合格 | 取消のあと、インスタンス・顔キー・カメラ・クリップが取込前と同じ。scene・arrangement の revision は増えた。作品FPSは取込前と同じ。再生位置は動かしたまま |
| R4 編集後の逆変換 | 合格 | ステージを (1.25, 0, −0.5) へ動かすと、逆変換の `workspace.stage.position` が同じ値になる。`changed` は `/workspace/stage/position` だけ、`unrepresentable` は空 |

同じコマンドを、画像の撮り方を直しながら4回実行した。4回ともR1〜R4は合格した。

### 所有者の旧保存の中身と、写った結果

- 旧保存の名前は「無題のプロジェクト」。キャラクターは無く（`workspace.asset` が空）、ステージはS01「灰色の境界スタジオ」で、位置0・回転0・大きさ1。
- 写したのは12件、保管が14件、注意が9件だった。
  - 写したもの：作品FPS（30）、再生位置、ステージ、ダンスのモデル（実PMX）、曲「LAST CHASE」（開始0秒、長さ274.36秒）、旧タイムライン編集のFBX動作7件。
  - FBX動作7件は、0・3・6・9・12・15・18秒に、長さ3秒で置かれた。元は30fpsの90フレーム刻みで、`秒 = フレーム ÷ 30` に一致する。
- 保管したもの：照明、カメラの動き（キー2件）、カメラの各種設定、動作の並び（7件、開始時刻なし）、編集履歴など、曲とダンスの画面のダンス、SCR-10の再生位置とFPS、旧タイムライン編集の更新日時。
- **ダンスは写らなかった。** 曲とダンスの画面のダンスはGLB動作（`Dance of October 9 #1_motion.glb`）だった。設計 §3.2 のS3は「VMDのときだけ長さを読む。FBX・GLB動作は `DURATION_UNKNOWN` で保管」と決めているので、設計どおりの結果です。ただし、所有者の実データでは、曲とダンスのうち曲しか写らない。GLB動作の長さを読んで置くには、S3の設計を変える必要がある（下の「設計の判断が必要なこと」）。
- 注意9件の内訳：つなぎの値を使わない（`BLEND_DROPPED`）7件、見た目の単位が違う（`UNIT_SEMANTICS_DIFFER`）1件、原点に置いた（`PLACED_AT_ORIGIN`）1件。

## 画面と画像（開発側が目視で判定）

画像は `D:\BAI\BAI_CREATER_STUDIO\_Claude確認画像\20261104-legacy-import\` にある。描画器は `ANGLE (NVIDIA GeForce RTX 4070 SUPER Direct3D11, D3D11)`。

| 画像 | 判定 |
|---|---|
| `01_dialog_preview.png`（1280×720） | 取込元の行に、旧保存の名前・スナップショットの日時・「キャラクター：なし」・ステージ名が出る。「写るもの」「写らないもの（取込記録に残ります）」の2行、追加の取込の2つのチェック（最終更新の日時と7件の件数）、注釈が、画面の中に収まる。設計 §7.2 どおり |
| `02_dialog_details_with_options.png` | 2つのチェックを入れて詳細を開いた状態。内部名は出ない |
| `03_dialog_applied.png` | 結果の行は「取り込みました：写したもの12件、写さなかったもの14件、注意9件」。主ボタンは［取込を取消］ |
| `04_timeline.png` | 曲「LAST CHASE」が0秒から音声の行に、FBX動作7件が0〜18秒に3秒ずつ並ぶ。画面のクリップ数8は、APIと一致する。タイムラインの欄は高さが固定（275px）なので、撮影の間だけ隔離ブラウザーの表示で欄を広げた（データは変えていない） |
| `05_scene_3d.png`・`06_scene_3d_focus_character.png` | 3D場面に2体（ステージ・PMX）が読まれ、FBX動作7件はすべて読込済み（計画で ready 7件、理由なし）。ただし、**画面に見えるのは暗い球（S01の外殻）だけで、キャラクターは外殻の中に隠れている** |

3D場面で読み込んだ後の外接箱は、次のとおりだった。

- ステージ：大きさ (2, 2, 2) m、最小 (−1, 0, −1)、最大 (1, 2, 1)。
- PMX：大きさ (1.155, 1.731, 0.867) m、最小 (−0.334, 0.132, −0.375)、最大 (0.821, 1.863, 0.492)。

v0.5は読み込むときにステージを高さ2mへ縮める（設計 §2.3）。そのため、高さ1.73mのキャラクターがステージの箱の内側に入る。①ではステージは元の大きさなので、見た目が一致しない。これは設計で WP-L8a に回した差で、実データでも確かめた。

## 設計の判断が必要なこと（実装はしていない）

1. **曲とダンスのGLB動作を写すか。**（2026-11-04 所有者決定「GLBも写す」。変換せずに置いて割り当てる規則を設計書 WP-L7a の補足に書き、実装した。この実データでの再実行はまだ） 所有者の曲とダンスの画面のダンスはGLB動作で、S3の規則では保管になる。写すには、GLB動作の長さ（アニメーションの長さ）を読み、対象をPMXにするかを決める必要がある。PMXにGLB動作を当てられるかは、③の動作の計画（`compatible`）では形式上は真になる。
2. **ステージの見た目の大きさ（WP-L8a）。** 実データでは、キャラクターがステージの外殻の内側に隠れる。L8a の換算を決めるまで、取込後の3D場面は①と同じ見た目にならない。
3. 詳細の表に、同じ表示名の行が並ぶ（「動作の並びの編集履歴・選択などの状態」が6行、「カメラの補間・…の設定」が2行）。設計どおり、`items` の件数と同じ行数を出している。読みやすさのために、まとめるかは画面の判断です。

## 試験

| 試験 | 結果 |
|---|---|
| `python tools/legacy_import_real_check.py …`（実データ、実GPU） | R1〜R4 すべて合格（4回） |
| `python -m pytest -q tests/test_legacy_import_real_check.py`（台本の素材の探し方と報告の書き方。実データは使わない） | 2件成功 |
| `python -m pytest -q`（`PYTHONUTF8=1`、`BAI_REAL_MMD_DATA` あり） | 938件成功、スキップ0。失敗1件は既存の `test_v05_timeline_drag_static` |
| `npm run typecheck` | 成功 |
| `node tests/run-guarded.cjs tests/studio-v05-legacy-import-ui.test.cjs tests/studio-v05-legacy-import-ui-3d.test.cjs` | 11/11成功、スキップ0 |

取込の製品コードに不具合は見つからなかった。今回足したのは、台本2本と、その単体試験だけです。

## 未検証

- 見た目の大きさの一致（WP-L8a）と、カメラの動き（WP-L8b）。
- 曲とダンスのGLB動作。
- 取込後の作品のMP4書き出し。
- 標準MCP・WebMCPからの取込。
- Linux。
- ①の別の作品を開いた状態での取込。旧保存は「無題のプロジェクト」1組だけで試した。
