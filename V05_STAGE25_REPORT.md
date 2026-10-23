# v0.5 UI overhaul stage 25

Branch: feature/v05-ui-overhaul-25

## Implemented
- Time-to-frame conversion and read-only camera sequence evaluation through `/api/camera/sequence/evaluate`.
- Camera pose evaluation events `bai:camera-pose-evaluated` and error events `bai:camera-sync-error`.
- Reject stale async camera evaluations and support explicit stop/start.
- Wire the persisted seek pipeline to camera evaluation.
- Existing standard MCP and WebMCP playhead get/set operations are retained; HTTP API `/api/camera/sequence/evaluate` already exists. No new MCP tool is required for this read-only local evaluation.

## Important limitations
- Camera pose is **not yet applied** to the 3D renderer or active CineCamera.
- Browser WebGL E2E and live MCP/WebMCP communication are not verified.
- Camera FPS currently defaults to 60; project FPS mapping must be integrated before production.
- Camera sequence evaluation uses the existing global camera project and is not project-scoped; project selection safety must be addressed before promoting to full project synchronization.
- No multi-model implementation (prior design-only scope retained).

## Tests
- `node test_v05_camera_sync_v25.cjs` PASS
- `node test_v05_persisted_seek_v23.cjs` PASS
- `node --check studio/v05/js/camera-sync-v25.js` PASS
