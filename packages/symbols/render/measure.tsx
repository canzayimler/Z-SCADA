import type {Renderer,SymbolCtx} from './ctx';
import {kit,Body,led,spin,hpipe} from './kit';
/* 2026-11-18 olcum ailesi, "B · Endustriyel metal" dili. Gosterge: kadranli, 240 derece
 * olcek, ibre, isletme bandi bolgeleri (uyari sari, alarm kirmizi), ortada deger + birim.
 * Veri yoksa ibre cizilmez ve "—" yazar. Ibre ortak --motion-slow / --ease ile kayar. */
const P=(a:number,r:number,cx:number,cy:number):[number,number]=>[cx+r*Math.cos(a*Math.PI/180),cy-r*Math.sin(a*Math.PI/180)];
const f=(n:number)=>n.toFixed(1);
/** a1'den a2'ye (matematik acisi, saat yonunde azalarak) yay. */
function arc(a1:number,a2:number,r:number,cx:number,cy:number){const p=P(a1,r,cx,cy),q=P(a2,r,cx,cy);return `M${f(p[0])} ${f(p[1])}A${r} ${r} 0 ${Math.abs(a1-a2)>180?1:0} 1 ${f(q[0])} ${f(q[1])}`;}
const fmtNum=(c:SymbolCtx,n:number)=>c.w.decimals>=0?n.toFixed(Math.min(c.w.decimals,3)):String(Math.round(n*10)/10);

const gauge:Renderer=(c)=>{const k=kit(c),{w,num,ratio,stroke}=c;
 const cx=60,cy=52,r=24,span=(w.max-w.min)||1;
 const ang=(t:number)=>210-240*Math.max(0,Math.min(1,t));
 const rt=(v:number)=>(v-w.min)/span;
 /* Isletme bandi bolgeleri: alt/ust alarm (kirmizi) ve uyari (sari). Tanimsiz sinir cizilmez. */
 const zones:[number,number,string][]=[];
 if(w.limitLow!==null)zones.push([0,rt(w.limitLow),'var(--sym-alarm)']);
 if(w.warnLow!==null)zones.push([w.limitLow!==null?rt(w.limitLow):0,rt(w.warnLow),'var(--warn-text)']);
 if(w.warnHigh!==null)zones.push([rt(w.warnHigh),w.limitHigh!==null?rt(w.limitHigh):1,'var(--warn-text)']);
 if(w.limitHigh!==null)zones.push([rt(w.limitHigh),1,'var(--sym-alarm)']);
 const ticks=Array.from({length:11},(_,i)=>{const a=ang(i/10),p=P(a,r+4,cx,cy),q=P(a,r+(i%5?1:-1.5),cx,cy);return `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`;}).join('');
 const sp=c.setpoint!==null?ang(rt(c.setpoint)):null;
 const tip=P(210,r-3,cx,cy);
 return <>
  <Body><circle {...k.b} cx={cx} cy={cy} r="31"/></Body>
  <circle className="zbezel" cx={cx} cy={cy} r="29.4" fill="none" stroke="none"/>
  <circle className="zdial" cx={cx} cy={cy} r="27.5" fill="var(--chip)" stroke={stroke} strokeWidth="1" strokeOpacity=".5"/>
  <path className="zd" d={arc(210,-30,r,cx,cy)} fill="none" stroke="var(--sym-line)" strokeWidth="4" opacity=".9"/>
  {zones.filter(z=>z[1]>z[0]).map(([a,b,col],i)=><path key={i} d={arc(ang(a),ang(b),r,cx,cy)} fill="none" stroke={col} strokeWidth="4" opacity=".75"/>)}
  {num!==null&&ratio>0.004&&<path className="gauge-arc" d={arc(210,ang(ratio),r-5,cx,cy)} fill="none" stroke={c.bandFill} strokeWidth="2.4" strokeLinecap="round"/>}
  <path className="zd" d={ticks} fill="none" stroke={stroke} strokeWidth="1.2" opacity=".75"/>
  {sp!==null&&(()=>{const p=P(sp,r+5,cx,cy),q=P(sp,r-6,cx,cy);return <path d={`M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`} stroke="var(--sym-label)" strokeWidth="2" strokeDasharray="3 2"/>;})()}
  {num!==null&&<g style={{transform:`rotate(${(240*ratio).toFixed(2)}deg)`,transformOrigin:cx+'px '+cy+'px',transition:'transform var(--motion-slow) var(--ease)'}}><path d={`M${cx} ${cy}L${f(tip[0])} ${f(tip[1])}`} stroke={c.band==='normal'||c.band==='unknown'?'var(--sym-fill)':c.bandFill} strokeWidth="2.4" strokeLinecap="round"/></g>}
  <path className="zglass" d="M36 46A25 25 0 0 1 84 46A28 18 0 0 0 36 46Z"/>
  <circle cx={cx} cy={cy} r="3.8" fill={stroke}/>
  <circle cx={cx} cy={cy} r="1.5" fill="var(--chip)"/>
  <text className={c.band==='normal'||c.band==='unknown'?'zt':'zt zt-keep'} x={cx} y="76" textAnchor="middle" fill={c.band==='normal'||c.band==='unknown'?'var(--sym-fill)':c.bandFill} fontSize="10.5" fontWeight="700">{num===null?'—':fmtNum(c,num)+(w.unit?' '+w.unit:'')}</text>
 </>;
};

const levelBar:Renderer=(c)=>{const k=kit(c),{w,num,ratio}=c;
 const top=13,bottom=71,h=(num===null?0:ratio)*(bottom-top);
 const spr=c.setpoint!==null?Math.max(0,Math.min(1,(c.setpoint-w.min)/((w.max-w.min)||1))):null;
 const normal=c.band==='normal'||c.band==='unknown';
 return <>
  <Body><rect {...k.b} x="46" y="7" width="28" height="70" rx="6"/></Body>
  <rect className="zdial" x="51" y={top} width="18" height={bottom-top} rx="3" fill="var(--chip)" stroke={c.stroke} strokeWidth="1" strokeOpacity=".5"/>
  <rect className={normal?'zl':undefined} x="52" y={bottom-h} width="16" height={h} rx="2" fill={c.bandFill} fillOpacity={normal?.85:1}/>
  <rect className="zglass" x="52" y={top+1} width="5" height={bottom-top-2} rx="2"/>
  {c.bandTicks(51,18,bottom,bottom-top)}
  {spr!==null&&<path d={`M44 ${bottom-spr*(bottom-top)}L76 ${bottom-spr*(bottom-top)}`} stroke="var(--sym-label)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 2"/>}
  <path {...k.d} opacity={.9} d={[0,.25,.5,.75,1].map(t=>`M77 ${f(bottom-t*(bottom-top))}h${t%.5===0?8:5}`).join('')}/>
  <rect className="zdial" x="49" y="35" width="22" height="14" rx="3" fill="var(--chip)" opacity=".85"/>
  <text className="zt" x="60" y="46" textAnchor="middle" fill="var(--sym-fill)" fontSize="10" fontWeight="700">{num===null?'—':Math.round(ratio*100)+'%'}</text>
 </>;
};

const thermometer:Renderer=(c)=>{const k=kit(c),{w,num,ratio}=c;
 const top=13,bottom=57,h=(num===null?0:ratio)*(bottom-top);
 const spr=c.setpoint!==null?Math.max(0,Math.min(1,(c.setpoint-w.min)/((w.max-w.min)||1))):null;
 return <>
  <Body><rect {...k.b} x="51" y="7" width="18" height="56" rx="9"/><circle {...k.b} cx="60" cy="67" r="12"/></Body>
  <rect className="zdial" x="56" y={top-2} width="8" height={bottom-top+8} rx="4" fill="var(--chip)"/>
  <rect x="57" y={bottom-h} width="6" height={h+8} rx="3" fill={c.bandFill}/>
  <rect className="zglass" x="56.5" y={top-1} width="2.4" height={bottom-top+4} rx="1.2"/>
  <circle cx="60" cy="67" r="8.5" fill={c.bandFill} stroke={c.stroke} strokeWidth="1"/>
  {c.bandTicks(53,14,bottom,bottom-top)}
  {spr!==null&&<path d={`M48 ${bottom-spr*(bottom-top)}L72 ${bottom-spr*(bottom-top)}`} stroke="var(--sym-label)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 2"/>}
  <path {...k.d} opacity={.9} d={[0,.5,1].map(t=>`M70 ${f(bottom-t*(bottom-top))}h5`).join('')}/>
  <text x="60" y="70.5" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">{num===null?'—':Math.round(num)}</text>
 </>;
};

/* Debimetre: flansli govde, ustte verici kafasi, gozetleme penceresinde turbin. Gecen debi
 * bant disindaysa govde anahati bant renginde. */
const flowMeter:Renderer=(c)=>{const k=kit(c),{w,num,active}=c;
 const edge=c.band==='normal'||c.band==='unknown'?c.stroke:c.bandFill;
 return <>
  {hpipe(c,2,31,40,6)}{hpipe(c,118,89,40,6)}
  <Body>
   <rect {...k.c} stroke={edge} strokeWidth={c.band==='alarm'?3:2.2} x="30" y="27" width="60" height="26" rx="6"/>
   <rect {...k.p} className="zp zv" x="56" y="19" width="8" height="8"/>
   <rect {...k.b} x="44" y="10" width="32" height="10" rx="2.5"/>
  </Body>
  <rect className="zdial" x="49" y="12.5" width="15" height="5" rx="1" fill="var(--chip)"/>
  {led(c,70,15,1.8)}
  <circle className="zdial" cx="60" cy="40" r="9.5" fill="var(--chip)" stroke={c.stroke} strokeWidth="1"/>
  {spin(c,60,40,<path d="M52 40h16M60 32v16" stroke={c.stroke} strokeWidth="2" strokeLinecap="round"/>,true,active)}
  <circle cx="60" cy="40" r="2.6" fill={c.stroke}/>
  <text x="60" y="95" textAnchor="middle" fontSize="10" fill="var(--sym-label)">{w.labelVisible!==false?w.label:''}{num!==null?' · '+Math.round(num*10)/10:''}</text>
 </>;
};

const value:Renderer=(ctx)=>{const{w,value,good}=ctx;return {html:<div className={'symbol-value '+(w.type==='numeric-input'?'numeric-input-symbol':'')}>{w.labelVisible!==false&&<span>{w.label}</span>}<strong style={{fontSize:w.fontSize||undefined,color:ctx.band==='normal'||ctx.band==='unknown'?undefined:ctx.bandFill}}>{good?(typeof value==='number'&&w.decimals>=0?value.toFixed(w.decimals):String(value)):'—'}{w.unit&&<small> {w.unit}</small>}</strong>{ctx.setpoint!==null&&<small className="symbol-setpoint">hedef {w.decimals>=0?ctx.setpoint.toFixed(w.decimals):ctx.setpoint} {w.unit}</small>}{w.type==='numeric-input'&&<small className="numeric-edit-hint">✎ Değer gir</small>}</div>};};

export const renderers:Record<string,Renderer>={gauge,'level-bar':levelBar,thermometer,'flow-meter':flowMeter,value,'numeric-input':value};
/* Kurumsal veri karti: ayni canli degeri pencere, kart veya kompakt satir
 * olarak gosterir. Kullanici yuzey renklerini ayarlar; kötü/bayat veri ise
 * sol durum rayi ve acik durum metniyle her zaman ayirt edilir. */
renderers['data-card']=(ctx)=>{
 const{w,value,good,on,quality,band,bandFill,variant}=ctx;
 const danger=quality==='bad',waiting=!good&&!danger;
 const accent=danger?'var(--sym-alarm)':waiting?'var(--warn-text)':band==='alarm'||band==='warn'?bandFill:
  typeof value==='boolean'?(on?w.color:(w.offColor||'var(--sym-idle)')):w.color;
 const reading=good?(typeof value==='number'&&w.decimals>=0?value.toFixed(w.decimals):typeof value==='boolean'?(value?w.onText:w.offText):String(value)):'—';
 const status=!w.tagId?'Etiket bağlanmadı':good?'Güncel':quality==='stale'?'Veri güncel değil':danger?'Okuma hatası':'Veri yok';
 const surface=w.fillColor||'var(--card)',border=w.borderColor||'var(--line-strong)',text=w.textColor||'var(--txt)',icon=w.iconColor||accent;
 return {html:<div className={'symbol-data-card '+variant+' '+quality} style={{background:surface,borderColor:border,color:text,boxShadow:`inset 5px 0 0 ${accent}`}}>
  <div className="data-card-icon" style={{color:icon,borderColor:border}} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 12h4l2.2-6 4.1 12 2.3-6H21"/></svg></div>
  <div className="data-card-copy">{w.labelVisible!==false&&<span style={{fontSize:w.fontSize||undefined,fontWeight:w.fontWeight,textAlign:w.textAlign}}>{w.label}</span>}<small>{status}</small></div>
  <div className="data-card-reading"><strong>{reading}</strong>{good&&typeof value==='number'&&w.unit&&<small>{w.unit}</small>}</div>
 </div>};
};
/* G31: ISA-5.1 olcum balonu. Harf kodu ve cevrim numarasi nesne etiketinden
 * ("FT-101") okunur; ayri bir alan istemez. Montaj yeri varyanttan gelir:
 * sahada cizgisiz, panoda tam cizgi, pano arkasinda kesikli cizgi, DCS'te
 * yuvarlak kose kare. Isletme bandi (G42) verilmisse limit disi deger
 * yalniz renkle degil, halka + "!" ile de gosterilir. */
renderers['instrument']=(ctx)=>{
 const{w,num,variant}=ctx;
 const raw=(w.label||'').trim();
 const at=raw.search(/[-_ ]/);
 const code=at>0?raw.slice(0,at):raw,loop=at>0?raw.slice(at+1):'';
 const low=w.limitLow,high=w.limitHigh,warnLow=w.warnLow,warnHigh=w.warnHigh;
 const outOfLimit=num!==null&&((low!==null&&num<low)||(high!==null&&num>high));
 const outOfWarn=num!==null&&!outOfLimit&&((warnLow!==null&&num<warnLow)||(warnHigh!==null&&num>warnHigh));
 const tone=num===null?'var(--sym-unknown)':outOfLimit?'var(--sym-alarm)':outOfWarn?'var(--warn-text)':w.color;
 const text=num===null?'—':(w.decimals>=0?num.toFixed(w.decimals):String(Math.round(num*100)/100));
 return <>
  <g className="zbody">{variant==='dcs'
   ?<rect className="zdial" x="28" y="14" width="64" height="64" rx="14" fill="var(--chip)" stroke={tone} strokeWidth="2.6"/>
   :<circle className="zdial" cx="60" cy="46" r="32" fill="var(--chip)" stroke={tone} strokeWidth="2.6"/>}</g>
  {variant==='dcs'
   ?<path className="zglass" d="M31 28A10 10 0 0 1 41 17H79A10 10 0 0 1 89 28V36C72 31 48 31 31 36Z"/>
   :<path className="zglass" d="M33 39A28 28 0 0 1 87 39A30 20 0 0 0 33 39Z"/>}
  {variant==='panel'&&<path d="M28 46L92 46" stroke={tone} strokeWidth="2.2" strokeLinecap="round"/>}
  {variant==='behind'&&<path d="M28 46L92 46" stroke={tone} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="6 4"/>}
  {variant==='dcs'&&<path d="M28 46L92 46" stroke={tone} strokeWidth="2.2" strokeLinecap="round"/>}
  <text className="zt" x="60" y={loop?42:50} textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--sym-fill)">{code||'??'}</text>
  {!!loop&&<text className="zt" x="60" y="60" textAnchor="middle" fontSize="13" fill="var(--sym-fill)">{loop}</text>}
  <text x="60" y="93" textAnchor="middle" fontSize="12" fontWeight="700" fill={tone}>{text}{num!==null&&w.unit?' '+w.unit:''}</text>
  {outOfLimit&&<g className={w.animated?'blink':''}><circle cx="86" cy="22" r="8" fill="var(--sym-alarm)"/><text x="86" y="26.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">!</text></g>}
  {outOfWarn&&<circle cx="86" cy="22" r="7" fill="none" stroke="var(--warn-text)" strokeWidth="2.2"/>}
 </>;
};
