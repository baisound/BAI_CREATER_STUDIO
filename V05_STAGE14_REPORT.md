# UI Overhaul 14 — Timeline seek bridge

Branch: `feature/v05-ui-overhaul-14` (child of 13).

## Implemented
- v0.5 timeline exposes `BAIStudioTimeline.seek(seconds)`, `getTime()`, and `getActiveClips()`.
- User timeline ruler click/double click publishes `bai:timeline-seek` event with current time and active clip offsets.
- Opt-in `BAIStudioEngineBridge.register({seek})` passes seek and active clips to a caller-supplied playback evaluator; error reported as `bai:engine-seek-error`.
- No fake rendering: bridge status is disconnected until a real evaluator is registered.
- Existing MCP/WebMCP playhead_get/set operations are retained, without introducing duplicate tools.

## Remaining / limitations
- Bridge is an integration contract; existing VMD/camera/audio engines have NOT been registered to it.
- API playhead changes have not been propagated to the browser client.
- Browser E2E and MCP/WebMCP real wire-transport tests have NOT been run.
- This is not 3D/audio playback synchronization.

## Tests
- `node test_v05_stage14_bridge.js`: passed (7 assertions)
- `python -m pytest -q test_v05_stage13.py test_v05_stage12.py`: 14 tests passed, 5 subtests passed.
- JS syntax validation: both edited JS files pass.
