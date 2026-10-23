import {compareFocusReports,createFocusComparison} from './focus-compare-v47.js';
import {createFocusPlot} from './focus-visualization-v45.js';
/* Saved focus report history: real API data only, no fabricated GPU results. */
export function normalizeFocusHistory(payload) {
  if (!payload || !Array.isArray(payload.reports)) throw new TypeError('invalid_focus_history');
  return [...payload.reports].reverse().map(report=>({
    id:String(report.id), startFrame:report.startFrame,endFrame:report.endFrame,
    fps:Number(report.fps),maximumError:Number(report.maximumError),
    problems:Array.isArray(report.problemFrames)?report.problemFrames:[],
    samples:Array.isArray(report.samples)?report.samples:null, gpuVerified:report.evaluatedAgainstGPU===true
  }));
}
export function jumpToFocusFrame({frame,fps,seek}) {
  if (!Number.isInteger(frame)||frame<0||!Number.isFinite(fps)||fps<=0||typeof seek!=='function')
    throw new TypeError('invalid_focus_jump');
  return seek(frame/fps);
}
export function installFocusHistory(win=window){
  const setup=()=>{
    const panel=win.document.getElementById('v42-focus-scan');
    if(!panel)return false;
    const container=win.document.createElement('section');container.id='v44-focus-history';
    container.style.cssText='margin-top:10px;border-top:1px solid #65758b;padding-top:8px;max-height:220px;overflow:auto';
    const title=win.document.createElement('strong');title.textContent='診断履歴';container.append(title);
    const refresh=win.document.createElement('button');refresh.type='button';refresh.textContent='履歴更新';refresh.style.marginLeft='8px';container.append(refresh);
    const list=win.document.createElement('div');list.setAttribute('aria-live','polite');container.append(list);const comparison=win.document.createElement('div');container.append(comparison);panel.append(container);
    const project=()=>win.BAIStudioPersistedSeek?.status?.().projectId;
    const load=async()=>{
      const id=project();list.replaceChildren();if(!id){list.textContent='作品を選択してください';return;}
      const requested=id;
      try{
        const response=await win.fetch('/api/studio/v05/focus-reports?id='+encodeURIComponent(id));
        if(!response.ok)throw new Error('HTTP '+response.status);
        const reports=normalizeFocusHistory(await response.json());
        if(project()!==requested)return;
        if(!reports.length){list.textContent='保存された診断はありません';return;}
        const choices=win.document.createElement('div');choices.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin:8px 0';
        const first=win.document.createElement('select'),second=win.document.createElement('select');
        for(const r of reports){for(const sel of [first,second]){const opt=win.document.createElement('option');opt.value=r.id;opt.textContent=r.id+' ('+r.startFrame+'–'+r.endFrame+'f)';sel.append(opt);}}
        if(reports.length>1)second.selectedIndex=1;
        const compareButton=win.document.createElement('button');compareButton.type='button';compareButton.textContent='選択した2件を比較';
        compareButton.addEventListener('click',()=>{comparison.replaceChildren();if(project()!==requested){comparison.textContent='作品が切り替わりました';return;}
          try{if(first.value===second.value)throw new Error('異なる2件を選んでください');const result=compareFocusReports(reports.find(r=>r.id===first.value),reports.find(r=>r.id===second.value));
            comparison.append(createFocusComparison(win.document,result,{onJump:f=>jumpToFocusFrame({frame:f,fps:result.fps,seek:seconds=>win.BAIStudioPersistedSeek.evaluate(seconds,'focus-compare-v47')})}));}
          catch(err){comparison.textContent='比較できません: '+String(err.message||err);}});
        choices.append(first,second,compareButton);list.append(choices);
        for(const report of reports){
          const details=win.document.createElement('details');
          const summary=win.document.createElement('summary');
          summary.textContent=`${report.id} | ${report.startFrame}–${report.endFrame}f | 要確認 ${report.problems.length} | 最大誤差 ${report.maximumError}`;
          details.append(summary);
          const note=win.document.createElement('div');note.textContent=report.gpuVerified?'GPU検証済み':'GPU描画との一致は未検証';details.append(note);
          for(const problem of report.problems){
            const button=win.document.createElement('button');button.type='button';
            button.textContent=`${problem.frame}f：${problem.reason}（${problem.error??'誤差不明'}）`;
            button.style.cssText='display:block;text-align:left;margin:3px 0;max-width:100%';
            button.addEventListener('click',async()=>{
              if(project()!==requested){list.textContent='作品が切り替わりました。履歴を更新してください';return;}
              try{
                await jumpToFocusFrame({frame:problem.frame,fps:report.fps,seek:seconds=>win.BAIStudioPersistedSeek.evaluate(seconds,'focus-history-v44')});
                const status=panel.querySelector('#v42-status');if(status)status.textContent=`診断フレーム ${problem.frame} に移動しました`;
              }catch(err){list.textContent='フレーム移動失敗: '+String(err.message||err);}
            });details.append(button);
          }
          const jump=async frame=>{
            if(project()!==requested){list.textContent='作品が切り替わりました。履歴を更新してください';return;}
            try{await jumpToFocusFrame({frame,fps:report.fps,seek:seconds=>win.BAIStudioPersistedSeek.evaluate(seconds,'focus-plot-v45')});}
            catch(err){list.textContent='フレーム移動失敗: '+String(err.message||err);}
          };
          details.append(createFocusPlot(win.document,report,{onJump:jump,onRange:(a,b)=>{
            const start=panel.querySelector('#v42-start'),end=panel.querySelector('#v42-end');
            if(start)start.value=String(a);if(end)end.value=String(b);
            const status=panel.querySelector('#v42-status');if(status)status.textContent=`選択区間 ${a}–${b}f（区間診断ボタンで実行）`;
          }}));
          const rerun=win.document.createElement('button');rerun.type='button';rerun.textContent='この区間を再診断';
          rerun.addEventListener('click',async()=>{
            if(project()!==requested)return;
            const scanner=win.BAIStudioFocusIntervalV41;
            if(!scanner?.run){list.textContent='区間診断エンジンが接続されていません';return;}
            rerun.disabled=true;
            try{await scanner.run({projectId:requested,startFrame:report.startFrame,endFrame:report.endFrame,fps:report.fps});
              const status=panel.querySelector('#v42-status');if(status)status.textContent='再診断が完了しました。保存は別途実行してください';}
            catch(err){const status=panel.querySelector('#v42-status');if(status)status.textContent='再診断失敗: '+String(err.message||err);}
            finally{rerun.disabled=false;}
          });details.append(rerun);
          list.append(details);
        }
      }catch(err){list.textContent='診断履歴を取得できません: '+String(err.message||err);}
    };
    refresh.addEventListener('click',load);
    panel.querySelector('#v42-run')?.addEventListener('click',()=>{ /* Saved reports are refreshed explicitly after save. */ });
    load();return true;
  };
  if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
}
if(typeof window!=='undefined')installFocusHistory(window);
