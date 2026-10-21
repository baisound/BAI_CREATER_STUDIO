"""最小の ASCII FBX 7.4（tests/fixtures/minimal_model.fbx・minimal_motion.fbx）を生成する。標準ライブラリだけ。

P2 設計 O-③-1：FBX の正常な登録を自動テストで確かめるための、three.js の FBXLoader（0.160.1）が読める最小の FBX。
- minimal_model.fbx  : 三角形のメッシュ1つ（アニメーションなし）。モデルA/B の登録に使う。
- minimal_motion.fbx : 同じメッシュ＋位置のアニメーション（0〜1秒、X を 0→1）。モーションの登録に使う。
テスト専用の分岐は本番コードに入れない（FBXLoader で実際に読めることを tests/studio-p2-assets.test.cjs が確かめる）。
使い方: python3 tools/make_test_fbx.py [出力ディレクトリ]
"""
import sys
from pathlib import Path

HEAD = """; FBX 7.4.0 project file
FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
}
GlobalSettings:  {
\tVersion: 1000
\tProperties70:  {
\t\tP: "UpAxis", "int", "Integer", "",1
\t}
}
Objects:  {
\tGeometry: 100, "Geometry::", "Mesh" {
\t\tVertices: *9 {
\t\t\ta: 0,0,0,1,0,0,0,1,0
\t\t}
\t\tPolygonVertexIndex: *3 {
\t\t\ta: 0,1,-3
\t\t}
\t}
\tModel: 200, "Model::Tri", "Mesh" {
\t\tVersion: 232
\t\tProperties70:  {
\t\t}
\t}
"""

ANIM_OBJECTS = """\tAnimationStack: 300, "AnimStack::Take 001", "" {
\t\tProperties70:  {
\t\t\tP: "LocalStop", "KTime", "Time", "",46186158000
\t\t}
\t}
\tAnimationLayer: 301, "AnimLayer::BaseLayer", "" {
\t}
\tAnimationCurveNode: 302, "AnimCurveNode::T", "" {
\t\tProperties70:  {
\t\t\tP: "d|X", "Number", "", "A",0
\t\t\tP: "d|Y", "Number", "", "A",0
\t\t\tP: "d|Z", "Number", "", "A",0
\t\t}
\t}
\tAnimationCurve: 303, "AnimCurve::", "" {
\t\tDefault: 0
\t\tKeyVer: 4009
\t\tKeyTime: *2 {
\t\t\ta: 0,46186158000
\t\t}
\t\tKeyValueFloat: *2 {
\t\t\ta: 0,1
\t\t}
\t}
"""

TAIL_BASE = """}
Connections:  {
\tC: "OO",100,200
\tC: "OO",200,0
"""

TAIL_ANIM = """\tC: "OO",301,300
\tC: "OO",302,301
\tC: "OP",302,200, "Lcl Translation"
\tC: "OP",303,302, "d|X"
"""


def build(with_animation):
    text = HEAD + (ANIM_OBJECTS if with_animation else '') + TAIL_BASE + (TAIL_ANIM if with_animation else '') + "}\n"
    return text.encode('ascii')


if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'tests' / 'fixtures'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'minimal_model.fbx').write_bytes(build(False))
    (out / 'minimal_motion.fbx').write_bytes(build(True))
    print(f'wrote {out}/minimal_model.fbx, minimal_motion.fbx')
