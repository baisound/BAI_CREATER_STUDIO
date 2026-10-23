/* One resizable editor grid shared by the asset, timeline, motion and camera views. */
(() => {
  'use strict';
  const main = document.querySelector('.main');
  const controls = main?.querySelector('.timeline .tlHead > div:last-child');
  if (!main || !controls) return;

  const storageKey = 'bai.v05.paneLayout.v1';
  const desktop = () => window.innerWidth > 730;
  const defaultLeft = () => window.innerWidth <= 1000 ? 195 : 256;
  const defaultBottom = 275;
  const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
  let saved = null;
  try {
    const candidate = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (candidate?.version === 1 && Number.isFinite(candidate.left) && Number.isFinite(candidate.bottom)) saved = candidate;
  } catch (_) { /* A damaged preference never blocks the editor. */ }
  let customized = Boolean(saved);
  let left = saved?.left ?? defaultLeft();
  let bottom = saved?.bottom ?? defaultBottom;

  const handle = (id, label, orientation) => {
    const element = document.createElement('button');
    element.id = id;
    element.type = 'button';
    element.className = 'baiPaneHandle';
    element.setAttribute('role', 'separator');
    element.setAttribute('aria-label', label);
    element.setAttribute('aria-orientation', orientation);
    element.title = `${label}。ドラッグまたは矢印キーで変更`;
    main.append(element);
    return element;
  };
  const leftHandle = handle('baiLeftPaneHandle', '左パネルの幅', 'vertical');
  const bottomHandle = handle('baiBottomPaneHandle', 'タイムラインの高さ', 'horizontal');
  const reset = document.createElement('button');
  reset.id = 'baiPaneReset';
  reset.type = 'button';
  reset.className = 'small';
  reset.textContent = 'パネル配置を戻す';
  reset.title = '左パネルの幅とタイムラインの高さを初期値に戻す';
  controls.append(reset);
  main.classList.add('baiResizable');

  function bounds() {
    const rect = main.getBoundingClientRect();
    const right = window.innerWidth <= 1000 ? 245 : 300;
    return {
      leftMin: 150,
      leftMax: Math.max(150, rect.width - right - 300),
      bottomMin: 160,
      bottomMax: Math.max(160, rect.height - 300),
    };
  }
  function apply() {
    if (!customized) left = defaultLeft();
    const limit = bounds();
    left = clamp(left, limit.leftMin, limit.leftMax);
    bottom = clamp(bottom, limit.bottomMin, limit.bottomMax);
    main.style.setProperty('--bai-pane-left', `${left}px`);
    main.style.setProperty('--bai-pane-bottom', `${bottom}px`);
    for (const [element, value, min, max] of [
      [leftHandle, left, limit.leftMin, limit.leftMax],
      [bottomHandle, bottom, limit.bottomMin, limit.bottomMax],
    ]) {
      element.setAttribute('aria-valuemin', String(min));
      element.setAttribute('aria-valuemax', String(max));
      element.setAttribute('aria-valuenow', String(value));
    }
  }
  function persist() {
    customized = true;
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, left, bottom })); }
    catch (_) { /* Resizing still works when browser storage is unavailable. */ }
  }
  function restoreDefaults() {
    customized = false;
    left = defaultLeft();
    bottom = defaultBottom;
    try { localStorage.removeItem(storageKey); } catch (_) {}
    apply();
  }
  reset.addEventListener('click', restoreDefaults);

  function attachDrag(element, axis) {
    element.addEventListener('pointerdown', (event) => {
      if (!desktop() || event.button !== 0) return;
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      document.body.style.userSelect = 'none';
      const move = (next) => {
        const rect = main.getBoundingClientRect();
        if (axis === 'left') left = next.clientX - rect.left;
        else bottom = rect.bottom - next.clientY;
        customized = true;
        apply();
      };
      const finish = () => {
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', finish);
        element.removeEventListener('pointercancel', finish);
        document.body.style.userSelect = '';
        persist();
      };
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', finish);
      element.addEventListener('pointercancel', finish);
    });
    element.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 32 : 16;
      if (event.key === 'Home') { event.preventDefault(); restoreDefaults(); return; }
      if (axis === 'left' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) left += event.key === 'ArrowRight' ? step : -step;
      else if (axis === 'bottom' && ['ArrowUp', 'ArrowDown'].includes(event.key)) bottom += event.key === 'ArrowUp' ? step : -step;
      else return;
      event.preventDefault();
      customized = true;
      apply();
      persist();
    });
  }
  attachDrag(leftHandle, 'left');
  attachDrag(bottomHandle, 'bottom');
  window.addEventListener('resize', apply);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(main);
  apply();
})();
