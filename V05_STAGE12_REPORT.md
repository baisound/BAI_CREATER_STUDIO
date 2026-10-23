# v0.5 UI Overhaul 12 — implementation & verification

## Implemented
- Ctrl/Command+click multi-selection in the registered-asset timeline, with visible selected clip outlines.
- Batch move selected clips through existing `/api/studio/v05/arrangement/batch-move` (also exposed through standard MCP and WebMCP).
- One-step batch Undo UI through `/api/studio/v05/arrangement/undo`.
- Track lock/mute buttons through `/api/studio/v05/timeline/flags` (also exposed through standard MCP and WebMCP).
- Server-side lock enforcement for `place`, `edit_clip`, and `batch_move`, protecting both source and destination tracks. Mute remains persisted metadata, NOT real engine audio muting.

## Verification
- `python -m unittest -v test_v05_stage12 test_v05_stage11 test_v05_track_layout test_v05_clip_edit`: 23/23 passed.
- `python -m py_compile studio_v05_arrangement.py server.py` passed.
- `node --check studio/v05/js/asset-workflow-v06.js` passed.
- Full browser drag E2E, MCP/WebMCP transport E2E, legacy engine playback/mute sync: NOT VERIFIED.

## Remaining limitations
- Batch movement on the canvas is metadata-only, with no actual animation playback integration.
- Batch drag preserves relative clip offsets; only the dragged clip can change target track (others remain in their source tracks).
- Undo currently covers the previous batch move only, not all Studio edits; Redo is not yet integrated.
- No full browser interaction test in this delivery.
- Original inherited uncommitted worktree differences are deliberately retained, not committed.
