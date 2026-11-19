"""Encode a new video from a complete verified checkpoint; never append MP4 bytes."""
from fractions import Fraction
from pathlib import Path
import subprocess
import time
import wave

from . import sequence_checkpoint as checkpoint
from .codec_presets import arguments


def encode(scope, ffmpeg, root, job, target, check_capacity):
    record=checkpoint.load(root,job['id'],job['checkpoint_identity'])
    if len(record['frames']) != job['frame_count']:
        raise ValueError('検証済み連番が全フレーム分ありません。保持した枚数から再開してください。')
    base=checkpoint.folder(root,job['id'])
    audio=checkpoint.safe_file(base,'audio.wav')
    fps=Fraction(str(job['fps']))
    expected=round(job['range_end_exclusive']*48000/fps)-round(job['range_start_frame']*48000/fps)
    with wave.open(str(audio),'rb') as stream:
        if (stream.getnchannels(),stream.getsampwidth(),stream.getframerate(),stream.getnframes()) != (2,3,48000,expected):
            raise ValueError('再生成用の音声が元の保存範囲と一致しません。')
    duration=job['frame_count']/float(fps)
    log=root/'jobs'/(job['id']+'.reencode.log')
    with log.open('w',encoding='utf-8') as err:
        process=scope.spawn([ffmpeg,'-v','error','-nostdin','-framerate',str(float(fps)),
            '-start_number','1','-i',str(base/'frame_%06d.png'),'-i',str(audio),
            '-map','0:v:0','-map','1:a:0',*arguments('mp4_h264_aac'),
            '-fps_mode','passthrough','-t',str(duration),'-f','mp4','-n',str(target)],
            stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=err,
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        deadline=time.monotonic()+max(120,min(3600,duration*12))
        while process.poll() is None:
            if Path(target).exists():check_capacity(Path(target).stat().st_size)
            if time.monotonic()>deadline:raise ValueError('MP4の再生成が制限時間を超えました。検証済み連番は保持しています。')
            time.sleep(.2)
        if process.returncode:
            raise ValueError('MP4の再生成に失敗しました。検証済み連番は保持しています。対応状況を再確認してから、再生成してください。')
    check_capacity(Path(target).stat().st_size)
    job['reencoded_from_verified_frames']=True
    job['verified_audio_samples']=expected
