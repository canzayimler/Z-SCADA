// Her sembol turunun gercek cizim sinirlarini olcer (etiketsiz, rozetsiz).
/* G50: cizim sinirlarini SVG isaretlemesinden olcer. Kaba ama asla DAR
 * degil: egri kontrol noktalari da sayilir, yani kutu cizimi her zaman
 * icine alir. `content.ts` tablosu bununla uretildi, testi bununla dogrulanir. */
export type Box={x0:number;y0:number;x1:number;y1:number};
const nums=(s:string)=>Array.from(s.matchAll(/-?\d+(?:\.\d+)?/g)).map(m=>Number(m[0]));

/** Kaba ama ASLA dar olmayan sinir: egri kontrol noktalari da sayilir. */
export type ContentBox=[number,number,number,number];
export function markupBounds(html:string):Box|null{
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 const add=(x:number,y:number)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);};
 for(const m of html.matchAll(/<(rect|circle|ellipse|line|path|polygon|polyline|text)\b([^>]*)>/g)){
  const [,tag,attrs]=m;
  /* Ad, oznitelik basinda aranir: aksi halde `opacity="0.6"` icindeki `y="0.6"` ya da
   * `rx="3"` icindeki `x="3"` gercek y/x sanilir (kit.tsx'te opacity, x/y'den once gelir). */
  const attr=(name:string)=>{const a=attrs.match(new RegExp('(?:^|\\s)'+name+'="([^"]*)"'));return a?a[1]:'';};
  const n=(name:string)=>Number(attr(name)||NaN);
  if(tag==='rect'){const x=n('x'),y=n('y'),w=n('width'),h=n('height');add(x,y);add(x+w,y+h);}
  else if(tag==='circle'){const cx=n('cx'),cy=n('cy'),r=n('r');add(cx-r,cy-r);add(cx+r,cy+r);}
  else if(tag==='ellipse'){const cx=n('cx'),cy=n('cy'),rx=n('rx'),ry=n('ry');add(cx-rx,cy-ry);add(cx+rx,cy+ry);}
  else if(tag==='line'){add(n('x1'),n('y1'));add(n('x2'),n('y2'));}
  else if(tag==='text'){const x=n('x'),y=n('y');add(x-6,y-10);add(x+6,y+2);}
  else if(tag==='path'){for(const [x,y] of pathPoints(attr('d')))add(x,y);}
  else {
   const v=nums(attr('points'));
   for(let i=0;i+1<v.length;i+=2)add(v[i],v[i+1]);
  }
 }
 return Number.isFinite(x0)?{x0,y0,x1,y1}:null;
}

/** SVG path'inin uzerinden gectigi noktalar (mutlak koordinat). Komut bazli ayristirir:
 * goreli (kucuk harf) komutlar ve H/V mevcut noktayla izlenir; egrilerde kontrol noktalari
 * da sayilir (kutu hic dar olmaz); yay (A) 7 parametrelidir — yaricap/bayrak sayilari eskiden
 * koordinat sanilip (0,0) gibi sahte noktalar uretiyordu, simdi yay merkezden orneklenir. */
export function pathPoints(d:string):[number,number][]{
 const out:[number,number][]=[];
 const tokens=Array.from(d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)/g)).map(m=>m[1]??Number(m[2]));
 let i=0,cmd='',x=0,y=0,sx=0,sy=0;
 const num=()=>{const v=tokens[i++];return typeof v==='number'?v:NaN;};
 const hasNum=()=>typeof tokens[i]==='number';
 while(i<tokens.length){
  if(typeof tokens[i]==='string'){cmd=tokens[i++] as string;if(cmd==='Z'||cmd==='z'){x=sx;y=sy;continue;}}
  else if(!cmd)break;
  const rel=cmd===cmd.toLowerCase(),C=cmd.toUpperCase();
  const px=(v:number)=>rel?x+v:v,py=(v:number)=>rel?y+v:v;
  if(!hasNum()){if(C!=='Z')i++;continue;}
  if(C==='M'||C==='L'||C==='T'){x=px(num());y=py(num());out.push([x,y]);if(C==='M'){sx=x;sy=y;cmd=rel?'l':'L';}}
  else if(C==='H'){x=px(num());out.push([x,y]);}
  else if(C==='V'){y=py(num());out.push([x,y]);}
  else if(C==='C'){for(let k=0;k<3;k++){const a=px(num()),b=py(num());out.push([a,b]);if(k===2){x=a;y=b;}}}
  else if(C==='S'||C==='Q'){for(let k=0;k<2;k++){const a=px(num()),b=py(num());out.push([a,b]);if(k===1){x=a;y=b;}}}
  else if(C==='A'){
   const rx=Math.abs(num()),ry=Math.abs(num()),rot=num(),large=num(),sweep=num(),ex=px(num()),ey=py(num());
   for(const p of arcPoints(x,y,rx,ry,rot,!!large,!!sweep,ex,ey))out.push(p);
   x=ex;y=ey;
  }
  else i++;
 }
 return out.filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b));
}
/** SVG yayi (uc nokta parametreleri) -> uzerinde orneklenmis noktalar (SVG 1.1 F.6.5 donusumu). */
function arcPoints(x1:number,y1:number,rx:number,ry:number,rotDeg:number,large:boolean,sweep:boolean,x2:number,y2:number):[number,number][]{
 if(!rx||!ry||(x1===x2&&y1===y2))return [[x1,y1],[x2,y2]];
 const phi=rotDeg*Math.PI/180,cos=Math.cos(phi),sin=Math.sin(phi);
 const dx=(x1-x2)/2,dy=(y1-y2)/2,x1p=cos*dx+sin*dy,y1p=-sin*dx+cos*dy;
 const lambda=x1p*x1p/(rx*rx)+y1p*y1p/(ry*ry);
 if(lambda>1){const s=Math.sqrt(lambda);rx*=s;ry*=s;}
 const num=rx*rx*ry*ry-rx*rx*y1p*y1p-ry*ry*x1p*x1p,den=rx*rx*y1p*y1p+ry*ry*x1p*x1p;
 const coef=(large===sweep?-1:1)*Math.sqrt(Math.max(0,num/den));
 const cxp=coef*rx*y1p/ry,cyp=-coef*ry*x1p/rx;
 const cx=cos*cxp-sin*cyp+(x1+x2)/2,cy=sin*cxp+cos*cyp+(y1+y2)/2;
 const ang=(ux:number,uy:number,vx:number,vy:number)=>{const a=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);return a;};
 const t1=ang(1,0,(x1p-cxp)/rx,(y1p-cyp)/ry);
 let dt=ang((x1p-cxp)/rx,(y1p-cyp)/ry,(-x1p-cxp)/rx,(-y1p-cyp)/ry);
 if(!sweep&&dt>0)dt-=2*Math.PI;else if(sweep&&dt<0)dt+=2*Math.PI;
 const pts:[number,number][]=[];
 const steps=Math.max(8,Math.ceil(Math.abs(dt)/(Math.PI/16)));
 for(let k=0;k<=steps;k++){const t=t1+dt*k/steps,ex=rx*Math.cos(t),ey=ry*Math.sin(t);pts.push([cos*ex-sin*ey+cx,sin*ex+cos*ey+cy]);}
 return pts;
}
/** Olculen ham siniri, cizgi payiyla goruntu kutusuna sikistirir. */
export function boxFrom(bounds:Box|null):ContentBox|null{
 if(!bounds)return null;
 const x0=Math.max(0,Math.floor(bounds.x0-2)),y0=Math.max(0,Math.floor(bounds.y0-2));
 const x1=Math.min(120,Math.ceil(bounds.x1+2)),y1=Math.min(105,Math.ceil(bounds.y1+2));
 if(x1-x0<8||y1-y0<8)return null;
 return [x0,y0,x1-x0,y1-y0];
}
export function mergeBounds(a:Box|null,b:Box|null):Box|null{
 if(!a)return b;if(!b)return a;
 return {x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)};
}
