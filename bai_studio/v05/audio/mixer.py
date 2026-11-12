"""Validated mixer state and immutable, content-addressed PCM preparations.

Native plug-ins run only in a disposable child, never the HTTP server process.
"""
import copy
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from contextlib import nullcontext

from bai_studio.projects.catalog import _atomic, load

LOCK = threading.RLock()
PROCESS_LOCK = threading.Lock()
BUSES = ('music', 'audio', 'video', 'master')
HEX = re.compile(r'^[0-9a-f]{64}$')
MAX_SECONDS = 7200


class MixerError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def project(root, pid):
    if not isinstance(pid, str) or not any(p['id'] == pid for p in load(root / 'studio_v05_catalog.json')['projects']):
        raise MixerError('作品を選択してください', 404)
    return root / 'studio_v05_audio' / 'settings' / (pid + '.json')


def defaults(pid):
    return {'schema': 1, 'project_id': pid, 'revision': 0, 'enabled': False,
            'channels': {b: {'gain_db': 0, 'mute': False, 'solo': False, 'inserts': []} for b in BUSES}}


def validate(channels):
    if not isinstance(channels, dict) or set(channels) != set(BUSES):
        raise MixerError('楽曲・音声・映像音・マスターの設定が必要です', 400)
    for name, channel in channels.items():
        if not isinstance(channel, dict) or set(channel) != {'gain_db', 'mute', 'solo', 'inserts'}:
            raise MixerError('不正なチャンネル設定です', 400)
        gain = channel['gain_db']
        if type(gain) not in (int, float) or not math.isfinite(gain) or not -60 <= gain <= 6:
            raise MixerError('音量は−60〜+6 dBで指定してください', 400)
        if any(type(channel[k]) is not bool for k in ('mute', 'solo')) or (name == 'master' and channel['solo']):
            raise MixerError('ミュート・ソロ設定が不正です', 400)
        if not isinstance(channel['inserts'], list) or len(channel['inserts']) > 8:
            raise MixerError('インサートは各チャンネル8個までです', 400)
        for insert in channel['inserts']:
            if (not isinstance(insert, dict) or set(insert) != {'plugin_id', 'parameters', 'bypass'}
                    or not isinstance(insert['plugin_id'], str) or not HEX.fullmatch(insert['plugin_id'])
                    or type(insert['bypass']) is not bool or not isinstance(insert['parameters'], dict)
                    or len(insert['parameters']) > 2048):
                raise MixerError('VSTの設定が不正です', 400)
            for key, value in insert['parameters'].items():
                if (not isinstance(key, str) or not 1 <= len(key) <= 256 or type(value) not in (int, float)
                        or not math.isfinite(value) or not 0 <= value <= 1):
                    raise MixerError('VSTパラメーターは0〜1の有限値で指定してください', 400)
    return copy.deepcopy(channels)


def read(root, pid):
    with LOCK:
        path = project(root, pid)
        if not path.exists():
            return defaults(pid)
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            if (data['project_id'] != pid or data['schema'] != 1 or type(data['revision']) is not int
                    or data['revision'] < 0 or type(data['enabled']) is not bool):
                raise ValueError()
            validate(data['channels'])
            return data
        except (ValueError, KeyError, TypeError) as exc:
            raise MixerError('保存済みミキサーを読めません。原本を保持しています') from exc


def save(root, pid, revision, channels, enabled=True):
    channels = validate(channels)
    if type(revision) is not int or revision < 0 or type(enabled) is not bool:
        raise MixerError('保存revisionが必要です', 400)
    with LOCK:
        old = read(root, pid)
        if old['revision'] != revision:
            raise MixerError('他の画面で設定が変わりました。保存済みを読み直してください', 409)
        result = {**old, 'revision': revision + 1, 'channels': channels, 'enabled': enabled}
        _atomic(project(root, pid), result)
        return result


def plugins():
    roots = [Path(p) for p in os.environ.get('BAI_VST3_PATHS', '').split(os.pathsep) if p]
    if sys.platform == 'win32':
        roots += [Path(os.environ.get('COMMONPROGRAMFILES', 'C:/Program Files/Common Files')) / 'VST3',
                  Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs/Common/VST3']
    else:
        roots += [Path('/usr/lib/vst3'), Path('/usr/local/lib/vst3'), Path.home() / '.vst3']
    found = {}
    for root in roots:
        if not root.is_dir():
            continue
        # Stop at a VST3 bundle; do not follow arbitrary directory junctions.
        for parent, dirs, files in os.walk(root, followlinks=False):
            for name in dirs[:] + files:
                if not name.lower().endswith('.vst3'):
                    continue
                path = (Path(parent) / name).resolve()
                if name in dirs:
                    dirs.remove(name)
                key = hashlib.sha256(str(path).encode()).hexdigest()
                found[key] = {'id': key, 'name': path.stem, 'path': str(path)}
                if len(found) >= 512:
                    return list(found.values())
    return sorted(found.values(), key=lambda p: p['name'].casefold())


def capabilities():
    available = all(importlib.util.find_spec(m) is not None for m in ('numpy', 'pedalboard')) and all(shutil.which(p) for p in ('ffmpeg','ffprobe'))
    return {'available': available, 'reason': '' if available else 'Pythonへ requirements-audio.txt を導入し、FFmpegを用意してください',
            'mode': 'offline_vst3', 'max_seconds': MAX_SECONDS,
            'plugins': [{k: p[k] for k in ('id', 'name')} for p in plugins()]}


def _plugin_map(channels):
    available = {p['id']: p for p in plugins()}
    result = {}
    for channel in channels.values():
        for insert in channel['inserts']:
            if insert['bypass']:
                continue
            pid = insert['plugin_id']
            if pid not in available:
                raise MixerError('保存したVST3が見つかりません。再検出するかバイパスしてください')
            p = available[pid]
            path = Path(p['path'])
            binaries = [path] if path.is_file() else sorted(q for q in path.rglob('*') if q.is_file())
            result[pid] = {**p, 'fingerprint': hashlib.sha256(json.dumps(
                [(str(q.relative_to(path) if q != path else q.name), sha(q)) for q in binaries], sort_keys=True).encode()).hexdigest()}
    return result


def _child(root, body, timeout, scope=None):
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='host-', dir=root) as temp:
        request = Path(temp) / 'request.json'
        response = Path(temp) / 'response.json'
        request.write_text(json.dumps(body, ensure_ascii=False), encoding='utf-8')
        command = [sys.executable, '-X', 'utf8', '-m', 'bai_studio.v05.audio.worker', str(request), str(response)]
        try:
            from bai_studio.v05.render.process_scope import RenderProcessScope
            with (nullcontext(scope) if scope is not None else RenderProcessScope()) as owned:
                proc = owned.spawn(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                try:
                    proc.wait(timeout=timeout)
                except BaseException:
                    proc.kill()
                    proc.wait()
                    raise
        except subprocess.TimeoutExpired as exc:
            raise MixerError('音声処理が時間切れです。VSTをバイパスして再試行してください', 504) from exc
        if not response.exists():
            raise MixerError('VSTホストが異常終了しました。原音・完成動画は保持しています', 422)
        result = json.loads(response.read_text(encoding='utf-8'))
        if proc.returncode or result.get('error'):
            raise MixerError('音声処理できません：' + str(result.get('error', 'ホスト異常終了'))[:600])
        return result


def inspect(root, plugin_id):
    p = next((p for p in plugins() if p['id'] == plugin_id), None)
    if not p:
        raise MixerError('検出済みのVST3を選択してください', 404)
    if not capabilities()['available']:
        raise MixerError(capabilities()['reason'], 503)
    return _child(root / 'studio_v05_audio', {'action': 'inspect', 'plugin': p}, 35)


def resolved_inputs(root, pid, inventory, asset_id=None):
    from bai_studio.v05.timeline.arrangement import read as arrangement
    from bai_studio.v05.render.media_render import _source, _media_info
    data = arrangement(root / 'studio_v05_arrangements', root / 'studio_v05_catalog.json', pid)
    clips = data['clips']
    if asset_id:
        clips = [{'asset_id': asset_id, 'track': 'audio', 'start': 0, 'source_start': 0, 'duration': None}]
    by_id = {p['id']: p for p in inventory}
    inputs = []
    for clip in clips:
        if clip['track'] not in BUSES[:-1]:
            continue
        entry = by_id.get(clip['asset_id'])
        if not entry or not entry.get('available'):
            raise MixerError('音声を含む元素材が見つかりません')
        path = _source(entry, root / 'library_assets', root / 'studio_v05_asset_sources', root / 'asset_inbox', root / 'integrated_v02/assets')
        if path is None:
            raise MixerError('この登録元の音声は未対応です')
        info = _media_info(shutil.which('ffprobe'), path)
        if not info['audio']:
            if clip['track'] == 'video':
                continue
            raise MixerError('素材の音声を読み込めません')
        c = copy.deepcopy(clip)
        if c['duration'] is None:
            c['duration'] = info['duration']
        if c.get('source_start', 0) + c['duration'] > info['duration'] + .02:
            raise MixerError('音声の配置が元素材の末尾を超えています')
        inputs.append({'clip': c, 'path': str(path), 'kind': 'video' if c['track'] == 'video' else 'audio', 'has_audio': True})
    return data['revision'], inputs


def prepare(root, pid, inventory=None, *, inputs=None, settings=None, duration=None,
            muted=None, asset_id=None, channel='audio', scope=None):
    settings = copy.deepcopy(settings if settings is not None else read(root, pid))
    if not settings['enabled']:
        return {'enabled': False, 'revision': settings['revision']}
    if not capabilities()['available']:
        raise MixerError(capabilities()['reason'], 503)
    if channel not in BUSES[:-1]:
        raise MixerError('素材の送信先が不正です', 400)
    if inputs is None:
        _, inputs = resolved_inputs(root, pid, inventory, asset_id)
    sources = []
    for item in inputs:
        if not item.get('has_audio'):
            continue
        clip = copy.deepcopy(item['clip'])
        if asset_id:
            clip['track'] = channel
        sources.append({'clip': clip, 'path': str(item['path']), 'kind': item['kind'],
                        'sha256': sha(item['path']), 'muted': bool(item.get('audio_muted'))})
    if duration is None:
        duration = max([c['clip']['start'] + c['clip']['duration'] for c in sources] + [.1])
        if not asset_id:
            from bai_studio.v05.timeline.arrangement import read as arrangement
            all_clips = arrangement(root / 'studio_v05_arrangements', root / 'studio_v05_catalog.json', pid)['clips']
            duration = max([c['start'] + c['duration'] for c in all_clips] + [duration])
    if not math.isfinite(duration) or not 0 < duration <= MAX_SECONDS:
        raise MixerError('現在の音声処理は作品の先頭から2時間以内です。配置を確認してください')
    if muted is None:
        from bai_studio.v05.render.media_render import _audio_settings
        muted = [] if asset_id else _audio_settings(root, pid)['muted_tracks']
    plug = _plugin_map(settings['channels'])
    body = {'action': 'render', 'settings': settings, 'sources': sources, 'plugins': plug,
            'duration': duration, 'muted': muted, 'engine': 1}
    key = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    cache = root / 'studio_v05_audio/cache'
    cache.mkdir(parents=True, exist_ok=True)
    output, manifest = cache / (key + '.wav'), cache / (key + '.json')
    with PROCESS_LOCK:
        if output.exists() and manifest.exists():
            result = json.loads(manifest.read_text(encoding='utf-8'))
            if sha(output) == result.get('sha256'):
                return result
        body['output'] = str(output)
        result = _child(root / 'studio_v05_audio', body, max(90, min(3600, duration * 6)), scope)
        if any(sha(s['path']) != s['sha256'] for s in sources):
            raise MixerError('処理中に元素材が変わりました。再試行してください', 409)
        result.update(enabled=True, id=key, revision=settings['revision'], sha256=sha(output),
                      url='/api/studio/v05/audio/file?id=' + key)
        _atomic(manifest, result)
        return result


def output_file(root, key):
    if not isinstance(key, str) or not HEX.fullmatch(key):
        raise MixerError('音声IDが不正です', 400)
    path = root / 'studio_v05_audio/cache' / (key + '.wav')
    if not path.is_file() or not path.with_suffix('.json').is_file():
        raise MixerError('処理済み音声がありません。再処理してください', 404)
    return path
