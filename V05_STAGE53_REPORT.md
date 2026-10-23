# BAI Creator Studio v0.5 Stage 53

## Implemented
- Added multiple-file local browser import (sequential uploads), reusing the existing validated `/api/library-assets/upload` endpoint; a cancel button stops the remaining queue, not an upload in progress.
- Added read-only `/api/studio/v05/assets/capabilities` exposing server-supported formats and sizes, plus `bai_studio_asset_capabilities` for both standard MCP and WebMCP.
- Aligned v0.5 search classification with library `kind` metadata for stage, prop, FX, image and audio/video records.
- Existing registered-asset search and timeline placement APIs remain unchanged.

## Constraints
- This is NOT universal format ingestion: VRM/FBX/PMX/VMD are not accepted by the existing library upload endpoint; previously registered assets remain searchable. Do not report unsupported inputs as successfully imported.
- The batch importer runs in the browser; MCP/WebMCP discover capabilities and search assets but do not read arbitrary local user files. The user picks files explicitly.
- Existing server HTTP and browser E2E integration tests were not run; test scope is new Python tests, existing targeted test, JavaScript syntax and Git/ZIP inspection.
- Full UI i18n and thumbnail generation are separate follow-up work.

## Next stage
Stage 54: source-reference vs copy policy, relocation and safe relink, plus broader file format registration without bypassing input validation.
