/* Stüdyo geri al / yinele yığınları. Studio.tsx'te dört yerde kopyalanan "anlık görüntü al"
 * mantığı buraya toplandı; saf fonksiyonlar olduğu için birim testle doğrulanır.
 * Kural: yeni değişiklik geçmişe mevcut hali ekler ve ileri yığını temizler; geçmiş
 * HISTORY_LIMIT'te kırpılır (en eski düşer). Yığınlardaki ekranlar derin kopyadır, sonradan
 * yerinde değişen nesne geçmişi bozmasın. */
export const HISTORY_LIMIT=50;
export type Stacks<T>={history:T[];future:T[]};
const clone=<T,>(v:T):T=>structuredClone(v);
/** Yeni değişiklikten önce çağrılır: mevcut hali geçmişe ekler, ileriyi siler. */
export function recordChange<T>(s:Stacks<T>,current:T):Stacks<T>{
 return {history:[...s.history.slice(-(HISTORY_LIMIT-1)),clone(current)],future:[]};
}
/** Geri al: geçmişin sonu yeni ekran olur, mevcut hal ileri yığının başına gider. Geçmiş boşsa null. */
export function undoStep<T>(s:Stacks<T>,current:T):{stacks:Stacks<T>;screen:T}|null{
 if(!s.history.length)return null;
 return {screen:s.history[s.history.length-1],stacks:{history:s.history.slice(0,-1),future:[clone(current),...s.future]}};
}
/** Yinele: ileri yığının başı yeni ekran olur, mevcut hal geçmişe eklenir (sınır korunur). İleri boşsa null. */
export function redoStep<T>(s:Stacks<T>,current:T):{stacks:Stacks<T>;screen:T}|null{
 if(!s.future.length)return null;
 return {screen:s.future[0],stacks:{history:[...s.history.slice(-(HISTORY_LIMIT-1)),clone(current)],future:s.future.slice(1)}};
}
/** setHistory için güncelleyici. Anlık görüntü ÇAĞRI anında alınır: React güncelleyiciyi bir
 * sonraki render'a erteleyebilir, o ana kadar ref yeni hali gösterir. Eskiden güncelleyici
 * içinde okunuyordu; geçmişe yeni (silinmiş) hal yazılıyor, Geri Al nesneleri getirmiyordu. */
export function historyAppender<T>(current:T):(history:T[])=>T[]{
 const snap=clone(current);
 return h=>[...h.slice(-(HISTORY_LIMIT-1)),snap];
}
/** Sürükleme/ölçekleme bitince: gerçekten değişiklik var mı? Yalnız tıklama geçmişe kayıt eklemesin. */
export function screenChanged<T>(before:T,after:T):boolean{
 return before!==after&&JSON.stringify(before)!==JSON.stringify(after);
}
