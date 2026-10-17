"""Offline evidence-based Phase B report; no claims without evidence."""
import argparse, json, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from phase_b_release_gate import evaluate, write_report

p=argparse.ArgumentParser(description='Create blocked-by-default Phase B readiness report')
p.add_argument('--evidence',type=Path,help='JSON dictionary of manually verified test evidence')
p.add_argument('--out',type=Path,required=True,help='New report location (never overwrite)')
a=p.parse_args()
evidence=json.loads(a.evidence.read_text(encoding='utf-8')) if a.evidence else {}
report=evaluate(evidence)
print(write_report(a.out,report),report['gate'],file=sys.stdout)
