import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../apps/server/src/store';
import {buildGateway} from '../apps/server/src/gateway';
import {seedConfig} from '../packages/contracts/seed';
import {MODBUS_WRITE_PREP_ID} from '../packages/drivers/driver';

const driverSource=fs.readFileSync(path.join(__dirname,'..','packages','drivers','driver.ts'),'utf8');
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-hardening-'));
function harness(){
 const store=new Map<string,any>();
 const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>{if(v===undefined)store.delete(k);else store.set(k,v);}};
 const ctx=new Map<string,any>();
 const context={get:(k:string)=>ctx.get(k),set:(k:string,v:unknown)=>{ctx.set(k,v);}};
 const timers:{fn:()=>void;ms:number}[]=[];
 const run=(func:string,msg:any)=>new Function('msg','flow','context','node','setTimeout',func)(msg,flow,context,{send(){}},(fn:()=>void,ms:number)=>{timers.push({fn,ms});return 1;});
 return {store,flow,context,ctx,timers,run};
}
const funcOf=(nodes:any[],id:string)=>nodes.find(n=>n.id===id).func as string;

test('OPC UA / S7 / ADS convert nodes: session + strictly increasing seq, no sequence:now',()=>{
 assert.equal(/sequence:\s*now\b/.test(driverSource),false);
 const config=structuredClone(seedConfig);
 const nodes=buildGateway(config,'tok',1880,'.');
 const converts=nodes.filter(n=>/-convert$/.test(n.id)&&typeof n.func==='string'&&n.func.includes('sequence:'));
 assert.ok(converts.length>0);
 for(const n of converts){assert.match(n.func,/session:context\.get\('session'\)/,n.id);assert.match(n.func,/sequence:seq/,n.id);}
});

test('write guard: command ids pruned after TTL, replay still rejected inside TTL, writeDeadline set',()=>{
 const nodes=buildGateway(structuredClone(seedConfig),'tok',1880,'.');
 const guard=funcOf(nodes,'scada-write-guard');
 const guardNode=nodes.find(n=>n.id==='scada-write-guard');
 const last=guardNode.outputs-1;
 const h=harness();
 h.flow.set('fresh-tag-m0',Date.now());
 const cmd=(id:string)=>({req:{headers:{'x-scada-token':'tok'}},res:{},payload:{tagId:'tag-m0',value:true,commandId:id,expiresAt:Date.now()+3000,revision:1}});
 const first=h.run(guard,cmd('old-1'));
 assert.ok(!first[last],'ilk komut kabul');
 const sent=first.find((x:any,i:number)=>i<last&&x);
 assert.ok(sent.command.writeDeadline>Date.now()&&sent.command.writeDeadline<=sent.command.expiresAt+300);
 assert.equal(h.run(guard,cmd('old-1'))[last].statusCode,409,'tekrar reddedilir');
 // 16 dk eskit
 const cm=h.store.get('command-index');cm['old-1']=Date.now()-16*60000;h.flow.set('command-old-1',cm['old-1']);
 h.flow.set('fresh-tag-m0',Date.now());
 h.run(guard,cmd('new-1'));
 assert.equal(h.flow.get('command-old-1'),undefined,'eski anahtar temizlendi');
 assert.equal(Object.keys(h.store.get('command-index')).includes('old-1'),false);
 assert.ok(h.flow.get('command-new-1'));
 assert.equal(h.run(guard,cmd('new-1'))[last].statusCode,409);
});

test('Modbus dispatch aborts after writeDeadline or when reply already given up',()=>{
 const nodes=buildGateway(structuredClone(seedConfig),'tok',1880,'.');
 const prep=funcOf(nodes,MODBUS_WRITE_PREP_ID);
 const sent:any[]=[];const timers:{fn:()=>void;ms:number}[]=[];
 const store=new Map<string,any>();
 const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>{if(v===undefined)store.delete(k);else store.set(k,v);}};
 const run=(msg:any)=>new Function('msg','flow','context','node','setTimeout',prep)(msg,flow,flow,{send:(m:any)=>sent.push(m)},(fn:()=>void,ms:number)=>{timers.push({fn,ms});return 1;});
 const mk=(id:string,over:any={})=>({req:{},res:{},command:{tagId:'tag-m0',value:true,commandId:id,expiresAt:Date.now()+7000,revision:1,connectionId:'conn-01',...over}});
 flow.set('fresh-tag-m0',Date.now());
 // gecmis writeDeadline -> 409, hat kilidi alinmaz
 run(mk('c1',{writeDeadline:Date.now()-1}));
 assert.equal(sent.at(-1).at(-1).reject.code,409);
 assert.equal([...store.keys()].some(k=>k.startsWith('bus-')),false);
 // kilit varken bekle; kopru 502 verip reply'i sildiyse tekrar denemede yazma gitmez
 sent.length=0;
 flow.set('bus-192.0.2.15:502',{at:Date.now(),kind:'read',key:'x'});
 flow.set('reply-c2',1);
 run(mk('c2',{writeDeadline:Date.now()+5000}));
 assert.equal(sent.length,0);
 flow.set('reply-c2',undefined);
 timers.at(-1)!.fn();
 assert.equal(sent.length,1);
 assert.equal(sent[0].at(-1).reject.code,409);
 assert.equal(store.get('bus-192.0.2.15:502').key,'x','kilit ele gecirilmedi');
});

test('Modbus node names no longer contain corrupted ? characters',()=>{
 const nodes=buildGateway(structuredClone(seedConfig),'tok',1880,'.');
 const names=nodes.map(n=>String(n.name||''));
 assert.ok(names.some(n=>n.startsWith('Tarama zamanlayıcı · ')));
 assert.ok(names.some(n=>n.startsWith('Sıralı tarama · ')));
 assert.ok(names.some(n=>n.startsWith('Oku · ')));
 assert.equal(names.some(n=>/zamanlay\?|S\?ral/.test(n)),false);
});

test('Store: writeHistory is atomic, startup recovery covers commands beyond newest 200',()=>{
 const d=dir();
 const s=new Store(d);
 s.writeHistory([{tagId:'t',at:1,value:1,quality:'good'},{tagId:'t',at:2,value:2,quality:'good'}]);
 assert.throws(()=>s.writeHistory([{tagId:'t',at:3,value:3,quality:'good'},{tagId:'t',at:4,value:{} as any,quality:'good'}]));
 const n=(s as any).db.prepare('SELECT COUNT(*) n FROM history').get().n;
 assert.equal(n,2,'basarisiz toplu yazma geri alinir');
 const mk=(id:string,i:number,status:string,kind='command')=>({id,kind,status,createdAt:i,updatedAt:i,message:''}) as any;
 s.saveCommand(mk('ancient',1,'sent'));
 s.saveCommand(mk('ancient-script',2,'running','script'));
 for(let i=0;i<250;i++)s.saveCommand(mk('done-'+i,1000+i,'confirmed'));
 s.close();
 const s2=new Store(d);
 const rows=(s2 as any).db.prepare('SELECT body FROM commands').all().map((r:any)=>JSON.parse(r.body));
 const a=rows.find((r:any)=>r.id==='ancient'),b=rows.find((r:any)=>r.id==='ancient-script');
 assert.equal(a.status,'uncertain');
 assert.equal(b.status,'uncertain');assert.equal(b.recover,true);
 assert.deepEqual(s2.recoverableCommands().map(c=>c.id),['ancient-script'],'200 sinirini asan recover scripti bulunur');
 s2.close();
});

