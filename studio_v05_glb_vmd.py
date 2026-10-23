"""Bounded GLB-to-PMX VMD conversion for the v0.5 project workflow."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path


class ConversionError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _registered(data, asset_id, items, *, kind, fmt, source):
    entry = next((x for x in items if x.get('id') == asset_id and x.get('available')), None)
    if not entry or entry.get('source') != source or entry.get('format') != fmt:
        raise ConversionError('Registered ' + fmt + ' asset required')
    if source == 'integrated' and entry.get('kind') == kind:
        root = data / 'integrated_v02' / 'assets'
        path = root / entry['filename']
    elif source == 'mmd' and entry.get('kind') in ('A', 'B') and kind == 'model':
        root = data / 'mmd' / entry['kind']
        path = root / entry['name']
    else:
        raise ConversionError('Unsupported registered asset kind')
    root = root.resolve()
    path = path.resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ConversionError('Registered source file is unavailable')
    return entry, path


def candidates(data, items, project_id, scene_root, catalog):
    from studio_v05_scene_instances import read as scene_read
    scene = scene_read(scene_root, data / 'studio_v05_scene_models', catalog, project_id, items)
    sources = [{'id': e['id'], 'name': e['name']} for e in items
               if e.get('available') and e.get('source') == 'integrated'
               and e.get('kind') == 'motion' and e.get('format') == 'GLB']
    targets = []
    for instance in scene['instances']:
        entry = next((e for e in items if e.get('id') == instance.get('asset_id')), None)
        if entry and entry.get('available') and entry.get('source') == 'mmd' and entry.get('format') == 'PMX':
            targets.append({'instance_id': instance['id'], 'asset_id': entry['id'], 'name': entry['name']})
    return {'project_id': project_id, 'sources': sources, 'targets': targets,
            'note': '生成VMDは確認用です。PMX固有のIK・接地はプレビューで確認してください。'}


def inspect_profile(data, source_id, target_id, items):
    from studio_v05_glb_vmd_map import inspect
    _, source = _registered(data, source_id, items, kind='motion', fmt='GLB', source='integrated')
    _, target = _registered(data, target_id, items, kind='model', fmt='PMX', source='mmd')
    return {'source_asset_id': source_id, 'target_asset_id': target_id, **inspect(data, source, target)}


def save_profile(data, source_id, target_id, revision, overrides, items):
    from studio_v05_glb_vmd_map import save
    _, source = _registered(data, source_id, items, kind='motion', fmt='GLB', source='integrated')
    _, target = _registered(data, target_id, items, kind='model', fmt='PMX', source='mmd')
    return {'source_asset_id': source_id, 'target_asset_id': target_id,
            **save(data, source, target, revision, overrides)}


def convert(data, base, source_id, target_id, items, blender, mmd_lock, read_mmd, write_mmd,
            profile_revision=None):
    source_entry, source = _registered(data, source_id, items, kind='motion', fmt='GLB', source='integrated')
    _, target = _registered(data, target_id, items, kind='model', fmt='PMX', source='mmd')
    profile = inspect_profile(data, source_id, target_id, items)
    if profile_revision is not None and (type(profile_revision) is not int or profile_revision != profile['revision']):
        raise ConversionError('Mapping revision conflict; reload bone mapping', 409)
    if not blender:
        raise ConversionError('Blenderが見つかりません。MIXAMO_BLENDERを設定してください。', 503)
    executable = shutil.which(blender)
    if not executable:
        raise ConversionError('Blenderが見つかりません。MIXAMO_BLENDERを設定してください。', 503)
    source_sha, target_sha = _sha(source), _sha(target)
    with tempfile.TemporaryDirectory(prefix='glb-vmd-', dir=data) as temp_name:
        temp = Path(temp_name)
        output = temp / 'candidate.vmd'
        job = temp / 'job.json'
        job.write_text(json.dumps({'source': str(source), 'target': str(target),
                                   'output': str(output), 'fps': 30,
                                   'mapping_overrides': profile['overrides']}, ensure_ascii=False), encoding='utf-8')
        try:
            process = subprocess.run([executable, '-b', '-t', '2', '--python',
                                      str(base / 'tools' / 'glb_to_vmd_candidate.py'), '--', '--job', str(job)],
                                     cwd=base, capture_output=True, text=True, errors='replace', timeout=600)
        except subprocess.TimeoutExpired as exc:
            raise ConversionError('Blenderの変換が10分を超えました。', 504) from exc
        if process.returncode:
            diagnostic = (process.stdout + '\n' + process.stderr)[-500:].strip()
            raise ConversionError('Blender変換に失敗しました: ' + diagnostic, 422)
        marker = 'BAI_GLB_VMD_RESULT '
        line = next((line[len(marker):] for line in process.stdout.splitlines() if line.startswith(marker)), None)
        try:
            result = json.loads(line) if line else None
        except ValueError:
            result = None
        if not isinstance(result, dict) or result.get('source_sha256') != source_sha or result.get('target_sha256') != target_sha:
            raise ConversionError('変換結果と入力ハッシュが一致しません。', 422)
        if _sha(source) != source_sha or _sha(target) != target_sha:
            raise ConversionError('変換中に入力素材が変更されました。', 409)
        if not output.is_file() or not 100 < output.stat().st_size < 120 * 1024 * 1024:
            raise ConversionError('VMD出力がありません、または大きすぎます。', 422)
        with output.open('rb') as stream:
            if stream.read(30).split(b'\0', 1)[0] != b'Vocaloid Motion Data 0002':
                raise ConversionError('VMDヘッダーが不正です。', 422)
        frame_count = result.get('frames')
        if type(frame_count) is not int or not 2 <= frame_count <= 18001:
            raise ConversionError('VMDフレーム数が不正です。', 422)
        filename = 'glb_v05_' + uuid.uuid4().hex + '.vmd'
        folder = data / 'mmd' / 'vmd'
        folder.mkdir(parents=True, exist_ok=True)
        destination = folder / filename
        output_sha = _sha(output)
        with mmd_lock:
            # The generated file is always uniquely named; originals are never replaced.
            if destination.exists():
                raise ConversionError('変換先VMD名が重複しました。', 409)
            os.replace(output, destination)
            try:
                meta = read_mmd()
                meta.setdefault('vmd', []).append({
                    'name': filename, 'size': destination.stat().st_size,
                    'source_asset_id': source_id, 'target_asset_id': target_id,
                    'source_sha256': source_sha, 'target_sha256': target_sha,
                    'sha256': output_sha, 'review_status': 'needs_visual_validation',
                    'mapping_profile_key': profile['profile_key'],
                    'mapping_revision': profile['revision']})
                write_mmd(meta)
            except Exception:
                destination.unlink(missing_ok=True)
                raise
    return {'asset_id': 'mmd:vmd:' + filename, 'name': filename,
            'source_asset_id': source_id, 'target_asset_id': target_id,
            'source_name': source_entry['name'], 'sha256': output_sha,
            'source_sha256': source_sha, 'target_sha256': target_sha,
            'duration_seconds': round((frame_count - 1) / 30, 4),
            'mapped_bones': result['mapped_bones'], 'bone_keys': result['bone_keys'],
            'mapping_profile_key': profile['profile_key'], 'mapping_revision': profile['revision'],
            'review_status': 'needs_visual_validation', 'warnings': result.get('warnings', [])}
