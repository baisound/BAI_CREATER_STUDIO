# v0.5 Phase 22 — actual model/motion loader

- Added a browser ES-module loader that reuses the existing Three.js model loader, PMX+VMD player, and GLB/FBX retarget preview.
- Added an opt-in 3D preview panel and linked the existing asset runtime reconciliation control to the preview activation.
- Validated compatibility matrix and module syntax; real WebGL rendering, loading real files, and MCP/WebMCP live communication remain untested.
- The preview intentionally supports only one model; the inherited global viewport lifecycle is not multi-model safe.
- VMD targeting VRM/GLB/FBX is explicitly rejected by the underlying player; supported PMX+VMD and compatible GLB/FBX combinations are handled by existing loaders.
- MCP/WebMCP existing playhead and asset operations are retained, not replaced. No false claim of a new remote browser notification transport.
- All pre-existing uncommitted files are preserved unchanged; only Phase 22 files committed.
