"""Revision-guarded, non-overwriting MP4 jobs for saved v0.5 2D media clips.

Only registered image, video and separate audio clips are accepted. 3D, camera,
effects and embedded video audio are not silently omitted from a claimed render.
"""
from __future__ import annotations

import hashlib
import json
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
            return dict(_CAP_CACHE)
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
              "resolutions": sorted(RESOLUTIONS), "max_duration_seconds": MAX_SECONDS}
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


def _snapshot(data_root: Path, project_id: str, range_revision: int, arrangement_revision: int,
              resolution: str, inventory: list[dict], ffprobe: str) -> tuple[dict, list[dict]]:
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
            if info["duration"] + 0.02 < clip["duration"]:
                raise RenderError(f"{clip.get('name', 'Clip')}: 配置時間が元素材より長いため出力できません")
            if kind == "video" and info["audio"]:
                raise RenderError(f"{clip.get('name', 'Clip')}: 動画内音声はこのMP4プリセットへ未接続です。欠落を避けるため出力を停止します")
        resolved.append({"clip": dict(clip), "kind": kind, "path": path,
                         "asset_id": clip["asset_id"], "bytes": path.stat().st_size,
                         "registered_sha256": entry.get("sha256")})
    resolved.sort(key=lambda item: (item["clip"].get("lane", 1), item["clip"]["start"], item["clip"]["id"]))
    return render_range, resolved


def _num(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".") or "0"


def _graph(clips: list[dict], fps: float, width: int, height: int,
           start_frame: int, end_exclusive: int) -> tuple[str, int, float]:
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
        if item["kind"] in {"image", "video"}:
            label = f"visual{order}"
            graph.append(f"[{idx}:v]trim=start=0:duration={_num(length)},setpts=PTS-STARTPTS,fps={_num(fps)},"
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
            audio.append(f"[{idx}:a]atrim=start=0:duration={_num(length)},asetpts=PTS-STARTPTS,"
                         f"aresample=48000,aformat=channel_layouts=stereo,adelay={delay}|{delay}[{label}]")
            audio_labels.append(label)
    graph.append(f"[{base}]trim=start={_num(start_seconds)}:end={_num(end_seconds)},"
                 f"setpts=PTS-STARTPTS,fps={_num(fps)}[vout]")
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


def _worker(root: Path, job: dict, clips: list[dict], ffmpeg: str, ffprobe: str) -> None:
    job_id = job["id"]
    temp = root / "files" / f"{job_id}.part.mp4"
    final = root / "files" / f"{job_id}.mp4"
    progress = root / "jobs" / f"{job_id}.progress"
    log = root / "jobs" / f"{job_id}.log"
    try:
        job["status"] = "running"
        job["started_at"] = time.time()
        _save(root, job)
        for item in clips:
            item["sha256"] = _sha(item["path"])
            if item["registered_sha256"] and item["sha256"] != item["registered_sha256"]:
                raise RenderError("登録済み原素材のhashと実ファイルが一致しません。出力を停止します")
        job["inputs"] = [{"asset_id": item["asset_id"], "bytes": item["bytes"],
                          "sha256": item["sha256"], "clip_id": item["clip"]["id"]} for item in clips]
        _save(root, job)
        width, height = RESOLUTIONS[job["resolution"]]
        fps = job["fps"]
        graph, frames, duration = _graph(clips, fps, width, height,
                                         job["range_start_frame"], job["range_end_exclusive"])
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
        for item in clips:
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
        try: _save(root, job)
        finally:
            with LOCK: ACTIVE.discard(job_id)


def start(data_root: Path, project_id: str, range_revision: int, arrangement_revision: int,
          resolution: str, inventory: list[dict]) -> dict:
    root = data_root / "studio_v05_media_renders"
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    caps = capabilities(ffmpeg, ffprobe, root / "probe")
    if not caps["available"]:
        raise RenderError(caps["reason"], 503)
    render_range, clips = _snapshot(data_root, project_id, range_revision,
                                    arrangement_revision, resolution, inventory, ffprobe)
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
               "progress_percent": 0, "error": None, "bytes": None, "sha256": None,
               "probe": None}
        _save(root, job)
        ACTIVE.add(job_id)
        thread = threading.Thread(target=_worker, args=(root, job, clips, ffmpeg, ffprobe), daemon=True)
        thread.start()
    return _public(job)
