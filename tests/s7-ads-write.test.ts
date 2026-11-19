import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectionSchema,deviceSchema,tagSchema,validateConfig,validateValue,s7WriteType,type Config} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {s7Driver,adsDriver,ADS_WRITE_DATATYPE,S7_WRITE_PREP_ID,S7_WRITE_RESULT_ID,ADS_WRITE_PREP_ID,ADS_WRITE_RESULT_ID,WRITE_RESULT_ID,MODBUS_WRITE_PREP_ID,type DriverContext} from '../packages/drivers/driver';
import {buildGateway} from '../apps/server/src/gateway';
/* S7 ve ADS yazma: paylasilan koprunun S7 ('s7 out' + complete/catch) ve ADS
 * ('ads-client-write-value' + catch) dallari. Function govdeleri Node-RED'deki
 * gibi (msg, flow, context, node) ile new Function'da calistirilir. */
function harness(){
 const store=new Map<string,any>();
 const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>{if(v===undefined)store.delete(k);else store.set(k,v);}};
 const node={send:()=>{}};
 const run=(func:string,msg:any)=>new Function('msg','flow','context','node',func)(msg,flow,flow,node);
 return {store,flow,run};
}
const funcOf=(nodes:any[],id:string)=>{const n=nodes.find(x=>x.id===id);assert.ok(n,id+' bulunamadi');return n.func as string;};
const tag=(id:string,deviceId:string,extra:Record<string,unknown>)=>tagSchema.parse({id,deviceId,code:id.toUpperCase(),name:id,area:'holding-register',address:0,access:'readwrite',min:-1000,max:1000,...extra});
/** Iki S7 (s1, s2) + bir ADS (a1) baglantisi ve seed Modbus. */
function config():Config{
 const c=structuredClone(seedConfig);
 c.connections.push(connectionSchema.parse({id:'s1',name:'S7 A',protocol:'s7',host:'10.0.0.20',port:102,rack:0,slot:1,timeout:2000}));
 c.connections.push(connectionSchema.parse({id:'s2',name:'S7 B',protocol:'s7',host:'10.0.0.21',port:102,rack:0,slot:1,timeout:2000}));
 c.connections.push(connectionSchema.parse({id:'a1',name:'ADS A',protocol:'ads',host:'10.0.0.30',port:48898,timeout:2000,amsNetId:'10.0.0.30.1.1'}));
 for(const [id,conn] of [['sd1','s1'],['sd2','s2'],['ad1','a1']])c.devices.push(deviceSchema.parse({id,connectionId:conn,code:id.toUpperCase(),name:id,slaveId:1,enabled:true,pollMs:1000,staleMs:4000}));
 c.tags.push(
  tag('s-sp','sd1',{dataType:'float32',s7Address:'DB1,REAL4',scale:0.1,offset:5}),
  tag('s-int','sd1',{dataType:'int16',s7Address:'DB1,INT8'}),
  tag('s-byte','sd1',{dataType:'uint16',s7Address:'MB3',min:0,max:1000}),
  tag('s-bit','sd2',{dataType:'bool',s7Address:'M0.1',min:0,max:1}),
  tag('s-ro','sd2',{dataType:'uint16',s7Address:'MW10',access:'read',min:0,max:100}),
  tag('a-sp','ad1',{dataType:'float32',adsSymbol:'GVL.fSetpoint'}),
  tag('a-dint','ad1',{dataType:'int32',adsSymbol:'MAIN.nSayac',scale:0.5,min:-1e6,max:1e6}),
  tag('a-run','ad1',{dataType:'bool',adsSymbol:'MAIN.bCalis',min:0,max:1}),
 );
 return validateConfig(c);
}
const cmd=(tagId:string,value:unknown,over:Record<string,unknown>={})=>({tagId,value,commandId:'c-'+tagId+'-'+String(value),expiresAt:Date.now()+3000,revision:1,connectionId:'',...over});

// --- Tip eslemesi --------------------------------------------------------------------
test('s7WriteType: adres turu PLC tipini ve tam sayi araligini belirler (BYTE okumada uint16 ama 0-255)',()=>{
 assert.deepEqual(s7WriteType('DB1,X0.0'),{type:'BOOL',range:null});
 assert.deepEqual(s7WriteType('MB3'),{type:'BYTE',range:[0,255]});
 assert.deepEqual(s7WriteType('DB2,BYTE8'),{type:'BYTE',range:[0,255]});
 assert.deepEqual(s7WriteType('DB1,INT2'),{type:'INT',range:[-32768,32767]});
 assert.deepEqual(s7WriteType('MI10'),{type:'INT',range:[-32768,32767]});
 assert.deepEqual(s7WriteType('DB1,DINT4'),{type:'DINT',range:[-2147483648,2147483647]});
 assert.deepEqual(s7WriteType('MDI20'),{type:'DINT',range:[-2147483648,2147483647]});
 assert.deepEqual(s7WriteType('QW4'),{type:'WORD',range:[0,65535]});
 assert.deepEqual(s7WriteType('DB1,DWORD10'),{type:'DWORD',range:[0,4294967295]});
 assert.deepEqual(s7WriteType('MD20'),{type:'DWORD',range:[0,4294967295]});
 assert.deepEqual(s7WriteType('DB1,REAL14'),{type:'REAL',range:null});
 assert.deepEqual(s7WriteType('MR24'),{type:'REAL',range:null});
});
test('ADS tip eslemesi: her etiket tipi bir TwinCAT tipine gider',()=>{
 const types=(tagSchema.shape.dataType as any).options as string[];
 assert.deepEqual([...types].sort(),Object.keys(ADS_WRITE_DATATYPE).sort());
 assert.deepEqual(ADS_WRITE_DATATYPE,{bool:'BOOL',int16:'INT',uint16:'UINT',int32:'DINT',uint32:'UDINT',float32:'REAL'});
});

// --- Dugum uretimi ---------------------------------------------------------------------
test('S7 buildWriteNodes: hazirlik + baglanti basina s7 out (ayni endpoint, degisken msg den) + complete/catch kapsamli',()=>{
 const nodes=buildGateway(config(),'tok',1880,'.');
 const prep=nodes.find(n=>n.id===S7_WRITE_PREP_ID);
 assert.equal(prep.outputs,3,'iki S7 baglantisi + red');
 assert.deepEqual(prep.wires,[['scada-s7-s1-out'],['scada-s7-s2-out'],[WRITE_RESULT_ID]]);
 assert.doesNotThrow(()=>new Function('msg','flow','context','node',prep.func));
 for(const id of ['s1','s2']){
  const out=nodes.find(n=>n.id==='scada-s7-'+id+'-out');
  assert.equal(out.type,'s7 out');assert.equal(out.endpoint,'scada-s7-'+id+'-endpoint');assert.equal(out.variable,'');
  assert.ok(nodes.some(n=>n.id===out.endpoint&&n.type==='s7 endpoint'),'endpoint okuma dalinda var');
  const done=nodes.find(n=>n.id==='scada-s7-'+id+'-wdone');
  assert.equal(done.type,'complete');assert.deepEqual(done.scope,[out.id]);assert.deepEqual(done.wires,[[S7_WRITE_RESULT_ID]]);
  const c=nodes.find(n=>n.id==='scada-s7-'+id+'-wcatch');
  assert.equal(c.type,'catch');assert.deepEqual(c.scope,[out.id]);assert.equal(c.uncaught,false);assert.deepEqual(c.wires,[['scada-s7-'+id+'-wfail']]);
  assert.deepEqual(nodes.find(n=>n.id==='scada-s7-'+id+'-wfail').wires,[[WRITE_RESULT_ID]]);
 }
 assert.deepEqual(nodes.find(n=>n.id===S7_WRITE_RESULT_ID).wires,[[WRITE_RESULT_ID]]);
 // Yazilabilir etiketin degiskeni endpoint tablosunda (s7 out bilinmeyen degiskeni reddeder).
 const ep=nodes.find(n=>n.id==='scada-s7-s1-endpoint');
 assert.ok(ep.vartable.some((v:any)=>v.name==='s-sp'&&v.addr==='DB1,REAL4'));
});
test('ADS buildWriteNodes: hazirlik + ads-client-write-value (yol bos, ayni baglanti) + kapsamli catch',()=>{
 const nodes=buildGateway(config(),'tok',1880,'.');
 const prep=nodes.find(n=>n.id===ADS_WRITE_PREP_ID);
 assert.equal(prep.outputs,2);
 assert.deepEqual(prep.wires,[['scada-ads-a1-write'],[WRITE_RESULT_ID]]);
 const w=nodes.find(n=>n.id==='scada-ads-a1-write');
 assert.equal(w.type,'ads-client-write-value');assert.equal(w.connection,'scada-ads-a1-connection');assert.equal(w.path,'');assert.equal(w.autoFill,false);
 assert.deepEqual(w.wires,[[ADS_WRITE_RESULT_ID]]);
 assert.ok(nodes.some(n=>n.id===w.connection&&n.type==='ads-client-connection'));
 const c=nodes.find(n=>n.id==='scada-ads-a1-wcatch');
 assert.equal(c.type,'catch');assert.deepEqual(c.scope,[w.id]);assert.deepEqual(c.wires,[['scada-ads-a1-wfail']]);
 assert.deepEqual(nodes.find(n=>n.id===ADS_WRITE_RESULT_ID).wires,[[WRITE_RESULT_ID]]);
});
test('bekci: S7/ADS etiketleri kendi baglantisinin dalina; kimlikler tekil, butun teller var olan dugume',()=>{
 const nodes=buildGateway(config(),'tok',1880,'.');
 const ids=new Set(nodes.map(n=>n.id));
 assert.equal(ids.size,nodes.length);
 for(const n of nodes)for(const w of n.wires||[])for(const t of w)assert.ok(ids.has(t),n.id+' -> '+t);
 const guard=nodes.find(n=>n.id==='scada-write-guard');
 assert.deepEqual(guard.wires,[[MODBUS_WRITE_PREP_ID],[S7_WRITE_PREP_ID],[S7_WRITE_PREP_ID],[ADS_WRITE_PREP_ID],['scada-http-response']]);
 assert.match(guard.func,/"s-sp":\{"o":1,"c":"s1"/);
 assert.match(guard.func,/"s-bit":\{"o":2,"c":"s2"/);
 assert.match(guard.func,/"a-sp":\{"o":3,"c":"a1"/);
 assert.ok(!/"s-ro"/.test(guard.func),'salt okunur etiket bekcide yok');
});
test('yazilabilir S7/ADS etiketi yoksa dal uretilmez; devre disi cihazin etiketi yazilamaz',()=>{
 const c=config();for(const t of c.tags)if(t.id.startsWith('s-')||t.id.startsWith('a-'))t.access='read';
 const nodes=buildGateway(c,'tok',1880,'.');
 assert.ok(!nodes.some(n=>n.id===S7_WRITE_PREP_ID||n.id===ADS_WRITE_PREP_ID||n.type==='s7 out'||n.type==='ads-client-write-value'));
 assert.deepEqual(s7Driver.buildWriteNodes!([],[],[],{token:'t',revision:1} as DriverContext),{nodes:[],entries:{}});
 assert.deepEqual(adsDriver.buildWriteNodes!([],[],[],{token:'t',revision:1} as DriverContext),{nodes:[],entries:{}});
 const off=config();off.devices.find(d=>d.id==='sd2')!.enabled=false;
 const prep=buildGateway(off,'tok',1880,'.').find(n=>n.id===S7_WRITE_PREP_ID);
 assert.deepEqual(prep.wires,[['scada-s7-s1-out'],[WRITE_RESULT_ID]]);
});

// --- Hazirlik ------------------------------------------------------------------------
test('S7 hazirlik: olcek geri alinir, degisken = etiket kimligi, req/res/command korunur, bekleyen saklanir',()=>{
 const nodes=buildGateway(config(),'tok',1880,'.');const func=funcOf(nodes,S7_WRITE_PREP_ID);
 const h=harness();const req={headers:{}},res={};
 // REAL, olcek 0.1 + ofset 5: ham=(25-5)/0.1=200
 let out=h.run(func,{_msgid:'m1',req,res,topic:'eski',command:cmd('s-sp',25)});
 assert.equal(out.findIndex((x:any)=>x),0);
 assert.equal(out[0].variable,'s-sp');assert.ok(Math.abs(out[0].payload-200)<1e-9);
 assert.equal(out[0].req,req);assert.equal(out[0].res,res);assert.ok(out[0].command);
 assert.equal(h.flow.get('s7-wpend-s1')['c-s-sp-25'].res,res);
 out=h.run(func,{_msgid:'m2',req,res,command:cmd('s-int',-12)});
 assert.equal(out[0].variable,'s-int');assert.equal(out[0].payload,-12);
 out=h.run(func,{_msgid:'m3',req,res,command:cmd('s-bit',true)});
 assert.equal(out.findIndex((x:any)=>x),1,'ikinci S7 baglantisi');assert.equal(out[1].payload,true);
 assert.ok(h.flow.get('s7-wpend-s2')['c-s-bit-true']);
});
test('S7 hazirlik: tip, sinir, tam sayi, BYTE araligi, bilinmeyen/salt okunur etiket ve sure reddedilir',()=>{
 const func=funcOf(buildGateway(config(),'tok',1880,'.'),S7_WRITE_PREP_ID);
 const h=harness();
 const reject=(command:any)=>{const out=h.run(func,{_msgid:'x',req:{},res:{},command});assert.ok(out[0]===null&&out[1]===null,'red yazma dugumune gitmez');return out[2].reject;};
 assert.equal(reject(cmd('s-bit',1)).code,400,'bool icin sayi');
 assert.equal(reject(cmd('s-int',true)).code,400,'sayi icin bool');
 assert.equal(reject(cmd('s-int','5')).code,400,'metin');
 assert.equal(reject(cmd('s-int',Infinity)).code,400);
 assert.match(reject(cmd('s-int',1001)).error,/sınırlar dışında/);
 assert.match(reject(cmd('s-int',1.5)).error,/tam sayı/);
 assert.match(reject(cmd('s-byte',256)).error,/BYTE sınırını aşıyor/,'etiket sinir 1000 ama PLC BYTE 0-255');
 assert.equal(h.run(func,{_msgid:'y',req:{},res:{},command:cmd('s-byte',255)})[0].payload,255);
 assert.equal(reject(cmd('s-ro',1)).code,400,'salt okunur etiket tabloda yok');
 assert.equal(reject(cmd('__proto__',1)).code,400);
 assert.equal(reject(cmd('s-int',1,{expiresAt:Date.now()-1})).code,409);
 assert.equal(reject(undefined).code,400);
});
test('S7 hazirlik: DINT/REAL ham sinir olcekle birlikte denetlenir',()=>{
 const c=config();c.tags.push(tag('s-di','sd1',{dataType:'int32',s7Address:'DB1,DINT12',scale:1e-6,min:-1e4,max:1e4}));
 const func=funcOf(buildGateway(validateConfig(c),'tok',1880,'.'),S7_WRITE_PREP_ID);
 const h=harness();
 const out=h.run(func,{_msgid:'x',req:{},res:{},command:cmd('s-di',3000)});
 assert.match(out[2].reject.error,/DINT sınırını aşıyor/,'3000/1e-6=3e9 > 2^31-1');
});
test('ADS hazirlik: konu = sembol, olcek geri alinir; INT/DINT araligi ve tam sayi denetlenir',()=>{
 const func=funcOf(buildGateway(config(),'tok',1880,'.'),ADS_WRITE_PREP_ID);
 const h=harness();const req={},res={};
 let out=h.run(func,{_msgid:'m',req,res,variable:'eski',command:cmd('a-dint',10)});
 assert.equal(out[0].topic,'MAIN.nSayac');assert.equal(out[0].payload,20,'10/0.5');assert.equal(out[0].req,req);
 assert.ok(h.flow.get('ads-wpend-a1')['c-a-dint-10']);
 out=h.run(func,{_msgid:'m',req,res,command:cmd('a-sp',12.5)});
 assert.equal(out[0].topic,'GVL.fSetpoint');assert.equal(out[0].payload,12.5);
 out=h.run(func,{_msgid:'m',req,res,command:cmd('a-run',false)});
 assert.equal(out[0].topic,'MAIN.bCalis');assert.equal(out[0].payload,false);
 assert.match(h.run(func,{_msgid:'m',req,res,command:cmd('a-dint',0.25)})[1].reject.error,/tam sayı/,'0.25/0.5=0.5');
 assert.equal(h.run(func,{_msgid:'m',req,res,command:cmd('a-run','true')})[1].reject.code,400);
 assert.match(h.run(func,{_msgid:'m',req,res,command:cmd('a-sp',-1001)})[1].reject.error,/sınırlar dışında/);
});

// --- Sonuc / hata --------------------------------------------------------------------
test('S7 sonuc (complete): bekleyen silinir, dolu payload ile paylasilan sonuc 200 verir; false/0 yazmak da basari',()=>{
 const nodes=buildGateway(config(),'tok',1880,'.');
 const func=funcOf(nodes,S7_WRITE_RESULT_ID),shared=funcOf(nodes,WRITE_RESULT_ID);
 const h=harness();
 for(const written of [false,0,42.5]){
  const commandId='k'+String(written);
  h.flow.set('s7-wpend-s1',{[commandId]:{at:Date.now()}});h.flow.set('reply-'+commandId,Date.now());
  const req={},res={};
  // complete dugumu cloneMessage(msg) + msg.complete verir: payload yazilan ham deger.
  const m=h.run(func,{_msgid:'m',req,res,command:{tagId:'s-sp',commandId,connectionId:'s1'},variable:'s-sp',payload:written,complete:{source:{id:'scada-s7-s1-out'}}});
  assert.deepEqual(m.payload,{written});assert.equal(m.complete,undefined);
  assert.deepEqual(h.flow.get('s7-wpend-s1'),{});
  const final=shared&&h.run(shared,m);
  assert.equal(final.statusCode,200);assert.equal(final.payload.ack,true);assert.equal(final.req,req);assert.equal(final.res,res);
 }
});
test('ADS sonuc: paketin basari msg si (payload=yazilan, dataType, symbol) 200 olur',()=>{
 const nodes=buildGateway(config(),'tok',1880,'.');
 const h=harness();h.flow.set('ads-wpend-a1',{k1:{at:1}});h.flow.set('reply-k1',1);
 const m=h.run(funcOf(nodes,ADS_WRITE_RESULT_ID),{command:{commandId:'k1',connectionId:'a1'},topic:'GVL.fSetpoint',payload:12.5,dataType:{type:'REAL'},rawValue:Buffer.alloc(4),symbol:{name:'GVL.fSetpoint'}});
 assert.deepEqual(m.payload,{written:12.5});
 assert.deepEqual(h.flow.get('ads-wpend-a1'),{});
 assert.equal(h.run(funcOf(nodes,WRITE_RESULT_ID),m).statusCode,200);
});
for(const [label,catchId,failId,pk,source] of [
 ['S7','scada-s7-s1-wcatch','scada-s7-s1-wfail','s7-wpend-s1','scada-s7-s1-out'],
 ['ADS','scada-ads-a1-wcatch','scada-ads-a1-wfail','ads-wpend-a1','scada-ads-a1-write'],
] as const){
 test(label+' catch: msg li hata yalniz kendisini 502 ile kapatir; msg siz hata baglantinin bekleyenlerini req/res ile kapatir',()=>{
  const nodes=buildGateway(config(),'tok',1880,'.');
  assert.deepEqual(nodes.find(n=>n.id===catchId).scope,[source]);
  const func=funcOf(nodes,failId),shared=funcOf(nodes,WRITE_RESULT_ID);
  const h=harness();const req={r:1},res={s:1};
  h.flow.set(pk,{k1:{at:1,mid:'m1',req,res,command:{commandId:'k1'}},k2:{at:2,mid:'m2',req,res,command:{commandId:'k2'}}});
  h.flow.set('reply-k1',1);
  // done(err): catch msg = cloneMessage(msg) + error {message, source}
  const one=h.run(func,{req,res,command:{commandId:'k1'},error:{message:'Not connected',source:{id:source}}});
  assert.match(one.error,new RegExp(label+' yazma hatası: Not connected'));
  assert.deepEqual(Object.keys(h.flow.get(pk)),['k2']);
  const final=h.run(shared,one);
  assert.equal(final.statusCode,502);assert.match(final.payload.error,/Not connected/);assert.equal(final.res,res);
  const all=h.run(func,{error:{message:'Variable unknown'}});
  assert.equal(all[0].length,1);assert.equal(all[0][0].req,req);assert.equal(all[0][0].res,res);assert.match(all[0][0].error,/Variable unknown/);
  assert.deepEqual(h.flow.get(pk),{});
 });
}

// --- Uctan uca function zinciri (bekci -> hazirlik -> [paket] -> sonuc) ----------------
test('kopru: S7 ve ADS etiketi bekci -> hazirlik -> sonuc -> paylasilan sonuc 200; gec gelen hata ikinci yanit uretmez',()=>{
 const nodes=buildGateway(config(),'tok',1880,'.');
 const guard=nodes.find(n=>n.id==='scada-write-guard');
 for(const [tagId,value,outIdx,prepId,resultId,failId] of [
  ['s-int',7,1,S7_WRITE_PREP_ID,S7_WRITE_RESULT_ID,'scada-s7-s1-wfail'],
  ['a-sp',3.5,3,ADS_WRITE_PREP_ID,ADS_WRITE_RESULT_ID,'scada-ads-a1-wfail'],
 ] as const){
  const h=harness();h.flow.set('fresh-'+tagId,Date.now());
  const req={headers:{'x-scada-token':'tok'}},res={};
  const g=h.run(guard.func,{_msgid:'m',req,res,payload:{tagId,value,commandId:'cmd-'+tagId,expiresAt:Date.now()+3000,revision:config().revision}});
  const routed=g[outIdx];assert.ok(routed,tagId+' kendi dalina');
  const p=h.run(funcOf(nodes,prepId),routed);
  const toDevice=p.find((x:any)=>x);assert.ok(toDevice&&!toDevice.reject);
  const converted=h.run(funcOf(nodes,resultId),{...toDevice});
  const final=h.run(funcOf(nodes,WRITE_RESULT_ID),converted);
  assert.equal(final.statusCode,200);assert.equal(final.req,req);assert.equal(final.res,res);
  const late=h.run(funcOf(nodes,failId),{...toDevice,error:{message:'late'}});
  assert.equal(h.run(funcOf(nodes,WRITE_RESULT_ID),late),null);
 }
});
test('validateValue: S7/ADS yazilabilir etikette sinir ve tip kontrolu sunucuda da calisir',()=>{
 const c=config();
 assert.doesNotThrow(()=>validateValue(c,['s-sp'],25));
 assert.throws(()=>validateValue(c,['s-sp'],5000),/sınırlar dışında/);
 assert.throws(()=>validateValue(c,['a-run'],1),/true\/false/);
 assert.throws(()=>validateValue(c,['s-ro'],1),/yazılabilir değil/);
});
