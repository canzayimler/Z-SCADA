import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {connectionSchema,deviceSchema,tagSchema,validateConfig,protocolLabels,isSymbolicProtocol,isReadOnlyProtocol,symbolicAddressField,symbolicAddressOf,addressFormatOf,connectionAddress,
 BACNET_OBJECT_TYPES,BACNET_PROPERTIES,BACNET_STATUS_FLAGS,BACNET_INSTANCE_MAX,parseBacnetObject,bacnetRaw,bacnetFault,bacnetCodecSource,mqttCoerce,isUnicastIpv4,bacnetValueKind,type Config} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {bacnetDriver,bacnetClientId,driverFor,assertDriversDeployable,BACNET_MAX_OBJECTS} from '../packages/drivers/driver';
import {buildGateway} from '../apps/server/src/gateway';
/* BACnet/IP surucusu: nesne/ozellik eslemesi (kutuphane enum paritesi), dogrulama (nesne numarasi 0..4194302, tekil IPv4,
 * salt okuma gerekcesi), dugum uretimi (yerel baglama basina tek istemci, parcalama, status-flags), gomulu kodek paritesi,
 * donusum dugumu ve yerel Node-RED paketinin (node-red-zscada-bacnet) okuma dugumu (sahte istemciyle). */
const require=createRequire(import.meta.url);
const lib=require('@innovation-system/node-bacnet');

const conn=(extra:object={})=>connectionSchema.parse({id:'bn1',name:'AHU kontrol',protocol:'bacnet',host:'198.51.100.40',port:47808,timeout:2000,bacnetDeviceInstance:1201,...extra});
const device=(extra:object={})=>deviceSchema.parse({id:'bd1',connectionId:'bn1',code:'AHU-1',name:'Klima santrali',slaveId:1,enabled:true,pollMs:2000,staleMs:8000,...extra});
const tag=(id:string,bacnetObjectType:string,bacnetInstance:number,dataType:string,extra:object={})=>tagSchema.parse({id,deviceId:'bd1',code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'read',min:-1e12,max:1e12,bacnetObjectType,bacnetInstance,...extra});
const base=():Config=>{const c:any=structuredClone(seedConfig);c.connections.push(conn());c.devices.push(device());return c;};
const ctx={token:'tok',revision:3,hostname:'ZS-A'};

test('BACnet protokolu: etiket, sembolik alan, salt okuma, adres metni, surucu secimi',()=>{
 assert.equal(protocolLabels.bacnet,'BACnet/IP');
 assert.equal(isSymbolicProtocol('bacnet'),true);assert.equal(isReadOnlyProtocol('bacnet'),true);
 assert.equal(symbolicAddressField('bacnet'),'bacnetObjectType');
 assert.equal(symbolicAddressOf({bacnetObjectType:'analog-value',bacnetInstance:12},{protocol:'bacnet'}),'AV 12');
 assert.equal(symbolicAddressOf({bacnetObjectType:'binary-input',bacnetInstance:3,bacnetProperty:'out-of-service'},{protocol:'bacnet'}),'BI 3 · out-of-service');
 assert.equal(symbolicAddressOf({},{protocol:'bacnet'}),undefined);
 assert.equal(addressFormatOf(base(),'bd1'),'bacnet');
 assert.equal(connectionAddress(conn()),'198.51.100.40:47808 · cihaz 1201');
 assert.equal(driverFor(conn()).id,'bacnet');
 assert.equal(bacnetDriver.writeLimits.allowWrite,false);assert.equal(bacnetDriver.buildWriteNodes,undefined);
});

test('nesne tipi ve ozellik numaralari kutuphane enumlariyla ayni (ASHRAE 135)',()=>{
 const up=(s:string)=>s.toUpperCase().replace(/-/g,'_');
 for(const [k,v] of Object.entries(BACNET_OBJECT_TYPES))assert.equal(lib.ObjectType[up(k)],v,k);
 for(const [k,v] of Object.entries(BACNET_PROPERTIES))assert.equal(lib.PropertyIdentifier[up(k)],v,k);
 assert.equal(lib.PropertyIdentifier.STATUS_FLAGS,BACNET_STATUS_FLAGS);
 assert.equal(BACNET_INSTANCE_MAX,4194302);
 assert.equal(lib.ApplicationTag.REAL,4);assert.equal(lib.ApplicationTag.ENUMERATED,9);assert.equal(lib.ApplicationTag.BIT_STRING,8);assert.equal(lib.ApplicationTag.ERROR,105);
});

test('parseBacnetObject: kisa/uzun ad, ayraclar; gecersiz tip ve numara reddedilir',()=>{
 assert.deepEqual(parseBacnetObject('AV12'),{objectType:'analog-value',instance:12});
 assert.deepEqual(parseBacnetObject(' bi:3 '),{objectType:'binary-input',instance:3});
 assert.deepEqual(parseBacnetObject('analog-input 5'),{objectType:'analog-input',instance:5});
 assert.deepEqual(parseBacnetObject('multi_state_value,7'),{objectType:'multi-state-value',instance:7});
 assert.deepEqual(parseBacnetObject('MSV 4194302'),{objectType:'multi-state-value',instance:4194302});
 assert.deepEqual(parseBacnetObject('MO0'),{objectType:'multi-state-output',instance:0});
 assert.throws(()=>parseBacnetObject('AV 4194303'),/0-4194302/);
 assert.throws(()=>parseBacnetObject('device 1201'),/desteklenmiyor/);
 assert.throws(()=>parseBacnetObject('LSP3'),/desteklenmiyor/);
 for(const bad of ['','AV','12','AV 1.5','AV 12345678','AV:-1'])assert.throws(()=>parseBacnetObject(bad),/BACnet/,bad);
});

test('bacnetRaw + bacnetFault + mqttCoerce: uygulama etiketleri, hata girdisi, status-flags fault biti',()=>{
 assert.equal(bacnetRaw({t:4,v:21.5}),21.5);
 assert.equal(bacnetRaw({t:5,v:-3.25}),-3.25);
 assert.equal(bacnetRaw({t:2,v:3}),3);
 assert.equal(bacnetRaw({t:3,v:-7}),-7);
 assert.equal(mqttCoerce(bacnetRaw({t:9,v:1}),'bool'),true,'binary PV ENUMERATED active');
 assert.equal(mqttCoerce(bacnetRaw({t:9,v:0}),'bool'),false);
 assert.equal(mqttCoerce(bacnetRaw({t:9,v:2}),'bool'),null,'2 dijital degil');
 assert.equal(bacnetRaw({t:1,v:true}),true);
 assert.equal(mqttCoerce(bacnetRaw({t:7,v:'23.5'}),'float32'),23.5);
 for(const e of [{e:'1:31'},{t:0,v:null},{t:8,v:{bitsUsed:4,value:[0]}},{t:12,v:{type:0,instance:1}},{t:4,v:NaN},{t:4,v:'1'},null,undefined,'x',{t:105,v:{errorClass:1}}])
  assert.equal(bacnetRaw(e),undefined,JSON.stringify(e));
 assert.equal(mqttCoerce(bacnetRaw({t:4,v:70000}),'int16'),null,'tip araligi disi bad');
 assert.equal(bacnetFault({t:8,v:{bitsUsed:4,value:[2]}}),true,'fault');
 assert.equal(bacnetFault({t:8,v:{bitsUsed:4,value:[1]}}),false,'yalniz in-alarm');
 assert.equal(bacnetFault({t:8,v:{bitsUsed:4,value:[8]}}),false,'yalniz out-of-service');
 assert.equal(bacnetFault({t:8,v:{bitsUsed:4,value:[15]}}),true);
 for(const e of [undefined,{e:'2:32'},{t:9,v:2},{t:8,v:{}}])assert.equal(bacnetFault(e),false);
});

test('gomulu BACnet kodegi (bacnetCodecSource) kanonik fonksiyonlarla ayni davranir',()=>{
 const emb=(new Function(bacnetCodecSource()+'\nreturn {bacnetRaw,bacnetFault,mqttCoerce};'))() as any;
 const entries=[{t:4,v:1.5},{t:9,v:1},{t:9,v:0},{t:2,v:65536},{t:1,v:false},{t:7,v:'x'},{e:'1:31'},{t:8,v:{value:[2]}},null];
 for(const e of entries){
  assert.deepEqual(emb.bacnetRaw(e),bacnetRaw(e));assert.equal(emb.bacnetFault(e),bacnetFault(e));
  for(const dt of ['bool','int16','uint16','int32','uint32','float32'])assert.equal(emb.mqttCoerce(emb.bacnetRaw(e),dt),mqttCoerce(bacnetRaw(e),dt),JSON.stringify(e)+' '+dt);
 }
});

test('isUnicastIpv4: yayin, cok noktaya, 0.x ve makine adi tekil degil',()=>{
 for(const ok of ['198.51.100.40','192.0.2.255','203.0.113.1','127.0.0.1'])assert.equal(isUnicastIpv4(ok),true,ok);
 for(const bad of ['255.255.255.255','224.0.0.1','239.1.2.3','0.0.0.0','0.1.2.3','10.0.0.256','bms.local','10.0.0','::1',''])assert.equal(isUnicastIpv4(bad),false,bad);
 assert.equal(isUnicastIpv4('127.0.0.1',false),false);
});

test('validateConfig: BACnet baglantisi tekil IPv4 + cihaz numarasi ister; etiket nesne numarasi 0..4194302',()=>{
 const ok=base();ok.tags.push(tag('t-av','analog-value',0,'float32'),tag('t-max','analog-input',4194302,'float32'),tag('t-bv','binary-value',1,'bool'),tag('t-mv','multi-state-value',2,'uint16'),
  tag('t-oos','analog-value',3,'bool',{bacnetProperty:'out-of-service'}),tag('t-hl','analog-input',4,'float32',{bacnetProperty:'high-limit'}));
 assert.doesNotThrow(()=>validateConfig(ok));
 const withConn=(extra:object)=>{const c=base();c.connections[c.connections.length-1]=conn(extra);c.tags.push(tag('t1','analog-value',1,'float32'));return c;};
 assert.throws(()=>validateConfig(withConn({host:'255.255.255.255'})),/tekil bir IPv4/);
 assert.doesNotThrow(()=>validateConfig(withConn({host:'198.51.100.255'})),'.255 /23 aginda gecerli bir cihaz olabilir');
 assert.throws(()=>validateConfig(withConn({host:'bms-sunucu'})),/tekil bir IPv4/);
 assert.throws(()=>validateConfig(withConn({host:'239.255.0.1'})),/tekil bir IPv4/);
 assert.throws(()=>validateConfig(withConn({bacnetDeviceInstance:undefined})),/device instance/);
 assert.throws(()=>connectionSchema.parse({...conn(),bacnetDeviceInstance:4194303}));
 assert.doesNotThrow(()=>validateConfig(withConn({bacnetDeviceInstance:4194302,bacnetLocalPort:47810,bacnetLocalAddress:'198.51.100.5'})));
 assert.throws(()=>validateConfig(withConn({bacnetLocalAddress:'255.255.255.255'})),/yerel arayüz/);
 const t=(...x:Parameters<typeof tag>)=>{const c=base();c.tags.push(tag(...x));return c;};
 assert.throws(()=>tagSchema.parse({...tag('t1','analog-value',1,'float32'),bacnetInstance:4194303}));
 assert.throws(()=>tagSchema.parse({...tag('t1','analog-value',1,'float32'),bacnetInstance:-1}));
 assert.throws(()=>tagSchema.parse({...tag('t1','analog-value',1,'float32'),bacnetObjectType:'device'}));
 assert.throws(()=>validateConfig(t('t1','binary-input',1,'float32')),/dijitaldir; veri tipi bool/);
 assert.throws(()=>validateConfig(t('t1','analog-input',1,'bool')),/sayısaldır/);
 assert.throws(()=>validateConfig(t('t1','multi-state-input',1,'bool')),/sayısaldır/);
 const noType=base();noType.tags.push(tagSchema.parse({...tag('t1','analog-value',1,'float32'),bacnetObjectType:undefined}));
 assert.throws(()=>validateConfig(noType),/nesne tipi gerekli/);
 assert.equal(bacnetValueKind('binary-output','relinquish-default'),'bool');
 assert.equal(bacnetValueKind('multi-state-output','relinquish-default'),'number');
});

test('BACnet oku/yaz etiketi Turkce gerekceyle reddedilir (oncelik dizisi kapsam disi)',()=>{
 const rw=base();rw.tags.push(tag('t1','analog-value',1,'float32',{access:'readwrite',min:0,max:100}));
 assert.throws(()=>validateConfig(rw),/yalnız okunur.*öncelik dizisi \(priority-array 1-16\).*Salt okuma/);
 assert.throws(()=>bacnetDriver.validate(conn(),[tag('t1','binary-value',1,'bool',{access:'readwrite',min:0,max:1})]),/priority-array/);
});

test('dugum uretimi: yerel baglama basina tek istemci, tekil hedef, cihaz basina zamanlayici, status-flags yalniz PV',()=>{
 const c=base();
 c.connections.push(conn({id:'bn2',name:'Kazan',host:'198.51.100.41',timeout:4000}));
 c.connections.push(conn({id:'bn3',name:'Chiller',host:'198.51.100.42',bacnetLocalPort:47810}));
 c.devices.push(device({id:'bd2',connectionId:'bn2',code:'KZN'}),device({id:'bd3',connectionId:'bn3',code:'CHL',pollMs:1000,staleMs:5000}));
 c.tags.push(tag('pv','analog-value',1,'float32',{scale:2,offset:1}),tag('hl','analog-value',1,'float32',{bacnetProperty:'high-limit'}),tag('bv','binary-value',5,'bool'),
  tag('k1','analog-input',9,'float32',{deviceId:'bd2'}),tag('h1','multi-state-value',1,'uint16',{deviceId:'bd3'}));
 const cfg=validateConfig(c);
 const conns=cfg.connections.filter(x=>x.protocol==='bacnet');
 const nodes=bacnetDriver.buildNodes(conns,cfg.devices,cfg.tags,ctx);
 const clients=nodes.filter(n=>n.type==='zscada-bacnet-client');
 assert.equal(clients.length,2,'47809 paylasilir, 47810 ayri');
 const shared=clients.find(n=>n.localPort===47809)!;
 assert.equal(shared.id,bacnetClientId(conns[0]));assert.equal(shared.id,bacnetClientId(conns[1]));
 assert.equal(shared.iface,'0.0.0.0');assert.equal(shared.apduTimeout,4000,'paylasan baglantilarin en buyugu');
 const reads=nodes.filter(n=>n.type==='zscada-bacnet-read');
 assert.deepEqual(reads.map(r=>[r.id,r.address,r.port,r.client]),[['scada-bacnet-bn1-read','198.51.100.40',47808,shared.id],['scada-bacnet-bn2-read','198.51.100.41',47808,shared.id],
  ['scada-bacnet-bn3-read','198.51.100.42',47808,clients.find(n=>n.localPort===47810)!.id]]);
 const clock=nodes.find(n=>n.id==='scada-bacnet-bn1-clock-bd1');
 assert.equal(clock.repeat,'2');
 assert.deepEqual(JSON.parse(clock.payload),[{type:2,instance:1,props:[85,111,45]},{type:5,instance:5,props:[85,111]}]);
 assert.deepEqual(JSON.parse(nodes.find(n=>n.id==='scada-bacnet-bn3-clock-bd3').payload),[{type:19,instance:1,props:[85,111]}]);
 const ids=nodes.map(n=>n.id);assert.equal(new Set(ids).size,ids.length,'kimlikler tekil');
 for(const n of nodes)assert.equal(n.z,'scada-gateway');
 assert.ok(nodes.filter(n=>n.type==='function').every(n=>{new Function('msg','flow','context','node','env',n.func);return true;}));
 assert.ok(!JSON.stringify(nodes).match(/whoIs|255\.255\.255\.255/i),'yayin/Who-Is yok');
 // Gateway: yazma koprusu yok, eslesmeyen dugum yok.
 const flow=buildGateway(cfg,'tok',4731,os.tmpdir());
 assert.ok(!flow.some((n:any)=>n.id==='scada-write-guard'&&JSON.stringify(n.func).includes('scada-bacnet')));
 assert.ok(flow.some((n:any)=>n.type==='zscada-bacnet-read'));
});

function fnHarness(){
 const store=new Map<string,any>(),ctxStore=new Map<string,any>();
 const mk=(m:Map<string,any>)=>({get:(k:string)=>m.get(k),set:(k:string,v:unknown)=>{if(v===undefined)m.delete(k);else m.set(k,v);}});
 const flow=mk(store),context=mk(ctxStore);const statuses:any[]=[];const node={status:(s:any)=>statuses.push(s),send:()=>{}};
 const run=(func:string,msg:any)=>new Function('msg','flow','context','node','env',func)(msg,flow,context,node,{get:()=>undefined});
 return {store,run,statuses};
}
test('hazirlik dugumu: parcalar, tur bitmeden yenisini yollamaz; donusum: kalite, fault, hata, sira',()=>{
 const c=base();
 const list:any[]=[];for(let i=0;i<40;i++){list.push(tag('a'+i,'analog-value',i,'float32',{scale:i===0?2:1,offset:i===0?1:0}));}
 list.push(tag('bv','binary-value',1,'bool'),tag('mv','multi-state-value',1,'uint16'),tag('oos','analog-value',0,'bool',{bacnetProperty:'out-of-service'}));
 c.tags.push(...list);const cfg=validateConfig(c);
 const conns=cfg.connections.filter(x=>x.protocol==='bacnet');
 const nodes=bacnetDriver.buildNodes(conns,cfg.devices,cfg.tags,ctx);
 const prep=nodes.find(n=>n.id==='scada-bacnet-bn1-prep').func,conv=nodes.find(n=>n.id==='scada-bacnet-bn1-convert').func;
 const objs=JSON.parse(nodes.find(n=>n.id==='scada-bacnet-bn1-clock-bd1').payload);
 assert.equal(objs.length,42);
 const h=fnHarness();
 const out=h.run(prep,{topic:'bd1',payload:objs});
 assert.equal(out[0].length,Math.ceil(42/BACNET_MAX_OBJECTS));
 assert.deepEqual(out[0].map((m:any)=>m.bacnetObjects.length),[16,16,10]);
 assert.equal(h.run(prep,{topic:'bd1',payload:objs}),null,'onceki tur bitmedi');
 // Ilk parca: basarili (a0 olcekli, a1 fault, a2 ozellik hatasi), ikinci: istek hatasi, ucuncu: bool/multi-state.
 const ok=out[0][0];ok.payload=ok.bacnetObjects.map((o:any)=>({type:o.type,instance:o.instance,props:o.instance===2?{85:{e:'1:31'},111:{e:'1:31'}}:
  {85:{t:4,v:10+o.instance},81:{t:1,v:true},111:{t:8,v:{bitsUsed:4,value:[o.instance===1?2:0]}}}}));
 const r1=h.run(conv,ok);
 const s=(r:any,id:string)=>r.payload.samples.find((x:any)=>x.tagId===id);
 assert.deepEqual([s(r1,'a0').value,s(r1,'a0').quality],[21,'good'],'olcek: 10*2+1');
 assert.deepEqual([s(r1,'oos').value,s(r1,'oos').quality],[true,'good'],'out-of-service fault kontrolune girmez');
 assert.deepEqual([s(r1,'a1').value,s(r1,'a1').quality],[null,'bad'],'status-flags fault');
 assert.deepEqual([s(r1,'a2').value,s(r1,'a2').quality],[null,'bad'],'unknown-object');
 assert.equal(s(r1,'a3').value,13);
 assert.equal(h.store.get('fresh-a0')>0,true);assert.equal(h.store.get('fresh-a1'),0);
 const err=out[0][1];err.error='BACnet okuma hatası: ERR_TIMEOUT';err.payload=null;
 const r2=h.run(conv,err);
 assert.equal(r2.payload.samples.length,16);assert.ok(r2.payload.samples.every((x:any)=>x.quality==='bad'&&x.value===null));
 assert.ok(r2.payload.sequence>r1.payload.sequence&&r2.payload.session===r1.payload.session);
 assert.equal(h.statuses.at(-1).fill,'red');
 const last=out[0][2];last.payload=last.bacnetObjects.map((o:any)=>({type:o.type,instance:o.instance,props:o.type===5?{85:{t:9,v:1},111:{t:8,v:{value:[0]}}}:o.type===19?{85:{t:2,v:3},111:{t:8,v:{value:[0]}}}:{85:{t:4,v:1},111:{t:8,v:{value:[0]}}}}));
 const r3=h.run(conv,last);
 assert.deepEqual([s(r3,'bv').value,s(r3,'mv').value],[true,3]);
 assert.equal(h.store.get('bacnet-busy-bn1-bd1'),null,'tur bitti');
 assert.ok(h.run(prep,{topic:'bd1',payload:objs}),'yeni tur');
 // Bilinmeyen cihaz / eksik alanlar sessizce atlanir.
 assert.equal(h.run(conv,{bacnetDevice:'yok',payload:[]}),null);
});

test('assertDriversDeployable: yerel BACnet paketi yoksa Turkce hata',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bacnet-pkg-')),cwd=process.cwd();
 const c=base();c.tags.push(tag('t1','analog-value',1,'float32'));const cfg=validateConfig(c);
 assert.doesNotThrow(()=>assertDriversDeployable(cfg.connections,cfg.devices,cfg.tags,'.'));
 try{
  process.chdir(dir);
  assert.throws(()=>assertDriversDeployable(cfg.connections,cfg.devices,cfg.tags,dir,dir),/node-red-zscada-bacnet kurulu değil.*npm ci/);
 }finally{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});}
});

// --- Yerel Node-RED paketi (node-red-zscada-bacnet) ---------------------------------------
function loadPackage(clientNode:any){
 const types:Record<string,any>={};
 const RED={nodes:{createNode:(n:any,cfg:any)=>{Object.setPrototypeOf(n,Object.assign(Object.create(EventEmitter.prototype),{}));EventEmitter.call(n);n.id=cfg.id;n.logs=[];n.errors=[];n.statuses=[];
   n.log=(m:string)=>n.logs.push(m);n.error=(m:string)=>n.errors.push(m);n.status=(s:any)=>n.statuses.push(s);},
  registerType:(name:string,ctor:any)=>{types[name]=ctor;},getNode:()=>clientNode}};
 const mod=require('../packages/node-red-zscada-bacnet/bacnet.js');mod(RED);
 const make=(cfg:any)=>{const n:any={};types['zscada-bacnet-read'].call(n,{id:'r1',...cfg});return n;};
 const input=(n:any,msg:any)=>new Promise<any>(resolve=>n.emit('input',msg,(m:any)=>resolve(m),()=>{}));
 return {types,make,input};
}
test('node-red-zscada-bacnet paketi: Node-RED kaydi, tekil hedef, siralama, normalize, hata ciktisi',async()=>{
 const pkg=JSON.parse(fs.readFileSync(new URL('../packages/node-red-zscada-bacnet/package.json',import.meta.url),'utf8'));
 assert.deepEqual(pkg['node-red'].nodes,{'zscada-bacnet':'bacnet.js'});
 assert.equal(pkg.dependencies,undefined,'kutuphane kok package.json bagimliligindan cozulur');
 const root=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(root.dependencies['node-red-zscada-bacnet'],'file:packages/node-red-zscada-bacnet');
 assert.equal(root.dependencies['@innovation-system/node-bacnet'],'2.1.3');
 const calls:any[]=[];let inflight=0,maxInflight=0;
 const fake={ready:true,apduTimeout:300,client:{readPropertyMultiple:(target:string,req:any,opts:any,cb:any)=>{calls.push({target,req});inflight++;maxInflight=Math.max(maxInflight,inflight);
  setTimeout(()=>{inflight--;if(req[0].objectId.instance===7)return cb(new Error('ERR_TIMEOUT'));
   cb(null,{values:req.map((r:any)=>({objectId:r.objectId,values:[{id:85,index:4294967295,value:[{type:4,value:1.5}]},{id:111,index:4294967295,value:[{type:105,value:{errorClass:2,errorCode:32}}]}]}))});},20);}}};
 const {types,make,input}=loadPackage(fake);
 assert.ok(types['zscada-bacnet-client']&&types['zscada-bacnet-read']);
 const bad=make({client:'c',address:'255.255.255.255',port:47808});
 assert.match(bad.errors[0],/tekil bir IPv4/);
 const rb=await input(bad,{bacnetObjects:[{type:2,instance:1,props:[85]}]});
 assert.match(rb.error,/geçersiz hedef/);assert.equal(calls.length,0,'yayin adresine hic istek gitmedi');
 const n=make({client:'c',address:'127.0.0.1',port:47999});
 assert.match(n.logs[0],/BACnet hedef: 127\.0\.0\.1:47999/);
 const [a,b,e]=await Promise.all([input(n,{topic:'x',bacnetObjects:[{type:2,instance:1,props:[85,111]}]}),input(n,{bacnetObjects:[{type:0,instance:3,props:[85]}]}),input(n,{bacnetObjects:[{type:2,instance:7,props:[85]}]})]);
 assert.equal(maxInflight,1,'istekler sirayla');
 assert.deepEqual(calls.map(c=>c.target),['127.0.0.1:47999','127.0.0.1:47999','127.0.0.1:47999']);
 assert.deepEqual(calls[0].req,[{objectId:{type:2,instance:1},properties:[{id:85},{id:111}]}]);
 assert.equal(a.topic,'x','msg ozellikleri korunur');
 assert.deepEqual(a.payload,[{type:2,instance:1,props:{85:{t:4,v:1.5},111:{e:'2:32'}}}]);
 assert.equal(a.error,undefined);
 assert.equal(b.payload[0].instance,3);
 assert.match(e.error,/ERR_TIMEOUT/);assert.equal(e.payload,null);
 for(const bad of [undefined,[],[{type:2,instance:4194303,props:[85]}],[{type:2,instance:1,props:[]}],[{type:'x',instance:1,props:[85]}],Array(65).fill({type:2,instance:1,props:[85]})]){
  const r=await input(n,{bacnetObjects:bad});assert.match(r.error,/geçersiz nesne listesi/);
 }
 assert.equal(calls.length,3);
 fake.ready=false;
 const nr=await input(n,{bacnetObjects:[{type:2,instance:1,props:[85]}]});
 assert.match(nr.error,/istemci hazır değil/);
 fake.ready=true;
 // Geri cagri hic gelmezse bekci kilidi acar.
 const hang={ready:true,apduTimeout:10,client:{readPropertyMultiple:()=>{}}};
 const hp=loadPackage(hang),h=hp.make({client:'c',address:'10.1.1.1',port:47808});
 const t0=Date.now();const hr=await hp.input(h,{bacnetObjects:[{type:2,instance:1,props:[85]}]});
 assert.match(hr.error,/bekçi/);assert.ok(Date.now()-t0<4000);
});
