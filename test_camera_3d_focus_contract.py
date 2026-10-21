"""Static integration contract for camera 3D and focus diagnostic beta."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def test_camera_asset_ui_and_renderer():
    html=(ROOT/'camera.html').read_text(encoding='utf-8')
    js=(ROOT/'camera_3d.js').read_text(encoding='utf-8')
    for name in ('camera-asset','camera-load-asset','camera-clip'):
        assert f'id="{name}"' in html
    assert "fetch('/api/assets')" in js
    assert 'await loadModel(item,await loadLibs())' in js
    assert "new THREE.WebGLRenderer" in js
    assert 'views[0].renderer?.render(world,sceneCam)' in js
    assert 'views[1].renderer?.render(world,activeFilmingCamera)' in js

def test_synchronous_animation_sampling_and_focus():
    main=(ROOT/'camera.js').read_text(encoding='utf-8')
    module=(ROOT/'camera_3d.js').read_text(encoding='utf-8')
    for event in ('bai-camera-frame','bai-camera-pose'):
        assert event in main and event in module
    assert 'mixer.setTime(' in module
    assert 'function drawFocusDiagnostic()' in main
    assert 'id="focus-enabled"' in (ROOT/'camera.html').read_text(encoding='utf-8')
