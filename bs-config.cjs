'use strict';
// Development-only reverse proxy: all existing /api/* routes still reach Python.
module.exports = {
  proxy: 'http://127.0.0.1:8765',
  host: '127.0.0.1',
  port: 3000,
  ui: false,
  open: false,
  notify: false,
  ghostMode: false,
  online: false,
  watch: true,
  files: [
    '*.html', '*.css', '*.js',
    'docs/ui/**/*.css', 'docs/ui/**/*.js',
    // New 25-screen UI shell (served by Python at /workspace/NN and /studio/*)
    'studio/**/*.html', 'studio/**/*.css', 'studio/**/*.js'
  ],
  // BrowserSync injects CSS without a full reload, and reloads for HTML/JS.
  // Exclude data/files and exports: large media and auto-written state are not sources.
  reloadDebounce: 300,
  reloadDelay: 150,
  socket: { domain: '127.0.0.1:3000' },
  logPrefix: 'BAI Live'
};
