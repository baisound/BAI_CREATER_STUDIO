# 仕様の詳細が未確定の機能一覧（Codex 向け・仕様固め用）

作成 2026-10-20（所有者指示：「仕様だけ Codex に固めさせる。開発進行を邪魔しない箇所から」）。

## 調べた結果（要約）
- 機能台帳 `FEATURE_REGISTER.json` の 147 件のうち、**詳細設計まで固まっているのは P2（新UI移植）と Phase E（カメラ）の範囲だけ**。
- `FEATURE_DETAIL_JA.md` の各項目は、ほぼ全件が約300字の定型文（目的1行＋共通の受入条件）。
- Phase F・リップシンク・C・D・G・H の設計書は「第1稿／v1」で 1.5〜4KB の骨子のみ。画面・データ・API・受入条件・未決事項まで書かれていない。

## Codex が守ること（開発と衝突しないための規則）
1. **ブランチ**：`codex/specs` を `origin/claude/project-thread-8gcwq2` から作り、そこへ push する。開発中のブランチ（`claude/project-thread-8gcwq2`）へ直接 push しない。Claude Code 側がレビューして取り込む。
2. **書くのは新しいファイルだけ**：`docs/specs/<領域>_SPEC_JA.md`（領域ごとに1ファイル）。既存ファイル（`FEATURE_DETAIL_JA.md`・`ROADMAP_JA.md`・P2/Phase E の設計書・`docs/handoff/WORK_STATE.json`・台帳 JSON）は**編集しない**。リンクの追加は取り込み時に Claude Code 側で行う。
3. **コードは書かない**。仕様（要求）だけ。実装は、仕様をもとに詳細設計 → 批評3回 → 最終判定を通してから（AGENTS.md・所有者ルール）。
4. **優先順位を変えない・機能を足さない**。未承認候補 NF-001〜023 の仕様は書かない（所有者の承認が先）。思いついた追加は各仕様の末尾「未承認の候補」に1行で書くだけ。
5. **未決事項**は `O-<領域>-<番号>` で列挙し、既定案と理由を添える（所有者が一言で答えられる形）。
6. 文章はすべて日本語。主要シナリオ（MMD「歌ってみた」動画：VRM/PMX → ステージ → カメラ → BGM → VMD/FBX → エフェクト → 書き出し）での使われ方を必ず書く。
7. 各仕様に入れる節：目的／利用者の流れ（歌ってみた視点）／画面（新UIモック `studio/` のどの SCR か）／データと保存・復元／UI・WebMCP・標準MCP／受け入れ条件／テスト方針／未決事項／依存する機能ID／価値（売る側・使う側）。

## 固める順番（上から）

### A. 次に必要になる・今の開発と重ならない（最優先）
承認済みの順序は P2 → Phase E → **リップシンク・表情（＋BGM配置）** → **F** → **MMDエフェクト** → C → D → G → H。

| 順 | 領域（出力ファイル） | 対象ID | 今ある材料 | 特に詰めること |
|---|---|---|---|---|
| A1 | リップシンク・表情・BGM配置（`LIP_EXPRESSION_BGM_SPEC_JA.md`） | LIP-001〜004、LIP-009、BGM（歌の音声）の配置 | `EARLY_LIP_EXPRESSION_MME_DESIGN_JA.md`（第1稿）、`PHASE_D_MUSIC_FACE_SYNC_DETAIL_JA.md` | 所有者決定（2026-10-20）：BGM配置はリップシンクと同時に作る。音声の読込・波形表示・映像との同期・頭出し、SRT/歌声からの口パク生成、PMX/VRM の口モーフ対応、VMD 内の表情モーフとの重ね方。BGM に割り当てる機能IDの案も未決事項に入れる。 |
| A2 | 書き出し（`RENDER_EXPORT_SPEC_JA.md`） | RENDER-001〜010 | `PHASE_F_RENDER_PIPELINE_DESIGN_JA.md`（第1稿） | 投稿向けプリセット（1080p/60fps MP4・音声付き・縦動画）、音声の多重化、画面とのずれ検査、進捗・中断・再開。 |
| A3 | MMDエフェクト（`MMD_EFFECTS_SPEC_JA.md`） | RENDER-011〜015 | `EARLY_LIP_EXPRESSION_MME_DESIGN_JA.md` の MMDエフェクト節、`PHASE_G_LYRIC_MME_DETAIL_JA.md` | ブラウザー内で再現する範囲と、MMD 向けに設定だけ出力する範囲の線引き。 |

### B. 後の段階（Aの後に）
| 順 | 領域 | 対象ID | 今ある材料 |
|---|---|---|---|
| B1 | 複数ダンサー（Phase C） | DANCE-001〜007、DANCE-012 | `PHASE_C_MULTIDANCER_DETAIL_JA.md` v1 |
| B2 | 音楽・表情の残り（Phase D） | LIP-005〜008、LIP-010、LIP-011、LYRIC-006 | `PHASE_D_MUSIC_FACE_SYNC_DETAIL_JA.md` v1 |
| B3 | 歌詞・ステージ（Phase G） | LYRIC-001〜005、LYRIC-007〜012 | `PHASE_G_LYRIC_MME_DETAIL_JA.md` v1 |
| B4 | 格闘・ステージギミック（Phase H） | DANCE-008〜011、LYRIC-010、MOTION-021 | `PHASE_H_COMBAT_STAGE_DETAIL_JA.md` v1 |

### C. 保留（今の開発と重なるため、指示があるまで書かない）
| 対象 | 理由 |
|---|---|
| MOTION-004〜009、MOTION-011〜022、DATA-001〜007 | P2 ④⑤（3D表示・モーション・タイムライン）で既存コードを移植中。移植が終わってから仕様を固める。 |
| MOTION-010、CAM-003/006/007 のリグ編集（Unreal Engine 方式） | Claude Code 側で `RIG_EDITING_SPEC_20261020_JA.md` を作成中（2026-10-20 所有者決定）。 |

### 対象外（すでに固まっている、または別の正本がある）
- CAM-001〜018：Phase E 詳細設計 v4（承認済み）。
- DATA-008〜015、MOTION-002/003/016：P2 詳細設計 v5（承認済み）。
- OBS-001〜009：`PHASE_00_LOGGING_FIRST_JA.md`（仕様決定済み）。
- UX-001〜008：`UI_UX_DESIGN_STANDARD_JA.md`・`STUDIO_DESIGN_SYSTEM_JA.md`。
- CORE-001〜013：AGENTS.md 等の横断ルール。
- REVIEW-001〜012：旧 v02 からの移植候補（`PHASE_00_INTEGRATION_JA.md`）。P2 の後に扱いを決める。
- NF-001〜023：未承認候補。

## 取り込みの流れ
Codex が `codex/specs` に push → Claude Code が内容を確認し、台帳・FEATURE_DETAIL へのリンクを足して開発ブランチへ取り込む → 実装する段階で詳細設計と批評・判定にかける。
