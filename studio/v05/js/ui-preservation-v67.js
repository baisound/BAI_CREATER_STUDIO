// Keep the original v0.5 navigation and editing surfaces visible while their engines are connected.
(() => {
  const nav = document.querySelector('#nav');
  const edit = nav?.querySelector('[data-workspace="edit"]');
  if (nav && edit && !nav.querySelector('[data-workspace="assets"]')) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.dataset.workspace = 'assets';
    tab.textContent = '簡易素材';
    tab.title = 'タイムライン編集の素材パネルを開きます';
    tab.addEventListener('click', () => {
      edit.click();
      document.querySelector('[data-panel="assets"]')?.click();
      nav.querySelectorAll('.tab').forEach(item => item.classList.toggle('on', item === tab));
    });
    edit.before(tab);
  }

  const audio = document.querySelector('#bai-audio');
  if (audio) {
    const toolbar = audio.querySelector('.baiToolbar');
    if (toolbar && !audio.querySelector('#baiAudioRecord')) {
      toolbar.insertAdjacentHTML('beforeend', '<button id="baiAudioRecord" type="button" disabled title="録音エンジン未接続">● 録音（未接続）</button><label title="音声トラックのスナップ編集は未接続"><input id="baiAudioSnap" type="checkbox" checked disabled> スナップ（未接続）</label>');
    }
    const sources = audio.querySelector('.baiAudio > .baiCard:first-child');
    if (sources && !audio.querySelector('#baiLegacyAudioSources')) {
      sources.insertAdjacentHTML('beforeend', '<div id="baiLegacyAudioSources" class="baiLegacySources"><h3>元の素材メニュー</h3><button type="button" class="baiCat" data-go="library">楽曲・音声 ↗</button><button type="button" class="baiCat" data-go="library">効果音 ↗</button><button type="button" class="baiCat" disabled>録音素材 ↗（未接続）</button><button type="button" class="baiCat" disabled>VSTプリセット ↗（未接続）</button><p class="baiTiny">楽曲・音声と効果音は素材管理を開きます。種類別の絞り込みは未接続です。</p></div>');
    }
    const detail = audio.querySelector('.baiAudio > .baiCard:last-child');
    if (detail && !audio.querySelector('#baiLegacyTrackDetail')) {
      detail.insertAdjacentHTML('beforeend', '<div id="baiLegacyTrackDetail" class="baiLegacyControls"><h3>トラック詳細（未接続）</h3><label for="baiLegacyTrack">選択中のトラック</label><select id="baiLegacyTrack" class="baiInput" disabled><option>楽曲</option><option>ボーカル</option><option>効果音</option></select><label for="baiEq">音質調整（EQ）</label><input id="baiEq" type="range" min="-12" max="12" value="0" disabled><p>VSTプラグイン</p><button id="baiVst" type="button" disabled>＋ VSTを追加（未接続）</button><label for="baiLegacyBus">バス送信</label><select id="baiLegacyBus" class="baiInput" disabled><option>マスターへ</option><option>残響バスへ</option></select></div>');
    }
    if (!audio.querySelector('#baiMixer')) {
      const mixer = document.createElement('div');
      mixer.className = 'baiCard baiLegacyMixer';
      mixer.innerHTML = '<h2>ミキサー（未接続）</h2><p class="baiTiny">音量・ミュート・ソロの操作と実メーターは音声エンジンへ未接続です。</p><div class="baiMixer" id="baiMixer"></div>';
      for (const name of ['楽曲', 'ボーカル', '効果音', 'マスター']) {
        const channel = document.createElement('div');
        channel.className = 'baiChannel';
        const title = document.createElement('strong');
        title.textContent = name;
        channel.append(title);
        channel.insertAdjacentHTML('beforeend', '<div class="baiLegacyChannel"><label>音量 <input type="range" min="0" max="100" value="80" disabled></label><div><button type="button" disabled>ミュート</button><button type="button" disabled>ソロ</button></div><small>未接続</small></div>');
        mixer.querySelector('#baiMixer').append(channel);
      }
      audio.append(mixer);
    }
  }

  const output = document.querySelector('#bai-output');
  const range = output?.querySelector('#v66OutputRange');
  if (range && !output.querySelector('#baiLegacyOutputRange')) {
    range.insertAdjacentHTML('afterend', '<label for="baiLegacyOutputRange">元の範囲メニュー（未接続）</label><select id="baiLegacyOutputRange" class="baiInput" disabled><option>作品全体</option><option>現在のシーン</option><option>選択した区間</option></select><p class="baiTiny">実際に保存する範囲はタイムラインのイン点・アウト点で指定します。</p>');
  }
})();
