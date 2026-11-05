"""旧保存→v0.5取込の試験用 fixture の読み込み（設計 WP-L1）。

fixture は tests/fixtures/legacy_import/ の固定JSON。カメラは長いので各ファイルは camera_overrides だけを持ち、
ここで bai_camera.DEFAULT に上書きしてから validate_bundle() を通す。通らなければ例外（skip しない）。
"""
import copy
import json
from pathlib import Path

import bai_studio.camera.project as bai_camera
from bai_studio.projects.state_bundle import validate_bundle

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "legacy_import"


def load_bundle(name):
    raw = json.loads((FIXTURE_DIR / (name + ".json")).read_text(encoding="utf-8"))
    camera = copy.deepcopy(bai_camera.DEFAULT)
    camera.update(copy.deepcopy(raw.get("camera_overrides", {})))
    bundle = {"schema": 1, "combination": raw["combination"], "camera": camera}
    if "workspace" in raw:
        bundle["workspace"] = raw["workspace"]
    return validate_bundle(bundle)
