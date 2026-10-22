from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]

def test_navigation_entry():
    html=(ROOT/'studio/index.html').read_text(encoding='utf-8')
    assert '/studio/v05/index.html' in html
    assert (ROOT/'studio/v05/index.html').exists()

def test_backlink():
    html=(ROOT/'studio/v05/index.html').read_text(encoding='utf-8')
    assert '/studio/index.html' in html

def test_i18n_pair():
    base=ROOT/'studio/v05/locales'
    assert isinstance(json.loads((base/'jp.json').read_text(encoding='utf-8')),dict)
    assert isinstance(json.loads((base/'en.json').read_text(encoding='utf-8')),dict)

def test_existing_mcp_surfaces_preserved():
    assert 'tools/list' in (ROOT/'mcp_server.py').read_text(encoding='utf-8')
    assert 'registerTool' in (ROOT/'webmcp.js').read_text(encoding='utf-8')
