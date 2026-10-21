#!/usr/bin/env python3
"""作業位置の記録（docs/handoff/WORK_STATE.json）を表示・更新・検査する。

Claude Code と Codex のどちらに切り替えても、続きから再開できるようにするための道具。
標準ライブラリだけで動き、Windows / Linux の両方で使える。

使い方:
  python tools/work_state.py show
  python tools/work_state.py start --agent codex --task "P2-WP-01 保存・読込" --step "features/project.js を作る"
  python tools/work_state.py done  --agent codex --summary "project.js を作成、テスト3件追加" \
        --next "project-view.js を作る" --unverified "実ブラウザー未確認"
  python tools/work_state.py check
"""
import argparse
import datetime as _dt
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATE = ROOT / "docs" / "handoff" / "WORK_STATE.json"
HISTORY_LIMIT = 30
AGENTS = ("claude-code", "codex", "other")
STATUSES = ("in_progress", "done", "blocked")
REQUIRED = {
    "schema_version": int,
    "updated_at": str,
    "updated_by": str,
    "branch": str,
    "head_at_update": str,
    "current": dict,
    "next_steps": list,
    "unverified": list,
    "blockers": list,
    "owner_questions": list,
    "read_first": list,
    "history": list,
}
CURRENT_REQUIRED = ("task", "status", "step")


def _git(*args):
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                              text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def _now():
    return _dt.datetime.now(_dt.timezone.utc).astimezone().isoformat(timespec="seconds")


def load():
    with STATE.open(encoding="utf-8") as f:
        return json.load(f)


def save(state):
    tmp = STATE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(STATE)


def validate(state):
    errors = []
    for key, typ in REQUIRED.items():
        if key not in state:
            errors.append(f"項目がありません: {key}")
        elif not isinstance(state[key], typ):
            errors.append(f"型が違います: {key}（{typ.__name__} が必要）")
    cur = state.get("current")
    if isinstance(cur, dict):
        for key in CURRENT_REQUIRED:
            if not isinstance(cur.get(key), str) or not cur.get(key):
                errors.append(f"current.{key} が空です")
        if cur.get("status") not in STATUSES:
            errors.append(f"current.status は {STATUSES} のどれか: {cur.get('status')!r}")
    if state.get("updated_by") not in AGENTS:
        errors.append(f"updated_by は {AGENTS} のどれか: {state.get('updated_by')!r}")
    if isinstance(state.get("history"), list) and len(state["history"]) > HISTORY_LIMIT:
        errors.append(f"history が {HISTORY_LIMIT} 件を超えています")
    for i, path in enumerate(state.get("read_first") or []):
        if not (ROOT / path).exists():
            errors.append(f"read_first[{i}] のファイルがありません: {path}")
    return errors


def _record(state, agent, event, text):
    state["updated_at"] = _now()
    state["updated_by"] = agent
    state["branch"] = _git("rev-parse", "--abbrev-ref", "HEAD") or state.get("branch", "")
    state["head_at_update"] = _git("rev-parse", "--short", "HEAD") or state.get("head_at_update", "")
    state["history"].insert(0, {"at": state["updated_at"], "by": agent, "event": event,
                                "head": state["head_at_update"], "text": text})
    del state["history"][HISTORY_LIMIT:]


def cmd_show(_args):
    s = load()
    cur = s["current"]
    print(f"最終更新: {s['updated_at']}（{s['updated_by']}）  ブランチ: {s['branch']}  更新時HEAD: {s['head_at_update']}")
    print(f"現在の作業: {cur['task']}  [{cur['status']}]")
    print(f"  段階: {cur['step']}")
    if cur.get("design_doc"):
        print(f"  設計書: {cur['design_doc']}")
    for title, key in (("次にやること", "next_steps"), ("未検証", "unverified"),
                       ("止まっている理由", "blockers"), ("所有者への質問待ち", "owner_questions"),
                       ("最初に読む", "read_first")):
        if s[key]:
            print(f"{title}:")
            for item in s[key]:
                print(f"  - {item}")
    dirty = _git("status", "--porcelain")
    if dirty:
        print("注意: コミットされていない変更があります（前の担当が途中で止まった可能性）:")
        print("  " + "\n  ".join(dirty.splitlines()[:20]))
    if cur["status"] == "in_progress":
        print("注意: 前の担当は作業途中でした。上の段階から再開し、git log と差分で進み具合を確かめてください。")


def cmd_start(args):
    s = load()
    s["current"] = {"task": args.task, "status": "in_progress", "step": args.step,
                    "design_doc": args.design_doc or s["current"].get("design_doc", "")}
    _record(s, args.agent, "start", f"{args.task}: {args.step}")
    save(s)
    print("記録しました（作業開始）。この変更もコミットしてから作業に入ってください。")


def cmd_done(args):
    s = load()
    s["current"]["status"] = "blocked" if args.blocked else "done"
    if args.next:
        s["next_steps"] = args.next
    if args.unverified is not None:
        s["unverified"] = args.unverified
    if args.blocked:
        s["blockers"] = args.blocked
    elif args.clear_blockers:
        s["blockers"] = []
    _record(s, args.agent, "blocked" if args.blocked else "done", args.summary)
    save(s)
    print("記録しました（区切り）。コミットに含めてください。")


def cmd_check(_args):
    errors = validate(load())
    if errors:
        print("WORK_STATE.json に問題があります:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("WORK_STATE.json は正しい形式です。")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description="作業位置の記録を表示・更新・検査する")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("show").set_defaults(func=cmd_show)
    sub.add_parser("check").set_defaults(func=cmd_check)
    ps = sub.add_parser("start")
    ps.add_argument("--agent", choices=AGENTS, required=True)
    ps.add_argument("--task", required=True)
    ps.add_argument("--step", required=True)
    ps.add_argument("--design-doc")
    ps.set_defaults(func=cmd_start)
    pd = sub.add_parser("done")
    pd.add_argument("--agent", choices=AGENTS, required=True)
    pd.add_argument("--summary", required=True)
    pd.add_argument("--next", action="append", help="次にやること（複数可。指定すると置き換え）")
    pd.add_argument("--unverified", action="append", help="未検証の事項（複数可。指定すると置き換え）")
    pd.add_argument("--blocked", action="append", help="止まっている理由（指定すると status=blocked）")
    pd.add_argument("--clear-blockers", action="store_true")
    pd.set_defaults(func=cmd_done)
    args = p.parse_args(argv)
    return args.func(args) or 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
