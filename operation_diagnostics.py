"""Opt-in UI event journal and safe, live diagnostic ZIP snapshot."""
import io,json,re,time,zipfile,threading
from pathlib import Path
from logging.handlers import RotatingFileHandler
import logging
from qa_capture import ROOT,settings,cleanup
from diagnostic_logging import LOG_DIR
_LOCK=threading.RLock()
_ACTION_FILE=LOG_DIR/'ui_actions.jsonl'
_logger=logging.getLogger('mixamo.actions');_logger.propagate=False;_logger.setLevel(logging.INFO)
_h=RotatingFileHandler(_ACTION_FILE,maxBytes=1024*1024,backupCount=3,encoding='utf-8')
_h.setFormatter(logging.Formatter('%(message)s'));_logger.addHandler(_h)
_ALLOWED={'click','change','tab','play','stop','import','save','restore','error','mcp','other'}
def record_ui_action(payload):
    if not settings()['enabled']:return False
    kind=str(payload.get('kind','other'))[:30]
    if kind not in _ALLOWED:kind='other'
    # Only whitelisted structural fields. Never write form contents, paths or identifiers.
    control=str(payload.get('control',''))[:90]
    control=re.sub('[^a-zA-Z0-9_-]','',control)
    state=str(payload.get('status','started'))[:24]
    if state not in ('started','ok','failed','canceled'):state='started'
    row={'timestamp':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'kind':kind,'control':control,'status':state}
    with _LOCK:_logger.info(json.dumps(row,ensure_ascii=False))
    return True
def diagnostics_archive():
    """Read immutable snapshots; works while rotating handlers are actively writing."""
    cleanup(); data=io.BytesIO()
    with _LOCK,zipfile.ZipFile(data,'w',zipfile.ZIP_DEFLATED) as archive:
        for p in sorted(LOG_DIR.glob('*.jsonl*')):
            if p.is_file():
                archive.writestr('logs/'+p.name,p.read_bytes())
        if settings()['enabled']:
            for p in sorted(ROOT.rglob('results.json'))[-10:]:
                archive.writestr('ui_qa/'+p.parent.name+'/results.json',p.read_bytes())
        archive.writestr('README.txt','Local diagnostic snapshot. Inspect before sharing. Screenshots not included.\n')
    return data.getvalue()
