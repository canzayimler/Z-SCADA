import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {newWidget,validateConfig,validateScreen,validateValue,type Sample} from '../packages/contracts/model';
import {Store} from '../apps/server/src/store';
import {Commands} from '../apps/server/src/commands';
function setup(){
 const c=structuredClone(seedConfig),base=c.tags[0];
 c.tags.push({...base,id:'analog',code:'D_TEST',name:'Analog test',area:'holding-register',dataType:'int16',address:400,scale:.1,offset:0,min:-100,max:100,unit:'bar'});
 c.commands.push({id:'analog-command',name:'Analog test',tagIds:['analog'],feedbackTagIds:['analog'],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''});
 const s=structuredClone(seedScreen),w=newWidget('numeric-input');w.commandId='analog-command';w.tagId='analog';s.widgets=[w];
 return {c:validateConfig(c),s:validateScreen(s,c)};
}
test('analog input validates numeric binding, range and representable scaled steps',()=>{
 const {c,s}=setup();assert.doesNotThrow(()=>validateValue(c,['analog'],.3));assert.doesNotThrow(()=>validateValue(c,['analog'],-12.5));
 for(const v of [101,-101,.35,true,NaN,Infinity])assert.throws(()=>validateValue(c,['analog'],v));
 s.widgets[0].commandId=c.commands[0].id;assert.throws(()=>validateScreen(s,c));
});
test('published analog input permits entered values but rejects stale, invalid and unpublished writes',async()=>{
 const {c,s}=setup(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-analog-')),db=new Store(dir);
 const samples:Record<string,Sample>={analog:{value:0,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1}};
 const writes:(number|boolean)[]=[];const service=new Commands(db,samples,()=>c,()=>true,async(_id,v)=>{writes.push(v);});
 const screen={id:s.id,name:s.name,version:1,publishedVersion:1,draft:s,published:s},user={id:'u',username:'operator',role:'operator' as const};
 const request=(value:number)=>({id:randomUUID(),commandId:'analog-command',value,screenId:s.id,screenVersion:1});
 assert.throws(()=>service.request(request(1000),user,screen));samples.analog.quality='stale';assert.throws(()=>service.request(request(12.5),user,screen));samples.analog.quality='good';
 assert.throws(()=>service.request(request(12.5),user,{...screen,published:null}));
 service.request(request(12.5),user,screen);await new Promise(r=>setTimeout(r,5));assert.deepEqual(writes,[12.5]);
 const ack=Date.now()+5;samples.analog={value:12.5,quality:'good',receivedAt:ack,sampledAt:ack,sequence:2};service.tick();assert.equal(service.pending.size,0);db.close();
});
