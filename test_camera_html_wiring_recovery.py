"""Regression guard for required Camera UI nodes and script dependencies."""
import re
from pathlib import Path

ROOT = Path(__file__).parent

def test_camera_all_javascript_direct_nodes_exist():
    html = (ROOT / 'camera.html').read_text(encoding='utf-8')
    ids = re.findall(r'\bid="([^"]+)"', html)
    assert len(ids) == len(set(ids)), 'duplicate HTML element ids'
    for name in ('camera.js', 'camera_3d.js', 'camera_bundle_core.js', 'camera_project_bundle_ui.js'):
        js = (ROOT / name).read_text(encoding='utf-8')
        referenced = set(re.findall(r"\$\('([^']+)'\)", js))
        assert not referenced.difference(ids), f'{name} missing: {referenced.difference(ids)}'

def test_camera_preloads_required_globals_before_consumers():
    html = (ROOT / 'camera.html').read_text(encoding='utf-8')
    scripts = re.findall(r'<script[^>]*src="/([^"]+)"', html)
    for filename in ('camera_lens.js','camera_dof.js','camera_focus_tracking.js',
                     'camera_focus_consistency.js','camera_sequence_playback.js',
                     'camera.js','camera_bundle_core.js','camera_project_bundle_ui.js','camera_3d.js'):
        assert filename in scripts
    for provider in ('camera_lens.js','camera_dof.js','camera_focus_tracking.js',
                     'camera_focus_consistency.js','camera_sequence_playback.js'):
        assert scripts.index(provider) < scripts.index('camera.js')
    assert scripts.index('camera_bundle_core.js') < scripts.index('camera_project_bundle_ui.js')
