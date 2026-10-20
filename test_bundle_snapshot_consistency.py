"""Regression checks for bundle revision and camera snapshot locks."""
import copy, json, sys, threading, unittest, urllib.request
from http.server import ThreadingHTTPServer
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

    def test_camera_get_reads_inside_lock_while_posts_run(self):
        # B-3 で GET /api/camera/project が read_project になったため、ソース文字列の検査を振る舞いの検査に置き換えた（3-M1）。
        # POST と GET を並行で20回ずつ送り、各 GET の revision がその project から計算した値と一致する（ロックの中で読んでいる）。
        import server, bai_camera
        from camera_project_revision import revision
        httpd=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        threading.Thread(target=httpd.serve_forever,daemon=True).start()
        base='http://127.0.0.1:%d'%httpd.server_address[1]
        cam=server.DATA/'camera_project.json'
        cam.unlink(missing_ok=True)
        self.addCleanup(lambda: cam.unlink(missing_ok=True))
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)
        mismatches=[];errors=[]
        def post(i):
            try:
                project=copy.deepcopy(bai_camera.DEFAULT);project['keys'][0]['fov']=30+i
                req=urllib.request.Request(base+'/api/camera/project',data=json.dumps(project).encode(),method='POST')
                urllib.request.urlopen(req,timeout=10).read()
            except Exception as exc:errors.append(repr(exc))
        def get():
            try:
                with urllib.request.urlopen(base+'/api/camera/project?envelope=1',timeout=10) as r:body=json.loads(r.read())
                if body['revision']!=revision(body['project']):mismatches.append(body['revision'])
            except Exception as exc:errors.append(repr(exc))
        threads=[threading.Thread(target=post,args=(i,)) for i in range(20)]+[threading.Thread(target=get) for _ in range(20)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertEqual(errors,[]);self.assertEqual(mismatches,[])

if __name__=='__main__': unittest.main()
