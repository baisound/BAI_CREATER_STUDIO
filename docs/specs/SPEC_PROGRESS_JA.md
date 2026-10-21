# 承認済みバックログ仕様・新UIモック進捗

更新日: 2026-10-20。対象ブランチ: `codex/specs`。2026-10-20の最新所有者決定による順序は P2 → Phase E → リップシンク／表情／歌音声配置 → F → MMD FX → C → D残り → G残り → H。今回の変更は実装順の繰り上げではなく、既存承認 ID の画面配置と仕様草案である。

PR #7 マージ後のDOF責務修正は `codex/mmd-dof-owner-correction` で追跡する。元のA3判断時点の「DOFを内蔵FXとして実装する」表記は、後続の所有者指示「DOFはカメラ機能として扱い、MMDエフェクト側には重複実装しない」に合わせて更新した。`CAM-005/E-FOCUS-01/02/F-DOF-01` と `SCR-02/03` が焦点・DOF区間の設定と描画検証を所有し、`RENDER-012/014` と `SCR-26` は読み取り専用の参照・重ね合わせ比較だけを担う。FXのDOFスライダーと仮区間を削除し、カメラへの導線を設けた。機能実装やカメラDOFの完成は今回行っていない。

この修正の検証: 台帳JSON/CSV 148件でID集合一致、`RENDER-012` の名前・詳細・状態・依存が同値。`npm run typecheck` 成功、実装状態検査 6/6、Chrome のFX・歌詞対象画面試験 1/1（DOF入力不在、カメラ画面遷移を含む）。`git -c core.whitespace=cr-at-eol diff --check` 成功。GPU描画・動画出力・両MCPの実機確認は未実施。更新した要件IDは `RENDER-012/014`、参照先は `CAM-005/E-FOCUS-01/02/F-DOF-01`。移行時に既存プロジェクトのDOF値をFXインスタンスとして二重保存しない。

DOF責務修正のコミット: 仕様・台帳 `c5577b3`、FXモック・対象ブラウザ試験 `0cf0a08`。どちらも機能の完成判定ではない。

| 要件ID | 今回の成果 | 機能実装 |
|---|---|---|
| `AUDIO-001`、`LIP-001`〜`004`、`LIP-009` | 歌音声配置・基本口形・表情の仕様と画面配置。所有者が歌音声の独立ID、同一口モーフの優先置換、曖昧な読みの明示確定を承認 | 未実装・未検証 |
| `RENDER-001`〜`010`、`RENDER-011`〜`015` | 動画出力と MMD FX の仕様・配置 | 未実装・未検証 |
| `DANCE-001`〜`007`、`DANCE-012` | 複数ダンサーとフォーメーションの仕様・配置 | 未実装・未検証 |
| `LIP-005`〜`008`、`LIP-010`〜`011`、`LYRIC-006` | 音楽同期・表情の後段仕様 | 未実装・未検証 |
| `LYRIC-001`〜`005`、`LYRIC-007`〜`012` | 歌詞・ステージの仕様。JIZURA 実画面の同一ページ・かんたん／詳細切替と、SRTの開始・終了時刻を保つ非破壊ブロック補正 | 未実装・未検証 |
| `DANCE-008`〜`011`、`LYRIC-010`、`MOTION-021` | 格闘・接触・ステージギミックの仕様 | 未実装・未検証 |
| `UX-001`〜`008` | `SCR-26` FX、`SCR-27` 歌詞を追加。共通ヘッダ、既存ページのタブ、未実装の明示、幅の狭い画面での到達をモックで確認 | UI モックのみ |

A1 の所有者決定: [`A1_LIP_BGM_DECISIONS_JA.md`](A1_LIP_BGM_DECISIONS_JA.md) の `O-LIP-01`（歌音声配置の独立ID）、`O-LIP-02`（手動→確定生成→元VMDの優先置換）、`O-LIP-03`（曖昧な読みは確定または明示的な無音指定）をすべて推奨案Aで承認。`AUDIO-001` として台帳へ登録したが、機能は未実装。ロードマップの実装順は変えていない。

A2 の所有者決定: [`A2_RENDER_DECISIONS_JA.md`](A2_RENDER_DECISIONS_JA.md) の `O-RENDER-01/02/03` を **A/A/A** で承認。MP4の環境別実測、同名完成物の版名・明示置換時の旧版退避、透過初期RGBA PNG連番を台帳・詳細・概要・トレーサビリティ・Phase F設計へ同期した。`RENDER-001`〜`010` の実装状態は「計画・未検証」のまま。実音声付きMP4は、先行する `AUDIO-001` の配置結果を入力にする。

A2決定の文書検査: 台帳JSON/CSVは148件でID集合一致。変更した `RENDER-002/004/005/006` の詳細・状態・依存は両形式で一致し、状態はすべて「計画・未検証」。`git -c core.whitespace=cr-at-eol diff --check` は成功。コード変更がないためブラウザ・FFmpeg・GPUの実機試験は行っていない。

A3 の所有者決定: [`A3_MMD_EFFECTS_DECISIONS_JA.md`](A3_MMD_EFFECTS_DECISIONS_JA.md) の `O-MMD-01/02/03` を **A/A/A** で承認。Ray-MMDと内蔵効果の初期境界、効果別測定＋目視、許諾不明素材のローカル参照を正本へ同期する。後続指示で霧・塵・桜・きらめき・影・ボケ／ブラーを優先し、[`A3_VISUAL_EFFECT_PRIORITY_JA.md`](A3_VISUAL_EFFECT_PRIORITY_JA.md) に候補と検証計画を記録した。外部候補の具体名・権利は照合中。`RENDER-011`〜`015` は計画・未検証のまま。

A3文書検査: 台帳JSON/CSVは148件でID集合一致。`RENDER-011`〜`015` の詳細・状態・依存は両形式で一致し、5件とも「計画・未検証」。`git -c core.whitespace=cr-at-eol diff --check` 成功。実装・GPU・外部MME素材の試験は行っていない。

B1所有者決定: [`B1_MULTI_DANCER_DECISIONS_JA.md`](B1_MULTI_DANCER_DECISIONS_JA.md) の `O-DANCE-01/02/03` を **A/A/A** で承認。候補経路を人が選択・補正・確定して適用後再評価、登録済み小道具の骨接続と持ち替え、VMD一括出力の成功分保持と「一部成功」を台帳JSON/CSV、詳細、概要、Phase C文書、ロードマップ、トレーサビリティへ同期した。`DANCE-002/006/007/012` は「計画・未検証」のままで、実装順は不変。文書検査は148件の台帳ID集合と4件の名前・詳細・状態・依存がJSON/CSVで一致し、`git -c core.whitespace=cr-at-eol diff --check` 成功。コード変更・実モデル/VMD/UI/両MCPの実機試験は行っていない。

B2所有者決定: [`B2_MUSIC_EXPRESSION_DECISIONS_JA.md`](B2_MUSIC_EXPRESSION_DECISIONS_JA.md) の `O-MUSIC-01/02/03` を **A/A/A** で承認。選択VMD集合の傾向、顔映像の既定非保存、音声サンプル位置の時刻付き拍マーカー正本を台帳・詳細・概要・Phase D文書・ロードマップ・トレーサビリティへ同期した（`df3e60b`、基底統合 `0616e73`、PR #10）。`LIP-005/011`、`LYRIC-006` は計画・未検証。文書検査は148件のID集合・対象のJSON/CSV一致とdiff checkが成功し、実音声・顔映像・VMD・MCPの試験は行っていない。

B3所有者決定: [`B3_LYRICS_STAGE_DECISIONS_JA.md`](B3_LYRICS_STAGE_DECISIONS_JA.md) の `O-LYRIC-01/02/03` を **A/A/A** で承認。JIZURA必要部分の段階統合、フォント代替の利用者選択、確認後のPMX部分出力を台帳・詳細・概要・Phase G/H文書・ロードマップ・トレーサビリティへ同期した（`e9e639d`、PR #12）。`LYRIC-001/004/008` は計画・未検証。文書検査は148件のID集合・対象のJSON/CSV一致とdiff checkが成功し、JIZURA・実フォント・PMX・MCPの試験は行っていない。

B4所有者決定: [`B4_COMBAT_STAGE_DECISIONS_JA.md`](B4_COMBAT_STAGE_DECISIONS_JA.md) の `O-COMBAT-01/02/03` を **A/A/A** で承認。接点差と同一フレーム映像の併記、再現性確認後のベイク再利用、登録済み可動ピボットのイベント連動を台帳・詳細・概要・Phase H文書・ロードマップ・トレーサビリティへ同期した（`c115de4`、PR #13）。`MOTION-021` は「要検証」、現行新UI操作は未実装表示、`DANCE-008/009`・`LYRIC-010` は計画・未検証のままで、実装順は不変。文書検査は148件の台帳ID集合と対象4件の名前・詳細・状態・依存がJSON/CSVで一致し、`git -c core.whitespace=cr-at-eol diff --cached --check` 成功。コード変更・実モデル・物理・MCPの試験は行っていない。

2026-10-21 B4実装設計: [A1〜B4共通契約](IMPLEMENTATION_COMMON_CONTRACT_JA.md) に schema=2 の統合保存拡張、revision/競合/失敗契約、時刻・座標・原本保護を固定し、[B4実装設計](B4_COMBAT_IMPLEMENTATION_DESIGN_JA.md) に6 IDのスキーマ、フレーム評価順、共通コマンド、物理エンジン導入と再現性判定、UI/MCP/実データ試験を記述。対象IDは `DANCE-008`〜`011`、`LYRIC-010`、`MOTION-021`。これは設計であり、機能・依存エンジンの導入・GPU/物理実測・保存移行は未実施。P2/Eや先行B1/B3の実装差を照合してから着手する。

A3対応コミット: 承認境界と優先効果の仕様・台帳を `757ebb2`、FX画面の説明用パラメータと仮区間を `0435fbb` で記録し、ともに `origin/codex/specs` へプッシュした。後者は `npm run typecheck`、状態表示検査6/6、Chrome対象画面試験（FX・歌詞2/2、追加した霧・桜・影の表示1/1）に成功。画面例は素材登録、GPU描画、保存、動画出力の完成を意味しない。

レビュー: `reviews/CRITIC_01_JA.md` → `CRITIC_02_JA.md` → `CRITIC_03_JA.md` → `reviews/JUDGE_JA.md`。Judge の進捗ID不一致と詳細モード消失は修正した。

検証: `npm run typecheck` 成功、`node tests/test_screen_status_honesty.mjs` 6/6、Chrome 全画面試験 21/21（27画面の導線・レスポンシブ・実装状態、FX／歌詞画像、仮区間の移動・端トリム・再読込リセットを含む）。スクリーンショットで `SCR-26/27` の画像と時間軸を確認した。テスト用 Python サーバーは閲覧用の 8765 と別ポート（既定 8799）で隔離データを使い、占有時は次の空きポートを選ぶ。

`AUDIO-001` 決定反映の追加検証: 台帳JSON/CSVがともに148件でID集合一致、`AUDIO-001` は各1件、`npm run typecheck` 成功、実装状態検査 6/6、Chrome の音声画面ダイアログ試験 1/1。前回の全画面試験後、変更対象は `SCR-10` のID表示と関連文書であり、全画面試験は繰り返していない。

未検証: 歌詞／FX 等の実機能、JIZURA コード・演出パックの移植可否と版差、WebMCP／標準MCP、保存復元、GPU 実測、Windows/Linux 両対応の実機確認。モック内の未実装操作は成功表示や保存を行わない。

Git 対応: 初期仕様7件 `49557ab`、配置仕様・批評3回 `f6fae2f`、27画面モック `59b29e4`、Judge指摘とSRT区間 `a17a7dd`・`37856d2`、SRT事実確認とAGENTS方針 `d3532a1`、生成画像と操作可能な仮時間軸 `23e4964`。`23e4964` は承認済み `RENDER-012/013/014`・`LYRIC-002/004` の画面配置例であり、機能実装・保存・出力は未完。ロードマップの順序と機能台帳の実装状態は変えない。

A1の所有者決定 `AUDIO-001`・`LIP-001/009` は `2e9e2f5` で台帳・概要・詳細・トレーサビリティ・画面表示・試験に同期した。実装状態は「計画・未検証」のまま。後続の詳細設計とCritic/Judge、実装・実データ試験は別工程。

2026-10-21 実装引継ぎ設計: [入口](IMPLEMENTATION_HANDOFF_JA.md)から[A1](A1_LIP_IMPLEMENTATION_DESIGN_JA.md)、[A2](A2_RENDER_IMPLEMENTATION_DESIGN_JA.md)、[A3](A3_MMD_EFFECTS_IMPLEMENTATION_DESIGN_JA.md)、[B1](B1_MULTI_DANCER_IMPLEMENTATION_DESIGN_JA.md)、[B2](B2_MUSIC_EXPRESSION_IMPLEMENTATION_DESIGN_JA.md)、[B3](B3_LYRICS_STAGE_IMPLEMENTATION_DESIGN_JA.md)、[B4](B4_COMBAT_IMPLEMENTATION_DESIGN_JA.md)、[共通契約](IMPLEMENTATION_COMMON_CONTRACT_JA.md)へ到達できる。領域ごとのデータスキーマ・計算/時刻・API入出力/エラー・実装順・UI/MCP/保存・試験ゲートを固定した。B3はJIZURA公式ソース `fc16bfe4`（0.10.1）とMIT/第三者通知を確認し、取り込む機能を限定した。設計文書内リンク、JSON例、対象ID参照、差分を検査。コード・外部依存・実素材・GPU・両MCPの実装/動作試験はまだない。各機能台帳の状態は変更しない。B4共通契約/詳細設計は `49f3c51` に記録した。

2026-10-21 横断自己点検: 共通保存の未導入ドメインを省略し初回確定書込みで完全レコードを作ること、ジョブ進捗と編集revisionの分離、故障復旧順序を固定。A2ジョブ参照と独立進捗、A2→A3の整数F/有理数サブフレーム接続、A3手動トリガー→後続B4接触参照、B1のP2床入力と有界探索、B3のSRT有理数丸め/A1原本参照、B4の相対ギミック時刻・物理初期状態・検証後採用を補正した。設計9文書のJSON例9件、ローカルリンク48件、7領域の台帳参照53件（台帳148 ID）を検査して成功。実装・実素材・GPU・MCPの検証は未実施で、台帳状態と開発順序は不変。

メイン作業環境を `f265ded` へfast-forwardした後、P2-WP-02/03の保存先実装を再確認。共通契約の `data/` は `bai_paths.data_dir()` 管理ルートとし、`BAI_DATA_DIR` を含む移動・再起動・欠損参照を実装試験へ追加した。P2-WP-04は未着手、Phase EとA1〜B4の完成状態は変えない。設計補正は `42b60da`（PR #13）、追補は後続コミットで記録する。

2026-10-21 PR #13 同期確認：上行の「WP-04は未着手」は当時の履歴であり、現在の作業位置ではない。`recovery/phase-e-20261019` は WP-05c まで取り込み済み。以後の作業位置は `WORK_STATE.json`、機能完成度は `P2_PORT_STATUS.json` と `PHASE_E_IMPLEMENTATION_STATUS.json` を毎回読み、固定したコミットから「次」を推定しない。PR #13 の詳細設計は引き続き未実装の仕様で、台帳状態も変えない。
