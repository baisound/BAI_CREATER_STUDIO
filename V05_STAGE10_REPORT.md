# v0.5 UI Overhaul 10 — Track organization

Added an isolated project-specific track-layout JSON and revision-guarded API (`GET/POST /api/studio/v05/timeline/layout`), matching MCP and WebMCP tools, and UI row reorder/resize controls. No edits to legacy project engine state.

## Verification
- Python unit tests: `python -m unittest -v test_v05_track_layout` (6 passed)
- `python -m py_compile studio_v05_track_layout.py server.py mcp_server.py` PASS
- `node --check webmcp.js` and `node --check studio/v05/js/asset-workflow-v06.js` PASS

## Limits
- Track presentation is isolated from engine playback.
- Browser pointer-drag E2E and real MCP/WebMCP transport tests not performed.
- Multi-clip operations and unified project-wide Undo/Redo are not implemented. Basic track layout history is session-only.
- Legacy uncommitted changes remain untouched.
