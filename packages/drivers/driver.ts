import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {Config,Connection,Tag} from '../contracts/model';
import {createHash} from 'node:crypto';
import {registerCount,busKeyOf,opcQuality,modbusCodecSource,parseS7Address,s7WriteType,parseAmsNetId,parseAdsSymbol,isModbus,isSerial,
 parseMqttTopic,mqttPathSteps,mqttCodecSource,checkMqttTag,mqttPublishTags,mqttTopicLevel,
 parseSnmpOid,snmpCodecSource,checkSnmpTag,checkSnmpConnection,parseHttpPath,httpRequestUrl,checkHttpTag,parseHttpBaseUrl,
 checkSqlQuery,checkSqlColumn,checkSqlTag,checkSqlConnection,sqlCodecSource,
 BACNET_OBJECT_TYPES,BACNET_PROPERTIES,BACNET_STATUS_FLAGS,BACNET_DEFAULT_LOCAL_PORT,checkBacnetConnection,checkBacnetTag,bacnetCodecSource,
 CIP_DATATYPE,parseCipTag,checkEnipConnection,checkEnipTag} from '../contracts/model';
/* --- B43: surucu soyutlamasi -----------------------------------------------
 * Koprü su ana kadar dogrudan Modbus client uretiyordu; protokol ayrimi
 * yoktu. Bu dosya ortak `Driver` sozlesmesini ve iki somut surucuyu tanimlar:
 * modbusDriver (bugunku akisin tasinmis hali — davranis degismez) ve
 * opcUaDriver (duzenli okuma + StatusCode esleme; kullanici/parola girisi ve
 * paylasilan kopru uzerinden yazma — bkz. asagidaki not).
 */
type Device=Config['devices'][number];
/** Baglanti kimlik bilgisi: config/SQLite/disa aktarim disinda, veri klasorundeki
 * connection-secrets.json dosyasinda tutulur (apps/server/src/connectionSecrets.ts). */
export type ConnectionSecret={username?:string;password?:string;
 /** SNMP v1/v2c community. */ community?:string;
 /** SNMPv3 kimlik dogrulama / sifreleme anahtari. */ authKey?:string;privKey?:string;
 /** HTTP bearer token. */ token?:string};
export type DriverContext={token:string;revision:number;
 /** Baglantinin gizli kimlik bilgisi (yoksa undefined). buildGateway her zaman verir; surucu birim testleri vermeyebilir. */
 secret?:(connectionId:string)=>ConnectionSecret|undefined;
 /** Akisi uygulayan makinenin adi (MQTT varsayilan istemci kimligi icin). Verilmezse os.hostname(). */
 hostname?:string};
/** Bir surucunun yazma dali: uretilen dugumler ve baglanti basina dalin giris dugumu.
 * Paylasilan bekci (scada-write-guard) komutu etiketin baglantisina gore bu girise yollar.
 * Gelen msg.command={tagId,value,commandId,expiresAt,revision,connectionId}; dal is bitince
 * msg'yi (req/res korunarak) WRITE_RESULT_ID dugumune gondermek ZORUNDADIR: basari icin
 * msg.payload dolu ve msg.error yok; red icin msg.reject={code,error}; cihaz hatasi icin msg.error.
 * Hat kilidi tutan dal msg.bus/msg.lockKey birakir, sonuc dugumu kilidi serbest birakir. */
export type WriteBranch={nodes:any[];entries:Record<string,string>};
export type Driver={
 id:string;
 label:string;
 /** Bu baglanti bu suruculer mi isletilecek? */
 supports:(c:Connection)=>boolean;
 /** Bu surucuye ait baglantilar+cihazlar+etiketler icin Node-RED dugumleri uretir. */
 buildNodes:(connections:Connection[],devices:Device[],tags:Tag[],ctx:DriverContext)=>any[];
 /** Yayin oncesi surucuye ozgu dogrulama (validateConfig zaten protokol/nodeId/endpoint kontrol eder; burasi surucu ozel ek kontroller icindir). */
 validate:(c:Connection,tags:Tag[])=>void;
 /** Yazma sinirlari: maxValueLength (dizi/uzun deger sinirlarinda) ve yazmaya izin var mi. */
 writeLimits:{maxValueLength?:number;allowWrite:boolean};
 /** Yazma dali (istege bagli). `tags` yalniz bu surucunun baglantilarindaki, etkin cihazlardaki
  * readwrite etiketlerdir. Yalniz writeLimits.allowWrite=true iken cagrilir. */
 buildWriteNodes?:(connections:Connection[],devices:Device[],tags:Tag[],ctx:DriverContext)=>WriteBranch;
 /** Sekme ('scada-gateway') ortam degiskenleri, tip 'cred' (istege bagli): ad -> gizli deger. Paket bir sirri yalniz
  * dugum ozelligi ya da msg uzerinden aliyorsa (SNMP v1/v2c community) deger buradan verilir: Node-RED onu sekmenin
  * `credentials`'ina ayirir (flows_cred.json), GET /flows'ta ve yedekte gorunmez; function dugumu env.get ile okur. */
 flowEnv?:(connections:Connection[],devices:Device[],tags:Tag[],ctx:DriverContext)=>Record<string,string>;
};
/* --- Paylasilan yazma koprusu ---------------------------------------------
 * '/scada-bridge/command' HTTP girisi, protokolden bagimsiz bekci (token,
 * revizyon, commandId bicimi, son gecerlilik, tazelik, tekrar) ve HTTP yaniti
 * tek kez uretilir; her surucu kendi yazma dalini buildWriteNodes ile ekler.
 * Bekci komutu etiket -> baglanti eslemesiyle dogru dala yollar. Her dal
 * paylasilan sonuc dugumunde biter: basari 200 {ack:true,at}, aksi 502.
 * Dal hic cevap vermezse bekci zamanlayicisi 502 doner (asili istek kalmaz);
 * gec gelen cevap ikinci bir HTTP yaniti uretmez ('reply-<id>' bayragi).
 */
export const WRITE_HTTP_ID='scada-write-http',WRITE_GUARD_ID='scada-write-guard',WRITE_RESULT_ID='scada-write-result',HTTP_RESPONSE_ID='scada-http-response';
/** Bekci zaman asimi tavani. Sunucu fetch'i en cok min(5000, expiresAt-simdi) bekler (index.ts);
 * bekci de en gec son gecerlilik + 250 ms'de, en cok bu surede 502 doner. */
export const WRITE_REPLY_TIMEOUT_MS=5000;
/** Yazilabilir etiketler: readwrite ve cihazi etkin. */
export function writableTags(devices:Device[],tags:Tag[]):Tag[]{
 return tags.filter(t=>t.access==='readwrite'&&devices.some(d=>d.id===t.deviceId&&d.enabled));
}
export type WriteBridgeBranch={branch:WriteBranch;devices:Device[];tags:Tag[]};
/** Paylasilan HTTP girisi + bekci + sonuc dugumu; dal yoksa (yazilabilir etiket yok) bos doner.
 * HTTP yanit dugumu (HTTP_RESPONSE_ID) ayrica httpResponseNode ile eklenir. */
export function buildWriteBridge(token:string,revision:number,branches:WriteBridgeBranch[],y=150):any[]{
 const outputs:string[]=[];const routes:Record<string,{o:number;c:string;staleMs:number}>={};
 const branchNodes:any[]=[];
 for(const {branch,devices,tags} of branches){
  const outByConn:Record<string,number>={};
  for(const [connId,entry] of Object.entries(branch.entries)){outByConn[connId]=outputs.length;outputs.push(entry);}
  for(const t of tags){
   const d=devices.find(x=>x.id===t.deviceId);
   if(!d||outByConn[d.connectionId]===undefined)continue;
   routes[t.id]={o:outByConn[d.connectionId],c:d.connectionId,staleMs:d.staleMs};
  }
  branchNodes.push(...branch.nodes);
 }
 if(!outputs.length)return [];
 const n=outputs.length;
 const nodes:any[]=[];
 const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
 add(WRITE_HTTP_ID,'http in',{name:'Dahili yazma',url:'/scada-bridge/command',method:'post',upload:false,swaggerDoc:'',x:180,y,wires:[[WRITE_GUARD_ID]]});
 add(WRITE_GUARD_ID,'function',{name:'Adres / süre / tekrar kontrolü',outputs:n+1,func:`const p=msg.payload;const out=Array(${n+1}).fill(null);function fail(code,text){msg.statusCode=code;msg.payload={error:text};out[${n}]=msg;return out;}
if(msg.req.headers['x-scada-token']!==${JSON.stringify(token)})return fail(401,'Yetkisiz');
const tags=${JSON.stringify(routes)};if(!p||p.revision!==${revision}||typeof p.commandId!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(p.commandId)||!Number.isFinite(p.expiresAt)||Date.now()>p.expiresAt)return fail(409,'Geçersiz veya süresi dolan komut');
const t=Object.prototype.hasOwnProperty.call(tags,p.tagId)?tags[p.tagId]:null;if(!t)return fail(400,'Etiket bulunamadı');
if(Date.now()-(flow.get('fresh-'+p.tagId)||0)>t.staleMs)return fail(409,'Veri güncel değil');
if(flow.get('command-'+p.commandId))return fail(409,'Komut daha önce alındı');
flow.set('command-'+p.commandId,Date.now());flow.set('reply-'+p.commandId,Date.now());
const req=msg.req,res=msg.res,mid=msg._msgid,commandId=p.commandId;
setTimeout(function(){if(!flow.get('reply-'+commandId))return;flow.set('reply-'+commandId,undefined);const o=Array(${n+1}).fill(null);o[${n}]={_msgid:mid,req:req,res:res,statusCode:502,payload:{ack:false,at:Date.now(),error:'Köprü yazma dalı yanıt vermedi (zaman aşımı)'}};node.send(o);},Math.max(50,Math.min(${WRITE_REPLY_TIMEOUT_MS},p.expiresAt-Date.now()+250)));
msg.command={tagId:p.tagId,value:p.value,commandId:p.commandId,expiresAt:p.expiresAt,revision:p.revision,connectionId:t.c};
out[t.o]=msg;return out;`,x:510,y,wires:[...outputs.map(e=>[e]),[HTTP_RESPONSE_ID]]});
 add(WRITE_RESULT_ID,'function',{name:'Yazma cevabı',outputs:1,func:`const lock=flow.get('bus-'+msg.bus);if(lock&&lock.key===msg.lockKey)flow.set('bus-'+msg.bus,null);
const id=msg.command&&msg.command.commandId;if(id){if(!flow.get('reply-'+id))return null;flow.set('reply-'+id,undefined);}
if(msg.reject){msg.statusCode=msg.reject.code;msg.payload={error:String(msg.reject.error)};return msg;}
const ok=!(msg.error||msg.payload===undefined||msg.payload==='');msg.statusCode=ok?200:502;
msg.payload=ok?{ack:true,at:Date.now()}:{ack:false,at:Date.now(),error:String((msg.error&&msg.error.message)||msg.error||'Yanıt yok')};return msg;`,x:1210,y:y+80,wires:[[HTTP_RESPONSE_ID]]});
 return nodes.concat(branchNodes);
}
/** Paylasilan HTTP yanit dugumu: yazma koprusu ve okuma testi (Modbus) buraya baglanir. */
export function httpResponseNode(y=150){
 return {id:HTTP_RESPONSE_ID,type:'http response',z:'scada-gateway',name:'HTTP sonuç',statusCode:'',headers:{},x:1430,y,wires:[]};
}
/** Bir cihazin bagli oldugu baglanti kimligine gore o baglantiya ait etiketleri/cihazlari ayirir. */
export function partitionByConnection(connections:Connection[],devices:Device[],tags:Tag[]){
 const connIds=new Set(connections.map(c=>c.id));
 const scopedDevices=devices.filter(d=>connIds.has(d.connectionId));
 const deviceIds=new Set(scopedDevices.map(d=>d.id));
 const scopedTags=tags.filter(t=>deviceIds.has(t.deviceId));
 return {devices:scopedDevices,tags:scopedTags};
}
/** Etiketleri ardisik adres araligina gore tek Modbus okumasinda bloklar (100 register ustune cikmaz). */
function modbusBlocks(tags:Tag[]){
 const result:{area:string;address:number;tags:Tag[]}[]=[];
 for(const t of [...tags].sort((a,b)=>a.area.localeCompare(b.area)||a.address-b.address)){
  const prev=result.at(-1);
  const prevRegs=prev?prev.tags.reduce((s,x)=>s+registerCount(x.dataType),0):0;
  if(prev&&prev.area===t.area&&prev.address+prevRegs===t.address&&prevRegs<100)prev.tags.push(t);else result.push({area:t.area,address:t.address,tags:[t]});
 }return result;
}
const modbusLockMs=(connection:{timeout:number})=>connection.timeout+500;
/** modbus-client'in reconnectTimeout'u: baglanti zaman asimindan kisa olamaz, ama cok kisa da olmaz (DVP-SS2 gibi az soketli PLC'lerde agresif yeniden baglanma soket tukenmesini kotulestirir). */
const reconnectTimeoutMs=(connection:{timeout:number})=>Math.max(2000,connection.timeout);
/* --- Tarama backoff: DVP-SS2 ailesi az sayida eszamanli TCP soket
 * destekler; okuma surekli basarisiz olurken 100ms'de bir yeniden denemek
 * baglantiyi daha da kararsizlastirir. Ardisik hata sayisi arttikca bekleme
 * suresi katlanarak buyur (taban * 2^(n-1)), bir tavanda durur; jitter
 * birden fazla bus'in ayni anda vurmasini engeller. */
export const BACKOFF_BASE_MS=500,BACKOFF_CAP_MS=30000,BACKOFF_JITTER=0.2;
/** Saf backoff formulu: birim testle dogrulanir. Gomulu function node ayni formulu JS string olarak uygular (asagida). */
export function backoffDelay(failCount:number,base:number=BACKOFF_BASE_MS,cap:number=BACKOFF_CAP_MS,jitter:number=BACKOFF_JITTER,rng:()=>number=Math.random):number{
 if(failCount<=0)return 0;
 const raw=Math.min(base*Math.pow(2,failCount-1),cap);
 const spread=raw*jitter*(rng()*2-1);
 return Math.max(0,Math.min(cap,raw+spread));
}
/* --- Modbus TCP surucusu ---------------------------------------------------
 * Mantik apps/server/src/gateway.ts'in eski buildGateway'inden birebir
 * tasindi; ayni config icin ayni dugum kimlikleri ve ayni akis uretilir
 * (tests/drivers.test.ts ve tests/gateway.test.ts bunu dogrular).
 */
/** Modbus istemci dugumu: TCP, RTU-over-TCP (ag gecidi) veya seri (RTU/ASCII). Tarama, kilit ve yazma
 * akisi uc tasimada da aynidir; yalniz fiziksel katman degisir. Seri hat yari cift yonlu tek hattir —
 * busKeyOf seri portu hat kimligi yapar, boylece ayni porttaki cihazlar tek kilitle sirayla okunur. */
export function modbusClientNode(conn:Connection){
 const common={id:'scada-client-'+conn.id,type:'modbus-client',name:conn.name,unit_id:1,bufferCommands:false,commandDelay:20,clientTimeout:conn.timeout,reconnectOnTimeout:true,reconnectTimeout:reconnectTimeoutMs(conn),parallelUnitIdsAllowed:false,showErrors:true,showWarnings:true,showLogs:false};
 if(isSerial(conn))return {...common,clienttype:'simpleser',serialPort:conn.serialPort,serialType:conn.serialMode==='ascii'?'ASCII':'RTU-BUFFERD',
  serialBaudrate:conn.baudRate??9600,serialDatabits:conn.dataBits??8,serialStopbits:conn.stopBits??1,serialParity:conn.parity??'none',serialConnectionDelay:100,serialAsciiResponseStartDelimiter:'0x3A',
  tcpHost:'127.0.0.1',tcpPort:502,tcpType:'DEFAULT'};
 return {...common,clienttype:'tcp',tcpHost:conn.host,tcpPort:conn.port,tcpType:conn.protocol==='modbus-rtu'?'TCP-RTU-BUFFERED':'DEFAULT'};
}
/** Modbus yazma dalinin giris dugumu (tum Modbus baglantilari icin tek; ciktilari baglanti basina). */
export const MODBUS_WRITE_PREP_ID='scada-modbus-write-prep';
export const modbusDriver:Driver={
 id:'modbus-tcp',
 label:'Modbus TCP / RTU',
 supports:c=>isModbus(c),
 validate(){/* validateConfig zaten host/port ve seri port zorunlulugunu kontrol ediyor; ek kural yok. */},
 writeLimits:{allowWrite:true},
 /* Modbus yazma dali (eskiden bekcinin icindeydi; davranis ayni): kanonik encodeValue ile
  * kodlama (B58), hat kilidi bekleme + bekleme sonrasi sure/tazelik tekrar kontrolu, sonra
  * baglantinin modbus-flex-write dugumu. Red (400/409) ve cihaz cevabi paylasilan sonuc dugumune gider. */
 buildWriteNodes(connections,devices,tags){
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  const writable=Object.fromEntries(writableTags(devices,tags).map(t=>[t.id,{...t,device:devices.find(d=>d.id===t.deviceId)!}]));
  const connIds=connections.map(x=>x.id).filter(id=>Object.values(writable).some(t=>t.device.connectionId===id));
  if(!connIds.length)return {nodes:[],entries:{}};
  const byId=new Map(connections.map(cn=>[cn.id,cn]));
  const busKeyByConn=Object.fromEntries(connIds.map(id=>[id,busKeyOf(byId.get(id)!)]));
  const lockMsByConn=Object.fromEntries(connIds.map(id=>[id,modbusLockMs(byId.get(id)!)]));
  const n=connIds.length,y=300;
  add(MODBUS_WRITE_PREP_ID,'function',{name:'Modbus yazma: kodla / hat kilidi',outputs:n+1,func:`${modbusCodecSource()}
const c=msg.command;const out=Array(${n+1}).fill(null);function reject(code,text){msg.reject={code:code,error:text};out[${n}]=msg;return out;}
const tags=${JSON.stringify(writable)},connections=${JSON.stringify(connIds)},connBus=${JSON.stringify(busKeyByConn)},connLockMs=${JSON.stringify(lockMsByConn)};
const t=c&&Object.prototype.hasOwnProperty.call(tags,c.tagId)?tags[c.tagId]:null;if(!t)return reject(400,'Etiket bulunamadı');
let v=c.value;
if(t.dataType==='bool'){
 if(typeof v!=='boolean')return reject(400,'Dijital değer gerekli');
}else{
 let regs;
 try{regs=encodeValue(v,t);}catch(err){return reject(400,err.message);}
 v=regs.length===1?regs[0]:regs;
}
function dispatch(){if(Date.now()>c.expiresAt||Date.now()-(flow.get('fresh-'+t.id)||0)>t.device.staleMs){node.send(reject(409,'Komut süresi veya veri güncelliği doldu'));return;}const busKey=connBus[t.device.connectionId],lock=flow.get('bus-'+busKey);if(lock&&Date.now()-lock.at<connLockMs[t.device.connectionId]){setTimeout(dispatch,25);return;}
const isArr=Array.isArray(v);
flow.set('bus-'+busKey,{at:Date.now(),kind:'write',key:c.commandId});msg.bus=busKey;msg.lockKey=c.commandId;msg.payload={fc:t.dataType==='bool'?5:(isArr?16:6),unitid:t.device.slaveId,address:t.address,quantity:isArr?v.length:1,value:v};out[connections.indexOf(t.device.connectionId)]=msg;node.send(out);}
dispatch();return null;`,x:770,y,wires:[...connIds.map(i=>['scada-write-'+i]),[WRITE_RESULT_ID]]});
  for(const [i,conn] of connIds.entries())add('scada-write-'+conn,'modbus-flex-write',{name:'Yaz · '+conn,server:'scada-client-'+conn,emptyMsgOnFail:true,keepMsgProperties:true,showErrors:false,showWarnings:false,x:990,y:y+i*70,wires:[[WRITE_RESULT_ID],[WRITE_RESULT_ID]]});
  return {nodes,entries:Object.fromEntries(connIds.map(id=>[id,MODBUS_WRITE_PREP_ID]))};
 },
 buildNodes(connections,devices,tags,ctx){
  const {token,revision}=ctx;
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  for(const conn of connections)nodes.push(modbusClientNode(conn));
  let y=150;
  for(const conn of connections){
   const busKey=busKeyOf(conn);
   const connDevices=devices.filter(d=>d.enabled&&d.connectionId===conn.id);
   const tasks=connDevices.flatMap(d=>modbusBlocks(tags.filter(t=>t.deviceId===d.id)).map((b,i)=>({...b,unitid:d.slaveId,pollMs:d.pollMs,key:d.id+'-'+i,quantity:b.tags.reduce((s,x)=>s+registerCount(x.dataType),0),fc:({'coil':1,'discrete-input':2,'holding-register':3,'input-register':4} as Record<string,number>)[b.area]})));
   const key='scada-poll-'+conn.id;
   add(key+'-clock','inject',{name:'Tarama zamanlay?c? ? '+conn.name,props:[{p:'payload'}],payloadType:'date',repeat:'0.1',once:true,onceDelay:1,x:150,y,wires:[[key]]});
   add(key,'function',{name:'S?ral? tarama ? '+conn.name,outputs:1,func:`const now=Date.now(),lock=flow.get('bus-${busKey}');if(lock&&now-lock.at<${modbusLockMs(conn)})return null;
const failKey='fail-${busKey}',lastKey='fail-at-${busKey}',fails=flow.get(failKey)||0;
if(fails>0){const raw=Math.min(${BACKOFF_BASE_MS}*Math.pow(2,fails-1),${BACKOFF_CAP_MS});const spread=raw*${BACKOFF_JITTER}*(Math.random()*2-1);const wait=Math.max(0,Math.min(${BACKOFF_CAP_MS},raw+spread));if(now-(flow.get(lastKey)||0)<wait)return null;}
const tasks=${JSON.stringify(tasks)};let state=context.get('schedule')||{index:0,due:{}};for(let n=0;n<tasks.length;n++){const i=(state.index+n)%tasks.length,t=tasks[i];if((state.due[t.key]||0)>now)continue;state.index=(i+1)%tasks.length;state.due[t.key]=now+t.pollMs;context.set('schedule',state);flow.set('bus-${busKey}',{at:now,kind:'read',key:t.key});flow.set(lastKey,now);return {block:t,bus:${JSON.stringify(busKey)},lockKey:t.key,payload:{fc:t.fc,unitid:t.unitid,address:t.address,quantity:t.quantity}};}return null;`,x:400,y,wires:[[key+'-read']]});
   add(key+'-read','modbus-flex-getter',{name:'Oku ? '+conn.name,server:'scada-client-'+conn.id,emptyMsgOnFail:true,keepMsgProperties:true,showErrors:true,showWarnings:true,x:650,y,wires:[[key+'-convert'],[key+'-convert']]});
   /* B58: cozme mantigi artik gomulu kopya degil — kanonik decodeRegisters/registerCount
    * modbusCodecSource() ile .toString() olarak buraya tasiniyor (OPC UA tarafindaki
    * opcQuality.toString() deseniyle ayni). DAVRANIS DEGISIKLIGI: kanonik decodeRegisters
    * cozulen degeri tag.min/tag.max disindaysa HATA firlatir; eskiden gomulu kopyada bu
    * sinir kontrolu YOKTU ve sinir disi okuma sessizce quality:'good' olarak operatore
    * gidiyordu. Simdi boyle bir okuma value:null, quality:'bad' olarak isaretlenir — dogru
    * yon ama sessiz gecmesin diye burada aciklaniyor (bkz. TODO.md B58). Her etiket kendi
    * try/catch'i icinde cozulur; bir etiketin sinir disi/eksik veri hatasi digerlerini
    * etkilemez (tek .map icinde tek throw butun bloku dusurmez). */
   add(key+'-convert','function',{name:'Etiket / kalite',outputs:1,func:`${modbusCodecSource()}
if(!msg.block){if(msg.bus)flow.set('fail-'+msg.bus,(flow.get('fail-'+msg.bus)||0)+1);return null;}
if(!Array.isArray(msg.payload)&&Array.isArray(msg.payload?.data)){flow.set('fail-'+msg.bus,(flow.get('fail-'+msg.bus)||0)+1);return null;}
const lock=flow.get('bus-'+msg.bus);if(lock&&lock.key===msg.lockKey)flow.set('bus-'+msg.bus,null);
const tags=msg.block.tags;
const total=tags.reduce((s,t)=>s+registerCount(t.dataType),0);
const good=Array.isArray(msg.payload)&&msg.payload.length>=total;
flow.set('fail-'+msg.bus,good?0:(flow.get('fail-'+msg.bus)||0)+1);
const now=Date.now();let seq=context.get('seq')||0;context.set('seq',++seq);if(!context.get('session'))context.set('session',String(now));
let off=0;
const samples=tags.map(t=>{
 const n=registerCount(t.dataType);
 const slice=good?msg.payload.slice(off,off+n):null;
 off+=n;
 let v=null;
 if(slice&&slice.length>=n){
  try{const dv=decodeRegisters(slice,t);v=t.dataType==='bool'?Boolean(dv):dv;}catch(e){v=null;}
 }
 flow.set('fresh-'+t.id,v!==null?now:0);
 return {tagId:t.id,value:v,quality:v!==null?'good':'bad',sampledAt:now};
});
return {payload:{token:${JSON.stringify(token)},revision:${revision},source:${JSON.stringify(key)},session:context.get('session'),sequence:seq,samples}};`,x:850,y,wires:[['scada-ws-out']]});y+=90;
  }
  const connIds=connections.map(x=>x.id);
  const busKeyByConn=Object.fromEntries(connections.map(cn=>[cn.id,busKeyOf(cn)]));
  const lockMsByConn=Object.fromEntries(connections.map(cn=>[cn.id,modbusLockMs(cn)]));
  /* Okuma testi (etiket eklerken): kaydedilmemis bir adresi bir kez okur. YALNIZ FC1-4 (okuma).
   * PLC'ye ayri soket acilmaz — DVP ailesinde soket tavani kucuk (B57); ayni modbus-client ve
   * ayni hat kilidi kullanilir, tarama ile carpismaz. En cok 4 register / 16 bit. */
  const ry=y+40;
  add('scada-read-http','http in',{name:'Okuma testi',url:'/scada-bridge/read',method:'post',upload:false,swaggerDoc:'',x:180,y:ry,wires:[['scada-read-guard']]});
  add('scada-read-guard','function',{name:'Okuma testi kontrolü',outputs:connIds.length+1,func:`const p=msg.payload;const out=Array(${connIds.length+1}).fill(null);function fail(code,text){msg.statusCode=code;msg.payload={error:text};out[${connIds.length}]=msg;return out;}
if(msg.req.headers['x-scada-token']!==${JSON.stringify(token)})return fail(401,'Yetkisiz');
const connections=${JSON.stringify(connIds)},connBus=${JSON.stringify(busKeyByConn)},connLockMs=${JSON.stringify(lockMsByConn)};
if(!p||![1,2,3,4].includes(p.fc)||!Number.isInteger(p.address)||p.address<0||p.address>65535||!Number.isInteger(p.quantity)||p.quantity<1||p.quantity>16||!Number.isInteger(p.unitid)||p.unitid<1||p.unitid>247)return fail(400,'Geçersiz okuma isteği');
const i=connections.indexOf(p.connectionId);if(i<0)return fail(404,'Bağlantı sahada yok; önce Haberleşmeye uygula');
const busKey=connBus[p.connectionId],key='read-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),deadline=Date.now()+4000;
function dispatch(){const lock=flow.get('bus-'+busKey);if(lock&&Date.now()-lock.at<connLockMs[p.connectionId]){if(Date.now()>deadline){node.send(fail(503,'Hat meşgul; tekrar deneyin'));return;}setTimeout(dispatch,25);return;}
flow.set('bus-'+busKey,{at:Date.now(),kind:'read',key});msg.bus=busKey;msg.lockKey=key;msg.payload={fc:p.fc,unitid:p.unitid,address:p.address,quantity:p.quantity};out[i]=msg;node.send(out);}
dispatch();return null;`,x:510,y:ry,wires:[...connIds.map(i=>['scada-readtest-'+i]),['scada-http-response']]});
  for(const [n,conn] of connIds.entries())add('scada-readtest-'+conn,'modbus-flex-getter',{name:'Test oku · '+conn,server:'scada-client-'+conn,emptyMsgOnFail:true,keepMsgProperties:true,showErrors:false,showWarnings:false,x:770,y:ry+n*70,wires:[['scada-read-result'],[]]});
  add('scada-read-result','function',{name:'Okuma testi cevabı',outputs:1,func:"const lock=flow.get('bus-'+msg.bus);if(lock&&lock.key===msg.lockKey)flow.set('bus-'+msg.bus,null);const ok=!msg.error&&Array.isArray(msg.payload);msg.statusCode=ok?200:502;msg.payload=ok?{data:msg.payload.map(v=>typeof v==='boolean'?v:Number(v))}:{error:String((msg.error&&msg.error.message)||msg.error||'Yanıt yok')};return msg;",x:990,y:ry,wires:[['scada-http-response']]});
  return nodes;
 }
};
/* --- OPC UA surucusu --------------------------------------------------------
 * node-red-contrib-opcua (node-opcua, Apache-2.0) uzerinden. 2026-09-30'da
 * gercek paketle yeniden yazildi: onceki surum pakette OLMAYAN bir
 * 'OpcUa-Subscribe' dugumu uretiyordu, yani OPC UA hic calismamisti.
 * Baglanti basina bir 'OpcUa-Endpoint' (yapilandirma: adres, guvenlik modu/
 * politikasi, giris bilgisi) ve 'readmultiple' eylemli bir 'OpcUa-Client'.
 * Cihaz basina bir zamanlayici her pollMs'te cihazin nodeId listesini okutur;
 * istemcinin 3. cikisi butun DataValue'lari tek mesajda verir, donusum
 * StatusCode'u opcQuality ile kalite modeline cevirir.
 * Abonelik DEGIL duzenli okuma: abonelik yalniz degisimde bildirim uretir,
 * degismeyen deger sunucuda bayat gorunurdu; tarama felsefesi de bu.
 *
 * Giris (Faz 1): kullanici/parola config'te DEGIL, connection-secrets.json'da
 * durur ve ctx.secret ile okunur. Kullanici adi varsa endpoint dugumu
 * login:true olur ve parola YALNIZ Node-RED `credentials` alaninda gider
 * (Node-RED onu flows_cred.json'a yazar, GET /flows'ta dondurmez).
 * Anonim ve parolali endpoint'in dugum kimligi farklidir: parolaliden anonime
 * donuste eski dugum silinir ve Node-RED onun kayitli kimlik bilgisini de siler.
 *
 * Yazma (Faz 1): paylasilan koprunun OPC UA dali. Hazirlik dugumu degeri
 * etiketin tipine/sinirina gore dogrular, olcegi geri alir ve
 * `nodeId;datatype=<Tip>` konusuyla 'write' eylemli ikinci bir OpcUa-Client'a
 * verir (ayni endpoint). Istemci ayni msg nesnesini (command/req/res dahil)
 * 1. cikistan StatusCode ya da Error ile geri yollar; sonuc dugumu bunu
 * paylasilan sonuc dugumunun diline (basari / msg.error) cevirir.
 * Oturum kurulmadan gelen yazmayi istemci kuyruga alip oturum acilinca
 * (komutun suresi coktan dolmusken) yazardi; hazirlik dugumu bu yuzden yazma
 * istemcisinin durum cikisini izler ve oturum hazir degilse 503 ile reddeder.
 */
/** Etiket veri tipi -> OPC UA yerlesik veri tipi (yazma konusundaki datatype=). */
export const OPCUA_WRITE_DATATYPE:Record<Tag['dataType'],string>={bool:'Boolean',int16:'Int16',uint16:'UInt16',int32:'Int32',uint32:'UInt32',float32:'Float'};
/** Yazmada ham deger sinirlari (OPC UA tip araligi). */
const OPCUA_INT_LIMITS:Record<string,[number,number]>={int16:[-32768,32767],uint16:[0,65535],int32:[-2147483648,2147483647],uint32:[0,4294967295]};
const FLOAT32_MAX=3.4028234663852886e38;
/** Yazma istemcisi bu durumlardayken gelen msg'yi kuyruga alir (gec yazma riski): hazirlik reddeder. */
const OPCUA_QUEUEING_STATES=['','create client','connecting','reconnect'];
/** Yazma icin nodeId: paket yalniz 'ns=' ile baslayan konuyu yazar (digerini sessizce atar).
 * 'i=85' gibi ns'siz kimlik ns=0'a tamamlanir; nsu= ve bicimsiz kimlik null doner. */
export function opcWriteNodeId(nodeId:string|undefined):string|null{
 const id=(nodeId??'').trim();
 if(!id||/datatype=/i.test(id))return null;
 const full=/^[isgb]=/.test(id)?'ns=0;'+id:id;
 return /^ns=\d{1,5};(i=\d+|s=.+|g=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|b=[A-Za-z0-9+/=]+)$/.test(full)?full:null;
}
const opcKey=(conn:Connection)=>'scada-opcua-'+conn.id;
/** Baglantinin giris bilgisi: kullanici adi yoksa anonim (parola tek basina kullanilmaz). */
function opcLogin(conn:Connection,ctx:DriverContext){
 const s=ctx.secret?.(conn.id);
 const user=s?.username?.trim();
 return user?{user,password:s?.password??''}:null;
}
/** Endpoint dugum kimligi giris turune gore ayrilir (bkz. ust not). */
export function opcEndpointId(conn:Connection,ctx:DriverContext){return opcKey(conn)+(opcLogin(conn,ctx)?'-endpoint-auth':'-endpoint');}
function opcSecurity(conn:Connection){
 const secmode=({'none':'None','sign':'Sign','sign-encrypt':'SignAndEncrypt'} as Record<string,string>)[conn.securityMode||'none'];
 const secpol=secmode==='None'?'None':(conn.securityPolicy||'Basic256Sha256');
 return {secmode,secpol};
}
function opcClientNode(id:string,name:string,endpoint:string,action:string,conn:Connection,x:number,y:number,wires:string[][]){
 const {secmode,secpol}=opcSecurity(conn);
 return {id,type:'OpcUa-Client',z:'scada-gateway',name,endpoint,action,deadbandtype:'a',deadbandvalue:1,time:10,timeUnit:'s',
  certificate:'n',localfile:'',localkeyfile:'',securitymode:secmode,securitypolicy:secpol,useTransport:false,maxChunkCount:1,maxMessageSize:8192,receiveBufferSize:8192,sendBufferSize:8192,
  setstatusandtime:false,keepsessionalive:true,applicationName:'Z SCADA',applicationUri:'',x,y,wires};
}
export const OPCUA_WRITE_PREP_ID='scada-opcua-write-prep',OPCUA_WRITE_RESULT_ID='scada-opcua-write-result';
export const opcUaDriver:Driver={
 id:'opc-ua',
 label:'OPC UA',
 supports:c=>c.protocol==='opc-ua',
 validate(c,tags){
  for(const t of tags)if(!t.nodeId||!t.nodeId.trim())throw Error(t.code+': OPC UA etiketi için node kimliği (nodeId) gerekli.');
  // Eski 'username' alani artik kullanilmiyor (kimlik bilgisi connection-secrets.json'da); yok sayilir.
  for(const t of tags){
   if(t.access!=='readwrite')continue;
   if(!opcWriteNodeId(t.nodeId))throw Error(t.code+': yazılabilir OPC UA etiketinde node kimliği ns=<n>;i=… / s=… / g=… / b=… biçiminde olmalı (nsu= desteklenmez).');
   if(t.dataType!=='bool'&&t.min>=t.max)throw Error(t.code+': yazma için alt sınır üst sınırdan küçük olmalı.');
  }
 },
 writeLimits:{allowWrite:true},
 buildNodes(connections,devices,tags,ctx){
  const {token,revision}=ctx;
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  let y=150;
  for(const conn of connections){
   const connDevices=devices.filter(d=>d.enabled&&d.connectionId===conn.id);
   const connTags=tags.filter(t=>connDevices.some(d=>d.id===t.deviceId));
   if(!connTags.length)continue;
   const key=opcKey(conn);
   const {secmode,secpol}=opcSecurity(conn);
   const login=opcLogin(conn,ctx);
   const endpoint={id:opcEndpointId(conn,ctx),type:'OpcUa-Endpoint',name:conn.name,endpoint:conn.endpoint!.trim(),secpol,secmode,usercert:false,usercertificate:'',userprivatekey:''};
   // Parola yalniz `credentials` icinde: Node-RED onu dugum yapilandirmasindan ayirip flows_cred.json'a yazar.
   nodes.push(login?{...endpoint,none:false,login:true,credentials:{user:login.user,password:login.password}}:{...endpoint,none:true,login:false});
   // readmultiple: istemcinin 3. cikisi butun degerleri {topic:[items],payload:[DataValue]} olarak verir.
   nodes.push(opcClientNode(key+'-client','OPC UA · '+conn.name,endpoint.id,'readmultiple',conn,450,y,[[],[],[key+'-convert']]));
   const tagsByNode:Record<string,{id:string;bool:boolean;scale:number;offset:number}[]>={};
   for(const t of connTags)(tagsByNode[t.nodeId!.trim()]??=[]).push({id:t.id,bool:t.dataType==='bool',scale:t.scale,offset:t.offset});
   for(const d of connDevices){
    const ids=[...new Set(tags.filter(t=>t.deviceId===d.id).map(t=>t.nodeId!.trim()))];
    if(!ids.length)continue;
    const secs=Math.max(0.5,d.pollMs/1000);
    add(key+'-clock-'+d.id,'inject',{name:'Okuma · '+d.name,props:[{p:'payload'},{p:'topic',vt:'str'}],topic:'readmultiple',payload:JSON.stringify(ids),payloadType:'json',
     repeat:String(secs),once:true,onceDelay:'3',x:180,y,wires:[[key+'-client']]});
    y+=50;
   }
   add(key+'-convert','function',{name:'Etiket / kalite (OPC UA)',outputs:1,func:`const opcQuality=${opcQuality.toString()};
const byNode=${JSON.stringify(tagsByNode)};
const items=Array.isArray(msg.topic)?msg.topic:[],values=Array.isArray(msg.payload)?msg.payload:[];
const now=Date.now(),samples=[];
items.forEach((it,i)=>{const nid=String(it&&it.nodeId!==undefined?it.nodeId:it);const list=byNode[nid];if(!list)return;const dv=values[i]||{};
 const sc=dv.statusCode,code=sc&&typeof sc==='object'?(sc.value!==undefined?sc.value:sc._value):sc;const quality=opcQuality(code===undefined?0:code);
 const raw=dv.value&&typeof dv.value==='object'&&'value' in dv.value?dv.value.value:dv.value;
 for(const t of list){let value=null;if(quality==='good'||quality==='stale'){if(t.bool){if(typeof raw==='boolean'||raw===0||raw===1)value=!!raw;}else{const n=Number(raw);if(raw!==null&&raw!==''&&Number.isFinite(n))value=Number((n*t.scale+t.offset).toPrecision(15));}}
  flow.set('fresh-'+t.id,value!==null&&quality==='good'?now:0);samples.push({tagId:t.id,value,quality:value===null?'bad':quality,sampledAt:now});}});
if(!samples.length)return null;
return {payload:{token:${JSON.stringify(token)},revision:${revision},source:${JSON.stringify(key)},sequence:now,samples}};`,x:720,y,wires:[['scada-ws-out']]});
   y+=90;
  }
  return nodes;
 },
 /* Yazma dali: tek hazirlik dugumu (ciktilari baglanti basina + red), baglanti basina 'write'
  * istemcisi + durum izleyici + catch, tek sonuc donusturucu. Bekleyen yazmalar baglanti basina
  * flow baglaminda tutulur ('opcua-wpend-<baglanti>'): istemci msg'siz node.error verirse catch
  * hangi komutun dustugunu bilemez, bekleyenleri hatayla kapatir (paylasilan sonuc ikinci cevabi yutar). */
 buildWriteNodes(connections,devices,tags,ctx){
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  const writable=writableTags(devices,tags);
  const connIds=connections.map(c=>c.id).filter(id=>writable.some(t=>devices.find(d=>d.id===t.deviceId)?.connectionId===id));
  if(!connIds.length)return {nodes:[],entries:{}};
  const meta:Record<string,any>={};
  for(const t of writable){
   const d=devices.find(x=>x.id===t.deviceId)!;
   const topic=opcWriteNodeId(t.nodeId);
   if(!topic||!connIds.includes(d.connectionId))continue;
   meta[t.id]={code:t.code,conn:d.connectionId,topic,type:OPCUA_WRITE_DATATYPE[t.dataType],dt:t.dataType,scale:t.scale,offset:t.offset,min:t.min,max:t.max};
  }
  const n=connIds.length,y=600;
  add(OPCUA_WRITE_PREP_ID,'function',{name:'OPC UA yazma: doğrula / tip',outputs:n+1,func:`const c=msg.command;const out=Array(${n+1}).fill(null);function reject(code,text){msg.reject={code:code,error:text};out[${n}]=msg;return out;}
const tags=${JSON.stringify(meta)},connections=${JSON.stringify(connIds)},limits=${JSON.stringify(OPCUA_INT_LIMITS)},queueing=${JSON.stringify(OPCUA_QUEUEING_STATES)};
const t=c&&Object.prototype.hasOwnProperty.call(tags,c.tagId)?tags[c.tagId]:null;if(!t)return reject(400,'Etiket bulunamadı');
if(Date.now()>c.expiresAt)return reject(409,'Komut süresi doldu');
const st=flow.get('opcua-wstate-'+t.conn);if(typeof st!=='string'||queueing.includes(st))return reject(503,'OPC UA yazma oturumu hazır değil ('+(st||'bağlanıyor')+')');
const v=c.value;let raw;
if(t.dt==='bool'){if(typeof v!=='boolean')return reject(400,'Dijital değer gerekli');raw=v;}
else{
 if(typeof v!=='number'||!Number.isFinite(v))return reject(400,t.code+': değer sayısal olmalı.');
 if(v<t.min||v>t.max)return reject(400,t.code+': değer izin verilen sınırlar dışında ('+v+').');
 raw=(v-t.offset)/t.scale;
 if(t.dt==='float32'){if(!Number.isFinite(raw)||Math.abs(raw)>${FLOAT32_MAX})return reject(400,t.code+': değer Float aralığı dışında.');}
 else{const r=Math.round(raw);if(Math.abs(raw-r)>1e-6)return reject(400,t.code+': değer tam sayıya çevrilemiyor.');const lim=limits[t.dt];if(r<lim[0]||r>lim[1])return reject(400,t.code+': değer '+t.type+' sınırını aşıyor.');raw=r;}
}
delete msg.datatype;delete msg.range;delete msg.action;
msg.topic=t.topic+';datatype='+t.type;msg.payload=raw;
const pk='opcua-wpend-'+t.conn,pend=flow.get(pk)||{},now=Date.now();for(const k of Object.keys(pend))if(now-pend[k].at>${WRITE_REPLY_TIMEOUT_MS+1000})delete pend[k];
pend[c.commandId]={at:now,mid:msg._msgid,req:msg.req,res:msg.res,command:c};flow.set(pk,pend);
out[connections.indexOf(t.conn)]=msg;return out;`,x:770,y,wires:[...connIds.map(id=>['scada-opcua-'+id+'-wclient']),[WRITE_RESULT_ID]]});
  const byId=new Map(connections.map(c=>[c.id,c]));
  for(const [i,id] of connIds.entries()){
   const conn=byId.get(id)!,key=opcKey(conn),wy=y+i*90;
   // 1. cikis: yazma sonucu (ayni msg); 2. cikis: istemci durumu (oturum hazir mi).
   nodes.push(opcClientNode(key+'-wclient','OPC UA yaz · '+conn.name,opcEndpointId(conn,ctx),'write',conn,1000,wy,[[OPCUA_WRITE_RESULT_ID],[key+'-wstate'],[]]));
   add(key+'-wstate','function',{name:'Yazma oturumu durumu',outputs:0,func:`if(msg&&typeof msg.status==='string')flow.set(${JSON.stringify('opcua-wstate-'+id)},msg.status);return null;`,x:1240,y:wy+30,wires:[]});
   add(key+'-wcatch','catch',{name:'Yazma istemcisi hatası',scope:[key+'-wclient'],uncaught:false,x:1000,y:wy+50,wires:[[key+'-wfail']]});
   add(key+'-wfail','function',{name:'Bekleyen yazmaları kapat',outputs:1,func:`const pk=${JSON.stringify('opcua-wpend-'+id)};const text='OPC UA yazma hatası: '+String((msg.error&&msg.error.message)||msg.error||'istemci hatası');
if(msg.command){const pend=flow.get(pk)||{};delete pend[msg.command.commandId];flow.set(pk,pend);msg.error=text;return msg;}
const pend=flow.get(pk)||{};flow.set(pk,{});
return [Object.keys(pend).map(k=>({_msgid:pend[k].mid,req:pend[k].req,res:pend[k].res,command:pend[k].command,error:text}))];`,x:1240,y:wy+60,wires:[[WRITE_RESULT_ID]]});
  }
  add(OPCUA_WRITE_RESULT_ID,'function',{name:'OPC UA yazma sonucu',outputs:1,func:`const c=msg.command;if(c){const pk='opcua-wpend-'+c.connectionId,pend=flow.get(pk);if(pend&&pend[c.commandId]){delete pend[c.commandId];flow.set(pk,pend);}}
const p=msg.payload;
if(p&&typeof p==='object'&&typeof p.message==='string'&&p.value===undefined&&p._value===undefined){msg.error='OPC UA yazma hatası: '+p.message;return msg;}
const code=typeof p==='number'?p:(p&&typeof p==='object'?(typeof p.value==='number'?p.value:p._value):undefined);
if(typeof code!=='number'){msg.error='OPC UA yazma yanıtı anlaşılamadı';return msg;}
if((code>>>30)!==0){const name=p&&typeof p==='object'?(p.name||p.description||''):'';msg.error='OPC UA yazma reddedildi: '+(name?name+' ':'')+'(0x'+(code>>>0).toString(16).toUpperCase().padStart(8,'0')+')';return msg;}
delete msg.error;msg.payload={statusCode:code};return msg;`,x:1240,y:y-60,wires:[[WRITE_RESULT_ID]]});
  return {nodes,entries:Object.fromEntries(connIds.map(id=>[id,OPCUA_WRITE_PREP_ID]))};
 }
};
/* --- S7 ve ADS ortak yazma dali --------------------------------------------
 * Iki paketin yazma dugumu de sonucu Node-RED `done()` ile bildirir ('s7 out'
 * cikissiz; 'ads-client-write-value' basarida msg'yi 1. cikistan yollar,
 * hatada yalniz done(err)). Dal: tek hazirlik dugumu (dogrula, olcegi geri al,
 * ham tip sinirini denetle) -> baglanti basina yazma dugumu -> basari: (S7)
 * ona kapsamli 'complete' / (ADS) 1. cikis -> sonuc donusturucu; hata:
 * kapsamli 'catch' -> bekleyenleri kapat. complete/catch msg'yi cloneMessage
 * ile verir: req/res ayni nesne kalir, command derin kopyalanir.
 * Bekleyen yazmalar baglanti basina flow baglaminda ('<onek>-wpend-<baglanti>'):
 * paket msg'siz node.error verirse (S7 bilinmeyen degisken) catch hangi komutun
 * dustugunu bilemez; o baglantinin bekleyenlerini hatayla kapatir.
 */
type ScalarWriteMeta={code:string;conn:string;target:string;type:string;bool:boolean;float:boolean;range:[number,number]|null;scale:number;offset:number;min:number;max:number};
/** Hazirlik fonksiyon govdesi: deger dogrulama + ham deger (olcek/ofset geri alinir); `assign` hedefi msg'ye yazar.
 * Cikis secimi: varsayilan baglanti basina (routes = baglanti kimlikleri, t.conn); `routeBy:'target'` ile etiket hedefi
 * basina (routes = hedefler, t.target; EtherNet/IP'de her etiketin kendi yazma dugumu var). `gate`: sure kontrolunden sonra
 * calisan ek kosul (orn. baglanti hazir degilse 503). */
function scalarWritePrepSource(n:number,meta:Record<string,ScalarWriteMeta>,routes:string[],pendPrefix:string,assign:string,opts:{routeBy?:'conn'|'target';gate?:string}={}){
 return `const c=msg.command;const out=Array(${n+1}).fill(null);function reject(code,text){msg.reject={code:code,error:text};out[${n}]=msg;return out;}
const tags=${JSON.stringify(meta)},routes=${JSON.stringify(routes)};
const t=c&&Object.prototype.hasOwnProperty.call(tags,c.tagId)?tags[c.tagId]:null;if(!t)return reject(400,'Etiket bulunamadı');
if(Date.now()>c.expiresAt)return reject(409,'Komut süresi doldu');
${opts.gate??''}
const v=c.value;let raw;
if(t.bool){if(typeof v!=='boolean')return reject(400,'Dijital değer gerekli');raw=v;}
else{
 if(typeof v!=='number'||!Number.isFinite(v))return reject(400,t.code+': değer sayısal olmalı.');
 if(v<t.min||v>t.max)return reject(400,t.code+': değer izin verilen sınırlar dışında ('+v+').');
 raw=(v-t.offset)/t.scale;
 if(t.float){if(!Number.isFinite(raw)||Math.abs(raw)>${FLOAT32_MAX})return reject(400,t.code+': değer '+t.type+' aralığı dışında.');}
 else{const r=Math.round(raw);if(Math.abs(raw-r)>1e-6)return reject(400,t.code+': değer tam sayıya çevrilemiyor.');if(r<t.range[0]||r>t.range[1])return reject(400,t.code+': değer '+t.type+' sınırını aşıyor.');raw=r;}
}
${assign}msg.payload=raw;
const pk='${pendPrefix}-wpend-'+t.conn,pend=flow.get(pk)||{},now=Date.now();for(const k of Object.keys(pend))if(now-pend[k].at>${WRITE_REPLY_TIMEOUT_MS+1000})delete pend[k];
pend[c.commandId]={at:now,mid:msg._msgid,req:msg.req,res:msg.res,command:c};flow.set(pk,pend);
const o=routes.indexOf(t.${opts.routeBy==='target'?'target':'conn'});if(o<0){delete pend[c.commandId];flow.set(pk,pend);return reject(500,'Yazma hedefi bulunamadı');}
out[o]=msg;return out;`;
}
/** Basari donusturucu: bekleyeni sil, paylasilan sonuc dugumu icin dolu payload birak. */
function scalarWriteResultSource(pendPrefix:string){
 return `const c=msg.command;if(c){const pk='${pendPrefix}-wpend-'+c.connectionId,pend=flow.get(pk);if(pend&&pend[c.commandId]){delete pend[c.commandId];flow.set(pk,pend);}}
delete msg.error;delete msg.complete;msg.payload={written:msg.payload===undefined?null:msg.payload};return msg;`;
}
/** Hata: msg'de komut varsa yalniz onu, yoksa baglantinin butun bekleyenlerini hatayla kapatir. */
function scalarWriteFailSource(pendKey:string,label:string){
 return `const pk=${JSON.stringify(pendKey)};const text=${JSON.stringify(label+' yazma hatası: ')}+String((msg.error&&msg.error.message)||msg.error||'istemci hatası');
if(msg.command){const pend=flow.get(pk)||{};delete pend[msg.command.commandId];flow.set(pk,pend);msg.error=text;return msg;}
const pend=flow.get(pk)||{};flow.set(pk,{});
return [Object.keys(pend).map(k=>({_msgid:pend[k].mid,req:pend[k].req,res:pend[k].res,command:pend[k].command,error:text}))];`;
}
/** Etiket veri tipi -> ADS (TwinCAT) tipi adi; ads-client gercek tipi sembolden okur, bu ad yalniz sinir/mesaj icindir. */
export const ADS_WRITE_DATATYPE:Record<Tag['dataType'],string>={bool:'BOOL',int16:'INT',uint16:'UINT',int32:'DINT',uint32:'UDINT',float32:'REAL'};
const writeConnIds=(connections:Connection[],devices:Device[],writable:Tag[])=>connections.map(c=>c.id).filter(id=>writable.some(t=>devices.find(d=>d.id===t.deviceId)?.connectionId===id));
/* --- Siemens S7 surucusu (S7comm, ISO-on-TCP 102) ------------------------
 * node-red-contrib-s7 (nodes7) uzerinden. Her baglanti tek bir PLC'dir:
 * bir 's7 endpoint' (rack/slot, cevrim suresi, degisken tablosu) ve onu
 * dinleyen tek bir 's7 in' ('all' modu, diff kapali: her basarili okuma
 * cevriminde tum degerler tek nesne olarak gelir). Degisken adi etiket
 * kimligidir; donusum dugumu ham degeri scale/offset ile muhendislik
 * birimine cevirir. Okuma koparsa paket veri gondermez; etiketin bayatligi
 * sunucudaki staleMs kontroluyle ortaya cikar (sahte 'good' uretilmez).
 * PLC tarafi: S7-1200/1500'de PUT/GET izni acik ve okunan DB'lerde
 * "optimized block access" kapali olmali; aksi halde PLC okumayi reddeder.
 * Yazma: paylasilan koprunun S7 dali ('s7 out', ayni endpoint, degisken adi =
 * etiket kimligi). PLC'de PUT/GET izni ve optimize edilmemis DB sart; giris
 * goruntusune (I/E) yazma validateConfig'te reddedilir. Baglanti yokken nodes7
 * yazmayi kuyruga almaz, hemen ERR_NOT_CONNECTED ile reddeder (gec yazma yok).
 * Lisans notu: node-red-contrib-s7 ve @st-one-io/nodes7 GPL-3.0-or-later; depoda yer almaz, npm bagimliligi
 * olarak kurulur. Dagitimdaki yukumlulukler icin THIRD-PARTY-NOTICES.md.
 */
export const S7_MIN_CYCLE_MS=500,S7_WRITE_PREP_ID='scada-s7-write-prep',S7_WRITE_RESULT_ID='scada-s7-write-result';
export const s7Driver:Driver={
 id:'s7',
 label:'Siemens S7',
 supports:c=>c.protocol==='s7',
 validate(c,tags){
  for(const t of tags){
   if(!t.s7Address||!t.s7Address.trim())throw Error(t.code+': S7 etiketi için adres gerekli, örn. DB1,REAL4 veya M0.0.');
   const parsed=parseS7Address(t.s7Address);
   if(parsed.dataType!==t.dataType)throw Error(t.code+': S7 adresi '+parsed.address+' '+parsed.dataType+' okur, etiketin veri tipi '+t.dataType+'.');
  }
  for(const t of tags){
   if(t.access!=='readwrite')continue;
   if(/^I/.test(parseS7Address(t.s7Address!).address))throw Error(t.code+': S7 giriş alanına (I/E) yazılamaz; M, Q veya DB adresi kullanın.');
   if(t.dataType!=='bool'&&t.min>=t.max)throw Error(t.code+': yazma için alt sınır üst sınırdan küçük olmalı.');
  }
 },
 writeLimits:{allowWrite:true},
 buildWriteNodes(connections,devices,tags){
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  const writable=writableTags(devices,tags);
  const connIds=writeConnIds(connections,devices,writable);
  if(!connIds.length)return {nodes:[],entries:{}};
  const meta:Record<string,ScalarWriteMeta>={};
  for(const t of writable){
   const d=devices.find(x=>x.id===t.deviceId)!;
   const w=s7WriteType(t.s7Address!);
   meta[t.id]={code:t.code,conn:d.connectionId,target:t.id,type:w.type,bool:w.type==='BOOL',float:w.type==='REAL',range:w.range,scale:t.scale,offset:t.offset,min:t.min,max:t.max};
  }
  const n=connIds.length,y=900;
  // 's7 out' degiskeni msg.variable'dan alir (dugumde degisken bos); konu/diger alanlar dokunulmaz.
  add(S7_WRITE_PREP_ID,'function',{name:'S7 yazma: doğrula / tip',outputs:n+1,func:scalarWritePrepSource(n,meta,connIds,'s7','msg.variable=t.target;'),x:770,y,wires:[...connIds.map(id=>['scada-s7-'+id+'-out']),[WRITE_RESULT_ID]]});
  for(const [i,id] of connIds.entries()){
   const key='scada-s7-'+id,wy=y+i*90;
   add(key+'-out','s7 out',{name:'S7 yaz · '+(connections.find(c=>c.id===id)?.name??id),endpoint:key+'-endpoint',variable:'',x:1000,y:wy,wires:[]});
   add(key+'-wdone','complete',{name:'S7 yazma tamam',scope:[key+'-out'],uncaught:false,x:1000,y:wy+40,wires:[[S7_WRITE_RESULT_ID]]});
   add(key+'-wcatch','catch',{name:'S7 yazma hatası',scope:[key+'-out'],uncaught:false,x:1000,y:wy+80,wires:[[key+'-wfail']]});
   add(key+'-wfail','function',{name:'Bekleyen yazmaları kapat',outputs:1,func:scalarWriteFailSource('s7-wpend-'+id,'S7'),x:1240,y:wy+80,wires:[[WRITE_RESULT_ID]]});
  }
  add(S7_WRITE_RESULT_ID,'function',{name:'S7 yazma sonucu',outputs:1,func:scalarWriteResultSource('s7'),x:1240,y:y-60,wires:[[WRITE_RESULT_ID]]});
  return {nodes,entries:Object.fromEntries(connIds.map(id=>[id,S7_WRITE_PREP_ID]))};
 },
 buildNodes(connections,devices,tags,ctx){
  const {token,revision}=ctx;
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  let y=150;
  for(const conn of connections){
   const connDevices=devices.filter(d=>d.enabled&&d.connectionId===conn.id);
   const deviceIds=new Set(connDevices.map(d=>d.id));
   const connTags=tags.filter(t=>deviceIds.has(t.deviceId));
   if(!connTags.length)continue;
   const key='scada-s7-'+conn.id;
   const cycle=Math.max(S7_MIN_CYCLE_MS,Math.min(...connDevices.map(d=>d.pollMs)));
   add(key+'-endpoint','s7 endpoint',{name:conn.name,transport:'iso-on-tcp',address:conn.host,port:String(conn.port),
    rack:String(conn.rack??0),slot:String(conn.slot??1),connmode:'rack-slot',
    localtsaphi:'01',localtsaplo:'00',remotetsaphi:'01',remotetsaplo:'00',adapter:'',busaddr:2,
    cycletime:cycle,timeout:conn.timeout,verbose:'default',
    vartable:connTags.map(t=>({name:t.id,addr:parseS7Address(t.s7Address!).address}))});
   add(key+'-in','s7 in',{name:'Okuma · '+conn.name,endpoint:key+'-endpoint',mode:'all',variable:'',diff:false,x:150,y,wires:[[key+'-convert']]});
   const meta=Object.fromEntries(connTags.map(t=>[t.id,{bool:t.dataType==='bool',scale:t.scale,offset:t.offset}]));
   add(key+'-convert','function',{name:'Etiket / kalite (S7)',outputs:1,func:`const meta=${JSON.stringify(meta)};const values=msg.payload&&typeof msg.payload==='object'?msg.payload:{};const now=Date.now();const samples=Object.keys(meta).map(tagId=>{const m=meta[tagId];const raw=values[tagId];let value=null,quality='bad';if(raw!==undefined&&raw!==null){if(m.bool){value=!!raw;quality='good';}else{const n=Number(raw);if(Number.isFinite(n)){value=Number((n*m.scale+m.offset).toPrecision(15));quality='good';}}}flow.set('fresh-'+tagId,value!==null?now:0);return {tagId,value,quality,sampledAt:now};});return {payload:{token:${JSON.stringify(token)},revision:${revision},source:${JSON.stringify(key)},sequence:now,samples}};`,x:400,y,wires:[['scada-ws-out']]});
   y+=90;
  }
  return nodes;
 }
};
/* --- Beckhoff ADS surucusu (TwinCAT, TCP 48898) ---------------------------
 * node-red-contrib-ads-client (ads-client, MIT) uzerinden. Her baglanti tek
 * PLC calisma zamanidir: bir 'ads-client-connection' (hedef AMS Net ID + ADS
 * portu, router = PLC IP). localAmsNetId verilmisse dogrudan baglanti (bu PC
 * icin PLC'nin StaticRoutes.xml'inde route olmali); verilmemisse yerel TwinCAT
 * router'i kullanilir. Her etiket kendi sembolune CYCLIC abonelik acar
 * (onchange DEGIL: degismeyen deger bildirim uretmez ve sunucu onu bayat
 * sanardi). Aboneligin ciktisi etiket kimligini bir 'change' dugumuyle alir,
 * donusum dugumu scale/offset uygular. Baglanti koparsa bildirim gelmez,
 * bayatlik sunucudaki staleMs ile gorunur (sahte 'good' uretilmez).
 * Yazma: paylasilan koprunun ADS dali ('ads-client-write-value', ayni
 * baglanti dugumu, konu = sembol). Paket baglanti yoksa yazmadan once
 * baglanmayi dener; bekci etiketin taze olmasini (abonelik veri getiriyor =
 * baglanti acik) zaten sart kostugu icin kopuk hatta yazma bekciden gecmez.
 */
export const ADS_MIN_CYCLE_MS=100,ADS_LOCAL_PORT=32750,ADS_WRITE_PREP_ID='scada-ads-write-prep',ADS_WRITE_RESULT_ID='scada-ads-write-result';
const ADS_INT_LIMITS:Record<string,[number,number]>={int16:[-32768,32767],uint16:[0,65535],int32:[-2147483648,2147483647],uint32:[0,4294967295]};
export const adsDriver:Driver={
 id:'ads',
 label:'Beckhoff ADS',
 supports:c=>c.protocol==='ads',
 validate(c,tags){
  if(!c.amsNetId?.trim())throw Error(c.name+': ADS bağlantısı için AMS Net ID gerekli.');
  parseAmsNetId(c.amsNetId);
  for(const t of tags){
   if(!t.adsSymbol?.trim())throw Error(t.code+': ADS etiketi için sembol gerekli, örn. GVL.fSicaklik.');
   parseAdsSymbol(t.adsSymbol);
  }
  for(const t of tags)if(t.access==='readwrite'&&t.dataType!=='bool'&&t.min>=t.max)throw Error(t.code+': yazma için alt sınır üst sınırdan küçük olmalı.');
 },
 writeLimits:{allowWrite:true},
 buildWriteNodes(connections,devices,tags){
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  const writable=writableTags(devices,tags);
  const connIds=writeConnIds(connections,devices,writable);
  if(!connIds.length)return {nodes:[],entries:{}};
  const meta:Record<string,ScalarWriteMeta>={};
  for(const t of writable){
   const d=devices.find(x=>x.id===t.deviceId)!;
   meta[t.id]={code:t.code,conn:d.connectionId,target:parseAdsSymbol(t.adsSymbol!),type:ADS_WRITE_DATATYPE[t.dataType],bool:t.dataType==='bool',float:t.dataType==='float32',
    range:t.dataType==='bool'||t.dataType==='float32'?null:ADS_INT_LIMITS[t.dataType],scale:t.scale,offset:t.offset,min:t.min,max:t.max};
  }
  const n=connIds.length,y=1200;
  // Yazma dugumunde yol bos: sembol msg.topic'ten gelir. Basarida paket {...msg,payload:yazilan,...} yollar.
  add(ADS_WRITE_PREP_ID,'function',{name:'ADS yazma: doğrula / tip',outputs:n+1,func:scalarWritePrepSource(n,meta,connIds,'ads','msg.topic=t.target;'),x:770,y,wires:[...connIds.map(id=>['scada-ads-'+id+'-write']),[WRITE_RESULT_ID]]});
  for(const [i,id] of connIds.entries()){
   const key='scada-ads-'+id,wy=y+i*90;
   add(key+'-write','ads-client-write-value',{name:'ADS yaz · '+(connections.find(c=>c.id===id)?.name??id),connection:key+'-connection',path:'',autoFill:false,x:1000,y:wy,wires:[[ADS_WRITE_RESULT_ID]]});
   add(key+'-wcatch','catch',{name:'ADS yazma hatası',scope:[key+'-write'],uncaught:false,x:1000,y:wy+50,wires:[[key+'-wfail']]});
   add(key+'-wfail','function',{name:'Bekleyen yazmaları kapat',outputs:1,func:scalarWriteFailSource('ads-wpend-'+id,'ADS'),x:1240,y:wy+50,wires:[[WRITE_RESULT_ID]]});
  }
  add(ADS_WRITE_RESULT_ID,'function',{name:'ADS yazma sonucu',outputs:1,func:scalarWriteResultSource('ads'),x:1240,y:y-60,wires:[[WRITE_RESULT_ID]]});
  return {nodes,entries:Object.fromEntries(connIds.map(id=>[id,ADS_WRITE_PREP_ID]))};
 },
 buildNodes(connections,devices,tags,ctx){
  const {token,revision}=ctx;
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  let y=150;
  for(const conn of connections){
   const connDevices=devices.filter(d=>d.enabled&&d.connectionId===conn.id);
   const connTags=tags.filter(t=>connDevices.some(d=>d.id===t.deviceId));
   if(!connTags.length)continue;
   const key='scada-ads-'+conn.id;
   const direct=!!conn.localAmsNetId?.trim();
   nodes.push({id:key+'-connection',type:'ads-client-connection',name:conn.name,
    targetAmsNetId:parseAmsNetId(conn.amsNetId!),targetAdsPort:conn.adsPort??851,
    routerAddress:conn.host,routerTcpPort:String(conn.port),
    localAmsNetId:direct?parseAmsNetId(conn.localAmsNetId!):undefined,localAdsPort:direct?String(ADS_LOCAL_PORT):undefined,
    timeoutDelay:String(conn.timeout),autoReconnect:true,reconnectInterval:'2000',
    allowHalfOpen:false,convertDatesToJavascript:true,deleteUnknownSubscriptions:true,disableCaching:false,forceUtf8ForAdsSymbols:false,
    hideConsoleWarnings:true,monitorPlcSymbolVersion:true,objectifyEnumerations:false,rawClient:false,readAndCacheDataTypes:false,readAndCacheSymbols:false,debugLevel:0});
   const meta=Object.fromEntries(connTags.map(t=>[t.id,{bool:t.dataType==='bool',scale:t.scale,offset:t.offset}]));
   for(const t of connTags){
    const d=connDevices.find(x=>x.id===t.deviceId)!;
    add(key+'-sub-'+t.id,'ads-client-subscribe-value',{name:t.code,connection:key+'-connection',path:parseAdsSymbol(t.adsSymbol!),
     cycleTime:String(Math.max(ADS_MIN_CYCLE_MS,d.pollMs)),mode:'cyclic',maxDelay:'0',retryInterval:'5000',controlSubscription:false,resubscribeTimeout:'5000',inputs:0,
     x:150,y,wires:[[key+'-tag-'+t.id]]});
    add(key+'-tag-'+t.id,'change',{name:'',rules:[{t:'set',p:'tagId',pt:'msg',to:t.id,tot:'str'}],x:400,y,wires:[[key+'-convert']]});
    y+=50;
   }
   add(key+'-convert','function',{name:'Etiket / kalite (ADS)',outputs:1,func:`const meta=${JSON.stringify(meta)};const m=meta[msg.tagId];if(!m)return null;const raw=msg.payload;const now=Date.now();let value=null;if(m.bool){if(typeof raw==='boolean'||raw===0||raw===1)value=!!raw;}else if(typeof raw==='number'||typeof raw==='bigint'){const n=Number(raw);if(Number.isFinite(n))value=Number((n*m.scale+m.offset).toPrecision(15));}flow.set('fresh-'+msg.tagId,value!==null?now:0);return {payload:{token:${JSON.stringify(token)},revision:${revision},source:${JSON.stringify(key)},sequence:now,samples:[{tagId:msg.tagId,value,quality:value!==null?'good':'bad',sampledAt:now}]}};`,x:650,y:y-50,wires:[['scada-ws-out']]});
   y+=90;
  }
  return nodes;
 }
};
/* --- MQTT surucusu (Node-RED cekirdek dugumleri; ek paket YOK) --------------
 * Baglanti basina bir 'mqtt-broker' yapilandirma dugumu (TLS'te ayrica 'tls-config', sunucu sertifikasi
 * dogrulanir; ozel CA bu fazda yok) ve FARKLI her konu icin tek bir 'mqtt in' (QoS 1, utf8). Konu jokersizdir
 * (validate reddeder), ayni konudan okuyan etiketler ayni aboneligi paylasir. Baglanti basina tek donusum
 * dugumu: yuk JSON.parse edilir (olmazsa duz metin), etiketin JSON yolu cikarilir, tipe cevrilir
 * (mqttCoerce; cevrilemeyen deger quality 'bad' — sahte 'good' YOK), scale/offset uygulanir.
 * Sira: Modbus'taki session + kesin artan sequence deseni (Date.now() cakismasi yok; bir milisaniyede birden
 * fazla mesaj gelebilir). Bayatlik: mesaj gelmezse ornek de gelmez; sunucu cihazin staleMs'i dolunca degeri
 * 'stale' yapar (index.ts live()). Yalniz degisimde yayinlayan cihazlarda staleMs yayin araligindan buyuk secilmeli.
 * Giris: kullanici/parola yalniz broker dugumunun `credentials`'inda (opcUaDriver deseni; parolali ve
 * parolasiz broker dugumunun kimligi farklidir, parolasiza donuste eskisi ve kayitli kimligi silinir).
 * Yazma YOK: mqtt out teslim/geri okuma onayi vermez; validate readwrite etiketi reddeder.
 */
const mqttKey=(conn:Connection)=>'scada-mqtt-'+conn.id;
function mqttLogin(conn:Connection,ctx:DriverContext){
 const s=ctx.secret?.(conn.id);
 const user=s?.username?.trim();
 return user?{user,password:s?.password??''}:null;
}
/** Broker dugum kimligi giris turune gore ayrilir (bkz. opcEndpointId). */
export function mqttBrokerId(conn:Connection,ctx:DriverContext){return mqttKey(conn)+(mqttLogin(conn,ctx)?'-broker-auth':'-broker');}
/** Varsayilan istemci kimligi: 'zscada-<makine>-<baglanti>'. Makine adi icerir: aktif ve yedek (standby) Z SCADA ayni
 * brokere ayni kimlikle baglanirsa broker birini surekli koparir (MQTT 3.1.1 §3.1.4). Makine basina deterministiktir
 * (her yayinda ayni; kalici oturum korunur). Makine adi [A-Za-z0-9_-] disi karakterlerden arindirilir; toplam en cok 64
 * karakter: asarsa makine adi kirpilir ve baglanti kimligi kisa ozetle temsil edilir. Elle verilen clientId her zaman kazanir. */
export const MQTT_CLIENT_ID_MAX=64;
export function mqttClientId(conn:Connection,hostname:string=os.hostname()){
 const own=conn.clientId?.trim();if(own)return own;
 const host=String(hostname??'').replace(/[^A-Za-z0-9_-]/g,'');
 const full='zscada-'+(host?host+'-':'')+conn.id;
 if(full.length<=MQTT_CLIENT_ID_MAX)return full;
 return 'zscada-'+(host?host.slice(0,24)+'-':'')+createHash('sha1').update(conn.id).digest('hex').slice(0,16);
}
/** Konu -> deterministik 'mqtt in' kimligi (konu serbest metin; kimlige dogrudan konamaz). */
export function mqttInId(conn:Connection,topic:string){return mqttKey(conn)+'-in-'+createHash('sha1').update(topic).digest('hex').slice(0,12);}
/** Broker (+ TLS'te tls-config) yapilandirma dugumleri. */
export function mqttBrokerNodes(conn:Connection,ctx:DriverContext):any[]{
 const login=mqttLogin(conn,ctx);
 const tls=!!conn.mqttTls,tlsId=mqttKey(conn)+'-tls';
 const broker:any={id:mqttBrokerId(conn,ctx),type:'mqtt-broker',name:conn.name,broker:conn.host.trim(),port:String(conn.port),clientid:mqttClientId(conn,ctx.hostname),autoConnect:true,
  usetls:tls,tls:tls?tlsId:'',protocolVersion:'4',keepalive:String(conn.mqttKeepalive??60),cleansession:conn.mqttCleanSession??true,autoUnsubscribe:true,
  birthTopic:'',birthQos:'0',birthRetain:'false',birthPayload:'',birthMsg:{},closeTopic:'',closeQos:'0',closeRetain:'false',closePayload:'',closeMsg:{},
  willTopic:'',willQos:'0',willRetain:'false',willPayload:'',willMsg:{},userProps:'',sessionExpiry:''};
 // Parola yalniz `credentials` icinde: Node-RED onu flows_cred.json'a ayirir, GET /flows'ta dondurmez.
 const nodes:any[]=[login?{...broker,credentials:{user:login.user,password:login.password}}:broker];
 if(tls)nodes.push({id:tlsId,type:'tls-config',name:conn.name+' TLS',cert:'',key:'',ca:'',certname:'',keyname:'',caname:'',servername:conn.host.trim(),verifyservercert:true,alpnprotocol:''});
 return nodes;
}
type MqttTagMeta={id:string;dt:string;steps:(string|number)[];ts:(string|number)[]|null;scale:number;offset:number};
export const mqttDriver:Driver={
 id:'mqtt',
 label:'MQTT',
 supports:c=>c.protocol==='mqtt',
 validate(c,tags){for(const t of tags)checkMqttTag(t);},
 writeLimits:{allowWrite:false},
 buildNodes(connections,devices,tags,ctx){
  const {token,revision}=ctx;
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  let y=150;
  for(const conn of connections){
   const connDevices=devices.filter(d=>d.enabled&&d.connectionId===conn.id);
   const connTags=tags.filter(t=>connDevices.some(d=>d.id===t.deviceId));
   if(!connTags.length)continue;
   const key=mqttKey(conn),brokerId=mqttBrokerId(conn,ctx);
   nodes.push(...mqttBrokerNodes(conn,ctx));
   const byTopic:Record<string,MqttTagMeta[]>={};
   for(const t of connTags){
    const topic=parseMqttTopic(t.mqttTopic??'');
    const ts=mqttPathSteps(t.mqttTimestampPath);
    (byTopic[topic]??=[]).push({id:t.id,dt:t.dataType,steps:mqttPathSteps(t.mqttJsonPath),ts:ts.length?ts:null,scale:t.scale,offset:t.offset});
   }
   for(const topic of Object.keys(byTopic)){
    add(mqttInId(conn,topic),'mqtt in',{name:topic,topic,qos:'1',datatype:'utf8',broker:brokerId,nl:false,rap:true,rh:0,inputs:0,x:180,y,wires:[[key+'-convert']]});
    y+=50;
   }
   add(key+'-convert','function',{name:'Etiket / kalite (MQTT)',outputs:1,func:`${mqttCodecSource()}
const byTopic=${JSON.stringify(byTopic)};
const list=typeof msg.topic==='string'&&Object.prototype.hasOwnProperty.call(byTopic,msg.topic)?byTopic[msg.topic]:null;if(!list)return null;
const now=Date.now();let body=msg.payload;
if(Buffer.isBuffer(body))body=body.toString('utf8');
if(typeof body==='string'){try{body=JSON.parse(body);}catch(e){/* duz metin yuk: oldugu gibi */}}
let seq=context.get('seq')||0;context.set('seq',++seq);if(!context.get('session'))context.set('session',String(now));
const samples=list.map(t=>{const raw=mqttCoerce(mqttExtract(body,t.steps),t.dt);let value=null;
 if(raw!==null)value=t.dt==='bool'?raw:Number((raw*t.scale+t.offset).toPrecision(15));
 if(typeof value==='number'&&!Number.isFinite(value))value=null;
 const sampledAt=t.ts?mqttTimestamp(mqttExtract(body,t.ts),now):now;
 flow.set('fresh-'+t.id,value!==null?now:0);
 return {tagId:t.id,value,quality:value!==null?'good':'bad',sampledAt};});
return {payload:{token:${JSON.stringify(token)},revision:${revision},source:${JSON.stringify(key)},session:context.get('session'),sequence:seq,samples}};`,x:450,y:y-50,wires:[['scada-ws-out']]});
   y+=90;
  }
  return nodes;
 }
};
/* --- Salt okunur yoklama suruculeri ortak parcalari (SNMP, HTTP, SQL) --------
 * Uc surucu de ayni iskeleti kullanir: zamanlayici (inject) -> baglanti basina bekci (function) -> paket dugumu ->
 * baglanti basina donusum (function) -> 'scada-ws-out'. Bekci, ayni hedefe bir onceki istek bitmeden (ya da
 * zaman asimi penceresi dolmadan) yenisini yollamaz: cihaz cevap vermezken istekler birikmez. Donusum Modbus'taki
 * session + kesin artan sequence desenini kullanir; cevrilemeyen / hatali / cevapsiz okuma quality 'bad' (sahte
 * 'good' YOK). Yazma yolu YOK (writeLimits.allowWrite=false; validate oku/yaz etiketi reddeder). */
const shortHash=(s:string)=>createHash('sha1').update(s).digest('hex').slice(0,12);
/** Donusum dugumunun ortak parcasi: sample(t,cevrilmis,now,damga) -> ornek (olcek/ofset, fresh bayragi); emit(ornekler) -> mesaj. */
function sampleTail(token:string,revision:number,key:string){
 return `function sample(t,c,now,sampledAt){let value=null;if(c!==null&&c!==undefined)value=t.dt==='bool'?c:Number((c*t.scale+t.offset).toPrecision(15));
 if(typeof value==='number'&&!Number.isFinite(value))value=null;flow.set('fresh-'+t.id,value!==null?now:0);return {tagId:t.id,value,quality:value!==null?'good':'bad',sampledAt:sampledAt||now};}
function emit(samples){if(!samples.length)return null;let seq=context.get('seq')||0;context.set('seq',++seq);if(!context.get('session'))context.set('session',String(Date.now()));
 return {payload:{token:${JSON.stringify(token)},revision:${revision},source:${JSON.stringify(key)},session:context.get('session'),sequence:seq,samples}};}`;
}
/** Bekci govdesi: msg.topic = hedef anahtari; mesgulse null; degilse `prepare` ile hazirlanan msg'yi o hedefin cikisina yollar. */
function pollGuardSource(busyPrefix:string,targets:string[],windowMs:number,prepare:string){
 return `const targets=${JSON.stringify(targets)},k=String(msg.topic||''),i=targets.indexOf(k);if(i<0)return null;
const bk=${JSON.stringify(busyPrefix)}+k,now=Date.now(),b=flow.get(bk);if(b&&now-b<${windowMs})return null;
flow.set(bk,now);
const m={topic:k};${prepare}
const out=Array(${targets.length}).fill(null);out[i]=m;return out;`;
}
/** Hedef basina en kisa cihaz taramasi (sn, en az 0.5). */
const pollSecs=(ms:number[])=>String(Math.max(0.5,Math.min(...ms)/1000));
const enabledScope=(conn:Connection,devices:Device[],tags:Tag[])=>{
 const connDevices=devices.filter(d=>d.enabled&&d.connectionId===conn.id);
 return {connDevices,connTags:tags.filter(t=>connDevices.some(d=>d.id===t.deviceId))};
};
/* --- SNMP surucusu (node-red-node-snmp 2.1.0, Apache-2.0; net-snmp MIT) ------
 * Paketin 'snmp' (get) dugumu her mesajda yeni bir UDP oturumu acar, msg.oid'deki (virgullu) OID'leri tek GET ile
 * ister ve isi bitince kapatir. Baglanti basina tek 'snmp' dugumu; cihaz basina zamanlayici cihazin OID listesini
 * pollMs'te yollar; hazirlik dugumu listeyi SNMP_MAX_OIDS'lik parcalara boler (buyuk PDU'yu kucuk ajanlar reddeder).
 * Varbind hatasi (noSuchObject vb.) yalniz o etiketi 'bad' yapar; istek hatasi/zaman asimi (dugum node.error verir,
 * cikis yok) kapsamli 'catch' ile donusume gelir ve parcanin butun etiketleri 'bad' olur. v1'de tek gecersiz OID
 * butun GET'i dusurur (protokol geregi) — o parcadaki etiketler 'bad' gorunur.
 * Kimlik bilgisi: paket v3 kullanici/anahtarlarini `credentials`'ta tutar (dugum kimligi v3'te '-v3' ekli; surum
 * degisince eski dugum ve kayitli kimligi silinir). v1/v2c community ise pakette DUZ dugum ozelligidir (flows.json
 * ve yedege duz metin duserdi) — bu yuzden dugum ozelligi BOS birakilir ve paketin msg.community yedegi kullanilir:
 * community sekmenin 'cred' tipli ortam degiskenindedir (flowEnv), hazirlik dugumu env.get ile okuyup msg'ye koyar.
 * Community yoksa istek yollanmaz (deger bayatlar, dugum durumu uyarir). Port: paket portu yalniz 'IPv4:port'
 * bicimindeki host'tan alir; 161 disi port yalniz IPv4'te (validate). */
export const SNMP_MAX_OIDS=20;
const snmpKey=(conn:Connection)=>'scada-snmp-'+conn.id;
const snmpVersion=(conn:Connection)=>conn.snmpVersion??'2c';
/** v1/v2c community'nin sekme ortam degiskeni adi (tip 'cred'); baglanti kimliginden deterministik. */
export function snmpCommunityEnv(conn:Connection){return 'SCADA_SNMP_COMMUNITY_'+shortHash(conn.id).toUpperCase();}
/** SNMP get dugumunun kimligi: v3'te kimlik bilgisi tasidigi icin ayri. */
export function snmpGetId(conn:Connection){return snmpKey(conn)+(snmpVersion(conn)==='3'?'-get-v3':'-get');}
export const snmpDriver:Driver={
 id:'snmp',
 label:'SNMP',
 supports:c=>c.protocol==='snmp',
 validate(c,tags){checkSnmpConnection(c);for(const t of tags)checkSnmpTag(t);},
 writeLimits:{allowWrite:false},
 flowEnv(connections,devices,tags,ctx){
  const env:Record<string,string>={};
  for(const conn of connections){
   if(snmpVersion(conn)==='3'||!enabledScope(conn,devices,tags).connTags.length)continue;
   const community=ctx.secret?.(conn.id)?.community;
   if(community)env[snmpCommunityEnv(conn)]=community;
  }
  return env;
 },
 buildNodes(connections,devices,tags,ctx){
  const {token,revision}=ctx;
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  let y=150;
  for(const conn of connections){
   const {connDevices,connTags}=enabledScope(conn,devices,tags);
   if(!connTags.length)continue;
   const key=snmpKey(conn),v3=snmpVersion(conn)==='3';
   const host=conn.host.trim()+(conn.port!==161?':'+conn.port:'');
   const level=conn.snmpSecurityLevel??'authPriv';
   const get:any={id:snmpGetId(conn),type:'snmp',z:'scada-gateway',name:'SNMP · '+conn.name,host,version:v3?'3':snmpVersion(conn),timeout:conn.timeout/1000,
    community:'',auth:v3?level:'noAuthNoPriv',authprot:v3&&level!=='noAuthNoPriv'?conn.snmpAuthProtocol:'',privprot:v3&&level==='authPriv'?conn.snmpPrivProtocol:'',oids:'',x:700,y,wires:[[key+'-convert']]};
   if(v3){const s=ctx.secret?.(conn.id);get.credentials={username:s?.username?.trim()??'',authkey:s?.authKey??'',privkey:s?.privKey??''};}
   nodes.push(get);
   const byDev:Record<string,Record<string,{id:string;dt:string;scale:number;offset:number}[]>>={};
   for(const d of connDevices){
    const list=tags.filter(t=>t.deviceId===d.id);
    if(!list.length)continue;
    const map:Record<string,{id:string;dt:string;scale:number;offset:number}[]>={};
    for(const t of list)(map[parseSnmpOid(t.snmpOid!)]??=[]).push({id:t.id,dt:t.dataType,scale:t.scale,offset:t.offset});
    byDev[d.id]=map;
    add(key+'-clock-'+d.id,'inject',{name:'SNMP okuma · '+d.name,props:[{p:'payload'},{p:'topic',vt:'str'}],topic:d.id,payload:JSON.stringify(Object.keys(map)),payloadType:'json',
     repeat:pollSecs([d.pollMs]),once:true,onceDelay:'2',x:180,y,wires:[[key+'-prep']]});
    y+=50;
   }
   // Istek penceresi: paket 1 yeniden deneme yapar (2 x timeout); pencere dolmadan ayni cihaza yeni istek yollanmaz.
   const windowMs=conn.timeout*2+1000;
   add(key+'-prep','function',{name:'SNMP hazırlık · '+conn.name,outputs:1,func:`const list=Array.isArray(msg.payload)?msg.payload:[],dev=String(msg.topic||''),now=Date.now();
const bk=${JSON.stringify('snmp-busy-'+conn.id+'-')}+dev,b=flow.get(bk);if(b&&b.left>0&&now-b.at<${windowMs})return null;
${v3?'let community;':`const community=env.get(${JSON.stringify(snmpCommunityEnv(conn))});
if(typeof community!=='string'||!community){node.status({fill:'red',shape:'ring',text:'community tanımlı değil'});return null;}`}
node.status({});const out=[];
for(let i=0;i<list.length;i+=${SNMP_MAX_OIDS}){const chunk=list.slice(i,i+${SNMP_MAX_OIDS});const m={topic:dev,oid:chunk.join(','),snmpOids:chunk,snmpDevice:dev};if(community!==undefined)m.community=community;out.push(m);}
if(!out.length)return null;flow.set(bk,{at:now,left:out.length});return [out];`,x:430,y:y-50,wires:[[get.id]]});
   add(key+'-catch','catch',{name:'SNMP istek hatası',scope:[get.id],uncaught:false,x:700,y:y+20,wires:[[key+'-convert']]});
   add(key+'-convert','function',{name:'Etiket / kalite (SNMP)',outputs:1,func:`${snmpCodecSource()}
${sampleTail(token,revision,key)}
const byDev=${JSON.stringify(byDev)};
const dev=typeof msg.snmpDevice==='string'?msg.snmpDevice:'';const map=Object.prototype.hasOwnProperty.call(byDev,dev)?byDev[dev]:null;if(!map)return null;
const bk=${JSON.stringify('snmp-busy-'+conn.id+'-')}+dev,b=flow.get(bk);if(b){b.left=Math.max(0,b.left-1);flow.set(bk,b.left>0?b:null);}
const now=Date.now(),vals={};
if(!msg.error&&Array.isArray(msg.payload))for(const vb of msg.payload)if(vb&&typeof vb.oid==='string')vals[vb.oid.replace(/^\\./,'')]=vb;
const samples=[];
for(const oid of (Array.isArray(msg.snmpOids)?msg.snmpOids:[])){if(!Object.prototype.hasOwnProperty.call(map,oid))continue;
 const vb=Object.prototype.hasOwnProperty.call(vals,oid)?vals[oid]:null,raw=vb?snmpRaw(vb):undefined;
 for(const t of map[oid])samples.push(sample(t,raw===undefined?null:mqttCoerce(raw,t.dt),now));}
return emit(samples);`,x:950,y:y-50,wires:[['scada-ws-out']]});
   y+=90;
  }
  return nodes;
 }
};
/* --- HTTP/REST surucusu (Node-RED cekirdek 'http request'; ek paket YOK) ----
 * Baglanti basina temel adres; etiket = goreli yol (+ JSON yolu, istege bagli zaman damgasi yolu; MQTT yol sozdizimi).
 * FARKLI her yol icin tek zamanlayici + tek 'http request' dugumu (adres dugumde SABIT; msg.url yok sayilir), o yoldaki
 * butun etiketler tek cevaptan beslenir. Aralik: o yolu kullanan cihazlarin en kisa taramasi. GET, cevap metin; JSON
 * degilse duz metin. Yalniz 2xx 'good' olabilir; 3xx yonlendirme izlenmez (kimlik bilgisi baska sunucuya gitmesin),
 * 4xx/5xx/zaman asimi/baglanti hatasi o yolun butun etiketlerini 'bad' yapar. TLS: sunucu sertifikasi dogrulanir
 * (msg.rejectUnauthorized=true; ozel CA yok). Zaman asimi: baglantinin timeout'u (msg.requestTimeout).
 * Kimlik: basic (kullanici/parola) ve bearer (token) YALNIZ istek dugumunun `credentials`'inda (cekirdek dugumun
 * kendi alanlari); kimlikli dugumun kimligi '-auth' ekli (kimliksize donuste eskisi ve kayitli bilgisi silinir). */
const httpKey=(conn:Connection)=>'scada-http-'+conn.id;
function httpAuthOf(conn:Connection,ctx:DriverContext):{authType:'basic'|'bearer';credentials:{user:string;password:string}}|null{
 const auth=conn.httpAuth??'none',s=ctx.secret?.(conn.id);
 if(auth==='basic'){const user=s?.username?.trim();return user?{authType:'basic',credentials:{user,password:s?.password??''}}:null;}
 if(auth==='bearer'){const token=s?.token;return token?{authType:'bearer',credentials:{user:'',password:token}}:null;}
 return null;
}
/** Yol basina deterministik istek dugumu kimligi (yol serbest metin; kimlige ozetle girer). */
export function httpRequestId(conn:Connection,path:string,ctx:DriverContext){return httpKey(conn)+'-req-'+shortHash(parseHttpPath(path))+(httpAuthOf(conn,ctx)?'-auth':'');}
type PathTagMeta={id:string;dt:string;steps:(string|number)[];ts:(string|number)[]|null;scale:number;offset:number};
export const httpDriver:Driver={
 id:'http',
 label:'HTTP/REST',
 supports:c=>c.protocol==='http',
 validate(c,tags){parseHttpBaseUrl(c.httpBaseUrl??'');for(const t of tags){checkHttpTag(t);httpRequestUrl(c.httpBaseUrl!,t.httpPath!);}},
 writeLimits:{allowWrite:false},
 buildNodes(connections,devices,tags,ctx){
  const {token,revision}=ctx;
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  let y=150;
  for(const conn of connections){
   const {connDevices,connTags}=enabledScope(conn,devices,tags);
   if(!connTags.length)continue;
   const key=httpKey(conn),auth=httpAuthOf(conn,ctx);
   const byPath:Record<string,{path:string;polls:number[];tags:PathTagMeta[]}>={};
   for(const t of connTags){
    const path=parseHttpPath(t.httpPath!),h=shortHash(path),ts=mqttPathSteps(t.httpTimestampPath);
    const e=byPath[h]??={path,polls:[],tags:[]};
    e.polls.push(connDevices.find(d=>d.id===t.deviceId)!.pollMs);
    e.tags.push({id:t.id,dt:t.dataType,steps:mqttPathSteps(t.httpJsonPath),ts:ts.length?ts:null,scale:t.scale,offset:t.offset});
   }
   const keys=Object.keys(byPath);
   const reqIds=keys.map(h=>httpRequestId(conn,byPath[h].path,ctx));
   for(const [i,h] of keys.entries()){
    add(key+'-clock-'+h,'inject',{name:'HTTP okuma · '+byPath[h].path,props:[{p:'topic',vt:'str'}],topic:h,repeat:pollSecs(byPath[h].polls),once:true,onceDelay:'2',x:180,y:y+i*50,wires:[[key+'-guard']]});
    const req:any={id:reqIds[i],type:'http request',z:'scada-gateway',name:byPath[h].path,method:'GET',ret:'txt',paytoqs:'ignore',url:httpRequestUrl(conn.httpBaseUrl!,byPath[h].path),
     tls:'',persist:false,proxy:'',insecureHTTPParser:false,authType:auth?auth.authType:'',senderr:false,headers:[],x:700,y:y+i*50,wires:[[key+'-convert']]};
    // Kimlik yalniz `credentials` icinde: Node-RED onu flows_cred.json'a ayirir, GET /flows'ta dondurmez.
    nodes.push(auth?{...req,credentials:auth.credentials}:req);
   }
   add(key+'-guard','function',{name:'HTTP bekçi · '+conn.name,outputs:keys.length,func:pollGuardSource('http-busy-'+conn.id+'-',keys,conn.timeout+1000,
    `m.httpKey=k;m.requestTimeout=${conn.timeout};m.rejectUnauthorized=true;m.followRedirects=false;`),x:430,y,wires:reqIds.map(id=>[id])});
   const meta=Object.fromEntries(keys.map(h=>[h,byPath[h].tags]));
   add(key+'-convert','function',{name:'Etiket / kalite (HTTP)',outputs:1,func:`${mqttCodecSource()}
${sampleTail(token,revision,key)}
const byPath=${JSON.stringify(meta)};
const h=typeof msg.httpKey==='string'?msg.httpKey:'';const list=Object.prototype.hasOwnProperty.call(byPath,h)?byPath[h]:null;if(!list)return null;
flow.set(${JSON.stringify('http-busy-'+conn.id+'-')}+h,null);
const now=Date.now(),sc=Number(msg.statusCode),ok=Number.isInteger(sc)&&sc>=200&&sc<300;
let body=ok?msg.payload:undefined;if(Buffer.isBuffer(body))body=body.toString('utf8');
if(typeof body==='string'){try{body=JSON.parse(body);}catch(e){/* duz metin */}}
node.status(ok?{}:{fill:'red',shape:'ring',text:'HTTP '+String(msg.statusCode)});
return emit(list.map(t=>sample(t,ok?mqttCoerce(mqttExtract(body,t.steps),t.dt):null,now,ok&&t.ts?mqttTimestamp(mqttExtract(body,t.ts),now):now)));`,x:950,y,wires:[['scada-ws-out']]});
   y+=keys.length*50+90;
  }
  return nodes;
 }
};
/* --- SQL surucusu (node-red-contrib-mssql-plus 0.13.1, MIT; mssql/tedious) ----
 * Baglanti basina bir 'MSSQL-CN' yapilandirma dugumu (havuz en cok 2 baglanti); kullanici/parola YALNIZ paketin
 * `credentials` alaninda (username/password/domain). Etiket = tek parametresiz SELECT + sutun; AYNI sorguyu kullanan
 * etiketler tek calistirmayi paylasir (sorgu basina tek 'MSSQL' dugumu + zamanlayici; aralik o sorguyu kullanan
 * cihazlarin en kisa taramasi). Sonucun ILK satiri okunur (TOP 1 onerilir). Sorgu dugumde SABIT: mustache kapali
 * (parseMustache:false), parametre yok, msg.payload sorgu yerine gecmez (bekci yuku siler). Hata (giris reddi, zaman
 * asimi, ag) paket throwErrors kapaliyken msg.error ile cikar -> sorgunun etiketleri 'bad'. Zaman asimi: baglanti ve
 * istek icin baglantinin timeout'u. Sifreleme varsayilan acik, sunucu sertifikasina kosulsuz guven varsayilan KAPALI
 * (paketin kendi varsayilani acik — burada acikca yazilir). Guvence katmanlari: checkSqlQuery (tek SELECT) + DB
 * kullanicisinin salt okunur olmasi (arayuz uyarir). Not: paket yapilandirma ve kimlik metnini process.env ile
 * mustache'tan gecirir; '{{' iceren parola bozulur (sunucu/veritabani adinda { } validate'te zaten yasak). */
const sqlKey=(conn:Connection)=>'scada-sql-'+conn.id;
function sqlLogin(conn:Connection,ctx:DriverContext){
 const s=ctx.secret?.(conn.id);const user=s?.username?.trim();
 return user?{username:user,password:s?.password??'',domain:''}:null;
}
/** Yapilandirma dugumu kimligi giris turune gore ayrilir (bkz. opcEndpointId). */
export function sqlConnectionId(conn:Connection,ctx:DriverContext){return sqlKey(conn)+(sqlLogin(conn,ctx)?'-cn-auth':'-cn');}
/** Sorgu basina deterministik dugum kimligi. */
export function sqlQueryId(conn:Connection,query:string){return sqlKey(conn)+'-q-'+shortHash(checkSqlQuery(query));}
export const sqlDriver:Driver={
 id:'sql',
 label:'SQL Server',
 supports:c=>c.protocol==='sql',
 validate(c,tags){checkSqlConnection(c);for(const t of tags)checkSqlTag(t);},
 writeLimits:{allowWrite:false},
 buildNodes(connections,devices,tags,ctx){
  const {token,revision}=ctx;
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  let y=150;
  for(const conn of connections){
   const {connDevices,connTags}=enabledScope(conn,devices,tags);
   if(!connTags.length)continue;
   const key=sqlKey(conn),login=sqlLogin(conn,ctx),cnId=sqlConnectionId(conn,ctx),inst=conn.sqlInstance?.trim();
   const cn={id:cnId,type:'MSSQL-CN',name:conn.name,tdsVersion:'7_4',server:conn.host.trim()+(inst?'\\'+inst:''),port:inst?'':String(conn.port),
    encyption:conn.sqlEncrypt??true,trustServerCertificate:conn.sqlTrustServerCertificate??false,database:conn.sqlDatabase!.trim(),useUTC:true,
    connectTimeout:String(conn.timeout),requestTimeout:String(conn.timeout),cancelTimeout:'5000',pool:'2',parseJSON:false,enableArithAbort:true,readOnlyIntent:false,camelCaseColumns:false};
   // Parola yalniz `credentials` icinde (paketin kayitli kimlik alanlari).
   nodes.push(login?{...cn,credentials:login}:cn);
   const byQuery:Record<string,{query:string;polls:number[];tags:{id:string;dt:string;col:string;scale:number;offset:number}[]}>={};
   for(const t of connTags){
    const query=checkSqlQuery(t.sqlQuery!),h=shortHash(query);
    const e=byQuery[h]??={query,polls:[],tags:[]};
    e.polls.push(connDevices.find(d=>d.id===t.deviceId)!.pollMs);
    e.tags.push({id:t.id,dt:t.dataType,col:checkSqlColumn(t.sqlColumn),scale:t.scale,offset:t.offset});
   }
   const keys=Object.keys(byQuery);
   const qIds=keys.map(h=>sqlQueryId(conn,byQuery[h].query));
   for(const [i,h] of keys.entries()){
    add(key+'-clock-'+h,'inject',{name:'SQL okuma · '+byQuery[h].query.slice(0,40),props:[{p:'topic',vt:'str'}],topic:h,repeat:pollSecs(byQuery[h].polls),once:true,onceDelay:'3',x:180,y:y+i*50,wires:[[key+'-guard']]});
    add(qIds[i],'MSSQL',{name:byQuery[h].query.slice(0,60),mssqlCN:cnId,outField:'payload',returnType:0,throwErrors:0,query:byQuery[h].query,
     modeOpt:'',modeOptType:'query',queryOpt:'',queryOptType:'editor',paramsOpt:'',paramsOptType:'none',rows:'',rowsType:'msg',parseMustache:false,params:[],x:700,y:y+i*50,wires:[[key+'-convert']]});
   }
   add(key+'-guard','function',{name:'SQL bekçi · '+conn.name,outputs:keys.length,func:pollGuardSource('sql-busy-'+conn.id+'-',keys,conn.timeout*2+1000,'m.sqlKey=k;'),x:430,y,wires:qIds.map(id=>[id])});
   const meta=Object.fromEntries(keys.map(h=>[h,byQuery[h].tags]));
   add(key+'-convert','function',{name:'Etiket / kalite (SQL)',outputs:1,func:`${sqlCodecSource()}
${sampleTail(token,revision,key)}
const byQuery=${JSON.stringify(meta)};
const h=typeof msg.sqlKey==='string'?msg.sqlKey:'';const list=Object.prototype.hasOwnProperty.call(byQuery,h)?byQuery[h]:null;if(!list)return null;
flow.set(${JSON.stringify('sql-busy-'+conn.id+'-')}+h,null);
const now=Date.now(),ok=!msg.error&&Array.isArray(msg.payload);
node.status(ok?{}:{fill:'red',shape:'ring',text:'SQL hatası'});
return emit(list.map(t=>sample(t,ok?mqttCoerce(sqlCell(msg.payload,t.col),t.dt):null,now)));`,x:950,y,wires:[['scada-ws-out']]});
   y+=keys.length*50+90;
  }
  return nodes;
 }
};
/* --- BACnet/IP surucusu (yerel node-red-zscada-bacnet; @innovation-system/node-bacnet 2.1.3, MIT) ------------
 * Hazir node-red-contrib-bacnet KULLANILMAZ: istemcisi acilista kosulsuz Who-Is yayini yollar ve tek port alanini hem
 * yerel baglama hem hedef icin kullanir. Yerel paket (packages/node-red-zscada-bacnet) yalniz tekil (unicast)
 * ReadPropertyMultiple yollar; yayin/Who-Is/yazma yok.
 * Yerel UDP baglama (arayuz:port) basina TEK 'zscada-bacnet-client' (ayni portu iki istemci acamaz; invokeId istemci
 * basinadir, cihazlar paylasir); APDU zaman asimi o istemciyi kullanan baglantilarin en buyugu. Baglanti (= cihaz) basina
 * bir 'zscada-bacnet-read' (hedef IPv4:port); okuma dugumu istekleri sirayla yollar. Cihaz basina zamanlayici cihazin
 * nesne listesini pollMs'te yollar; hazirlik dugumu listeyi BACNET_MAX_OBJECTS'lik parcalara boler (kucuk denetleyiciler
 * segmentasyon desteklemez; 16 nesne x 2 ozellik tek APDU'ya sigar) ve bir onceki tur bitmeden yenisini yollamaz.
 * present-value okunurken status-flags da istenir: fault biti setse etiket 'bad'. Ozellik hatasi (unknown-object vb.)
 * yalniz o etiketi, istek hatasi/zaman asimi parcanin butun etiketlerini 'bad' yapar (sahte 'good' YOK).
 * Yazma YOK (validate oku/yaz etiketi reddeder; gerekce checkBacnetTag'de). */
export const BACNET_MAX_OBJECTS=16;
const bacnetKey=(conn:Connection)=>'scada-bacnet-'+conn.id;
const bacnetBind=(conn:Connection)=>({iface:(conn.bacnetLocalAddress??'').trim()||'0.0.0.0',port:conn.bacnetLocalPort??BACNET_DEFAULT_LOCAL_PORT});
/** Yerel baglama basina deterministik istemci dugumu kimligi. */
export function bacnetClientId(conn:Connection){const b=bacnetBind(conn);return 'scada-bacnet-client-'+shortHash(b.iface+':'+b.port);}
type BacnetTagMeta={id:string;dt:string;pid:number;pv:boolean;scale:number;offset:number};
export const bacnetDriver:Driver={
 id:'bacnet',
 label:'BACnet/IP',
 supports:c=>c.protocol==='bacnet',
 validate(c,tags){checkBacnetConnection(c);for(const t of tags)checkBacnetTag(t);},
 writeLimits:{allowWrite:false},
 buildNodes(connections,devices,tags,ctx){
  const {token,revision}=ctx;
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  const clients=new Map<string,any>();
  let y=150;
  for(const conn of connections){
   const {connDevices,connTags}=enabledScope(conn,devices,tags);
   if(!connTags.length)continue;
   const key=bacnetKey(conn),cid=bacnetClientId(conn),bind=bacnetBind(conn);
   const prev=clients.get(cid);
   if(prev)prev.apduTimeout=Math.max(prev.apduTimeout,conn.timeout);
   else clients.set(cid,{id:cid,type:'zscada-bacnet-client',z:'scada-gateway',name:'BACnet istemci '+bind.iface+':'+bind.port,iface:bind.iface,localPort:bind.port,apduTimeout:conn.timeout});
   add(key+'-read','zscada-bacnet-read',{name:'BACnet · '+conn.name,client:cid,address:conn.host.trim(),port:conn.port,x:700,y,wires:[[key+'-convert']]});
   const byDev:Record<string,Record<string,BacnetTagMeta[]>>={};
   let maxChunks=1;
   for(const d of connDevices){
    const list=tags.filter(t=>t.deviceId===d.id);
    if(!list.length)continue;
    const map:Record<string,BacnetTagMeta[]>={},objects:Record<string,{type:number;instance:number;props:number[]}>={};
    for(const t of list){
     const type=BACNET_OBJECT_TYPES[t.bacnetObjectType!],instance=t.bacnetInstance!,prop=t.bacnetProperty??'present-value',pid=BACNET_PROPERTIES[prop];
     const k=type+':'+instance,o=objects[k]??={type,instance,props:[]};
     if(!o.props.includes(pid))o.props.push(pid);
     if(prop==='present-value'&&!o.props.includes(BACNET_STATUS_FLAGS))o.props.push(BACNET_STATUS_FLAGS);
     (map[k]??=[]).push({id:t.id,dt:t.dataType,pid,pv:prop==='present-value',scale:t.scale,offset:t.offset});
    }
    byDev[d.id]=map;
    const objs=Object.values(objects);
    maxChunks=Math.max(maxChunks,Math.ceil(objs.length/BACNET_MAX_OBJECTS));
    add(key+'-clock-'+d.id,'inject',{name:'BACnet okuma · '+d.name,props:[{p:'payload'},{p:'topic',vt:'str'}],topic:d.id,payload:JSON.stringify(objs),payloadType:'json',
     repeat:pollSecs([d.pollMs]),once:true,onceDelay:'2',x:180,y,wires:[[key+'-prep']]});
    y+=50;
   }
   // Tur penceresi: parcalar okuma dugumunde sirayla gider; her biri en cok APDU zaman asimi + bekci payi surer.
   const windowMs=maxChunks*(conn.timeout+2000)+1000;
   add(key+'-prep','function',{name:'BACnet hazırlık · '+conn.name,outputs:1,func:`const list=Array.isArray(msg.payload)?msg.payload:[],dev=String(msg.topic||''),now=Date.now();
const bk=${JSON.stringify('bacnet-busy-'+conn.id+'-')}+dev,b=flow.get(bk);if(b&&b.left>0&&now-b.at<${windowMs})return null;
const out=[];for(let i=0;i<list.length;i+=${BACNET_MAX_OBJECTS})out.push({topic:dev,bacnetDevice:dev,bacnetObjects:list.slice(i,i+${BACNET_MAX_OBJECTS})});
if(!out.length)return null;flow.set(bk,{at:now,left:out.length});return [out];`,x:430,y:y-50,wires:[[key+'-read']]});
   add(key+'-convert','function',{name:'Etiket / kalite (BACnet)',outputs:1,func:`${bacnetCodecSource()}
${sampleTail(token,revision,key)}
const byDev=${JSON.stringify(byDev)};
const dev=typeof msg.bacnetDevice==='string'?msg.bacnetDevice:'';const map=Object.prototype.hasOwnProperty.call(byDev,dev)?byDev[dev]:null;if(!map)return null;
const bk=${JSON.stringify('bacnet-busy-'+conn.id+'-')}+dev,b=flow.get(bk);if(b){b.left=Math.max(0,b.left-1);flow.set(bk,b.left>0?b:null);}
const now=Date.now(),res={};
if(!msg.error&&Array.isArray(msg.payload))for(const o of msg.payload)if(o&&o.props)res[o.type+':'+o.instance]=o.props;
node.status(msg.error?{fill:'red',shape:'ring',text:String(msg.error).slice(0,60)}:{});
const samples=[];
for(const o of (Array.isArray(msg.bacnetObjects)?msg.bacnetObjects:[])){const k=o.type+':'+o.instance;if(!Object.prototype.hasOwnProperty.call(map,k))continue;
 const props=Object.prototype.hasOwnProperty.call(res,k)?res[k]:null;
 for(const t of map[k]){const fault=!!props&&t.pv&&bacnetFault(props[${BACNET_STATUS_FLAGS}]);const raw=props&&!fault?bacnetRaw(props[t.pid]):undefined;
  samples.push(sample(t,raw===undefined?null:mqttCoerce(raw,t.dt),now));}}
return emit(samples);`,x:950,y:y-50,wires:[['scada-ws-out']]});
   y+=90;
  }
  return [...clients.values(),...nodes];
 }
};
/* --- EtherNet/IP (CIP) surucusu (node-red-contrib-cip-ethernet-ip 1.1.3, ethernet-ip 1.2.5) -------------------
 * Allen-Bradley Logix (ControlLogix/CompactLogix) ve Omron NX/NJ sembolik etiketleri. Baglanti basina bir
 * 'eth-ip endpoint' (adres, slot, cevrim; degisken tablosu = etiketlerin CIP adlari, program alani bos — 'Program:X.Y'
 * adin icinde yazilir) ve onu dinleyen tek 'eth-ip in' ('all-split': etiket basina olay). Paket TCP 44818'e sabittir.
 * Okuma: paket her cevrimde etiketleri okur ama YALNIZ degisimde mesaj verir; degismeyen deger sunucuda bayatlamasin
 * diye donusum dugumu son degerleri tutar ve baglanti 'online' iken her taramada (cihaz pollMs) yeniden yayar.
 * Okuma/yazma hatasi pakette baglantiyi dusurur (offline), o anda butun etiketler 'bad' yayinlanir; yeniden baglaninca
 * yalniz bu oturumda okunan etiketler (ya da guven penceresi dolunca hepsi) yayinlanir (sahte 'good' YOK). Durum, 'eth-ip in'in dugum durumundan ('status'
 * dugumu; yesil = online) okunur.
 * Yazma: paylasilan koprunun EtherNet/IP dali. 'eth-ip out' etiketi dugum yapilandirmasindan alir (msg'den DEGIL), bu
 * yuzden yazilabilir her CIP etiketinin kendi 'eth-ip out' dugumu vardir; hazirlik dugumu komutu etiket hedefine yollar.
 * Paket bulgusu (kaynak incelendi): 'eth-ip out' degeri yalniz Tag nesnesine birakir (stage) ve done()'u HEMEN cagirir;
 * gercek yazma endpoint'in bir sonraki tarama cevriminde olur ve sonucu dugume DONMEZ (yazma hatasi baglantiyi dusurur,
 * endpoint'te msg'siz node.error). Yani buradaki 200 {ack} "cevrimdeki yazma kuyruguna alindi" demektir; dogrulamayi
 * komut katmaninin geri okumasi (geri bildirim etiketi) yapar. Baglanti yokken birakilan deger yeniden baglaninca
 * yazilirdi (gec yazma): hazirlik dugumu baglanti 'online' degilse 503 ile reddeder. Baglanti koparken paket birakilmis
 * degerleri null'a cevirir (yazilmaz), yani kopma anindaki yazma da sonradan uygulanmaz.
 * complete/catch msg'yi cloneMessage ile verir: req/res ayni nesne kalir, command derin kopyalanir (S7 ile ayni desen).
 * Lisans notu: node-red-contrib-cip-ethernet-ip GPL-3.0-or-later (ethernet-ip MIT); depoda yer almaz, npm
 * bagimliligi olarak kurulur (node-red-contrib-s7 ile ayni durum). Ayrinti: THIRD-PARTY-NOTICES.md.
 */
export const ENIP_MIN_CYCLE_MS=100,ENIP_WRITE_PREP_ID='scada-enip-write-prep',ENIP_WRITE_RESULT_ID='scada-enip-write-result';
/** Degisim olaylari bu sure toplanip tek mesajda yayilir (yuzlerce etiketin ilk okumasi tek tek olay uretir). */
export const ENIP_EMIT_MIN_MS=250;
const ENIP_INT_LIMITS:Record<string,[number,number]>={int16:[-32768,32767],int32:[-2147483648,2147483647]};
const enipKey=(conn:{id:string})=>'scada-enip-'+conn.id;
/** CIP etiketi basina deterministik 'eth-ip out' kimligi. */
export function enipOutId(conn:{id:string},cipTag:string){return 'scada-enip-'+conn.id+'-out-'+shortHash(parseCipTag(cipTag).tag);}
export const enipDriver:Driver={
 id:'enip',
 label:'EtherNet/IP (CIP)',
 supports:c=>c.protocol==='enip',
 validate(c,tags){
  checkEnipConnection(c);
  const seen=new Map<string,string>();
  for(const t of tags){
   checkEnipTag(t);
   const name=parseCipTag(t.cipTag!).tag,dt=seen.get(name);
   if(dt&&dt!==t.dataType)throw Error(t.code+': '+name+' etiketi aynı bağlantıda başka veri tipiyle ('+dt+') de tanımlı; CIP tipi tek olmalı.');
   seen.set(name,t.dataType);
  }
 },
 writeLimits:{allowWrite:true},
 buildNodes(connections,devices,tags,ctx){
  const {token,revision}=ctx;
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  let y=150;
  for(const conn of connections){
   const {connDevices,connTags}=enabledScope(conn,devices,tags);
   if(!connTags.length)continue;
   const key=enipKey(conn);
   const cycle=Math.max(ENIP_MIN_CYCLE_MS,conn.enipCycleMs??Math.min(...connDevices.map(d=>d.pollMs)));
   const vars:Record<string,{type:string}>={};
   for(const t of connTags)vars[parseCipTag(t.cipTag!).tag]??={type:CIP_DATATYPE[t.dataType]!};
   add(key+'-endpoint','eth-ip endpoint',{name:conn.name,address:conn.host.trim(),slot:String(conn.slot??0),cycletime:String(cycle),vartable:{'':vars}});
   add(key+'-in','eth-ip in',{name:'Okuma · '+conn.name,endpoint:key+'-endpoint',mode:'all-split',program:'',variable:'',x:180,y,wires:[[key+'-convert']]});
   add(key+'-status','status',{name:'EtherNet/IP durumu · '+conn.name,scope:[key+'-in'],x:180,y:y+40,wires:[[key+'-convert']]});
   add(key+'-clock','inject',{name:'Yeniden yayın · '+conn.name,props:[{p:'topic',vt:'str'}],topic:'tick',repeat:pollSecs(connDevices.map(d=>d.pollMs)),once:true,onceDelay:'3',x:180,y:y+80,wires:[[key+'-convert']]});
   const meta=connTags.map(t=>({id:t.id,dt:t.dataType,name:parseCipTag(t.cipTag!).tag,scale:t.scale,offset:t.offset}));
   // Guven penceresi: yeniden baglaninca paketin Tag nesneleri eski degerleri tutar ve ayni deger 'Changed' uretmez. Baglanti
   // bu sure boyunca kesintisiz 'online' kaldiysa en az bir tam okuma turu bitmistir (paket okuma mesaji basina 10 sn bekler,
   // asarsa baglanti duser); o zamana kadar yalniz bu oturumda okunan (olay gelen) etiketler yayinlanir.
   const trustMs=Math.min(120000,cycle+2000+10000*Math.ceil(Object.keys(vars).length/20));
   add(key+'-convert','function',{name:'Etiket / kalite (EtherNet/IP)',outputs:1,func:`${sampleTail(token,revision,key)}
const tags=${JSON.stringify(meta)},sk=${JSON.stringify('enip-state-'+conn.id)};
const now=Date.now(),snap=context.get('snap')||{},seen=context.get('seen')||{};
function coerce(t,raw){if(t.dt==='bool'){if(typeof raw==='boolean')return raw;if(raw===0||raw===1)return raw===1;return null;}return typeof raw==='number'&&Number.isFinite(raw)?raw:null;}
function flush(){context.set('timer',null);const names=context.get('dirty')||{};context.set('dirty',{});if(flow.get(sk)!=='online')return;const s=context.get('snap')||{},t0=Date.now();
 const out=emit(tags.filter(t=>names[t.name]).map(t=>sample(t,coerce(t,s[t.name]),t0)));if(out)node.send(out);}
if(msg.status&&typeof msg.status==='object'){
 const st=msg.status.fill==='green'?'online':(msg.status.fill==='red'?'offline':'connecting'),was=flow.get(sk);flow.set(sk,st);
 if(st==='online'&&was!=='online'){context.set('since',now);context.set('seen',{});context.set('dirty',{});}
 if(st!=='online'&&was==='online'){context.set('seen',{});node.status({fill:'red',shape:'ring',text:st});return emit(tags.map(t=>sample(t,null,now)));}
 return null;}
if(msg.topic==='tick'){if(flow.get(sk)!=='online')return null;const trusted=now-(context.get('since')||now)>${trustMs};
 return emit(tags.filter(t=>Object.prototype.hasOwnProperty.call(snap,t.name)&&(trusted||seen[t.name])).map(t=>sample(t,coerce(t,snap[t.name]),now)));}
if(typeof msg.topic==='string'&&tags.some(t=>t.name===msg.topic)){
 snap[msg.topic]=msg.payload;seen[msg.topic]=true;context.set('snap',snap);context.set('seen',seen);node.status({});
 if(flow.get(sk)!=='online')return null;
 const dirty=context.get('dirty')||{};dirty[msg.topic]=true;context.set('dirty',dirty);
 if(!context.get('timer'))context.set('timer',setTimeout(flush,${ENIP_EMIT_MIN_MS}));}
return null;`,x:450,y,wires:[['scada-ws-out']]});
   y+=170;
  }
  return nodes;
 },
 buildWriteNodes(connections,devices,tags){
  const nodes:any[]=[];
  const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
  const writable=writableTags(devices,tags);
  const connIds=writeConnIds(connections,devices,writable);
  if(!connIds.length)return {nodes:[],entries:{}};
  const meta:Record<string,ScalarWriteMeta>={};
  const outs:{id:string;conn:string;name:string}[]=[];
  for(const t of writable){
   const d=devices.find(x=>x.id===t.deviceId)!;
   const name=parseCipTag(t.cipTag!).tag,out=enipOutId({id:d.connectionId},name);
   if(!outs.some(o=>o.id===out))outs.push({id:out,conn:d.connectionId,name});
   meta[t.id]={code:t.code,conn:d.connectionId,target:out,type:CIP_DATATYPE[t.dataType]!,bool:t.dataType==='bool',float:t.dataType==='float32',
    range:t.dataType==='bool'||t.dataType==='float32'?null:ENIP_INT_LIMITS[t.dataType],scale:t.scale,offset:t.offset,min:t.min,max:t.max};
  }
  const routes=outs.map(o=>o.id),n=routes.length,y=1800;
  // Baglanti online degilse paket degeri birakip yeniden baglaninca yazardi (gec yazma): 503 ile reddedilir.
  const gate=`const st=flow.get('enip-state-'+t.conn);if(st!=='online')return reject(503,'EtherNet/IP bağlantısı hazır değil ('+(st||'bağlanıyor')+'); yazma kuyruğa alınmaz.');`;
  add(ENIP_WRITE_PREP_ID,'function',{name:'EtherNet/IP yazma: doğrula / tip',outputs:n+1,func:scalarWritePrepSource(n,meta,routes,'enip','',{routeBy:'target',gate}),x:770,y,wires:[...routes.map(id=>[id]),[WRITE_RESULT_ID]]});
  for(const [i,o] of outs.entries())add(o.id,'eth-ip out',{name:'Yaz · '+o.name,endpoint:'scada-enip-'+o.conn+'-endpoint',program:'',variable:o.name,x:1000,y:y+i*50,wires:[]});
  for(const [i,id] of connIds.entries()){
   const scope=outs.filter(o=>o.conn===id).map(o=>o.id),key=enipKey({id}),wy=y+outs.length*50+i*90;
   add(key+'-wdone','complete',{name:'EtherNet/IP yazma kuyrukta',scope,uncaught:false,x:1000,y:wy,wires:[[ENIP_WRITE_RESULT_ID]]});
   add(key+'-wcatch','catch',{name:'EtherNet/IP yazma hatası',scope,uncaught:false,x:1000,y:wy+40,wires:[[key+'-wfail']]});
   add(key+'-wfail','function',{name:'Bekleyen yazmaları kapat',outputs:1,func:scalarWriteFailSource('enip-wpend-'+id,'EtherNet/IP'),x:1240,y:wy+40,wires:[[WRITE_RESULT_ID]]});
  }
  add(ENIP_WRITE_RESULT_ID,'function',{name:'EtherNet/IP yazma sonucu',outputs:1,func:scalarWriteResultSource('enip'),x:1240,y:y-60,wires:[[WRITE_RESULT_ID]]});
  return {nodes,entries:Object.fromEntries(connIds.map(id=>[id,ENIP_WRITE_PREP_ID]))};
 }
};
/* --- MQTT disa yayin (SCADA -> broker; raporlama, KONTROL DEGIL) ------------
 * Tasarim karari: yayin Node-RED'de, sunucuda DEGIL. Node-RED sunucunun canli degerlerini almiyor; tersine
 * degerleri o uretiyor ve her surucunun donusum dugumu ornekleri 'scada-ws-out'a yolluyor. Bu donusum
 * dugumlerinin ayni cikisina ek bir tel (dokunma/tap) yayin dugumunu besler: ayni ornekler, ayni kalite —
 * sunucuya ikinci bir veri yolu ACILMAZ ve sunucuya yeni bir MQTT istemcisi/bagimliligi eklenmez.
 * Yayin dugumu son ornegi tutar; her intervalMs'te (ve onChange ise deger/kalite degisince hemen)
 * <baseTopic>/<etiket kodu> konusuna {value,quality,ts} yollar (QoS 1, retain istege bagli). Sunucunun
 * gecerlilik kurali uygulanir (good yalniz bool/sonlu sayi); cihazin staleMs'i icinde yeni ornek gelmeyen
 * etiket 'stale' yayinlanir. Hic okunmamis etiket yayinlanmaz.
 * Fark: sunucu bir ornegi ayrica reddedebilir (revizyon/sira/damga); yayin o reddi bilmez — rapor amaclidir.
 */
export const MQTT_PUBLISH_ID='scada-mqtt-publish',MQTT_PUBLISH_TICK_ID='scada-mqtt-publish-tick',MQTT_PUBLISH_OUT_ID='scada-mqtt-publish-out';
/** Yayin dugumlerini uretir ve `existing` icindeki ornek ureten dugumlerin 'scada-ws-out' tellerine yayin dugumunu ekler (yerinde). */
export function buildMqttPublishNodes(c:Config,ctx:DriverContext,existing:any[]):any[]{
 const p=c.mqttPublish;if(!p)return [];
 const conn=c.connections.find(x=>x.id===p.connectionId);
 if(!conn||conn.protocol!=='mqtt')return [];
 const nodes:any[]=[];
 const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
 const brokerId=mqttBrokerId(conn,ctx);
 if(!existing.some(n=>n.id===brokerId))nodes.push(...mqttBrokerNodes(conn,ctx));
 const base=p.baseTopic.trim();
 const meta:Record<string,{topic:string;staleMs:number;bool:boolean}>={};
 for(const t of mqttPublishTags(c)){
  const d=c.devices.find(x=>x.id===t.deviceId);
  if(!d)continue;
  meta[t.id]={topic:base+'/'+mqttTopicLevel(t.code),staleMs:d.staleMs,bool:t.dataType==='bool'};
 }
 for(const n of existing){
  if(n.id==='scada-heartbeat'||!Array.isArray(n.wires))continue;
  for(const w of n.wires)if(Array.isArray(w)&&w.includes('scada-ws-out')&&!w.includes(MQTT_PUBLISH_ID))w.push(MQTT_PUBLISH_ID);
 }
 const y=1500;
 add(MQTT_PUBLISH_TICK_ID,'inject',{name:'MQTT yayın aralığı',props:[{p:'topic',vt:'str'}],topic:'tick',repeat:String(p.intervalMs/1000),once:true,onceDelay:'2',x:180,y,wires:[[MQTT_PUBLISH_ID]]});
 add(MQTT_PUBLISH_ID,'function',{name:'MQTT yayın (rapor)',outputs:1,func:`const meta=${JSON.stringify(meta)},onChange=${p.onChange},retain=${p.retain};
const now=Date.now(),last=context.get('last')||{},sent=context.get('sent')||{},out=[];
function pub(id,s){const m=meta[id];out.push({topic:m.topic,payload:JSON.stringify({value:s.value,quality:s.quality,ts:s.ts}),qos:1,retain:retain});sent[id]=s.quality+'|'+JSON.stringify(s.value);}
if(msg.payload&&Array.isArray(msg.payload.samples)){
 for(const s of msg.payload.samples){
  if(!s||!Object.prototype.hasOwnProperty.call(meta,s.tagId))continue;
  const m=meta[s.tagId];const ok=s.quality==='good'&&(m.bool?typeof s.value==='boolean':typeof s.value==='number'&&Number.isFinite(s.value));
  const cur={value:ok?s.value:null,quality:ok?'good':'bad',ts:typeof s.sampledAt==='number'?s.sampledAt:now,at:now};last[s.tagId]=cur;
  if(onChange&&sent[s.tagId]!==cur.quality+'|'+JSON.stringify(cur.value))pub(s.tagId,cur);
 }
}else if(msg.topic==='tick'){
 for(const id of Object.keys(meta)){const s=last[id];if(!s)continue;
  pub(id,s.quality==='good'&&now-s.at>meta[id].staleMs?{value:s.value,quality:'stale',ts:s.ts}:s);}
}
context.set('last',last);context.set('sent',sent);
return out.length?[out]:null;`,x:450,y,wires:[[MQTT_PUBLISH_OUT_ID]]});
 add(MQTT_PUBLISH_OUT_ID,'mqtt out',{name:'MQTT yayın · '+conn.name,topic:'',qos:'',retain:'',respTopic:'',contentType:'',userProps:'',correl:'',expiry:'',broker:brokerId,x:720,y,wires:[]});
 return nodes;
}
export const drivers:Driver[]=[modbusDriver,opcUaDriver,s7Driver,adsDriver,mqttDriver,snmpDriver,httpDriver,sqlDriver,bacnetDriver,enipDriver];
/** Baglantinin protokolune uygun suruculu bulur; bulunamazsa acik hata (bilinmeyen protokol pratikte olusmaz cunku sema enum'lu). */
export function driverFor(c:Connection):Driver{
 const d=drivers.find(x=>x.supports(c));
 if(!d)throw Error(c.name+': desteklenmeyen bağlantı protokolü.');
 return d;
}
/** Uygulama koku: bu modulun konumundan (packages/drivers) iki ust. Servis process.cwd()'si
 * uygulama klasoru olmayabilir (Windows servisi System32'de baslar), o yuzden cwd tek basina yetmez.
 * `root` parametreleri yalniz test icindir (paket kurulu degil senaryosu). */
const appRoot=path.resolve(__dirname,'..','..');
/** OPC UA dugumleri node-red-contrib-opcua paketine bagimlidir; kurulu degilse sessizce yaris yerine acik Turkce hata verilir. */
export function opcUaPackageInstalled(directory:string,root:string=appRoot):boolean{return nodeRedPackageInstalled('node-red-contrib-opcua',directory,root);}
/** S7 dugumleri node-red-contrib-s7 paketine bagimlidir. */
export function s7PackageInstalled(directory:string,root:string=appRoot):boolean{return nodeRedPackageInstalled('node-red-contrib-s7',directory,root);}
/** ADS dugumleri node-red-contrib-ads-client paketine bagimlidir. */
export function adsPackageInstalled(directory:string,root:string=appRoot):boolean{return nodeRedPackageInstalled('node-red-contrib-ads-client',directory,root);}
/** Protokol -> gerekli Node-RED paketi (cekirdek dugumle calisan protokoller listede yok: Modbus paketi her zaman kurulu, MQTT/HTTP cekirdek). */
export const PROTOCOL_PACKAGES:Partial<Record<NonNullable<Connection['protocol']>,string>>={'opc-ua':'node-red-contrib-opcua',s7:'node-red-contrib-s7',ads:'node-red-contrib-ads-client',
 snmp:'node-red-node-snmp',sql:'node-red-contrib-mssql-plus',bacnet:'node-red-zscada-bacnet',enip:'node-red-contrib-cip-ethernet-ip'};
/** Node-RED paketinin aranacagi node_modules klasorleri: cwd, uygulama koku, veri klasoru ve
 * Node-RED userDir'i (<veri>/node-red — nodered-guvenlik.ts ve servis kurulumu burayi kullanir). */
export function nodeRedModuleDirs(directory:string,root:string=appRoot):string[]{
 return [...new Set([path.join(process.cwd(),'node_modules'),path.join(root,'node_modules'),path.join(directory,'node_modules'),path.join(directory,'node-red','node_modules')].map(p=>path.resolve(p)))];
}
export function nodeRedPackageInstalled(name:string,directory:string,root:string=appRoot):boolean{
 return nodeRedModuleDirs(directory,root).some(dir=>{try{return fs.existsSync(path.join(dir,name,'package.json'));}catch{return false;}});
}
/** Yayin (deploy) oncesi cagrilir: config'te en az bir OPC UA baglantisi varsa paket kurulu olmali,
 * ve her baglanti kendi suruculunun validate()'inden gecmeli (orn. S7'de giris alanina yazma, OPC UA'da yazilamaz nodeId). */
export function assertDriversDeployable(connections:Connection[],devices:Device[],tags:Tag[],directory:string,root:string=appRoot){
 if(connections.some(c=>c.protocol==='opc-ua')&&!opcUaPackageInstalled(directory,root))
  throw Error('OPC UA için node-red-contrib-opcua kurulu değil. `npm install node-red-contrib-opcua` ile kurup Node-RED\'i yeniden başlatın.');
 if(connections.some(c=>c.protocol==='s7')&&!s7PackageInstalled(directory,root))
  throw Error('S7 için node-red-contrib-s7 kurulu değil. `npm install node-red-contrib-s7` ile kurup Node-RED\'i yeniden başlatın.');
 if(connections.some(c=>c.protocol==='ads')&&!adsPackageInstalled(directory,root))
  throw Error('ADS için node-red-contrib-ads-client kurulu değil. `npm install node-red-contrib-ads-client` ile kurup Node-RED\'i yeniden başlatın.');
 for(const [proto,label] of [['snmp','SNMP'],['sql','SQL Server'],['bacnet','BACnet/IP'],['enip','EtherNet/IP']] as const){
  const pkg=PROTOCOL_PACKAGES[proto]!;
  if(connections.some(c=>c.protocol===proto)&&!nodeRedPackageInstalled(pkg,directory,root))
   throw Error(label+' için '+pkg+' kurulu değil. '+(proto==='bacnet'?'Uygulamayla gelen yerel paket (packages/node-red-zscada-bacnet) eksik; uygulama klasöründe `npm ci` çalıştırıp':'`npm install '+pkg+'` ile kurup')+' Node-RED\'i yeniden başlatın.');
 }
 for(const conn of connections){
  const {tags:connTags}=partitionByConnection([conn],devices,tags);
  driverFor(conn).validate(conn,connTags);
 }
}
