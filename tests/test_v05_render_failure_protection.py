import errno
import hashlib
import json
import shutil
from pathlib import Path

import pytest

from bai_studio.projects.catalog import _atomic
from bai_studio.v05.render import media_render as render, render_names as names


def completed(root,jid='a'*32,content=b'verified output fixture'):
    (root/'files').mkdir(parents=True,exist_ok=True)
    file=root/'files'/f'{jid}.mp4';file.write_bytes(content)
    job={'id':jid,'project_id':'p','status':'succeeded','bytes':len(content),
         'sha256':hashlib.sha256(content).hexdigest(),'probe':{'frames':1},'created_at':1}
    _atomic(root/'jobs'/f'{jid}.json',job)
    return job,file


def test_same_size_changed_output_is_rejected_without_repair_or_index_change(tmp_path):
    job,file=completed(tmp_path);modified=b'X'+file.read_bytes()[1:];file.write_bytes(modified)
    saved=(tmp_path/'jobs'/f"{job['id']}.json").read_bytes()
    with pytest.raises(render.RenderError,match='内容|hash|changed'):
        render.output_file(tmp_path,job['id'])
    assert file.read_bytes()==modified and (tmp_path/'jobs'/f"{job['id']}.json").read_bytes()==saved


@pytest.mark.parametrize('named',[False,True])
def test_verified_commit_recovers_and_cleans_only_owned_work(tmp_path,named):
    job,file=completed(tmp_path)
    if named:
        # Establish a committed name index while keeping the verified output.
        file.unlink();temp=tmp_path/'files'/'input.part.mp4';temp.write_bytes(b'verified output fixture')
        names.finalize(tmp_path,'p',names.plan(tmp_path,'p','作品','version',None),job['id'],temp,file)
    work=tmp_path/'jobs'/f"{job['id']}.frames";work.mkdir();(work/'scene.mkv').write_bytes(b'large temporary fixture')
    old,old_file=completed(tmp_path,'b'*32,b'older completed output');old_bytes=old_file.read_bytes()
    job.update(status='running',download_name='作品.mp4' if named else None,
               pending_output={k:job[k] for k in ('bytes','sha256','probe')})
    _atomic(tmp_path/'jobs'/f"{job['id']}.json",job)
    result=render.status(tmp_path,job['id'])
    assert result['status']=='succeeded'
    assert result['temporary_cleanup']=='complete' and not work.exists()
    assert render.output_file(tmp_path,job['id']).read_bytes()==b'verified output fixture'
    assert old_file.read_bytes()==old_bytes


def test_unverifiable_or_unindexed_final_never_becomes_success(tmp_path):
    job,file=completed(tmp_path);original=file.read_bytes()
    job.update(status='running',download_name='never-committed.mp4',pending_output={k:job[k] for k in ('bytes','sha256','probe')})
    _atomic(tmp_path/'jobs'/f"{job['id']}.json",job)
    assert render.status(tmp_path,job['id'])['status']=='interrupted'
    assert file.read_bytes()==original


def test_unwritable_interrupted_record_does_not_hide_completed_history(tmp_path,monkeypatch):
    old,file=completed(tmp_path)
    bad={'id':'c'*32,'project_id':'p','status':'running','created_at':2}
    _atomic(tmp_path/'jobs'/f"{bad['id']}.json",bad)
    atomic=render._atomic
    def full(path,data):
        if data.get('id')==bad['id']:raise OSError(errno.ENOSPC,'injected storage full')
        return atomic(path,data)
    monkeypatch.setattr(render,'_atomic',full)
    result=render.list_jobs(tmp_path,'p',completed_only=True)
    assert [x['id'] for x in result['jobs']]==[old['id']]
    assert result['unreadable_count']==1
    assert render.output_file(tmp_path,old['id']).read_bytes()==file.read_bytes()


def test_broken_name_index_keeps_verified_completed_file_downloadable(tmp_path):
    job,file=completed(tmp_path);job['download_name']='作品.mp4'
    _atomic(tmp_path/'jobs'/f"{job['id']}.json",job)
    index=names._path(tmp_path,'p');index.parent.mkdir(exist_ok=True);index.write_bytes(b'broken index')
    result=render.list_jobs(tmp_path,'p',completed_only=True)
    assert result['jobs'][0]['id']==job['id']
    assert result['jobs'][0]['delivery_state']=='unknown' and result['jobs'][0]['delivery_error']
    assert render.output_file(tmp_path,job['id']).read_bytes()==file.read_bytes()
    assert index.read_bytes()==b'broken index'


def test_locked_name_index_stat_does_not_hide_completed_file(tmp_path,monkeypatch):
    job,file=completed(tmp_path)
    def locked(*args):raise PermissionError(errno.EACCES,'injected index stat lock')
    monkeypatch.setattr(names,'state',locked)
    result=render.list_jobs(tmp_path,'p',completed_only=True)
    assert result['jobs'][0]['delivery_state']=='unknown'
    assert render.output_file(tmp_path,job['id']).read_bytes()==file.read_bytes()


def setup_start(tmp_path,monkeypatch):
    _atomic(tmp_path/'studio_v05_catalog.json',{'schema':1,'projects':[{'id':'p','name':'p'}]})
    monkeypatch.setattr(render,'capabilities',lambda *a:{'available':True,'filter_complex_option':'-filter_complex_script'})
    monkeypatch.setattr(render,'_snapshot',lambda *a:({'fps':30,'range_start_frame':0,'range_end_exclusive':10,'frame_count':10},[]))
    from bai_studio.v05.timeline import scene_instances
    monkeypatch.setattr(scene_instances,'read',lambda *a:{'instances':[]})


def test_thread_launch_failure_releases_slot_and_retains_failed_record(tmp_path,monkeypatch):
    setup_start(tmp_path,monkeypatch);ids=[]
    class BrokenThread:
        def __init__(self,target,args,daemon):ids.append(args[1]['id'])
        def start(self):raise RuntimeError('injected thread launch failure')
    monkeypatch.setattr(render.threading,'Thread',BrokenThread)
    try:
        with pytest.raises(render.RenderError):render.start(tmp_path,'p',0,0,'720p',[])
        assert ids and ids[0] not in render.ACTIVE
        assert render.status(tmp_path/'studio_v05_media_renders',ids[0])['status']=='failed'
    finally:
        for jid in ids:render.ACTIVE.discard(jid)


@pytest.mark.parametrize('error,status',[(errno.ENOSPC,507),(errno.EACCES,503)])
def test_queued_record_write_failure_returns_actionable_error_and_no_busy_slot(tmp_path,monkeypatch,error,status):
    setup_start(tmp_path,monkeypatch)
    def fail(*args):raise OSError(error,'injected job save error')
    monkeypatch.setattr(render,'_atomic',fail)
    before=set(render.ACTIVE)
    with pytest.raises(render.RenderError) as exc:render.start(tmp_path,'p',0,0,'720p',[])
    assert exc.value.status==status and '以前' in str(exc.value)
    assert render.ACTIVE==before


def test_failed_recovery_write_keeps_checkpoint_for_next_read(tmp_path,monkeypatch):
    job,file=completed(tmp_path)
    job.update(status='running',pending_output={k:job[k] for k in ('bytes','sha256','probe')})
    _atomic(tmp_path/'jobs'/f"{job['id']}.json",job)
    atomic=render._atomic;fail=[True]
    def full_once(path,data):
        if data['status']=='succeeded' and fail[0]:
            fail[0]=False;raise OSError(errno.ENOSPC,'injected recovered-state write failure')
        return atomic(path,data)
    monkeypatch.setattr(render,'_atomic',full_once)
    render.status(tmp_path,job['id'])
    saved=json.loads((tmp_path/'jobs'/f"{job['id']}.json").read_text())
    assert saved['pending_output']['sha256']==job['sha256']
    assert render.status(tmp_path,job['id'])['status']=='succeeded'


def test_same_size_tampered_unconfirmed_file_is_never_promoted(tmp_path):
    job,file=completed(tmp_path)
    job.update(status='running',pending_output={k:job[k] for k in ('bytes','sha256','probe')})
    _atomic(tmp_path/'jobs'/f"{job['id']}.json",job)
    modified=b'X'+file.read_bytes()[1:];file.write_bytes(modified)
    assert render.status(tmp_path,job['id'])['status']=='interrupted'
    assert file.read_bytes()==modified


def real_worker(root,jid,plan=None):
    ffmpeg,probe=shutil.which('ffmpeg'),shutil.which('ffprobe')
    if not ffmpeg or not probe:pytest.skip('FFmpeg/ffprobe required')
    caps=render.capabilities(ffmpeg,probe,root/'probe');assert caps['available'],caps['reason']
    job={'schema':1,'id':jid,'project_id':'p','status':'queued','resolution':'720p','fps':30,
         'scene_revision':None,'arrangement_revision':0,'range_revision':0,'range_start_frame':0,
         'range_end_exclusive':10,'frame_count':10,'audio_bitrate':320000,'created_at':1,
         'download_name':plan['download_name'] if plan else None,'delivery_plan':plan}
    (root/'files').mkdir(parents=True,exist_ok=True);_atomic(root/'jobs'/f'{jid}.json',job)
    render.ACTIVE.add(jid)
    render._worker(root,job,[],ffmpeg,probe,filter_complex_option=caps['filter_complex_option'])
    assert jid not in render.ACTIVE
    return job


def test_real_failed_replacement_keeps_old_bytes_index_and_allows_new_job(tmp_path,monkeypatch):
    old=real_worker(tmp_path,'a'*32,names.plan(tmp_path,'p','作品','version',None))
    assert old['status']=='succeeded' and old['probe']['frames']==10
    old_file=render.output_file(tmp_path,old['id']);old_bytes=old_file.read_bytes()
    before=names.preview(tmp_path,'p','作品');index=names._path(tmp_path,'p').read_bytes()
    atomic=names._atomic
    def full(*args):raise OSError(errno.ENOSPC,'injected name-index full')
    monkeypatch.setattr(names,'_atomic',full)
    failed=real_worker(tmp_path,'b'*32,names.plan(tmp_path,'p','作品','replace',old['id']))
    assert failed['status']=='failed' and '空き容量' in failed['error']
    assert old_file.read_bytes()==old_bytes and names._path(tmp_path,'p').read_bytes()==index
    assert names.preview(tmp_path,'p','作品')==before
    assert not (tmp_path/'files'/f"{failed['id']}.mp4").exists()
    monkeypatch.setattr(names,'_atomic',atomic)
    retry=real_worker(tmp_path,'c'*32,names.plan(tmp_path,'p','作品','replace',old['id']))
    assert retry['status']=='succeeded' and retry['probe']['frames']==10
    assert old_file.read_bytes()==old_bytes
    assert names.state(tmp_path,'p','作品.mp4',old['id'])=='archived'
    assert names.state(tmp_path,'p','作品.mp4',retry['id'])=='current'


@pytest.mark.parametrize('failure',['job-save','final-stat'])
@pytest.mark.parametrize('named',[False,True])
def test_real_committed_output_recovers_after_final_state_failure(tmp_path,monkeypatch,failure,named):
    jid='d'*32;atomic=render._atomic;stat=Path.stat;injected=[False]
    if failure=='job-save':
        def fail(path,data):
            if data.get('id')==jid and data.get('status')=='succeeded' and not injected[0]:
                injected[0]=True;raise OSError(errno.ENOSPC,'injected final-state save full')
            return atomic(path,data)
        monkeypatch.setattr(render,'_atomic',fail)
    else:
        def fail(path,*args,**kwargs):
            info=stat(path,*args,**kwargs)
            if path.name==jid+'.mp4' and info.st_size>0 and not injected[0]:
                injected[0]=True;raise PermissionError(errno.EACCES,'injected final-stat lock')
            return info
        monkeypatch.setattr(Path,'stat',fail)
    real_worker(tmp_path,jid,names.plan(tmp_path,'p','確定復旧','version',None) if named else None)
    assert injected[0]
    checkpoint=json.loads((tmp_path/'jobs'/f'{jid}.json').read_text())
    assert 'pending_output' in checkpoint
    recovered=render.status(tmp_path,jid)
    assert recovered['status']=='succeeded' and recovered['probe']['frames']==10
    assert recovered['temporary_cleanup']=='complete'
    assert hashlib.sha256(render.output_file(tmp_path,jid).read_bytes()).hexdigest()==recovered['sha256']
