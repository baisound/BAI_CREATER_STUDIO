"""Static regression tests for Phase E camera workspace wiring."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def test_two_distinct_canvases():
    html=(ROOT/'camera.html').read_text()
    assert 'id="scene"' in html and 'id="preview"' in html
    assert 'id="auto-key"' in html
    assert 'id="duration"' in html and 'id="frame-number"' in html

def test_scene_not_written_into_camera_keys():
    js=(ROOT/'camera.js').read_text()
    assert 'function drawScene()' in js
    assert 'sceneYaw' in js and 'scenePitch' in js
    assert "$('scene').addEventListener('pointermove'" in js
    assert 'function commitPose(p)' in js and "$('auto-key').checked" in js
    assert 'function checkpoint()' in js
