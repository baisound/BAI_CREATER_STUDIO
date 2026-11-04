"""WP-L9 の台本 tools/legacy_import_real_check.py の素材の探し方（実データは使わない）。

旧保存（ワークスペース・SCR-10・旧タイムライン編集）が参照する素材だけを、data からの相対パスで返すこと。
PMX はテクスチャ（mmd_assets.json の tex/ 以下）も含め、旧タイムライン編集の名前は manifest の名前で解決する。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import legacy_import_real_check as check  # noqa: E402


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, (dict, list)):
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    else:
        path.write_bytes(data)


def test_referenced_files_resolve_each_kind_and_skip_missing(tmp_path):
    d = tmp_path
    write(d / "project_state.json", {"schema": 1})
    write(d / "project_state.workspace.json", {"asset": "hero.vrm", "stage": {"asset": "library:aaaaaaaaaaaaaaaaaaaaaaaa"}})
    write(d / "music_dance_project.json", {"model_id": "mmd:A:model.pmx", "motion_id": "integrated:dance.glb",
                                           "audio_id": "library:bbbbbbbbbbbbbbbbbbbbbbbb"})
    write(d / "timeline_editor.json", {"schema": 1, "clips": [{"name": "Punch Combo"}, {"name": "Not Registered"}]})
    write(d / "manifest.json", {"files": [{"id": "111111111111111111111111", "name": "Punch Combo.fbx", "kind": "motions"},
                                          {"id": "222222222222222222222222", "name": "Other.fbx", "kind": "motions"}], "mapping": {}})
    write(d / "mmd_assets.json", {"A": [{"name": "model.pmx"}, {"name": "tex/skin.png"}], "B": [{"name": "tex/b.png"}], "vmd": []})
    write(d / "library_assets" / "index.json", {"schema": 1, "items": [
        {"id": "library:aaaaaaaaaaaaaaaaaaaaaaaa", "filename": "stage.glb"},
        {"id": "library:bbbbbbbbbbbbbbbbbbbbbbbb", "filename": "song.wav"}]})
    for rel in ["library_assets/files/stage.glb", "library_assets/files/song.wav", "mmd/A/model.pmx", "mmd/A/tex/skin.png",
                "mmd/B/tex/b.png", "integrated_v02/assets/dance.glb", "integrated_v02/assets/hero.vrm",
                "files/111111111111111111111111.fbx", "files/222222222222222222222222.fbx"]:
        write(d / rel, b"x")
    files, ids = check.referenced_files(d)
    assert files == sorted(["files/111111111111111111111111.fbx", "integrated_v02/assets/dance.glb", "integrated_v02/assets/hero.vrm",
                            "library_assets/files/song.wav", "library_assets/files/stage.glb", "mmd/A/model.pmx", "mmd/A/tex/skin.png"])
    assert "fbx:111111111111111111111111" in ids and "fbx:222222222222222222222222" not in ids
    assert "integrated:hero.vrm" in ids  # 接頭辞の無い旧形式は integrated: として扱う


def test_render_ja_marks_each_requirement(tmp_path):
    report = {"finished_at": "2026-11-04 12:00:00", "pass": False, "unverified": ["画面"],
              "sources": {"files": 3, "bytes": 1048576, "referenced_asset_ids": ["library:x"]},
              "checks": {"R1": {"pass": True, "original_files": 3, "changed": []}, "R2": {"pass": False, "changed": ["/a"], "unrepresentable": []},
                         "R3": {"pass": True, "instances": True}, "R4": {"pass": None}, "copy_identical": True}}
    text = check.render_ja(report)
    assert "総合：**不合格**" in text
    assert "| R1 元を壊さない | 合格 |" in text and "| R2 往復一致 | 不合格 |" in text and "| R4 編集後の逆変換 | 判定なし |" in text
    assert "- 画面" in text


def test_scr06_line_with_and_without_bounds(tmp_path):
    """WP-L8a §6.0：旧 SCR-06 の外接箱の1行（測れたとき・測れなかったとき）と、旧保存のステージ素材の読み取り。"""
    line = check.scr06_line({"stageAssetId": "library:s", "characterAssetId": None,
                             "bounds": {"min": [-10.5, -0.25, -8], "max": [10.5, 6.75, 8]}})
    assert line == ("- 旧 SCR-06 の外接箱：最小 [-10.5, -0.25, -8]、最大 [10.5, 6.75, 8]、大きさ [21.0, 7.0, 16]"
                    "（ステージ library:s、キャラクター なし）")
    assert check.scr06_line(None).startswith("- 旧 SCR-06 の外接箱：測れていない")
    assert check.scr06_line({"bounds": None}).startswith("- 旧 SCR-06 の外接箱：測れていない")
    (tmp_path / "project_state.workspace.json").write_text(json.dumps({"asset": "", "stage": {"asset": "library:s"}}), encoding="utf-8")
    assert check.legacy_stage_asset(tmp_path) == "library:s"
    (tmp_path / "project_state.workspace.json").write_text(json.dumps({"asset": "", "stage": None}), encoding="utf-8")
    assert check.legacy_stage_asset(tmp_path) is None
    assert check.legacy_stage_asset(tmp_path / "missing") is None
