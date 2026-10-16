from pathlib import Path
import sys, importlib.util
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sv',root/'server.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
a=mod.sync_read();print('sync status:',a)
assert isinstance(a.get('revision'),int)
assert isinstance(a.get('commandId'),int)
print('PASS (read-only)')
