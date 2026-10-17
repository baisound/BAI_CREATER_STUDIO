import json, math, struct, unittest
from animated_hierarchy_preview import preview


def fixture(interpolation='LINEAR'):
    # Parent 0° -> 180° around Z at 0 and 2 s; child sampled at 1 s.
    raw = (struct.pack('<2f', 0., 2.) +
           struct.pack('<8f', 0.,0.,0.,1., 0.,0.,1.,0.) +
           struct.pack('<f',1.) + struct.pack('<4f',0.,0.,0.,1.))
    spans=[(0,8),(8,32),(40,4),(44,16)]
    doc={'asset':{'version':'2.0'},'nodes':[{'name':'parent','children':[1]},{'name':'arm'}],
         'skins':[{'joints':[0,1]}],
         'extensions':{'VRMC_vrm':{'humanoid':{'humanBones':{'leftUpperArm':{'node':1}}}}},
         'buffers':[{'byteLength':len(raw)}],
         'bufferViews':[{'buffer':0,'byteOffset':a,'byteLength':b} for a,b in spans],
         'accessors':[{'bufferView':i,'componentType':5126,'count':n,'type':t}
                      for i,(n,t) in enumerate([(2,'SCALAR'),(2,'VEC4'),(1,'SCALAR'),(1,'VEC4')])],
         'animations':[{'name':'clip','samplers':[{'input':0,'output':1,'interpolation':interpolation},
                                                   {'input':2,'output':3,'interpolation':'LINEAR'}],
                        'channels':[{'sampler':0,'target':{'node':0,'path':'rotation'}},
                                    {'sampler':1,'target':{'node':1,'path':'rotation'}}]}]}
    js=json.dumps(doc).encode(); js+=b' '*((-len(js))%4)
    body=struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(raw),0x004e4942)+raw
    return struct.pack('<4sII',b'glTF',2,12+len(body))+body

class InterpolationTests(unittest.TestCase):
    def test_slerp_parent_midpoint(self):
        r=preview(fixture())
        q=next(x['source_world_rotation_xyzw'] for x in r['samples'] if x['time']==1.)
        self.assertAlmostEqual(abs(q[2]),math.sqrt(.5),places=5)
        self.assertAlmostEqual(abs(q[3]),math.sqrt(.5),places=5)
        self.assertEqual(r['mode'],'read_only_interpolated_hierarchical_rotation')
        self.assertFalse(r['model_modified'])
    def test_step_parent_midpoint(self):
        r=preview(fixture('STEP'))
        q=next(x['source_world_rotation_xyzw'] for x in r['samples'] if x['time']==1.)
        self.assertAlmostEqual(q[3],1,places=5)
    def test_invalid_limit(self):
        with self.assertRaises(ValueError):preview(fixture(),max_samples=0)
if __name__=='__main__':unittest.main()
