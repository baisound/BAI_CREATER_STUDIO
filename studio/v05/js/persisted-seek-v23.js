/* Evaluate the REAL persisted arrangement, not v0.4 demo tracks.
 * An engine can be registered only after the actual model/motion loader succeeds.
 */
(function(root){'use strict';
  let current={projectId:null,clips:[],seconds:0};
  function activeAt(clips,seconds){
    if(!Array.isArray(clips)||!Number.isFinite(seconds)||seconds<0)throw new TypeError('Invalid timeline data');
    return clips.filter(c=>c&&c.track==='motion'&&typeof c.id==='string'&&Number.isFinite(c.start)&&Number.isFinite(c.duration)&&c.duration>0&&seconds>=c.start&&seconds<c.start+c.duration)
      .map(c=>({id:c.id,type:'motion',clip:c.name||c.id,offsetSeconds:Math.max(0,seconds-c.start)}));
  }
  function configure(projectId,clips){if(typeof projectId!=='string'||!projectId)throw new TypeError('Missing project ID');
    current={...current,projectId,clips:[...clips]};return evaluate(current.seconds,'configuration');}
  function evaluate(seconds,source='persisted-timeline'){
    if(!Number.isFinite(seconds)||seconds<0)throw new RangeError('Invalid seconds');
    current.seconds=seconds;
    const detail={seconds,source,projectId:current.projectId,tracks:activeAt(current.clips,seconds)};
    if(root.BAIStudioCameraRuntime?.seek) void root.BAIStudioCameraRuntime.seek(seconds,{projectId:current.projectId,source});
    if(root.BAIStudioEngineBridge?.seek) return root.BAIStudioEngineBridge.seek(detail);
    return Promise.resolve();
  }
  root.BAIStudioPersistedSeek=Object.freeze({configure,evaluate,activeAt,status:()=>({projectId:current.projectId,seconds:current.seconds,clips:current.clips.length})});
})(typeof window!=='undefined'?window:globalThis);
