# v0.5 UI Overhaul / Stage 34

Branch: `feature/v05-ui-overhaul-34`

## Implemented
- GPU depth-aware blur in the *shooting* preview, using scene color and depth textures with a fullscreen postprocess shader.
- Uses current fStop, focalLengthMm, focusDistance values through existing `BAIStudioCameraProjectRuntime.registerFocusRenderer`.
- Navigation camera and its normal render are not modified; only dedicated shooting preview is affected.
- Fallback to normal rendering when DOF is disabled/unavailable. Resize and GPU resource disposal handled.

## Accuracy and known limitations
- Approximate depth-aware blur, **not** physically calibrated photographic circle-of-confusion. Current model does not reproduce sophisticated occlusion, bokeh or transparent materials accurately.
- Focus distance units must match Three.js scene units; confirm model scale in integration tests.
- The focus data consumer is installed when a shooting preview exists, and will only update from subsequent v29 state events; verify initial-state replay in production UI.
- Cannot claim all existing focus diagnostic modes and rendered output are numerically equivalent yet.
- Real browser/WebGL rendering, GPU performance, MCP/WebMCP network integration and E2E tests not executed.

## Verification
- `node test_v05_shooting_dof_v34.mjs`: PASS
- `node test_v05_camera_focus_v33.cjs`: PASS
- `node test_v05_camera_v29.cjs`: PASS
- `node --check` on changed JavaScript modules: PASS

## Next work
- Render real VRM/PMX assets, verify focus-plane and occlusion visually, ensure all focus modes share the same snapshot.
- Fix initial-state replay and test focus-tracking, single-frame and interval diagnostics, and exported video pipeline.
- Test browser-based interaction and MCP/WebMCP roundtrips.
