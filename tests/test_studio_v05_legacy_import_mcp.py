"""WP-L5 旧保存取込の MCP / WebMCP の道具一覧の試験（設計書 §6・WP-L5）。

標準MCPの実クライアント、WebMCPの実ブラウザでの呼び出しは未検証（ここでは一覧・スキーマ・URL組み立てだけ確かめる）。
skip は使わない。
"""
import json
import re
from pathlib import Path

import mcp_server

NAMES = (
    "bai_studio_project_legacy_import_preview",
    "bai_studio_project_legacy_import_get",
    "bai_studio_project_legacy_import_apply",
    "bai_studio_project_legacy_import_revert",
)
ID = "11111111-2222-4333-8444-555555555555"


def tool(name):
    rows = [t for t in mcp_server.TOOLS if t[0] == name]
    assert len(rows) == 1, name
    return rows[0]


def test_four_tools_listed_once_with_schemas():
    names = [t[0] for t in mcp_server.TOOLS]
    assert len(names) == len(set(names))
    for name in NAMES:
        assert name in names
    preview, get, apply, revert = (tool(n)[2] for n in NAMES)
    for schema in (preview, get, apply, revert):
        assert schema["type"] == "object" and schema["additionalProperties"] is False
        assert "id" in schema["properties"] and "project_id" not in schema["properties"]  # 引数名は id
        assert schema["properties"]["id"] == {"type": "string"}
    assert preview["required"] == ["id"]
    assert set(preview["properties"]) == {"id", "include", "fps_policy"}
    assert preview["properties"]["include"]["type"] == "array"
    assert preview["properties"]["include"]["items"]["enum"] == ["music_dance", "timeline_editor"]
    assert preview["properties"]["fps_policy"]["enum"] == ["keep_if_same", "use_legacy"]
    assert get["required"] == ["id"] and set(get["properties"]) == {"id"}
    assert apply["required"] == ["id", "expected", "confirm"]
    assert set(apply["properties"]) == {"id", "expected", "include", "fps_policy", "confirm"}
    assert apply["properties"]["confirm"] == {"type": "boolean"}
    assert revert["required"] == ["id", "confirm"] and set(revert["properties"]) == {"id", "confirm"}


def test_run_maps_to_http_routes(monkeypatch):
    calls = []
    monkeypatch.setattr(mcp_server, "api", lambda path, payload=None: calls.append((path, payload)) or {"ok": True})
    mcp_server.run(NAMES[0], {"id": ID})
    mcp_server.run(NAMES[0], {"id": ID, "include": ["music_dance", "timeline_editor"], "fps_policy": "use_legacy"})
    mcp_server.run(NAMES[1], {"id": ID})
    body = {"id": ID, "expected": {"a": 1}, "include": [], "fps_policy": "keep_if_same", "confirm": True}
    mcp_server.run(NAMES[2], body)
    mcp_server.run(NAMES[3], {"id": ID, "confirm": True})
    base = "/api/studio/v05/project/legacy-import"
    assert calls == [
        (base + "-preview?id=" + ID + "&include=&fps_policy=keep_if_same", None),
        (base + "-preview?id=" + ID + "&include=music_dance%2Ctimeline_editor&fps_policy=use_legacy", None),
        (base + "?id=" + ID, None),
        (base + "/apply", body),
        (base + "/revert", {"id": ID, "confirm": True}),
    ]


def test_webmcp_js_defines_same_four_tools_with_same_routes():
    text = (Path(__file__).resolve().parents[1] / "webmcp.js").read_text(encoding="utf-8")
    for name in NAMES:
        assert "def('" + name + "'" in text
        assert text.count("def('" + name + "'") == 1
    assert "/api/studio/v05/project/legacy-import-preview?id=" in text
    assert "/api/studio/v05/project/legacy-import?id=" in text
    assert "/api/studio/v05/project/legacy-import/apply" in text
    assert "/api/studio/v05/project/legacy-import/revert" in text
    # 読み取り専用の2つだけ末尾が ,true
    for name, read_only in zip(NAMES, (True, True, False, False)):
        line = next(l for l in text.splitlines() if "def('" + name + "'" in l)
        assert line.rstrip().endswith(",true);") is read_only, name
        assert re.search(r"schema\(\{id:str", line)  # 引数名は id
    # 標準MCPとWebMCPの必須項目が同じ
    for name in NAMES:
        line = next(l for l in text.splitlines() if "def('" + name + "'" in l)
        required = re.search(r"\},\[((?:'[a-z_]+',?)+)\]\)", line)
        assert required, name
        assert [x.strip("'") for x in required.group(1).split(",")] == tool(name)[2]["required"]


def test_tools_list_over_stdio_includes_four():
    import subprocess
    import sys
    root = Path(__file__).resolve().parents[1]
    req = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}) + "\n"
    out = subprocess.run([sys.executable, str(root / "mcp_server.py")], input=req, capture_output=True, text=True,
                         timeout=30, cwd=str(root))
    listed = {t["name"]: t for r in out.stdout.splitlines() if r.strip() for t in json.loads(r).get("result", {}).get("tools", [])}
    for name in NAMES:
        assert name in listed
        assert listed[name]["inputSchema"]["required"] == tool(name)[2]["required"]
