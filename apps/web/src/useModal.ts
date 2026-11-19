import {useEffect,useRef} from 'react';
/**
 * Modal erişilebilirliği: odağı pencere içinde tutar, Escape ile kapatır ve
 * kapanınca odağı tetikleyen öğeye geri verir. Yanlış yerde kalan odak
 * operatör ekranında beklenmedik komut verebilir.
 */
export function useModal<T extends HTMLElement>(open:boolean,onClose:()=>void){
 const ref=useRef<T|null>(null),opener=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  if(!open)return;
  opener.current=document.activeElement as HTMLElement|null;
  const focusable=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')||[]).filter(el=>el.offsetParent!==null);
  const first=focusable()[0];if(first&&!ref.current?.contains(document.activeElement))first.focus();
  function key(e:KeyboardEvent){
   if(e.key==='Escape'){e.stopPropagation();onClose();return;}
   if(e.key!=='Tab')return;
   const items=focusable();if(!items.length)return;
   const start=items[0],end=items[items.length-1],active=document.activeElement;
   if(e.shiftKey&&(active===start||!ref.current?.contains(active))){e.preventDefault();end.focus();}
   else if(!e.shiftKey&&active===end){e.preventDefault();start.focus();}
  }
  document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('keydown',key,true);opener.current?.focus?.();};
 },[open,onClose]);
 return ref;
}
