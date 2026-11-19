/* --- Ag kesfi (salt okuma, IP tabanli) ------------------------------------------
 * Sahada "bu hatta ne var, hangi IP kimde" sorusu icin. PROFINET DCP (katman 2) yerine IP
 * taramasi: DCP ham Ethernet ister; Windows'ta Npcap gerekir, Npcap ucretsiz lisansi kurucuya
 * gomulmeye izin vermez ve kurulumu yonetici ister. Bu tarama kurulum istemez.
 *  - Girilen alt agda (en fazla /24) endustriyel portlara TCP baglanip hemen kapatir.
 *  - 102 acik cihazdan S7 kimligi (SZL 0x0011/0x001C) salt okunur.
 *  - MAC adresi isletim sisteminin ARP tablosundan, ureticisi OUI onekinden.
 * Hicbir cihaza veri yazilmaz; es zamanlilik ve zaman asimi dusuk tutulur (eski/zayif cihazlar
 * yuk altinda kalmasin). Ayni anda tek tarama. */
import net from 'node:net';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {S7Endpoint} from '@st-one-io/nodes7';
import type {Config} from '../../../packages/contracts/model';
import {parseSzl,parseModuleId,parseComponentId} from '../../../packages/drivers/s7Health';

export const SCAN_PORTS:{port:number;label:string}[]=[{port:102,label:'Siemens S7'},{port:502,label:'Modbus TCP'},{port:48898,label:'Beckhoff ADS'},{port:4840,label:'OPC UA'},{port:44818,label:'EtherNet/IP'}];
const CONCURRENCY=16,TIMEOUT_MS=600;
/* Kaynak: IEEE OUI kaydi; yalniz yaygin ve emin olunan onekler. Bilinmeyen = bos. */
const OUI:Record<string,string>={'001b1b':'Siemens','000e8c':'Siemens','001c06':'Siemens','286336':'Siemens','ac6417':'Siemens',
 '000105':'Beckhoff','0030de':'WAGO','0090e8':'Moxa','00a045':'Phoenix Contact','0080f4':'Schneider Electric','0000bc':'Rockwell'};
export type ScanHost={ip:string;mac:string|null;vendor:string|null;ports:number[];s7:{orderNo?:string;firmware?:string;moduleType?:string;moduleName?:string;systemName?:string;slot?:number}|null;known:string|null};
export type ScanJob={id:string;cidr:string;startedAt:number;finishedAt:number|null;total:number;done:number;hosts:ScanHost[];error?:string};

/** "192.0.2.0/24" ya da "192.0.2.10-40" -> IP listesi (en fazla 256). */
export function expandTargets(input:string):string[]{
 const s=input.trim();
 const range=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*-\s*(\d{1,3})$/.exec(s);
 const ok=(n:number)=>n>=0&&n<=255;
 if(range){
  const [a,b,c,from,to]=range.slice(1).map(Number);
  if(![a,b,c,from,to].every(ok)||from>to)throw Error('Aralık anlaşılamadı: '+input);
  return Array.from({length:to-from+1},(_,i)=>`${a}.${b}.${c}.${from+i}`);
 }
 const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(s);
 if(!m)throw Error('Adres anlaşılamadı: "'+input+'". Örnek: 192.0.2.0/24 veya 192.0.2.10-40');
 const oct=m.slice(1,5).map(Number),bits=Number(m[5]);
 if(!oct.every(ok))throw Error('Adres anlaşılamadı: '+input);
 if(bits<24||bits>32)throw Error('En fazla /24 (256 adres) taranır; daha geniş ağı parçalara bölün.');
 const base=((oct[0]<<24)>>>0)+(oct[1]<<16)+(oct[2]<<8)+oct[3];
 const size=2**(32-bits),start=(base&~(size-1))>>>0;
 const ips:string[]=[];
 for(let i=0;i<size;i++){
  if(size>2&&(i===0||i===size-1))continue; // ag ve yayin adresi
  const v=(start+i)>>>0;ips.push([v>>>24,(v>>>16)&255,(v>>>8)&255,v&255].join('.'));
 }
 return ips;
}
/** Bu PC'nin IPv4 agindan ve kayitli baglanti adreslerinden /24 onerileri. */
export function suggestTargets(config:Config|null):string[]{
 const out=new Set<string>();
 const add=(ip:string)=>{const m=/^(\d+\.\d+\.\d+)\.\d+$/.exec(ip);if(m&&!ip.startsWith('127.'))out.add(m[1]+'.0/24');};
 for(const c of config?.connections||[])if(c.protocol!=='opc-ua')add(c.host);
 for(const list of Object.values(os.networkInterfaces()))for(const a of list||[])if(a.family==='IPv4'&&!a.internal)add(a.address);
 return [...out];
}
function probe(ip:string,port:number):Promise<boolean>{
 return new Promise(res=>{
  const s=net.connect({host:ip,port});let done=false;
  const end=(ok:boolean)=>{if(done)return;done=true;s.destroy();res(ok);};
  s.setTimeout(TIMEOUT_MS,()=>end(false));s.once('connect',()=>end(true));s.once('error',()=>end(false));
 });
}
async function s7Identity(ip:string){
 for(const slot of [1,2,0]){
  const ep:any=new S7Endpoint({host:ip,port:102,rack:0,slot,autoReconnect:0,timeout:2000} as any);
  ep.on('error',()=>{});
  try{
   await new Promise<void>((res,rej)=>{const t=setTimeout(()=>rej(Error('zaman aşımı')),3000);ep.once('connect',()=>{clearTimeout(t);res();});ep.once('error',(e:Error)=>{clearTimeout(t);rej(e);});ep.connect();});
   const read=async(id:number)=>{const q=Buffer.alloc(4);q.writeUInt16BE(id,0);try{return parseSzl(await ep._connection.sendUserData(4,1,q));}catch{return null;}};
   const m=parseModuleId(await read(0x0011)),c=parseComponentId(await read(0x001c));
   const id={...(m||{}),...(c||{}),slot};
   try{ep.disconnect();}catch{/* */}
   return id;
  }catch{try{ep.disconnect();}catch{/* */}}
 }
 return null;
}
function arpTable():Promise<Map<string,string>>{
 return new Promise(res=>{
  execFile(process.platform==='win32'?'arp':'arp',['-a'],{timeout:5000,windowsHide:true},(err,stdout)=>{
   const map=new Map<string,string>();
   if(!err)for(const line of String(stdout).split(/\r?\n/)){
    const m=/(\d+\.\d+\.\d+\.\d+)\D+(([0-9a-f]{2}[-:]){5}[0-9a-f]{2})/i.exec(line);
    if(m)map.set(m[1],m[2].toLowerCase().replace(/-/g,':'));
   }
   res(map);
  });
 });
}
export function vendorOf(mac:string|null){return mac?OUI[mac.replace(/:/g,'').slice(0,6)]||null:null;}

export function registerNetScan(ctx:{app:any;edit:(req:any)=>unknown;config:()=>Config}){
 let job:ScanJob|null=null;
 ctx.app.get('/api/net-scan',async(req:any)=>{ctx.edit(req);return {job,suggest:suggestTargets(ctx.config()),ports:SCAN_PORTS};});
 ctx.app.post('/api/net-scan',async(req:any)=>{
  ctx.edit(req);
  if(job&&!job.finishedAt)throw Object.assign(Error('Bir tarama zaten sürüyor.'),{statusCode:409});
  const cidr=String(req.body?.target||'');
  const ports=(Array.isArray(req.body?.ports)?req.body.ports:SCAN_PORTS.map(p=>p.port)).map(Number).filter((p:number)=>SCAN_PORTS.some(s=>s.port===p));
  const ips=expandTargets(cidr);
  if(!ports.length)throw Error('En az bir port seçin.');
  const cur:ScanJob={id:Date.now().toString(36),cidr,startedAt:Date.now(),finishedAt:null,total:ips.length,done:0,hosts:[]};job=cur;
  void (async()=>{
   try{
    const queue=[...ips];
    const worker=async()=>{for(let ip=queue.shift();ip;ip=queue.shift()){
     const open:number[]=[];for(const p of ports)if(await probe(ip,p))open.push(p);
     if(open.length)cur.hosts.push({ip,mac:null,vendor:null,ports:open,s7:null,known:null});
     cur.done++;
    }};
    await Promise.all(Array.from({length:CONCURRENCY},worker));
    for(const h of cur.hosts)if(h.ports.includes(102))h.s7=await s7Identity(h.ip);
    const arp=await arpTable(),cfg=ctx.config();
    for(const h of cur.hosts){h.mac=arp.get(h.ip)||null;h.vendor=vendorOf(h.mac);h.known=cfg.connections.find(c=>c.host===h.ip)?.name||null;}
    cur.hosts.sort((a,b)=>a.ip.split('.').map(Number).reduce((s,n)=>s*256+n,0)-b.ip.split('.').map(Number).reduce((s,n)=>s*256+n,0));
   }catch(e){cur.error=(e as Error).message;}
   finally{cur.finishedAt=Date.now();}
  })();
  return cur;
 });
}
