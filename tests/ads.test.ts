import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectionSchema,deviceSchema,tagSchema,parseAmsNetId,parseAdsSymbol,validateConfig,protocolLabels} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {adsDriver,assertDriversDeployable,driverFor,ADS_MIN_CYCLE_MS,ADS_LOCAL_PORT} from '../packages/drivers/driver';
/* Beckhoff ADS surucusu (salt okuma): AMS Net ID ve sembol ayristiricilari, yapilandirma dogrulamasi,
 * Node-RED dugum uretimi ve gomulu donusum fonksiyonunun calisma davranisi. */

test('parseAmsNetId: alti bayt normallestirilir, gecersiz girdi Turkce hatayla reddedilir',()=>{
 assert.equal(parseAmsNetId('192.0.002.5.1.1'),'192.0.2.5.1.1');
 assert.equal(parseAmsNetId(' 10.0.0.1.1.1 '),'10.0.0.1.1.1');
 assert.equal(parseAmsNetId('0.0.0.0.0.0'),'0.0.0.0.0.0');
 assert.equal(parseAmsNetId('255.255.255.255.255.255'),'255.255.255.255.255.255');
 for(const bad of ['','192.0.2.5','192.0.2.5.1','192.0.2.5.1.1.1','192.0.2.256.1.1','192.0.2.-1.1.1','192.0.2.a.1.1','192.0..5.1.1','1234.1.1.1.1.1','192.0.2.5.1.1.'])
  assert.throws(()=>parseAmsNetId(bad),/AMS Net ID anlaşılamadı/,JSON.stringify(bad));
});
test('parseAdsSymbol: nokta yollu semboller ve dizi elemanlari kabul edilir',()=>{
 for(const ok of ['GVL.fSicaklik','MAIN.st.bX','GVL.aDeger[3]','MAIN.stMotor.bCalisiyor','_G.x1','GVL.a[1].b[2]'])
  assert.equal(parseAdsSymbol(ok),ok);
 assert.equal(parseAdsSymbol('  GVL.fSicaklik  '),'GVL.fSicaklik','kenar bosluklari kirpilir');
});
test('parseAdsSymbol: nokta yok, bosluk, tirnak, bos veya rakamla baslayan semboller reddedilir',()=>{
 for(const bad of ['','   ','fSicaklik','GVL.','.fSicaklik','GVL. fSicaklik','GVL.f Sicaklik','"GVL.fSicaklik"',"GVL.'x'",'1GVL.x','GVL.1x','GVL.a[]','GVL.a[x]','GVL..x'])
  assert.throws(()=>parseAdsSymbol(bad),/ADS sembolü anlaşılamadı/,JSON.stringify(bad));
 assert.throws(()=>parseAdsSymbol('GVL.'+'a'.repeat(200)),/200 karakteri/);
});

const conn=(extra:object={})=>connectionSchema.parse({id:'a1',name:'PLC ADS',protocol:'ads',host:'203.0.113.30',port:48898,timeout:2000,amsNetId:'192.0.2.30.1.1',...extra});
const device=(extra:object={})=>deviceSchema.parse({id:'ad1',connectionId:'a1',code:'ADS-1',name:'ADS hat',slaveId:1,enabled:true,pollMs:1000,staleMs:4000,...extra});
const tag=(id:string,adsSymbol:string|undefined,dataType:string,extra:object={})=>tagSchema.parse({id,deviceId:'ad1',code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'read',min:-1e9,max:1e9,adsSymbol,...extra});

test('ADS baglantisi surucu secicide ADS surucusune gider, yazmaya izin verir ve etiket',()=>{
 assert.equal(driverFor(conn()).id,'ads');
 assert.equal(adsDriver.id,'ads');
 assert.equal(adsDriver.supports(conn()),true);
 assert.equal(adsDriver.supports(conn({protocol:'s7'})),false);
 assert.equal(protocolLabels.ads,'Beckhoff ADS');
 assert.equal(adsDriver.writeLimits.allowWrite,true);
});
test('validateConfig: ADS baglantisi host, port ve gecerli AMS Net ID ister',()=>{
 const base=(c:object)=>{const x:any=structuredClone(seedConfig);x.connections.push(conn(c));x.devices.push(device());x.tags.push(tag('t1','GVL.fSicaklik','float32'));return x;};
 assert.doesNotThrow(()=>validateConfig(base({})));
 assert.doesNotThrow(()=>validateConfig(base({localAmsNetId:'192.0.2.10.1.1'})));
 assert.throws(()=>validateConfig(base({amsNetId:undefined})),/AMS Net ID'si gerekli/);
 assert.throws(()=>validateConfig(base({amsNetId:'  '})),/AMS Net ID'si gerekli/);
 assert.throws(()=>validateConfig(base({amsNetId:'192.0.2.30'})),/AMS Net ID anlaşılamadı/);
 assert.throws(()=>validateConfig(base({localAmsNetId:'1.2.3'})),/AMS Net ID anlaşılamadı/);
});
test('validateConfig: ADS etiketi sembol ister, yazmaya izin verir, Modbus alan kurallari uygulanmaz',()=>{
 const base=()=>{const c:any=structuredClone(seedConfig);c.connections.push(conn());c.devices.push(device());return c;};
 const ok=base();
 // Ayni adres/alan Modbus'ta cakisirdi; ADS'te adresle ilgisi yok. bool + holding-register de Modbus'ta uyumsuzdu.
 ok.tags.push(tag('t1','GVL.fSicaklik','float32'),tag('t2','MAIN.st.bX','bool',{min:0,max:1}),tag('t3','GVL.aDeger[3]','int16'));
 assert.doesNotThrow(()=>validateConfig(ok));
 const missing=base();missing.tags.push(tag('t1',undefined,'float32'));
 assert.throws(()=>validateConfig(missing),/ADS etiketi için sembol gerekli/);
 const blank=base();blank.tags.push(tag('t1','  ','float32'));
 assert.throws(()=>validateConfig(blank),/ADS etiketi için sembol gerekli/);
 const bad=base();bad.tags.push(tag('t1','fSicaklik','float32'));
 assert.throws(()=>validateConfig(bad),/ADS sembolü anlaşılamadı/);
 const write=base();write.tags.push(tag('t1','GVL.fSicaklik','float32',{access:'readwrite'}),tag('t2','MAIN.bX','bool',{access:'readwrite',min:0,max:1}));
 assert.doesNotThrow(()=>validateConfig(write));
 const tol=base();tol.tags.push(tag('t1','MAIN.bX','bool',{access:'readwrite',verifyTolerance:1}));
 assert.throws(()=>validateConfig(tol),/doğrulama toleransı/);
 const range=base();range.tags.push(tag('t1','GVL.fSicaklik','float32',{min:10,max:10}));
 assert.throws(()=>validateConfig(range),/Alt sınır üst sınırdan küçük olmalı/);
 const boolRange=base();boolRange.tags.push(tag('t1','MAIN.bX','bool',{min:0,max:0}));
 assert.doesNotThrow(()=>validateConfig(boolRange),'bool etikette min<max aranmaz');
});
test('adsDriver.validate: eksik/gecersiz AMS Net ID ve eksik/gecersiz sembol reddedilir, readwrite gecer',()=>{
 const good=[tag('t1','GVL.fSicaklik','float32')];
 assert.doesNotThrow(()=>adsDriver.validate(conn(),good));
 assert.throws(()=>adsDriver.validate(conn({amsNetId:undefined}),good),/AMS Net ID gerekli/);
 assert.throws(()=>adsDriver.validate(conn({amsNetId:'  '}),good),/AMS Net ID gerekli/);
 assert.throws(()=>adsDriver.validate(conn({amsNetId:'1.2.3.4.5.999'}),good),/AMS Net ID anlaşılamadı/);
 assert.throws(()=>adsDriver.validate(conn(),[tag('t1',undefined,'float32')]),/sembol gerekli/);
 assert.throws(()=>adsDriver.validate(conn(),[tag('t1','yok nokta','float32')]),/ADS sembolü anlaşılamadı/);
 assert.doesNotThrow(()=>adsDriver.validate(conn(),[tag('t1','GVL.x','float32',{access:'readwrite'})]));
 assert.throws(()=>adsDriver.validate(conn(),[tag('t1','GVL.x','float32',{access:'readwrite',min:5,max:5})]),/alt sınır/);
});
test('adsDriver.buildNodes: baglanti dugumu (normalize AMS Net ID, router, port varsayilani) + abonelik + change + donusum',()=>{
 const tags=[tag('t1','GVL.fSicaklik','float32'),tag('t2','MAIN.st.bX','bool')];
 const nodes=adsDriver.buildNodes([conn({amsNetId:'192.0.002.30.1.1'})],[device({pollMs:500}),device({id:'ad2',code:'ADS-2',slaveId:2,pollMs:2000})],tags,{token:'tok',revision:7});
 const connection=nodes.filter(n=>n.type==='ads-client-connection');
 assert.equal(connection.length,1);
 const c=connection[0];
 assert.equal(c.id,'scada-ads-a1-connection');
 assert.equal(c.targetAmsNetId,'192.0.2.30.1.1');
 assert.equal(c.targetAdsPort,851,'adsPort tanimsizsa TC3 ilk runtime');
 assert.equal(c.routerAddress,'203.0.113.30');
 assert.equal(c.routerTcpPort,'48898');
 assert.equal(c.localAmsNetId,undefined,'yerel AMS Net ID yoksa yerel TwinCAT router kullanilir');
 assert.equal(c.localAdsPort,undefined);

 const subs=nodes.filter(n=>n.type==='ads-client-subscribe-value');
 assert.equal(subs.length,2);
 const s1=subs.find(n=>n.path==='GVL.fSicaklik');
 assert.equal(s1.mode,'cyclic','onchange degil: degismeyen deger bayat sayilirdi');
 assert.equal(s1.cycleTime,'500');
 assert.equal(s1.connection,c.id);
 const changes=nodes.filter(n=>n.type==='change');
 assert.equal(changes.length,2);
 const change1=changes.find(n=>n.id===s1.wires[0][0]);
 assert.ok(change1,'abonelik change dugumune bagli');
 assert.deepEqual(change1.rules,[{t:'set',p:'tagId',pt:'msg',to:'t1',tot:'str'}]);
 const fn=nodes.filter(n=>n.type==='function');
 assert.equal(fn.length,1);
 assert.equal(fn[0].id,'scada-ads-a1-convert');
 assert.deepEqual(change1.wires,[[fn[0].id]]);
 assert.deepEqual(fn[0].wires,[['scada-ws-out']]);
 assert.ok(!nodes.some(n=>/write/.test(n.type)),'okuma dalinda yazma dugumu yok (yazma buildWriteNodes ile)');
});
test('adsDriver.buildNodes: cevrim suresi cihazin taramasi, en az 100 ms',()=>{
 const tags=[tag('t1','GVL.a','float32'),tag('t2','GVL.b','float32',{deviceId:'ad2'}),tag('t3','GVL.c','float32',{deviceId:'ad3'})];
 // Sema pollMs>=500 ister; kelepce savunmasi semayi atlayan (elle kurulmus) cihazla denenir.
 const devices=[{...device(),pollMs:20},device({id:'ad2',code:'ADS-2',slaveId:2,pollMs:2500}),{...device({id:'ad3',code:'ADS-3',slaveId:3}),pollMs:100}];
 const nodes=adsDriver.buildNodes([conn()],devices,tags,{token:'tok',revision:1});
 const cycle=(p:string)=>nodes.find(n=>n.type==='ads-client-subscribe-value'&&n.path===p).cycleTime;
 assert.equal(ADS_MIN_CYCLE_MS,100);
 assert.equal(cycle('GVL.a'),'100');
 assert.equal(cycle('GVL.b'),'2500');
 assert.equal(cycle('GVL.c'),'100');
});
test('adsDriver.buildNodes: yerel AMS Net ID verilirse dogrudan baglanti alanlari eklenir',()=>{
 const nodes=adsDriver.buildNodes([conn({localAmsNetId:'192.0.002.10.1.1',adsPort:801})],[device()],[tag('t1','GVL.a','float32')],{token:'tok',revision:1});
 const c=nodes.find(n=>n.type==='ads-client-connection');
 assert.equal(c.localAmsNetId,'192.0.2.10.1.1');
 assert.equal(c.localAdsPort,String(ADS_LOCAL_PORT));
 assert.equal(c.localAdsPort,'32750');
 assert.equal(c.targetAdsPort,801);
 const blank=adsDriver.buildNodes([conn({localAmsNetId:'  '})],[device()],[tag('t1','GVL.a','float32')],{token:'tok',revision:1}).find(n=>n.type==='ads-client-connection');
 assert.equal(blank.localAmsNetId,undefined);
 assert.equal(blank.localAdsPort,undefined);
});
test('adsDriver.buildNodes: devre disi cihaz ve etiketsiz baglanti atlanir, her baglanti kendi dugumlerini alir',()=>{
 assert.deepEqual(adsDriver.buildNodes([conn()],[device({enabled:false})],[tag('t1','GVL.a','float32')],{token:'tok',revision:1}),[]);
 assert.deepEqual(adsDriver.buildNodes([conn()],[device()],[],{token:'tok',revision:1}),[]);
 const two=adsDriver.buildNodes([conn(),conn({id:'a2',name:'PLC 2'})],[device(),device({id:'ad2',connectionId:'a2',code:'ADS-2'})],[tag('t1','GVL.a','float32'),tag('t2','GVL.b','float32',{deviceId:'ad2'})],{token:'tok',revision:1});
 assert.deepEqual(two.filter(n=>n.type==='ads-client-connection').map(n=>n.id),['scada-ads-a1-connection','scada-ads-a2-connection']);
 assert.deepEqual(two.filter(n=>n.type==='function').map(n=>n.id),['scada-ads-a1-convert','scada-ads-a2-convert']);
 const onlyA2=adsDriver.buildNodes([conn(),conn({id:'a2',name:'PLC 2'})],[device(),device({id:'ad2',connectionId:'a2',code:'ADS-2'})],[tag('t2','GVL.b','float32',{deviceId:'ad2'})],{token:'tok',revision:1});
 assert.deepEqual(onlyA2.filter(n=>n.type==='ads-client-connection').map(n=>n.id),['scada-ads-a2-connection'],'etiketsiz baglanti dugum uretmez');
});

const build=(tags:any[],ctx={token:'tok',revision:3})=>{
 const nodes=adsDriver.buildNodes([conn()],[device()],tags,ctx);
 const ctxMap=new Map<string,any>(),context={get:(k:string)=>ctxMap.get(k),set:(k:string,v:any)=>{ctxMap.set(k,v);}};
  const fnc=new Function('msg','flow','context',nodes.find(n=>n.type==='function').func) as (msg:any,flow:any,context:any)=>any;const convert=(msg:any,flow:any)=>fnc(msg,flow,context);
 const store=new Map<string,unknown>();const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>store.set(k,v)};
 return {convert,store,flow};
};
test('ADS donusum fonksiyonu: bool true good, sayi scale/offset uygular',()=>{
 const {convert,store,flow}=build([tag('t1','GVL.fSicaklik','float32',{scale:2,offset:1}),tag('t2','MAIN.st.bX','bool',{min:0,max:1}),tag('t3','GVL.n','int16')]);
 const num=convert({tagId:'t1',payload:12.5},flow);
 assert.equal(num.payload.token,'tok');
 assert.equal(num.payload.revision,3);
 assert.equal(num.payload.source,'scada-ads-a1');
 assert.equal(num.payload.samples.length,1);
 assert.equal(num.payload.samples[0].tagId,'t1');
 assert.equal(num.payload.samples[0].value,26);
 assert.equal(num.payload.samples[0].quality,'good');
 assert.equal(typeof store.get('fresh-t1'),'number');
 assert.ok((store.get('fresh-t1') as number)>0);
 const b=convert({tagId:'t2',payload:true},flow);
 assert.equal(b.payload.samples[0].value,true);
 assert.equal(b.payload.samples[0].quality,'good');
 assert.ok((store.get('fresh-t2') as number)>0);
 const f=convert({tagId:'t2',payload:false},flow);
 assert.equal(f.payload.samples[0].value,false);
 assert.equal(f.payload.samples[0].quality,'good');
 const big=convert({tagId:'t3',payload:5n},flow);
 assert.equal(big.payload.samples[0].value,5,'bigint sayiya cevrilir');
});
test('ADS donusum fonksiyonu: sayisal etikette sayi olmayan deger bad kalite olur, bilinmeyen etiket null doner',()=>{
 const {convert,store,flow}=build([tag('t1','GVL.fSicaklik','float32'),tag('t2','MAIN.st.bX','bool',{min:0,max:1})]);
 for(const raw of ['12.5',null,undefined,{a:1},true,NaN,Infinity]){
  const out=convert({tagId:'t1',payload:raw},flow);
  assert.equal(out.payload.samples[0].value,null,String(raw));
  assert.equal(out.payload.samples[0].quality,'bad',String(raw));
  assert.equal(store.get('fresh-t1'),0,'bad okumada taze damgasi sifirlanir');
 }
 const badBool=convert({tagId:'t2',payload:'true'},flow);
 assert.equal(badBool.payload.samples[0].value,null);
 assert.equal(badBool.payload.samples[0].quality,'bad');
 assert.equal(store.get('fresh-t2'),0);
 assert.equal(convert({tagId:'yok',payload:1},flow),null);
 assert.equal(convert({payload:1},flow),null);
 assert.equal(store.has('fresh-yok'),false,'bilinmeyen etiket icin fresh yazilmaz');
});
test('assertDriversDeployable: ADS paketi yoksa acik hata, varsa okuma ve yazma gecer, gecersiz yapilandirma reddedilir',()=>{
 const empty=fs.mkdtempSync(path.join(os.tmpdir(),'scada-ads-'));
 const cwd=process.cwd();
 try{
  process.chdir(empty);
  assert.throws(()=>assertDriversDeployable([conn()],[device()],[tag('t1','GVL.a','float32')],empty,empty),/node-red-contrib-ads-client kurulu değil/);
 }finally{process.chdir(cwd);}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-ads-'));
 fs.mkdirSync(path.join(dir,'node_modules','node-red-contrib-ads-client'),{recursive:true});
 fs.writeFileSync(path.join(dir,'node_modules','node-red-contrib-ads-client','package.json'),'{}');
 assert.doesNotThrow(()=>assertDriversDeployable([conn()],[device()],[tag('t1','GVL.a','float32')],dir));
 assert.doesNotThrow(()=>assertDriversDeployable([conn()],[device()],[tag('t1','GVL.a','float32',{access:'readwrite'})],dir));
 assert.throws(()=>assertDriversDeployable([conn()],[device()],[tag('t1','bozuk','float32')],dir),/ADS sembolü anlaşılamadı/);
 assert.throws(()=>assertDriversDeployable([conn({amsNetId:undefined})],[device()],[tag('t1','GVL.a','float32')],dir),/AMS Net ID gerekli/);
});
