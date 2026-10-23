# v0.5 UI Overhaul 28 — Camera preview layouts

## Implemented
- Three selectable camera preview layouts: inset, split, shooting-only (full preview inside viewport).
- Japanese control labels and accessible pressed state, restoration/cleanup.
- Trigger resize for camera aspect updates; camera rendering continues to use the existing ResizeObserver.
- Fixed motion seek to invalidate the linked shooting preview through the owning target preview.
- Preserves original main and earlier numbered branches.

## Verified
- `node test_v05_shooting_layout_v28.mjs`: PASS
- `node test_v05_shooting_preview_v27.mjs`: PASS
- JS syntax of modified modules: PASS

## Limitations
- Real-browser/WebGL end-to-end validation is unavailable in this environment; no claim of rendered-picture quality.
- Project-specific FPS, lens preset changes, focus distance and rendered DOF are NOT completed in this step.
- MCP and WebMCP existing playhead API/tool implementations are unchanged; no real-transport test completed.
- The full-view option fills the preview viewport, not the operating system monitor.
