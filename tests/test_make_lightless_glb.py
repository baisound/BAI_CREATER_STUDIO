import json
import struct
from pathlib import Path

import pytest

from tools.make_lightless_glb import make_lightless


def tiny_glb(path: Path, with_light: bool = True):
    doc = {
        'asset': {'version': '2.0'},
        'nodes': [{'extensions': {'KHR_lights_punctual': {'light': 0}}}] if with_light else [{}],
        'buffers': [{'byteLength': 4}],
        'extensionsUsed': ['KHR_lights_punctual'] if with_light else [],
        'extensions': {'KHR_lights_punctual': {'lights': [{'type': 'point', 'intensity': 90}]}} if with_light else {},
    }
    encoded = json.dumps(doc).encode()
    encoded += b' ' * (-len(encoded) % 4)
    tail = struct.pack('<II', 4, 0x004E4942) + b'ABCD'
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(tail))
                     + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + tail)
    return path.read_bytes(), tail


def test_removes_only_light_extension_and_preserves_binary(tmp_path):
    source, output = tmp_path / 'in.glb', tmp_path / 'out.glb'
    original, tail = tiny_glb(source)
    report = make_lightless(source, output)
    assert report['lights_removed'] == 1
    assert source.read_bytes() == original
    created = output.read_bytes()
    assert created.endswith(tail)
    assert struct.unpack('<I', created[8:12])[0] == len(created)
    json_size = struct.unpack('<I', created[12:16])[0]
    doc = json.loads(created[20:20 + json_size])
    assert doc['nodes'] == [{}]
    assert 'KHR_lights_punctual' not in json.dumps(doc)


def test_rejects_missing_lights_and_existing_destination(tmp_path):
    source, output = tmp_path / 'in.glb', tmp_path / 'out.glb'
    tiny_glb(source, with_light=False)
    with pytest.raises(ValueError, match='no KHR_lights_punctual'):
        make_lightless(source, output)
    assert not output.exists()
    tiny_glb(source)
    output.write_bytes(b'keep')
    with pytest.raises(FileExistsError):
        make_lightless(source, output)
    assert output.read_bytes() == b'keep'
