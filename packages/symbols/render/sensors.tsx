import type {Renderer} from './ctx';
import {kit,Body,led} from './kit';
/* 2026-11-18 sensor & otomasyon, "B · Endustriyel metal" dili. */
/* Pnomatik silindir: gomlek + kapaklar, piston kolu calisirken (on) disari cikar, iki uc
 * reed sensoru konumu gosterir (geri = sol, ileri = sag yanar). */
const cylinder:Renderer=(c)=>{const k=kit(c),{w,on}=c;return <>
 <Body>
  <rect {...k.b} x="12" y="28" width="56" height="26" rx="3"/>
  <rect {...k.p} className="zp zv" x="9" y="26" width="7" height="30" rx="1.5"/>
  <rect {...k.p} className="zp zv" x="64" y="26" width="7" height="30" rx="1.5"/>
 </Body>
 <rect {...k.p} className="zp zv" x="20" y="21" width="6" height="7"/><rect {...k.p} className="zp zv" x="54" y="21" width="6" height="7"/>
 <g style={{transform:`translateX(${on?14:0}px)`,transition:w.animated?'transform var(--motion-slow) var(--ease)':undefined}}>
  <rect {...k.p} x="30" y="38" width="45" height="6" rx="2"/>
  <rect {...k.c} x="24" y="31" width="7" height="20" rx="1.5"/>
  <rect {...k.b} x="74" y="34" width="5" height="14" rx="1.5"/>
 </g>
 <rect x="28" y="54" width="8" height="5" rx="1" fill={!on?c.stroke:'var(--chip)'} stroke={c.stroke} strokeWidth="1"/>
 <rect x="48" y="54" width="8" height="5" rx="1" fill={on?c.stroke:'var(--chip)'} stroke={c.stroke} strokeWidth="1"/>
 <path {...k.x} d="M14 66h56M20 59v7M60 59v7"/>
</>;};

/* Endustriyel yaklasim sensoru (M18): disli govde, iki somun, algilama yuzu, arka LED, kablo;
 * algiladiginda (on) dalgalar dolu, aksi halde kesik. */
const proximity:Renderer=(c)=>{const k=kit(c),{on,active}=c;return <>
 <path {...k.x} strokeWidth={3} d="M4 43H20"/>
 <Body>
  <rect {...k.b} x="19" y="37" width="9" height="12" rx="2"/>
  <rect {...k.b} x="27" y="34" width="45" height="18" rx="2"/>
  <rect {...k.p} className="zp zv" x="34" y="30" width="6" height="26" rx="1"/>
  <rect {...k.p} className="zp zv" x="58" y="30" width="6" height="26" rx="1"/>
  <rect {...k.c} x="72" y="35" width="7" height="16" rx="2"/>
 </Body>
 <path {...k.d} d="M43 34v18M47 34v18M51 34v18M55 34v18"/>
 {led(c,23.5,43,2)}
 <path d="M84 33Q93 43 84 53M92 27Q106 43 92 59" fill="none" stroke={c.stroke} strokeWidth="2" strokeLinecap="round" strokeDasharray={on?undefined:'3 3'} className={active?'glow':undefined}/>
</>;};

/* Fotosel: verici govdesi + mercek, isin (calisirken akar), reflektor. */
const photoelectric:Renderer=(c)=>{const k=kit(c),{w,on,active}=c;return <>
 <Body>
  <rect {...k.b} x="16" y="18" width="28" height="50" rx="4"/>
  <rect {...k.b} x="92" y="22" width="12" height="32" rx="2"/>
 </Body>
 <circle {...k.c} cx="30" cy="35" r="8"/>
 <circle cx="30" cy="35" r="3" fill={on?w.color:'var(--chip)'}/>
 <path {...k.d} d="M94 26l8 6-8 6 8 6-8 6"/>
 <path d="M46 35H90" stroke={on?w.color:c.stroke} strokeWidth="2" strokeLinecap="round" strokeDasharray="5 3" opacity={on?.9:.5} className={active?'flow':undefined}/>
 {led(c,30,58,2.4)}
 <path {...k.x} d="M18 73h26"/>
</>;};

/* PLC modulu: govde, klemens seritleri, ekran, RUN/STOP + I/O LED'leri. */
const plc:Renderer=(c)=>{const k=kit(c),{on,unknown}=c;return <>
 <Body><rect {...k.b} x="30" y="4" width="60" height="73" rx="4"/></Body>
 <rect {...k.p} x="34" y="8" width="52" height="8" rx="1.5"/>
 <rect {...k.p} x="34" y="64" width="52" height="8" rx="1.5"/>
 {[40,48,56,64,72,80].map(x=><g key={x}><circle {...k.d} opacity={1} cx={x} cy="12" r="1.8"/><circle {...k.d} opacity={1} cx={x} cy="68" r="1.8"/></g>)}
 <rect className="zdial" x="36" y="21" width="48" height="16" rx="2" fill="var(--chip)" stroke={c.stroke} strokeWidth="1" strokeOpacity=".5"/>
 <text className="zt" x="60" y="33" textAnchor="middle" fill="var(--txt-soft)" fontSize="10" fontWeight="700">PLC</text>
 {led(c,40,45,2.4)}
 <text className="zt" x="46" y="48" fontSize="7" fill="var(--sym-label)">{unknown?'?':on?'RUN':'STOP'}</text>
 {[0,1,2,3,4,5,6,7].map(i=><rect key={i} x={38+i*6} y="53" width="4" height="4" rx="1" fill={on&&i%3!==2?c.stroke:'var(--chip)'} stroke={c.stroke} strokeWidth=".8" strokeOpacity=".6"/>)}
</>;};

/* Tartim platformu: platform plakasi, yuk hucreleri, sase, gosterge (deger + birim). */
const weighing:Renderer=(c)=>{const k=kit(c),{w,num}=c;return <>
 <Body>
  <path {...k.b} d="M18 30L30 15H90L102 30Z"/>
  <rect {...k.b} x="20" y="38" width="80" height="7" rx="1.5"/>
 </Body>
 <rect {...k.p} className="zp zv" x="27" y="30" width="8" height="8"/><rect {...k.p} className="zp zv" x="85" y="30" width="8" height="8"/>
 <path {...k.d} d="M34 22h52"/>
 <rect className="zdial" x="27" y="52" width="66" height="25" rx="4" fill="var(--chip)" stroke={c.stroke} strokeWidth="1.4"/>
 <text className="zt" x="60" y="69" textAnchor="middle" fill={num===null?'var(--sym-unknown)':w.color} fontSize="12" fontWeight="700" fontFamily="Consolas,monospace">{num===null?'—':(w.decimals>=0?num.toFixed(w.decimals):String(num))}{w.unit?' '+w.unit:''}</text>
 <path {...k.x} d="M60 45v7"/>
</>;};

export const renderers:Record<string,Renderer>={cylinder,proximity,photoelectric,plc,weighing};
