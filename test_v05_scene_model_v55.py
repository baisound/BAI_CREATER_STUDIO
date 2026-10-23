"""v55: isolated single-model scene placement contract and tool routes."""
import json
import tempfile
import unittest
from pathlib import Path
from studio_project_catalog import create
from studio_v05_scene_model import (
    SceneModelError,read,set_model,choices,supported_model
)

class SceneModelV55Test(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        base=Path(self.temp.name)
        self.catalog=base/"catalog.json";self.storage=base/"scenes"
        self.pid=create(self.catalog,"Test Scene")["id"]
        self.second=create(self.catalog,"Other Scene")["id"]
        self.glb={"id":"integrated:test.glb","source":"integrated","kind":"model",
                  "name":"Test","filename":"test.glb","format":"GLB","available":True}
        self.vrm={**self.glb,"id":"integrated:test.vrm","filename":"test.vrm","format":"VRM"}
        self.library={**self.glb,"id":"library:123456789012345678901234","source":"library",
                      "kind":"stage"}
        self.ineligible={**self.glb,"id":"v05source:123456789012345678901234","source":"v05source"}
        self.assets=[self.glb,self.vrm,self.library,self.ineligible]
        self.tr={"position":[1.5,2,-3],"rotation":[0,90,0],"scale":[1,1,1]}
    def tearDown(self):self.temp.cleanup()
    def test_add_read_update_remove(self):
        self.assertIsNone(read(self.storage,self.catalog,self.pid,self.assets)["model"])
        saved=set_model(self.storage,self.catalog,self.pid,self.glb["id"],self.tr,0,self.assets)
        self.assertEqual(saved["revision"],1)
        loaded=read(self.storage,self.catalog,self.pid,self.assets)
        self.assertTrue(loaded["model"]["available"])
        self.assertEqual(loaded["model"]["asset"]["format"],"GLB")
        self.assertEqual(loaded["model"]["transform"]["rotation"],[0,90,0])
        self.assertIsNone(read(self.storage,self.catalog,self.second)["model"])
        self.assertEqual(set_model(self.storage,self.catalog,self.pid,None,None,1,self.assets)["revision"],2)
        self.assertIsNone(read(self.storage,self.catalog,self.pid)["model"])
    def test_cannot_place_unsupported_or_missing(self):
        self.assertTrue(supported_model(self.vrm))
        self.assertTrue(supported_model(self.library))
        self.assertFalse(supported_model(self.ineligible))
        self.assertEqual(len(choices(self.assets)["items"]),3)
        for asset_id in (self.ineligible["id"],"unknown"):
            with self.assertRaises(SceneModelError):
                set_model(self.storage,self.catalog,self.pid,asset_id,self.tr,0,self.assets)
    def test_revision_and_transform_validation(self):
        set_model(self.storage,self.catalog,self.pid,self.glb["id"],self.tr,0,self.assets)
        with self.assertRaisesRegex(SceneModelError,"Revision conflict"):
            set_model(self.storage,self.catalog,self.pid,None,None,0,self.assets)
        for name,value in (("position",[float("nan"),0,0]),("scale",[0,1,1]),("rotation",[False,0,0]),("position",[1,2])):
            invalid={**self.tr,name:value}
            with self.assertRaises(SceneModelError):
                set_model(self.storage,self.catalog,self.pid,self.glb["id"],invalid,1,self.assets)
        self.assertEqual(read(self.storage,self.catalog,self.pid)["revision"],1)
    def test_corrupt_file_preserved(self):
        self.storage.mkdir(parents=True)
        path=self.storage/(self.pid+".json")
        path.write_text('{"schema":5}',encoding="utf-8")
        with self.assertRaises(SceneModelError):
            set_model(self.storage,self.catalog,self.pid,None,None,0,self.assets)
        self.assertEqual(path.read_text(), '{"schema":5}')
    def test_api_mcp_webmcp_and_locales(self):
        project=Path(__file__).parent
        server=(project/"server.py").read_text()
        self.assertIn("/api/studio/v05/scene/model-candidates",server)
        self.assertIn("/api/studio/v05/scene/model",server)
        for key in ("bai_studio_scene_model_candidates","bai_studio_scene_model_get","bai_studio_scene_model_set"):
            self.assertIn(key,(project/"mcp_server.py").read_text())
            self.assertIn(key,(project/"webmcp.js").read_text())
        for lang in ("jp","en"):
            self.assertIn("v55",json.loads((project/"studio/v05/locales"/(lang+".json")).read_text()))
        self.assertIn("BAIStudioScenePreview.show",(project/"studio/v05/js/scene-models-v55.js").read_text())
if __name__=="__main__": unittest.main()
