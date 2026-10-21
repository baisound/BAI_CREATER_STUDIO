import importlib.util
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("work_state", ROOT / "tools" / "work_state.py")
ws = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ws)


def test_committed_state_is_valid():
    assert ws.validate(ws.load()) == []


def test_start_and_done_update_state(tmp_path, monkeypatch):
    state_file = tmp_path / "WORK_STATE.json"
    state_file.write_text(ws.STATE.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(ws, "STATE", state_file)
    ws.main(["start", "--agent", "codex", "--task", "T", "--step", "S1"])
    s = json.loads(state_file.read_text(encoding="utf-8"))
    assert s["current"] == {**s["current"], "task": "T", "status": "in_progress", "step": "S1"}
    assert s["updated_by"] == "codex" and s["history"][0]["event"] == "start"
    ws.main(["done", "--agent", "claude-code", "--summary", "ok", "--next", "N1", "--unverified", "U1"])
    s = json.loads(state_file.read_text(encoding="utf-8"))
    assert s["current"]["status"] == "done"
    assert s["next_steps"] == ["N1"] and s["unverified"] == ["U1"]
    assert ws.validate(s) == []
    ws.main(["done", "--agent", "codex", "--summary", "x", "--blocked", "B"])
    s = json.loads(state_file.read_text(encoding="utf-8"))
    assert s["current"]["status"] == "blocked" and s["blockers"] == ["B"]


def test_history_is_capped(tmp_path, monkeypatch):
    state_file = tmp_path / "WORK_STATE.json"
    state_file.write_text(ws.STATE.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(ws, "STATE", state_file)
    for i in range(ws.HISTORY_LIMIT + 5):
        ws.main(["start", "--agent", "codex", "--task", "T", "--step", str(i)])
    s = json.loads(state_file.read_text(encoding="utf-8"))
    assert len(s["history"]) == ws.HISTORY_LIMIT
    assert ws.validate(s) == []


def test_validate_rejects_bad_state():
    bad = ws.load()
    bad["current"]["status"] = "finished"
    bad["updated_by"] = "someone"
    del bad["next_steps"]
    errors = ws.validate(bad)
    assert len(errors) == 3
