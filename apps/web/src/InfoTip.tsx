import {useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Info} from 'lucide-react';
/**
 * Tiklaninca acilan bilgi balonu. Aciklama metni sayfada yer kaplamasin diye
 * burada durur. Disari tiklama veya Esc kapatir; kirpan kapsayicinin icinde
 * kalacak sekilde kayar veya yukari acilir. Animasyon style.css'teki standart hareket degiskenlerinden gelir.
 */
export function InfoTip({children,label='Açıklama'}:{children:ReactNode;label?:string}){
 const [open,setOpen]=useState(false),[shift,setShift]=useState(0),[up,setUp]=useState(false);
 const ref=useRef<HTMLSpanElement>(null),pop=useRef<HTMLSpanElement>(null),id=useId();
 // Balon ekranin ya da en yakin kirpan kapsayicinin (modal, kaydirilan panel) icinde kalir:
 // yatayda tasma kadar kayar (sol kenari gecmeden), altta yer yoksa yukari acilir.
 useLayoutEffect(()=>{if(!open){setShift(0);setUp(false);return;}
  const r=pop.current?.getBoundingClientRect(),anchor=ref.current?.getBoundingClientRect();if(!r||!anchor)return;
  let left=0,right=window.innerWidth,bottom=window.innerHeight,top=0;
  for(let el=ref.current?.parentElement;el&&el!==document.body;el=el.parentElement){const st=getComputedStyle(el);if(/(auto|scroll|hidden)/.test(st.overflowY+st.overflowX)){const c=el.getBoundingClientRect();left=Math.max(left,c.left);right=Math.min(right,c.right);bottom=Math.min(bottom,c.bottom);top=Math.max(top,c.top);break;}}
  const over=r.right-(right-12);
  if(over>0)setShift(-Math.min(over,Math.max(0,r.left-(left+12))));
  if(r.bottom>bottom-8&&anchor.top-top>r.height+8)setUp(true);},[open]);
 useEffect(()=>{if(!open)return;
  const out=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  document.addEventListener('pointerdown',out);document.addEventListener('keydown',esc);
  return()=>{document.removeEventListener('pointerdown',out);document.removeEventListener('keydown',esc);};},[open]);
 return <span className={'infotip'+(open?' open':'')} ref={ref}>
  <button type="button" className="infotip-btn" aria-label={label} title={label} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(o=>!o)}><Info size={14}/></button>
  {open&&<span className={'infotip-pop'+(up?' up':'')} style={shift?{left:'calc(-6px + '+shift+'px)'}:undefined} id={id} role="note" ref={pop}>{children}</span>}
 </span>;
}
