/* Frame-by-frame bridge to the real model/camera event pipeline. Never fabricate samples.
 * This bridge requires a seek callback that evaluates the loaded scene at a frame.
 */
export function createLiveFocusEvaluator({seekFrame, subscribe, timeoutMs=2500}={}) {
  if(typeof seekFrame!=='function'||typeof subscribe!=='function') throw new TypeError('seekFrame and subscribe are required');
  return async function evaluateFrame({projectId,frame,seconds,signal}={}) {
    if(signal?.aborted)throw new Error('focus_scan_cancelled');
    const expected=v=>v?.frame===frame && Math.abs((v.seconds??NaN)-seconds)<=1e-6 && (projectId==null||v.projectId===projectId);
    let snapshot=null,target=null,finished=false,unsub=()=>{},timer;
    return new Promise((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener?.('abort',abort);unsub();};
      const done=(err)=>{if(finished)return;finished=true;cleanup();err?reject(err):resolve({snapshot,target});};
      const abort=()=>done(new Error('focus_scan_cancelled'));
      const receive=(type,detail)=>{if(finished||!expected(detail))return;if(type==='snapshot')snapshot=detail;if(type==='target')target=detail;if(snapshot&&target)done();};
      unsub=subscribe(receive)||(()=>{});
      signal?.addEventListener?.('abort',abort,{once:true});
      timer=setTimeout(()=>done(new Error('focus_frame_timeout')),timeoutMs);
      if(signal?.aborted){abort();return;}
      Promise.resolve().then(()=>seekFrame({projectId,frame,seconds,signal})).catch(done);
    });
  };
}
export function connectLiveFocusScan({win=window, seekFrame, timeoutMs=2500}={}) {
  if(!win.BAIStudioFocusIntervalV41)throw new Error('focus_interval_runtime_missing');
  const evaluator=createLiveFocusEvaluator({seekFrame,timeoutMs,subscribe:receive=>{
    const camera=e=>receive('snapshot',e.detail),model=e=>receive('target',e.detail);
    win.addEventListener('bai:camera-focus-snapshot',camera);
    win.addEventListener('bai:camera-focus-target-position',model);
    return ()=>{win.removeEventListener('bai:camera-focus-snapshot',camera);win.removeEventListener('bai:camera-focus-target-position',model);};
  }});
  return win.BAIStudioFocusIntervalV41.registerEvaluator(evaluator);
}
/* Registers only when a real persisted seek runtime exists; otherwise an explicit
 * unavailability message is displayed instead of pretending to evaluate frames. */
export function installLiveFocusScanControls(win=window){
  const setup=()=>{
    const runner=win.BAIStudioFocusIntervalV41;
    if(!runner||!win.BAIStudioPersistedSeek)return false;
    const detach=connectLiveFocusScan({win,seekFrame:({seconds})=>win.BAIStudioPersistedSeek.evaluate(seconds,'focus-interval-v42')});
    const panel=win.document.createElement('section');panel.id='v42-focus-scan';
    panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:1000;background:#1e2835;color:#fff;padding:10px;border:1px solid #78889a;border-radius:8px;font:12px sans-serif;max-width:310px';
    panel.innerHTML='<b>ピント区間診断（試験）</b><div style="margin:8px 0"><label>開始フレーム <input id="v42-start" type="number" min="0" value="0" style="width:65px"></label> <label>終了 <input id="v42-end" type="number" min="0" value="60" style="width:65px"></label></div><button id="v42-run">区間診断</button> <button id="v42-cancel">停止</button><div id="v42-status" role="status">実モデルの読み込みが必要です</div>';
    win.document.body.append(panel);
    const status=panel.querySelector('#v42-status');
    panel.querySelector('#v42-run').onclick=async()=>{
      const projectId=win.BAIStudioPersistedSeek.status().projectId;
      if(!projectId){status.textContent='作品が選択されていません';return;}
      const fps=Number(win.BAIStudioProjectSettingsV30?.getFPS?.()||30);
      status.textContent='診断中…';
      try{const result=await runner.run({projectId,startFrame:Number(panel.querySelector('#v42-start').value),endFrame:Number(panel.querySelector('#v42-end').value),fps});status.textContent=`確認 ${result.valid}/${result.count}、要確認 ${result.problemFrames.length}（GPU未検証）`;}
      catch(e){status.textContent='診断失敗: '+String(e?.message||e);}
    };
    const saveButton=win.document.createElement('button');saveButton.textContent='診断結果を保存';saveButton.type='button';panel.append(saveButton);
    saveButton.onclick=async()=>{
      const result=runner.current();if(!result){status.textContent='保存する診断結果がありません';return;}
      try{
        const url='/api/studio/v05/focus-reports';const id=encodeURIComponent(result.projectId);
        const previous=await fetch(url+'?id='+id).then(r=>{if(!r.ok)throw Error('report_read_failed');return r.json();});
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:result.projectId,revision:previous.revision,report:result})});
        if(!response.ok)throw Error('report_save_failed_'+response.status);
        status.textContent='診断結果を保存しました（GPU描画の一致は未検証）';
      }catch(e){status.textContent='保存できません: '+String(e.message||e);}
    };
    panel.querySelector('#v42-cancel').onclick=()=>{runner.cancel();status.textContent='停止しました';};
    win.addEventListener('pagehide',()=>{detach();panel.remove();},{once:true});return true;
  };
  if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
}
if(typeof window!=='undefined')installLiveFocusScanControls(window);
