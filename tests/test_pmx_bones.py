import os,struct,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pmx_bones import parse
from retarget_analysis import inspect

def i(n):return struct.pack('<i',n)
def t(s):
    v=s.encode('utf-8');return i(len(v))+v

def minimal():
    b=b'PMX '+struct.pack('<fB',2.0,8)+bytes([1,0,1,1,1,1,1,1])
    b+=t('test')+t('test')+t('')+t('')
    b+=i(0)*4 # vertices, faces, textures, materials
    b+=i(1)+t('センター')+t('Center')+struct.pack('<fff',0,1,0)
    b+=struct.pack('<biH',-1,0,0)+struct.pack('<fff',0,1,0)
    return b
class TestPMX(unittest.TestCase):
    def test_bone(self):
        p=parse(minimal());assert p['bones_detail'][0]['name']=='センター';assert p['bones_detail'][0]['parent_index']==-1
    def test_truncation(self):
        with self.assertRaises(ValueError):parse(minimal()[:-2])
    def test_inspect(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'x.pmx';p.write_bytes(minimal());result=inspect(p)
            assert result['bone_count']==1 and result['status']=='inspectable'
    def test_real_materials_before_bones(self):
        root=os.environ.get('BAI_REAL_MMD_DATA')
        if not root:self.skipTest('BAI_REAL_MMD_DATA に実PMXがありません')
        files=list((Path(root)/'mmd'/'A').glob('*.pmx'))
        if not files:self.skipTest('BAI_REAL_MMD_DATA に実PMXがありません')
        parsed=parse(files[0].read_bytes())
        names={bone['name'] for bone in parsed['bones_detail']}
        self.assertGreater(parsed['materials'],0)
        self.assertIn('センター',names)
        self.assertIn('左足D',names)
if __name__=='__main__': unittest.main()
