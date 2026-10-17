#!/usr/bin/env python3
"""Read-only offline QA report. Paths are explicitly provided by user."""
import sys, json, argparse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vrm_local_transfer import transfer,quality


def main():
    p=argparse.ArgumentParser()
    p.add_argument('source',type=Path)
    p.add_argument('target',type=Path)
    p.add_argument('--clip')
    p.add_argument('--confirm-common-coordinates',action='store_true')
    p.add_argument('--out',type=Path)
    a=p.parse_args()
    report=transfer(a.source.read_bytes(),a.target.read_bytes(),a.clip,confirmed=a.confirm_common_coordinates)
    report['quality']=quality(report)
    text=json.dumps(report,ensure_ascii=False,indent=2)
    if a.out:a.out.write_text(text,encoding='utf-8')
    else:print(text)
    return 0
if __name__=='__main__':raise SystemExit(main())
