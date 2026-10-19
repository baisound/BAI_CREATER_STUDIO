"""Regression checks for bundle revision and camera snapshot locks."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from project_state_bundle import bundle_revision, read_bundle

class SnapshotConsistencyTest(unittest.TestCase):
    def test_revision_is_stable_for_persisted_snapshot(self):
        with TemporaryDirectory() as d:
            p=Path(d)/'project.json'
            p.write_text('{"schema":1,"timeline":[],"history":[],"cursor":-1}')
            before=read_bundle(p, Path(d)/'camera.json')
            self.assertEqual(bundle_revision(before), bundle_revision(read_bundle(p,Path(d)/'camera.json')))

    def test_bundle_post_returns_committed_revision_inside_lock(self):
        source=Path(__file__).with_name('server.py').read_text()
        self.assertIn("result['revision']=bundle_revision(read_bundle(PROJECT,DATA/'camera_project.json'))",source)
        self.assertIn('with PROJECT_LOCK:\n                camera_project=camera_read',source)

if __name__=='__main__': unittest.main()
