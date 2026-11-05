"""Real FFmpeg regression for saved frame ranges at non-integer FPS."""
import shutil
from pathlib import Path

import pytest

from bai_studio.v05.render import media_render as render


@pytest.mark.parametrize("fps,start,end", [(29.97, 15, 30), (29.97, 15, 16),
                                          (29.97, 1234, 1249), (24, 12, 27), (60, 30, 45)])
@pytest.mark.parametrize("with_layers", [False, True])
def test_saved_range_keeps_exact_video_frame_count(tmp_path, fps, start, end, with_layers):
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        pytest.skip("Real FFmpeg/ffprobe are required")
    caps = render.capabilities(ffmpeg, ffprobe, tmp_path / "probe")
    assert caps["available"], caps["reason"]
    folder = tmp_path / "時刻範囲 空白"
    folder.mkdir()
    script, output = folder / "graph.filter", folder / "completed.mp4"
    clips, inputs = [], []
    if with_layers:
        image = Path(__file__).parents[1] / "studio/assets/samples/viewport-shrine.webp"
        video = Path(__file__).parent / "fixtures/media_preview.mp4"
        clips = [{"kind": "image", "clip": {"start": 0, "duration": end / fps + 1}},
                 {"kind": "video", "has_audio": False,
                  "clip": {"start": 0.37, "duration": 1.5, "source_start": 0.1}}]
        inputs = ["-loop", "1", "-framerate", str(fps), "-t", str(end / fps + 1),
                  "-i", str(image), "-i", str(video)]
    graph, frames, duration = render._graph(clips, fps, 16, 16, start, end)
    script.write_text(graph, encoding="utf-8")
    result = render._run([ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error",
                          "-f", "lavfi", "-i", f"color=c=black:s=16x16:r={fps}:d={render._num(end / fps)}",
                          "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo:d={render._num(end / fps)}",
                          *inputs,
                          caps["filter_complex_option"], str(script), "-map", "[vout]", "-map", "[aout]",
                          "-frames:v", str(frames), "-t", render._num(duration),
                          "-c:v", "libx264", "-c:a", "aac", "-y", str(output)], 30)
    assert result.returncode == 0, result.stderr
    info = render._verify(ffprobe, output, frames, duration, 16, 16, fps)
    assert info["frames"] == end - start
