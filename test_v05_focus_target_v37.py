from pathlib import Path
import pytest
from studio_project_catalog import create
from studio_v05_focus_target import save,read,FocusTargetError

def test_saved_project_focus(tmp_path):
 c=tmp_path/'cat.json';root=tmp_path/'focus';p=create(c,'Test');id=p['id']
 assert read(root,c,id)['revision']==0
 out=save(root,c,id,0,'model-1','Head',True)
 assert out['revision']==1 and read(root,c,id)['bone_name']=='Head'
 with pytest.raises(FocusTargetError,match='Revision conflict'):save(root,c,id,0,'model-2',None,False)
 with pytest.raises(FocusTargetError):save(root,c,id,1,None,'Head',False)
 with pytest.raises(FocusTargetError):save(root,c,id,1,None,None,True)
 with pytest.raises(FocusTargetError):save(root,c,id,1,'../../unsafe',None,True)
 assert read(root,c,id)['model_id']=='model-1'

def test_bad_storage_is_preserved(tmp_path):
 c=tmp_path/'cat.json';root=tmp_path/'focus';id=create(c,'Test')['id'];root.mkdir()
 path=root/(id+'.json');path.write_text('{bad')
 with pytest.raises(FocusTargetError):read(root,c,id)
 assert path.read_text()=='{bad'
