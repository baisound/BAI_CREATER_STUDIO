"""WP-L7b 旧タイムライン編集（timeline_editor）の取込の受け入れ試験（設計書 §3.3 T1〜T4、§5.1、§5.2、WP-L7b）。

隔離した tmp_path の data だけに書く（実データ data/ には触れない）。skip は使わない。
fixture は tests/fixtures/legacy_import/timeline_editor_*.json と bundle_a・bundle_c。
R1（元を壊さない）は env fixture が各試験の前後で確かめる（timeline_editor.json の SHA-256 を含む）。
"""
import json
import re
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import studio_v05_arrangement as arrangement
import studio_v05_legacy_import as L
import studio_v05_multi_motion
from legacy_import_fixtures import FIXTURE_DIR, load_bundle
from test_studio_v05_legacy_import_apply import CHAR_ID, MOTION_ID, MUSIC_ID, Env, code_of, make_assets, sha
from test_studio_v05_legacy_import_music_dance import OTHER_PMX, SONG_SECONDS, md_fixture
from test_studio_v05_legacy_import_plan import make_inputs

import studio_v05_media_render

INC = ("timeline_editor",)
BOTH = ("music_dance", "timeline_editor")
RUN, WALK, JUMP_OLD, JUMP_NEW, HERO, GLB_ANIM = (c * 24 for c in "abcdef")
FBX = "fbx:"
MINIMAL_VMD = Path(__file__).parent / "fixtures" / "minimal.vmd"


def te_fixture(name):
    return json.loads((FIXTURE_DIR / (name + ".json")).read_text(encoding="utf-8"))


def fbx_asset(fid, name, kind="motions", available=True):
    return {"id": FBX + fid, "name": name, "format": "FBX", "kind": kind, "source": "fbx", "available": available}


def make_manifest():
    return {"files": [
        {"id": RUN, "name": "Run.fbx", "kind": "motions"},
        {"id": WALK, "name": "Walk_Cycle.fbx", "kind": "motions"},
        {"id": JUMP_OLD, "name": "Jump.fbx", "kind": "motions"},
        {"id": JUMP_NEW, "name": "jump.FBX", "kind": "motions"},   # 同じ正規化名: 後ろが勝つ
        {"id": HERO, "name": "Hero.fbx", "kind": "modelA"},        # モデル枠は候補にしない
    ], "mapping": {}}


def make_fbx_assets():
    return [fbx_asset(RUN, "Run.fbx"), fbx_asset(WALK, "Walk_Cycle.fbx"), fbx_asset(JUMP_OLD, "Jump.fbx"),
            fbx_asset(JUMP_NEW, "jump.FBX"), fbx_asset(HERO, "Hero.fbx", kind="modelA")]


class TEnv(Env):
    """Env に旧タイムライン編集の保存、FBX 動作の素材、manifest を足す。"""

    def __init__(self, tmp_path, te="timeline_editor_basic", bundle="bundle_a"):
        super().__init__(tmp_path, bundle)
        self.assets = make_assets() + make_fbx_assets() + [
            {"id": OTHER_PMX, "name": "other.pmx", "format": "PMX", "kind": "B", "source": "mmd", "available": True}]
        self.manifest = make_manifest()
        for fid in (RUN, WALK, JUMP_NEW):
            p = self.data / "originals" / (fid[:4] + ".fbx")
            p.write_bytes(("fbx motion " + fid).encode() * 10)
            self.files[FBX + fid] = p
        vmd = self.data / "originals" / "dance.vmd"
        shutil.copy(MINIMAL_VMD, vmd)
        self.files[MOTION_ID] = vmd
        song = self.data / "originals" / "song.wav"
        song.write_bytes(b"RIFF dummy song" * 10)
        self.files[MUSIC_ID] = song
        self.te_path = self.data / "timeline_editor.json"
        self.md_path = self.data / "music_dance_project.json"
        self.write_te(te)

    def write_te(self, name_or_value):
        value = te_fixture(name_or_value) if isinstance(name_or_value, str) else name_or_value
        self.te_path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        self.before = self.fingerprint()  # 旧の別保存は読むだけ。書き換えた後の状態を R1 の基準にする
        return value

    def write_md(self, name_or_value):
        value = md_fixture(name_or_value) if isinstance(name_or_value, str) else name_or_value
        self.md_path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        self.before = self.fingerprint()

    def collect(self, include=()):
        return L.collect(self.data, self.target, list(include), self.assets, self.manifest, self.asset_path)

    def apply(self, request=None, **kw):
        return L.apply(self.data, request if request is not None else self.request(**kw), self.assets,
                       self.manifest, self.asset_path)

    def motion_clips(self):
        return [c for c in self.arr()["clips"] if c["track"] == "motion"]

    def clip_of(self, fid):
        return [c for c in self.arr()["clips"] if c["asset_id"] == FBX + fid]

    def inst(self, asset_id):
        return [i for i in self.scene()["instances"] if i["asset_id"] == asset_id]


@pytest.fixture(autouse=True)
def song_duration(monkeypatch):
    monkeypatch.setattr(studio_v05_media_render, "media_info", lambda data_root, asset_id, inventory: {
        "asset_id": asset_id, "kind": "audio", "duration_seconds": SONG_SECONDS, "has_audio": True})


@pytest.fixture
def events(monkeypatch):
    calls = []
    monkeypatch.setattr(L, "event", lambda name, level="info", **f: calls.append((name, level, f)))
    return calls


@pytest.fixture
def env(tmp_path, events):
    e = TEnv(tmp_path)
    yield e
    now, was = e.fingerprint(), dict(e.before)
    for rel in e.ignore_paths:
        now.pop(rel, None)
        was.pop(rel, None)
    assert now == was, "R1: 書き込み対象でないファイルが変わった"
    assert e.leftover_tmp() == []


def item_of(pv, iid, pointer=None):
    found = [i for i in pv["items"] if i["id"] == iid and (pointer is None or i["pointer"] == pointer)]
    assert len(found) == 1, [(i["id"], i["pointer"]) for i in pv["items"]]
    return found[0]


def t_warnings(pv):
    """T 項目の警告の数（M3・M4 の UNIT_SEMANTICS_DIFFER は除く）。summary.warnings は全項目の合計に一致する。"""
    n = sum(1 for i in pv["items"] if i["id"].startswith("T") for c in i["codes"] if L.KINDS[c] == "警告")
    assert pv["summary"]["warnings"] == n + sum(1 for i in pv["items"] if not i["id"].startswith("T")
                                                for c in i["codes"] if L.KINDS[c] == "警告")
    return n


def kinds(pv):
    return [s["kind"] for s in pv["steps"]]


# ---- 基本: 開始と長さの秒、対象 ---------------------------------------------------------
def test_basic_places_clips_with_seconds_and_targets_the_character(env):
    pv = env.preview(include=INC)
    assert pv["ok"] and kinds(pv) == ["fps", "scene_add", "scene_add", "clip_place", "clip_assign", "clip_place",
                                      "clip_assign", "playhead"]
    env.apply(include=INC)
    rec = env.record()
    assert rec["state"] == "applied" and all(s["status"] == "done" for s in rec["steps"])
    run, walk = env.clip_of(RUN)[0], env.clip_of(WALK)[0]
    assert run["track"] == "motion" and run["start"] == 1.0 and run["duration"] == 3.0
    assert walk["start"] == 5.0 and walk["duration"] == 1.5
    char = env.inst(CHAR_ID)[0]
    assert run["target_scene_instance_id"] == char["id"] and walk["target_scene_instance_id"] == char["id"]
    assert len(env.scene()["instances"]) == 2 and len(env.arr()["clips"]) == 2
    assert [s["role"] for s in rec["steps"] if s["kind"] == "clip_place"] == ["timeline", "timeline"]


@pytest.mark.parametrize("start,duration", [(1, 1), (7, 31), (31, 89), (12345, 777), (1000000, 100000)])
def test_frames_round_trip_for_awkward_values(env, start, duration):
    """30 で割り切れない開始・長さでも、取込直後に round(秒×30) が元のフレームへ戻る。"""
    env.write_te({"schema": 1, "clips": [{"name": "Run", "start": start, "duration": duration, "speed": 1,
                                          "blend": 0}]})
    env.apply(include=INC)
    clip = env.clip_of(RUN)[0]
    assert round(clip["start"] * 30) == start and round(clip["duration"] * 30) == duration


def test_items_labels_codes_and_summary(env):
    pv = env.preview(include=INC)
    first = item_of(pv, "T2", "/clips/0")
    assert first["status"] == "mapped" and first["label"] == "旧タイムラインの動作「Run.fbx」"
    assert first["codes"] == [] and first["messages"] == []
    assert first["legacy_value"] == {"name": "Run.fbx", "start": 30, "duration": 90, "speed": 1.0, "blend": 0}
    second = item_of(pv, "T2", "/clips/1")
    assert second["label"] == "旧タイムラインの動作「Walk_Cycle.fbx」" and second["codes"] == ["BLEND_DROPPED"]
    assert second["messages"] == ["動作のつなぎ（補間フレーム）はv0.5にまだ無いため、使いませんでした。値は取込記録に残しました。"]
    assert second["legacy_value"]["blend"] == 6
    places = [s for s in pv["steps"] if s["kind"] == "clip_place"]
    assert first["step"] == places[0]["n"] and second["step"] == places[1]["n"]
    t4 = item_of(pv, "T4")
    assert t4["status"] == "kept" and t4["codes"] == ["NO_V05_FIELD"] and t4["legacy_value"] == 1730000000.5
    assert t4["label"] == "旧タイムライン編集の更新日時"
    assert t_warnings(pv) == 1
    assert "旧タイムラインの動作「Run.fbx」" in pv["summary"]["mapped"]
    assert pv["source_info"]["timeline_editor_updated"] is not None and pv["source_info"]["music_dance_updated"] is None
    for it in pv["items"]:
        assert "/" not in it["label"] and not re.search(r"[A-Z_]{6,}", it["label"])
    ids = [i["id"] for i in pv["items"]]
    assert ids.index("M7") < ids.index("T2") < ids.index("T4")


def test_assets_record_lists_referenced_originals_once_with_sha(env):
    env.write_te({"schema": 1, "clips": [
        {"name": "Run", "start": 0, "duration": 30, "speed": 1, "blend": 0},
        {"name": "Run", "start": 60, "duration": 30, "speed": 1, "blend": 0}]})
    env.apply(include=INC)
    rows = {a["asset_id"]: a for a in env.record()["assets"]}
    assert set(rows) == {CHAR_ID, next(k for k in rows if k.startswith("library:")), FBX + RUN}
    assert [a["asset_id"] for a in env.record()["assets"]].count(FBX + RUN) == 1
    assert rows[FBX + RUN]["sha256"] == sha(env.files[FBX + RUN]) and rows[FBX + RUN]["legacy_ref"] == "Run"
    assert len(env.clip_of(RUN)) == 2


def test_record_keeps_whole_timeline_value_and_hash(env):
    env.apply(include=INC)
    src = env.record()["source"]
    assert src["include"] == ["timeline_editor"] and src["live"]["music_dance"] is None
    assert src["live"]["timeline_editor"] == {"sha256": sha(env.te_path), "value": te_fixture("timeline_editor_basic")}


def test_all_steps_carry_started_mark(env):
    env.apply(include=INC)
    assert all(s.get("started") is True for s in env.record()["steps"])


# ---- T1 名前の解決 ---------------------------------------------------------------------
def test_normalized_name_resolves_without_mapping(env):
    env.write_te({"schema": 1, "clips": [
        {"name": "RUN.FBX", "start": 0, "duration": 30, "speed": 1, "blend": 0},
        {"name": "walk-cycle!", "start": 30, "duration": 30, "speed": 1, "blend": 0}]})
    pv = env.preview(include=INC)
    assert [i["codes"] for i in pv["items"] if i["id"] == "T2"] == [[], []]
    assert [s["asset_id"] for s in pv["steps"] if s["kind"] == "clip_place"] == [FBX + RUN, FBX + WALK]


def test_mapping_value_is_a_normalized_name_and_takes_priority(env):
    env.manifest["mapping"] = {"Run": "walkcycle"}  # 値は素材IDではなく正規化名
    env.write_te({"schema": 1, "clips": [{"name": "Run", "start": 0, "duration": 30, "speed": 1, "blend": 0}]})
    pv = env.preview(include=INC)
    assert [s["asset_id"] for s in pv["steps"] if s["kind"] == "clip_place"] == [FBX + WALK]
    env.apply(include=INC)
    assert env.clip_of(WALK) and not env.clip_of(RUN)


def test_mapping_value_that_is_an_asset_id_is_not_treated_as_an_asset_id(env):
    env.manifest["mapping"] = {"Run": FBX + RUN}
    env.write_te({"schema": 1, "clips": [{"name": "Run", "start": 0, "duration": 30, "speed": 1, "blend": 0}]})
    pv = env.preview(include=INC)
    t1 = item_of(pv, "T1")
    assert t1["status"] == "kept" and t1["codes"] == ["NAME_UNRESOLVED"]
    assert t1["messages"] == ["この動作名に当たる登録素材が見つかりません。"]
    assert "clip_place" not in kinds(pv)
    env.apply(include=INC)
    assert env.arr()["clips"] == []


@pytest.mark.parametrize("empty", ["", None, 5, ["x"]])
def test_empty_or_non_string_mapping_value_means_automatic_match(env, empty):
    env.manifest["mapping"] = {"Run": empty}
    env.write_te({"schema": 1, "clips": [{"name": "Run", "start": 0, "duration": 30, "speed": 1, "blend": 0}]})
    pv = env.preview(include=INC)
    assert [s["asset_id"] for s in pv["steps"] if s["kind"] == "clip_place"] == [FBX + RUN]


def test_duplicate_names_last_one_wins_with_warning(env):
    env.write_te({"schema": 1, "clips": [{"name": "Jump", "start": 0, "duration": 30, "speed": 1, "blend": 0}]})
    pv = env.preview(include=INC)
    it = item_of(pv, "T2")
    assert it["status"] == "mapped" and it["codes"] == ["NAME_DUPLICATE_LAST_WINS"]
    assert it["messages"] == ["同じ名前の動作が複数あります。旧画面と同じく、後から登録したものを使いました。"]
    assert [s["asset_id"] for s in pv["steps"] if s["kind"] == "clip_place"] == [FBX + JUMP_NEW]
    assert t_warnings(pv) == 1


def test_model_slots_are_not_candidates(env):
    env.write_te({"schema": 1, "clips": [{"name": "Hero", "start": 0, "duration": 30, "speed": 1, "blend": 0}]})
    pv = env.preview(include=INC)
    assert item_of(pv, "T1")["codes"] == ["NAME_UNRESOLVED"]


def test_unknown_name_is_kept_as_unresolved(env):
    env.write_te({"schema": 1, "clips": [{"name": "Nothing Here", "start": 0, "duration": 30, "speed": 1,
                                          "blend": 0}]})
    pv = env.preview(include=INC)
    t1 = item_of(pv, "T1")
    assert t1["status"] == "kept" and t1["label"] == "旧タイムラインの動作「Nothing Here」"
    assert t1["legacy_value"]["name"] == "Nothing Here"


def test_manifest_without_files_resolves_nothing(env):
    env.manifest = {"files": [], "mapping": {}}
    pv = env.preview(include=INC)
    assert [i["codes"] for i in pv["items"] if i["id"] == "T1"] == [["NAME_UNRESOLVED"], ["NAME_UNRESOLVED"]]
    assert "clip_place" not in kinds(pv)


def test_missing_and_unavailable_and_unsupported_assets(env):
    env.write_te({"schema": 1, "clips": [
        {"name": "Run", "start": 0, "duration": 30, "speed": 1, "blend": 0},
        {"name": "Walk Cycle", "start": 30, "duration": 30, "speed": 1, "blend": 0},
        {"name": "Jump", "start": 60, "duration": 30, "speed": 1, "blend": 0}]})
    env.assets = [a for a in env.assets if a["id"] != FBX + RUN]          # 一覧に無い
    for a in env.assets:
        if a["id"] == FBX + WALK:
            a["available"] = False                                          # 原本が無い
        if a["id"] == FBX + JUMP_NEW:
            a["kind"] = "modelC"                                            # 動作ではない
    pv = env.preview(include=INC)
    codes = [i["codes"] for i in pv["items"] if i["id"] == "T1"]
    assert codes == [["ASSET_MISSING"], ["ASSET_MISSING"], ["ASSET_UNSUPPORTED"]]
    msgs = [i["messages"][0] for i in pv["items"] if i["id"] == "T1"]
    assert msgs[0] == "素材「%s」が登録一覧にないか、元のファイルが見つかりません。別の素材への置き換えはしません。" % RUN
    assert msgs[1] == "素材「Walk_Cycle.fbx」が登録一覧にないか、元のファイルが見つかりません。別の素材への置き換えはしません。"
    assert msgs[2] == "素材「jump.FBX」は、この場所には置けない形式です。"
    env.apply(include=INC)
    assert env.arr()["clips"] == []


# ---- T2 速度、T3 つなぎ ----------------------------------------------------------------
def test_speed_other_than_one_is_kept_and_blend_is_dropped_with_a_warning(env):
    env.write_te("timeline_editor_mixed")
    pv = env.preview(include=INC)
    slow = item_of(pv, "T2", "/clips/1")
    assert slow["status"] == "kept" and slow["codes"] == ["SPEED_NOT_SUPPORTED"]
    assert slow["messages"] == ["再生速度を変えた動作は、v0.5ではまだ置けません。"]
    assert slow["legacy_value"]["speed"] == 1.5 and slow["legacy_value"]["blend"] == 12
    run, jump = item_of(pv, "T2", "/clips/0"), item_of(pv, "T2", "/clips/2")
    assert run["codes"] == [] and set(jump["codes"]) == {"NAME_DUPLICATE_LAST_WINS", "BLEND_DROPPED"}
    assert item_of(pv, "T1", "/clips/3")["codes"] == ["NAME_UNRESOLVED"]
    assert item_of(pv, "T1", "/clips/4")["codes"] == ["NAME_UNRESOLVED"]
    assert t_warnings(pv) == 2  # Jump の重複とつなぎ。置かなかった Walk Cycle の分は数えない
    env.apply(include=INC)
    assert sorted((c["asset_id"], c["start"], c["duration"]) for c in env.arr()["clips"]) == sorted([
        (FBX + RUN, 0.0, 2.0), (FBX + JUMP_NEW, round(200 / 30, 4), 1.0)])


def test_blend_zero_has_no_warning_and_blend_value_stays_in_the_record(env):
    env.write_te({"schema": 1, "clips": [{"name": "Run", "start": 0, "duration": 30, "speed": 1, "blend": 6},
                                          {"name": "Walk Cycle", "start": 30, "duration": 30, "speed": 1,
                                           "blend": 0}]})
    pv = env.preview(include=INC)
    assert [i["codes"] for i in pv["items"] if i["id"] == "T2"] == [["BLEND_DROPPED"], []]
    env.apply(include=INC)
    rec = env.record()
    assert rec["source"]["live"]["timeline_editor"]["value"]["clips"][0]["blend"] == 6
    assert [i["legacy_value"]["blend"] for i in rec["items"] if i["id"] == "T2"] == [6, 0]


# ---- 動かす相手 ------------------------------------------------------------------------
def test_no_character_leaves_target_unset_but_places_the_clips(env):
    env.save_snapshot("bundle_c")  # workspace なし
    env.before = env.fingerprint()
    pv = env.preview(include=INC)
    its = [i for i in pv["items"] if i["id"] == "T2"]
    assert all("MOTION_TARGET_UNSET" in i["codes"] for i in its) and len(its) == 2
    assert its[0]["messages"] == ["動作のクリップは置きましたが、動かすキャラクターを決められませんでした。クリップを開いて［対象モデルを保存］で選んでください。"]
    assert "clip_assign" not in kinds(pv)
    env.apply(include=INC)
    assert len(env.motion_clips()) == 2 and all("target_scene_instance_id" not in c for c in env.motion_clips())


def test_glb_character_accepts_fbx_motion(env):
    env.save_snapshot("bundle_b")  # foo.glb（GLB）。VMD は PMX 専用だが、FBX 動作は GLB にも割り当てられる（compatible）
    env.before = env.fingerprint()
    pv = env.preview(include=INC)
    assert kinds(pv).count("clip_assign") == 2 and not [i for i in pv["items"] if "MOTION_TARGET_UNSET" in i["codes"]]


def test_dance_model_from_music_dance_is_the_target_when_both_are_included(env):
    # ダンス（2.0〜3.033秒）が旧タイムラインの Run（1.0〜4.0秒）と重ならないよう、ダンスを 10 秒へずらす
    env.write_md({**md_fixture("music_dance_other_model"), "motion_start_frame": 300})
    pv = env.preview(include=BOTH)
    assert pv["ok"]
    env.apply(include=BOTH)
    other = env.inst(OTHER_PMX)[0]
    assert len(env.scene()["instances"]) == 3
    assert all(c["target_scene_instance_id"] == other["id"] for c in env.motion_clips())
    assert len(env.motion_clips()) == 3  # ダンス1 + 旧タイムライン2


def mm_rows(env):
    return studio_v05_multi_motion.plan(env.dirs["arrangements"], env.dirs["scene_instances"],
                                        env.dirs["scene_models"], env.catalog, env.target, env.assets)["rows"]


def test_dance_overlapping_timeline_motion_is_left_unassigned(env):
    """同じインスタンスで時刻が重なると③は両方を再生しない（overlapping_motion）。ダンスを割り当てず、旧タイムラインを残す。"""
    env.write_md("music_dance_other_model")  # ダンス 2.0〜3.033 秒、Run 1.0〜4.0 秒
    pv = env.preview(include=BOTH)
    s3 = next(i for i in pv["items"] if i["id"] == "S3")
    assert s3["status"] == "mapped" and s3["codes"] == ["MOTION_TARGET_UNSET"]
    assert s3["messages"] == [L.MESSAGES["MOTION_TARGET_UNSET"]]
    dance_n = s3["step"]
    assert not [s for s in pv["steps"] if s["kind"] == "clip_assign" and s["clip_step"] == dance_n]
    assert [s["kind"] for s in pv["steps"]].count("clip_assign") == 2
    env.apply(include=BOTH)
    other = env.inst(OTHER_PMX)[0]
    by_asset = {}
    for c in env.motion_clips():
        by_asset.setdefault(c["asset_id"], []).append(c)
    assert "target_scene_instance_id" not in by_asset[MOTION_ID][0]
    timeline = [c for c in env.motion_clips() if c["asset_id"] != MOTION_ID]
    assert len(timeline) == 2 and all(c["target_scene_instance_id"] == other["id"] for c in timeline)
    assert {r["status"] for r in mm_rows(env) if r["asset_id"] != MOTION_ID} == {"ready"}
    assert env.record()["state"] == "applied"


def test_dance_touching_but_not_overlapping_timeline_motion_is_assigned(env):
    # Walk は 5.0〜6.5 秒。ダンス（長さ 31/30 秒）を 6.5 秒ちょうどから始めると重ならない
    env.write_md({**md_fixture("music_dance_other_model"), "motion_start_frame": 195})
    pv = env.preview(include=BOTH)
    s3 = next(i for i in pv["items"] if i["id"] == "S3")
    assert s3["codes"] == [] and [s["kind"] for s in pv["steps"]].count("clip_assign") == 3


def test_unplaceable_dance_model_does_not_fall_back_to_the_character(env):
    env.write_md({**md_fixture("music_dance_full"), "model_id": "mmd:B:nothing.pmx"})
    env.apply(include=BOTH)
    timeline = [c for c in env.arr()["clips"] if c["asset_id"].startswith(FBX)]
    assert len(timeline) == 2 and all("target_scene_instance_id" not in c for c in timeline)


def test_music_dance_not_included_ignores_its_model(env):
    env.write_md("music_dance_other_model")
    env.apply(include=INC)
    assert len(env.scene()["instances"]) == 2
    char = env.inst(CHAR_ID)[0]
    assert all(c["target_scene_instance_id"] == char["id"] for c in env.motion_clips())


def test_invalid_music_dance_falls_back_to_the_character_target(env):
    env.md_path.write_text("{broken", encoding="utf-8")
    env.before = env.fingerprint()
    env.apply(include=BOTH)
    char = env.inst(CHAR_ID)[0]
    assert all(c["target_scene_instance_id"] == char["id"] for c in env.motion_clips()) and env.motion_clips()


# ---- 曲とダンスと同時に ----------------------------------------------------------------
def test_both_includes_order_is_music_dance_then_timeline(env):
    env.write_md("music_dance_full")
    pv = env.preview(include=BOTH)
    places = [s for s in pv["steps"] if s["kind"] == "clip_place"]
    assert [s["role"] for s in places] == ["music", "dance", "timeline", "timeline"]
    assert kinds(pv)[-1] == "playhead"
    env.apply(include=BOTH)
    rec = env.record()
    assert rec["state"] == "applied" and set(rec["source"]["live"]) == {"music_dance", "timeline_editor"}
    assert rec["source"]["live"]["music_dance"] is not None and rec["source"]["live"]["timeline_editor"] is not None
    assert len(env.arr()["clips"]) == 4
    env.revert()
    assert env.arr()["clips"] == [] and env.scene()["instances"] == []


# ---- 形の壊れたファイル ----------------------------------------------------------------
BAD_FILES = [
    ("broken json", "{broken"),
    ("schema", {"schema": 2, "clips": []}),
    ("clips not a list", {"schema": 1, "clips": {}}),
    ("too many clips", {"schema": 1, "clips": [{"name": "Run"}] * 201}),
    ("name not a string", {"schema": 1, "clips": [{"name": 5}]}),
    ("name too long", {"schema": 1, "clips": [{"name": "x" * 251}]}),
    ("clip not an object", {"schema": 1, "clips": ["Run"]}),
    ("start out of range", {"schema": 1, "clips": [{"name": "Run", "start": -1}]}),
    ("duration zero", {"schema": 1, "clips": [{"name": "Run", "duration": 0}]}),
    ("speed too fast", {"schema": 1, "clips": [{"name": "Run", "speed": 4.5}]}),
    ("blend too big", {"schema": 1, "clips": [{"name": "Run", "blend": 121}]}),
    ("start not a number", {"schema": 1, "clips": [{"name": "Run", "start": "abc"}]}),
    ("not an object", [1, 2]),
]


@pytest.mark.parametrize("label,bad", BAD_FILES, ids=[b[0] for b in BAD_FILES])
def test_broken_file_is_kept_whole_and_the_rest_is_imported(env, label, bad):
    if isinstance(bad, str):
        env.te_path.write_text(bad, encoding="utf-8")
        env.before = env.fingerprint()
    else:
        env.write_te(bad)
    pv = env.preview(include=INC)
    assert pv["ok"]
    t0 = item_of(pv, "T0")
    assert t0["status"] == "kept" and t0["codes"] == ["LIVE_SOURCE_INVALID"] and t0["pointer"] == ""
    assert t0["label"] == "旧タイムライン編集の保存"
    assert t0["messages"] == ["このファイルは形が正しくないため、取り込みませんでした。元のファイルはそのままです。"]
    assert not [i for i in pv["items"] if i["id"] in ("T1", "T2", "T4")]
    assert pv["expected"]["live_sha256"]["timeline_editor"] == sha(env.te_path)
    env.apply(include=INC)
    rec = env.record()
    assert rec["state"] == "applied" and len(env.scene()["instances"]) == 2 and env.arr()["clips"] == []
    assert rec["source"]["live"]["timeline_editor"]["sha256"] == sha(env.te_path)
    env.revert()


def test_broken_file_value_is_the_raw_text(env):
    env.te_path.write_text("{broken json", encoding="utf-8")
    env.before = env.fingerprint()
    assert item_of(env.preview(include=INC), "T0")["legacy_value"] == "{broken json"


def test_oversize_file_is_invalid_and_not_stored(env):
    env.te_path.write_bytes(b" " * (L.TIMELINE_EDITOR_MAX_BYTES + 1))
    env.before = env.fingerprint()
    pv = env.preview(include=INC)
    t0 = item_of(pv, "T0")
    assert t0["codes"] == ["LIVE_SOURCE_INVALID"] and t0["legacy_value"] is None
    env.apply(include=INC)
    assert env.record()["source"]["live"]["timeline_editor"]["value"] is None


def test_validation_matches_the_server_normalization(env):
    """サーバーの POST と同じ: 文字列の数も int()/float() で通り、欠けた項目は既定値（開始0・長さ90・速度1・つなぎ6）。"""
    env.write_te({"schema": 1, "clips": [{"name": "Run"}, {"name": "Walk Cycle", "start": "30", "duration": 45.9,
                                                              "speed": "1", "blend": "0"}]})
    pv = env.preview(include=INC)
    assert item_of(pv, "T2", "/clips/0")["legacy_value"] == {"name": "Run", "start": 0, "duration": 90,
                                                              "speed": 1.0, "blend": 6}
    assert item_of(pv, "T2", "/clips/1")["legacy_value"] == {"name": "Walk Cycle", "start": 30, "duration": 45,
                                                              "speed": 1.0, "blend": 0}
    assert item_of(pv, "T2", "/clips/0")["codes"] == ["BLEND_DROPPED"]


def test_empty_clip_list_places_nothing(env):
    env.write_te({"schema": 1, "clips": [], "updatedAt": 5})
    pv = env.preview(include=INC)
    assert [i["id"] for i in pv["items"] if i["id"].startswith("T")] == ["T4"]
    assert kinds(pv) == ["fps", "scene_add", "scene_add", "playhead"]


def test_file_without_updated_at_has_no_t4(env):
    env.write_te({"schema": 1, "clips": []})
    assert not [i for i in env.preview(include=INC)["items"] if i["id"] == "T4"]


# ---- include / ファイルの有無 ----------------------------------------------------------
def test_without_include_the_file_is_not_read(env, monkeypatch):
    env.te_path.write_text("{broken json", encoding="utf-8")
    env.before = env.fingerprint()
    calls = []
    real = L._read_timeline_editor
    monkeypatch.setattr(L, "_read_timeline_editor", lambda *a, **k: calls.append(1) or real(*a, **k))
    pv = env.preview()
    assert pv["ok"] and calls == []
    assert kinds(pv) == ["fps", "scene_add", "scene_add", "playhead"]
    assert pv["expected"]["live_sha256"] == {"music_dance": None, "timeline_editor": None}
    assert not [i for i in pv["items"] if i["id"].startswith("T")]
    assert pv["source_info"]["timeline_editor_updated"] is None
    env.apply()
    assert env.record()["source"]["live"] == {"music_dance": None, "timeline_editor": None}
    assert env.arr()["clips"] == []


def test_music_dance_only_does_not_read_the_timeline_file(env, monkeypatch):
    calls = []
    real = L._read_timeline_editor
    monkeypatch.setattr(L, "_read_timeline_editor", lambda *a, **k: calls.append(1) or real(*a, **k))
    env.write_md("music_dance_full")
    env.preview(include=("music_dance",))
    assert calls == []


def test_missing_file_with_include_is_not_an_error(env):
    env.te_path.unlink()
    env.before = env.fingerprint()
    pv = env.preview(include=INC)
    assert pv["ok"] and pv["expected"]["live_sha256"]["timeline_editor"] is None
    assert not [i for i in pv["items"] if i["id"].startswith("T")]
    env.apply(include=INC)
    assert env.record()["source"]["live"]["timeline_editor"] is None


def test_include_unknown_name_is_bad_request(env):
    with pytest.raises(L.LegacyImportError) as e:
        env.preview(include=("timeline",))
    assert code_of(e) == "BAD_REQUEST"


# ---- 確認後の変更 ----------------------------------------------------------------------
def test_file_changed_after_preview_is_source_changed_and_nothing_is_written(env):
    req = env.request(include=INC)
    env.write_te({"schema": 1, "clips": [{"name": "Run", "start": 90, "duration": 30, "speed": 1, "blend": 0}]})
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


def test_same_input_gives_the_same_plan(env):
    a = env.preview(include=BOTH)
    b = env.preview(include=BOTH)
    assert a == b


# ---- 失敗の注入 ------------------------------------------------------------------------
def assert_clean(env):
    assert env.scene()["instances"] == [] and env.arr()["clips"] == []
    assert "fps" not in env.row(env.target)
    assert env.row(env.other) == env.other_row


def test_clip_assign_failure_removes_all_clips_and_instances(env, monkeypatch):
    env.write_md("music_dance_full")
    seen = {"n": 0}
    real = studio_v05_multi_motion.assign

    def fail_on_third(*a, **k):
        seen["n"] += 1
        if seen["n"] == 2:  # ダンス → 旧タイムラインの1件目は成功、2件目で失敗
            raise studio_v05_multi_motion.MultiMotionError("injected")
        return real(*a, **k)
    monkeypatch.setattr(studio_v05_multi_motion, "assign", fail_on_third)
    with pytest.raises(L.LegacyImportError) as e:
        env.apply(include=BOTH)
    assert code_of(e) == "APPLY_FAILED" and e.value.state == "rolled_back"
    assert_clean(env)
    rec = env.record()
    assert rec["state"] == "rolled_back" and all(s["status"] == "undone" for s in rec["steps"])
    assert rec["error"]["type"] == "MultiMotionError"


def test_interrupted_timeline_clip_place_is_found_by_pre_ids(env, monkeypatch):
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
    second = [s for s in env.record()["steps"] if s["kind"] == "clip_place"][1]
    assert second["clip_id"] is None and second["status"] == "undone" and second["started"] is True


def test_interrupted_second_identical_clip_keeps_no_leftover_and_never_touches_the_first(env, monkeypatch):
    """同じ素材・同じ開始の2件。2件目が書けたあとで止まっても、1件目の ID は pre_ids に入っているので取り違えない。"""
    env.write_te({"schema": 1, "clips": [{"name": "Run", "start": 30, "duration": 30, "speed": 1, "blend": 0}] * 2})
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


def test_unstarted_timeline_clip_does_not_delete_users_clip(env, monkeypatch):
    """強制停止が1件目のクリップの途中で起き、2件目は始まっていない。
    利用者が2件目と同じ素材・トラック・開始で足したクリップは、取消で消さない。"""
    real = arrangement.place

    def die_on_first(*a, **k):
        if a[3] == FBX + RUN:
            raise KeyboardInterrupt
        return real(*a, **k)
    monkeypatch.setattr(arrangement, "place", die_on_first)
    with pytest.raises(KeyboardInterrupt):
        env.apply(include=INC)
    monkeypatch.setattr(arrangement, "place", real)
    places = [s for s in env.record()["steps"] if s["kind"] == "clip_place"]
    assert places[0].get("started") is True and not places[1].get("started")
    mine = real(env.dirs["arrangements"], env.catalog, env.target, FBX + WALK, "motion", 5.0, 1.5,
                env.arr()["revision"], env.assets)["clip"]["id"]
    out = env.revert()
    assert out["record"]["state"] == "rolled_back"
    assert [c["id"] for c in env.arr()["clips"]] == [mine]
    assert env.scene()["instances"] == []


# ---- 取消 ------------------------------------------------------------------------------
def test_revert_removes_clips_and_leaves_the_legacy_file_untouched(env):
    before = sha(env.te_path)
    env.apply(include=INC)
    assert len(env.arr()["clips"]) == 2
    rev_after_apply = env.arr()["revision"]
    env.revert()
    rec = env.record()
    assert rec["state"] == "reverted" and all(s["status"] == "undone" for s in rec["steps"])
    assert env.arr()["clips"] == [] and env.scene()["instances"] == []
    assert env.arr()["revision"] > rev_after_apply
    assert sha(env.te_path) == before


def test_revert_keeps_clips_added_by_the_user_afterwards(env):
    env.apply(include=INC)
    mine = arrangement.place(env.dirs["arrangements"], env.catalog, env.target, FBX + RUN, "motion", 50, 2,
                             env.arr()["revision"], env.assets)["clip"]
    env.revert()
    assert [c["id"] for c in env.arr()["clips"]] == [mine["id"]]


def test_revert_is_blocked_when_a_user_clip_targets_an_imported_instance(env):
    env.apply(include=INC)
    char = env.inst(CHAR_ID)[0]
    c = arrangement.place(env.dirs["arrangements"], env.catalog, env.target, FBX + RUN, "motion", 50, 2,
                          env.arr()["revision"], env.assets)["clip"]
    studio_v05_multi_motion.assign(env.dirs["arrangements"], env.dirs["scene_instances"],
                                   env.dirs["scene_models"], env.catalog, env.target, c["id"],
                                   env.arr()["revision"], char["id"], env.assets,
                                   layout_root=env.dirs["track_layouts"])
    before = env.state()
    with pytest.raises(L.LegacyImportError) as e:
        env.revert()
    assert code_of(e) == "REVERT_BLOCKED" and env.state() == before


def test_revisions_only_increase_across_apply_and_revert(env):
    revs = [env.arr()["revision"]]
    env.apply(include=INC)
    revs.append(env.arr()["revision"])
    env.revert()
    revs.append(env.arr()["revision"])
    assert revs[0] < revs[1] < revs[2]


def test_events_are_emitted_once_per_operation(env, events):
    env.apply(include=INC)
    env.revert()
    assert [e[0] for e in events] == ["v05_legacy_import_apply", "v05_legacy_import_revert"]


def test_reimport_after_revert_archives_the_old_record(env):
    env.apply(include=INC)
    env.revert()
    env.apply(include=INC)
    assert env.record()["state"] == "applied" and len(env.arr()["clips"]) == 2
    assert len(list((env.data / "studio_v05_legacy_imports" / "history").glob("*.json"))) == 1


# ---- plan 単体（fixture 入力） ---------------------------------------------------------
def test_plan_alone_is_pure_and_does_not_touch_the_manifest():
    import copy
    manifest = make_manifest()
    manifest["mapping"] = {"Run.fbx": "walkcycle"}
    before = copy.deepcopy(manifest)
    inputs = make_inputs(load_bundle("bundle_a"), assets=make_assets() + make_fbx_assets(),
                         live={"music_dance": None, "timeline_editor": {
                             "sha256": "cd" * 32, "value": te_fixture("timeline_editor_basic"),
                             "updated_at": "2026-11-04T00:00:00+00:00"}})
    inputs["manifest"] = manifest
    r = L.plan(inputs, include=INC)
    assert [s["asset_id"] for s in r["steps"] if s["kind"] == "clip_place"] == [FBX + WALK, FBX + WALK]
    assert manifest == before
    assert r["source_info"]["timeline_editor_updated"] == "2026-11-04T00:00:00+00:00"
    assert r["expected"]["live_sha256"] == {"music_dance": None, "timeline_editor": "cd" * 32}
    assert L.plan(inputs, include=INC) == r
