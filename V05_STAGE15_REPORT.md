# UI Overhaul phase 15 — timeline live-runtime routing

Branch: feature/v05-ui-overhaul-15

## Implemented
- Replaced placeholder single-adapter timeline bridge with per-clip runtime registration (`registerEngine(type, clipId, runtime)`).
- Track-local offsets sent to seekable runtimes by track type and clip ID; explicit registration/disposal, error reporting, and stale-operation guard.
- Existing legacy `register` compatibility preserved.
- Existing playhead API and registered standard MCP/WebMCP tools remain unchanged and available; no new tool name is needed for routing.

## Not implemented or proven
- Actual runtime instances from legacy motion/camera pages are not yet registered in the v0.5 viewport; no loaded VMD/GLB model or camera render is proven to update.
- MCP/WebMCP real transport tests, browser UI E2E, audio and camera engine integration are not verified.

## Tests
- `node --test tests/v05-phase15-bridge.test.cjs` — 5/5 passed.
- `node --check studio/v05/js/timeline-engine-bridge.js` — passed.

## Next
- Register actual model preview and camera runtime from owning workspace lifecycle, ensure their clip IDs match saved arrangement.
- Subscribe live browser sessions to external API/MCP playhead updates and run render-level E2E tests.
