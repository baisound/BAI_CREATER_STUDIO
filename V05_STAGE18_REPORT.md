# v0.5 UI Overhaul — Stage 18

Branch: feature/v05-ui-overhaul-18
Commit: c5023b4

## Implemented
- Asset/clip ID validation for registered motion clips, filtering unavailable/missing/incorrect-category assets.
- Opt-in motion loader contract; registers verified seekable previews in the existing `BAIStudioLiveMotion` bridge.
- Project switch cleanup, asynchronous stale-load discard, removal cleanup, idempotent reconciliation and explicit error reporting.
- UI action to inspect currently saved clip-to-asset mappings and report connection state.
- Existing API and MCP/WebMCP playhead operations remain unchanged; no replacement or simulated real engine success.

## Not complete
- A production VMD/GLB asset loader has not yet been registered from v0.5's renderer; pressing the check button correctly reports `loader_not_registered` rather than claiming playback.
- Mapping a VMD to a particular VRM/PMX model, model creation and visible 3D playback remain unimplemented.
- MCP/WebMCP real-transport, browser WebGL E2E and full regression not verified.

## Tests
- `node test_v05_stage18_asset_runtime.cjs`: PASS
- `node --check` on both changed JavaScript modules: PASS
- See `stage18-test-output.txt` for pytest status.

Full `.git` and original dirty working-tree changes retained in the ZIP; `main` unchanged.
