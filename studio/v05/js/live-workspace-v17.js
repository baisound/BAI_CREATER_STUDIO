/* v0.5 -> legacy real motion viewport bridge. No fabricated 3D results. */
(function (root) {
  'use strict';
  const frame = document.getElementById('baiLiveFrame');
  const time = document.getElementById('baiLiveTime');
  const status = document.getElementById('baiLiveStatus');
  const feedback = document.getElementById('baiLiveFeedback');
  if (!frame || !time || !status || !feedback) return;
  let loaded = false, requestId = 0, pending = null;
  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    frame.src = '/workspace/10';
    status.textContent = '実機能の画面を読み込み中';
  }
  function seek(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 0 || n > 7200) { feedback.textContent = '再生時刻は0〜7200秒で指定してください'; return false; }
    time.value = String(n);
    ensureLoaded();
    if (!frame.contentWindow) { feedback.textContent = '読み込み待ち'; return false; }
    pending = { type: 'bai:v05:seek', seconds: n, requestId: ++requestId };
    if (frame.dataset.loaded === 'true') {
      frame.contentWindow.postMessage(pending, window.location.origin);
      feedback.textContent = '姿勢を更新しています…';
    } else feedback.textContent = '画面読み込み後に時刻を反映します';
    return true;
  }
  frame.addEventListener('load', () => {
    frame.dataset.loaded = 'true'; status.textContent = '実機能の画面を表示中';
    if (pending && frame.contentWindow) frame.contentWindow.postMessage(pending, window.location.origin);
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== 'bai:v05:seek-ack' || !pending || data.requestId !== pending.requestId) return;
    pending = null;
    feedback.textContent = data.modelLoaded ? '読み込み済みモデルの姿勢を更新しました' : '時刻を反映しました。モデルとモーションを選択してください';
  });
  document.getElementById('baiLiveSeek').addEventListener('click', () => seek(time.value));
  document.getElementById('baiLiveBack').addEventListener('click', () => seek(Math.max(0, Number(time.value || 0) - 1 / 30)));
  document.getElementById('baiLiveForward').addEventListener('click', () => seek(Number(time.value || 0) + 1 / 30));
  document.querySelector('[data-page="live-motion"]')?.addEventListener('click', ensureLoaded);
  document.addEventListener('click', event => { if (event.target.closest('[data-go="live-motion"]')) ensureLoaded(); });
  window.addEventListener('bai:timeline-seek', event => {
    if (document.getElementById('bai-live-motion')?.classList.contains('active') && Number.isFinite(event.detail?.seconds)) seek(event.detail.seconds);
  });
  root.BAIStudioLiveWorkspace = Object.freeze({ seek, open: ensureLoaded, status: () => ({loaded: frame.dataset.loaded === 'true', pending: Boolean(pending)}) });
})(window);
