import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {Config,Tag} from '../../../packages/contracts/model';
import {registerCount} from '../../../packages/contracts/model';
import {drivers,partitionByConnection,assertDriversDeployable,writableTags,buildWriteBridge,httpResponseNode,buildMqttPublishNodes,HTTP_RESPONSE_ID,type ConnectionSecret,type DriverContext,type WriteBridgeBranch} from '../../../packages/drivers/driver';
import {connectionSecretReader} from './connectionSecrets';
/** Not: `blocks` burada geriye donuk uyumluluk icin korunur (mevcut testler bunu dogrudan import eder);
 * gercek akis uretimi artik packages/drivers/driver.ts icindeki modbusDriver'a tasindi (B43). */
export function blocks(tags:Tag[]){
 const result:{area:string;address:number;tags:Tag[]}[]=[];
 for(const t of [...tags].sort((a,b)=>a.area.localeCompare(b.area)||a.address-b.address)){
  const prev=result.at(-1);
  const prevRegs=prev?prev.tags.reduce((s,x)=>s+registerCount(x.dataType),0):0;
  if(prev&&prev.area===t.area&&prev.address+prevRegs===t.address&&prevRegs<100)prev.tags.push(t);else result.push({area:t.area,address:t.address,tags:[t]});
 }return result;
}
export type GatewayOptions={
 /** Baglanti sirri okuyucu (connection-secrets.json). Verilmezse hicbir baglantinin sirri yoktur. */
 secret?:(connectionId:string)=>ConnectionSecret|undefined;
 /** Makine adi (MQTT varsayilan istemci kimligi); verilmezse os.hostname(). */
 hostname?:string;
};
export function buildGateway(c:Config,token:string,port:number,directory:string,options:GatewayOptions={}){
 const nodes:any[]=[{id:'scada-gateway',type:'tab',label:'SCADA · Haberleşme',disabled:false,info:'SCADA sunucusu tarafından yönetilir. Ekranlar bağımsız web uygulamasındadır.'}];
 const add=(id:string,type:string,data:any)=>nodes.push({id,type,z:'scada-gateway',...data});
 nodes.push({id:'scada-ws',type:'websocket-client',path:`ws://127.0.0.1:${port}/internal/gateway`,tls:'',wholemsg:'false',hb:'0',subprotocol:''});
 add('scada-ws-out','websocket out',{name:'SCADA veri akışı',server:'',client:'scada-ws',x:1040,y:100,wires:[]});
 const body=JSON.stringify({token,revision:c.revision});
 add('scada-heartbeat','inject',{name:'Köprü heartbeat',props:[{p:'payload'}],payload:body,payloadType:'json',repeat:'1',once:true,onceDelay:0.2,x:160,y:60,wires:[['scada-ws-out']]});
 // B43: baglanti basina protokole uygun surucu secilir. Modbus davranisi degismez (tum baglantilar
 // hala 'modbus-tcp' varsayilaninda ise modbusDriver butun c.connections'i alir — eski cikti birebir korunur).
 const secret=options.secret;
 const ctx:DriverContext={token,revision:c.revision,secret:id=>secret?.(id),hostname:options.hostname??os.hostname()};
 const branches:WriteBridgeBranch[]=[];
 const tabEnv:Record<string,string>={};
 for(const driver of drivers){
  const connections=c.connections.filter(driver.supports);
  if(!connections.length)continue;
  const {devices,tags}=partitionByConnection(connections,c.devices,c.tags);
  nodes.push(...driver.buildNodes(connections,devices,tags,ctx));
  if(driver.flowEnv)Object.assign(tabEnv,driver.flowEnv(connections,devices,tags,ctx));
  // Yazma dali yalniz yazmaya izin veren ve dal ureten surucude (Modbus, OPC UA, S7, ADS).
  if(!driver.writeLimits.allowWrite||!driver.buildWriteNodes)continue;
  const writable=writableTags(devices,tags);
  if(!writable.length)continue;
  const branch=driver.buildWriteNodes(connections,devices,writable,ctx);
  if(Object.keys(branch.entries).length)branches.push({branch,devices,tags:writable});
 }
 // MQTT disa yayin (istege bagli): surucu donusum dugumlerinin 'scada-ws-out' tellerine dokunur (bkz. driver.ts).
 if(c.mqttPublish)nodes.push(...buildMqttPublishNodes(c,ctx,nodes));
 // Paylasilan yazma koprusu: herhangi bir surucunun yazilabilir etiketi varsa tek kez.
 nodes.push(...buildWriteBridge(token,c.revision,branches));
 // HTTP yaniti: yazma koprusu veya okuma testi (Modbus) baglaniyorsa tek kez eklenir.
 if(nodes.some(n=>Array.isArray(n.wires)&&n.wires.some((w:any)=>Array.isArray(w)&&w.includes(HTTP_RESPONSE_ID))))nodes.push(httpResponseNode());
 // Surucu sekme sirlari (SNMP community): sekmede 'cred' tipli ortam degiskeni; deger YALNIZ `credentials`'ta
 // (Node-RED flows_cred.json'a ayirir; GET /flows, flows.json ve yedekte gorunmez). Sira deterministik.
 const names=Object.keys(tabEnv).sort();
 if(names.length)Object.assign(nodes[0],{env:names.map(name=>({name,value:'',type:'cred'})),credentials:Object.fromEntries(names.map(n=>[n,tabEnv[n]]))});
 return nodes;
}
/** Onceki akistaki sekmenin 'cred' ortam degiskenlerinden yenisinde olmayanlar icin bos deger yazar: Node-RED bos
 * kimlik degerini kayitli bilgiden SILER (sekme gibi kayitli kimlik tanimi olmayan dugumde eksik anahtar silinmez). Yerinde. */
export function clearRemovedTabCredentials(previousFlows:any[],generated:any[]){
 const prev=(previousFlows||[]).find(n=>n&&n.id==='scada-gateway'&&n.type==='tab');
 const tab=generated.find(n=>n&&n.id==='scada-gateway'&&n.type==='tab');
 if(!prev||!tab||!Array.isArray(prev.env))return;
 const keep=new Set((tab.env||[]).filter((e:any)=>e&&e.type==='cred').map((e:any)=>e.name));
 const removed=prev.env.filter((e:any)=>e&&e.type==='cred'&&typeof e.name==='string'&&!keep.has(e.name)).map((e:any)=>e.name);
 if(removed.length)tab.credentials={...(tab.credentials||{}),...Object.fromEntries(removed.map((n:string)=>[n,'']))};
}
/** Yonetim yuzeyi icin Bearer token; kimlik bilgisi veri klasorunde tutulur. */
let adminToken:{value:string;expires:number}|null=null;
/**
 * Zaman asimlari: temel deger ortam degiskeninden gelir, uygulama adimi
 * uretilen dugum sayisina gore olceklenir. 300+ etiketli buyuk akislarda
 * sabit 15 sn yetmiyordu (G06).
 */
export const baseTimeoutMs=()=>Math.min(120000,Math.max(2000,Number(process.env.NODERED_TIMEOUT_MS)||7000));
export const deployTimeoutMs=(nodeCount:number)=>Math.min(180000,baseTimeoutMs()*2+nodeCount*20);
/** Onbellekteki token'i gecersiz kilar; 401 sonrasi tek seferlik yenileme icin kullanilir (sonsuz donguye girmez). */
export function invalidateAdminToken(){adminToken=null;}
/** `force=true` onbellegi atlayip token'i yeniden alir. `fetchImpl` test edilebilirlik icin disaridan verilebilir
 * (varsayilan global fetch). Parola/token hicbir zaman hata mesajina veya loga yazilmaz. */
export async function adminAuthHeader(directory:string,nodeRedUrl:string,force=false,fetchImpl:typeof fetch=fetch):Promise<Record<string,string>>{
 if(process.env.NODERED_ADMIN_TOKEN)return {Authorization:'Bearer '+process.env.NODERED_ADMIN_TOKEN};
 if(!force&&adminToken&&adminToken.expires>Date.now()+60000)return {Authorization:'Bearer '+adminToken.value};
 const file=path.join(directory,'nodered-admin.json');
 if(!fs.existsSync(file))throw Error('Node-RED yönetim kimliği bulunamadı. `npx tsx scripts/nodered-guvenlik.ts` çalıştırın.');
 let credential:{username:string;password:string};
 try{credential=JSON.parse(fs.readFileSync(file,'utf8')) as {username:string;password:string};}
 catch{throw Error('Node-RED yönetim kimliği dosyası okunamadı (bozuk).');}
 const body=new URLSearchParams({client_id:'node-red-admin',grant_type:'password',scope:'*',username:credential.username,password:credential.password});
 const r=await fetchImpl(nodeRedUrl+'/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(baseTimeoutMs())});
 if(!r.ok)throw Error('Node-RED kimlik doğrulaması reddedildi ('+r.status+'). Parolayı yenileyin: `npx tsx scripts/nodered-guvenlik.ts --yenile`.');
 const t=await r.json() as any;adminToken={value:t.access_token,expires:Date.now()+Math.max(60000,(t.expires_in||3600)*1000)};
 return {Authorization:'Bearer '+adminToken.value};
}
/** Yonetim yuzeyinin gercekten kimlik dogrulamasi istedigini dogrular. */
export async function assertAdminProtected(nodeRedUrl:string){
 const r=await fetch(nodeRedUrl+'/flows',{headers:{'Node-RED-API-Version':'v2'},signal:AbortSignal.timeout(baseTimeoutMs())}).catch(()=>null);
 if(r&&r.ok)throw Error('Node-RED yönetim yüzeyi kimlik doğrulamasız erişilebilir. `npx tsx scripts/nodered-guvenlik.ts` çalıştırıp Node-RED yeniden başlatılmalı.');
}
/** Yedege yazilacak akistan dugum `credentials` alanlarini cikarir (girdi degismez). */
export function withoutCredentials(current:any){
 const strip=(list:any)=>Array.isArray(list)?list.map((n:any)=>{if(!n||typeof n!=='object'||!('credentials' in n))return n;const {credentials:_c,...rest}=n;return rest;}):list;
 return Array.isArray(current)?strip(current):{...current,flows:strip(current?.flows)};
}
export async function deployGateway(c:Config,token:string,port:number,directory:string,nodeRedUrl:string){
 // B43: OPC UA baglantisi varsa gerekli Node-RED paketi kurulu olmali; sessizce yayin yapmak yerine acik hata verilir.
 assertDriversDeployable(c.connections,c.devices,c.tags,directory);
 await assertAdminProtected(nodeRedUrl);
 const headers={'Node-RED-API-Version':'v2',...(await adminAuthHeader(directory,nodeRedUrl))};
 const get=await fetch(nodeRedUrl+'/flows',{headers,signal:AbortSignal.timeout(baseTimeoutMs())});if(!get.ok)throw Error('Node-RED akışları okunamadı ('+get.status+').');const current=await get.json() as any;
 // Yedek: Node-RED GET /flows kimlik bilgisi dondurmez; yine de `credentials` alani savunma amacli ayiklanir
 // (yedek dosyasi duz metindir, parola oraya hicbir yoldan dusmemeli).
 fs.mkdirSync(path.join(directory,'backups'),{recursive:true});fs.writeFileSync(path.join(directory,'backups',`flows-${Date.now()}.json`),JSON.stringify(withoutCredentials(current),null,2));
 // Baglanti sirlari yalniz surucu isterse (DriverContext.secret) okunur: OPC UA giris bilgisi endpoint
 // dugumunun `credentials` alanina gider, Node-RED onu flows_cred.json'a ayirir.
 const generated=buildGateway(c,token,port,directory,{secret:connectionSecretReader(directory)});
 clearRemovedTabCredentials(current.flows,generated);
 /**
  * Sahiplik: yalniz onceki uygulamada bizim yazdigimiz dugumler (manifest)
  * ve bu turda urettiklerimiz kaldirilir. Ayni oneki kullanan yabanci
  * dugumler silinmez (B53). Manifest yoksa eski davranisa duseriz ama
  * yalniz `scada-` oneki icin — `dvp_` artik korunur.
  */
 const manifestFile=path.join(directory,'gateway-manifest.json');
 let manifest:string[]=[];
 try{manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));}catch{}
 const owned=new Set<string>(manifest.length?manifest:current.flows.filter((n:any)=>String(n.id).startsWith('scada-')).map((n:any)=>n.id));
 const generatedIds=new Set<string>(generated.map((n:any)=>n.id));
 const kept=current.flows.filter((n:any)=>!owned.has(n.id)&&!generatedIds.has(n.id));
 const previous=new Map<string,any>(current.flows.map((n:any)=>[n.id,n]));
 const diff={
  added:generated.filter((n:any)=>!previous.has(n.id)).map((n:any)=>n.id),
  changed:generated.filter((n:any)=>previous.has(n.id)&&JSON.stringify(previous.get(n.id))!==JSON.stringify(n)).map((n:any)=>n.id),
  removed:[...owned].filter(id=>!generatedIds.has(id)),
  foreignKept:kept.filter((n:any)=>String(n.id).startsWith('scada-')||String(n.id).startsWith('dvp_')).map((n:any)=>n.id)};
 const flows=kept.concat(generated);
 const result=await fetch(nodeRedUrl+'/flows',{method:'POST',headers:{...headers,'Content-Type':'application/json','Node-RED-Deployment-Type':'flows'},body:JSON.stringify({rev:current.rev,flows}),signal:AbortSignal.timeout(deployTimeoutMs(generated.length))});
 if(!result.ok)throw Error(result.status===409?'Node-RED revizyonu değişti. Tekrar okuyup uygulayın.':'Node-RED uygulama hatası: '+result.status);
 fs.writeFileSync(manifestFile,JSON.stringify(generated.map((n:any)=>n.id),null,1));
 return {...(await result.json()),diff};
}
/* --- Kopru watchdog -----------------------------------------------------
 * deployGateway yalniz deploy ANINDA Node-RED ile konusuyordu; surec deploy
 * sonrasi olurse veya 'scada-gateway' sekmesi/beklenen revizyon (heartbeat
 * dugumunden okunur) silinirse sunucunun haberi olmuyordu, ekranlar sessizce
 * bayatlardi. Bu, periyodik gorunurluk/teshis saglar — YAZMAYI ENGELLEMEZ:
 * yazma zaten mevcut tazelik (staleMs) kontroluyle durur; bu watchdog sadece
 * "kopru neden calismiyor" sorusuna cevap uretir.
 */
export type GatewayHealthStatus='ok'|'bozuk'|'bilinmiyor'|'uygulanmadi';
export type GatewayHealth={status:GatewayHealthStatus;lastCheckAt:number;reason:string};
let gatewayHealthState:GatewayHealth={status:'bilinmiyor',lastCheckAt:0,reason:'henüz kontrol edilmedi'};
/** Son bilinen kopru durumu; /api/health ve /api/ready buradan okur. */
export function gatewayHealth():GatewayHealth{return gatewayHealthState;}
/** Tek seferlik kontrol: /flows okunur, 'scada-gateway' sekmesi ve (verilmisse) beklenen revizyon dogrulanir.
 * `fetchImpl` test edilebilirlik icin disaridan verilebilir (varsayilan global fetch). */
export async function checkGatewayOnce(nodeRedUrl:string,expectedRevision:number|null,directory:string,fetchImpl:typeof fetch=fetch):Promise<GatewayHealth>{
 let headers:Record<string,string>;
 try{
  headers={'Node-RED-API-Version':'v2',...(await adminAuthHeader(directory,nodeRedUrl,false,fetchImpl))};
 }catch(e){
  return gatewayHealthState={status:'bozuk',lastCheckAt:Date.now(),reason:(e as Error).message||'Node-RED kimlik doğrulaması başarısız'};
 }
 try{
  let r=await fetchImpl(nodeRedUrl+'/flows',{headers,signal:AbortSignal.timeout(baseTimeoutMs())});
  if(r.status===401){
   // Token gecersiz olmus olabilir (Node-RED yeniden baslamis vb.) — bir kez yenileyip tekrar dene, sonsuz dongu yok.
   try{
    headers={'Node-RED-API-Version':'v2',...(await adminAuthHeader(directory,nodeRedUrl,true,fetchImpl))};
   }catch(e){
    return gatewayHealthState={status:'bozuk',lastCheckAt:Date.now(),reason:(e as Error).message||'Node-RED kimlik doğrulaması başarısız'};
   }
   r=await fetchImpl(nodeRedUrl+'/flows',{headers,signal:AbortSignal.timeout(baseTimeoutMs())});
  }
  if(!r.ok)return gatewayHealthState={status:'bozuk',lastCheckAt:Date.now(),reason:'Node-RED /flows yanıtı: '+r.status};
  const data=await r.json() as any;
  const flows:any[]=Array.isArray(data)?data:(data.flows||[]);
  if(!flows.some(n=>n&&n.id==='scada-gateway'&&n.type==='tab')){
   // Aktif config revizyonu yoksa kopru hic deploy edilmemistir (taze kurulum, cihazlar bilerek pasif) — hata degil.
   if(expectedRevision==null)return gatewayHealthState={status:'uygulanmadi',lastCheckAt:Date.now(),reason:'Köprü henüz uygulanmadı (Cihazlar → Haberleşmeye uygula)'};
   return gatewayHealthState={status:'bozuk',lastCheckAt:Date.now(),reason:"'scada-gateway' sekmesi Node-RED akışlarında bulunamadı"};
  }
  if(expectedRevision!=null){
   const heartbeat=flows.find(n=>n&&n.id==='scada-heartbeat');
   let rev:number|null=null;
   try{rev=JSON.parse(heartbeat?.payload||'').revision;}catch{}
   if(rev!==expectedRevision)
    return gatewayHealthState={status:'bozuk',lastCheckAt:Date.now(),reason:'akış revizyonu uyuşmuyor (beklenen '+expectedRevision+', bulunan '+(rev??'yok')+')'};
  }
  return gatewayHealthState={status:'ok',lastCheckAt:Date.now(),reason:''};
 }catch(e){
  return gatewayHealthState={status:'bilinmiyor',lastCheckAt:Date.now(),reason:(e as Error).message||'Node-RED erişilemedi'};
 }
}
let gatewayWatchdogTimer:ReturnType<typeof setInterval>|null=null;
/** Periyodik kontrolu baslatir (varsayilan 15 sn); zaten calisan bir zamanlayici varsa once durdurulur.
 * `getExpectedRevision` her turda cagrilir ki aktif config revizyonu degistiginde watchdog buna gore ayarlansin. */
export function startGatewayWatchdog(nodeRedUrl:string,getExpectedRevision:()=>number|null,directory:string,intervalMs=Math.max(1000,Number(process.env.SCADA_GATEWAY_WATCHDOG_MS)||15000),fetchImpl:typeof fetch=fetch){
 stopGatewayWatchdog();
 const tick=()=>{checkGatewayOnce(nodeRedUrl,getExpectedRevision(),directory,fetchImpl).catch(()=>{});};
 tick();
 gatewayWatchdogTimer=setInterval(tick,intervalMs);
 (gatewayWatchdogTimer as any).unref?.();
 return gatewayWatchdogTimer;
}
/** Sunucu kapanisinda cagrilir; zamanlayici acik kalirsa surec/test asili kalir. */
export function stopGatewayWatchdog(){
 if(gatewayWatchdogTimer){clearInterval(gatewayWatchdogTimer);gatewayWatchdogTimer=null;}
}
