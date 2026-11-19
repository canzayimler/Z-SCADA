/* GÖSTERGE grubu kütüphane önizlemeleri (K-lib): trend/pid/alarm-band/alarm-list/
 * data-table gerçek render'ları büyük (420x240 gibi) ve legend/tablo içerir;
 * kütüphanenin 74x52'lik kartına oturtulsa bile okunmaz bir leke olur. Bu
 * dosya o beş tür icin AMACA CIZILMIS, sade, tek renkli glifler tasir —
 * gercek cizimin (render/live.tsx, render/controls.tsx) yerine gecmez, yalniz
 * Library.tsx'teki kart onizlemesinde kullanilir. Studio tuvalindeki gercek
 * nesne bundan etkilenmez.
 */
import type {ReactElement} from 'react';
const box={viewBox:'0 0 74 52',width:'100%',height:'100%',fill:'none',stroke:'currentColor','aria-hidden':true} as const;

/** trend → eksen + tek dalgali sparkline. */
export function TrendGlyph(){
 return <svg {...box}><g strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 8V44H66" strokeOpacity=".45"/><path d="M10 34L22 22L32 30L44 12L56 24L66 16"/></g></svg>;
}

/** alarm-band → tek yatay serit + sol tarafta durum noktasi. */
export function AlarmBandGlyph(){
 return <svg {...box}><g strokeWidth="2" strokeLinecap="round"><rect x="8" y="19" width="58" height="14" rx="3" strokeOpacity=".45"/><circle cx="17" cy="26" r="3.5" fill="currentColor" stroke="none"/><path d="M27 26H58"/></g></svg>;
}

/** alarm-list → uc satir, her satir kucuk nokta + iki cizgi. */
export function AlarmListGlyph(){
 const row=(y:number)=><g key={y} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy={y} r="2.6" fill="currentColor" stroke="none"/><path d={'M20 '+(y-3)+'H48'}/><path d={'M20 '+(y+3)+'H40'} strokeOpacity=".45"/></g>;
 return <svg {...box}>{[13,26,39].map(row)}</svg>;
}

/** data-table → 2x3 izgara, ust satir baslik (koyu/dolu). */
export function DataTableGlyph(){
 return <svg {...box}><g strokeWidth="1.6" strokeLinejoin="round"><rect x="8" y="10" width="58" height="32" rx="2"/><path d="M8 21H66M8 32H66M27 10V42M46 10V42"/><rect x="9" y="11" width="56" height="10" fill="currentColor" fillOpacity=".25" stroke="none"/></g></svg>;
}

/** pid → PV/SP/OUT icin uc kisa dikey cubuk, taban cizgisi. */
export function PidGlyph(){
 return <svg {...box}><g strokeWidth="2" strokeLinecap="round"><path d="M8 42H66" strokeOpacity=".45"/><path d="M20 42V16"/><path d="M37 42V24"/><path d="M54 42V32"/></g></svg>;
}

/** GÖSTERGE grubu icin tur -> glif esleme; tile() burdan okur. */
export const indicatorGlyphs:Record<string,()=>ReactElement>={
 trend:TrendGlyph,'alarm-band':AlarmBandGlyph,'alarm-list':AlarmListGlyph,'data-table':DataTableGlyph,pid:PidGlyph};
