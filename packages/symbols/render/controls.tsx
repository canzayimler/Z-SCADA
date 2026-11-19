import {useEffect,useState} from 'react';
import type {Renderer,SymbolCtx} from './ctx';
/* --- Operator kumanda nesneleri (G44/G45) ----------------------------------
 * Ikisi de numeric-input ile AYNI komut sozlesmesini kullanir: tek sayisal
 * hedef ve komutun geri bildirim etiketi. Fark, degerin nasil secildigidir.
 *
 * Iki deger ayri tutulur ve AYRI cizilir:
 *  - SAHA DEGERI (geri bildirim, ctx.num) — neyin gercekten oldugu,
 *  - HEDEF (operatorun surdugu/yazdigi deger) — ne istendigi.
 * Bu ikisini tek gostergede birlestirmek, gonderilmemis bir istegi
 * gerceklesmis gibi gosterir; bu yuzden hedef ayri ve "gonderilmedi"
 * isaretiyle cizilir.
 */
function reason(ctx:SymbolCtx){
 const {w,live}=ctx;
 if(!live?.write)return 'Bu nesne yalnız operatör ekranında komut gönderir.';
 if(!w.commandId)return 'Bu nesneye sayısal yazma komutu bağlı değil.';
 return live.blocked?.(w)||'';
}
function Slider({ctx}:{ctx:SymbolCtx}){
 const {w,num,good,live}=ctx;
 const min=w.min,max=w.max>w.min?w.max:w.min+1;
 const blocked=reason(ctx);
 const [target,setTarget]=useState<number|null>(null);
 // Saha degeri degistiginde bekleyen hedef gecerliligini yitirir.
 useEffect(()=>{setTarget(null);},[num]);
 const shown=target??(good&&num!==null?num:min);
 const ratio=Math.max(0,Math.min(1,(shown-min)/(max-min)));
 const fieldRatio=good&&num!==null?Math.max(0,Math.min(1,(num-min)/(max-min))):null;
 const step=(max-min)/100;
 const text=(v:number)=>w.decimals>=0?v.toFixed(w.decimals):String(Math.round(v*100)/100);
 return <div className={'live-widget slider-widget'+(blocked?' blocked':'')} title={blocked||undefined}>
  <div className="slider-head"><span>{w.labelVisible!==false?w.label:''}</span>
   <strong>{good&&num!==null?text(num):'—'}{w.unit?' '+w.unit:''}</strong></div>
  <div className="slider-track">
   {fieldRatio!==null&&<span className="slider-field" style={{left:fieldRatio*100+'%'}} aria-hidden="true"/>}
   <input type="range" aria-label={w.label+' hedef değer'} min={min} max={max} step={step||1} value={shown}
    disabled={!!blocked} onChange={e=>setTarget(Number(e.target.value))}/>
  </div>
  <div className="slider-foot">
   <small>{min}</small>
   {target===null?<small className="muted">Sahadaki değer gösteriliyor</small>
    :<><small className="pending">Hedef {text(target)}{w.unit?' '+w.unit:''} · gönderilmedi</small>
      <button className="slider-send" disabled={!!blocked} onClick={()=>{live!.write!(w,target);setTarget(null);}}>Gönder</button>
      <button className="slider-cancel" onClick={()=>setTarget(null)}>Vazgeç</button></>}
   <small>{max}</small>
  </div>
  {!!blocked&&<p className="live-error">{blocked}</p>}
 </div>;
}
const keys=['7','8','9','4','5','6','1','2','3','-','0','.'];
function Keypad({ctx}:{ctx:SymbolCtx}){
 const {w,num,good,live}=ctx;
 const blocked=reason(ctx);
 const [entry,setEntry]=useState('');
 const value=entry===''||entry==='-'||entry==='.'?null:Number(entry);
 const outOfRange=value!==null&&(value<w.min||value>w.max);
 const invalid=entry!==''&&value===null;
 const press=(k:string)=>{
  if(blocked)return;
  if(k==='.'&&entry.includes('.'))return;
  if(k==='-'){setEntry(e=>e.startsWith('-')?e.slice(1):'-'+e);return;}
  setEntry(e=>(e+k).slice(0,12));
 };
 return <div className={'live-widget keypad-widget'+(blocked?' blocked':'')} title={blocked||undefined}>
  <div className="keypad-head"><span>{w.labelVisible!==false?w.label:''}</span>
   <small>saha {good&&num!==null?(w.decimals>=0?num.toFixed(w.decimals):num):'—'}{w.unit?' '+w.unit:''}</small></div>
  <div className={'keypad-entry'+(outOfRange||invalid?' bad':'')}>{entry||'—'}{w.unit&&entry?' '+w.unit:''}</div>
  {outOfRange&&<p className="live-error">Değer {w.min} – {w.max} aralığı dışında.</p>}
  {invalid&&<p className="live-error">Geçerli bir sayı girin.</p>}
  <div className="keypad-grid">{keys.map(k=><button key={k} disabled={!!blocked} onClick={()=>press(k)}>{k}</button>)}</div>
  <div className="keypad-actions">
   <button onClick={()=>setEntry('')}>Temizle</button>
   <button className="primary" disabled={!!blocked||value===null||outOfRange}
    onClick={()=>{live!.write!(w,value!);setEntry('');}}>Gönder</button>
  </div>
  {!!blocked&&<p className="live-error">{blocked}</p>}
 </div>;
}

/* G41: PID isletme paneli. Uc sayi BIRLIKTE gosterilir — PV, SP ve OUT
 * ayri ayri bakildiginda regulasyonun iyi mi kotu mu oldugu anlasilmaz.
 * Sapma (PV-SP) ayrica yazilir; mod (oto/manuel) renkle degil METINLE
 * gosterilir. SP yazma yolu butonlarla AYNI onay zincirinden gecer. */
function Pid({ctx}:{ctx:SymbolCtx}){
 const {w,readings,live}=ctx;
 const blocked=reason(ctx);
 const num=(role:string)=>role in readings.number?readings.number[role]:undefined;
 const pv=num('pv'),sp=num('sp'),out=num('output');
 const auto=readings.bool.auto,fault=readings.bool.fault,tracking=readings.bool.tracking;
 const min=w.min,max=w.max>w.min?w.max:w.min+1;
 const text=(v:number|null|undefined)=>v===undefined?'yok':v===null?'—':(w.decimals>=0?v.toFixed(w.decimals):String(Math.round(v*100)/100));
 const bar=(v:number|null|undefined)=>v===null||v===undefined?0:Math.max(0,Math.min(1,(v-min)/(max-min)));
 const deviation=pv!==null&&pv!==undefined&&sp!==null&&sp!==undefined?pv-sp:null;
 const mode=fault?'ARIZA':tracking===true?'TAKİP':auto===null||auto===undefined?'MOD BİLİNMİYOR':auto?'OTOMATİK':'MANUEL';
 const tone=fault?'alarm':auto===null||auto===undefined?'unknown':auto?'active':'warn';
 const [target,setTarget]=useState<number|null>(null);
 useEffect(()=>{setTarget(null);},[sp]);
 return <div className={'live-widget pid-widget'+(blocked?' blocked':'')} title={blocked||undefined}>
  <div className="live-head"><span>{w.labelVisible!==false?w.label:''}</span><small className={'pid-mode '+tone}>{mode}</small></div>
  <div className="pid-rows">
   <div className="pid-row"><span>PV</span><i style={{width:bar(pv)*100+'%'}} className="pv"/><strong>{text(pv)}{w.unit?' '+w.unit:''}</strong></div>
   <div className="pid-row"><span>SP</span><i style={{width:bar(sp)*100+'%'}} className="sp"/><strong>{text(sp)}{w.unit?' '+w.unit:''}</strong></div>
   <div className="pid-row"><span>OUT</span><i style={{width:bar(out)*100+'%'}} className="out"/><strong>{text(out)}</strong></div>
  </div>
  <div className="pid-dev">Sapma <strong>{deviation===null?'—':(deviation>0?'+':'')+(w.decimals>=0?deviation.toFixed(w.decimals):Math.round(deviation*100)/100)}</strong></div>
  {live?.write&&w.commandId&&<div className="pid-sp">
   <input type="number" aria-label="Yeni hedef değer" placeholder="Yeni SP" value={target??''} disabled={!!blocked}
    onChange={e=>setTarget(e.target.value===''?null:Number(e.target.value))}/>
   <button disabled={!!blocked||target===null||target<min||target>max} onClick={()=>{live.write!(w,target!);setTarget(null);}}>SP gönder</button>
  </div>}
  {!!blocked&&<p className="live-error">{blocked}</p>}
  {target!==null&&(target<min||target>max)&&<p className="live-error">Hedef {min} – {max} aralığı dışında.</p>}
 </div>;
}
export const renderers:Record<string,Renderer>={
 'slider':ctx=>({html:<Slider ctx={ctx}/>}),
 'keypad':ctx=>({html:<Keypad ctx={ctx}/>}),
 'pid':ctx=>({html:<Pid ctx={ctx}/>})
};
