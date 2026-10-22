# v0.5 UI Overhaul 41 — Focus interval evaluation

- Added `studio/v05/js/focus-interval-v41.js`: explicit evaluator registration, sequential frame sampling, invalid/mismatched frame rejection, cancellation, bounded scans, progress and completion events, aggregate maximum error and problematic frame report.
- No guessed camera/model state is generated. An actual frame evaluator must be registered by the runtime before this function can produce real diagnostic results.
- Included the module in the v0.5 HTML page. No completed GUI editor is claimed.
- The module is browser-accessible through `window.BAIStudioFocusIntervalV41`.
- Existing HTTP API, standard MCP and WebMCP do not yet expose the new interval operation: required follow-up; existing routes remain unchanged.
- No GPU pixel verification, real model/browser E2E, or real MCP/WebMCP communication test performed.
- Tests: `node test_v05_focus_interval_v41.mjs` and `node test_v05_focus_visual_v40.mjs`.
