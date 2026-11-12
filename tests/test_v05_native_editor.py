import pytest
from bai_studio.projects.catalog import create,_atomic
from bai_studio.v05.audio import mixer,editor

@pytest.fixture
def staged(tmp_path):
    pid=create(tmp_path/'studio_v05_catalog.json','固有GUI')['id'];settings=mixer.defaults(pid)
    insert={'plugin_id':'a'*64,'parameters':{'gain':.5},'bypass':False}
    settings['tracks']={'audio:1':{'gain_db':0,'solo':False,'inserts':[insert]}}
    saved=mixer.save(tmp_path,pid,0,settings['channels'],True,settings['tracks'])
    sid='b'*32;folder=editor.folder(tmp_path,sid);folder.mkdir(parents=True)
    record={'id':sid,'project_id':pid,'key':'audio:1','index':0,'revision':saved['revision'],'plugin_id':insert['plugin_id'],'name':'test','fingerprint':editor.fingerprint(insert),'status':'editing'}
    _atomic(folder/'session.json',record);_atomic(folder/'response.json',{'parameters':{'gain':.25}});(folder/'state.bin').write_bytes(b'opaque native state')
    return tmp_path,pid,sid

def test_native_return_saved_once_and_old_clients_keep_state(staged):
    root,pid,sid=staged;result=editor.status(root,sid);assert result['status']=='applied'
    saved=mixer.read(root,pid);assert saved['revision']==2
    insert=saved['tracks']['audio:1']['inserts'][0];assert insert['parameters']=={'gain':.25}
    assert editor.state_file(root,insert['state_id']).read_bytes()==b'opaque native state'
    assert editor.status(root,sid)==result and mixer.read(root,pid)['revision']==2
    mixer.save(root,pid,saved['revision'],saved['channels'],True)
    assert mixer.read(root,pid)['tracks']['audio:1']['inserts'][0]['state_id']==insert['state_id']

def test_discard_preserves_saved_values(staged):
    root,pid,sid=staged;before=mixer.project(root,pid).read_bytes()
    _atomic(editor.folder(root,sid)/'close.json',{'mode':'discard'})
    assert editor.status(root,sid)['status']=='discarded' and mixer.project(root,pid).read_bytes()==before

def test_revision_conflict_requires_explicit_recovery(staged):
    root,pid,sid=staged;saved=mixer.read(root,pid);saved['channels']['master']['gain_db']=-3
    changed=mixer.save(root,pid,saved['revision'],saved['channels'],True,saved['tracks'])
    assert editor.status(root,sid)['status']=='conflict'
    assert mixer.read(root,pid)['tracks']['audio:1']['inserts'][0]['parameters']=={'gain':.5}
    assert editor.recover(root,sid,'audio:1',0,changed['revision'])['status']=='applied'
    saved=mixer.read(root,pid);assert saved['channels']['master']['gain_db']==-3
    assert saved['tracks']['audio:1']['inserts'][0]['parameters']=={'gain':.25}
    with pytest.raises(ValueError):editor.state_file(root,'../source')

def test_removed_insert_never_receives_native_return(staged):
    root,pid,sid=staged;saved=mixer.read(root,pid);saved['tracks']['audio:1']['inserts']=[]
    mixer.save(root,pid,saved['revision'],saved['channels'],True,saved['tracks'])
    assert editor.status(root,sid)['status']=='conflict'
    assert mixer.read(root,pid)['tracks']['audio:1']['inserts']==[]


def test_draft_return_can_be_discovered_after_reload_without_saving(staged):
    root,pid,sid=staged;path=editor.folder(root,sid)
    record=editor.load(root,sid);record.update(draft=True,initial_insert=mixer.read(root,pid)['tracks']['audio:1']['inserts'][0]);_atomic(path/'session.json',record)
    before=mixer.project(root,pid).read_bytes()
    listed=editor.list_editors(root,pid)
    assert listed['sessions'][0]['status']=='draft_ready'
    assert listed['sessions'][0]['parameters']=={'gain':.25}
    assert mixer.project(root,pid).read_bytes()==before
    assert editor.close_editor(root,sid,'discard')['status']=='discarded'
    assert editor.list_editors(root,pid)['sessions']==[]
    assert mixer.project(root,pid).read_bytes()==before


def test_conflict_can_be_discarded_without_overwriting_newer_save(staged):
    root,pid,sid=staged;saved=mixer.read(root,pid);saved['channels']['master']['gain_db']=-9
    mixer.save(root,pid,saved['revision'],saved['channels'],True,saved['tracks'])
    before=mixer.project(root,pid).read_bytes()
    assert editor.list_editors(root,pid)['sessions'][0]['status']=='conflict'
    assert editor.close_editor(root,sid,'discard')['status']=='discarded'
    assert mixer.project(root,pid).read_bytes()==before
