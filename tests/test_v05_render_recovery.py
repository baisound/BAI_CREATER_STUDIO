import ctypes
import json
import os
import subprocess
import sys
import time
import shutil
import random
from pathlib import Path

import pytest

from bai_studio.v05.render import media_render as render
from bai_studio.v05.render.process_scope import RenderProcessScope


@pytest.mark.parametrize("size", [2 * 1024 ** 3 - 1, 2 * 1024 ** 3])
def test_capacity_inclusive_boundary(size):
    render._check_scene_capacity(size)


def test_capacity_rejects_one_byte_over_boundary():
    with pytest.raises(render.RenderError, match="2GiB"):
        render._check_scene_capacity(2 * 1024 ** 3 + 1)


def test_capacity_failure_stops_real_encoder_and_keeps_old_output(tmp_path, monkeypatch):
    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg
    png = tmp_path / "producer.png"
    real_capacity = os.environ.get("BAI_TEST_REAL_SCENE_CAPACITY") == "1"
    if real_capacity:
        # Deterministic noise makes the real lossless video reach 2GiB in a
        # bounded number of frames, without allocating all frames in memory.
        subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "rawvideo",
                        "-pix_fmt", "rgb24", "-s", "1280x720", "-i", "pipe:0",
                        "-frames:v", "1", str(png)], check=True,
                       input=random.Random(81).randbytes(1280 * 720 * 3),
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    else:
        subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                        "testsrc2=s=1280x720", "-frames:v", "1", str(png)], check=True,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    root = tmp_path / "renders"
    job_id = "f" * 32
    saved_job(root, job_id)
    old = root / "files" / ("a" * 32 + ".mp4")
    old_bytes = (Path(__file__).parent / "fixtures" / "media_preview.mp4").read_bytes()
    old.write_bytes(old_bytes)
    children = []

    class ControlledProducer(RenderProcessScope):
        def spawn(self, args, **kwargs):
            if args[0] == shutil.which("node"):
                code = "import sys,time,pathlib; b=pathlib.Path(sys.argv[1]).read_bytes(); [(sys.stdout.buffer.write(b),sys.stdout.buffer.flush(),time.sleep(0.01)) for _ in range(1000)]"
                args = [sys.executable, "-c", code, str(png)]
            child = super().spawn(args, **kwargs)
            children.append(child)
            return child

    # Ordinary regression uses a small limit; the opt-in stress run uses the
    # production 2GiB limit. The exact numeric boundary is checked above.
    monkeypatch.setattr(render, "RenderProcessScope", ControlledProducer)
    if not real_capacity:
        monkeypatch.setattr(render, "MAX_SCENE_BYTES", 1024)
    observed_sizes = []
    capacity_check = render._check_scene_capacity
    def observe_capacity(size):
        observed_sizes.append(size)
        capacity_check(size)
    monkeypatch.setattr(render, "_check_scene_capacity", observe_capacity)
    job = {"id": job_id, "project_id": "qa", "resolution": "720p", "fps": 60,
           "scene_revision": 0, "arrangement_revision": 0, "range_revision": 0,
           "range_start_frame": 0, "range_end_exclusive": 1000, "frame_count": 1000}
    render._worker(root, job, [], ffmpeg, shutil.which("ffprobe"), [], 12345)
    assert job["status"] == "failed"
    assert "2GiB" in job["error"]
    assert all(child.poll() is not None for child in children)
    assert old.read_bytes() == old_bytes
    assert not (root / "files" / f"{job_id}.part.mp4").exists()
    assert not (root / "jobs" / f"{job_id}.frames").exists()
    assert max(observed_sizes) > render.MAX_SCENE_BYTES
    if real_capacity:
        assert render.MAX_SCENE_BYTES == 2 * 1024 ** 3
        print(json.dumps({"limit_bytes": render.MAX_SCENE_BYTES,
                          "observed_bytes": max(observed_sizes),
                          "stopped_children": len(children), "temporary_cleanup": job["temporary_cleanup"]}))


def saved_job(root, job_id, **extra):
    (root / "jobs").mkdir(parents=True, exist_ok=True)
    (root / "files").mkdir(exist_ok=True)
    value = {"id": job_id, "project_id": "qa", "status": "running", **extra}
    (root / "jobs" / f"{job_id}.json").write_text(json.dumps(value), encoding="utf-8")


def test_restart_only_cleans_owned_temporary_files(tmp_path):
    root = tmp_path / "renders"
    job_id = "a" * 32
    saved_job(root, job_id)
    work = root / "jobs" / f"{job_id}.frames"
    work.mkdir()
    (work / "scene.mkv").write_bytes(b"partial scene")
    (root / "files" / f"{job_id}.part.mp4").write_bytes(b"partial MP4")
    final = root / "files" / f"{job_id}.mp4"
    final.write_bytes(b"unconfirmed final retained")
    old = root / "files" / ("b" * 32 + ".mp4")
    old.write_bytes(b"older completed MP4")
    result = render.status(root, job_id)
    assert result["status"] == "interrupted"
    assert result["temporary_cleanup"] == "complete"
    assert not work.exists()
    assert not (root / "files" / f"{job_id}.part.mp4").exists()
    assert final.read_bytes() == b"unconfirmed final retained"
    assert old.read_bytes() == b"older completed MP4"
    with pytest.raises(render.RenderError, match="Completed MP4 not available"):
        render.output_file(root, job_id)


def test_cleanup_lock_retries_without_promoting_interrupted_job(tmp_path, monkeypatch):
    job_id = "c" * 32
    saved_job(tmp_path, job_id)
    work = tmp_path / "jobs" / f"{job_id}.frames"
    work.mkdir()
    real_remove = render.shutil.rmtree
    def locked(*args, **kwargs):
        raise PermissionError("closing encoder still holds the file")
    monkeypatch.setattr(render.shutil, "rmtree", locked)
    assert render.status(tmp_path, job_id)["temporary_cleanup"] == "pending"
    monkeypatch.setattr(render.shutil, "rmtree", real_remove)
    assert render.status(tmp_path, job_id)["temporary_cleanup"] == "complete"
    assert render.status(tmp_path, job_id)["status"] == "interrupted"


def test_cleanup_rejects_junction_escape(tmp_path):
    root, owner = tmp_path / "renders", tmp_path / "owner-input"
    owner.mkdir()
    protected = owner / "source.bin"
    protected.write_bytes(b"owner original")
    job_id = "d" * 32
    saved_job(root, job_id)
    link = root / "jobs" / f"{job_id}.frames"
    if os.name == "nt":
        r = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(owner)], capture_output=True)
        assert r.returncode == 0, r.stderr
    else:
        link.symlink_to(owner, target_is_directory=True)
    try:
        assert render.status(root, job_id)["temporary_cleanup"] == "pending"
        assert protected.read_bytes() == b"owner original"
    finally:
        if os.name == "nt":
            link.rmdir()  # remove the junction only, never its target
        else:
            link.unlink()


def test_active_job_is_never_recovered(tmp_path):
    job_id = "e" * 32
    saved_job(tmp_path, job_id)
    work = tmp_path / "jobs" / f"{job_id}.frames"
    work.mkdir()
    render.ACTIVE.add(job_id)
    try:
        assert render.status(tmp_path, job_id)["status"] == "running"
        assert work.exists()
    finally:
        render.ACTIVE.discard(job_id)


def test_probe_timeout_stops_owned_process():
    children = []
    class RecordingScope(RenderProcessScope):
        def spawn(self, *args, **kwargs):
            child = super().spawn(*args, **kwargs)
            children.append(child)
            return child
    with RecordingScope() as scope:
        with pytest.raises(subprocess.TimeoutExpired):
            scope.run([sys.executable, "-c", "import time; time.sleep(120)"], 0.2)
    assert len(children) == 1
    assert children[0].poll() is not None


@pytest.mark.skipif(os.name != "nt", reason="Windows kill-on-owner-exit contract")
def test_forced_owner_exit_stops_owned_descendants(tmp_path):
    marker = tmp_path / "descendant.pid"
    script = """
import subprocess,sys,time,pathlib
from bai_studio.v05.render.process_scope import RenderProcessScope
with RenderProcessScope() as scope:
    code = "import subprocess,sys,time,pathlib; p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(120)']); pathlib.Path(sys.argv[1]).write_text(str(p.pid));time.sleep(120)"
    child = scope.spawn([sys.executable,'-c',code,sys.argv[1]])
    pathlib.Path(sys.argv[1]+'.root').write_text(str(child.pid))
    time.sleep(120)
"""
    owner = subprocess.Popen([sys.executable, "-c", script, str(marker)], creationflags=subprocess.CREATE_NO_WINDOW)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    handles = []
    try:
        deadline = time.monotonic() + 10
        while (not marker.exists() or not Path(str(marker) + ".root").exists()) and time.monotonic() < deadline:
            assert owner.poll() is None
            time.sleep(0.05)
        for file in [marker, Path(str(marker) + ".root")]:
            pid = int(file.read_text())
            handle = kernel.OpenProcess(0x100000, False, pid)
            assert handle
            handles.append(handle)
        owner.kill()  # no Python finally executes in the owner
        owner.wait()
        assert all(kernel.WaitForSingleObject(handle, 5000) == 0 for handle in handles)
    finally:
        if owner.poll() is None:
            owner.kill()
        owner.wait()
        for handle in handles:
            kernel.CloseHandle(handle)
