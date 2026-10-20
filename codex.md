# Codex 仕様策定作業

- 作業ブランチ: `codex/specs`
- 作業場所: `D:\BAI\BAI_CREATER_STUDIO\worktrees\specs`
- 起点: `origin/recovery/phase-e-20261019` の `bfa1033`（2026-10-20 19:35 JST、作成時点のローカル最新参照）。`main` は起点にしない。
- 依頼の入口: `docs/handoff/SPEC_BACKLOG_FOR_CODEX_JA.md`

## このブランチの範囲

Codex は引き継ぎ文書にある未確定仕様を日本語で固める。既存の機能台帳・ロードマップの優先順位・`docs/handoff/WORK_STATE.json` は変更しない。Claude Code が進めている P2 の作業位置と混同しない。

出力は `docs/specs/` の領域別新規ファイルとする。A1（リップシンク・表情・BGM配置）、A2（書き出し）、A3（MMDエフェクト）を先に扱い、その後 B1〜B4 を扱う。各仕様には対象 ID、歌ってみた制作の利用者の流れ、画面、保存・復元、手動 UI・WebMCP・標準 MCP、受け入れ条件、テスト方針、依存関係、売る側・使う側の価値、既定案付き未決事項を記す。

所有者の後続指示により、仕様に対応する新 UI モックへの区画追加、`SCR-26/27` の2ページ、生成した構想画像と操作可能な仮時間軸もこのブランチで扱う。いずれも未実装／未保存の表示を保ち、実機能の完成とは扱わない。詳細と検証結果は `docs/specs/UI_MOCK_PLACEMENT_SPEC_JA.md` と `docs/specs/SPEC_PROGRESS_JA.md` を参照する。このファイルは Codex 作業の入口であり、製品の機能完成を示すものではない。
