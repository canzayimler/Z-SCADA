/**
 * BACnet/IP ve EtherNet/IP sürücülerini yalıtılmış ortamda doğrular; canlı sisteme (ZScada 4730/4731, Node-RED 1880,
 * port 3000, kurulu uygulamanın ProgramData veri klasörü), gerçek PLC/BMS cihazına ve LAN'a dokunmaz. Yalnız 127.0.0.0/8 ve yedek portlar.
 * 1) 127.0.0.1:47920/udp'de @innovation-system/node-bacnet ile sahte BACnet cihazı (ReadPropertyMultiple cevaplar: AV
 *    değişen REAL, AV fault bayraklı, BV aç/kapa, MSV, bilinmeyen nesne). İstemci 127.0.0.1:47921'e bağlanır (yerel arayüz
 *    + port bağlantı alanından). Erişilemeyen cihaz: 127.0.0.1:47930 (dinleyen yok), aynı istemciyi paylaşır.
 *    EtherNet/IP: simülatör yok; 127.0.0.1:44818 kapalı port (bağlantı reddi) ve 127.0.0.2:44818'de bağlantıyı kabul edip
 *    hiç cevap vermeyen kara delik.
 * 2) Yalıtılmış Node-RED (1896, geçici userDir, adminAuth) sunucunun GERÇEK deployGateway'iyle akışı uygular; örnekler
 *    15996'daki geçici WebSocket'e gelir ve sunucunun ingest kurallarından geçer.
 * 3) Node-RED süreci bir ön yükleme betiğiyle başlar: her TCP bağlantısı, UDP gönderimi ve UDP bağlaması bir dosyaya
 *    yazılır; sonda hepsinin loopback olduğu ve 47808'e (BACnet yayın portu) hiçbir şey gönderilmediği denetlenir.
 *   npx tsx scripts/bacnet-enip-dogrula.mts      (LOG=1: Node-RED logunu da yazdır)
 */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';
import bcrypt from 'bcryptjs';
import {validateConfig,type Config} from '../packages/contracts/model';
import {deployGateway} from '../apps/server/src/gateway';
import {acceptSource,acceptSampledAt,type SourceState} from '../apps/server/src/ingest';

const require=createRequire(import.meta.url);
const bacnet=require('@innovation-system/node-bacnet');
const BClient=bacnet.default,{ApplicationTag:T,ErrorClass,ErrorCode}=bacnet;
const DEV_PORT=47920,CLIENT_PORT=47921,DEAD_PORT=47930,RED_PORT=1896,WS_PORT=15996,ENIP_HOLE='127.0.0.2';
const RED='http://127.0.0.1:'+RED_PORT;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bacnet-enip-dogrula-'));
const nrDir=path.join(root,'node-red'),dataDir=path.join(root,'data'),netLog=path.join(root,'net.log'),preload=path.join(root,'net-izle.cjs');
fs.mkdirSync(nrDir);fs.mkdirSync(dataDir);fs.writeFileSync(netLog,'');
const checks:[string,boolean][]=[];
const check=(name:string,ok:boolean)=>{checks.push([name,ok]);console.log(ok?'✔':'✘',name);};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>boolean|Promise<boolean>,timeout:number){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return true;await sleep(200);}return false;}

// --- Ag izleme on yuklemesi (Node-RED sureci) -------------------------------------------------
fs.writeFileSync(preload,`const fs=require('fs'),net=require('net'),dgram=require('dgram');const out=${JSON.stringify(netLog)};
const log=(k,h,p)=>{try{fs.appendFileSync(out,k+' '+h+' '+p+'\\n');}catch(e){}};
const oc=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...a){try{let o=a[0];if(Array.isArray(o))o=o[0];
 if(o&&typeof o==='object'){if(o.path)log('ipc',o.path,'');else log('tcp',o.host||'localhost',o.port);}else if(typeof o==='string'&&isNaN(Number(o)))log('ipc',o,'');else log('tcp',typeof a[1]==='string'?a[1]:'localhost',o);}catch(e){}return oc.apply(this,a);};
const os_=dgram.Socket.prototype.send;dgram.Socket.prototype.send=function(...a){try{let port,addr;if(typeof a[1]==='number'&&typeof a[2]==='number'){port=a[3];addr=a[4];}else{port=a[1];addr=a[2];}
 log('udp',typeof addr==='string'?addr:'(adres yok)',port);}catch(e){}return os_.apply(this,a);};
const ob=dgram.Socket.prototype.bind;dgram.Socket.prototype.bind=function(...a){try{const o=a[0];if(o&&typeof o==='object')log('bind',o.address||'0.0.0.0',o.port);else log('bind',typeof a[1]==='string'?a[1]:'0.0.0.0',a[0]);}catch(e){}return ob.apply(this,a);};
const osb=dgram.Socket.prototype.setBroadcast;dgram.Socket.prototype.setBroadcast=function(f){log('setBroadcast',String(f),'');return osb.apply(this,arguments);};`);

// --- Sahte BACnet cihazi ------------------------------------------------------------------------
let tick=0,rpmRequests=0,maxObjects=0,whoIs=0;const senders=new Set<string>();
const dev=new BClient({port:DEV_PORT,interface:'127.0.0.1',apduTimeout:1000,reuseAddr:false});
dev.on('whoIs',()=>{whoIs++;});
dev.on('readPropertyMultiple',(c:any)=>{
 rpmRequests++;senders.add(c.header.sender.address);
 const list=c.payload.properties;maxObjects=Math.max(maxObjects,list.length);
 const values=list.map((o:any)=>({objectId:o.objectId,values:o.properties.map((p:any)=>{
  const {type,instance}=o.objectId;
  if(instance===99)return {property:p,value:[{type:T.ERROR,value:{type:'BacnetError',errorClass:ErrorClass.OBJECT,errorCode:ErrorCode.UNKNOWN_OBJECT}}]};
  if(p.id===111)return {property:p,value:[{type:T.BIT_STRING,value:{bitsUsed:4,value:[type===2&&instance===2?2:0]}}]};
  if(p.id===81)return {property:p,value:[{type:T.BOOLEAN,value:false}]};
  if(p.id===45)return {property:p,value:[{type:T.REAL,value:80}]};
  if(type===5)return {property:p,value:[{type:T.ENUMERATED,value:tick%2}]};
  if(type===19)return {property:p,value:[{type:T.UNSIGNED_INTEGER,value:3}]};
  return {property:p,value:[{type:T.REAL,value:instance===1?20+tick*0.5:instance}]};
 })}));
 dev.readPropertyMultipleResponse(c.header.sender,c.invokeId,values);
});
const tickTimer=setInterval(()=>{tick++;},700);
console.log('sahte BACnet cihazı: udp 127.0.0.1:'+DEV_PORT);

// --- EtherNet/IP kara delik (127.0.0.2:44818) -------------------------------------------------
const holeSockets=new Set<net.Socket>();let holeAccepted=0;
const hole=net.createServer(s=>{holeAccepted++;holeSockets.add(s);s.on('error',()=>{});s.on('close',()=>holeSockets.delete(s));});
await new Promise<void>((r,j)=>{hole.once('error',j);hole.listen(44818,ENIP_HOLE,()=>r());});
const closedFree=await new Promise<boolean>(r=>{const s=net.connect(44818,'127.0.0.1');s.once('connect',()=>{s.destroy();r(false);});s.once('error',()=>r(true));});
if(!closedFree)throw Error('127.0.0.1:44818 dinleniyor; kapalı port senaryosu kurulamaz');
console.log('EtherNet/IP: kapalı 127.0.0.1:44818 · kara delik '+ENIP_HOLE+':44818');

// --- Gecici WebSocket + ingest kurallari --------------------------------------------------------
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
const of=(id:string)=>samples.filter(s=>s.tagId===id);

// --- Yapilandirma --------------------------------------------------------------------------------
const tag=(id:string,deviceId:string,dataType:string,over:Record<string,unknown>)=>({id,deviceId,code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'read',scale:1,offset:0,min:-1e6,max:1e6,unit:'',description:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,...over});
const devc=(id:string,connectionId:string,pollMs=1000)=>({id,connectionId,code:id.toUpperCase(),name:id,slaveId:1,enabled:true,pollMs,staleMs:Math.max(4000,pollMs*3),description:''});
const bn=(id:string,port:number)=>({id,name:'BACnet '+id,protocol:'bacnet',host:'127.0.0.1',port,timeout:1000,bacnetDeviceInstance:1201,bacnetLocalAddress:'127.0.0.1',bacnetLocalPort:CLIENT_PORT});
const en=(id:string,host:string)=>({id,name:'ENIP '+id,protocol:'enip',host,port:44818,slot:0,timeout:3000});
const extra=Array.from({length:20},(_,i)=>tag('x'+i,'bd1','float32',{bacnetObjectType:'analog-value',bacnetInstance:100+i}));
const config:Config=validateConfig({revision:1,name:'BACnet/EtherNet-IP dogrula',
 connections:[bn('b1',DEV_PORT),bn('b2',DEAD_PORT),en('e1','127.0.0.1'),en('e2',ENIP_HOLE)],
 devices:[devc('bd1','b1'),devc('bd2','b2'),devc('ed1','e1'),devc('ed2','e2')],
 tags:[
  tag('av1','bd1','float32',{bacnetObjectType:'analog-value',bacnetInstance:1,scale:2,offset:1}),
  tag('av1-hl','bd1','float32',{bacnetObjectType:'analog-value',bacnetInstance:1,bacnetProperty:'high-limit'}),
  tag('av1-oos','bd1','bool',{bacnetObjectType:'analog-value',bacnetInstance:1,bacnetProperty:'out-of-service'}),
  tag('av2-fault','bd1','float32',{bacnetObjectType:'analog-value',bacnetInstance:2}),
  tag('bv1','bd1','bool',{bacnetObjectType:'binary-value',bacnetInstance:1}),
  tag('msv1','bd1','uint16',{bacnetObjectType:'multi-state-value',bacnetInstance:1}),
  tag('ai99','bd1','float32',{bacnetObjectType:'analog-input',bacnetInstance:99}),
  ...extra,
  tag('dead','bd2','float32',{bacnetObjectType:'analog-value',bacnetInstance:1}),
  tag('e-sp','ed1','float32',{cipTag:'Program:Main.Setpoint',access:'readwrite',min:0,max:100}),
  tag('e-run','ed1','bool',{cipTag:'Calis',access:'readwrite',min:0,max:1}),
  tag('e-temp','ed1','float32',{cipTag:'Sicaklik'}),
  tag('e2-sp','ed2','int32',{cipTag:'Hiz',access:'readwrite',min:0,max:1000}),
 ],commands:[]});
const nrAdmin={username:'scada',password:randomUUID()};
fs.writeFileSync(path.join(dataDir,'nodered-admin.json'),JSON.stringify(nrAdmin));

// --- Yalitilmis Node-RED --------------------------------------------------------------------------
fs.writeFileSync(path.join(nrDir,'flows.json'),'[]');
fs.writeFileSync(path.join(nrDir,'settings.js'),`module.exports={uiHost:'127.0.0.1',uiPort:${RED_PORT},flowFile:'flows.json',credentialSecret:${JSON.stringify(randomUUID())},
 diagnostics:{enabled:false},telemetry:{enabled:false},
 adminAuth:{type:'credentials',users:[{username:${JSON.stringify(nrAdmin.username)},password:${JSON.stringify(bcrypt.hashSync(nrAdmin.password,10))},permissions:'*'}]},logging:{console:{level:'info'}}};`);
const red=spawn(process.execPath,['--require',preload,'node_modules/node-red/red.js','--userDir',nrDir,'--settings',path.join(nrDir,'settings.js'),'-p',String(RED_PORT)],{stdio:['ignore','pipe','pipe']});
let log='';red.stdout.on('data',d=>{log+=d;});red.stderr.on('data',d=>{log+=d;});
let exitCode=1;
try{
 if(!await until(async()=>{try{return (await fetch(RED+'/auth/login')).ok;}catch{return false;}},60000))throw Error('Node-RED açılmadı');
 const d1=await deployGateway(config,'tok',WS_PORT,dataDir,RED);
 console.log('deployGateway:',d1.diff.added.length,'düğüm eklendi');
 await sleep(1500);
 check('Node-RED: bilinmeyen/eksik düğüm tipi yok (zscada-bacnet-*, eth-ip * yüklendi)',!/missing types|Waiting for missing|Unknown type|unknown type/i.test(log));
 check('BACnet istemcisi yalnız 127.0.0.1:'+CLIENT_PORT+' dinliyor (log)',log.includes('BACnet istemci dinliyor: 127.0.0.1:'+CLIENT_PORT)&&!/BACnet istemci dinliyor: (?!127\.0\.0\.1:)/.test(log));
 check('BACnet hedefleri tekil loopback (log)',log.includes('BACnet hedef: 127.0.0.1:'+DEV_PORT)&&log.includes('BACnet hedef: 127.0.0.1:'+DEAD_PORT));

 // --- BACnet okuma ----------------------------------------------------------------------------
 await until(()=>of('av1').filter(s=>s.quality==='good').length>=4&&of('dead').length>=2,25000);
 const a=last('av1');
 check('BACnet AV present-value ölçekli (x*2+1) good: '+a?.value,a?.quality==='good'&&typeof a.value==='number'&&(a.value-1)/2>=20);
 check('BACnet AV değeri turdan tura değişiyor',new Set(of('av1').filter(s=>s.quality==='good').map(s=>s.value)).size>=2);
 check('BACnet high-limit (REAL 80) ve out-of-service (false) good',last('av1-hl')?.value===80&&last('av1-hl')?.quality==='good'&&last('av1-oos')?.value===false&&last('av1-oos')?.quality==='good');
 check('BACnet status-flags fault → bad (sahte good yok)',of('av2-fault').length>0&&of('av2-fault').every(s=>s.quality==='bad'&&s.value===null));
 const bvs=of('bv1');
 check('BACnet BV ENUMERATED 1/0 → true/false good',bvs.some(s=>s.value===true)&&bvs.some(s=>s.value===false)&&bvs.every(s=>s.quality==='good'));
 check('BACnet MSV unsigned 3 good',last('msv1')?.value===3&&last('msv1')?.quality==='good');
 check('BACnet unknown-object → yalnız o etiket bad',of('ai99').length>0&&of('ai99').every(s=>s.quality==='bad'));
 check('BACnet 26 nesne → parçalı RPM, istek başına en çok 16 nesne (en büyük: '+maxObjects+')',maxObjects===16&&last('x19')?.quality==='good'&&last('x19')?.value===119);
 check('BACnet erişilemeyen cihaz: yalnız bad, hiç good yok ('+of('dead').length+' örnek)',of('dead').length>0&&of('dead').every(s=>s.quality==='bad'));
 const deadFirst=of('dead')[0]?.receivedAt??0;
 await until(()=>of('dead').some(s=>s.receivedAt>deadFirst+1500),10000);
 check('BACnet erişilemeyen cihazda yoklama sürüyor (asılı kalmadı)',of('dead').some(s=>s.receivedAt>deadFirst+1500));
 check('BACnet erişilemeyen cihaz aynı istemcideki sağlam cihazı bozmadı (istemci hatası yok, av1 good sürüyor)',!/BACnet istemci hatası/.test(log)&&last('av1')?.receivedAt>deadFirst+1000&&last('av1')?.quality==='good');
 check('sahte cihaz yalnız 127.0.0.1:'+CLIENT_PORT+' adresinden istek aldı ('+[...senders].join(', ')+'), Who-Is almadı',[...senders].length===1&&senders.has('127.0.0.1:'+CLIENT_PORT)&&whoIs===0);

 // --- EtherNet/IP ------------------------------------------------------------------------------
 await sleep(2000);
 check('EtherNet/IP kapalı port ve kara delik: hiç good örnek yok',!samples.some(s=>/^e/.test(s.tagId)&&s.quality==='good'));
 check('EtherNet/IP kara deliğe bağlantı denendi ('+holeAccepted+' kabul)',holeAccepted>0);
 let n=0;
 async function write(tagId:string,value:unknown){
  const t0=Date.now();
  const r=await fetch(RED+'/scada-bridge/command',{method:'POST',headers:{'Content-Type':'application/json','x-scada-token':'tok'},body:JSON.stringify({tagId,value,commandId:'dogrula-'+(++n),expiresAt:Date.now()+4500,revision:config.revision}),signal:AbortSignal.timeout(9000)}).catch(e=>({status:0,json:async()=>({error:String(e)})}) as any);
  return {status:r.status as number,body:await r.json().catch(()=>null) as any,ms:Date.now()-t0};
 }
 const w0=await write('e-sp',10);
 check('EtherNet/IP yazma, okunmamış etiket: bekçi 409 hızlı ('+w0.status+' '+w0.body?.error+', '+w0.ms+' ms)',w0.status===409&&w0.ms<1500);
 // Hazirlik dugumunun 503 kapisini calistirmak icin YALNIZ bu yalitilmis Node-RED'de etiketleri taze isaretleyen test dugumu.
 const tokenRes=await fetch(RED+'/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'node-red-admin',grant_type:'password',scope:'*',username:nrAdmin.username,password:nrAdmin.password})});
 const token=(await tokenRes.json() as any).access_token;
 const auth={Authorization:'Bearer '+token,'Node-RED-API-Version':'v2'};
 const current=await (await fetch(RED+'/flows',{headers:auth})).json() as any;
 const types=new Set(current.flows.map((n:any)=>n.type));
 check('akışta eth-ip endpoint/in/out, status, complete, catch ve zscada-bacnet-* düğümleri var',['eth-ip endpoint','eth-ip in','eth-ip out','status','complete','catch','zscada-bacnet-client','zscada-bacnet-read'].every(t=>types.has(t)));
 current.flows.push({id:'test-fresh-clock',type:'inject',z:'scada-gateway',name:'TEST taze',props:[{p:'payload'}],repeat:'0.3',once:true,onceDelay:0.1,x:100,y:2600,wires:[['test-fresh']]},
  {id:'test-fresh',type:'function',z:'scada-gateway',name:'TEST taze işaretle',outputs:1,func:"for(const id of ['e-sp','e-run','e2-sp'])flow.set('fresh-'+id,Date.now());return null;",x:300,y:2600,wires:[[]]});
 const post=await fetch(RED+'/flows',{method:'POST',headers:{...auth,'Content-Type':'application/json','Node-RED-Deployment-Type':'full'},body:JSON.stringify({rev:current.rev,flows:current.flows})});
 if(!post.ok)throw Error('test düğümü eklenemedi: '+post.status);
 await sleep(1500);
 const w1=await write('e-sp',10),w2=await write('e-run',true),w3=await write('e2-sp',5);
 check('EtherNet/IP kapalı port: yazma 503 hızlı, kuyruğa alınmadı ('+w1.status+' '+w1.body?.error+', '+w1.ms+' ms)',w1.status===503&&/hazır değil/.test(w1.body?.error||'')&&w1.ms<1500);
 check('EtherNet/IP bool yazma da 503 ('+w2.status+', '+w2.ms+' ms)',w2.status===503&&w2.ms<1500);
 check('EtherNet/IP kara delik: yazma 503 hızlı ('+w3.status+' '+w3.body?.error+', '+w3.ms+' ms)',w3.status===503&&w3.ms<1500);
 const w4=await write('e-sp',500);
 check('EtherNet/IP sınır dışı değer de reddedilir, 2xx yok ('+w4.status+')',w4.status>=400);
 const w5=await write('e-temp',1);
 check('EtherNet/IP salt okunur etiket → 400 ('+w5.status+')',w5.status===400);
 check('BACnet etiketi yazma rotasında yok → 400',(await write('av1',1)).status===400);
 await sleep(1000);
 check('yeniden deploy sonrası BACnet okuma sürüyor',await until(()=>last('av1')?.receivedAt>Date.now()-2500&&last('av1')?.quality==='good',8000));

 // --- Sira + ingest + ag denetimi ----------------------------------------------------------------
 const bySource=new Map<string,any[]>();for(const m of messages)(bySource.get(m.source)??bySource.set(m.source,[]).get(m.source)!).push(m);
 const mono=[...bySource.values()].every(l=>l.every((m,k)=>k===0||m.session!==l[k-1].session||m.sequence>l[k-1].sequence));
 check('sıra: '+bySource.size+' kaynak, oturum içinde kesin artan sequence',bySource.size>=2&&mono);
 check('ingest kuralları: reddedilen mesaj/örnek yok ('+rejects+')',rejects===0);
 check('Node-RED çalışmaya devam ediyor',red.exitCode===null&&(await fetch(RED+'/auth/login')).ok);
 const lines=fs.readFileSync(netLog,'utf8').split('\n').filter(Boolean);
 const loop=(h:string)=>/^127\./.test(h)||h==='localhost'||h==='::1'||h==='::ffff:127.0.0.1';
 const tcp=lines.filter(l=>l.startsWith('tcp ')),udp=lines.filter(l=>l.startsWith('udp ')),binds=lines.filter(l=>l.startsWith('bind '));
 const foreign=[...tcp,...udp].filter(l=>!loop(l.split(' ')[1]));
 console.log('· ağ kaydı: '+tcp.length+' tcp bağlantı, '+udp.length+' udp gönderim, bağlamalar: '+[...new Set(binds)].join(' | '));
 console.log('· tcp hedefleri: '+[...new Set(tcp.map(l=>l.slice(4)))].join(', '));
 console.log('· udp hedefleri: '+[...new Set(udp.map(l=>l.slice(4)))].join(', '));
 check('Node-RED süreci yalnız loopback adreslere bağlandı/gönderdi (dış adres: '+(foreign.length?[...new Set(foreign)].join(', '):'yok')+')',foreign.length===0&&tcp.length>0&&udp.length>0);
 check('47808\'e (BACnet yayın/varsayılan port) ve 255.255.255.255\'e UDP gönderimi yok',!udp.some(l=>/ 47808$/.test(l)||l.includes('255.255.255.255')));
 check('UDP bağlaması yalnız 127.0.0.1:'+CLIENT_PORT,binds.length>0&&binds.every(l=>l==='bind 127.0.0.1 '+CLIENT_PORT));
 console.log('· sahte cihaz: '+rpmRequests+' RPM isteği · kara delik kabul: '+holeAccepted);
 exitCode=checks.some(c=>!c[1])?1:0;
}catch(e){console.log('✘ hata:',(e as Error).message);exitCode=1;}
finally{
 red.kill();wss.close();clearInterval(tickTimer);
 try{dev.close();}catch{/* */}
 for(const s of holeSockets)s.destroy();hole.close();
 if(exitCode||process.env.LOG)console.log('\n--- Node-RED log ---\n'+log.slice(-8000));
 await sleep(500);
 fs.rmSync(root,{recursive:true,force:true});
}
console.log(checks.filter(c=>c[1]).length+'/'+checks.length+' denetim geçti');
process.exit(exitCode);
