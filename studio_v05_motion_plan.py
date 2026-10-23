"""Stage 56: deterministic, read-only single-model motion preview plan.

The persisted scene model is authoritative. Unsupported/ambiguous mappings
are reported, never guessed or silently retargeted.
"""
from studio_v05_scene_model import read as read_scene, supported_model
from studio_v05_arrangement import read as read_arrangement, classify

class MotionPlanError(ValueError):
    pass

def compatible(model_format, motion_format):
    model = str(model_format or "").upper()
    motion = str(motion_format or "").upper()
    return model in {"PMX", "GLB", "VRM", "FBX"} and (
        (motion == "VMD" and model == "PMX")
        or motion in {"GLB", "FBX"}
    )

def plan(scene_root, arrangement_root, catalog, project_id, assets):
    """Report the pairs that the existing v22 preview can attempt to load.

    This is compatibility by format, not proof of compatible rigs or
    successful GPU retargeting. No data is modified.
    """
    scene = read_scene(scene_root, catalog, project_id, assets)
    arrangement = read_arrangement(arrangement_root, catalog, project_id)
    asset_map = {a["id"]: a for a in assets if isinstance(a, dict) and isinstance(a.get("id"), str)}
    scene_model = scene.get("model")
    model_id = scene_model.get("asset_id") if isinstance(scene_model, dict) else None
    model = asset_map.get(model_id)
    model_available = bool(model_id and supported_model(model))
    rows, ready_clips, required_assets = [], [], {}
    if model_available:
        required_assets[model_id] = {**model, "category": "model"}
    for clip in arrangement["clips"]:
        if clip.get("track") != "motion" or clip.get("category") != "motion":
            continue
        motion = asset_map.get(clip.get("asset_id"))
        status = "ready"
        if not model_id:
            status = "no_scene_model"
        elif not model_available:
            status = "scene_model_unavailable"
        elif not motion or not motion.get("available"):
            status = "motion_unavailable"
        elif classify(motion) != "motion":
            status = "not_motion_asset"
        elif not compatible(model.get("format"), motion.get("format")):
            status = "unsupported_combination"
        elif clip.get("target_model_id") != model_id:
            status = "target_unassigned" if not clip.get("target_model_id") else "target_mismatch"
        row = {
            "clip_id": clip.get("id"), "asset_id": clip.get("asset_id"),
            "name": (motion or {}).get("name") or clip.get("asset_id"),
            "motion_format": (motion or {}).get("format"),
            "start": clip.get("start"), "duration": clip.get("duration"),
            "target_model_id": clip.get("target_model_id"),
            "status": status,
        }
        rows.append(row)
        if status == "ready":
            ready_clips.append(dict(clip))
            required_assets[motion["id"]] = {**motion, "category": "motion"}
    return {
        "project_id": project_id,
        "model": scene_model,
        "model_format": model.get("format") if model_available else None,
        "scene_revision": scene["revision"],
        "arrangement_revision": arrangement["revision"],
        "rows": rows,
        "ready_count": len(ready_clips),
        "clips": ready_clips,
        "assets": list(required_assets.values()),
        "engine_playback_verified": False,
    }
