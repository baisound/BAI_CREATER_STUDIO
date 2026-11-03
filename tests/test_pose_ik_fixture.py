"""P2-WP-08a：tests/fixtures/pose_ik_template_solved.json が生成スクリプトの出力とバイト一致することを確かめる。
pose_ik.py の計算が変わったら、ここが失敗して気づける（新UIの照合 tests/studio-p2-pose-ik-fork.test.mjs が固定値を使うため）。"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))

import make_pose_ik_fixture  # noqa: E402


def test_committed_fixture_matches_generator():
    assert make_pose_ik_fixture.build_fixture().encode('utf-8') == (ROOT / 'tests' / 'fixtures' / 'pose_ik_template_solved.json').read_bytes()


def test_fixture_has_four_reachable_limbs():
    data = json.loads(make_pose_ik_fixture.build_fixture())
    assert list(data['limbs']) == ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']
    assert all(limb['reachable'] for limb in data['limbs'].values())
