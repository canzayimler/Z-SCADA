import type {Widget} from '../contracts/model';
import {familyOf,isDynamicRole} from './catalog';
type Reading={value:boolean|number|null;quality:string};
export function resolveState(w:Widget,value:unknown,quality:string,samples:Record<string,Reading>={}){
 const parts=w.parts||[];
 const known=w.mode==='analog'?quality==='good'&&typeof value==='number':parts.filter(p=>p.tagId).length>0&&parts.filter(p=>p.tagId).every(p=>samples[p.tagId]?.quality==='good'&&typeof samples[p.tagId].value==='boolean');
 if(!known)return {known:false,index:-1};
 if(w.mode==='digital')return {known:true,index:parts.findIndex(p=>p.tagId&&samples[p.tagId]?.value===(p.expected??true))};
 const n=value as number;
 if(w.rangeMode==='range')return {known:true,index:parts.findIndex(p=>n>=p.value&&(p.upper==null||n<p.upper))};
 let index=-1;parts.forEach((p,i)=>{if(n>=p.value&&(index<0||p.value>parts[index].value))index=i;});
 return {known:true,index};
}
/* --- Adlandirilmis bag okuma ve durum makinesi (A1) -----------------------
 * Bir baga etiket ATANMAMISSA o rol "yok"tur (undefined) ve durumu
 * belirlemede kullanilmaz. Etiket atanmis ama verisi kotu/eskiyse rol
 * "bilinmiyor"dur (null) ve sonuc bilinmiyora duser — kotu veri asla
 * normal proses durumu gibi cizilmez (bkz. B04).
 */
export type BindingReadings={
 /** Rol -> true/false/null(bilinmiyor); rol baglanmamissa anahtar yoktur. */
 bool:Record<string,boolean|null>;
 /** Rol -> sayi/null(bilinmiyor); rol baglanmamissa anahtar yoktur. */
 number:Record<string,number|null>;
 /** Baglanmis ama verisi kullanilamayan rol var mi? */
 anyUnknown:boolean;
 /** Hic rol baglanmis mi? */
 anyBound:boolean;
};
export function readBindings(w:Widget,samples:Record<string,Reading>={}):BindingReadings{
 const bool:Record<string,boolean|null>={},num:Record<string,number|null>={};
 let anyUnknown=false,anyBound=false;
 for(const b of w.bindings||[]){
  if(!b.tagId)continue;
  anyBound=true;
  const s=samples[b.tagId];
  const good=s&&s.quality==='good';
  if(!good){bool[b.role]=null;num[b.role]=null;anyUnknown=true;continue;}
  if(typeof s.value==='boolean')bool[b.role]=b.invert?!s.value:s.value;
  else if(typeof s.value==='number')num[b.role]=s.value;
  else{bool[b.role]=null;num[b.role]=null;anyUnknown=true;}
 }
 return {bool,number:num,anyUnknown,anyBound};
}
/** Vana: acildi/kapandi/ara konum/celiskili limit/ariza. */
export const valvePhases=['unknown','fault','open','closed','moving','conflict'] as const;
/** Motor ve surucu: hazir/calisiyor/durdu/trip. */
export const motorPhases=['unknown','trip','running','ready','stopped'] as const;
/** Salter ve kontaktor: acik/kapali/trip/celiskili. */
export const switchgearPhases=['unknown','trip','closed','open','conflict'] as const;
/** Tasiyici: calisiyor/ters/sikisti/durdu. */
export const conveyorPhases=['unknown','jam','reverse','running','stopped'] as const;
export type Phase=typeof valvePhases[number]|typeof motorPhases[number]|typeof switchgearPhases[number]|typeof conveyorPhases[number];
export const phaseLabels:Record<Phase,string>={
 unknown:'BİLİNMİYOR',fault:'ARIZA',open:'AÇIK',closed:'KAPALI',moving:'HAREKETTE',conflict:'ÇELİŞKİLİ',
 trip:'TRİP',running:'ÇALIŞIYOR',ready:'HAZIR',stopped:'DURDU',jam:'SIKIŞMA',reverse:'TERS YÖN'};
/** Durumun rengi: arizali/celiskili kirmizi, hareket sarisi, calisir yesil, bilinmiyor gri. */
export const phaseTone:Record<Phase,'alarm'|'warn'|'active'|'idle'|'unknown'>={
 unknown:'unknown',fault:'alarm',trip:'alarm',conflict:'alarm',jam:'alarm',
 moving:'warn',reverse:'warn',ready:'warn',
 open:'active',running:'active',
 closed:'idle',stopped:'idle'};
/** Bir rolun degeri; rol baglanmamissa `undefined`, verisi kotuyse `null`. */
function flag(r:BindingReadings,role:string):boolean|null|undefined{return role in r.bool?r.bool[role]:undefined;}
/**
 * Cok bagli ekipmanin isletme durumu. Hicbir rol baglanmamissa `null` doner:
 * cagiran taraf o zaman eski tekil `tagId` davranisini surdurur, boylece
 * mevcut ekranlar hicbir sey degismeden calismaya devam eder.
 */
export function phaseOf(w:Widget,readings:BindingReadings):Phase|null{
 const family=familyOf(w.type);
 if(!family||!readings.anyBound)return null;
 const f=(role:string)=>flag(readings,role);
 if(family==='valve'){
  const fault=f('fault');
  const open=f('openLimit'),close=f('closeLimit');
  if(fault===undefined&&open===undefined&&close===undefined&&readings.number.position===undefined)return null;
  if(fault)return 'fault';
  if(open===null||close===null)return 'unknown';
  if(open===undefined&&close===undefined){
   const pos=readings.number.position;
   if(pos===null)return 'unknown';
   if(pos===undefined)return null;
   return pos<=0?'closed':pos>=100?'open':'moving';
  }
  if(open&&close)return 'conflict';
  if(open)return 'open';
  if(close)return 'closed';
  return 'moving';
 }
 if(family==='motor'){
  const fault=f('fault'),running=f('running'),ready=f('ready');
  // Hicbir motor rolu baglanmamissa (orn. yalniz dinamik sunum bagi varsa)
  // faz yoktur: nesne eski tekil etiket davranisina duser.
  if(fault===undefined&&running===undefined&&ready===undefined)return null;
  if(fault)return 'trip';
  if(running===null)return 'unknown';
  if(running)return 'running';
  if(ready===null)return 'unknown';
  if(ready===undefined)return fault===null?'unknown':'stopped';
  return ready?'ready':'stopped';
 }
 if(family==='switchgear'){
  const trip=f('trip'),closed=f('closed'),open=f('open');
  if(trip===undefined&&closed===undefined&&open===undefined)return null;
  if(trip)return 'trip';
  if(closed===null||open===null)return 'unknown';
  if(closed===undefined&&open===undefined)return null;
  if(closed&&open)return 'conflict';
  if(closed)return 'closed';
  if(open)return 'open';
  return 'conflict';
 }
 const jam=f('jam'),running=f('running'),reverse=f('reverse');
 if(jam===undefined&&running===undefined&&reverse===undefined)return null;
 if(jam)return 'jam';
 if(running===null)return 'unknown';
 if(running===undefined)return jam===null?'unknown':'stopped';
 if(!running)return 'stopped';
 return reverse?'reverse':'running';
}
/* --- Dinamik sunum (K07) --------------------------------------------------
 * Aci, opaklik, doluluk ve yanip sonme bir etikete baglanabilir. Deger
 * okunamiyorsa nesne SUSAR: sabit tasarim degeri kullanilir, uydurma bir
 * aciya donmez. Yanip sonme yalniz bag ACIKCA true iken calisir.
 */
export type Dynamics={rotation:number|null;opacity:number|null;fill:number|null;blink:boolean};
export function dynamicsOf(readings:BindingReadings):Dynamics{
 const n=(role:string)=>role in readings.number?readings.number[role]:null;
 return {rotation:n('dynRotation'),opacity:n('dynOpacity'),fill:n('dynFill'),blink:readings.bool.dynBlink===true};
}
/** Sembolun kendi rolleri (dinamik sunum rolleri haric). */
export function fieldRoles(w:Widget){return (w.bindings||[]).filter(b=>!isDynamicRole(b.role));}
/** Yalniz dinamik sunum rolleri. */
export function dynamicRoles(w:Widget){return (w.bindings||[]).filter(b=>isDynamicRole(b.role));}
