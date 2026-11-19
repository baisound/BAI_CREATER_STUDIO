import pytest
from bai_studio.projects.catalog import create,set_fps,clear_fps
from bai_studio.v05.lip import srt_sources,lip_readings,lip_candidates,lip_drafts
from bai_studio.v05.render import render_range


def prepared(tmp_path,fps=None):
    catalog=tmp_path/'catalog.json';project=create(catalog,'同じ時計')['id']
    if fps is not None:set_fps(catalog,project,fps)
    source_root,reading_root=tmp_path/'sources',tmp_path/'readings'
    source=srt_sources.register(source_root,catalog,project,0,'cue.srt','utf-8',b'1\n00:00:01,000 --> 00:00:03,000\nA\n')['sources'][0]
    lip_readings.set_reading(reading_root,catalog,source_root,project,0,source['id'],source['sha256'],1,'confirmed','あい',False)
    return catalog,project,source_root,reading_root,source


@pytest.mark.parametrize('fps',[None,24,29.97,30,60])
def test_lip_and_render_resolve_the_same_default_and_explicit_fps(tmp_path,fps):
    catalog,project,sources,readings,source=prepared(tmp_path,fps)
    lip=lip_candidates.propose(catalog,sources,readings,project,source['id'],1)
    output=render_range.read(tmp_path/'ranges',tmp_path/'arrangements',catalog,project)
    assert lip['projectFps']==output['fps']==(60 if fps is None else fps)
    assert lip['segments'][0]['startFrame']==round(lip['projectFps'])


def test_old_30fps_draft_is_flagged_without_retiming_or_overwriting(tmp_path):
    catalog,project,sources,readings,source=prepared(tmp_path,30)
    candidate=lip_candidates.propose(catalog,sources,readings,project,source['id'],1)
    segments=[{key:row[key] for key in ('startFrame','endFrame','mouthShape')}|{'weight':1} for row in candidate['segments']]
    lip_drafts.save(tmp_path/'drafts',catalog,sources,readings,project,0,source['id'],source['sha256'],1,candidate['pronunciationVersion'],30,segments)
    path=tmp_path/'drafts'/(project+'.json');before=path.read_bytes()
    clear_fps(catalog,project)
    saved=lip_drafts.read(tmp_path/'drafts',catalog,sources,readings,project)['drafts'][0]
    assert saved['draftStatus']=='fps_changed'
    assert saved['projectFps']==30 and saved['segments']==segments
    assert path.read_bytes()==before
