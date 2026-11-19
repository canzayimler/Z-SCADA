/* G48: etiket ve komut secimi acilir listeyle yapiliyordu. On etiketle
 * calisir, bin etiketle calismaz: operator/tasarimci listeyi kaydirarak
 * adres arar. Secim artik aranarak yapilir ve liste kisa tutulur; asagidaki
 * siralama "yazdigim kod once gelsin" beklentisini karsilar.
 *
 * Turkce kucuk harf onemlidir: "İ" -> "i", "I" -> "ı". Ingilizce katlama
 * "ISI" ile "ısı" yi ayri sayar ve arama bos doner. */
/** group: secenekler arama bosken bu baslik altinda toplanir (orn. etiketin cihazi). */
export type PickOption={value:string;label:string;hint?:string;group?:string};
/** Arama bosken gruplu listeyi grup ilk gorulme sirasina gore dizer; grup ici sira korunur. */
export function groupOrder(items:readonly PickOption[]):PickOption[]{
 const first=new Map<string,number>();
 items.forEach((o,i)=>{const g=o.group??'';if(!first.has(g))first.set(g,i);});
 return items.map((o,i)=>({o,i})).sort((a,b)=>first.get(a.o.group??'')!-first.get(b.o.group??'')!||a.i-b.i).map(x=>x.o);
}
export function fold(text:string):string{
 return text.toLocaleLowerCase('tr').trim();
}
/** Bir secenegin sorguya uygunlugu; kucuk sayi daha iyi eslesme, -1 eslesmiyor. */
export function rank(option:PickOption,query:string):number{
 const q=fold(query);
 if(!q)return 0;
 const label=fold(option.label),hint=fold(option.hint||'');
 if(label===q)return 0;
 if(label.startsWith(q))return 1;
 // "PLC-01.M0" gibi etiketlerde nokta sonrasi kod da bastan eslesme sayilir.
 const afterDot=label.slice(label.indexOf('.')+1);
 if(label.includes('.')&&afterDot.startsWith(q))return 2;
 if(label.includes(q))return 3;
 if(hint.startsWith(q))return 4;
 if(hint.includes(q))return 5;
 return -1;
}
export type PickResult={items:PickOption[];more:number};
/**
 * Sorguya uyanlari siralar ve `limit` kadarini dondurur; `more` gosterilmeyen
 * sayidir. Sorgu bossa liste kirpilir ama siralama bozulmaz — kullanici
 * listenin basini her zaman ayni yerde gorur.
 */
export function filterOptions(options:readonly PickOption[],query:string,limit=10):PickResult{
 const scored:{option:PickOption;score:number;index:number}[]=[];
 for(const [index,option] of options.entries()){
  const score=rank(option,query);
  if(score<0)continue;
  scored.push({option,score,index});
 }
 scored.sort((a,b)=>a.score-b.score||a.index-b.index);
 return {items:scored.slice(0,limit).map(s=>s.option),more:Math.max(0,scored.length-limit)};
}
