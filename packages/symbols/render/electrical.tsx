import type {Renderer} from './ctx';
import {kit,Body,faultBadge} from './kit';
/* 2026-11-18 elektrik ailesi, "B · Endustriyel metal" dili. Bu semboller durumu adlandirilmis
 * baglardan (readings) okur; `tone` enerjili/ariza/bilinmiyor rengidir. Govdeler metal (zb),
 * akim yolu `tone` renginde kalir (Detayli'da da). Bilinmeyen veri kesik cizgiyle cizilir. */
export const renderers:Record<string,Renderer>={};
const dash=(bad:boolean,d='5 4')=>bad?d:undefined;

/* IEC iki sargili transformator: ust ust binen iki sargi + terminal saplari + sogutma kanatlari. */
renderers['transformer']=(c)=>{
 const k=kit(c),{w,readings}=c;
 const en='energised' in readings.bool?readings.bool.energised:undefined;
 const flt='fault' in readings.bool?readings.bool.fault:undefined;
 const ld='load' in readings.number?readings.number.load:undefined;
 const tp='temperature' in readings.number?readings.number.temperature:undefined;
 const bad=en===null||flt===null;
 const tone=flt===true?'var(--sym-alarm)':bad?'var(--sym-unknown)':en===true?w.color:'var(--sym-idle)';
 const fmtLd=ld===undefined?null:ld===null?'—':'Yük '+Math.round(ld)+'%';
 const fmtTp=tp===undefined?null:tp===null?'—':Math.round(tp)+'°C';
 const coil=(cy:number)=><path d={`M52 ${cy-8}q6 2 0 5.3q6 2 0 5.3q6 2 0 5.4M68 ${cy-8}q-6 2 0 5.3q-6 2 0 5.3q-6 2 0 5.4`} fill="none" stroke={tone} strokeWidth="1.6" strokeLinecap="round"/>;
 return <>
  <path d="M60 5V14M60 76V87" stroke={tone} strokeWidth="3.2" strokeLinecap="round"/>
  <Body>
   <circle {...k.b} stroke={tone} strokeDasharray={dash(bad)} cx="60" cy="31" r="18"/>
   <circle {...k.b} stroke={tone} strokeDasharray={dash(bad)} cx="60" cy="59" r="18" fillOpacity=".92"/>
  </Body>
  {coil(31)}{coil(59)}
  {fmtLd!==null&&<text x="42" y="12" fontSize="7" fill="var(--sym-label)">{fmtLd}</text>}
  {fmtTp!==null&&<text x="42" y="86" fontSize="7" fill="var(--sym-label)">{fmtTp}</text>}
  {flt===true&&faultBadge(w.animated,74,12,7)}
 </>;
};
/* Bakir bara + dort musluk; enerjiliyken bara durum renginde, bilinmiyorken kesik. */
renderers['busbar']=(c)=>{
 const k=kit(c),{w,readings}=c;
 const en='energised' in readings.bool?readings.bool.energised:undefined;
 const v='voltage' in readings.number?readings.number.voltage:undefined;
 const bad=en===null;
 const tone=bad?'var(--sym-unknown)':en===true?w.color:'var(--sym-idle)';
 const fmtV=v===undefined?null:v===null?'—':Math.round(v)+'V';
 return <>
  {[24,52,80,108].map(x=><g key={x}><path d={`M${x} 52V68`} stroke={tone} strokeWidth="3" strokeLinecap="round" strokeDasharray={dash(bad,'4 3')}/><rect {...k.b} x={x-4} y="66" width="8" height="5" rx="1.5"/></g>)}
  <Body><rect className="zbus" x="8" y="41" width="104" height="12" rx="2.5" fill={en===true?tone:'var(--chip)'} stroke={tone} strokeWidth="2.4" strokeDasharray={dash(bad,'6 4')}/></Body>
  <path d="M11 44H109" stroke="#fff" strokeOpacity=".45" strokeWidth="1.6" strokeLinecap="round"/>
  {fmtV!==null&&<text x="60" y="34" textAnchor="middle" fontSize="10" fontWeight="700" fill={tone}>{fmtV}</text>}
 </>;
};
/* Jenerator: motor blogu + kaplin + "G" alternator + cikista kesici (kapali = dolu hat). */
renderers['generator']=(c)=>{
 const k=kit(c),{w,readings}=c;
 const run='running' in readings.bool?readings.bool.running:undefined;
 const onl='online' in readings.bool?readings.bool.online:undefined;
 const flt='fault' in readings.bool?readings.bool.fault:undefined;
 const pw='power' in readings.number?readings.number.power:undefined;
 const fr='frequency' in readings.number?readings.number.frequency:undefined;
 const bad=run===null||onl===null||flt===null;
 const tone=flt===true?'var(--sym-alarm)':bad?'var(--sym-unknown)':run===true?w.color:'var(--sym-idle)';
 const closed=onl===true;
 const fmtPw=pw===undefined?null:pw===null?'—':Math.round(pw)+'kW';
 const fmtFr=fr===undefined?null:fr===null?'—':Math.round(fr*10)/10+'Hz';
 return <>
  <Body>
   <rect {...k.b} stroke={tone} strokeDasharray={dash(bad,'4 3')} x="10" y="28" width="16" height="24" rx="2"/>
   <rect {...k.p} x="26" y="37" width="5" height="6"/>
   <circle {...k.c} stroke={tone} strokeDasharray={dash(bad)} cx="51" cy="40" r="21"/>
  </Body>
  <path {...k.d} d="M13 33h10M13 38h10M13 43h10M13 48h10"/>
  {run===true&&w.animated?<g className="rotor" style={{transformOrigin:'51px 40px'}}><circle cx="51" cy="40" r="16" fill="none" stroke={tone} strokeWidth="1.4" strokeDasharray="6 4" opacity=".7"/></g>:null}
  <text x="51" y="47" textAnchor="middle" fontSize="18" fontWeight="800" fill={tone}>G</text>
  <path d="M72 40H88" stroke={tone} strokeWidth="3" strokeLinecap="round"/>
  {closed?<path d="M88 40H111" stroke={tone} strokeWidth="3" strokeLinecap="round"/>:<><circle cx="91" cy="40" r="2.5" fill={tone}/><path d="M92 38L104 30" stroke={tone} strokeWidth="3" strokeLinecap="round"/><circle cx="106" cy="40" r="2.5" fill={tone}/><path d="M106 40H111" stroke={tone} strokeWidth="3" strokeLinecap="round"/></>}
  {flt===true&&faultBadge(w.animated,100,24,7)}
  {fmtPw!==null&&<text x="10" y="62" fontSize="8" fill="var(--sym-label)">{fmtPw}</text>}
  {fmtFr!==null&&<text x="80" y="62" fontSize="8" fill="var(--sym-label)">{fmtFr}</text>}
 </>;
};
/* Kesintisiz guc kaynagi: giris/batarya/bypass yollarindan yalniz aktif olani kalinlasir ve akar. */
renderers['ups']=(c)=>{
 const k=kit(c),{w,readings}=c;
 const mode='mode' in readings.number?readings.number.mode:undefined;
 const chg='charge' in readings.number?readings.number.charge:undefined;
 const flt='fault' in readings.bool?readings.bool.fault:undefined;
 const bad=mode===null;
 const sel=mode===undefined||bad?null:Math.round(mode);
 const idle='var(--sym-idle)',unk='var(--sym-unknown)';
 const accent=flt===true?'var(--sym-alarm)':w.color;
 const mainsOn=sel===0,battOn=sel===1,byOn=sel===2;
 const cIn=bad?unk:mainsOn?accent:idle,cBat=bad?unk:battOn?accent:idle,cBy=bad?unk:byOn?accent:idle,cOut=bad?unk:sel!==null?accent:idle;
 const anim=w.animated&&sel!==null;
 const fmtChg=chg===undefined?null:chg===null?'—':Math.round(chg)+'%';
 return <>
  <path d="M10 30H30" stroke={cIn} strokeWidth={mainsOn?4:2.6} strokeLinecap="round" strokeDasharray={bad?'4 3':mainsOn?'5 3':'5 3'} className={mainsOn&&anim?'flow':undefined}/>
  <path d="M90 30H110" stroke={cOut} strokeWidth={sel!==null?4:2.6} strokeLinecap="round" strokeDasharray={bad?'4 3':undefined}/>
  <path d="M14 30C14 8 106 8 106 30" fill="none" stroke={cBy} strokeWidth={byOn?3.4:2} strokeDasharray={byOn?'5 3':'5 3'} className={byOn&&anim?'flow':undefined}/>
  <Body><rect {...k.b} stroke={mainsOn||battOn?accent:c.line} x="30" y="16" width="60" height="46" rx="5"/></Body>
  <path d="M36 24h12M36 28h8" stroke="var(--sym-label)" strokeWidth="1.6" strokeLinecap="round"/>
  <path d="M60 22l-5 10h8l-5 10" fill="none" stroke={mainsOn||battOn?accent:'var(--sym-idle)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  <rect className={battOn?undefined:'zdial'} x="42" y="46" width="36" height="12" rx="2" fill={battOn?w.color+'33':'var(--chip)'} stroke={cBat} strokeWidth="1.8"/>
  <path d="M50 46V42M70 46V42" stroke={cBat} strokeWidth="2.4" strokeLinecap="round"/>
  {fmtChg!==null&&<text className="zt" x="60" y="55.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={battOn?accent:'var(--sym-label)'}>{fmtChg}</text>}
  {flt===true&&faultBadge(w.animated,96,14,7)}
 </>;
};
/* Inverter: kutu govde, DC duz cizgi / AC sinuzoid capraz bolunme; sinus yalniz calisirken akar. */
renderers['inverter']=(c)=>{
 const k=kit(c),{w,readings}=c;
 const run='running' in readings.bool?readings.bool.running:undefined;
 const flt='fault' in readings.bool?readings.bool.fault:undefined;
 const dc='dcVoltage' in readings.number?readings.number.dcVoltage:undefined;
 const ac='acPower' in readings.number?readings.number.acPower:undefined;
 const bad=run===null||flt===null;
 const tone=flt===true?'var(--sym-alarm)':bad?'var(--sym-unknown)':run===true?w.color:'var(--sym-idle)';
 const activeFlow=run===true&&w.animated&&flt!==true;
 const fmtDc=dc===undefined?null:dc===null?'—':Math.round(dc)+'V';
 const fmtAc=ac===undefined?null:ac===null?'—':Math.round(ac)+'kW';
 return <>
  <Body><rect {...k.b} stroke={tone} strokeDasharray={dash(bad,'6 4')} x="22" y="16" width="76" height="54" rx="6"/></Body>
  <path {...k.d} d="M28 22h64"/>
  <path d="M24 68L96 18" stroke={tone} strokeWidth="1.6" opacity=".6"/>
  <path d="M30 30H50" stroke={tone} strokeWidth="2.6" strokeLinecap="round"/>
  <path d="M30 36H46" stroke={tone} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="3 3"/>
  <path d="M58 58c4-12 8 12 12 0s8 12 12 0" fill="none" stroke={tone} strokeWidth="2.6" strokeLinecap="round" strokeDasharray={activeFlow?'5 3':undefined} className={activeFlow?'flow':undefined}/>
  {fmtDc!==null&&<text className="zt" x="28" y="48" fontSize="8" fill="var(--sym-label)">{fmtDc}</text>}
  {fmtAc!==null&&<text className="zt" x="64" y="44" fontSize="8" fill="var(--sym-label)">{fmtAc}</text>}
  {flt===true&&faultBadge(w.animated,90,26,7)}
 </>;
};
/* Gunes paneli: egik panel + hucre izgarasi + ayak; uretim power/min/max oranina gore parlar. */
renderers['pv-panel']=(c)=>{
 const k=kit(c),{w,readings,ratio}=c;
 const p='power' in readings.number?readings.number.power:undefined;
 const flt='fault' in readings.bool?readings.bool.fault:undefined;
 const bad=p===null,bound=p!==undefined;
 const localRatio=bound&&!bad?Math.max(0,Math.min(1,(p-w.min)/(w.max-w.min||1))):ratio;
 const tone=flt===true?'var(--sym-alarm)':bad?'var(--sym-unknown)':w.color;
 const lit=bound&&!bad&&localRatio>0;
 const fmtP=p===undefined?null:p===null?'—':Math.round(p)+'kW';
 return <>
  <path {...k.x} strokeWidth={2.4} d="M60 62V69M48 69H72"/>
  <Body><path {...k.b} stroke={tone} strokeDasharray={dash(bad)} d="M16 62L28 22H98L108 62Z"/></Body>
  {[0,1].map(row=>[0,1,2].map(col=>{const y=row===0?26:44,x0=31+col*22-row*4;return <path key={row+'-'+col} d={`M${x0} ${y}h18l-${row?4:3} 14h-18z`} fill={lit?w.color:'#3f5f86'} fillOpacity={lit?0.3+localRatio*0.7:.55} stroke="var(--sym-line)" strokeWidth=".8"/>;}))}
  <path d="M30 24l-3 10" stroke="#fff" strokeOpacity=".4" strokeWidth="1.4" strokeLinecap="round"/>
  {flt===true&&<g className={w.animated?'blink':undefined}><path d="M28 22L108 62" stroke="var(--sym-alarm)" strokeWidth="2.4"/>{faultBadge(false,100,28,7)}</g>}
  {fmtP!==null&&<text x="84" y="70" textAnchor="middle" fontSize="8" fontWeight="700" fill={tone}>{fmtP}</text>}
 </>;
};
/* Batarya: govde + kutup + doluluk seviyesi + yonlu ok (sarj/desarj). */
renderers['battery']=(c)=>{
 const k=kit(c),{w,readings}=c;
 const chg='charge' in readings.number?readings.number.charge:undefined;
 const pw='power' in readings.number?readings.number.power:undefined;
 const flt='fault' in readings.bool?readings.bool.fault:undefined;
 const bad=chg===null,bound=chg!==undefined;
 const ratio=bound&&!bad?Math.max(0,Math.min(1,(chg as number)/100)):0;
 const tone=flt===true?'var(--sym-alarm)':bad?'var(--sym-unknown)':bound?w.color:'var(--sym-idle)';
 const fmtChg=chg===undefined?null:chg===null?'—':Math.round(chg)+'%';
 const charging=typeof pw==='number'&&pw>0,discharging=typeof pw==='number'&&pw<0;
 return <>
  <Body><rect {...k.b} stroke={tone} strokeDasharray={dash(bad)} x="22" y="22" width="70" height="48" rx="6"/><rect {...k.p} x="92" y="37" width="7" height="18" rx="1.5"/></Body>
  <rect className="zdial" x="27" y="27" width="60" height="38" rx="3" fill="var(--chip)"/>
  <rect x="28" y={64-ratio*36} width="58" height={ratio*36} rx="2" fill={bound&&!bad?tone:'var(--chip)'} opacity=".85"/>
  <path {...k.d} d="M42 27v38M57 27v38M72 27v38"/>
  {charging&&<path d="M57 62V32M48 42L57 32L66 42" fill="none" stroke="var(--sym-fill)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>}
  {discharging&&<path d="M57 32V62M48 52L57 62L66 52" fill="none" stroke="var(--sym-fill)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>}
  {flt===true&&faultBadge(w.animated,92,24,7)}
  {fmtChg!==null&&<text className="zt" x="57" y="50" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--sym-fill)">{fmtChg}</text>}
 </>;
};
/* Enerji analizoru: panel tipi govde, ekran, V/I/P/E/f satirlari; bagsiz rol satiri yazilmaz. */
renderers['power-meter']=(c)=>{
 const k=kit(c),{readings}=c;
 const rows:[string,number|null|undefined][]=[['V','voltage' in readings.number?readings.number.voltage:undefined],['I','current' in readings.number?readings.number.current:undefined],['P','power' in readings.number?readings.number.power:undefined],['E','energy' in readings.number?readings.number.energy:undefined],['f','frequency' in readings.number?readings.number.frequency:undefined]];
 const shown=rows.filter(r=>r[1]!==undefined);
 return <>
  <Body><rect {...k.b} stroke={c.line} x="10" y="8" width="100" height="78" rx="6"/></Body>
  <rect className="zdial" x="17" y="22" width="86" height="58" rx="3" fill="var(--chip)" stroke={c.line} strokeWidth="1"/>
  <text className="zt" x="60" y="18" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--sym-label)">ANALİZÖR</text>
  {shown.map((r,i)=><text className="zt" key={r[0]} x="22" y={33+i*10.5} fontSize="8" fill="var(--sym-label)"><tspan fontWeight="700">{r[0]}</tspan>{': '+(r[1]===null?'—':Math.round((r[1] as number)*100)/100)}</text>)}
  {shown.length===0&&<text className="zt" x="60" y="54" textAnchor="middle" fontSize="9" fill="var(--sym-unknown)">—</text>}
 </>;
};
/* IEC sigorta: hat uzerinde seramik govde + metal baslik; atinca eleman kopar. */
renderers['fuse']=(c)=>{
 const k=kit(c),{w,readings}=c;
 const closed='closed' in readings.bool?readings.bool.closed:undefined;
 const trip='trip' in readings.bool?readings.bool.trip:undefined;
 const blown=trip===true,bad=closed===null||trip===null;
 const tone=blown?'var(--sym-alarm)':bad?'var(--sym-unknown)':closed===true?w.color:'var(--sym-idle)';
 return <>
  <path d="M12 45H36M84 45H108" stroke={tone} strokeWidth="3.2" strokeLinecap="round" strokeDasharray={dash(bad,'4 3')}/>
  <Body>
   <rect {...k.c} stroke={tone} strokeDasharray={dash(bad,'4 3')} x="40" y="34" width="40" height="22" rx="3"/>
   <rect {...k.p} x="34" y="32" width="8" height="26" rx="1.5"/>
   <rect {...k.p} x="78" y="32" width="8" height="26" rx="1.5"/>
  </Body>
  {blown?<g className={w.animated?'blink':undefined}><path d="M44 45H54M66 45H76" stroke="var(--sym-alarm)" strokeWidth="2.6"/><path d="M54 39L60 45L54 51" fill="none" stroke="var(--sym-alarm)" strokeWidth="2.2"/></g>
   :<path d="M44 45H76" stroke={tone} strokeWidth="2.6" strokeDasharray={dash(bad,'3 3')}/>}
 </>;
};
/* Ayirici: izolatorler + alt mafsalli bicak; acikken egik kalkar. */
renderers['disconnector']=(c)=>{
 const k=kit(c),{w,on,stroke,phase}=c;
 return <>
  <path d="M60 7V18M60 70V81" stroke={stroke} strokeWidth="3" strokeLinecap="round"/>
  <Body>
   <rect {...k.b} x="54" y="16" width="12" height="9" rx="2"/>
   <rect {...k.b} x="54" y="63" width="12" height="9" rx="2"/>
  </Body>
  <path {...k.d} d="M54 20.5h12M54 67.5h12"/>
  <circle {...k.p} cx="60" cy="27" r="3"/><circle {...k.p} cx="60" cy="61" r="3"/>
  <path d={on?'M60 61V27':'M60 61L82 32'} stroke={stroke} strokeWidth="3.4" strokeLinecap="round" style={{transition:'d var(--motion) var(--ease)'}}/>
  <path d="M46 34H38M46 44H38M46 54H38" stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
  {phase==='trip'&&<g className={w.animated?'blink':undefined}><path d="M84 8L77 22H86L77 36" fill="none" stroke="var(--sym-alarm)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></g>}
  {phase==='conflict'&&faultBadge(false,80,14,7)}
 </>;
};
