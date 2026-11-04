"""WP-L1 旧保存→v0.5取込の確認（plan）の受け入れ試験。

設計: docs/roadmap/LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md の WP-L1。
fixture は tests/fixtures/legacy_import/ の固定JSON。skip は使わない（fixture が validate_bundle を通らなければ失敗）。
"""
import copy
import hashlib
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import studio_v05_legacy_import as L
from legacy_import_fixtures import FIXTURE_DIR, load_bundle

PID = "11111111-1111-4111-8111-111111111111"
STAGE_ID = "library:0123456789abcdef01234567"
FBX_ID = "fbx:0123456789abcdef01234567"


def make_assets():
    return [
        {"id": "mmd:A:test.pmx", "name": "test.pmx", "format": "PMX", "kind": "A", "source": "mmd", "available": True},
        {"id": STAGE_ID, "name": "テストステージ", "format": "GLB", "kind": "stage", "source": "library", "available": True},
        {"id": "integrated:foo.glb", "name": "foo.glb", "format": "GLB", "kind": "model", "source": "integrated",
         "filename": "foo.glb", "available": True},
        {"id": FBX_ID, "name": "fbxmodel", "format": "FBX", "kind": "modelA", "source": "fbx", "available": True},
    ]


def make_inputs(bundle, *, fps=None, record_state=None, scene=None, scene_model=None, arrangement=None, assets=None,
                live=None):
    return {
        "project_id": PID,
        "snapshot": {"saved_at": "2026-11-04T00:00:00+00:00", "sha256": "ab" * 32, "bundle": bundle},
        "target": {
            "fps": fps or {"presence": "absent"},
            "scene": scene or {"revision": 0, "instances": [], "camera": None, "face_keys": []},
            "scene_model": scene_model or {"model": None},
            "arrangement": arrangement or {"revision": 0, "clips": []},
            "record_state": record_state,
        },
        "live": live or {"music_dance": None, "timeline_editor": None},
        "assets": make_assets() if assets is None else assets,
        "manifest": {"files": [], "mapping": {}},
        "durations": {},
    }


def run(name, **kw):
    plan_kw = {k: kw.pop(k) for k in ("include", "fps_policy") if k in kw}
    return L.plan(make_inputs(load_bundle(name), **kw), **plan_kw)


def item(result, iid, pointer=None):
    found = [i for i in result["items"] if i["id"] == iid and (pointer is None or i["pointer"] == pointer)]
    assert len(found) == 1, (iid, pointer, [(i["id"], i["pointer"]) for i in result["items"]])
    return found[0]


def items(result, iid):
    return [i for i in result["items"] if i["id"] == iid]


def kinds(result):
    return [s["kind"] for s in result["steps"]]


# ---- §3.4 の表（設計書から写した全文。MESSAGES と完全一致を確かめる） ----
EXPECTED = [
    ('UNIT_SEMANTICS_DIFFER', '警告', '—', '旧のシーン画面（②）と同じ大きさで置きました。旧のカメラ画面（①）はモデルの高さを合わせて表示していたため、①とは大きさや向きが違うことがあります。'),
    ('PLACED_AT_ORIGIN', '警告', '—', '曲とダンスの画面のモデルは位置を保存していないため、原点に置きました。'),
    ('MOTION_TARGET_UNSET', '警告', '—', '動作のクリップは置きましたが、動かすキャラクターを決められませんでした。クリップを開いて［対象モデルを保存］で選んでください。'),
    ('NAME_DUPLICATE_LAST_WINS', '警告', '—', '同じ名前の動作が複数あります。旧画面と同じく、後から登録したものを使いました。'),
    ('BLEND_DROPPED', '警告', '—', '動作のつなぎ（補間フレーム）はv0.5にまだ無いため、使いませんでした。値は取込記録に残しました。'),
    ('FPS_KEPT_USER_CHANGE', '警告（取消時）', '—', '取込のあとで作品のFPSが変えられていたため、FPSはいまの値のままにしました。'),
    ('NO_V05_FIELD', '保管', '—', 'v0.5にはこの設定の保存先がまだありません。元の値は取込記録に残しました。'),
    ('CAMERA_KEYS_NOT_SUPPORTED', '保管', '—', 'v0.5のカメラは、時刻付きの動きをまだ保存できません。カメラのキー{n}件は取込記録に残しました。'),
    ('NO_TIMING', '保管', '—', '旧の動作の並びには開始時刻と長さがないため、タイムラインへは置きませんでした。'),
    ('NAME_UNRESOLVED', '保管', '—', 'この動作名に当たる登録素材が見つかりません。'),
    ('ASSET_MISSING', '保管', '—', '素材「{name}」が登録一覧にないか、元のファイルが見つかりません。別の素材への置き換えはしません。'),
    ('ASSET_UNSUPPORTED', '保管', '—', '素材「{name}」は、この場所には置けない形式です。'),
    ('DURATION_UNKNOWN', '保管', '—', '素材「{name}」の長さを読み取れないため、タイムラインへは置きませんでした。'),
    ('SOURCE_OFFSET_NOT_SUPPORTED', '保管', '—', 'ダンスを途中から始める設定は、v0.5の動作クリップではまだ使えません。'),
    ('SPEED_NOT_SUPPORTED', '保管', '—', '再生速度を変えた動作は、v0.5ではまだ置けません。'),
    ('OUT_OF_RANGE', '保管', '—', '値がv0.5で扱える範囲の外です（再生位置は24時間まで）。'),
    ('UNKNOWN_FIELD', '保管', '—', '旧画面が保存した、この取込処理の知らない項目です。元の値をそのまま残しました。'),
    ('LIVE_SOURCE_INVALID', '保管', '—', 'このファイルは形が正しくないため、取り込みませんでした。元のファイルはそのままです。'),
    ('FPS_CONFLICT', '拒否', '409', '作品のFPS（{project}fps）と旧保存のFPS（{legacy}fps）が違います。［作品のFPSを{legacy}fpsに変えて取り込む］を押すと、作品のFPSを変えてから取り込みます。'),
    ('TARGET_NOT_EMPTY', '拒否', '409', 'この作品には、すでにクリップか3D場面があります。ホームの［＋ 新規作成］で空の作品を作り、その作品カードで［現行編集を保存］→［旧保存を取り込む…］の順に押してください。'),
    ('ALREADY_IMPORTED', '拒否', '409', 'この作品には取込済みです。やり直すときは、［取込を取消］を押してから、もう一度［取り込む］を押してください。'),
    ('SOURCE_CHANGED', '拒否', '409', '確認したあとに、スナップショットか曲とダンスなどの保存が変わりました。［もう一度確認する］を押してください。'),
    ('TARGET_CHANGED', '拒否', '409', '確認したあとに、この作品が別の画面で変更されました。［もう一度確認する］を押してください。'),
    ('IMPORT_INTERRUPTED', '拒否', '409', '前回の取込または取消が途中で止まっています。［取込を取消］を押して、取込前に戻してください。'),
    ('NOTHING_TO_REVERT', '拒否', '409', 'この作品には取り消せる取込がありません。'),
    ('REVERT_BLOCKED', '拒否', '409', '取り消すと、あとから加えた次の内容も消えるため、止めました：{list}。先にこれらを外してから［取込を取消］を押してください。'),
    ('LEGACY_SLOT_CHANGED', '拒否', '409', 'この作品の旧1体枠が、取込のあとで変わりました。3D場面を開いて状態を確かめてから、もう一度操作してください。'),
    ('NO_SNAPSHOT', '拒否', '404', 'この作品にはスナップショットがありません。作品カードの［現行編集を保存］を先に押してください。'),
    ('PROJECT_NOT_FOUND', '拒否', '404', '作品が見つかりません。ホームの一覧を開き直してください。'),
    ('BAD_REQUEST', '拒否', '400', '取込の要求の形が正しくありません。画面を開き直してください。'),
    ('REQUEST_TOO_LARGE', '拒否', '413', '取込の要求が大きすぎます。画面を開き直してください。'),
    ('SNAPSHOT_UNREADABLE', '拒否', '422', 'スナップショットを読めません。元のファイルはそのままです。作品カードの［現行編集を保存］をもう一度押してください。'),
    ('RECORD_UNREADABLE', '拒否', '422', '取込記録を読めません。元のファイルはそのままです。診断ZIPを保存して開発者に渡してください。'),
    ('RECORD_TOO_LARGE', '拒否', '422', '取込記録が6MBを超えるため、取り込めません。カメラのキーや動作の並びが非常に多い可能性があります。'),
    ('APPLY_FAILED', '失敗', '500', '取込の途中でファイル操作に失敗しました。{rolled}。'),
    ('UNDO_FAILED', '失敗', '500', '取消の一部ができませんでした：{list}。［取込を取消］をもう一度押してください。直らないときは診断ZIPを保存してください。'),
]


def test_messages_match_design_table():
    assert set(L.MESSAGES) == {c for c, _, _, _ in EXPECTED}
    for code, kind, status, text in EXPECTED:
        assert L.MESSAGES[code] == text, code
        assert L.KINDS[code] == kind, code
        assert L.STATUS.get(code) == (int(status) if status.isdigit() else None), code


def test_error_class_uses_messages_and_status():
    e = L.LegacyImportError("FPS_CONFLICT", project="24", legacy="30")
    assert isinstance(e, ValueError) and e.code == "FPS_CONFLICT" and e.status == 409
    assert e.message == ("作品のFPS（24fps）と旧保存のFPS（30fps）が違います。［作品のFPSを30fpsに変えて取り込む］を押すと、"
                         "作品のFPSを変えてから取り込みます。")
    assert L.LegacyImportError("NO_SNAPSHOT").status == 404


def test_labels_cover_design_table():
    assert L.LABELS["M3"] == "キャラクター「{name}」" and L.LABELS["M7"] == "カメラの動き（キー{n}件）"
    assert L.LABELS["scene_store"] == "3D場面" and L.LABELS["arrangement_store"] == "タイムライン"
    assert len(L.LABELS) == 21  # §3.5 の17行＋WP-L7a の S0・S6＋WP-L7b の T0・T4


# ---- M1〜M11 の表駆動 ----
def test_bundle_a_full_plan():
    r = run("bundle_a")
    assert r["ok"] and r["reject"] is None
    assert kinds(r) == ["fps", "scene_add", "scene_add", "playhead"]
    assert [s["n"] for s in r["steps"]] == [1, 2, 3, 4]
    assert all(s["status"] == "pending" for s in r["steps"])
    assert r["steps"][0] == {"n": 1, "kind": "fps", "status": "pending", "before": {"presence": "absent"}, "after": 30}
    assert r["steps"][1] == {"n": 2, "kind": "scene_add", "role": "character", "status": "pending",
                             "asset_id": "mmd:A:test.pmx", "pre_ids": [], "instance_id": None, "units": "legacy",
                             "transform": {"position": [1.5, 0, -2], "rotation": [0, 90, 0], "scale": [1.2, 1.2, 1.2]}}
    assert r["steps"][2]["role"] == "stage" and r["steps"][2]["asset_id"] == STAGE_ID
    assert r["steps"][2]["units"] == "legacy"
    assert r["steps"][2]["transform"] == {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [2, 2, 2]}
    assert r["steps"][3] == {"n": 4, "kind": "playhead", "status": "pending", "seconds": 4.0}
    assert [(i["id"], i["status"], i["codes"], i["step"]) for i in r["items"]] == [
        ("M1", "mapped", [], 1), ("M2", "mapped", [], 4),
        ("M3", "mapped", [], 2), ("M4", "mapped", [], 3),
        ("M6", "kept", ["NO_V05_FIELD"], None), ("M7", "kept", ["CAMERA_KEYS_NOT_SUPPORTED"], None),
        ("M8", "kept", ["NO_V05_FIELD"], None), ("M8", "kept", ["NO_V05_FIELD"], None),
        ("M10", "kept", ["NO_V05_FIELD"], None), ("M10", "kept", ["NO_V05_FIELD"], None),
        ("M10", "kept", ["NO_V05_FIELD"], None),
    ]
    assert [i["pointer"] for i in r["items"]][:4] == ["/camera/fps", "/workspace/frame", "/workspace/asset", "/workspace/stage"]
    assert [i["pointer"] for i in items(r, "M8")] == ["/camera/custom_presets", "/camera/sequence"]
    assert [i["pointer"] for i in items(r, "M10")] == ["/combination/history", "/combination/cursor", "/combination/title"]
    assert r["expected"] == {"snapshot_sha256": "ab" * 32, "fps": {"presence": "absent"}, "scene_revision": 0,
                             "arrangement_revision": 0, "live_sha256": {"music_dance": None, "timeline_editor": None}}
    assert r["assets"] == [{"asset_id": "mmd:A:test.pmx", "legacy_ref": "mmd:A:test.pmx", "sha256": None},
                           {"asset_id": STAGE_ID, "legacy_ref": STAGE_ID, "sha256": None}]


def test_m1_fps_four_cases():
    r = run("bundle_a")
    assert r["steps"][0]["kind"] == "fps" and item(r, "M1")["step"] == 1
    r = run("bundle_a", fps={"presence": "value", "value": 30})
    assert "fps" not in kinds(r) and not items(r, "M1")
    r = run("bundle_a", fps={"presence": "value", "value": 30.0})
    assert "fps" not in kinds(r)
    r = run("bundle_a", fps={"presence": "value", "value": 24})
    assert not r["ok"] and r["reject"]["code"] == "FPS_CONFLICT" and r["reject"]["status"] == 409
    assert r["reject"]["message"] == L.MESSAGES["FPS_CONFLICT"].format(project="24", legacy="30")
    assert "24fps" in r["reject"]["message"] and "30fpsに変えて" in r["reject"]["message"]
    assert r["items"] == [] and r["steps"] == []
    r = run("bundle_a", fps={"presence": "value", "value": 24}, fps_policy="use_legacy")
    assert r["ok"] and r["steps"][0] == {"n": 1, "kind": "fps", "status": "pending",
                                          "before": {"presence": "value", "value": 24}, "after": 30}
    r = run("bundle_a", fps={"presence": "value", "value": 29.97}, fps_policy="use_legacy")
    assert r["steps"][0]["before"] == {"presence": "value", "value": 29.97}


def test_m2_playhead_seconds_and_out_of_range():
    assert run("bundle_a")["steps"][-1]["seconds"] == 4.0  # 120 / 30
    r = run("bundle_g")
    assert [s for s in r["steps"] if s["kind"] == "playhead"][0]["seconds"] == 2.0
    r = run("bundle_j")
    m2 = item(r, "M2")
    assert m2["status"] == "kept" and m2["codes"] == ["OUT_OF_RANGE"] and m2["step"] is None
    assert m2["legacy_value"] == {"frame": 100000, "fps": 1}
    assert "playhead" not in kinds(r)
    assert m2["messages"] == [L.MESSAGES["OUT_OF_RANGE"]]
    # workspace が無ければ M2 も手順もない
    r = run("bundle_c")
    assert not items(r, "M2") and "playhead" not in kinds(r)
    # フレームはカメラのFPSで割る（FPS 1 で 5 秒）
    b = load_bundle("bundle_j")
    b["workspace"]["frame"] = 5
    assert L.plan(make_inputs(b))["steps"][-1]["seconds"] == 5.0


def test_m3_character_cases():
    # 接頭辞なし → integrated: を付け、legacy_ref に元の綴り
    r = run("bundle_b")
    m3 = item(r, "M3")
    assert m3["status"] == "mapped" and m3["label"] == "キャラクター「foo.glb」"
    step = [s for s in r["steps"] if s["kind"] == "scene_add"][0]
    assert step["asset_id"] == "integrated:foo.glb" and step["role"] == "character"
    assert m3["codes"] == ["UNIT_SEMANTICS_DIFFER"] and step["units"] == "legacy"  # character なし（WP-L8a §3.4）
    assert step["transform"] == {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}
    assert r["assets"] == [{"asset_id": "integrated:foo.glb", "legacy_ref": "foo.glb", "sha256": None}]
    # fbx 素材ID・character なし
    r = run("bundle_e")
    assert item(r, "M3")["status"] == "mapped"
    assert item(r, "M3")["codes"] == ["UNIT_SEMANTICS_DIFFER"]
    assert [s["asset_id"] for s in r["steps"] if s["kind"] == "scene_add"] == [FBX_ID]
    assert [s["units"] for s in r["steps"] if s["kind"] == "scene_add"] == ["legacy"]
    # character が null でも警告を付ける（無いときと同じ扱い）
    b = load_bundle("bundle_a")
    b["workspace"]["character"] = None
    assert item(L.plan(make_inputs(b)), "M3")["codes"] == ["UNIT_SEMANTICS_DIFFER"]
    # 一覧に無い素材
    r = run("bundle_a", assets=[a for a in make_assets() if a["id"] != "mmd:A:test.pmx"])
    m3 = item(r, "M3")
    assert (m3["status"], m3["codes"], m3["step"]) == ("kept", ["ASSET_MISSING"], None)
    assert m3["messages"] == [L.MESSAGES["ASSET_MISSING"].format(name="test.pmx")]
    assert m3["legacy_value"]["asset"] == "mmd:A:test.pmx" and m3["legacy_value"]["character"]["scale"] == 1.2
    assert [s["role"] for s in r["steps"] if s["kind"] == "scene_add"] == ["stage"]
    # available が偽
    assets = make_assets()
    assets[0]["available"] = False
    assert item(run("bundle_a", assets=assets), "M3")["codes"] == ["ASSET_MISSING"]
    # supported_model が偽（PMX の動作として登録されている）
    assets = make_assets()
    assets[0]["kind"] = "motion"
    assert item(run("bundle_a", assets=assets), "M3")["codes"] == ["ASSET_UNSUPPORTED"]
    # character が value でも asset が空
    b = load_bundle("bundle_g")
    b["workspace"]["asset"] = ""
    r = L.plan(make_inputs(b))
    m3 = item(r, "M3")
    assert (m3["status"], m3["codes"], m3["pointer"]) == ("kept", ["NO_V05_FIELD"], "/workspace/character")
    assert m3["legacy_value"]["character"]["position"] == [0.0, 0.0, 1.0] and "scene_add" not in kinds(r)
    # asset が空で character も無ければ項目なし
    assert not items(run("bundle_d"), "M3")


def test_m3_m4_transform_defaults_and_values():
    r = run("bundle_h")  # 既定値と同じ character
    assert [s for s in r["steps"] if s["kind"] == "scene_add"][0]["transform"] == L.DEFAULT_TRANSFORM
    assert item(r, "M3")["legacy_value"]["character"] == {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": 1}
    r = run("bundle_i")  # 7桁はそのまま（丸めは v0.5 の保存側）
    assert [s for s in r["steps"] if s["kind"] == "scene_add"][0]["transform"]["position"] == [0.1234567, 1.0000001, -2.5]


def test_m4_stage_cases():
    m4 = item(run("bundle_a"), "M4")
    assert m4["label"] == "ステージ「テストステージ」" and m4["codes"] == []
    for name in ("bundle_d", "bundle_g", "bundle_c"):  # null / 項目なし / workspace なし → 手順なし
        r = run(name)
        assert not items(r, "M4") and "stage" not in [s.get("role") for s in r["steps"]]
    r = run("bundle_a", assets=[a for a in make_assets() if a["id"] != STAGE_ID])
    assert item(r, "M4")["codes"] == ["ASSET_MISSING"]
    assets = make_assets()
    assets[1]["kind"] = "audio"
    assert item(run("bundle_a", assets=assets), "M4")["codes"] == ["ASSET_UNSUPPORTED"]


def test_m5_m6_kept():
    m5 = item(run("bundle_b"), "M5")
    assert (m5["status"], m5["codes"], m5["legacy_value"], m5["label"]) == (
        "kept", ["NO_V05_FIELD"], 2, "GLBに入っているアニメの番号")
    assert not items(run("bundle_a"), "M5")  # clip が null なら項目なし
    m6 = item(run("bundle_a"), "M6")
    assert m6["legacy_value"] == {"schema": 1, "duration": 300, "items": []} and m6["label"] == "照明"
    assert not items(run("bundle_d"), "M6")  # lights が null → 項目なし（presence だけ残る）


def test_m7_m8_camera():
    for name in "abcdefghij":
        assert len(items(run("bundle_" + name), "M7")) == 1
    m7 = item(run("bundle_a"), "M7")
    assert m7["codes"] == ["CAMERA_KEYS_NOT_SUPPORTED"] and m7["label"] == "カメラの動き（キー3件）"
    assert len(m7["legacy_value"]["keys"]) == 3 and m7["legacy_value"]["duration"] == 300
    assert m7["messages"] == [L.MESSAGES["CAMERA_KEYS_NOT_SUPPORTED"].format(n=3)]
    assert "3件" in m7["messages"][0]
    assert not items(run("bundle_b"), "M8")  # 既定のカメラには追加設定なし
    m8 = items(run("bundle_a"), "M8")
    assert [i["legacy_value"] for i in m8] == [
        [{"name": "wide", "pose": {"fov": 50.0, "position": [0.0, 2.0, 8.0], "target": [0.0, 1.0, 0.0]}}],
        [{"start": 0, "end": 100, "preset": "wide", "transition": "cut"}]]
    assert {i["label"] for i in m8} == {"カメラの補間・プリセット・ショット・リグ・追従の設定"}


def test_m9_m10_m11_bundle_f():
    r = run("bundle_f", fps={"presence": "value", "value": 30})
    m9 = item(r, "M9")
    assert (m9["status"], m9["codes"], m9["label"]) == ("kept", ["NO_TIMING"], "動作の並び（10件）")
    assert len(m9["legacy_value"]) == 10 and {"name": "Run", "color": "red"} in m9["legacy_value"]
    assert m9["step"] is None and "scene_add" not in kinds(r)
    m10 = {i["pointer"]: i for i in items(r, "M10")}
    assert list(m10) == ["/combination/history", "/combination/cursor", "/combination/title"]
    assert all(i["codes"] == ["NO_V05_FIELD"] for i in m10.values())
    assert m10["/combination/title"]["legacy_value"] == "Dance Song" and len(m10["/combination/history"]["legacy_value"]) == 2
    m11 = item(r, "M11")
    assert (m11["pointer"], m11["codes"], m11["legacy_value"], m11["label"]) == (
        "/combination/legacyNote", ["UNKNOWN_FIELD"], "x", "旧画面の不明な項目「legacyNote」")
    assert [i["id"] for i in r["items"]] == ["M7", "M9", "M10", "M10", "M10", "M11"]
    # schema と timeline は M10/M11 に出ない
    assert not any(i["pointer"] in ("/combination/schema", "/combination/timeline") and i["id"] in ("M10", "M11")
                   for i in r["items"])


def test_empty_timeline_and_pointer_escape():
    assert not items(run("bundle_a"), "M9")
    b = load_bundle("bundle_c")
    b["combination"]["a/b"] = 1
    assert item(L.plan(make_inputs(b)), "M11")["pointer"] == "/combination/a~1b"


# ---- presence ----
PRESENCE = {
    "a": {"/workspace": "value", "/workspace/character": "value", "/workspace/stage": "value", "/workspace/lights": "value"},
    "b": {"/workspace": "value", "/workspace/character": "absent", "/workspace/stage": "absent", "/workspace/lights": "absent"},
    "c": {"/workspace": "absent"},
    "d": {"/workspace": "value", "/workspace/character": "null", "/workspace/stage": "null", "/workspace/lights": "null"},
    "e": {"/workspace": "value", "/workspace/character": "absent", "/workspace/stage": "absent", "/workspace/lights": "absent"},
    "f": {"/workspace": "absent"},
    "g": {"/workspace": "value", "/workspace/character": "value", "/workspace/stage": "absent", "/workspace/lights": "absent"},
    "h": {"/workspace": "value", "/workspace/character": "value", "/workspace/stage": "absent", "/workspace/lights": "absent"},
    "i": {"/workspace": "value", "/workspace/character": "value", "/workspace/stage": "absent", "/workspace/lights": "absent"},
    "j": {"/workspace": "value", "/workspace/character": "absent", "/workspace/stage": "absent", "/workspace/lights": "absent"},
}


@pytest.mark.parametrize("name", sorted(PRESENCE))
def test_presence_per_fixture(name):
    assert run("bundle_" + name)["presence"] == PRESENCE[name]


def test_presence_is_reported_even_when_rejected():
    r = run("bundle_g", record_state="applied")
    assert not r["ok"] and r["presence"] == PRESENCE["g"]


# ---- 拒否 ----
def test_target_not_empty_five_conditions():
    cases = {
        "clips": {"arrangement": {"revision": 3, "clips": [{"id": "c1"}]}},
        "instances": {"scene": {"revision": 1, "instances": [{"id": "i1"}], "camera": None, "face_keys": []}},
        "camera": {"scene": {"revision": 1, "instances": [], "camera": {"position": [0, 1, 2]}, "face_keys": []}},
        "face_keys": {"scene": {"revision": 1, "instances": [], "camera": None, "face_keys": [{"instance_id": "i1"}]}},
        "scene_model": {"scene_model": {"model": {"asset_id": "mmd:A:test.pmx"}}},
    }
    for label, kw in cases.items():
        r = run("bundle_a", **kw)
        assert not r["ok"] and r["reject"]["code"] == "TARGET_NOT_EMPTY", label
        assert r["reject"]["status"] == 409 and r["reject"]["message"] == L.MESSAGES["TARGET_NOT_EMPTY"], label
        assert "［＋ 新規作成］" in r["reject"]["message"]


def test_record_state_rejections_and_order():
    r = run("bundle_a", record_state="applied")
    assert r["reject"]["code"] == "ALREADY_IMPORTED" and r["reject"]["status"] == 409
    assert "［取込を取消］" in r["reject"]["message"]
    for state in ("applying", "reverting", "undo_failed"):
        assert run("bundle_a", record_state=state)["reject"]["code"] == "IMPORT_INTERRUPTED", state
    for state in ("reverted", "rolled_back", None):
        assert run("bundle_a", record_state=state)["ok"], state
    # 判定の順番：記録の状態 → 空でない作品 → FPS
    busy = {"arrangement": {"revision": 1, "clips": [{"id": "c"}]}, "fps": {"presence": "value", "value": 24}}
    assert run("bundle_a", record_state="applied", **busy)["reject"]["code"] == "ALREADY_IMPORTED"
    assert run("bundle_a", **busy)["reject"]["code"] == "TARGET_NOT_EMPTY"
    assert run("bundle_a", fps={"presence": "value", "value": 24})["reject"]["code"] == "FPS_CONFLICT"


def test_bad_arguments():
    with pytest.raises(L.LegacyImportError) as e:
        run("bundle_a", fps_policy="bogus")
    assert e.value.code == "BAD_REQUEST" and e.value.status == 400
    with pytest.raises(L.LegacyImportError):
        run("bundle_a", include=("nope",))
    with pytest.raises(L.LegacyImportError):
        run("bundle_a", record_state="weird")


# ---- 出力の形 ----
def test_summary_and_source_info():
    r = run("bundle_a")
    assert r["source_info"] == {"title": "Bundle A", "snapshot_saved_at": "2026-11-04T00:00:00+00:00",
                                "character": "test.pmx", "stage": "テストステージ",
                                "music_dance_updated": None, "timeline_editor_updated": None}
    assert r["summary"] == {
        "mapped": ["作品のFPS", "再生位置", "キャラクター「test.pmx」", "ステージ「テストステージ」"],
        "kept": ["照明", "カメラの動き（キー3件）", "カメラの補間・プリセット・ショット・リグ・追従の設定",
                 "動作の並びの編集履歴・選択などの状態"],
        "warnings": 0, "mapped_count": 4, "kept_count": 7}
    assert run("bundle_c")["source_info"]["character"] == "なし" and run("bundle_c")["source_info"]["stage"] == "なし"
    assert run("bundle_c")["source_info"]["title"] == "（名前なし）"
    assert run("bundle_b")["source_info"]["character"] == "foo.glb"
    # 名前が登録一覧に無ければ ID の最後の「:」より後ろ
    assert run("bundle_a", assets=[])["source_info"]["character"] == "test.pmx"


def test_labels_have_no_internal_names():
    for name in "abcdefghij":
        r = run("bundle_" + name)
        for i in r["items"]:
            assert "/" not in i["label"] and not re.search(r"[A-Z_]{6,}", i["label"]), (name, i["label"])
        for label in r["summary"]["mapped"] + r["summary"]["kept"]:
            assert "/" not in label and not re.search(r"[A-Z_]{6,}", label)


def test_every_item_code_has_message_and_known_kind():
    for name in "abcdefghij":
        for i in run("bundle_" + name)["items"]:
            assert len(i["messages"]) == len(i["codes"])
            for code, msg in zip(i["codes"], i["messages"]):
                assert code in L.MESSAGES and "{" not in msg and L.KINDS[code] in ("警告", "保管")


def test_expected_includes_live_hash_only_for_included():
    import music_dance_project
    live = {"music_dance": {"sha256": "cd" * 32, "value": dict(music_dance_project.DEFAULT)}, "timeline_editor": {"sha256": "ef" * 32, "value": {}}}
    r = run("bundle_a", live=live, include=("music_dance",))
    assert r["expected"]["live_sha256"] == {"music_dance": "cd" * 32, "timeline_editor": None}
    assert run("bundle_a", live=live)["expected"]["live_sha256"] == {"music_dance": None, "timeline_editor": None}


def test_plan_is_deterministic_and_does_not_mutate_inputs():
    inputs = make_inputs(load_bundle("bundle_a"))
    before = copy.deepcopy(inputs)
    first = L.plan(inputs)
    assert inputs == before
    assert L.plan(copy.deepcopy(inputs)) == first
    assert first == L.plan(inputs)
    # 出力を書き換えても入力に影響しない
    first["items"][-1]["legacy_value"] = "x"
    first["steps"][1]["transform"]["position"][0] = 99
    assert inputs == before


def test_fixture_files_untouched_by_plan():
    def snap():
        return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(FIXTURE_DIR.iterdir())}
    before = snap()
    assert len(before) == 15  # bundle_a〜j と music_dance_full・offset・other_model（WP-L7a）、timeline_editor_basic・mixed（WP-L7b）
    for name in "abcdefghij":
        run("bundle_" + name)
    assert snap() == before


def test_all_fixtures_pass_validate_bundle():
    for name in "abcdefghij":
        assert load_bundle("bundle_" + name)["schema"] == 1


# ---- vmd_last_frame ----
def test_vmd_last_frame():
    raw = (Path(__file__).parent / "fixtures" / "minimal.vmd").read_bytes()
    last = L.vmd_last_frame(raw)
    assert isinstance(last, int) and last > 0
    with pytest.raises(ValueError):
        L.vmd_last_frame(raw[:30])


def test_vmd_last_frame_synthetic():
    import struct
    def bone(frame):
        return b"\0" * 15 + struct.pack("<I", frame) + b"\0" * 92
    def morph(frame):
        return b"\0" * 15 + struct.pack("<I", frame) + b"\0" * 4
    head = b"Vocaloid Motion Data 0002".ljust(30, b"\0") + b"model".ljust(20, b"\0")
    raw = head + struct.pack("<I", 2) + bone(3) + bone(40) + struct.pack("<I", 1) + morph(50)
    assert L.vmd_last_frame(raw) == 50
    assert L.vmd_last_frame(head + struct.pack("<I", 1) + bone(7) + struct.pack("<I", 0)) == 7
    for bad in (head + struct.pack("<I", 0) + struct.pack("<I", 0),  # キー0件
                raw[:-1],  # 長さ不足
                head):
        with pytest.raises(ValueError):
            L.vmd_last_frame(bad)
