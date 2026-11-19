import {useState} from 'react';
import {validateValue,writeRangeOf,type Config,type Widget} from '../../../packages/contracts/model';
function decimalsOf(n:number):number{const s=String(n);const i=s.indexOf('.');return i<0?0:s.length-i-1;}
export function NumericEntry({widget,config,currentValue,unavailable,preview,onClose,onSubmit}:{widget:Widget;config:Config;currentValue:unknown;unavailable:boolean;preview:boolean;onClose:()=>void;onSubmit:(value:number)=>Promise<void>}){
 const command=config.commands.find(c=>c.id===widget.commandId),tag=config.tags.find(t=>t.id===command?.tagIds[0]);
 /* G45: izin verilen aralik nesnenin daralttigi araliktir; etiketin tum
  * olcegi degil. Sunucu ayni sinirlari zorlar. */
 const range=writeRangeOf(widget,config);
 const [text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 function validateText(t:string):string{
  if(!command||!tag)return 'Sayısal yazma komutu bağlı değil.';
  const s=t.trim();if(!s)return '';
  if(!/^-?\d+([.,]\d+)?$/.test(s))return 'Geçersiz sayı biçimi.';
  const value=Number(s.replace(',','.'));
  try{validateValue(config,command.tagIds,value);}catch(e){return (e as Error).message;}
  if(value<range.min||value>range.max)return 'Bu nesnede izin verilen aralık: '+range.min+' – '+range.max+(tag?.unit?' '+tag.unit:'')+'.';
  return '';
 }
 const liveError=text.trim()?validateText(text):'';
 async function submit(e:React.FormEvent){e.preventDefault();if(busy||unavailable||!tag)return;
  if(!text.trim()){setError('Bir değer girin.');return;}
  if(liveError){setError(liveError);return;}
  const value=Number(text.trim().replace(',','.'));
  setBusy(true);setError('');
  try{await onSubmit(value);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function step(dir:1|-1,big:boolean){
  if(!tag)return;
  const inc=Math.abs(tag.scale)*(big?10:1);
  const cur=Number(text.trim().replace(',','.'));
  const base=Number.isFinite(cur)?cur:(typeof currentValue==='number'?currentValue:tag.min);
  let next=base+dir*inc;next=Math.min(range.max,Math.max(range.min,next));
  setText(next.toFixed(decimalsOf(tag.scale)));setError('');
 }
 return <div className="modal-backdrop" onPointerDown={e=>e.stopPropagation()}><form className="modal" role="dialog" aria-modal="true" aria-label="Analog değer yaz" onSubmit={e=>void submit(e)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'&&!busy)onClose();}}>
  <div className="modal-heading"><h2>{widget.label}</h2><button type="button" className="btn small" onClick={onClose} disabled={busy}>Kapat</button></div>
  <p>{preview?'Önizleme · PLC’ye gönderilmez':'PLC geri bildirimi'}: <strong>{typeof currentValue==='number'?currentValue:'Bilinmiyor'} {tag?.unit}</strong></p>
  {tag&&<p>İzin verilen aralık: {range.min} – {range.max} {tag.unit} · Adım: {Math.abs(tag.scale)}{(widget.writeMin!==null||widget.writeMax!==null)&&<span className="small muted"> · etiket ölçeği {tag.min} – {tag.max}, bu nesne daraltıyor</span>}</p>}
  <label className="field"><span>Yeni değer {tag?.unit&&`(${tag.unit})`}</span><input autoFocus inputMode="decimal" aria-label="Yeni değer" value={text} step={tag?Math.abs(tag.scale):undefined} min={range.min} max={range.max} onChange={e=>{setText(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();step(e.key==='ArrowUp'?1:-1,e.shiftKey);}}} placeholder="Değer girin" disabled={busy}/></label>
  {(error||liveError)&&<p role="alert" className="login-error">{error||liveError}</p>}{unavailable&&<p role="alert">Yazma bağlantısı veya yetkisi hazır değil.</p>}
  <div className="modal-actions"><button className="btn primary" type="submit" disabled={busy||unavailable||!tag||!text.trim()||!!liveError}>{busy?'Gönderiliyor…':preview?'Simülasyona uygula':'PLC’ye yaz'}</button></div>
 </form></div>;
}
