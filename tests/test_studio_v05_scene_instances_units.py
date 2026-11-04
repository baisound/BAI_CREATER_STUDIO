"""WP-L8a §6.1：場面インスタンスの印 units（取込だけが付ける「旧画面と同じ式で置く」印）の保存と検査。

設計 docs/roadmap/WP_L8A_VISUAL_SCALE_DETAILED_DESIGN_20261104_JA.md §4.1・§6.1 の U1〜U8。tmp_path だけを使う。skip は使わない。
"""
import json
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402
import studio_project_catalog as catalog_mod  # noqa: E402
from studio_v05_scene_instances import SceneInstancesError, mutate, read  # noqa: E402

ASSET = {"id": "integrated:model.glb", "source": "integrated", "kind": "model", "format": "GLB",
         "filename": "model.glb", "available": True, "name": "Character"}
TR = {"position": [3, 2, 1], "rotation": [0, 90, 0], "scale": [1, 1, 1]}
SIX = {"id", "asset_id", "transform", "visible", "locked", "parent_id"}


class Store:
    def __init__(self, root):
        self.data = root
        self.catalog = root / "studio_v05_catalog.json"
        self.legacy = root / "studio_v05_scene_models"
        self.root = root / "studio_v05_scene_instances"
        self.pid = catalog_mod.create(self.catalog, "Scene A")["id"]

    def mutate(self, **kw):
        return mutate(self.root, self.legacy, self.catalog, self.pid, assets=[ASSET], **kw)

    def read(self):
        return read(self.root, self.legacy, self.catalog, self.pid, [ASSET])

    def file(self):
        return self.root / (self.pid + ".json")

    def rows(self):
        return json.loads(self.file().read_text(encoding="utf-8"))["instances"]


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path)


def test_u1_add_with_legacy_units_is_saved_and_returned(store):
    out = store.mutate(action="add", revision=0, asset_id=ASSET["id"], transform=TR, units="legacy")
    row = store.rows()[0]
    assert row["units"] == "legacy"
    assert set(row) == SIX | {"units"}
    assert set(out["instances"][0]) == SIX | {"units", "available", "asset"}
    assert out["instances"][0]["units"] == "legacy"


@pytest.mark.parametrize("kw", [{"action": "add", "units": "other"}, {"action": "update", "units": "legacy"}])
def test_u2_u3_units_only_legacy_and_only_on_add(store, kw):
    store.mutate(action="add", revision=0, asset_id=ASSET["id"], transform=TR)
    before = store.file().read_bytes()
    iid = store.rows()[0]["id"]
    extra = {"asset_id": ASSET["id"], "transform": TR} if kw["action"] == "add" else {"instance_id": iid, "transform": TR}
    with pytest.raises(SceneInstancesError, match="^Units can only be set to 'legacy' when adding$"):
        store.mutate(revision=1, **kw, **extra)
    assert store.file().read_bytes() == before


def test_u4_update_keeps_units(store):
    store.mutate(action="add", revision=0, asset_id=ASSET["id"], transform=TR, units="legacy")
    iid = store.rows()[0]["id"]
    store.mutate(action="update", revision=1, instance_id=iid, transform=dict(TR, position=[9, 0, 0]))
    store.mutate(action="update", revision=2, instance_id=iid, visible=False)
    store.mutate(action="update", revision=3, instance_id=iid, locked=True)
    row = store.rows()[0]
    assert row["units"] == "legacy" and row["transform"]["position"] == [9, 0, 0] and row["visible"] is False and row["locked"] is True


def test_u5_remove_drops_the_row_with_units(store):
    store.mutate(action="add", revision=0, asset_id=ASSET["id"], transform=TR, units="legacy")
    iid = store.rows()[0]["id"]
    store.mutate(action="remove", revision=1, instance_id=iid)
    assert store.rows() == []


def test_u6_pre_l8a_file_reads_and_writes_without_units(store):
    store.mutate(action="add", revision=0, asset_id=ASSET["id"], transform=TR)
    assert set(store.rows()[0]) == SIX
    assert store.read()["instances"][0].get("units") is None
    iid = store.rows()[0]["id"]
    store.mutate(action="update", revision=1, instance_id=iid, transform=dict(TR, position=[1, 1, 1]))
    assert set(store.rows()[0]) == SIX


def test_u7_bad_units_in_file_is_unreadable_and_kept(store):
    store.mutate(action="add", revision=0, asset_id=ASSET["id"], transform=TR, units="legacy")
    data = json.loads(store.file().read_text(encoding="utf-8"))
    data["instances"][0]["units"] = "x"
    store.file().write_text(json.dumps(data), encoding="utf-8")
    before = store.file().read_bytes()
    with pytest.raises(SceneInstancesError) as caught:
        store.read()
    assert str(caught.value) == "Scene-instances file unreadable; original retained"
    assert str(caught.value.__cause__) == "Invalid scene instance units; original retained"
    assert store.file().read_bytes() == before


def test_u8_http_cannot_set_units(tmp_path, monkeypatch):
    store = Store(tmp_path)
    monkeypatch.setattr(server, "DATA", tmp_path)
    monkeypatch.setattr(server, "unified_assets", lambda: [ASSET])
    monkeypatch.setattr(server, "event", lambda *a, **k: None)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        body = json.dumps({"project_id": store.pid, "action": "add", "revision": 0, "asset_id": ASSET["id"],
                           "transform": TR, "units": "legacy"}).encode()
        req = urllib.request.Request(f"http://127.0.0.1:{httpd.server_address[1]}/api/studio/v05/scene/instances",
                                     data=body, headers={"Content-Type": "application/json"})
        with pytest.raises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(req, timeout=10)
        assert caught.value.code == 400
        assert json.loads(caught.value.read())["error"] == "Invalid scene instances fields"
        assert not store.file().exists()
    finally:
        httpd.shutdown()
        httpd.server_close()
