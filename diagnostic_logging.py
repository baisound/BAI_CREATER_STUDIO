"""Local-only privacy-aware rotating JSONL diagnostics."""
import json,logging,os,re,threading,time,traceback
from pathlib import Path
from logging.handlers import RotatingFileHandler
LOG_DIR=Path(__file__).resolve().parent/'data'/'logs'
LOG_DIR.mkdir(parents=True,exist_ok=True)
_LOGGER=logging.getLogger('mixamo');_LOGGER.setLevel(logging.INFO);_LOGGER.propagate=False
_handler=RotatingFileHandler(LOG_DIR/'server.jsonl',maxBytes=int(os.environ.get('MIXAMO_LOG_MAX_BYTES','2097152')),backupCount=5,encoding='utf-8')
_handler.setFormatter(logging.Formatter('%(message)s'))
_LOGGER.addHandler(_handler)
_SECRET=re.compile(r'(?i)(bearer\s+[a-z0-9_.-]+|(?:token|api[_-]?key|password|secret)\s*[=:]\s*[^\s,;]+)')
def scrub(value):
    if isinstance(value,dict):return {k:('[REDACTED]' if re.search('(?i)(password|secret|token|authorization|api.?key)',str(k)) else scrub(v)) for k,v in value.items()}
    if isinstance(value,list):return [scrub(v) for v in value[:30]]
    if isinstance(value,str):return _SECRET.sub('[REDACTED]',value[:1000])
    if isinstance(value,(int,float,bool)) or value is None:return value
    return str(type(value).__name__)
def event(name,level='info',**fields):
    row={'timestamp':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'level':level,'event':name,'data':scrub(fields)}
    getattr(_LOGGER,level if level in ('info','warning','error') else 'info')(json.dumps(row,ensure_ascii=False,separators=(',',':')))
def recent(limit=100):
    limit=max(1,min(int(limit),300));p=LOG_DIR/'server.jsonl'; lines=[]
    try:
        with p.open('r',encoding='utf-8',errors='replace') as file:
            for line in file:
                lines.append(line.rstrip());lines=lines[-limit:]
    except FileNotFoundError:pass
    return [json.loads(s) for s in lines if s.startswith('{')]
