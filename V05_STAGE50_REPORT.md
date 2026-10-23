# BAI Creator Studio v0.5 / Stage 50

## Scope
- Added `focus-render-consistency-v50.js` to compare the diagnostic snapshot and the shooting preview's accepted DOF state for project, time/frame/FPS, focal length, aperture and focus distance.
- Integrated consistency diagnostics into `shooting-preview-v27.js`; disposes the new listener together with the preview.
- Does not claim optical or pixel-level DOF correctness: GPU/browser/E2E visual validation is still required.
- Reuses the existing `bai:diagnostic` event; no duplicate MCP/WebMCP tool required for this internal check. MCP/WebMCP communication remains untested.

## Verification
- `node test_v05_focus_render_v50.mjs` PASS (10 assertions)
- `node test_v05_focus_color_v49.mjs` PASS (10 assertions)
- `node --check studio/v05/js/shooting-preview-v27.js` PASS

## Remaining
- Validate the actual camera pose, source model and bone world coordinates at the same frame.
- Real Three.js GPU pixel comparisons of DOF vs focus-color mode; browser E2E and MCP/WebMCP network checks.
