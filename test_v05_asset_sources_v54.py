import io
import os
import shutil
import tempfile
import unittest
import wave
from pathlib import Path

import library_assets
from studio_v05_asset_sources import (
    AssetSourceError, _safe_input, listing, register, relink, file_for,
)
from studio_v05_arrangement import inventory


class TestAssetSourcesV54(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.inbox = root / "inbox"
        self.inbox.mkdir()
        self.store = root / "sources"
        self.library = root / "library"
        self._wav(self.inbox / "song.wav")

    def tearDown(self):
        self.tmp.cleanup()

    def _wav(self, path):
        with wave.open(str(path), "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(8000)
            out.writeframes(b"\x00\x01"*80)

    def test_reference_relink_and_integrity(self):
        result=register(self.store,self.inbox,self.library,'song.wav','audio','reference',0)
        self.assertEqual(result['revision'],1)
        original=result['item']['id']
        self.assertTrue(file_for(self.store,self.inbox,original)[0].is_file())
        self.assertEqual(inventory(listing(self.store,self.inbox)['items'],'audio')['count'],1)
        shutil.copy2(self.inbox/'song.wav',self.inbox/'new.wav')
        relinked=relink(self.store,self.inbox,original,'new.wav',1)
        self.assertEqual(relinked['revision'],2)
        self.assertEqual(relinked['item']['relative_path'],'new.wav')
        self.assertEqual(register(self.store,self.inbox,self.library,'new.wav','audio','reference',2)['duplicate'],True)
        self._wav(self.inbox/'changed.wav')
        with (self.inbox/'changed.wav').open('ab') as out:out.write(b'altered')
        with self.assertRaisesRegex(AssetSourceError,'changed'):
            relink(self.store,self.inbox,original,'changed.wav',2)
        (self.inbox/'new.wav').unlink()
        self.assertFalse(listing(self.store,self.inbox)['items'][0]['available'])
        self.assertIsNone(file_for(self.store,self.inbox,original))

    def test_copy_library_and_duplicate(self):
        result=register(self.store,self.inbox,self.library,'song.wav','audio','copy',0)
        self.assertTrue(result['item']['id'].startswith('library:'))
        self.assertEqual(len(library_assets.read_index(self.library)),1)
        again=register(self.store,self.inbox,self.library,'song.wav','audio','copy',0)
        self.assertTrue(again['duplicate'])
        self.assertEqual(len(library_assets.read_index(self.library)),1)
        self.assertEqual(listing(self.store,self.inbox)['items'],[])

    def test_validation_and_path_traversal(self):
        for bad in ('../private.wav','/tmp/private.wav','C:/secret.wav',r'..\secret.wav'):
            with self.assertRaises(AssetSourceError):
                _safe_input(self.inbox,bad)
        with self.assertRaisesRegex(AssetSourceError,'Revision conflict'):
            register(self.store,self.inbox,self.library,'song.wav','audio','reference',8)
        with self.assertRaises(AssetSourceError):
            register(self.store,self.inbox,self.library,'song.wav','video','reference',0)
        with self.assertRaises(AssetSourceError):
            register(self.store,self.inbox,self.library,'song.wav','audio','delete',0)

    @unittest.skipUnless(hasattr(os, "symlink"), "symlink unavailable")
    def test_symlink_escape(self):
        outside = self.inbox.parent/'outside.wav'
        self._wav(outside)
        try:
            (self.inbox/'alias.wav').symlink_to(outside)
        except (OSError,NotImplementedError):
            self.skipTest('symlinks cannot be created')
        with self.assertRaises(AssetSourceError):
            register(self.store,self.inbox,self.library,'alias.wav','audio','reference',0)

    def test_mcp_webmcp_routes_and_locales(self):
        from studio_v05_asset_categories import capabilities
        self.assertEqual(capabilities()["source_modes"], ["reference", "copy"])
        root = Path(__file__).resolve().parent
        python_src = (root/"mcp_server.py").read_text()
        web_src = (root/"webmcp.js").read_text()
        for name in ("bai_studio_asset_sources_get", "bai_studio_asset_source_register", "bai_studio_asset_source_relink"):
            self.assertIn(name, python_src)
            self.assertIn(name, web_src)
        import json
        for lang in ("jp", "en"):
            dictionary = json.loads((root/"studio/v05/locales"/(lang+".json")).read_text())
            self.assertIn("relink", dictionary["v54"])
        html = (root/"studio/v05/index.html").read_text()
        self.assertIn("asset-references-v54.js", html)

    def test_bad_catalog_kept(self):
        self.store.mkdir()
        (self.store/'index.json').write_text('{"items": []}')
        with self.assertRaises(AssetSourceError):
            register(self.store,self.inbox,self.library,'song.wav','audio','reference',0)
        self.assertEqual((self.store/'index.json').read_text(),'{"items": []}')


if __name__ == '__main__':
    unittest.main()
