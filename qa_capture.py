"""Opt-in, size-limited local UI QA artifacts. No capture when disabled."""
import json, os, time, shutil
from pathlib import Path
from threading import RLock
from bai_paths import data_dir
ROOT=data_dir()/'ui_qa'
CONFIG=ROOT/'settings.json'
LOCK=RLock()
DEFAULT={'enabled':False,'max_total_mb':100,'max_runs':10,'max_age_days':7}
def settings():
    try: return {**DEFAULT,**json.loads(CONFIG.read_text('utf-8'))}
    except (OSError,ValueError,TypeError): return DEFAULT.copy()
def update(enabled):
    with LOCK:
        ROOT.mkdir(parents=True,exist_ok=True)
        d={**settings(),'enabled':bool(enabled)}
        tmp=CONFIG.with_suffix('.tmp');tmp.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,CONFIG)
        return d
def cleanup():
    with LOCK:
        ROOT.mkdir(parents=True,exist_ok=True)
        d=settings();dirs=sorted((p for p in ROOT.iterdir() if p.is_dir()),key=lambda p:p.stat().st_mtime,reverse=True)
        now=time.time(); cap=int(d['max_total_mb'])*1024*1024; used=0;kept=0
        for p in dirs:
            sz=sum(f.stat().st_size for f in p.rglob('*') if f.is_file())
            if now-p.stat().st_mtime>int(d['max_age_days'])*86400 or kept>=int(d['max_runs']) or used+sz>cap:
                shutil.rmtree(p,ignore_errors=True)
            else: kept+=1;used+=sz
        return {'runs':kept,'bytes':used,'limit_bytes':cap}
