import math
from pathlib import Path
import shutil
import subprocess
import json
import pytest
import numpy as np
from bai_studio.v05.audio.metering import measure,window


def signal(tmp_path,gain=1):
    rate=48000;frames=rate*8;raw=tmp_path/f'tone-{gain}.raw'
    data=np.memmap(raw,mode='w+',dtype='float32',shape=(frames,2));data[:]=0
    t=np.arange(rate*5)/rate;data[:rate*5]=(.1*gain*np.sin(2*np.pi*1000*t))[:,None];data.flush()
    return data,raw


def test_stereo_peaks_and_r128_calibration_with_trailing_silence(tmp_path):
    if not shutil.which('ffmpeg'):pytest.skip('FFmpeg required')
    data,raw=signal(tmp_path)
    try:values=measure(data,raw,tmp_path)
    finally:data._mmap.close()
    assert values.shape==(80,7)
    assert np.allclose(values[5:40,:2],.1,atol=1e-6)
    # BS.1770 calibration: identical 1kHz sine, -20 dBFS peak per stereo channel.
    assert abs(float(values[40,2])+20)<.1
    assert abs(float(values[40,3])+20)<.1
    assert abs(float(values[40,4])+20)<.1
    assert abs(float(values[40,5])+20)<.1
    assert np.max(values[55:,:2])==0
    assert np.isnan(values[60,2])
    assert abs(float(values[-1,4])+20)<.2  # gate excludes the trailing silence
    quiet,quiet_path=signal(tmp_path,.5)
    try:attenuated=measure(quiet,quiet_path,tmp_path)
    finally:quiet._mmap.close()
    assert abs(float(attenuated[40,2]-values[40,2])-20*math.log10(.5))<.02


def test_meter_api_returns_bounded_windows_without_pickle(tmp_path):
    key='a'*64;folder=tmp_path/'studio_v05_audio/cache';folder.mkdir(parents=True)
    values=np.full((1000,7),np.nan,dtype='float32');values[:,0]=.1;values[:,1]=.025
    np.savez_compressed(folder/(key+'.meters.npz'),master=values,**{'audio:2':values})
    (folder/(key+'.json')).write_text('{}')
    result=window(tmp_path,key,10,5)
    assert result['start_index']==99 and len(result['rows']['master'])==52
    assert result['rows']['audio:2'][0][:2]==[.1,.025]
    assert result['rows']['master'][0][2] is None
    with pytest.raises(ValueError):window(tmp_path,key,0,16)
    with pytest.raises(ValueError):window(tmp_path,'../bad',0,5)
