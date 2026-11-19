import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectionSchema,deviceSchema,tagSchema,validateConfig,validateValue,type Config} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {opcUaDriver,opcWriteNodeId,OPCUA_WRITE_DATATYPE,OPCUA_WRITE_PREP_ID,OPCUA_WRITE_RESULT_ID,WRITE_RESULT_ID,MODBUS_WRITE_PREP_ID,type DriverContext} from '../packages/drivers/driver';
import {buildGateway,deployGateway,withoutCredentials} from '../apps/server/src/gateway';
import {CONNECTION_SECRETS_FILE,connectionSecretReader} from '../apps/server/src/connectionSecrets';
import {opcuaUserIdentity} from '../apps/server/src/opcuaBrowse';
/* OPC UA Faz 1: kullanici/parola girisi ve paylasilan kopru uzerinden yazma.
 * Function dugum govdeleri Node-RED'deki gibi (msg, flow, context, node) ile new Function'da calistirilir. */
const PASSWORD='Opc-Zq9-sizmamali!';
function harness(){
 const store=new Map<string,any>();
 const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>{if(v===undefined)store.delete(k);else store.set(k,v);}};
 const sent:any[]=[];const node={send:(m:any)=>sent.push(m)};
 const run=(func:string,msg:any)=>new Function('msg','flow','context','node','setTimeout',func)(msg,flow,flow,node,()=>0);
 return {store,flow,sent,run};
}
const funcOf=(nodes:any[],id:string)=>{const n=nodes.find(x=>x.id===id);assert.ok(n,id+' bulunamali');return n.func as string;};
const base={area:'holding-register',address:0,access:'readwrite',min:-1000,max:1000};
/** Iki OPC UA baglantisi (biri parolali) + seed Modbus baglantisi. */
function opcConfig():Config{
 const c=structuredClone(seedConfig);
 c.connections.push(connectionSchema.parse({id:'opc-a',name:'OPC A',host:'10.0.0.9',port:4840,timeout:3000,protocol:'opc-ua',endpoint:'opc.tcp://10.0.0.9:4840'}));
 c.connections.push(connectionSchema.parse({id:'opc-b',name:'OPC B',host:'10.0.0.10',port:4840,timeout:3000,protocol:'opc-ua',endpoint:'opc.tcp://10.0.0.10:4840',securityMode:'sign-encrypt',securityPolicy:'Basic256Sha256'}));
 c.devices.push(deviceSchema.parse({id:'oda',connectionId:'opc-a',code:'ODA',name:'ODA',slaveId:1,enabled:true,pollMs:1000,staleMs:4000}));
 c.devices.push(deviceSchema.parse({id:'odb',connectionId:'opc-b',code:'ODB',name:'ODB',slaveId:1,enabled:true,pollMs:1000,staleMs:4000}));
 c.tags.push(tagSchema.parse({...base,id:'o-sp',deviceId:'oda',code:'SP',name:'SP',dataType:'float32',scale:0.1,offset:5,nodeId:'ns=2;s=Setpoint'}));
 c.tags.push(tagSchema.parse({...base,id:'o-mod',deviceId:'oda',code:'MOD',name:'MOD',dataType:'int16',nodeId:'ns=2;i=1005'}));
 c.tags.push(tagSchema.parse({...base,id:'o-run',deviceId:'odb',code:'RUN',name:'RUN',dataType:'bool',max:1,nodeId:'i=2258'}));
 c.tags.push(tagSchema.parse({...base,id:'o-ro',deviceId:'odb',code:'RO',name:'RO',dataType:'uint16',access:'read',nodeId:'ns=2;s=Salt'}));
 return c;
}
const secretDir=(secrets:Record<string,unknown>)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-opcw-'));fs.writeFileSync(path.join(dir,CONNECTION_SECRETS_FILE),JSON.stringify(secrets));return dir;};

// --- Kimlik bilgisi yerlesimi ----------------------------------------------------
test('kimlik: parolali baglantida endpoint login:true, parola YALNIZ credentials icinde; anonim baglanti degismez',()=>{
 const dir=secretDir({'opc-b':{username:'operator',password:PASSWORD}});
 const nodes=buildGateway(opcConfig(),'tok',1880,'.',{secret:connectionSecretReader(dir)});
 const auth=nodes.find(n=>n.id==='scada-opcua-opc-b-endpoint-auth');
 assert.ok(auth,'parolali endpoint ayri kimlikle uretilir');
 assert.equal(auth.login,true);assert.equal(auth.none,false);
 assert.deepEqual(auth.credentials,{user:'operator',password:PASSWORD});
 assert.ok(!nodes.some(n=>n.id==='scada-opcua-opc-b-endpoint'),'ayni baglanti icin anonim endpoint kalmaz');
 const anon=nodes.find(n=>n.id==='scada-opcua-opc-a-endpoint');
 assert.equal(anon.login,false);assert.equal(anon.none,true);assert.ok(!('credentials' in anon));
 // Okuma ve yazma istemcileri dogru endpoint'e baglanir.
 assert.equal(nodes.find(n=>n.id==='scada-opcua-opc-b-client').endpoint,auth.id);
 assert.equal(nodes.find(n=>n.id==='scada-opcua-opc-b-wclient').endpoint,auth.id);
 assert.equal(nodes.find(n=>n.id==='scada-opcua-opc-a-wclient').endpoint,anon.id);
 // Parola credentials disinda hicbir alanda yok (kullanici adi da dugum alanlarina yazilmaz).
 const stripped=JSON.stringify(withoutCredentials(nodes));
 assert.ok(!stripped.includes(PASSWORD),'parola credentials disina sizmamali');
 assert.ok(!stripped.includes('operator'),'kullanici adi da yalniz credentials icinde');
 assert.equal(JSON.stringify(nodes).split(PASSWORD).length-1,1,'parola akista tam bir kez (credentials.password)');
});
test('kimlik: kullanici adi bos/bosluksa anonim; yalniz parola giris acmaz; sir okuyucu yoksa anonim',()=>{
 for(const secret of [{username:'  ',password:PASSWORD},{password:PASSWORD}]){
  const nodes=buildGateway(opcConfig(),'tok',1880,'.',{secret:connectionSecretReader(secretDir({'opc-b':secret}))});
  const ep=nodes.find(n=>n.id==='scada-opcua-opc-b-endpoint');
  assert.ok(ep&&ep.login===false&&!('credentials' in ep));
  assert.ok(!JSON.stringify(nodes).includes(PASSWORD));
 }
 const nodes=buildGateway(opcConfig(),'tok',1880,'.');
 assert.ok(nodes.some(n=>n.id==='scada-opcua-opc-b-endpoint'));
});
test('kimlik: eski config username alani yok sayilir (giris acmaz, dugume yazilmaz)',()=>{
 const c=opcConfig();c.connections.find(x=>x.id==='opc-a')!.username='eski-kullanici';
 const nodes=buildGateway(c,'tok',1880,'.');
 assert.equal(nodes.find(n=>n.id==='scada-opcua-opc-a-endpoint').login,false);
 assert.ok(!JSON.stringify(nodes).includes('eski-kullanici'));
});
test('gozatici: createSession kimligi kopru kuraliyla ayni (kullanici adi varsa UserName, yoksa anonim)',()=>{
 const u={UserTokenType:{Anonymous:0,UserName:1}};
 assert.deepEqual(opcuaUserIdentity(u,{username:'operator',password:PASSWORD}),{type:1,userName:'operator',password:PASSWORD});
 assert.deepEqual(opcuaUserIdentity(u,{username:'operator'}),{type:1,userName:'operator',password:''});
 assert.deepEqual(opcuaUserIdentity(u,{password:PASSWORD}),{type:0});
 assert.deepEqual(opcuaUserIdentity(u,undefined),{type:0});
});

// --- Yedek: parola backups/flows-*.json'a dusmez ----------------------------------
test('deployGateway: yedek dosyasinda parola yok; Node-RED e giden govdede yalniz credentials icinde',async()=>{
 const dir=secretDir({'opc-b':{username:'operator',password:PASSWORD}});
 const c=opcConfig();
 // GET /flows normalde kimlik dondurmez; savunma katmanini sinamak icin onceki akisa credentials konur.
 const current={rev:'r1',flows:[{id:'scada-gateway',type:'tab'},{id:'scada-opcua-opc-b-endpoint-auth',type:'OpcUa-Endpoint',credentials:{user:'operator',password:PASSWORD}}]};
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
  await deployGateway(c,'tok',3000,dir,'http://nodered.invalid');
  const backups=fs.readdirSync(path.join(dir,'backups'));
  assert.equal(backups.length,1);
  const backup=fs.readFileSync(path.join(dir,'backups',backups[0]),'utf8');
  assert.ok(!backup.includes(PASSWORD),'yedek parola icermemeli');
  assert.ok(backup.includes('scada-opcua-opc-b-endpoint-auth'),'yedek dugumun kendisini korur');
  const ep=posted.flows.find((n:any)=>n.id==='scada-opcua-opc-b-endpoint-auth');
  assert.equal(ep.credentials.password,PASSWORD,'Node-RED kimligi credentials ile alir');
  const rest=JSON.stringify(posted.flows.map((n:any)=>{const {credentials:_c,...r}=n;return r;}));
  assert.ok(!rest.includes(PASSWORD));
  // Manifest yalniz kimlik listesidir.
  assert.ok(!fs.readFileSync(path.join(dir,'gateway-manifest.json'),'utf8').includes(PASSWORD));
 }finally{
  globalThis.fetch=realFetch;
  if(prevToken===undefined)delete process.env.NODERED_ADMIN_TOKEN;else process.env.NODERED_ADMIN_TOKEN=prevToken;
 }
});

// --- Veri tipi eslemesi ve nodeId -------------------------------------------------
test('veri tipi eslemesi: her etiket tipi bir OPC UA yerlesik tipine gider',()=>{
 const types=(tagSchema.shape.dataType as any).options as string[];
 assert.deepEqual([...types].sort(),Object.keys(OPCUA_WRITE_DATATYPE).sort(),'enum ile esleme ayni kumeyi kapsamali');
 assert.deepEqual(OPCUA_WRITE_DATATYPE,{bool:'Boolean',int16:'Int16',uint16:'UInt16',int32:'Int32',uint32:'UInt32',float32:'Float'});
});
test('opcWriteNodeId: paketin yazdigi ns= bicimine normalize eder, yazilamazi reddeder',()=>{
 assert.equal(opcWriteNodeId(' ns=3;s="DB_Hat"."Sicaklik" '),'ns=3;s="DB_Hat"."Sicaklik"');
 assert.equal(opcWriteNodeId('i=2258'),'ns=0;i=2258');
 assert.equal(opcWriteNodeId('s=Tag'),'ns=0;s=Tag');
 assert.equal(opcWriteNodeId('ns=2;g=09087e75-8e5e-499b-954f-f2a9603db28a'),'ns=2;g=09087e75-8e5e-499b-954f-f2a9603db28a');
 for(const bad of ['','Tag1','nsu=http://x;s=A','ns=2;x=1','ns=2;i=abc','ns=2;s=A;datatype=Float',undefined])assert.equal(opcWriteNodeId(bad as any),null,String(bad));
});

// --- Hazirlik dugumu (dogrulama + konu) --------------------------------------------
function prep(){
 const nodes=buildGateway(opcConfig(),'tok',1880,'.');
 const node=nodes.find(n=>n.id===OPCUA_WRITE_PREP_ID);
 return {nodes,node,func:node.func as string};
}
const cmd=(tagId:string,value:unknown,over:Record<string,unknown>={})=>({tagId,value,commandId:'c-'+tagId+'-'+String(value),expiresAt:Date.now()+3000,revision:1,connectionId:'',...over});
test('hazirlik: gecerli degerler dogru konu/tip/ham degerle dogru baglanti cikisina gider',()=>{
 const {node,func}=prep();
 assert.doesNotThrow(()=>new Function('msg','flow','context','node',func));
 assert.equal(node.outputs,3,'iki OPC UA baglantisi + red');
 assert.deepEqual(node.wires,[['scada-opcua-opc-a-wclient'],['scada-opcua-opc-b-wclient'],[WRITE_RESULT_ID]]);
 const h=harness();h.flow.set('opcua-wstate-opc-a','session active');h.flow.set('opcua-wstate-opc-b','value written');
 const req={headers:{}},res={};
 // float32, olcek 0.1 + offset 5: ham = (25-5)/0.1 = 200
 let out=h.run(func,{_msgid:'m1',req,res,payload:{x:1},command:cmd('o-sp',25)});
 assert.equal(out.findIndex((x:any)=>x),0);
 assert.equal(out[0].topic,'ns=2;s=Setpoint;datatype=Float');
 assert.ok(Math.abs(out[0].payload-200)<1e-9);
 assert.equal(out[0].req,req);assert.equal(out[0].res,res);assert.ok(out[0].command,'command korunur');
 const pend=h.flow.get('opcua-wpend-opc-a');
 assert.equal(pend['c-o-sp-25'].req,req,'bekleyen yazma req/res ile saklanir');
 out=h.run(func,{_msgid:'m2',req,res,command:cmd('o-mod',-12)});
 assert.equal(out[0].topic,'ns=2;i=1005;datatype=Int16');assert.equal(out[0].payload,-12);
 out=h.run(func,{_msgid:'m3',req,res,command:cmd('o-run',true)});
 assert.equal(out.findIndex((x:any)=>x),1,'ikinci baglantinin istemcisine');
 assert.equal(out[1].topic,'ns=0;i=2258;datatype=Boolean');assert.equal(out[1].payload,true);
});
test('hazirlik: tip, sinir, tam sayi, bilinmeyen etiket, sure ve oturum kontrolleri reddeder',()=>{
 const {func}=prep();
 const h=harness();h.flow.set('opcua-wstate-opc-a','session active');h.flow.set('opcua-wstate-opc-b','session active');
 const reject=(command:any)=>{const out=h.run(func,{_msgid:'x',req:{},res:{},command});assert.ok(out[0]===null&&out[1]===null,'red yazma istemcisine gitmez');return out[2].reject;};
 assert.equal(reject(cmd('o-run',1)).code,400,'bool icin sayi');
 assert.equal(reject(cmd('o-mod',true)).code,400,'sayi icin bool');
 assert.equal(reject(cmd('o-mod',NaN)).code,400);
 assert.match(reject(cmd('o-mod',1001)).error,/sınırlar dışında/);
 assert.match(reject(cmd('o-mod',1.5)).error,/tam sayı/);
 assert.equal(reject(cmd('o-ro',1)).code,400,'salt okunur etiket yazma tablosunda yok');
 assert.equal(reject(cmd('__proto__',1)).code,400);
 assert.equal(reject(cmd('o-mod',1,{expiresAt:Date.now()-1})).code,409);
 h.flow.set('opcua-wstate-opc-a','connecting');
 assert.equal(reject(cmd('o-mod',1)).code,503,'oturum kurulmadan kuyruga (gec yazmaya) gitmez');
 h.flow.set('opcua-wstate-opc-a',undefined);
 assert.equal(reject(cmd('o-mod',1)).code,503,'durum hic gelmediyse de hazir degil');
 h.flow.set('opcua-wstate-opc-a','error');
 const out=h.run(func,{_msgid:'y',req:{},res:{},command:cmd('o-mod',1)});
 assert.ok(out[0],'onceki yazma hatasi (oturum acik) sonraki yazmayi kilitlemez');
});
test('hazirlik: int16 ham sinir olcekle birlikte denetlenir',()=>{
 const c=opcConfig();const t=c.tags.find(x=>x.id==='o-mod')!;t.scale=0.001;t.min=-1000;t.max=1000;
 const func=funcOf(buildGateway(c,'tok',1880,'.'),OPCUA_WRITE_PREP_ID);
 const h=harness();h.flow.set('opcua-wstate-opc-a','session active');
 const out=h.run(func,{_msgid:'x',req:{},res:{},command:cmd('o-mod',40)});
 assert.match(out[2].reject.error,/Int16 sınırını aşıyor/,'40/0.001=40000 > 32767');
});

// --- Sonuc donusumu ---------------------------------------------------------------
test('sonuc: Good StatusCode basari; Bad kod ve Error msg.error olur; bekleyen kayit silinir',()=>{
 const nodes=buildGateway(opcConfig(),'tok',1880,'.');
 const func=funcOf(nodes,OPCUA_WRITE_RESULT_ID);
 assert.deepEqual(nodes.find(n=>n.id===OPCUA_WRITE_RESULT_ID).wires,[[WRITE_RESULT_ID]]);
 const h=harness();
 const command={tagId:'o-mod',commandId:'k1',connectionId:'opc-a'};
 h.flow.set('opcua-wpend-opc-a',{k1:{at:Date.now()}});
 // node-opcua ConstantStatusCode: _value + value getter + name/description.
 class SC{constructor(public _value:number,public name:string){}get value(){return this._value;}get description(){return this.name;}}
 let m=h.run(func,{command,payload:new SC(0,'Good')});
 assert.equal(m.error,undefined);assert.deepEqual(m.payload,{statusCode:0});
 assert.deepEqual(h.flow.get('opcua-wpend-opc-a'),{});
 m=h.run(func,{command,payload:{_value:0x803B0000,name:'BadNotWritable'}});
 assert.match(m.error,/BadNotWritable.*0x803B0000/);
 m=h.run(func,{command,payload:0});assert.equal(m.error,undefined,'sayi 0 da Good');
 m=h.run(func,{command,payload:0x80000000});assert.match(m.error,/0x80000000/);
 m=h.run(func,{command,payload:0x40000000});assert.ok(m.error,'Uncertain basari sayilmaz');
 m=h.run(func,{command,payload:Object.assign(new Error('BadSessionIdInvalid'),{})});
 assert.match(m.error,/yazma hatası: BadSessionIdInvalid/);
 m=h.run(func,{command,payload:undefined});assert.match(m.error,/anlaşılamadı/);
});
test('catch: msg siz istemci hatasi bekleyen yazmalari req/res ile hataya kapatir; msg li hata yalniz kendisini',()=>{
 const nodes=buildGateway(opcConfig(),'tok',1880,'.');
 const catchNode=nodes.find(n=>n.id==='scada-opcua-opc-a-wcatch');
 assert.equal(catchNode.type,'catch');assert.deepEqual(catchNode.scope,['scada-opcua-opc-a-wclient']);assert.equal(catchNode.uncaught,false);
 const func=funcOf(nodes,'scada-opcua-opc-a-wfail');
 const h=harness();const req={r:1},res={s:1};
 h.flow.set('opcua-wpend-opc-a',{k1:{at:1,mid:'m1',req,res,command:{commandId:'k1'}},k2:{at:2,mid:'m2',req,res,command:{commandId:'k2'}}});
 const out=h.run(func,{error:{message:'Invalid endpoint'}});
 assert.equal(out[0].length,2);
 assert.equal(out[0][0].req,req);assert.equal(out[0][0].res,res);assert.match(out[0][0].error,/Invalid endpoint/);
 assert.deepEqual(h.flow.get('opcua-wpend-opc-a'),{});
 h.flow.set('opcua-wpend-opc-a',{k3:{},k4:{}});
 const one=h.run(func,{command:{commandId:'k3'},error:{message:'x'}});
 assert.match(one.error,/x/);assert.deepEqual(Object.keys(h.flow.get('opcua-wpend-opc-a')),['k4']);
 // Durum izleyici yazma oturumunun durumunu saklar.
 const st=funcOf(nodes,'scada-opcua-opc-a-wstate');
 h.run(st,{error:null,status:'session active'});
 assert.equal(h.flow.get('opcua-wstate-opc-a'),'session active');
});

// --- Paylasilan kopru uzerinden uctan uca (function zinciri) ----------------------
test('kopru: OPC UA etiketi bekci -> hazirlik -> (istemci) -> sonuc -> paylasilan sonuc 200 ack; Modbus dali ayni kalir',()=>{
 const nodes=buildGateway(opcConfig(),'tok',1880,'.');
 const ids=new Set(nodes.map(n=>n.id));
 assert.equal(ids.size,nodes.length,'kimlikler tekil');
 for(const n of nodes)for(const w of n.wires||[])for(const t of w)assert.ok(ids.has(t),n.id+' -> '+t);
 const guard=nodes.find(n=>n.id==='scada-write-guard');
 assert.deepEqual(guard.wires,[[MODBUS_WRITE_PREP_ID],[OPCUA_WRITE_PREP_ID],[OPCUA_WRITE_PREP_ID],['scada-http-response']]);
 const h=harness();
 h.flow.set('fresh-o-sp',Date.now());h.flow.set('opcua-wstate-opc-a','session active');
 const req={headers:{'x-scada-token':'tok'}},res={};
 const g=h.run(guard.func,{_msgid:'m',req,res,payload:{tagId:'o-sp',value:25,commandId:'cmd-x',expiresAt:Date.now()+3000,revision:1}});
 const routed=g[1];assert.ok(routed,'OPC A baglantisinin cikisi');assert.equal(routed.command.connectionId,'opc-a');
 const p=h.run(funcOf(nodes,OPCUA_WRITE_PREP_ID),routed);
 const toClient=p[0];
 // Paket write_action_input ayni msg nesnesine payload=StatusCode koyup 1. cikistan yollar.
 toClient.payload={_value:0,value:0,name:'Good'};
 const converted=h.run(funcOf(nodes,OPCUA_WRITE_RESULT_ID),toClient);
 const final=h.run(funcOf(nodes,WRITE_RESULT_ID),converted);
 assert.equal(final.statusCode,200);assert.equal(final.payload.ack,true);assert.equal(final.req,req);assert.equal(final.res,res);
 // Gec gelen ikinci cevap (catch) ikinci HTTP yaniti uretmez.
 assert.equal(h.run(funcOf(nodes,WRITE_RESULT_ID),{...converted,payload:{}}),null);
});
test('kopru: yazilabilir OPC UA etiketi yoksa OPC UA yazma dugumu uretilmez',()=>{
 const c=opcConfig();for(const t of c.tags)if(t.id.startsWith('o-'))t.access='read';
 const nodes=buildGateway(c,'tok',1880,'.');
 assert.ok(!nodes.some(n=>n.id===OPCUA_WRITE_PREP_ID||String(n.id).endsWith('-wclient')));
 const branch=opcUaDriver.buildWriteNodes!([],[],[],{token:'t',revision:1} as DriverContext);
 assert.deepEqual(branch,{nodes:[],entries:{}});
});

// --- Yapilandirma ve komut kurallari ------------------------------------------------
const commandOf=(id:string,tagId:string,feedback:string)=>({id,name:id,tagIds:[tagId],feedbackTagIds:[feedback],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''});
test('validateConfig: OPC UA readwrite hedef + ayni tipte geri bildirim komutu gecer; tip uyusmazligi ve salt okunur hedef reddedilir',()=>{
 const c=opcConfig();
 c.commands.push(commandOf('k-sp','o-sp','o-sp'));
 c.tags.push(tagSchema.parse({...base,id:'o-mod-fb',deviceId:'oda',code:'MODFB',name:'MODFB',dataType:'int16',access:'read',nodeId:'ns=2;i=1006'}));
 c.commands.push(commandOf('k-mod','o-mod','o-mod-fb'));
 assert.doesNotThrow(()=>validateConfig(c));
 const bad=opcConfig();bad.commands.push(commandOf('k','o-mod','o-sp'));
 assert.throws(()=>validateConfig(bad),/Geri bildirim tipi uyumsuz/);
 const ro=opcConfig();ro.commands.push(commandOf('k','o-ro','o-ro'));
 assert.throws(()=>validateConfig(ro),/yazılabilir etiketi bulunamadı/);
});
test('validateConfig: OPC UA yazilabilir sayisal etikette alt sinir < ust sinir; salt okunurda aranmaz',()=>{
 const c=opcConfig();const t=c.tags.find(x=>x.id==='o-mod')!;t.min=10;t.max=10;
 assert.throws(()=>validateConfig(c),/Alt sınır/);
 t.access='read';assert.doesNotThrow(()=>validateConfig(c));
});
test('validateValue: OPC UA etiketinde sinir ve tip kontrolu sunucuda da calisir',()=>{
 const c=validateConfig(opcConfig());
 assert.doesNotThrow(()=>validateValue(c,['o-sp'],25));
 assert.throws(()=>validateValue(c,['o-sp'],5000),/sınırlar dışında/);
 assert.throws(()=>validateValue(c,['o-run'],1),/true\/false/);
 assert.throws(()=>validateValue(c,['o-ro'],1),/yazılabilir değil/);
});
