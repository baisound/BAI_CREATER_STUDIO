"""最小の VMD（tests/fixtures/minimal.vmd）を生成する。標準ライブラリだけ。

P2 設計 §4.2：ヘッダー "Vocaloid Motion Data 0002"（30バイト）＋モデル名20バイト＋
ボーンキー2件（センター の 0F=位置(0,0,0)・30F=位置(0,1,0)）＋モーフのキー2件（あ の 0F で 0、30F で 1。OWNER-4）＋他の件数は0。
使い方: python3 tools/make_test_vmd.py [出力ファイル]
"""
import struct
import sys
from pathlib import Path


def sjis(text, size):
    raw = text.encode('shift_jis')
    assert len(raw) <= size
    return raw + b'\0' * (size - len(raw))


def build_vmd():
    out = sjis('Vocaloid Motion Data 0002', 30) + sjis('テストモデル', 20)
    # ボーンキー 2 件：名前15 / フレーム u32 / 位置 3f / 回転 4f / 補間 64（P2-WP-05a：30F の位置で「ボーンが動く」を確かめる）
    out += struct.pack('<I', 2)
    for frame, y in ((0, 0), (30, 1)):
        out += sjis('センター', 15) + struct.pack('<I', frame) + struct.pack('<3f', 0, y, 0) + struct.pack('<4f', 0, 0, 0, 1)
        out += bytes([20, 20, 107, 107] * 16)
    # モーフキー 2 件：名前15 / フレーム u32 / 値 f
    out += struct.pack('<I', 2)
    out += sjis('あ', 15) + struct.pack('<If', 0, 0.0)
    out += sjis('あ', 15) + struct.pack('<If', 30, 1.0)
    # カメラ・照明・セルフ影・IK は 0 件
    out += struct.pack('<I', 0) * 4
    return out


if __name__ == '__main__':
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'tests' / 'fixtures' / 'minimal.vmd'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(build_vmd())
