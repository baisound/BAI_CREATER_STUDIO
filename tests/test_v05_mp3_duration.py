"""MP3 playable source windows must agree across FFmpeg demuxer versions."""
import json
import shutil
import subprocess
from types import SimpleNamespace

import pytest

from bai_studio.v05.render import media_render as render


@pytest.mark.parametrize("container_duration", [3.056327, 3.017007])
def test_legacy_and_current_metadata_use_decoded_samples(monkeypatch, tmp_path, container_duration):
    calls = []
    def run(args, timeout):
        calls.append(args)
        if "frame=nb_samples" in args:
            return SimpleNamespace(returncode=0, stdout="47\n" + "1152\n" * 115 + "523\n", stderr="")
        return SimpleNamespace(returncode=0, stdout=json.dumps({"format": {"duration": container_duration},
            "streams": [{"codec_type": "audio", "sample_rate": "44100"}]}), stderr="")
    monkeypatch.setattr(render, "_run", run)
    info = render._media_info("ffprobe", tmp_path / "source.MP3")
    assert info["duration"] == pytest.approx(133050 / 44100)
    assert info["audio"] is True and len(calls) == 2


@pytest.mark.parametrize("samples,code,error", [("", 0, ""), ("0\n", 0, ""),
    ("1153\n", 0, ""), ("unknown\n", 0, ""), ("1152\n", 1, "decode failed"),
    ("1152\n", 0, "corrupt MP3 packet")])
def test_decode_failure_cannot_fall_back_to_container_duration(monkeypatch, tmp_path, samples, code, error):
    def run(args, timeout):
        if "frame=nb_samples" in args:
            return SimpleNamespace(returncode=code, stdout=samples, stderr=error)
        return SimpleNamespace(returncode=0, stdout=json.dumps({"format": {"duration": "3.056327"},
            "streams": [{"codec_type": "audio", "sample_rate": "44100"}]}), stderr="")
    monkeypatch.setattr(render, "_run", run)
    with pytest.raises(render.RenderError, match="元素材"):
        render._media_info("ffprobe", tmp_path / "broken.mp3")


def test_decode_timeout_is_an_explicit_failure(monkeypatch, tmp_path):
    def run(args, timeout):
        if "frame=nb_samples" in args:
            raise subprocess.TimeoutExpired(args, timeout)
        return SimpleNamespace(returncode=0, stdout=json.dumps({"format": {"duration": "3.056327"},
            "streams": [{"codec_type": "audio", "sample_rate": "44100"}]}), stderr="")
    monkeypatch.setattr(render, "_run", run)
    with pytest.raises(render.RenderError): render._media_info("ffprobe", tmp_path / "slow.mp3")


@pytest.mark.parametrize("suffix", [".wav", ".mp4"])
def test_non_mp3_still_uses_container_clock(monkeypatch, tmp_path, suffix):
    calls = []
    def run(args, timeout):
        calls.append(args)
        return SimpleNamespace(returncode=0, stdout=json.dumps({"format": {"duration": "4.25"},
            "streams": [{"codec_type": "audio"}]}), stderr="")
    monkeypatch.setattr(render, "_run", run)
    assert render._media_info("ffprobe", tmp_path / ("unchanged" + suffix))["duration"] == 4.25
    assert len(calls) == 1


@pytest.mark.parametrize("rate", [8000, 44100, 48000])
def test_real_mp3_duration_equals_independent_pcm_byte_count(tmp_path, rate):
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe: pytest.skip("FFmpeg and ffprobe are required")
    file = tmp_path / "実尺 空白.mp3"
    subprocess.run([ffmpeg, "-v", "error", "-f", "lavfi", "-i",
        f"sine=frequency=440:sample_rate={rate}:duration=3.017", "-c:a", "libmp3lame", str(file)], check=True)
    raw = subprocess.check_output([ffmpeg, "-v", "error", "-i", str(file), "-ac", "1", "-f", "s16le", "pipe:1"])
    actual = render._media_info(ffprobe, file)
    assert actual["duration"] == pytest.approx(len(raw) / 2 / rate, abs=1 / rate)
