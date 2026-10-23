/* v0.5 batch import: safely reuse the registered library streaming endpoint. */
(()=>{'use strict';
 const host=document.getElementById('assetPanel'); if(!host)return;
 const pane=document.createElement('section'); pane.style.cssText='padding:10px;border:1px solid #506179;margin:8px 0;background:#192839;border-radius:6px';
 pane.innerHTML='<h3>素材をまとめて登録</h3><p>対応形式のみ登録します。3Dモデル（VRM/FBX/PMX）やVMDは現在の一括登録APIでは未対応です。</p><input id="v53files" type="file" multiple aria-label="登録する素材を選択"><button type="button" id="v53import">選択したファイルを登録</button><button type="button" id="v53cancel" disabled>残りを中止</button><div id="v53summary" role="status" aria-live="polite"></div><ol id="v53log" style="max-height:140px;overflow:auto"></ol>';
 host.prepend(pane);
 const $=id=>pane.querySelector('#'+id);let capabilities=null,stop=false,busy=false;
 const ext=name=>name.split('.').pop().toLowerCase();
 const pickKind=(name,kinds)=>{if(kinds.includes('audio'))return 'audio';if(kinds.includes('video'))return 'video';if(kinds.includes('image'))return 'image';if(kinds.includes('stage'))return 'stage';return kinds[0]||null};
 async function load(){const res=await fetch('/api/studio/v05/assets/capabilities');if(!res.ok)throw Error('対応形式の取得失敗');capabilities=await res.json();return capabilities}
 async function upload(file,kind){const url='/api/library-assets/upload?kind='+encodeURIComponent(kind)+'&name='+encodeURIComponent(file.name);
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
  const json=await res.json();if(!res.ok)throw Error(json.error||'HTTP '+res.status);return json;
 }
 $('v53cancel').onclick=()=>{stop=true};
 $('v53import').onclick=async()=>{
  if(busy)return;const files=[...$('v53files').files];if(!files.length){$('v53summary').textContent='ファイルを選んでください';return}
  busy=true;stop=false;$('v53import').disabled=true;$('v53cancel').disabled=false;$('v53log').replaceChildren();let ok=0,failed=0,skipped=0;
  try{
   const cfg=capabilities||await load();for(let i=0;i<files.length;i++){
    if(stop){skipped+=files.length-i;break}const file=files[i],kinds=cfg.upload_formats[ext(file.name)]||[],kind=pickKind(file.name,kinds);const line=document.createElement('li');$('v53log').append(line);
    if(!kind||!file.size||file.size>(kind==='stage'?cfg.max_stage_bytes:cfg.max_upload_bytes)){skipped++;line.textContent=file.name+'：未対応形式またはサイズ制限';continue}
    try{await upload(file,kind);ok++;line.textContent=file.name+'：登録完了（'+kind+'）'}catch(e){failed++;line.textContent=file.name+'：失敗 '+e.message}
    $('v53summary').textContent=(i+1)+' / '+files.length+' 件処理中';
   }
   $('v53summary').textContent='成功 '+ok+'件 / 失敗 '+failed+'件 / スキップ '+skipped+'件。既存の素材検索で再読み込みしてください。';
   document.dispatchEvent(new CustomEvent('bai:assets-imported',{detail:{succeeded:ok,failed,skipped}}));
  }catch(e){$('v53summary').textContent='登録処理を開始できません：'+e.message}
  finally{busy=false;$('v53import').disabled=false;$('v53cancel').disabled=true}
 };
 load().catch(e=>{$('v53summary').textContent=e.message});
})();
