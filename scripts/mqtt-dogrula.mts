/**
 * MQTT sürücüsünü (Node-RED çekirdek mqtt düğümleri) uçtan uca doğrular; canlı sisteme, gerçek brokere ve
 * ağdaki hiçbir cihaza dokunmaz (yalnız 127.0.0.1 ve yedek portlar).
 * 1) 127.0.0.1:11883'te kullanıcı/parolalı yerel bir aedes broker açar (aedes yalnız devDependency).
 * 2) Yalıtılmış bir Node-RED (1897, geçici userDir, adminAuth + credentialSecret) başlatır ve akışı
 *    sunucunun GERÇEK deployGateway'iyle uygular. Örnekler 15997'deki geçici WebSocket'e gelir; her mesaj
 *    sunucunun ingest kurallarından (acceptSource / acceptSampledAt) geçirilir.
 * 3) Denetler: JSON yolu + ölçek, dizi dizini, yükteki zaman damgası, düz metin sayı, on/off bool,
 *    çevrilemeyen yükün 'bad' olması, kesin artan sıra, yanlış parolada hiç 'good' örnek olmaması,
 *    dışa yayının (rapor) brokere ulaşması, broker durunca sahte 'good' gelmemesi, parolanın Node-RED
 *    logunda / yedeklerde / GET /flows'ta / userDir düz metninde olmaması.
 *   npx tsx scripts/mqtt-dogrula.mts      (LOG=1: Node-RED logunu da yazdır)
 */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';
import bcrypt from 'bcryptjs';
import {Aedes} from 'aedes';
import {validateConfig,type Config} from '../packages/contracts/model';
import {deployGateway} from '../apps/server/src/gateway';
import {mqttClientId} from '../packages/drivers/driver';
import {CONNECTION_SECRETS_FILE} from '../apps/server/src/connectionSecrets';
import {acceptSource,acceptSampledAt,type SourceState} from '../apps/server/src/ingest';

const BROKER_PORT=11883,RED_PORT=1897,WS_PORT=15997;
const USER='zscada',PASS='Dogrula-Mqtt-Parola-5521',WRONG='Yanlis-Mqtt-Parola-8830';
const RED='http://127.0.0.1:'+RED_PORT;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mqtt-dogrula-'));
const nrDir=path.join(root,'node-red'),dataDir=path.join(root,'data');
fs.mkdirSync(nrDir);fs.mkdirSync(dataDir);
const checks:[string,boolean][]=[];
const check=(name:string,ok:boolean)=>{checks.push([name,ok]);console.log(ok?'✔':'✘',name);};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>boolean|Promise<boolean>,timeout:number){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return true;await sleep(200);}return false;}

// --- Yerel broker (kullanici/parola zorunlu) -----------------------------------------
const authOk=new Set<string>(),authFail=new Set<string>();
const outbound:{topic:string;payload:string;retain:boolean;at:number}[]=[];
const broker=await Aedes.createBroker({authenticate:(client,username,password,done)=>{
 const ok=username===USER&&password?.toString()===PASS;
 (ok?authOk:authFail).add(client.id);
 if(ok)done(null,true);else{const e:any=new Error('Kimlik reddedildi');e.returnCode=4;done(e,false);}
}});
broker.on('publish',(packet,client)=>{if(client&&packet.topic.startsWith('rapor/'))outbound.push({topic:packet.topic,payload:packet.payload.toString(),retain:packet.retain,at:Date.now()});});
const brokerServer=net.createServer(broker.handle);
await new Promise<void>(r=>brokerServer.listen(BROKER_PORT,'127.0.0.1',()=>r()));
const sockets=new Set<net.Socket>();brokerServer.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
const publish=(topic:string,payload:string)=>new Promise<void>(r=>broker.publish({cmd:'publish',topic,payload:Buffer.from(payload),qos:0,retain:false,dup:false} as any,()=>r()));
console.log('aedes broker: mqtt://127.0.0.1:'+BROKER_PORT);

// --- Gecici WebSocket (sunucunun /internal/gateway ucu yerine) + ingest kurallari --------
const samples:any[]=[],messages:any[]=[];let rejects=0;
const sources=new Map<string,SourceState>();
const wss=new WebSocketServer({host:'127.0.0.1',port:WS_PORT,path:'/internal/gateway'});
wss.on('connection',ws=>ws.on('message',b=>{try{
 const m=JSON.parse(String(b));if(!Array.isArray(m.samples))return;
 const now=Date.now();messages.push({source:m.source,session:m.session,sequence:m.sequence,at:now});
 const v=acceptSource(sources.get(m.source),m,now);if(!v.ok){rejects++;return;}sources.set(m.source,v.next);
 for(const s of m.samples){if(!acceptSampledAt(s.sampledAt,now)){rejects++;continue;}samples.push({...s,source:m.source,receivedAt:now});}
}catch{/* */}}));
const last=(id:string)=>[...samples].reverse().find(s=>s.tagId===id);

// --- Yapilandirma + sirlar ---------------------------------------------------------------
const tag=(id:string,deviceId:string,code:string,dataType:string,mqttTopic:string,over:Record<string,unknown>={})=>({id,deviceId,code,name:code,area:'holding-register',address:0,dataType,access:'read',scale:1,offset:0,min:-1e6,max:1e6,unit:'',description:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,mqttTopic,...over});
const dev=(id:string,connectionId:string)=>({id,connectionId,code:id.toUpperCase(),name:id,slaveId:1,enabled:true,pollMs:1000,staleMs:5000,description:''});
const conn=(id:string)=>({id,name:'MQTT '+id,host:'127.0.0.1',port:BROKER_PORT,timeout:3000,protocol:'mqtt'});
const config:Config=validateConfig({revision:1,name:'MQTT dogrula',
 connections:[conn('ok'),conn('wrong')],
 devices:[dev('d1','ok'),dev('d2','wrong')],
 tags:[
  tag('t-json','d1','T-JSON','float32','hat1/sensor',{mqttJsonPath:'data.temp',scale:2,offset:1}),
  tag('t-cnt','d1','T-CNT','int16','hat1/sensor',{mqttJsonPath:'values[1]'}),
  tag('t-ts','d1','T-TS','float32','hat1/sensor',{mqttJsonPath:'data.temp',mqttTimestampPath:'data.at'}),
  tag('t-plain','d1','T-PLAIN','float32','hat1/plain'),
  tag('t-bool','d1','T-BOOL','bool','hat1/durum'),
  tag('t-bad','d1','T-BAD','float32','hat1/bozuk'),
  tag('t-w','d2','T-W','float32','hat1/plain'),
 ],commands:[],
 mqttPublish:{connectionId:'ok',baseTopic:'rapor/zscada',intervalMs:1000,onChange:true,retain:false,tagIds:['t-json','t-bool']}});
fs.writeFileSync(path.join(dataDir,CONNECTION_SECRETS_FILE),JSON.stringify({ok:{username:USER,password:PASS},wrong:{username:USER,password:WRONG}}));
const nrAdmin={username:'scada',password:randomUUID()};
fs.writeFileSync(path.join(dataDir,'nodered-admin.json'),JSON.stringify(nrAdmin));

// --- Yalitilmis Node-RED ---------------------------------------------------------------
fs.writeFileSync(path.join(nrDir,'flows.json'),'[]');
fs.writeFileSync(path.join(nrDir,'settings.js'),`module.exports={uiHost:'127.0.0.1',uiPort:${RED_PORT},flowFile:'flows.json',credentialSecret:${JSON.stringify(randomUUID())},
 adminAuth:{type:'credentials',users:[{username:${JSON.stringify(nrAdmin.username)},password:${JSON.stringify(bcrypt.hashSync(nrAdmin.password,10))},permissions:'*'}]},logging:{console:{level:'info'}}};`);
const red=spawn(process.execPath,['node_modules/node-red/red.js','--userDir',nrDir,'--settings',path.join(nrDir,'settings.js'),'-p',String(RED_PORT)],{stdio:['ignore','pipe','pipe']});
let log='';red.stdout.on('data',d=>{log+=d;});red.stderr.on('data',d=>{log+=d;});
let exitCode=1,feeding=true;
try{
 if(!await until(async()=>{try{return (await fetch(RED+'/auth/login')).ok;}catch{return false;}},60000))throw Error('Node-RED açılmadı');
 const d1=await deployGateway(config,'tok',WS_PORT,dataDir,RED);
 console.log('deployGateway 1:',d1.diff.added.length,'düğüm eklendi');
 const okId=mqttClientId(conn('ok') as any),wrongId=mqttClientId(conn('wrong') as any);
 check('broker: doğru parolalı istemci ('+okId+') bağlandı',await until(()=>authOk.has(okId),20000));
 check('broker: yanlış parolalı istemci ('+wrongId+') reddedildi',await until(()=>authFail.has(wrongId),20000)&&!authOk.has(wrongId));
 await sleep(1000);// abonelikler kurulsun

 // --- Besleme: 400 ms'de bir ---------------------------------------------------------
 let i=0;
 const feed=(async()=>{while(feeding){i++;const now=Date.now();
  await publish('hat1/sensor',JSON.stringify({data:{temp:20+i*0.5,at:new Date(now-2000).toISOString()},values:[0,i]}));
  await publish('hat1/plain','23.5');
  await publish('hat1/durum',i%2?'on':'OFF');
  await publish('hat1/bozuk','abc');
  await sleep(400);}})();
 await until(()=>['t-json','t-cnt','t-ts','t-plain','t-bool','t-bad'].every(id=>last(id))&&samples.filter(s=>s.tagId==='t-json').length>=5,20000);
 const js=last('t-json'),cnt=last('t-cnt'),ts=last('t-ts');
 check('JSON yolu + ölçek (x*2+1): '+js?.value,js?.quality==='good'&&typeof js.value==='number'&&Number.isInteger((js.value-1)/2*2)&&(js.value-1)/2>20);
 check('dizi dizini values[1] int16: '+cnt?.value,cnt?.quality==='good'&&Number.isInteger(cnt.value)&&cnt.value>0);
 check('yükteki zaman damgası kullanıldı (alıştan ~2 sn önce: '+(ts?ts.receivedAt-ts.sampledAt:'?')+' ms)',!!ts&&ts.receivedAt-ts.sampledAt>=1500&&ts.receivedAt-ts.sampledAt<4000);
 check('düz metin "23.5" → 23.5 good',last('t-plain')?.value===23.5&&last('t-plain')?.quality==='good');
 const bools=samples.filter(s=>s.tagId==='t-bool');
 check('on/OFF → true/false good ('+[...new Set(bools.map(s=>s.value))].join(',')+')',bools.some(s=>s.value===true)&&bools.some(s=>s.value===false)&&bools.every(s=>s.quality==='good'));
 check('çevrilemeyen "abc" → bad, değer null, hiç good yok',samples.filter(s=>s.tagId==='t-bad').every(s=>s.quality==='bad'&&s.value===null));
 check('yanlış parola: hiç örnek yok ('+samples.filter(s=>s.tagId==='t-w').length+')',!samples.some(s=>s.tagId==='t-w'));
 const mq=messages.filter(m=>m.source==='scada-mqtt-ok');
 const mono=mq.every((m,k)=>k===0||(m.session===mq[k-1].session&&m.sequence>mq[k-1].sequence));
 check('sıra: '+mq.length+' mesaj, tek session, kesin artan sequence',mq.length>=10&&mono);
 check('ingest kuralları: reddedilen mesaj/örnek yok ('+rejects+')',rejects===0);

 // --- Disa yayin (rapor) ------------------------------------------------------------
 await until(()=>outbound.some(o=>o.topic==='rapor/zscada/T-JSON')&&outbound.some(o=>o.topic==='rapor/zscada/T-BOOL'),10000);
 const oj=[...outbound].reverse().find(o=>o.topic==='rapor/zscada/T-JSON');
 let pj:any=null;try{pj=JSON.parse(oj?.payload??'');}catch{/* */}
 check('dışa yayın: rapor/zscada/T-JSON {value,quality,ts} '+(oj?.payload??'yok'),!!pj&&typeof pj.value==='number'&&pj.quality==='good'&&typeof pj.ts==='number'&&oj!.retain===false);
 check('dışa yayın: seçilmeyen etiket yayınlanmadı',!outbound.some(o=>o.topic==='rapor/zscada/T-PLAIN'||o.topic==='rapor/zscada/T-BAD'));
 check('dışa yayın okuma konularına geri dönmedi (rapor/* örnek üretmedi)',samples.every(s=>!String(s.tagId).startsWith('rapor')));

 // --- Ikinci deploy + sizinti denetimi -------------------------------------------------
 const d2=await deployGateway(config,'tok',WS_PORT,dataDir,RED);
 console.log('deployGateway 2: değişen',d2.diff.changed.length);
 const backups=fs.readdirSync(path.join(dataDir,'backups')).sort();
 const backup2=fs.readFileSync(path.join(dataDir,'backups',backups.at(-1)!),'utf8');
 check('yedek: önceki akış parolalı broker düğümünü içeriyor',backup2.includes('scada-mqtt-ok-broker-auth'));
 const leaks=(text:string)=>[PASS,WRONG].filter(s=>text.includes(s));
 check('yedek dosyalarında parola yok',backups.every(f=>!leaks(fs.readFileSync(path.join(dataDir,'backups',f),'utf8')).length));
 const tokenRes=await fetch(RED+'/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'node-red-admin',grant_type:'password',scope:'*',username:nrAdmin.username,password:nrAdmin.password})});
 const token=(await tokenRes.json() as any).access_token;
 const flowsText=await (await fetch(RED+'/flows',{headers:{Authorization:'Bearer '+token,'Node-RED-API-Version':'v2'}})).text();
 check('GET /flows parola döndürmüyor',!leaks(flowsText).length&&flowsText.includes('scada-mqtt-ok-broker-auth'));
 const walk=(d:string):string[]=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='node_modules'?[]:walk(path.join(d,e.name))):[path.join(d,e.name)]);
 const plainFiles=walk(nrDir).filter(f=>leaks(fs.readFileSync(f,'latin1')).length);
 check('Node-RED userDir dosyalarında düz metin parola yok'+(plainFiles.length?': '+plainFiles.map(f=>path.relative(nrDir,f)).join(', '):''),!plainFiles.length);
 // Ikinci deploy sonrasi okuma devam ediyor (yeniden baglanti + yeni session ingest'ten gecer).
 const afterDeploy=Date.now();
 check('ikinci deploy sonrası okuma sürüyor',await until(()=>samples.some(s=>s.tagId==='t-json'&&s.receivedAt>afterDeploy+500&&s.quality==='good'),15000));

 // --- Broker durur: sahte good yok ------------------------------------------------------
 feeding=false;await feed;
 const stopAt=Date.now();
 for(const s of sockets)s.destroy();
 await new Promise<void>(r=>brokerServer.close(()=>r()));
 await sleep(6000);
 const late=samples.filter(s=>s.receivedAt>stopAt+300);
 check('broker durunca örnek gelmiyor ('+late.length+'); bayatlık sunucunun staleMs denetimine kalır',late.length===0);
 check('Node-RED broker kopukluğunu logladı',/Disconnected from broker|Connection failed to broker/i.test(log.slice(-4000)));
 await sleep(500);
 check('Node-RED logunda doğru/yanlış parola yok',!leaks(log).length);
 const failLine=log.split('\n').find(l=>l.includes('Connection failed to broker: '+mqttClientId(conn('wrong') as any)));
 console.log('· yanlış parola log satırı:',failLine?failLine.trim().slice(0,200):'(bulunamadı)');
 exitCode=checks.some(c=>!c[1])?1:0;
}catch(e){console.log('✘ hata:',(e as Error).message);exitCode=1;}
finally{
 feeding=false;red.kill();wss.close();
 for(const s of sockets)s.destroy();brokerServer.close();await new Promise<void>(r=>broker.close(()=>r()));
 if(exitCode||process.env.LOG){console.log('\n--- Node-RED log (parolalar maskeli) ---\n'+[PASS,WRONG].reduce((t,s)=>t.replaceAll(s,'***'),log).slice(-6000));}
 await sleep(500);
 fs.rmSync(root,{recursive:true,force:true});
}
console.log(checks.filter(c=>c[1]).length+'/'+checks.length+' denetim geçti');
process.exit(exitCode);
