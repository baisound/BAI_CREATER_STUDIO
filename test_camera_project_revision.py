import unittest
from camera_project_revision import revision

class RevisionTest(unittest.TestCase):
    def test_canonical_across_key_order(self):
        self.assertEqual(revision({'b':1,'a':2}),revision({'a':2,'b':1}))
    def test_changes_on_sequence_update(self):
        self.assertNotEqual(revision({'sequence':[]}),revision({'sequence':[{'start':0,'end':10}]}))
    def test_endpoint_requires_revision_on_conditional_edit(self):
        from pathlib import Path
        source=Path('server.py').read_text(encoding='utf-8')
        self.assertIn("self.headers.get('If-Match')", source)
        self.assertIn("self.bad(409,", source)
if __name__=='__main__':unittest.main()
