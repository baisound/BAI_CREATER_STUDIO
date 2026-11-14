"""Saved export choices and verified, bounded RGBA PNG/WAV deliverables."""
from __future__ import annotations

import hashlib
import json
import re
import os
import subprocess
import tempfile
import threading
import wave
import zipfile
from fractions import Fraction
from pathlib import Path

from bai_studio.projects.catalog import _atomic, load

LOCK = threading.RLock()
MAX_BYTES = 2 * 1024**3
PRESETS = {'mp4_h264_aac', 'png_rgba_zip'}
_CAP_KEY = None
_CAP_RESULT = None


def capability(ffmpeg, ffprobe, probe_root=None):
    global _CAP_KEY,_CAP_RESULT
    if not ffmpeg or not ffprobe:return {'png_available':False,'png_reason':'FFmpegとffprobeを確認してください。'}
    try:key=(ffmpeg,Path(ffmpeg).stat().st_mtime_ns,ffprobe,Path(ffprobe).stat().st_mtime_ns)
    except OSError:return {'png_available':False,'png_reason':'FFmpegを読み込めません。'}
    with LOCK:
        if key==_CAP_KEY:return dict(_CAP_RESULT)
        try:
            from PIL import Image
            if probe_root is not None:probe_root.mkdir(parents=True,exist_ok=True)
            with tempfile.TemporaryDirectory(dir=probe_root) as folder:
                png=Path(folder)/'test.png'
                script=Path(folder)/'test.filter';script.write_text('[0:v]null[v]',encoding='utf-8')
                selected=None
                for option in ['-/filter_complex','-filter_complex_script']:
                    run=subprocess.run([ffmpeg,'-v','error','-nostdin','-y','-f','lavfi','-i','color=c=red@0.5:s=16x16:d=0.1,format=rgba',
                        option,str(script),'-map','[v]','-frames:v','1','-c:v','png','-threads','1',str(png)],
                        capture_output=True,timeout=20,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                    if not run.returncode:selected=option;break
                if selected is None:raise ValueError('PNG/WAV encoder failed')
                with Image.open(png) as im:
                    im.load()
                    if im.mode!='RGBA' or im.getpixel((0,0))[3] not in range(126,130):raise ValueError('alpha probe failed')
                audio_run=subprocess.run([ffmpeg,'-v','error','-nostdin','-f','lavfi','-i','anullsrc=r=48000:cl=stereo:d=0.1','-c:a','pcm_s24le',str(Path(folder)/'test.wav')],capture_output=True,timeout=20,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                if audio_run.returncode:raise ValueError('WAV encoder failed')
                with wave.open(str(Path(folder)/'test.wav'),'rb') as audio:
                    if audio.getnframes()!=4800 or audio.getsampwidth()!=3:raise ValueError('WAV probe failed')
            enc=subprocess.run([ffmpeg,'-v','error','-encoders'],capture_output=True,text=True,timeout=15,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            result={'png_available':True,'png_reason':None,'png_filter_option':selected,'png_ffv1_available':bool(re.search(r'\bffv1\b',enc.stdout))}
        except (ImportError,OSError,ValueError,subprocess.TimeoutExpired):
            result={'png_available':False,'png_reason':'RGBA PNGの試験出力に失敗しました。FFmpegとrequirements-render.txtのPillowを確認してください。'}
        _CAP_KEY=key;_CAP_RESULT=result
        return dict(result)


class SequenceError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def _path(data_root, project_id):
    if not any(x['id'] == project_id for x in load(data_root/'studio_v05_catalog.json')['projects']):
        raise SequenceError('作品が見つかりません。作品を選び直してください。', 404)
    return data_root/'studio_v05_media_renders'/'settings'/(hashlib.sha256(project_id.encode()).hexdigest()+'.json')


def validate(preset, background):
    if preset not in PRESETS or not isinstance(background, dict) or set(background) != {'kind','color'}:
        raise SequenceError('書き出し形式と背景を選んでください。',400)
    if background['kind'] not in {'transparent','solid'} or not isinstance(background['color'],str) or not re.fullmatch('#[0-9a-fA-F]{6}',background['color']):
        raise SequenceError('背景は透過または単色、色は#RRGGBBで指定してください。',400)
    if preset == 'mp4_h264_aac' and background['kind'] == 'transparent':
        raise SequenceError('MP4は透過できません。PNG連番を選ぶか、単色背景を選んで保存してください。')
    return {'kind':background['kind'],'color':background['color'].lower()}


def read(data_root, project_id):
    with LOCK:
        p = _path(data_root,project_id)
        if not p.exists():
            return {'schema':1,'project_id':project_id,'revision':0,'preset':'mp4_h264_aac','background':{'kind':'solid','color':'#000000'}}
        try:
            d=json.loads(p.read_text(encoding='utf-8'))
            if d.get('schema')!=1 or d.get('project_id')!=project_id or type(d.get('revision')) is not int or d['revision']<0:
                raise ValueError()
            validate(d['preset'],d['background'])
            return d
        except (ValueError,KeyError,TypeError) as exc:
            raise SequenceError('保存した書き出し設定を読めません。原本を保持して停止しました。') from exc


def update(data_root, project_id, revision, preset, background):
    background=validate(preset,background)
    with LOCK:
        old=read(data_root,project_id)
        if type(revision) is not int or revision!=old['revision']:
            raise SequenceError('書き出し設定が更新されました。再読込してから保存してください。',409)
        d={'schema':1,'project_id':project_id,'revision':revision+1,'preset':preset,'background':background}
        _atomic(_path(data_root,project_id),d)
        return d


def check_size(folder):
    total=sum(p.stat().st_size for p in folder.iterdir() if p.is_file())
    if total>MAX_BYTES:
        raise SequenceError('PNG・WAV・再開用3Dの作業領域が2GiBを超えました。In/Outを短くして再試行してください。')
    return total


def _digest(stream):
    h=hashlib.sha256()
    for b in iter(lambda:stream.read(1024*1024),b''):h.update(b)
    return h.hexdigest()


def package(folder, target, job, width, height):
    from PIL import Image
    expected=[f'frame_{i:06d}.png' for i in range(1,job['frame_count']+1)]
    if sorted(p.name for p in folder.glob('*.png'))!=expected:
        raise SequenceError('PNG連番に欠番または余分なフレームがあります。完成物は確定しません。')
    check_size(folder)
    rows=[]
    for i,name in enumerate(expected):
        p=folder/name
        with Image.open(p) as im:
            im.load()
            if im.format!='PNG' or im.mode!='RGBA' or im.size!=(width,height):
                raise SequenceError('PNGの寸法またはRGBAが一致しません。完成物は確定しません。')
            lo,hi=im.getchannel('A').getextrema()
        with p.open('rb') as source:digest=_digest(source)
        rows.append({'file':name,'index':i,'project_frame':job['range_start_frame']+i,'sha256':digest,'alpha_min':lo,'alpha_max':hi})
    with wave.open(str(folder/'audio.wav'),'rb') as audio:
        samples=audio.getnframes()
        first=round(Fraction(job['range_start_frame']*48000)/Fraction(str(job['fps'])))
        end=round(Fraction(job['range_end_exclusive']*48000)/Fraction(str(job['fps'])))
        if audio.getframerate()!=48000 or audio.getnchannels()!=2 or audio.getsampwidth()!=3 or samples!=end-first:
            raise SequenceError('別WAVのサンプル数・形式が出力範囲と一致しません。')
    fps=Fraction(str(job['fps']))
    manifest={'schema':1,'format':'png_rgba_sequence','project_id':job['project_id'],
              'range_start_frame':job['range_start_frame'],'range_end_exclusive':job['range_end_exclusive'],
              'fps':{'numerator':fps.numerator,'denominator':fps.denominator},'frame_count':len(rows),
              'width':width,'height':height,'pixel_format':'RGBA8','alpha_mode':'straight',
              'background':job['background'],'settings_revision':job['settings_revision'],
              'arrangement_revision':job['arrangement_revision'],'scene_revision':job['scene_revision'],
              'range_revision':job['range_revision'],'frames':rows,
              'audio':{'file':'audio.wav','embedded_in_png':False,'codec':'pcm_s24le','channels':2,'sample_rate':48000,'samples':samples,'project_start_sample':first,'project_end_sample_exclusive':end,
                       'note':'PNGに音声は含みません。音声のない作品は無音WAVです。'}}
    with (folder/'audio.wav').open('rb') as f:manifest['audio']['sha256']=_digest(f)
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    check_size(folder)
    with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_STORED,allowZip64=True) as z:
        for name in [*expected,'audio.wav','manifest.json']:z.write(folder/name,name)
    if target.stat().st_size>MAX_BYTES:raise SequenceError('完成ZIPが2GiBを超えました。出力範囲を短くしてください。')
    with zipfile.ZipFile(target) as z:
        if set(z.namelist())!=set([*expected,'audio.wav','manifest.json']):raise SequenceError('完成ZIPの内容が一致しません。')
        for entry in [*rows,manifest['audio']]:
            with z.open(entry['file']) as f:
                if _digest(f)!=entry['sha256']:raise SequenceError('完成ZIPの内容検査に失敗しました。')
        if json.loads(z.read('manifest.json'))!=manifest:raise SequenceError('完成ZIPの記録が一致しません。')
    return {'width':width,'height':height,'frames':len(rows),'fps':job['fps'],'format':'png_rgba_zip',
            'pixel_format':'rgba','alpha_mode':'straight','audio_codec':'pcm_s24le','audio_samples':samples,
            'alpha_min':min(x['alpha_min'] for x in rows),'alpha_max':max(x['alpha_max'] for x in rows)}
