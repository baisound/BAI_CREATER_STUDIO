"""Local browser sampler parity with existing Python experimental sampler."""
import json, subprocess, unittest
from pathlib import Path
from camera_vmd_bridge import preview_pose
BASE=Path(__file__).parent
class VMDLocalTests(unittest.TestCase):
    def test_preview_parity_across_frames(self):
        k=lambda fr,xyz,ang,d,fov,interp:dict(frame=fr,target=xyz,rotation=ang,distance=d,fov=fov,perspective=0,interpolation=interp)
        track={'format':'mmd-vmd-camera-native-v1','keys':[
            k(0,[0,1,0],[0,0,0],-5,40,[20,20,107,107]*6),
            k(30,[2,2,3],[.2,.5,-.1],-8,55,[40,10,92,110]*6),
            k(90,[-1,3,2],[.1,-.3,.4],-3,30,[10,80,100,30]*6)]}
        frames=[0,1,5,15,29,30,31,45,60,89,90,120]
        js=f"require('./camera_vmd_local.js');const t={json.dumps(track)};const s=globalThis.BAIVmdLocal.createSampler(t);console.log(JSON.stringify({{poses:{'['+','.join('s.preview('+str(f)+')' for f in frames)+']'}}}));"
        proc=subprocess.run(['node','-e',js],cwd=BASE,check=True,capture_output=True,text=True)
        local=json.loads(proc.stdout)['poses']
        for f,p in zip(frames,local):
            expected=preview_pose(track,f)
            for field in ('position','target','up'):
                for actual,want in zip(p[field],expected[field]):self.assertAlmostEqual(actual,want,places=9)
            self.assertAlmostEqual(p['fov'],expected['fov'],places=9)
    def test_wiring_and_no_per_frame_fetch(self):
        js=(BASE/'camera.js').read_text();html=(BASE/'camera.html').read_text()
        self.assertIn('nativeLocalSampler.preview(',js)
        self.assertIn('BAIVmdLocal.createSampler(data)',js)
        self.assertIn('/camera_vmd_local.js',html)
        self.assertNotIn('while(nativeFollow.checked',js)
        self.assertNotIn('nativePreviewPending',js)
if __name__=='__main__':unittest.main()
