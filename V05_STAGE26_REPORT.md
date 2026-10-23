# v0.5 UI Overhaul — Stage 26

## Implemented
- A camera-pose consumer listens to `bai:camera-pose-evaluated`.
- `BAIStudioShootingCamera.registerShootingCamera(threeCamera, {navigationCamera})` registers a cinematic Three.js camera only. The navigation camera is explicitly protected.
- Camera position, Euler/quaternion orientation, field of view and focus distance metadata can be applied. Projection and world matrices are refreshed when supported by the camera object.
- Invalid angles and unsupported pose types are rejected without reporting success.

## Limitations
- Existing renderer / camera owner must call registerShootingCamera; registration is not yet wired to an existing real camera.
- API camera pose field conventions must be verified against real response data; current adapter accepts x/y/z objects or arrays, Euler assumed radians, FOV degrees.
- DOF renderer focus distance is not yet fed to postprocess; value is retained as metadata.
- fps derivation still uses v25 default of 60 rather than project resolution.
- UI and WebGL E2E, MCP/WebMCP live communication remain untested.
- Existing MCP/WebMCP playhead APIs retained; no duplicate tool created for in-browser camera instance registration.

## Tests
- `node test_v05_camera_render_v26.cjs` PASS
- `node --check studio/v05/js/camera-render-v26.js` PASS
- `node --check studio/v05/js/camera-sync-v25.js` PASS

## Next
- Map actual camera-evaluate API fields; attach current scene shooting camera via renderer lifecycle; use project fps and DOF focus; browser E2E.
