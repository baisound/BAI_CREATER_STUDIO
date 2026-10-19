from pathlib import Path

def test_gizmo_connection():
    scene=Path('camera_3d.js').read_text()
    editor=Path('camera.js').read_text()
    for key in ('bai-camera-rail-handle-preview','bai-camera-rail-handle-end'):
        assert key in scene and key in editor
    assert 'installRailDrag(canvas())' in scene
    assert 'if(d.commit)saveRigEdit();else restoreRig()' in editor
    assert 'railHandles.visible=false;' in scene
    assert 'views[1].renderer?.render(world,activeFilmingCamera)' in scene
    assert 'railHandles.visible=Boolean(railPath)' in scene
    assert 'd.current' in scene
