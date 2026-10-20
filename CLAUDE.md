# Claude Code / Claude Desktop 開発指示

**最初にルートの `AGENTS.md` を全文読み、特に「オーナー要求最優先・スコープ凍結（2026-10-19、最優先）」を遵守する。**

実装順、変更の完了条件、ユーザー側の確認タイミング、計画外追加の禁止はすべて `AGENTS.md` と `docs/roadmap/ROADMAP_JA.md` を正本とし、このファイルへ重複転記しない。

次に `docs/roadmap/PHASE_E_IMPLEMENTATION_STATUS.json` と最新のGit HEAD/未コミット差分を読み、次の承認済み未完成項目から着手する。変更ごとに実装・自動テスト・進捗更新・Gitコミットを行う。環境制約による未検証は隠さない。

作業の開始時に `python tools/work_state.py show` で前回の作業位置（Codex が書いたものを含む）を確認する。段階の開始時とコミットごとに `docs/handoff/WORK_STATE.json` を更新する（AGENTS.md「作業位置の記録」）。
