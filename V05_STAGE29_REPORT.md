# v0.5 UI Overhaul 29 — Camera FPS and lens state

Branch: `feature/v05-ui-overhaul-29`

## Delivered
- Frame-rate aware camera sequence evaluator (`camera-sync-v29.js`), with stale asynchronous result protection and input validation.
- Lens state extraction: focal length (mm), f-stop, focus distance; emitted alongside evaluated camera pose.
- Dedicated lens application to registered shooting camera; no mutation of navigation camera.
- Shooting-preview lifecycle registers and unregisters the lens runtime.
- Backward-compatible `bai:camera-pose-evaluated` event for v26 camera pose adapter and v27 preview.
- Prior v25 evaluator implementation remains available but is not installed twice.

## Important limits
- FPS is configurable through `bai:project-frame-rate` and `setFrameRate()`; automatic reading of FPS from the persisted project metadata is not implemented yet.
- Aperture and focus distance are stored as userData metadata; actual GPU depth-of-field blur is **not** implemented.
- Real browser WebGL, MCP/WebMCP on-wire tests and 3D camera image comparison remain unverified.
- Existing `main` and unrelated working-tree changes are preserved.

## Verification
- `node test_v05_camera_v29.cjs` PASS
- `node test_v05_camera_sync_v25.cjs` PASS
- `node test_v05_camera_render_v26.cjs` PASS
- `node test_v05_shooting_layout_v28.mjs` PASS
- JS `node --check` successful.
