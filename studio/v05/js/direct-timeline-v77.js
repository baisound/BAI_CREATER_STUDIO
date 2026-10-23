/* Put the persisted editor on the main timeline surface; retain the original mock in a disclosure. */
(() => {
  'use strict';
  const timeline = document.querySelector('.timeline');
  const saved = document.getElementById('v07timeline');
  const range = document.getElementById('v66RangeTools');
  const legacyHead = timeline?.querySelector('.tlHead');
  const legacyBody = timeline?.querySelector('#tlBody');
  if (!timeline || !saved || !range || !legacyHead || !legacyBody) return;
  const picker = document.getElementById('v06AssetPicker');
  const assetPanel = document.getElementById('assetPanel');
  if (picker && assetPanel) {
    const sampleSearch = assetPanel.querySelector('#assetSearch');
    const sampleGrid = assetPanel.querySelector('#assetGrid');
    const sampleHint = sampleSearch?.nextElementSibling;
    const old = [sampleSearch, sampleHint, sampleGrid].filter(Boolean);
    const samples = document.createElement('details');
    samples.id = 'v77LegacyAssets';
    const summary = document.createElement('summary');
    summary.textContent = '旧サンプル素材の試作表示';
    samples.append(summary, ...old);
    assetPanel.prepend(picker);
    assetPanel.append(samples);
  }
  const shell = document.createElement('div');
  shell.id = 'v77TimelineShell';
  shell.setAttribute('aria-label', '作品に保存されるマスタータイムライン');
  const title = document.createElement('h3');
  title.textContent = '☷ マスタータイムライン（保存済み作品）';
  shell.append(title, range, saved);
  timeline.prepend(shell);
  const legacy = document.createElement('details');
  legacy.id = 'v77LegacyTimeline';
  const summary = document.createElement('summary');
  summary.textContent = '旧タイムライン試作の操作と表示';
  legacy.append(summary, legacyHead, legacyBody);
  timeline.append(legacy);
})();
