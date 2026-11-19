import type {ReactNode} from 'react';
import type {SymbolCtx} from './ctx';
/* --- Ortak sembol kiti (2026-11-18, "B · Endustriyel metal" dili) -----------
 * Ayni geometri uc stilde cizilir; stil secimi CIZIMI degil KAPLAMAYI belirler:
 *  - Klasik: oznitelik renkleri (govde = --sym-body, anahat = durum rengi).
 *  - ISA-101: isa.ts nesne renklerini griye cevirir, geometri ayni.
 *  - Detayli: motion.css `.sym-detailed` altinda asagidaki SINIF adlarini
 *    metal/doküm/boru degradeleriyle boyar (CSS, SVG ozniteligini ezer).
 * Degrade/filtre tanimlari sembol basina TEKRARLANMAZ; tuval basina tek gizli
 * <defs> (defs.tsx). Sinif sozlugu:
 *  zb govde (metal) · zc dokum govde · zp boru/mil/makara · zd ic detay ·
 *  zx kaide/mekanik cizgi · zo ici bos anahat · zl sivi/dolum · zdial kadran ·
 *  zt govde ustu yazi · zbody golge alan grup · zled durum isigi (zhalo parilti). */
export type Kit=ReturnType<typeof kit>;
export function kit(c:SymbolCtx){
 const s=c.stroke,w=c.w;
 /** Calisirken govdeye hafif durum tonu (Klasik); Detayli'da dokum degradesi ezer. */
 const tint=c.on?w.color+'1f':'var(--chip)';
 return {
  s,tint,
  b:{className:'zb',fill:c.body,stroke:s,strokeWidth:2.2},
  c:{className:'zb zc',fill:tint,stroke:s,strokeWidth:2.2},
  p:{className:'zp',fill:c.body,stroke:s,strokeWidth:1.6},
  d:{className:'zd',fill:'none',stroke:s,strokeWidth:1.4,strokeLinecap:'round' as const,opacity:.6},
  x:{className:'zx',fill:'none',stroke:s,strokeWidth:1.8,strokeLinecap:'round' as const},
  o:{className:'zo',fill:'none',stroke:s,strokeWidth:2.2},
 };
}
/** Golge alan govde grubu (Detayli'da tek filtre; filtre sayisi sembol basina bir). */
export const Body=({children}:{children:ReactNode})=><g className="zbody">{children}</g>;
/** Durum isigi: Klasik'te durum renginde nokta; Detayli'da calisirken parlar (filtresiz hale). */
export const led=(c:SymbolCtx,cx:number,cy:number,r=2.8)=><g className="zled"><circle className="zhalo" cx={cx} cy={cy} r={r*2.2} fill={c.stroke} opacity="0"/><circle cx={cx} cy={cy} r={r} fill={c.stroke}/></g>;
/** Donen parca; ortak .rotor egrisi (motion.css yumusak kalkis) kullanilir. */
export const spin=(c:SymbolCtx,cx:number,cy:number,children:ReactNode,fast=false,on=c.active)=><g className={on?'rotor'+(fast?' fast':''):undefined} style={{transformOrigin:cx+'px '+cy+'px'}}>{children}</g>;
/** Akis cizgisi: yalniz calisirken; desen 16 birim, ortak `flow` kaymasina (32) tam oturur. */
export const flowLine=(c:SymbolCtx,d:string,on=c.active,color=c.w.color)=>on?<path className="flow zf" d={d} fill="none" stroke={color} strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" opacity=".9" style={{animationDirection:c.w.reverse?'reverse':'normal'}}/>:null;
/** Yatay boru agzi. Agiz ucu (port) `xp`'de biter; flans o uctadir. `xb` govdeye giris. */
export function hpipe(c:SymbolCtx,xp:number,xb:number,y:number,hw=5,on=c.active){
 const k=kit(c),x=Math.min(xp,xb),len=Math.abs(xb-xp),fx=xp<xb?xp:xp-3;
 return <><rect {...k.p} x={x} y={y-hw} width={len} height={hw*2}/><rect {...k.p} x={fx} y={y-hw-3} width="3" height={hw*2+6} rx=".8"/>{flowLine(c,`M${x+1} ${y}H${x+len-1}`,on)}</>;
}
/** Dikey boru agzi; ayni dil. */
export function vpipe(c:SymbolCtx,yp:number,yb:number,x:number,hw=5,on=c.active){
 const k=kit(c),y=Math.min(yp,yb),len=Math.abs(yb-yp),fy=yp<yb?yp:yp-3;
 return <><rect {...k.p} className="zp zv" x={x-hw} y={y} width={hw*2} height={len}/><rect {...k.p} x={x-hw-3} y={fy} width={hw*2+6} height="3" rx=".8"/>{flowLine(c,`M${x} ${y+1}V${y+len-1}`,on)}</>;
}
/** Govde ustu deger yazisi (Detayli'da metal uzerinde koyu kalir). */
export const val=(x:number,y:number,text:ReactNode,size=12,weight=700,fill='var(--sym-fill)')=><text className="zt" x={x} y={y} textAnchor="middle" fontSize={size} fontWeight={weight} fill={fill}>{text}</text>;
/** Uc kanatli cark (pompa/fan/kompresor icin degil — her tur kendi siluetini cizer; bu ince cark karistirici/santrifuj gibi ic parcalar icin). */
export function impeller(c:SymbolCtx,cx:number,cy:number,r:number){
 const k=kit(c),a=r*.62,blade=`M${cx} ${cy}q${(r*.25).toFixed(1)} ${(-r*.15).toFixed(1)} ${(r*.42).toFixed(1)} ${(-r*.9).toFixed(1)}`;
 return spin(c,cx,cy,<><path {...k.d} opacity={1} d={blade}/><path {...k.d} opacity={1} d={blade} transform={`rotate(120 ${cx} ${cy})`}/><path {...k.d} opacity={1} d={blade} transform={`rotate(240 ${cx} ${cy})`}/><circle {...k.p} cx={cx} cy={cy} r={Math.max(2,a*.35)}/></>);
}
/** Ayri ariza rozeti (bag ile gelen fault/trip/lockout); Symbol.tsx veri rozetiyle cakismasin diye konumu verilir. */
export const faultBadge=(animated:boolean,cx=104,cy=16,r=8)=><g className={animated?'blink':undefined}><circle cx={cx} cy={cy} r={r} fill="var(--sym-alarm)"/><text x={cx} y={cy+r*.5} textAnchor="middle" fontSize={r*1.4} fontWeight="800" fill="#fff">!</text></g>;
