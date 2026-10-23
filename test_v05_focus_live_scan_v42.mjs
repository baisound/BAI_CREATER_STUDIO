import assert from 'node:assert/strict';
import {createLiveFocusEvaluator} from './studio/v05/js/focus-live-scan-v42.js';
let cb=()=>{};let subscriptions=0;
const subscribe=fn=>{cb=fn;subscriptions++;return ()=>{subscriptions--;};};
const evaluator=createLiveFocusEvaluator({subscribe,timeoutMs:50,seekFrame:async({frame,seconds,projectId})=>{
 cb('snapshot',{frame,seconds,projectId,pose:{position:[0,0,0]},lens:{focalLengthMm:50,fStop:2,focusDistance:2}});
 cb('target',{frame,seconds,projectId,worldPosition:[0,0,2]});
}});
const found=await evaluator({projectId:'A',frame:30,seconds:1});assert.equal(found.snapshot.frame,30);assert.equal(found.target.worldPosition[2],2);assert.equal(subscriptions,0);
const wrong=createLiveFocusEvaluator({subscribe,timeoutMs:15,seekFrame:({frame,seconds})=>{cb('snapshot',{frame,seconds,projectId:'B'});cb('target',{frame,seconds,projectId:'B'});}});
await assert.rejects(wrong({projectId:'A',frame:1,seconds:1}),/focus_frame_timeout/);assert.equal(subscriptions,0);
const controller=new AbortController();const cancellation=createLiveFocusEvaluator({subscribe,seekFrame:()=>{},timeoutMs:60});const pending=cancellation({projectId:'A',frame:3,seconds:3,signal:controller.signal});controller.abort();await assert.rejects(pending,/focus_scan_cancelled/);assert.equal(subscriptions,0);
console.log('v42 live scan: 3 tests passed');
