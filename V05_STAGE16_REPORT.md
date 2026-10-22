# UI Overhaul phase 16 — Loaded motion runtime adapter

Branch: feature/v05-ui-overhaul-16

## Implemented
- `studio/v05/js/live-motion-adapter.js` provides `BAIStudioLiveMotion.attach({clipId, preview, invalidate})` for already-loaded VMD/GLB previews with a real `seek(seconds)` implementation.
- Uses existing per-clip bridge and clip-relative time; clamps to preview duration, invalidates renderer, unregisters on replacement/unmount, supports detachAll.
- Loaded by v0.5 HTML after the engine bridge.
- No new MCP/WebMCP tool is needed: existing playhead set/get operations and their HTTP API are preserved, but external changes are **not** yet delivered to open browsers.

## Limitations
- The owning legacy motion view has not yet been migrated into the v0.5 browser workspace: the adapter requires the runtime owner to call `attach` after loading a model/motion. No loaded model is currently automatically instantiated in v0.5.
- No live VMD/GLB render E2E; no real MCP/WebMCP transport test.
- No camera or audio runtime integration yet.

## Verification
- `node --test tests/v05-phase15-bridge.test.cjs tests/v05-phase16-live-motion.test.cjs`
- `node --check studio/v05/js/live-motion-adapter.js`
