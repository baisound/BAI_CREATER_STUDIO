# 作業位置の記録（Claude Code ⇄ Codex の引き継ぎ）

クレジット切れなどで Claude Code と Codex を行き来しても、**どこまで進んだか**を取り違えないための仕組み。

## ファイル

| ファイル | 役割 |
|---|---|
| `docs/handoff/WORK_STATE.json` | **今どこにいるか**の1枚。現在の作業・段階・次にやること・未検証・止まっている理由・所有者への質問・直近30件の履歴。 |
| `tools/work_state.py` | 上を表示・更新・検査する道具（Python 標準ライブラリのみ、Windows/Linux 可）。 |
| `docs/roadmap/PHASE_E_IMPLEMENTATION_STATUS.json` ほか機能台帳 | **各機能の完成度**の正本。WORK_STATE.json はここを写さず、作業の位置だけを持つ。 |

## 担当（どちらのツールでも同じ）

1. **始める前**：`python tools/work_state.py show` を実行し、`read_first` の文書と `git log -5`・`git status` を見る。`status` が `in_progress` なら前の担当は途中で止まっている。その段階から再開する。
2. **段階に入る前**：`python tools/work_state.py start --agent <claude-code|codex> --task "…" --step "…"` を記録し、**コミットして push してから**作業に入る。クレジットは予告なく切れるため、終わってから書くのでは間に合わない。
3. **区切りごと（コミットごと）**：`python tools/work_state.py done --agent … --summary "…" --next "…" --unverified "…"` を実行し、コードと同じコミットに含めて push する。
4. 止まったら `--blocked "理由"` を付けて `done` を実行する（status が blocked になる）。
5. 途中のコードでもこまめにコミット・push する（`WIP:` を付けてよい）。手元にしかない変更は、別のツールからは見えない。

`python tools/work_state.py check` で形式を検査できる（`tests/test_work_state.py` でも自動検査）。
