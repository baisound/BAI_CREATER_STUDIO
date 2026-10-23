# v0.5 UI Overhaul 13 — Playhead synchronization foundation

## Implemented
- Per-project revision-guarded playhead read/write API (`GET/POST /api/studio/v05/playhead`), atomic JSON persistence; corruption preserved.
- Timeline ruler click, seconds field and seek button read/write same server state; project changes reload saved playhead.
- Standard MCP `bai_studio_playhead_get/set` and WebMCP equivalent tools via the same HTTP API.
- All existing changes and original Git refs retained; separate branch.

## Validation
- `python -m unittest -q test_v05_stage13 test_v05_stage12 test_v05_stage11`: 20 passed.
- `python -m py_compile studio_v05_playhead.py server.py mcp_server.py` passed.
- `node --check webmcp.js` and `node --check studio/v05/js/asset-workflow-v06.js` passed.

## Not implemented / not verified
- This is an EDIT CURSOR. No 3D animation seek, audio transport, camera evaluation or live shared playback yet.
- Browser click E2E and MCP/WebMCP transport E2E were not run.
- Inherited uncommitted changes retained; do not stage or discard them.
