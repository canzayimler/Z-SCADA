import type {Renderer,SymbolCtx} from './ctx';
import {kit,Body,led,hpipe,vpipe,faultBadge} from './kit';
/* 2026-11-18 vana ailesi, "B · Endustriyel metal" dili: boru saplari (silindir), papyon
 * dokum govde, mil, tahrik (el carki / diyafram / bobin / kol). Acik vanada govde durum
 * renginde dolar (Detayli'da .zvb currentColor), boruda akis akar. Agizlar katalogdaki
 * noktalarda biter; cizim olculmus kutunun (content.ts) icinde kalir. */
const vbody=(c:SymbolCtx)=>({className:'zb zc zvb',fill:c.on?c.w.color+'40':'var(--chip)',stroke:c.stroke,strokeWidth:2.2,color:c.w.color});
const alarmDot=(c:SymbolCtx,cx:number,cy:number)=>(c.phase==='conflict'||c.phase==='fault')?faultBadge(c.active||c.w.animated,cx,cy,6):null;

const valve:Renderer=(c)=>{const k=kit(c),vb=vbody(c);return <>
 {hpipe(c,12,25,42)}{hpipe(c,108,95,42)}
 <Body>
  <path {...vb} d="M25 29L60 42L25 55Z"/><path {...vb} d="M95 29L60 42L95 55Z"/>
  <rect {...k.p} className="zp zv" x="58.2" y="25" width="3.6" height="17"/>
  <path {...k.c} d="M45 26a15 10 0 0 1 30 0z"/>
 </Body>
 {led(c,60,21.5,2.4)}
</>;};

const checkValve:Renderer=(c)=>{const k=kit(c),vb=vbody(c),on=c.on;return <>
 {hpipe(c,2,22,47)}{hpipe(c,118,98,47)}
 <Body><rect {...k.c} x="22" y="31" width="76" height="32" rx="9"/></Body>
 <path {...vb} strokeWidth={1.6} d="M38 37L70 47L38 57Z"/>
 <path {...k.x} strokeWidth={2.6} d={on?'M76 36L86 44':'M76 36V58'}/>
 <circle {...k.p} cx="76" cy="36" r="2.4"/>
 <path {...k.d} opacity={.8} d="M28 67h20M44 64l4 3-4 3"/>
</>;};

const butterfly:Renderer=(c)=>{const k=kit(c),on=c.on;return <>
 {hpipe(c,2,36,44)}{hpipe(c,118,84,44)}
 <Body>
  <circle {...k.c} cx="60" cy="44" r="24"/>
  <rect {...k.p} className="zp zv" x="58" y="15" width="4" height="6"/>
  <rect {...k.b} x="49" y="8" width="22" height="8" rx="2"/>
 </Body>
 <circle {...k.d} cx="60" cy="44" r="17"/>
 {/* Acik (on): disk akisa paralel (ince); kapali: akisa dik (dolu disk). */}
 <ellipse {...vbody(c)} strokeWidth={1.8} cx="60" cy="44" rx={on?17:4} ry={on?3.5:17}/>
 <circle {...k.p} cx="60" cy="44" r="2.4"/>
 {led(c,66,12,1.8)}
</>;};

const ball:Renderer=(c)=>{const k=kit(c),on=c.on;return <>
 {hpipe(c,2,34,44)}{hpipe(c,118,86,44)}
 <Body>
  <rect {...k.c} x="33" y="27" width="54" height="34" rx="10"/>
  <rect {...k.p} className="zp zv" x="57.5" y="17" width="5" height="10"/>
 </Body>
 <circle {...k.b} cx="60" cy="44" r="13"/>
 <rect {...vbody(c)} strokeWidth={1.6} x={on?47:55} y={on?40:31} width={on?26:10} height={on?8:26} rx="3"/>
 <rect {...k.b} x={on?52:55} y={on?11:8} width={on?42:10} height={on?7:12} rx="3"/>
 {led(c,60,14.5,1.8)}
</>;};

const solenoid:Renderer=(c)=>{const k=kit(c),vb=vbody(c);return <>
 {hpipe(c,18,29,46,4.5)}{hpipe(c,94,83,46,4.5)}
 <Body>
  <path {...vb} d="M29 35L56 46L29 57Z"/><path {...vb} d="M83 35L56 46L83 57Z"/>
  <rect {...k.p} className="zp zv" x="54" y="26" width="4" height="20"/>
  <rect {...k.b} x="40" y="6" width="32" height="21" rx="3"/>
 </Body>
 <path {...k.d} d="M44 11h24M44 15h24M44 19h24M44 23h24"/>
 <rect className="zdial" x="47" y="12" width="12" height="11" rx="1.5" fill="var(--chip)" stroke={c.stroke} strokeWidth="1"/>
 <text className="zt" x="53" y="21" textAnchor="middle" fontSize="9" fontWeight="700" fill={c.stroke}>S</text>
 {led(c,65,17.5,2.4)}
</>;};

const control:Renderer=(c)=>{const k=kit(c),vb=vbody(c),{w,num,ratio}=c;
 const ty=46-(num===null?0:ratio)*14;
 return <>
 {hpipe(c,18,31,56)}{hpipe(c,94,81,56)}
 <Body>
  <path {...vb} d="M31 44L56 56L31 68Z"/><path {...vb} d="M81 44L56 56L81 68Z"/>
  <rect {...k.p} className="zp zv" x="54.2" y="30" width="3.6" height="26"/>
  <path {...k.c} d="M36 30a20 15 0 0 1 40 0z"/>
  <rect {...k.b} x="34" y="29" width="44" height="3" rx="1"/>
 </Body>
 <path {...k.d} d="M62 34v14M62 34h3M62 41h2M62 48h3"/>
 <rect x="52" y={ty} width="8" height="3" rx="1" fill={num===null?'var(--sym-unknown)':c.stroke}/>
 {led(c,56,21,2.4)}
 <text x="56" y="95" textAnchor="middle" fontSize="10" fill="var(--sym-label)">{w.labelVisible!==false?w.label:''}{num!==null?' · %'+Math.round(ratio*100):''}</text>
</>;};

/* G04: surgulu vana. Kama dusey seyahat eder: acikta kapak (bonnet) icine cekilir, kapalida
 * govde ortasina (throat) iner. Faz yoksa eski `on` (acik/kapali) davranisi korunur. */
const gate:Renderer=(c)=>{const k=kit(c),vb=vbody(c),{on,phase}=c;
 const gy=phase==='open'?18:phase==='closed'?37:phase===null?(on?18:37):27;
 return <>
 {hpipe(c,6,23,44)}{hpipe(c,114,97,44)}
 <Body>
  <path {...vb} d="M23 30L60 44L23 58Z"/><path {...vb} d="M97 30L60 44L97 58Z"/>
  <rect {...k.b} x="51" y="15" width="18" height="18" rx="2"/>
 </Body>
 <rect {...k.p} className="zp zv" x="58.5" y="9" width="3" height={gy-8}/>
 <rect {...k.p} x="53.5" y={gy} width="13" height="12" rx="2"/>
 <ellipse {...k.p} cx="60" cy="7.5" rx="12" ry="2.6"/>
 {led(c,46,24,1.8)}
 {alarmDot(c,100,14)}
</>;};

/* G05: glob vana. Tikac `position` bagliysa oraya, degilse faza gore yukseklik degistirir. */
const globe:Renderer=(c)=>{const k=kit(c),{on,phase,readings}=c;
 const pos=readings.number.position;
 const lift=typeof pos==='number'?Math.max(0,Math.min(1,pos/100)):phase==='open'?1:phase==='closed'?0:phase===null?(on?1:0):0.5;
 const py=48-lift*18;
 return <>
 {hpipe(c,4,32,48)}{hpipe(c,116,88,48)}
 <Body>
  <ellipse {...vbody(c)} cx="60" cy="48" rx="29" ry="21"/>
  <rect {...k.b} x="50" y="12" width="20" height="16" rx="2"/>
 </Body>
 <path {...k.d} opacity={.85} d="M34 48h14q4 0 6-6M86 48H72q-4 0-6 6"/>
 <rect {...k.p} className="zp zv" x="58.5" y="12" width="3" height={Math.max(1,py-12)}/>
 <rect {...k.p} x="52" y={py-4} width="16" height="8" rx="3"/>
 <ellipse {...k.p} cx="60" cy="9" rx="13" ry="2.6"/>
 {led(c,64,20,1.8)}
 {alarmDot(c,96,18)}
</>;};

/* G06: uc yollu vana. Aile yok; baglar elle okunur. A yolu sol, B yolu alt; `position`
 * ikisini oranli kalinlastirir (karisim). */
const threeWay:Renderer=(c)=>{const k=kit(c),{w,stroke,active,readings}=c;const{bool,number}=readings;
 const bound=readings.anyBound,fault=bool.fault===true;
 const unk=bool.fault===null||bool.pathA===null||bool.pathB===null||number.position===null;
 const pos=typeof number.position==='number'?Math.max(0,Math.min(100,number.position)):null;
 const aOn=pos!==null?pos<100:bool.pathA===true,bOn=pos!==null?pos>0:bool.pathB===true;
 const grey=!bound||unk;
 const wA=grey?2:(pos!==null?2+((100-pos)/100)*3:(aOn?5:2)),wB=grey?2:(pos!==null?2+(pos/100)*3:(bOn?5:2));
 const colA=fault?'var(--sym-alarm)':grey?'var(--sym-unknown)':(aOn?w.color:'var(--sym-line)');
 const colB=fault?'var(--sym-alarm)':grey?'var(--sym-unknown)':(bOn?w.color:'var(--sym-line)');
 return <>
 {hpipe(c,6,44,52,6,false)}{hpipe(c,114,76,52,6,false)}{vpipe(c,96,68,60,6,false)}
 <path d="M10 52H44" stroke={colA} strokeWidth={wA} strokeLinecap="round"/>
 <path d="M60 70V92" stroke={colB} strokeWidth={wB} strokeLinecap="round"/>
 <Body><circle {...k.c} fill={fault?'var(--chip)':(bound&&!unk?w.color+'26':'var(--chip)')} cx="60" cy="52" r="18"/></Body>
 <path {...k.d} opacity={.8} d="M48 52H72M60 52V64"/>
 <circle {...k.p} cx="60" cy="52" r="3"/>
 {aOn&&!grey&&!fault&&<path d="M18 52L24 48L24 56Z" fill={w.color}/>}
 {bOn&&!grey&&!fault&&<path d="M60 86L56 80L64 80Z" fill={w.color}/>}
 {fault&&faultBadge(active||w.animated,96,40,7)}
 <path d="M76 52H110" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity=".5"/>
</>;};

/* HVAC damper: dikdortgen kanal kesiti; kanat acisi 0deg (kapali) - 90deg (acik). */
const damper:Renderer=(c)=>{const k=kit(c),{on,phase,readings}=c;
 const pos=readings.number.position;
 const openness=typeof pos==='number'?Math.max(0,Math.min(1,pos/100)):phase==='open'?1:phase==='closed'?0:phase===null?(on?1:0):0.5;
 const ang=openness*90,xs=[30,50,70,90];
 return <>
 {hpipe(c,4,11,50,6)}{hpipe(c,116,109,50,6)}
 <Body><rect {...k.b} x="10" y="20" width="100" height="60" rx="3"/></Body>
 <rect {...k.d} opacity={.9} x="16" y="26" width="88" height="48" rx="1.5"/>
 {xs.map(x=><rect key={x} {...vbody(c)} strokeWidth={1.4} x={x-2.5} y="28" width="5" height="44" rx="2" transform={`rotate(${ang} ${x} 50)`} style={{transition:'transform var(--motion-slow) var(--ease)'}}/>)}
 {xs.map(x=><circle key={'p'+x} {...k.p} cx={x} cy="50" r="1.8"/>)}
 {led(c,104,74,1.6)}
 {alarmDot(c,100,26)}
</>;};

export const renderers:Record<string,Renderer>={
 valve,'check-valve':checkValve,'butterfly-valve':butterfly,'ball-valve':ball,'solenoid-valve':solenoid,'control-valve':control,
 'gate-valve':gate,'globe-valve':globe,'three-way-valve':threeWay,damper,
};
