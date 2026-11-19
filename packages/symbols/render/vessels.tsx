import type {ReactNode} from 'react';
import type {Renderer,SymbolCtx} from './ctx';
import {kit,Body,hpipe,vpipe,spin} from './kit';
/* 2026-11-18 kaplar, "B · Endustriyel metal" dili: metal govde, kirpilmis sivi (Detayli'da
 * sivi degradesi), seviye cizgisi, cetvel ve ICINDE seviye yuzdesi + birimli deger.
 * Veri yoksa sivi cizilmez ve "—" yazar (uydurma seviye gosterilmez). Bant (G46) asildiginda
 * sivi bant renginde dolar. Kirpma kimligi nesne kimligiyle tekildir (ayni ekranda cakismaz). */
/** Sivi/dolum: bant normalse Detayli'da sivi degradesi (zl), asilmissa bant rengi. */
const liquid=(c:SymbolCtx,x:number,y:number,width:number,height:number)=>{
 const normal=c.band==='normal'||c.band==='unknown';
 return <rect className={normal?'zl':undefined} x={x} y={y} width={width} height={height} fill={c.bandFill} fillOpacity={normal?.28:.5}/>;
};
/** Seviye yuzdesi (buyuk) + birimli deger (kucuk). */
function levelText(c:SymbolCtx,x:number,y:number,big=15):ReactNode{
 const {w,num,ratio}=c;
 if(num===null)return <text className="zt" x={x} y={y} textAnchor="middle" fill="var(--sym-fill)" fontSize={big} fontWeight="600">—</text>;
 const value=w.decimals>=0?num.toFixed(Math.min(w.decimals,2)):String(Math.round(num*10)/10);
 return <><text className="zt" x={x} y={y} textAnchor="middle" fill="var(--sym-fill)" fontSize={big} fontWeight="700">{Math.round(ratio*100)+' %'}</text>
  {w.unit?<text className="zt" x={x} y={y+11} textAnchor="middle" fill="var(--sym-fill)" fontSize="8.5" fontWeight="600" opacity=".8">{value+' '+w.unit}</text>:null}</>;
}
/** Kirpilmis sivi + seviye cizgisi. `top`..`bottom` ic yukseklik. */
function fill(c:SymbolCtx,id:string,shape:string,x:number,width:number,top:number,bottom:number){
 const h=(c.num===null?0:c.ratio)*(bottom-top),y=bottom-h;
 return <><clipPath id={id}><path d={shape}/></clipPath><g clipPath={`url(#${id})`}>{liquid(c,x,y,width,h)}<path className="level-line" d={`M${x} ${y}L${x+width} ${y}`} stroke={c.w.color} strokeWidth="1.8" strokeLinecap="round" opacity={c.num===null?0:.9}/></g></>;
}
const ruler=(c:SymbolCtx,x:number,top:number,bottom:number)=>{const k=kit(c),n=5,step=(bottom-top)/n;
 return <path {...k.d} d={Array.from({length:n+1},(_,i)=>`M${x} ${(top+i*step).toFixed(1)}h${i%n===0||i===Math.round(n/2)?-6:-3.5}`).join('')}/>;};

const tank:Renderer=(c)=>{const k=kit(c),{w,variant}=c;
 if(variant==='cone'){const s='M30 20Q60 6 90 20V50L64 68H56L30 50Z';return <>
  {vpipe(c,6,14,60,4,false)}{vpipe(c,78,68,60,4,false)}
  <path {...k.x} d="M33 52l-3 24M87 52l3 24"/>
  <Body><path {...k.b} d={s}/></Body>{fill(c,'cc'+w.id,s,30,60,13,68)}<path {...k.o} d={s}/>
  {ruler(c,88,22,48)}{levelText(c,60,38)}</>;}
 if(variant==='jacketed'){const s='M34 20Q60 8 86 20V64a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4Z';return <>
  {vpipe(c,6,14,60,4,false)}{vpipe(c,78,72,60,4,false)}
  <Body><path {...k.b} d="M28 30H92V66a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6Z"/><path {...k.b} d={s}/></Body>
  {fill(c,'cj'+w.id,s,34,52,14,68)}<path {...k.o} d={s}/>
  {hpipe(c,26,29,36,2.5,false)}{hpipe(c,94,91,64,2.5,false)}
  <path {...k.d} strokeDasharray="2 2.5" d="M31 34V64M89 34V64"/>
  {ruler(c,84,24,64)}{levelText(c,60,44)}</>;}
 if(variant==='open'){const s='M30 18V64a6 6 0 0 0 6 6H84a6 6 0 0 0 6-6V18Z';return <>
  {vpipe(c,6,22,60,4,false)}{vpipe(c,78,70,60,4,false)}
  <Body><path {...k.b} d={s}/></Body>{fill(c,'co'+w.id,s,30,60,22,70)}
  <path {...k.o} d="M30 18V64a6 6 0 0 0 6 6H84a6 6 0 0 0 6-6V18"/>
  <path {...k.x} strokeWidth={2.4} d="M26 18h8M86 18h8"/>
  {ruler(c,88,26,66)}{levelText(c,60,46)}</>;}
 const s='M30 20Q60 6 90 20V68a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4Z';
 return <>
  {vpipe(c,6,14,60,4,false)}{vpipe(c,78,72,60,4,false)}
  <path {...k.x} d="M36 72v5M84 72v5"/>
  <Body><path {...k.b} d={s}/></Body>
  {fill(c,'c'+w.id,s,30,60,14,72)}
  <path {...k.o} d={s}/>
  {c.bandTicks(30,60,72,58)}
  {ruler(c,88,24,68)}
  {levelText(c,60,46)}
 </>;
};

const silo:Renderer=(c)=>{const k=kit(c),{w}=c;const s='M32 22L60 13L88 22V54L64 76H56L32 54Z';return <>
 {vpipe(c,8,16,60,4,false)}{vpipe(c,90,76,60,4,false)}
 <path {...k.x} d="M34 54l-4 34M86 54l4 34M31 70h58"/>
 <Body><path {...k.b} d={s}/></Body>
 {fill(c,'s'+w.id,s,32,56,14,76)}<path {...k.o} d={s}/>
 {c.bandTicks(32,56,76,62)}
 {ruler(c,86,28,52)}{levelText(c,60,42)}
</>;};

const vessel:Renderer=(c)=>{const k=kit(c),{w}=c;const s='M38 24H82A20 20 0 0 1 82 64H38A20 20 0 0 1 38 24Z';return <>
 {hpipe(c,12,19,44,4,false)}{hpipe(c,108,101,44,4,false)}
 <rect {...k.p} className="zp zv" x="56" y="20" width="8" height="5"/>
 <path {...k.b} d="M30 62l-4 12h16l-4-12zM82 62l-4 12h16l-4-12z"/>
 <Body><path {...k.b} d={s}/></Body>
 {fill(c,'v'+w.id,s,18,84,24,64)}<path {...k.o} d={s}/>
 {c.bandTicks(18,84,64,40)}
 {levelText(c,60,46,14)}
</>;};

/* G01: kolon/kule. Elips kapaklar, tepsiler gorsel ipucu; dolum govdede. */
const column:Renderer=(c)=>{const k=kit(c),{w}=c;const s='M42 20a18 7 0 0 1 36 0V80a18 7 0 0 1-36 0Z';return <>
 {vpipe(c,4,13,60,4,false)}{vpipe(c,96,87,60,4,false)}{hpipe(c,20,42,50,4,false)}{hpipe(c,100,78,60,4,false)}
 <Body><path {...k.b} d={s}/></Body>
 {fill(c,'col'+w.id,s,42,36,14,86)}<path {...k.o} d={s}/>
 <path {...k.d} strokeDasharray="4 3" d="M45 28H75M45 40H75M45 64H75M45 76H75"/>
 {levelText(c,60,56,12)}
</>;};

/* G01: huni. Malzeme dolumu tabana dogru; cikis dar boyun. */
const hopper:Renderer=(c)=>{const k=kit(c),{w}=c;const s='M22 12H98V40L68 78H52L22 40Z';return <>
 {vpipe(c,6,12,60,4,false)}{vpipe(c,94,86,60,4,false)}
 <Body><rect {...k.b} x="53" y="77" width="14" height="10" rx="1"/><path {...k.b} d={s}/></Body>
 {fill(c,'hp'+w.id,s,22,76,12,78)}<path {...k.o} d={s}/>
 <path {...k.d} d="M24 18H96"/>
 {levelText(c,60,34,13)}
</>;};

/* G01: varil. Bandaj halkalari yalniz gorsel; dolum tank ile ayni mantik. */
const drum:Renderer=(c)=>{const k=kit(c),{w}=c;const s='M32 14a4 4 0 0 1 4-4H84a4 4 0 0 1 4 4V86a4 4 0 0 1-4 4H36a4 4 0 0 1-4-4Z';return <>
 {vpipe(c,4,10,60,3.5,false)}{vpipe(c,96,90,60,3.5,false)}
 <Body><path {...k.b} d={s}/></Body>
 {fill(c,'dr'+w.id,s,32,56,10,90)}<path {...k.o} d={s}/>
 <path {...k.x} strokeWidth={2.4} d="M32 32h56M32 68h56"/>
 {levelText(c,60,54,13)}
</>;};

/* G01: siklon. Silindir-koni govde; teget giris (14,24). Sarmal iz yalniz calisirken doner. */
const cyclone:Renderer=(c)=>{const k=kit(c),{w,active}=c;return <>
 {hpipe(c,14,35,24,5)}{vpipe(c,4,13,60,6)}{vpipe(c,96,84,60,4)}
 <Body><path {...k.b} d="M34 13H86V44L66 84H54L34 44Z"/></Body>
 <path {...k.d} d="M34 44H86"/>
 <rect {...k.p} className="zp zv" x="54" y="13" width="12" height="16"/>
 {spin(c,60,46,<path d="M42 34Q56 52 78 36M48 52Q60 64 72 52" fill="none" stroke={w.color} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="5 3" opacity={active?.9:.35}/>)}
</>;};

export const renderers:Record<string,Renderer>={tank,silo,vessel,column,hopper,drum,cyclone};
