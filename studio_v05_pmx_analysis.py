"""Read-only analysis of a registered PMX; never accept a client filesystem path."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path


class PmxAnalysisError(ValueError):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def inspect(asset_id: str, assets: list[dict], source_for, expected_hash: str | None = None) -> dict:
    if not isinstance(asset_id, str) or not 0 < len(asset_id) <= 300:
        raise PmxAnalysisError('Invalid PMX asset ID', 400)
    if expected_hash is not None and not re.fullmatch(r'[0-9a-f]{64}', expected_hash):
        raise PmxAnalysisError('Invalid PMX model hash', 400)
    entry = next((item for item in assets if item.get('id') == asset_id), None)
    if not entry or not entry.get('available') or entry.get('format') != 'PMX':
        raise PmxAnalysisError('Registered PMX asset not found', 404)
    source = source_for(entry)
    if source is None:
        raise PmxAnalysisError('Registered PMX source unavailable', 404)
    source = Path(source)
    helper = Path(__file__).resolve().parent / 'tools' / 'pmx_morph_analysis.mjs'
    node = shutil.which('node')
    if not node or not source.is_file() or source.suffix.lower() != '.pmx' or not helper.is_file():
        raise PmxAnalysisError('PMX analysis unavailable')
    try:
        if source.stat().st_size > 300 * 1024 * 1024:
            raise PmxAnalysisError('PMX analysis input too large', 413)
        result = subprocess.run([node, str(helper), str(source)], capture_output=True,
                                text=True, encoding='utf-8', errors='replace', timeout=30,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode or len(result.stdout) > 5_000_000:
            raise PmxAnalysisError('PMX analysis failed')
        measured = json.loads(result.stdout)
        if (not isinstance(measured, dict) or measured.get('schema') != 1
                or not re.fullmatch(r'[0-9a-f]{64}', measured.get('modelHash', ''))
                or not re.fullmatch(r'[0-9a-f]{64}', measured.get('analysisHash', ''))
                or not isinstance(measured.get('morphs'), list)
                or not isinstance(measured.get('overlaps'), list)):
            raise PmxAnalysisError('PMX analysis result invalid')
        if _sha256(source) != measured['modelHash']:
            raise PmxAnalysisError('PMX source changed during analysis', 409)
        if expected_hash is not None and expected_hash != measured['modelHash']:
            raise PmxAnalysisError('PMX model hash changed', 409)
        return {'asset_id': asset_id, **measured}
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        raise PmxAnalysisError('PMX analysis failed') from exc
