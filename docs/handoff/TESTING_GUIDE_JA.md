# 共通テスト手順

対象: このリポジトリのコード、画面、保存形式、変換経路を変更するとき、および変更の完了を判定するとき。Issue [#61](https://github.com/baisound/BAI_CREATER_STUDIO/issues/61) に基づく共通の入口。機能固有の受け入れ条件は `docs/roadmap/FEATURE_DETAIL_JA.md`、進捗の正本は該当する台帳、実装別の試験契約は対応する設計書を使う。この文書だけで機能の完成を認定しない。

## 1. 試験前に対象と境界を決める

1. `git status --short --branch` と `git log -5 --oneline`、`python tools/work_state.py show` を確認する。進行中の作業を引き継ぐ場合は、その段階と未検証を維持する。
2. Issue・要件ID・変更した画面/API/保存データを特定し、該当する受け入れ条件と機能別の試験契約を読む。試験で何を観測すれば合格かを先に決める。
3. 変更範囲に対し、下表から必要な層を選ぶ。まず対象の試験を実行し、結合点や回帰リスクがある場合に関連画面・API・保存経路へ広げる。リリース判定では機能別契約の全ゲートを確認する。
4. 可能なら隔離した作業ツリーと一時データで試験する。稼働中の8765番サーバー、実素材、`data/`、`exports/`、`logs/`、バックアップを試験のために削除・初期化しない。原本素材を使う試験は前後のSHA-256と保存先を記録する。

| 変更対象 | 最低限確認する内容 | 追加の判定 |
|---|---|---|
| 文書・台帳だけ | 参照先、JSON構文、記載コマンドと現行ファイルの一致 | 実行していない試験を成功と書かない |
| Pythonの計算・API | 対象のpytest、異常入力、保存前後の値 | JSと共有する計算は同じfixtureで結果比較 |
| JS/画面 | 型チェック、対象のNode/ブラウザ試験 | 実画面の操作、エラー表示、Undo/Redo、保存再読込 |
| 素材・変換・3D | 上記と実形式の代表素材 | 実描画・実動作・生成物の再読込、原本ハッシュ |
| 手動UI・WebMCP・標準MCPを持つ機能 | それぞれの入口から同じAPIと保存結果 | 未実装・未確認の入口を個別に明記 |

## 2. 現行コマンド

リポジトリのルートで実行する。スクリプト名の正本は `package.json`。ファイル名は例であり、変更した機能の試験へ置き換える。

```powershell
npm run typecheck
python -m pytest -q tests/test_studio_routes.py
node tests/run-guarded.cjs tests/studio-music-dance.test.cjs
```

`tests/run-guarded.cjs` は `data/` と `exports/` のファイル名・内容ハッシュを試験前後で比較する。実行中に利用者の8765番サーバーが同じデータを書けば検査結果が混ざるため、試験の対象サーバー・一時領域を分離する。ハッシュ不一致は合格にしない。

P2などの横断変更では、対象の隔離試験が通った後に必要な共通ゲートを選ぶ。

```powershell
npm run test:p2
npm run test:p2-py
npm run test:p2-e2e
npm run test:studio
npm run test:node-all
python -m pytest -q
npm run test:evidence
```

これらは全変更に機械的に実行する一覧ではない。機能別設計が指定するゲートを満たす。特に `test:p2-e2e` は結果を `tools/record_e2e_main.mjs` で記録する。画面の `real` 表示に紐付く証拠試験は `test:evidence` で確認する。2026-11-05の Python 構成整理以後、Python の試験は `tests/` に集め、ルートの `conftest.py` による実データ隔離は維持する。Windows の cp932 既定環境で UTF-8 ソースの静的読取試験を実行する場合は `python -X utf8 -m pytest -q` を使い、実行した文字コードを結果に記録する。

ブラウザ試験でPlaywrightの既定ブラウザが無い場合は、インストール済みChrome/Chromiumの実行ファイルを `CHROMIUM_PATH` に指定し、そのパスとバージョンを結果に記録する。Windowsでソケット不足が出たときだけ `BAI_TEST_CONCURRENCY=1` に下げて隔離再実行し、元の一括ゲートは未完走として残す。

## 3. 合格と未検証の書き分け

- コマンド終了コード0だけで実機確認とは呼ばない。実ブラウザ、実GPU、実素材、Blender変換、Linux、MCPなど、実際に触れていない層は「未検証」と書く。
- スキップした試験、環境不足で起動しなかった試験、途中で止まった一括ゲートは成功件数に含めない。単独再実行で通っても、一括ゲート自体の未完走は残す。
- 保存機能は保存後に読み直して値を比較する。元ファイル不変が要件ならハッシュで確認する。UIの状態表示とAPIの応答だけで生成物の品質を推定しない。
- 不具合を見つけたら再現入力・期待値・実結果・ログ・実行環境・コミットを記録し、必要な修正後に影響範囲の試験を再実行する。診断画像はAGENTS.md指定のオーナー確認画像フォルダーに置く。
- オーナーの画面確認は Phase E の全機能実装が終わるまで依頼しない。Agent側の自動試験・実機確認は各段階で進める。

報告には、要件ID、変更コミット、実行コマンド、環境、成功/失敗/スキップ、素材とハッシュ、未検証、次のゲートを書く。コードを変更したコミットでは台帳・テスト結果・未検証を紐付け、`WORK_STATE.json` は作業位置だけ記録する。

ログ機能固有の試験は [ログ検証ガイド](../logging/TEST_GUIDE_JA.md)、mainマージ後の確認は [同期手順](MAIN_SYNC_AFTER_MERGE_JA.md) を参照する。

## 4. P2 の新UIで通しで制作する手順（所有者向け・任意。2026-11-03、P2-WP-99）

> 注意（2026-11-03）：この手順は②新画面（`studio/`、`/workspace/NN`）用です。いま作っている③v0.5（`studio/v05/`）の手順ではありません。③の試し方は [V05_REBUILT_ROADMAP_20261102_JA.md](../roadmap/V05_REBUILT_ROADMAP_20261102_JA.md) の各段階が終わったときに別に示します。

P2 は既存機能を新UI（`/workspace/NN`）へ移した段階である。主シナリオ（MMD の「歌ってみた」）の流れ「PMX/VRM → ステージ → カメラ → BGM → VMD → エフェクト → 書き出し」に沿って、5手順で試せる。任意で、結果を待たずに次の作業は進む（AGENTS.md 規則7）。うまくいかなかったら、**止まった手順の番号と画面に出た文言**だけを知らせる。

### 4.1 前提：試用データで起動する（本物の制作データを書き換えない）

1. `D:\BAI\BAI_CREATER_STUDIO\data` を `D:\BAI\試用データ` へフォルダごとコピーする（2回目以降は不要）。
2. PowerShell で `cd D:\BAI\BAI_CREATER_STUDIO` の後、`$env:BAI_DATA_DIR='D:\BAI\試用データ'; python server.py 8765`（コマンドプロンプトは `set BAI_DATA_DIR=D:\BAI\試用データ` の後に `python server.py 8765`）。
3. `http://127.0.0.1:8765/workspace/01` を開く。終わったらサーバーを止める。
4. 旧制作画面（`/`）や旧 `camera.html` を同時に開いて両方で保存しない（新旧の同時編集は競合する）。

### 4.2 5手順

| # | 主シナリオ | やること | 期待する結果 |
|---|---|---|---|
| 1 | PMX/VRM の読込 | 「素材管理（08）」の取り込みで、手元の PMX（テクスチャ入り ZIP）か VRM を選び［取り込む］。「キャラクター管理（12）」で選び、中央の表示をマウスで回し、［このモデルを制作に使う］→［保存］。 | 一覧に増え、モデルが3Dで出る。保存後に再読込しても残る。 |
| 2 | ステージ | 「シーン・ステージ（06）」でステージにする素材を選び、位置・回転・大きさのスライダーを動かして［保存］。再読込する。 | 表示が変わり、再読込しても同じ配置。 |
| 3 | カメラ（BGM は使えない） | 「カメラワーク（02）」を開き、キーを2つ足して［保存］。他の画面へ移って戻る。 | キーが残り、再読込しても残る。**S4 BGM（歌の音声）の配置は、まだ使えない**（旧画面にも API にもコードが無い。承認済みの実装はリップシンク段階）。 |
| 4 | VMD の設置と再生（エフェクトは使えない） | 「モーションVMD編集（13）」の［編集］で対象に PMX を選び、VMD を1つ当てて［▶ 再生］。表情が入っていれば口・表情も動く。VRM/GLB を使う場合は、02 でクリップとカメラのキーを一緒に再生できる（PMX＋VMD とカメラの同期は P2 に無い）。 | モデルが動き、［停止］で位置が残る。02 ではモデルのボーンが動き、カメラがキーの間で補間される。**S6 エフェクトは、まだ使えない**（後段の MMD エフェクトのフェーズ。実装前）。 |
| 5 | 書き出し | 「外部連携（23）」の「エクスポート」を開き、コンビネーションの手順数と VMD 変換の操作が出ることを見る。**ジョブ作成・変換実行は押さない**（`exports/` は試用フォルダの外にあり、Blender の実行は未検証）。 | 表示が出る。音声付きの動画書き出しは未実装（Phase F）。 |

### 4.3 いま通しで動く範囲

`npm run test:p2-e2e` の結果（`docs/roadmap/P2_PORT_STATUS.json` の `e2e_main`）は S1・S2・S3・S5・S7・S8 が pass、S4・S6 が skip（理由付き）、`furthest_step` は S8。skip は合格ではない。実 GPU・Windows・実 Ollama・Blender の実変換・実在の PMX/VRM の見た目などの未検証は、同ファイルの `p2_overall_unverified`（U1〜U16）に1か所でまとめてある。

### 4.4 P2 のテスト一覧（`tests/studio-p2-*`）

全体は `npm run test:p2`（`tests/run-guarded.cjs` が `data/`・`exports/` の前後ハッシュを比較）。`.mjs` はブラウザー不要、`.cjs` は実サーバー（隔離データ）と Chromium（SwiftShader）。three.js が無い環境では 3D を使う試験が skip になる。

| ファイル | 確かめること |
|---|---|
| studio-p2-api.test.mjs | api.js：状態コードと error_code の割当、日本語文言、時間切れ・取消 |
| studio-p2-store.test.mjs | store.js / bus.js / state-box の単体 |
| studio-p2-project-logic.test.mjs | ② 読込・保存の制御（世代番号・競合・順序。偽の時計） |
| studio-p2-project.test.cjs | ② SCR-18 の保存・読込・履歴・外部同期（実サーバー） |
| studio-p2-import-rules.test.mjs | ③ 取り込み規則・素材の分類・衝突の判定 |
| studio-p2-assets-logic.test.mjs | ③ 素材一覧の読込 |
| studio-p2-assets.test.cjs | ③ 素材一覧・取り込み・見本画像・FBX 再生 |
| studio-p2-viewport.test.cjs | ④ 3D 表示とステージ配置（SCR-06・12） |
| studio-p2-normalize-parity.test.cjs | ④ 単体表示の正規化が旧カメラ画面と一致 |
| studio-p2-pmx-fixture.test.cjs | 最小 PMX が本物の PMX として読める |
| studio-p2-retarget.test.cjs | ④-9・10 リターゲット検証（SCR-13） |
| studio-p2-motion.test.cjs | ⑤ SCR-13 の1体再生（PMX＋VMD、GLB/VRM のクリップ）と制作への記録 |
| studio-p2-motion-fork.test.mjs | ⑤ patterns のフォークと旧 index.html の照合 |
| studio-p2-motion-logic.test.mjs | ⑤ コンビネーション編集・お気に入りの通信 |
| studio-p2-chain-fork.test.mjs | ⑤ 2体配置と連結再生の式を旧画面と照合 |
| studio-p2-chain.test.cjs | ⑤ SCR-05：82パターン・A/B 3D・連結再生 |
| studio-p2-fbx-clips.test.mjs | ⑤ FBX クリップの遅延読込・対応表の保存 |
| studio-p2-timeline-logic.test.mjs | ⑤ タイムラインの時計・補間・550ms 自動保存 |
| studio-p2-generic-dance.test.mjs | ⑤ VRM の汎用ダンス適用（要 three） |
| studio-p2-camera-ids.test.mjs | ⑥ SCR-02 のカメラ要素 ID が重複・欠落しない |
| studio-p2-camera.test.cjs | ⑥ カメラホストの保存・往復・壊れたファイル |
| studio-p2-export-model.test.mjs | ⑦ VMD ジョブの本文・ボーン対応の検査・Blender 失敗の文言 |
| studio-p2-export.test.cjs | ⑦ SCR-23 のジョブ作成（スタブ）と Blender 状態の確認 |
| studio-p2-pose-ik-fork.test.mjs | ⑧ 手動 IK ポーズ補助のフォークを旧実コードと照合 |
| studio-p2-pose-ai.test.cjs | ⑧ 足IK タブ・AI 管理カード・AI ポーズ案（Ollama はスタブ） |
| studio-p2-e2e-main.test.cjs | 通し確認 S1〜S8（`npm run test:p2-e2e`） |
| legacy-project-save.test.cjs | 旧画面の保存（B-1・B-2・B-3・reset）。three が無いと skip |
| test_screen_status_honesty.mjs | 画面の real 表示に証拠があるか（モックを実装と偽らない） |
| test_project_envelope.py ほか（`npm run test:p2-py`） | POST /api/project の版・壊れたファイル、カメラ保存の不正値、実 data/ の隔離 |

画面の `real` 表示の証拠は `npm run test:evidence`、新UIの画面操作は `npm run test:studio` と `npm run test:node-all`、サーバーは `python -m pytest -q`。
