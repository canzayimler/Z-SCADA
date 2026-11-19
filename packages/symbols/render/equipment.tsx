import type {Renderer,SymbolCtx} from './ctx';
import {kit,Body,led,spin,flowLine,hpipe,vpipe,impeller,faultBadge} from './kit';
/* 2026-11-18 "B · Endustriyel metal" sembol dili: her ekipmanin kendi silueti var
 * (motor = kanatli govde + klemens kutusu + mil, pompa = salyangoz govde, kompresor
 * = dokum govde + daralan kanal...). Ayni geometri Klasik/ISA-101/Detayli'da cizilir;
 * kaplama siniflari kit.tsx'te. Kurallar:
 *  - Baglanti agizlari (katalogdaki port koordinatlari) DEGISMEZ: boru saplari tam
 *    port noktasinda biter.
 *  - Cizim content.ts'teki olculmus kutunun ICINDE kalir (kirpilmis goruntu kutusu ve
 *    dolayisiyla ekrandaki agiz konumlari degismesin diye; tests/frame-fit.test.ts).
 *  - Durum: calisirken cark doner (ortak .rotor), boruda akis akar (.flow), durum isigi
 *    yanar; durdu = ayni cizim, isik sonuk renkte. */
/* Eski imzali agiz cizimi (stroke bazli); yeni cizimler kit.tsx'teki hpipe/vpipe'i kullanir. */
export const nozzle=(stroke:string,active:boolean,reverse:boolean,x1:number,x2:number,y:number,_fx?:number)=><><path className="zp" d={`M${Math.min(x1,x2)} ${y-5}H${Math.max(x1,x2)}V${y+5}H${Math.min(x1,x2)}Z`} fill="var(--sym-body)" stroke={stroke} strokeWidth="1.6"/>{active&&<path className="flow" d={`M${Math.min(x1,x2)+1} ${y}H${Math.max(x1,x2)-1}`} stroke={stroke} strokeWidth="2" strokeDasharray="5 3" opacity=".9" style={{animationDirection:reverse?'reverse':'normal'}}/>}</>;
export const vnozzle=(stroke:string,active:boolean,reverse:boolean,x:number,y1:number,y2:number,_fy?:number,hw=5)=><><path className="zp zv" d={`M${x-hw} ${Math.min(y1,y2)}V${Math.max(y1,y2)}H${x+hw}V${Math.min(y1,y2)}Z`} fill="var(--sym-body)" stroke={stroke} strokeWidth="1.6"/>{active&&<path className="flow" d={`M${x} ${Math.min(y1,y2)+1}V${Math.max(y1,y2)-1}`} stroke={stroke} strokeWidth="2" strokeDasharray="5 3" opacity=".9" style={{animationDirection:reverse?'reverse':'normal'}}/>}</>;

/* --- Motor: kanatli govde, fan kapagi, klemens kutusu, mil + donen kaplin, ayaklar. */
const motor=(c:SymbolCtx)=>{const k=kit(c);return <>
 <Body>
  <path {...k.b} d="M42 22h-5a3 3 0 0 0-3 3v30a3 3 0 0 0 3 3h5z"/>
  <path {...k.b} d="M46 59h12l3 7H43zM70 59h12l3 7H67z"/>
  <rect {...k.b} x="42" y="18" width="46" height="42" rx="5"/>
  <rect {...k.b} x="54" y="6" width="20" height="12" rx="2"/>
  <rect {...k.p} x="88" y="36.5" width="6" height="7"/>
 </Body>
 <path {...k.d} d="M48 26h34M48 32h34M48 38h34M48 44h34M48 50h34M37.5 30v20"/>
 {led(c,64,12)}
 {spin(c,96,40,<><circle {...k.p} cx="96" cy="40" r="5.5"/><path {...k.d} opacity={1} d="M96 35.5v9M91.5 40h9"/></>)}
 <path {...k.x} d="M38 69.5h58"/>
</>;};

/* --- Pompa govde varyantlari. Emme (3,38) solda, basma (117,35) sagda. */
const pump=(c:SymbolCtx)=>{const k=kit(c),v=c.variant;
 if(v==='vacuum')return <>
  {hpipe(c,3,37,38)}{hpipe(c,117,83,35)}
  <Body><path {...k.b} d="M44 71l5-7h22l5 7z"/><circle {...k.c} cx="60" cy="40" r="24"/></Body>
  <circle {...k.d} cx="60" cy="40" r="19"/>
  {spin(c,56,44,<><circle {...k.b} cx="56" cy="44" r="12"/>{[0,45,90,135].map(a=><path key={a} {...k.d} opacity={1} d="M44 44h24" transform={`rotate(${a} 56 44)`}/>)}</>)}
  {led(c,56,44,3.2)}
  <path {...k.x} d="M38 71.5h44"/>
 </>;
 if(v==='submersible')return <>
  <path {...k.d} d="M8 18q5-3.5 10 0t10 0M92 18q5-3.5 10 0t10 0"/>
  {hpipe(c,3,47,38)}{hpipe(c,117,73,35)}
  <Body>
   <rect {...k.b} x="48" y="45" width="24" height="25" rx="6"/>
   <rect {...k.c} x="45" y="24" width="30" height="22" rx="5"/>
  </Body>
  <path {...k.d} d="M52 52h16M52 57h16M52 62h16"/>
  {impeller(c,60,35,8)}
  {led(c,60,66,2.4)}
 </>;
 if(v==='dosing')return <>
  {hpipe(c,3,47,38)}{hpipe(c,117,73,35)}
  <Body>
   <rect {...k.p} x="57" y="25" width="6" height="4"/>
   <rect {...k.b} x="46" y="14" width="28" height="12" rx="2"/>
   <path {...k.b} d="M46 70l5-6h18l5 6z"/>
   <circle {...k.c} cx="60" cy="42" r="14"/>
  </Body>
  <path {...k.d} d="M56 31q-5 11 0 22"/>
  {spin(c,52,20,<><circle {...k.d} opacity={1} cx="52" cy="20" r="3.5"/><path {...k.d} opacity={1} d="M52 20h3.5"/></>)}
  {led(c,68,20,2.4)}
  <path {...k.x} d="M40 70.5h40"/>
 </>;
 // santrifuj (varsayilan): salyangoz govde, teget basma, ici donen cark.
 return <>
  {hpipe(c,3,31,38)}{hpipe(c,117,78,35)}
  <Body><path {...k.b} d="M42 71l5-6h14l5 6z"/><path {...k.c} d="M54 18H78V42A24 24 0 1 1 54 18Z"/></Body>
  <circle {...k.d} cx="54" cy="42" r="17"/>
  {spin(c,54,42,<path {...k.d} opacity={1} d="M54 42q9-3 10-13M54 42q-2 9 7 15M54 42q-8-6-17-2"/>)}
  {led(c,54,42,3.6)}
  <path {...k.x} d="M36 71.5h36"/>
 </>;
};

/* --- Kompresor: genel (dokum govde + daralan kanal), vidali (iki rotor), pistonlu. */
const compressor=(c:SymbolCtx)=>{const k=kit(c),v=c.variant;
 if(v==='screw')return <>
  {hpipe(c,4,28,40)}{hpipe(c,115,92,40,4)}
  <Body>
   <path {...k.b} d="M38 71l4-6h36l4 6z"/>
   <rect {...k.b} x="48" y="14" width="24" height="8" rx="2"/>
   <rect {...k.c} x="28" y="21" width="64" height="44" rx="12"/>
  </Body>
  {spin(c,48,43,<><circle {...k.b} cx="48" cy="43" r="11"/><path {...k.d} opacity={1} d="M40 37q8 6 16 0M40 43q8 6 16 0M40 49q8 6 16 0"/></>)}
  {spin(c,72,43,<><circle {...k.b} cx="72" cy="43" r="11"/><path {...k.d} opacity={1} d="M64 37q8-6 16 0M64 43q8-6 16 0M64 49q8-6 16 0"/></>)}
  {led(c,60,18,2)}
 </>;
 if(v==='piston')return <>
  {hpipe(c,4,50,40)}{hpipe(c,115,70,40,4)}
  <Body>
   <rect {...k.b} x="40" y="50" width="40" height="18" rx="4"/>
   <rect {...k.c} x="50" y="18" width="20" height="33" rx="2"/>
   <rect {...k.b} x="47" y="14" width="26" height="6" rx="1.5"/>
  </Body>
  <path {...k.d} d="M53 24h14M53 28h14M53 32h14"/>
  {spin(c,60,59,<><circle {...k.p} cx="60" cy="59" r="6"/><path {...k.d} opacity={1} d="M60 59l4-4"/></>)}
  {led(c,74,59,2.4)}
  <path {...k.x} d="M36 71h48"/>
 </>;
 return <>
  {hpipe(c,4,35,40)}{hpipe(c,115,85,40,4)}
  <Body><path {...k.b} d="M40 72l5-7h30l5 7z"/><circle {...k.c} cx="60" cy="41" r="26"/></Body>
  <path {...k.d} opacity={.85} d="M37 29L84 36M37 53L84 46"/>
  {spin(c,60,41,<path {...k.d} opacity={1} d="M60 32v18M51 41h18"/>)}
  {led(c,60,41,3.4)}
 </>;
};

/* --- Fan: halka govde, dort kanat, ortada durum isigi, ayak. */
const fan=(c:SymbolCtx)=>{const k=kit(c);return <>
 <Body><path {...k.b} d="M50 71l4-8h12l4 8z"/><circle {...k.b} cx="60" cy="38" r="29"/></Body>
 <circle {...k.d} cx="60" cy="38" r="24"/>
 {spin(c,60,38,<>{[0,90,180,270].map(a=><path key={a} {...k.b} strokeWidth={1.4} transform={`rotate(${a} 60 38)`} d="M60 38C53 30 54 19 61 16C67 21 66 31 60 38Z"/>)}</>,true)}
 {led(c,60,38,4)}
 <path {...k.x} d="M42 71.5h36"/>
</>;};

/* --- Konveyor: bantli (varsayilan), rulolu, helezon, kovali elevator (egik). Hepsi ayni
 * olculmus kutuya (8..112 x 28..66) sigar. Faz (calisiyor/ters/sikisma) Symbol.tsx'ten. */
const conveyor=(c:SymbolCtx)=>{const k=kit(c),v=c.variant;
 const pulley=(cx:number,cy=41,r=7)=>spin(c,cx,cy,<><circle {...k.p} cx={cx} cy={cy} r={r}/><path {...k.d} opacity={1} d={`M${cx-r+2} ${cy}h${2*r-4}M${cx} ${cy-r+2}v${2*r-4}`}/></>,true);
 if(v==='roller')return <>
  <Body><rect {...k.b} x="12" y="44" width="96" height="7" rx="2"/></Body>
  {[20,32,44,56,68,80,92,104].map(x=><g key={x}>{spin(c,x,38,<><circle {...k.p} cx={x} cy="38" r="5"/><path {...k.d} opacity={1} d={`M${x-3} 38h6`}/></>)}</g>)}
  {flowLine(c,'M16 30.5H104')}
  <path {...k.x} d="M30 51l-3 13M90 51l3 13M20 65h76"/>
  <rect {...k.b} x="98" y="54" width="13" height="9" rx="2"/>{led(c,104.5,58.5,2.2)}
 </>;
 if(v==='screw')return <>
  <Body>
   <path {...k.b} d="M14 32h8v-3h14v3h62v15a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z"/>
   <rect {...k.b} x="98" y="35" width="13" height="16" rx="2"/>
   <rect {...k.p} x="80" y="55" width="8" height="6"/>
  </Body>
  <path {...k.d} d="M20 43H96"/>
  <path {...k.o} strokeWidth={1.8} d="M24 43q4-9 8 0t8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0" className={c.active?'zo flow':'zo'} strokeDasharray={c.active?'6 2':undefined} style={{animationDirection:c.w.reverse?'reverse':'normal'}}/>
  {led(c,104.5,43,2.4)}
  <path {...k.x} d="M24 55v10M70 55v10M18 65.5h64"/>
 </>;
 if(v==='bucket'){
  /* Egik kovali elevator: alt (18,58) ve ust (102,34) makara, ust kolda kovalar. */
  const ux=.961,uy=-.275,nx=.275,ny=.961;
  const at=(t:number,a:number,b:number)=>{const px=18+84*t-6*nx,py=58-24*t-6*ny;return [px+a*ux-b*nx,py+a*uy-b*ny];};
  const cup=(t:number)=>{const p=[at(t,0,0),at(t,7,0),at(t,6,4.5),at(t,1,4.5)];return 'M'+p.map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join('L')+'Z';};
  const a0=at(0,0,0),a1=at(1,0,0),b0=[18+6*nx,58+6*ny],b1=[102+6*nx,34+6*ny];
  const seg=(p:number[],q:number[])=>`M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  return <>
   <Body><rect {...k.b} x="98" y="45" width="13" height="10" rx="2"/></Body>
   <path {...k.o} strokeWidth={1.8} d={seg(a0,a1)+seg(b0,b1)}/>
   {flowLine(c,seg(a0,a1))}
   {[.18,.42,.66].map(t=><path key={t} {...k.c} strokeWidth={1.4} d={cup(t)}/>)}
   {pulley(18,58,6)}{pulley(102,34,6)}
   {led(c,104.5,50,2.2)}
   <path {...k.x} d="M14 65.5h22"/>
  </>;
 }
 return <>
  <Body>
   <path {...k.b} d="M20 32H100A9 9 0 0 1 100 50H20A9 9 0 0 1 20 32Z"/>
   <rect {...k.b} x="98" y="53" width="13" height="10" rx="2"/>
  </Body>
  <circle {...k.d} cx="40" cy="41" r="2.6"/><circle {...k.d} cx="60" cy="41" r="2.6"/><circle {...k.d} cx="80" cy="41" r="2.6"/>
  {flowLine(c,'M24 32H96')}
  {pulley(20)}{pulley(100)}
  {led(c,104.5,58,2.2)}
  <path {...k.x} d="M30 50l-3 14M88 50l3 14M20 65h76"/>
 </>;
};

/* --- Karistirici: kapli (varsayilan) ve hat ustu. Agizlar (30,22)/(90,22) ust koseler, (60,78) alt. */
const mixer=(c:SymbolCtx)=>{const k=kit(c),v=c.variant;
 if(v==='inline')return <>
  <Body>
   <rect {...k.p} x="30" y="22" width="60" height="9" rx="2"/>
   <rect {...k.b} x="49" y="30" width="22" height="44" rx="4"/>
   <rect {...k.b} x="51" y="5" width="18" height="11" rx="2"/>
  </Body>
  <rect {...k.p} className="zp zv" x="58.5" y="16" width="3" height="54"/>
  <path {...k.d} opacity={.85} d="M51 36l18 6M69 44l-18 6M51 52l18 6M69 60l-18 6"/>
  {spin(c,60,48,<path {...k.d} opacity={1} d="M53 48h14M60 44v8"/>)}
  {flowLine(c,'M32 26.5H88')}
  {led(c,60,10.5,2.4)}
  {vpipe(c,78,74,60,4)}
 </>;
 return <>
  <Body>
   <path {...k.b} d="M30 22H90V64Q90 74 80 74H40Q30 74 30 64Z"/>
   <rect {...k.b} x="50" y="5" width="20" height="12" rx="2"/>
  </Body>
  <path className="zl" d="M31.2 42H88.8V64Q88.8 72.8 80 72.8H40Q31.2 72.8 31.2 64Z" fill={c.w.color} fillOpacity=".16"/>
  <path {...k.d} d="M31 42H89"/>
  <rect {...k.p} className="zp zv" x="58.5" y="17" width="3" height="40"/>
  {spin(c,60,58,<><path {...k.b} strokeWidth={1.2} d="M60 58l-14-4v8zM60 58l14-4v8z"/><circle {...k.p} cx="60" cy="58" r="3"/></>)}
  {led(c,60,11,2.4)}
  {vpipe(c,78,74,60,4)}
 </>;
};

/* --- Isitici: kutu govde, isitici rezistans (calisirken nabiz), klemens kutusu. */
const heater=(c:SymbolCtx)=>{const k=kit(c);return <>
 {hpipe(c,24,31,40,5)}{hpipe(c,96,89,40,5)}
 <Body><rect {...k.b} x="51" y="15" width="18" height="7" rx="1.5"/><rect {...k.b} x="30" y="20" width="60" height="44" rx="6"/></Body>
 <rect {...k.d} x="35" y="25" width="50" height="34" rx="3"/>
 {[0,1,2].map(i=>{const y=32+i*10;return <path key={i} d={`M38 ${y}q4-6 8 0t8 0 8 0 8 0 8 0`} fill="none" stroke={c.on?c.w.color:'var(--sym-idle)'} strokeWidth="2" strokeLinecap="round" className={c.active?'heat':undefined} style={{animationDelay:i*0.25+'s'}}/>;})}
 {led(c,60,18,1.6)}
</>;};

/* --- Filtre: genel, kartus, torba, ters yikamali. Giris (60,14) ustte, cikis (60,74) altta.
 * Bag gelmemisse (differential/cleaning/fault) hicbir ek eleman cizilmez. */
const filter=(c:SymbolCtx)=>{const k=kit(c),v=c.variant,{w,readings}=c;
 const diff=readings.number.differential,cleaning=readings.bool.cleaning,fault=readings.bool.fault;
 const media=diff!==undefined&&(()=>{const r=diff===null?0:Math.max(0,Math.min(1,(diff-w.min)/((w.max-w.min)||1)));return <rect x="54" y={64-r*36} width="12" height={r*36} fill={diff===null?'var(--sym-unknown)':w.color+'55'}/>;})();
 const diffText=diff!==undefined&&<g><rect x="45" y="30" width="30" height="13" rx="3" fill="var(--chip)"/><text x="60" y="40" textAnchor="middle" fontSize="9" fontWeight="700" fill={diff===null?'var(--sym-unknown)':w.color}>{diff===null?'—':Math.round(diff*10)/10}</text></g>;
 const cleaningFx=cleaning===true&&<path d="M60 66V22" stroke={w.color} strokeWidth="2.2" strokeDasharray="5 3" className={w.animated?'flow':''} style={{animationDirection:'reverse'}}/>;
 const faultFx=fault===true&&faultBadge(w.animated,82,24,7);
 const pipes=<>{vpipe(c,14,22,60,5)}{vpipe(c,74,66,60,5)}</>;
 const shell=(x0:number,x1:number)=><Body><path {...k.b} d={`M${x0} 30a${(x1-x0)/2} 8 0 0 1 ${x1-x0} 0V60a6 6 0 0 1-6 6H${x0+6}a6 6 0 0 1-6-6Z`}/></Body>;
 const overlay=<>{media}{diffText}{cleaningFx}{faultFx}</>;
 if(v==='cartridge')return <>{pipes}{shell(38,82)}
  {[46,56,66].map(x=><g key={x}><rect {...k.p} className="zp zv" x={x} y="30" width="8" height="32" rx="3"/><path {...k.d} d={`M${x+2.7} 32v28M${x+5.3} 32v28`}/></g>)}
  {overlay}{led(c,76,28,2)}</>;
 if(v==='bag')return <>{pipes}{shell(36,84)}
  <path {...k.x} d="M38 32h44"/>
  <path className="zd" fill={k.tint} stroke={c.stroke} strokeWidth="1.4" strokeDasharray="3 2" d="M44 32h32l-3 20q-2 10-13 11q-11-1-13-11z"/>
  {overlay}{led(c,78,28,2)}</>;
 if(v==='backwash')return <>{pipes}{shell(38,82)}
  {hpipe(c,30,38,56,3,c.active&&cleaning===true)}{hpipe(c,90,82,32,3,c.active&&cleaning===true)}
  <path {...k.d} strokeDasharray="3 3" d="M42 46H78"/>
  <path {...k.d} opacity={.8} d="M60 62V50M56 54l4-4 4 4"/>
  {overlay}{led(c,76,28,2)}</>;
 return <>{pipes}{shell(40,80)}
  <path {...k.d} d="M42 32l36 32M42 64l36-32"/>
  <path {...k.x} strokeDasharray="4 3" d="M42 48h36"/>
  <path {...k.x} d="M44 66l-3 7M76 66l3 7"/>
  {overlay}{led(c,74,28,2)}</>;
};

/* --- Esanjor: govde-boru (varsayilan) ve plakali. Sicak devre (2,30) sol, (118,52) sag.
 * Sicak/soguk devre baglari yoksa ek eleman cizilmez. */
const heatExchanger=(c:SymbolCtx)=>{const k=kit(c),v=c.variant,{readings}=c;
 const inlet=readings.number.inlet,outlet=readings.number.outlet,coldInlet=readings.number.coldInlet,coldOutlet=readings.number.coldOutlet;
 const fmt=(x:number|null|undefined)=>x===undefined?'':x===null?'—':String(Math.round(x*10)/10);
 const hasHot=inlet!==undefined||outlet!==undefined,hasCold=coldInlet!==undefined||coldOutlet!==undefined;
 const coldPath=hasCold&&<path d="M24 44H96" fill="none" stroke="#4f9fd6" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={c.active?'5 3':undefined} className={c.active?'flow':''} style={{animationDirection:'reverse'}}/>;
 const hotLabel=hasHot&&<text className="zt" x="24" y="30" fontSize="8" fontWeight="700" fill="#208169">{fmt(inlet)}{inlet!==undefined&&outlet!==undefined?'/':''}{fmt(outlet)}</text>;
 const coldLabel=hasCold&&<text className="zt" x="66" y="58" fontSize="8" fontWeight="700" fill="#4f9fd6">{fmt(coldInlet)}{coldInlet!==undefined&&coldOutlet!==undefined?'/':''}{fmt(coldOutlet)}</text>;
 const overlay=<>{coldPath}{hotLabel}{coldLabel}</>;
 if(v==='plate')return <>
  {hpipe(c,2,22,30)}{hpipe(c,118,98,52)}
  <Body>
   <rect {...k.b} x="22" y="22" width="8" height="40" rx="1.5"/>
   <rect {...k.b} x="90" y="22" width="8" height="40" rx="1.5"/>
  </Body>
  <path {...k.x} d="M24 24.5h72M24 59.5h72"/>
  {[34,39,44,49,54,59,64,69,74,79,84].map((x,i)=><rect key={x} className={i%2?'zp zv':'zb'} x={x} y="26" width="3.4" height="32" rx="1" fill={i%2?c.body:k.tint} stroke={c.stroke} strokeWidth="1"/>)}
  {led(c,94,42,2)}
  {overlay}
 </>;
 return <>
  {hpipe(c,2,20,30)}{hpipe(c,118,100,52)}
  <Body>
   <rect {...k.p} className="zp zv" x="70" y="18" width="8" height="6"/>
   <rect {...k.p} className="zp zv" x="40" y="58" width="8" height="5"/>
   <rect {...k.b} x="20" y="24" width="80" height="34" rx="16"/>
  </Body>
  <path {...k.d} d="M32 24V58M36 32H90M36 38H90M36 44H90M36 50H90M52 26V36M68 46V56M84 26V36"/>
  {flowLine(c,'M36 41H96')}
  {led(c,26,41,2.2)}
  {overlay}
 </>;
};

/* --- Kontaktor: DIN modulu, ust klemensler, uc kutup; kapali = kontaklar birlesik. */
const contactor=(c:SymbolCtx)=>{const k=kit(c),on=c.on;return <>
 <Body><rect {...k.b} x="30" y="12" width="60" height="54" rx="5"/></Body>
 {[44,60,76].map(x=><g key={x}>
  <circle {...k.p} cx={x} cy="19" r="3.2"/>
  <path {...k.x} d={`M${x} 22.5V29M${x} 41V45`}/>
  <path {...k.x} strokeWidth={2.4} d={on?`M${x} 29V41`:`M${x} 29L${x+7} 38`}/>
 </g>)}
 <path {...k.d} strokeDasharray="2 2" d="M44 35H76"/>
 <rect {...k.p} x="44" y="49" width="32" height="13" rx="2"/>
 <text className="zt" x="56" y="59" textAnchor="middle" fontSize="9" fontWeight="700" fill={c.stroke}>K</text>
 {led(c,70,55.5,2.4)}
</>;};

/* --- Salter (MCB): modul govde, kol penceresi; kol yukarida = kapali (enerjili). */
const breaker=(c:SymbolCtx)=>{const k=kit(c),on=c.on;return <>
 <Body><rect {...k.b} x="48" y="8" width="32" height="64" rx="4"/></Body>
 <circle {...k.p} cx="64" cy="14" r="3"/><circle {...k.p} cx="64" cy="66" r="3"/>
 <rect {...k.p} x="55" y="26" width="18" height="26" rx="2"/>
 <rect x="58" y={on?28:39} width="12" height="11" rx="1.5" fill={c.stroke} stroke={c.stroke} strokeWidth="1"/>
 <text className="zt" x="64" y="24" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--sym-label)">{on?'I':'O'}</text>
 {led(c,64,58,2.4)}
</>;};

export const renderers:Record<string,Renderer>={
 contactor,breaker,motor,pump,compressor,fan,conveyor,mixer,heater,filter,'heat-exchanger':heatExchanger,
};
