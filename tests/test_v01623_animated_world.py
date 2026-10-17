import json, struct, unittest
from animated_world_preview import preview

def pack(name='arm', anim=True):
    nodes=[{'name':name,'rotation':[0,0,0,1]}]
    doc={'asset':{'version':'2.0'},'nodes':nodes,'skins':[{'joints':[0]}],
         'extensions':{'VRMC_vrm':{'humanoid':{'humanBones':{'leftUpperArm':{'node':0}}}}}}
    buf=b''
    if anim:
        buf=struct.pack('<ff',0.0,1.0)+struct.pack('<ffffffff',0,0,0,1,0,0,.70710678,.70710678)
        doc.update(buffers=[{'byteLength':len(buf)}],bufferViews=[{'buffer':0,'byteOffset':0,'byteLength':8},{'buffer':0,'byteOffset':8,'byteLength':32}],accessors=[{'bufferView':0,'componentType':5126,'count':2,'type':'SCALAR'},{'bufferView':1,'componentType':5126,'count':2,'type':'VEC4'}],animations=[{'name':'walk','samplers':[{'input':0,'output':1,'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':0,'path':'rotation'}}]}])
    js=json.dumps(doc).encode();js+=b' '*((-len(js))%4)
    result=struct.pack('<II',len(js),0x4e4f534a)+js
    if anim:result+=struct.pack('<II',len(buf),0x004e4942)+buf
    return struct.pack('<4sII',b'glTF',2,12+len(result))+result

class ActualClipPreview(unittest.TestCase):
    def setUp(self):self.src=pack();self.dst=pack('target',False)
    def test_keyframe_extraction(self):
        r=preview(self.src,self.dst,confirmed=True)
        self.assertEqual(r['source_rotation_keys'],2)
        self.assertEqual([k['frame'] for k in r['samples']],[0,30])
        self.assertEqual(r['samples'][1]['target_bone'],'target')
        self.assertFalse(r['target_animation_applied'])
    def test_unconfirmed(self):
        with self.assertRaises(ValueError):preview(self.src,self.dst)
    def test_wrong_clip(self):
        with self.assertRaises(ValueError):preview(self.src,self.dst,clip='missing',confirmed=True)
    def test_limit(self):
        with self.assertRaises(ValueError):preview(self.src,self.dst,max_samples=1,confirmed=True)
    def test_invalid_fps(self):
        with self.assertRaises(ValueError):preview(self.src,self.dst,fps=0,confirmed=True)
if __name__=='__main__':unittest.main()
