"""Revision-guarded, non-overwriting MP4 jobs for saved v0.5 media clips.

Only supported registered sources are accepted. Camera, effects and embedded
video audio are not silently omitted from a claimed render.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

from studio_project_catalog import _atomic
from studio_v05_arrangement import read as read_arrangement
from studio_v05_render_range import read as read_range

LOCK = threading.RLock()
ACTIVE: set[str] = set()
JOB_ID = re.compile(r"[0-9a-f]{32}\Z")
MAX_SECONDS = 600  # bounded first MP4 preset; longer projects remain unconnected
MAX_CLIPS = 80
MAX_SCENE_FRAMES = 300  # bounded browser WebGL capture preset
RESOLUTIONS = {"720p": (1280, 720), "1080p": (1920, 1080)}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
VIDEO_EXT = {".mp4", ".webm", ".ogv"}
AUDIO_EXT = {".wav", ".mp3"}
_CAP_CACHE: dict | None = None
_CAP_KEY: tuple | None = None


class RenderError(ValueError):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def _sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _job_file(root: Path, job_id: str) -> Path:
    if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
        raise RenderError("Invalid render job ID", 400)
    return root / "jobs" / f"{job_id}.json"


def _public(job: dict) -> dict:
    return {key: value for key, value in job.items() if key not in {"source_paths", "command"}}


def _save(root: Path, job: dict) -> None:
    with LOCK:
        for attempt in range(5):
            try:
                _atomic(_job_file(root, job["id"]), job)
                return
            except PermissionError:
                if attempt == 4: raise
                time.sleep(0.04 * (attempt + 1))


def status(root: Path, job_id: str) -> dict:
    path = _job_file(root, job_id)
    if not path.is_file():
        raise RenderError("Render job not found", 404)
    with LOCK:
        for attempt in range(3):
            try:
                job = json.loads(path.read_text(encoding="utf-8"))
                break
            except OSError as exc:
                if attempt == 2: raise RenderError("Saved render job cannot be read", 422) from exc
                time.sleep(0.02)
            except ValueError as exc:
                raise RenderError("Saved render job is invalid", 422) from exc
        if job.get("id") != job_id:
            raise RenderError("Saved render job is invalid", 422)
        if job.get("status") in {"queued", "running"} and job_id not in ACTIVE:
            job = {**job, "status": "interrupted", "error": "サーバー再起動で処理が中断されました。原本と以前の出力は保持しています。"}
    return _public(job)


def list_jobs(root: Path, project_id: str, limit: int = 20) -> dict:
    jobs = []
    for path in (root / "jobs").glob("*.json"):
        try:
            item = status(root, path.stem)
            if item.get("project_id") == project_id:
                jobs.append(item)
        except RenderError:
            continue
    jobs.sort(key=lambda item: item.get("created_at", 0), reverse=True)
    return {"jobs": jobs[:limit], "project_id": project_id}


def output_file(root: Path, job_id: str) -> Path:
    job = status(root, job_id)
    if job.get("status") != "succeeded":
        raise RenderError("Completed MP4 not available", 404)
    path = root / "files" / f"{job_id}.mp4"
    if not path.is_file() or path.stat().st_size != job.get("bytes"):
        raise RenderError("Completed MP4 is missing or changed", 422)
    return path


def _run(args: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), check=False)


def _scene_capture_available() -> bool:
    browser_candidates = [os.environ.get("CHROMIUM_PATH"), os.environ.get("CHROMIUM"),
                          r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                          r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]
    local = Path(__file__).resolve().parent / "node_modules"
    return bool(shutil.which("node") and (local / "playwright").is_dir() and
                (local / "three").is_dir() and
                any(p and Path(p).is_file() for p in browser_candidates))


def capabilities(ffmpeg: str | None = None, ffprobe: str | None = None,
                 probe_root: Path | None = None) -> dict:
    global _CAP_CACHE, _CAP_KEY
    ffmpeg = ffmpeg or shutil.which("ffmpeg")
    ffprobe = ffprobe or shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        return {"available": False, "reason": "FFmpegとffprobeが見つかりません", "presets": []}
    try:
        key = (ffmpeg, ffprobe, Path(ffmpeg).stat().st_mtime_ns, Path(ffprobe).stat().st_mtime_ns)
    except OSError:
        return {"available": False, "reason": "FFmpegまたはffprobeを読み込めません", "presets": []}
    with LOCK:
        if _CAP_KEY == key and _CAP_CACHE is not None:
            return {**_CAP_CACHE, "scene_capture_available": _scene_capture_available()}
    try:
        encoders = _run([ffmpeg, "-hide_banner", "-encoders"], 15)
        if encoders.returncode or not re.search(r"\blibx264\b", encoders.stdout) or not re.search(r"\baac\b", encoders.stdout):
            return {"available": False, "reason": "H.264とAACのencoderを利用できません", "presets": []}
        if probe_root is not None: probe_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=probe_root) as folder:
            sample = Path(folder) / "encoder-test.mp4"
            attempt = _run([ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error",
                            "-f", "lavfi", "-i", "color=c=black:s=16x16:r=30:d=0.1",
                            "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=0.1",
                            "-frames:v", "2", "-t", "0.1", "-c:v", "libx264", "-c:a", "aac",
                            "-f", "mp4", str(sample)], 30)
            if attempt.returncode or not sample.is_file():
                return {"available": False, "reason": "H.264/AACの短い試験エンコードに失敗しました", "presets": []}
            probe = _run([ffprobe, "-v", "error", "-show_entries", "stream=codec_name",
                          "-of", "json", str(sample)], 15)
            codecs = {stream.get("codec_name") for stream in json.loads(probe.stdout).get("streams", [])}
            if probe.returncode or not {"h264", "aac"}.issubset(codecs):
                return {"available": False, "reason": "試験MP4の映像・音声を再読込できません", "presets": []}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return {"available": False, "reason": "FFmpegのencoderを確認できません", "presets": []}
    result = {"available": True, "reason": None, "presets": ["mp4_h264_aac"],
              "resolutions": sorted(RESOLUTIONS), "max_duration_seconds": MAX_SECONDS,
              "scene_capture_available": _scene_capture_available(), "max_scene_frames": MAX_SCENE_FRAMES}
    with LOCK:
        _CAP_KEY, _CAP_CACHE = key, result
    return dict(result)


def _source(entry: dict, library_root: Path, source_root: Path, inbox_root: Path, integrated_root: Path) -> Path | None:
    source = entry.get("source")
    if source == "library":
        import library_assets
        found = library_assets.file_for(library_root, entry["id"])
        return found[0] if found else None
    if source == "v05source":
        from studio_v05_asset_sources import file_for
        found = file_for(source_root, inbox_root, entry["id"])
        return found[0] if found else None
    if source == "integrated" and isinstance(entry.get("filename"), str):
        base = integrated_root.resolve()
        candidate = (base / entry["filename"]).resolve()
        return candidate if candidate.is_relative_to(base) and candidate.is_file() else None
    if source == "mmd" and entry.get("kind") in {"A", "B", "vmd"} and isinstance(entry.get("name"), str):
        base = (library_root.parent / "mmd" / entry["kind"]).resolve()
        candidate = (base / entry["name"]).resolve()
        return candidate if candidate.is_relative_to(base) and candidate.is_file() else None
    if source == "fbx" and isinstance(entry.get("id"), str) and entry["id"].startswith("fbx:"):
        base = (library_root.parent / "files").resolve()
        candidate = (base / (entry["id"][4:] + ".fbx")).resolve()
        return candidate if candidate.is_relative_to(base) and candidate.is_file() else None
    return None


def _media_info(ffprobe: str, path: Path) -> dict:
    try:
        result = _run([ffprobe, "-v", "error", "-show_entries",
                       "stream=codec_type:format=duration", "-of", "json", str(path)], 30)
        if result.returncode:
            raise ValueError("ffprobe returned an error")
        info = json.loads(result.stdout)
        duration = float(info["format"]["duration"])
        if not 0 < duration <= 86400:
            raise ValueError("invalid media duration")
        return {"duration": duration,
                "audio": any(stream.get("codec_type") == "audio" for stream in info.get("streams", []))}
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as exc:
        raise RenderError(f"{path.name}: 元素材を動画・音声として読めません") from exc


def media_info(data_root: Path, asset_id: str, inventory: list[dict]) -> dict:
    """Probe only a registered available media file; never expose its filesystem path."""
    from studio_v05_arrangement import classify
    if not isinstance(asset_id, str) or not 0 < len(asset_id) <= 300:
        raise RenderError("Invalid asset ID", 400)
    entry = next((item for item in inventory if item.get("id") == asset_id and item.get("available")), None)
    if not entry:
        raise RenderError("登録済み素材が見つかりません", 404)
    kind = classify(entry)
    if kind not in {"video", "audio", "music"}:
        raise RenderError("動画・音声の素材を選んでください", 400)
    path = _source(entry, data_root / "library_assets", data_root / "studio_v05_asset_sources",
                   data_root / "asset_inbox", data_root / "integrated_v02" / "assets")
    if not path or not path.is_file():
        raise RenderError("元素材を読み込めません", 404)
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RenderError("ffprobeが見つからないため動画・音声の長さを確認できません")
    info = _media_info(ffprobe, path)
    return {"asset_id": asset_id, "kind": kind, "duration_seconds": round(info["duration"], 4),
            "has_audio": info["audio"]}


def _snapshot(data_root: Path, project_id: str, range_revision: int, arrangement_revision: int,
              resolution: str, inventory: list[dict], ffprobe: str,
              scene_motion_ids: set[str] | None = None) -> tuple[dict, list[dict]]:
    if resolution not in RESOLUTIONS:
        raise RenderError("Unsupported output resolution")
    if type(range_revision) is not int or type(arrangement_revision) is not int:
        raise RenderError("Saved range and timeline revisions are required", 400)
    catalog = data_root / "studio_v05_catalog.json"
    arrangement = read_arrangement(data_root / "studio_v05_arrangements", catalog, project_id)
    render_range = read_range(data_root / "studio_v05_render_ranges", data_root / "studio_v05_arrangements", catalog, project_id)
    if arrangement["revision"] != arrangement_revision or render_range["revision"] != range_revision or render_range["arrangement_revision"] != arrangement_revision:
        raise RenderError("Saved timeline or In/Out changed; reload before rendering", 409)
    if not render_range["valid"] or not render_range["has_clips"]:
        raise RenderError(render_range["error"] or "No saved clips to render")
    if not 1 <= render_range["frame_count"] <= render_range["fps"] * MAX_SECONDS:
        raise RenderError("このMP4プリセットは10分以内の範囲に対応します")
    clips = arrangement["clips"]
    if len(clips) > MAX_CLIPS:
        raise RenderError("Too many clips for the current render preset")
    files = {entry.get("id"): entry for entry in inventory if isinstance(entry, dict)}
    resolved = []
    for clip in clips:
        if clip.get("category") == "motion" and scene_motion_ids is not None:
            if clip.get("id") not in scene_motion_ids:
                raise RenderError(f"{clip.get('name', 'Motion')}: 3Dシーンへ適用できない動作です")
            continue  # the captured scene contains this motion at saved frame times
        source_start = clip.get("source_start", 0)
        if type(source_start) not in (int, float) or not math.isfinite(source_start) or source_start < 0:
            raise RenderError(f"{clip.get('name', 'Clip')}: 元素材の開始位置が不正です")
        if clip.get("category") not in {"image", "video", "audio", "music"}:
            raise RenderError(f"{clip.get('name', 'Clip')}: 3D・動作・カメラ等を含む作品はこのMP4プリセットでまだ出力できません")
        entry = files.get(clip.get("asset_id"))
        if not entry or not entry.get("available"):
            raise RenderError(f"{clip.get('name', 'Clip')}: 登録素材の原本が見つかりません")
        path = _source(entry, data_root / "library_assets", data_root / "studio_v05_asset_sources",
                       data_root / "asset_inbox", data_root / "integrated_v02" / "assets")
        kind = "audio" if clip["category"] == "music" else clip["category"]
        allowed = {"image": IMAGE_EXT, "video": VIDEO_EXT, "audio": AUDIO_EXT}[kind]
        if not path or path.suffix.lower() not in allowed:
            raise RenderError(f"{clip.get('name', 'Clip')}: この形式または登録元はMP4出力へ未接続です")
        if kind in {"video", "audio"}:
            info = _media_info(ffprobe, path)
            if info["duration"] + 0.02 < clip.get("source_start", 0) + clip["duration"]:
                raise RenderError(f"{clip.get('name', 'Clip')}: 配置時間が元素材より長いため出力できません")
            if kind == "video" and info["audio"]:
                raise RenderError(f"{clip.get('name', 'Clip')}: 動画内音声はこのMP4プリセットへ未接続です。欠落を避けるため出力を停止します")
        resolved.append({"clip": dict(clip), "kind": kind, "path": path,
                         "asset_id": clip["asset_id"], "bytes": path.stat().st_size,
                         "registered_sha256": entry.get("sha256")})
    resolved.sort(key=lambda item: (item["clip"].get("lane", 1), item["clip"]["start"], item["clip"]["id"]))
    return render_range, resolved


def _scene_snapshot(data_root: Path, project_id: str, scene_revision: int,
                    arrangement_revision: int, inventory: list[dict]) -> tuple[set[str], list[dict]]:
    from studio_v05_scene_instances import read as read_scene
    from studio_v05_multi_motion import plan as motion_plan
    if type(scene_revision) is not int or scene_revision < 0:
        raise RenderError("Saved 3D scene revision is required", 400)
    catalog = data_root / "studio_v05_catalog.json"
    scene = read_scene(data_root / "studio_v05_scene_instances", data_root / "studio_v05_scene_models",
                       catalog, project_id, inventory)
    if scene["revision"] != scene_revision:
        raise RenderError("Saved 3D scene changed; reload before rendering", 409)
    visible = [row for row in scene["instances"] if row["visible"]]
    if not visible or any(not row["available"] for row in visible):
        raise RenderError("表示できる登録済み3Dモデルがありません")
    plan = motion_plan(data_root / "studio_v05_arrangements", data_root / "studio_v05_scene_instances",
                       data_root / "studio_v05_scene_models", catalog, project_id, inventory)
    if plan["arrangement_revision"] != arrangement_revision or plan["scene_revision"] != scene_revision:
        raise RenderError("Saved 3D motion changed; reload before rendering", 409)
    if any(row["status"] != "ready" for row in plan["rows"]):
        raise RenderError("未割当または読込不能な3D動作があります。書き出し前に解決してください")
    assets = {entry.get("id"): entry for entry in inventory if isinstance(entry, dict)}
    selected_ids = {row["asset_id"] for row in visible}
    selected_ids.update(row["asset_id"] for row in plan["rows"])
    inputs = []
    for asset_id in sorted(selected_ids):
        entry = assets.get(asset_id)
        path = _source(entry or {}, data_root / "library_assets", data_root / "studio_v05_asset_sources",
                       data_root / "asset_inbox", data_root / "integrated_v02" / "assets")
        if not entry or not entry.get("available") or not path or not path.is_file():
            raise RenderError("3Dモデル・動作の登録原本が見つかりません")
        ext = path.suffix.lower()
        if ext not in {".glb", ".vrm", ".pmx", ".vmd"}:
            raise RenderError(f"{entry.get('name', asset_id)}: この3D形式は限定MP4へ未接続です")
        inputs.append({"asset_id": asset_id, "kind": "scene", "path": path,
                       "bytes": path.stat().st_size, "registered_sha256": entry.get("sha256"),
                       "clip": {"id": "scene:" + asset_id}})
        if ext == ".pmx":
            texture_dir = path.parent / "tex"
            if texture_dir.is_dir():
                textures = [p for p in texture_dir.rglob("*") if p.is_file()]
                safe_root = texture_dir.resolve()
                if any(not texture.resolve().is_relative_to(safe_root) for texture in textures):
                    raise RenderError("PMX参照テクスチャのパスが登録領域外です")
                if len(textures) > 1500 or sum(p.stat().st_size for p in textures) > 600 * 1024 * 1024:
                    raise RenderError("PMXの参照テクスチャが限定書き出し上限を超えています")
                for texture in textures:
                    inputs.append({"asset_id": asset_id, "kind": "scene_texture", "path": texture,
                                   "bytes": texture.stat().st_size, "registered_sha256": None,
                                   "clip": {"id": "scene:" + asset_id}})
    return {row["clip_id"] for row in plan["rows"]}, inputs


def _num(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".") or "0"


def _graph(clips: list[dict], fps: float, width: int, height: int,
           start_frame: int, end_exclusive: int, scene_input_index: int | None = None) -> tuple[str, int, float]:
    end_seconds = end_exclusive / fps
    start_seconds = start_frame / fps
    duration = (end_exclusive - start_frame) / fps
    graph = ["[0:v]format=yuva420p[base]"]
    base = "base"
    audio = ["[1:a]anull[asilence]"]
    audio_labels = ["asilence"]
    for order, item in enumerate(clips):
        clip = item["clip"]
        idx = order + 2
        cstart, cend = float(clip["start"]), float(clip["start"] + clip["duration"])
        length = float(clip["duration"])
        source_start = float(clip.get("source_start", 0)) if item["kind"] != "image" else 0.0
        if item["kind"] in {"image", "video"}:
            label = f"visual{order}"
            graph.append(f"[{idx}:v]trim=start={_num(source_start)}:duration={_num(length)},setpts=PTS-STARTPTS,fps={_num(fps)},"
                         f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                         f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0,"
                         f"format=yuva420p,setpts=PTS+{_num(cstart)}/TB[{label}]")
            next_base = f"overlay{order}"
            graph.append(f"[{base}][{label}]overlay=0:0:eof_action=pass:shortest=0:"
                         f"enable='gte(t,{_num(cstart)})*lt(t,{_num(cend)})'[{next_base}]")
            base = next_base
        else:
            label = f"audio{order}"
            delay = round(cstart * 1000)
            audio.append(f"[{idx}:a]atrim=start={_num(source_start)}:duration={_num(length)},asetpts=PTS-STARTPTS,"
                         f"aresample=48000,aformat=channel_layouts=stereo,adelay={delay}|{delay}[{label}]")
            audio_labels.append(label)
    graph.append(f"[{base}]trim=start={_num(start_seconds)}:end={_num(end_seconds)},"
                 f"setpts=PTS-STARTPTS,fps={_num(fps)}[{'vflat' if scene_input_index is not None else 'vout'}]")
    if scene_input_index is not None:
        graph.append(f"[{scene_input_index}:v]format=rgba,setpts=PTS-STARTPTS[vscene]")
        graph.append("[vflat][vscene]overlay=0:0:shortest=1:format=auto[vout]")
    if len(audio_labels) > 1:
        audio.append("".join(f"[{label}]" for label in audio_labels) +
                     f"amix=inputs={len(audio_labels)}:duration=longest:dropout_transition=0[amixed]")
        source = "amixed"
    else:
        source = "asilence"
    audio.append(f"[{source}]atrim=start={_num(start_seconds)}:end={_num(end_seconds)},asetpts=PTS-STARTPTS[aout]")
    return ";".join(graph + audio), end_exclusive - start_frame, duration


def _verify(ffprobe: str, path: Path, frames: int, duration: float, width: int, height: int, fps: float) -> dict:
    result = _run([ffprobe, "-v", "error", "-count_frames", "-show_entries",
                   "stream=codec_name,codec_type,width,height,nb_read_frames,duration:format=duration",
                   "-of", "json", str(path)], 60)
    if result.returncode:
        raise RenderError("完成MP4を再読込できません")
    try:
        probe = json.loads(result.stdout)
        video = next(stream for stream in probe["streams"] if stream["codec_type"] == "video")
        audio = next(stream for stream in probe["streams"] if stream["codec_type"] == "audio")
        actual_frames = int(video["nb_read_frames"])
        actual_duration = float(probe["format"]["duration"])
    except (ValueError, KeyError, StopIteration, TypeError) as exc:
        raise RenderError("完成MP4の映像・音声情報を確認できません") from exc
    if video["codec_name"] != "h264" or audio["codec_name"] != "aac" or video["width"] != width or video["height"] != height:
        raise RenderError("完成MP4のcodecまたは解像度が要求と違います")
    if actual_frames != frames or abs(actual_duration - duration) > max(0.1, 2 / fps):
        raise RenderError("完成MP4のフレーム数または長さが要求と違います")
    return {"video_codec": "h264", "audio_codec": "aac", "frames": actual_frames,
            "duration_seconds": actual_duration, "width": width, "height": height}


def _worker(root: Path, job: dict, clips: list[dict], ffmpeg: str, ffprobe: str,
            scene_inputs: list[dict] | None = None, server_port: int | None = None) -> None:
    job_id = job["id"]
    temp = root / "files" / f"{job_id}.part.mp4"
    final = root / "files" / f"{job_id}.mp4"
    progress = root / "jobs" / f"{job_id}.progress"
    log = root / "jobs" / f"{job_id}.log"
    frames_dir = root / "jobs" / f"{job_id}.frames"
    try:
        job["status"] = "running"
        job["started_at"] = time.time()
        _save(root, job)
        all_inputs = clips + (scene_inputs or [])
        for item in all_inputs:
            item["sha256"] = _sha(item["path"])
            if item["registered_sha256"] and item["sha256"] != item["registered_sha256"]:
                raise RenderError("登録済み原素材のhashと実ファイルが一致しません。出力を停止します")
        job["inputs"] = [{"asset_id": item["asset_id"], "bytes": item["bytes"],
                          "sha256": item["sha256"], "clip_id": item["clip"]["id"]} for item in all_inputs]
        _save(root, job)
        width, height = RESOLUTIONS[job["resolution"]]
        fps = job["fps"]
        scene_index = None
        if scene_inputs is not None:
            if server_port is None:
                raise RenderError("3D capture server port is missing")
            node = shutil.which("node")
            script_path = Path(__file__).resolve().parent / "tools" / "render_v05_scene_frames.cjs"
            if not node or not script_path.is_file():
                raise RenderError("3D capture requires local Node.js and Playwright")
            config_path = root / "jobs" / f"{job_id}.scene-config.json"
            manifest_path = root / "jobs" / f"{job_id}.scene-manifest.json"
            config = {"projectId": job["project_id"], "sceneRevision": job["scene_revision"],
                      "arrangementRevision": job["arrangement_revision"],
                      "rangeRevision": job["range_revision"],
                      "startFrame": job["range_start_frame"], "frameCount": job["frame_count"],
                      "fps": fps, "width": width, "height": height, "port": server_port,
                      "directory": str(frames_dir), "manifest": str(manifest_path)}
            config_path.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
            job["phase"] = "capturing_3d"
            _save(root, job)
            capture = subprocess.run([node, str(script_path), str(config_path)], stdin=subprocess.DEVNULL,
                                     capture_output=True, text=True, errors="replace",
                                     timeout=max(120, min(1800, job["frame_count"] * 10)),
                                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if capture.returncode:
                raise RenderError("3D実描画に失敗: " + capture.stderr[-900:])
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("frame_count") != job["frame_count"] or len(manifest.get("frame_sha256", [])) != job["frame_count"]:
                raise RenderError("3D連番が保存範囲と一致しません")
            for i, digest in enumerate(manifest["frame_sha256"], 1):
                path = frames_dir / f"frame_{i:06d}.png"
                if not path.is_file() or _sha(path) != digest:
                    raise RenderError("3D連番が描画後に変わりました")
            job["scene_capture"] = {"frames": job["frame_count"], "renderer": manifest.get("renderer"),
                                    "motion_clips": manifest.get("motion_clips"),
                                    "pose_sample": manifest.get("pose_sample"),
                                    "manifest_sha256": _sha(manifest_path)}
            scene_index = 2 + len(clips)
            job["phase"] = "encoding"
            _save(root, job)
        graph, frames, duration = _graph(clips, fps, width, height,
                                         job["range_start_frame"], job["range_end_exclusive"], scene_index)
        script = root / "jobs" / f"{job_id}.filter"
        script.write_text(graph, encoding="utf-8")
        full_duration = _num(job["range_end_exclusive"] / fps)
        cmd = [ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-nostats",
               "-progress", str(progress), "-f", "lavfi", "-i",
               f"color=c=black:s={width}x{height}:r={_num(fps)}:d={full_duration}",
               "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo:d={full_duration}"]
        for item in clips:
            if item["kind"] == "image":
                cmd += ["-loop", "1", "-framerate", _num(fps), "-t", _num(item["clip"]["duration"]),
                        "-i", str(item["path"])]
            else:
                cmd += ["-i", str(item["path"])]
        if scene_index is not None:
            cmd += ["-framerate", _num(fps), "-start_number", "1", "-i",
                    str(frames_dir / "frame_%06d.png")]
        cmd += ["-/filter_complex", str(script), "-map", "[vout]", "-map", "[aout]",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                "-frames:v", str(frames), "-t", _num(duration), "-f", "mp4", "-n", str(temp)]
        with log.open("w", encoding="utf-8") as err:
            process = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                       stderr=err, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            deadline = time.monotonic() + max(120, min(3600, duration * 12))
            last_progress = -1
            while process.poll() is None:
                if time.monotonic() > deadline:
                    process.kill()
                    raise RenderError("FFmpeg timed out")
                try:
                    content = progress.read_text(encoding="utf-8", errors="replace")
                    values = re.findall(r"out_time_us=(\d+)", content)
                    if values:
                        percent = min(99, int(float(values[-1]) / (duration * 1_000_000) * 100))
                        if percent >= last_progress + 2:
                            job["progress_percent"] = percent
                            _save(root, job)
                            last_progress = percent
                except OSError:
                    pass
                time.sleep(0.3)
            if process.returncode:
                tail = log.read_text(encoding="utf-8", errors="replace")[-900:]
                raise RenderError(f"FFmpeg exited {process.returncode}: {tail}")
        for item in all_inputs:
            if item["path"].stat().st_size != item["bytes"] or _sha(item["path"]) != item["sha256"]:
                raise RenderError("原素材が出力中に変わりました。完成物は確定しません")
        info = _verify(ffprobe, temp, frames, duration, width, height, fps)
        if final.exists():
            raise RenderError("同名完成物が既にあります。原本を保持します")
        digest = _sha(temp)
        os.replace(temp, final)
        job.update(status="succeeded", progress_percent=100, completed_at=time.time(),
                   bytes=final.stat().st_size, sha256=digest, probe=info, error=None)
    except Exception as exc:
        job.update(status="failed", completed_at=time.time(), error=str(exc)[:1200])
        try:
            if temp.exists(): temp.unlink()
        except OSError:
            pass
    finally:
        if scene_inputs is not None and frames_dir.is_dir():
            # The directory is a UUID-named child of this job root, never an
            # input asset or an existing deliverable.
            shutil.rmtree(frames_dir, ignore_errors=True)
        try: _save(root, job)
        finally:
            with LOCK: ACTIVE.discard(job_id)


def start(data_root: Path, project_id: str, range_revision: int, arrangement_revision: int,
          resolution: str, inventory: list[dict], scene_revision: int | None = None,
          server_port: int | None = None) -> dict:
    root = data_root / "studio_v05_media_renders"
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    caps = capabilities(ffmpeg, ffprobe, root / "probe")
    if not caps["available"]:
        raise RenderError(caps["reason"], 503)
    scene_inputs = None
    motion_ids = None
    if scene_revision is not None:
        if not caps.get("scene_capture_available"):
            raise RenderError("3D書き出し用のChrome/Edge・Node.js・Playwright・Three.jsがありません", 503)
        if resolution != "720p":
            raise RenderError("3Dを含む限定MP4は現在720pのみ対応します")
        motion_ids, scene_inputs = _scene_snapshot(data_root, project_id, scene_revision,
                                                    arrangement_revision, inventory)
    else:
        from studio_v05_scene_instances import read as read_scene
        scene = read_scene(data_root / "studio_v05_scene_instances", data_root / "studio_v05_scene_models",
                           data_root / "studio_v05_catalog.json", project_id, inventory)
        if any(row["visible"] for row in scene["instances"]):
            raise RenderError("保存済み3Dシーンがあります。scene_revisionを指定し、3Dを含めて書き出してください")
    render_range, clips = _snapshot(data_root, project_id, range_revision,
                                    arrangement_revision, resolution, inventory, ffprobe, motion_ids)
    if scene_inputs is not None and render_range["frame_count"] > MAX_SCENE_FRAMES:
        raise RenderError("3Dを含む限定MP4は現在300フレーム以内です")
    with LOCK:
        if ACTIVE:
            raise RenderError("別の動画書き出しが実行中です。完了後に再試行してください", 429)
        root.joinpath("jobs").mkdir(parents=True, exist_ok=True)
        root.joinpath("files").mkdir(parents=True, exist_ok=True)
        job_id = uuid.uuid4().hex
        while _job_file(root, job_id).exists() or (root / "files" / f"{job_id}.mp4").exists():
            job_id = uuid.uuid4().hex
        job = {"schema": 1, "id": job_id, "project_id": project_id, "status": "queued",
               "created_at": time.time(), "started_at": None, "completed_at": None,
               "arrangement_revision": arrangement_revision, "range_revision": range_revision,
               "range_start_frame": render_range["range_start_frame"],
               "range_end_exclusive": render_range["range_end_exclusive"],
               "frame_count": render_range["frame_count"], "fps": render_range["fps"],
               "resolution": resolution, "preset": "mp4_h264_aac", "inputs": [],
               "scene_revision": scene_revision, "phase": "queued",
               "progress_percent": 0, "error": None, "bytes": None, "sha256": None,
               "probe": None}
        _save(root, job)
        ACTIVE.add(job_id)
        thread = threading.Thread(target=_worker,
                                  args=(root, job, clips, ffmpeg, ffprobe, scene_inputs, server_port), daemon=True)
        thread.start()
    return _public(job)
