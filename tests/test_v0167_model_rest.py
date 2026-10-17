import json,struct,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from model_rest_skeleton import parse
from retarget_analysis import inspect

def glb(doc):
 raw=json.dumps(doc).encode();raw+=b' ' * ((-len(raw))%4)
 return struct.pack('<4sII',b'glTF',2,20+len(raw))+struct.pack('<II',len(raw),0x4e4f534a)+raw

class ModelRestTests(unittest.TestCase):
 def test_hierarchy_and_vrm_role(self):
  data=glb({'nodes':[{'name':'Root','translation':[1,2,3],'children':[1]}, {'name':'Foot','translation':[0,-2,0]}], 'skins':[{'joints':[0,1]}], 'extensions':{'VRMC_vrm':{'humanoid':{'humanBones':{'leftFoot':{'node':1}}}}}})
  r=parse(data);self.assertEqual(r['bones_detail'][1]['position'],[1.,0.,3.]);self.assertEqual(r['humanoid_roles']['leftFoot'],1)
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'unit.vrm';p.write_bytes(data);self.assertEqual(inspect(p)['metadata']['bones_detail'][1]['position'],[1.,0.,3.])
 def test_rotated_parent(self):
  data=glb({'nodes':[{'rotation':[0,0,0.7071067811865476,0.7071067811865476],'children':[1]},{'translation':[1,0,0]}],'skins':[{'joints':[1]}]})
  pos=parse(data)['bones_detail'][0]['position'];self.assertAlmostEqual(pos[0],0);self.assertAlmostEqual(pos[1],1)
 def test_matrix(self):
  data=glb({'nodes':[{'matrix':[1,0,0,0, 0,1,0,0, 0,0,1,0, 4,5,6,1]}],'skins':[{'joints':[0]}]})
  self.assertEqual(parse(data)['bones_detail'][0]['position'],[4.,5.,6.])
 def test_cycle_and_invalid_index(self):
  with self.assertRaises(ValueError):parse(glb({'nodes':[{'children':[1]},{'children':[0]}],'skins':[{'joints':[0]}]}))
  with self.assertRaises(ValueError):parse(glb({'nodes':[{}],'skins':[{'joints':[5]}]}))
 def test_does_not_modify_source(self):
  data=glb({'nodes':[{'name':'Hips'}],'skins':[{'joints':[0]}]});parse(data);self.assertEqual(parse(data)['joint_count'],1)
if __name__=='__main__':unittest.main()
