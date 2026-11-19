import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {Config} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {buildWriteBridge,writableTags,MODBUS_WRITE_PREP_ID,WRITE_REPLY_TIMEOUT_MS,type WriteBranch} from '../packages/drivers/driver';
import {buildGateway,deployGateway} from '../apps/server/src/gateway';
/* Paylasilan yazma koprusu (Faz 0): HTTP girisi + protokolden bagimsiz bekci + sonuc + HTTP yaniti
 * gateway'de tek kez; surucu kendi dalini ekler. Function dugumleri Node-RED'deki gibi
 * (msg, flow, context, node, setTimeout) ile calistirilir — setTimeout burada yakalanir. */
type Timer={fn:()=>void;ms:number};
function harness(){
 const store=new Map<string,any>();
 const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>{if(v===undefined)store.delete(k);else store.set(k,v);}};
 const sent:any[]=[];const timers:Timer[]=[];
 const node={send:(m:any)=>sent.push(m)};
 const setTimeoutStub=(fn:()=>void,ms:number)=>{timers.push({fn,ms});return timers.length;};
 const run=(func:string,msg:any)=>new Function('msg','flow','context','node','setTimeout',func)(msg,flow,flow,node,setTimeoutStub);
 return {store,flow,sent,timers,run};
}
const funcOf=(nodes:any[],id:string)=>{const n=nodes.find(x=>x.id===id);assert.ok(n,id+' bulunamali');return n.func as string;};
const now=()=>Date.now();
const req=(token='tok')=>({headers:{'x-scada-token':token}});
const command=(over:Record<string,unknown>={})=>({tagId:'tag-m0',value:true,commandId:'cmd-1',expiresAt:now()+3000,revision:1,...over});
/** Iki Modbus baglantisi, her birinde yazilabilir etiket. */
function twoConnConfig():Config{
 const c=structuredClone(seedConfig);
 c.connections.push({id:'conn-02',name:'Ikinci hat',host:'10.0.0.9',port:502,timeout:1500});
 c.devices.push({id:'plc-02',connectionId:'conn-02',code:'PLC-02',name:'Ikinci',slaveId:4,enabled:true,pollMs:1000,staleMs:3000,description:''});
 c.tags.push({id:'tag-h2',deviceId:'plc-02',code:'D2',name:'D2',area:'holding-register',address:100,dataType:'uint16',access:'readwrite',scale:1,offset:0,min:0,max:1000,unit:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,description:''});
 return c;
}

test('bekci parity: eski Modbus bekcisiyle ayni red kodlari (401/409/400/409 bayat/409 tekrar) ve gecerli komut yonlendirilir',()=>{
 const nodes=buildGateway(structuredClone(seedConfig),'tok',1880,'.');
 const guard=funcOf(nodes,'scada-write-guard');
 assert.doesNotThrow(()=>new Function('msg','flow','context','node','setTimeout',guard));
 const guardNode=nodes.find(n=>n.id==='scada-write-guard');
 const last=guardNode.outputs-1;
 const h=harness();
 h.flow.set('fresh-tag-m0',now());
 const reject=(msg:any)=>{const out=h.run(guard,msg);assert.ok(Array.isArray(out));assert.ok(out.slice(0,last).every((x:any)=>x===null),'red yalniz HTTP cikisina gider');return out[last];};
 assert.equal(reject({req:req('yanlis'),payload:command()}).statusCode,401);
 assert.equal(reject({req:req(),payload:command({revision:2})}).statusCode,409,'revizyon uyusmazligi');
 assert.equal(reject({req:req(),payload:command({commandId:'kotu id!'})}).statusCode,409,'commandId bicimi');
 assert.equal(reject({req:req(),payload:command({expiresAt:now()-1})}).statusCode,409,'suresi dolmus');
 assert.equal(reject({req:req(),payload:command({expiresAt:'yarin'})}).statusCode,409,'sayi olmayan expiresAt');
 assert.equal(reject({req:req(),payload:null}).statusCode,409);
 assert.equal(reject({req:req(),payload:command({tagId:'yok'})}).statusCode,400,'bilinmeyen etiket');
 assert.equal(reject({req:req(),payload:command({tagId:'__proto__'})}).statusCode,400,'prototip anahtari etiket sayilmaz');
 h.flow.set('fresh-tag-m0',now()-5000);
 assert.equal(reject({req:req(),payload:command()}).statusCode,409,'bayat veri yazmayi engeller (staleMs 4000)');
 h.flow.set('fresh-tag-m0',now());
 const ok=h.run(guard,{req:req(),payload:command()});
 assert.equal(ok[last],null);
 const routed=ok.find((x:any)=>x);
 assert.deepEqual({...routed.command,expiresAt:0},{tagId:'tag-m0',value:true,commandId:'cmd-1',expiresAt:0,revision:1,connectionId:'conn-01'});
 assert.equal(h.timers.length,1,'gecerli komut zaman asimi kurar');
 assert.ok(h.timers[0].ms<=WRITE_REPLY_TIMEOUT_MS&&h.timers[0].ms>=50);
 // Ayni commandId ikinci kez: 409 ve HTTP cevabi doner (eskiden yanitsiz kaliyordu).
 assert.equal(reject({req:req(),payload:command()}).statusCode,409,'tekrar eden commandId');
 assert.equal(h.timers.length,1,'reddedilen komut zamanlayici kurmaz');
});

test('yonlendirme: X baglantisindaki etiket X dalina gider (iki surucu dali, iki baglanti)',()=>{
 const dev=(id:string,connectionId:string)=>({...seedConfig.devices[0],id,connectionId});
 const tag=(id:string,deviceId:string)=>({...seedConfig.tags[0],id,deviceId});
 const branchA:WriteBranch={nodes:[{id:'scada-a-entry',type:'function'}],entries:{'conn-a':'scada-a-entry'}};
 const branchB:WriteBranch={nodes:[{id:'scada-b-entry',type:'function'}],entries:{'conn-b':'scada-b-entry','conn-c':'scada-b-entry'}};
 const nodes=buildWriteBridge('tok',1,[
  {branch:branchA,devices:[dev('da','conn-a')],tags:[tag('ta','da')]},
  {branch:branchB,devices:[dev('db','conn-b'),dev('dc','conn-c')],tags:[tag('tb','db'),tag('tc','dc')]}]);
 const guardNode=nodes.find(n=>n.id==='scada-write-guard');
 assert.deepEqual(guardNode.wires,[['scada-a-entry'],['scada-b-entry'],['scada-b-entry'],['scada-http-response']]);
 assert.ok(nodes.some(n=>n.id==='scada-a-entry')&&nodes.some(n=>n.id==='scada-b-entry'),'dal dugumleri eklenir');
 const h=harness();
 for(const [tagId,index,conn] of [['ta',0,'conn-a'],['tb',1,'conn-b'],['tc',2,'conn-c']] as const){
  h.flow.set('fresh-'+tagId,now());
  const out=h.run(guardNode.func,{req:req(),payload:command({tagId,commandId:'c-'+tagId})});
  assert.equal(out.findIndex((x:any)=>x),index,tagId+' kendi baglantisinin cikisina gitmeli');
  assert.equal(out[index].command.connectionId,conn);
 }
});

test('yonlendirme (Modbus, buildGateway): ikinci baglantidaki etiket o baglantinin modbus-flex-write dugumune gider',()=>{
 const nodes=buildGateway(twoConnConfig(),'tok',1880,'.');
 const guardNode=nodes.find(n=>n.id==='scada-write-guard');
 assert.deepEqual(guardNode.wires,[[MODBUS_WRITE_PREP_ID],[MODBUS_WRITE_PREP_ID],['scada-http-response']]);
 const prepNode=nodes.find(n=>n.id===MODBUS_WRITE_PREP_ID);
 assert.deepEqual(prepNode.wires,[['scada-write-conn-01'],['scada-write-conn-02'],['scada-write-result']]);
 const h=harness();
 h.flow.set('fresh-tag-h2',now());
 const routed=h.run(guardNode.func,{req:req(),payload:command({tagId:'tag-h2',value:42})}).find((x:any)=>x);
 assert.equal(routed.command.connectionId,'conn-02');
 assert.equal(h.run(prepNode.func,routed),null,'dal asenkron gonderir (node.send)');
 assert.equal(h.sent.length,1);
 const out=h.sent[0];
 assert.equal(out[0],null);
 assert.deepEqual(out[1].payload,{fc:6,unitid:4,address:100,quantity:1,value:42});
 assert.equal(out[1].bus,'10.0.0.9:502');
 assert.equal(h.store.get('bus-10.0.0.9:502').key,'cmd-1','hat kilidi Modbus dalinda alinir');
});

test('Modbus dali: kodlama hatalari paylasilan sonuc dugumune red olarak gider; hat kilidi beklenir',()=>{
 const nodes=buildGateway(twoConnConfig(),'tok',1880,'.');
 const prep=funcOf(nodes,MODBUS_WRITE_PREP_ID);
 const result=funcOf(nodes,'scada-write-result');
 const h=harness();
 const at=(over:any)=>({req:req(),res:{},command:{...command(),connectionId:'conn-01',...over}});
 const viaResult=(out:any)=>{assert.ok(out[2],'red sonuc cikisina gider');h.flow.set('reply-'+out[2].command.commandId,1);return h.run(result,out[2]);};
 let r=viaResult(h.run(prep,at({value:1})));
 assert.equal(r.statusCode,400);assert.match(r.payload.error,/Dijital/);
 r=viaResult(h.run(prep,at({tagId:'tag-h2',value:5000,connectionId:'conn-02',commandId:'c2'})));
 assert.equal(r.statusCode,400,'sinir disi deger encodeValue ile reddedilir');
 // Hat kilitli: dal bekler (setTimeout 25), kilit kalkinca gonderir.
 h.flow.set('fresh-tag-m0',now());
 h.flow.set('bus-192.0.2.15:502',{at:now(),kind:'read',key:'x'});
 assert.equal(h.run(prep,at({commandId:'c3'})),null);
 assert.equal(h.sent.length,0,'kilit varken yazma gitmez');
 assert.equal(h.timers.at(-1)!.ms,25);
 h.flow.set('bus-192.0.2.15:502',null);
 h.timers.at(-1)!.fn();
 assert.equal(h.sent.length,1);
 assert.deepEqual(h.sent[0][0].payload,{fc:5,unitid:1,address:2048,quantity:1,value:true});
 // Bekleme sirasinda veri bayatlarsa 409.
 h.flow.set('bus-192.0.2.15:502',{at:now(),kind:'read',key:'y'});
 h.run(prep,at({commandId:'c4'}));
 h.flow.set('fresh-tag-m0',0);
 h.timers.at(-1)!.fn();
 assert.equal(h.sent.at(-1)[2].reject.code,409);
});

test('zaman asimi: dal cevap vermezse bekci 502 doner, gec gelen cevap ikinci yanit uretmez',()=>{
 const nodes=buildGateway(structuredClone(seedConfig),'tok',1880,'.');
 const guardNode=nodes.find(n=>n.id==='scada-write-guard');
 const result=funcOf(nodes,'scada-write-result');
 const last=guardNode.outputs-1;
 const h=harness();
 h.flow.set('fresh-tag-m0',now());
 const res={id:'res-1'};
 const routed=h.run(guardNode.func,{_msgid:'m1',req:req(),res,payload:command({expiresAt:now()+60000})}).find((x:any)=>x);
 assert.equal(h.timers.length,1);
 assert.equal(h.timers[0].ms,WRITE_REPLY_TIMEOUT_MS,'uzak son gecerlilikte tavan kullanilir');
 h.timers[0].fn();// dal hic cevap vermedi
 assert.equal(h.sent.length,1);
 const reply=h.sent[0][last];
 assert.ok(h.sent[0].slice(0,last).every((x:any)=>x===null));
 assert.equal(reply.statusCode,502);
 assert.equal(reply.res,res,'ayni HTTP istegine cevap verilir');
 assert.equal(reply.payload.ack,false);
 // Gec cevap: sonuc dugumu ikinci kez HTTP yaniti uretmez ama hat kilidini yine birakir.
 h.flow.set('bus-b',{at:now(),key:'cmd-1'});
 assert.equal(h.run(result,{...routed,bus:'b',lockKey:'cmd-1',payload:{}}),null);
 assert.equal(h.store.get('bus-b'),null,'gec cevapta da kilit serbest');
});

test('zaman asimi: dal once cevap verirse zamanlayici bir sey gondermez; sonuc 200 {ack:true,at} / hata 502',()=>{
 const nodes=buildGateway(structuredClone(seedConfig),'tok',1880,'.');
 const guardNode=nodes.find(n=>n.id==='scada-write-guard');
 const result=funcOf(nodes,'scada-write-result');
 const h=harness();
 h.flow.set('fresh-tag-m0',now());
 const routed=h.run(guardNode.func,{req:req(),res:{},payload:command({expiresAt:now()+1000})}).find((x:any)=>x);
 assert.ok(h.timers[0].ms<=1250,'yakin son gecerlilikte zamanlayici expiresAt+250 ms');
 const ok=h.run(result,{...routed,payload:{fc:5}});
 assert.equal(ok.statusCode,200);
 assert.equal(ok.payload.ack,true);
 assert.ok(Number.isFinite(ok.payload.at));
 h.timers[0].fn();
 assert.equal(h.sent.length,0,'cevaplanmis istekte zaman asimi yaniti gitmez');
 // Cihaz hatasi: 502.
 h.flow.set('fresh-tag-m0',now());
 const r2=h.run(guardNode.func,{req:req(),res:{},payload:command({commandId:'cmd-2'})}).find((x:any)=>x);
 const bad=h.run(result,{...r2,payload:'',error:Error('Timed out')});
 assert.equal(bad.statusCode,502);
 assert.equal(bad.payload.ack,false);
 assert.match(bad.payload.error,/Timed out/);
});

test('yazilabilir etiket yoksa yazma koprusu uretilmez; Modbus okuma testi icin HTTP yaniti kalir',()=>{
 const c=structuredClone(seedConfig);
 for(const t of c.tags)t.access='read';
 const nodes=buildGateway(c,'tok',1880,'.');
 for(const id of ['scada-write-http','scada-write-guard','scada-write-result',MODBUS_WRITE_PREP_ID,'scada-write-conn-01'])
  assert.ok(!nodes.some(n=>n.id===id),id+' uretilmemeli');
 assert.equal(nodes.filter(n=>n.id==='scada-http-response').length,1,'okuma testi icin tek HTTP yaniti');
 // Devre disi cihazdaki readwrite etiket de yazilabilir sayilmaz.
 const d=structuredClone(seedConfig);d.devices[0].enabled=false;
 assert.equal(writableTags(d.devices,d.tags).length,0);
 assert.ok(!buildGateway(d,'tok',1880,'.').some(n=>n.id==='scada-write-guard'));
});

test('Modbus dugum kimlikleri korunur ve tekil; tum dugumler scada- onekli',()=>{
 const nodes=buildGateway(twoConnConfig(),'tok',1880,'.');
 const ids=nodes.map(n=>n.id);
 assert.equal(new Set(ids).size,ids.length,'kimlikler tekil');
 assert.ok(ids.every(id=>id.startsWith('scada-')));
 for(const id of ['scada-write-http','scada-write-guard','scada-write-result','scada-http-response','scada-write-conn-01','scada-write-conn-02','scada-read-http','scada-read-guard','scada-read-result'])
  assert.ok(ids.includes(id),id);
 assert.equal(nodes.find(n=>n.id==='scada-write-http').url,'/scada-bridge/command');
 // Her dugumun kablolari var olan dugumlere gider (kopuk kablo yok).
 for(const n of nodes)for(const w of n.wires||[])for(const target of w)assert.ok(ids.includes(target),n.id+' -> '+target+' bulunamadi');
});

test('deployGateway: manifestteki ama artik uretilmeyen eski scada- dugumleri kaldirilir',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-wb-'));
 const c=structuredClone(seedConfig);for(const t of c.tags)t.access='read';
 const stale=['scada-write-http','scada-write-guard','scada-write-result','scada-write-conn-01'];
 fs.writeFileSync(path.join(dir,'gateway-manifest.json'),JSON.stringify([...stale,'scada-gateway']));
 const current={rev:'r1',flows:[{id:'scada-gateway',type:'tab'},...stale.map(id=>({id,type:'function',z:'scada-gateway'})),{id:'yabanci',type:'tab'}]};
 let posted:any=null;
 const realFetch=globalThis.fetch;const prevToken=process.env.NODERED_ADMIN_TOKEN;
 process.env.NODERED_ADMIN_TOKEN='test';
 globalThis.fetch=(async(url:string,init:any={})=>{
  const auth=init.headers?.Authorization;
  if(String(url).endsWith('/flows')&&(!init.method||init.method==='GET'))return auth?new Response(JSON.stringify(current),{status:200}):new Response('',{status:401});
  if(String(url).endsWith('/flows')&&init.method==='POST'){posted=JSON.parse(init.body);return new Response(JSON.stringify({rev:'r2'}),{status:200});}
  return new Response('',{status:404});
 }) as any;
 try{
  const r:any=await deployGateway(c,'tok',3000,dir,'http://nodered.invalid');
  const ids=posted.flows.map((n:any)=>n.id);
  for(const id of stale)assert.ok(!ids.includes(id),id+' kaldirilmali');
  assert.ok(ids.includes('yabanci'),'yabanci dugum korunur');
  assert.deepEqual([...r.diff.removed].sort(),[...stale].sort());
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'gateway-manifest.json'),'utf8'));
  assert.ok(!manifest.some((id:string)=>stale.includes(id)));
 }finally{
  globalThis.fetch=realFetch;
  if(prevToken===undefined)delete process.env.NODERED_ADMIN_TOKEN;else process.env.NODERED_ADMIN_TOKEN=prevToken;
 }
});
