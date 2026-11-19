import type {Renderer} from './ctx';
import {kit,Body} from './kit';
/* 2026-11-18 buton & anahtar, "B · Endustriyel metal" dili: metal cerceve (bezel), renkli
 * basma yuzu ustunde durum yazisi. Bu grubun renkleri kullanicinin bilincli secimidir
 * (ISA-101 dokunmaz). Hareketler ortak --motion / --ease ile. */
const tr='all var(--motion) var(--ease)';
const pushButton:Renderer=(c)=>{const k=kit(c),{w,value,good}=c;
 const pressed=good&&typeof value==='boolean'?value:false,col=!good?'var(--sym-unknown)':pressed?w.color:(w.offColor||'#64748b'),cy=pressed?42:40;
 return <>
  <Body><circle {...k.b} cx="60" cy="42" r="30"/></Body>
  <circle {...k.d} opacity={.8} cx="60" cy="42" r="25"/>
  <circle cx="60" cy={cy+2} r="21" fill="#000" opacity=".18"/>
  <circle cx="60" cy={cy} r="21" fill={col} fillOpacity={pressed?1:.2} stroke={col} strokeWidth="2.2" style={{transition:w.animated?tr:undefined}}/>
  <path d={`M47 ${cy-8}a16 16 0 0 1 14-9`} fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round"/>
  <text x="60" y={cy+4} textAnchor="middle" fontSize="10" fontWeight="700" fill={pressed?'#fff':col}>{!good?'?':pressed?(w.onText||'AÇIK'):(w.offText||'KAPALI')}</text>
  {w.labelVisible!==false&&<text x="60" y="90" textAnchor="middle" fontSize={w.fontSize||10} fill="var(--sym-label)">{w.label}</text>}
 </>;};
const toggleSwitch:Renderer=(c)=>{const k=kit(c),{w,value,good}=c;
 const known=good&&typeof value==='boolean',state=known&&value,col=known?(state?w.color:(w.offColor||'#94a3b8')):'var(--sym-unknown)';
 return <>
  <Body><rect {...k.b} x="15" y="25" width="90" height="38" rx="19"/></Body>
  <rect x="20" y="30" width="80" height="28" rx="14" fill={col} fillOpacity={state?.85:.15} stroke={col} strokeWidth="1.6"/>
  <g style={{transform:`translateX(${state?52:0}px)`,transition:w.animated?'transform var(--motion) var(--ease)':undefined}}>
   <circle cx="34" cy="46" r="12" fill="#000" opacity=".15"/>
   <circle {...k.b} cx="34" cy="44" r="12"/>
   <circle {...k.d} cx="34" cy="44" r="7"/>
  </g>
  <text x={state?46:76} y="48" textAnchor="middle" fontSize="10" fontWeight="700" fill={state?'#fff':col}>{!known?'?':state?(w.onText||'AÇIK'):(w.offText||'KAPALI')}</text>
  {w.labelVisible!==false&&<text x="60" y="86" textAnchor="middle" fontSize={w.fontSize||10} fill="var(--sym-label)">{w.label}</text>}
 </>;};
const keySwitch:Renderer=(c)=>{const k=kit(c),{w,value,good}=c;
 const known=good&&typeof value==='boolean',state=known&&value,col=known?(state?w.color:(w.offColor||'var(--sym-idle)')):'var(--sym-unknown)';
 return <>
  <Body><circle {...k.b} cx="60" cy="42" r="28"/></Body>
  <circle className="zdial" cx="60" cy="42" r="20" fill="var(--chip)" stroke={col} strokeWidth="1.8"/>
  <path d="M42 26l4 4M78 26l-4 4" stroke="var(--sym-label)" strokeWidth="1.6" strokeLinecap="round"/>
  <g transform={`rotate(${state?45:-45} 60 42)`} style={{transition:w.animated?'transform var(--motion) var(--ease)':undefined}}>
   <rect {...k.p} x="56.5" y="26" width="7" height="22" rx="2.5"/>
   <circle {...k.b} cx="60" cy="54" r="6.5"/>
   <path d="M60 30v12" stroke={col} strokeWidth="2" strokeLinecap="round"/>
  </g>
  <text x="32" y="20" fontSize="9" fontWeight="700" fill="var(--sym-label)">0</text><text x="84" y="20" fontSize="9" fontWeight="700" fill="var(--sym-label)">1</text>
  <text x="60" y="82" textAnchor="middle" fill={col} fontSize="9" fontWeight="700">{!known?'BİLİNMİYOR':state?(w.onText||'AÇIK'):(w.offText||'KAPALI')}</text>
  {w.labelVisible!==false&&<text x="60" y="95" textAnchor="middle" fontSize={w.fontSize||9} fill="var(--sym-label)">{w.label}</text>}
 </>;};
/* HTML buton / ekran gecisi. Baslik gizliyse bos blok kalmasin: eylem yazisi (Ac/Kapat
 * metni) gosterilir; ekran gecisinde ok isareti her zaman vardir. */
const button:Renderer=(c)=>{const{w,value,good}=c;
 if(w.type==='button'&&w.action==='toggle')return {html:<div className="symbol-button" style={{background:good&&typeof value==='boolean'?(value?w.color:w.offColor||'#64748b'):'var(--sym-unknown)',fontSize:w.fontSize||undefined}}>{good&&typeof value==='boolean'?(value?w.onText:w.offText):'BİLİNMİYOR'}</div>};
 const caption=w.labelVisible!==false&&w.label?w.label:w.type==='navigation'?'Ekran':(w.action==='off'?w.offText:w.onText)||'';
 return {html:<div className={'symbol-button '+(w.action==='off'?'secondary':'')} style={{...(w.action!=='off'?{background:w.color}:{}),fontSize:w.fontSize||undefined}}>{w.type==='navigation'?'↗ ':''}{caption}</div>};};
export const renderers:Record<string,Renderer>={'push-button':pushButton,'toggle-switch':toggleSwitch,'key-switch':keySwitch,button,navigation:button};
