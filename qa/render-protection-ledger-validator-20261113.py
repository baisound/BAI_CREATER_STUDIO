"""Read back this checkpoint without changing prior evidence or feature IDs."""
from pathlib import Path
import csv,hashlib,io,json,re,subprocess
read=lambda p:json.loads(Path(p).read_text(encoding='utf8'))
show=lambda p:subprocess.check_output(['git','show','44c8afa:'+p]).decode('utf-8-sig')
j=read('docs/roadmap/FEATURE_REGISTER.json')
c=list(csv.DictReader(Path('docs/roadmap/FEATURE_REGISTER.csv').open(encoding='utf-8-sig')))
old=json.loads(show('docs/roadmap/FEATURE_REGISTER.json'))
oldc=list(csv.DictReader(io.StringIO(show('docs/roadmap/FEATURE_REGISTER.csv'))))
assert len(j['features'])==len(c)==151
def differences(j,c):
 m={x['id']:x['detail'] for x in j['features']};return [x['id'] for x in c if x['detail']!=m[x['id']]]
assert differences(j,c)==differences(old,oldc)
e=read('qa/render-protection-evidence-20261113.json')
for id in e['ids']:
 additions=[]
 for new,prior in [(j['features'],old['features']),(c,oldc)]:
  n=next(x for x in new if x['id']==id);p=next(x for x in prior if x['id']==id)
  assert n['detail'].startswith(p['detail']) and n['status']==p['status'];additions.append(n['detail'][len(p['detail']):])
 assert additions[0]==additions[1]
for h in e['sourceHashes']:
 assert hashlib.sha256(Path(h['path']).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==h['sha256'],h['path']
assert all(r['status']=='passed' for r in e['reports'].values())
m=read('qa/media-format-evidence-matrix-20261109.json');assert len(m['rows'])==13 and m['nextTask']['id']=='G3-E1'
for row in m['rows']:
 for h in row['evidence']:
  b=subprocess.check_output(['git','show',h['gitCommit']+':'+h['path']]) if h.get('gitCommit') else Path(h['path']).read_bytes()
  assert hashlib.sha256(b.replace(b'\r\n',b'\n')).hexdigest()==h['sha256'],h['path']
p=Path(e['document'])
for link in re.findall(r'\]\(([^)]+)\)',p.read_text(encoding='utf8')):
 if not link.startswith(('http','mailto')):assert (p.parent/link.split('#')[0]).exists(),link
s=read('docs/roadmap/PHASE_E_IMPLEMENTATION_STATUS.json');assert s['planned_in'][-1]['status']=='partial_verified'
print(json.dumps({'status':'passed','featureIds':151,'changedIds':len(e['ids']),'existingDetailDifferencesUnchanged':len(differences(j,c)),'sourceHashes':len(e['sourceHashes']),'historicalMediaEvidenceRows':13,'links':'passed','nextTask':'G3-E1; OGV remains low priority'},indent=2))
