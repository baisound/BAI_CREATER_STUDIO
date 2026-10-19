"""Stable optimistic concurrency token for camera project API."""
import hashlib
import json

def revision(project):
    canonical = json.dumps(project, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()
