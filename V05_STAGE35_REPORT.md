# BAI Creator Studio v0.5 — Stage 35

Branch: `feature/v05-ui-overhaul-35` (based on stage 34).

## Delivered
- `studio/v05/js/camera-focus-follow-v35.js`: compute camera-to-target world-space distance using a matched evaluated snapshot (`seconds`, `frame`, FPS, lens), emit a resolved focus snapshot and forward to existing `BAIStudioCameraProjectRuntime.applyFocus()`.
- `studio/v05/index.html`: load and install focus follow integration.
- `test_v05_focus_follow_v35.cjs`: matched/mismatched time, invalid positions, renderer dispatch and diagnostic checks.
- `start_v05.bat`: Windows launch shortcut opening the v0.5 page on local server port 8765. Python 3 required; existing launcher remains unchanged.

## Scope limits
- A producer for the selected model/bone world position must still emit `bai:camera-focus-target-position` at the evaluated frame; no automatic tracking is asserted here.
- The GPU blur code of stage 34 remains unverified against a real browser GPU; no claim of DOF/diagnostic pixel-perfect agreement.
- MCP/WebMCP time-setting route is preserved, but communication end-to-end remains unverified.
- This does not include new MCP tools because no new persistent API operation was introduced.

## Tests
Run `node test_v05_focus_follow_v35.cjs`, `node test_v05_camera_focus_v33.cjs` and existing DOF regression test. Syntax check with `node --check`.
