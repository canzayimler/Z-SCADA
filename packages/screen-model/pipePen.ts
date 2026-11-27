import {addLink,newWidget,type Screen,type Widget} from '../contracts/model';
import {hasPorts,portWeight,portsOf} from './ports';

export type Point={x:number;y:number};
export type PortHit={widgetId:string;portIndex:number;x:number;y:number;axis:'h'|'v';weight:number};
type Dir='n'|'e'|'s'|'w';

/** Verilen noktaya tolerans icindeki en yakin baglanti agzini bulur. */
export function findNearestPort(widgets:Widget[],point:Point,tolerance:number,excludeIds?:ReadonlySet<string>):PortHit|null{
 if(!(tolerance>0)||!Number.isFinite(tolerance))return null;
 let best:PortHit|null=null,bestDist=Infinity;
 for(const w of widgets){
  if(excludeIds?.has(w.id)||!hasPorts(w.type))continue;
  const ports=portsOf(w);
  for(let i=0;i<ports.length;i++){
   const p=ports[i],d=Math.hypot(p.x-point.x,p.y-point.y);
   if(d<=tolerance&&d<bestDist){
    bestDist=d;
    best={widgetId:w.id,portIndex:i,x:p.x,y:p.y,axis:p.axis,weight:portWeight(w,i)};
   }
  }
 }
 return best;
}

/** Iki nokta arasinda tek L-kirilimli (90°) dik acili boru bacagi uretir. */
export function routeOrthogonalLeg(from:Point,to:Point,preferAxis?:'h'|'v',flipBend=false):Point[]{
 const dx=to.x-from.x,dy=to.y-from.y;
 if(Math.abs(dx)<1&&Math.abs(dy)<1)return [{x:Math.round(from.x),y:Math.round(from.y)}];
 const fx=Math.round(from.x),fy=Math.round(from.y),tx=Math.round(to.x),ty=Math.round(to.y);
 if(fx===tx||fy===ty)return [{x:fx,y:fy},{x:tx,y:ty}];
 let axis:'h'|'v'=preferAxis??(Math.abs(dx)>=Math.abs(dy)?'h':'v');
 if(flipBend)axis=axis==='h'?'v':'h';
 return axis==='h'
  ?[{x:fx,y:fy},{x:tx,y:fy},{x:tx,y:ty}]
  :[{x:fx,y:fy},{x:fx,y:ty},{x:tx,y:ty}];
}

/** Cakisik noktalari ve ayni eksendeki ara noktalari tek segmente indirger. */
export function simplifyOrthogonalPath(points:Point[]):Point[]{
 const clean:Point[]=[];
 for(const p of points){
  const q={x:Math.round(p.x),y:Math.round(p.y)};
  const last=clean[clean.length-1];
  if(!last||Math.hypot(q.x-last.x,q.y-last.y)>=1)clean.push(q);
 }
 if(clean.length<3)return clean;
 const out:Point[]=[clean[0]];
 for(let i=1;i<clean.length-1;i++){
  const a=out[out.length-1],b=clean[i],c=clean[i+1];
  const sameX=a.x===b.x&&b.x===c.x;
  const sameY=a.y===b.y&&b.y===c.y;
  if(!sameX&&!sameY)out.push(b);
 }
 out.push(clean[clean.length-1]);
 return out;
}

function dirBetween(from:Point,to:Point):Dir|null{
 const dx=to.x-from.x,dy=to.y-from.y;
 if(Math.abs(dx)<1&&Math.abs(dy)<1)return null;
 if(Math.abs(dx)>=Math.abs(dy))return dx>=0?'e':'w';
 return dy>=0?'s':'n';
}

function elbowSpec(d1:Dir,d2:Dir):{rotation:number;port0:Dir;port1:Dir}|null{
 const pair=new Set<Dir>([d1,d2]);
 if(pair.has('w')&&pair.has('n'))return {rotation:0,port0:'w',port1:'n'};
 if(pair.has('n')&&pair.has('e'))return {rotation:90,port0:'n',port1:'e'};
 if(pair.has('e')&&pair.has('s'))return {rotation:180,port0:'e',port1:'s'};
 if(pair.has('s')&&pair.has('w'))return {rotation:270,port0:'s',port1:'w'};
 return null;
}

type NodeChain={widget:Widget;inPort:number;outPort:number};

/**
 * Dik acili coklu boru yolunu gercek `pipe` ve `elbow` nesnelerine cevirir,
 * komsu parcalar ve uclardaki portlar arasinda kalici `links` baglari kurar.
 */
export function commitPipePath(
 screen:Screen,
 rawPoints:Point[],
 opts?:{startSnap?:PortHit|null;endSnap?:PortHit|null;lineWidth?:number;autoFit?:boolean;idFactory?:()=>string}
):{screen:Screen;createdIds:string[]}{
 const pts=simplifyOrthogonalPath(rawPoints);
 if(pts.length<2)return {screen,createdIds:[]};
 let totalLen=0;
 for(let i=0;i<pts.length-1;i++)totalLen+=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y);
 if(totalLen<20)return {screen,createdIds:[]};

 const makeId=opts?.idFactory??(()=>crypto.randomUUID());
 const snapWeight=opts?.autoFit!==false?(opts?.startSnap?.weight||opts?.endSnap?.weight||0):0;
 const lineWidth=Math.round(Math.min(32,Math.max(4,snapWeight||(opts?.lineWidth??12)))*10)/10;
 const pipeBox=Math.max(28,Math.round((lineWidth+16)/2)*2);
 const elbowSize=Math.max(40,pipeBox);
 const r=elbowSize/2;

 // Her ic kose icin dirsek yerlestirilip yerlestirilemeyecegini hesapla.
 const cornerHasElbow:boolean[]=pts.map(()=>false);
 const cornerSpecs:(ReturnType<typeof elbowSpec>)[]=pts.map(()=>null);
 for(let i=1;i<pts.length-1;i++){
  const dIn=dirBetween(pts[i],pts[i-1]);
  const dOut=dirBetween(pts[i],pts[i+1]);
  if(!dIn||!dOut)continue;
  const spec=elbowSpec(dIn,dOut);
  if(!spec)continue;
  const lenPrev=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
  const lenNext=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y);
  const needPrev=cornerHasElbow[i-1]?2*r:r;
  if(lenPrev>=needPrev&&lenNext>=r){
   cornerHasElbow[i]=true;
   cornerSpecs[i]=spec;
  }
 }

 const chain:NodeChain[]=[];
 for(let i=0;i<pts.length-1;i++){
  const p0=pts[i],p1=pts[i+1];
  const dir=dirBetween(p0,p1);
  if(!dir)continue;
  const trimStart=cornerHasElbow[i]?r:0;
  const trimEnd=cornerHasElbow[i+1]?r:0;
  const ux=dir==='e'?1:dir==='w'?-1:0;
  const uy=dir==='s'?1:dir==='n'?-1:0;
  const ax=p0.x+ux*trimStart,ay=p0.y+uy*trimStart;
  const bx=p1.x-ux*trimEnd,by=p1.y-uy*trimEnd;
  const segLen=Math.round(Math.hypot(bx-ax,by-ay));

  if(segLen>=20||(segLen>0&&!cornerHasElbow[i]&&!cornerHasElbow[i+1])){
   const wLen=Math.max(20,segLen);
   const base=newWidget('pipe',0,0);
   let pipeWidget:Widget;
   let inPort=0,outPort=1;
   if(ux!==0){
    const left=Math.min(ax,bx);
    pipeWidget={...base,id:makeId(),x:Math.round(left),y:Math.round(ay-pipeBox/2),width:wLen,height:pipeBox,rotation:0,lineWidth,reverse:bx<ax};
    inPort=bx>=ax?0:1;
    outPort=bx>=ax?1:0;
   }else{
    const midY=(ay+by)/2;
    pipeWidget={...base,id:makeId(),x:Math.round(ax-wLen/2),y:Math.round(midY-pipeBox/2),width:wLen,height:pipeBox,rotation:90,lineWidth,reverse:by<ay};
    inPort=by>=ay?0:1;
    outPort=by>=ay?1:0;
   }
   chain.push({widget:pipeWidget,inPort,outPort});
  }

  if(cornerHasElbow[i+1]&&cornerSpecs[i+1]){
   const spec=cornerSpecs[i+1]!;
   const dToPrev=dirBetween(pts[i+1],pts[i])!;
   const dToNext=dirBetween(pts[i+1],pts[i+2])!;
   const base=newWidget('elbow',0,0);
   const elbowWidget:Widget={
    ...base,
    id:makeId(),
    x:Math.round(pts[i+1].x-r),
    y:Math.round(pts[i+1].y-r),
    width:elbowSize,
    height:elbowSize,
    rotation:spec.rotation,
    lineWidth
   };
   const inPort=spec.port0===dToPrev?0:1;
   const outPort=spec.port0===dToNext?0:1;
   chain.push({widget:elbowWidget,inPort,outPort});
  }
 }

 if(!chain.length)return {screen,createdIds:[]};

 let next:Screen={...screen,widgets:[...screen.widgets,...chain.map(n=>n.widget)]};
 for(let i=0;i<chain.length-1;i++){
  next=addLink(next,{
   fromWidgetId:chain[i].widget.id,
   fromPort:chain[i].outPort,
   toWidgetId:chain[i+1].widget.id,
   toPort:chain[i+1].inPort
  });
 }
 if(opts?.startSnap){
  next=addLink(next,{
   fromWidgetId:opts.startSnap.widgetId,
   fromPort:opts.startSnap.portIndex,
   toWidgetId:chain[0].widget.id,
   toPort:chain[0].inPort
  });
 }
 if(opts?.endSnap){
  const last=chain[chain.length-1];
  next=addLink(next,{
   fromWidgetId:last.widget.id,
   fromPort:last.outPort,
   toWidgetId:opts.endSnap.widgetId,
   toPort:opts.endSnap.portIndex
  });
 }

 return {screen:next,createdIds:chain.map(n=>n.widget.id)};
}
