import {memo} from 'react';
import {resolveState,readBindings,phaseOf,phaseLabels,phaseTone,dynamicsOf} from './states';
import type {Widget,Part} from '../contracts/model';
import {flatTypes,viewBoxes as boxes,variantKey,partTypes} from './catalog';
import {bandOf,bandColor,bandMarks} from './band';
import {viewBoxAttr,viewBoxOf,stretches} from './frame';
import {renderers} from './render';
import type {SymbolCtx,SymbolLive} from './render/ctx';
const flat=flatTypes as readonly string[];
type Reading={value:boolean|number|null;quality:string};
type SymbolProps={w:Widget;value?:boolean|number|null;quality?:string;selected?:boolean;samples?:Record<string,Reading>;live?:SymbolLive};
/* 2026-09-25 performans: her canli mesajda tum semboller yeniden ciziliyordu. Sembol yalniz
 * kendi degeri/kalitesi, okumalari (deger+kalite) veya ozellikleri (sig) degisince cizilir.
 * Nesne ozellikleri ekran durumundan gelir; duzenlenmeyen alanlarin referansi degismez. */
const sameReading=(a?:Reading,b?:Reading)=>a===b||(!!a&&!!b&&a.value===b.value&&a.quality===b.quality);
function sameReadings(a?:Record<string,Reading>,b?:Record<string,Reading>){
 if(a===b)return true;if(!a||!b)return false;const ka=Object.keys(a);if(ka.length!==Object.keys(b).length)return false;
 return ka.every(k=>sameReading(a[k],b[k]));
}
function shallowSame(a:any,b:any){if(a===b)return true;const ka=Object.keys(a);if(ka.length!==Object.keys(b).length)return false;for(const k of ka)if(a[k]!==b[k])return false;return true;}
export function symbolPropsEqual(p:SymbolProps,n:SymbolProps){
 return p.value===n.value&&p.quality===n.quality&&p.selected===n.selected&&p.live===n.live&&sameReadings(p.samples,n.samples)&&shallowSame(p.w,n.w);
}
function SymbolView({w,value,quality='unknown',selected=false,samples,live}:SymbolProps){
 const good=quality==='good',on=good&&!!value,unknown=!!w.tagId&&!good;
 const stroke=unknown?'var(--sym-unknown)':on?w.color:(w.offColor||'var(--sym-idle)');
 const active=on&&w.animated,body='var(--sym-body-fill,var(--sym-body))',line='var(--sym-line)';
 const num=good&&typeof value==='number'?value:null;
 const baseRatio=num===null?0:Math.max(0,Math.min(1,(num-w.min)/(w.max-w.min||1)));
 const label=w.labelVisible===false?null:<text x="60" y="95" textAnchor={w.textAlign==='left'?'start':w.textAlign==='right'?'end':'middle'} fontWeight={w.fontWeight} fontSize={w.fontSize||10} fill="var(--sym-label)">{w.label}</text>;
 /* 2026-09-28 yeni sembol dili (Rozet ikonlariyla ayni): uc kanatli ince cark, ince ayak.
  * Cark yumusak kalkisi motion.css'teki .rotor'dan gelir. */
 const blade='M60 40C60 31.7 65.3 25.7 72.8 25';
 const rotor=<g className={active?'rotor':''} style={{transformOrigin:'60px 40px'}} fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round"><path d={blade}/><path d={blade} transform="rotate(120 60 40)"/><path d={blade} transform="rotate(240 60 40)"/><circle cx="60" cy="40" r="4.5" fill={body}/></g>;
 const feet=<path d="M36 72L84 72M46 66L46 72M74 66L74 72" stroke={stroke} strokeWidth="2.6" strokeLinecap="round"/>;
 const dial=(cx:number,cy:number,r:number)=>{const a=Math.PI*(1-ratio);return <line x1={cx} y1={cy} x2={cx+Math.cos(a)*r} y2={cy-Math.sin(a)*r} stroke={num===null?'var(--sym-unknown)':w.color} strokeWidth="3" strokeLinecap="round"/>;};
 /* G46: isletme bandi. Deger okunamiyorsa bant 'unknown'; renk ve isaretler
  * o zaman "bilinmiyor" der, sessizce normal gostermez. */
 const band=bandOf(w,num);
 const bandFill=bandColor(band,w.color);
 const ticks=bandMarks(w);
 /** Dikey olcekli semboller icin sinir cizgileri (bar, termometre, kap). */
 const bandTicks=(x:number,width:number,bottom:number,height:number)=>ticks.map(m=>
  <path key={m.kind+m.value} d={`M${x} ${bottom-m.ratio*height}h${width}`}
   stroke={m.kind==='limit'?'var(--sym-alarm)':'var(--warn-text)'} strokeWidth={m.kind==='limit'?2:1.5}
   strokeDasharray={m.kind==='limit'?undefined:'4 3'} opacity=".9"/>);
 /** Yarim daire olcekli semboller (gosterge) icin sinir tirnaklari. */
 const bandArc=(cx:number,cy:number,r:number)=>ticks.map(m=>{
  const a=Math.PI*(1-m.ratio);
  return <line key={m.kind+m.value} x1={cx+Math.cos(a)*(r-7)} y1={cy-Math.sin(a)*(r-7)}
   x2={cx+Math.cos(a)*(r+7)} y2={cy-Math.sin(a)*(r+7)}
   stroke={m.kind==='limit'?'var(--sym-alarm)':'var(--warn-text)'} strokeWidth={m.kind==='limit'?2.5:1.8} strokeLinecap="round"/>;
 });
 /* G46: setpoint etiketi de bugune kadar yalniz kaydediliyordu. Baglanmissa
  * hedef deger okunur ve olcegin uzerinde ayri bir isaretle gosterilir. */
 const setpointSample=w.setpointTagId?samples?.[w.setpointTagId]:undefined;
 const setpoint=setpointSample&&setpointSample.quality==='good'&&typeof setpointSample.value==='number'?setpointSample.value:null;
 const parts:Part[]=w.parts||[];
 const analog=w.mode==='analog';
 const state=resolveState(w,value,quality,samples),partIndex=state.index;
 const lit=(i:number)=>{if(!state.known)return false;if(analog)return i===partIndex;const r=parts[i]?.tagId?samples?.[parts[i].tagId]:undefined;return r?.quality==='good'&&r.value===(parts[i].expected??true);};
 const partsReady=state.known;
 /* G07/G08/G22: saha baglari varsa gorunum tekil "acik mi" degerinden degil,
  * isletme fazindan gelir. Renderer'lar degismez — ayni `on`/`stroke`/`active`
  * alanlarini okur, yalniz degerleri faza gore hesaplanir. */
 const readings=readBindings(w,samples||{});
 /* K07: doluluk bir etikete baglanmissa olcek 0-100 yuzde olarak okunur;
  * bag yoksa nesnenin kendi min/max olcegi gecerlidir. */
 const dynamics=dynamicsOf(readings);
 const ratio=dynamics.fill===null?baseRatio:Math.max(0,Math.min(1,dynamics.fill/100));
 /* G10: olculen debi baglanmissa akis ONDAN gelir. Isaret yonu, buyukluk
  * hizi verir; sifir debi akissizliktir ve hicbir sey hareket etmez.
  * Veri okunamiyorsa akis DURUR — akan bir boru "her sey yolunda" der. */
 const flow=('flow' in readings.number)?readings.number.flow:undefined;
 const flowing=flow===undefined?null:flow!==null&&Math.abs(flow)>0;
 /* K04: kendi kademe cizimi olan semboller (lamba, kule, cok durumlu...)
  * kurallari kendileri yorumlar. Digerlerinde kural, sembolun VURGU RENGINI
  * ve durum yazisini surer; ayri bir cizim uretmez. Boylece her sembol
  * kural tasiyabilir ama hicbir renderer degismek zorunda kalmaz. */
 const nativeParts=(partTypes as readonly string[]).includes(w.type);
 const ruleState=!nativeParts&&parts.length?state:null;
 const rulePart=ruleState&&ruleState.index>=0?parts[ruleState.index]:null;
 const ruleUnknown=!!ruleState&&!ruleState.known;
 const phase=phaseOf(w,readings);
 const tone=phase?phaseTone[phase]:null;
 const phaseOn=phase==='open'||phase==='running'||phase==='reverse'||phase==='closed'&&familyClosedIsOn(w.type);
 const effOn=flowing!==null?flowing:phase?phaseOn:rulePart?true:on;
 const effUnknown=ruleUnknown?true:flow!==undefined?flow===null:phase?phase==='unknown':unknown;
 /* Baglanmis ama okunamayan debi, "akis yok" ile AYNI cizilemez: durgun bir
  * boru "hat bos" der, oysa gercek "bilmiyoruz"dur. Boru ailesinde soru
  * isareti rozeti cizilmedigi icin ayrim renkle tasinir. */
 const effStroke=flow!==undefined&&flow===null?'var(--sym-unknown)':ruleUnknown?'var(--sym-unknown)':rulePart?rulePart.color:!tone?stroke
  :tone==='alarm'?'var(--sym-alarm)':tone==='warn'?'var(--warn-text)'
  :tone==='unknown'?'var(--sym-unknown)':tone==='active'?w.color:(w.offColor||'var(--sym-idle)');
 const effActive=flowing!==null?w.animated&&flowing:phase?w.animated&&(phase==='running'||phase==='reverse'||phase==='moving'):active;
 const ruleWidget=rulePart?{...w,color:rulePart.color}:w;
 const effWidget=phase==='reverse'?{...ruleWidget,reverse:!ruleWidget.reverse}
  :flow!==undefined&&flow!==null&&flow<0?{...ruleWidget,reverse:!ruleWidget.reverse}:ruleWidget;
 const ctx:SymbolCtx={band,bandFill,bandTicks,bandArc,setpoint,w:effWidget,value,quality,selected,samples,good,on:effOn,unknown:effUnknown,stroke:effStroke,active:effActive,body,line,num,ratio,label,rotor,feet,dial,parts,analog,state,partIndex,lit,partsReady,phase,readings,variant:variantKey(w.type,w.variant),live};
 const renderer=renderers[w.type];
 const res=renderer?renderer(ctx):null;
 if(res!==null&&typeof res==='object'&&'html' in res)return res.html;
 const content=res;
 /* G50/G51: goruntu kutusu tek kaynakta (frame.ts) — cizen ve olcen ayni hesabi kullanir. */
 const viewBox=viewBoxAttr(w);
 const ruleCaption=ruleUnknown?'BİLİNMİYOR':rulePart?(rulePart.label||'DURUM'):ruleState?'EŞLEŞME YOK':'';
 /* Boru ailesinde soru isareti rozeti cizilmez; okunamayan debi orada
  * yalniz renkle anlatilamaz cunku bos boru da rengsizdir. Durum yazisi
  * her turde cizildigi icin ayrim onunla tasinir. */
 const caption=phase?phaseLabels[phase]:(flow!==undefined&&flow===null)?'DEBİ BİLİNMİYOR':ruleCaption;
 /* Rozetler goruntu kutusunun koselerine yapisir: kirpilmis ('trim') dar sembolde sabit
  * (100,2) konumu kutunun disinda kalip gorunmuyordu. Tam kutuda konum eskisiyle aynidir. */
 const vb=viewBoxOf(w),bx0=Math.max(1,vb.x+1),by0=Math.max(1,vb.y+1),bx1=Math.min(118,vb.x+vb.width-1);
 const badge=caption?<g className={'sym-badge'+((tone==='alarm'||ruleUnknown)&&w.animated?' blink':'')}><rect x={bx0} y={by0} width={caption.length*5.4+8} height="13" rx="3" fill="var(--chip)" stroke={effStroke} strokeWidth="1"/><text x={bx0+4} y={by0+9.5} fontSize="8" fontWeight="700" fill={effStroke}>{caption}</text></g>:null;
 /* Veri sorunu: govde kesik cizgi (CSS, q-unknown) + rozet. Okuma hatasi kirmizi "!" ve yanip soner
  * (Alarmlar ekranindaki onaysiz alarm ile ayni dil); bayat/bilinmeyen veri sari "?". */
 const dataIssue=(phase?effUnknown:unknown)&&!flat.includes(w.type);
 const issueBadge=!dataIssue?null:quality==='bad'
  ?<g className={'sym-badge'+(w.animated?' blink':'')}><rect x={bx1-18} y={by0+1} width="18" height="18" rx="5" fill="var(--sym-alarm)"/><text x={bx1-9} y={by0+15} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800">!</text></g>
  :<g className="sym-badge"><circle cx={bx1-9} cy={by0+9} r="8" fill="var(--chip)" stroke="var(--warn-text)" strokeWidth="1.6"/><text x={bx1-9} y={by0+13.5} textAnchor="middle" fill="var(--warn-text)" fontSize="12" fontWeight="800">?</text></g>;
 /* Detayli kaplama (motion.css) icin durum siniflari: calisiyor -> durum isigi parlar;
  * ariza/trip/okuma hatasi -> govde kirmizi cerceve. Klasik/ISA-101 bunlari kullanmaz. */
 const alarm=tone==='alarm'||(dataIssue&&quality==='bad');
 const stateClass=(effOn&&!effUnknown?' sym-run':'')+(alarm?' sym-alarm':'');
 return <svg className={'scada-symbol '+(flat.includes(w.type)?'pipe-symbol':'')+(dataIssue?' q-unknown':'')+stateClass} viewBox={viewBox} width="100%" height="100%" preserveAspectRatio={stretches(w)?'none':'xMidYMid meet'} strokeLinejoin="round" aria-label={w.label+(caption?' · '+caption:'')}>{content}{badge}{issueBadge}</svg>;
}
/** Salterde "kapali" enerjili demektir; vanada kapali akis yok demektir. */
function familyClosedIsOn(type:string){return type==='breaker'||type==='contactor';}

export const Symbol=memo(SymbolView,symbolPropsEqual);
