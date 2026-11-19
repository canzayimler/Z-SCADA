import {test} from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {createRequire} from 'node:module';
import {connectionSchema,deviceSchema,tagSchema,validateConfig,protocolLabels,isSymbolicProtocol,isReadOnlyProtocol,symbolicAddressField,symbolicAddressOf,addressFormatOf,connectionAddress,
 parseCipTag,CIP_DATATYPE,ENIP_PORT,type Config} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {enipDriver,enipOutId,driverFor,ENIP_WRITE_PREP_ID,ENIP_WRITE_RESULT_ID,ENIP_EMIT_MIN_MS,WRITE_RESULT_ID,WRITE_GUARD_ID} from '../packages/drivers/driver';
import {buildGateway} from '../apps/server/src/gateway';
/* EtherNet/IP (CIP) surucusu: etiket adi sozdizimi (paketin Tag.isValidTagname'iyle capraz denetim), desteklenen tipler,
 * dugum uretimi (endpoint degisken tablosu, all-split okuma, durum izleme, CIP etiketi basina 'eth-ip out'), yazma dali
 * (paylasilan kopru yonlendirmesi, baglanti hazir degilse 503, tip/sinir/tam sayi, olcek geri alma, bekleyen kaydi) ve
 * donusum dugumu (offline'da bad, yeniden baglanista guven penceresi). Function govdeleri new Function ile calisir. */
const require=createRequire(import.meta.url);
const {Tag:CipTag}=require('ethernet-ip');

const conn=(extra:object={})=>connectionSchema.parse({id:'e1',name:'CompactLogix',protocol:'enip',host:'198.51.100.110',port:44818,slot:0,timeout:3000,...extra});
const device=(extra:object={})=>deviceSchema.parse({id:'ed1',connectionId:'e1',code:'PLC-1',name:'Hat 1 PLC',slaveId:1,enabled:true,pollMs:1000,staleMs:4000,...extra});
const tag=(id:string,cipTag:string,dataType:string,extra:object={})=>tagSchema.parse({id,deviceId:'ed1',code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'read',min:-1000,max:1000,cipTag,...extra});
const base=():Config=>{const c:any=structuredClone(seedConfig);c.connections.push(conn());c.devices.push(device());return c;};
const ctx={token:'tok',revision:1,hostname:'ZS-A'};

test('EtherNet/IP protokolu: etiket, sembolik alan, oku/yaz destekli, adres metni, surucu secimi',()=>{
 assert.equal(protocolLabels.enip,'EtherNet/IP (CIP)');
 assert.equal(isSymbolicProtocol('enip'),true);assert.equal(isReadOnlyProtocol('enip'),false);
 assert.equal(symbolicAddressField('enip'),'cipTag');
 assert.equal(symbolicAddressOf({cipTag:'Program:Main.Sayac'},{protocol:'enip'}),'Program:Main.Sayac');
 assert.equal(addressFormatOf(base(),'ed1'),'enip');
 assert.equal(connectionAddress(conn({slot:2})),'198.51.100.110 · slot 2');
 assert.equal(driverFor(conn()).id,'enip');
 assert.equal(enipDriver.writeLimits.allowWrite,true);
 assert.deepEqual(CIP_DATATYPE,{bool:'BOOL',int16:'INT',int32:'DINT',float32:'REAL'});
 assert.equal(ENIP_PORT,44818);
});

test('parseCipTag: Logix/Omron sozdizimi; gecerli adlar paketin Tag.isValidTagname kuraliyla ayni',()=>{
 const good=['Sicaklik','Program:MainProgram.Sayac','Dizi[3]','Matris[1,2]','Kup[1,2,3]','Udt.Uye','Udt.Dizi[4].Uye','DintEtiket.5','DintEtiket.31','_Gizli','a_b_c','Program:P1.Motor[2].Hiz','T1','x9'];
 for(const g of good){assert.equal(parseCipTag(g).tag,g,g);assert.equal(CipTag.isValidTagname(g),true,'paket de kabul etmeli: '+g);}
 assert.equal(parseCipTag(' Sicaklik ').tag,'Sicaklik');
 assert.equal(parseCipTag('DintEtiket.5').bit,5);assert.equal(parseCipTag('Sicaklik').bit,null);
 const bad=['','1Basla','iki  bosluk','a__b','sonu_','Dizi[]','Dizi[a]','Dizi[1,2,3,4]','Program:.X','Program:P1','x.','.x','x..y','Udt.Uye[1,2]','a-b','Ş','x;drop','x.123'];
 for(const b of bad)assert.throws(()=>parseCipTag(b),/EtherNet\/IP etiket adı/,b);
 for(const b of bad.filter(b=>b))assert.equal(CipTag.isValidTagname(b.trim()),false,'paket de reddetmeli: '+b);
 assert.throws(()=>parseCipTag('DintEtiket.32'),/0-31/);
 assert.throws(()=>parseCipTag('A'.repeat(41)),/40 karakter/);
 assert.throws(()=>parseCipTag('A'.repeat(201)),/200/);
});

test('validateConfig: port 44818, desteklenmeyen tip, bit erisimi, yazilabilir sinir, ayni ad farkli tip',()=>{
 const ok=base();ok.tags.push(tag('t1','Sicaklik','float32'),tag('t2','Program:Main.Sayac','int32',{access:'readwrite',min:0,max:1e6}),tag('t3','Durum.3','bool'),tag('t4','Mod','int16',{access:'readwrite'}));
 assert.doesNotThrow(()=>validateConfig(ok));
 const port=base();port.connections[port.connections.length-1]=conn({port:2222});
 assert.throws(()=>validateConfig(port),/44818 olmalı/);
 const t=(...x:Parameters<typeof tag>)=>{const c=base();c.tags.push(tag(...x));return c;};
 assert.throws(()=>validateConfig(t('t1','Sayac','uint16')),/uint16 desteklemiyor/);
 assert.throws(()=>validateConfig(t('t1','Sayac','uint32')),/UINT\/UDINT/);
 assert.throws(()=>validateConfig(t('t1','Durum.3','int16')),/yalnız bool/);
 assert.throws(()=>validateConfig(t('t1','1Kotu','int16')),/etiket adı anlaşılamadı/);
 assert.throws(()=>validateConfig(t('t1','Sp','float32',{access:'readwrite',min:5,max:5})),/Alt sınır/);
 assert.throws(()=>enipDriver.validate(conn(),[tag('a','X','int16'),tag('b','X','int32')]),/başka veri tipiyle/);
 assert.doesNotThrow(()=>enipDriver.validate(conn(),[tag('a','X','int16'),tag('b','X','int16',{scale:2})]));
});

function nodesFor(c:Config){
 const cfg=validateConfig(c);
 const conns=cfg.connections.filter(x=>x.protocol==='enip');
 const {devices,tags}={devices:cfg.devices.filter(d=>conns.some(x=>x.id===d.connectionId)),tags:cfg.tags.filter(t=>cfg.devices.some(d=>d.id===t.deviceId&&conns.some(x=>x.id===d.connectionId)))};
 return {cfg,read:enipDriver.buildNodes(conns,devices,tags,ctx),write:enipDriver.buildWriteNodes!(conns,devices,tags.filter(t=>t.access==='readwrite'),ctx)};
}
function sample():Config{
 const c=base();
 c.connections.push(conn({id:'e2',name:'Omron NX',host:'198.51.100.111',slot:0,enipCycleMs:250}));
 c.devices.push(device({id:'ed2',connectionId:'e2',code:'NX-1',pollMs:2000,staleMs:6000}));
 c.tags.push(tag('sp','Program:Main.Setpoint','float32',{access:'readwrite',scale:0.1,offset:5}),tag('run','Calis','bool',{access:'readwrite',min:0,max:1}),
  tag('cnt','Sayac','int32',{access:'readwrite',min:-1e6,max:1e6}),tag('cnt2','Sayac','int32'),tag('temp','Sicaklik','float32'),
  tag('nx','HatHizi','int16',{deviceId:'ed2',access:'readwrite',min:0,max:1000}));
 return c;
}
test('dugum uretimi: endpoint degisken tablosu, slot, cevrim, all-split okuma, durum, yeniden yayin',()=>{
 const {read}=nodesFor(sample());
 const ep=read.find(n=>n.id==='scada-enip-e1-endpoint');
 assert.equal(ep.type,'eth-ip endpoint');assert.equal(ep.address,'198.51.100.110');assert.equal(ep.slot,'0');assert.equal(ep.cycletime,'1000');
 assert.deepEqual(ep.vartable,{'':{'Program:Main.Setpoint':{type:'REAL'},Calis:{type:'BOOL'},Sayac:{type:'DINT'},Sicaklik:{type:'REAL'}}});
 assert.equal(read.find(n=>n.id==='scada-enip-e2-endpoint').cycletime,'250','enipCycleMs');
 const inp=read.find(n=>n.id==='scada-enip-e1-in');
 assert.deepEqual([inp.type,inp.mode,inp.endpoint,inp.wires],['eth-ip in','all-split','scada-enip-e1-endpoint',[['scada-enip-e1-convert']]]);
 const st=read.find(n=>n.id==='scada-enip-e1-status');
 assert.deepEqual([st.type,st.scope,st.wires],['status',['scada-enip-e1-in'],[['scada-enip-e1-convert']]]);
 assert.equal(read.find(n=>n.id==='scada-enip-e1-clock').repeat,'1');
 assert.deepEqual(read.find(n=>n.id==='scada-enip-e1-convert').wires,[['scada-ws-out']]);
 const ids=read.map(n=>n.id);assert.equal(new Set(ids).size,ids.length);
});

test('yazma dali: CIP etiketi basina eth-ip out, complete/catch kapsami, paylasilan kopru yonlendirmesi',()=>{
 const c=sample();
 const {cfg,write}=nodesFor(c);
 const outs=write.nodes.filter(n=>n.type==='eth-ip out');
 assert.deepEqual(outs.map(o=>[o.id,o.variable,o.program,o.endpoint]).sort(),[
  [enipOutId({id:'e1'},'Calis'),'Calis','','scada-enip-e1-endpoint'],[enipOutId({id:'e1'},'Program:Main.Setpoint'),'Program:Main.Setpoint','','scada-enip-e1-endpoint'],
  [enipOutId({id:'e1'},'Sayac'),'Sayac','','scada-enip-e1-endpoint'],[enipOutId({id:'e2'},'HatHizi'),'HatHizi','','scada-enip-e2-endpoint']].sort());
 assert.ok(outs.every(o=>o.wires.length===0),'eth-ip out cikissiz');
 const done=write.nodes.find(n=>n.id==='scada-enip-e1-wdone');
 assert.equal(done.type,'complete');assert.deepEqual([...done.scope].sort(),outs.filter(o=>o.endpoint.includes('-e1-')).map(o=>o.id).sort());
 assert.deepEqual(done.wires,[[ENIP_WRITE_RESULT_ID]]);
 const cat=write.nodes.find(n=>n.id==='scada-enip-e2-wcatch');assert.deepEqual(cat.scope,[enipOutId({id:'e2'},'HatHizi')]);
 assert.deepEqual(write.entries,{e1:ENIP_WRITE_PREP_ID,e2:ENIP_WRITE_PREP_ID});
 const prep=write.nodes.find(n=>n.id===ENIP_WRITE_PREP_ID);
 assert.equal(prep.outputs,outs.length+1);assert.deepEqual(prep.wires.at(-1),[WRITE_RESULT_ID]);
 // Gateway: bekci ENIP etiketlerini ENIP hazirligina yollar, salt okunur etiket rotada yok.
 const flow=buildGateway(cfg,'tok',4731,os.tmpdir());
 const guard=flow.find((n:any)=>n.id===WRITE_GUARD_ID);
 const routes=JSON.parse(/const tags=(\{.*?\});/.exec(guard.func)![1]);
 for(const id of ['sp','run','cnt','nx'])assert.equal(guard.wires[routes[id].o][0],ENIP_WRITE_PREP_ID,id);
 assert.equal(routes.cnt2,undefined);assert.equal(routes.temp,undefined);
 for(const t of ['eth-ip endpoint','eth-ip in','eth-ip out','status','complete','catch'])assert.ok(flow.some((n:any)=>n.type===t),t);
});

function harness(){
 const flowStore=new Map<string,any>(),ctxStore=new Map<string,any>();
 const mk=(m:Map<string,any>)=>({get:(k:string)=>m.get(k),set:(k:string,v:unknown)=>{if(v===undefined)m.delete(k);else m.set(k,v);}});
 const sent:any[]=[],statuses:any[]=[];
 const node={send:(m:any)=>sent.push(m),status:(s:any)=>statuses.push(s)};
 const flow=mk(flowStore),context=mk(ctxStore);
 const run=(func:string,msg:any)=>new Function('msg','flow','context','node',func)(msg,flow,context,node);
 return {flowStore,ctxStore,run,sent,statuses};
}
const cmd=(tagId:string,value:unknown,over:Record<string,unknown>={})=>({tagId,value,commandId:'c-'+tagId+'-'+String(value),expiresAt:Date.now()+3000,revision:1,connectionId:'e1',...over});
test('yazma hazirligi: baglanti online degilse 503 (gec yazma yok), sure/tip/sinir, olcek geri alma, hedef ve bekleyen',()=>{
 const {write}=nodesFor(sample());
 const prep=write.nodes.find(n=>n.id===ENIP_WRITE_PREP_ID);
 const h=harness();
 const route=(out:any[])=>out.findIndex(x=>x);
 const outIdx=(name:string,c='e1')=>prep.wires.findIndex((w:string[])=>w[0]===enipOutId({id:c},name));
 let out=h.run(prep.func,{command:cmd('sp',25),req:{},res:{}});
 assert.equal(route(out),prep.outputs-1);assert.deepEqual(out.at(-1).reject.code,503);assert.match(out.at(-1).reject.error,/hazır değil \(bağlanıyor\)/);
 h.flowStore.set('enip-state-e1','offline');
 out=h.run(prep.func,{command:cmd('sp',25)});assert.equal(out.at(-1).reject.code,503);assert.match(out.at(-1).reject.error,/offline/);
 assert.equal(h.flowStore.get('enip-wpend-e1'),undefined,'reddedilen yazma bekleyen kaydi birakmaz');
 h.flowStore.set('enip-state-e1','online');
 out=h.run(prep.func,{command:cmd('sp',25),req:{r:1},res:{s:1},_msgid:'m1'});
 assert.equal(route(out),outIdx('Program:Main.Setpoint'));assert.equal(out[route(out)].payload,200,'(25-5)/0.1');
 const pend=h.flowStore.get('enip-wpend-e1');assert.ok(pend['c-sp-25']);assert.equal(pend['c-sp-25'].mid,'m1');
 out=h.run(prep.func,{command:cmd('run',true)});assert.equal(route(out),outIdx('Calis'));assert.equal(out[route(out)].payload,true);
 out=h.run(prep.func,{command:cmd('cnt',-12345)});assert.equal(route(out),outIdx('Sayac'));assert.equal(out[route(out)].payload,-12345);
 const rej=(c:any)=>{const o=h.run(prep.func,{command:c});return o.at(-1)?.reject;};
 assert.equal(rej(cmd('run',1)).code,400,'bool icin sayi');
 assert.equal(rej(cmd('cnt',1.5)).code,400,'DINT tam sayi');
 assert.match(rej(cmd('cnt',2e6)).error,/sınırlar dışında/);
 assert.match(rej(cmd('sp','10')).error,/sayısal/);
 assert.equal(rej(cmd('sp',10,{expiresAt:Date.now()-1})).code,409);
 assert.equal(rej(cmd('temp',1)).code,400,'salt okunur etiket');
 assert.equal(rej(cmd('nx',5)).code,503,'e2 durumu ayri');
 h.flowStore.set('enip-state-e2','online');
 out=h.run(prep.func,{command:cmd('nx',5)});assert.equal(route(out),outIdx('HatHizi','e2'));
 assert.match(rej(cmd('nx',40000)).error,/sınırlar dışında/);
});

test('yazma sonucu ve hata: complete -> 200 icin dolu payload, bekleyen silinir; catch -> bekleyenler hatayla kapanir',()=>{
 const {write}=nodesFor(sample());
 const h=harness();
 const result=write.nodes.find(n=>n.id===ENIP_WRITE_RESULT_ID).func,fail=write.nodes.find(n=>n.id==='scada-enip-e1-wfail').func;
 h.flowStore.set('enip-wpend-e1',{a:{at:Date.now(),mid:'m1',req:{},res:{},command:{commandId:'a',connectionId:'e1'}},b:{at:Date.now(),mid:'m2',req:{},res:{},command:{commandId:'b',connectionId:'e1'}}});
 const r=h.run(result,{command:{commandId:'a',connectionId:'e1'},payload:200,complete:true});
 assert.deepEqual(r.payload,{written:200});assert.equal(r.error,undefined);assert.equal(r.complete,undefined);
 assert.deepEqual(Object.keys(h.flowStore.get('enip-wpend-e1')),['b']);
 const f=h.run(fail,{error:{message:'Tag not initialized'}});
 assert.equal(f[0].length,1);assert.match(f[0][0].error,/EtherNet\/IP yazma hatası: Tag not initialized/);assert.equal(f[0][0]._msgid,'m2');
 assert.deepEqual(h.flowStore.get('enip-wpend-e1'),{});
});

test('donusum: online iken olay toplanir, tick son degerleri yayar; offline bad; yeniden baglanista guven penceresi',async()=>{
 const {read}=nodesFor(sample());
 const conv=read.find(n=>n.id==='scada-enip-e1-convert').func;
 const h=harness();
 const status=(fill:string)=>h.run(conv,{status:{fill,shape:'dot',text:fill}});
 assert.equal(h.run(conv,{topic:'Sicaklik',payload:21.5}),null,'olay biriktirilir');
 assert.equal(h.run(conv,{topic:'tick'}),null,'online degilken tick yok');
 status('yellow');assert.equal(h.flowStore.get('enip-state-e1'),'connecting');
 status('green');assert.equal(h.flowStore.get('enip-state-e1'),'online');
 h.run(conv,{topic:'Sayac',payload:42});h.run(conv,{topic:'Calis',payload:true});
 await new Promise(r=>setTimeout(r,ENIP_EMIT_MIN_MS+80));
 assert.equal(h.sent.length,1,'toplu tek mesaj');
 const s1=h.sent[0].payload.samples;
 assert.deepEqual(s1.map((s:any)=>[s.tagId,s.value,s.quality]).sort(),[['cnt',42,'good'],['cnt2',42,'good'],['run',true,'good']]);
 const tick=h.run(conv,{topic:'tick'});
 assert.deepEqual(tick.payload.samples.map((s:any)=>s.tagId).sort(),['cnt','cnt2','run'],'online oncesi olay (Sicaklik) bu oturumdan sayilmaz');
 assert.ok(tick.payload.sequence>h.sent[0].payload.sequence);
 assert.ok(h.flowStore.get('fresh-cnt')>0);
 h.run(conv,{topic:'Program:Main.Setpoint',payload:'x'});
 await new Promise(r=>setTimeout(r,ENIP_EMIT_MIN_MS+80));
 assert.deepEqual(h.sent.at(-1).payload.samples.map((s:any)=>[s.tagId,s.quality]),[['sp','bad']],'sayi olmayan deger bad');
 assert.equal(h.run(conv,{topic:'Bilinmeyen',payload:1}),null);
 // Kopma: butun etiketler bad, fresh sifir.
 const off=status('red');
 assert.equal(off.payload.samples.length,5);assert.ok(off.payload.samples.every((s:any)=>s.quality==='bad'&&s.value===null));
 assert.equal(h.flowStore.get('fresh-cnt'),0);
 assert.equal(h.run(conv,{topic:'tick'}),null,'offline tick yok');
 // Yeniden baglanti: guven penceresi dolana kadar yalniz bu oturumda olay gelen etiketler yayinlanir.
 status('green');
 assert.equal(h.run(conv,{topic:'tick'}),null,'henuz okunan yok');
 h.run(conv,{topic:'Calis',payload:false});
 assert.deepEqual(h.run(conv,{topic:'tick'}).payload.samples.map((s:any)=>s.tagId),['run']);
 h.ctxStore.set('since',Date.now()-130000);
 assert.equal(h.run(conv,{topic:'tick'}).payload.samples.length,5,'guven penceresinden sonra hepsi');
 // Online -> online ve connecting -> offline gecisleri tekrar bad uretmez.
 assert.equal(status('green'),null);status('yellow');assert.equal(status('red'),null);
});
