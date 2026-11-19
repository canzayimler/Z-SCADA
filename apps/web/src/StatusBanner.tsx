import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,Info,RefreshCw,WifiOff,Inbox,ExternalLink,Download} from 'lucide-react';
import type {Notice} from './statusModel';
/* Sistem bildirimleri (baglanti, uygulanmamis yapilandirma, surum kaymasi). 28.09 kullanıcı kararı:
 * sayfanin tepesinde bant olarak degil, ust cubuktaki bildirim simgesinde dursun; tiklayinca acilsin.
 * Simge her zaman yerinde durur (duzen ziplamaz); rozet sayisi ve rengi en agir bildirimi soyler.
 * Tam ekranda (pano) ust cubuk yok: sag ustte kucuk bir dugme olarak cizilir. */
const icon=(n:Notice)=>n.id==='update'?<Download size={16}/>:n.tone==='info'?<Info size={16}/>:n.id==='server'||n.id==='bridge'?<WifiOff size={16}/>:<AlertTriangle size={16}/>;
export function NoticeCenter({notices,floating}:{notices:Notice[];floating?:boolean}){
 const [open,setOpen]=useState(false),box=useRef<HTMLDivElement>(null);
 const worst=notices.some(n=>n.tone==='bad')?'bad':notices.some(n=>n.tone==='warn')?'warn':notices.length?'info':'';
 useEffect(()=>{
  if(!open)return;
  const away=(e:PointerEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(false);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',esc);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',esc);};
 },[open]);
 if(floating&&!notices.length)return null;
 const label=notices.length?notices.length+' sistem bildirimi':'Sistem bildirimi yok';
 return <div className={'notice-center'+(floating?' floating':'')} ref={box}>
  <button className={'notice-trigger '+worst} aria-label={label} title={label} aria-expanded={open} onClick={()=>setOpen(o=>!o)}>
   <Inbox size={16} strokeWidth={1.7}/>{floating&&<span>{notices.length} bildirim</span>}{notices.length>0&&!floating&&<b>{notices.length}</b>}
  </button>
  {open&&<div className="notice-panel" role="dialog" aria-label="Sistem bildirimleri">
   <header>Sistem bildirimleri</header>
   {notices.length?notices.map(n=><div key={n.id} className={'notice-item '+n.tone}>
    {icon(n)}<div><strong>{n.title}</strong>{n.detail&&<span>{n.detail}</span>}
    {n.hint&&<span>{n.hint}</span>}
    {!!n.links?.length&&<span className="notice-links">{n.links.map(l=><a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">{l.label}<ExternalLink size={12}/></a>)}</span>}
    {n.action==='reload'&&<button className="btn small" onClick={()=>location.reload()}><RefreshCw size={13}/>Yenile</button>}</div>
   </div>):<p className="notice-empty">Her şey yolunda: bağlantı, yapılandırma ve sürüm güncel.</p>}
  </div>}
 </div>;
}
