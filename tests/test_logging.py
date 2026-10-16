import unittest,os,tempfile,json
from pathlib import Path
from unittest.mock import patch
import diagnostic_logging as l
class Tests(unittest.TestCase):
 def test_secrets(self):
  x=l.scrub({'token':'secret','message':'Bearer abcdef','number':1})
  self.assertEqual(x['token'],'[REDACTED]');self.assertNotIn('abcdef',x['message']);self.assertEqual(x['number'],1)
 def test_event(self):
  l.event('test.event',password='abc',reason='ok')
  self.assertTrue(any(x['event']=='test.event' for x in l.recent(10)))
 def test_limits(self):
  self.assertLessEqual(len(l.recent(10000)),300)
if __name__=='__main__':unittest.main()
