# v0.5 UI Overhaul Stage 21

## Implemented
- Independent work branch `feature/v05-ui-overhaul-21`, parent stage 20.
- `BAIStudioAssetRuntime.setModelLoader(fn)` loads each unique target model once before clip motion attachment.
- Loader receives `{modelId, asset, projectId}`. Motion loader receives `targetModelId` and loaded `targetPreview`.
- Protects against a stale asynchronous model result after project change/cleanup.
- Owns and disposes only model instances loaded by its model loader; externally bound targets are not disposed by the runtime.
- No changes to existing persisted data, HTTP routes, standard MCP or WebMCP tools. Existing playhead operations remain available.

## Verified
- `node tests/v05-phase21-model-loading.test.cjs`: PASS, 6 assertions/scenarios.
- `node tests/v05-phase16-live-motion.test.cjs`: PASS, 5 tests.
- `node --check studio/v05/js/asset-runtime-v18.js`: PASS.

## Still incomplete
- No real model-loader adapter registered using existing private `loadModel()` functionality.
- No end-to-end VRM/PMX/VMD pose rendering verified.
- No end-to-end MCP/WebMCP transport testing.
- Actual model loader needs published host integration and resource ownership policy.
