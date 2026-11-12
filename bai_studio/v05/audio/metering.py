"""100ms post-fader stereo peaks and FFmpeg EBU R128 measurements.

Large timelines stay in a compressed sidecar; the UI reads bounded windows.
"""
import math
from pathlib import Path
import re
import shutil
import subprocess

STEP=4800
FIELDS=('left','right','momentary','shortterm','integrated','true_peak','range')


def measure(data,raw_path,work_dir):
    import numpy as np
    frames=len(data);count=math.ceil(frames/STEP)
    values=np.full((count,len(FIELDS)),np.nan,dtype='float32')
    for i in range(count):values[i,:2]=np.max(np.abs(data[i*STEP:min(frames,(i+1)*STEP)]),axis=0)
    if not np.any(values[:,:2]):return values
    data.flush()
    output=Path(work_dir)/'r128.txt'
    with output.open('wb') as target:
        result=subprocess.run([shutil.which('ffmpeg'),'-hide_banner','-nostdin','-loglevel','error',
            '-f','f32le','-ar','48000','-ac','2','-i',str(raw_path),'-af',
            'ebur128=metadata=1:peak=true,ametadata=print:file=-','-f','null','-'],
            stdout=target,stderr=subprocess.PIPE,timeout=1800,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.returncode:raise ValueError('ラウドネスを計測できません：'+result.stderr.decode('utf-8',errors='replace')[-300:])
    index=-1
    mapping={'M':2,'S':3,'I':4,'true_peak':5,'LRA':6}
    for line in output.read_text(encoding='utf-8').splitlines():
        if line.startswith('frame:'):
            match=re.search(r'pts_time:([0-9.e+-]+)',line)
            index=round(float(match[1])*10) if match else -1
        elif line.startswith('lavfi.r128.') and 0<=index<count:
            key,value=line[11:].split('=',1)
            if key not in mapping:continue
            value=float(value)
            if not math.isfinite(value):continue
            if key in ('M','S') and value<=-120:continue
            if key=='I' and value<=-70:continue
            if key=='true_peak':value=20*math.log10(value) if value>0 else float('nan')
            values[index,mapping[key]]=value
    return values


def window(root,key,start=0,seconds=8):
    from bai_studio.v05.audio import mixer
    import numpy as np
    if not isinstance(key,str) or not mixer.HEX.fullmatch(key):raise mixer.MixerError('音声IDが不正です',400)
    if type(start) not in (int,float) or not math.isfinite(start) or start<0 or type(seconds) not in (int,float) or not 0<seconds<=15:raise mixer.MixerError('計測表示の範囲が不正です',400)
    path=Path(root)/'studio_v05_audio/cache'/(key+'.meters.npz')
    manifest=path.with_name(key+'.json')
    if not path.is_file() or not manifest.is_file():raise mixer.MixerError('計測データがありません。音声を準備し直してください',404)
    first=max(0,math.floor(start*10)-1);last=math.ceil((start+seconds)*10)+1
    rows={}
    with np.load(path,allow_pickle=False) as stored:
        for route in stored.files:
            data=stored[route][first:last]
            rows[route]=[[round(float(v),3) if np.isfinite(v) else None for v in point] for point in data]
    return {'id':key,'start_index':first,'step_seconds':.1,'fields':FIELDS,'rows':rows,'loudness_time':'at_bin_end','peaks_time':'within_bin'}
