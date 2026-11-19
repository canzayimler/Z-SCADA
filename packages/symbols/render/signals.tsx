import type {Renderer} from './ctx';
import {kit,Body} from './kit';
/* 2026-11-18 lamba & sinyal, "B · Endustriyel metal" dili: metal yuva (bezel), renkli lens
 * ve parlama izi. Lens rengi kullanicinin secimidir (ISA-101 dokunmaz); Detayli yalniz yuvayi
 * metal yapar. Yanan lens ortak `glow`/`blink` sinifiyla hareket eder. */
const shine=(d:string)=><path d={d} fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="1.8" strokeLinecap="round"/>;
const statusText=(x:number,y:number,fill:string,text:string,size=10)=><text x={x} y={y} textAnchor="middle" fill={fill} fontSize={size} fontWeight="700">{text}</text>;

const indicator:Renderer=(c)=>{const k=kit(c),{w,on,unknown,active,stroke,parts,partIndex,state}=c;
 const p=parts.length?parts[partIndex]:undefined;
 const lit=parts.length?!!p:on,col=parts.length?(p?.color||'var(--sym-idle)'):stroke;
 const text=parts.length?(!state.known?'BİLİNMİYOR':p?.label||'EŞLEŞME YOK'):unknown?'BİLİNMİYOR':on?'AÇIK':'KAPALI';
 return <>
  <Body><circle {...k.b} cx="60" cy="36" r="22"/></Body>
  <circle {...k.d} opacity={.7} cx="60" cy="36" r="18.5"/>
  {lit&&<circle cx="60" cy="36" r="18" fill={col} opacity=".22"/>}
  <circle cx="60" cy="36" r="13.5" fill={lit?col:'var(--chip)'} stroke={col} strokeWidth="2" className={lit&&(parts.length?w.animated:active)?'glow':undefined}/>
  {lit&&shine('M51 31a10 10 0 0 1 7-5')}
  {statusText(60,74,parts.length?col:unknown?'var(--warn-text)':on?w.color:'var(--sym-idle)',text)}
 </>;};
const lampSquare:Renderer=(c)=>{const k=kit(c),{w,on,unknown,stroke,parts,partIndex,state}=c;
 const p=parts.length?parts[partIndex]:undefined,col=parts.length?(p?.color||'var(--sym-idle)'):stroke;
 const lit=parts.length?!!p:on,text=parts.length?(!state.known?'BİLİNMİYOR':p?.label||'EŞLEŞME YOK'):unknown?'BİLİNMİYOR':on?'AÇIK':'KAPALI';
 return <>
  <path {...k.x} d="M42 62v6M78 62v6"/>
  <Body><rect {...k.b} x="30" y="10" width="60" height="52" rx="8"/></Body>
  <rect x="37" y="17" width="46" height="38" rx="4" fill={lit?col:'var(--chip)'} stroke={lit?col:c.line} strokeWidth="2" className={lit&&w.animated?'glow':undefined}/>
  {lit&&shine('M42 30V23h7')}
  {statusText(60,80,lit?col:'var(--sym-idle)',text)}
 </>;};
const bulb:Renderer=(c)=>{const k=kit(c),{w,on,unknown,stroke,active}=c;return <>
 <path d="M60 8A24 24 0 0 1 75 50C72 53 71 55 71 58L49 58C49 55 48 53 45 50A24 24 0 0 1 60 8Z" fill={on?w.color+'33':'var(--chip)'} stroke={stroke} strokeWidth="2.2" strokeLinejoin="round"/>
 {on&&<circle cx="60" cy="31" r="15" fill={w.color} opacity=".25" className={active?'glow':undefined}/>}
 <path d="M51 27C55 35 65 35 69 27M60 32V50" fill="none" stroke={on?w.color:'var(--sym-idle)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={active?'glow':undefined}/>
 {shine('M49 22a13 13 0 0 1 7-9')}
 <Body><rect {...k.p} x="48" y="58" width="24" height="6" rx="1.5"/><rect {...k.p} x="49" y="64" width="22" height="6" rx="1.5"/><path {...k.b} d="M52 70h16l-3 6h-10z"/></Body>
 {on&&<g fill="none" stroke={w.color} strokeWidth="2" strokeLinecap="round" className={active?'glow':undefined}><path d="M20 16L27 22M100 16L93 22M14 40H24M106 40H96"/></g>}
 {statusText(60,92,unknown?'var(--warn-text)':on?w.color:'var(--sym-idle)',unknown?'BİLİNMİYOR':on?'AÇIK':'KAPALI',9)}
 {w.labelVisible!==false&&<text x="60" y="99" textAnchor="middle" fontSize={w.fontSize||8} fill="var(--sym-label)">{w.label}</text>}
</>;};
const beacon:Renderer=(c)=>{const k=kit(c),{w,on,unknown,stroke,active}=c;return <>
 <Body><rect {...k.b} x="34" y="62" width="52" height="10" rx="2"/><path {...k.b} d="M42 72h36l-3 6H45z"/></Body>
 <path d="M38 62V38A22 22 0 0 1 82 38V62Z" fill={on?w.color+'30':'var(--chip)'} stroke={stroke} strokeWidth="2.2" strokeLinejoin="round"/>
 {on&&<g fill="none" stroke={w.color} strokeWidth="2" strokeLinecap="round" opacity=".85"><path d="M26 24L20 18M94 24L100 18M20 44H13M100 44H107"/></g>}
 <g className={active?'rotor':undefined} style={{transformOrigin:'60px 46px'}}>{on&&<path d="M60 46L45 32M60 46L75 60" fill="none" stroke={w.color} strokeWidth="2.2" strokeLinecap="round" opacity=".7"/>}</g>
 <circle cx="60" cy="46" r="8" fill={on?w.color:'var(--chip)'} stroke={on?w.color:c.line} strokeWidth="2" className={on&&w.animated?'blink':undefined}/>
 {shine('M45 36a16 16 0 0 1 8-10')}
 {statusText(60,93,unknown?'var(--warn-text)':on?w.color:'var(--sym-idle)',unknown?'BİLİNMİYOR':on?'AKTİF':'KAPALI',9)}
 {w.labelVisible!==false&&<text x="60" y="100" textAnchor="middle" fontSize={w.fontSize||8} fill="var(--sym-label)">{w.label}</text>}
</>;};
const ledBar:Renderer=(c)=>{const k=kit(c),{w,num,ratio}=c;const n=10,lit=num===null?-1:Math.round(ratio*n);return <>
 <Body><rect {...k.b} x="6" y="24" width="108" height="34" rx="7"/></Body>
 <rect className="zdial" x="10" y="28" width="100" height="26" rx="4" fill="var(--chip)" opacity=".9"/>
 {Array.from({length:n},(_,i)=><rect key={i} x={13+i*9.8} y="31" width="7" height="20" rx="2" fill={i<lit?w.color:'var(--chip)'} stroke={i<lit?w.color:c.line} strokeWidth="1.4" className={i===lit-1&&w.animated?'glow':undefined}/>)}
 <text x="60" y="74" textAnchor="middle" fill={num===null?'var(--sym-unknown)':w.color} fontSize="12" fontWeight="700" fontFamily="Consolas,monospace">{num===null?'—':Math.round(ratio*100)+'%'}</text>
 {w.labelVisible!==false&&<text x="60" y="93" textAnchor="middle" fontSize={w.fontSize||9} fill="var(--sym-label)">{w.label}</text>}
</>;};
const towerLight:Renderer=(c)=>{const k=kit(c),{w,stroke,parts,lit,partsReady}=c;const n=Math.max(1,parts.length||1),sh=(50-3*(n-1))/n;return <>
 <Body>
  <rect {...k.b} x="47" y="8" width="26" height="5" rx="2"/>
  <rect {...k.b} x="50" y="64" width="20" height="8" rx="2"/>
  <rect {...k.p} className="zp zv" x="57" y="72" width="6" height="5"/>
  <rect {...k.b} x="47" y="76" width="26" height="3.5" rx="1.5"/>
 </Body>
 {Array.from({length:n},(_,i)=>{const on=lit(i),col=parts[i]?.color||w.color,y=13+i*(sh+3);
  return <g key={i}><rect x="48" y={y} width="24" height={sh} rx={Math.min(3,sh/3)} fill={on?col:col+'2a'} stroke={on?col:c.line} strokeWidth="1.4" className={on&&w.animated?'blink':undefined}><title>{parts[i]?.label||''}</title></rect>
   {on&&<path d={`M51 ${y+3}v${Math.max(2,sh-6)}`} stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round"/>}</g>;})}
 {!partsReady&&<path d="M47 63h26" stroke={stroke} strokeWidth="1.6" strokeDasharray="3 2"/>}
</>;};
const emergencyStop:Renderer=(c)=>{const{on,active}=c;return <>
 <g className="zbody"><circle cx="60" cy="40" r="30" fill="#f2c230" fillOpacity={on?1:.55} stroke={on?'var(--sym-alarm)':'var(--sym-idle)'} strokeWidth="2.2"/></g>
 <circle cx="60" cy="42" r="21" fill="#000" opacity=".18"/>
 <circle cx="60" cy="40" r="21" fill="var(--sym-alarm)" fillOpacity={on?1:.3} stroke="var(--sym-alarm)" strokeWidth="2" className={active?'blink':undefined}/>
 <path d="M47 33a15 15 0 0 1 10-9" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round"/>
 <text x="60" y="44" textAnchor="middle" fontSize="11" fontWeight="700" fill={on?'#fff':'var(--sym-alarm)'}>STOP</text>
 <text x="60" y="79" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--txt-muted)">DURUM GÖSTERGESİ</text>
</>;};
const selector:Renderer=(c)=>{const k=kit(c),{w,parts,partIndex}=c;const n=Math.max(2,parts.length||2);
 const span=Math.min(240,80*(n-1)),angle=(i:number)=>(-span/2+span*(i/(n-1)))*Math.PI/180;
 const point=(i:number,r:number)=>[60+Math.sin(angle(i))*r,40-Math.cos(angle(i))*r] as const;
 const active=partIndex,known=active>=0,col=known?(parts[active]?.color||w.color):'var(--sym-idle)';
 const deg=known?(-span/2+span*(active/(n-1))):0;
 return <>
  <Body><circle {...k.b} cx="60" cy="40" r="22"/></Body>
  <circle className="zdial" cx="60" cy="40" r="16" fill="var(--chip)" stroke={known?col:'var(--sym-unknown)'} strokeWidth="2"/>
  {Array.from({length:n},(_,i)=>{const [tx,ty]=point(i,31),[dx,dy]=point(i,19.5);
   return <g key={i}><circle cx={dx} cy={dy} r={i===active?2.4:1.6} fill={i===active?col:'var(--chip)'} stroke={i===active?col:'var(--sym-idle)'} strokeWidth="1.2"/>
    <text x={tx} y={ty+3} textAnchor="middle" fontSize="8" fontWeight={i===active?'700':'400'} fill={i===active?col:'var(--sym-label)'}>{parts[i]?.label||String(i)}</text></g>;})}
  <g style={{transform:`rotate(${deg}deg)`,transformOrigin:'60px 40px',transition:'transform var(--motion) var(--ease)'}} opacity={known?1:.55}>
   <rect {...k.p} x="56.5" y="25" width="7" height="30" rx="3"/>
   <path d="M60 27v8" stroke={known?col:'var(--sym-unknown)'} strokeWidth="2.4" strokeLinecap="round" strokeDasharray={known?undefined:'2 2'}/>
  </g>
 </>;};
const multiState:Renderer=(c)=>{const{w,parts,partIndex,partsReady}=c;const p=partIndex>=0?parts[partIndex]:undefined;
 return {html:<div className={'symbol-state '+(p&&w.animated?'live':'')} style={p?{borderColor:p.color,color:p.color,background:p.color+'14'}:undefined}>
  <span className="state-dot" style={p?{background:p.color}:undefined}/>
  <strong>{p?(p.label||'—'):partsReady?'—':'BİLİNMİYOR'}</strong>
  {w.labelVisible!==false&&<small style={{fontSize:w.fontSize||undefined}}>{w.label}</small>}</div>};};
export const renderers:Record<string,Renderer>={indicator,'lamp-square':lampSquare,bulb,beacon,'led-bar':ledBar,'tower-light':towerLight,'emergency-stop':emergencyStop,selector,'multi-state':multiState};
