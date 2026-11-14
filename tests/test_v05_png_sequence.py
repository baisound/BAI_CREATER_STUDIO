import hashlib
import json
import wave
from pathlib import Path

import pytest
from PIL import Image
from bai_studio.projects.catalog import _atomic
from bai_studio.v05.render import png_sequence as png,media_render as render,render_names as names


def test_settings_isolation_conflict_and_transparent_mp4_rejected(tmp_path):
    _atomic(tmp_path/'studio_v05_catalog.json',{'schema':1,'projects':[{'id':'a'},{'id':'b'}]})
    assert png.read(tmp_path,'a')['revision']==0
    saved=png.update(tmp_path,'a',0,'png_rgba_zip',{'kind':'transparent','color':'#000000'})
    assert png.read(tmp_path,'a')==saved and png.read(tmp_path,'b')['preset']=='mp4_h264_aac'
    with pytest.raises(png.SequenceError,match='更新'):png.update(tmp_path,'a',0,'png_rgba_zip',saved['background'])
    with pytest.raises(png.SequenceError,match='透過'):png.update(tmp_path,'a',1,'mp4_h264_aac',saved['background'])
    assert png.read(tmp_path,'a')==saved


def fixture(folder):
    folder.mkdir()
    for i in [1,2,3]:Image.new('RGBA',(16,16),(180,60,200,128)).save(folder/f'frame_{i:06d}.png')
    job={'frame_count':3,'range_start_frame':7,'range_end_exclusive':10,'fps':29.97,'project_id':'p',
         'background':{'kind':'transparent','color':'#000000'},'settings_revision':1,'arrangement_revision':2,'range_revision':1,'scene_revision':None}
    from fractions import Fraction
    n=round(Fraction(10*48000)/Fraction('29.97'))-round(Fraction(7*48000)/Fraction('29.97'))
    with wave.open(str(folder/'audio.wav'),'wb') as a:a.setparams((2,3,48000,0,'NONE','not compressed'));a.writeframes(b'\0'*n*6)
    return job


@pytest.mark.parametrize('fault',['gap','extra','rgb','dimension','corrupt','audio'])
def test_bad_sequences_never_finalize(tmp_path,fault):
    f=tmp_path/'work';job=fixture(f)
    if fault=='gap':(f/'frame_000002.png').unlink()
    elif fault=='extra':Image.new('RGBA',(16,16)).save(f/'frame_000004.png')
    elif fault=='rgb':Image.new('RGB',(16,16)).save(f/'frame_000001.png')
    elif fault=='dimension':Image.new('RGBA',(17,16)).save(f/'frame_000001.png')
    elif fault=='corrupt':(f/'frame_000001.png').write_bytes(b'bad PNG')
    else:
        with wave.open(str(f/'audio.wav'),'wb') as a:a.setparams((2,3,48000,0,'NONE','not compressed'));a.writeframes(b'\0'*6)
    with pytest.raises((png.SequenceError,OSError,ValueError)):png.package(f,tmp_path/'out.zip',job,16,16)
    assert not (tmp_path/'out.zip').exists()


def test_rgba_zip_and_mp4_names_recover_restore_and_reject_same_size_tamper(tmp_path):
    root=tmp_path/'render';(root/'files').mkdir(parents=True)
    f=tmp_path/'work';job=fixture(f)
    temp=root/'files'/'new.part.zip';probe=png.package(f,temp,job,16,16)
    oldmp4=root/'files'/('c'*32+'.mp4');oldmp4.write_bytes(b'original mp4')
    for i in ['a','b']:
        jid=i*32
        part=root/'files'/f'{jid}.part.zip';part.write_bytes(temp.read_bytes())
        plan=names.plan(root,'p','作品','version' if i=='a' else 'replace',None if i=='a' else 'a'*32,'.zip')
        final=root/'files'/f'{jid}.zip'
        names.finalize(root,'p',plan,jid,part,final)
        record={'id':jid,'project_id':'p','preset':'png_rgba_zip','status':'running','download_name':'作品.zip',
                'pending_output':{'bytes':final.stat().st_size,'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'probe':probe},'created_at':1}
        _atomic(root/'jobs'/f'{jid}.json',record)
        assert render.status(root,jid)['status']=='succeeded'
        assert render.output_file(root,jid)==final
    info=names.preview(root,'p','作品.zip')
    restored=names.restore(root,'p','作品.zip','a'*32,info['revision'],'b'*32)
    assert restored['current_job_id']=='a'*32 and oldmp4.read_bytes()==b'original mp4'
    file=root/'files'/('a'*32+'.zip');b=file.read_bytes();file.write_bytes(b'X'+b[1:])
    with pytest.raises(render.RenderError,match='内容'):render.output_file(root,'a'*32)
    assert names.preview(root,'p','作品.mp4')['exists'] is False


def test_capacity_and_name_index_failure_keep_prior_output(tmp_path,monkeypatch):
    f=tmp_path/'work';job=fixture(f)
    monkeypatch.setattr(png,'MAX_BYTES',1)
    with pytest.raises(png.SequenceError,match='2GiB'):png.package(f,tmp_path/'out.zip',job,16,16)
    root=tmp_path/'r';(root/'files').mkdir(parents=True);old=root/'files'/('a'*32+'.mp4');old.write_bytes(b'old')
    part=root/'files'/'part.zip';part.write_bytes(b'new')
    monkeypatch.setattr(names,'_atomic',lambda *_: (_ for _ in ()).throw(OSError('injected index failure')))
    with pytest.raises(OSError):names.finalize(root,'p',names.plan(root,'p','x','version',None,'.zip'),'b'*32,part,root/'files'/('b'*32+'.zip'))
    assert old.read_bytes()==b'old' and not (root/'files'/('b'*32+'.zip')).exists()


@pytest.mark.parametrize('state',['unnamed','indexed','unindexed','modified'])
def test_zip_final_checkpoint_recovery_requires_verified_bytes_and_committed_name(tmp_path,state):
    root=tmp_path/'r';(root/'files').mkdir(parents=True)
    f=tmp_path/'work';job=fixture(f);part=root/'files'/'out.part.zip';probe=png.package(f,part,job,16,16)
    jid='d'*32;final=root/'files'/f'{jid}.zip'
    if state=='indexed':names.finalize(root,'p',names.plan(root,'p','透過','version',None,'.zip'),jid,part,final)
    else:part.rename(final)
    expected=final.read_bytes()
    record={'id':jid,'project_id':'p','preset':'png_rgba_zip','created_at':1,'status':'failed',
            'download_name':None if state=='unnamed' else '透過.zip','pending_output':{'bytes':len(expected),'sha256':hashlib.sha256(expected).hexdigest(),'probe':probe}}
    _atomic(root/'jobs'/f'{jid}.json',record)
    if state=='modified':final.write_bytes(b'X'+expected[1:])
    found=render.status(root,jid)
    assert (found['status']=='succeeded')==(state in {'unnamed','indexed'})
    assert final.read_bytes()==(b'X'+expected[1:] if state=='modified' else expected)
