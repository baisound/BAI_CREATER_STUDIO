// The full workspace remains available; only its embedded chrome is compact.
(() => {
  if (window.parent === window || new URLSearchParams(location.search).get('v05embed') !== '1') return;
  const app=document.getElementById('app'),main=document.getElementById('main');
  if(!app||!main)return;
  document.documentElement.dataset.v05Embed='true';
  const nav=document.createElement('div');nav.className='v05-embed-bar';
  const menu=document.createElement('details');menu.className='v05-embed-menu';
  const summary=document.createElement('summary');summary.textContent='画面・表示設定';menu.append(summary);
  const content=document.createElement('div');content.className='v05-embed-menu-content';
  const tools=document.createElement('div');tools.className='v05-embed-screen-tools';
  const help=document.createElement('div');help.className='v05-embed-help';
  const options=document.createElement('label'),panels=document.createElement('input');panels.type='checkbox';options.append(panels,document.createTextNode('補助パネルを表示'));
  panels.onchange=()=>document.documentElement.classList.toggle('v05-embed-panels',panels.checked);
  const originalTop=app.querySelector('.topbar'),originalSide=app.querySelector('.sidebar');
  content.append(options,tools,help);if(originalTop)content.append(originalTop);if(originalSide)content.append(originalSide);menu.append(content);
  const link=document.createElement('a');link.href=location.pathname;link.target='_blank';link.rel='noopener';link.textContent='別画面で開く';
  nav.append(menu,link);app.prepend(nav);
  const organize=()=>{
    const head=main.querySelector('.screen-head'),screenTools=head?.querySelector('.tools'),modes=head?.querySelector('.mode-switch');
    if(screenTools||modes){const controls=[];if(modes)controls.push(modes);if(screenTools)controls.push(screenTools);tools.replaceChildren(...controls);}
    const intro=main.querySelector('.music-dance-intro');if(intro)help.replaceChildren(intro);
    link.href=location.pathname;
  };
  organize();const observer=new MutationObserver(organize);observer.observe(main,{childList:true,subtree:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){menu.open=false;summary.focus();}});
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
})();
