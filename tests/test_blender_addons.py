import copy
import io
import json
import struct
import uuid
import zipfile
from pathlib import Path
import pytest
from bai_studio.v05.timeline import blender_addons as a,blender_camera as camera
from tests.helpers.blender_camera_data import track


def package(extra=(),module='cinema_operator'):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:
        z.writestr(module+'/__init__.py',"bl_info={'name':'Unit addon','version':(0,7,183),'blender':(5,1,0)}\nraise RuntimeError('must not execute during registration')")
        for name,raw in extra:z.writestr(name,raw)
    return out.getvalue()


def test_static_registration_selection_and_soft_remove(tmp_path):
    raw=package(module='other_addon');out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:z.writestr('distribution/install.zip',raw)
    info=a.describe(out.getvalue());assert info['distribution'] and not info['choices'][0]['supported']
    with pytest.raises(a.AddonError):a.register(tmp_path,out.getvalue(),'wrong.zip')
    saved=a.register(tmp_path,out.getvalue(),'distribution/install.zip')
    assert saved['id']==a.digest(raw) and len(a.listing(tmp_path))==1
    assert a.register(tmp_path,raw,'')['id']==saved['id']
    with pytest.raises(a.AddonError,match='未対応'):a.prepare(tmp_path,str(uuid.uuid4()),saved['id'],0,59,[],'no-blender')
    assert a.remove(tmp_path,saved['id'])['files_retained'];assert not a.listing(tmp_path)
    assert (a.root(tmp_path)/saved['id']/'addon.zip').read_bytes()==raw


@pytest.mark.parametrize('name',['../escape.py','/absolute.py','C:/bad.py','foo\\bad.py','foo/../bad.py','CON.py','foo/name.','foo/name ','foo//name.py','cinema_operator/__INIT__.PY','foo/./name.py'])
def test_reject_unsafe_zip_before_saving(tmp_path,name):
    raw=package([(name,b'bad')])
    # ZipInfo normalizes the Windows separator; put it back in both ZIP headers.
    if '\\' in name:raw=raw.replace(name.replace('\\','/').encode(),name.encode())
    with pytest.raises(a.AddonError):a.register(tmp_path,raw,'')
    assert not a.root(tmp_path).exists()


def test_symlink_bomb_and_nested_archives(tmp_path):
    broken=package().replace(b'RuntimeError',b'RuntimeErroX')
    with pytest.raises(a.AddonError):a.describe(broken)
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:
        f=zipfile.ZipInfo('link');f.create_system=3;f.external_attr=0o120777<<16;z.writestr(f,'target')
    with pytest.raises(a.AddonError):a.describe(out.getvalue())
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('huge',b'0'*2_000_000)
    with pytest.raises(a.AddonError):a.describe(out.getvalue())
    raw=package()
    for _ in range(3):
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:z.writestr('nested.zip',raw)
        raw=out.getvalue()
    with pytest.raises(a.AddonError):a.describe(raw)


def fixture(tmp_path,monkeypatch):
    raw=package();monkeypatch.setattr(a,'KNOWN',a.digest(raw));addon=a.register(tmp_path,raw,'')
    pid=str(uuid.uuid4());(tmp_path/'studio_v05_catalog.json').write_text(json.dumps({'schema':1,'projects':[{'id':pid,'name':'unit','fps':60}]}))
    asset={'id':'unit-model','name':'generated GLB','format':'GLB','available':True}
    row={'id':'instance','asset_id':asset['id'],'asset':asset,'visible':True,'transform':{'position':[0,0,0],'rotation':[0,0,0],'scale':[1,1,1]},'timeline_windows':[{'start':.25,'duration':.5}]}
    scene={'revision':0,'instances':[row],'camera':None,'face_keys':[]};arranged={'revision':0,'clips':[]}
    monkeypatch.setattr(a,'context',lambda *args:(scene,arranged))
    path=tmp_path/'model.glb';body=json.dumps({'asset':{'version':'2.0'}}).encode();path.write_bytes(b'glTF'+struct.pack('<II',2,len(body)+20)+struct.pack('<II',len(body),0x4e4f534a)+body)
    from bai_studio.v05.render import media_render
    monkeypatch.setattr(media_render,'_source',lambda *args:path)
    monkeypatch.setattr(a,'executable',lambda value:'mock-blender')
    def build(exe,args,**kw):
        folder=Path(args[-1]);(folder/'work.blend').write_bytes(b'generated workcopy')
        (folder/'scene-result.json').write_text(json.dumps({'subject_sha256':'unit-subject'}))
    monkeypatch.setattr(a,'run',build)
    return pid,addon,scene,arranged,path,[asset]


def baked(tmp_path,session):
    t=track();t.update(source_start_frame=1,source_end_frame=60,source_fps=60)
    for cut in t['cuts']:cut['source_frame']=1+round(cut['time']*60)
    folder=a.session_root(tmp_path)/session['id'];eid=str(uuid.uuid4());blend=folder/f'baked-{eid}.blend';out=folder/f'camera-{eid}.json';blend.write_bytes(b'fixed snapshot');out.write_text(json.dumps(t))
    receipt={'export_id':eid,'exported_at':1,'manifest_sha256':session['manifest_sha256'],'subject_sha256':session['subject_sha256'],'blend_sha256':a.digest(blend.read_bytes()),'track_sha256':a.digest(out.read_bytes())}
    (folder/'receipt.json').write_text(json.dumps(receipt));return out


def test_session_fixed_source_revision_candidate_compare_and_adoption(tmp_path,monkeypatch):
    pid,addon,scene,arranged,path,assets=fixture(tmp_path,monkeypatch);original=path.read_bytes()
    s=a.prepare(tmp_path,pid,addon['id'],0,59,assets,'mock')
    assert path.read_bytes()==original
    manifest=json.loads((a.session_root(tmp_path)/s['id']/'manifest.json').read_text());assert manifest['assets'][0]['windows']==scene['instances'][0]['timeline_windows']
    assert a.open_session(tmp_path,s['id'],assets,'mock')['requires_local_action']
    with pytest.raises(a.AddonError,match='作業コピー'):a.remove(tmp_path,addon['id'])
    with pytest.raises(a.AddonError,match='Bake'):a.import_bake(tmp_path,s['id'],assets)
    out=baked(tmp_path,s);c=a.import_bake(tmp_path,s['id'],assets)
    assert a.import_bake(tmp_path,s['id'],assets)['id']==c['id']
    assert len(camera.listing(tmp_path,pid))==1 and c['mapping']=={'scale':1,'offset':[0,0,0]}
    args=(tmp_path,pid,c['id'],0,c['mapping'],assets)
    prepared=camera.prepare(*args)
    arranged['revision']=1
    with pytest.raises(camera.CameraImportError,match='変更'):camera.prepare(*args)
    with pytest.raises(camera.CameraImportError):camera.adopt(tmp_path,pid,c['id'],0,c['mapping'],prepared['expected'],False,assets)
    arranged['revision']=0;path.write_bytes(b'changed')
    with pytest.raises(a.AddonError,match='変更'):a.import_bake(tmp_path,s['id'],assets)
    path.write_bytes(original);out.write_text('{}')
    with pytest.raises(a.AddonError,match='Bake'):a.import_bake(tmp_path,s['id'],assets)


def test_prepare_rejects_unsupported_content_and_failed_build_preserves_source(tmp_path,monkeypatch):
    pid,addon,scene,arranged,path,assets=fixture(tmp_path,monkeypatch);original=path.read_bytes()
    scene['instances'][0]['asset']['format']='FBX'
    with pytest.raises(a.AddonError,match='FBX'):a.prepare(tmp_path,pid,addon['id'],0,59,assets,'mock')
    scene['instances'][0]['asset']['format']='GLB'
    scene['timeline_models']=[{'status':'model_unavailable'}]
    with pytest.raises(a.AddonError,match='省略'):a.prepare(tmp_path,pid,addon['id'],0,59,assets,'mock')
    scene.pop('timeline_models')
    for start,end in [(False,59),(60,59),(0,7200)]:
        with pytest.raises(a.AddonError):a.prepare(tmp_path,pid,addon['id'],start,end,assets,'mock')
    monkeypatch.setattr(a,'run',lambda *args,**kw:a.fail('execution_failed','failure'))
    with pytest.raises(a.AddonError):a.prepare(tmp_path,pid,addon['id'],0,59,assets,'mock')
    assert path.read_bytes()==original and not a.sessions(tmp_path,pid)
