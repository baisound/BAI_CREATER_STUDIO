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


def configure_plugin(plugin,insert,state_path=None):
    if state_path:
        raw=Path(state_path).read_bytes()
        if len(raw)>32*1024*1024:raise ValueError('VST状態が大きすぎます')
        import hashlib
        if insert.get('state_id') and hashlib.sha256(raw).hexdigest()!=insert['state_id']:raise ValueError('VST状態が変わりました')
        plugin.raw_state=raw
    params=plugin.parameters
    for key,value in insert['parameters'].items():
        if key not in params:raise ValueError('VSTパラメーターが変わりました。挿し直してください：'+key)
        params[key].raw_value=value


def editor(body):
    from threading import Event,Thread
    import time
    plugin=open_plugin(body['plugin']['path'])
    configure_plugin(plugin,body['insert'],body.get('state_file'))
    close=Event()
    def monitor():
        deadline=time.monotonic()+7200
        while not close.wait(.1):
            if Path(body['control']).exists() or time.monotonic()>deadline:close.set()
    Thread(target=monitor,daemon=True).start()
    Path(body['ready']).write_text('{}',encoding='utf-8')
    try:plugin.show_editor(close)
    finally:close.set()
    raw=plugin.raw_state
    if not isinstance(raw,bytes) or len(raw)>32*1024*1024:raise ValueError('VST状態を保存できません')
    Path(body['state_output']).write_bytes(raw)
    return {'plugin_id':body['plugin']['id'],'parameters':{key:float(value.raw_value) for key,value in plugin.parameters.items()}}


def render(body):
    import numpy as np
    from pedalboard import Pedalboard
    settings, sources = body['settings'], body['sources']
    rate, chunk = 48000, 48000
    frames = math.ceil(body['duration'] * rate)
    ffmpeg = shutil.which('ffmpeg')
    output = Path(body['output'])
    base = [ffmpeg, '-hide_banner', '-nostdin', '-loglevel', 'error', '-y']
    meters,series = {},{}
    if shutil.disk_usage(output.parent).free < frames*8*7+32*1024*1024:
        raise ValueError('音声処理用の空き容量が足りません。出力先の容量を確保してください')

    def process_buffer(data, config, silent, meter_key):
        plugins = []
        for insert in config.get('inserts', []):
            if insert['bypass']:
                continue
            plugin = open_plugin(body['plugins'][insert['plugin_id']]['path'])
            configure_plugin(plugin,insert,body.get('states',{}).get(insert.get('state_id')))
            plugins.append(plugin)
        board = Pedalboard(plugins)
        gain = 0 if silent else 10 ** (config.get('gain_db', 0) / 20)
        written, peak, clipped = 0, 0., 0
        # Output never extends beyond consumed input, so a copied input chunk
        # allows safe in-place streaming even when native latency buffers it.
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
                data[written:written+count] = out.T
                written += count
            if written >= frames:
                break
        if written != frames:
            raise ValueError('VSTの遅延音声を最後まで取得できません')
        meters[meter_key] = {'peak':peak,'peak_db':round(20*math.log10(peak),2) if peak > 0 else None,'over_samples':clipped}
        from bai_studio.v05.audio.metering import measure
        series[meter_key]=measure(data,Path(data.filename),output.parent)
        if len(series[meter_key]):
            last=series[meter_key][-1]
            meters[meter_key].update(lufs_integrated=float(last[4]) if np.isfinite(last[4]) else None,true_peak_db=float(last[5]) if np.isfinite(last[5]) else None)

    with tempfile.TemporaryDirectory(prefix='pcm-', dir=output.parent) as temp, ExitStack() as cleanup:
        temp = Path(temp)
        maps = {name: np.memmap(temp / (name + '.raw'), mode='w+', dtype='float32', shape=(frames, 2))
                for name in ('music', 'audio', 'video', 'master')}
        for data in maps.values():
            cleanup.callback(data._mmap.close)
            data[:] = 0
        groups = {}
        for source in sources:
            c = source['clip']
            groups.setdefault(c['track']+':'+str(c.get('lane',1)), []).append(source)
        configs = settings.get('tracks', {})
        lane_solo = any(configs.get(key, {}).get('solo', False) for key in groups)
        for key, group in groups.items():
            track = key.split(':')[0]
            lane_buffer = np.memmap(temp/'lane.raw', mode='w+', dtype='float32', shape=(frames,2))
            try:
                lane_buffer[:] = 0
                for source in group:
                    clip = source['clip']
                    raw = temp/'source.raw'
                    clock = 'asetpts=PTS-STARTPTS,' if source['kind'] == 'audio' else ''
                    length = math.ceil(clip['duration'] * rate)
                    source_start = clip.get('source_start', 0)
                    # Decode muted inputs too; missing/damaged originals fail.
                    resample='aresample=48000'
                    if body.get('dry_analysis'):
                        probe=subprocess.check_output([shutil.which('ffprobe'),'-v','error','-select_streams','a:0','-show_entries','stream=channels','-of','json',source['path']],timeout=30,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                        if json.loads(probe)['streams'][0]['channels']==1:resample+=',pan=stereo|c0=c0|c1=c0'
                    run(base + ['-copyts','-i',source['path'],'-vn','-af',
                        f'{clock}atrim=start={source_start:.8f}:duration={clip["duration"]:.8f},asetpts=PTS-STARTPTS,{resample},aformat=channel_layouts=stereo',
                        '-f','f32le','-c:a','pcm_f32le',str(raw)])
                    count = raw.stat().st_size // 8
                    if count < length - 1024:
                        raise ValueError('元音声を配置の末尾まで読み込めません')
                    if count:
                        pcm = np.memmap(raw,mode='r',dtype='float32',shape=(count,2))
                        try:
                            if not source['muted']:
                                start = round(clip['start']*rate)
                                count = min(count,length,max(0,frames-start))
                                for at in range(0,count,chunk):
                                    stop = min(count,at+chunk)
                                    lane_buffer[start+at:start+stop] += pcm[at:stop]
                        finally:
                            pcm._mmap.close()
                        del pcm
                    raw.unlink()
                config = configs.get(key, {})
                silent = key in body['muted'] or track in body['muted'] or (lane_solo and not config.get('solo',False))
                process_buffer(lane_buffer,config,silent,key)
                for at in range(0,frames,chunk):
                    maps[track][at:at+chunk] += lane_buffer[at:at+chunk]
            finally:
                lane_buffer._mmap.close()
            del lane_buffer
        solo = any(settings['channels'][b]['solo'] for b in ('music', 'audio', 'video'))
        for name in ('music', 'audio', 'video', 'master'):
            config = settings['channels'][name]
            silent = config['mute'] or name in body['muted'] or (name != 'master' and solo and not config['solo'])
            data = maps[name]
            process_buffer(data,config,silent,name)
            if name != 'master':
                for at in range(0, frames, chunk):
                    maps['master'][at:at+chunk] += data[at:at+chunk]
            else:
                data.flush()
                run(base + ['-f', 'f32le', '-ar', str(rate), '-ac', '2', '-i', str(temp / 'master.raw'),
                            '-c:a', 'pcm_f32le', '-rf64', 'auto', str(output)])
        for key in list(maps):
            maps[key].flush()
            del maps[key]
        del data
    np.savez_compressed(output.with_suffix('.meters.npz'),**series)
    return {'duration': frames/rate, 'frames': frames, 'sample_rate': rate, 'channels': 2,
            'meters': meters, 'engine': 'pedalboard-0.9.26/offline',
            'tail_policy': '作品末尾で終了。残響を残す場合は作品末尾へ余白を追加'}


if __name__ == '__main__':
    response = Path(sys.argv[2])
    try:
        request = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
        result = inspect(request) if request['action'] == 'inspect' else editor(request) if request['action']=='editor' else render(request)
        response.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    except Exception as exc:
        response.write_text(json.dumps({'error': str(exc)}, ensure_ascii=False), encoding='utf-8')
        sys.exit(1)
