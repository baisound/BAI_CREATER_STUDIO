"""Make a new GLB without KHR_lights_punctual; preserve every non-JSON chunk byte for byte.

Usage: python tools/make_lightless_glb.py SOURCE.glb OUTPUT.glb
The source and an existing output are never overwritten.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import struct
from pathlib import Path


JSON_CHUNK = 0x4E4F534A


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(part)
    return digest.hexdigest()


def make_lightless(source: Path, output: Path) -> dict:
    source = source.resolve(strict=True)
    output = output.resolve()
    if source == output or output.exists():
        raise FileExistsError(f'output must be a new path: {output}')
    if source.suffix.lower() != '.glb' or output.suffix.lower() != '.glb':
        raise ValueError('both paths must end in .glb')

    with source.open('rb') as stream:
        header = stream.read(12)
        if len(header) != 12:
            raise ValueError('truncated GLB header')
        magic, version, old_length = struct.unpack('<4sII', header)
        if magic != b'glTF' or version != 2 or old_length != source.stat().st_size:
            raise ValueError('invalid GLB header or length')
        json_header = stream.read(8)
        if len(json_header) != 8:
            raise ValueError('missing GLB JSON chunk')
        json_length, kind = struct.unpack('<II', json_header)
        if kind != JSON_CHUNK or json_length > old_length - 20 or json_length % 4:
            raise ValueError('invalid GLB JSON chunk')
        original = json.loads(stream.read(json_length))
        tail_start = stream.tell()
        light_defs = original.get('extensions', {}).get('KHR_lights_punctual', {}).get('lights', [])
        if not light_defs:
            raise ValueError('GLB has no KHR_lights_punctual lights')

        clean = json.loads(json.dumps(original))
        for node in clean.get('nodes', []):
            extensions = node.get('extensions', {})
            extensions.pop('KHR_lights_punctual', None)
            if not extensions:
                node.pop('extensions', None)
        clean.get('extensions', {}).pop('KHR_lights_punctual', None)
        if clean.get('extensions') == {}:
            clean.pop('extensions', None)
        for key in ('extensionsUsed', 'extensionsRequired'):
            if key in clean:
                clean[key] = [name for name in clean[key] if name != 'KHR_lights_punctual']
                if not clean[key]:
                    del clean[key]
        encoded = json.dumps(clean, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        encoded += b' ' * (-len(encoded) % 4)
        new_length = 20 + len(encoded) + old_length - tail_start
        if new_length > 0xFFFFFFFF:
            raise ValueError('GLB exceeds the 4 GiB format limit')

        output.parent.mkdir(parents=True, exist_ok=True)
        try:
            with output.open('xb') as target:
                target.write(struct.pack('<4sII', b'glTF', 2, new_length))
                target.write(struct.pack('<II', len(encoded), JSON_CHUNK))
                target.write(encoded)
                shutil.copyfileobj(stream, target, length=1024 * 1024)
                target.flush()
                os.fsync(target.fileno())
            if output.stat().st_size != new_length:
                raise ValueError('written GLB length differs from header')
            with output.open('rb') as check:
                check.seek(20)
                verified = json.loads(check.read(len(encoded)))
                if verified != clean or 'KHR_lights_punctual' in json.dumps(verified):
                    raise ValueError('light extension remained in new GLB')
                check.seek(20 + len(encoded))
                new_tail_hash = hashlib.file_digest(check, 'sha256').hexdigest()
            stream.seek(tail_start)
            old_tail_hash = hashlib.file_digest(stream, 'sha256').hexdigest()
            if new_tail_hash != old_tail_hash:
                raise ValueError('non-JSON GLB chunks changed')
        except Exception:
            output.unlink(missing_ok=True)
            raise

    return {
        'source': str(source), 'output': str(output),
        'lights_removed': len(light_defs),
        'source_sha256': sha256(source), 'output_sha256': sha256(output),
        'non_json_chunks_sha256': old_tail_hash,
        'source_bytes': old_length, 'output_bytes': new_length,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(make_lightless(args.source, args.output), ensure_ascii=False, indent=2))
