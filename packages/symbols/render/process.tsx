import type {Renderer} from './ctx';
import {kit,Body,led,spin,hpipe,vpipe,faultBadge,impeller} from './kit';
/* 2026-11-18 isil proses ekipmani, "B · Endustriyel metal" dili. Her cizim 120x100 kutuda
 * ve olculmus cizim kutusunun (content.ts) icinde kalir; katalogdaki port koordinatlarina
 * boru saplari tam oturur. Adlandirilmis baglar (readings) okunur; rol baglanmamissa
 * (undefined) notr gorunum, bilinmiyor (null) ise gri + kesik cizgi. */
export const renderers:Record<string,Renderer>={
'boiler':(c)=>{
 const k=kit(c),{w,stroke,ratio,readings}=c;
 const running=readings.bool.running,fault=readings.bool.fault;
 const lvlNum=readings.number.level;
 const lvl=lvlNum===null?null:lvlNum!==undefined?Math.max(0,Math.min(100,lvlNum))/100:ratio;
 const badFault=fault===true,unkFault=fault===null;
 const outline=badFault?'var(--sym-alarm)':unkFault?'var(--sym-unknown)':stroke;
 const flameOn=running===true;
 const pressure=readings.number.pressure,temperature=readings.number.temperature;
 const h=(lvl===null?0:lvl)*54;
 return <>
  {/* port (20,30)h besleme, (100,10)v buhar, (60,92)v tahliye/ocak */}
  {vpipe(c,10,18,100,3,false)}{hpipe(c,20,27,30,4,false)}
  <Body>
   <rect {...k.b} stroke={outline} x="90" y="16" width="16" height="12" rx="3"/>
   <rect {...k.b} stroke={outline} strokeDasharray={unkFault?'5 4':undefined} x="24" y="18" width="76" height="62" rx="14"/>
   <rect {...k.c} stroke={outline} x="38" y="80" width="44" height="12" rx="2"/>
  </Body>
  <clipPath id={'bo'+w.id}><rect x="28" y="22" width="68" height="54" rx="11"/></clipPath>
  <g clipPath={`url(#bo${w.id})`}><rect className="zl" x="28" y={76-h} width="68" height={h} fill={w.color} fillOpacity=".3"/></g>
  <rect {...k.d} opacity={.7} x="28" y="22" width="68" height="54" rx="11"/>
  <path d={flameOn?'M54 91C52 85 57 84 56 80C61 83 63 86 61 91C66 89 66 85 64 83C67 87 66 90 62 91Z':'M55 91C55 87 58 86 57 83C61 85 62 88 61 91Z'}
   fill={flameOn?'#f29a2e':'none'} fillOpacity=".85" stroke={flameOn?'#e2602b':'var(--sym-idle)'} strokeWidth="1.4" strokeLinejoin="round" className={flameOn&&w.animated?'heat':undefined}/>
  {led(c,74,86,1.8)}
  {badFault&&faultBadge(w.animated,94,40,7)}
  {lvl===null&&<text className="zt" x="62" y="54" textAnchor="middle" fontSize="12" fill="var(--sym-unknown)">—</text>}
  {pressure!=null&&<text className="zt" x="62" y="38" textAnchor="middle" fontSize="9" fill="var(--sym-label)">{Math.round(pressure*10)/10} bar</text>}
  {temperature!=null&&<text className="zt" x="62" y="50" textAnchor="middle" fontSize="9" fill="var(--sym-label)">{Math.round(temperature)}°C</text>}
 </>;},
'burner':(c)=>{
 const k=kit(c),{w,stroke,readings}=c;
 const flame=readings.bool.flame,trip=readings.bool.trip,stage=readings.number.stage,load=readings.number.load;
 const unk=flame===null||trip===null,tripOn=trip===true,stageN=stage==null?1:stage;
 const outline=tripOn?'var(--sym-alarm)':unk?'var(--sym-unknown)':stroke;
 return <>
  {/* port (4,50)h yakit girisi, (116,50)h alev yonu */}
  {hpipe(c,4,25,50,4,flame===true)}{hpipe(c,116,108,50,5,false)}
  <Body>
   <rect {...k.b} stroke={outline} x="24" y="36" width="28" height="30" rx="4"/>
   <rect {...k.p} stroke={outline} strokeDasharray={unk?'6 4':undefined} x="52" y="42" width="56" height="16" rx="2"/>
  </Body>
  {spin(c,38,51,<><circle {...k.d} opacity={1} cx="38" cy="51" r="8"/><path {...k.d} opacity={1} d="M38 43v16M30 51h16"/></>,true,flame===true&&w.animated)}
  {tripOn?<g className={w.animated?'blink':undefined}><path d="M58 45L102 55M102 45L58 55" stroke="var(--sym-alarm)" strokeWidth="2.4" strokeLinecap="round"/></g>
   :flame===true?<g className={w.animated?'heat':undefined}>
    <path d="M60 50C68 43 76 45 80 50C84 55 92 52 100 50C94 57 86 58 78 57C70 56 64 56 60 50Z" fill="#f29a2e" fillOpacity=".8" stroke="#e2602b" strokeWidth="1.6" strokeLinejoin="round"/>
   </g>
   :stageN>=2?<path d="M62 50C66 46 70 47 72 50C74 53 78 51 81 50" stroke={w.color} strokeWidth="2" strokeLinecap="round" fill="none"/>
   :<path d="M60 50H100" stroke="var(--sym-idle)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="4 4"/>}
  <text x="79" y="74" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--sym-label)">{tripOn?'KİLİT':flame===true?'ALEV':stageN>=2?'ATEŞLEME':'SÜPÜRME'}{load!=null?' · '+Math.round(load)+'%':''}</text>
 </>;},
'chiller':(c)=>{
 const k=kit(c),{w,stroke,readings}=c;
 const running=readings.bool.running,fault=readings.bool.fault;
 const inlet=readings.number.inlet,outlet=readings.number.outlet;
 const badFault=fault===true,unkFault=fault===null||running===null;
 const outline=badFault?'var(--sym-alarm)':unkFault?'var(--sym-unknown)':stroke;
 const flow=running===true&&w.animated;
 return <>
  {/* dort port: (2,30)(118,30) kondenser, (2,70)(118,70) evaporator; hepsi yatay */}
  {hpipe(c,2,15,30,5,flow)}{hpipe(c,118,105,30,5,flow)}{hpipe(c,2,15,70,5,flow)}{hpipe(c,118,105,70,5,flow)}
  <Body>
   <rect {...k.b} stroke={outline} strokeDasharray={unkFault?'6 4':undefined} x="14" y="12" width="92" height="76" rx="6"/>
  </Body>
  <rect {...k.p} x="18" y="22" width="84" height="16" rx="8"/>
  <rect {...k.p} x="18" y="62" width="84" height="16" rx="8"/>
  <circle {...k.c} stroke={outline} cx="60" cy="50" r="10"/>
  {spin(c,60,50,<path {...k.d} opacity={1} d="M60 43v14M53 50h14"/>,false,running===true&&w.animated)}
  <path {...k.x} d="M50 50H40V38M70 50H80V62"/>
  <text className="zt" x="34" y="33" textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--sym-label)">KOND.</text>
  <text className="zt" x="34" y="73" textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--sym-label)">EVAP.</text>
  {led(c,96,50,2.4)}
  {badFault&&faultBadge(true,60,16,7)}
  {inlet!=null&&<text className="zt" x="88" y="33" textAnchor="middle" fontSize="7" fill="var(--sym-label)">{Math.round(inlet)}°</text>}
  {outlet!=null&&<text className="zt" x="88" y="73" textAnchor="middle" fontSize="7" fill="var(--sym-label)">{Math.round(outlet)}°</text>}
 </>;},
'cooling-tower':(c)=>{
 const k=kit(c),{w,stroke,readings}=c;
 const fan=readings.bool.fan,pump=readings.bool.pump,fault=readings.bool.fault,temperature=readings.number.temperature;
 const badFault=fault===true,unkFault=fault===null;
 const outline=badFault?'var(--sym-alarm)':unkFault?'var(--sym-unknown)':stroke;
 return <>
  {/* port (18,80)h giris, (102,80)h cikis - havuz kenarinda */}
  {hpipe(c,2,19,80,4,pump===true&&w.animated)}{hpipe(c,118,101,80,4,pump===true&&w.animated)}
  <Body>
   <rect {...k.c} stroke={outline} x="18" y="70" width="84" height="18" rx="3"/>
   <path {...k.b} stroke={outline} d="M34 24H86L98 70H22Z"/>
   <rect {...k.p} stroke={outline} x="40" y="15" width="40" height="10" rx="3"/>
  </Body>
  <path {...k.d} d="M30 46H90M28 54H92M26 62H94"/>
  <path {...k.d} d="M38 34l6 10M54 34l6 10M70 34l6 10"/>
  {spin(c,60,20,<path d="M47 20h26" stroke={fan===true?w.color:'var(--sym-idle)'} strokeWidth="2.4" strokeLinecap="round"/>,true,fan===true&&w.animated)}
  <path d="M26 79H94" stroke={pump===true?w.color:'transparent'} strokeWidth="2" strokeDasharray="5 3" className={pump===true&&w.animated?'flow':undefined}/>
  {temperature!=null&&<text className="zt" x="60" y="42" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--sym-fill)">{Math.round(temperature)}°C</text>}
  {badFault&&faultBadge(w.animated,94,22,7)}
 </>;},
'dryer':(c)=>{
 const k=kit(c),{w,stroke,readings}=c;
 const running=readings.bool.running,fault=readings.bool.fault,temperature=readings.number.temperature,humidity=readings.number.humidity;
 const badFault=fault===true,unkFault=fault===null||running===null;
 const outline=badFault?'var(--sym-alarm)':unkFault?'var(--sym-unknown)':stroke;
 return <>
  {/* port (2,50)h ve (118,50)h - yatay doner tambur */}
  {hpipe(c,2,17,50,5,running===true&&w.animated)}{hpipe(c,118,103,50,5,running===true&&w.animated)}
  <path {...k.x} d="M30 70v6M90 70v6M24 77h72"/>
  <Body>
   <rect {...k.c} stroke={outline} strokeDasharray={unkFault?'6 4':undefined} x="16" y="30" width="88" height="40" rx="10"/>
   <rect {...k.p} className="zp zv" x="32" y="27" width="8" height="46" rx="2"/>
   <rect {...k.p} className="zp zv" x="80" y="27" width="8" height="46" rx="2"/>
  </Body>
  {[0,1].map(i=>{const y=44+i*12;return <path key={i} d={`M44 ${y}q4-6 8 0t8 0 8 0`} fill="none" stroke={running===true?w.color:'var(--sym-idle)'} strokeWidth="2" strokeLinecap="round" className={running===true&&w.animated?'heat':undefined} style={{animationDelay:i*0.2+'s'}}/>;})}
  <text x="60" y="89" textAnchor="middle" fontSize="8.5" fill="var(--sym-label)">{temperature!=null?Math.round(temperature)+'°C':'—'} · {humidity!=null?Math.round(humidity)+'%RH':'—'}</text>
  {badFault&&faultBadge(w.animated,104,30,7)}
 </>;},
'centrifuge':(c)=>{
 const k=kit(c),{w,stroke,readings}=c;
 const running=readings.bool.running,fault=readings.bool.fault,lock=readings.bool.lock,speed=readings.number.speed;
 const badFault=fault===true,unkFault=fault===null;
 const outline=badFault?'var(--sym-alarm)':unkFault?'var(--sym-unknown)':stroke;
 const lidOpen=lock===false;
 return <>
  {/* port (60,8)v besleme ust, (30,88)v/(90,88)v cikislar alt */}
  {vpipe(c,8,22,60,5,running===true&&w.animated)}
  {vpipe(c,88,64,30,4,false)}{vpipe(c,88,64,90,4,false)}
  <Body><path {...k.b} stroke={outline} d="M26 22H94V60L84 78H36L26 60Z"/></Body>
  <circle {...k.c} stroke={outline} cx="60" cy="47" r="20"/>
  {impeller({...c,active:running===true&&w.animated},60,47,16)}
  {lidOpen?<g className={w.animated?'blink':undefined}><path d="M44 20L60 11L76 20" fill="none" stroke="var(--sym-alarm)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></g>
   :<path d="M42 22H78" stroke={lock===null?'var(--sym-unknown)':outline} strokeWidth="3" strokeLinecap="round" strokeDasharray={lock===null?'4 3':undefined}/>}
  {led(c,86,70,2)}
  {speed!=null&&<text className="zt" x="60" y="74" textAnchor="middle" fontSize="7.5" fill="var(--sym-label)">{Math.round(speed)} rpm</text>}
  {badFault&&faultBadge(w.animated,88,30,7)}
 </>;},
'agitator':(c)=>{
 const k=kit(c),{w,stroke,readings}=c;
 const running=readings.bool.running,fault=readings.bool.fault,speed=readings.number.speed;
 const badFault=fault===true,unkFault=fault===null;
 const outline=badFault?'var(--sym-alarm)':unkFault?'var(--sym-unknown)':stroke;
 /* Dar ve dikey: bir tankin icine yerlestirilir; cizim olculmus kutuda (x 56..73) ortalanir. */
 return <>
  <Body>
   <rect {...k.b} stroke={outline} x="58" y="2" width="13" height="11" rx="2"/>
   <rect {...k.p} className="zp zv" x="63" y="13" width="3" height="60"/>
  </Body>
  {spin(c,64.5,74,<><path {...k.c} stroke={outline} strokeWidth={1.2} d="M64.5 74l-7-3v6zM64.5 74l7-3v6z"/><circle {...k.p} cx="64.5" cy="74" r="2.2"/></>,false,running===true&&w.animated)}
  {led(c,64.5,7.5,1.8)}
  {badFault&&faultBadge(w.animated,64.5,30,6)}
  {speed!=null&&<text x="64.5" y="24" textAnchor="middle" fontSize="7" fill="var(--sym-label)">{Math.round(speed)}</text>}
 </>;},
'hoist':(c)=>{
 const k=kit(c),{w,stroke,readings,ratio}=c;
 const upLimit=readings.bool.upLimit,downLimit=readings.bool.downLimit,fault=readings.bool.fault;
 const heightN=readings.number.height;
 const badFault=fault===true,unkFault=fault===null;
 const outline=badFault?'var(--sym-alarm)':unkFault?'var(--sym-unknown)':stroke;
 const h=heightN===null?null:heightN!==undefined?Math.max(0,Math.min(1,(heightN-w.min)/((w.max-w.min)||1))):ratio;
 const hookY=h===null?50:28+(1-h)*52;
 return <>
  {/* portal vinc: kiris + iki ayak + araba; kanca yuksekligi height bagina gore */}
  <Body>
   <rect {...k.b} stroke={outline} x="16" y="13" width="7" height="80" rx="1.5"/>
   <rect {...k.b} stroke={outline} x="97" y="13" width="7" height="80" rx="1.5"/>
   <rect {...k.b} stroke={outline} x="14" y="7" width="92" height="7" rx="1.5"/>
   <rect {...k.c} stroke={outline} x="48" y="14" width="24" height="10" rx="2"/>
  </Body>
  <path {...k.d} d="M18 10.5h84"/>
  <path d={`M60 24V${hookY}`} stroke={c.line} strokeWidth="1.6" strokeDasharray="3 2" strokeLinecap="round"/>
  <rect {...k.p} x="55" y={hookY} width="10" height="7" rx="1.5"/>
  <path d={`M60 ${hookY+7}v3q0 5 4.5 5q4 0 4-4`} fill="none" stroke={outline} strokeWidth="2.2" strokeLinecap="round"/>
  {led(c,66,19,1.8)}
  {upLimit===true&&<g className={w.animated?'blink':undefined}><path d="M24 26H96" stroke="var(--warn-text)" strokeWidth="1.6" strokeDasharray="5 3"/><text x="88" y="34" fontSize="7" fill="var(--warn-text)">ÜST</text></g>}
  {downLimit===true&&<text x="88" y="90" fontSize="7" fill="var(--warn-text)">ALT</text>}
  {h===null&&<text x="40" y="54" fontSize="9" fill="var(--sym-unknown)">—</text>}
  {badFault&&faultBadge(w.animated,34,30,7)}
 </>;},
};
