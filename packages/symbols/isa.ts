import {groupOfType} from './catalog';
/* --- ISA-101 yuksek performansli HMI sembol stili --------------------------
 * Normal isletme gri tonlarla cizilir; renk yalniz anormal durumda (alarm,
 * uyari, bilinmiyor) gorunur. Bu durum renkleri sembol cizicilerinde zaten
 * sabit degiskenlerdir (--sym-alarm, --warn-text, --sym-unknown), bu yuzden
 * burada yalniz nesnenin kendi aktif/bosta rengi degistirilir.
 *
 * Donusum CIZIM ANINDADIR: kayitli nesne verisine dokunulmaz, stil kapatilinca
 * kullanicinin sectigi renkler aynen geri gelir. Cizicilerin cogu renge hex
 * saydamlik eki yapistirdigi icin (w.color+'14') degerler CSS degiskeni degil
 * gercek hex olmak zorundadir; tema ayrimi da bu yuzden burada yapilir.
 */
export type SymbolStyle='classic'|'isa101'|'detailed';
/** Rengi kullanicinin bilincli sectigi gruplar; stil bunlara dokunmaz. */
const exemptGroups=new Set(['BUTON & ANAHTAR','LAMBA & SİNYAL','GÖSTERGE','YERLEŞİM']);
const palette={
 light:{active:'#3f464e',idle:'#b9bec5'},
 dark:{active:'#d0d4d9',idle:'#5a6068'}};
export function isaApplies(type:string){return !exemptGroups.has(groupOfType(type)||'');}
export function styledWidget<W extends {type:string;color:string;offColor:string}>(w:W,style:SymbolStyle|undefined,theme:'light'|'dark'='light'):W{
 if(style!=='isa101'||!isaApplies(w.type))return w;
 const p=palette[theme];
 return {...w,color:p.active,offColor:p.idle};
}
/**
 * Sabit arka plan rengi olan tuval kendi temasini tasir: beyaz zeminde koyu
 * yazi, koyu zeminde acik yazi. Aksi halde koyu uygulama temasinda ekran
 * metinleri beyaz zeminde kaybolur (ve tersi). Bos arka plan uygulamayi izler.
 */
export function surfaceTheme(background:string,fallback:'light'|'dark'):'light'|'dark'{
 const m=/^#([0-9a-f]{6})$/i.exec(background||'');
 if(!m)return fallback;
 const n=parseInt(m[1],16),ch=[n>>16&255,n>>8&255,n&255].map(v=>{const s=v/255;return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4;});
 const lum=0.2126*ch[0]+0.7152*ch[1]+0.0722*ch[2];
 return lum>0.35?'light':'dark';
}
