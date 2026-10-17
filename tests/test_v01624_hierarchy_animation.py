import unittest, math, json, struct
from animated_hierarchy_preview import preview

def fixture(missing_parent=False):
    buf=struct.pack('<ff',0,1)+struct.pack('<ffffffff',0,0,0,1,0,0,.707106781,.707106781)
    times=struct.pack('<f',0 if missing_parent else 1)
    buf+=times+struct.pack('<ffff',0,0,.707106781,.707106781)
    doc={'asset':{'version':'2.0'},'nodes':[{'name':'parent','children':[1]},{'name':'arm'}],
      'skins':[{'joints':[0,1]}], 'extensions':{'VRMC_vrm':{'humanoid':{'humanBones':{'leftUpperArm':{'node':1}}}}},
      'buffers':[{'byteLength':len(buf)}],
      'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':8},{'buffer':0,'byteOffset':8,'byteLength':32},{'buffer':0,'byteOffset':40,'byteLength':4},{'buffer':0,'byteOffset':44,'byteLength':16}],
      'accessors':[{'bufferView':0,'componentType':5126,'count':2,'type':'SCALAR'},{'bufferView':1,'componentType':5126,'count':2,'type':'VEC4'},{'bufferView':2,'componentType':5126,'count':1,'type':'SCALAR'},{'bufferView':3,'componentType':5126,'count':1,'type':'VEC4'}],
      'animations':[{'name':'test','samplers':[{'input':0,'output':1,'interpolation':'LINEAR'},{'input':2,'output':3,'interpolation':'LINEAR'}],
                      'channels':[{'sampler':0,'target':{'node':1,'path':'rotation'}},{'sampler':1,'target':{'node':0,'path':'rotation'}}]}]}
    js=json.dumps(doc).encode();js+=b' '*((-len(js))%4)
    chunks=struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(buf),0x004e4942)+buf
    return struct.pack('<4sII',b'glTF',2,12+len(chunks))+chunks

class HierarchyTests(unittest.TestCase):
    def test_parent_rotation_is_applied(self):
        r=preview(fixture());item=next(x for x in r['samples'] if x['frame']==30)
        self.assertAlmostEqual(abs(item['source_world_rotation_xyzw'][3]),0.0,places=5)
    def test_missing_parent_key_skipped(self):
        r=preview(fixture(True))
        self.assertTrue(any(x['time']==1 for x in r['skipped']))
    def test_limit(self):
        with self.assertRaises(ValueError):preview(fixture(),max_samples=0)
    def test_no_mutation(self):
        data=fixture();preview(data);self.assertEqual(data,fixture())
if __name__=='__main__':unittest.main()
