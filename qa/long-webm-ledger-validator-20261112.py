from pathlib import Path
import json,csv,io,subprocess,hashlib,re
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8'))
j=read('docs/roadmap/FEATURE_REGISTER.json');c=list(csv.DictReader(Path('docs/roadmap/FEATURE_REGISTER.csv').open(encoding='utf-8-sig')))
old=json.loads(subprocess.check_output(['git','show','3facd74:docs/roadmap/FEATURE_REGISTER.json']).decode('utf-8'))
oc=list(csv.DictReader(io.StringIO(subprocess.check_output(['git','show','3facd74:docs/roadmap/FEATURE_REGISTER.csv']).decode('utf-8-sig'))))
def mismatch(j,c):
 d={r['id']:r['detail'] for r in j['features']};return [r['id'] for r in c if r['detail']!=d[r['id']]]
assert len(j['features'])==len(c)==151 and mismatch(j,c)==mismatch(old,oc)
for id in ['DATA-016','DATA-002','DATA-008','AUDIO-001','RENDER-001','RENDER-006']:
 added=[]
 for new,previous in [(j['features'],old['features']),(c,oc)]:
  n=next(x['detail'] for x in new if x['id']==id);o=next(x['detail'] for x in previous if x['id']==id)
  assert n.startswith(o);added.append(n[len(o):])
 assert added[0]==added[1]
matrix=read('qa/media-format-evidence-matrix-20261109.json');assert len(matrix['rows'])==13
for row in matrix['rows']:
 for e in row['evidence']:
  b=subprocess.check_output(['git','show',e['gitCommit']+':'+e['path']]) if e.get('gitCommit') else Path(e['path']).read_bytes()
  assert hashlib.sha256(b.replace(b'\r\n',b'\n')).hexdigest()==e['sha256'],e['path']
p=Path('docs/v05/LONG_WEBM_SOURCE_WINDOWS_20261112_JA.md')
for target in re.findall(r'\]\(([^)]+)\)',p.read_text(encoding='utf-8')):
 if not target.startswith(('http','mailto')):assert (p.parent/target.split('#')[0]).exists(),target
read('docs/roadmap/PHASE_E_IMPLEMENTATION_STATUS.json')
print(json.dumps({'status':'passed','matrixRows':13,'featureIds':151,'existingJsonCsvDifferencesUnchanged':len(mismatch(j,c)),'changedIds':6,'allEvidenceHashesIncludingHistoricSource':'passed','links':'passed'},indent=2))
