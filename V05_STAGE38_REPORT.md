# v0.5 UI刷新 Stage 38

Branch: `feature/v05-ui-overhaul-38`

## Changes
- Replace focus target free-text model/bone inputs with selectors populated from actually loaded Three.js model objects.
- Bone candidates include named `Bone`/`isBone` nodes; model root remains selectable.
- Preserve saved selections when models are not loaded; display unverified choices rather than silently removing settings.
- Emit model-loaded/removed events from the actual motion loader and reapply saved follow target on load.
- Preserve v37 project-scoped persistence API and existing MCP/WebMCP `bai_studio_focus_target_get/set` routes without inventing duplicate tools.

## Checks
- `node test_v05_focus_select_v38.cjs` PASS
- `python -m pytest -q test_v05_focus_target_v37.py` 2 PASS
- `node --check` for modified JS PASS

## Limitations
- No real VRM/PMX GPU E2E test, no MCP/WebMCP transport test.
- The existing focus diagnostic/DOF fidelity is not proven with a real animated rig.
- Selection UI still needs a full browser usability test.
