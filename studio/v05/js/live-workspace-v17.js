/* v0.5 controls the existing music/dance viewport and reads its actual 30fps clock. */
(function (root) {
  'use strict';
  const frame = document.getElementById('baiLiveFrame');
  const frameInput = document.getElementById('baiLiveFrameNumber');
  const seconds = document.getElementById('baiLiveSeconds');
  const status = document.getElementById('baiLiveStatus');
  const feedback = document.getElementById('baiLiveFeedback');
  if (!frame || !frameInput || !seconds || !status || !feedback) return;
  const page=document.getElementById('bai-live-motion'),title=page.querySelector('.baiTitle');
  title.querySelector('h1').textContent='モデル・ダンスプレビュー';
  const help=document.createElement('details'),summary=document.createElement('summary');summary.textContent='操作について';help.append(summary,title.querySelector('.baiSub'));title.append(help);
  const transport=frame.previousElementSibling;transport.classList.add('v05LiveTransport');transport.style.marginBottom='6px';
  feedback.classList.add('v05LiveFeedback');frame.after(feedback);
  page.querySelector('label[for=baiLiveFrameNumber]').textContent='位置（F）';
  let loaded = false, requestId = 0, pending = null;
  let state = { frame: 0, totalFrames: 0, fps: 30, playing: false, modelLoaded: false, motionLoaded: false, audioLoaded: false };

  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    frame.src = '/workspace/10?v05embed=1';
    status.textContent = '実機能の画面を読み込み中';
  }
  function send(action, fields = {}) {
    ensureLoaded();
    pending = { type: 'bai:v05:transport', action, ...fields, requestId: ++requestId };
    if (frame.dataset.loaded === 'true' && frame.contentWindow) {
      frame.contentWindow.postMessage(pending, window.location.origin);
      feedback.textContent = '実プレビューの応答を待っています…';
    } else feedback.textContent = '画面読み込み後に操作を反映します';
    return true;
  }
  function seek(toFrame) {
    const n = Number(toFrame);
    if (!Number.isInteger(n) || n < 0 || n > 216000) {
      feedback.textContent = 'フレームは0〜216000の整数で指定してください';
      return false;
    }
    return send('seek', { frame: n });
  }
  function applyState(data) {
    if (!Number.isFinite(data.frame) || !Number.isFinite(data.fps) || data.fps <= 0) return;
    if(data.playing&&!page.classList.contains('active')){send('pause');return;}
    const started=Boolean(data.playing)&&!state.playing;
    state = { frame: Math.round(data.frame), totalFrames: Math.round(data.totalFrames || 0),
      fps: data.fps, playing: Boolean(data.playing), modelLoaded: Boolean(data.modelLoaded),
      motionLoaded: Boolean(data.motionLoaded), audioLoaded: Boolean(data.audioLoaded) };
    frameInput.value = String(state.frame);
    seconds.textContent = `${(state.frame / state.fps).toFixed(2)} 秒 / 最終 ${state.totalFrames} F`;
    status.textContent = state.playing ? '実プレビューを再生中' : '実プレビューを表示中';
    document.getElementById('baiLivePlay').disabled = state.playing;
    document.getElementById('baiLivePause').disabled = !state.playing;
    if(started)window.dispatchEvent(new CustomEvent('bai:v05-audio-focus',{detail:{owner:'legacy-preview'}}));
  }
  frame.addEventListener('load', () => {
    frame.dataset.loaded = 'true';
    status.textContent = '実機能の画面を表示中';
    if (frame.contentWindow) frame.contentWindow.postMessage(pending || {
      type: 'bai:v05:transport', action: 'state', requestId: ++requestId,
    }, window.location.origin);
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || !['bai:v05:transport-state', 'bai:v05:transport-ack'].includes(data.type)) return;
    applyState(data);
    if (data.type !== 'bai:v05:transport-ack' || !pending || data.requestId !== pending.requestId) return;
    const action = pending.action;
    pending = null;
    if (action === 'play' && !data.playing) feedback.textContent = '再生できる音声またはモーションを選択してください';
    else if (!data.modelLoaded && !data.audioLoaded) feedback.textContent = '位置を反映しました。モデル・モーションまたは音声を選択してください';
    else feedback.textContent = '実プレビューの位置と再生状態を反映しました';
  });
  document.getElementById('baiLiveSeek').addEventListener('click', () => seek(frameInput.value));
  document.getElementById('baiLiveBack').addEventListener('click', () => send('step', { frames: -1 }));
  document.getElementById('baiLiveForward').addEventListener('click', () => send('step', { frames: 1 }));
  document.getElementById('baiLiveRewind').addEventListener('click', () => send('step', { frames: -30 }));
  document.getElementById('baiLiveFastForward').addEventListener('click', () => send('step', { frames: 30 }));
  document.getElementById('baiLivePlay').addEventListener('click', () => send('play'));
  document.getElementById('baiLivePause').addEventListener('click', () => send('pause'));
  document.getElementById('baiLiveStop').addEventListener('click', () => send('stop'));
  document.addEventListener('click', event => {
    if (event.target.closest('[data-page="live-motion"],[data-go="live-motion"]')) ensureLoaded();
  }, true);
  window.addEventListener('bai:timeline-seek', event => {
    if (document.getElementById('bai-live-motion')?.classList.contains('active') && Number.isFinite(event.detail?.seconds)) {
      seek(Math.round(event.detail.seconds * state.fps));
    }
  });
  window.addEventListener('bai:v05-workspace-changed',event=>{if(loaded&&event.detail?.workspace!=='live-motion')send('pause');});
  window.addEventListener('bai:v05-audio-focus',event=>{if(loaded&&event.detail?.owner!=='legacy-preview'&&state.playing)send('pause');});
  root.BAIStudioLiveWorkspace = Object.freeze({ seek, open: ensureLoaded,
    status: () => ({ loaded: frame.dataset.loaded === 'true', pending: Boolean(pending), ...state }) });
})(window);
