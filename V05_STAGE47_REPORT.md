# BAI Creator Studio v0.5 — Stage 47

## Scope
Saved focus diagnostic report comparisons: compare two reports over shared frame ranges, classify measured-frame error changes, and jump to changed frames through the existing timeline seek pathway.

## Implemented
- `studio/v05/js/focus-compare-v47.js`: strict validation, common FPS and frame overlap, measured-only comparison, improved/worsened/unchanged/unavailable classification. No interpolation and no unmeasured GPU claims.
- `studio/v05/js/focus-report-history-v44.js`: two-report selection and comparison panel in existing diagnostics history.
- `test_v05_focus_compare_v47.mjs`: comparison and validation tests.

## Validation
- node test_v05_focus_compare_v47.mjs: 7 assertions pass.
- node test_v05_focus_samples_v46.mjs: pass.
- node test_v05_focus_history_v44.mjs: 6 assertions pass.
- node --check for changed modules: pass.

## Outstanding
- Browser E2E and actual GPU focus matching were not verified.
- MCP / WebMCP retain existing report retrieval interfaces; no redundant tool created for client-only comparison. Real communication not verified.
- Comparisons are not persisted as separate reports.
