import io
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from bai_studio.assets import library_assets as lib
from bai_studio.v05.render import media_render as render

CASES = [('vorbis.ogg','libvorbis',44100),('opus.ogg','libopus',48000),('lossless.flac','flac',32000),('aac.m4a','aac',48000)]

@pytest.mark.parametrize('name,codec,rate',CASES)
def test_registered_audio_duration_matches_decoded_samples_and_keeps_original(tmp_path,name,codec,rate):
    ffmpeg,probe=shutil.which('ffmpeg'),shutil.which('ffprobe')
    if not ffmpeg or not probe:pytest.skip('ffmpeg/ffprobe required')
    source=tmp_path/name
    subprocess.run([ffmpeg,'-v','error','-f','lavfi','-i',f'sine=frequency=660:sample_rate={rate}:duration=6.35','-c:a',codec,'-y',str(source)],check=True)
    original=source.read_bytes();root=tmp_path/'data'/'library_assets'
    item=lib.register_stream(root,io.BytesIO(original),len(original),'audio',name)
    assert item['mime']=={'.ogg':'audio/ogg','.flac':'audio/flac','.m4a':'audio/mp4'}[source.suffix]
    inventory=[{**item,'available':True}]
    before=(root/'index.json').read_bytes()
    info=render.media_info(tmp_path/'data',item['id'],inventory)
    assert info['has_audio'] and abs(info['duration_seconds']-6.35)<.0001
    assert lib.file_for(root,item['id'])[0].read_bytes()==original==source.read_bytes()
    assert (root/'index.json').read_bytes()==before
    assert lib.register_stream(root,io.BytesIO(original),len(original),'audio',name)['id']==item['id']

@pytest.mark.parametrize('name,bad',[('bad.ogg',b'OggS'+b'\0'*24+b'\x80theora'),('bad.flac',b'RIFF'+b'\0'*50),('bad.m4a',b'ID3'+b'\0'*50)])
def test_false_audio_signatures_do_not_change_index(tmp_path,name,bad):
    root=tmp_path/'library';root.mkdir();(root/'index.json').write_text('{"schema":1,"items":[]}',encoding='utf-8')
    before=(root/'index.json').read_bytes()
    with pytest.raises(ValueError,match='contents'):lib.register_stream(root,io.BytesIO(bad),len(bad),'audio',name)
    assert (root/'index.json').read_bytes()==before
    assert not list((root/'files').glob('*'))

@pytest.mark.parametrize('name', ['sample.ogg','sample.flac','sample.m4a'])
def test_audio_extensions_cannot_be_registered_as_video_or_unknown_kind(name):
    with pytest.raises(ValueError):lib.validate('video',name,10)
    with pytest.raises(ValueError):lib.validate('unknown',name,10)
    with pytest.raises(ValueError):lib.validate('audio',name,0)


def test_m4a_real_video_is_refused_before_placement_but_cover_art_is_not_misclassified(tmp_path,monkeypatch):
    def probe(args,timeout):return subprocess.CompletedProcess(args,0,json.dumps({'format':{'duration':'2'},'streams':[{'codec_type':'audio','sample_rate':'48000'},{'codec_type':'video','disposition':{'attached_pic':0}}]}),'')
    monkeypatch.setattr(render,'_run',probe)
    with pytest.raises(render.RenderError,match='映像'):render._media_info('ffprobe',tmp_path/'video.m4a')
    calls=[]
    def cover(args,timeout):
        calls.append(args)
        return subprocess.CompletedProcess(args,0,'96000\n' if 'frame=nb_samples' in args else json.dumps({'format':{'duration':'2'},'streams':[{'codec_type':'audio','sample_rate':'48000'},{'codec_type':'video','disposition':{'attached_pic':1}}]}),'')
    monkeypatch.setattr(render,'_run',cover)
    assert render._media_info('ffprobe',tmp_path/'cover.m4a')['duration']==2
    assert len(calls)==2

@pytest.mark.parametrize('ext',['ogg','flac','m4a'])
def test_broken_decoded_audio_does_not_return_an_apparent_duration(tmp_path,monkeypatch,ext):
    def probe(args,timeout):return subprocess.CompletedProcess(args,0,'' if 'frame=nb_samples' in args else json.dumps({'format':{'duration':'2'},'streams':[{'codec_type':'audio','sample_rate':'48000'}]}),'')
    monkeypatch.setattr(render,'_run',probe)
    with pytest.raises(render.RenderError,match='読めません'):render._media_info('ffprobe',tmp_path/('broken.'+ext))
