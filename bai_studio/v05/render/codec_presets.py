"""Fixed, measured video/audio combinations; never accept arbitrary FFmpeg flags."""
from __future__ import annotations
import copy
import json
import math
import re
import subprocess
import tempfile
import threading
import time
from fractions import Fraction
from pathlib import Path

SPECS = {
    'mp4_h264_aac': dict(label='MP4 / H.264 + AAC', extension='.mp4', container='mp4', video='h264', audio='aac', encoder='libx264', audio_encoder='aac', pixel_format='yuv420p', args=['-preset','veryfast','-crf','20']),
    'mp4_hevc_aac': dict(label='MP4 / H.265 + AAC', extension='.mp4', container='mp4', video='hevc', audio='aac', encoder='libx265', audio_encoder='aac', pixel_format='yuv420p', args=['-preset','ultrafast','-crf','23','-x265-params','pools=1:frame-threads=1','-tag:v','hvc1']),
    'mp4_vp9_aac': dict(label='MP4 / VP9 + AAC', extension='.mp4', container='mp4', video='vp9', audio='aac', encoder='libvpx-vp9', audio_encoder='aac', pixel_format='yuv420p', args=['-deadline','realtime','-cpu-used','6','-crf','30','-b:v','0']),
    'mp4_av1_aac': dict(label='MP4 / AV1 + AAC', extension='.mp4', container='mp4', video='av1', audio='aac', encoder='libaom-av1', audio_encoder='aac', pixel_format='yuv420p', args=['-cpu-used','8','-crf','30','-b:v','0']),
    'mov_prores_pcm': dict(label='MOV / ProRes 422 HQ + PCM', extension='.mov', container='mov', video='prores', audio='pcm_s24le', encoder='prores_ks', audio_encoder='pcm_s24le', pixel_format='yuv422p10le', args=['-profile:v','3']),
}
LOCK = threading.RLock()
CACHE = {}


def spec(preset):
    return copy.deepcopy(SPECS[preset])


def extension(preset):
    return '.zip' if preset == 'png_rgba_zip' else SPECS.get(preset,SPECS['mp4_h264_aac'])['extension']


def arguments(preset):
    s=spec(preset)
    audio=['-ar','48000','-ac','2']+(['-b:a','320000'] if s['audio']=='aac' else [])
    return ['-c:v',s['encoder'],*s['args'],'-pix_fmt',s['pixel_format'],'-threads','2',
            '-c:a',s['audio_encoder'],*audio,'-movflags','+faststart','-movie_timescale','48000']


def verify(run,ffprobe,path,frames,duration,width,height,fps,preset):
    s=spec(preset)
    result=run([ffprobe,'-v','error','-count_frames','-show_entries',
        'stream=codec_name,codec_type,width,height,nb_read_frames,avg_frame_rate,duration,sample_rate,channels:format=duration',
        '-of','json',str(path)],max(60,min(1200,duration*2)))
    if result.returncode:raise ValueError('完成ファイルを再読込できません')
    try:
        data=json.loads(result.stdout)
        video=next(x for x in data['streams'] if x['codec_type']=='video')
        audio=next(x for x in data['streams'] if x['codec_type']=='audio')
        actual_duration=float(data['format']['duration'])
        actual_fps=float(Fraction(video['avg_frame_rate']))
        count=int(video['nb_read_frames'])
        audio_duration=float(audio['duration'])
        audio_rate=int(audio['sample_rate'])
    except (ValueError,TypeError,KeyError,StopIteration,ZeroDivisionError) as exc:
        raise ValueError('映像・音声のcodec/FPS/フレーム数を確認できません') from exc
    if (video['codec_name']!=s['video'] or audio['codec_name']!=s['audio'] or
            video['width']!=width or video['height']!=height or count!=frames or
            abs(actual_fps-fps)>max(.001,fps*.00001) or not math.isfinite(actual_duration) or
            audio_rate!=48000 or audio.get('channels')!=2 or not math.isfinite(audio_duration) or
            abs(audio_duration-duration)>16/48000 or
            abs(actual_duration-duration)>max(.1,2/fps)):
        raise ValueError('完成ファイルのcodec・寸法・FPS・フレーム数・長さが要求と違います')
    return dict(video_codec=s['video'],audio_codec=s['audio'],frames=count,fps=actual_fps,
                duration_seconds=actual_duration,width=width,height=height)


def measure(ffmpeg,ffprobe,width,height,fps,probe_root,run,*,refresh=False):
    """Target-sized probes, cached per tool version and exact output conditions."""
    try:
        key=(ffmpeg,ffprobe,Path(ffmpeg).stat().st_mtime_ns,Path(ffmpeg).stat().st_size,
             Path(ffprobe).stat().st_mtime_ns,Path(ffprobe).stat().st_size,width,height,str(fps))
    except (OSError,TypeError):
        return [dict(id=k,label=s['label'],extension=s['extension'],available=False,reason='FFmpegとffprobeを確認してください。') for k,s in SPECS.items()]
    with LOCK:
        if key in CACHE and not refresh:return copy.deepcopy(CACHE[key])
        original_run=run
        deadline=time.monotonic()+145
        def run(args,timeout):
            remaining=deadline-time.monotonic()
            if remaining<=0:raise subprocess.TimeoutExpired(args,0)
            return original_run(args,min(timeout,remaining))
        rows=[]
        try:
            encoders=run([ffmpeg,'-hide_banner','-encoders'],15)
            if encoders.returncode:raise ValueError('encoder一覧を読み込めません')
        except (OSError,ValueError,subprocess.TimeoutExpired):
            return [dict(id=k,label=s['label'],extension=s['extension'],available=False,reason='encoder一覧を確認できません。') for k,s in SPECS.items()]
        if probe_root is not None:probe_root.mkdir(parents=True,exist_ok=True)
        for preset,s in SPECS.items():
            row=dict(id=preset,label=s['label'],extension=s['extension'],encoder=s['encoder'],
                     video_codec=s['video'],audio_codec=s['audio'],width=width,height=height,fps=fps,
                     available=False,reason=None)
            missing=[x for x in [s['encoder'],s['audio_encoder']] if not re.search(r'\b'+re.escape(x)+r'\b',encoders.stdout)]
            if missing:
                row['reason']='このFFmpegに '+', '.join(missing)+' がありません。'
                rows.append(row);continue
            try:
                with tempfile.TemporaryDirectory(dir=probe_root) as folder:
                    target=Path(folder)/('probe'+s['extension']);script=Path(folder)/'probe.filter'
                    script.write_text('[0:v]trim=end_frame=3,setpts=PTS-STARTPTS[v];[1:a]anull[a]',encoding='utf-8')
                    duration=3/float(fps)
                    for option in ['-/filter_complex','-filter_complex_script']:
                        attempt=run([ffmpeg,'-v','error','-nostdin','-y','-f','lavfi','-i',
                            f'testsrc2=s={width}x{height}:r={fps}:d={duration}',
                            '-f','lavfi','-i',f'sine=frequency=997:sample_rate=48000:duration={duration}',
                            option,str(script),'-map','[v]','-map','[a]',*arguments(preset),
                            '-fps_mode','passthrough','-t',str(duration),'-f',s['container'],str(target)],45)
                        if attempt.returncode:continue
                        verify(run,ffprobe,target,3,duration,width,height,float(fps),preset)
                        decoded=run([ffmpeg,'-v','error','-xerror','-nostdin','-i',str(target),
                            '-map','0:v:0','-map','0:a:0','-f','null','-'],30)
                        if decoded.returncode:raise ValueError('映像または音声の実復号に失敗しました')
                        row.update(available=True,filter_complex_option=option);break
                    if not row['available']:row['reason']='この解像度/FPSで映像・音声の試験出力に失敗しました。'
            except (OSError,ValueError,subprocess.TimeoutExpired):
                row['reason']='試験出力または実復号を完了できませんでした。対応状況を再確認してください。'
            rows.append(row)
        if len(CACHE)>=16:CACHE.pop(next(iter(CACHE)))
        CACHE[key]=copy.deepcopy(rows)
        return rows
