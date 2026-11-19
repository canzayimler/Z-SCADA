import {useEffect,useState} from 'react';
import {FolderOpen,Plus,Save,Trash2} from 'lucide-react';
import {api} from './api';
import {InfoTip} from './InfoTip';
type Meta={id:string;name:string;savedAt:number;savedBy:string;screens:number;devices:number;tags:number};
/**
 * Proje yoneticisi: tek calisan proje + arsiv. Acma ve silme iki adimlidir
 * (ilk tik onay ister). Acilan projede cihazlar pasif gelir; sahaya almak
 * Cihazlar -> "Haberlesmeye uygula" ile ayri bir karardir.
 */
export function ProjectsPanel({refresh,notify}:{refresh:()=>Promise<void>;notify:(s:string,tone?:'info'|'error')=>void}){
 const [data,setData]=useState<{current:{id:string;name:string};projects:Meta[]}|null>(null);
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState('');
 async function load(){try{setData(await api('/projects'));}catch(e){notify((e as Error).message,'error');}}
 useEffect(()=>{void load();},[]);
 useEffect(()=>{if(!pending)return;const id=setTimeout(()=>setPending(''),4000);return()=>clearTimeout(id);},[pending]);
 async function act(fn:()=>Promise<string>){setBusy(true);try{const msg=await fn();await refresh();await load();notify(msg);}catch(e){notify((e as Error).message,'error');}finally{setBusy(false);setPending('');}}
 const when=(t:number)=>new Date(t).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'});
 return <section className="settings-section projects-panel">
  <div className="settings-head"><h2>Projeler</h2><InfoTip>Her zaman tek proje çalışır; diğerleri arşivde durur. Proje değiştirirken açık proje otomatik kaydedilir. Açılan projede cihazlar <strong>pasif</strong> gelir; PLC haberleşmesi Cihazlar sayfasından uygulanana kadar değişmez.</InfoTip></div>
  {data&&<div className="project-current"><div><span className="eyebrow">Açık proje</span><strong>{data.current.name}</strong></div>
   <button className="btn" disabled={busy} onClick={()=>void act(async()=>{await api('/projects/save','POST');return 'Proje arşive kaydedildi.';})}><Save size={15}/>Arşive kaydet</button></div>}
  <form className="project-new" onSubmit={e=>{e.preventDefault();const n=name.trim();if(!n)return;void act(async()=>{await api('/projects/new','POST',{name:n});setName('');return '"'+n+'" projesi açıldı. Önceki proje arşivde.';});}}>
   <input aria-label="Yeni proje adı" placeholder="Yeni proje adı" value={name} maxLength={100} onChange={e=>setName(e.target.value)} disabled={busy}/>
   <button className="btn primary" disabled={busy||!name.trim()}><Plus size={15}/>Yeni proje</button>
  </form>
  {data&&(data.projects.length?<div className="project-list" role="list">{data.projects.map(p=><div className="project-row" role="listitem" key={p.id}>
   <div className="project-info"><strong>{p.name}</strong><small>{p.screens} ekran · {p.devices} cihaz · {p.tags} etiket · {when(p.savedAt)} · {p.savedBy}</small></div>
   <button className={'btn small'+(pending==='open:'+p.id?' primary':'')} disabled={busy} onClick={()=>{if(pending!=='open:'+p.id){setPending('open:'+p.id);return;}void act(async()=>{await api('/projects/'+p.id+'/open','POST');return '"'+p.name+'" açıldı. Cihazlar pasif; sahaya almak için Cihazlar → Haberleşmeye uygula.';});}}><FolderOpen size={14}/>{pending==='open:'+p.id?'Açılsın mı?':'Aç'}</button>
   <button className={'btn small danger-ghost'+(pending==='del:'+p.id?' confirm':'')} disabled={busy} aria-label={p.name+' projesini sil'} title="Arşivden sil" onClick={()=>{if(pending!=='del:'+p.id){setPending('del:'+p.id);return;}void act(async()=>{await api('/projects/'+p.id,'DELETE');return '"'+p.name+'" arşivden silindi.';});}}>{pending==='del:'+p.id?'Silinsin mi?':<Trash2 size={14}/>}</button>
  </div>)}</div>:<p className="small muted">Arşivde başka proje yok.</p>)}
 </section>;
}
