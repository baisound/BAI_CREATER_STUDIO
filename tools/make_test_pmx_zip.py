"""最小の PMX を含む ZIP（tests/fixtures/minimal_pmx.zip）を生成する。標準ライブラリだけ。

P2 設計 §4.2：model/test.pmx と model/tex/a.png（1x1）。
O-④-2（最小 PMX の作り方）は未決定のため、test.pmx は "PMX " で始まるダミー（実在する PMX の読込には使えない）。
このダミーは ③ の登録のテストだけに使う。使い方: python3 tools/make_test_pmx_zip.py [出力ファイル]
"""
import struct
import sys
import zipfile
import zlib
from pathlib import Path

FIXED_TIME = (2026, 1, 1, 0, 0, 0)  # 決定的な出力にする


def png_1x1():
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b'\x00\xff\xff\xff\xff')) + chunk(b'IEND', b''))


def build_zip(path):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in (('model/test.pmx', b'PMX ' + struct.pack('<f', 2.0) + b'\0' * 16),
                           ('model/tex/a.png', png_1x1())):
            info = zipfile.ZipInfo(name, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)


if __name__ == '__main__':
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'tests' / 'fixtures' / 'minimal_pmx.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    build_zip(target)
