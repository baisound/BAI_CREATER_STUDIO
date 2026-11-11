from pathlib import Path
import json,csv,subprocess,io,hashlib,re
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8'))
j=read('docs/roadmap/FEATURE_REGISTER.json');c=list(csv.DictReader(Path('docs/roadmap/FEATURE_REGISTER.csv').open(encoding='utf-8-sig')))
o=json.loads(subprocess.check_output(['git','show','69db20f:docs/roadmap/FEATURE_REGISTER.json']).decode('utf-8'))
oc=list(csv.DictReader(io.StringIO(subprocess.check_output(['git','show','69db20f:docs/roadmap/FEATURE_REGISTER.csv']).decode('utf-8-sig'))))
def differences(j,c):
 m={x['id']:x['detail'] for x in j['features']};return [x['id'] for x in c if x['detail']!=m[x['id']]]
assert len(j['features'])==len(c)==151 and differences(j,c)==differences(o,oc)
ids=['DATA-002','DATA-008','CORE-004','CORE-012','RENDER-001','RENDER-006']
for id in ids:
 additions=[]
 for new,old in [(j['features'],o['features']),(c,oc)]:
  n=next(x['detail'] for x in new if x['id']==id);p=next(x['detail'] for x in old if x['id']==id);assert n.startswith(p);additions.append(n[len(p):])
 assert additions[0]==additions[1]
e=read('qa/clip-history-evidence-20261112.json')
for h in e['sourceHashes']:assert hashlib.sha256(Path(h['path']).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==h['sha256'],h['path']
m=read('qa/media-format-evidence-matrix-20261109.json');assert m['nextTask']['id']=='G3-D1' and len(m['rows'])==13
for row in m['rows']:
 for h in row['evidence']:
  b=subprocess.check_output(['git','show',h['gitCommit']+':'+h['path']]) if h.get('gitCommit') else Path(h['path']).read_bytes()
  assert hashlib.sha256(b.replace(b'\r\n',b'\n')).hexdigest()==h['sha256'],h['path']
p=Path('docs/v05/CLIP_EDIT_HISTORY_20261112_JA.md')
for link in re.findall(r'\]\(([^)]+)\)',p.read_text(encoding='utf-8')):
 if not link.startswith(('http','mailto')):assert (p.parent/link.split('#')[0]).exists(),link
read('docs/roadmap/PHASE_E_IMPLEMENTATION_STATUS.json')
print(json.dumps({'status':'passed','featureIds':151,'changedIds':6,'existingDetailDifferencesUnchanged':len(differences(j,c)),'sourceHashes':8,'formatEvidenceRowsUnchanged':13,'links':'passed','nextTask':'G3-D1, OGV deferred by Owner'},indent=2))
