# MOTION-010 PMX FK補正レイヤーと作品タイムラインキー

2026-10-24、Issue #106。v0.5のPMX＋VMD限定FK補正を、作品別のレイヤー設定とモーショントラック上のキーへ接続した。段階Aの追加実装であり、MOTION-010全体の完了やOwner採用ではない。

## 変更した経路

- 既存schema 1のレイヤーに、任意フィールドとして`start_frame`、`end_frame`、`fade_in_frames`、`fade_out_frames`を追加した。旧レイヤーはクリップ全区間、前後なじませ0Fとして読み、旧ファイルを一括変換しない。重みは0〜100%、区間は作品フレームの半開区間、前後なじませは非重複の整数Fとする。
- 3D編集画面で保存済みFKレイヤーの重み、区間、前後なじませ、ミュートを編集できる。RESTの`layer-update`は対象レイヤーID、作品revision、素材ハッシュ、クリップ配置とロックを検証し、1操作1履歴で保存する。ブラウザーWebMCPと標準MCPも同じAPIへ接続した。
- 同じ作品のモーショントラックにPMX FKキーを骨別に表示する。クリックで対象インスタンス・VMD・作品フレームを3D編集画面に開く。左右ドラッグまたは矢印キーで同じクリップ内の同じ骨のキーだけを移動する。`move`は競合・範囲外・重複を拒否し、Undo/Redo対象とする。行のロック中は移動不可。タイムラインから保存した変更は開いている3Dプレビューへ再読込する。
- 原PMX/VMDは読み取り専用。プレビューと保存済みフレームのキャプチャは区間・なじませ・重み・ミュートを同じ評価器で反映する。クリップ外や元素材変更時の停止は維持する。3Dプレビューと共通再生ボタンの初期化順も明示イベントで同期した。

## 試験結果と未検証

- 隔離した実PMXと10秒VMDを使い、Chrome/SwiftShaderで保存・再読込、0/50/100%の姿勢差、区間外、ミュート、なじませ開始Fと中間Fの実骨差、手動UIの重み保存、APIのキー移動とUndo、タイムラインのF241表示と矢印キーによる移動、revision競合と不正区間の拒否を確認した。試験コマンドは`BAI_REAL_MMD_DATA=<既存data>`、`CHROMIUM_PATH=<Chrome>`、`BAI_TEST_CONCURRENCY=1`で`node tests/run-guarded.cjs tests/studio-v05-pmx-fk-edit-real.test.cjs`。最終実行は1/1成功。原本を含む利用者`data/`の7ファイルと`exports/`は前後ハッシュ一致。
- 既存の`tests/studio-v05-scene-mp4.test.cjs`と合わせた隔離試験は4/4成功。実PMX/VMDの元動作によるMP4出力ではRTX 4070 SUPERのDirect3D11レンダラーを確認した。このMP4試験にはFK補正の保存データが入っておらず、補正入り完成MP4の画素比較とは区別する。
- `python -m pytest -q tests/test_studio_v05_motion_edits.py`は5/5成功。旧schemaの省略値と不正な区間・重みを検査した。`npm run typecheck`、Python/JS構文、`git diff --check`も成功。
- 初回の実ブラウザ試験は再読込時に共通再生ボタンが作られない初期化競合を検出して修正した。次の試行は追加した非同期UI保存の完了前に試験が値を読んで失敗し、待機条件を直した。これらの失敗を成功件数に含めない。
- タイムラインのドラッグ実操作、前後なじませの画素比較、WebMCP/標準MCP実呼出し、FK補正入り完成MP4の画素比較、実GPU上のFK、Linux、長尺90秒、Owner採用は未検証。ソロ・順序・複数レイヤー、3Dギズモ/IK、別名VMDは未実装。全ACは引き続き「要検証」。

原PMX SHA-256: `542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488`。原VMD SHA-256: `3ae724f9d1d36a7e74a911d6b1bbfad7d2459e5e256fcac43521ebebd0a3d234`。
