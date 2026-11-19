import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../apps/server/src/store';
import {Commands} from '../apps/server/src/commands';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {unmetPermissives,validateConfig,validateScreen,validateValue,type Sample,type User} from '../packages/contracts/model';
import {blocks,buildGateway} from '../apps/server/src/gateway';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-test-'));
test('toggle accepts inverse feedback, rejects same state and blocks repeated pending commands',async()=>{
 const db=new Store(directory()),c=db.config(),samples:Record<string,Sample>={};
 c.tags.forEach(t=>samples[t.id]={value:false,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1});
 const screen=db.screens()[0],w=screen.published!.widgets.find(w=>w.type==='button')!;
 screen.published!.widgets=[w];w.action='toggle';w.tagId=c.commands.find(d=>d.id===w.commandId)!.feedbackTagIds[0];
 const writes:(boolean|number)[]=[];const service=new Commands(db,samples,()=>c,()=>true,async(_id,value)=>{writes.push(value);});
 const user:User={id:'u',username:'operator',role:'operator'};
 const request=(value:boolean)=>({id:randomUUID(),commandId:w.commandId,value,screenId:screen.id,screenVersion:screen.publishedVersion});
 assert.throws(()=>service.request(request(false),user,screen));
 service.request(request(true),user,screen);assert.throws(()=>service.request(request(true),user,screen));
 await new Promise(r=>setTimeout(r,5));assert.ok(writes.every(v=>v===true));assert.ok(writes.length>0);
 service.pending.clear();samples[w.tagId].value=true;service.request(request(false),user,screen);
 await new Promise(r=>setTimeout(r,5));assert.equal(writes.at(-1),false);db.close();
});
test('SQLite: definitions, published revisions and command journal persist',()=>{
 const dir=directory();let db=new Store(dir);const c=db.config();c.connections[0].host='192.0.2.16';db.set('config',c);db.audit('test','saved',{revision:1});db.close();db=new Store(dir);assert.equal(db.config().connections[0].host,'192.0.2.16');assert.equal(db.screens()[0].publishedVersion,1);assert.equal(db.events().length,1);db.close();
});
test('config rejects address collisions, input writes, bad data types and missing references',()=>{
 for(const mutate of [(c:any)=>c.tags[1].address=2048,(c:any)=>c.tags[0].area='discrete-input',(c:any)=>c.tags[0].dataType='uint16',(c:any)=>c.devices[0].connectionId='missing',(c:any)=>c.commands[0].feedbackTagIds=[]]){const c=structuredClone(seedConfig);mutate(c);assert.throws(()=>validateConfig(c));}
 assert.doesNotThrow(()=>validateConfig(seedConfig));
});
test('legacy commands without permissives remain usable in live-screen availability checks',()=>{
 const command={...seedConfig.commands[0]};delete (command as any).permissives;
 assert.deepEqual(unmetPermissives({...seedConfig,commands:[command]} as any,command.id,{}),[]);
});
test('screen validation blocks removed tags and invalid numeric commands',()=>{const s=structuredClone(seedScreen);s.widgets[2].tagId='missing';assert.throws(()=>validateScreen(s,seedConfig));assert.throws(()=>validateValue(seedConfig,['tag-m0'],1));});
test('block builder groups adjacent addresses and isolates slave configurations',()=>{const b=blocks(seedConfig.tags);assert.equal(b.length,2);assert.equal(b[0].tags.length,3);const flow=buildGateway(seedConfig,'test',3001,directory());assert.equal(flow.filter(n=>n.type==='modbus-flex-getter'&&!n.id.startsWith('scada-readtest-')).length,1);assert.equal(flow.filter(n=>n.id.startsWith('scada-readtest-')).length,seedConfig.connections.length);assert.ok(flow.filter(n=>n.type==='modbus-client').every(n=>n.bufferCommands===false));});
test('command ordered pair, deduplication and fresh readback',async()=>{
 const db=new Store(directory()),c=db.config(),samples:Record<string,Sample>={};c.tags.forEach(t=>samples[t.id]={value:false,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1});
 const written:string[]=[];const service=new Commands(db,samples,()=>c,()=>true,async id=>{written.push(id);});const user:User={id:'u',username:'operator',role:'operator'},screen=db.screens()[0];const request={id:randomUUID(),commandId:'cmd-pair-0',value:true,screenId:screen.id,screenVersion:1};
 service.request(request,user,screen);service.request(request,user,screen);await new Promise(r=>setTimeout(r,10));assert.deepEqual(written,['tag-m0','tag-y0']);assert.equal(db.command(request.id)?.status,'acknowledged');service.tick();assert.equal(db.command(request.id)?.status,'acknowledged');
 for(const id of written)samples[id]={...samples[id],value:true,receivedAt:Date.now()+1,sampledAt:Date.now()+1};service.tick();assert.equal(db.command(request.id)?.status,'verified');assert.equal(service.pending.size,0);db.close();
});
test('stale values, observer role, unpublished action and old revision cannot write',()=>{
 const db=new Store(directory()),c=db.config(),samples:Record<string,Sample>={};c.tags.forEach(t=>samples[t.id]={value:false,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1});const svc=new Commands(db,samples,()=>c,()=>true,async()=>{throw Error('must not send');});const u:User={id:'u',username:'u',role:'operator'},s=db.screens()[0];const req={id:randomUUID(),commandId:'cmd-pair-0',value:true,screenId:s.id,screenVersion:1};
 assert.throws(()=>svc.request(req,{...u,role:'viewer'},s));assert.throws(()=>svc.request({...req,screenVersion:99},u,s));assert.throws(()=>svc.request({...req,value:4},u,s));samples['tag-m0'].receivedAt=0;assert.throws(()=>svc.request(req,u,s));assert.equal(db.commands().length,0);db.close();
});
test('second write failure remains partial; restart never replays commands',async()=>{
 const dir=directory(),db=new Store(dir),c=db.config(),samples:Record<string,Sample>={};c.tags.forEach(t=>samples[t.id]={value:false,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1});let count=0;const svc=new Commands(db,samples,()=>c,()=>true,async()=>{if(++count===2)throw Error('lost reply');});const s=db.screens()[0],id=randomUUID();svc.request({id,commandId:'cmd-pair-0',value:true,screenId:s.id,screenVersion:1},{id:'u',username:'u',role:'admin'},s);await new Promise(r=>setTimeout(r,10));assert.equal(db.command(id)?.status,'partial');assert.equal(count,2);db.close();const next=new Store(dir);assert.equal(next.command(id)?.status,'partial');next.close();
});
