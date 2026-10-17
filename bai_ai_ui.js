(()=>{'use strict';const $=id=>document.getElementById(id);const show=(id,text)=>{$(id).textContent=text};
async function json(url,body){const response=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await response.json();if(!response.ok)throw Error(data.error||'HTTP '+response.status);return data}
async function update(){try{const [config,status]=await Promise.all([json('/api/ai/settings'),json('/api/ai/status')]);$('bai-ai-enabled').checked=config.enabled;$('bai-ai-model').value=config.default_llm;show('bai-ai-status',status.available?'接続済み — '+status.models.map(x=>x.name).join(' / '):'AI未接続：通常制作は使用できます');}catch(e){show('bai-ai-status','AI設定の取得に失敗しました。通常制作には影響しません。')}}
$('bai-ai-check').addEventListener('click',update);
$('bai-ai-save').addEventListener('click',async()=>{try{await json('/api/ai/settings',{enabled:$('bai-ai-enabled').checked,default_llm:$('bai-ai-model').value.trim()});show('bai-ai-result','設定を保存しました');await update()}catch(e){show('bai-ai-result','保存失敗: '+e.message)}});
$('bai-ai-run').addEventListener('click',async()=>{show('bai-ai-result','Qwenで指示を解析しています…');try{const r=await json('/api/ai/pose-proposal',{text:$('bai-ai-instruction').value});show('bai-ai-result',JSON.stringify(r,null,2))}catch(e){show('bai-ai-result','推論できませんでした: '+e.message+' — 通常制作は継続できます')}});

let lastPreview=null;
$('bai-ai-preview-apply').addEventListener('click',async()=>{
 if(!lastPreview || !window.baiPoseIK){show('bai-ai-result','IK画面が利用できません');return}
 try{await window.baiPoseIK.set(lastPreview.pose_input);show('bai-ai-result','IK補助画面へ未保存の提案を表示しました。保存する場合は手動IK側で「設定を保存」を押してください。')}
 catch(e){show('bai-ai-result','画面表示に失敗: '+e.message)}
});
$('bai-ai-preview').addEventListener('click',async()=>{
 show('bai-ai-result','AIからIKプレビューを生成しています…');
 try{
  let baseline;
  try {baseline=window.baiPoseIK?.get() || await json('/api/pose/last')}catch(_){throw Error('手動IKポーズ設定を取得できません')}
  if(!baseline || !baseline.limbs)throw Error('保存済みIK設定が見つかりません');
  const r=await json('/api/ai/ik-preview',{text:$('bai-ai-instruction').value,baseline});
  lastPreview=r;$('bai-ai-preview-apply').disabled=!r.accepted.length;show('bai-ai-result',JSON.stringify(r,null,2));
 }catch(e){lastPreview=null;$('bai-ai-preview-apply').disabled=true;show('bai-ai-result','プレビュー失敗: '+e.message+' — 手動編集は継続できます')}
});
window.baiAiManager={status:()=>json('/api/ai/status'),settings:()=>json('/api/ai/settings'),pose:text=>json('/api/ai/pose-proposal',{text})};
update();})();
