import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from project_state_bundle import validate_bundle, save_bundle, read_bundle
from bai_camera import DEFAULT


class ProjectStateBundleTest(TestCase):
    def setUp(self):
        self.combination={'schema':1,'timeline':[{'name':'walk'}], 'history':[], 'cursor':-1}
        self.bundle={'schema':1,'combination':self.combination,'camera':DEFAULT}

    def test_roundtrip(self):
        with TemporaryDirectory() as tmp:
            project=Path(tmp)/'comb.json';camera=Path(tmp)/'camera.json'
            save_bundle(project,camera,self.bundle)
            got=read_bundle(project,camera)
            self.assertTrue(got['complete'])
            self.assertEqual(got['combination'],self.combination)
            self.assertEqual(len(got['camera']['keys']),2)

    def test_invalid_camera_does_not_touch_existing_files(self):
        with TemporaryDirectory() as tmp:
            project=Path(tmp)/'comb.json';camera=Path(tmp)/'camera.json'
            save_bundle(project,camera,self.bundle)
            before=(project.read_bytes(),camera.read_bytes())
            bad=json.loads(json.dumps(self.bundle));bad['camera']['fps']=-1
            with self.assertRaises(ValueError):save_bundle(project,camera,bad)
            self.assertEqual(before,(project.read_bytes(),camera.read_bytes()))

    def test_unknown_state_rejected_instead_of_silent_loss(self):
        bad={**self.bundle,'model':'ignored'}
        with self.assertRaisesRegex(ValueError,'unsupported'):validate_bundle(bad)

    def test_missing_combination_not_reported_complete(self):
        with TemporaryDirectory() as tmp:
            data=read_bundle(Path(tmp)/'missing.json',Path(tmp)/'missing_camera.json')
            self.assertFalse(data['complete'])

    def test_workspace_roundtrip(self):
        with TemporaryDirectory() as tmp:
            cp, cam = Path(tmp)/'comb.json', Path(tmp)/'camera.json'
            bundle={**self.bundle, 'workspace': {'asset':'model.glb','clip':0,'frame':20}}
            save_bundle(cp,cam,bundle)
            self.assertEqual(read_bundle(cp,cam)['workspace'],bundle['workspace'])

    def test_reject_invalid_workspace_without_write(self):
        with TemporaryDirectory() as tmp:
            cp,cam=Path(tmp)/'comb.json',Path(tmp)/'camera.json'
            valid={**self.bundle,'workspace':{'asset':'a.vrm','clip':None,'frame':8}}
            save_bundle(cp,cam,valid)
            before=(cp.read_bytes(),cam.read_bytes(),cp.with_suffix('.workspace.json').read_bytes())
            invalid={**self.bundle,'workspace':{'asset':'../unsafe.glb','clip':0,'frame':10}}
            with self.assertRaises(ValueError):save_bundle(cp,cam,invalid)
            self.assertEqual(before,(cp.read_bytes(),cam.read_bytes(),cp.with_suffix('.workspace.json').read_bytes()))

    def test_old_bundle_still_valid(self):
        self.assertNotIn('workspace',validate_bundle(self.bundle))

    def test_camera_write_failure_preserves_existing_bundle(self):
        from unittest.mock import patch
        with TemporaryDirectory() as tmp:
            cp, cam = Path(tmp)/'comb.json', Path(tmp)/'camera.json'
            initial={**self.bundle,'workspace':{'asset':'original.glb','clip':0,'frame':4}}
            save_bundle(cp,cam,initial)
            paths=[cp,cam,cp.with_suffix('.workspace.json')]
            original=[p.read_bytes() for p in paths]
            updated={**self.bundle,'workspace':{'asset':'new.glb','clip':0,'frame':9}}
            with patch('bai_camera.save',side_effect=OSError('camera write failed')):
                with self.assertRaisesRegex(OSError,'camera write failed'):
                    save_bundle(cp,cam,updated)
            self.assertEqual(original,[p.read_bytes() for p in paths])
            self.assertFalse(cp.with_suffix('.bundle-tmp').exists())
            self.assertFalse(cp.with_suffix('.workspace-tmp').exists())

    def test_combination_replace_failure_rolls_back_camera_workspace(self):
        from unittest.mock import patch
        with TemporaryDirectory() as tmp:
            cp, cam = Path(tmp)/'comb.json', Path(tmp)/'camera.json'
            initial={**self.bundle,'workspace':{'asset':'old.glb','clip':0,'frame':4}}
            save_bundle(cp,cam,initial)
            paths=[cp,cam,cp.with_suffix('.workspace.json')]
            original=[p.read_bytes() for p in paths]
            updated={**self.bundle,'workspace':{'asset':'new.glb','clip':0,'frame':9}}
            real_replace=Path.replace
            def fail_bundle_replace(self, dest):
                if self == cp.with_suffix('.bundle-tmp'):
                    raise OSError('combination rename failed')
                return real_replace(self,dest)
            with patch.object(Path,'replace',fail_bundle_replace):
                with self.assertRaisesRegex(OSError,'combination rename failed'):
                    save_bundle(cp,cam,updated)
            self.assertEqual(original,[p.read_bytes() for p in paths])
            self.assertFalse(cp.with_suffix('.bundle-tmp').exists())
            self.assertFalse(cp.with_suffix('.workspace-tmp').exists())
