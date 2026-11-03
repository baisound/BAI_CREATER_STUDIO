"""P2 ⑤ リターゲットの骨格比較を、実際の HTTP ハンドラー経由で確かめる回帰試験。

server.py の do_GET の中に `from ... import inspect` があると、関数全体で `inspect` が
ローカル変数になり、先頭のモジュール import（retarget_analysis.inspect）を使う
/api/retarget/compare などが UnboundLocalError で接続ごと落ちる（2026-11-03 の独立レビューで発見）。
サーバーは同じプロセスで起動し、ルートの conftest.py の一時データ（BAI_DATA_DIR）を使う。
"""
import json
import pathlib
import shutil
import sys
import threading
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server

NAMES = ('aaaaaaaaaaaaaaaaaaaa.glb', 'cccccccccccccccccccc.glb')


@pytest.fixture
def base():
    assets = server.DATA / 'integrated_v02' / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    registry = server.DATA / 'integrated_v02' / 'user_assets.json'
    old_registry = registry.read_bytes() if registry.exists() else None
    for name in NAMES:
        shutil.copyfile(ROOT / 'tests' / 'fixtures' / 'synthetic_test_model.glb', assets / name)
    registry.write_text(json.dumps([
        {'id': f'user-{i}', 'name': f'model{i}.glb', 'filename': name, 'kind': 'model', 'bytes': 1}
        for i, name in enumerate(NAMES)]), encoding='utf-8')
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        yield f'http://127.0.0.1:{httpd.server_address[1]}'
    finally:
        httpd.shutdown()
        httpd.server_close()
        for name in NAMES:
            (assets / name).unlink(missing_ok=True)
        if old_registry is None:
            registry.unlink(missing_ok=True)
        else:
            registry.write_bytes(old_registry)


def test_retarget_compare_answers_through_the_handler(base):
    query = f'source=integrated:{NAMES[0]}&target=integrated:{NAMES[1]}'
    with urllib.request.urlopen(f'{base}/api/retarget/compare?{query}', timeout=30) as response:
        assert response.status == 200
        body = json.loads(response.read())
    assert 'comparison' in body and body['comparison']['matched_count'] >= 1
