import {useEffect,useRef,useState} from 'react';
import type {Renderer,SymbolCtx,HistoryPoint} from './ctx';
import type {Widget,AlarmEvent} from '../../contracts/model';
/* --- Canli veri nesneleri (G37/G38/G39/G48) --------------------------------
 * Bu dosyadaki nesneler tek bir etiket ornegiyle cizilemez: gecmis veri,
 * alarm akisi ya da cok etiketli tablo ister. Veri `ctx.live` kanalindan
 * gelir; kanal yoksa nesne BOS DEGIL, "veri kaynagi yok" halini cizer —
 * tasarim studyosunda da bir sey gorunsun, calisirken de sessizce bos
 * kalmasin diye.
 *
 * Kalem/satir listesi ayri bir alan degil, nesnenin `details` listesidir:
 * ayni sey iki yerde durmasin.
 */
const pens=(w:Widget)=>w.details.filter(d=>d.kind==='value'&&d.tagId).slice(0,8);
const penColors=['#2f6fb0','#c0392b','#2f8f5b','#d8a52e','#7d5ba6','#0f8b8d','#b4581f','#4a5a66'];
const empty=(text:string,detail:string)=><div className="live-empty"><strong>{text}</strong><small>{detail}</small></div>;
/* G37: cok kalemli trend. Her kalem kendi olceginde degil ORTAK olcekte
 * cizilir; farkli birimleri ayni eksende ust uste bindirmek operatoru
 * yanilttigi icin eksen sinirlari nesnenin min/max alanindan gelir. */
function Trend({ctx}:{ctx:SymbolCtx}){
 const {w,live}=ctx;
 const list=pens(w);
 const [series,setSeries]=useState<Record<string,HistoryPoint[]>>({});
 const [error,setError]=useState('');
 const [loaded,setLoaded]=useState(false);
 const timer=useRef<ReturnType<typeof setInterval>|null>(null);
 const window=Math.max(1,w.timeWindowMin||15);
 useEffect(()=>{
  const fetcher=live?.history;
  if(!fetcher||!list.length)return;
  let alive=true;
  const load=async()=>{
   const to=Date.now(),from=to-window*60000;
   try{const r=await fetcher(list.map(d=>d.tagId),from,to);if(alive){setSeries(r);setError('');setLoaded(true);}}
   catch(e){if(alive){setError((e as Error).message||'Geçmiş veri okunamadı.');setLoaded(true);}}
  };
  void load();
  timer.current=setInterval(load,Math.min(60000,Math.max(5000,window*1000)));
  return ()=>{alive=false;if(timer.current)clearInterval(timer.current);};
 },[live?.history,list.map(d=>d.tagId).join(','),window]);
 if(!list.length)return empty('Trend kalemi yok','Bağlantı sekmesinden değer satırı ekleyin; her satır bir kalem olur.');
 if(!live?.history)return empty('Geçmiş veri kaynağı yok','Bu nesne yalnız operatör ekranında veri çizer.');
 const width=1000,height=320,padLeft=8,padRight=8,padTop=10,padBottom=26;
 const min=w.min,max=w.max>w.min?w.max:w.min+1;
 const to=Date.now(),from=to-window*60000;
 const px=(at:number)=>padLeft+((at-from)/(to-from||1))*(width-padLeft-padRight);
 const py=(v:number)=>padTop+(1-Math.max(0,Math.min(1,(v-min)/(max-min))))*(height-padTop-padBottom);
 /* Kalite bosluklari BIRLESTIRILMEZ: kotu/bilinmeyen oruneklerde cizgi
  * kesilir, yoksa veri yokken duz bir cizgi "her sey normaldi" der. */
 const path=(points:HistoryPoint[])=>{
  let d='',penDown=false;
  for(const p of points){
   if(p.value===null||p.quality!=='good'){penDown=false;continue;}
   const x=px(p.at),y=py(p.value);
   d+=(penDown?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' ';
   penDown=true;
  }
  return d.trim();
 };
 const ticks=[0,.25,.5,.75,1];
 return <div className="live-widget trend-widget">
  <div className="live-head"><span>{w.labelVisible!==false?w.label:''}</span><small>son {window} dk</small></div>
  <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="trend-canvas" role="img" aria-label={w.label+' trend grafiği'}>
   {ticks.map(t=><line key={t} x1={padLeft} x2={width-padRight} y1={padTop+t*(height-padTop-padBottom)} y2={padTop+t*(height-padTop-padBottom)} stroke="var(--line)" strokeWidth="1"/>)}
   {list.map((d,i)=>{const points=series[d.tagId]||[];const line=path(points);
    return line?<path key={d.tagId} d={line} fill="none" stroke={penColors[i%penColors.length]} strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>:null;})}
  </svg>
  <div className="trend-scale"><span>{max}</span><span>{min}</span></div>
  <div className="trend-legend">{list.map((d,i)=>{
   const points=series[d.tagId]||[];
   const last=[...points].reverse().find(p=>p.value!==null&&p.quality==='good');
   const info=live.tagInfo?.(d.tagId);
   const text=last?(d.decimals>=0?last.value!.toFixed(d.decimals):String(Math.round(last.value!*100)/100)):'—';
   return <span key={d.tagId} className="trend-pen"><i style={{background:penColors[i%penColors.length]}}/>{d.label||info?.name||info?.code||d.tagId}<strong>{text}{last&&(d.unit||info?.unit)?' '+(d.unit||info?.unit):''}</strong></span>;})}</div>
  {error&&<p className="live-error">{error}</p>}
  {!error&&loaded&&list.every(d=>!(series[d.tagId]||[]).length)&&<p className="live-error muted">Bu aralıkta kayıt yok. Etiketlerde geçmiş kaydı açık mı?</p>}
 </div>;
}
/** Alarm nesnelerinin ortak suzgeci: onem ve alan. */
function filterAlarms(w:Widget,alarms:AlarmEvent[]){
 return alarms.filter(a=>(w.severityFilter==='all'||a.severity===w.severityFilter));
}
const severityRank:Record<string,number>={critical:0,warning:1,info:2};
/* G38: alarm bandi. Operator ekranin tepesinde TEK bir satir gorur: en
 * oncelikli, henuz onaylanmamis olay. Onay sonrasi yanip sonme durur. */
function AlarmBand({ctx}:{ctx:SymbolCtx}){
 const {w,live}=ctx;
 if(!live?.alarms)return empty('Alarm kaynağı yok','Bu nesne yalnız operatör ekranında olay gösterir.');
 const list=filterAlarms(w,live.alarms);
 const active=list.filter(a=>!a.clearedAt||!a.ackAt);
 if(!active.length)return <div className="live-widget alarm-band calm"><span className="alarm-band-dot"/><strong>ALARM YOK</strong><small>{w.severityFilter==='all'?'Tüm önem seviyeleri':'Yalnız '+w.severityFilter}</small></div>;
 const top=[...active].sort((a,b)=>(severityRank[a.severity]??9)-(severityRank[b.severity]??9)||b.raisedAt-a.raisedAt)[0];
 const unacked=!top.ackAt;
 return <div className={'live-widget alarm-band '+top.severity+(unacked&&w.animated?' blink':'')}>
  <span className="alarm-band-dot"/>
  <strong>{top.name}</strong>
  <span className="alarm-band-msg">{top.message}</span>
  <small>{unacked?'ONAYLANMADI':top.clearedAt?'normale döndü':'onaylandı'} · {active.length} olay</small>
 </div>;
}
/* G39: alarm listesi. Sira ISA-18.2 mantigidir: once aktif+onaysiz, sonra
 * aktif+onayli, sonra normale donmus+onaysiz. Ayni onem icinde yeni olay
 * uste gelir. */
function AlarmList({ctx}:{ctx:SymbolCtx}){
 const {w,live}=ctx;
 if(!live?.alarms)return empty('Alarm kaynağı yok','Bu nesne yalnız operatör ekranında olay gösterir.');
 const list=filterAlarms(w,live.alarms);
 const rank=(a:AlarmEvent)=>!a.clearedAt&&!a.ackAt?0:!a.clearedAt?1:!a.ackAt?2:3;
 const rows=[...list].sort((a,b)=>rank(a)-rank(b)||(severityRank[a.severity]??9)-(severityRank[b.severity]??9)||b.raisedAt-a.raisedAt).slice(0,60);
 const time=(at:number)=>new Date(at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 return <div className="live-widget alarm-list">
  <div className="live-head"><span>{w.labelVisible!==false?w.label:'Alarmlar'}</span><small>{rows.length} olay</small></div>
  <div className="alarm-list-rows">
   {!rows.length&&<p className="live-error muted">Gösterilecek alarm yok.</p>}
   {rows.map(a=><div key={a.id} className={'alarm-list-row '+a.severity+(!a.ackAt?' unacked':'')+(a.clearedAt?' cleared':'')}>
    <span className="alarm-list-time">{time(a.raisedAt)}</span>
    <span className="alarm-list-name">{a.name}<small>{a.message}</small></span>
    <span className="alarm-list-state">{!a.clearedAt&&!a.ackAt?'AKTİF · ONAYSIZ':!a.clearedAt?'AKTİF':!a.ackAt?'DÖNDÜ · ONAYSIZ':'KAPANDI'}</span>
    {live.ack&&!a.ackAt&&<button className="alarm-list-ack" onClick={e=>{e.stopPropagation();live.ack!(a.id);}}>Onayla</button>}
   </div>)}
  </div>
 </div>;
}
/* G48: canli deger tablosu. Satirlar `details` listesinden gelir; her
 * hucre kendi kalitesini tasir, kotu veri bos birakilmaz em-dash olur. */
function DataTable({ctx}:{ctx:SymbolCtx}){
 const {w,samples,live}=ctx;
 const rows=pens(w);
 if(!rows.length)return empty('Tablo satırı yok','Bağlantı sekmesinden değer satırı ekleyin.');
 return <div className="live-widget data-table">
  <div className="live-head"><span>{w.labelVisible!==false?w.label:''}</span><small>{rows.length} satır</small></div>
  <table><tbody>{rows.map(d=>{
   const s=samples?.[d.tagId];
   const info=live?.tagInfo?.(d.tagId);
   const good=s?.quality==='good';
   const text=!good||s?.value===null||s?.value===undefined?'—'
    :typeof s.value==='boolean'?(s.value?'AÇIK':'KAPALI')
    :(d.decimals>=0?Number(s.value).toFixed(d.decimals):String(Math.round(Number(s.value)*100)/100));
   return <tr key={d.tagId} className={good?'':'stale'}>
    <th>{d.label||info?.name||info?.code||d.tagId}</th>
    <td>{text}{good&&typeof s?.value==='number'&&(d.unit||info?.unit)?' '+(d.unit||info?.unit):''}</td>
   </tr>;})}</tbody></table>
 </div>;
}
export const renderers:Record<string,Renderer>={
 'trend':ctx=>({html:<Trend ctx={ctx}/>}),
 'alarm-band':ctx=>({html:<AlarmBand ctx={ctx}/>}),
 'alarm-list':ctx=>({html:<AlarmList ctx={ctx}/>}),
 'data-table':ctx=>({html:<DataTable ctx={ctx}/>})
};
