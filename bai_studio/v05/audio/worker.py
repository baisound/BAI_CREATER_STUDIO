"""Disposable native host. JSON files keep plug-in console output off the API."""
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from contextlib import ExitStack


def run(command):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=1800, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode:
        raise ValueError('FFmpeg処理失敗：' + result.stderr.decode('utf-8', errors='replace')[-400:])


def open_plugin(path):
    from pedalboard import load_plugin
    plugin = load_plugin(path)
    if not plugin.is_effect or plugin.is_instrument:
        raise ValueError('音声エフェクトVST3を選択してください。音源VSTiは未対応です')
    return plugin


def inspect(body):
    p = open_plugin(body['plugin']['path'])
    parameters = []
    for name, param in p.parameters.items():
        parameters.append({'id': name, 'name': name, 'raw': float(param.raw_value),
                           'display': str(getattr(p, name)), 'unit': param.label or ''})
    return {'plugin_id': body['plugin']['id'], 'name': p.name, 'parameters': parameters, 'is_effect': True}


def render(body):
    import numpy as np
    from pedalboard import Pedalboard
    settings, sources = body['settings'], body['sources']
    rate, chunk = 48000, 48000
    frames = math.ceil(body['duration'] * rate)
    ffmpeg = shutil.which('ffmpeg')
    output = Path(body['output'])
    base = [ffmpeg, '-hide_banner', '-nostdin', '-loglevel', 'error', '-y']
    meters = {}
    with tempfile.TemporaryDirectory(prefix='pcm-', dir=output.parent) as temp, ExitStack() as cleanup:
        temp = Path(temp)
        maps = {name: np.memmap(temp / (name + '.raw'), mode='w+', dtype='float32', shape=(frames, 2))
                for name in ('music', 'audio', 'video', 'master')}
        for data in maps.values():
            cleanup.callback(data._mmap.close)
            data[:] = 0
        for index, source in enumerate(sources):
            clip = source['clip']
            raw = temp / (str(index) + '.raw')
            clock = 'asetpts=PTS-STARTPTS,' if source['kind'] == 'audio' else ''
            length = math.ceil(clip['duration'] * rate)
            source_start = clip.get('source_start', 0)
            # Decode even muted inputs, so damaged sources cannot silently pass.
            run(base + ['-copyts', '-i', source['path'], '-vn', '-af',
                        f'{clock}atrim=start={source_start:.8f}:duration={clip["duration"]:.8f},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo',
                        '-f', 'f32le', '-c:a', 'pcm_f32le', str(raw)])
            count = raw.stat().st_size // 8
            if count < length - 1024:
                raise ValueError('元音声を配置の末尾まで読み込めません')
            if count:
                pcm = np.memmap(raw, mode='r', dtype='float32', shape=(count, 2))
                try:
                    if not source['muted'] and clip['track'] not in body['muted']:
                        start = round(clip['start'] * rate)
                        count = min(count, length, max(0, frames - start))
                        for at in range(0, count, chunk):
                            stop = min(count, at + chunk)
                            maps[clip['track']][start+at:start+stop] += pcm[at:stop]
                finally:
                    pcm._mmap.close()
                del pcm
            raw.unlink()

        solo = any(settings['channels'][b]['solo'] for b in ('music', 'audio', 'video'))
        for name in ('music', 'audio', 'video', 'master'):
            config = settings['channels'][name]
            plugins = []
            for insert in config['inserts']:
                if insert['bypass']:
                    continue
                plugin = open_plugin(body['plugins'][insert['plugin_id']]['path'])
                params = plugin.parameters
                for key, value in insert['parameters'].items():
                    if key not in params:
                        raise ValueError('VSTパラメーターが変わりました。挿し直してください：' + key)
                    params[key].raw_value = value
                plugins.append(plugin)
            board = Pedalboard(plugins)
            silent = config['mute'] or (name != 'master' and solo and not config['solo'])
            gain = 0 if silent else 10 ** (config['gain_db'] / 20)
            data = maps[name]
            # Separate output permits latency-buffered processors to emit fewer
            # samples without overwriting unconsumed input.
            processed = np.memmap(temp / (name + '-fx.raw'), mode='w+', dtype='float32', shape=(frames, 2))
            cleanup.callback(processed._mmap.close)
            written = 0
            peak, clipped = 0., 0
            for at in range(0, frames + rate * 10, chunk):
                block = np.array(data[at:min(frames, at+chunk)].T, order='C') if at < frames else np.zeros((2, chunk), dtype='float32')
                out = board(block, rate, reset=(at == 0)) if plugins else block
                count = min(out.shape[1], frames - written)
                if count:
                    out = out[:, :count] * gain
                    if not np.isfinite(out).all():
                        raise ValueError('VSTから不正な音声値が返りました')
                    peak = max(peak, float(np.max(np.abs(out))))
                    clipped += int(np.count_nonzero(np.abs(out) > 1))
                    processed[written:written+count] = out.T
                    written += count
                if written >= frames:
                    break
            if written != frames:
                raise ValueError('VSTの遅延音声を最後まで取得できません')
            meters[name] = {'peak': peak, 'peak_db': round(20*math.log10(peak), 2) if peak > 0 else None,
                            'over_samples': clipped}
            if name != 'master':
                for at in range(0, frames, chunk):
                    maps['master'][at:at+chunk] += processed[at:at+chunk]
            else:
                processed.flush()
                run(base + ['-f', 'f32le', '-ar', str(rate), '-ac', '2', '-i', str(temp / (name + '-fx.raw')),
                            '-c:a', 'pcm_f32le', '-rf64', 'auto', str(output)])
            del processed
        for key in list(maps):
            maps[key].flush()
            del maps[key]
        del data
    return {'duration': frames/rate, 'frames': frames, 'sample_rate': rate, 'channels': 2,
            'meters': meters, 'engine': 'pedalboard-0.9.26/offline',
            'tail_policy': '作品末尾で終了。残響を残す場合は作品末尾へ余白を追加'}


if __name__ == '__main__':
    response = Path(sys.argv[2])
    try:
        request = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
        result = inspect(request) if request['action'] == 'inspect' else render(request)
        response.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    except Exception as exc:
        response.write_text(json.dumps({'error': str(exc)}, ensure_ascii=False), encoding='utf-8')
        sys.exit(1)
