import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from bai_ai_manager import read_config,save_config,status,interpret_pose,AIUnavailable
class Tests(unittest.TestCase):
 def test_default(self):
  with tempfile.TemporaryDirectory() as td:self.assertEqual(read_config(Path(td)/'x.json')['default_llm'],'qwen3.5:9b')
 def test_offline(self):
  with patch('bai_ai_manager._query',side_effect=AIUnavailable('offline')):
   self.assertEqual(status(read_config('/missingfile'))['state'],'offline')
 def test_disabled(self):
  self.assertEqual(status({'enabled':False})['manual_available'],True)
 def test_save(self):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td)/'settings.json';self.assertFalse(save_config(p,{'enabled':False})['enabled']);self.assertFalse(read_config(p)['enabled'])
 def test_preview_only(self):
  with patch('bai_ai_manager._query',return_value={'message':{'content':json.dumps({'constraints':[{'bone':'hand','action':'move','description':'up'}],'preview_only':False})}}):
   self.assertTrue(interpret_pose(read_config('/missingfile'),'腕を上げて')['proposal']['preview_only'])
if __name__=='__main__':unittest.main()
