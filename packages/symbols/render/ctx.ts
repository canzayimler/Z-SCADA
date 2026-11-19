import type {ReactNode} from 'react';
import type {Widget,Part} from '../../contracts/model';
import type {Phase,BindingReadings} from '../states';
import type {BandTone} from '../band';
import type {AlarmEvent} from '../../contracts/model';
/* G37/G38/G39: bazi nesneler tek bir etiket ornegiyle cizilemez — gecmis
 * veri, alarm listesi ve etiket sozlugu ister. Bu kanal ISTEGE BAGLIDIR:
 * saglanmadiginda ilgili nesne "veri kaynagi yok" halini cizer, patlamaz.
 * Tasima ayrintisi (fetch/api) buraya girmez; cagiran taraf enjekte eder. */
export type HistoryPoint={at:number;value:number|null;quality:string};
export type SymbolLive={
 alarms?:AlarmEvent[];
 /** Alarm onayi; verilmezse liste salt okunur cizilir. */
 ack?:(alarmId:string)=>void;
 /** Gecmis veri; verilmezse trend "gecmis yok" cizer. */
 history?:(tagIds:string[],from:number,to:number)=>Promise<Record<string,HistoryPoint[]>>;
 /** Etiket kimliginden okunabilir bilgi. */
 tagInfo?:(tagId:string)=>{code:string;name:string;unit:string}|undefined;
 /** Nesnenin salt okunur cizilmesi gerekiyor mu (tasarim/onizleme). */
 editor?:boolean;
 /** G44/G45: sayisal yazma. Verilmezse kumanda nesnesi salt gosterge cizilir. */
 write?:(widget:Widget,value:number)=>void;
 /** Komut neden gonderilemiyor (bos = gonderilebilir). */
 blocked?:(widget:Widget)=>string;
};
export type Reading={value:boolean|number|null;quality:string};
export type SymbolCtx={
 w:Widget;value?:boolean|number|null;quality:string;selected:boolean;samples?:Record<string,Reading>;
 good:boolean;on:boolean;unknown:boolean;stroke:string;active:boolean;body:string;line:string;
 num:number|null;ratio:number;label:ReactNode;rotor:ReactNode;feet:ReactNode;
 dial:(cx:number,cy:number,r:number)=>ReactNode;
 parts:Part[];analog:boolean;state:{known:boolean;index:number};partIndex:number;
 lit:(i:number)=>boolean;partsReady:boolean;
 /* A1/G07/G08/G22: cok bagli ekipmanin isletme durumu. `null` ise saha bagi
  * yok demektir ve `on`/`stroke`/`active` eski tekil etiket davranisini
  * tasir; doluysa bu alanlar zaten faza gore hesaplanmis olarak gelir. */
 phase:Phase|null;readings:BindingReadings;
 /** Gecerli govde varyanti; tur varyantsizsa bos metin. */
 variant:string;
 /* G46: isletme bandi. `band` olculen degerin dustugu bant, `bandFill`
  * o banda gore deger rengi, `bandTicks` olcek uzerindeki sinir isaretleri,
  * `setpoint` ise bagli hedef degerdir (yoksa null). */
 band:BandTone;bandFill:string;
 bandTicks:(x:number,width:number,bottom:number,height:number)=>ReactNode;
 bandArc:(cx:number,cy:number,r:number)=>ReactNode;
 setpoint:number|null;
 /** Canli veri kanali; yoksa undefined. */
 live?:SymbolLive;
};
/** SVG govdesi dondurur, ya da {html} ile <svg> sarmalayicisini atlar. */
export type Rendered=ReactNode|{html:ReactNode};
export type Renderer=(c:SymbolCtx)=>Rendered;
