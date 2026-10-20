"""自動テスト用の最小 PMX 2.0（P2 設計 §2.4 O-④-2）を生成する。標準ライブラリだけ。

中身：頂点3・面1・テクスチャ1（tex/a.png、相対パス）・材質1・ボーン1（センター）・モーフ1（あ、頂点モーフ）・
表示枠2（Root・表情）・剛体0・ジョイント0。文字コードは UTF-16LE、各インデックスは 1 バイト。
元の素材ではない（形式の仕様だけから作る）。出力は決定的（同じ入力で同じバイト列）。

使い方: python3 tools/make_test_pmx.py [出力ファイル]（既定は標準出力へは書かず、tests/fixtures/minimal.pmx）
通常は tools/make_test_pmx_zip.py がこのモジュールの build_pmx() を呼んで ZIP に入れる。
"""
import struct
import sys
from pathlib import Path

TEXTURE_PATH = 'tex/a.png'  # PMX からの相対パス（ZIP では model/tex/a.png）
VERTICES = (  # (位置, 法線, UV)。高さ 1.0 の三角形（PMX の単位）
    ((-0.5, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0)),
    ((0.5, 0.0, 0.0), (0.0, 0.0, -1.0), (1.0, 1.0)),
    ((0.0, 1.0, 0.0), (0.0, 0.0, -1.0), (0.5, 0.0)),
)
FACE = (0, 1, 2)
BONE_NAME = 'センター'
MORPH_NAME = 'あ'
MORPH_OFFSET = (0.0, 0.2, 0.0)  # 頂点2を上へ


def _text(s):
    data = s.encode('utf-16-le')
    return struct.pack('<i', len(data)) + data


def _f(*values):
    return struct.pack('<' + 'f' * len(values), *values)


def build_pmx():
    out = bytearray()
    # ヘッダー：署名・版・グローバル8項目（文字コード UTF-16LE=0、追加UV 0、各インデックスのサイズ 1）
    out += b'PMX ' + _f(2.0) + bytes([8, 0, 0, 1, 1, 1, 1, 1, 1])
    out += _text('最小テスト') + _text('minimal test') + _text('BAI 自動テスト用（生成物）') + _text('generated for tests')
    # 頂点：位置・法線・UV・変形 BDEF1（ボーン0）・エッジ倍率
    out += struct.pack('<i', len(VERTICES))
    for pos, normal, uv in VERTICES:
        out += _f(*pos, *normal, *uv) + bytes([0]) + struct.pack('<b', 0) + _f(1.0)
    # 面：頂点インデックスの数（3）と、各インデックス（頂点は符号なし1バイト）
    out += struct.pack('<i', len(FACE)) + bytes(FACE)
    # テクスチャ
    out += struct.pack('<i', 1) + _text(TEXTURE_PATH)
    # 材質：拡散4・反射3・反射強度・環境3・描画フラグ・エッジ色4・エッジサイズ・テクスチャ・スフィア・スフィアモード・共有トゥーン・トゥーン番号・メモ・面の頂点数
    out += struct.pack('<i', 1)
    out += _text('材質1') + _text('material1')
    out += _f(1.0, 1.0, 1.0, 1.0) + _f(0.0, 0.0, 0.0) + _f(5.0) + _f(0.5, 0.5, 0.5)
    out += bytes([0x01])  # 両面描画
    out += _f(0.0, 0.0, 0.0, 1.0) + _f(1.0)
    out += struct.pack('<bb', 0, -1) + bytes([0])  # テクスチャ0、スフィアなし、スフィアモード無効
    out += bytes([1, 0])  # 共有トゥーン toon01
    out += _text('') + struct.pack('<i', len(FACE))
    # ボーン：名前・位置・親(-1)・変形階層・フラグ（回転可・表示・操作可、接続先は位置オフセット）・接続先
    out += struct.pack('<i', 1)
    out += _text(BONE_NAME) + _text('center') + _f(0.0, 0.0, 0.0) + struct.pack('<b', -1)
    out += struct.pack('<i', 0) + struct.pack('<H', 0x0002 | 0x0008 | 0x0010) + _f(0.0, 1.0, 0.0)
    # モーフ：名前・パネル（3=口）・種類（1=頂点）・オフセット数・（頂点・移動量）
    out += struct.pack('<i', 1)
    out += _text(MORPH_NAME) + _text('a') + bytes([3, 1]) + struct.pack('<i', 1) + bytes([2]) + _f(*MORPH_OFFSET)
    # 表示枠：Root（ボーン0）と 表情（モーフ0）。特殊枠フラグ 1
    out += struct.pack('<i', 2)
    out += _text('Root') + _text('Root') + bytes([1]) + struct.pack('<i', 1) + bytes([0]) + struct.pack('<b', 0)
    out += _text('表情') + _text('Exp') + bytes([1]) + struct.pack('<i', 1) + bytes([1]) + struct.pack('<b', 0)
    # 剛体・ジョイント
    out += struct.pack('<i', 0) + struct.pack('<i', 0)
    return bytes(out)


if __name__ == '__main__':
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'tests' / 'fixtures' / 'minimal.pmx'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(build_pmx())
