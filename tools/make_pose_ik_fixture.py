"""手動IKポーズ補助の照合用データ（tests/fixtures/pose_ik_template_solved.json）を生成する。標準ライブラリ＋リポジトリの pose_ik.py だけ。

P2 設計 §2.8(f)：旧 pose_ik_ui.js:4 の template を /api/pose/solve と同じ計算（pose_ik.validate_pose）にかけた結果を固定する。
pose_ik.py が変わると tests/test_pose_ik_fixture.py が失敗して気づける。
使い方: python3 tools/make_pose_ik_fixture.py [出力ファイル]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bai_studio.motion.pose_ik import validate_pose  # noqa: E402

# pose_ik_ui.js:4 の template と同じ値
TEMPLATE = {
    'schema': 1, 'frame': 0,
    'limbs': {
        'leftArm': {'base': [-0.2, 1.5], 'target': [-0.8, 1.14], 'upper': 0.42, 'lower': 0.4, 'bend': 1},
        'rightArm': {'base': [0.2, 1.5], 'target': [0.8, 1.14], 'upper': 0.42, 'lower': 0.4, 'bend': -1},
        'leftLeg': {'base': [-0.14, 1.0], 'target': [-0.2, 0.13], 'upper': 0.5, 'lower': 0.48, 'bend': 1},
        'rightLeg': {'base': [0.14, 1.0], 'target': [0.25, 0.13], 'upper': 0.5, 'lower': 0.48, 'bend': -1},
    },
}


def build_fixture():
    """固定のテキスト（キー順・インデント・末尾の改行まで決まっている）。"""
    return json.dumps(validate_pose(TEMPLATE), ensure_ascii=False, indent=2) + '\n'


if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tests' / 'fixtures' / 'pose_ik_template_solved.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(build_fixture().encode('utf-8'))
    print(f'wrote {out}')
