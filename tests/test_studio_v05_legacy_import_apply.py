"""WP-L3 適用・打ち消し・取消の受け入れ試験（設計書 §5.2〜§5.4・§5.7 R1/R3・WP-L3）。

隔離した tmp_path の data だけに書く（実データ data/ には触れない）。skip は使わない。
fixture は tests/fixtures/legacy_import/ の bundle_a・bundle_b。
R1: 各試験の前後で、書き込み対象でないファイル（スナップショット、旧の現行ファイル、素材の原本、
    他の作品の全ストア、対象作品の render_ranges・track_layouts・scene_models、カタログの他の行）の
    SHA-256 が一致することを fixture が自動で確かめる。
"""
import copy
import hashlib
import json
import sys
import threading
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import studio_project_catalog as catalog_mod
import studio_project_snapshots as snapshots
import studio_v05_arrangement as arrangement
import studio_v05_legacy_import as L
import studio_v05_legacy_import_record as R
import studio_v05_multi_motion
import studio_v05_playhead as playhead
import studio_v05_render_range
import studio_v05_scene_instances as scene
import studio_v05_scene_model
import studio_v05_track_layout as layout
from legacy_import_fixtures import load_bundle

STAGE_ID = "library:0123456789abcdef01234567"
CHAR_ID = "mmd:A:test.pmx"
MOTION_ID = "mmd:vmd:dance.vmd"
MUSIC_ID = "library:00112233445566778899aabb"


def make_assets():
    return [
        {"id": CHAR_ID, "name": "test.pmx", "format": "PMX", "kind": "A", "source": "mmd", "available": True},
        {"id": STAGE_ID, "name": "テストステージ", "format": "GLB", "kind": "stage", "source": "library",
         "filename": "stage.glb", "available": True},
        {"id": "integrated:foo.glb", "name": "foo.glb", "format": "GLB", "kind": "model", "source": "integrated",
         "filename": "foo.glb", "available": True},
        {"id": MOTION_ID, "name": "dance.vmd", "filename": "dance.vmd", "format": "VMD", "kind": "motion",
         "source": "mmd", "available": True},
        {"id": MUSIC_ID, "name": "song.wav", "filename": "song.wav", "format": "WAV", "kind": "audio",
         "source": "library", "available": True},
    ]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class Env:
    def __init__(self, tmp_path, bundle="bundle_a"):
        self.data = tmp_path / "data"
        self.data.mkdir()
        self.catalog = self.data / "studio_v05_catalog.json"
        self.assets = make_assets()
        self.target = catalog_mod.create(self.catalog, "Target")["id"]
        self.other = catalog_mod.create(self.catalog, "Other")["id"]
        self.dirs = {k: self.data / ("studio_v05_" + k) for k in
                     ("snapshots", "scene_instances", "scene_models", "arrangements", "playheads",
                      "track_layouts", "render_ranges")}
        self.ignore_paths = set()
        # 旧の現行ファイルと素材の原本（読まれても書かれてもいけない）
        for name in ("project_state.json", "camera_project.json", "project_state.workspace.json",
                     "music_dance_project.json", "timeline_editor.json", "manifest.json", "mmd_assets.json"):
            (self.data / name).write_bytes(("legacy " + name).encode())
        (self.data / "integrated_v02").mkdir()
        (self.data / "integrated_v02" / "user_assets.json").write_bytes(b"{}")
        self.files = {}
        for aid, fname in ((CHAR_ID, "test.pmx"), (STAGE_ID, "stage.glb")):
            p = self.data / "originals" / fname
            p.parent.mkdir(exist_ok=True)
            p.write_bytes(("original " + fname).encode() * 100)
            self.files[aid] = p
        # 他の作品: すべてのストアに内容を入れる
        snapshots.save(self.dirs["snapshots"], self.catalog, self.other, load_bundle("bundle_b"))
        studio_v05_scene_model.set_model(self.dirs["scene_models"], self.catalog, self.other, CHAR_ID,
                                         {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
                                         0, self.assets)
        scene.mutate(self.dirs["scene_instances"], self.dirs["scene_models"], self.catalog, self.other, "add", 0,
                     self.assets, asset_id=STAGE_ID,
                     transform={"position": [1, 2, 3], "rotation": [0, 0, 0], "scale": [1, 1, 1]})
        arrangement.place(self.dirs["arrangements"], self.catalog, self.other, CHAR_ID, "model", 0, 5, 0,
                          self.assets)
        playhead.update(self.dirs["playheads"], self.catalog, self.other, 5.0, 0)
        layout.set_flags(self.dirs["track_layouts"], self.catalog, self.other, 0, ["effect"], [])
        studio_v05_render_range.save(self.dirs["render_ranges"], self.dirs["arrangements"], self.catalog,
                                     self.other, 0, 1, None, None)
        catalog_mod.set_fps(self.catalog, self.other, 60)
        # 対象作品: 空。ただし track_layouts・scene_models・render_ranges のファイルはある
        studio_v05_scene_model.set_model(self.dirs["scene_models"], self.catalog, self.target, None, None, 0,
                                         self.assets)
        layout.set_flags(self.dirs["track_layouts"], self.catalog, self.target, 0, [], [])
        studio_v05_render_range.save(self.dirs["render_ranges"], self.dirs["arrangements"], self.catalog,
                                     self.target, 0, 0, None, None)
        self.save_snapshot(bundle)
        self.before = self.fingerprint()
        self.other_row = self.row(self.other)

    # --- 基本操作 ---
    def save_snapshot(self, bundle):
        snapshots.save(self.dirs["snapshots"], self.catalog, self.target, load_bundle(bundle))

    def asset_path(self, asset_id):
        return self.files.get(asset_id)

    def collect(self, include=()):
        return L.collect(self.data, self.target, list(include), self.assets, {"files": [], "mapping": {}},
                         self.asset_path)

    def preview(self, **kw):
        return L.plan(self.collect(kw.get("include", ())), **kw)

    def request(self, preview=None, **kw):
        preview = preview or self.preview(**{k: v for k, v in kw.items() if k in ("include", "fps_policy")})
        req = {"id": self.target, "expected": preview["expected"], "include": list(kw.get("include", [])),
               "fps_policy": kw.get("fps_policy", "keep_if_same"), "confirm": True}
        return req

    def apply(self, request=None, **kw):
        return L.apply(self.data, request if request is not None else self.request(**kw), self.assets, {"files": [], "mapping": {}},
                       self.asset_path)

    def revert(self):
        return L.revert(self.data, {"id": self.target, "confirm": True}, self.assets)

    def record(self):
        return R.read_record(self.data, self.target)

    def row(self, pid):
        return next(p for p in catalog_mod.load(self.catalog)["projects"] if p["id"] == pid)

    def scene(self):
        return scene.read(self.dirs["scene_instances"], self.dirs["scene_models"], self.catalog, self.target)

    def arr(self):
        return arrangement.read(self.dirs["arrangements"], self.catalog, self.target)

    def ph(self):
        return playhead.read(self.dirs["playheads"], self.catalog, self.target)

    def state(self):
        s, a = self.scene(), self.arr()
        return {"instances": s["instances"], "face_keys": s["face_keys"], "camera": s["camera"], "clips": a["clips"]}

    def add_instance(self, asset_id, **kw):
        s = self.scene()
        return scene.mutate(self.dirs["scene_instances"], self.dirs["scene_models"], self.catalog, self.target,
                            "add", s["revision"], self.assets, asset_id=asset_id,
                            transform=kw.get("transform", {"position": [0, 0, 0], "rotation": [0, 0, 0],
                                                           "scale": [1, 1, 1]}))

    # --- R1 ---
    def mine(self, path):
        """対象作品自身のストア（書き込まれてよい）。"""
        rel = path.relative_to(self.data)
        return (rel.parts[0] in ("studio_v05_scene_instances", "studio_v05_arrangements", "studio_v05_playheads",
                                 "studio_v05_legacy_imports") and (len(rel.parts) > 1 and (
                                     rel.parts[0] == "studio_v05_legacy_imports"
                                     or rel.parts[1] == self.target + ".json"))) \
            or rel.as_posix() in self.ignore_paths

    def fingerprint(self):
        out = {}
        for p in sorted(self.data.rglob("*")):
            if p.is_file() and not self.mine(p) and p != self.catalog:
                out[p.relative_to(self.data).as_posix()] = sha(p)
        rows = [r for r in catalog_mod.load(self.catalog)["projects"] if r["id"] != self.target]
        out["catalog:others"] = json.dumps(rows, sort_keys=True)
        return out

    def leftover_tmp(self):
        return [p for p in self.data.rglob("*") if ".tmp-" in p.name or p.suffix == ".tmp"]


@pytest.fixture
def events(monkeypatch):
    calls = []
    monkeypatch.setattr(L, "event", lambda name, level="info", **f: calls.append((name, level, f)))
    return calls


@pytest.fixture
def env(tmp_path, events):
    e = Env(tmp_path)
    yield e
    now, was = e.fingerprint(), dict(e.before)
    for rel in e.ignore_paths:  # 試験が意図して変えたファイルは除く
        now.pop(rel, None)
        was.pop(rel, None)
    assert now == was, "R1: 書き込み対象でないファイルが変わった"
    assert e.leftover_tmp() == []


def code_of(excinfo):
    return excinfo.value.code


# ======================================================================================
def test_apply_success_bundle_a(env, events):
    result = env.apply()
    rec = env.record()
    assert rec["state"] == "applied" and result["record"]["state"] == "applied"
    assert all(s["status"] == "done" for s in rec["steps"])
    assert [s["kind"] for s in rec["steps"]] == ["fps", "scene_add", "scene_add", "playhead"]
    inst = env.scene()["instances"]
    assert len(inst) == 2
    char = next(i for i in inst if i["asset_id"] == CHAR_ID)
    stage = next(i for i in inst if i["asset_id"] == STAGE_ID)
    assert char["transform"] == {"position": [1.5, 0, -2], "rotation": [0, 90, 0], "scale": [1.2, 1.2, 1.2]}
    assert stage["transform"]["scale"] == [2, 2, 2]
    assert rec["steps"][1]["instance_id"] == char["id"] and rec["steps"][2]["instance_id"] == stage["id"]
    assert rec["steps"][1]["pre_ids"] == [] and rec["steps"][2]["pre_ids"] == [char["id"]]
    assert env.row(env.target)["fps"] == 30 and result["project"]["fps"] == 30
    assert env.ph()["seconds"] == 4.0
    assert rec["source"]["bundle"] == load_bundle("bundle_a")
    assert rec["source"]["snapshot"]["sha256"] == sha(env.dirs["snapshots"] / (env.target + ".json"))
    assert rec["target_before"] == {"fps": {"presence": "absent"}, "scene_revision": 0, "arrangement_revision": 0}
    assert [a["sha256"] for a in rec["assets"]] == [sha(env.files[CHAR_ID]), sha(env.files[STAGE_ID])]
    assert rec["error"] is None and rec["undo"] == {"warnings": [], "failures": []}
    # 保管した項目も記録に残る
    assert any(i["id"] == "M7" and i["status"] == "kept" for i in rec["items"])
    assert env.row(env.other) == env.other_row


def test_asset_hash_null_when_original_unreadable(env):
    env.files[CHAR_ID] = None
    env.files[STAGE_ID] = env.data / "no_such_file"
    env.apply()
    assert [a["sha256"] for a in env.record()["assets"]] == [None, None]


# ---- 失敗の注入 ----------------------------------------------------------------------
def assert_clean(env, rec_state):
    assert env.record()["state"] == rec_state
    assert env.scene()["instances"] == []
    assert "fps" not in env.row(env.target)
    assert env.arr()["clips"] == []
    assert env.row(env.other) == env.other_row


def test_failure_in_playhead_update_rolls_back(env, events, monkeypatch):
    def boom(*a, **k):
        raise OSError("disk full")
    monkeypatch.setattr(playhead, "update", boom)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply()
    assert code_of(e) == "APPLY_FAILED" and e.value.status == 500 and e.value.state == "rolled_back"
    assert "取込前の状態に戻しました" in e.value.message
    assert_clean(env, "rolled_back")
    rec = env.record()
    assert rec["error"]["type"] == "OSError" and "disk full" in rec["error"]["message"]
    assert [s["status"] for s in rec["steps"]] == ["undone"] * 4
    assert env.scene()["revision"] == 4  # add, add, remove, remove: revision は増える一方


def test_failure_in_second_scene_add_rolls_back(env, monkeypatch):
    real = scene.mutate
    seen = {"adds": 0}

    def flaky(*a, **k):
        if k.get("action") == "add":
            seen["adds"] += 1
            if seen["adds"] == 2:
                raise scene.SceneInstancesError("injected")
        return real(*a, **k)
    monkeypatch.setattr(scene, "mutate", flaky)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply()
    assert code_of(e) == "APPLY_FAILED" and e.value.state == "rolled_back"
    assert_clean(env, "rolled_back")
    assert [s["status"] for s in env.record()["steps"]] == ["undone"] * 4


def test_revision_conflict_during_apply_is_target_changed_and_rolled_back(env, monkeypatch):
    def conflict(*a, **k):
        raise playhead.PlayheadError("Revision conflict")
    monkeypatch.setattr(playhead, "update", conflict)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply()
    assert code_of(e) == "TARGET_CHANGED" and e.value.status == 409 and e.value.state == "rolled_back"
    assert_clean(env, "rolled_back")


@pytest.mark.parametrize("fail_on", [1, 2])
def test_interrupted_mutate_found_by_pre_ids_and_asset_id(env, monkeypatch, fail_on):
    """mutate が「本物を呼んだあと例外」: 新しいIDを記録に書けない状況。"""
    real = scene.mutate
    seen = {"adds": 0}

    def real_then_raise(*a, **k):
        out = real(*a, **k)
        if k.get("action") == "add":
            seen["adds"] += 1
            if seen["adds"] == fail_on:
                raise OSError("power cut after write")
        return out
    monkeypatch.setattr(scene, "mutate", real_then_raise)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply()
    assert code_of(e) == "APPLY_FAILED" and e.value.state == "rolled_back"
    assert_clean(env, "rolled_back")
    steps = env.record()["steps"]
    # 止まった手順は instance_id を持たないまま、pre_ids と asset_id から相手が特定されて消えた
    stuck = [s for s in steps if s["kind"] == "scene_add"][fail_on - 1]
    assert stuck["instance_id"] is None and stuck["status"] == "undone"


def test_apply_stopped_midway_then_revert_uses_journal(env, monkeypatch):
    """applying のまま止まった（プロセス停止）記録を、取消が日誌で後始末する。"""
    real = scene.mutate
    seen = {"adds": 0}

    def die(*a, **k):
        if k.get("action") == "add":
            seen["adds"] += 1
            if seen["adds"] == 2:
                raise KeyboardInterrupt  # Exception ではないので apply の後始末も走らない（強制停止の再現）
        return real(*a, **k)
    monkeypatch.setattr(scene, "mutate", die)
    with pytest.raises(KeyboardInterrupt):
        env.apply()
    monkeypatch.setattr(scene, "mutate", real)
    assert env.record()["state"] == "applying" and len(env.scene()["instances"]) == 1
    assert env.row(env.target)["fps"] == 30
    # 取込み直しは IMPORT_INTERRUPTED
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(preview=None)
    assert code_of(e) == "IMPORT_INTERRUPTED"
    out = env.revert()
    assert out["record"]["state"] == "rolled_back"
    assert_clean(env, "rolled_back")


def test_undo_failure_then_revert_again(env, events, monkeypatch):
    real = scene.mutate
    seen = {"adds": 0}

    def flaky(*a, **k):
        if k.get("action") == "add":
            seen["adds"] += 1
            if seen["adds"] == 2:
                raise scene.SceneInstancesError("injected")
        if k.get("action") == "remove":
            seen["removes"] = seen.get("removes", 0) + 1
            raise scene.SceneInstancesError("Revision conflict")
        return real(*a, **k)
    monkeypatch.setattr(scene, "mutate", flaky)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply()
    assert code_of(e) == "APPLY_FAILED" and e.value.state == "undo_failed"
    assert "取込前に戻しきれませんでした。［取込を取消］を押してください" in e.value.message
    assert seen["removes"] == 3  # 3回やり直して止める
    rec = env.record()
    assert rec["state"] == "undo_failed"
    assert len(rec["undo"]["failures"]) == 1
    f = rec["undo"]["failures"][0]
    assert f["kind"] == "scene_add" and f["label"] == "キャラクター「test.pmx」" and "Revision conflict" in f["reason"]
    assert len(env.scene()["instances"]) == 1
    # 取込み直しは IMPORT_INTERRUPTED、取消は monkeypatch を外せば成功し rolled_back
    with pytest.raises(L.LegacyImportError) as e2:
        env.apply()
    assert code_of(e2) == "IMPORT_INTERRUPTED"
    monkeypatch.setattr(scene, "mutate", real)
    out = env.revert()
    assert out["record"]["state"] == "rolled_back" and out["record"]["undo"]["failures"] == []
    assert_clean(env, "rolled_back")


def test_revert_failure_of_applied_then_retry_is_reverted(env, monkeypatch):
    env.apply()
    real = scene.mutate

    def deny(*a, **k):
        if k.get("action") == "remove":
            raise scene.SceneInstancesError("Revision conflict")
        return real(*a, **k)
    monkeypatch.setattr(scene, "mutate", deny)
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "UNDO_FAILED" and e.value.status == 500 and e.value.state == "undo_failed"
    assert "キャラクター「test.pmx」" in e.value.message and "ステージ「テストステージ」" in e.value.message
    assert env.record()["state"] == "undo_failed"
    monkeypatch.setattr(scene, "mutate", real)
    assert env.revert()["record"]["state"] == "reverted"
    assert env.scene()["instances"] == []


def test_undo_succeeds_on_second_attempt_within_retries(env, monkeypatch):
    env.apply()
    real = scene.mutate
    seen = {"n": 0}

    def once_conflict(*a, **k):
        if k.get("action") == "remove":
            seen["n"] += 1
            if seen["n"] == 1:
                raise scene.SceneInstancesError("Revision conflict")
        return real(*a, **k)
    monkeypatch.setattr(scene, "mutate", once_conflict)
    assert env.revert()["record"]["state"] == "reverted"
    assert env.scene()["instances"] == []


def test_find_target_uses_pre_ids_to_tell_same_asset_apart():
    rows = [{"id": "a", "asset_id": "X"}, {"id": "b", "asset_id": "X"}]
    match = lambda r: r["asset_id"] == "X"
    assert L._find_target(rows, {"pre_ids": ["a"]}, "instance_id", match) == ("one", rows[1])
    assert L._find_target(rows, {"pre_ids": []}, "instance_id", match)[0] == "many"
    assert L._find_target(rows, {"pre_ids": ["a", "b"]}, "instance_id", match)[0] == "none"
    assert L._find_target(rows, {"instance_id": "a", "pre_ids": []}, "instance_id", match) == ("one", rows[0])
    assert L._find_target(rows, {"instance_id": "gone"}, "instance_id", match)[0] == "none"


# ---- 競合 --------------------------------------------------------------------------
def assert_nothing_written(env):
    assert env.record() is None
    assert env.arr()["revision"] == 0 and env.ph()["revision"] == 0
    assert "fps" not in env.row(env.target) or env.row(env.target)["fps"] == 24


def test_target_changed_when_instance_added_after_preview(env):
    req = env.request()
    env.add_instance(STAGE_ID)
    rev = env.scene()["revision"]
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "TARGET_CHANGED" and e.value.status == 409
    assert len(env.scene()["instances"]) == 1 and env.scene()["revision"] == rev
    assert_nothing_written(env)


def test_source_changed_when_snapshot_resaved_after_preview(env):
    req = env.request()
    env.ignore_paths.add("studio_v05_snapshots/" + env.target + ".json")
    env.save_snapshot("bundle_a")  # 内容は同じでも saved_at が変わりバイト列が変わる
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "SOURCE_CHANGED" and e.value.status == 409
    assert env.scene()["instances"] == [] and env.scene()["revision"] == 0
    assert_nothing_written(env)


def test_target_changed_when_fps_set_after_preview(env):
    req = env.request()
    catalog_mod.set_fps(env.catalog, env.target, 24)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "TARGET_CHANGED"
    assert env.row(env.target)["fps"] == 24
    assert env.scene()["instances"] == [] and env.record() is None


def test_fps_changed_between_plan_and_step_is_target_changed(env, monkeypatch):
    """fps の手順の直前に別の画面が FPS を変えた（LOCK の中の照合）。"""
    real_collect = L.collect

    def collect_then_change(*a, **k):
        out = real_collect(*a, **k)
        catalog_mod.set_fps(env.catalog, env.target, 24)
        return out
    req = env.request()
    monkeypatch.setattr(L, "collect", collect_then_change)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "TARGET_CHANGED" and e.value.state == "rolled_back"
    assert env.row(env.target)["fps"] == 24  # 利用者の値は触らない
    assert env.scene()["instances"] == []
    assert env.record()["state"] == "rolled_back"
    assert env.record()["undo"]["warnings"] == []


def test_stale_expected_with_state_reject_priority(env):
    req = env.request()
    env.apply(req)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)  # 古い expected のままでも、取込済みが先に分かる
    assert code_of(e) == "ALREADY_IMPORTED"


# ---- 取消 R3 -----------------------------------------------------------------------
def test_revert_immediately_restores_state_with_larger_revisions(env, events):
    before = env.state()
    before_fps = env.row(env.target).get("fps", "absent")
    env.apply()
    after_scene_rev, after_arr_rev, after_ph = env.scene()["revision"], env.arr()["revision"], env.ph()
    out = env.revert()
    assert out["record"]["state"] == "reverted" and env.record()["state"] == "reverted"
    assert env.state() == before
    assert env.scene()["revision"] > after_scene_rev
    assert env.arr()["revision"] >= after_arr_rev
    assert env.row(env.target).get("fps", "absent") == before_fps == "absent"
    assert env.ph() == after_ph  # 再生位置は比べない・戻さない
    assert out["project"] == env.row(env.target)
    assert all(s["status"] == "undone" for s in env.record()["steps"])


def test_revert_after_user_moved_playhead_and_stage(env):
    env.apply()
    for sec in (1.0, 2.5, 7.25):
        env.ph_now = playhead.update(env.dirs["playheads"], env.catalog, env.target, sec,
                                     env.ph()["revision"])
    stage = next(i for i in env.scene()["instances"] if i["asset_id"] == STAGE_ID)
    scene.mutate(env.dirs["scene_instances"], env.dirs["scene_models"], env.catalog, env.target, "update",
                 env.scene()["revision"], env.assets, instance_id=stage["id"],
                 transform={"position": [9, 0, 9], "rotation": [0, 45, 0], "scale": [3, 3, 3]})
    ph_before = env.ph()
    env.revert()
    assert env.scene()["instances"] == []
    assert env.ph()["seconds"] == 7.25 and env.ph() == ph_before
    assert env.record()["state"] == "reverted"


def test_revert_blocked_by_face_key(env):
    env.apply()
    char = next(i for i in env.scene()["instances"] if i["asset_id"] == CHAR_ID)
    scene.mutate(env.dirs["scene_instances"], env.dirs["scene_models"], env.catalog, env.target, "face-set",
                 env.scene()["revision"], env.assets,
                 face_key={"instance_id": char["id"], "morph_name": "smile", "time": 1.0, "value": 0.5})
    snap = {p.name: p.read_bytes() for d in ("scene_instances", "arrangements", "playheads", "legacy_imports")
            for p in (env.data / ("studio_v05_" + d)).glob("*.json")}
    cat = env.catalog.read_bytes()
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "REVERT_BLOCKED" and e.value.status == 409
    assert e.value.message == ("取り消すと、あとから加えた次の内容も消えるため、止めました：取り込んだキャラクターの表情キー1件。"
                               "先にこれらを外してから［取込を取消］を押してください。")
    now = {p.name: p.read_bytes() for d in ("scene_instances", "arrangements", "playheads", "legacy_imports")
           for p in (env.data / ("studio_v05_" + d)).glob("*.json")}
    assert now == snap and env.catalog.read_bytes() == cat
    assert env.record()["state"] == "applied"
    # 外せば取り消せる
    scene.mutate(env.dirs["scene_instances"], env.dirs["scene_models"], env.catalog, env.target, "face-remove",
                 env.scene()["revision"], env.assets,
                 face_key={"instance_id": char["id"], "morph_name": "smile", "time": 1.0})
    assert env.revert()["record"]["state"] == "reverted"


def test_revert_blocked_by_locked_stage(env):
    env.apply()
    stage = next(i for i in env.scene()["instances"] if i["asset_id"] == STAGE_ID)
    scene.mutate(env.dirs["scene_instances"], env.dirs["scene_models"], env.catalog, env.target, "update",
                 env.scene()["revision"], env.assets, instance_id=stage["id"], locked=True)
    before = env.scene()
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "REVERT_BLOCKED" and "ロックされたステージ" in e.value.message
    assert env.scene() == before and env.record()["state"] == "applied"
    scene.mutate(env.dirs["scene_instances"], env.dirs["scene_models"], env.catalog, env.target, "update",
                 env.scene()["revision"], env.assets, instance_id=stage["id"], locked=False)
    env.revert()
    assert env.scene()["instances"] == []


def test_revert_fps_changed_after_import_keeps_user_value(env):
    env.apply()
    catalog_mod.set_fps(env.catalog, env.target, 24)
    out = env.revert()
    assert env.row(env.target)["fps"] == 24
    assert out["record"]["state"] == "reverted"
    assert [w["code"] for w in out["record"]["undo"]["warnings"]] == ["FPS_KEPT_USER_CHANGE"]
    assert out["record"]["undo"]["warnings"][0]["message"] == L.MESSAGES["FPS_KEPT_USER_CHANGE"]


def test_use_legacy_policy_sets_then_restores_previous_value(env):
    catalog_mod.set_fps(env.catalog, env.target, 24)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(fps_policy="keep_if_same")
    assert code_of(e) == "FPS_CONFLICT"
    assert env.record() is None and env.scene()["instances"] == []
    env.apply(fps_policy="use_legacy")
    assert env.row(env.target)["fps"] == 30
    env.revert()
    assert env.row(env.target)["fps"] == 24


def test_revert_legacy_slot_changed(env):
    env.apply()
    studio_v05_scene_model.set_model(env.dirs["scene_models"], env.catalog, env.target, CHAR_ID,
                                     {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
                                     1, env.assets)  # Env が target の旧1体枠を revision 1 にしている
    env.ignore_paths.add("studio_v05_scene_models/" + env.target + ".json")
    before = env.record()
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "LEGACY_SLOT_CHANGED" and e.value.status == 409
    assert env.record() == before and env.record()["state"] == "applied"


def test_revert_when_instances_were_already_removed_by_user(env):
    env.apply()
    for inst in list(env.scene()["instances"]):
        scene.mutate(env.dirs["scene_instances"], env.dirs["scene_models"], env.catalog, env.target, "remove",
                     env.scene()["revision"], env.assets, instance_id=inst["id"])
    assert env.revert()["record"]["state"] == "reverted"


# ---- 二重取込・履歴 -------------------------------------------------------------------
def test_double_import_and_reimport_after_revert(env):
    env.apply()
    with pytest.raises(L.LegacyImportError) as e:
        env.apply()
    assert code_of(e) == "ALREADY_IMPORTED" and e.value.status == 409
    env.revert()
    hist = env.data / R.DIR_NAME / R.HISTORY_NAME
    assert not hist.exists()
    old = env.record()
    env.apply()
    files = list(hist.glob("*.json"))
    assert len(files) == 1
    assert json.loads(files[0].read_text(encoding="utf-8")) == old
    assert env.record()["state"] == "applied" and len(env.scene()["instances"]) == 2
    env.revert()
    env.apply()
    assert len(list(hist.glob("*.json"))) == 2
    assert len(env.scene()["instances"]) == 2


def test_reapply_after_rolled_back_archives_old_record(env, monkeypatch):
    def boom(*a, **k):
        raise OSError("x")
    with monkeypatch.context() as m:
        m.setattr(playhead, "update", boom)
        with pytest.raises(L.LegacyImportError):
            env.apply()
    assert env.record()["state"] == "rolled_back"
    env.apply()
    assert env.record()["state"] == "applied"
    assert len(list((env.data / R.DIR_NAME / R.HISTORY_NAME).glob("*.json"))) == 1


def test_concurrent_apply_one_wins(env):
    req = env.request()
    barrier = threading.Barrier(2)
    outcomes = []

    def worker():
        barrier.wait()
        try:
            env.apply(copy.deepcopy(req))
            outcomes.append("applied")
        except L.LegacyImportError as exc:
            outcomes.append(exc.code)
    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(outcomes) == ["ALREADY_IMPORTED", "applied"]
    assert len(env.scene()["instances"]) == 2 and env.record()["state"] == "applied"


def test_concurrent_apply_and_revert_serialized(env):
    req = env.request()
    env.apply(req)
    barrier = threading.Barrier(2)
    outcomes = []

    def reverter():
        barrier.wait()
        try:
            env.revert()
            outcomes.append("reverted")
        except L.LegacyImportError as exc:
            outcomes.append(exc.code)
    threads = [threading.Thread(target=reverter) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(outcomes) == ["NOTHING_TO_REVERT", "reverted"]
    assert env.scene()["instances"] == []


# ---- ログ OBS-004 -----------------------------------------------------------------
def test_events_success_failure_revert(env, events, monkeypatch):
    env.apply()
    assert [(c[0], c[2]["state"]) for c in events] == [("v05_legacy_import_apply", "applied")]
    assert events[0][2]["project_id"] == env.target and "duration_ms" in events[0][2]
    env.revert()
    assert [(c[0], c[2]["state"]) for c in events][1:] == [("v05_legacy_import_revert", "reverted")]
    del events[:]

    def boom(*a, **k):
        raise OSError("x")
    monkeypatch.setattr(playhead, "update", boom)
    with pytest.raises(L.LegacyImportError):
        env.apply()
    assert [(c[0], c[2]["state"]) for c in events] == [("v05_legacy_import_apply", "rolled_back")]
    assert events[0][2]["error"]["type"] == "OSError"


def test_rejections_write_no_event(env, events):
    with pytest.raises(L.LegacyImportError):
        env.revert()
    assert events == []


def test_real_event_function_never_raises(monkeypatch):
    import diagnostic_logging
    monkeypatch.setattr(diagnostic_logging, "event", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    L.event("v05_legacy_import_apply", state="x")


# ---- 拒否・入力の検査 --------------------------------------------------------------
def test_bad_requests(env):
    good = env.request()
    for bad in (None, [], {}, {**good, "confirm": False}, {**good, "confirm": "true"}, {**good, "extra": 1},
                {k: v for k, v in good.items() if k != "expected"}, {**good, "id": 5},
                {**good, "expected": {"snapshot_sha256": "x"}}, {**good, "include": "music_dance"},
                {**good, "fps_policy": "nope"}, {**good, "include": ["nope"]}):
        with pytest.raises(L.LegacyImportError) as e:
            L.apply(env.data, bad, env.assets, {"files": [], "mapping": {}}, env.asset_path)
        assert code_of(e) == "BAD_REQUEST" and e.value.status == 400, bad
    for bad in (None, {}, {"id": env.target}, {"id": env.target, "confirm": False},
                {"id": env.target, "confirm": True, "x": 1}):
        with pytest.raises(L.LegacyImportError) as e:
            L.revert(env.data, bad, env.assets)
        assert code_of(e) == "BAD_REQUEST"
    assert env.record() is None and env.scene()["instances"] == []


def test_nothing_to_revert_and_unknown_project(env):
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "NOTHING_TO_REVERT"
    with pytest.raises(L.LegacyImportError) as e:
        L.revert(env.data, {"id": "00000000-0000-4000-8000-000000000000", "confirm": True}, env.assets)
    assert code_of(e) == "PROJECT_NOT_FOUND" and e.value.status == 404
    req = env.request()
    req["id"] = "00000000-0000-4000-8000-000000000000"
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "PROJECT_NOT_FOUND"
    env.apply()
    env.revert()
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "NOTHING_TO_REVERT"


def test_no_snapshot_and_unreadable_snapshot(env):
    path = env.dirs["snapshots"] / (env.target + ".json")
    req = env.request()
    env.ignore_paths.add("studio_v05_snapshots/" + env.target + ".json")
    good = path.read_bytes()
    path.write_bytes(b"{not json")
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "SNAPSHOT_UNREADABLE" and e.value.status == 422
    assert path.read_bytes() == b"{not json"
    path.write_bytes(json.dumps({"schema": 1, "project_id": env.target, "saved_at": "x", "bundle": {}}).encode())
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "SNAPSHOT_UNREADABLE"
    path.unlink()
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "NO_SNAPSHOT" and e.value.status == 404
    path.write_bytes(good)
    assert env.record() is None and env.scene()["instances"] == []


def test_unreadable_record_blocks_apply_and_revert_without_touching_it(env):
    rec_dir = env.data / R.DIR_NAME
    rec_dir.mkdir()
    bad = rec_dir / (env.target + ".json")
    bad.write_bytes(b"garbage")
    req = {"id": env.target, "expected": {"snapshot_sha256": "x", "fps": {"presence": "absent"},
                                           "scene_revision": 0, "arrangement_revision": 0,
                                           "live_sha256": {"music_dance": None, "timeline_editor": None}},
           "include": [], "fps_policy": "keep_if_same", "confirm": True}
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "RECORD_UNREADABLE" and e.value.status == 422
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "RECORD_UNREADABLE"
    assert bad.read_bytes() == b"garbage" and env.scene()["instances"] == []


def test_record_too_large_writes_nothing(env, monkeypatch):
    monkeypatch.setattr(R, "MAX_BYTES", 2000)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply()
    assert code_of(e) == "RECORD_TOO_LARGE" and e.value.status == 422
    assert not (env.data / R.DIR_NAME / (env.target + ".json")).exists()
    assert env.scene()["instances"] == [] and "fps" not in env.row(env.target)


def test_target_not_empty_and_interrupted_rejections(env):
    env.add_instance(STAGE_ID)
    pre = L.plan(env.collect())
    assert pre["reject"]["code"] == "TARGET_NOT_EMPTY"
    req = {"id": env.target, "expected": pre["expected"], "include": [], "fps_policy": "keep_if_same",
           "confirm": True}
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "TARGET_NOT_EMPTY" and e.value.message == L.MESSAGES["TARGET_NOT_EMPTY"]
    assert env.record() is None and len(env.scene()["instances"]) == 1


# ---- 打ち消しの性質 -----------------------------------------------------------------
def test_undo_journal_is_idempotent_and_skips_undone(env):
    env.apply()
    rec = env.record()
    env.revert()
    rec = env.record()
    snap = copy.deepcopy(rec)
    scene_rev = env.scene()["revision"]
    out = L.undo_journal(env.data, rec, env.assets)
    assert [s["status"] for s in out["steps"]] == ["undone"] * 4
    assert env.scene()["revision"] == scene_rev  # 何も呼ばれない
    assert {k: v for k, v in out.items() if k != "updated_at"} == {k: v for k, v in snap.items() if k != "updated_at"}


def test_undo_never_writes_stores_directly(env, monkeypatch):
    """打ち消しは公開関数だけを通す: ストアの _atomic を直接呼ぶ側は record だけ。"""
    env.apply()
    ph_file = env.dirs["playheads"] / (env.target + ".json")
    ph_bytes = ph_file.read_bytes()
    writes = []
    real = catalog_mod._atomic

    def spy(path, data):
        writes.append(Path(path).parent.name + "/" + Path(path).name)
        return real(path, data)
    for mod in (catalog_mod, scene, arrangement, playhead):
        if hasattr(mod, "_atomic"):
            monkeypatch.setattr(mod, "_atomic", spy)
    monkeypatch.setattr(R, "_atomic", spy)
    env.revert()
    # 呼ばれたのは、公開関数（mutate remove、clear_fps）と取込記録の保存だけ
    assert set(w.split("/")[0] for w in writes) <= {"studio_v05_scene_instances", "data", "studio_v05_legacy_imports"}
    assert ph_file.read_bytes() == ph_bytes  # 再生位置は取消の前後で書かない


# ---- clear_fps ---------------------------------------------------------------------
def test_clear_fps(tmp_path):
    cat = tmp_path / "c.json"
    a = catalog_mod.create(cat, "A")["id"]
    b = catalog_mod.create(cat, "B")["id"]
    catalog_mod.set_fps(cat, a, 30)
    catalog_mod.set_fps(cat, b, 24)
    other_before = [p for p in catalog_mod.load(cat)["projects"] if p["id"] == b]
    out = catalog_mod.clear_fps(cat, a)
    assert "fps" not in out and out["id"] == a
    rows = {p["id"]: p for p in catalog_mod.load(cat)["projects"]}
    assert "fps" not in rows[a] and [rows[b]] == other_before
    catalog_mod.clear_fps(cat, a)  # すでに無くても成功（何度でも同じ結果）
    with pytest.raises(catalog_mod.CatalogError):
        catalog_mod.clear_fps(cat, "nope")
    assert not list(tmp_path.glob("*.tmp-*"))


# ---- 曲・ダンスのクリップ手順（WP-L7a が plan に足す手順の実行・打ち消しを、手で組んだ手順で確かめる） ----------
@pytest.fixture
def clip_plan(monkeypatch):
    """plan の結果に clip_place/clip_source/clip_assign の手順を足す（playhead の手前に挿入）。"""
    real = L.plan

    def with_clips(inputs, **kw):
        out = real(inputs, **kw)
        if not out["ok"]:
            return out
        steps = out["steps"]
        char_n = next(s["n"] for s in steps if s["kind"] == "scene_add" and s["role"] == "character")
        extra = [
            {"kind": "clip_place", "status": "pending", "asset_id": MUSIC_ID, "track": "audio", "start": 1.0,
             "duration": 3.5, "source_duration": 10.0, "pre_ids": [], "clip_id": None},
            {"kind": "clip_source", "status": "pending", "clip_step": 0, "source_start": 0.5},
            {"kind": "clip_place", "status": "pending", "asset_id": MOTION_ID, "track": "motion", "start": 2.0,
             "duration": 4.0, "pre_ids": [], "clip_id": None},
            {"kind": "clip_assign", "status": "pending", "clip_step": 0, "instance_step": char_n},
        ]
        head = [s for s in steps if s["kind"] != "playhead"]
        tail = [s for s in steps if s["kind"] == "playhead"]
        base = len(head)
        extra[1]["clip_step"] = base + 1
        extra[3]["clip_step"] = base + 3
        merged = head + [dict(e) for e in extra] + tail
        out["steps"] = [{**s, "n": i} for i, s in enumerate(merged, 1)]
        return out
    monkeypatch.setattr(L, "plan", with_clips)


def test_clip_steps_apply_and_revert(env, clip_plan):
    env.apply()
    clips = env.arr()["clips"]
    assert {c["track"] for c in clips} == {"audio", "motion"}
    audio = next(c for c in clips if c["track"] == "audio")
    motion = next(c for c in clips if c["track"] == "motion")
    assert audio["start"] == 1.0 and audio["source_start"] == 0.5 and audio["duration"] == 3.5
    char = next(i for i in env.scene()["instances"] if i["asset_id"] == CHAR_ID)
    assert motion["target_scene_instance_id"] == char["id"]
    rec = env.record()
    assert all(s["status"] == "done" for s in rec["steps"])
    assert [s["clip_id"] for s in rec["steps"] if s["kind"] == "clip_place"] == [audio["id"], motion["id"]]
    arr_rev = env.arr()["revision"]
    env.revert()
    assert env.arr()["clips"] == [] and env.arr()["revision"] > arr_rev
    assert env.scene()["instances"] == []
    assert env.record()["state"] == "reverted"


def test_clip_assign_failure_rolls_back_clips_and_instances(env, clip_plan, monkeypatch):
    def boom(*a, **k):
        raise studio_v05_multi_motion.MultiMotionError("injected")
    monkeypatch.setattr(studio_v05_multi_motion, "assign", boom)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply()
    assert code_of(e) == "APPLY_FAILED" and e.value.state == "rolled_back"
    assert_clean(env, "rolled_back")


def test_interrupted_clip_place_found_by_pre_ids_asset_track_start(env, clip_plan, monkeypatch):
    real = arrangement.place
    seen = {"n": 0}

    def real_then_raise(*a, **k):
        out = real(*a, **k)
        seen["n"] += 1
        if seen["n"] == 2:
            raise OSError("power cut")
        return out
    monkeypatch.setattr(arrangement, "place", real_then_raise)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply()
    assert e.value.state == "rolled_back"
    assert_clean(env, "rolled_back")
    places = [s for s in env.record()["steps"] if s["kind"] == "clip_place"]
    assert places[1]["clip_id"] is None and places[1]["status"] == "undone"


def test_revert_blocked_by_foreign_motion_clip_and_locked_track(env, clip_plan):
    env.ignore_paths.add("studio_v05_track_layouts/" + env.target + ".json")
    env.apply()
    char = next(i for i in env.scene()["instances"] if i["asset_id"] == CHAR_ID)
    # 取込で作っていない動作クリップを、取り込んだキャラクターに割り当てる
    r = arrangement.place(env.dirs["arrangements"], env.catalog, env.target, MOTION_ID, "motion", 10, 2,
                          env.arr()["revision"], env.assets)
    studio_v05_multi_motion.assign(env.dirs["arrangements"], env.dirs["scene_instances"], env.dirs["scene_models"],
                                   env.catalog, env.target, r["clip"]["id"], env.arr()["revision"], char["id"],
                                   env.assets)
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "REVERT_BLOCKED" and "動作のクリップ1件" in e.value.message
    arrangement.edit_clip(env.dirs["arrangements"], env.catalog, env.target, r["clip"]["id"],
                          env.arr()["revision"], "delete")
    # 取り込んだ音声クリップのトラックをロック
    lay = layout.get(env.dirs["track_layouts"], env.catalog, env.target)
    layout.set_flags(env.dirs["track_layouts"], env.catalog, env.target, lay["revision"], ["audio"], [])
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "REVERT_BLOCKED" and "ロックされた音声のトラック" in e.value.message
    assert len(env.arr()["clips"]) == 2
    lay = layout.get(env.dirs["track_layouts"], env.catalog, env.target)
    layout.set_flags(env.dirs["track_layouts"], env.catalog, env.target, lay["revision"], [], [])
    env.revert()
    assert env.arr()["clips"] == []
