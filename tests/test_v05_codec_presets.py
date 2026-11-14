import json
import shutil
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest
from bai_studio.v05.render import codec_presets as codecs,media_render as render,png_sequence,render_names


@pytest.mark.parametrize('preset',list(codecs.SPECS))
def test_real_encode_decode_for_fixed_combination(tmp_path,preset):
    rows=codecs.measure(shutil.which('ffmpeg'),shutil.which('ffprobe'),64,64,29.97,tmp_path,render._run)
    row=next(x for x in rows if x['id']==preset)
    assert row['available'],row['reason']
    assert row['width']==64 and row['fps']==29.97


def test_probe_cache_matches_tools_resolution_and_fps(tmp_path):
    codecs.CACHE.clear()
    ffmpeg,ffprobe=shutil.which('ffmpeg'),shutil.which('ffprobe')
    calls=[]
    def run(args,timeout):calls.append(args);return render._run(args,timeout)
    first=codecs.measure(ffmpeg,ffprobe,64,64,24,tmp_path,run);count=len(calls)
    first[0]['available']=False
    assert codecs.measure(ffmpeg,ffprobe,64,64,24,tmp_path,run)[0]['available']
    assert len(calls)==count
    codecs.measure(ffmpeg,ffprobe,64,64,24,tmp_path,run,refresh=True);assert len(calls)>count
    count=len(calls)
    codecs.measure(ffmpeg,ffprobe,64,64,60,tmp_path,run);assert len(calls)>count
    count=len(calls);codecs.measure(ffmpeg,ffprobe,128,64,60,tmp_path,run);assert len(calls)>count


def test_missing_encoder_and_bad_probe_are_not_available(tmp_path):
    codecs.CACHE.clear()
    ffmpeg,ffprobe=shutil.which('ffmpeg'),shutil.which('ffprobe')
    def missing(args,timeout):return subprocess.CompletedProcess(args,0,'only libx264 aac','') if '-encoders'in args else subprocess.CompletedProcess(args,1,'','injected failure')
    rows=codecs.measure(ffmpeg,ffprobe,80,64,24,tmp_path,missing)
    assert all(not x['available'] for x in rows)
    assert 'ありません' in next(x for x in rows if x['id']=='mov_prores_pcm')['reason']
    assert '失敗' in rows[0]['reason']


@pytest.mark.parametrize('fault',['codec','audio','frames','fps','dimensions','missing_audio','audio_duration','corrupt'])
def test_verification_refuses_wrong_or_missing_streams(tmp_path,fault):
    data={'streams':[{'codec_type':'video','codec_name':'hevc','width':64,'height':64,'nb_read_frames':'3','avg_frame_rate':'2997/100'},
                     {'codec_type':'audio','codec_name':'aac','sample_rate':'48000','channels':2,'duration':str(3/29.97)}],'format':{'duration':str(3/29.97)}}
    v=data['streams'][0]
    if fault=='codec':v['codec_name']='h264'
    if fault=='audio':data['streams'][1]['codec_name']='mp3'
    if fault=='frames':v['nb_read_frames']='2'
    if fault=='fps':v['avg_frame_rate']='30/1'
    if fault=='dimensions':v['width']=32
    if fault=='missing_audio':data['streams'].pop()
    if fault=='audio_duration':data['streams'][1]['duration']='0.08533'
    raw='invalid' if fault=='corrupt' else json.dumps(data)
    with pytest.raises(ValueError):codecs.verify(lambda *args:subprocess.CompletedProcess([],0,raw,''),'probe',tmp_path/'x.mp4',3,3/29.97,64,64,29.97,'mp4_hevc_aac')


def test_mov_names_isolated_from_mp4_and_dangerous_paths_refused(tmp_path):
    assert render_names.preview(tmp_path,'p','作品','.mov')['requested_name']=='作品.mov'
    assert render_names.preview(tmp_path,'p','作品.mov')['requested_name']=='作品.mov'
    assert render_names.preview(tmp_path,'p','作品','.mp4')['requested_name']=='作品.mp4'
    with pytest.raises(ValueError):render_names.normalize('../作品.mov')
    with pytest.raises(ValueError):render_names.normalize('作品.mp4','.mov')


@pytest.mark.parametrize('preset',list(codecs.SPECS))
def test_video_presets_reject_alpha(preset):
    with pytest.raises(ValueError):png_sequence.validate(preset,{'kind':'transparent','color':'#000000'})


def test_mov_partial_cleanup_keeps_completed_and_checkpoint(tmp_path):
    jid='f'*32;(tmp_path/'files').mkdir();(tmp_path/'checkpoints'/jid).mkdir(parents=True)
    part=tmp_path/'files'/(jid+'.part.mov');part.write_bytes(b'incomplete')
    final=tmp_path/'files'/(jid+'.mov');final.write_bytes(b'completed')
    kept=tmp_path/'checkpoints'/jid/'checkpoint.json';kept.write_bytes(b'checkpoint')
    assert render._cleanup_temporary(tmp_path,jid)
    assert not part.exists() and final.read_bytes()==b'completed' and kept.read_bytes()==b'checkpoint'


def test_high_bitrate_output_limit_stops_and_keeps_old_movie(tmp_path,monkeypatch):
    (tmp_path/'files').mkdir();(tmp_path/'jobs').mkdir()
    old=tmp_path/'files'/('a'*32+'.mp4');old.write_bytes(b'old completed movie')
    monkeypatch.setattr(render,'MAX_OUTPUT_BYTES',1024)
    job={'id':'b'*32,'project_id':'qa','resolution':'720p','fps':30,'scene_revision':None,
         'arrangement_revision':1,'range_revision':1,'range_start_frame':7,
         'range_end_exclusive':10,'frame_count':3,'preset':'mov_prores_pcm'}
    ffmpeg,ffprobe=shutil.which('ffmpeg'),shutil.which('ffprobe')
    selected=next(x for x in codecs.measure(ffmpeg,ffprobe,64,64,30,tmp_path,render._run) if x['id']=='mov_prores_pcm')
    assert selected['available'],selected['reason']
    render._worker(tmp_path,job,[],ffmpeg,ffprobe,filter_complex_option=selected['filter_complex_option'])
    assert job['status']=='failed' and '2GiB' in job['error']
    assert old.read_bytes()==b'old completed movie'
    assert not (tmp_path/'files'/(job['id']+'.part.mov')).exists()
    assert not (tmp_path/'files'/(job['id']+'.mov')).exists()


@pytest.mark.parametrize('fps,start,count',[(24,7,1),(29.97,7,3),(29.97,1234,17),(60,7,1),(60,7,60)])
def test_graph_frame_trim_flushes_audio_without_output_frame_cap(tmp_path,fps,start,count):
    ffmpeg,ffprobe=shutil.which('ffmpeg'),shutil.which('ffprobe')
    graph,frames,duration=render._graph([],fps,64,64,start,start+count)
    script=tmp_path/'graph.filter';script.write_text(graph,encoding='utf-8');target=tmp_path/'completed.mp4'
    full=(start+count)/fps
    caps=codecs.measure(ffmpeg,ffprobe,64,64,fps,tmp_path,render._run)
    selected=next(x for x in caps if x['id']=='mp4_h264_aac');assert selected['available'],selected['reason']
    result=render._run([ffmpeg,'-v','error','-nostdin','-f','lavfi','-i',f'color=s=64x64:r={fps}:d={full}',
        '-f','lavfi','-i',f'anullsrc=r=48000:cl=stereo:d={full}',selected['filter_complex_option'],str(script),
        '-map','[vout]','-map','[aout]',*codecs.arguments('mp4_h264_aac'),'-fps_mode','passthrough',
        '-t',str(duration),'-f','mp4',str(target)],30)
    assert result.returncode==0,result.stderr
    verified=codecs.verify(render._run,ffprobe,target,frames,duration,64,64,fps,'mp4_h264_aac')
    assert verified['frames']==count
    decoded=subprocess.check_output([ffmpeg,'-v','error','-i',str(target),'-map','0:a:0','-f','f32le','-ac','2','pipe:1'])
    assert len(decoded)//8>=round(duration*48000)
