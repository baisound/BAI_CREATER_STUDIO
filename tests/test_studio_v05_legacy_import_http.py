"""WP-L5 旧保存取込の HTTP 窓口の受け入れ試験（設計書 §6・§3.4・WP-L5）。

隔離サーバー（server.DATA を tmp_path へ差し替え。実 data/ には触れない）で、
確認 → 適用 → 記録の読込 → 取消を順に通し、状態コード・error_code・日本語の error が §3.4 と一致することを確かめる。
skip は使わない。
"""
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

import server
import bai_studio.projects.catalog as catalog_mod
import bai_studio.projects.snapshots as snapshots
import bai_studio.v05.imports.legacy_import as L
import bai_studio.v05.timeline.playhead as playhead
import bai_studio.v05.timeline.scene_instances as scene
from legacy_import_fixtures import load_bundle

CHAR_ID = "mmd:A:test.pmx"
STAGE_ID = "library:0123456789abcdef01234567"
API = "/api/studio/v05/project/legacy-import"


def make_assets():
    return [
        {"id": CHAR_ID, "name": "test.pmx", "format": "PMX", "kind": "A", "source": "mmd", "available": True},
        {"id": STAGE_ID, "name": "テストステージ", "format": "GLB", "kind": "stage", "source": "library",
         "filename": "stage.glb", "available": True},
    ]


class Env:
    def __init__(self, tmp_path, monkeypatch, bundle="bundle_a"):
        self.data = tmp_path / "data"
        self.data.mkdir()
        self.catalog = self.data / "studio_v05_catalog.json"
        self.target = catalog_mod.create(self.catalog, "Target")["id"]
        self.assets = make_assets()
        # 素材の原本（resolve_asset が実際に引く場所）
        (self.data / "mmd" / "A").mkdir(parents=True)
        (self.data / "mmd" / "A" / "test.pmx").write_bytes(b"pmx original" * 10)
        (self.data / "library_assets" / "files").mkdir(parents=True)
        (self.data / "library_assets" / "files" / "stage.glb").write_bytes(b"glb original" * 10)
        monkeypatch.setattr(server, "DATA", self.data)
        monkeypatch.setattr(server, "MMD_DIR", self.data / "mmd")
        monkeypatch.setattr(server, "LIBRARY_ROOT", self.data / "library_assets")
        monkeypatch.setattr(server, "unified_assets", lambda: self.assets)
        monkeypatch.setattr(server, "readmeta", lambda: {"files": [], "mapping": {}})
        monkeypatch.setattr(server, "event", lambda *a, **k: None)
        monkeypatch.setattr(L, "event", lambda *a, **k: None)
        snapshots.save(self.data / "studio_v05_snapshots", self.catalog, self.target, load_bundle(bundle))
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = "http://127.0.0.1:%d" % self.httpd.server_address[1]

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def call(self, path, payload=None, raw=None, headers=None):
        data = raw if raw is not None else (None if payload is None else json.dumps(payload, ensure_ascii=False).encode())
        req = urllib.request.Request(self.base + path, data=data, headers=headers or (
            {"Content-Type": "application/json"} if data is not None else {}))
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def preview(self, pid=None, query=""):
        return self.call(API + "-preview?id=" + urllib.parse.quote(pid or self.target) + query)

    def get(self, pid=None):
        return self.call(API + "?id=" + urllib.parse.quote(pid or self.target))

    def body(self, preview, **kw):
        out = {"id": self.target, "expected": preview["expected"], "include": [], "fps_policy": "keep_if_same",
               "confirm": True}
        out.update(kw)
        return out

    def apply(self, payload):
        return self.call(API + "/apply", payload)

    def revert(self, payload=None):
        return self.call(API + "/revert", {"id": self.target, "confirm": True} if payload is None else payload)

    def scene(self):
        return scene.read(self.data / "studio_v05_scene_instances", self.data / "studio_v05_scene_models",
                          self.catalog, self.target)


@pytest.fixture
def env(tmp_path, monkeypatch):
    e = Env(tmp_path, monkeypatch)
    yield e
    e.close()


def assert_error(result, status, code, **params):
    got_status, body = result
    assert got_status == status, body
    assert body["error_code"] == code
    assert body["error"] == L.MESSAGES[code].format(**params)
    return body


def test_full_flow_preview_apply_get_revert(env):
    status, pre = env.preview(query="&include=&fps_policy=keep_if_same")
    assert status == 200 and pre["ok"] is True and pre["reject"] is None
    assert set(pre["expected"]) == {"snapshot_sha256", "fps", "scene_revision", "arrangement_revision", "live_sha256"}
    assert env.get() == (200, {"record": None})

    status, res = env.apply(env.body(pre))
    assert status == 200 and set(res) == {"record", "project"}
    assert res["record"]["state"] == "applied" and res["project"]["id"] == env.target and res["project"]["fps"] == 30
    assert len(env.scene()["instances"]) == 2

    status, got = env.get()
    assert status == 200 and got["record"] == res["record"]

    status, rev = env.revert()
    assert status == 200 and rev["record"]["state"] == "reverted" and set(rev) == {"record", "project"}
    assert "fps" not in rev["project"] and env.scene()["instances"] == []
    assert env.get()[1]["record"]["state"] == "reverted"


def test_preview_include_query_and_rejection_is_200(env):
    status, pre = env.preview(query="&include=music_dance,timeline_editor")
    assert status == 200 and pre["ok"] is True
    catalog_mod.set_fps(env.catalog, env.target, 24)
    status, pre = env.preview()
    assert status == 200 and pre["ok"] is False and pre["reject"]["code"] == "FPS_CONFLICT"
    assert pre["reject"]["status"] == 409 and pre["reject"]["message"] == L.MESSAGES["FPS_CONFLICT"].format(
        project="24", legacy="30")


def test_preview_and_get_errors(env):
    assert_error(env.preview(pid="00000000-0000-4000-8000-000000000000"), 404, "PROJECT_NOT_FOUND")
    assert_error(env.preview(pid="x"), 404, "PROJECT_NOT_FOUND")
    assert_error(env.preview(query="&fps_policy=bogus"), 400, "BAD_REQUEST")
    assert_error(env.preview(query="&include=nope"), 400, "BAD_REQUEST")
    assert_error(env.get(pid="00000000-0000-4000-8000-000000000000"), 404, "PROJECT_NOT_FOUND")
    other = catalog_mod.create(env.catalog, "NoSnap")["id"]
    assert_error(env.preview(pid=other), 404, "NO_SNAPSHOT")
    assert env.get(pid=other) == (200, {"record": None})
    (env.data / "studio_v05_snapshots" / (env.target + ".json")).write_text("{broken", encoding="utf-8")
    assert_error(env.preview(), 422, "SNAPSHOT_UNREADABLE")


def test_apply_bad_requests_400(env):
    pre = env.preview()[1]
    good = env.body(pre)
    assert_error(env.apply({**good, "confirm": False}), 400, "BAD_REQUEST")
    assert_error(env.apply({k: v for k, v in good.items() if k != "confirm"}), 400, "BAD_REQUEST")
    assert_error(env.apply({k: v for k, v in good.items() if k != "expected"}), 400, "BAD_REQUEST")
    assert_error(env.apply({**good, "extra": 1}), 400, "BAD_REQUEST")
    assert_error(env.apply({**good, "id": 5}), 400, "BAD_REQUEST")
    assert_error(env.apply({**good, "include": "music_dance"}), 400, "BAD_REQUEST")
    assert_error(env.apply({**good, "fps_policy": "bogus"}), 400, "BAD_REQUEST")
    assert_error(env.call(API + "/apply", raw=b"not json"), 400, "BAD_REQUEST")
    assert_error(env.call(API + "/apply", raw=b"[1]"), 400, "BAD_REQUEST")
    assert_error(env.call(API + "/apply", raw=b""), 400, "BAD_REQUEST")
    assert_error(env.revert({"id": env.target}), 400, "BAD_REQUEST")
    assert_error(env.revert({"id": env.target, "confirm": 1}), 400, "BAD_REQUEST")
    assert_error(env.revert({"id": env.target, "confirm": True, "x": 1}), 400, "BAD_REQUEST")
    assert env.get() == (200, {"record": None}) and env.scene()["instances"] == []


def test_apply_and_revert_404(env):
    pre = env.preview()[1]
    ghost = "00000000-0000-4000-8000-000000000000"
    assert_error(env.apply(env.body(pre, id=ghost)), 404, "PROJECT_NOT_FOUND")
    assert_error(env.revert({"id": ghost, "confirm": True}), 404, "PROJECT_NOT_FOUND")
    other = catalog_mod.create(env.catalog, "NoSnap")["id"]
    assert_error(env.apply(env.body(pre, id=other)), 404, "NO_SNAPSHOT")


def test_too_large_body_is_413(env):
    big = json.dumps({"id": env.target, "confirm": True, "pad": "x" * 9000}).encode()
    assert_error(env.call(API + "/apply", raw=big), 413, "REQUEST_TOO_LARGE")
    assert_error(env.call(API + "/revert", raw=big), 413, "REQUEST_TOO_LARGE")
    assert env.get() == (200, {"record": None})


def test_409_fps_conflict_target_not_empty_and_changed(env):
    pre = env.preview()[1]
    catalog_mod.set_fps(env.catalog, env.target, 24)
    assert_error(env.apply(env.body(pre)), 409, "TARGET_CHANGED")  # 確認後に FPS が変わった
    pre = env.preview()[1]
    assert_error(env.apply(env.body(pre)), 409, "FPS_CONFLICT", project="24", legacy="30")
    assert env.get() == (200, {"record": None})
    catalog_mod.set_fps(env.catalog, env.target, 30)
    pre = env.preview()[1]
    snapshots.save(env.data / "studio_v05_snapshots", env.catalog, env.target, load_bundle("bundle_a"))
    assert_error(env.apply(env.body(pre)), 409, "SOURCE_CHANGED")
    # 空でない作品
    scene.mutate(env.data / "studio_v05_scene_instances", env.data / "studio_v05_scene_models", env.catalog,
                 env.target, "add", 0, env.assets, asset_id=STAGE_ID,
                 transform={"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]})
    pre = env.preview()[1]
    assert pre["ok"] is False and pre["reject"]["code"] == "TARGET_NOT_EMPTY"
    assert_error(env.apply(env.body(pre)), 409, "TARGET_NOT_EMPTY")
    assert env.get() == (200, {"record": None})


def test_409_already_imported_nothing_to_revert_and_revert_blocked(env):
    assert_error(env.revert(), 409, "NOTHING_TO_REVERT")
    pre = env.preview()[1]
    assert env.apply(env.body(pre))[0] == 200
    assert_error(env.apply(env.body(pre)), 409, "ALREADY_IMPORTED")
    status, again = env.preview()
    assert status == 200 and again["reject"]["code"] == "ALREADY_IMPORTED"
    char = next(i for i in env.scene()["instances"] if i["asset_id"] == CHAR_ID)
    scene.mutate(env.data / "studio_v05_scene_instances", env.data / "studio_v05_scene_models", env.catalog,
                 env.target, "face-set", env.scene()["revision"], env.assets,
                 face_key={"instance_id": char["id"], "morph_name": "smile", "time": 1.0, "value": 0.5})
    body = assert_error(env.revert(), 409, "REVERT_BLOCKED", list="取り込んだキャラクターの表情キー1件")
    assert "表情キー" in body["error"]
    assert env.get()[1]["record"]["state"] == "applied" and len(env.scene()["instances"]) == 2


def test_500_apply_failed_carries_state(env, monkeypatch):
    def boom(*a, **k):
        raise OSError("disk full")
    monkeypatch.setattr(playhead, "update", boom)
    pre = env.preview()[1]
    status, body = env.apply(env.body(pre))
    assert status == 500 and body["error_code"] == "APPLY_FAILED" and body["state"] == "rolled_back"
    assert body["error"] == L.MESSAGES["APPLY_FAILED"].format(rolled="取込前の状態に戻しました")
    assert env.scene()["instances"] == [] and "fps" not in catalog_mod.load(env.catalog)["projects"][0]
    assert env.get()[1]["record"]["state"] == "rolled_back"


def test_500_undo_failed_carries_state(env, monkeypatch):
    pre = env.preview()[1]
    assert env.apply(env.body(pre))[0] == 200
    real = scene.mutate

    def conflict(*a, **k):
        if (a[4] if len(a) > 4 else k.get("action")) == "remove":
            raise scene.SceneInstancesError("Revision conflict")
        return real(*a, **k)
    monkeypatch.setattr(scene, "mutate", conflict)
    status, body = env.revert()
    assert status == 500 and body["error_code"] == "UNDO_FAILED" and body["state"] == "undo_failed"
    monkeypatch.setattr(scene, "mutate", real)
    status, rev = env.revert()
    assert status == 200 and rev["record"]["state"] == "reverted" and env.scene()["instances"] == []


def test_unreadable_record_is_422(env):
    pre = env.preview()[1]
    assert env.apply(env.body(pre))[0] == 200
    path = env.data / "studio_v05_legacy_imports" / (env.target + ".json")
    path.write_text("{broken", encoding="utf-8")
    before = path.read_bytes()
    assert_error(env.get(), 422, "RECORD_UNREADABLE")
    assert_error(env.revert(), 422, "RECORD_UNREADABLE")
    assert_error(env.preview(), 422, "RECORD_UNREADABLE")
    assert path.read_bytes() == before


def test_unexpected_exception_is_500_internal_error(env, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("unexpected")
    monkeypatch.setattr(L, "apply", boom)
    monkeypatch.setattr(L, "revert", boom)
    monkeypatch.setattr(L, "collect", boom)
    pre = {"expected": {}}
    for status, body in (env.apply(env.body(pre)), env.revert(), env.preview()):
        assert status == 500 and body["error_code"] == "INTERNAL_ERROR" and "診断ZIP" in body["error"]


def test_apply_revert_and_preview_run_inside_project_lock(env, monkeypatch):
    seen = {}

    def wrap(name):
        real = getattr(L, name)

        def inner(*a, **k):
            seen[name] = server.PROJECT_LOCK._is_owned()
            return real(*a, **k)
        monkeypatch.setattr(L, name, inner)
    for name in ("collect", "apply", "revert"):
        wrap(name)
    env.preview()
    assert seen.pop("collect") is True
    pre = env.preview()[1]
    seen.clear()
    assert env.apply(env.body(pre))[0] == 200
    assert env.revert()[0] == 200
    assert seen["apply"] is True and seen["revert"] is True


def test_apply_waits_for_project_lock(env):
    pre = env.preview()[1]
    done = []
    with server.PROJECT_LOCK:
        t = threading.Thread(target=lambda: done.append(env.apply(env.body(pre))))
        t.start()
        t.join(0.5)
        assert t.is_alive() and not done  # 外側の PROJECT_LOCK を取るまで進まない
    t.join(10)
    assert done and done[0][0] == 200


def test_legacy_current_files_not_touched_and_no_sync_bump(env, monkeypatch):
    bumps = []
    monkeypatch.setattr(server, "sync_bump", lambda: bumps.append(1))
    for name, content in (("project_state.json", b"{}"), ("camera_project.json", b"{}"),
                          ("project_state.workspace.json", b"{}")):
        (env.data / name).write_bytes(content)
    before = {n: (env.data / n).read_bytes() for n in ("project_state.json", "camera_project.json",
                                                         "project_state.workspace.json")}
    pre = env.preview()[1]
    env.apply(env.body(pre))
    env.revert()
    assert {n: (env.data / n).read_bytes() for n in before} == before
    assert bumps == []
