import type {Widget} from '../contracts/model';
import {portMap,portWeights as weights,flatTypes} from '../symbols/catalog';
import {pointOf,drawRectOf} from '../symbols/frame';
export type Port={x:number;y:number;axis:'h'|'v'};
const stretched=flatTypes as readonly string[];
export function hasPorts(t:Widget['type']){return !!portMap[t];}
/** Bir nesne tipinin kac bagli ucu oldugu; kalici baglanti (B25) kimliklerini dogrulamak icin. */
export function portCount(t:Widget['type']):number{return portMap[t]?.length||0;}
export function isPipe(t:Widget['type']){return stretched.includes(t);}
/** Bağlantı noktalarını ekran koordinatına çevirir; aynalama ve dönüş dahil. */
export function portsOf(w:Widget):Port[]{
 const list=portMap[w.type];if(!list)return [];
 /* G51: agiz konumu cizimin GERCEK dikdortgeninden turer. Eskiden burada
  * "cizim 120x100'un tamamini doldurur" varsayimi vardi; `frameFit` 'trim'
  * ya da 'fill' oldugunda agizlar cizimin olmadigi yere dusuyordu. */
 const angle=(w.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
 const cx=w.width/2,cy=w.height/2;
 return list.map(p=>{
  let {x,y}=pointOf(w,p.x,p.y);
  if(w.flipX)x=w.width-x;
  if(w.flipY)y=w.height-y;
  const rx=cx+(x-cx)*cos-(y-cy)*sin,ry=cy+(x-cx)*sin+(y-cy)*cos;
  return {x:w.x+rx,y:w.y+ry,axis:p.axis};
 });
}
/** Bağlantı ağzının ekrandaki kalınlığı (piksel). */
export function portWeight(w:Widget,index:number):number{
 const list=portMap[w.type];const port=list?.[index];if(!port)return 0;
 if(isPipe(w.type))return Math.max(4,Math.min(w.lineWidth,Math.min(w.width,w.height)-2));
 // Agiz kalinligi agzin eksenine dik olcuden gelir; 'fill' modunda iki eksen ayri olceklenir.
 const r=drawRectOf(w);
 return (weights[w.type]||16)*(port.axis==='h'?r.scaleY:r.scaleX);
}
/** Hedef ağza göre kalınlığı eşitleyen ölçü değişikliği. */
export function fitToPort(moving:Widget,index:number,target:number):Partial<Widget>|null{
 const current=portWeight(moving,index);
 if(!current||!target||Math.abs(current-target)<.5)return null;
 const port=portMap[moving.type]?.[index];if(!port)return null;
 if(isPipe(moving.type)){
  const line=Math.round(Math.min(32,Math.max(4,target))*10)/10;
  const span=Math.max(line+10,port.axis==='h'?moving.height:moving.width);
  // Gövde, boru kalınlığını ve flanşları alacak kadar geniş tutulur.
  return port.axis==='h'?{lineWidth:line,height:Math.round(span)}:{lineWidth:line,width:Math.round(span)};
 }
 const factor=target/current;
 return {width:Math.max(20,Math.min(4000,Math.round(moving.width*factor))),height:Math.max(20,Math.min(4000,Math.round(moving.height*factor)))};
}
export type Snap={dx:number;dy:number;at:Port;movingId:string;movingPort:number;targetId:string;targetPort:number;distance:number};
/** Sürüklenen nesnelerin uçlarını diğer nesnelerin uçlarına oturtan kaydırma.
 * Diğer nesnelerin uçları tolerans boyunda hücrelere dağıtılır; her uç yalnız komşu 3x3 hücreye
 * bakar (eskisi her sürüklenen uç için tüm nesnelerin portsOf'unu yeniden hesaplıyordu: O(k·n)).
 * Sonuç eskisiyle aynıdır: en yakın uç; eşit uzaklıkta döngü sırasında ilk gelen
 * (sürüklenen sırası, uç sırası, hedef sırası, hedef uç sırası) kazanır. */
export function portSnap(moving:Widget[],others:Widget[],dx:number,dy:number,tolerance:number):Snap|null{
 if(!(tolerance>0)||!Number.isFinite(tolerance))return portSnapScan(moving,others,dx,dy,tolerance);
 const cells=new Map<string,{x:number;y:number;o:number;n:number;id:string;p:Port}[]>();
 const key=(cx:number,cy:number)=>cx+':'+cy;
 others.forEach((other,o)=>{const theirs=portsOf(other);
  for(let n=0;n<theirs.length;n++){const t=theirs[n],k=key(Math.floor(t.x/tolerance),Math.floor(t.y/tolerance));
   let list=cells.get(k);if(!list)cells.set(k,list=[]);list.push({x:t.x,y:t.y,o,n,id:other.id,p:t});}});
 if(!cells.size)return null;
 let best:Snap|null=null,bestKey:[number,number,number,number]|null=null;
 const earlier=(a:[number,number,number,number],b:[number,number,number,number])=>{for(let i=0;i<4;i++){if(a[i]!==b[i])return a[i]<b[i];}return false;};
 moving.forEach((w,wi)=>{
  const mine=portsOf(w);
  for(let i=0;i<mine.length;i++){
   const from={x:mine[i].x+dx,y:mine[i].y+dy},cx=Math.floor(from.x/tolerance),cy=Math.floor(from.y/tolerance);
   for(let gx=cx-1;gx<=cx+1;gx++)for(let gy=cy-1;gy<=cy+1;gy++){
    for(const t of cells.get(key(gx,gy))||[]){
     const distance=Math.hypot(t.x-from.x,t.y-from.y);if(distance>tolerance)continue;
     const k:[number,number,number,number]=[wi,i,t.o,t.n];
     if(!best||distance<best.distance||(distance===best.distance&&earlier(k,bestKey!))){
      best={dx:dx+(t.x-from.x),dy:dy+(t.y-from.y),at:t.p,movingId:w.id,movingPort:i,targetId:t.id,targetPort:t.n,distance};bestKey=k;}
    }
   }
  }
 });
 return best;
}
/** Düz tarama (referans davranış); tolerans geçersizse kullanılır, testler de buna karşı kıyaslar. */
export function portSnapScan(moving:Widget[],others:Widget[],dx:number,dy:number,tolerance:number):Snap|null{
 let best:Snap|null=null;
 for(const w of moving){
  const mine=portsOf(w);
  for(let i=0;i<mine.length;i++){
   const from={x:mine[i].x+dx,y:mine[i].y+dy};
   for(const other of others){
    const theirs=portsOf(other);
    for(let n=0;n<theirs.length;n++){
     const t=theirs[n],distance=Math.hypot(t.x-from.x,t.y-from.y);
     if(distance<=tolerance&&(!best||distance<best.distance))
      best={dx:dx+(t.x-from.x),dy:dy+(t.y-from.y),at:t,movingId:w.id,movingPort:i,targetId:other.id,targetPort:n,distance};
    }
   }
  }
 }
 return best;
}
