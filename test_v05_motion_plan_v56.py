"""v56: persisted single-model retarget preview planning and contract checks."""
import json
import tempfile
import unittest
from pathlib import Path

from studio_project_catalog import create
from studio_v05_arrangement import place, read as read_arrangement, set_clip_target
from studio_v05_scene_model import set_model
from studio_v05_motion_plan import plan, compatible

class Stage56(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        home = Path(self.tmp.name)
        self.catalog = home / "projects.json"
        self.models = home / "models"
        self.clips = home / "clips"
        self.id = create(self.catalog, "Motion Test")["id"]
        self.other = create(self.catalog, "Other")["id"]
        self.model = {"id":"mmd:A:model.pmx","name":"model.pmx","source":"mmd","kind":"A","format":"PMX","available":True}
        self.motion = {"id":"mmd:vmd:dance.vmd","name":"dance.vmd","source":"mmd","kind":"vmd","format":"VMD","available":True}
        self.vrm = {"id":"integrated:char.vrm","name":"VRM model","source":"integrated","kind":"model","filename":"char.vrm","format":"VRM","available":True}
        self.glb = {"id":"integrated:dance.glb","name":"GLB dance","source":"integrated","kind":"motion","filename":"dance.glb","format":"GLB","available":True}
        self.items = [self.model,self.motion,self.vrm,self.glb]
        self.transform = {"position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1]}
    def tearDown(self):
        self.tmp.cleanup()
    def add(self, model, motion):
        set_model(self.models,self.catalog,self.id,model["id"],self.transform,0,self.items)
        placed = place(self.clips,self.catalog,self.id,motion["id"],"motion",2,4,0,self.items)
        return placed["clip"]["id"]
    def test_ready_pmx_vmd_and_immutable_plan(self):
        clip = self.add(self.model,self.motion)
        set_clip_target(self.clips,self.catalog,self.id,clip,1,self.model["id"],self.items)
        before=(self.clips/(self.id+".json")).read_bytes()
        p=plan(self.models,self.clips,self.catalog,self.id,self.items)
        self.assertEqual(p["ready_count"],1)
        self.assertEqual(p["rows"][0]["status"],"ready")
        self.assertEqual(p["assets"][1]["format"],"VMD")
        self.assertEqual(p["assets"][1]["category"],"motion")
        self.assertEqual(p["clips"][0]["start"],2)
        self.assertFalse(p["engine_playback_verified"])
        self.assertEqual((self.clips/(self.id+".json")).read_bytes(),before)
        self.assertEqual(plan(self.models,self.clips,self.catalog,self.other,self.items)["ready_count"],0)
    def test_explicit_target_is_required(self):
        self.add(self.model,self.motion)
        p=plan(self.models,self.clips,self.catalog,self.id,self.items)
        self.assertEqual(p["rows"][0]["status"],"target_unassigned")
        self.assertEqual(p["ready_count"],0)
    def test_incompatible_motion_rejected(self):
        self.add(self.vrm,self.motion)
        p=plan(self.models,self.clips,self.catalog,self.id,self.items)
        self.assertEqual(p["rows"][0]["status"],"unsupported_combination")
        self.assertTrue(compatible("VRM","FBX"))
        self.assertTrue(compatible("PMX","VMD"))
        self.assertFalse(compatible("GLB","VMD"))
        self.assertFalse(compatible("XYZ","FBX"))
    def test_missing_motion_and_no_model(self):
        clip=self.add(self.model,self.motion)
        missing=[self.model,{**self.motion,"available":False}]
        p=plan(self.models,self.clips,self.catalog,self.id,missing)
        self.assertEqual(p["rows"][0]["status"],"motion_unavailable")
        other=plan(self.models,self.clips,self.catalog,self.other,self.items)
        self.assertIsNone(other["model"])
    def test_http_read_only_motion_plan(self):
        import threading, urllib.request
        from http.server import ThreadingHTTPServer
        from unittest.mock import patch
        import server
        self.add(self.model, self.motion)
        class Quiet(server.Handler):
            def log_message(self, *args): pass
        home = self.catalog.parent
        # Use the very same paths as the actual GET route.
        expected_models=home/"studio_v05_scene_models"
        expected_clips=home/"studio_v05_arrangements"
        expected_models.mkdir(exist_ok=True)
        expected_clips.mkdir(exist_ok=True)
        # Existing saved data is copied as bytes without mutation.
        (expected_models/(self.id+".json")).write_bytes((self.models/(self.id+".json")).read_bytes())
        (expected_clips/(self.id+".json")).write_bytes((self.clips/(self.id+".json")).read_bytes())
        # The API expects catalog.json inside the data root.
        (home/"studio_v05_catalog.json").write_bytes(self.catalog.read_bytes())
        httpd=ThreadingHTTPServer(("127.0.0.1",0),Quiet)
        with patch.object(server,"DATA",home), patch.object(server,"unified_assets",return_value=self.items):
            thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
            try:
                url=f"http://127.0.0.1:{httpd.server_port}/api/studio/v05/scene/motion-plan?id={self.id}"
                with urllib.request.urlopen(url,timeout=3) as resp:
                    payload=json.load(resp)
                self.assertEqual(payload["rows"][0]["status"],"target_unassigned")
                self.assertEqual(payload["ready_count"],0)
                post = {
                    "project_id": self.id, "clip_id": payload["rows"][0]["clip_id"],
                    "revision": payload["arrangement_revision"],
                    "target_model_id": self.model["id"]
                }
                req=urllib.request.Request(
                    f"http://127.0.0.1:{httpd.server_port}/api/studio/v05/arrangement/clip/target",
                    data=json.dumps(post).encode(), method="POST",
                    headers={"Content-Type":"application/json"})
                with urllib.request.urlopen(req,timeout=3) as resp:
                    self.assertEqual(resp.status,200)
                with urllib.request.urlopen(url,timeout=3) as resp:
                    ready=json.load(resp)
                self.assertEqual(ready["ready_count"],1)
                self.assertEqual(ready["assets"][1]["category"],"motion")
            finally:
                httpd.shutdown();thread.join(timeout=5);httpd.server_close()

    def test_static_mcp_webmcp_ui_contract(self):
        here=Path(__file__).parent
        server=(here/"server.py").read_text()
        self.assertIn("/api/studio/v05/scene/motion-plan",server)
        for name in ("bai_studio_scene_motion_plan","bai_studio_clip_target_set"):
            self.assertIn(name,(here/"mcp_server.py").read_text())
            self.assertIn(name,(here/"webmcp.js").read_text())
        workflow=(here/"studio/v05/js/asset-workflow-v06.js").read_text()
        self.assertIn("/api/studio/v05/scene/motion-plan",workflow)
        self.assertNotIn("clips:arr.clips,assets:inventory.items",workflow)
        self.assertIn("motion-bindings-v56.js",(here/"studio/v05/index.html").read_text())
        for lang in ("jp","en"):
            data=json.loads((here/f"studio/v05/locales/{lang}.json").read_text())
            self.assertIn("apply",data["v56"])

if __name__ == "__main__": unittest.main()
