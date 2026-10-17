"""Optional local Ollama discovery and structured pose instruction service.
No Ollama request is made at import/startup. All failures are non-fatal.
"""
import json, os, urllib.request, urllib.error
from pathlib import Path

DEFAULTS = {'ollama_url':'http://127.0.0.1:11434','auto_discovery':True,'rag_enabled':True,'knowledge_scope':'common','default_llm':'qwen3.5:9b','enabled':True,'execution_policy':'preview','keep_alive_minutes':5}
ALLOWED = ('http://127.0.0.1:11434','http://localhost:11434')
class AIUnavailable(Exception): pass

def read_config(path):
    try:
        data=json.loads(Path(path).read_text(encoding='utf-8'))
        return {**DEFAULTS, **{k:v for k,v in data.items() if k in DEFAULTS}}
    except (OSError, ValueError, TypeError): return dict(DEFAULTS)

def save_config(path, data):
    if not isinstance(data,dict): raise ValueError('settings must be object')
    if set(data)-set(DEFAULTS): raise ValueError('unknown settings')
    cfg={**read_config(path),**data}
    if cfg['ollama_url'] not in ALLOWED: raise ValueError('Ollama URL must be local default port')
    if cfg['execution_policy'] not in ('suggest','preview','apply'):raise ValueError('invalid policy')
    if cfg['knowledge_scope'] not in ('common','private'):raise ValueError('invalid scope')
    if not isinstance(cfg['enabled'],bool) or not isinstance(cfg['auto_discovery'],bool) or not isinstance(cfg['rag_enabled'],bool):raise ValueError('invalid switches')
    if not isinstance(cfg['keep_alive_minutes'],int) or not 0<=cfg['keep_alive_minutes']<=60:raise ValueError('invalid keep alive')
    dest=Path(path);dest.parent.mkdir(parents=True,exist_ok=True)
    tmp=dest.with_suffix('.tmp');tmp.write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf8');os.replace(tmp,dest)
    return cfg

def _query(cfg,endpoint,body=None,timeout=2):
    if not cfg.get('enabled',True):raise AIUnavailable('AI disabled. Manual controls remain available.')
    url=cfg['ollama_url']
    if url not in ALLOWED:raise AIUnavailable('unsupported Ollama endpoint')
    req=urllib.request.Request(url+endpoint,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='GET' if body is None else 'POST')
    try:
        with urllib.request.urlopen(req,timeout=timeout) as res:return json.loads(res.read(2*1024*1024))
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:raise AIUnavailable('Ollama unavailable; manual editing is still available') from e

def status(cfg):
    if not cfg['enabled']:return {'available':False,'state':'disabled','models':[],'manual_available':True}
    try:
        models=_query(cfg,'/api/tags').get('models',[])
        return {'available':True,'state':'connected','models':[{'name':m.get('name',''),'size':m.get('size',0)} for m in models if isinstance(m,dict)],'manual_available':True,'default_llm':cfg['default_llm']}
    except AIUnavailable:
        return {'available':False,'state':'offline','models':[],'manual_available':True,'message':'Ollamaが起動していません。通常制作は利用できます。'}

def interpret_pose(cfg,text):
    if not isinstance(text,str) or not text.strip() or len(text)>1500:raise ValueError('pose instruction must contain 1-1500 characters')
    prompt='ユーザーの姿勢指示を安全な提案JSONに整理してください。ボーン角度を創作せず、constraints配列の各要素に bone, action, description を入れ、preview_only=true を守る。'
    schema={
        'type':'object',
        'properties':{
            'constraints':{'type':'array','items':{'type':'object','properties':{
                'bone':{'type':'string'},'action':{'type':'string'},'description':{'type':'string'}
            },'required':['bone','action','description']}},
            'preview_only':{'type':'boolean'}
        },'required':['constraints','preview_only']
    }
    body={'model':cfg['default_llm'],'stream':False,
          'keep_alive':str(cfg['keep_alive_minutes'])+'m',
          'format':schema,
          'messages':[{'role':'system','content':prompt},{'role':'user','content':text}]}

    response=_query(cfg,'/api/chat',body,timeout=75)
    try: parsed=json.loads(response['message']['content'])
    except (KeyError,TypeError,ValueError) as exc:raise AIUnavailable('Could not parse structured model response') from exc
    if not isinstance(parsed,dict) or not isinstance(parsed.get('constraints'),list):raise AIUnavailable('Unexpected model schema')
    return {'ok':True,'proposal':{'constraints':parsed['constraints'][:30],'preview_only':True},'applied':False,'note':'AI提案のみ。IK実行・キーフレーム保存は行いません。'}
