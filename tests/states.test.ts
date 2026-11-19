import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newWidget,widgetSchema,validateScreen} from '../packages/contracts/model';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {resolveState} from '../packages/symbols/states';

const lamp=()=>widgetSchema.parse({...newWidget('indicator'),mode:'analog',rangeMode:'range',parts:[{value:0,upper:20,label:'Low'},{value:20,upper:80,label:'Normal'},{value:80,upper:null,label:'High'}]});
test('analog ranges include lower and exclude upper boundary; gaps and stale values stay unmatched',()=>{
 const w=lamp();for(const [n,index] of [[0,0],[19,0],[20,1],[79,1],[80,2],[1000,2],[-1,-1]])assert.equal(resolveState(w,n,'good').index,index);
 assert.equal(resolveState(w,50,'stale').known,false);assert.equal(resolveState(w,false,'good').known,false);
});
test('digital rules support false, priority and missing signals',()=>{
 const w=widgetSchema.parse({...newWidget('indicator'),parts:[{tagId:'a',expected:false},{tagId:'b',expected:true}]});
 const r={a:{value:false,quality:'good'},b:{value:true,quality:'good'}};
 assert.equal(resolveState(w,null,'unknown',r).index,0);
 assert.equal(resolveState(w,null,'unknown',{...r,a:{value:true,quality:'good'}}).index,1);
 assert.equal(resolveState(w,null,'unknown',{b:r.b}).known,false);
});
test('legacy thresholds remain highest eligible threshold',()=>{
 const w=lamp();w.rangeMode='threshold';assert.equal(resolveState(w,20,'good').index,1);
});
test('toggle requires a boolean feedback tag from its command and ranges reject inverted bounds',()=>{
 const s=structuredClone(seedScreen),w=newWidget('button');w.action='toggle';w.commandId=seedConfig.commands[0].id;w.tagId=seedConfig.commands[0].feedbackTagIds[0];s.widgets=[w];assert.doesNotThrow(()=>validateScreen(s,seedConfig));
 w.tagId='';assert.throws(()=>validateScreen(s,seedConfig));
 const l=lamp();l.parts[0].upper=-1;s.widgets=[l];assert.throws(()=>validateScreen(s,seedConfig));
});
