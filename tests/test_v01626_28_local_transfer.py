import unittest, json, struct

def paired_fixture():
    blob=fixture(); n,=struct.unpack_from("<I",blob,12)
    doc=json.loads(blob[20:20+n]); doc["extensions"]["VRMC_vrm"]["humanoid"]["humanBones"]["hips"]={"node":0}
    js=json.dumps(doc).encode();js+=b" "*((-len(js))%4)
    tail=blob[20+n:]; body=struct.pack("<II",len(js),0x4e4f534a)+js+tail
    return struct.pack("<4sII",b"glTF",2,12+len(body))+body

from tests.test_v01625_interpolation import fixture
from vrm_local_transfer import transfer,quality

class TransferGateTests(unittest.TestCase):
    def test_explicit_consent(self):
        b=paired_fixture()
        with self.assertRaises(ValueError): transfer(b,b)
    def test_identical_vrm_provisional_rotation(self):
        b=paired_fixture()
        r=transfer(b,b,confirmed=True)
        self.assertGreater(len(r['samples']),0)
        s=next(x for x in r['samples'] if x['time']==1. and x['role']=='leftUpperArm')
        self.assertEqual(s['role'],'leftUpperArm')
        self.assertAlmostEqual(abs(s['local_rotation_xyzw'][3]),1,places=5)
        self.assertFalse(r['animation_applied'])
    def test_quality_blocks_production(self):
        b=paired_fixture()
        q=quality(transfer(b,b,confirmed=True))
        self.assertEqual(q['quality_gate'],'blocked_for_production')
        self.assertFalse(q['suitable_for_vmd_export'])
    def test_output_cap(self):
        b=paired_fixture()
        with self.assertRaises(ValueError):transfer(b,b,confirmed=True,max_samples=1)
if __name__=='__main__':unittest.main()
