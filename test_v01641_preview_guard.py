"""Regression tests for the read-only GLB comparison preview safeguards."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).parent

def test_preview_guard_node_index_and_quaternion():
    script = """import {inspectPreviewKeys} from './v01641_preview_guard.js';
const key={frame:15,target_node:2,rotation_xyzw:[0,0,0,1]};
if(!inspectPreviewKeys([key],3).ok)process.exit(1);
if(inspectPreviewKeys([key],2).ok)process.exit(2);
if(inspectPreviewKeys([{...key,rotation_xyzw:[0,0,0,0]}],3).ok)process.exit(3);
if(inspectPreviewKeys([{...key,frame:-1}],3).ok)process.exit(4);
if(inspectPreviewKeys('bad',3).ok)process.exit(5);
"""
    subprocess.run(['node', '--experimental-default-type=module', '--input-type=module', '-e', script], cwd=ROOT, check=True)

def test_scrub_uses_guard_and_requires_confirmation():
    source = (ROOT / 'v01633_35_scrub.js').read_text()
    assert 'inspectPreviewKeys(json.keys,glbNodeCount)' in source
    assert "if(!confirmInput.checked)" in source
    assert 'file.onchange=' in source
    assert 'nodeObjects.get' in source
