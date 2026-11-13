import json
from pathlib import Path
import pytest
from bai_studio.v05.timeline import blender_addons as a,cinema_scene_cache as cache
from tests.test_blender_addons import fixture


def test_evaluated_prepare_records_dependencies_and_never_exposes_failed_session(tmp_path,monkeypatch):
    pid,addon,scene,arranged,path,assets=fixture(tmp_path,monkeypatch)
    scene['instances'][0]['asset']['format']='PMX'
    from bai_studio.v05.render import media_render
    monkeypatch.setattr(media_render,'_scene_snapshot',lambda *args:(set(),[{'path':path}]))
    before=path.read_bytes()
    def capture(folder,port):
        assert port==8925
        assert json.loads((folder/'manifest.json').read_text())['capture_mode']=='evaluated'
        return {'meshes':[{}]}
    monkeypatch.setattr(cache,'capture',capture)
    session=a.prepare(tmp_path,pid,addon['id'],9,38,assets,'mock',server_port=8925)
    assert session['capture_mode']=='evaluated' and session['dependencies']['files'][0]['file']=='model.glb'
    assert path.read_bytes()==before
    assert a.check_origin(tmp_path,{'session_id':session['id'],'manifest_sha256':session['manifest_sha256']},assets)['id']==session['id']
    # New per-project settings must invalidate an old copy, even when scene revisions did not change.
    settings=tmp_path/'studio_v05_lip_adoptions';settings.mkdir();(settings/(pid+'.json')).write_text('{}')
    with pytest.raises(a.AddonError,match='変わりました'):a.check_origin(tmp_path,{'session_id':session['id'],'manifest_sha256':session['manifest_sha256']},assets)
    monkeypatch.setattr(cache,'capture',lambda *args:a.fail('scene_capture_failed','failure'))
    with pytest.raises(a.AddonError):a.prepare(tmp_path,pid,addon['id'],9,38,assets,'mock',server_port=8925)
    assert len(a.sessions(tmp_path,pid))==1


def test_dependency_hashes_cover_source_texture_and_project_modes(tmp_path,monkeypatch):
    monkeypatch.setattr(cache,'evaluator_hash',lambda:'evaluator-v1')
    pid='project';model=tmp_path/'model.pmx';model.write_bytes(b'pmx')
    texture=tmp_path/'tex.png';texture.write_bytes(b'png')
    state=tmp_path/'studio_v05_motion_edits';state.mkdir();file=state/(pid+'.json');file.write_text('{"fk_ik_modes":{}}')
    inputs=[{'path':model},{'path':texture}];before=cache.dependencies(tmp_path,pid,inputs)
    assert len(before['files'])==3
    texture.write_bytes(b'different');assert cache.dependencies(tmp_path,pid,inputs)!=before
    texture.write_bytes(b'png');file.write_text('{"fk_ik_modes":{"left":"ik"}}');assert cache.dependencies(tmp_path,pid,inputs)!=before
    file.write_text('{"fk_ik_modes":{}}');monkeypatch.setattr(cache,'evaluator_hash',lambda:'evaluator-v2');assert cache.dependencies(tmp_path,pid,inputs)!=before


def test_capture_requires_local_runtime_without_running_node(tmp_path):
    with pytest.raises(a.AddonError,match='ローカル'):cache.capture(tmp_path,None)
