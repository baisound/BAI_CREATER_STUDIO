import json
import wave
from fractions import Fraction
from unittest.mock import patch

import pytest
from PIL import Image
from bai_studio.projects.catalog import _atomic
from bai_studio.v05.render import png_sequence as png, sequence_checkpoint as cp, frame_video


def test_retention_setting_is_optional_persistent_and_h264_only(tmp_path):
    _atomic(tmp_path/'studio_v05_catalog.json',{'schema':1,'projects':[{'id':'a'}],'assets':[]})
    assert not png.read(tmp_path,'a').get('retain_frames')
    bg={'kind':'solid','color':'#000000'}
    saved=png.update(tmp_path,'a',0,'mp4_h264_aac',bg,retain_frames=True)
    assert png.read(tmp_path,'a')==saved and saved['retain_frames']
    with pytest.raises(png.SequenceError):png.update(tmp_path,'a',saved['revision'],'mov_prores_pcm',bg)
    disabled=png.update(tmp_path,'a',saved['revision'],'mov_prores_pcm',bg,retain_frames=False)
    assert not disabled.get('retain_frames')


@pytest.mark.parametrize('bad',[1,'true',None,[],{}])
def test_corrupt_retention_setting_is_rejected(tmp_path,bad):
    _atomic(tmp_path/'studio_v05_catalog.json',{'schema':1,'projects':[{'id':'a'}],'assets':[]})
    saved=png.update(tmp_path,'a',0,'mp4_h264_aac',{'kind':'solid','color':'#000000'})
    saved['retain_frames']=bad
    _atomic(png._path(tmp_path,'a'),saved)
    with pytest.raises(png.SequenceError):png.read(tmp_path,'a')


@pytest.mark.parametrize('fault',['missing_frame','missing_audio','wrong_samples','mono','16bit','wrong_rate','tamper'])
def test_reencode_refuses_incomplete_or_changed_frames_and_audio(tmp_path,fault):
    job={'id':'a'*32,'checkpoint_width':16,'checkpoint_height':16,'frame_count':3,'range_start_frame':7,'range_end_exclusive':10,'fps':29.97,'checkpoint_identity':'same'}
    record=cp.begin(tmp_path,job,'same');base=cp.folder(tmp_path,job['id'])
    for i in range(1,3 if fault=='missing_frame' else 4):Image.new('RGBA',(16,16),(50,100,200,255)).save(base/f'frame_{i:06d}.png')
    cp.seal(tmp_path,job,record)
    samples=round(Fraction(10*48000)/Fraction('29.97'))-round(Fraction(7*48000)/Fraction('29.97'))
    channels=1 if fault=='mono' else 2;size=2 if fault=='16bit' else 3;rate=44100 if fault=='wrong_rate' else 48000
    if fault!='missing_audio':
        with wave.open(str(base/'audio.wav'),'wb') as audio:
            audio.setparams((channels,size,rate,0,'NONE','not compressed'));audio.writeframes(bytes((samples+(1 if fault=='wrong_samples' else 0))*channels*size))
    if fault=='tamper':
        p=base/'frame_000001.png';p.write_bytes(b'X'+p.read_bytes()[1:])
    with patch.object(frame_video,'arguments',side_effect=AssertionError('encoder must not start')):
        with pytest.raises((ValueError,OSError)):
            frame_video.encode(None,'ffmpeg',tmp_path,job,tmp_path/'new.mp4',lambda _:None)
