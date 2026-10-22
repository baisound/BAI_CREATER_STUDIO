# v0.5 Stage 33 — Camera focus snapshot consistency

Branch: feature/v05-ui-overhaul-33

## Implemented
- Shared immutable camera time/lens snapshot exposed as `bai:camera-focus-snapshot`.
- Camera focus snapshot consumes the same `bai:camera-v29-state` event as the shooting camera lens adapter.
- Invalid or incomplete focus inputs are reported through existing `bai:diagnostic` integration.
- Snapshot explicitly declares `dofRendered: false`; this is not a GPU DOF implementation.
- Standard MCP/WebMCP time changes continue through existing playhead endpoint; no new duplicate tool was added.

## Tests
- `node test_v05_camera_focus_v33.cjs`: PASS.
- `node --check studio/v05/js/camera-focus-consistency-v33.js`: PASS.
- Browser/WebGL and MCP/WebMCP end-to-end tests: NOT RUN.

## Remaining
- Actual GPU depth-of-field compositor and one-source-of-truth diagnostic-versus-render checks.
- Actual browser verification and full application regression testing.
