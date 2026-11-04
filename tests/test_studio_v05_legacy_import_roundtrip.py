"""WP-L4 試験専用の逆変換と往復試験（設計書 §5.6・§5.7 R2/R4・WP-L4）。

取込（apply）→ `_export_legacy_for_test` の結果が、編集しなければ元の bundle と深く等しいこと（R2）、
v0.5 で編集したあとは変更が旧形式へ反映され、表せない変更は unrepresentable に出ること（R4）を確かめる。
隔離した tmp_path の data だけを使う（実データ data/ には触れない）。skip は使わない。
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import studio_v05_legacy_import as L
import studio_v05_scene_instances as scene
from legacy_import_fixtures import load_bundle
from project_state_bundle import validate_bundle
from test_studio_v05_legacy_import_apply import CHAR_ID, STAGE_ID, Env, sha

FBX_ID = "fbx:0123456789abcdef01234567"
BUNDLES = ["bundle_" + c for c in "abcdefghij"]


@pytest.fixture(autouse=True)
def _quiet_events(monkeypatch):
    monkeypatch.setattr(L, "event", lambda *a, **k: None)


@pytest.fixture
def make_env(tmp_path):
    created = []

    def factory(bundle="bundle_a"):
        sub = tmp_path / ("env%d" % len(created))
        sub.mkdir()
        e = Env(sub, bundle)
        e.assets.append({"id": FBX_ID, "name": "m.fbx", "format": "FBX", "kind": "modelA", "source": "fbx",
                         "available": True})
        created.append(e)
        return e

    yield factory
    for e in created:  # R1: 書き込み対象でないファイルは変わらない
        now, was = e.fingerprint(), dict(e.before)
        for rel in e.ignore_paths:
            now.pop(rel, None)
            was.pop(rel, None)
        assert now == was
        assert e.leftover_tmp() == []


def current_of(env):
    return {
        "fps": ({"presence": "value", "value": env.row(env.target)["fps"]}
                if "fps" in env.row(env.target) else {"presence": "absent"}),
        "scene": env.scene(),
        "scene_model": {"model": None},
        "arrangement": env.arr(),
        "playhead": {"seconds": env.ph()["seconds"]},
        "asset_sha256": {aid: (sha(p) if p is not None and Path(p).exists() else None)
                         for aid, p in env.files.items()},
    }


def export(env):
    return L._export_legacy_for_test(env.record(), current_of(env))


def inst(env, asset_id):
    return next(i for i in env.scene()["instances"] if i["asset_id"] == asset_id)


def update(env, asset_id, **kw):
    s = env.scene()
    i = inst(env, asset_id)
    return scene.mutate(env.dirs["scene_instances"], env.dirs["scene_models"], env.catalog, env.target,
                        "update", s["revision"], env.assets, instance_id=i["id"], **kw)


def tf_of(env, asset_id, **over):
    t = {k: list(v) for k, v in inst(env, asset_id)["transform"].items()}
    t.update(over)
    return t


# ---- R2 往復一致 ------------------------------------------------------------------------
@pytest.mark.parametrize("name", BUNDLES)
def test_r2_roundtrip_equals_original(make_env, name):
    env = make_env(name)
    env.apply()
    out = export(env)
    assert out["bundle"] == validate_bundle(env.record()["source"]["bundle"])
    assert out["bundle"] == load_bundle(name)
    assert out["changed"] == [] and out["unrepresentable"] == [] and out["asset_hash_changed"] == []


def test_r2_j_frame_is_original_because_playhead_not_mapped(make_env):
    env = make_env("bundle_j")
    env.apply()
    assert not any(s["kind"] == "playhead" for s in env.record()["steps"])
    out = export(env)
    assert out["bundle"]["workspace"]["frame"] == 100000
    assert out["unrepresentable"] == []


def test_r2_presence_is_kept(make_env):
    # c: workspace なし。d: すべて null。g: stage の項目なし。h: 既定値と同じ character は value のまま
    c = make_env("bundle_c")
    c.apply()
    assert "workspace" not in export(c)["bundle"]
    d = make_env("bundle_d")
    d.apply()
    ws = export(d)["bundle"]["workspace"]
    assert ws["stage"] is None and ws["character"] is None and ws["lights"] is None
    g = make_env("bundle_g")
    g.apply()
    assert "stage" not in export(g)["bundle"]["workspace"]
    h = make_env("bundle_h")
    h.apply()
    assert export(h)["bundle"]["workspace"]["character"] == {
        "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": 1}


def test_r2_asset_keeps_legacy_spelling_and_six_digit_rounding(make_env):
    b = make_env("bundle_b")
    b.apply()
    assert inst(b, "integrated:foo.glb")
    assert export(b)["bundle"]["workspace"]["asset"] == "foo.glb"
    i = make_env("bundle_i")
    i.apply()
    assert inst(i, CHAR_ID)["transform"]["position"] == [0.123457, 1.0, -2.5]
    assert export(i)["bundle"]["workspace"]["character"]["position"] == [0.1234567, 1.0000001, -2.5]
    assert export(i)["changed"] == []


# ---- R4 編集後の逆変換 ------------------------------------------------------------------
def test_r4_stage_position_change_is_reflected(make_env):
    env = make_env("bundle_a")
    env.apply()
    update(env, STAGE_ID, transform=tf_of(env, STAGE_ID, position=[3.5, 0, -1]))
    out = export(env)
    assert out["bundle"]["workspace"]["stage"]["position"] == [3.5, 0, -1]
    assert out["bundle"]["workspace"]["stage"]["scale"] == 2
    assert out["changed"] == ["/workspace/stage/position"]
    assert out["unrepresentable"] == []


def test_r4_character_change_is_reflected_and_others_untouched(make_env):
    env = make_env("bundle_a")
    env.apply()
    update(env, CHAR_ID, transform=tf_of(env, CHAR_ID, rotation=[0, 45, 0], scale=[2, 2, 2]))
    out = export(env)
    assert out["bundle"]["workspace"]["character"] == {"position": [1.5, 0, -2], "rotation": [0, 45, 0], "scale": 2}
    assert out["changed"] == ["/workspace/character/rotation", "/workspace/character/scale"]
    assert out["bundle"]["workspace"]["stage"] == load_bundle("bundle_a")["workspace"]["stage"]


def test_r4_nonuniform_scale_is_unrepresentable(make_env):
    env = make_env("bundle_a")
    env.apply()
    update(env, STAGE_ID, transform=tf_of(env, STAGE_ID, scale=[1, 2, 1]))
    out = export(env)
    assert out["unrepresentable"] == [{"pointer": "/workspace/stage/scale", "reason": "SCALE_NOT_UNIFORM"}]
    assert out["bundle"]["workspace"]["stage"]["scale"] == 2
    assert out["changed"] == []


def test_r4_rotation_400_is_unrepresentable(make_env):
    env = make_env("bundle_a")
    env.apply()
    update(env, STAGE_ID, transform=tf_of(env, STAGE_ID, rotation=[0, 400, 0]))
    out = export(env)
    assert out["unrepresentable"] == [{"pointer": "/workspace/stage/rotation", "reason": "ROTATION_OUT_OF_RANGE"}]
    assert out["bundle"]["workspace"]["stage"]["rotation"] == [0, 0, 0]
    assert out["changed"] == []


def test_r4_position_and_scale_out_of_range_are_unrepresentable(make_env):
    env = make_env("bundle_a")
    env.apply()
    update(env, STAGE_ID, transform=tf_of(env, STAGE_ID, position=[1500, 0, 0], scale=[500, 500, 500]))
    out = export(env)
    reasons = {(u["pointer"], u["reason"]) for u in out["unrepresentable"]}
    assert reasons == {("/workspace/stage/position", "POSITION_OUT_OF_RANGE"),
                       ("/workspace/stage/scale", "SCALE_OUT_OF_RANGE")}
    assert out["bundle"]["workspace"]["stage"] == load_bundle("bundle_a")["workspace"]["stage"]
    assert out["changed"] == []


def test_r4_hidden_instance_is_unrepresentable(make_env):
    env = make_env("bundle_a")
    env.apply()
    update(env, STAGE_ID, visible=False)
    out = export(env)
    assert out["unrepresentable"] == [{"pointer": "/workspace/stage/visible", "reason": "INSTANCE_HIDDEN"}]
    assert out["bundle"] == load_bundle("bundle_a")


def test_r4_extra_instance(make_env):
    env = make_env("bundle_a")
    env.apply()
    env.add_instance("integrated:foo.glb")
    out = export(env)
    assert out["unrepresentable"] == [{"pointer": "/workspace", "reason": "EXTRA_INSTANCE"}]
    assert out["bundle"] == load_bundle("bundle_a")


def test_r4_project_fps_change(make_env):
    env = make_env("bundle_a")
    env.apply()
    import studio_project_catalog as cat
    cat.set_fps(env.catalog, env.target, 60)
    out = export(env)
    assert out["unrepresentable"] == [{"pointer": "/camera/fps", "reason": "FPS_CHANGED"}]
    assert out["bundle"]["camera"]["fps"] == 30


def test_r4_playhead_moved_within_duration_is_reflected(make_env):
    env = make_env("bundle_a")
    env.apply()
    _move_playhead(env, 6.0)
    out = export(env)
    assert out["bundle"]["workspace"]["frame"] == 180
    assert out["changed"] == ["/workspace/frame"]


def test_r4_playhead_beyond_duration(make_env):
    env = make_env("bundle_a")  # duration 300 フレーム = 10 秒
    env.apply()
    _move_playhead(env, 20.0)
    out = export(env)
    assert out["unrepresentable"] == [{"pointer": "/workspace/frame", "reason": "FRAME_EXCEEDS_DURATION"}]
    assert out["bundle"]["workspace"]["frame"] == 120
    assert out["changed"] == []


def _move_playhead(env, seconds):
    import studio_v05_playhead as ph
    ph.update(env.dirs["playheads"], env.catalog, env.target, seconds, env.ph()["revision"])


def test_r4_character_deleted(make_env):
    env = make_env("bundle_a")
    env.apply()
    s = env.scene()
    scene.mutate(env.dirs["scene_instances"], env.dirs["scene_models"], env.catalog, env.target, "remove",
                 s["revision"], env.assets, instance_id=inst(env, CHAR_ID)["id"])
    out = export(env)
    ws = out["bundle"]["workspace"]
    assert ws["asset"] == "" and ws["clip"] is None and "character" not in ws
    assert set(out["changed"]) == {"/workspace/asset", "/workspace/clip", "/workspace/character"}
    assert ws["stage"] == load_bundle("bundle_a")["workspace"]["stage"]
    assert out["unrepresentable"] == []


def test_r4_character_deleted_clears_clip_of_b(make_env):
    env = make_env("bundle_b")  # clip: 2
    env.apply()
    s = env.scene()
    scene.mutate(env.dirs["scene_instances"], env.dirs["scene_models"], env.catalog, env.target, "remove",
                 s["revision"], env.assets, instance_id=inst(env, "integrated:foo.glb")["id"])
    ws = export(env)["bundle"]["workspace"]
    assert ws["asset"] == "" and ws["clip"] is None


def test_r4_stage_deleted(make_env):
    env = make_env("bundle_a")
    env.apply()
    s = env.scene()
    scene.mutate(env.dirs["scene_instances"], env.dirs["scene_models"], env.catalog, env.target, "remove",
                 s["revision"], env.assets, instance_id=inst(env, STAGE_ID)["id"])
    out = export(env)
    assert out["bundle"]["workspace"]["stage"] is None
    assert out["changed"] == ["/workspace/stage"]
    assert out["bundle"]["workspace"]["character"] == load_bundle("bundle_a")["workspace"]["character"]


def test_r4_absent_character_moved_becomes_value(make_env):
    env = make_env("bundle_e")  # asset だけあり character なし
    env.apply()
    assert "character" not in export(env)["bundle"]["workspace"]
    update(env, FBX_ID, transform=tf_of(env, FBX_ID, position=[1, 0, 0]))
    out = export(env)
    assert out["bundle"]["workspace"]["character"] == {"position": [1, 0, 0], "rotation": [0, 0, 0], "scale": 1}
    assert out["changed"] == ["/workspace/character"]


def test_r4_absent_character_unrepresentable_falls_back_to_presence(make_env):
    env = make_env("bundle_e")
    env.apply()
    update(env, FBX_ID, transform=tf_of(env, FBX_ID, rotation=[0, 400, 0]))
    out = export(env)
    assert "character" not in out["bundle"]["workspace"]
    assert out["unrepresentable"] == [{"pointer": "/workspace/character/rotation",
                                       "reason": "ROTATION_OUT_OF_RANGE"}]
    assert out["changed"] == []


def test_r4_null_character_stays_null_until_moved(make_env):
    env = make_env("bundle_d")
    env.apply()
    assert export(env)["bundle"]["workspace"]["character"] is None


def test_r4_original_file_rewritten_is_reported(make_env):
    env = make_env("bundle_a")
    env.apply()
    path = env.files[CHAR_ID]
    path.write_bytes(b"tampered")
    env.ignore_paths.add(path.relative_to(env.data).as_posix())
    out = export(env)
    assert out["asset_hash_changed"] == [CHAR_ID]
    assert out["bundle"] == load_bundle("bundle_a")


def test_r4_results_always_pass_validate_bundle(make_env):
    env = make_env("bundle_a")
    env.apply()
    update(env, STAGE_ID, transform=tf_of(env, STAGE_ID, position=[-999, 5, 999], scale=[0.5, 0.5, 0.5]))
    update(env, CHAR_ID, transform=tf_of(env, CHAR_ID, rotation=[360, -360, 10], scale=[100, 100, 100]))
    out = export(env)
    assert validate_bundle(out["bundle"]) == out["bundle"]


def test_export_is_not_public():
    import server
    src = Path(server.__file__).read_text(encoding="utf-8")
    assert "_export_legacy_for_test" not in src
