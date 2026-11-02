# v0.5 制作経路の再構築ロードマップ（2026-11-02）

## 判断の基準

この文書は2026-11-02のOwner依頼による、現在の実施順と終了条件の短い入口である。新機能を承認したり、既存IDを完成へ昇格したりしない。2026-10-23のOwner指定どおり、**登録済み素材と新規素材を同じ作品に置く → 同じ時刻でプレビューする → 保存した内容を別名MP4へ書き出す**縦断経路を先に通す。その後はPMX表情・口・ダンス、GLB→VMD、ステージ・カメラ、字幕の順に進める。詳細な要求と進捗判定は[機能台帳](FEATURE_REGISTER.json)と[受け入れ条件](FEATURE_DETAIL_JA.md)、実装履歴は[従来のv0.5記録](V05_MINIMUM_WORKFLOW_20261023_JA.md)に残す。

基準コミットは `70ed811`（PR #201までのmain）。台帳は151 ID・重複0件、CSVも151行。Issue [#69](https://github.com/baisound/BAI_CREATER_STUDIO/issues/69) は横断残件、[#81](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81) は媒体別操作を追跡する。Issueのチェックやコードの存在だけで実制作の完成を判定しない。

## 現在できることと、まだ通っていないこと

| Owner指定の順 | 確認済みの狭い範囲 | 次の終了条件を妨げる残件 |
|---|---|---|
| 1 素材入口 `DATA-001/008/016` | v0.5の登録素材一覧、画像等の追加登録、実IDの配置保存、小型GLBの再表示を隔離Chromeで確認。[証拠](../v05/ASSET_LIBRARY_BRIDGE_20261023_JA.md) | PMX/VRM/FBX/VMD/GLB動作はv0.5からの直接登録が未接続。旧入口を経由する場合も、対象形式ごとの登録・見本・再読込を通していない。既存作品の完全復元も未確認。[#37](https://github.com/baisound/BAI_CREATER_STUDIO/issues/37) |
| 2 同じ作品・時計 `DATA-003/008`、`AUDIO-001`、`MOTION-002/003/006` | 画像・動画・独立音声の配置と元区間編集、実PMX＋全身VMDの複数時刻表示、GLBの同画素重ねをそれぞれ隔離確認。[媒体操作](../v05/MEDIA_SPECIFIC_TIMELINE_20261024_JA.md)、[PMXダンス](../v05/REAL_PMX_FULL_DANCE_20261024_JA.md)、[重ね表示](../v05/COMPOSITE_SCENE_PREVIEW_20261024_JA.md) | 旧作品を含む同一IDの復元、実PMX・曲・ステージ・保存カメラを一つの編集画面と時計に結ぶ通し検証、長尺の音画同期が未達。[#39](https://github.com/baisound/BAI_CREATER_STUDIO/issues/39)、[#63](https://github.com/baisound/BAI_CREATER_STUDIO/issues/63) |
| 3 別名動画 `RENDER-001/002/004/005/006` | 画像・動画・独立音声のH.264/AAC MP4、最大300Fの3Dを含む短いMP4を隔離再読込済み。PMX全身VMDと手動表情キーの短区間画素差も確認。[2D](../v05/MEDIA_RENDER_20261024_JA.md)、[3D](../v05/SCENE_MP4_CAPTURE_20261024_JA.md) | 編集時の保存カメラと書き出し構図の一致、300Fを超える3D、動画内音声、全区間1F以内の音画同期、完成物の同名版管理、字幕等は未達。拒否する形式は黙って欠落させない。 |
| 4 PMX顔・口・ダンス `LIP-001/004/006/007/009` | 実PMXの手動表情・口キー、VMDダンスと短MP4、SRT原本から別名モーフVMD候補、作品内の明示採用・Undo/Redo、元VMD/採用/手動0の3D優先表示を確認。元VMDの非モーフ区画保持と全作品F・60fps中間Fの合成比較器はPythonで検査済み。[採用](../v05/LIP001_ADOPTION_OVERLAY_20261025_JA.md)、[比較器](../v05/LIP001_COMPOSITE_FRAME_GATE_20261025_JA.md) | 合成比較器は製品API/出力へ未接続。実歌音声SRTの境界品質、採用口形を含む完成MP4、一般化したPMX/VRM表情、MCPは未検証。[#187](https://github.com/baisound/BAI_CREATER_STUDIO/issues/187) |
| 5 GLB→VMD・骨編集 `MOTION-003/004/005/006/007/010` | 実GLBから対象PMX用VMDを別名生成して作品へ配置。実PMXの限定FK/IK補正、別名VMD候補の一部往復を確認。[変換](../v05/GLB_TO_VMD_20261024_JA.md)、[詳細設計](MOTION010_V05_DETAILED_DESIGN_20261024_JA.md) | 足接地・物理・他PMXへの一般化、すべての補正候補の採用判定と作品出力、MCP/Linuxは未達。[#102](https://github.com/baisound/BAI_CREATER_STUDIO/issues/102) |
| 6 ステージ・撮影 `CAM-001/003/004/005/006/007/015/016/018` | GLBステージの登録と個別3D表示、既存カメラ機能の部分実装がある。 | ステージXYZ/回転と保存撮影状態を同じ作品・時計・MP4へ接続する通し検証が未達。カメラ・フォーカス・DOF・複数ショットの統合は後段。[#40](https://github.com/baisound/BAI_CREATER_STUDIO/issues/40)、[#63](https://github.com/baisound/BAI_CREATER_STUDIO/issues/63) |
| 7 字幕・字面 `LYRIC-001〜005` | 仕様と既存画面の一部。 | JIZURAの権利・依存監査、共通時刻の編集・保存・プレビュー・MP4、実フォント差分が未達。 |

表の「確認」はリンク先に記された素材・時間・ブラウザ・出力に限定する。機能台帳の広いIDを完成としない。特に旧[#96](https://github.com/baisound/BAI_CREATER_STUDIO/issues/96)と[#106](https://github.com/baisound/BAI_CREATER_STUDIO/issues/106)が閉じていても、PMX顔や骨編集の全受け入れ条件が終わった意味ではない。

## 次の実施順と各ゲート

1. **最短縦断の再現試験を固定する（順1〜3、[#37](https://github.com/baisound/BAI_CREATER_STUDIO/issues/37)/[#63](https://github.com/baisound/BAI_CREATER_STUDIO/issues/63)/[#69](https://github.com/baisound/BAI_CREATER_STUDIO/issues/69)）。** 既存登録PMX＋VMD＋WAVと、新しく登録した画像を一つの隔離作品に置く。実ID、原本hash、作品FPS、配置F、モデル割当、In/Outを保存・再読込する。開始・中間・終了の3点で3D/画像/音を同じ時計で観測し、短い3D入りMP4を別名出力してフレーム数・画素・PCM・原本不変を確認する。既存試験の寄せ集めで済ませず、最初から最後まで同一作品IDの一つの試験で通す。ここで不足が出た既存要件だけを修正する。
2. **素材形式と旧作品の対応範囲を埋める（順1、`DATA-016/008`、[#37](https://github.com/baisound/BAI_CREATER_STUDIO/issues/37)/[#50](https://github.com/baisound/BAI_CREATER_STUDIO/issues/50)）。** PMX/VRM/FBX/GLB、VMD/FBX/GLB動作、WAV、GLBステージ、画像・動画の入口・見本・再読込を形式別に表にする。v0.5から旧入口へ誘導する形式はその操作と結果を実機確認し、旧作品は元IDとhashを保って読み直す。未対応は画面に理由を示し、サーバー上の登録だけで使える扱いにしない。
3. **共通の制作状態からの出力を広げる（順2〜3、[#39](https://github.com/baisound/BAI_CREATER_STUDIO/issues/39)/[#63](https://github.com/baisound/BAI_CREATER_STUDIO/issues/63)/[#81](https://github.com/baisound/BAI_CREATER_STUDIO/issues/81)）。** 作品・シーン・時計を一本化し、保存カメラ/ステージ位置をプレビューとレンダーへ渡す。動画内音声、長尺3D、全区間の音画1F以内、同名完成物の版管理を要件ごとに試験する。3Dの300F制限など実装上の制約はUIに示したまま進め、制約解除の実測まで一般完成を宣言しない。
4. **PMX表情・口・ダンスを完成条件へ近づける（順4、[#187](https://github.com/baisound/BAI_CREATER_STUDIO/issues/187)）。** 合成比較器を作品内の選択済み元VMD・採用口形・手動キーへ接続し、失効/不連続を拒否して別名候補を全キー再読込する。実PMXで元VMDとの顔・身体・出力MP4を比較し、実歌音声のSRT境界を点検する。口形の強さの自然さはOwner採用と機械合格を分ける。
5. **残りの承認済み専門機能を元の順でつなぐ。** GLB→VMDとモーション編集（順5、[#102](https://github.com/baisound/BAI_CREATER_STUDIO/issues/102)）、GLBステージと撮影・保存カメラ（順6、[#40](https://github.com/baisound/BAI_CREATER_STUDIO/issues/40)/[#63](https://github.com/baisound/BAI_CREATER_STUDIO/issues/63)）、字幕（順7）を同じ作品ID・シーン・時刻・出力へ接続する。最短経路に不要な拡張や新案を途中に挿入しない。

各段階で手動UI、共通API、WebMCP、標準MCP、保存再読込、Windows/Linux、実素材、ブラウザ/GPU、出力のうち実際に試した範囲を分ける。[共通試験手順](../handoff/TESTING_GUIDE_JA.md)を使い、原本と既存完成物のhash、失敗時の復元、診断可能なエラーを確認する。Phase E全機能の実装が終わるまでOwnerに動作確認を依頼しない。

## 次に着手する単位

最初の作業は上の1の**同一作品IDでの縦断試験**。試験で見つかった欠落を[#69](https://github.com/baisound/BAI_CREATER_STUDIO/issues/69)と該当する既存Issueへ記録し、要件IDを付けて修正する。次のPRには、入力ID・ハッシュ、保存再読込、プレビューの時刻、MP4の画素/PCM、失敗・スキップ、未確認の形式と環境を含める。今回のロードマップ文書は試験を実行した証拠ではない。

モデル区分: 既存要件と証拠の照合、順序判断、文書更新、形式検査は標準モデル。
