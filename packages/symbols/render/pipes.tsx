import type {Renderer} from './ctx';
import {kit,Body} from './kit';
/* Boru ailesi kendi piksel olcusunde cizilir: uzatinca kalinlik, akis deseni ve hizi degismez.
 * 2026-11-18: Detayli stilde silindir hissi icin her parcaya ince bir parlama (zsheen) cizilir
 * (Klasik/ISA-101'de gorunmez); dis cizgi (zpo) ve bos boru dolgusu (zpf) metal tonu alir.
 * Degrade KULLANILMAZ: yatay borunun sinir kutusu yuksekligi sifirdir, degrade cizilemez. */
const pipeFamily:Renderer=(ctx)=>{const{w,on,active,line}=ctx;
 const width=Math.max(1,w.width),height=Math.max(1,w.height),mx=width/2,my=height/2;
 const lw=Math.max(4,Math.min(w.lineWidth,Math.min(width,height)-2));
 const d=w.type==='pipe'?`M0 ${my}H${width}`
  :w.type==='elbow'?`M0 ${my}H${mx}V0`
  :w.type==='tee'?`M0 ${my}H${width}M${mx} ${my}V0`
  :w.type==='cross'?`M0 ${my}H${width}M${mx} 0V${height}`
  :`M0 ${my}H${width}`;
 const ends=w.type==='elbow'?[{x:0,y:my,axis:'h'},{x:mx,y:0,axis:'v'}]
  :w.type==='tee'?[{x:0,y:my,axis:'h'},{x:width,y:my,axis:'h'},{x:mx,y:0,axis:'v'}]
  :w.type==='cross'?[{x:0,y:my,axis:'h'},{x:width,y:my,axis:'h'},{x:mx,y:0,axis:'v'},{x:mx,y:height,axis:'v'}]
  :[{x:0,y:my,axis:'h'},{x:width,y:my,axis:'h'}];
 const o=lw*.22,sw=Math.max(1,lw*.22);
 const sheenD=w.type==='elbow'?`M0 ${my-o}H${mx-o}V0`
  :w.type==='tee'?`M0 ${my-o}H${width}M${mx-o} ${my-lw/2}V0`
  :w.type==='cross'?`M0 ${my-o}H${width}M${mx-o} 0V${height}`
  :`M0 ${my-o}H${width}`;
 const fluid=on?w.color+'26':'var(--chip)';
 /* 2026-09-28: akis yuvarlak noktalar olarak akar; 16'lik periyot flow animasyonunun 32'lik kaymasina tam oturur. */
 const dots={strokeDasharray:'0.1 15.9',strokeLinecap:'round' as const};
 const flange=(p:{x:number;y:number;axis:string},i:number)=>{const half=lw/2+4,inset=2.5;
  const [x1,y1,x2,y2]=p.axis==='h'?[p.x===0?inset:width-inset,p.y-half,p.x===0?inset:width-inset,p.y+half]
   :[p.x-half,p.y===0?inset:height-inset,p.x+half,p.y===0?inset:height-inset];
  return <line className="zpo" key={'f'+i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={line} strokeWidth="3.5" strokeLinecap="round"/>;};
 if(w.type==='reducer'){
  const big=lw/2,small=Math.max(2,lw/2*.55),taper=Math.min(width*.42,Math.max(18,lw));
  const cone=`M0 ${my-big}H${width*.5-taper/2}L${width*.5+taper/2} ${my-small}H${width}V${my+small}H${width*.5+taper/2}L${width*.5-taper/2} ${my+big}H0Z`;
  return <><path className={'zpo'+(on?'':' zpf')} d={cone} fill={fluid} stroke={line} strokeWidth="2.5" strokeLinejoin="round"/>
   <path className="zsheen" d={`M0 ${my-big*.45}H${width*.5-taper/2}L${width*.5+taper/2} ${my-small*.45}H${width}`} fill="none" stroke="#fff" strokeWidth={Math.max(1,big*.35)} opacity="0"/>
   {on&&<path d={`M0 ${my}H${width}`} fill="none" stroke={w.color} strokeWidth={Math.max(2.5,small*.8)} {...dots} className={active?'flow':''} style={{animationDirection:w.reverse?'reverse':'normal'}}/>}
   {ends.map(flange)}</>;}
 return <>
  <path className="zpo" d={d} fill="none" stroke={line} strokeWidth={lw+3} strokeLinecap="butt" strokeLinejoin="round"/>
  <path className={on?undefined:'zpf'} d={d} fill="none" stroke={fluid} strokeWidth={lw} strokeLinecap="butt" strokeLinejoin="round"/>
  <path className="zsheen" d={sheenD} fill="none" stroke="#fff" strokeWidth={sw} strokeLinejoin="round" opacity="0"/>
  {on&&<path d={d} fill="none" stroke={w.color} strokeWidth={Math.max(2.5,lw*.38)} {...dots} strokeLinejoin="round" className={active?'flow':''} style={{animationDirection:w.reverse?'reverse':'normal'}}/>}
  {ends.map(flange)}</>;};
/* Flans (G09): 120x100 sabit kutuda cizilir (flat degil). `pair` (varsayilan) iki flans yuzu
 * + conta + civatalar; `blind` tek yuz + kapali disk. Mekanik parca: durum/bag/animasyon yok.
 * Agizlar (4,50) ve (116,50) boru saplariyla govdeye ulasir. */
const flange:Renderer=(c)=>{const k=kit({...c,stroke:c.line}),{variant}=c;
 const bolts=(x:number)=>[30,70].map(y=><circle key={x+'-'+y} {...k.p} cx={x} cy={y} r="2.2"/>);
 if(variant==='blind')return <>
  <rect {...k.p} x="4" y="44" width="44" height="12"/>
  <Body><rect {...k.b} x="46" y="24" width="8" height="52" rx="1.5"/><rect {...k.b} x="54" y="30" width="6" height="40" rx="1"/></Body>
  {bolts(50)}
 </>;
 return <>
  <rect {...k.p} x="4" y="44" width="44" height="12"/><rect {...k.p} x="72" y="44" width="44" height="12"/>
  <Body><rect {...k.b} x="46" y="24" width="10" height="52" rx="1.5"/><rect {...k.b} x="64" y="24" width="10" height="52" rx="1.5"/></Body>
  <rect x="56" y="28" width="8" height="44" fill="#2b2f33" opacity=".55"/>
  {bolts(51)}{bolts(69)}
  <path {...k.d} d="M48 31h24M48 69h24"/>
 </>;};
export const renderers:Record<string,Renderer>={pipe:pipeFamily,elbow:pipeFamily,tee:pipeFamily,cross:pipeFamily,reducer:pipeFamily,flange};
