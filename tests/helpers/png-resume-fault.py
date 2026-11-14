"""Isolated test process only: shorten the real PNG encoder or fail packaging."""
import json
import sys
import os
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import server
from bai_studio.v05.render import media_render as render, png_sequence


class InlineThread:
    def __init__(self, target, args, **kwargs): self.target,self.args=target,args
    def start(self): self.target(*self.args)


class ShortEncoder(render.RenderProcessScope):
    def spawn(self,args,**kwargs):
        if '-start_number' in args:
            args=list(args);args[args.index('-frames:v')+1]='2'
        return super().spawn(args,**kwargs)


mode=sys.argv[1]
request=json.loads(sys.argv[2])
with patch.object(render,'threading',SimpleNamespace(Thread=InlineThread)):
    if mode=='short':
        with patch.object(render,'RenderProcessScope',ShortEncoder):
            result=render.start(server.DATA,inventory=server.unified_assets(),server_port=int(os.environ['BAI_RESUME_SERVER_PORT']),**request)
    elif mode=='package':
        with patch.object(png_sequence,'package',side_effect=OSError('injected packaging storage failure')):
            result=render.start(server.DATA,inventory=server.unified_assets(),server_port=int(os.environ['BAI_RESUME_SERVER_PORT']),**request)
    else:raise ValueError(mode)
print(json.dumps(result,ensure_ascii=False))
