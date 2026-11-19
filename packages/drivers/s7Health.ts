/* --- S7 PLC sagligi: SZL (System Status List) ayristiricilari ----------------
 * Saf fonksiyonlar; ag katmani apps/server/src/plcHealth.ts'te. Bicimler Siemens
 * "System Software for S7-300/400 System and Standard Functions" SZL bolumunden:
 * yanit = SZL-ID(2) INDEX(2) LENTHDR(2) N_DR(2) + N_DR adet LENTHDR baytlik kayit.
 * PLC bir listeyi desteklemiyorsa yanit bos/kisa gelir -> null (hata degil, "vermiyor").
 * S7-1200/1500 PUT/GET uzerinden listelerin yalniz bir kismini verir; hangisinin
 * geldigi sahada olculur, arayuz eksik olani "PLC bu bilgiyi vermiyor" diye gosterir.
 * Olay metni UYDURULMAZ: Siemens olay katalogu cok genis; sinif + gelis/gidis +
 * TIA'da aranabilir 16#kimlik gosterilir. */
export type SzlRecords={id:number;index:number;records:Buffer[]};
export function parseSzl(buf:Buffer|undefined|null):SzlRecords|null{
 if(!buf||buf.length<8)return null;
 const id=buf.readUInt16BE(0),index=buf.readUInt16BE(2),len=buf.readUInt16BE(4),count=buf.readUInt16BE(6);
 if(!len||!count)return {id,index,records:[]};
 const records:Buffer[]=[];
 // Kayit sayisi yanittan fazla gorunuyorsa (bazi CPU/emulatorler) eldeki kadarini al; yarim kaydi at.
 for(let i=0;i<count;i++){const at=8+i*len;if(at+len>buf.length)break;records.push(buf.subarray(at,at+len));}
 return {id,index,records};
}
export type CpuMode='run'|'stop'|'startup'|'hold'|'defect'|'unknown';
export const cpuModeLabels:Record<CpuMode,string>={run:'RUN',stop:'STOP',startup:'BAŞLANGIÇ',hold:'BEKLEME',defect:'ARIZALI',unknown:'BİLİNMİYOR'};
/** SZL 0x0424 (mevcut calisma modu). Kayit: ereig(2) ae(1) bzu-id(1) ... ; bzu-id alt 4 bit = mod. */
export function parseCpuMode(s:SzlRecords|null):CpuMode|null{
 const r=s?.records[0];if(!r||r.length<4)return null;
 const m=r[3]&0x0f;
 return ({0x08:'run',0x03:'stop',0x04:'startup',0x02:'startup',0x05:'startup',0x06:'startup',0x09:'hold',0x0a:'hold',0x0d:'defect',0x0e:'defect'} as Record<number,CpuMode>)[m]??'unknown';
}
const ascii=(b:Buffer)=>b.toString('latin1').replace(/\0+$/,'').replace(/[\x00-\x1f]/g,' ').trim();
/** SZL 0x0011 (modul kimligi). Kayit 28 bayt: index(2) MLFB(20) BGTyp(2) Ausbg(2) Ausbe(2).
 * index 1 = modul (siparis no), 6 = temel donanim, 7 = temel firmware (surum son uc baytta). */
export function parseModuleId(s:SzlRecords|null):{orderNo?:string;hardware?:string;firmware?:string}|null{
 if(!s||!s.records.length)return null;
 const out:{orderNo?:string;hardware?:string;firmware?:string}={};
 for(const r of s.records){
  // Siparis no icin 22 bayt yeter (bazi CPU/emulatorler 26 baytlik kayit dondurur); surum 28 bayt ister.
  if(r.length<22)continue;
  const idx=r.readUInt16BE(0),mlfb=ascii(r.subarray(2,22));
  if(idx===1&&mlfb)out.orderNo=mlfb;
  else if(idx===6&&r.length>=28)out.hardware=version(r);
  else if(idx===7&&r.length>=28)out.firmware=version(r);
 }
 return out;
}
/** Surum kaydin son uc baytinda: V ana.alt.yama (Snap7 Cli_GetOrderCode ile ayni okuma). */
function version(r:Buffer){return 'V'+r[25]+'.'+r[26]+'.'+r[27];}
/** SZL 0x001C (bilesen kimligi). Kayit 34 bayt: index(2) ad(32). 1=otomasyon sistemi adi,
 * 2=modul adi, 3=tesis kimligi, 5=seri no, 7=modul tipi adi. */
export function parseComponentId(s:SzlRecords|null):{systemName?:string;moduleName?:string;plantId?:string;serial?:string;moduleType?:string}|null{
 if(!s||!s.records.length)return null;
 const out:Record<string,string>={};
 const keys:Record<number,string>={1:'systemName',2:'moduleName',3:'plantId',5:'serial',7:'moduleType'};
 for(const r of s.records){if(r.length<4)continue;const k=keys[r.readUInt16BE(0)];if(k){const v=ascii(r.subarray(2));if(v)out[k]=v;}}
 return out;
}
/** BCD 8 bayt tarih-saat (S7 DATE_AND_TIME): YY MM DD hh mm ss ms(3 hane) + gun. */
export function parseBcdTime(b:Buffer):Date|null{
 if(b.length<8)return null;
 const d=(x:number)=>(x>>4)*10+(x&0x0f);
 const yy=d(b[0]),year=yy>=90?1900+yy:2000+yy;
 const ms=d(b[6])*10+(b[7]>>4);
 const t=new Date(year,d(b[1])-1,d(b[2]),d(b[3]),d(b[4]),d(b[5]),ms);
 return Number.isNaN(t.getTime())||d(b[1])<1||d(b[1])>12?null:t;
}
export const eventClassLabels:Record<number,string>={
 1:'OB başlatma olayı',2:'Senkron hata (program)',3:'Asenkron hata (donanım/zaman)',4:'Çalışma modu geçişi',
 5:'Asenkron hata (iletişim)',6:'Yedekli sistem olayı',7:'Tanılama (G/Ç)',8:'Modül tanılama',9:'Kullanıcı olayı',
 10:'Kullanıcı olayı',11:'Kullanıcı olayı',12:'Sistem olayı',13:'Sistem olayı',14:'Sistem olayı',15:'Sistem olayı'};
export type DiagEntry={eventId:number;idText:string;eventClass:number;classLabel:string;incoming:boolean|null;at:string|null;info:string};
/** SZL 0x00A0 (tanilama tamponu). Kayit 20 bayt: olay kimligi(2) bilgi(10) zaman damgasi BCD(8).
 * Kimlik: bit 15-12 olay sinifi, bit 8 = gelen(1)/giden(0) olay (yalniz durum olaylarinda anlamli). */
export function parseDiagBuffer(s:SzlRecords|null,limit=50):DiagEntry[]|null{
 if(!s)return null;
 const out:DiagEntry[]=[];
 for(const r of s.records){
  if(out.length>=limit)break;
  if(r.length<20)continue;
  const id=r.readUInt16BE(0),cls=id>>12;
  const at=parseBcdTime(r.subarray(12,20));
  out.push({eventId:id,idText:'16#'+id.toString(16).toUpperCase().padStart(4,'0'),eventClass:cls,classLabel:eventClassLabels[cls]||'Diğer',
   incoming:cls===3||cls===5||cls===7||cls===8?Boolean(id&0x0100):null,at:at?at.toISOString():null,info:r.subarray(2,12).toString('hex').toUpperCase()});
 }
 return out;
}
