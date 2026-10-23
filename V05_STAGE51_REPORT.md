# v0.5 UI Overhaul 51 — Focus timing integrity

## Scope
- Preserve `projectId` in the camera focus snapshot.
- Reject pose notifications from a different frame, project, or timestamp.
- Emit a pose evaluation event only after a motion preview `seek()` completes and only when the absolute timeline time and project match the current camera snapshot; a clip-local time alone is not sufficient.
- Maintain the LF policy and protect `main`.

## Verification
- `node test_v05_focus_order_v51.mjs` — PASS
- `node test_v05_focus_render_v50.mjs` — PASS (10 assertions)
- JavaScript syntax checks — PASS

## Outstanding
- Actual WebGL motion/DOF image validation, browser end-to-end behavior, model bone positions and MCP/WebMCP live transport remain unverified.
- The live motion event is deliberately suppressed when no trustworthy absolute timeline context exists; this prevents accidental focus updates at unrelated times.
