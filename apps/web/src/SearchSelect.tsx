import {Fragment,useEffect,useMemo,useRef,useState} from 'react';
import {Search,ChevronDown,X} from 'lucide-react';
import {filterOptions,groupOrder,type PickOption} from './pick';
/** Gruplu listede arama bosken gosterilen azami satir; daha fazlasi "n tane daha" der. */
const GROUP_BROWSE_LIMIT=400;
/* G48: aranabilir secim. Acilir liste yerine: tiklayinca arama kutusu acilir,
 * yalnizca ilk `limit` sonuc listelenir, gerisi "n tane daha" diye sayilir.
 * Klavye ile tam calisir (ok tuslari, Enter, Esc) — saha bilgisayarinda
 * fare olmayabilir. */
export function SearchSelect({value,options,onChange,ariaLabel,placeholder='Seçin',emptyLabel='Bağlı değil',allowEmpty=true,disabled=false,limit=10}:{
 value:string;options:readonly PickOption[];onChange:(value:string)=>void;
 ariaLabel:string;placeholder?:string;emptyLabel?:string;allowEmpty?:boolean;disabled?:boolean;limit?:number;
}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const box=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const selected=options.find(o=>o.value===value);
 /* Gruplu secenekler (orn. etiket -> cihaz): arama bosken hepsi grup basliklari altinda listelenir,
  * kullanici aramadan cihazin etiketlerini gorur; arama yazilinca siralama/sinir eskisi gibi. */
 const grouped=useMemo(()=>options.some(o=>o.group),[options]);
 const browsing=grouped&&!query.trim();
 const result=useMemo(()=>{const r=filterOptions(options,query,browsing?GROUP_BROWSE_LIMIT:limit);return browsing?{...r,items:groupOrder(r.items)}:r;},[options,query,limit,browsing]);
 const rows=useMemo(()=>allowEmpty?[{value:'',label:emptyLabel} as PickOption,...result.items]:result.items,[allowEmpty,emptyLabel,result]);
 useEffect(()=>{
  if(!open)return;
  setQuery('');
  // Imlec secili satirda acilir; kullanici nerede oldugunu gorur.
  const at=rows.findIndex(r=>r.value===value);
  setActive(at<0?0:at);
  input.current?.focus();
 },[open]);
 useEffect(()=>{
  if(!open)return;
  const away=(e:PointerEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(false);};
  document.addEventListener('pointerdown',away);
  return()=>document.removeEventListener('pointerdown',away);
 },[open]);
 // Uzun (gruplu) listede klavyeyle gezilen satir gorunur kalsin.
 useEffect(()=>{if(open)box.current?.querySelector('.pick-row.active')?.scrollIntoView({block:'nearest'});},[active,open]);
 function choose(next:string){onChange(next);setOpen(false);}
 function keys(e:React.KeyboardEvent){
  if(e.key==='Escape'){e.stopPropagation();setOpen(false);return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();
   setActive(i=>{const next=e.key==='ArrowDown'?i+1:i-1;return next<0?rows.length-1:next>=rows.length?0:next;});
   return;
  }
  if(e.key==='Enter'){e.preventDefault();const row=rows[active];if(row)choose(row.value);}
 }
 return <div className="search-select" ref={box}>
  <button type="button" className={'pick-button'+(selected?'':' empty')} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
   disabled={disabled} onClick={()=>setOpen(o=>!o)}>
   <span>{selected?selected.label:(value?value:placeholder)}</span>
   {selected?.hint&&<small>{selected.hint}</small>}
   <ChevronDown size={14}/>
  </button>
  {open&&<div className="pick-popover">
   <div className="pick-search"><Search size={13}/>
    <input ref={input} value={query} aria-label={ariaLabel+' ara'} placeholder="Kod veya ad ara" onChange={e=>{setQuery(e.target.value);setActive(0);}} onKeyDown={keys}/>
    {query&&<button type="button" className="tool" aria-label="Aramayı temizle" onClick={()=>{setQuery('');input.current?.focus();}}><X size={12}/></button>}
   </div>
   <div className="pick-list" role="listbox" aria-label={ariaLabel}>
    {rows.map((row,i)=>{
     const head=browsing&&row.value&&row.group!==undefined&&row.group!==rows[i-1]?.group;
     return <Fragment key={row.value||'__empty'}>
      {head&&<div className="pick-group" role="presentation">{row.group}</div>}
      <button type="button" role="option" aria-selected={row.value===value}
       className={'pick-row'+(i===active?' active':'')+(row.value===value?' current':'')}
       onPointerEnter={()=>setActive(i)} onClick={()=>choose(row.value)}>
       <span>{row.label}</span>{row.hint&&<small>{row.hint}</small>}
      </button>
     </Fragment>;})}
    {!rows.length&&<p className="pick-empty">Eşleşme yok. Kodun bir parçasını yazın.</p>}
   </div>
   {result.more>0&&<p className="pick-more">{result.more} tane daha var · aramayı daraltın</p>}
  </div>}
 </div>;
}
