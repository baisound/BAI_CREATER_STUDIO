# Stage 17 — real motion preview entry and seek bridge

- Branch: `feature/v05-ui-overhaul-17` (original main untouched)
- Added v0.5 **実動作プレビュー** page, embedding the existing `/workspace/10` audio/dance feature (loaded only when opened).
- Uses the existing live loaded `seek`/`poseAt` functions to update GLB/FBX/PMX/VMD poses; file data and animation curves are not rewritten.
- Same-origin postMessage request/ACK; strict origin and source checks, numeric 0–7200 s validation, clean-up when legacy feature unmounts, request ID to distinguish latest acknowledgement.
- Bridge also listens for existing `bai:timeline-seek` when the live workspace is active.
- Existing playhead API, standard MCP and WebMCP are left intact; **server-to-browser live broadcasting from MCP/WebMCP remains unimplemented**.
- This is a connection to an existing functioning workspace embedded within v0.5, **not** native automatic model loading from new v0.5 arrangement clips or a fully unified 3D viewport.

## Verification
- `node --check studio/v05/js/live-workspace-v17.js`: pass
- `node --check studio/js/features/music-dance-view.js`: pass
- `node /mnt/data/test_v17.cjs`: 9 static assertions pass
- `node --test tests/studio-music-dance-clock.test.mjs`: 2 pass
- `node --test tests/studio-music-dance.test.cjs`: did not finish within tool time budget; no E2E pass claim.
- Browser UI, WebGL pose rendering, actual VMD/GLB load and MCP/WebMCP real communication: unverified.

## Next
Native v0.5 asset IDs to loaded model/animation bindings; time source harmonization (legacy 30 fps vs v0.5 seconds); MCP-originated playhead push; camera sync. Review iframe isolation and workspace lifecycle with browser E2E.
