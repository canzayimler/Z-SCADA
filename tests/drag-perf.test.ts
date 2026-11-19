import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newWidget,moveWithLinks,type Screen,type Widget} from '../packages/contracts/model';
import {seedScreen} from '../packages/contracts/seed';
import {withLinkedNeighbors} from '../packages/screen-model/editor';
import {portSnap,portSnapScan} from '../packages/screen-model/ports';
/* Denetim 2026-11-18: 600 nesnede sürükleme O(n²) idi (withLinkedNeighbors her nesne için
 * find ile tarıyordu, portSnap her uç için tüm nesnelerin uçlarını yeniden hesaplıyordu).
 * Hızlı sürüm eskisiyle aynı sonucu vermeli; eski hali burada referans olarak duruyor. */
function legacyLinked(base:Screen,orig:Widget[],moved:Widget[]):Screen{
 const draggedIds=new Set(orig.map(w=>w.id));let result=base;
 for(const o of orig){const m=moved.find(w=>w.id===o.id);if(!m)continue;
  const ddx=m.x-o.x,ddy=m.y-o.y;if(!ddx&&!ddy)continue;
  const chained=moveWithLinks(result,o.id,ddx,ddy);
  result={...result,widgets:result.widgets.map(w=>draggedIds.has(w.id)?w:(chained.widgets.find(x=>x.id===w.id)||w))};}
 return result;
}
let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
const types=['pipe','valve','pump','tank','elbow','tee','motor'] as const;
function screen(n:number,linkCount:number,lockedEvery=0):Screen{
 const widgets=Array.from({length:n},(_,i)=>({...newWidget(types[i%types.length],Math.round(rnd()*1800),Math.round(rnd()*900)),id:'w'+i,locked:lockedEvery>0&&i%lockedEvery===0}));
 const links=Array.from({length:linkCount},(_,i)=>{const a=Math.floor(rnd()*n);let b=Math.floor(rnd()*n);if(b===a)b=(a+1)%n;return {id:'l'+i,fromWidgetId:'w'+a,fromPort:0,toWidgetId:'w'+b,toPort:1};});
 return {...structuredClone(seedScreen),width:2000,height:1000,widgets,links} as Screen;
}
function drag(s:Screen,ids:string[],dx:number,dy:number){
 const orig=s.widgets.filter(w=>ids.includes(w.id));
 const ws=s.widgets.map(w=>ids.includes(w.id)?{...w,x:Math.max(0,w.x+dx),y:Math.max(0,w.y+dy)}:w);
 return {orig,ws};
}
const pos=(s:Screen)=>s.widgets.map(w=>w.id+':'+w.x+','+w.y).join('|');

test('withLinkedNeighbors eski uygulamayla ayni konumlari uretir (zincir, kilit, sinira kistirma)',()=>{
 for(let round=0;round<40;round++){
  const s=screen(60,50,round%3===0?7:0);
  const ids=s.widgets.filter(()=>rnd()<.2).map(w=>w.id).filter(id=>!s.widgets.find(w=>w.id===id)!.locked);
  const dx=Math.round(rnd()*200-120),dy=Math.round(rnd()*200-120);
  const {orig,ws}=drag(s,ids,dx,dy);
  const base={...s,widgets:ws};
  assert.equal(pos(withLinkedNeighbors(base,orig,ws)),pos(legacyLinked(base,orig,ws)),'tur '+round);
 }
});
test('portSnap izgara surumu duz taramayla ayni yapismayi secer',()=>{
 for(let round=0;round<60;round++){
  const s=screen(80,0);
  const moving=s.widgets.slice(0,1+round%4),others=s.widgets.slice(4);
  const dx=rnd()*40-20,dy=rnd()*40-20,tol=round%5===0?60:14;
  assert.deepEqual(portSnap(moving,others,dx,dy,tol),portSnapScan(moving,others,dx,dy,tol),'tur '+round);
 }
});
/* Zamanlama paralel test paketinde (CPU paylasilirken) tek basina olcumden kat kat oynuyordu:
 * 10 karenin ortalamasi 60 ms sinirini 100-700 ms ile asip rastgele kiriliyordu. Simdi JIT
 * isinmasindan sonra kareler tek tek olculur ve EN IYI kare sinanir: gurultu yalniz yukari
 * yonludur, yuk altinda bile en az bir kare temiz zaman diliminde kosar. Sinir 150 ms; eski
 * O(n^2) uygulama 600 nesnede kare basi saniyeler surdugu icin gerileme hala yakalanir. */
test('600 nesne: tumunu suruklemenin kare basi hesabi kisa surer',()=>{
 const s=screen(600,400);
 const ids=s.widgets.map(w=>w.id),{orig,ws}=drag(s,ids,13,9);
 const half=s.widgets.slice(0,300),rest=s.widgets.slice(300);
 const frame=()=>{const t0=performance.now();withLinkedNeighbors({...s,widgets:ws},orig,ws);portSnap(half,rest,5,5,14);return performance.now()-t0;};
 for(let i=0;i<3;i++)frame();// JIT isinmasi
 const samples=Array.from({length:9},frame).sort((a,b)=>a-b);
 const best=samples[0],median=samples[4];
 assert.ok(best<150,'en iyi kare '+best.toFixed(1)+' ms, ortanca '+median.toFixed(1)+' ms (eski O(n^2) uygulama saniyeler suruyordu)');
});
