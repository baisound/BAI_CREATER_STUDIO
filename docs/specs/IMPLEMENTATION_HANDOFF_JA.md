# 承認済みA1〜B4 実装引継ぎ（設計入口）

更新: 2026-10-21。状態: **設計を固定、機能は未実装・未検証**。オーナーの `O-LIP/RENDER/MMD/DANCE/MUSIC/LYRIC/COMBAT` の選択はすべて記録済み。実装時に製品上の選択を再質問せず、以下の契約と合格条件に従う。実データ・GPU・外部ツールで初めて分かる不適合は、対象要件IDと証拠を記録してアダプター/試験を修正し、勝手に機能を追加しない。

## 最初に読む順

1. `AGENTS.md`、[ロードマップ入口](../roadmap/README_JA.md)、[進捗正本](../roadmap/PHASE_E_IMPLEMENTATION_STATUS.json)（JSONリンクは下の表とは別）。実装順は **P2 → E → A1 → F/A2 → A3 → C/B1 → D/B2 → G/B3 → H/B4**。Phase B残課題はE/Fを止めない。
2. [共通契約](IMPLEMENTATION_COMMON_CONTRACT_JA.md): schema=2統合保存、revision、時刻/座標、UI・WebMCP・標準MCP同値、失敗時不変。
3. 着手領域の「要求仕様 → 所有者決定 → 実装設計」を表の順に読む。実装設計の `WP` を小さくコミットし、各コードコミットをロードマップ・機能台帳・試験・未検証・Git SHAへ結ぶ。

| 順 | 対象ID | 要求 / 決定 / 実装設計 | 先に満たす依存 |
|---|---|---|---|
| A1 | `AUDIO-001`, `LIP-001`〜`004`, `LIP-009` | [要求](LIP_EXPRESSION_BGM_SPEC_JA.md) / [決定](A1_LIP_BGM_DECISIONS_JA.md) / [実装](A1_LIP_IMPLEMENTATION_DESIGN_JA.md) | P2、E保存、実モデル/VMD |
| A2/F | `RENDER-001`〜`010` | [要求](RENDER_EXPORT_SPEC_JA.md) / [決定](A2_RENDER_DECISIONS_JA.md) / [実装](A2_RENDER_IMPLEMENTATION_DESIGN_JA.md) | Eカメラ、A1音声、固定F描画 |
| A3/FX | `RENDER-011`〜`015` | [要求](MMD_EFFECTS_SPEC_JA.md) / [決定](A3_MMD_EFFECTS_DECISIONS_JA.md) / [実装](A3_MMD_EFFECTS_IMPLEMENTATION_DESIGN_JA.md) | A2描画/検品、カメラDOFの単独責務 |
| B1/C | `DANCE-001`〜`007`, `DANCE-012` | [要求](MULTI_DANCER_SPEC_JA.md) / [決定](B1_MULTI_DANCER_DECISIONS_JA.md) / [実装](B1_MULTI_DANCER_IMPLEMENTATION_DESIGN_JA.md) | P2人物/ステージ、A2描画 |
| B2/D | `LIP-005`〜`008`, `LIP-010/011`, `LYRIC-006` | [要求](MUSIC_EXPRESSION_REMAINING_SPEC_JA.md) / [決定](B2_MUSIC_EXPRESSION_DECISIONS_JA.md) / [実装](B2_MUSIC_EXPRESSION_IMPLEMENTATION_DESIGN_JA.md) | A1、B1時刻参照 |
| B3/G | `LYRIC-001`〜`005`, `LYRIC-007`〜`012` | [要求](LYRICS_STAGE_SPEC_JA.md) / [決定](B3_LYRICS_STAGE_DECISIONS_JA.md) / [実装](B3_LYRICS_STAGE_IMPLEMENTATION_DESIGN_JA.md) | A1音声、A2出力、B2拍、P2基本ステージ |
| B4/H | `DANCE-008`〜`011`, `LYRIC-010`イベント, `MOTION-021` | [要求](COMBAT_STAGE_SPEC_JA.md) / [決定](B4_COMBAT_STAGE_DECISIONS_JA.md) / [実装](B4_COMBAT_IMPLEMENTATION_DESIGN_JA.md) | B1人物/道具、B3実pivot、A2出力 |

## 実装者の判定手順

1. `git status` と現行P2/Eの実装状態を確認する。設計時の `project_state_bundle.py` はschema=1/3キーに厳格で、電源断耐性は未完成。現行成果が進んでいても **既存データを上書きしない**。共通契約のschema=2/ジャーナルをE側の実装と統合し、既存APIと旧schema=1の往復を先にテストする。
2. 対象WPの純粋データ検証・計算→サービス/API→UI→WebMCP/標準MCP→保存復元→実素材/出力の順で進む。APIを迂回したUI専用計算やMCP専用保存を作らない。実装範囲外のモックは `◇ 未実装` を保つ。
3. 外部依存は工程で取得版とファイルhash、利用許諾、Windows/Linuxを記録する: A1の日本語アラインメント、A2のFFmpeg+GPU、A3の外部MME素材、B2の顔モデル、B3の固定JIZURA commitとBlender/mmd_tools、B4のAmmo/MMDPhysics。機能が使えない環境は `capability_unavailable` と手動/対応済み経路を表示し、出力成功を偽らない。
4. 対象IDごとの試験と原素材hash不変、UI・両MCPの同値、プロセス再起動後の保存復元を証拠化する。Windows/LinuxやGPU/実MMDを試していない場合はその範囲を未検証として台帳に残す。Phase E全機能の実装が終わるまで所有者に動作確認を求めない。

## 初回の実装タスク

先行P2/Eが完了した直後の作業はA1-01（歌音声の管理取込・配置）から。A1仕様のUI表示を実波形へ置換し、音声素材ID/サンプル頭出し/共通Fを保存・再起動・再生で通す。`AUDIO-001` と `DATA-008` の証拠を残してからA1-02のSRT/モーフVMDへ進む。後続の各WPも表の順序と実装設計内の個別ゲートに従う。

## 設計上の未検証と扱い

本書と7つの実装設計はコードを動かした証拠ではない。外部モデル・ソルバー・GPU・実MMD・日本語音声の品質は導入時の実測が必要で、実測失敗は各IDの機能未完成として扱う。未承認の `NF-*` 機能、外部候補素材の無断同梱、JIZURA全機能の完全移植、Ray-MMD `.fx` のブラウザー実行はこの設計に含めない。製品範囲の判断はこれ以上要求せず、実装上の失敗は対象IDと再現ログで修正する。
