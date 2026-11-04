"""WP-L2 取込記録ストアの受け入れ試験（設計書 §4・WP-L2）。skip は使わない。
fixture は tests/fixtures/legacy_import/ の bundle_a。隔離ディレクトリ（tmp_path）だけに書く。"""
import copy
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import studio_v05_legacy_import_record as R
from legacy_import_fixtures import load_bundle
from studio_v05_legacy_import import LegacyImportError

PID = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"


def make_record(pid=PID):
    bundle = load_bundle("bundle_a")
    return {
        "schema": 1, "project_id": pid, "state": "applied",
        "created_at": "2026-11-04T00:00:00+00:00", "updated_at": "2026-11-04T00:00:01+00:00",
        "source": {
            "snapshot": {"saved_at": "2026-11-04T00:00:00+00:00", "sha256": "0" * 64},
            "bundle": bundle,
            "presence": {"/workspace": "value", "/workspace/character": "value",
                         "/workspace/stage": "value", "/workspace/lights": "value"},
            "live": {"music_dance": {"sha256": "1" * 64, "value": {"a": 1}}, "timeline_editor": None},
            "include": ["music_dance"], "fps_policy": "keep_if_same",
        },
        "target_before": {"fps": {"presence": "absent"}, "scene_revision": 0, "arrangement_revision": 0},
        "assets": [{"asset_id": "mmd:A:test.pmx", "legacy_ref": "mmd:A:test.pmx", "sha256": None}],
        "items": [{"id": "M4", "pointer": "/workspace/stage", "label": "ステージ", "status": "mapped",
                   "codes": ["UNIT_SEMANTICS_DIFFER"], "legacy_value": {"x": 1}, "step": 3},
                  {"id": "M7", "pointer": "/camera/keys", "label": "カメラ", "status": "kept",
                   "codes": ["CAMERA_KEYS_NOT_SUPPORTED"], "legacy_value": {"keys": []}, "step": None}],
        "steps": [{"n": 1, "kind": "fps", "status": "done", "before": {"presence": "absent"}, "after": 30},
                  {"n": 2, "kind": "scene_add", "status": "done", "instance_id": "a" * 32},
                  {"n": 3, "kind": "clip_place", "status": "pending", "clip_id": None},
                  {"n": 4, "kind": "clip_source", "status": "undone"},
                  {"n": 5, "kind": "clip_assign", "status": "undo_failed"},
                  {"n": 6, "kind": "playhead", "status": "done", "seconds": 4.0}],
        "undo": {"warnings": [], "failures": []}, "error": None,
    }


def rec_file(root, pid=PID):
    return Path(root) / R.DIR_NAME / (pid + ".json")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def tree(root):
    return sorted(p.relative_to(root).as_posix() for p in Path(root).rglob("*") if p.is_file())


def test_roundtrip_and_missing(tmp_path):
    assert R.read_record(tmp_path, PID) is None
    rec = make_record()
    R.write_record(tmp_path, PID, rec)
    assert R.read_record(tmp_path, PID) == rec
    assert R.read_record(tmp_path, OTHER) is None
    # 上書き保存も可能
    rec2 = copy.deepcopy(rec); rec2["state"] = "reverting"
    R.write_record(tmp_path, PID, rec2)
    assert R.read_record(tmp_path, PID) == rec2


@pytest.mark.parametrize("state", R.STATES)
def test_all_states_accepted(tmp_path, state):
    rec = make_record(); rec["state"] = state
    R.write_record(tmp_path, PID, rec)
    assert R.read_record(tmp_path, PID)["state"] == state


def _mut_missing(rec): del rec["undo"]
def _mut_extra(rec): rec["extra"] = 1
def _mut_pid(rec): rec["project_id"] = OTHER
def _mut_state(rec): rec["state"] = "done"
def _mut_kind(rec): rec["steps"][0]["kind"] = "bogus"
def _mut_status(rec): rec["steps"][0]["status"] = "ok"
def _mut_item_status(rec): rec["items"][0]["status"] = "skipped"
def _mut_schema(rec): rec["schema"] = 2
def _mut_schema_bool(rec): rec["schema"] = True
def _mut_step_n(rec): rec["steps"][0]["n"] = "1"
def _mut_source_missing(rec): del rec["source"]["live"]
def _mut_source_extra(rec): rec["source"]["x"] = 1
def _mut_presence(rec): rec["source"]["presence"]["/workspace"] = "maybe"
def _mut_undo_extra(rec): rec["undo"]["other"] = []
def _mut_step_missing(rec): del rec["steps"][0]["kind"]


MUTATIONS = [_mut_missing, _mut_extra, _mut_pid, _mut_state, _mut_kind, _mut_status, _mut_item_status,
             _mut_schema, _mut_schema_bool, _mut_step_n, _mut_source_missing, _mut_source_extra,
             _mut_presence, _mut_undo_extra, _mut_step_missing]


@pytest.mark.parametrize("mut", MUTATIONS, ids=lambda m: m.__name__)
def test_invalid_records_rejected_and_original_untouched(tmp_path, mut):
    R.write_record(tmp_path, PID, make_record())
    before = rec_file(tmp_path).read_bytes()
    bad = make_record(); mut(bad)
    with pytest.raises(R.RecordInvalid):
        R.write_record(tmp_path, PID, bad)
    assert rec_file(tmp_path).read_bytes() == before
    assert tree(tmp_path) == [R.DIR_NAME + "/" + PID + ".json"]
    with pytest.raises(R.RecordInvalid):
        R.validate_record(bad, PID)


def test_non_dict_and_bad_project_id(tmp_path):
    with pytest.raises(R.RecordInvalid):
        R.validate_record([], PID)
    for bad in ("../x", "", "abc", "AAAAAAAA-1111-4111-8111-111111111111", None):
        with pytest.raises(R.RecordInvalid):
            R.write_record(tmp_path, bad, make_record())
        with pytest.raises(R.RecordInvalid):
            R.read_record(tmp_path, bad)
    assert tree(tmp_path) == []


def test_too_large_rejected_original_untouched(tmp_path):
    R.write_record(tmp_path, PID, make_record())
    before = rec_file(tmp_path).read_bytes()
    big = make_record()
    big["items"][0]["legacy_value"] = {"blob": "x" * (R.MAX_BYTES + 1)}
    with pytest.raises(LegacyImportError) as e:
        R.write_record(tmp_path, PID, big)
    assert e.value.code == "RECORD_TOO_LARGE" and e.value.status == 422
    assert rec_file(tmp_path).read_bytes() == before
    assert tree(tmp_path) == [R.DIR_NAME + "/" + PID + ".json"]


def test_too_large_new_file_not_created(tmp_path):
    big = make_record()
    big["items"][0]["legacy_value"] = {"blob": "x" * (R.MAX_BYTES + 1)}
    with pytest.raises(LegacyImportError):
        R.write_record(tmp_path, PID, big)
    assert tree(tmp_path) == []


@pytest.mark.parametrize("content", [b"{broken", b"[]", b"", b'{"schema":1}',
                                     json.dumps({**make_record(), "project_id": OTHER}).encode()])
def test_broken_file_unreadable_and_not_overwritten(tmp_path, content):
    path = rec_file(tmp_path); path.parent.mkdir(parents=True)
    path.write_bytes(content)
    with pytest.raises(LegacyImportError) as e:
        R.read_record(tmp_path, PID)
    assert e.value.code == "RECORD_UNREADABLE" and e.value.status == 422
    with pytest.raises(LegacyImportError) as e:
        R.write_record(tmp_path, PID, make_record())
    assert e.value.code == "RECORD_UNREADABLE"
    with pytest.raises(LegacyImportError):
        R.archive_record(tmp_path, PID, datetime.now(timezone.utc))
    assert path.read_bytes() == content
    assert tree(tmp_path) == [R.DIR_NAME + "/" + PID + ".json"]


def test_oversized_file_unreadable(tmp_path):
    path = rec_file(tmp_path); path.parent.mkdir(parents=True)
    path.write_bytes(b" " * (R.MAX_BYTES + 1))
    with pytest.raises(LegacyImportError) as e:
        R.read_record(tmp_path, PID)
    assert e.value.code == "RECORD_UNREADABLE"


def test_archive_moves_to_history(tmp_path):
    rec = make_record(); rec["state"] = "reverted"
    R.write_record(tmp_path, PID, rec)
    original = rec_file(tmp_path).read_bytes()
    now = datetime(2026, 11, 4, 12, 34, 56, tzinfo=timezone.utc)
    dest = R.archive_record(tmp_path, PID, now)
    assert not rec_file(tmp_path).exists()
    hist = Path(tmp_path) / R.DIR_NAME / "history"
    files = sorted(hist.iterdir())
    assert files == [dest] and dest.name == PID + "-20261104T123456Z.json"
    assert dest.read_bytes() == original
    assert json.loads(dest.read_text(encoding="utf-8")) == rec
    assert R.read_record(tmp_path, PID) is None
    # 新しい記録を書ける
    R.write_record(tmp_path, PID, make_record())
    assert R.read_record(tmp_path, PID)["state"] == "applied"


def test_archive_none_when_missing_and_no_overwrite_on_same_second(tmp_path):
    now = datetime(2026, 11, 4, 0, 0, 0, tzinfo=timezone.utc)
    assert R.archive_record(tmp_path, PID, now) is None
    assert tree(tmp_path) == []
    R.write_record(tmp_path, PID, make_record())
    d1 = R.archive_record(tmp_path, PID, now)
    rec2 = make_record(); rec2["state"] = "rolled_back"
    R.write_record(tmp_path, PID, rec2)
    d2 = R.archive_record(tmp_path, PID, now)
    assert d1 != d2 and d1.exists() and d2.exists()
    assert json.loads(d1.read_text(encoding="utf-8"))["state"] == "applied"
    assert json.loads(d2.read_text(encoding="utf-8"))["state"] == "rolled_back"


def test_no_temp_files_left(tmp_path):
    R.write_record(tmp_path, PID, make_record())
    rec = make_record(); rec["state"] = "reverting"
    R.write_record(tmp_path, PID, rec)
    bad = make_record(); bad["state"] = "x"
    with pytest.raises(R.RecordInvalid):
        R.write_record(tmp_path, PID, bad)
    R.archive_record(tmp_path, PID, datetime(2026, 11, 4, tzinfo=timezone.utc))
    R.write_record(tmp_path, PID, make_record())
    assert not [n for n in tree(tmp_path) if ".tmp-" in n]
    assert tree(tmp_path) == [R.DIR_NAME + "/" + PID + ".json",
                              R.DIR_NAME + "/history/" + PID + "-20261104T000000Z.json"]


def test_other_projects_isolated(tmp_path):
    R.write_record(tmp_path, PID, make_record())
    R.write_record(tmp_path, OTHER, make_record(OTHER))
    b = sha(rec_file(tmp_path, OTHER))
    R.archive_record(tmp_path, PID, datetime(2026, 11, 4, tzinfo=timezone.utc))
    assert sha(rec_file(tmp_path, OTHER)) == b
