import type {Config,Live,Screen,Widget} from '../../../packages/contracts/model';
/* Telefon icin operator gorunumu (2026-09-25 inceleme #5): 1920 px'lik cizim 420 px'te %14'e
 * dusup okunmuyordu. Dar ekranda ekrandaki etiketler cizim sirasiyla liste olarak gelir:
 * ad, deger + birim, kalite. Yalniz izleme; komut icin cizim gorunumune gecilir. */
export type RuntimeRow={key:string;label:string;code:string;text:string;quality:string;tone:'good'|'on'|'off'|'bad'|'stale'};
export function runtimeRows(screen:Screen,config:Config,live:Live):RuntimeRow[]{
 const rows:RuntimeRow[]=[],seen=new Set<string>();
 const push=(w:Widget,tagId:string,role?:string)=>{
  if(!tagId||seen.has(tagId))return;seen.add(tagId);
  const tag=config.tags.find(t=>t.id===tagId);if(!tag)return;
  const s=live.samples[tagId],q=s?.quality??'unknown',good=q==='good';
  const bool=tag.dataType==='bool'||typeof s?.value==='boolean';
  const v=s?.value;
  const text=!good?(q==='bad'?'Okuma hatası':q==='stale'?'Bayat':'Veri yok')
   :bool?(v?(w.onText||'AÇIK'):(w.offText||'KAPALI'))
   :v===null||v===undefined?'—':(Math.round(Number(v)*100)/100).toLocaleString('tr-TR')+(tag.unit||w.unit?' '+(tag.unit||w.unit):'');
  const base=(w.label||'').trim();
  rows.push({key:tagId,label:base&&!role?base:base?base+' · '+role:tag.name,code:tag.code,text,quality:q,tone:!good?(q==='bad'?'bad':'stale'):bool?(v?'on':'off'):'good'});
 };
 for(const w of screen.widgets){push(w,w.tagId);for(const b of (w as any).bindings||[])push(w,b.tagId,b.role);}
 return rows;
}
export function RuntimeList({screen,config,live}:{screen:Screen;config:Config;live:Live}){
 const rows=runtimeRows(screen,config,live);
 if(!rows.length)return <div className="empty-state">Bu ekranda etikete bağlı nesne yok.</div>;
 return <ul className="runtime-list" aria-label={screen.name+' etiketleri'}>
  {rows.map(r=><li key={r.key} className={'runtime-row '+r.tone}>
   <div><strong>{r.label}</strong><small>{r.code}</small></div>
   <b>{r.text}</b>
  </li>)}
 </ul>;
}
