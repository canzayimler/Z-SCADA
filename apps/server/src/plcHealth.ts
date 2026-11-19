/* --- S7 PLC sagligi (salt okuma) ----------------------------------------------
 * Etkin yapilandirmadaki her S7 baglantisi icin, etkin cihazi varsa, SCADA sunucusu
 * Node-RED koprusunden BAGIMSIZ ayri bir S7 oturumu acar ve yalniz okur:
 *  - calisma modu (SZL 0x0424)          her 30 sn
 *  - PLC saati (sapma icin)              her 30 sn
 *  - kimlik (0x0011 / 0x001C)            baglanti basinda bir kez
 *  - tanilama tamponu (0x01A0, son 20)   her 60 sn (desteklenmezse 0x00A0)
 * YAZMA, blok yukleme, saat ayari YOK — bu modulde tek bir yazma cagrisi bulunmaz.
 * Yalniz aktif (primary) sunucu okur; yedek sunucu PLC'ye ikinci oturum acmaz.
 * Kutuphane (nodes7) getSSL'i katı boyut denetimi yaptigi ve PLC'nin "desteklemiyorum"
 * yanitini ele almadigi icin SZL iletim katmanindan okunur, ayristirma s7Health.ts'te. */
import {S7Endpoint,S7ItemGroup} from '@st-one-io/nodes7';
import type {Config,Connection} from '../../../packages/contracts/model';
import {parseSzl,parseCpuMode,parseModuleId,parseComponentId,parseDiagBuffer,type CpuMode,type DiagEntry} from '../../../packages/drivers/s7Health';

const STATE_MS=30000,DIAG_MS=60000,DIAG_COUNT=20;
// nodes7 ic sabitleri: userdata CPU fonksiyonu ve READSZL alt fonksiyonu (S7 protokolu).
const CPU_FUNC=0x04,READSZL=0x01;

export type PlcHealth={
 connectionId:string;name:string;host:string;
 status:'ok'|'offline'|'connecting';error?:string;checkedAt:number|null;
 mode:CpuMode|null;identity:{orderNo?:string;firmware?:string;hardware?:string;systemName?:string;moduleName?:string;moduleType?:string;serial?:string;plantId?:string}|null;
 clockDriftSec:number|null;diag:DiagEntry[]|null;diagAt:number|null;
 unsupported:string[];
};
type Slot={conn:Connection;ep:any|null;health:PlcHealth;busy:boolean;lastDiag:number;identityDone:boolean};

export function registerPlcHealth(ctx:{app:any;read:(req:any)=>unknown;active:()=>Config|null;isPrimary:()=>boolean}){
 const slots=new Map<string,Slot>();
 const enabled=process.env.SCADA_PLC_HEALTH!=='0';
 function wanted(){
  const c=ctx.active();if(!c)return [];
  return c.connections.filter(x=>x.protocol==='s7'&&c.devices.some(d=>d.enabled&&d.connectionId===x.id));
 }
 function fresh(conn:Connection):PlcHealth{return {connectionId:conn.id,name:conn.name,host:conn.host,status:'connecting',checkedAt:null,mode:null,identity:null,clockDriftSec:null,diag:null,diagAt:null,unsupported:[]};}
 async function szl(ep:any,id:number,index:number){
  const req=Buffer.alloc(4);req.writeUInt16BE(id,0);req.writeUInt16BE(index,2);
  try{return parseSzl(await ep._connection.sendUserData(CPU_FUNC,READSZL,req));}catch{return null;}
 }
 function drop(s:Slot){try{s.ep?.disconnect();}catch{/* zaten kapali */}s.ep=null;}
 async function connect(s:Slot){
  const ep=new S7Endpoint({host:s.conn.host,port:s.conn.port||102,rack:s.conn.rack??0,slot:s.conn.slot??1,autoReconnect:0,timeout:Math.max(2000,s.conn.timeout)} as any);
  ep.on('error',()=>{/* baglanti hatasi asagida yakalanir; dinleyicisiz 'error' sureci dusurur */});
  await new Promise<void>((res,rej)=>{const t=setTimeout(()=>rej(Error('Bağlantı zaman aşımı')),Math.max(4000,s.conn.timeout*2));ep.once('connect',()=>{clearTimeout(t);res();});ep.once('error',(e:Error)=>{clearTimeout(t);rej(e);});ep.connect();});
  s.ep=ep;
 }
 async function poll(s:Slot){
  if(s.busy)return;s.busy=true;
  const h=s.health;
  try{
   if(!s.ep)await connect(s);
   const ep=s.ep;const miss=new Set(h.unsupported);
   const mode=parseCpuMode(await szl(ep,0x0424,0));
   if(mode)h.mode=mode;else{miss.add('mode');h.mode=null;}
   if(!s.identityDone){
    const m=parseModuleId(await szl(ep,0x0011,0)),c=parseComponentId(await szl(ep,0x001c,0));
    const id={...(m||{}),...(c||{})};h.identity=Object.keys(id).length?id:null;if(!h.identity)miss.add('identity');
    s.identityDone=true;
   }
   try{const t:Date=await ep.getTime();h.clockDriftSec=Math.round((t.getTime()-Date.now())/1000);}catch{h.clockDriftSec=null;miss.add('clock');}
   if(Date.now()-s.lastDiag>=DIAG_MS){
    s.lastDiag=Date.now();
    let d=parseDiagBuffer(await szl(ep,0x01a0,DIAG_COUNT),DIAG_COUNT);
    if(!d||!d.length){const all=parseDiagBuffer(await szl(ep,0x00a0,0),DIAG_COUNT);if(all&&all.length)d=all;}
    if(d){h.diag=d;h.diagAt=Date.now();miss.delete('diag');}else if(!h.diag)miss.add('diag');
   }
   h.unsupported=[...miss];h.status='ok';h.error=undefined;h.checkedAt=Date.now();
  }catch(e){
   drop(s);h.status='offline';h.error=(e as Error).message;h.checkedAt=Date.now();h.mode=null;
  }finally{s.busy=false;}
 }
 function sync(){
  const want=ctx.isPrimary()&&enabled?wanted():[];
  const ids=new Set(want.map(c=>c.id));
  for(const [id,s] of slots){
   const next=want.find(c=>c.id===id);
   // Baglanti silindi ya da adresi degisti: eski oturumu kapat.
   if(!ids.has(id)||!next||next.host!==s.conn.host||next.port!==s.conn.port||next.rack!==s.conn.rack||next.slot!==s.conn.slot){drop(s);slots.delete(id);}
   else{s.conn=next;s.health.name=next.name;}
  }
  for(const c of want)if(!slots.has(c.id))slots.set(c.id,{conn:c,ep:null,health:fresh(c),busy:false,lastDiag:0,identityDone:false});
 }
 async function tick(){sync();await Promise.all([...slots.values()].map(poll));}
 const timer=setInterval(()=>void tick(),STATE_MS);timer.unref?.();
 setTimeout(()=>void tick(),3000).unref?.();

 ctx.app.get('/api/plc-health',async(req:any)=>{ctx.read(req);sync();return [...slots.values()].map(s=>s.health);});
 // Tanilama tamponunu hemen yenile (kullanici "Yenile" dediginde); yine salt okuma.
 ctx.app.post('/api/plc-health/:id/refresh',async(req:any)=>{
  ctx.read(req);sync();const s=slots.get(req.params.id);
  if(!s)throw Object.assign(Error('Bu bağlantı için PLC sağlığı izlenmiyor (etkin S7 cihazı yok).'),{statusCode:404});
  s.lastDiag=0;await poll(s);return s.health;
 });
 /** Okuma testi: izlenen S7 oturumundan tek adres okur (salt okuma, ek oturum acilmaz). */
 async function readOnce(connectionId:string,address:string){
  sync();const s=slots.get(connectionId);
  if(!s)throw Object.assign(Error('Bu S7 bağlantısı sahada izlenmiyor; cihazı etkinleştirip "Haberleşmeye uygula".'),{statusCode:404});
  for(let n=0;s.busy&&n<120;n++)await new Promise(r=>setTimeout(r,25));
  if(s.busy)throw Error('PLC oturumu meşgul; tekrar deneyin.');
  s.busy=true;
  try{if(!s.ep)await connect(s);const g=new S7ItemGroup(s.ep);g.addItems(address);const r=await g.readAllItems();return r[address];}
  catch(e){drop(s);throw e;}
  finally{s.busy=false;}
 }
 return {readOnce,stop(){clearInterval(timer);for(const s of slots.values())drop(s);slots.clear();}};
}
