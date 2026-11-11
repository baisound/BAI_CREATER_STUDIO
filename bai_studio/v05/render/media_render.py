"""Revision-guarded, non-overwriting MP4 jobs for saved v0.5 media clips.

Only supported registered sources are accepted. Camera and effects are not
silently omitted from a claimed render.
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

from bai_studio.projects.catalog import _atomic
from bai_studio.v05.timeline.arrangement import read as read_arrangement
from bai_studio.v05.render.render_range import read as read_range
from bai_studio.v05.render.process_scope import RenderProcessScope

LOCK = threading.RLock()
ACTIVE: set[str] = set()
JOB_ID = re.compile(r"[0-9a-f]{32}\Z")
MAX_SECONDS = 600  # bounded first MP4 preset; longer projects remain unconnected
MAX_CLIPS = 80
AAC_BITRATE = 320000  # preserve unity gain while reducing measured AAC boundary loss
MAX_SCENE_FRAMES = 36000  # 10 minutes at 60fps; bounded lossless intermediate
MAX_SCENE_BYTES = 2 * 1024 * 1024 * 1024
RESOLUTIONS = {"720p": (1280, 720), "1080p": (1920, 1080)}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
VIDEO_EXT = {".mp4", ".webm", ".ogv"}
AUDIO_EXT = {".wav", ".mp3", ".ogg", ".flac", ".m4a"}
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
    return {key: value for key, value in job.items() if key not in {"source_paths", "command", "delivery_plan", "pending_output"}}


def _save(root: Path, job: dict) -> None:
    with LOCK:
        for attempt in range(5):
            try:
                _atomic(_job_file(root, job["id"]), job)
                return
            except PermissionError:
                if attempt == 4: raise
                time.sleep(0.04 * (attempt + 1))


def _cleanup_temporary(root: Path, job_id: str) -> bool:
    """Only UUID-owned work paths; never inputs or completed/archived MP4s."""
    _job_file(root, job_id)
    complete = True
    for parent, name, directory in [(root / "jobs", f"{job_id}.frames", True),
                                    (root / "files", f"{job_id}.part.mp4", False)]:
        target = parent / name
        try:
            # Resolve before deleting, including Windows junction/reparse paths.
            if target.resolve() != parent.resolve() / name:
                complete = False
                continue
            if directory and target.is_dir():
                shutil.rmtree(target)
            elif directory and target.exists():
                complete = False
            elif not directory and target.exists():
                target.unlink()
        except OSError:
            complete = False  # a closing child may hold the file; retry on next status
    return complete


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
        interrupted = (job.get("status") in {"queued", "running"} or
                       (job.get("status") == "interrupted" and job.get("temporary_cleanup") != "complete")) and job_id not in ACTIVE
    if interrupted:
        pending = job.get("pending_output")
        if isinstance(pending, dict) and job.get("download_name"):
            from bai_studio.v05.render.render_names import state as name_state
            final = root / "files" / f"{job_id}.mp4"
            try:
                indexed = name_state(root, job["project_id"], job["download_name"], job_id)
                if (indexed in {"current", "archived"} and final.is_file() and
                        final.stat().st_size == pending.get("bytes") and
                        _sha(final) == pending.get("sha256")):
                    job.update(status="succeeded", completed_at=time.time(), progress_percent=100,
                               bytes=pending["bytes"], sha256=pending["sha256"],
                               probe=pending["probe"], error=None)
                    job.pop("pending_output", None)
                    _save(root, job)
                    return _public(job)
            except (OSError, ValueError, KeyError):
                pass
        cleaned = _cleanup_temporary(root, job_id)
        job = {**job, "status": "interrupted", "temporary_cleanup": "complete" if cleaned else "pending",
               "error": "サーバー再起動で処理が中断されました。原本と以前の出力は保持しています。" +
                        ("一時ファイルを回収しました。" if cleaned else "一時ファイルの回収は次回再試行します。")}
        job.pop("pending_output", None)
        _save(root, job)
    elif job.get("temporary_cleanup") == "pending" and job_id not in ACTIVE:
        job["temporary_cleanup"] = "complete" if _cleanup_temporary(root, job_id) else "pending"
        _save(root, job)
    return _public(job)


def list_jobs(root: Path, project_id: str, limit: int = 20, *, offset: int = 0,
              completed_only: bool = False) -> dict:
    from bai_studio.v05.render.render_names import state as name_state
    if type(limit) is not int or not 1 <= limit <= 100 or type(offset) is not int or offset < 0:
        raise RenderError("Invalid render history page", 400)
    jobs = []
    for path in (root / "jobs").glob("*.json"):
        try:
            item = status(root, path.stem)
            if item.get("project_id") == project_id and (not completed_only or item.get("status") == "succeeded"):
                item["delivery_state"] = name_state(root, project_id, item.get("download_name"), item["id"])
                if item.get("status") == "succeeded":
                    output = root / "files" / f"{item['id']}.mp4"
                    item["file_available"] = output.is_file() and output.stat().st_size == item.get("bytes")
                jobs.append(item)
        except RenderError:
            continue
    jobs.sort(key=lambda item: item.get("created_at", 0), reverse=True)
    return {"jobs": jobs[offset:offset + limit], "project_id": project_id,
            "total": len(jobs), "offset": offset, "has_more": offset + limit < len(jobs)}


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


def _stop_capture(process: subprocess.Popen) -> None:
    """Stop the private Node worker together with its Chromium descendants."""
    if process.poll() is None:
        if os.name == "nt":
            # TerminateProcess/kill() skips Node's finally block on Windows.
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=15,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        else:
            # Playwright handles SIGTERM by closing its browser before exit.
            process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    else:
        process.wait()


def _scene_capture_available() -> bool:
    browser_candidates = [os.environ.get("CHROMIUM_PATH"), os.environ.get("CHROMIUM"),
                          r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                          r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]
    local = Path(__file__).resolve().parents[3] / "node_modules"
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
            return {**_CAP_CACHE, "scene_capture_available": bool(_CAP_CACHE.get("scene_stream_available")) and _scene_capture_available()}
    try:
        encoders = _run([ffmpeg, "-hide_banner", "-encoders"], 15)
        if encoders.returncode or not re.search(r"\blibx264\b", encoders.stdout) or not re.search(r"\baac\b", encoders.stdout):
            return {"available": False, "reason": "H.264とAACのencoderを利用できません", "presets": []}
        scene_stream_available = bool(re.search(r"\bffv1\b", encoders.stdout))
        if probe_root is not None: probe_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=probe_root) as folder:
            script = Path(folder) / "encoder-test.filter"
            script.write_text("[0:v]null[vout];[1:a]anull[aout]", encoding="utf-8")
            filter_complex_option = None
            # New builds can remove the legacy option; FFmpeg 6.x lacks the
            # slash syntax. Probe actual file loading rather than version text.
            for index, option in enumerate(("-/filter_complex", "-filter_complex_script")):
                sample = Path(folder) / f"encoder-test-{index}.mp4"
                attempt = _run([ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error",
                                "-f", "lavfi", "-i", "color=c=black:s=16x16:r=30:d=0.1",
                                "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=0.1",
                                option, str(script), "-map", "[vout]", "-map", "[aout]",
                                "-frames:v", "2", "-t", "0.1", "-c:v", "libx264", "-c:a", "aac",
                                "-f", "mp4", str(sample)], 30)
                if attempt.returncode or not sample.is_file():
                    continue
                probe = _run([ffprobe, "-v", "error", "-show_entries", "stream=codec_name",
                              "-of", "json", str(sample)], 15)
                codecs = {stream.get("codec_name") for stream in json.loads(probe.stdout).get("streams", [])}
                if not probe.returncode and {"h264", "aac"}.issubset(codecs):
                    filter_complex_option = option
                    break
            if filter_complex_option is None:
                return {"available": False, "reason": "フィルター定義の読込とH.264/AACの試験出力に失敗しました", "presets": []}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return {"available": False, "reason": "FFmpegのencoderを確認できません", "presets": []}
    result = {"available": True, "reason": None, "presets": ["mp4_h264_aac"],
              "audio_bitrate": AAC_BITRATE,
              "filter_complex_option": filter_complex_option,
              "resolutions": sorted(RESOLUTIONS), "max_duration_seconds": MAX_SECONDS,
              "scene_stream_available": scene_stream_available,
              "scene_capture_available": scene_stream_available and _scene_capture_available(),
              "max_scene_frames": MAX_SCENE_FRAMES, "max_scene_bytes": MAX_SCENE_BYTES}
    with LOCK:
        _CAP_KEY, _CAP_CACHE = key, result
    return dict(result)


def _source(entry: dict, library_root: Path, source_root: Path, inbox_root: Path, integrated_root: Path) -> Path | None:
    source = entry.get("source")
    if source == "library":
        import bai_studio.assets.library_assets as library_assets
        found = library_assets.file_for(library_root, entry["id"])
        return found[0] if found else None
    if source == "v05source":
        from bai_studio.v05.assets.asset_sources import file_for
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
                       "stream=codec_type,sample_rate,width,height:stream_disposition=attached_pic:format=duration", "-of", "json", str(path)], 30)
        if result.returncode:
            raise ValueError("ffprobe returned an error")
        info = json.loads(result.stdout)
        duration = float(info["format"]["duration"])
        ext = path.suffix.lower()
        if ext == ".m4a" and any(stream.get("codec_type") == "video" and
                not stream.get("disposition", {}).get("attached_pic") for stream in info.get("streams", [])):
            raise RenderError("M4Aに映像が含まれています。元ファイルを動画形式で登録してください")
        if ext in {".mp3", ".ogg", ".flac", ".m4a"}:
            # Older demuxers include encoder delay/padding in format.duration.
            # Count decoded samples so source windows use the same playable
            # clock as the browser, without subtracting padding twice on newer
            # FFmpeg versions. Do not rewrite an existing saved clip to fit.
            audio = next(stream for stream in info.get("streams", [])
                         if stream.get("codec_type") == "audio")
            rate = int(audio["sample_rate"])
            if not 0 < rate <= 192000:
                raise ValueError("invalid audio sample rate")
            decoded = _run([ffprobe, "-v", "error", "-select_streams", "a:0",
                            "-show_entries", "frame=nb_samples", "-of", "csv=p=0", str(path)], 30)
            if decoded.returncode or decoded.stderr.strip():
                raise ValueError("Audio decode failed")
            samples = 0
            for line in decoded.stdout.splitlines():
                if not line.strip():
                    continue
                count = int(line)
                if not 0 < count <= (1152 if ext == ".mp3" else 192000):
                    raise ValueError("invalid audio sample count")
                samples += count
            if not samples:
                raise ValueError("No decoded audio samples")
            # Opus may include pre-skip in the container clock; AAC may decode
            # a padded last frame. Use only the common playable interval.
            duration = samples / rate if ext == ".mp3" else min(duration, samples / rate)
        if not 0 < duration <= 86400:
            raise ValueError("invalid media duration")
        return {"duration": duration,
                "video": any(stream.get("codec_type") == "video" and
                             not stream.get("disposition", {}).get("attached_pic") and
                             stream.get("width", 0) > 0 and stream.get("height", 0) > 0
                             for stream in info.get("streams", [])),
                "audio": any(stream.get("codec_type") == "audio" for stream in info.get("streams", []))}
    except RenderError:
        raise
    except (OSError, ValueError, KeyError, TypeError, StopIteration, subprocess.TimeoutExpired) as exc:
        raise RenderError(f"{path.name}: 元素材を動画・音声として読めません") from exc


def media_info(data_root: Path, asset_id: str, inventory: list[dict]) -> dict:
    """Probe only a registered available media file; never expose its filesystem path."""
    from bai_studio.v05.timeline.arrangement import classify
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
    if kind == "video" and not info["video"]:
        raise RenderError("動画の映像トラックが見つかりません。音声のみの素材は音声として登録してください")
    if kind in {"audio", "music"} and not info["audio"]:
        raise RenderError("音声トラックが見つかりません。音声素材を確認してください")
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
            if kind == "image":
                formats = " / ".join(ext[1:].upper() for ext in sorted(IMAGE_EXT))
                raise RenderError(f"{clip.get('name', 'Clip')}: この画像形式または登録元はMP4書き出しへ未対応です。対応形式: {formats}")
            if kind == "video":
                formats = " / ".join(ext[1:].upper() for ext in sorted(VIDEO_EXT))
                raise RenderError(f"{clip.get('name', 'Clip')}: この動画形式または登録元はMP4書き出しへ未対応です。対応形式: {formats}")
            raise RenderError(f"{clip.get('name', 'Clip')}: この形式または登録元はMP4出力へ未接続です")
        has_audio = False
        if kind in {"video", "audio"}:
            info = _media_info(ffprobe, path)
            if kind == "video" and not info["video"]:
                raise RenderError(f"{clip.get('name', 'Clip')}: 動画の映像トラックが見つかりません。音声のみの素材は音声として登録してください")
            if info["duration"] + 0.02 < clip.get("source_start", 0) + clip["duration"]:
                raise RenderError(f"{clip.get('name', 'Clip')}: 配置時間が元素材より長いため出力できません")
            has_audio = info["audio"]
            if kind == "audio" and not has_audio:
                raise RenderError(f"{clip.get('name', 'Clip')}: 音声トラックが見つかりません")
        resolved.append({"clip": dict(clip), "kind": kind, "path": path,
                         "has_audio": has_audio,
                         "asset_id": clip["asset_id"], "bytes": path.stat().st_size,
                         "registered_sha256": entry.get("sha256")})
    resolved.sort(key=lambda item: (item["clip"].get("lane", 1), item["clip"]["start"], item["clip"]["id"]))
    return render_range, resolved


def _scene_snapshot(data_root: Path, project_id: str, scene_revision: int,
                    arrangement_revision: int, inventory: list[dict]) -> tuple[set[str], list[dict]]:
    from bai_studio.v05.timeline.scene_instances import read as read_scene
    from bai_studio.v05.motion.multi_motion import plan as motion_plan
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


def _audio_settings(data_root: Path, project_id: str) -> dict:
    from bai_studio.v05.timeline.track_layout import get as get_layout
    from bai_studio.v05.timeline.arrangement import TRACKS
    try:
        layout = get_layout(data_root / "studio_v05_track_layouts",
                            data_root / "studio_v05_catalog.json", project_id)
        muted = layout.get("muted", [])
        if (not isinstance(muted, list) or any(type(t) is not str or t not in TRACKS for t in muted)
                or len(set(muted)) != len(muted)):
            raise ValueError("Invalid muted tracks")
        return {"layout_revision": layout["revision"],
                "muted_tracks": sorted(set(muted) & {"audio", "music", "video"})}
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise RenderError("保存済みの音声ミュート設定を読めません。再読込して確認してください") from exc


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
            # Keep the frame held across source_start. Trimming VFR first drops
            # it and rebases the next frame (possibly hundreds of ms later) to
            # zero. Shift the original clock, then sample at the output grid.
            # A microsecond timebase avoids quantizing the cut to the input FPS;
            # rounding up keeps a future source frame from appearing early.
            graph.append(f"[{idx}:v]settb=AVTB,setpts=PTS-{_num(source_start)}/TB,"
                         f"fps={_num(fps)}:start_time=0:round=up,trim=duration={_num(length)},"
                         f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                         f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0,"
                         # fps resets the timebase. Restore microseconds before
                         # adding the saved start, or 1s at 29.97fps floors to 29F.
                         f"format=yuva420p,settb=AVTB,setpts=PTS+{_num(cstart)}/TB[{label}]")
            next_base = f"overlay{order}"
            graph.append(f"[{base}][{label}]overlay=0:0:eof_action=pass:shortest=0:"
                         f"enable='gte(t,{_num(cstart)})*lt(t,{_num(cend)})'[{next_base}]")
            base = next_base
        if item["kind"] in {"audio", "video"} and item.get("has_audio"):
            label = f"audio{order}"
            delay = round(cstart * 1000)
            # Match the preview's unity-gain media elements. Muting an input
            # must not change the gain of the other clips.
            mute = "volume=0," if item.get("audio_muted") else ""
            # Standalone audio starts at its first playable sample, as in the
            # browser. Vorbis can have a nonzero initial decoded timestamp.
            # Video audio retains its original clock relative to the picture.
            clock = "asetpts=PTS-STARTPTS," if item["kind"] == "audio" else ""
            audio.append(f"[{idx}:a]{clock}atrim=start={_num(source_start)}:duration={_num(length)},asetpts=PTS-STARTPTS,"
                         f"aresample=48000,aformat=channel_layouts=stereo,{mute}adelay={delay}|{delay}[{label}]")
            audio_labels.append(label)
    # Older overlay/fps pipelines end at the last frame's PTS, rather than its
    # full display interval. A guard frame lets fps retain that final frame;
    # the exact frame trim removes the guard before delivery.
    graph.append(f"[{base}]tpad=stop_mode=clone:stop=1,fps={_num(fps)},"
                 f"trim=start_frame={start_frame}:end_frame={end_exclusive},"
                 f"setpts=PTS-STARTPTS[{'vflat' if scene_input_index is not None else 'vout'}]")
    if scene_input_index is not None:
        graph.append(f"[{scene_input_index}:v]format=rgba,settb=AVTB,setpts=N/({_num(fps)}*TB)[vscene]")
        graph.append("[vflat][vscene]overlay=0:0:shortest=1:format=auto[vout]")
    if len(audio_labels) > 1:
        audio.append("".join(f"[{label}]" for label in audio_labels) +
                     f"amix=inputs={len(audio_labels)}:duration=longest:dropout_transition=0:normalize=0[amixed]")
        source = "amixed"
    else:
        source = "asilence"
    audio.append(f"[{source}]atrim=start={_num(start_seconds)}:end={_num(end_seconds)},asetpts=PTS-STARTPTS[aout]")
    return ";".join(graph + audio), end_exclusive - start_frame, duration


def _verify(ffprobe: str, path: Path, frames: int, duration: float, width: int, height: int, fps: float,
            process_scope: RenderProcessScope | None = None) -> dict:
    run = process_scope.run if process_scope is not None else _run
    result = run([ffprobe, "-v", "error", "-count_frames", "-show_entries",
                   "stream=codec_name,codec_type,width,height,nb_read_frames,duration:format=duration",
                   "-of", "json", str(path)], max(60, min(1200, duration * 2)))
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
        raise RenderError(f"完成MP4のフレーム数または長さが要求と違います。"
                          f"実際 {actual_frames}F/{_num(actual_duration)}秒、要求 {frames}F/{_num(duration)}秒")
    return {"video_codec": "h264", "audio_codec": "aac", "frames": actual_frames,
            "duration_seconds": actual_duration, "width": width, "height": height}


def _check_scene_capacity(size: int) -> None:
    if size > MAX_SCENE_BYTES:
        raise RenderError("3D可逆動画の作業領域が2GiBを超えました")


def _worker(root: Path, job: dict, clips: list[dict], ffmpeg: str, ffprobe: str,
            scene_inputs: list[dict] | None = None, server_port: int | None = None,
            filter_complex_option: str = "-/filter_complex") -> None:
    job_id = job["id"]
    temp = root / "files" / f"{job_id}.part.mp4"
    final = root / "files" / f"{job_id}.mp4"
    progress = root / "jobs" / f"{job_id}.progress"
    log = root / "jobs" / f"{job_id}.log"
    frames_dir = root / "jobs" / f"{job_id}.frames"
    process_scope = None
    try:
        process_scope = RenderProcessScope()
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
            script_path = Path(__file__).resolve().parents[3] / "tools" / "render_v05_scene_frames.cjs"
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
            frames_dir.mkdir(parents=True, exist_ok=False)
            scene_video = frames_dir / "scene.mkv"
            # Both children belong to this worker. Kill and reap both on timeout,
            # encoding error, or capture failure; never leave an orphan encoder.
            capture_log = root / "jobs" / f"{job_id}.capture.log"
            encode_log = root / "jobs" / f"{job_id}.scene-encode.log"
            encoder = capture = None
            try:
                with capture_log.open("w", encoding="utf-8") as cerr, encode_log.open("w", encoding="utf-8") as eerr:
                    encoder = process_scope.spawn([ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error",
                        "-f", "image2pipe", "-framerate", _num(fps), "-c:v", "png", "-i", "pipe:0",
                        "-an", "-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgra", "-threads", "2",
                        "-f", "matroska", "-n", str(scene_video)], stdin=subprocess.PIPE,
                        stdout=subprocess.DEVNULL, stderr=eerr,
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))

                    capture = process_scope.spawn([node, str(script_path), str(config_path)],
                        stdin=subprocess.DEVNULL, stdout=encoder.stdin, stderr=cerr,
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                    encoder.stdin.close()
                    deadline = time.monotonic() + max(180, min(3600, job["frame_count"] * 2))
                    while capture.poll() is None:
                        if time.monotonic() > deadline:
                            raise RenderError("3D実描画が制限時間を超えました")
                        if scene_video.exists():
                            _check_scene_capacity(scene_video.stat().st_size)
                        if encoder.poll() is not None:
                            raise RenderError("3D可逆動画のエンコードが途中で停止しました")
                        time.sleep(0.2)
                    if capture.returncode:
                        raise RenderError("3D実描画に失敗: " + capture_log.read_text(encoding="utf-8")[-900:])
                    encoder.wait(timeout=60)
                    if encoder.returncode:
                        raise RenderError("3D可逆動画に失敗: " + encode_log.read_text(encoding="utf-8")[-900:])
                    _check_scene_capacity(scene_video.stat().st_size)
            finally:
                try:
                    if capture is not None:
                        _stop_capture(capture)
                finally:
                    for child in (capture, encoder):
                        if child is not None:
                            if child.stdin is not None and not child.stdin.closed:
                                child.stdin.close()
                            if child.poll() is None:
                                child.kill()
                            child.wait()
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("frame_count") != job["frame_count"] or len(manifest.get("frame_sha256", [])) != job["frame_count"]:
                raise RenderError("3D連番が保存範囲と一致しません")
            if type(manifest.get("motion_edits_revision")) is not int or manifest["motion_edits_revision"] < 0:
                raise RenderError("FK補正revisionを検証できません")
            probe = process_scope.run([ffprobe, "-v", "error", "-count_frames", "-select_streams", "v:0",
                          "-show_entries", "stream=codec_name,pix_fmt,nb_read_frames,width,height", "-of", "json", str(scene_video)],
                          max(120, min(1200, job["frame_count"] / fps * 2)))
            if probe.returncode:
                raise RenderError("3D可逆動画を再読込できません")
            stream = json.loads(probe.stdout)["streams"][0]
            if (stream.get("codec_name") != "ffv1" or stream.get("pix_fmt") != "bgra" or
                    int(stream.get("nb_read_frames", 0)) != job["frame_count"] or
                    stream.get("width") != width or stream.get("height") != height):
                raise RenderError("3D可逆動画のフレーム数・透過形式が一致しません")
            job["scene_capture"] = {"frames": job["frame_count"], "renderer": manifest.get("renderer"),
                                    "motion_clips": manifest.get("motion_clips"),
                                    "motion_edits_revision": manifest["motion_edits_revision"],
                                    "pose_sample": manifest.get("pose_sample"),
                                    "manifest_sha256": _sha(manifest_path),
                                    "intermediate_sha256": _sha(scene_video), "intermediate_bytes": scene_video.stat().st_size,
                                    "storage": "ffv1_bgra_stream"}
            scene_index = 2 + len(clips)
            job["phase"] = "encoding"
            _save(root, job)
        graph, frames, duration = _graph(clips, fps, width, height,
                                         job["range_start_frame"], job["range_end_exclusive"], scene_index)
        script = root / "jobs" / f"{job_id}.filter"
        script.write_text(graph, encoding="utf-8")
        full_duration = _num(job["range_end_exclusive"] / fps)
        # The graph trims against source PTS. In particular, older FFmpeg
        # shifts WebM's negative Opus preroll start into positive video/audio
        # timestamps unless copyts is explicit (7ms in the long WebM case).
        # Keep source clocks here; the graph sets the final output origin.
        cmd = [ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-nostats", "-copyts",
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
            cmd += ["-i", str(scene_video)]
        cmd += [filter_complex_option, str(script), "-map", "[vout]", "-map", "[aout]",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", str(job.get("audio_bitrate", AAC_BITRATE)), "-movflags", "+faststart",
                "-frames:v", str(frames), "-t", _num(duration), "-f", "mp4", "-n", str(temp)]
        job["phase"] = "encoding"
        _save(root, job)
        with log.open("w", encoding="utf-8") as err:
            process = process_scope.spawn(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                       stderr=err, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            deadline = time.monotonic() + max(120, min(3600, duration * 12))
            last_progress = -1
            while process.poll() is None:
                if time.monotonic() > deadline:
                    process.kill()
                    process.wait()
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
        info = _verify(ffprobe, temp, frames, duration, width, height, fps, process_scope)
        digest = _sha(temp)
        job["pending_output"] = {"bytes": temp.stat().st_size, "sha256": digest, "probe": info}
        _save(root, job)
        if job.get("delivery_plan"):
            from bai_studio.v05.render.render_names import finalize
            finalize(root, job["project_id"], job["delivery_plan"], job_id, temp, final)
        else:
            if final.exists():
                raise RenderError("同名完成物が既にあります。原本を保持します")
            os.replace(temp, final)
        job.update(status="succeeded", progress_percent=100, completed_at=time.time(),
                   bytes=final.stat().st_size, sha256=digest, probe=info, error=None)
        job.pop("pending_output", None)
    except Exception as exc:
        job.update(status="failed", completed_at=time.time(), error=str(exc)[:1200])
        job.pop("pending_output", None)
    finally:
        if process_scope is not None:
            process_scope.close()
        job["temporary_cleanup"] = "complete" if _cleanup_temporary(root, job_id) else "pending"
        try: _save(root, job)
        finally:
            with LOCK: ACTIVE.discard(job_id)


def start(data_root: Path, project_id: str, range_revision: int, arrangement_revision: int,
          resolution: str, inventory: list[dict], scene_revision: int | None = None,
          server_port: int | None = None, name: str | None = None,
          collision_mode: str = "version", replace_job_id: str | None = None) -> dict:
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
        from bai_studio.v05.timeline.scene_instances import read as read_scene
        scene = read_scene(data_root / "studio_v05_scene_instances", data_root / "studio_v05_scene_models",
                           data_root / "studio_v05_catalog.json", project_id, inventory)
        if any(row["visible"] for row in scene["instances"]):
            raise RenderError("保存済み3Dシーンがあります。scene_revisionを指定し、3Dを含めて書き出してください")
    render_range, clips = _snapshot(data_root, project_id, range_revision,
                                    arrangement_revision, resolution, inventory, ffprobe, motion_ids)
    audio_settings = _audio_settings(data_root, project_id)
    # Job-local copies freeze the saved state. Later track changes affect the next job.
    clips = [{**item, "audio_muted": item["clip"]["track"] in audio_settings["muted_tracks"]}
             for item in clips]
    if scene_inputs is not None and render_range["frame_count"] > MAX_SCENE_FRAMES:
        raise RenderError(f"3Dを含む限定MP4は現在{MAX_SCENE_FRAMES}フレーム以内です")
    delivery_plan = None
    if name is not None:
        from bai_studio.v05.render.render_names import plan, NameError
        try:
            delivery_plan = plan(root, project_id, name, collision_mode, replace_job_id)
        except NameError as exc:
            raise RenderError(str(exc), exc.status) from exc
    elif collision_mode != "version" or replace_job_id is not None:
        raise RenderError("完成物の名前が必要です", 400)
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
               "audio_settings": audio_settings,
               "audio_bitrate": AAC_BITRATE,
               "range_start_frame": render_range["range_start_frame"],
               "range_end_exclusive": render_range["range_end_exclusive"],
               "frame_count": render_range["frame_count"], "fps": render_range["fps"],
               "resolution": resolution, "preset": "mp4_h264_aac", "inputs": [],
               "download_name": delivery_plan["download_name"] if delivery_plan else None,
               "delivery_plan": delivery_plan,
               "scene_revision": scene_revision, "phase": "queued",
               "progress_percent": 0, "error": None, "bytes": None, "sha256": None,
               "probe": None}
        _save(root, job)
        ACTIVE.add(job_id)
        thread = threading.Thread(target=_worker,
                                  args=(root, job, clips, ffmpeg, ffprobe, scene_inputs, server_port,
                                        caps["filter_complex_option"]), daemon=True)
        thread.start()
    return _public(job)
