"""O-④-2：最小 PMX の生成物（tests/fixtures/minimal_pmx.zip）が生成スクリプトの出力と一致することを確かめる。"""
import struct
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))

import make_test_pmx  # noqa: E402
import make_test_pmx_zip  # noqa: E402


def test_pmx_header_is_pmx20_utf16_with_1byte_indices():
    data = make_test_pmx.build_pmx()
    assert data[:4] == b'PMX '
    assert struct.unpack('<f', data[4:8])[0] == 2.0
    assert data[8:17] == bytes([8, 0, 0, 1, 1, 1, 1, 1, 1])


def test_committed_fixture_matches_generator(tmp_path):
    out = tmp_path / 'minimal_pmx.zip'
    make_test_pmx_zip.build_zip(out)
    assert out.read_bytes() == (ROOT / 'tests' / 'fixtures' / 'minimal_pmx.zip').read_bytes()
    with zipfile.ZipFile(out) as z:
        assert z.read('model/test.pmx') == make_test_pmx.build_pmx()
        assert sorted(z.namelist()) == ['model/test.pmx', 'model/tex/a.png']
