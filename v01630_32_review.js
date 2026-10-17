// v0.16.30-32 lightweight non-destructive review UI. JSON QA report only.
const host=document.getElementById('skeleton-lab');
if(host){
 const section=document.createElement('details');
 section.style.cssText='padding:12px;margin:12px 0;border:1px solid #607c9b;border-radius:8px';
 const summary=document.createElement('summary');summary.textContent='v0.16.30〜32 転写タイムライン・QA・JSON保存（試験）';section.append(summary);
 const text=document.createElement('p');text.textContent='選択したGLB/VRMのキーフレームを一覧化し、回転速度や欠落を診断します。出力は検証用JSONで、動画・VMDではありません。';section.append(text);
 const confirm=document.createElement('input');confirm.type='checkbox';
 const label=document.createElement('label');label.append(confirm,document.createTextNode(' 共通座標系であることを確認（VRM正規化・ひねりは未校正）'));
 const button=document.createElement('button');button.type='button';button.textContent='解析・品質診断';
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='検証JSONを保存';exportButton.disabled=true;
 const result=document.createElement('pre');result.style.cssText='max-height:260px;overflow:auto;white-space:pre-wrap';result.setAttribute('role','status');
 const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center';row.append(button,exportButton);
 section.append(label,row,result);host.append(section);let report=null;
 button.onclick=async()=>{try{
  if(!confirm.checked)throw Error('座標系の確認が必要です');
  const source=document.getElementById('sk-source')?.value,target=document.getElementById('sk-target')?.value;
  if(!source||!target)throw Error('元モデル・転写先モデルを選択してください');
  button.disabled=true;result.textContent='解析中…';exportButton.disabled=true;report=null;
  const response=await fetch('/api/retarget/review-bundle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,target,fps:30,coordinate_convention_confirmed:true})});
  const data=await response.json();if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
  report=data;exportButton.disabled=false;
  result.textContent=`品質: ${data.quality.quality_gate}\n対象フレーム: ${data.timeline.length}\n対象ボーン: ${data.roles.length}\n回転キー候補: ${data.samples.length}\n診断警告: ${data.warnings.length}\nVMD出力: 禁止（未校正）\n\n`+JSON.stringify(data.warnings.slice(0,15),null,2);
 }catch(e){result.textContent='解析失敗: '+e.message}finally{button.disabled=false}};
 exportButton.onclick=()=>{if(!report)return;const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='BAI_retarget_review_unverified.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)};
}
