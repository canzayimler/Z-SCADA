import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectionSchema,deviceSchema,tagSchema,validateConfig,protocolLabels,parseMqttTopic,mqttPathSteps,mqttExtract,mqttCoerce,mqttTimestamp,mqttCodecSource,
 isSymbolicProtocol,symbolicAddressField,symbolicAddressOf,addressFormatOf,mqttTopicLevel,pruneMqttPublish,type Config} from '../packages/contracts/model';
import {acceptSource,acceptSampledAt,type SourceState} from '../apps/server/src/ingest';
import {seedConfig} from '../packages/contracts/seed';
import {mqttDriver,driverFor,assertDriversDeployable,mqttBrokerId,mqttInId,mqttClientId,buildMqttPublishNodes,MQTT_PUBLISH_ID,MQTT_PUBLISH_OUT_ID} from '../packages/drivers/driver';
import os from 'node:os';
import {buildGateway,withoutCredentials} from '../apps/server/src/gateway';
/* MQTT surucusu (Faz 3): konu/yol ayristirma, tip cevirme, gomulu kodek paritesi, dugum uretimi,
 * kimlik bilgisinin yalniz `credentials`'ta durmasi, sira monotonlugu ve disa yayin dugumu. */

const conn=(extra:object={})=>connectionSchema.parse({id:'m1',name:'Broker',protocol:'mqtt',host:'203.0.113.50',port:1883,timeout:3000,...extra});
const device=(extra:object={})=>deviceSchema.parse({id:'md1',connectionId:'m1',code:'MQ-1',name:'MQTT hat',slaveId:1,enabled:true,pollMs:1000,staleMs:5000,...extra});
const tag=(id:string,mqttTopic:string,dataType:string,extra:object={})=>tagSchema.parse({id,deviceId:'md1',code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'read',min:-1e9,max:1e9,mqttTopic,...extra});
const base=():Config=>{const c:any=structuredClone(seedConfig);c.connections.push(conn());c.devices.push(device());return c;};

test('MQTT protokolu: etiket, sembolik adres alani ve adres bicimi',()=>{
 assert.equal(protocolLabels.mqtt,'MQTT');
 assert.equal(isSymbolicProtocol('mqtt'),true);
 assert.equal(symbolicAddressField('mqtt'),'mqttTopic');
 assert.equal(symbolicAddressOf({mqttTopic:'hat1/sensor',mqttJsonPath:'data.temp'},{protocol:'mqtt'}),'hat1/sensor · data.temp');
 assert.equal(symbolicAddressOf({mqttTopic:'hat1/sensor'},{protocol:'mqtt'}),'hat1/sensor');
 assert.equal(symbolicAddressOf({mqttTopic:'hat1/sensor',mqttJsonPath:'  '},{protocol:'mqtt'}),'hat1/sensor');
 assert.equal(symbolicAddressOf({},{protocol:'mqtt'}),undefined);
 const c=base();assert.equal(addressFormatOf(c,'md1'),'mqtt');
 assert.equal(driverFor(conn()).id,'mqtt');
 assert.equal(mqttDriver.writeLimits.allowWrite,false);
 assert.equal(mqttDriver.buildWriteNodes,undefined);
});

test('parseMqttTopic: joker (+ #) ve bos konu reddedilir, konu kirpilir',()=>{
 assert.equal(parseMqttTopic(' hat1/sicaklik '),'hat1/sicaklik');
 assert.equal(parseMqttTopic('$SYS/broker/uptime'),'$SYS/broker/uptime');
 for(const bad of ['','  ','hat1/+/temp','hat1/#','#','+','a/b#'])assert.throws(()=>parseMqttTopic(bad),/MQTT konusu/,bad);
 assert.throws(()=>parseMqttTopic('a'.repeat(257)),/256/);
});

test('mqttPathSteps: noktali ad ve [n] dizin; bos = yukun tamami; bozuk yol reddedilir',()=>{
 assert.deepEqual(mqttPathSteps(''),[]);
 assert.deepEqual(mqttPathSteps(undefined),[]);
 assert.deepEqual(mqttPathSteps('data.temp'),['data','temp']);
 assert.deepEqual(mqttPathSteps('values[0]'),['values',0]);
 assert.deepEqual(mqttPathSteps('a.b[2][3].c'),['a','b',2,3,'c']);
 assert.deepEqual(mqttPathSteps('[1].v'),[1,'v']);
 assert.deepEqual(mqttPathSteps('sensor-1.t_2'),['sensor-1','t_2']);
 for(const bad of ['.a','a.','a..b','a[b]','a[-1]','a[]','a b','a.[0]','a["x"]'])assert.throws(()=>mqttPathSteps(bad),/JSON yolu/,bad);
});

test('mqttExtract: nesne/dizi yolu; olmayan yol, prototip anahtari ve tip uyumsuzlugu undefined',()=>{
 const body={data:{temp:21.5,list:[1,{v:7}]},values:[3,4]};
 assert.equal(mqttExtract(body,['data','temp']),21.5);
 assert.equal(mqttExtract(body,['data','list',1,'v']),7);
 assert.equal(mqttExtract(body,['values',1]),4);
 assert.equal(mqttExtract(body,['values',5]),undefined);
 assert.equal(mqttExtract(body,['values','length']),undefined);
 assert.equal(mqttExtract(body,['data',0]),undefined);
 assert.equal(mqttExtract(body,['yok']),undefined);
 assert.equal(mqttExtract(body,['toString']),undefined);
 assert.equal(mqttExtract(body,['__proto__']),undefined);
 assert.equal(mqttExtract(23.5,[]),23.5);
 assert.equal(mqttExtract('on',['x']),undefined);
 assert.equal(mqttExtract(null,['x']),undefined);
});

test('mqttCoerce: bool kelimeleri, sayi ve sayi metni; cevrilemeyen null (sahte good yok)',()=>{
 for(const [raw,v] of [[true,true],[false,false],[1,true],[0,false],['true',true],['FALSE',false],[' on ',true],['Off',false],['1',true],['0',false]] as const)assert.equal(mqttCoerce(raw,'bool'),v,String(raw));
 for(const raw of [2,-1,'yes','',null,undefined,{},[],'2'])assert.equal(mqttCoerce(raw,'bool'),null,JSON.stringify(raw));
 assert.equal(mqttCoerce(23.5,'float32'),23.5);
 assert.equal(mqttCoerce('23.5','float32'),23.5);
 assert.equal(mqttCoerce(' -4 ','int16'),-4);
 assert.equal(mqttCoerce('1e3','uint16'),1000);
 assert.equal(mqttCoerce('.5','float32'),0.5);
 for(const raw of ['0x10','',' ','abc','12abc',true,false,null,undefined,NaN,Infinity,{},[1]])assert.equal(mqttCoerce(raw,'float32'),null,String(raw));
 // Tam sayi tipleri: kesirli ya da aralik disi deger 'bad'.
 assert.equal(mqttCoerce(3.7,'int16'),null);
 assert.equal(mqttCoerce(40000,'int16'),null);
 assert.equal(mqttCoerce(-1,'uint16'),null);
 assert.equal(mqttCoerce(65535,'uint16'),65535);
 assert.equal(mqttCoerce(4294967295,'uint32'),4294967295);
 assert.equal(mqttCoerce(-2147483649,'int32'),null);
});

test('mqttTimestamp: ISO ve epoch ms pencere icindeyse kullanilir, degilse alis zamani',()=>{
 const now=Date.parse('2026-11-18T10:00:00.000Z');
 assert.equal(mqttTimestamp('2026-11-18T09:59:50.000Z',now),now-10000);
 assert.equal(mqttTimestamp(now-5000,now),now-5000);
 assert.equal(mqttTimestamp(String(now-5000),now),now-5000);
 assert.equal(mqttTimestamp(now-5000.7,now),now-5001);
 assert.equal(mqttTimestamp(undefined,now),now);
 assert.equal(mqttTimestamp('dun',now),now);
 assert.equal(mqttTimestamp(now-120000,now),now,'cok eski: alis zamani');
 assert.equal(mqttTimestamp(now+5000,now),now,'gelecek: alis zamani');
 assert.equal(mqttTimestamp(Math.floor((now-5000)/1000),now),now,'epoch saniye desteklenmez (ms beklenir)');
 // Donen damga sunucu ingest penceresinden her zaman gecer.
 for(const raw of [now-54999,now+999,'2026-11-18T09:59:06Z',undefined])assert.equal(acceptSampledAt(mqttTimestamp(raw,now),now),true,String(raw));
});

test('gomulu MQTT kodegi (mqttCodecSource) kanonik fonksiyonlarla ayni davranir',()=>{
 const embedded=(new Function(mqttCodecSource()+'\nreturn {mqttExtract,mqttCoerce,mqttTimestamp};'))() as {mqttExtract:typeof mqttExtract;mqttCoerce:typeof mqttCoerce;mqttTimestamp:typeof mqttTimestamp};
 const body={data:{temp:'21.5',on:'on',arr:[0,'7']}};
 for(const steps of [['data','temp'],['data','on'],['data','arr',1],['data','yok'],[]] as (string|number)[][])
  for(const dt of ['bool','int16','uint16','int32','uint32','float32']){
   const raw=mqttExtract(body,steps);
   assert.deepEqual(embedded.mqttExtract(body,steps),raw);
   assert.equal(embedded.mqttCoerce(raw,dt),mqttCoerce(raw,dt),JSON.stringify(steps)+' '+dt);
  }
 const now=Date.now();
 for(const raw of [now-1000,'2026-11-18T09:59:50Z','x',undefined,now+10000])assert.equal(embedded.mqttTimestamp(raw,now),mqttTimestamp(raw,now));
});

test('validateConfig: MQTT etiketi konu ister, joker ve oku/yaz reddedilir, yollar denetlenir',()=>{
 const ok=base();ok.tags.push(tag('t1','hat1/sensor','float32',{mqttJsonPath:'data.temp',mqttTimestampPath:'ts'}),tag('t2','hat1/durum','bool'));
 assert.doesNotThrow(()=>validateConfig(ok));
 const missing=base();missing.tags.push(tag('t1','','float32'));
 assert.throws(()=>validateConfig(missing),/MQTT konusu gerekli/);
 const plus=base();plus.tags.push(tag('t1','hat1/+/temp','float32'));
 assert.throws(()=>validateConfig(plus),/joker/);
 const hash=base();hash.tags.push(tag('t1','hat1/#','float32'));
 assert.throws(()=>validateConfig(hash),/joker/);
 const rw=base();rw.tags.push(tag('t1','hat1/sp','float32',{access:'readwrite',min:0,max:100}));
 assert.throws(()=>validateConfig(rw),/MQTT etiketi yalnız okunur/);
 const path=base();path.tags.push(tag('t1','hat1/a','float32',{mqttJsonPath:'a..b'}));
 assert.throws(()=>validateConfig(path),/JSON yolu/);
 const tsPath=base();tsPath.tags.push(tag('t1','hat1/a','float32',{mqttTimestampPath:'[x]'}));
 assert.throws(()=>validateConfig(tsPath),/JSON yolu/);
 // Surucu validate'i de ayni kurali uygular (deploy oncesi assertDriversDeployable).
 assert.throws(()=>mqttDriver.validate(conn(),[tag('t1','a/#','float32')]),/joker/);
 assert.throws(()=>mqttDriver.validate(conn(),[tag('t1','a/b','float32',{access:'readwrite'})]),/yalnız okunur/);
 assert.throws(()=>assertDriversDeployable([conn()],[device()],[tag('t1','a/+','float32')],'.'),/joker/);
 assert.doesNotThrow(()=>assertDriversDeployable([conn()],[device()],[tag('t1','a/b','float32')],'.'),'cekirdek dugum: paket gerekmez');
 // Baglanti alanlari.
 assert.throws(()=>connectionSchema.parse({...conn(),clientId:'kotu id'}));
 assert.throws(()=>connectionSchema.parse({...conn(),mqttKeepalive:1}));
});

const ctx={token:'tok',revision:7,hostname:'ZS-A'};
test('mqttDriver.buildNodes: farkli konu basina tek mqtt in, deterministik scada- kimlikleri, broker ayarlari',()=>{
 const tags=[tag('t1','hat1/sensor','float32',{mqttJsonPath:'data.temp'}),tag('t2','hat1/sensor','int16',{mqttJsonPath:'data.count'}),tag('t3','hat1/durum','bool'),tag('t4','hat2/x','float32',{deviceId:'md2'})];
 const devices=[device(),device({id:'md2',code:'MQ-2',slaveId:2,enabled:false})];
 const nodes=mqttDriver.buildNodes([conn({mqttKeepalive:30,mqttCleanSession:false})],devices,tags,ctx);
 const ins=nodes.filter(n=>n.type==='mqtt in');
 assert.equal(ins.length,2,'iki farkli konu; pasif cihazin konusu abone olunmaz');
 assert.deepEqual(ins.map(n=>n.topic).sort(),['hat1/durum','hat1/sensor']);
 for(const n of ins){assert.equal(n.qos,'1');assert.equal(n.datatype,'utf8');assert.equal(n.broker,'scada-mqtt-m1-broker');assert.equal(n.id,mqttInId(conn(),n.topic));assert.deepEqual(n.wires,[['scada-mqtt-m1-convert']]);}
 const broker=nodes.find(n=>n.type==='mqtt-broker');
 assert.equal(broker.id,'scada-mqtt-m1-broker');
 assert.equal(broker.broker,'203.0.113.50');assert.equal(broker.port,'1883');assert.equal(broker.clientid,'zscada-ZS-A-m1');
 assert.equal(broker.keepalive,'30');assert.equal(broker.cleansession,false);assert.equal(broker.usetls,false);assert.equal(broker.tls,'');
 assert.equal(broker.credentials,undefined);assert.equal(broker.z,undefined,'yapilandirma dugumu sekmeye bagli degil');
 assert.equal(nodes.some(n=>n.type==='tls-config'),false);
 assert.equal(nodes.some(n=>n.type==='mqtt out'),false,'okuma dalinda yazma/yayin yok');
 for(const n of nodes)assert.match(n.id,/^scada-/);
 assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
 // Deterministik: ayni girdi -> ayni dugumler.
 assert.deepEqual(mqttDriver.buildNodes([conn({mqttKeepalive:30,mqttCleanSession:false})],devices,tags,ctx),nodes);
 // Etiketsiz baglanti dugum uretmez; ozel clientId kullanilir.
 assert.deepEqual(mqttDriver.buildNodes([conn()],[device({enabled:false})],tags,ctx),[]);
 assert.equal(mqttDriver.buildNodes([conn({clientId:'hat-1'})],[device()],[tags[0]],ctx).find(n=>n.type==='mqtt-broker').clientid,'hat-1');
});

test('MQTT istemci kimligi: makine adi icerir (aktif/yedek cakismaz), arindirilir, 64 karakteri asmaz; elle verilen kazanir',()=>{
 assert.equal(mqttClientId(conn(),'ZS-A'),'zscada-ZS-A-m1');
 assert.notEqual(mqttClientId(conn(),'ZS-A'),mqttClientId(conn(),'ZS-B'),'aktif ve yedek ayni brokere farkli kimlikle baglanir');
 assert.equal(mqttClientId(conn(),'scada.fabrika.local'),'zscada-scadafabrikalocal-m1','nokta ve diger karakterler atilir');
 assert.equal(mqttClientId(conn(),'Ş!@ #'),'zscada-m1','arindirilinca bos kalan makine adi atlanir');
 assert.equal(mqttClientId(conn()),'zscada-'+os.hostname().replace(/[^A-Za-z0-9_-]/g,'')+'-m1','varsayilan: os.hostname()');
 const longId='b'.repeat(80),long=mqttClientId(conn({id:longId}),'H'.repeat(40));
 assert.ok(long.length<=64,long);assert.match(long,/^zscada-H{24}-[0-9a-f]{16}$/);
 assert.equal(mqttClientId(conn({id:longId}),'H'.repeat(40)),long,'deterministik');
 assert.notEqual(mqttClientId(conn({id:'c'.repeat(80)}),'H'.repeat(40)),long,'farkli baglanti farkli ozet');
 assert.equal(mqttClientId({...conn(),clientId:' hat-1 '},'ZS-A'),'hat-1');
 const a=buildGateway(validateConfig({...base(),tags:[...base().tags,tag('t1','a/b','float32')]}),'tok',4730,'.',{hostname:'ZS-A'}),b=buildGateway(validateConfig({...base(),tags:[...base().tags,tag('t1','a/b','float32')]}),'tok',4730,'.',{hostname:'ZS-B'});
 assert.equal(a.find(n=>n.type==='mqtt-broker').clientid,'zscada-ZS-A-m1');assert.equal(b.find(n=>n.type==='mqtt-broker').clientid,'zscada-ZS-B-m1');
});

test('MQTT TLS: tls-config sunucu sertifikasini dogrular; port alanina dokunulmaz',()=>{
 const nodes=mqttDriver.buildNodes([conn({mqttTls:true,port:8883})],[device()],[tag('t1','a/b','float32')],ctx);
 const broker=nodes.find(n=>n.type==='mqtt-broker'),tls=nodes.find(n=>n.type==='tls-config');
 assert.equal(broker.usetls,true);assert.equal(broker.tls,'scada-mqtt-m1-tls');assert.equal(broker.port,'8883');
 assert.equal(tls.id,'scada-mqtt-m1-tls');assert.equal(tls.verifyservercert,true);assert.equal(tls.servername,'203.0.113.50');assert.equal(tls.ca,'');
});

test('MQTT kimlik bilgisi yalniz credentials icinde; parolali broker kimligi ayri; yedekte ayiklanir',()=>{
 const secretCtx={...ctx,secret:(id:string)=>id==='m1'?{username:'zscada',password:'Gizli-Mqtt-77'}:undefined};
 const nodes=mqttDriver.buildNodes([conn()],[device()],[tag('t1','a/b','float32')],secretCtx);
 const broker=nodes.find(n=>n.type==='mqtt-broker');
 assert.equal(broker.id,'scada-mqtt-m1-broker-auth');
 assert.equal(mqttBrokerId(conn(),secretCtx),'scada-mqtt-m1-broker-auth');
 assert.deepEqual(broker.credentials,{user:'zscada',password:'Gizli-Mqtt-77'});
 assert.equal(nodes.find(n=>n.type==='mqtt in').broker,'scada-mqtt-m1-broker-auth');
 const {credentials:_c,...rest}=broker;
 assert.equal(JSON.stringify(rest).includes('Gizli-Mqtt-77'),false,'parola credentials disinda yok');
 assert.equal(JSON.stringify(nodes.filter(n=>n!==broker)).includes('Gizli'),false);
 assert.equal(JSON.stringify(withoutCredentials(nodes)).includes('Gizli-Mqtt-77'),false);
 // Kullanici adi yoksa parola tek basina kullanilmaz.
 const anon=mqttDriver.buildNodes([conn()],[device()],[tag('t1','a/b','float32')],{...ctx,secret:()=>({password:'yalniz-parola'})});
 assert.equal(anon.find(n=>n.type==='mqtt-broker').id,'scada-mqtt-m1-broker');
 assert.equal(JSON.stringify(anon).includes('yalniz-parola'),false);
});

/** Donusum dugumunu Node-RED function benzeri bir ortamda calistirir (flow/context bellekte). */
function convertRunner(nodes:any[]){
 const fn=new Function('msg','flow','context','Buffer',nodes.find(n=>n.id==='scada-mqtt-m1-convert').func) as (msg:any,flow:any,context:any,b:typeof Buffer)=>any;
 const flowStore:Record<string,unknown>={},ctxStore:Record<string,unknown>={};
 const flow={get:(k:string)=>flowStore[k],set:(k:string,v:unknown)=>{flowStore[k]=v;}},context={get:(k:string)=>ctxStore[k],set:(k:string,v:unknown)=>{ctxStore[k]=v;}};
 return {run:(topic:string,payload:unknown)=>fn({topic,payload},flow,context,Buffer),flowStore};
}
test('donusum: JSON yolu, duz metin, olcek, bool kelimeleri, cevrilemeyen bad, fresh bayragi',()=>{
 const tags=[tag('t1','hat1/sensor','float32',{mqttJsonPath:'data.temp',scale:2,offset:1}),tag('t2','hat1/sensor','int16',{mqttJsonPath:'values[1]'}),tag('t3','hat1/durum','bool'),tag('t4','hat1/plain','float32'),
  tag('t5','hat1/sensor','float32',{mqttJsonPath:'data.ts',mqttTimestampPath:'data.at'})];
 const {run,flowStore}=convertRunner(mqttDriver.buildNodes([conn()],[device()],tags,ctx));
 const before=Date.now();
 const r1=run('hat1/sensor',JSON.stringify({data:{temp:'20.25',ts:5,at:new Date(before-3000).toISOString()},values:[1,-7]}));
 assert.equal(r1.payload.token,'tok');assert.equal(r1.payload.revision,7);assert.equal(r1.payload.source,'scada-mqtt-m1');
 const by=Object.fromEntries(r1.payload.samples.map((s:any)=>[s.tagId,s]));
 assert.deepEqual(Object.keys(by).sort(),['t1','t2','t5'],'yalniz o konunun etiketleri');
 assert.equal(by.t1.value,41.5);assert.equal(by.t1.quality,'good');
 assert.equal(by.t2.value,-7);assert.equal(by.t2.quality,'good');
 assert.equal(by.t5.sampledAt,before-3000,'damga yukten');
 assert.ok(by.t1.sampledAt>=before,'damga yolu yok: alis zamani');
 assert.ok((flowStore['fresh-t1'] as number)>=before);
 for(const [p,v] of [['on',true],['OFF',false],['true',true],['0',false],['1',true]] as const){const r=run('hat1/durum',p);assert.equal(r.payload.samples[0].value,v,p);assert.equal(r.payload.samples[0].quality,'good');}
 for(const p of ['23.5','"23.5"',' 23.5 ']){const r=run('hat1/plain',p);assert.equal(r.payload.samples[0].value,23.5,p);}
 for(const p of ['abc','','{"x":1}','true','null']){
  const r=run('hat1/plain',p);
  assert.deepEqual([r.payload.samples[0].value,r.payload.samples[0].quality],[null,'bad'],p);
  assert.equal(flowStore['fresh-t4'],0,'bad ornek tazelik bayragini sifirlar');
 }
 const bad=run('hat1/sensor',JSON.stringify({data:{temp:'x'},values:[1,3.5]}));
 assert.ok(bad.payload.samples.every((s:any)=>s.quality==='bad'&&s.value===null));
 assert.equal(run('baska/konu','1'),null,'bilinmeyen konu ornek uretmez');
 assert.equal(run('hat1/plain',Buffer.from('12')).payload.samples[0].value,12,'Buffer yuk de cozulur');
});

test('sira: ayni kaynakta kesin artan sequence + sabit session; ayni milisaniyede de ingest kabul eder',()=>{
 const {run}=convertRunner(mqttDriver.buildNodes([conn()],[device()],[tag('t1','a/b','float32')],ctx));
 let state:SourceState|undefined;const seqs:number[]=[];let session='';
 for(let i=0;i<200;i++){
  const m=run('a/b',String(i)).payload;seqs.push(m.sequence);
  if(i===0)session=m.session;else assert.equal(m.session,session);
  const v=acceptSource(state,m,Date.now());assert.equal(v.ok,true,'mesaj '+i+' reddedildi');state=(v as any).next;
 }
 for(let i=1;i<seqs.length;i++)assert.ok(seqs[i]>seqs[i-1]);
 assert.equal(seqs[0],1);
});

test('buildGateway: MQTT baglantisi yalniz okuma dugumleri uretir, yazma koprusu ve okuma testi yok',()=>{
 const c=base();c.connections=[conn()];c.devices=[device()];c.tags=[tag('t1','a/b','float32'),tag('t2','a/c','bool')];c.commands=[];
 const nodes=buildGateway(validateConfig(c),'tok',4730,'.');
 assert.equal(nodes.filter(n=>n.type==='mqtt in').length,2);
 assert.equal(nodes.some(n=>n.id==='scada-write-http'||n.id==='scada-read-http'||n.type==='http response'),false);
 assert.equal(nodes.some(n=>n.id===MQTT_PUBLISH_ID),false,'yayin tanimsiz: yayin dugumu yok');
});

const publishConfig=(over:object={})=>{
 const c:any=base();
 c.connections.push(conn({id:'pub',name:'Rapor broker',host:'203.0.113.60'}));
 c.tags.push(tag('t1','hat1/a','float32'),tag('t2','hat1/b','bool'));
 c.mqttPublish={connectionId:'pub',baseTopic:'fabrika/zscada',intervalMs:5000,onChange:true,retain:true,tagIds:'all',...over};
 return c;
};
test('validateConfig: MQTT yayini hedef, temel konu, tekil kod ve dongu kurallari',()=>{
 const ok=validateConfig(publishConfig());
 assert.equal(ok.mqttPublish!.intervalMs,5000);
 assert.equal(validateConfig({...publishConfig(),mqttPublish:{connectionId:'pub',baseTopic:'a'}}).mqttPublish!.tagIds,'all','varsayilanlar');
 assert.throws(()=>validateConfig(publishConfig({intervalMs:500})));
 assert.throws(()=>validateConfig(publishConfig({connectionId:seedConfig.connections[0].id})),/MQTT bağlantısı olmalı/);
 for(const b of ['a/#','a/+/b','/a','a/','a//b'])assert.throws(()=>validateConfig(publishConfig({baseTopic:b})),/temel konu/,b);
 assert.throws(()=>validateConfig(publishConfig({tagIds:['yok']})),/bulunamadı/);
 const dup=publishConfig();dup.tags.push(tag('t9','hat1/z','float32',{deviceId:seedConfig.devices[0].id,code:'T1'}));
 // Modbus cihazindaki etiket mqttTopic'i yok sayar ama kodu yayin konusunda T1 ile cakisir.
 dup.tags.at(-1).area='holding-register';dup.tags.at(-1).address=4999;delete dup.tags.at(-1).mqttTopic;
 assert.throws(()=>validateConfig(dup),/tekil olmalı/);
 assert.doesNotThrow(()=>validateConfig({...dup,mqttPublish:{...dup.mqttPublish,tagIds:['t1','t2']}}),'secili etiketlerde cakisma yok');
 const loop=publishConfig({connectionId:'m1',baseTopic:'hat1'});
 assert.throws(()=>validateConfig(loop),/geri döner/);
 assert.doesNotThrow(()=>validateConfig(publishConfig({connectionId:'m1',baseTopic:'rapor'})),'okuma ile ayni broker, ayri konu');
 assert.equal(mqttTopicLevel('Pompa+1/#A'),'Pompa_1__A');
});

test('buildMqttPublishNodes: tek yayin dugumu, ornek ureten tellere dokunur, gerekirse broker ekler',()=>{
 const c=validateConfig(publishConfig());
 const nodes=buildGateway(c,'tok',4730,'.');
 const pub=nodes.find(n=>n.id===MQTT_PUBLISH_ID),out=nodes.find(n=>n.id===MQTT_PUBLISH_OUT_ID);
 assert.ok(pub&&out);
 assert.equal(out.type,'mqtt out');assert.equal(out.broker,'scada-mqtt-pub-broker');assert.equal(out.topic,'');assert.equal(out.qos,'');assert.equal(out.retain,'');
 assert.equal(nodes.filter(n=>n.type==='mqtt-broker').length,2,'okuma brokeri + yalniz yayin icin eklenen broker');
 const feeders=nodes.filter(n=>Array.isArray(n.wires)&&n.wires.some((w:any)=>w.includes('scada-ws-out')));
 assert.ok(feeders.length>=2,'Modbus + MQTT donusumleri');
 for(const n of feeders){
  const w=n.wires.find((x:any)=>x.includes('scada-ws-out'));
  assert.equal(w.includes(MQTT_PUBLISH_ID),n.id!=='scada-heartbeat',n.id);
 }
 for(const n of nodes)assert.match(n.id,/^scada-/);
 assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
 // Okuma brokeriyle ayni baglanti: ikinci broker dugumu eklenmez.
 const same=buildGateway(validateConfig(publishConfig({connectionId:'m1',baseTopic:'rapor'})),'tok',4730,'.');
 assert.equal(same.filter(n=>n.type==='mqtt-broker').length,1);
 assert.equal(same.find(n=>n.id===MQTT_PUBLISH_OUT_ID).broker,'scada-mqtt-m1-broker');
 // Tekrar cagrida tel ikinci kez eklenmez.
 const extra=buildMqttPublishNodes(c,ctx,nodes);
 for(const n of nodes)for(const w of n.wires??[])if(Array.isArray(w))assert.ok(w.filter((x:string)=>x===MQTT_PUBLISH_ID).length<=1);
 assert.equal(extra.some(n=>n.type==='mqtt-broker'),false);
});

test('yayin dugumu: aralikta son degerler, onChange aninda, bayat stale, gecersiz bad',()=>{
 const c=validateConfig(publishConfig());
 const nodes=buildGateway(c,'tok',4730,'.');
 const fn=new Function('msg','context',nodes.find(n=>n.id===MQTT_PUBLISH_ID).func) as (msg:any,context:any)=>any;
 const store:Record<string,unknown>={};const context={get:(k:string)=>store[k],set:(k:string,v:unknown)=>{store[k]=v;}};
 const send=(samples:any[])=>fn({payload:{token:'tok',samples}},context);
 const now=Date.now();
 const r1=send([{tagId:'t1',value:21.5,quality:'good',sampledAt:now},{tagId:'t2',value:true,quality:'good',sampledAt:now},{tagId:'baska',value:1,quality:'good',sampledAt:now}]);
 assert.equal(r1[0].length,2,'onChange: iki etiket hemen yayinlanir, secili olmayan atlanir');
 const m1=r1[0].find((m:any)=>m.topic==='fabrika/zscada/T1');
 assert.deepEqual(JSON.parse(m1.payload),{value:21.5,quality:'good',ts:now});
 assert.equal(m1.qos,1);assert.equal(m1.retain,true);
 assert.equal(send([{tagId:'t1',value:21.5,quality:'good',sampledAt:now+1}]),null,'degismeyen deger onChange ile yayinlanmaz');
 const r3=send([{tagId:'t1',value:'21.5',quality:'good',sampledAt:now+2}]);
 assert.deepEqual(JSON.parse(r3[0][0].payload),{value:null,quality:'bad',ts:now+2},'gecersiz tip good yayinlanmaz');
 const tick=fn({topic:'tick'},context);
 assert.equal(tick[0].length,2,'aralik: tum bilinen etiketler');
 // Bayatlama: son ornek staleMs'ten eski.
 (store.last as any).t2.at=now-60000;
 const stale=fn({topic:'tick'},context)[0].find((m:any)=>m.topic==='fabrika/zscada/T2');
 assert.equal(JSON.parse(stale.payload).quality,'stale');
 assert.equal(fn({topic:'baska'},context),null);
});

test('pruneMqttPublish: silinen hedef baglanti blogu kaldirir, silinen etiket listeden duser',()=>{
 const c:any=validateConfig(publishConfig({tagIds:['t1','t2']}));
 assert.equal(pruneMqttPublish(c),c,'degisiklik yoksa ayni nesne');
 assert.equal(pruneMqttPublish({...c,connections:c.connections.filter((x:any)=>x.id!=='pub')}).mqttPublish,undefined);
 assert.deepEqual(pruneMqttPublish({...c,tags:c.tags.filter((t:any)=>t.id!=='t1')}).mqttPublish.tagIds,['t2']);
 assert.equal(pruneMqttPublish({...c,tags:c.tags.filter((t:any)=>t.id!=='t1'&&t.id!=='t2')}).mqttPublish,undefined);
 assert.doesNotThrow(()=>validateConfig(pruneMqttPublish({...c,tags:c.tags.filter((t:any)=>t.id!=='t1')})));
});
