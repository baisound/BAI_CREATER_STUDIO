"""WP-L7a 曲とダンス（SCR-10）の取込の受け入れ試験（設計書 §3.2 S1〜S6、§5.1、§5.2、WP-L7a）。

隔離した tmp_path の data だけに書く（実データ data/ には触れない）。skip は使わない。
fixture は tests/fixtures/legacy_import/music_dance_*.json と bundle_a・bundle_b。
R1（元を壊さない）は env fixture が各試験の前後で確かめる（music_dance_project.json の SHA-256 を含む）。
"""
import copy
import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import music_dance_project
import studio_v05_arrangement as arrangement
import studio_v05_legacy_import as L
import studio_v05_media_render
import studio_v05_multi_motion
import studio_v05_scene_instances as scene
from legacy_import_fixtures import FIXTURE_DIR, load_bundle
from test_studio_v05_legacy_import_apply import (CHAR_ID, MOTION_ID, MUSIC_ID, STAGE_ID, Env, code_of,
                                                 make_assets, sha)
from test_studio_v05_legacy_import_plan import make_inputs

OTHER_PMX = "mmd:B:other.pmx"
MINIMAL_VMD = Path(__file__).parent / "fixtures" / "minimal.vmd"
VMD_SECONDS = (30 + 1) / 30  # minimal.vmd の最終キーは 30 フレーム
SONG_SECONDS = 10.0


def md_fixture(name):
    return json.loads((FIXTURE_DIR / (name + ".json")).read_text(encoding="utf-8"))


class MDEnv(Env):
    """Env に SCR-10 の保存、別のPMX、本物のVMD、曲の長さ（media_info の差し替え）を足す。"""

    def __init__(self, tmp_path, md="music_dance_full", bundle="bundle_a"):
        super().__init__(tmp_path, bundle)
        self.assets = make_assets() + [
            {"id": OTHER_PMX, "name": "other.pmx", "format": "PMX", "kind": "B", "source": "mmd", "available": True},
            {"id": "mmd:vmd:camera.vmd", "name": "camera.vmd", "filename": "camera.vmd", "format": "VMD",
             "kind": "camera", "source": "mmd", "available": True},
            {"id": "fbx:aabbccddeeff00112233aabb", "name": "dance.fbx", "filename": "dance.fbx", "format": "FBX",
             "kind": "motion", "source": "fbx", "available": True},
        ]
        vmd = self.data / "originals" / "dance.vmd"
        shutil.copy(MINIMAL_VMD, vmd)
        self.files[MOTION_ID] = vmd
        song = self.data / "originals" / "song.wav"
        song.write_bytes(b"RIFF dummy song" * 10)
        self.files[MUSIC_ID] = song
        self.write_md(md)

    def write_md(self, name_or_value):
        value = md_fixture(name_or_value) if isinstance(name_or_value, str) else name_or_value
        self.md_path = self.data / "music_dance_project.json"
        self.md_path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        self.before = self.fingerprint()  # 旧の別保存は読むだけ。書き換えた後の状態を R1 の基準にする
        return value

    def resnap(self, bundle):
        self.save_snapshot(bundle)
        self.before = self.fingerprint()

    def clips(self):
        return {c["asset_id"]: c for c in self.arr()["clips"]}

    def inst(self, asset_id):
        return [i for i in self.scene()["instances"] if i["asset_id"] == asset_id]


@pytest.fixture(autouse=True)
def song_duration(monkeypatch):
    calls = []

    def fake(data_root, asset_id, inventory):
        calls.append(asset_id)
        return {"asset_id": asset_id, "kind": "audio", "duration_seconds": SONG_SECONDS, "has_audio": True}
    monkeypatch.setattr(studio_v05_media_render, "media_info", fake)
    return calls


@pytest.fixture
def events(monkeypatch):
    calls = []
    monkeypatch.setattr(L, "event", lambda name, level="info", **f: calls.append((name, level, f)))
    return calls


@pytest.fixture
def env(tmp_path, events):
    e = MDEnv(tmp_path)
    yield e
    now, was = e.fingerprint(), dict(e.before)
    for rel in e.ignore_paths:
        now.pop(rel, None)
        was.pop(rel, None)
    assert now == was, "R1: 書き込み対象でないファイルが変わった"
    assert e.leftover_tmp() == []


INC = ("music_dance",)


# ---- full -----------------------------------------------------------------------------
def test_full_places_music_and_dance_with_start_times(env):
    pv = env.preview(include=INC)
    assert pv["ok"] and [s["kind"] for s in pv["steps"]] == [
        "fps", "scene_add", "scene_add", "clip_place", "clip_source", "clip_place", "clip_assign", "playhead"]
    result = env.apply(include=INC)
    rec = env.record()
    assert rec["state"] == "applied" and all(s["status"] == "done" for s in rec["steps"])
    assert result["record"]["state"] == "applied"
    assert len(env.scene()["instances"]) == 2  # キャラクターとステージ。ダンスのモデルは共有
    assert not [s for s in rec["steps"] if s.get("role") == "dance_model"]
    clips = env.clips()
    music, dance = clips[MUSIC_ID], clips[MOTION_ID]
    assert music["track"] == "audio" and music["start"] == 1.0 and music["source_start"] == 0.5
    assert music["source_duration"] == SONG_SECONDS and music["duration"] == SONG_SECONDS - 0.5
    assert music["source_has_audio"] is True
    assert dance["track"] == "motion" and dance["start"] == 2.0 and dance["duration"] == round(VMD_SECONDS, 4)
    char = env.inst(CHAR_ID)[0]
    assert dance["target_scene_instance_id"] == char["id"]
    assert len(env.arr()["clips"]) == 2


def test_round_trip_of_start_frames(env):
    env.apply(include=INC)
    md = md_fixture("music_dance_full")
    clips = env.clips()
    assert round(clips[MUSIC_ID]["start"] * 30) == md["audio_start_frame"]
    assert round(clips[MOTION_ID]["start"] * 30) == md["motion_start_frame"]
    assert round(clips[MUSIC_ID]["source_start"] * 30) == md["audio_source_frame"]


@pytest.mark.parametrize("frame", [1, 31, 7, 12345, 216000])
def test_start_frames_round_trip_for_awkward_values(env, frame):
    """30 で割り切れない開始フレームでも、取込直後に round(start×30) が元のフレームへ戻る。"""
    env.write_md({**md_fixture("music_dance_full"), "audio_start_frame": frame, "motion_start_frame": frame})
    pv = env.preview(include=INC)
    place = {s["role"]: s for s in pv["steps"] if s["kind"] == "clip_place"}
    if "music" in place:
        assert round(place["music"]["start"] * 30) == frame
    if "dance" in place:
        assert round(place["dance"]["start"] * 30) == frame


def test_items_labels_codes_and_summary(env):
    pv = env.preview(include=INC)
    by_id = {i["id"]: i for i in pv["items"]}
    assert by_id["S1"]["label"] == "ダンスのモデル「test.pmx」" and by_id["S1"]["status"] == "mapped"
    assert by_id["S1"]["codes"] == [] and by_id["S1"]["step"] is None  # 共有: 手順なし
    assert by_id["S2"]["label"] == "曲「song.wav」" and by_id["S2"]["status"] == "mapped"
    assert by_id["S3"]["label"] == "ダンス「dance.vmd」" and by_id["S3"]["codes"] == []
    place_steps = {s["role"]: s["n"] for s in pv["steps"] if s["kind"] == "clip_place"}
    assert by_id["S2"]["step"] == place_steps["music"] and by_id["S3"]["step"] == place_steps["dance"]
    assert by_id["S6"]["status"] == "kept" and by_id["S6"]["codes"] == ["NO_V05_FIELD"]
    assert by_id["S6"]["legacy_value"] == {"head_frame": 45, "fps": 30}
    ids = [i["id"] for i in pv["items"]]
    assert ids.index("S1") < ids.index("S2") < ids.index("S3") < ids.index("S6") and ids.index("M11" if "M11" in ids else "M7") < ids.index("S1")
    assert "曲「song.wav」" in pv["summary"]["mapped"] and "ダンス「dance.vmd」" in pv["summary"]["mapped"]
    # 画面に出す文に内部の名前を出さない
    import re
    for it in pv["items"]:
        assert "/" not in it["label"] and not re.search(r"[A-Z_]{6,}", it["label"])
    assert pv["source_info"]["music_dance_updated"] is not None


def test_assets_record_lists_referenced_originals_with_sha(env):
    env.apply(include=INC)
    rows = {a["asset_id"]: a for a in env.record()["assets"]}
    assert set(rows) == {CHAR_ID, STAGE_ID, MUSIC_ID, MOTION_ID}
    assert rows[MUSIC_ID]["sha256"] == sha(env.files[MUSIC_ID])
    assert rows[MOTION_ID]["sha256"] == sha(env.files[MOTION_ID])


def test_record_keeps_whole_music_dance_value_and_hash(env):
    env.apply(include=INC)
    src = env.record()["source"]
    assert src["include"] == ["music_dance"]
    assert src["live"]["music_dance"] == {"sha256": sha(env.md_path), "value": md_fixture("music_dance_full")}
    assert src["live"]["timeline_editor"] is None


def test_all_steps_carry_started_mark(env):
    env.apply(include=INC)
    for s in env.record()["steps"]:
        if s["kind"] != "fps":
            assert s.get("started") is True, s
    assert env.record()["steps"][0].get("started") is True


# ---- offset / other_model --------------------------------------------------------------
def test_offset_keeps_dance_and_places_music(env):
    pv = env.preview(include=INC)
    env.write_md("music_dance_offset")
    pv = env.preview(include=INC)
    codes = {i["id"]: i["codes"] for i in pv["items"]}
    assert codes["S4"] == ["SOURCE_OFFSET_NOT_SUPPORTED"] and "S3" not in codes
    item = next(i for i in pv["items"] if i["id"] == "S4")
    assert item["status"] == "kept" and item["label"] == "ダンス「dance.vmd」"
    assert item["messages"] == ["ダンスを途中から始める設定は、v0.5の動作クリップではまだ使えません。"]
    assert item["legacy_value"]["motion_source_frame"] == 10
    assert [s["kind"] for s in pv["steps"]] == ["fps", "scene_add", "scene_add", "clip_place", "clip_source",
                                                "playhead"]
    env.apply(include=INC)
    assert list(env.clips()) == [MUSIC_ID]
    assert env.record()["source"]["live"]["music_dance"]["value"]["motion_source_frame"] == 10


def test_other_model_gets_its_own_instance_at_origin(env):
    env.write_md("music_dance_other_model")
    pv = env.preview(include=INC)
    s1 = next(i for i in pv["items"] if i["id"] == "S1")
    assert s1["codes"] == ["PLACED_AT_ORIGIN"] and s1["status"] == "mapped"
    assert s1["messages"] == ["曲とダンスの画面のモデルは位置を保存していないため、原点に置きました。"]
    env.apply(include=INC)
    assert len(env.scene()["instances"]) == 3
    other = env.inst(OTHER_PMX)[0]
    assert other["transform"] == {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}
    rec = env.record()
    step = next(s for s in rec["steps"] if s.get("role") == "dance_model")
    assert step["instance_id"] == other["id"] and step["kind"] == "scene_add"
    assert "units" not in step and "units" not in other  # S1 は印を付けない（WP-L8a §3.4）
    assert env.clips()[MOTION_ID]["target_scene_instance_id"] == other["id"]
    assert {a["asset_id"] for a in rec["assets"]} >= {OTHER_PMX}
    # キャラクター（bundle_a の PMX）は動作の対象ではない
    assert env.clips()[MOTION_ID]["target_scene_instance_id"] != env.inst(CHAR_ID)[0]["id"]


def test_dance_model_instance_is_not_an_extra_instance_in_export(env):
    """試験専用の逆変換: ダンスのモデルのインスタンスは取込が作ったもの。EXTRA_INSTANCE にならず往復が一致する。"""
    env.write_md("music_dance_other_model")
    env.apply(include=INC)
    cur = {k: v for k, v in env.collect(INC)["target"].items()}
    cur["playhead"] = {"seconds": env.ph()["seconds"]}
    out = L._export_legacy_for_test(env.record(), cur)
    assert out["bundle"] == load_bundle("bundle_a")
    assert out["changed"] == [] and out["unrepresentable"] == []


def test_null_model_id_targets_the_character_instance(env):
    env.write_md({**md_fixture("music_dance_full"), "model_id": None})
    pv = env.preview(include=INC)
    assert not [i for i in pv["items"] if i["id"] == "S1"]
    env.apply(include=INC)
    assert env.clips()[MOTION_ID]["target_scene_instance_id"] == env.inst(CHAR_ID)[0]["id"]
    assert len(env.scene()["instances"]) == 2


# ---- 長さが取れない・形式・範囲 -----------------------------------------------------------
def test_song_duration_unknown(env, monkeypatch):
    def fail(*a, **k):
        raise studio_v05_media_render.RenderError("ffprobe not found")
    monkeypatch.setattr(studio_v05_media_render, "media_info", fail)
    pv = env.preview(include=INC)
    s2 = next(i for i in pv["items"] if i["id"] == "S2")
    assert s2["status"] == "kept" and s2["codes"] == ["DURATION_UNKNOWN"]
    assert s2["messages"] == ["素材「song.wav」の長さを読み取れないため、タイムラインへは置きませんでした。"]
    env.apply(include=INC)
    assert list(env.clips()) == [MOTION_ID]


def test_unreadable_vmd_is_duration_unknown(env):
    env.files[MOTION_ID].write_bytes(b"not a vmd")
    env.before = env.fingerprint()
    pv = env.preview(include=INC)
    assert next(i for i in pv["items"] if i["id"] == "S3")["codes"] == ["DURATION_UNKNOWN"]


def test_fbx_motion_is_duration_unknown_even_if_duration_is_given():
    fbx = "fbx:aabbccddeeff00112233aabb"
    assets = make_assets() + [{"id": fbx, "name": "dance.fbx", "filename": "dance.fbx", "format": "FBX",
                               "kind": "motion", "source": "fbx", "available": True}]
    md = {**md_fixture("music_dance_full"), "motion_id": fbx}
    inputs = make_inputs(load_bundle("bundle_a"), assets=assets,
                         live={"music_dance": {"sha256": "ab" * 32, "value": md}, "timeline_editor": None})
    inputs["durations"] = {fbx: 3.0, "library:00112233445566778899aabb": 10.0}
    r = L.plan(inputs, include=INC)
    s3 = next(i for i in r["items"] if i["id"] == "S3")
    assert s3["status"] == "kept" and s3["codes"] == ["DURATION_UNKNOWN"]
    assert not [s for s in r["steps"] if s.get("role") == "dance"]


def test_fbx_motion_end_to_end(env):
    env.write_md({**md_fixture("music_dance_full"), "motion_id": "fbx:aabbccddeeff00112233aabb"})
    pv = env.preview(include=INC)
    assert next(i for i in pv["items"] if i["id"] == "S3")["codes"] == ["DURATION_UNKNOWN"]
    env.apply(include=INC)
    assert list(env.clips()) == [MUSIC_ID]


def test_missing_and_unsupported_assets(env):
    env.write_md({**md_fixture("music_dance_full"), "audio_id": "library:ffffffffffffffffffffffff",
                  "motion_id": "mmd:vmd:camera.vmd"})
    pv = env.preview(include=INC)
    by_id = {i["id"]: i for i in pv["items"]}
    assert by_id["S2"]["codes"] == ["ASSET_MISSING"]
    assert by_id["S2"]["messages"] == ["素材「ffffffffffffffffffffffff」が登録一覧にないか、元のファイルが見つかりません。別の素材への置き換えはしません。"]
    assert by_id["S3"]["codes"] == ["ASSET_UNSUPPORTED"]
    assert by_id["S3"]["messages"] == ["素材「camera.vmd」は、この場所には置けない形式です。"]
    env.write_md({**md_fixture("music_dance_full"), "audio_id": CHAR_ID})  # 曲にモデルを指定
    assert next(i for i in env.preview(include=INC)["items"] if i["id"] == "S2")["codes"] == ["ASSET_UNSUPPORTED"]


def test_unavailable_asset_is_missing(env):
    for a in env.assets:
        if a["id"] == MUSIC_ID:
            a["available"] = False
    pv = env.preview(include=INC)
    assert next(i for i in pv["items"] if i["id"] == "S2")["codes"] == ["ASSET_MISSING"]


def test_source_start_beyond_song_length_is_out_of_range(env):
    env.write_md({**md_fixture("music_dance_full"), "audio_source_frame": 300})  # 10秒 = 曲の長さ
    pv = env.preview(include=INC)
    s2 = next(i for i in pv["items"] if i["id"] == "S2")
    assert s2["status"] == "kept" and s2["codes"] == ["OUT_OF_RANGE"]
    env.apply(include=INC)
    assert list(env.clips()) == [MOTION_ID]


def test_clip_ending_after_24_hours_is_out_of_range_not_a_failed_apply(env, monkeypatch):
    env.write_md({**md_fixture("music_dance_full"), "audio_start_frame": 216000})  # 7200秒 + 長さ
    big = lambda *a, **k: {"asset_id": a[1], "kind": "audio", "duration_seconds": 80000.0, "has_audio": True}  # noqa: E731
    monkeypatch.setattr(studio_v05_media_render, "media_info", big)
    pv = env.preview(include=INC)
    assert next(i for i in pv["items"] if i["id"] == "S2")["codes"] == ["OUT_OF_RANGE"]
    env.apply(include=INC)
    assert env.record()["state"] == "applied"


def test_zero_source_start_makes_no_clip_source_step(env):
    env.write_md({**md_fixture("music_dance_full"), "audio_source_frame": 0})
    pv = env.preview(include=INC)
    assert "clip_source" not in [s["kind"] for s in pv["steps"]]
    env.apply(include=INC)
    assert env.clips()[MUSIC_ID]["source_start"] == 0 and env.clips()[MUSIC_ID]["duration"] == SONG_SECONDS


# ---- 動かす相手（S5） -----------------------------------------------------------------
def test_incompatible_model_leaves_target_unset_but_places_clip(env):
    env.write_md({**md_fixture("music_dance_full"), "model_id": "integrated:foo.glb"})  # GLB と VMD は不可
    pv = env.preview(include=INC)
    s3 = next(i for i in pv["items"] if i["id"] == "S3")
    assert s3["status"] == "mapped" and s3["codes"] == ["MOTION_TARGET_UNSET"]
    assert s3["messages"] == ["動作のクリップは置きましたが、動かすキャラクターを決められませんでした。クリップを開いて［対象モデルを保存］で選んでください。"]
    assert pv["summary"]["warnings"] >= 1
    assert "clip_assign" not in [s["kind"] for s in pv["steps"]]
    env.apply(include=INC)
    assert "target_scene_instance_id" not in env.clips()[MOTION_ID]
    assert len(env.inst("integrated:foo.glb")) == 1  # ダンスのモデルのインスタンスは置く（PLACED_AT_ORIGIN）


def test_dance_model_that_cannot_be_placed_does_not_fall_back_to_the_character(env):
    env.write_md({**md_fixture("music_dance_full"), "model_id": "mmd:B:nothing.pmx"})
    pv = env.preview(include=INC)
    assert next(i for i in pv["items"] if i["id"] == "S1")["codes"] == ["ASSET_MISSING"]
    assert next(i for i in pv["items"] if i["id"] == "S3")["codes"] == ["MOTION_TARGET_UNSET"]
    env.apply(include=INC)
    assert "target_scene_instance_id" not in env.clips()[MOTION_ID]


def test_model_id_without_prefix_is_normalized_and_shared(env):
    env.write_md({**md_fixture("music_dance_full"), "model_id": "foo.glb"})
    pv = env.preview(include=INC)
    s1 = next(i for i in pv["items"] if i["id"] == "S1")
    assert s1["legacy_value"] == "foo.glb" and s1["codes"] == ["PLACED_AT_ORIGIN"]
    assert [s["asset_id"] for s in pv["steps"] if s.get("role") == "dance_model"] == ["integrated:foo.glb"]


def test_no_workspace_asset_but_model_id_places_dance_model(env):
    env.resnap("bundle_c")  # workspace なし
    pv = env.preview(include=INC)
    assert [s["role"] for s in pv["steps"] if s["kind"] == "scene_add"] == ["dance_model"]
    env.apply(include=INC)
    assert env.clips()[MOTION_ID]["target_scene_instance_id"] == env.inst(CHAR_ID)[0]["id"]


# ---- include / 保存の読み方 -----------------------------------------------------------
def test_without_include_the_file_is_not_read(env, monkeypatch):
    env.md_path.write_text("{broken json", encoding="utf-8")
    env.before = env.fingerprint()
    calls = []
    real = L._read_music_dance
    monkeypatch.setattr(L, "_read_music_dance", lambda *a, **k: calls.append(1) or real(*a, **k))
    pv = env.preview()
    assert pv["ok"] and calls == []
    assert [s["kind"] for s in pv["steps"]] == ["fps", "scene_add", "scene_add", "playhead"]
    assert pv["expected"]["live_sha256"] == {"music_dance": None, "timeline_editor": None}
    assert not [i for i in pv["items"] if i["id"].startswith("S")]
    env.apply()
    assert env.record()["source"]["live"] == {"music_dance": None, "timeline_editor": None}
    assert env.arr()["clips"] == []


def test_without_include_media_is_not_probed(env, song_duration):
    env.preview()
    env.apply()
    assert song_duration == []


def test_missing_file_with_include_is_not_an_error(env):
    env.md_path.unlink()
    env.before = env.fingerprint()
    pv = env.preview(include=INC)
    assert pv["ok"] and pv["expected"]["live_sha256"]["music_dance"] is None
    assert not [i for i in pv["items"] if i["id"].startswith("S")]
    env.apply(include=INC)
    assert env.record()["source"]["live"]["music_dance"] is None


def test_broken_file_with_include_is_kept_whole_and_the_rest_is_imported(env):
    env.md_path.write_text("{broken json", encoding="utf-8")
    env.before = env.fingerprint()
    pv = env.preview(include=INC)
    assert pv["ok"]
    bad = next(i for i in pv["items"] if i["id"] == "S0")
    assert bad["status"] == "kept" and bad["codes"] == ["LIVE_SOURCE_INVALID"]
    assert bad["label"] == "曲とダンスの画面の保存" and bad["legacy_value"] == "{broken json"
    assert bad["messages"] == ["このファイルは形が正しくないため、取り込みませんでした。元のファイルはそのままです。"]
    assert pv["expected"]["live_sha256"]["music_dance"] == sha(env.md_path)
    env.apply(include=INC)
    rec = env.record()
    assert rec["state"] == "applied" and len(env.scene()["instances"]) == 2 and env.arr()["clips"] == []
    assert rec["source"]["live"]["music_dance"] == {"sha256": sha(env.md_path), "value": "{broken json"}
    env.revert()


@pytest.mark.parametrize("bad", [
    {**music_dance_project.DEFAULT, "fps": 24},                    # fps は 30 固定
    {**music_dance_project.DEFAULT, "audio_start_frame": 216001},  # 範囲外
    {**music_dance_project.DEFAULT, "extra": 1},                   # 余分な項目
    [1, 2, 3],
])
def test_music_dance_that_fails_validation_is_invalid(env, bad):
    env.write_md(bad)
    pv = env.preview(include=INC)
    assert [i["codes"] for i in pv["items"] if i["id"] == "S0"] == [["LIVE_SOURCE_INVALID"]]
    assert not [i for i in pv["items"] if i["id"] in ("S1", "S2", "S3", "S6")]


def test_oversize_file_is_invalid_and_not_stored(env):
    env.md_path.write_bytes(b" " * (L.LIVE_MAX_BYTES + 1))
    env.before = env.fingerprint()
    pv = env.preview(include=INC)
    bad = next(i for i in pv["items"] if i["id"] == "S0")
    assert bad["codes"] == ["LIVE_SOURCE_INVALID"] and bad["legacy_value"] is None
    env.apply(include=INC)
    assert env.record()["source"]["live"]["music_dance"]["value"] is None


def test_default_empty_project_places_nothing_but_keeps_scr10_position(env):
    env.write_md(dict(music_dance_project.DEFAULT))
    pv = env.preview(include=INC)
    assert [i["id"] for i in pv["items"] if i["id"].startswith("S")] == ["S6"]
    assert [s["kind"] for s in pv["steps"]] == ["fps", "scene_add", "scene_add", "playhead"]


# ---- 確認後の変更 ---------------------------------------------------------------------
def test_music_dance_changed_after_preview_is_source_changed_and_nothing_is_written(env):
    req = env.request(include=INC)
    env.write_md({**md_fixture("music_dance_full"), "audio_start_frame": 90})
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "SOURCE_CHANGED"
    assert env.record() is None and env.scene()["instances"] == [] and env.arr()["clips"] == []


def test_include_missing_in_request_does_not_match_expected_with_include(env):
    req = env.request(include=INC)
    req["include"] = []
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "SOURCE_CHANGED"


def test_target_changed_when_clip_added_after_preview(env):
    req = env.request(include=INC)
    arrangement.place(env.dirs["arrangements"], env.catalog, env.target, MOTION_ID, "motion", 50, 2,
                      env.arr()["revision"], env.assets)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(req)
    assert code_of(e) == "TARGET_CHANGED"
    assert len(env.arr()["clips"]) == 1


# ---- 失敗の注入 ------------------------------------------------------------------------
def assert_clean(env):
    assert env.scene()["instances"] == [] and env.arr()["clips"] == []
    assert "fps" not in env.row(env.target)
    assert env.row(env.other) == env.other_row


def test_clip_assign_failure_removes_clips_and_instances(env, monkeypatch):
    def boom(*a, **k):
        raise studio_v05_multi_motion.MultiMotionError("injected")
    monkeypatch.setattr(studio_v05_multi_motion, "assign", boom)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(include=INC)
    assert code_of(e) == "APPLY_FAILED" and e.value.state == "rolled_back"
    assert_clean(env)
    rec = env.record()
    assert rec["state"] == "rolled_back" and all(s["status"] == "undone" for s in rec["steps"])
    assert rec["error"]["type"] == "MultiMotionError"


def test_clip_assign_failure_with_dance_model_removes_the_extra_instance_too(env, monkeypatch):
    env.write_md("music_dance_other_model")

    def boom(*a, **k):
        raise studio_v05_multi_motion.MultiMotionError("injected")
    monkeypatch.setattr(studio_v05_multi_motion, "assign", boom)
    with pytest.raises(L.LegacyImportError):
        env.apply(include=INC)
    assert_clean(env)


def test_clip_source_failure_rolls_back(env, monkeypatch):
    real = arrangement.edit_clip

    def fail_on_source_update(*a, **k):
        if k.get("source_start"):
            raise arrangement.ArrangementError("injected")
        return real(*a, **k)
    monkeypatch.setattr(arrangement, "edit_clip", fail_on_source_update)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(include=INC)
    assert e.value.state == "rolled_back"
    assert_clean(env)


def test_interrupted_dance_clip_place_is_found_by_pre_ids(env, monkeypatch):
    real = arrangement.place
    seen = {"n": 0}

    def real_then_raise(*a, **k):
        out = real(*a, **k)
        seen["n"] += 1
        if seen["n"] == 2:
            raise OSError("power cut after write")
        return out
    monkeypatch.setattr(arrangement, "place", real_then_raise)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(include=INC)
    assert e.value.state == "rolled_back"
    assert_clean(env)
    dance = next(s for s in env.record()["steps"] if s.get("role") == "dance")
    assert dance["clip_id"] is None and dance["status"] == "undone" and dance["started"] is True


def test_unstarted_dance_clip_does_not_delete_users_clip(env, monkeypatch):
    """強制停止が曲のクリップの途中で起き、踊りのクリップは始まっていない。
    利用者が同じ素材・トラック・開始で足したクリップは消さない。"""
    real = arrangement.place

    def die_on_music(*a, **k):
        if a[3] == MUSIC_ID:
            raise KeyboardInterrupt
        return real(*a, **k)
    monkeypatch.setattr(arrangement, "place", die_on_music)
    with pytest.raises(KeyboardInterrupt):
        env.apply(include=INC)
    monkeypatch.setattr(arrangement, "place", real)
    places = {s["role"]: s for s in env.record()["steps"] if s["kind"] == "clip_place"}
    assert places["music"].get("started") is True and not places["dance"].get("started")
    mine = real(env.dirs["arrangements"], env.catalog, env.target, MOTION_ID, "motion", 2.0, 1.0,
                env.arr()["revision"], env.assets)["clip"]["id"]
    out = env.revert()
    assert out["record"]["state"] == "rolled_back"
    assert [c["id"] for c in env.arr()["clips"]] == [mine]
    assert env.scene()["instances"] == []


# ---- 取消 -------------------------------------------------------------------------------
def test_revert_removes_clips_and_instances_and_keeps_music_dance_file(env):
    env.apply(include=INC)
    md_sha = sha(env.md_path)
    arr_rev, scene_rev = env.arr()["revision"], env.scene()["revision"]
    out = env.revert()
    assert out["record"]["state"] == "reverted"
    assert env.arr()["clips"] == [] and env.scene()["instances"] == []
    assert "fps" not in env.row(env.target)
    assert env.arr()["revision"] > arr_rev and env.scene()["revision"] > scene_rev  # revision は増える一方
    assert sha(env.md_path) == md_sha
    assert all(s["status"] == "undone" for s in env.record()["steps"])


def test_revert_keeps_clips_the_user_added_later(env):
    env.apply(include=INC)
    mine = arrangement.place(env.dirs["arrangements"], env.catalog, env.target, MOTION_ID, "motion", 20.0, 1.0,
                             env.arr()["revision"], env.assets)["clip"]["id"]
    env.revert()
    assert [c["id"] for c in env.arr()["clips"]] == [mine]


def test_revert_moves_with_user_edits_of_imported_clips(env):
    """取り込んだクリップを利用者が動かしても、取消はそのクリップを消す（動かした分ごと）。"""
    env.apply(include=INC)
    dance = env.clips()[MOTION_ID]
    arrangement.edit_clip(env.dirs["arrangements"], env.catalog, env.target, dance["id"], env.arr()["revision"],
                          "update", start=30.0, duration=1.0, track="motion", layout_root=env.dirs["track_layouts"])
    env.revert()
    assert env.arr()["clips"] == []


def test_revert_blocked_when_user_assigned_another_clip_to_dance_model(env):
    env.write_md("music_dance_other_model")
    env.apply(include=INC)
    other = env.inst(OTHER_PMX)[0]
    r = arrangement.place(env.dirs["arrangements"], env.catalog, env.target, MOTION_ID, "motion", 10, 2,
                          env.arr()["revision"], env.assets)
    studio_v05_multi_motion.assign(env.dirs["arrangements"], env.dirs["scene_instances"], env.dirs["scene_models"],
                                   env.catalog, env.target, r["clip"]["id"], env.arr()["revision"], other["id"],
                                   env.assets)
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "REVERT_BLOCKED" and "取り込んだダンスのモデルを対象にした" in e.value.message
    assert len(env.arr()["clips"]) == 3 and len(env.scene()["instances"]) == 3


def test_second_import_after_revert_archives_the_old_record(env):
    env.apply(include=INC)
    env.revert()
    env.apply(include=INC)
    hist = list((env.data / "studio_v05_legacy_imports" / "history").glob(env.target + "-*.json"))
    assert len(hist) == 1
    assert env.record()["state"] == "applied" and len(env.arr()["clips"]) == 2


# ---- 決定性・書き込み・ログ ----------------------------------------------------------------
def test_plan_is_deterministic_and_inputs_are_not_mutated(env):
    inputs = env.collect(INC)
    before = copy.deepcopy(inputs)
    first = L.plan(inputs, include=INC)
    assert inputs == before
    assert L.plan(copy.deepcopy(inputs), include=INC) == first
    assert L.plan(inputs, include=INC) == first


def test_collect_reads_durations_and_audio_flags(env, song_duration):
    inputs = env.collect(INC)
    assert inputs["durations"] == {MUSIC_ID: SONG_SECONDS, MOTION_ID: VMD_SECONDS}
    assert inputs["audio_flags"] == {MUSIC_ID: True}
    assert inputs["live"]["music_dance"]["sha256"] == sha(env.md_path)
    assert inputs["live"]["music_dance"]["value"] == md_fixture("music_dance_full")
    assert inputs["live"]["timeline_editor"] is None
    assert song_duration == [MUSIC_ID]


def test_offset_dance_does_not_read_the_vmd(env, monkeypatch):
    env.write_md("music_dance_offset")
    monkeypatch.setattr(L, "vmd_last_frame", lambda raw: pytest.fail("VMD を読んではいけない"))
    assert MOTION_ID not in env.collect(INC)["durations"]


def test_apply_event_and_state_logged(env, events):
    env.apply(include=INC)
    assert [(n, lv, f["state"]) for n, lv, f in events] == [("v05_legacy_import_apply", "info", "applied")]
    assert events[0][2]["steps"] == 8


def test_writes_go_only_through_public_functions(env, monkeypatch):
    """取込の書き込みは、公開関数（place / edit_clip / assign / mutate / set_fps / update）と取込記録の保存だけ。"""
    seen = []
    for mod, names in ((arrangement, ("place", "edit_clip")), (studio_v05_multi_motion, ("assign",)),
                       (scene, ("mutate",))):
        for name in names:
            real = getattr(mod, name)
            monkeypatch.setattr(mod, name, (lambda r, n: lambda *a, **k: seen.append(n) or r(*a, **k))(real, name))
    env.apply(include=INC)
    assert seen.count("place") == 2 and seen.count("edit_clip") == 1 and seen.count("assign") == 1
    assert seen.count("mutate") == 2
    seen.clear()
    env.revert()
    assert seen.count("edit_clip") == 2 and seen.count("mutate") == 2  # 削除も公開関数だけ


def test_round_trip_export_matches_with_music_dance(env):
    env.apply(include=INC)
    cur = dict(env.collect(INC)["target"])
    cur["playhead"] = {"seconds": env.ph()["seconds"]}
    out = L._export_legacy_for_test(env.record(), cur)
    assert out["bundle"] == load_bundle("bundle_a")
    assert out["changed"] == [] and out["unrepresentable"] == []


def test_bundle_b_without_character_placement_still_imports_dance(env):
    env.resnap("bundle_b")  # asset: foo.glb（接頭辞なし）
    env.write_md({**md_fixture("music_dance_full"), "model_id": None})
    pv = env.preview(include=INC)
    s3 = next(i for i in pv["items"] if i["id"] == "S3")
    assert s3["codes"] == ["MOTION_TARGET_UNSET"]  # GLB に VMD は割り当てない
    env.apply(include=INC)
    assert set(env.clips()) == {MUSIC_ID, MOTION_ID}
