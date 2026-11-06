import json

import pytest

from bai_studio.projects.catalog import _atomic
from bai_studio.v05.timeline.track_layout import set_flags, get
from bai_studio.v05.render import media_render as render


def setup_project(root):
    catalog = root / 'studio_v05_catalog.json'
    _atomic(catalog, {'schema': 1, 'revision': 0, 'projects': [{'id': 'a', 'name': 'a'}]})
    return catalog, root / 'studio_v05_track_layouts'


@pytest.mark.parametrize('muted', ['audio', ['unknown'], ['audio', 'audio'], [True], None])
def test_corrupt_mute_state_is_rejected_without_falling_back_to_audible(tmp_path, muted):
    catalog, folder = setup_project(tmp_path)
    data = get(folder, catalog, 'a')
    data['muted'] = muted
    _atomic(folder / 'a.json', data)
    before = (folder / 'a.json').read_bytes()
    with pytest.raises(render.RenderError, match='ミュート設定'):
        render._audio_settings(tmp_path, 'a')
    assert (folder / 'a.json').read_bytes() == before


def test_old_layout_without_muted_defaults_to_no_audio_mute(tmp_path):
    catalog, folder = setup_project(tmp_path)
    data = get(folder, catalog, 'a')
    del data['muted']
    _atomic(folder / 'a.json', data)
    assert render._audio_settings(tmp_path, 'a') == {'layout_revision': 0, 'muted_tracks': []}


def test_job_freezes_only_audio_state_and_keeps_all_mixer_inputs(tmp_path, monkeypatch):
    catalog, folder = setup_project(tmp_path)
    set_flags(folder, catalog, 'a', 0, ['music'], ['audio', 'video', 'image'])
    clips = [{'kind': kind, 'has_audio': True,
              'clip': {'id': track, 'track': track, 'start': .5, 'duration': 2, 'source_start': .25}}
             for kind, track in [('audio', 'audio'), ('audio', 'music'), ('video', 'video')]]
    monkeypatch.setattr(render, '_snapshot', lambda *a: (
        {'frame_count': 75, 'fps': 30, 'range_start_frame': 0, 'range_end_exclusive': 75}, clips))
    monkeypatch.setattr(render, 'capabilities', lambda *a: {'available': True, 'filter_complex_option': '-filter_complex_script'})
    from bai_studio.v05.timeline import scene_instances
    monkeypatch.setattr(scene_instances, 'read', lambda *a: {'instances': []})
    captured = []
    class DeferredThread:
        def __init__(self, target, args, daemon):
            captured.append(args)
        def start(self):
            pass
    monkeypatch.setattr(render.threading, 'Thread', DeferredThread)
    job = render.start(tmp_path, 'a', 0, 0, '720p', [])
    try:
        assert job['audio_settings'] == {'layout_revision': 1, 'muted_tracks': ['audio', 'video']}
        set_flags(folder, catalog, 'a', 1, ['music'], [])
        queued_clips = captured[0][2]
        assert [c['audio_muted'] for c in queued_clips] == [True, False, True]
        assert all('audio_muted' not in c for c in clips)  # no caller mutation
        graph, frames, _ = render._graph(queued_clips, 30, 16, 16, 0, 75)
        assert frames == 75 and graph.count('volume=0,') == 2
        assert 'amix=inputs=4:' in graph and '[4:v]' in graph
        assert json.loads((tmp_path / 'studio_v05_media_renders/jobs' / (job['id'] + '.json')).read_text())['audio_settings'] == job['audio_settings']
    finally:
        render.ACTIVE.discard(job['id'])
