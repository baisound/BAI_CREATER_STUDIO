"""Stage 59: revision-guarded motion clip -> scene instance association.
Readiness is only format-level. Rendering/retarget success is browser-local.
"""
from pathlib import Path
from studio_project_catalog import _atomic
from studio_v05_arrangement import read as arrangement_read, LOCK, ArrangementError, classify
from studio_v05_scene_instances import read as scene_read, SceneInstancesError
from studio_v05_motion_plan import compatible

class MultiMotionError(ValueError): pass

def plan(arrangement_root, scene_root, legacy_root, catalog, project_id, assets):
    arrangement = arrangement_read(arrangement_root, catalog, project_id)
    scene = scene_read(scene_root, legacy_root, catalog, project_id, assets)
    models = {i["id"]: i for i in scene["instances"]}
    asset_map = {a["id"]: a for a in assets if isinstance(a, dict) and isinstance(a.get("id"), str)}
    rows = []
    for clip in arrangement["clips"]:
        if clip.get("track") != "motion": continue
        inst_id = clip.get("target_scene_instance_id")
        instance = models.get(inst_id)
        motion = asset_map.get(clip.get("asset_id"))
        model = asset_map.get(instance["asset_id"]) if instance else None
        status = "ready"
        if not inst_id: status = "unassigned"
        elif not instance: status = "missing_instance"
        elif not motion or not motion.get("available") or classify(motion) != "motion": status = "motion_unavailable"
        elif not model or not model.get("available") or not instance.get("available"): status = "model_unavailable"
        elif not compatible(model.get("format"), motion.get("format")): status = "unsupported_combination"
        rows.append({
            "clip_id":clip["id"],"name":clip.get("name",clip["id"]),"asset_id":clip["asset_id"],
            "target_scene_instance_id":inst_id,"status":status,"start":clip.get("start"),
            "duration":clip.get("duration"),"motion_format":motion.get("format") if motion else None,
            "model_format":model.get("format") if model else None,
            "motion_asset":motion if status == "ready" else None,
            "motion010_candidate_id":clip.get("motion010_candidate_id"),
            "motion010_source_asset_id":clip.get("motion010_source_asset_id"),
        })
    # Each instance may have only one active full-body motion per moment. Fail closed.
    by_instance = {}
    for row in rows:
        if row["status"] != "ready": continue
        by_instance.setdefault(row["target_scene_instance_id"], []).append(row)
    for clips in by_instance.values():
        clips.sort(key=lambda c:(c["start"],c["clip_id"]))
        last=None
        for row in clips:
            if last and row["start"] < last["start"]+last["duration"]-1e-8:
                row["status"]="overlapping_motion"
                last["status"]="overlapping_motion"
            if last is None or row["start"]+row["duration"] > last["start"]+last["duration"]:
                last=row
    return {"project_id":project_id,"scene_revision":scene["revision"],
        "arrangement_revision":arrangement["revision"],"instances":scene["instances"],
        "rows":rows,"ready_count":sum(x["status"]=="ready" for x in rows),
        "gpu_verified":False}

def assign(arrangement_root, scene_root, legacy_root, catalog, project_id, clip_id, revision, instance_id, assets, *, layout_root=None):
    if not isinstance(clip_id,str) or not clip_id or len(clip_id)>100: raise MultiMotionError("Invalid clip ID")
    if type(revision) is not int or revision<0:raise MultiMotionError("Revision required")
    if instance_id is not None and (not isinstance(instance_id,str) or not instance_id or len(instance_id)>100):
        raise MultiMotionError("Invalid scene instance ID")
    with LOCK:
        arrangement = arrangement_read(arrangement_root,catalog,project_id)
        if revision!=arrangement["revision"]:raise MultiMotionError("Revision conflict")
        clip = next((c for c in arrangement["clips"] if c.get("id")==clip_id),None)
        if not clip:raise MultiMotionError("Clip not found")
        if clip.get("track")!="motion" or clip.get("category")!="motion":raise MultiMotionError("Motion clip required")
        if layout_root is not None:
            from studio_v05_track_layout import get as get_layout
            if clip["track"] in get_layout(layout_root,catalog,project_id).get("locked",[]):
                raise MultiMotionError("Track locked")
        scene=scene_read(scene_root,legacy_root,catalog,project_id,assets)
        if instance_id is not None:
            instance=next((x for x in scene["instances"] if x["id"]==instance_id),None)
            if instance is None: raise MultiMotionError("Scene instance not found")
            if instance["locked"]: raise MultiMotionError("Scene instance locked")
            model=instance.get("asset")
            motion=next((x for x in assets if x.get("id")==clip["asset_id"]),None)
            if not model or not motion or not motion.get("available") or classify(motion)!="motion":
                raise MultiMotionError("Model or motion unavailable")
            if not compatible(model.get("format"),motion.get("format")):
                raise MultiMotionError("Unsupported model/motion combination")
            clip["target_scene_instance_id"]=instance_id
        else:
            clip.pop("target_scene_instance_id",None)
        arrangement["revision"]+=1
        arrangement.pop("undo",None)
        _atomic(Path(arrangement_root)/(project_id+".json"),arrangement)
        return {"project_id":project_id,"clip_id":clip_id,
                "target_scene_instance_id":instance_id,"revision":arrangement["revision"],
                "scene_revision":scene["revision"],"gpu_verified":False}
