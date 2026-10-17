import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vrm_humanoid_preview import suggest_humanoid_mapping
from test_v01617_vrm_humanoid import glb

class RoleUITests(unittest.TestCase):
 def test_suggestions_are_non_destructive(self):
  a=glb(['hips','head']); b=glb(['head','hips'])
  result=suggest_humanoid_mapping(a,b)
  self.assertEqual(result['mapping_suggestion'],{'head':'head','hips':'hips'})
  self.assertTrue(result['mapping_is_provisional'])
  self.assertFalse(result['safe_for_animation_transfer'])
  self.assertFalse(result['model_modified'])
 def test_no_roles_rejected(self):
  with self.assertRaises(ValueError):suggest_humanoid_mapping(b'broken',glb(['hips']))
 def test_all_interfaces_declared(self):
  base=Path(__file__).resolve().parents[1]
  self.assertIn('sk-vrm-role-suggest',(base/'index.html').read_text())
  self.assertIn('sk-vrm-role-suggest',(base/'retarget_ui.js').read_text())
  self.assertIn('bai_vrm_humanoid_mapping_suggest',(base/'mcp_server.py').read_text())
  self.assertIn('bai_vrm_humanoid_mapping_suggest',(base/'webmcp.js').read_text())
if __name__=='__main__':unittest.main()
