import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from retarget_pose import shortest_arc,propose_pose,transform_samples

def doc(fmt,coords):
    return {'filename':'test.'+fmt.lower(),'format':fmt,'suggested_mapping':{k:k for k in coords},'metadata':{'bones_detail':[{'name':k,'position' if fmt=='PMX' else 'head_local':v} for k,v in coords.items()]},'warnings':[]}

class PoseTests(unittest.TestCase):
    def test_equal(self):self.assertEqual(shortest_arc([0,1,0],[0,1,0]),[0,0,0,1])
    def test_orthogonal(self):
        q=shortest_arc([1,0,0],[0,1,0]);self.assertAlmostEqual(q[2],2**-.5,places=6)
    def test_proposal(self):
        a=doc('PMX',{'leftUpperArm':[0,0,0],'leftLowerArm':[1,0,0]})
        b=doc('PMX',{'leftUpperArm':[0,0,0],'leftLowerArm':[0,1,0]})
        result=propose_pose(a,b)
        self.assertEqual(result['quality']['direction_pairs_count'],1)
        self.assertEqual(result['pose_correction']['status'],'provisional_not_applied')
        output=transform_samples(result,[{'role':'leftUpperArm','rotation_xyzw':[0,0,0,1]}])
        self.assertEqual(output['samples'][0]['rotation_xyzw'],[0,0,0,1])
    def test_missing_is_not_invented(self):
        r=propose_pose(doc('PMX',{}),doc('PMX',{}))
        self.assertEqual(r['quality']['direction_pairs_count'],0)
    def test_reject_invalid(self):
        with self.assertRaises(ValueError):shortest_arc([0,0,0],[1,0,0])

if __name__=='__main__':unittest.main()
