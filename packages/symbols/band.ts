import type {Widget} from '../contracts/model';
/* G46: isletme bandi (uyari + alarm limitleri) bugune kadar yalniz
 * dogrulanıyordu — tasarimci dort sayiyi giriyordu ve HICBIR sembol onlari
 * cizmiyordu. Ayar var, karsiligi yok demek, operatorun ekrana guvenini
 * bozar. Band burada tek yerde yorumlanir; olcum ve kap sembolleri ayni
 * tonu ve ayni isaretleri kullanir. */
export type BandTone='unknown'|'alarm'|'warn'|'normal';
/** Olculen degerin hangi banda dustugu. Deger okunamiyorsa 'unknown'. */
export function bandOf(w:Pick<Widget,'warnLow'|'warnHigh'|'limitLow'|'limitHigh'>,num:number|null):BandTone{
 if(num===null)return 'unknown';
 if((w.limitLow!==null&&num<w.limitLow)||(w.limitHigh!==null&&num>w.limitHigh))return 'alarm';
 if((w.warnLow!==null&&num<w.warnLow)||(w.warnHigh!==null&&num>w.warnHigh))return 'warn';
 return 'normal';
}
/** Bandin rengi; normalde sembolun kendi rengi, disinda uyari/alarm rengi. */
export function bandColor(tone:BandTone,color:string):string{
 return tone==='unknown'?'var(--sym-unknown)'
  :tone==='alarm'?'var(--sym-alarm)'
  :tone==='warn'?'var(--warn-text)':color;
}
export type BandMark={kind:'warn'|'limit';value:number;ratio:number};
/** Olcek uzerindeki isaretler; olcek disinda kalan sinir cizilmez. */
export function bandMarks(w:Pick<Widget,'warnLow'|'warnHigh'|'limitLow'|'limitHigh'|'min'|'max'>):BandMark[]{
 const span=(w.max-w.min)||1;
 const entries:[BandMark['kind'],number|null][]=[['limit',w.limitLow],['warn',w.warnLow],['warn',w.warnHigh],['limit',w.limitHigh]];
 const marks:BandMark[]=[];
 for(const [kind,value] of entries){
  if(value===null||value<w.min||value>w.max)continue;
  marks.push({kind,value,ratio:Math.max(0,Math.min(1,(value-w.min)/span))});
 }
 return marks;
}
/** Bu nesnede tanimlanmis bir sinir var mi. */
export function hasBand(w:Pick<Widget,'warnLow'|'warnHigh'|'limitLow'|'limitHigh'>):boolean{
 return w.warnLow!==null||w.warnHigh!==null||w.limitLow!==null||w.limitHigh!==null;
}
