import type {Renderer} from './ctx';
import {kit,Body,hpipe,faultBadge} from './kit';
/* 2026-11-18 HVAC, "B · Endustriyel metal" dili. AHU adlandirilmis baglari (supplyFan/
 * returnFan/fault/temperature/humidity/damper) okur; aile yok, govde readings ile cizilir. */
const fanWheel=(c:Parameters<Renderer>[0],cx:number,cy:number,on:boolean|null|undefined)=>{const k=kit(c),{w}=c;
 const col=on==null?'var(--sym-unknown)':on?w.color:'var(--sym-idle)';
 return <><circle {...k.c} stroke={on==null?'var(--sym-unknown)':on?w.color:c.line} cx={cx} cy={cy} r="13"/>
  <g className={on===true&&w.animated?'rotor fast':undefined} style={{transformOrigin:cx+'px '+cy+'px'}}>
   {[0,90,180,270].map(a=><path key={a} d={`M${cx} ${cy}C${cx-5} ${cy-5} ${cx-4} ${cy-11} ${cx+0.5} ${cy-11.5}C${cx+4} ${cy-8} ${cx+3} ${cy-3} ${cx} ${cy}Z`} fill={on?w.color+'55':'var(--chip)'} stroke={col} strokeWidth="1.2" transform={`rotate(${a} ${cx} ${cy})`}/>)}
  </g><circle cx={cx} cy={cy} r="2.6" fill={col}/></>;};
const ahu:Renderer=(c)=>{const k=kit(c),{w,readings}=c;
 const supplyFan=readings.bool.supplyFan,returnFan=readings.bool.returnFan,fault=readings.bool.fault;
 const damper=readings.number.damper,temperature=readings.number.temperature,humidity=readings.number.humidity;
 const alarmOn=fault===true;
 const dAngle=damper==null?0:Math.max(0,Math.min(100,damper))/100*80;
 return <>
  {hpipe(c,2,9,32,4,false)}{hpipe(c,2,9,72,4,false)}{hpipe(c,118,111,32,4,false)}{hpipe(c,118,111,72,4,false)}
  <Body><rect {...k.b} stroke={alarmOn?'var(--sym-alarm)':c.line} x="8" y="9" width="104" height="82" rx="5"/></Body>
  <path {...k.d} opacity={.8} d="M33 9V91M58 9V91M83 9V91"/>
  <path {...k.x} d="M8 50H33"/>
  {/* karisim/damper bolmesi: kanat acisi damper (0..100) ile doner */}
  <g transform={`rotate(${dAngle} 20.5 50)`} style={{transition:'transform var(--motion-slow) var(--ease)'}}><rect x="18.5" y="22" width="4" height="56" rx="1.5" fill={damper==null?'var(--sym-unknown)':w.color} opacity=".85"/></g>
  {/* filtre pilileri */}
  <path d="M38 18l4 6-4 6 4 6-4 6 4 6-4 6 4 6-4 6 4 6-4 6M46 18l4 6-4 6 4 6-4 6 4 6-4 6 4 6-4 6 4 6-4 6" fill="none" stroke="var(--sym-label)" strokeWidth="1.3" strokeLinejoin="round"/>
  {/* serpantin */}
  <path d="M64 18C72 24 58 28 64 34C72 40 58 44 64 50C72 56 58 60 64 66C72 72 58 76 64 82" fill="none" stroke="var(--sym-label)" strokeWidth="2" strokeLinecap="round"/>
  <path d="M72 18V82" stroke="var(--sym-label)" strokeWidth="1" strokeDasharray="2 2"/>
  {fanWheel(c,97,30,supplyFan)}{fanWheel(c,97,70,returnFan)}
  {temperature!==undefined&&<text className="zt" x="20" y="88" fontSize="8" fill="var(--sym-label)">{temperature===null?'T —':'T '+(Math.round(temperature*10)/10)}</text>}
  {humidity!==undefined&&<text className="zt" x="64" y="88" fontSize="8" fill="var(--sym-label)">{humidity===null?'H —':'H '+(Math.round(humidity*10)/10)+'%'}</text>}
  {alarmOn&&faultBadge(w.animated,104,17,7)}
 </>;};
/* Hava kanali: FLAT aile (boru ailesiyle ayni piksel olcusu). Cift duvarli kanal + orta hat
 * akis kesikleri; Detayli'da duvar metal tonu alir (zduct). */
const duct:Renderer=(c)=>{const{w,on,active,line}=c;
 const width=Math.max(1,w.width),height=Math.max(1,w.height),my=height/2;
 const gap=Math.max(8,Math.min(height*.62,height-4)),top=my-gap/2,bot=my+gap/2;
 const fluid=on?w.color+'33':'var(--chip)';
 return <>
  <rect className={on?undefined:'zduct'} x="0" y={top} width={width} height={gap} fill={fluid} stroke="none"/>
  <line className="zductw" x1="0" y1={top} x2={width} y2={top} stroke={line} strokeWidth="3"/>
  <line className="zductw" x1="0" y1={bot} x2={width} y2={bot} stroke={line} strokeWidth="3"/>
  <line className="zductw" x1="2" y1={top} x2="2" y2={bot} stroke={line} strokeWidth="3"/>
  <line className="zductw" x1={width-2} y1={top} x2={width-2} y2={bot} stroke={line} strokeWidth="3"/>
  {on&&<line x1="0" y1={my} x2={width} y2={my} stroke={w.color} strokeWidth={Math.max(2,gap*.18)} strokeDasharray={`${gap*.9} ${gap*.7}`} strokeLinecap="round" className={active?'flow':''} style={{animationDirection:w.reverse?'reverse':'normal'}}/>}
 </>;};
/* Serpantin: kanatli boru demeti + kontrol vanasi; sicak/soguk yonu ok seklinde. */
const coil:Renderer=(c)=>{const k=kit(c),{w,readings}=c;
 const inlet=readings.number.inlet,outlet=readings.number.outlet,position=readings.number.position;
 const flowing=position!=null&&position>0,active=flowing&&w.animated;
 const heating=inlet!=null&&outlet!=null&&outlet>inlet,cooling=inlet!=null&&outlet!=null&&outlet<inlet;
 const tube=flowing?w.color:'var(--sym-idle)';
 const gap=position==null?0:Math.max(0,Math.min(100,position))/100*10;
 return <>
  {hpipe(c,4,31,30,4,false)}{hpipe(c,4,31,74,4,false)}
  <Body><rect {...k.b} stroke={c.line} x="30" y="9" width="80" height="82" rx="5"/></Body>
  <path {...k.d} d="M48 14V86M58 14V86M68 14V86M78 14V86M88 14V86M98 14V86"/>
  <path d="M38 20H102V36H38V52H102V68H38V84H102" fill="none" stroke={tube} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className={active?'flow':undefined} strokeDasharray={flowing?'10 6':undefined}/>
  <path d={`M13 23L13 37L${17+gap/2} 30Z`} fill={position==null?'var(--sym-unknown)':c.line} stroke={c.line} strokeWidth="1.2"/>
  <path d={`M27 23L27 37L${23-gap/2} 30Z`} fill={position==null?'var(--sym-unknown)':c.line} stroke={c.line} strokeWidth="1.2"/>
  {heating&&<path d="M94 14H108L101 9Z" fill={w.color}/>}
  {cooling&&<path d="M94 9H108L101 14Z" fill={w.color}/>}
  {inlet!==undefined&&<text className="zt" x="64" y="90" fontSize="7" fill="var(--sym-label)">{inlet===null?'Gi —':'Gi '+(Math.round(inlet*10)/10)}</text>}
  {outlet!==undefined&&<text className="zt" x="88" y="90" fontSize="7" fill="var(--sym-label)">{outlet===null?'Çı —':'Çı '+(Math.round(outlet*10)/10)}</text>}
 </>;};
/* Hava filtresi: cerceve + pileli medya; kirli = medya golgeli + uyari, tikali = kirmizi. */
const airFilter:Renderer=(c)=>{const k=kit(c),{w,readings}=c;
 const differential=readings.number.differential,dirty=readings.bool.dirty;
 const max=w.max||1;
 const ratio=differential==null?0:Math.max(0,Math.min(1,differential/max));
 const blocked=dirty===true||(differential!=null&&ratio>=1);
 const warn=!blocked&&ratio>.5;
 const media=differential==null?'var(--chip)':w.color+(blocked?'33':'1a');
 return <>
  {hpipe(c,4,15,50,6,false)}{hpipe(c,116,105,50,6,false)}
  <Body><rect {...k.b} stroke={blocked?'var(--sym-alarm)':c.line} x="14" y="22" width="92" height="56" rx="5"/></Body>
  <rect x="20" y="28" width="80" height="44" fill={media} stroke={c.line} strokeWidth="1"/>
  <path d="M24 30L32 70L40 30L48 70L56 30L64 70L72 30L80 70L88 30L96 70" fill="none" stroke="var(--sym-label)" strokeWidth="1.6" strokeLinejoin="round"/>
  {differential!==undefined&&<g><rect x="42" y="43" width="36" height="13" rx="3" fill="var(--chip)"/><text x="60" y="53" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--sym-label)">{differential===null?'ΔP —':'ΔP '+(Math.round(differential*10)/10)}</text></g>}
  {warn&&<g><circle cx="98" cy="30" r="7" fill="var(--chip)" stroke="var(--warn-text)" strokeWidth="2.2"/><text x="98" y="34" textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--warn-text)">!</text></g>}
  {blocked&&faultBadge(w.animated,98,30,7.5)}
 </>;};
export const renderers:Record<string,Renderer>={ahu,duct,coil,'air-filter':airFilter};
