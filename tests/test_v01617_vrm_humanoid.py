import json,struct,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vrm_humanoid_preview import compare_vrm_humanoid

def glb(roles):
 nodes=[{'name':r,'translation':[i,0,0]} for i,r in enumerate(roles)]
 data={'nodes':nodes,'skins':[{'joints':list(range(len(nodes)))}], 'extensions':{'VRMC_vrm':{'humanoid':{'humanBones':{r:{'node':i} for i,r in enumerate(roles)}}}}}
 payload=json.dumps(data).encode();payload+=b' '*((-len(payload))%4)
 return struct.pack('<4sII',b'glTF',2,20+len(payload))+struct.pack('<II',len(payload),0x4e4f534a)+payload

class VRMMatchTests(unittest.TestCase):
 def test_role_matching_not_index(self):
  result=compare_vrm_humanoid(glb(['hips','head']),glb(['head','hips']))
  self.assertEqual([(p['source_node'],p['target_node']) for p in result['pairs']],[(1,0),(0,1)])
  self.assertFalse(result['safe_for_animation_transfer'])
 def test_missing_roles(self):
  r=compare_vrm_humanoid(glb(['hips','head']),glb(['hips']))
  self.assertIn('head',r['missing_in_target'])
  self.assertTrue(r['missing_required_roles'])
 def test_no_humanoid(self):
  doc={'nodes':[{'name':'Hips'}],'skins':[{'joints':[0]}]}
  payload=json.dumps(doc).encode();payload+=b' '*((-len(payload))%4)
  raw=struct.pack('<4sII',b'glTF',2,20+len(payload))+struct.pack('<II',len(payload),0x4e4f534a)+payload
  with self.assertRaises(ValueError):compare_vrm_humanoid(raw,glb(['hips']))
 def test_reject_invalid(self):
  with self.assertRaises(ValueError):compare_vrm_humanoid(b'invalid',glb(['hips']))
if __name__=='__main__':unittest.main()
