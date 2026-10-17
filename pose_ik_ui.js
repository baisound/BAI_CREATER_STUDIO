(()=>{'use strict';
const root=document.getElementById('bai-pose-editor');if(!root)return;
const $=id=>document.getElementById(id);
const template={schema:1,frame:0,limbs:{leftArm:{base:[-0.2,1.5],target:[-0.8,1.14],upper:.42,lower:.4,bend:1},rightArm:{base:[.2,1.5],target:[.8,1.14],upper:.42,lower:.4,bend:-1},leftLeg:{base:[-.14,1.0],target:[-.20,.13],upper:.5,lower:.48,bend:1},rightLeg:{base:[.14,1.0],target:[.25,.13],upper:.5,lower:.48,bend:-1}}};
let data=structuredClone(template),active='rightArm',result=null,busy=false;
const svg=$('pose-ik-svg');const msg=$('pose-ik-status');
const sx=x=>150+x*110,sy=y=>230-y*105;
function line(x1,y1,x2,y2,color,width=5){return `<line x1="${sx(x1)}" y1="${sy(y1)}" x2="${sx(x2)}" y2="${sy(y2)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`}
function dot(p,name){return `<circle data-limb="${name}" cx="${sx(p[0])}" cy="${sy(p[1])}" r="11" fill="${name===active?'#ffc66b':'#79b6dc'}" stroke="#102033" stroke-width="2" style="cursor:grab"/>`}
function render(){let parts=['<rect width="300" height="260" fill="#101e30"/>','<path d="M0 220 H300" stroke="#597085" stroke-width="2"/>',line(0,1.72,0,1.53,'#b5cbe4',7),line(0,1.5,0,1,'#b5cbe4',11),'<circle cx="150" cy="35" r="17" fill="#9cb7d2"/>'];
for(const [name,p] of Object.entries(result?.limbs||{})){const color=name===active?'#ffc66b':'#84aecb';parts.push(line(...p.base,...p.joint,color,7),line(...p.joint,...p.end,color,7),dot(data.limbs[name].target,name));if(!p.reachable)parts.push(`<circle cx="${sx(p.requested[0])}" cy="${sy(p.requested[1])}" r="15" fill="none" stroke="#ff7373" stroke-dasharray="4 3"/>`)}
svg.innerHTML=parts.join('');$('pose-ik-frame').value=data.frame;$('pose-ik-bone').value=active;
}
async function calculate(){if(busy)return;busy=true;try{const r=await fetch('/api/pose/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error('HTTP '+r.status);result=await r.json();render();const p=result.limbs[active];msg.textContent=p?.reachable?'IK計算済み（元モーション未変更）':'目標が届かないため、到達可能な位置に補正しました';}catch(e){msg.textContent='IK計算失敗：'+e.message}finally{busy=false}}
$('pose-ik-bone').onchange=e=>{active=e.target.value;render()};$('pose-ik-frame').onchange=e=>{data.frame=Math.max(0,Math.round(Number(e.target.value)||0));render()};
let dragging=false;function move(e){const rect=svg.getBoundingClientRect();const x=(e.clientX-rect.left)/rect.width*300;const y=(e.clientY-rect.top)/rect.height*260;data.limbs[active].target=[Math.round((x-150)/110*100)/100,Math.round((230-y)/105*100)/100];calculate()}
svg.addEventListener('pointerdown',e=>{const name=e.target.getAttribute('data-limb');if(!name)return;active=name;dragging=true;svg.setPointerCapture(e.pointerId);move(e)});svg.addEventListener('pointermove',e=>{if(dragging)move(e)});svg.addEventListener('pointerup',()=>dragging=false);svg.addEventListener('pointercancel',()=>dragging=false);
$('pose-ik-reset').onclick=()=>{data=structuredClone(template);calculate()};
$('pose-ik-save').onclick=async()=>{try{const r=await fetch('/api/pose/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error('HTTP '+r.status);msg.textContent='補正設定を保存しました。元素材は変更していません。'}catch(e){msg.textContent='保存失敗：'+e.message}};
window.baiPoseIK={get:()=>structuredClone(data),set:async p=>{data=p;await calculate();return {ok:!!result,result}},solve:async p=>{const r=await fetch('/api/pose/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});return r.json()}};
fetch('/api/pose/last').then(r=>r.json()).then(p=>{if(Object.keys(p.limbs||{}).length)data=p;calculate()}).catch(()=>calculate());
})();