"""Isolated test process: real short PNG output, bad encoder, or abrupt exit."""
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import server
from bai_studio.v05.render import media_render as render, frame_video


class InlineThread:
    def __init__(self,target,args,**kwargs):self.target,self.args=target,args
    def start(self):self.target(*self.args)


class FaultScope(render.RenderProcessScope):
    def spawn(self,args,**kwargs):
        args=list(args)
        if mode=='short' and '-c:v' in args and args[args.index('-c:v')+1]=='png':
            args[args.index('-frames:v')+1]='2'
        if mode=='encode' and '-c:v' in args and args[args.index('-c:v')+1]=='libx264':
            args[args.index('-c:v')+1]='bai_missing_encoder'
        return super().spawn(args,**kwargs)


mode=sys.argv[1];request=json.loads(sys.argv[2])
with patch.object(render,'threading',SimpleNamespace(Thread=InlineThread)),patch.object(render,'RenderProcessScope',FaultScope):
    if mode=='crash':
        with patch.object(frame_video,'encode',side_effect=lambda *a:os._exit(0)):
            render.start(server.DATA,inventory=server.unified_assets(),server_port=int(os.environ['BAI_RECOVERY_SERVER_PORT']),**request)
    else:
        result=render.start(server.DATA,inventory=server.unified_assets(),server_port=int(os.environ['BAI_RECOVERY_SERVER_PORT']),**request)
        print(json.dumps(result,ensure_ascii=False))
