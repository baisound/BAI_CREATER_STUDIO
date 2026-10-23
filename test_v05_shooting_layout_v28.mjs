import assert from 'node:assert/strict';
import {createShootingLayout} from './studio/v05/js/shooting-layout-v28.js';
function element(){const attrs=new Map(),listeners={};return {dataset:{},attrs,children:[],getAttribute(k){return attrs.get(k)??null},setAttribute(k,v){attrs.set(k,v)},removeAttribute(k){attrs.delete(k)},addEventListener(k,cb){listeners[k]=cb},click(){listeners.click()},appendChild(v){this.children.push(v)},remove(){this.removed=true}};}
const viewport=element(),shooting=element(),controls=element();shooting.setAttribute('style','width:40%');let events=0;
const win={document:{createElement:element},Event:class{constructor(n){this.type=n}},dispatchEvent(){events++}};
const layout=createShootingLayout({viewport,shooting,controls,win});assert.equal(layout.getMode(),'inset');assert.equal(controls.children.length,3);
controls.children[1].click();assert.equal(viewport.dataset.shootingLayout,'split');assert.equal(controls.children[1].getAttribute('aria-pressed'),'true');
layout.setMode('full');assert.equal(layout.getMode(),'full');assert.throws(()=>layout.setMode('bad'),RangeError);assert.equal(events,3);
layout.dispose();assert.equal(shooting.getAttribute('style'),'width:40%');assert.equal(viewport.dataset.shootingLayout,undefined);assert.ok(controls.children.every(x=>x.removed));
assert.throws(()=>layout.setMode('inset'));
console.log('v28 camera layout PASS');
