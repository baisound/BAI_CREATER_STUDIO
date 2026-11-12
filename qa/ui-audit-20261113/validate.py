"""Validate the requested report artifacts; does not operate the owner's product."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QA = Path(__file__).resolve().parent
OUT = ROOT / 'studio/v05/reviews/ui-audit-20261113'

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

audit = json.loads((QA / 'audit.json').read_text(encoding='utf8'))
assert (QA / 'audit.json').read_bytes() == (OUT / 'audit.json').read_bytes()
assert audit['productCodeChanged'] is False
assert len(audit['findings']) == 8
assert sum(f['severity'] == 'P1' for f in audit['findings']) == 6
assert len({f['id'] for f in audit['findings']}) == 8
assert len(audit['featureRouting']) == 11
assert not any(f['removed'] for f in audit['featureRouting'])
assert audit['scores']['performance'] is None
assert audit['scores']['denominator'] == 16
for f in audit['findings']:
    lines = (ROOT / f['source']).read_text(encoding='utf8').splitlines()
    assert 1 <= f['line'] <= len(lines), f['id']
    assert f['acceptance'] and f['proposal']
for a in audit['assets']:
    assert sha(OUT / a['file']) == a['sha256'], a['file']
    if a['file'].startswith('proposal-'):
        assert a['kind'] == 'proposal_not_implemented'
for p in OUT.glob('proposal-*.html'):
    assert '修正案・未実装' in p.read_text(encoding='utf8')
links = 0
for p in list(OUT.glob('*.html')) + [ROOT / 'docs/v05/UI_AUDIT_20261113_JA.md']:
    text = p.read_text(encoding='utf8')
    refs = re.findall(r'(?:href|src)="([^"#]+)"', text) if p.suffix == '.html' else re.findall(r'\]\(([^)]+)\)', text)
    for ref in refs:
        if ref.startswith(('http:', 'https:', 'data:')):
            continue
        target = ref.split('#')[0]
        if target:
            assert (p.parent / target).resolve().is_file(), (p.name, target)
            links += 1
baseline = audit['productMain']
changed = subprocess.check_output(['git', 'diff', '--name-only', baseline, '--', 'studio', 'bai_studio', 'server.py', 'tests', 'docs/roadmap/FEATURE_REGISTER.json', 'docs/roadmap/FEATURE_REGISTER.csv'], cwd=ROOT, text=True).splitlines()
changed = [p for p in changed if not p.startswith('studio/v05/reviews/ui-audit-20261113/')]
assert not changed, changed
measured = json.loads((QA / 'measurements.json').read_text(encoding='utf8'))
assert not measured['errors']
review = json.loads((QA / 'review-validation.json').read_text(encoding='utf8'))
assert review['status'] == 'passed' and review['toggle'] and not review['jsErrors']
install = json.loads((QA / 'installation.json').read_text(encoding='utf8'))
assert install['guardArchiveUnchanged'] and install['globalPreviousContentPreserved']
result = {'status': 'passed', 'findings': 8, 'p1': 6, 'p2': 2, 'routingEntries': 11, 'assetHashes': len(audit['assets']), 'resolvedLocalLinks': links, 'productSourceChanged': False, 'featureLedgerChanged': False, 'productUIFixesTested': False, 'scope': 'audit report artifact validation only'}
(QA / 'artifact-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps(result, ensure_ascii=False))
