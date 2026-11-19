import type {Widget} from '../contracts/model';
import {flatTypes,viewBoxes as boxes,portMap} from './catalog';
import {contentBox} from './content';
/* G51: nesnenin CERCEVESI ile CIZIMI ayri seylerdi ve kimse ikisini
 * hizalamiyordu. Sembolun goruntu kutusu `Symbol.tsx` icinde hesaplaniyor,
 * baglanti agizlari ise `ports.ts`'te "cizim 120x100'un tamamini doldurur"
 * varsayimiyla yeniden hesaplaniyordu. Iki hesap ayrilinca:
 *  - `frameFit` 'trim'/'fill' modunda agizlar cizimin olmadigi yere dusuyor,
 *  - cerceve orani cizimin oranini tutmadigi icin tutamaklar cizimden uzakta
 *    kaliyor ve konumlandirma/boyutlandirma gozle yapiliyor.
 * Goruntu kutusu tek kaynak burada; cizen de olcen de bunu cagirir.
 * Kodek kopyalarinda ogrenilen ders (B58): ayni hesabin iki kopyasi bugun
 * ayni sonucu verse de yarin sessizce ayrilir. */
const flat=flatTypes as readonly string[];
export type ViewBox={x:number;y:number;width:number;height:number};
/** Baglanti agizlarinin ve cizim tablosunun ortak uzayi. */
export const CANVAS:ViewBox={x:0,y:0,width:120,height:100};

const parse=(raw:string):ViewBox=>{
 const p=raw.split(/\s+/).map(Number);
 return p.length===4&&p.every(Number.isFinite)?{x:p[0],y:p[1],width:p[2],height:p[3]}:{...CANVAS};
};
/** Etiket cizilecekse kutu etiket seridini icinde tutmak zorundadir. */
export const hasLabel=(w:Widget)=>w.labelVisible!==false&&w.label.trim().length>0;
/* Etiket 60 merkezli cizilir ve govdeden genis olabilir; yatay kirpmada
 * yazinin kaldigi seridi kutuda birakmak gerekir. Genislik olculemez (sunucu
 * tarafinda da cizilir), bu yuzden punto basina tahmin edilir — dar tahmin
 * yaziyi kirpar, o yuzden genis taraf secildi. */
export function labelSpanOf(w:Widget):[number,number]{
 if(!hasLabel(w))return [60,60];
 const width=Math.min(120,w.label.trim().length*(w.fontSize||10)*0.62);
 const [x0,x1]=w.textAlign==='left'?[60,60+width]:w.textAlign==='right'?[60-width,60]:[60-width/2,60+width/2];
 return [Math.max(0,x0),Math.min(120,x1)];
}
/** `preserveAspectRatio="none"`: cizim cerceveye gerilir, oran birakilir. */
export const stretches=(w:Widget)=>flat.includes(w.type)||w.frameFit==='fill';

/* Bir turun baglanti agzi olculen cizim kutusunun disinda olabilir (isi
 * esanjorunde agiz 120'de, cizim 112'de biter). Kirpma agzi ekran disinda
 * birakirsa boru hicbir zaman oturmaz; kutu agizlari da icine alir. */
function withPorts(type:Widget['type'],box:readonly [number,number,number,number]):[number,number,number,number]{
 const list=portMap[type];if(!list?.length)return [...box];
 let x0=box[0],y0=box[1],x1=box[0]+box[2],y1=box[1]+box[3];
 for(const p of list){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
 return [x0,y0,x1-x0,y1-y0];
}

/** Sembolun goruntu kutusu. Symbol.tsx bunu cizer, ports.ts bununla olcer. */
export function viewBoxOf(w:Widget):ViewBox{
 if(flat.includes(w.type))return {x:0,y:0,width:Math.max(1,w.width),height:Math.max(1,w.height)};
 const raw=w.frameFit!=='contain'?contentBox(w.type):undefined;
 const trimmed=raw?withPorts(w.type,raw):undefined;
 if(trimmed){
  /* Etiket ciziliyorsa YATAY kirpma yapilmaz: yazi 60 merkezli ve govdeden
   * genis olabilir, dar kutuda kirpilir. O halde yalniz dikey bosluk alinir
   * ve etiket seridi kutuda birakilir. Etiket kapaliysa iki eksen de kirpilir. */
  if(!hasLabel(w))return {x:trimmed[0],y:trimmed[1],width:trimmed[2],height:trimmed[3]};
  const [lx0,lx1]=labelSpanOf(w),x=Math.min(trimmed[0],lx0),x1=Math.max(trimmed[0]+trimmed[2],lx1);
  return {x,y:trimmed[1],width:Math.max(1,x1-x),height:Math.max(trimmed[3],100-trimmed[1])};
 }
 const normal=parse(boxes[w.type]||'0 0 120 100');
 // Olculmemis tur eski davranisini surdurur: etiket kapaliysa serit kadar kisalir.
 if(hasLabel(w))return normal;
 /* Kisalma cizimin ve agizlarin altina inemez: silonun alt agzi y=90'da, kutu 82'de
  * bitiyordu — agiz cercevenin disina dusuyor, govdenin alt kenari kirpiliyordu. */
 let bottom=normal.y+Math.max(20,normal.height-18);
 const cb=contentBox(w.type);if(cb)bottom=Math.max(bottom,cb[1]+cb[3]);
 for(const q of portMap[w.type]||[])bottom=Math.max(bottom,q.y+1);
 return {...normal,height:Math.min(normal.height,bottom-normal.y)};
}
export const viewBoxAttr=(w:Widget)=>{const v=viewBoxOf(w);return `${v.x} ${v.y} ${v.width} ${v.height}`;};

export type DrawRect={x:number;y:number;width:number;height:number;scaleX:number;scaleY:number};
/**
 * Cizimin nesne cercevesi ICINDEKI gercek dikdortgeni (donme/aynalama oncesi).
 * 'fill' ve boru ailesinde cerceveyi doldurur; digerlerinde `xMidYMid meet`
 * ile ortalanir ve iki kenarda bosluk birakir — tutamaklarin cizimden uzak
 * kalmasinin sebebi tam olarak bu bosluktur.
 */
export function drawRectOf(w:Widget):DrawRect{
 const vb=viewBoxOf(w),width=Math.max(1,w.width),height=Math.max(1,w.height);
 if(stretches(w))return {x:0,y:0,width,height,scaleX:width/vb.width,scaleY:height/vb.height};
 const scale=Math.min(width/vb.width,height/vb.height);
 return {x:(width-vb.width*scale)/2,y:(height-vb.height*scale)/2,width:vb.width*scale,height:vb.height*scale,scaleX:scale,scaleY:scale};
}
/** 120x100 uzayindaki bir noktanin cerceve icindeki karsiligi (agizlar, tutamaklar). */
export function pointOf(w:Widget,x:number,y:number){
 const vb=viewBoxOf(w),r=drawRectOf(w);
 if(flat.includes(w.type))return {x:x/CANVAS.width*Math.max(1,w.width),y:y/CANVAS.height*Math.max(1,w.height)};
 return {x:r.x+(x-vb.x)*r.scaleX,y:r.y+(y-vb.y)*r.scaleY};
}

/** Cizimin 120x100 uzayinda GERCEKTEN kapladigi kutu — goruntu kutusu degil.
 * 'contain' modunda goruntu kutusu 120x100'dur ama cizim onun ortasinda kucuk
 * durur; bos kenari kirpmak icin olculmesi gereken budur. */
export function inkBoxOf(w:Widget):ViewBox{
 const raw=contentBox(w.type);
 if(flat.includes(w.type)||!raw)return viewBoxOf(w);
 const box=withPorts(w.type,raw);
 if(!hasLabel(w))return {x:box[0],y:box[1],width:box[2],height:box[3]};
 const [lx0,lx1]=labelSpanOf(w),x=Math.min(box[0],lx0),x1=Math.max(box[0]+box[2],lx1);
 return {x,y:box[1],width:Math.max(1,x1-x),height:Math.max(box[3],100-box[1])};
}
/** Cizimin cerceve icindeki gercek dikdortgeni (bos kenarlar haric). */
export function inkRectOf(w:Widget):{x:number;y:number;width:number;height:number}{
 const vb=viewBoxOf(w),r=drawRectOf(w),ink=inkBoxOf(w);
 return {x:r.x+(ink.x-vb.x)*r.scaleX,y:r.y+(ink.y-vb.y)*r.scaleY,width:ink.width*r.scaleX,height:ink.height*r.scaleY};
}
/** Cerceveyi cizime yapistirir: bos kenarlar kirpilir, merkez yerinde kalir.
 * Kirpma sonrasi cizimin cerceveyi doldurmasi icin mod 'trim'e gecer —
 * 'contain' kalsaydi ayni bosluk yeni cercevede yeniden dogardi. */
export function snapFrameToDrawing(w:Widget):{x:number;y:number;width:number;height:number;frameFit:Widget['frameFit']}{
 const r=inkRectOf(w);
 return {x:Math.round(w.x+r.x),y:Math.round(w.y+r.y),width:Math.max(20,Math.round(r.width)),height:Math.max(20,Math.round(r.height)),
  frameFit:w.frameFit==='contain'?'trim':w.frameFit};
}
/** Cerceveden bosa giden alan orani — arayuz bunu yuzde olarak gosterir. */
export function framePadding(w:Widget):number{
 const r=inkRectOf(w);
 return Math.max(0,1-(r.width*r.height)/Math.max(1,w.width*w.height));
}
/** Alani koruyarak cerceve oranini cizimin oranina esitler — yeni nesnede bosluk dogmasin. */
export function frameForDrawing(w:Widget):{width:number;height:number}{
 if(stretches(w))return {width:w.width,height:w.height};
 const vb=viewBoxOf(w),area=Math.max(1,w.width*w.height),aspect=vb.width/vb.height;
 return {width:Math.max(20,Math.round(Math.sqrt(area*aspect))),height:Math.max(20,Math.round(Math.sqrt(area/aspect)))};
}
