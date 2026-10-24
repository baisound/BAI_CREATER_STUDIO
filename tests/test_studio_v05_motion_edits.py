"""MOTION-010 stage A storage safety, separate from the real PMX browser test."""
import json
import uuid
from pathlib import Path

import pytest

from studio_v05_motion_edits import MotionEditError, read


def project(tmp_path):
    project_id = str(uuid.uuid4())
    catalog = tmp_path / 'catalog.json'
    catalog.write_text(json.dumps({'schema': 1, 'projects': [{'id': project_id, 'name': 'FK test'}]}),
                       encoding='utf-8')
    return project_id, catalog


def test_missing_store_is_project_scoped_and_not_written(tmp_path):
    project_id, catalog = project(tmp_path)
    root = tmp_path / 'edits'
    result = read(root, catalog, project_id)
    assert result == {'schema': 1, 'project_id': project_id, 'revision': 0,
                      'layers': [], 'history': {'undo': [], 'redo': []}}
    assert not root.exists()
    with pytest.raises(MotionEditError, match='Project not found'):
        read(root, catalog, str(uuid.uuid4()))


@pytest.mark.parametrize('contents', ['{broken',
    json.dumps({'schema': 1, 'project_id': 'wrong', 'revision': 0,
                'layers': [], 'history': {'undo': [], 'redo': []}}),
    json.dumps({'schema': 1, 'project_id': 'REPLACE', 'revision': 0,
                'layers': [], 'history': {'undo': [], 'redo': []}})])
def test_corrupt_store_preserves_original_bytes(tmp_path, contents):
    project_id, catalog = project(tmp_path)
    root = tmp_path / 'edits'
    root.mkdir()
    file = root / (project_id + '.json')
    file.write_text(contents.replace('REPLACE', project_id), encoding='utf-8')
    before = file.read_bytes()
    if 'REPLACE' in contents:
        # Unknown fields cannot be silently discarded on read.
        payload = json.loads(file.read_text(encoding='utf-8'))
        payload['unexpected'] = 1
        file.write_text(json.dumps(payload), encoding='utf-8')
        before = file.read_bytes()
    with pytest.raises(MotionEditError):
        read(root, catalog, project_id)
    assert file.read_bytes() == before
