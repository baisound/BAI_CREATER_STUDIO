# v0.5 UI Overhaul 37 — Focus target settings

- Branch: feature/v05-ui-overhaul-37
- Scoped change: focus model/bone selection stored per project. Does not alter legacy camera data.
- API: GET/POST `/api/studio/v05/focus-target`
- Standard MCP & WebMCP: `bai_studio_focus_target_get`, `bai_studio_focus_target_set`
- UI: v0.5 inspector section with model ID, optional bone name, enabled toggle and save.
- Storage: data/studio_v05_focus_targets/<project_id>.json; atomic replace, revision check, reject corrupt data.
- Tests: pytest test_v05_focus_target_v37.py (2 passed); Python compile and JS syntax checks passed.
- Not verified: live MCP transport, browser E2E, populated model-ID chooser, end-to-end Three.js focus tracking, DOF rendering parity.
- Existing uncommitted files intentionally preserved, not staged.
