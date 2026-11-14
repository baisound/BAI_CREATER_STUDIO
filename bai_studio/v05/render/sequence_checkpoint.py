"""Durable, immutable-source PNG prefixes. No arbitrary input/output paths."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import os
from pathlib import Path

from bai_studio.projects.catalog import _atomic
from .png_sequence import SequenceError, check_size, _digest


def digest(path):
    with path.open('rb') as stream:
        return _digest(stream)


def folder(root, job_id):
    if not isinstance(job_id, str) or not re.fullmatch('[0-9a-f]{32}', job_id):
        raise SequenceError('再開元のジョブIDが不正です。', 400)
    parent = root / 'checkpoints'
    path = parent / job_id
    if parent.resolve() != root.resolve() / 'checkpoints' or path.resolve() != parent.resolve() / job_id:
        raise SequenceError('連番の保持先がジョブ領域外です。')
    return path


def safe_file(base, name):
    path = base / name
    if path.resolve() != base.resolve() / name or path.is_symlink():
        raise SequenceError('保持した連番の参照先が変わりました。先頭から書き出してください。')
    return path


def identity(data_root, job, inputs, ffmpeg, ffprobe):
    """Compare semantic state plus bytes, including unsaved-by-render FK edits."""
    from bai_studio.v05.motion.motion_edits import read as read_edits
    selected = {k: job[k] for k in ('project_id', 'preset', 'resolution', 'fps',
        'range_start_frame', 'range_end_exclusive', 'frame_count', 'range_revision',
        'arrangement_revision', 'scene_revision', 'settings_revision', 'background',
        'audio_settings', 'mixer_settings')}
    selected['inputs'] = sorted([{
        'asset_id': i['asset_id'], 'path': str(i['path'].resolve()), 'kind': i['kind'],
        'clip': i['clip'], 'audio_muted': i.get('audio_muted'),
        'bytes': i['path'].stat().st_size, 'sha256': digest(i['path'])} for i in inputs],
        key=lambda i: (i['path'], i['clip']['id']))
    if job['scene_revision'] is not None:
        # Inventory availability/name fields do not affect rendering. Saved files
        # are fingerprinted directly to cover legacy scene and all transform data.
        for directory in ('studio_v05_scene_instances', 'studio_v05_scene_models', 'studio_v05_motion_edits'):
            p = data_root / directory / (job['project_id'] + '.json')
            selected[directory] = digest(p) if p.is_file() else None
        selected['motion_edits'] = read_edits(data_root/'studio_v05_motion_edits',
            data_root/'studio_v05_catalog.json', job['project_id'])
    source = Path(__file__).resolve().parents[3]
    paths = list((source/'bai_studio').rglob('*.py'))
    paths += [p for p in (source/'studio').rglob('*') if p.suffix in {'.js','.mjs','.wasm'} and 'reviews' not in p.parts]
    paths += [p for p in source.iterdir() if p.is_file() and p.suffix in {'.js','.mjs','.wasm'}]
    paths += [source/'tools'/'render_v05_scene_frames.cjs', Path(ffmpeg), Path(ffprobe)]
    paths += [source/'server.py',source/'studio'/'v05'/'index.html']
    # Include local renderer libraries, which may change without a Git commit.
    paths += [p for p in (source/'node_modules'/'three').rglob('*') if p.suffix in {'.js','.mjs','.wasm'}]
    if job['scene_revision'] is not None:
        for executable in [shutil.which('node'), os.environ.get('CHROMIUM_PATH'), os.environ.get('CHROMIUM'),
                'C:/Program Files/Google/Chrome/Application/chrome.exe',
                'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']:
            if executable and Path(executable).is_file():paths.append(Path(executable))
    selected['implementation'] = {str(p): digest(p) for p in sorted(set(paths))}
    raw = json.dumps(selected, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(raw).hexdigest()


def begin(root, job, fingerprint):
    base = folder(root, job['id'])
    base.mkdir(parents=True, exist_ok=False)
    record = {'schema': 1, 'job_id': job['id'], 'identity': fingerprint,
              'width': job['checkpoint_width'], 'height': job['checkpoint_height'],
              'frame_count': job['frame_count'], 'frames': []}
    _atomic(base/'checkpoint.json', record)
    return record


def _frame(base, name, width, height):
    from PIL import Image
    path = safe_file(base, name)
    with Image.open(path) as im:
        im.load()
        if im.format != 'PNG' or im.mode != 'RGBA' or im.size != (width, height):
            raise SequenceError('保持したPNGの寸法・RGBAが一致しません。先頭から書き出してください。')
    return {'file': name, 'sha256': digest(path), 'bytes': path.stat().st_size}


def load(root, job_id, fingerprint=None, *, verify=True):
    base = folder(root, job_id)
    try:
        record = json.loads(safe_file(base, 'checkpoint.json').read_text(encoding='utf-8'))
        if (record['schema'] != 1 or record['job_id'] != job_id or
                type(record['frame_count']) is not int or not 0 <= len(record['frames']) <= record['frame_count']):
            raise ValueError()
        if record.get('invalid'):
            raise SequenceError('出力中に保存状態または原素材が変わった連番です。先頭から書き出してください。',409)
        if fingerprint is not None and record['identity'] != fingerprint:
            raise SequenceError('保存状態・範囲・原素材または描画環境が再開元と異なります。先頭から書き出してください。', 409)
        for index, row in enumerate(record['frames'], 1):
            name = f'frame_{index:06d}.png'
            if (row['file'] != name or safe_file(base,name).stat().st_size != row['bytes'] or
                    (verify and _frame(base, name, record['width'], record['height']) != row)):
                raise SequenceError('保持した連番に欠番または改変があります。先頭から書き出してください。', 409)
        if record.get('scene'):
            scene_path = safe_file(base, 'scene.mkv')
            if (scene_path.stat().st_size != record['scene']['bytes'] or
                    (verify and digest(scene_path) != record['scene']['sha256'])):
                raise SequenceError('保持した3D撮影データが変わりました。先頭から書き出してください。',409)
        check_size(base)
        return record
    except SequenceError:
        raise
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise SequenceError('検証済み連番を読み込めません。元データを保持しています。先頭から書き出してください。', 409) from exc


def seal(root, job, record, *, writing=False):
    """Only append complete contiguous images; never adopt a damaged tail."""
    base = folder(root, job['id'])
    check_size(base)
    end = len(record['frames'])
    while end < job['frame_count']:
        name = f'frame_{end+1:06d}.png'
        # FFmpeg may still be writing its newest PNG.
        if not (base/name).is_file() or (writing and not (base/f'frame_{end+2:06d}.png').is_file()):
            break
        try:
            row = _frame(base, name, record['width'], record['height'])
        except (OSError, ValueError, SequenceError):
            break
        record['frames'].append(row)
        end += 1
    _atomic(base/'checkpoint.json', record)
    job['verified_frames'] = len(record['frames'])
    job['resume_available'] = bool(record['frames'])
    return len(record['frames'])


def copy_prefix(root, old_id, job, fingerprint):
    old = load(root, old_id, fingerprint)
    record = begin(root, job, fingerprint)
    source, target = folder(root, old_id), folder(root, job['id'])
    for row in old['frames']:
        shutil.copyfile(safe_file(source, row['file']), target/row['file'])
        if _frame(target, row['file'], record['width'], record['height']) != row:
            raise SequenceError('連番複製中に内容が変わりました。再開を停止します。', 409)
        record['frames'].append(row)
    if old.get('scene'):
        shutil.copyfile(safe_file(source,'scene.mkv'),target/'scene.mkv')
        if digest(target/'scene.mkv') != old['scene']['sha256']:
            raise SequenceError('3D撮影データの複製検査に失敗しました。',409)
        record['scene'] = old['scene']
    _atomic(target/'checkpoint.json', record)
    return record


def retain_scene(root,job,record,source):
    target = folder(root,job['id'])/'scene.mkv'
    shutil.copyfile(source,target)
    record['scene'] = {'bytes':target.stat().st_size, 'sha256':digest(target),
                       'capture':job['scene_capture']}
    if record['scene']['sha256'] != job['scene_capture']['intermediate_sha256']:
        raise SequenceError('3D撮影データを保持できません。再開用に採用しません。')
    _atomic(folder(root,job['id'])/'checkpoint.json',record)
