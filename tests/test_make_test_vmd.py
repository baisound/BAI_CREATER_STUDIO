"""P2-WP-05a：最小 VMD（tests/fixtures/minimal.vmd）が生成スクリプトの出力と一致し、センターに 0F と 30F のキーがあることを確かめる。"""
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))

import make_test_vmd  # noqa: E402


def test_committed_fixture_matches_generator():
    assert make_test_vmd.build_vmd() == (ROOT / 'tests' / 'fixtures' / 'minimal.vmd').read_bytes()


def test_center_bone_has_keys_at_0f_and_30f_and_morph_has_two_keys():
    data = make_test_vmd.build_vmd()
    assert data[:25] == b'Vocaloid Motion Data 0002'
    p = 50
    (bones,) = struct.unpack_from('<I', data, p)
    p += 4
    assert bones == 2
    keys = []
    for _ in range(bones):
        name = data[p:p + 15].rstrip(b'\0').decode('shift_jis')
        frame, = struct.unpack_from('<I', data, p + 15)
        pos = struct.unpack_from('<3f', data, p + 19)
        keys.append((name, frame, pos))
        p += 15 + 4 + 12 + 16 + 64
    assert keys == [('センター', 0, (0.0, 0.0, 0.0)), ('センター', 30, (0.0, 1.0, 0.0))]
    (morphs,) = struct.unpack_from('<I', data, p)
    assert morphs == 2
