import unittest,sys,struct,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from motion_interchange import glb_channels,bvh_channels
class TestInterchange(unittest.TestCase):
 def test_bvh(self):
  data=b'HIERARCHY\nROOT Hips\n{\n OFFSET 0 0 0\n CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation\n}\nMOTION\nFrames: 2\nFrame Time: 0.0333333\n0 0 0 0 0 0\n2 0 0 30 0 0\n'
  x=bvh_channels(data);self.assertEqual(x['channel_count'],6);self.assertEqual(x['channels'][0]['keys'][1]['value'],[2])
 def test_bvh_incomplete(self):
  with self.assertRaises(ValueError):bvh_channels(b'HIERARCHY\nMOTION\nFrames: 2\nFrame Time: 0.1\n1 2\n')
 def test_glb(self):
  binary=struct.pack('<2f6f',0.,1.,0.,0.,0.,1.,2.,3.)
  doc={'nodes':[{'name':'Hips'}],'buffers':[{'byteLength':len(binary)}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':8},{'buffer':0,'byteOffset':8,'byteLength':24}],'accessors':[{'bufferView':0,'componentType':5126,'count':2,'type':'SCALAR'},{'bufferView':1,'componentType':5126,'count':2,'type':'VEC3'}],'animations':[{'name':'Walk','samplers':[{'input':0,'output':1}],'channels':[{'sampler':0,'target':{'node':0,'path':'translation'}}]}]}
  j=json.dumps(doc).encode();j+=b' ' * ((-len(j))%4);binary+=b'\x00' *((-len(binary))%4)
  raw=b'glTF'+struct.pack('<II',2,12+8+len(j)+8+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
  o=glb_channels(raw);self.assertEqual(o['channel_count'],1);self.assertEqual(o['channels'][0]['keys'][1]['value'],[1.,2.,3.])
if __name__=='__main__':unittest.main()
