import type {Renderer} from './ctx';
import type {Widget} from '../../contracts/model';
/* Faz 2 sekil secenekleri. strokeWidth 0 = turun eski varsayilani, fillColor bos = eski ton
 * (renk + hafif saydamlik). Boylece kayitli ekranlar ayni cizilir. */
const mix=(c:string,a:number)=>a>=1?c:'color-mix(in srgb,'+c+' '+Math.round(a*100)+'%,transparent)';
export const shapeFill=(w:Widget,tint:number)=>w.fillColor?mix(w.fillColor,w.fillOpacity):mix(w.color,tint);
export const shapeStroke=(w:Widget)=>w.borderColor||w.color;
export const shapeDash=(w:Widget,sw:number)=>w.strokeStyle==='dashed'?sw*3+' '+sw*2:w.strokeStyle==='dotted'?'0.1 '+sw*2:undefined;
/* Belirgin dolguda yazi temadan degil dolgudan renk alir: koyu temada beyaz bolme okunmuyordu. */
export function inkOn(w:Widget){
 if(!w.fillColor||w.fillOpacity<.5)return 'var(--txt)';
 const n=parseInt(w.fillColor.slice(1),16),l=(0.2126*(n>>16&255)+0.7152*(n>>8&255)+0.0722*(n&255))/255;
 return l>.55?'#1d2126':'#f2f3f5';
}
const shadows={none:undefined,soft:'0 2px 6px #10283c1f,0 8px 18px -6px #10283c29',strong:'0 4px 10px #10283c2e,0 18px 36px -10px #10283c4d'};
const dropShadows={none:undefined,soft:'drop-shadow(0 3px 5px #10283c2e)',strong:'drop-shadow(0 8px 12px #10283c4d)'};
const shapeLabel=(w:Widget)=>w.labelVisible!==false&&w.label?<span className="shape-label" style={{color:inkOn(w),fontSize:w.fontSize||undefined,fontWeight:w.fontWeight,textAlign:w.textAlign,justifyContent:w.textAlign==='left'?'flex-start':w.textAlign==='right'?'flex-end':'center'}}>{w.label}</span>:null;
/** Duzgun cokgen / yildiz koseleri, 0-100 kutusunda; tepe noktasi yukarida. */
export function shapePoints(type:'polygon'|'star',sides:number){
 const n=Math.max(3,Math.min(12,Math.round(sides))),pts:string[]=[],count=type==='star'?n*2:n;
 for(let i=0;i<count;i++){const a=-Math.PI/2+i*2*Math.PI/count,r=type==='star'&&i%2?.42:1;
  pts.push((50+50*r*Math.cos(a)).toFixed(2)+','+(50+50*r*Math.sin(a)).toFixed(2));}
 return pts.join(' ');
}
const vector=(type:'polygon'|'star'):Renderer=>(ctx)=>{const{w}=ctx;const sw=w.strokeWidth||2;
 return {html:<div className="symbol-shape" style={{filter:dropShadows[w.shadow]}}>
  <svg viewBox="-2 -2 104 104" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true"><polygon points={shapePoints(type,w.sides)} fill={shapeFill(w,.08)} stroke={shapeStroke(w)} strokeWidth={sw} strokeDasharray={shapeDash(w,sw)} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg>
  {shapeLabel(w)}</div>};};
export const renderers:Record<string,Renderer>={
'text':(ctx)=>{const{w}=ctx;return {html:<div className="symbol-text" style={{color:w.color==='#208169'?'var(--txt)':w.color,fontSize:w.fontSize||undefined,textAlign:w.textAlign,justifyContent:w.textAlign==='left'?'flex-start':w.textAlign==='right'?'flex-end':'center'}}>{w.labelVisible!==false&&w.label}</div>};},
'rectangle':(ctx)=>{const{w}=ctx;return {html:<div className="symbol-area" style={{border:(w.strokeWidth||1)+'px '+w.strokeStyle+' '+shapeStroke(w),borderRadius:w.radius,background:shapeFill(w,.05),color:w.color,fontSize:w.fontSize||undefined,boxShadow:shadows[w.shadow]}}>{w.labelVisible!==false&&w.label}</div>};},
/* Bolme: baslik seritli grup cercevesi; ekrani bolgelere ayirir, veri tasimaz. */
'section':(ctx)=>{const{w}=ctx;const sw=w.strokeWidth||1.5,stroke=shapeStroke(w);
 return {html:<div className="symbol-section" style={{border:sw+'px '+w.strokeStyle+' '+stroke,borderRadius:w.radius,background:w.fillColor?shapeFill(w,0):'transparent',boxShadow:shadows[w.shadow]}}>
  {w.labelVisible!==false&&<div className="symbol-section-head" style={{background:mix(stroke,.12),borderBottom:sw+'px '+w.strokeStyle+' '+mix(stroke,.5),color:inkOn(w),fontSize:w.fontSize||undefined,fontWeight:w.fontWeight==='400'?600:w.fontWeight,textAlign:w.textAlign}}><i style={{background:stroke}}/>{w.label}</div>}
 </div>};},
'polygon':vector('polygon'),
'star':vector('star'),
'alarm':(ctx)=>{const{w,on,unknown}=ctx;return {html:<div className={'symbol-alarm '+(on?'active ':'')+(on&&w.animated?'blink':'')} style={on?{borderColor:w.color,color:w.color,background:w.color+'1a'}:undefined}><span className="alarm-dot" style={on?{background:w.color}:undefined}/>{w.labelVisible!==false&&<span style={{fontSize:w.fontSize||undefined}}>{w.label}</span>}<strong>{unknown?'BİLİNMİYOR':on?'ALARM':'NORMAL'}</strong></div>};},
'info':(ctx)=>{const{w}=ctx;return {html:<div className="symbol-info" style={{borderColor:w.color,color:w.color,background:w.color+'12'}} title={w.label}>
 <svg viewBox="0 0 24 24" width="58%" height="58%" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.4v.2"/></svg>
 {w.labelVisible!==false&&w.label&&<small style={{fontSize:w.fontSize||undefined}}>{w.label}</small>}</div>};},
'image':(ctx)=>{const{w}=ctx;return {html:w.src?<img className="symbol-image" src={w.src} alt={w.label} draggable={false} style={{objectFit:w.fit}}/>
 :<div className="symbol-image empty"><span>{w.label||'Görsel seçilmedi'}</span></div>};},
/* Yon oku: sadece gorsel, veri/durum tasimaz; reverse yonu ceviriyor. */
'arrow':(ctx)=>{const{w}=ctx;const sw=w.strokeWidth||10;const body=<><line x1="10" y1="50" x2="90" y2="50" stroke={w.color} strokeWidth={sw} strokeDasharray={shapeDash(w,sw)} strokeLinecap="round"/><path d="M84 30L114 50L84 70Z" fill={w.color}/></>;
 return w.reverse?<g transform="translate(120 0) scale(-1 1)">{body}</g>:body;},
/* Aciklama balonu: HTML govde, sol-alta inen kilavuz cizgi. tagId baglanmissa
 * degeri metnin yanina ekler; kotu kalitede em-dash gosterir. */
'callout':(ctx)=>{const{w,num,good}=ctx;const hasTag=!!w.tagId;const val=hasTag?(good?(num===null?'—':Math.round(num*100)/100):'—'):null;
 return {html:<div style={{position:'relative',width:'100%',height:'100%'}}>
  <div style={{position:'absolute',left:6,top:4,right:6,bottom:18,border:'2px solid '+w.color,borderRadius:10,background:'var(--sym-body)',color:'var(--txt)',fontSize:w.fontSize||13,padding:'6px 10px',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',overflow:'hidden'}}>
   {w.labelVisible!==false&&<span>{w.label}{hasTag&&<b> · {val}</b>}</span>}
  </div>
  <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,pointerEvents:'none'}}><path d="M14 82L2 98" stroke={w.color} strokeWidth="4" strokeLinecap="round"/></svg>
 </div>};},
/* Cizgi: FLAT aile, pipe.tsx'teki piksel-gerilme yaklasimi; durum tasimaz. */
'line':(ctx)=>{const{w}=ctx;const width=Math.max(1,w.width),height=Math.max(1,w.height),my=height/2;
 const lw=Math.max(1,Math.min(w.lineWidth,height));
 return <line x1="0" y1={my} x2={width} y2={my} stroke={w.color} strokeWidth={lw} strokeDasharray={shapeDash(w,lw)} strokeLinecap="round"/>;},
/* Elips: duz sekil, durum tasimaz; rectangle ile ayni golgelendirme deyimi. */
'ellipse':(ctx)=>{const{w}=ctx;const sw=w.strokeWidth||3;return <><ellipse cx="60" cy="48" rx="56" ry="42" fill={shapeFill(w,.08)} stroke={shapeStroke(w)} strokeWidth={sw} strokeDasharray={shapeDash(w,sw)} strokeLinecap="round" style={{filter:dropShadows[w.shadow]}}/>
 {w.labelVisible!==false&&w.label&&<text x="60" y="53" textAnchor="middle" fontSize={w.fontSize||13} fontWeight={w.fontWeight} fill="var(--txt)">{w.label}</text>}</>;},
};
