import hashlib
import json
import shutil
import threading
import time
from unittest.mock import patch

import pytest
from PIL import Image
from bai_studio.projects.catalog import _atomic
from bai_studio.v05.render import sequence_checkpoint as cp, media_render as render
from bai_studio.v05.render.png_sequence import SequenceError


def prepared(tmp_path, count=3):
    job = {'id':'a'*32, 'frame_count':count, 'checkpoint_width':16, 'checkpoint_height':16}
    record = cp.begin(tmp_path, job, 'identity')
    base = cp.folder(tmp_path,job['id'])
    return job,record,base


def test_only_durable_contiguous_complete_rgba_frames(tmp_path):
    job,record,base=prepared(tmp_path)
    Image.new('RGBA',(16,16)).save(base/'frame_000001.png')
    assert cp.seal(tmp_path,job,record,writing=True)==0
    Image.new('RGBA',(16,16)).save(base/'frame_000003.png')
    assert cp.seal(tmp_path,job,record)==1
    (base/'frame_000002.png').write_bytes(b'partial PNG')
    assert cp.seal(tmp_path,job,record)==1
    assert len(cp.load(tmp_path,job['id'])['frames'])==1


@pytest.mark.parametrize('fault',['missing','same_size','rgb','size','identity','invalid','record'])
def test_changed_checkpoint_refused_and_not_repaired(tmp_path,fault):
    job,record,base=prepared(tmp_path)
    p=base/'frame_000001.png';Image.new('RGBA',(16,16)).save(p)
    cp.seal(tmp_path,job,record)
    if fault=='missing':p.unlink()
    elif fault=='same_size':p.write_bytes(b'X'+p.read_bytes()[1:])
    elif fault=='rgb':Image.new('RGB',(16,16)).save(p)
    elif fault=='size':Image.new('RGBA',(17,16)).save(p)
    elif fault=='invalid':record['invalid']=True;_atomic(base/'checkpoint.json',record)
    elif fault=='record':(base/'checkpoint.json').write_text('{}')
    before={p.name:p.read_bytes() for p in base.iterdir()}
    with pytest.raises(ValueError):cp.load(tmp_path,job['id'],'different' if fault=='identity' else 'identity')
    assert {p.name:p.read_bytes() for p in base.iterdir()}==before


def test_copy_ignores_unverified_tail_and_keeps_source(tmp_path):
    job,record,base=prepared(tmp_path)
    Image.new('RGBA',(16,16)).save(base/'frame_000001.png');cp.seal(tmp_path,job,record)
    (base/'frame_000002.png').write_bytes(b'unverified crash tail')
    before={p.name:p.read_bytes() for p in base.iterdir()}
    next_job={**job,'id':'b'*32}
    copied=cp.copy_prefix(tmp_path,job['id'],next_job,'identity')
    assert len(copied['frames'])==1
    assert not (cp.folder(tmp_path,next_job['id'])/'frame_000002.png').exists()
    assert {p.name:p.read_bytes() for p in base.iterdir()}==before


def test_checkpoint_atomic_failure_does_not_promote_new_frames(tmp_path):
    job,record,base=prepared(tmp_path)
    Image.new('RGBA',(16,16)).save(base/'frame_000001.png')
    with patch.object(cp,'_atomic',side_effect=OSError('full')):
        with pytest.raises(OSError):cp.seal(tmp_path,job,record)
    assert not cp.load(tmp_path,job['id'])['frames']


def test_retained_scene_copy_and_same_size_tamper_refused(tmp_path):
    job,record,base=prepared(tmp_path)
    Image.new('RGBA',(16,16)).save(base/'frame_000001.png');cp.seal(tmp_path,job,record)
    source=tmp_path/'capture.mkv';source.write_bytes(b'verified capture fixture')
    job['scene_capture']={'intermediate_sha256':cp.digest(source),'frames':3}
    cp.retain_scene(tmp_path,job,record,source)
    next_job={**job,'id':'b'*32};copied=cp.copy_prefix(tmp_path,job['id'],next_job,'identity')
    assert copied['scene']==record['scene']
    assert (cp.folder(tmp_path,next_job['id'])/'scene.mkv').read_bytes()==source.read_bytes()
    scene=base/'scene.mkv';scene.write_bytes(b'X'+scene.read_bytes()[1:])
    with pytest.raises(SequenceError):cp.load(tmp_path,job['id'],'identity')
    assert len(cp.load(tmp_path,job['id'],verify=False)['frames'])==1  # History is metadata-only; resume always hashes.


def test_uuid_and_symlink_escape_refused(tmp_path):
    with pytest.raises(SequenceError):cp.folder(tmp_path,'../bad')
    job,record,base=prepared(tmp_path)
    other=tmp_path/'owner.png';Image.new('RGBA',(16,16)).save(other)
    try:(base/'frame_000001.png').symlink_to(other)
    except OSError:pytest.skip('symlink privilege unavailable')
    with pytest.raises(SequenceError):cp._frame(base,'frame_000001.png',16,16)
    assert other.is_file()


def test_status_recovers_only_saved_prefix_after_restart(tmp_path):
    job,record,base=prepared(tmp_path)
    Image.new('RGBA',(16,16)).save(base/'frame_000001.png');cp.seal(tmp_path,job,record)
    Image.new('RGBA',(16,16)).save(base/'frame_000002.png')
    job.update(project_id='p',preset='png_rgba_zip',status='running',checkpoint_identity='identity')
    _atomic(tmp_path/'jobs'/(job['id']+'.json'),job)
    found=render.status(tmp_path,job['id'])
    assert found['status']=='interrupted' and found['verified_frames']==1 and found['resume_available']
    assert (base/'frame_000002.png').is_file()
    assert 'checkpoint_identity' not in found


def test_status_existence_check_waits_for_atomic_writer(tmp_path):
    jid='c'*32;path=tmp_path/'jobs'/(jid+'.json')
    job={'id':jid,'status':'failed','project_id':'p'}
    absent=threading.Event();release=threading.Event();result=[]
    def writer():
        with render.LOCK:
            absent.set();assert release.wait(5);_atomic(path,job)
    def reader():
        try:result.append(render.status(tmp_path,jid))
        except Exception as exc:result.append(exc)
    w=threading.Thread(target=writer);w.start();assert absent.wait(5)
    r=threading.Thread(target=reader);r.start();time.sleep(.05)
    assert not result  # A transient missing target is not a permanent 404.
    release.set();w.join(5);r.join(5)
    assert result==[job]


@pytest.mark.parametrize('changed',['studio/v05/js/timeline-pmx-physics.mjs',
    'studio/js/motion/pmx-vmd-preview.js', 'camera_lens.js'])
def test_renderer_dependency_change_refuses_prefix(tmp_path,monkeypatch,changed):
    job,record,base=prepared(tmp_path)
    job.update(project_id='p',preset='png_rgba_zip',resolution='720p',fps=29.97,
        range_start_frame=7,range_end_exclusive=10,range_revision=1,
        arrangement_revision=1,scene_revision=None,settings_revision=1,
        background={'kind':'transparent','color':'#000000'},audio_settings={},mixer_settings={})
    # Change only the digest of one real implementation dependency; do not edit
    # the running checkout or production source to simulate an upgrade.
    real_digest=cp.digest;seen=[]
    def cached(p):
        seen.append(str(p).replace('\\','/'))
        return real_digest(p)
    monkeypatch.setattr(cp,'digest',cached)
    first=cp.identity(tmp_path,job,[],shutil.which('ffmpeg'),shutil.which('ffprobe'))
    assert any(p.endswith('/'+changed) for p in seen),changed
    Image.new('RGBA',(16,16)).save(base/'frame_000001.png')
    record['identity']=first;cp.seal(tmp_path,job,record)
    before={p.name:p.read_bytes() for p in base.iterdir()}
    monkeypatch.setattr(cp,'digest',lambda p: 'changed' if str(p).replace('\\','/').endswith('/'+changed) else real_digest(p))
    second=cp.identity(tmp_path,job,[],shutil.which('ffmpeg'),shutil.which('ffprobe'))
    assert second!=first
    with pytest.raises(SequenceError) as caught:cp.load(tmp_path,job['id'],second)
    assert caught.value.status==409
    assert {p.name:p.read_bytes() for p in base.iterdir()}==before
