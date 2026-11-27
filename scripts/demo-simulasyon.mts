/**
 * Canlı demo simülasyonu: Z SCADA'nın her protokolle çalıştığını tarayıcıda izlenebilir biçimde gösterir.
 * Kurulu uygulama varsa (Windows kurulumu, Z_SCADA_DIR ile değiştirilebilir) onun dosyalarını, yoksa bu deponun
 * derlemesini (`npm run build` sonrası) kullanır. Canlı servise (ZScada, 4730/4731), Node-RED 1880'e, port 3000'e,
 * kurulu uygulamanın ProgramData veri klasörüne, gerçek PLC/cihaz/broker/veritabanına ve LAN'a DOKUNMAZ:
 *  - tüm simülatörler yalnız 127.0.0.1'e bağlanır, yayın (broadcast) gönderilmez;
 *  - ayrı bir uygulama kopyası değil, kurulu dosyalar SALT OKUNUR çalıştırılır (runtime\node.exe + app\),
 *    veri klasörü işletim sisteminin geçici klasöründe yeni açılır; Program Files'a yazılmaz;
 *  - portlar: web 4830, Node-RED 1895 (kurulumdaki ikinci port Node-RED'dir; 4831 kullanılmaz).
 * Akış:
 *  1) Simülatörler: Modbus TCP 15502, OPC UA 14840 (kullanıcı/parola), S7 11202 (sahte PLC), MQTT 11883 (aedes),
 *     HTTP/JSON 18180, SNMP v2c udp 11261, BACnet/IP udp 47920 (istemci 47921). Değerler zamanla değişir;
 *     Modbus/OPC UA/S7 setpoint'leri yazılabilir ve yazılan değer simülatörde kalır (geri okuma doğrular).
 *  2) Kurulu uygulamanın başlatıcısının (ZScada.cs) yaptığını yapar: scripts/nodered-guvenlik.ts → Node-RED
 *     (--userDir/--settings geçici veri klasöründe) → apps/server/src/index.ts (SCADA_DATA/SCADA_PORT/NODERED_URL).
 *     İlk yönetici hazirla.ts'in 1. adımıyla aynı biçimde açılır (admin-access.json). hazirla.ts'in kendisi
 *     ÇALIŞTIRILMAZ: kurulu paket/project.json'u (gerçek saha adresleri) içe aktarırdı.
 *  3) API ile proje: her protokolden bağlantı + cihaz + 3-4 etiket, OPC UA parolası ve SNMP community sır API'siyle,
 *     MQTT dışa yayın, komutlar, "Simülasyon" ekranı (symbolStyle 'detailed'), deploy, ekran yayını.
 *  4) Her 5 sn durum tablosu; tüm etiketler good olunca yazılabilir her protokole arayüzle aynı komut API'siyle
 *     bir yazma ve 'verified' (sunucu geri okuması) denetimi.
 *  5) Ctrl+C ya da geçici klasöre DURDUR dosyası: süreçleri kapatır, geçici klasörü siler.
 * ADS, EtherNet/IP ve SQL Server için simülatör yoktur; sahte veri ÜRETİLMEZ.
 *   npx tsx scripts/demo-simulasyon.mts       (Z_SCADA_DIR=... kurulum kökünü değiştirir)
 */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn,type ChildProcess} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {Aedes} from 'aedes';
import {OPCUAServer,Variant,DataType,StatusCodes} from 'node-opcua';
import {startFakeS7} from './s7-sahte-plc.mts';

const require=createRequire(import.meta.url);
const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const WEB_PORT=4830,RED_PORT=1895;
const MB_PORT=15502,OPC_PORT=14840,S7_PORT=11202,MQTT_PORT=11883,HTTP_PORT=18180,SNMP_PORT=11261,BAC_DEV_PORT=47920,BAC_CLIENT_PORT=47921;
const FORBIDDEN=[4730,4731,1880,3000];
const BASE=`http://127.0.0.1:${WEB_PORT}`;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const ts=()=>new Date().toLocaleTimeString('tr-TR');
async function until(fn:()=>boolean|Promise<boolean>,timeout:number,step=300){const end=Date.now()+timeout;while(Date.now()<end){try{if(await fn())return true;}catch{/* tekrar */}await sleep(step);}return false;}

// --- Kurulu uygulama mı, depo derlemesi mi ---------------------------------------------------------------
const INSTALL=process.env.Z_SCADA_DIR||'C:\\Program Files\\Z SCADA';
let APP=path.join(INSTALL,'app'),NODE=path.join(INSTALL,'runtime','node.exe'),usingInstalled=true;
if(!fs.existsSync(NODE)||!fs.existsSync(path.join(APP,'apps','server','src','index.ts'))||!fs.existsSync(path.join(APP,'dist','web','index.html'))){
 usingInstalled=false;APP=REPO;NODE=process.execPath;
 if(!fs.existsSync(path.join(APP,'dist','web','index.html')))throw Error('Kurulu uygulama yok ve depoda dist/web yok: önce `npm run build`.');
 console.log('UYARI: kurulu uygulama bulunamadı ('+INSTALL+'); YEDEK YOL: depo derlemesi ('+REPO+') kullanılıyor.');
}

// --- Port güvenliği: yasak portlar hiç kullanılmaz, demo portları boş olmalı -----------------------------
for(const p of [WEB_PORT,RED_PORT,MB_PORT,OPC_PORT,S7_PORT,MQTT_PORT,HTTP_PORT])if(FORBIDDEN.includes(p))throw Error('yasak port '+p);
async function tcpFree(port:number){return new Promise<boolean>(r=>{const s=net.createServer();s.once('error',()=>r(false));s.listen(port,'127.0.0.1',()=>s.close(()=>r(true)));});}
for(const p of [WEB_PORT,RED_PORT,MB_PORT,OPC_PORT,S7_PORT,MQTT_PORT,HTTP_PORT])if(!await tcpFree(p))throw Error(`Port ${p} dolu; başka bir demo çalışıyor olabilir.`);

const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'zscada-demo-'));
const DATA=path.join(ROOT,'data'),LOGS=path.join(ROOT,'logs'),STOP_FILE=path.join(ROOT,'DURDUR');
fs.mkdirSync(DATA);fs.mkdirSync(LOGS);
console.log(`[${ts()}] Demo kökü: ${ROOT}`);

// =========================================================================================================
// 1) SİMÜLATÖRLER (yalnız 127.0.0.1)
// =========================================================================================================
const t0=Date.now(),secs=()=>(Date.now()-t0)/1000;
const phase10=()=>Math.floor(secs()/10)%2===0;// ~10 sn'de bir değişen çalışma bitleri

// --- Modbus TCP: alan başına ayrı bellek; FC1-6, 15, 16 -----------------------------------------------
const mb={coil:new Map<number,boolean>(),di:new Map<number,boolean>(),hr:new Map<number,number>(),ir:new Map<number,number>()};
let mbWrites=0;
mb.hr.set(10,455);// pompa hız setpoint'i %45.5 (ölçek 0.1)
const mbClients=new Set<net.Socket>();
const mbServer=net.createServer(socket=>{mbClients.add(socket);socket.on('close',()=>mbClients.delete(socket));socket.on('error',()=>{});let bytes=Buffer.alloc(0);
 socket.on('data',chunk=>{bytes=Buffer.concat([bytes,Buffer.from(chunk)]);
  while(bytes.length>=7&&bytes.length>=6+bytes.readUInt16BE(4)){const length=6+bytes.readUInt16BE(4),q=bytes.subarray(0,length);bytes=bytes.subarray(length);
   const unit=q[6],fc=q[7],addr=q.readUInt16BE(8),quantity=q.readUInt16BE(10);let pdu:Buffer;
   if(unit!==1)pdu=Buffer.from([fc|128,0x0b]);
   else if(fc===1||fc===2){const m=fc===1?mb.coil:mb.di;pdu=Buffer.alloc(2+Math.ceil(quantity/8));pdu[0]=fc;pdu[1]=pdu.length-2;for(let i=0;i<quantity;i++)if(m.get(addr+i))pdu[2+(i>>3)]|=1<<(i%8);}
   else if(fc===3||fc===4){const m=fc===3?mb.hr:mb.ir;pdu=Buffer.alloc(2+quantity*2);pdu[0]=fc;pdu[1]=quantity*2;for(let i=0;i<quantity;i++)pdu.writeUInt16BE((m.get(addr+i)||0)&0xffff,2+i*2);}
   else if(fc===5){mbWrites++;mb.coil.set(addr,quantity===0xff00);pdu=Buffer.from(q.subarray(7,12));}
   else if(fc===6){mbWrites++;mb.hr.set(addr,quantity);pdu=Buffer.from(q.subarray(7,12));}
   else if(fc===15){mbWrites++;for(let i=0;i<quantity;i++)mb.coil.set(addr+i,!!(q[13+(i>>3)]&(1<<(i%8))));pdu=Buffer.from(q.subarray(7,12));}
   else if(fc===16){mbWrites++;for(let i=0;i<quantity;i++)mb.hr.set(addr+i,q.readUInt16BE(13+i*2));pdu=Buffer.from(q.subarray(7,12));}
   else pdu=Buffer.from([fc|128,1]);
   const r=Buffer.alloc(7+pdu.length);q.copy(r,0,0,4);r.writeUInt16BE(pdu.length+1,4);r[6]=unit;pdu.copy(r,7);socket.write(r);}
 });});
await new Promise<void>(r=>mbServer.listen(MB_PORT,'127.0.0.1',()=>r()));
const toInt16=(v:number)=>{const x=Math.round(v);return x<0?x+65536:x;};
function tickModbus(){
 mb.hr.set(0,toInt16((50+30*Math.sin(secs()/30*Math.PI))*10));// tank seviyesi %20-80, 60 sn periyot
 mb.di.set(0,phase10());// pompa çalışıyor
}

// --- OPC UA (yalnız kullanıcı/parola) -------------------------------------------------------------------
const OPC_USER='demo-operator',OPC_PASS='Demo-Opc-'+randomBytes(6).toString('hex');
const opc={temp:65,run:true,setpoint:70 as number,count:0};
let opcWrites=0;
const opcServer=new OPCUAServer({port:OPC_PORT,host:'127.0.0.1',hostname:'127.0.0.1',alternateHostname:['127.0.0.1'],resourcePath:'/UA/Demo',
 buildInfo:{productName:'ZScadaDemo'},allowAnonymous:false,userManager:{isValidUser:(u:string,p:string)=>u===OPC_USER&&p===OPC_PASS}} as any);
await opcServer.initialize();
{const space=opcServer.engine.addressSpace!,ns=space.getOwnNamespace();
 const hat=ns.addObject({organizedBy:space.rootFolder.objects,browseName:'Firin'});
 ns.addVariable({componentOf:hat,browseName:'Sicaklik',nodeId:'s=Sicaklik',dataType:'Double',minimumSamplingInterval:100,value:{get:()=>new Variant({dataType:DataType.Double,value:opc.temp})}});
 ns.addVariable({componentOf:hat,browseName:'Calisiyor',nodeId:'s=Calisiyor',dataType:'Boolean',minimumSamplingInterval:100,value:{get:()=>new Variant({dataType:DataType.Boolean,value:opc.run})}});
 ns.addVariable({componentOf:hat,browseName:'Sayac',nodeId:'s=Sayac',dataType:'Int32',minimumSamplingInterval:100,value:{get:()=>new Variant({dataType:DataType.Int32,value:opc.count})}});
 ns.addVariable({componentOf:hat,browseName:'Setpoint',nodeId:'s=Setpoint',dataType:'Float',minimumSamplingInterval:100,
  accessLevel:'CurrentRead | CurrentWrite',userAccessLevel:'CurrentRead | CurrentWrite',
  value:{get:()=>new Variant({dataType:DataType.Float,value:opc.setpoint}),
   set:(v:Variant)=>{if(v.dataType!==DataType.Float)return StatusCodes.BadTypeMismatch;opc.setpoint=v.value;opcWrites++;return StatusCodes.Good;}}});}
await opcServer.start();
function tickOpc(){
 // Fırın sıcaklığı setpoint'e doğru sürüklenir + küçük gürültü; sayaç saniyede bir artar.
 opc.temp+=(opc.setpoint-opc.temp)*0.05+(Math.random()-0.5)*0.4;
 opc.run=phase10();
}
const opcCounter=setInterval(()=>{opc.count++;},1000);

// --- S7 (sahte PLC, s7-sahte-plc.mts) -----------------------------------------------------------------
const s7=await startFakeS7(S7_PORT);
const db1=Buffer.alloc(256);db1.writeInt16BE(1200,4);s7.memory.set('DB1',db1);
const mArea=Buffer.alloc(256);s7.memory.set('M',mArea);
let s7Count=0;
function tickS7(){
 db1.writeFloatBE(5+1.2*Math.sin(secs()/20*Math.PI),0);// hat basıncı 3.8-6.2 bar
 db1.writeInt32BE(s7Count,8);
 mArea[0]=phase10()?mArea[0]|1:mArea[0]&~1;// M0.0 kompresör çalışıyor
}
const s7Counter=setInterval(()=>{s7Count+=3;},1000);

// --- MQTT (aedes, kimliksiz, yalnız loopback) --------------------------------------------------------------
const broker=await Aedes.createBroker();
const outbound:{topic:string;payload:string;at:number}[]=[];
broker.on('publish',(packet:any,client:any)=>{if(client&&packet.topic.startsWith('zscada/demo/')){outbound.push({topic:packet.topic,payload:packet.payload.toString(),at:Date.now()});if(outbound.length>200)outbound.shift();}});
const mqttServer=net.createServer(broker.handle);
const mqttSockets=new Set<net.Socket>();mqttServer.on('connection',s=>{mqttSockets.add(s);s.on('close',()=>mqttSockets.delete(s));});
await new Promise<void>(r=>mqttServer.listen(MQTT_PORT,'127.0.0.1',()=>r()));
const mqttPub=(topic:string,payload:string)=>new Promise<void>(r=>broker.publish({cmd:'publish',topic,payload:Buffer.from(payload),qos:0,retain:false,dup:false} as any,()=>r()));
function tickMqtt(){
 const flow=40+8*Math.sin(secs()/25*Math.PI)+(Math.random()-0.5),press=2.5+0.3*Math.cos(secs()/15*Math.PI);
 void mqttPub('demo/hat1/olcum',JSON.stringify({data:{debi:Number(flow.toFixed(2)),basinc:Number(press.toFixed(3))},at:new Date().toISOString()}));
 void mqttPub('demo/hat1/durum',phase10()?'on':'off');
}

// --- HTTP/JSON (kimliksiz, yalnız loopback) ------------------------------------------------------------------
let httpHits=0;
const httpServer=http.createServer((req,res)=>{
 if(req.url==='/api/enerji'){httpHits++;
  const power=120+25*Math.sin(secs()/40*Math.PI)+(Math.random()-0.5)*2,volt=400+3*Math.sin(secs()/7);
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({data:{guc_kw:Number(power.toFixed(2)),gerilim:Number(volt.toFixed(1))},sebeke:phase10()?'on':'off',at:new Date().toISOString()}));return;}
 res.writeHead(404);res.end();
});
await new Promise<void>(r=>httpServer.listen(HTTP_PORT,'127.0.0.1',()=>r()));

// --- SNMP v2c ajanı (net-snmp; node-red-node-snmp'nin kopyası) --------------------------------------------
const snmp=require(require.resolve('net-snmp',{paths:[path.join(REPO,'node_modules','node-red-node-snmp')]}));
const COMMUNITY='demo-comm-'+randomBytes(4).toString('hex');
let snmpRequests=0;
const agent=snmp.createAgent({port:SNMP_PORT,address:'127.0.0.1',disableAuthorization:false},(err:any)=>{if(!err)snmpRequests++;});
agent.getAuthorizer().addCommunity(COMMUNITY);
const mib=agent.getMib();
const scalar=(name:string,oid:string,value:number)=>{mib.registerProvider({name,type:snmp.MibProviderType.Scalar,oid,scalarType:snmp.ObjectType.Integer,maxAccess:snmp.MaxAccess['read-only']});mib.setScalarValue(name,value);};
scalar('upsSarj','1.3.6.1.4.1.99999.2.1',95);scalar('upsSicaklik','1.3.6.1.4.1.99999.2.2',284);scalar('upsSebeke','1.3.6.1.4.1.99999.2.3',1);
function tickSnmp(){
 const t=secs();mib.setScalarValue('upsSarj',Math.round(80+20*Math.abs(Math.sin(t/60*Math.PI))));
 mib.setScalarValue('upsSicaklik',Math.round(280+15*Math.sin(t/30*Math.PI)));
 mib.setScalarValue('upsSebeke',phase10()?1:0);
}

// --- BACnet/IP sahte cihaz (udp 127.0.0.1:47920; Who-Is/yayın yok) -----------------------------------------
const bacnet=require('@innovation-system/node-bacnet');
const {ApplicationTag:T}=bacnet;
let bacRequests=0;const bac={temp:22.0,hum:45.0};
const bacDev=new bacnet.default({port:BAC_DEV_PORT,interface:'127.0.0.1',broadcastAddress:'127.0.0.1',apduTimeout:1000,reuseAddr:false});
bacDev.on('error',()=>{});
bacDev.on('readPropertyMultiple',(c:any)=>{
 bacRequests++;
 const values=c.payload.properties.map((o:any)=>({objectId:o.objectId,values:o.properties.map((p:any)=>{
  const {type,instance}=o.objectId;
  if(p.id===111)return {property:p,value:[{type:T.BIT_STRING,value:{bitsUsed:4,value:[0]}}]};
  if(p.id===81)return {property:p,value:[{type:T.BOOLEAN,value:false}]};
  if(type===5)return {property:p,value:[{type:T.ENUMERATED,value:phase10()?1:0}]};
  return {property:p,value:[{type:T.REAL,value:instance===1?bac.temp:instance===2?bac.hum:0}]};
 })}));
 bacDev.readPropertyMultipleResponse(c.header.sender,c.invokeId,values);
});
function tickBacnet(){bac.temp=Math.min(26,Math.max(19,bac.temp+(Math.random()-0.5)*0.3));bac.hum=48+6*Math.sin(secs()/45*Math.PI);}

const simTimer=setInterval(()=>{tickModbus();tickOpc();tickS7();tickMqtt();tickSnmp();tickBacnet();},1000);
tickModbus();tickOpc();tickS7();tickSnmp();tickBacnet();
console.log(`[${ts()}] Simülatörler hazır (127.0.0.1): Modbus ${MB_PORT} · OPC UA ${OPC_PORT} · S7 ${S7_PORT} · MQTT ${MQTT_PORT} · HTTP ${HTTP_PORT} · SNMP udp/${SNMP_PORT} · BACnet udp/${BAC_DEV_PORT}`);
console.log('ADS, EtherNet/IP ve SQL Server: simülatör yok — bu protokoller simüle EDİLMEDİ (sahte veri üretilmez).');

// =========================================================================================================
// 2) KURULU UYGULAMANIN AYRI KOPYASI (başlatıcı ZScada.cs ile aynı sıra/ortam)
// =========================================================================================================
const children:ChildProcess[]=[];
const env={...process.env,SCADA_DATA:DATA,SCADA_PORT:String(WEB_PORT),SCADA_HOST:'127.0.0.1',NODERED_URL:'http://127.0.0.1:'+RED_PORT,VITE_CONFIG_NATIVE_IGNORE_WARNING:'true'};
for(const k of Object.keys(env))if(/^NODE_OPTIONS$|^TSX_/i.test(k))delete (env as any)[k];
function startChild(name:string,args:string[]){
 const out=fs.createWriteStream(path.join(LOGS,name+'.log'));
 const child=spawn(NODE,args,{cwd:APP,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stdout!.pipe(out);child.stderr!.pipe(out);children.push(child);
 child.on('exit',code=>{if(!stopping)console.log(`[${ts()}] UYARI: ${name} kapandı (çıkış ${code}). Log: ${path.join(LOGS,name+'.log')}`);});
 return child;
}
function runScript(name:string,args:string[]){
 return new Promise<void>((resolve,reject)=>{const c=spawn(NODE,args,{cwd:APP,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let text='';c.stdout.on('data',d=>{text+=d;});c.stderr.on('data',d=>{text+=d;});
  c.on('exit',code=>{fs.writeFileSync(path.join(LOGS,name+'.log'),text);code===0?resolve():reject(Error(name+' çıkış '+code+': '+text.slice(-800)));});});
}
let stopping=false;
async function shutdown(code=0){
 if(stopping)return;stopping=true;
 console.log(`\n[${ts()}] Kapatılıyor...`);
 clearInterval(simTimer);clearInterval(opcCounter);clearInterval(s7Counter);
 try{live?.close();}catch{/* */}
 for(const c of children){try{c.kill();}catch{/* */}}
 await Promise.race([Promise.all(children.map(c=>c.exitCode!==null?Promise.resolve():new Promise(r=>c.once('exit',r)))),sleep(8000)]);
 for(const s of mbClients)s.destroy();mbServer.close();
 for(const s of mqttSockets)s.destroy();mqttServer.close();try{broker.close();}catch{/* */}
 httpServer.close();try{agent.close();}catch{/* */}try{bacDev.close();}catch{/* */}
 await s7.close().catch(()=>{});await opcServer.shutdown(200).catch(()=>{});
 if(code===0){for(let i=0;i<10;i++){try{fs.rmSync(ROOT,{recursive:true,force:true});break;}catch{await sleep(500);}}}
 console.log(`[${ts()}] Kapatıldı; geçici klasör ${fs.existsSync(ROOT)?(code===0?'SİLİNEMEDİ: ':'hata incelemesi için bırakıldı: ')+ROOT:'silindi'}.`);
 process.exit(code);
}
for(const sig of ['SIGINT','SIGTERM','SIGBREAK','SIGHUP'] as const)process.on(sig,()=>void shutdown(0));
const stopWatch=setInterval(()=>{if(fs.existsSync(STOP_FILE))void shutdown(0);},2000);stopWatch.unref?.();

let live:WebSocket|null=null;
try{
 console.log(`[${ts()}] Uygulama: ${usingInstalled?'KURULU (salt okunur) '+APP:'DEPO YEDEĞİ '+APP} · node ${NODE}`);
 await runScript('nodered-guvenlik',['--import','tsx','scripts/nodered-guvenlik.ts']);
 const nrDir=path.join(DATA,'node-red');
 startChild('node-red',['node_modules/node-red/red.js','--userDir',nrDir,'--settings',path.join(nrDir,'settings.js'),'-p',String(RED_PORT)]);
 if(!await until(async()=>(await fetch(`http://127.0.0.1:${RED_PORT}/auth/login`)).ok,120000,500))throw Error('Node-RED açılmadı');
 console.log(`[${ts()}] Node-RED hazır: 127.0.0.1:${RED_PORT}`);
 startChild('server',['--max-http-header-size=32768','--import','tsx','apps/server/src/index.ts']);
 if(!await until(async()=>(await fetch(BASE+'/api/health')).ok,90000,500))throw Error('Sunucu açılmadı');
 console.log(`[${ts()}] Sunucu hazır: ${BASE}`);

 // --- İlk yönetici (hazirla.ts 1. adımıyla aynı: admin + rastgele parola, admin-access.json) ----------------
 let cookie='';
 async function api<T=any>(url:string,method='GET',body?:unknown):Promise<T>{
  const r=await fetch(BASE+'/api'+url,{method,headers:{'Content-Type':'application/json','x-scada-request':'1',...(cookie?{cookie}:{})},body:method==='GET'?undefined:JSON.stringify(body??{})});
  const sc=r.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];
  const text=await r.text();const data=text?JSON.parse(text):{};
  if(!r.ok)throw Error(`${method} ${url} -> ${r.status} ${(data as any).error||text.slice(0,300)}`);
  return data as T;
 }
 const accessFile=path.join(DATA,'admin-access.json');
 const session=await api<{setup:boolean}>('/session');
 if(session.setup){const access={username:'admin',password:randomBytes(18).toString('base64url')};await api('/setup','POST',access);fs.writeFileSync(accessFile,JSON.stringify(access,null,2));}
 const access=JSON.parse(fs.readFileSync(accessFile,'utf8'));
 await api('/login','POST',access);

 // --- Proje -----------------------------------------------------------------------------------------------
 const conn=(id:string,name:string,protocol:string,port:number,extra:Record<string,unknown>={})=>({id,name,host:'127.0.0.1',port,timeout:2000,protocol,...extra});
 const dev=(id:string,connectionId:string,code:string,name:string,description='')=>({id,connectionId,code,name,slaveId:1,enabled:true,pollMs:1000,staleMs:6000,description});
 const tag=(id:string,deviceId:string,code:string,name:string,dataType:string,over:Record<string,unknown>={})=>({id,deviceId,code,name,area:'holding-register',address:0,dataType,access:'read',scale:1,offset:0,min:-1e6,max:1e6,unit:'',description:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,...over});
 const cmd=(id:string,name:string,tagId:string)=>({id,name,tagIds:[tagId],feedbackTagIds:[tagId],timeoutMs:8000,permissives:[],risk:'normal',approval:'none',scope:''});
 const config={revision:1,name:'Z SCADA Simülasyon Demosu',
  connections:[
   conn('c-modbus','Modbus TCP simülatörü','modbus-tcp',MB_PORT),
   conn('c-opcua','OPC UA simülatörü','opc-ua',OPC_PORT,{endpoint:`opc.tcp://127.0.0.1:${OPC_PORT}/UA/Demo`,securityMode:'none'}),
   conn('c-s7','S7 sahte PLC','s7',S7_PORT,{rack:0,slot:1}),
   conn('c-mqtt','MQTT yerel broker','mqtt',MQTT_PORT,{timeout:3000}),
   conn('c-http','HTTP enerji API','http',HTTP_PORT,{httpBaseUrl:`http://127.0.0.1:${HTTP_PORT}/api`,httpAuth:'none'}),
   conn('c-snmp','SNMP UPS ajanı','snmp',SNMP_PORT,{timeout:1500,snmpVersion:'2c'}),
   conn('c-bacnet','BACnet/IP klima','bacnet',BAC_DEV_PORT,{timeout:1500,bacnetDeviceInstance:1201,bacnetLocalAddress:'127.0.0.1',bacnetLocalPort:BAC_CLIENT_PORT}),
  ],
  devices:[
   dev('d-modbus','c-modbus','MB-01','Tank/pompa istasyonu'),dev('d-opcua','c-opcua','OPC-01','Fırın'),dev('d-s7','c-s7','S7-01','Kompresör'),
   dev('d-mqtt','c-mqtt','MQ-01','Hat 1 sensörleri'),dev('d-http','c-http','HTTP-01','Enerji analizörü'),dev('d-snmp','c-snmp','SNMP-01','UPS'),dev('d-bacnet','c-bacnet','BAC-01','Klima santrali'),
  ],
  tags:[
   tag('mb-level','d-modbus','MB-SEVIYE','Tank seviyesi','int16',{area:'holding-register',address:0,scale:0.1,unit:'%',min:-3276.8,max:3276.7,history:true}),
   tag('mb-sp','d-modbus','MB-HIZ-SP','Pompa hız setpoint','int16',{area:'holding-register',address:10,scale:0.1,unit:'%',min:0,max:100,access:'readwrite'}),
   tag('mb-run','d-modbus','MB-POMPA','Pompa çalışıyor','bool',{area:'discrete-input',address:0,min:0,max:1}),
   tag('mb-valve','d-modbus','MB-VANA','Çıkış vanası','bool',{area:'coil',address:0,min:0,max:1,access:'readwrite'}),
   tag('opc-temp','d-opcua','OPC-SICAKLIK','Fırın sıcaklığı','float32',{nodeId:'ns=1;s=Sicaklik',unit:'°C',history:true}),
   tag('opc-run','d-opcua','OPC-CALISIYOR','Fırın çalışıyor','bool',{nodeId:'ns=1;s=Calisiyor',min:0,max:1}),
   tag('opc-sp','d-opcua','OPC-SP','Fırın setpoint','float32',{nodeId:'ns=1;s=Setpoint',unit:'°C',min:0,max:120,access:'readwrite'}),
   tag('opc-cnt','d-opcua','OPC-SAYAC','Parça sayacı','int32',{nodeId:'ns=1;s=Sayac'}),
   tag('s7-press','d-s7','S7-BASINC','Hat basıncı','float32',{s7Address:'DB1,REAL0',unit:'bar',history:true}),
   tag('s7-sp','d-s7','S7-DEVIR-SP','Kompresör devir setpoint','int16',{s7Address:'DB1,INT4',unit:'rpm',min:0,max:3000,access:'readwrite'}),
   tag('s7-run','d-s7','S7-CALISIYOR','Kompresör çalışıyor','bool',{s7Address:'M0.0',min:0,max:1}),
   tag('s7-cnt','d-s7','S7-SAYAC','Çevrim sayacı','int32',{s7Address:'DB1,DINT8'}),
   tag('mq-flow','d-mqtt','MQ-DEBI','Debi','float32',{mqttTopic:'demo/hat1/olcum',mqttJsonPath:'data.debi',unit:'m³/h',history:true}),
   tag('mq-press','d-mqtt','MQ-BASINC','Basınç','float32',{mqttTopic:'demo/hat1/olcum',mqttJsonPath:'data.basinc',unit:'bar'}),
   tag('mq-state','d-mqtt','MQ-DURUM','Hat durumu','bool',{mqttTopic:'demo/hat1/durum',min:0,max:1}),
   tag('http-power','d-http','HTTP-GUC','Aktif güç','float32',{httpPath:'/enerji',httpJsonPath:'data.guc_kw',unit:'kW'}),
   tag('http-volt','d-http','HTTP-GERILIM','Gerilim','float32',{httpPath:'/enerji',httpJsonPath:'data.gerilim',unit:'V'}),
   tag('http-grid','d-http','HTTP-SEBEKE','Şebeke var','bool',{httpPath:'/enerji',httpJsonPath:'sebeke',min:0,max:1}),
   tag('snmp-batt','d-snmp','SNMP-SARJ','Akü şarjı','float32',{snmpOid:'1.3.6.1.4.1.99999.2.1.0',unit:'%'}),
   tag('snmp-temp','d-snmp','SNMP-SICAKLIK','UPS sıcaklığı','float32',{snmpOid:'1.3.6.1.4.1.99999.2.2.0',scale:0.1,unit:'°C'}),
   tag('snmp-grid','d-snmp','SNMP-SEBEKE','UPS şebekede','bool',{snmpOid:'1.3.6.1.4.1.99999.2.3.0',min:0,max:1}),
   tag('bac-temp','d-bacnet','BAC-SICAKLIK','Ortam sıcaklığı','float32',{bacnetObjectType:'analog-value',bacnetInstance:1,unit:'°C'}),
   tag('bac-hum','d-bacnet','BAC-NEM','Bağıl nem','float32',{bacnetObjectType:'analog-value',bacnetInstance:2,unit:'%'}),
   tag('bac-fan','d-bacnet','BAC-FAN','Fan çalışıyor','bool',{bacnetObjectType:'binary-value',bacnetInstance:1,min:0,max:1}),
  ],
  commands:[cmd('cmd-mb-sp','Pompa hız setpoint','mb-sp'),cmd('cmd-mb-valve','Çıkış vanası','mb-valve'),cmd('cmd-opc-sp','Fırın setpoint','opc-sp'),cmd('cmd-s7-sp','Kompresör devir setpoint','s7-sp')],
  mqttPublish:{connectionId:'c-mqtt',baseTopic:'zscada/demo',intervalMs:2000,onChange:true,retain:false,tagIds:['mb-level','opc-temp']},
 };

 // --- Ekran: protokol başına etiketli grup, ayrıntılı semboller --------------------------------------------
 const widgets:any[]=[];let wn=0;
 const w=(type:string,label:string,x:number,y:number,width:number,height:number,extra:Record<string,unknown>={})=>widgets.push({id:'sim-'+(wn++),type,label,x,y,width,height,...extra});
 const GW=380,GH=420;
 function group(col:number,row:number,title:string,sub:string){const x=30+col*400,y=90+row*440;w('rectangle',title,x,y,GW,GH,{labelVisible:false,fillColor:'',borderColor:'',color:'#64748b',strokeWidth:1,radius:10});w('text',title,x+14,y+8,GW-28,30,{fontSize:18,fontWeight:'700'});w('text',sub,x+14,y+38,GW-28,24,{fontSize:12});return {x,y};}
 w('text','Z SCADA · SİMÜLASYON — her protokol yerel bir simülatörden okunuyor (yalnız 127.0.0.1)',30,20,1500,40,{fontSize:22,fontWeight:'700'});
 w('text','Setpoint yazmaları komut API\'siyle gider, sunucu geri okumasıyla doğrulanır.',30,58,1560,26,{fontSize:13});
 {const {x,y}=group(0,0,'Modbus TCP',`127.0.0.1:${MB_PORT} · slave 1`);
  w('tank','T-101 seviye',x+20,y+70,120,150,{tagId:'mb-level',min:0,max:100,unit:'%'});
  w('pump','P-101 pompa',x+155,y+95,120,90,{tagId:'mb-run'});
  w('valve','V-101 vana',x+285,y+100,85,75,{tagId:'mb-valve'});
  w('value','Seviye',x+20,y+230,165,60,{tagId:'mb-level',unit:'%',decimals:1});
  w('value','Hız SP (geri okuma)',x+195,y+230,165,60,{tagId:'mb-sp',unit:'%',decimals:1});
  w('numeric-input','Hız setpoint yaz',x+20,y+300,220,105,{tagId:'mb-sp',commandId:'cmd-mb-sp',min:0,max:100,writeMin:0,writeMax:100,unit:'%',decimals:1});
  w('button','Vana AÇ',x+255,y+305,110,44,{commandId:'cmd-mb-valve',action:'on'});
  w('button','Vana KAPAT',x+255,y+358,110,44,{commandId:'cmd-mb-valve',action:'off'});}
 {const {x,y}=group(1,0,'OPC UA',`opc.tcp://127.0.0.1:${OPC_PORT}/UA/Demo · kullanıcı/parola`);
  w('thermometer','Fırın sıcaklığı',x+20,y+70,70,150,{tagId:'opc-temp',min:0,max:120,unit:'°C'});
  w('heater','Fırın ısıtıcı',x+110,y+95,130,90,{tagId:'opc-run'});
  w('indicator','Çalışıyor',x+255,y+90,110,90,{tagId:'opc-run'});
  w('value','Sıcaklık',x+20,y+230,165,60,{tagId:'opc-temp',unit:'°C',decimals:2});
  w('value','Parça sayacı',x+195,y+230,165,60,{tagId:'opc-cnt',decimals:0});
  w('numeric-input','Fırın setpoint yaz',x+20,y+300,220,105,{tagId:'opc-sp',commandId:'cmd-opc-sp',min:0,max:120,writeMin:0,writeMax:120,unit:'°C',decimals:1});
  w('value','SP (geri okuma)',x+255,y+305,110,95,{tagId:'opc-sp',unit:'°C',decimals:1});}
 {const {x,y}=group(2,0,'Siemens S7',`127.0.0.1:${S7_PORT} · rack 0 / slot 1 · DB1`);
  w('gauge','Hat basıncı',x+20,y+70,140,130,{tagId:'s7-press',min:0,max:10,unit:'bar',decimals:2});
  w('compressor','K-201 kompresör',x+180,y+90,130,95,{tagId:'s7-run'});
  w('value','Basınç',x+20,y+230,165,60,{tagId:'s7-press',unit:'bar',decimals:2});
  w('value','Çevrim sayacı',x+195,y+230,165,60,{tagId:'s7-cnt',decimals:0});
  w('numeric-input','Devir setpoint yaz',x+20,y+300,220,105,{tagId:'s7-sp',commandId:'cmd-s7-sp',min:0,max:3000,writeMin:0,writeMax:3000,unit:'rpm',decimals:0});
  w('value','SP (geri okuma)',x+255,y+305,110,95,{tagId:'s7-sp',unit:'rpm',decimals:0});}
 {const {x,y}=group(3,0,'MQTT',`mqtt://127.0.0.1:${MQTT_PORT} · demo/hat1/# · dışa yayın zscada/demo/#`);
  w('flow-meter','FT-301 debi',x+20,y+90,130,90,{tagId:'mq-flow'});
  w('gauge','Basınç',x+175,y+70,140,130,{tagId:'mq-press',min:0,max:5,unit:'bar',decimals:2});
  w('value','Debi',x+20,y+230,165,60,{tagId:'mq-flow',unit:'m³/h',decimals:2});
  w('value','Basınç',x+195,y+230,165,60,{tagId:'mq-press',unit:'bar',decimals:3});
  w('indicator','Hat durumu',x+20,y+305,165,95,{tagId:'mq-state'});
  w('text','Dışa yayın: MB-SEVIYE ve OPC-SICAKLIK → zscada/demo/<kod>',x+195,y+310,170,90,{fontSize:12});}
 {const {x,y}=group(0,1,'HTTP / REST',`GET http://127.0.0.1:${HTTP_PORT}/api/enerji · JSON yolu`);
  w('power-meter','Enerji analizörü',x+20,y+75,180,140,{tagId:'http-power'});
  w('indicator','Şebeke',x+225,y+90,130,95,{tagId:'http-grid'});
  w('value','Aktif güç',x+20,y+230,165,60,{tagId:'http-power',unit:'kW',decimals:1});
  w('value','Gerilim',x+195,y+230,165,60,{tagId:'http-volt',unit:'V',decimals:1});}
 {const {x,y}=group(1,1,'SNMP v2c',`udp 127.0.0.1:${SNMP_PORT} · community sır API'sinde`);
  w('ups','UPS',x+20,y+75,150,130,{tagId:'snmp-grid'});
  w('battery','Akü',x+200,y+85,140,110,{tagId:'snmp-batt',min:0,max:100});
  w('value','Akü şarjı',x+20,y+230,165,60,{tagId:'snmp-batt',unit:'%',decimals:0});
  w('value','UPS sıcaklığı',x+195,y+230,165,60,{tagId:'snmp-temp',unit:'°C',decimals:1});
  w('indicator','Şebekede',x+20,y+305,165,95,{tagId:'snmp-grid'});}
 {const {x,y}=group(2,1,'BACnet/IP',`udp 127.0.0.1:${BAC_DEV_PORT} · cihaz 1201 · tekil adres`);
  w('ahu','AHU-01 klima santrali',x+20,y+75,260,140,{tagId:'bac-fan'});
  w('fan','Fan',x+290,y+95,80,80,{tagId:'bac-fan'});
  w('value','Ortam sıcaklığı',x+20,y+230,165,60,{tagId:'bac-temp',unit:'°C',decimals:2});
  w('value','Bağıl nem',x+195,y+230,165,60,{tagId:'bac-hum',unit:'%',decimals:1});}
 {const {x,y}=group(3,1,'Simüle edilmeyenler','ADS · EtherNet/IP · SQL Server');
  w('text','Bu protokoller için yerel simülatör yok. Sahte veri üretilmedi; bu demoda bağlantıları da yok.',x+14,y+80,GW-28,120,{fontSize:14});}
 w('trend','Trend · tank seviyesi / fırın sıcaklığı / debi',30,980,1580,260,{min:0,max:100,timeWindowMin:5,
  details:[{kind:'value',tagId:'mb-level',label:'Tank seviyesi',unit:'%'},{kind:'value',tagId:'opc-temp',label:'Fırın sıcaklığı',unit:'°C'},{kind:'value',tagId:'mq-flow',label:'Debi',unit:'m³/h'}]});
 const screen={id:'screen-simulasyon',name:'Simülasyon',width:1640,height:1270,background:'',symbolStyle:'detailed',gridSize:10,widgets,equipment:[],scenarios:[],links:[]};

 await api('/import','POST',{schemaVersion:1,config,screens:[{draft:screen}]});
 // İçe aktarma cihazları pasif bırakır (B06): demo için etkinleştir.
 const project=await api('/project');
 const enabled={...project.config,devices:project.config.devices.map((d:any)=>({...d,enabled:true}))};
 delete (enabled as any).pending;
 await api('/config','PUT',enabled);
 await api('/connections/c-opcua/secret','PUT',{username:OPC_USER,password:OPC_PASS});
 await api('/connections/c-snmp/secret','PUT',{community:COMMUNITY});
 const dep=await api('/deploy','POST');
 console.log(`[${ts()}] Deploy: ${dep?.diff?.added?.length??'?'} düğüm eklendi.`);
 const pub=await api('/screens/screen-simulasyon/publish','POST');
 console.log(`[${ts()}] "Simülasyon" ekranı yayınlandı (sürüm ${pub.publishedVersion}).`);

 // --- Canlı veri ---------------------------------------------------------------------------------------
 let state:any=null;
 const openLive=()=>{const ws=new WebSocket(`ws://127.0.0.1:${WEB_PORT}/api/live`,{headers:{cookie}});ws.on('message',b=>{try{state=JSON.parse(String(b));}catch{/* */}});ws.on('error',()=>{});ws.on('close',()=>{if(!stopping)setTimeout(()=>{live=openLive();},2000);});return ws;};
 live=openLive();
 const tagRows=config.tags.map(t=>({id:t.id,code:t.code,proto:config.connections.find(c=>c.id===config.devices.find(d=>d.id===t.deviceId)!.connectionId)!.protocol}));
 const fmt=(v:unknown)=>v===null||v===undefined?'—':typeof v==='number'?(Number.isInteger(v)?String(v):v.toFixed(2)):String(v);
 function table(){
  const now=Date.now(),s=state?.samples||{};
  const lines=[`[${ts()}] gateway ${state?.gatewayConnected?'bağlı':'YOK'} · aktif rev ${state?.activeRevision??'?'} · cihaz hazır ${state?.devicesReady??0}/${state?.devicesTotal??0} · controlReady ${!!state?.controlReady}`,
   'protokol     etiket           değer        kalite  yaş'];
  for(const r of tagRows){const x=s[r.id];lines.push(`${r.proto.padEnd(12)} ${r.code.padEnd(16)} ${fmt(x?.value).padStart(10)}   ${(x?.quality||'yok').padEnd(6)}  ${x?((now-x.receivedAt)/1000).toFixed(1)+' sn':'—'}`);}
  const last=outbound.at(-1);
  lines.push(`mqtt-out     zscada/demo/#    ${String(outbound.length).padStart(10)}   mesaj   ${last?'son '+last.topic+' '+last.payload.slice(0,60)+' ('+((now-last.at)/1000).toFixed(1)+' sn)':'henüz yok'}`);
  lines.push('ads / enip / sql: simüle edilmedi (simülatör yok)');
  console.log(lines.join('\n'));
 }
 const tableTimer=setInterval(table,5000);void tableTimer;
 const allGood=()=>tagRows.every(r=>state?.samples?.[r.id]?.quality==='good');
 const ok=await until(()=>allGood()&&!!state?.controlReady,180000,500);
 table();
 console.log(ok?`[${ts()}] TÜM simüle etiketler good.`:`[${ts()}] UYARI: 180 sn içinde tüm etiketler good olmadı; yazmalar yine denenecek.`);

 // --- Yazma doğrulaması (arayüzle aynı uç: POST /api/commands) -------------------------------------------
 const screenVersion=(await api('/project')).screens.find((x:any)=>x.id==='screen-simulasyon').publishedVersion;
 const writes:[string,string,boolean|number][]=[['modbus-tcp','cmd-mb-sp',62.5],['modbus-tcp','cmd-mb-valve',true],['opc-ua','cmd-opc-sp',72.5],['s7','cmd-s7-sp',1450]];
 const results:string[]=[];
 for(const [proto,commandId,value] of writes){
  const id=randomUUID();let status='istek reddedildi',detail='';
  try{
   await api('/commands','POST',{id,commandId,value,screenId:'screen-simulasyon',screenVersion});
   await until(()=>{const c=state?.commands?.find((x:any)=>x.id===id);if(c){status=c.status;detail=c.error||c.message||'';}return !!c&&['verified','rejected','failed','unverified','partial','uncertain','completed','aborted'].includes(c.status);},20000,250);
  }catch(e){detail=(e as Error).message;}
  const line=`${proto.padEnd(11)} ${commandId.padEnd(13)} değer ${String(value).padEnd(6)} → ${status}${detail?' ('+detail+')':''}`;
  results.push(line);console.log(`[${ts()}] YAZMA ${line}`);
 }
 console.log(`[${ts()}] Simülatör tarafı: Modbus HR10=${mb.hr.get(10)} (×0.1) coil0=${mb.coil.get(0)} · OPC UA Setpoint=${opc.setpoint} · S7 DB1.INT4=${db1.readInt16BE(4)}`);
 const info={url:BASE+'/',username:access.username,password:access.password,root:ROOT,pid:process.pid,installed:usingInstalled,app:APP,writes:results};
 fs.writeFileSync(path.join(ROOT,'demo-bilgi.json'),JSON.stringify(info,null,2));
 console.log('\n================ DEMO HAZIR ================');
 console.log(`Adres      : ${BASE}/   (ekran: Simülasyon)`);
 console.log(`Kullanıcı  : ${access.username}`);
 console.log(`Parola     : ${access.password}   (yalnız bu geçici demo için)`);
 console.log(`Uygulama   : ${usingInstalled?'KURULU '+APP+' (salt okunur)':'DEPO YEDEĞİ '+APP}`);
 console.log(`Veri       : ${DATA} (geçici)`);
 console.log(`Durdurmak  : Ctrl+C ya da şu dosyayı oluştur: ${STOP_FILE}   (PID ${process.pid})`);
 console.log('Yazmalar   :\n  '+results.join('\n  '));
 console.log('============================================\n');
}catch(e){
 console.error(`[${ts()}] HATA: ${(e as Error).message}\nLoglar: ${LOGS}`);
 await shutdown(1);
}
