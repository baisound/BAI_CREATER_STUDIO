// Regenerates docs/ui/SCREEN_IMPLEMENTATION_MATRIX.json from studio/js/screens.js.
// Usage: node tools/gen_screen_matrix.mjs
import { writeFileSync } from 'node:fs';
import { SCREENS, PH } from '../studio/js/screens.js';

const API = { real: 'read_only_get', partial: 'existing_code_not_wired_to_new_ui', mock: 'none', unimpl: 'none' };
const rows = SCREENS.flatMap((s) => s.panels.map((p) => ({
  screen_id: `SCR-${s.id}`,
  route: `/workspace/${s.id}`,
  panel: p.name,
  feature_ids: p.ids && p.ids.length ? p.ids : s.ids,
  new_ui_state: p.status,
  source_evidence: p.note || null,
  UI: 'mock_route_operable',
  API: API[p.status],
  WebMCP: 'unknown',
  'stdio-MCP': 'unknown',
  test: 'tests/studio-ui.test.cjs',
  browser_test: 'headless_chromium_navigation_and_controls',
  verdict: p.status === 'real' ? 'read_only_display_only' : 'not_implemented_in_new_ui',
  blockers: p.status === 'unimpl' ? 'no implementation' : p.status === 'partial' ? 'port to new UI via common API (P2, after Phase E per owner decision)' : null,
})));
const doc = {
  schema: 'bai.screen_implementation_matrix.v1',
  generated_from: 'studio/js/screens.js',
  rule: 'mock != implemented. new_ui_state: real=reads existing API read-only, partial=code exists in current UI (/ or /camera.html) but not ported, mock=local sample only, unimpl=none. No row is a feature completion.',
  phases: PH,
  screens: SCREENS.map((s) => ({ id: `SCR-${s.id}`, title: s.title, route: `/workspace/${s.id}`, classification_proposal: s.classification, feature_ids: s.ids, existing_ui: s.existing || [], live_endpoints: s.live || [] })),
  rows,
};
writeFileSync(new URL('../docs/ui/SCREEN_IMPLEMENTATION_MATRIX.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
const count = (st) => rows.filter((r) => r.new_ui_state === st).length;
console.log(`screens=${SCREENS.length} panels=${rows.length} real=${count('real')} partial=${count('partial')} mock=${count('mock')} unimpl=${count('unimpl')}`);
