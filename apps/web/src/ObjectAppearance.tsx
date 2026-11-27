import {newWidget,type Screen,type Widget} from '../../../packages/contracts/model';
import {Field,Hint} from './StudioFields';
import {variantsOf,panelSpec,sizes} from '../../../packages/symbols/catalog';
import {Symbol} from '../../../packages/symbols/Symbol';
import {styledWidget} from '../../../packages/symbols/isa';
import {snapFrameToDrawing,frameForDrawing,framePadding,stretches} from '../../../packages/symbols/frame';
/* G47: gorunum paneli her sembole ayni uzun listeyi gosteriyordu — metne
 * animasyon hizi, boruya yazi hizasi, gostergeye cizilmeyen isletme bandi.
 * Panel artik turun cizimi hangi alanlari kullaniyorsa yalnizca onlari
 * gosterir; sira da onemden gelir: once o sembolu sembol yapan ayar
 * (govde tipi, olcek, bant), sonra renk ve yazi, en sonda hareket. */
export function ObjectAppearance({widget:w,onChange,symbolStyle='classic',surface='light'}:{widget:Widget;onChange:(p:Partial<Widget>)=>void;symbolStyle?:Screen['symbolStyle'];surface?:'light'|'dark'}){
 const spec=panelSpec(w.type),variants=variantsOf(w.type);
 const activeVariant=variants.length?(variants.some(v=>v.key===w.variant)?w.variant:variants[0].key):'';
 const [pw,ph]=sizes[w.type]||[120,100];
 const vScale=Math.min(76/pw,44/ph);
 return <div className="appearance-fields">
  {spec.variants&&<><div className="property-section">Gövde tipi</div>
   <div className={'variant-grid'+(symbolStyle==='detailed'?' sym-detailed':'')} role="radiogroup" aria-label="Gövde varyantı">
    {variants.map((v,idx)=>{const active=activeVariant===v.key;
     const previewWidget=styledWidget({...newWidget(w.type),variant:v.key,color:w.color,label:w.type==='instrument'?'FT-101':w.type==='data-card'?'Basınç':''},symbolStyle,surface);
     return <div key={v.key} role="radio" tabIndex={active?0:-1} aria-checked={active} className={'variant-tile'+(active?' active':'')}
      onClick={()=>onChange({variant:v.key})}
      onKeyDown={e=>{
       if(e.key==='Enter'||e.key===' '){e.preventDefault();onChange({variant:v.key});return;}
       if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key))return;
       e.preventDefault();
       const nextIdx=(idx+(e.key==='ArrowRight'||e.key==='ArrowDown'?1:-1)+variants.length)%variants.length;
       onChange({variant:variants[nextIdx].key});
       e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[nextIdx]?.focus();
      }}>
      <div className="variant-preview" aria-hidden="true" inert>
       <div className="library-preview-scale" style={{width:pw,height:ph,transform:'scale('+vScale+')'}}>
        <Symbol w={previewWidget} value={w.type==='tank'?62:w.type==='data-card'?4.2:true} quality="good" samples={{}}/>
       </div>
      </div>
      <span>{v.label}</span>
     </div>;})}
   </div></>}

  {spec.shape&&<><div className="property-section">Şekil</div>
   {(w.type==='polygon'||w.type==='star')&&<Field label={(w.type==='star'?'Uç sayısı · ':'Kenar sayısı · ')+w.sides}><input type="range" min={w.type==='star'?4:3} max="12" value={w.sides} onChange={e=>onChange({sides:Number(e.target.value)})}/></Field>}
   {(w.type==='rectangle'||w.type==='section')&&<Field label={'Köşe yuvarlama · '+w.radius+' px'}><input type="range" min="0" max="60" value={Math.min(60,w.radius)} onChange={e=>onChange({radius:Number(e.target.value)})}/></Field>}
   <div className="field-grid">
    <Field label="Dolgu"><input type="color" value={w.fillColor||w.color} onChange={e=>onChange({fillColor:e.target.value})}/></Field>
    <Field label="Kenar"><input type="color" value={w.borderColor||w.color} onChange={e=>onChange({borderColor:e.target.value})}/></Field>
   </div>
   {w.fillColor&&<Field label={'Dolgu opaklığı · '+Math.round(w.fillOpacity*100)+'%'}><input type="range" min="0" max="100" value={Math.round(w.fillOpacity*100)} onChange={e=>onChange({fillOpacity:Number(e.target.value)/100})}/></Field>}
   <button className="property-reset" onClick={()=>onChange({fillColor:'',borderColor:'',fillOpacity:1})}>Dolgu ve kenar için etkin rengi kullan</button>
   <div className="field-grid">
    <Field label={'Kenar kalınlığı · '+(w.strokeWidth||'varsayılan')}><input type="range" min="0" max="12" step="0.5" value={w.strokeWidth} onChange={e=>onChange({strokeWidth:Number(e.target.value)})}/></Field>
    <Field label="Çizgi"><select value={w.strokeStyle} onChange={e=>onChange({strokeStyle:e.target.value as Widget['strokeStyle']})}>
     <option value="solid">Düz</option><option value="dashed">Kesik</option><option value="dotted">Noktalı</option></select></Field>
   </div>
   <Field label="Gölge"><select value={w.shadow} onChange={e=>onChange({shadow:e.target.value as Widget['shadow']})}>
    <option value="none">Yok</option><option value="soft">Hafif</option><option value="strong">Belirgin</option></select></Field></>}

  {spec.stroke&&<><div className="property-section">Çizgi</div>
   <div className="field-grid">
    {w.type==='arrow'&&<Field label={'Kalınlık · '+(w.strokeWidth||'varsayılan')}><input type="range" min="0" max="24" step="1" value={w.strokeWidth} onChange={e=>onChange({strokeWidth:Number(e.target.value)})}/></Field>}
    <Field label="Stil"><select value={w.strokeStyle} onChange={e=>onChange({strokeStyle:e.target.value as Widget['strokeStyle']})}>
     <option value="solid">Düz</option><option value="dashed">Kesik</option><option value="dotted">Noktalı</option></select></Field>
   </div></>}

  {spec.scale&&<><div className="property-section">Ölçek</div>
   <div className="field-grid">
    <Field label="Alt ölçek"><input type="number" value={w.min} onChange={e=>onChange({min:Number(e.target.value)})}/></Field>
    <Field label="Üst ölçek"><input type="number" value={w.max} onChange={e=>onChange({max:Number(e.target.value)})}/></Field>
   </div>
   {spec.unit&&<div className="field-grid">
    <Field label="Birim"><input value={w.unit} onChange={e=>onChange({unit:e.target.value})}/></Field>
    <Field label="Ondalık basamak"><select value={w.decimals} onChange={e=>onChange({decimals:Number(e.target.value)})}>
     <option value={-1}>Otomatik</option>{[0,1,2,3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></Field>
   </div>}</>}

  {spec.band&&<><div className="property-section">İşletme bandı</div>
   <div className="field-grid">
    <Field label="Alt uyarı"><input type="number" placeholder="yok" value={w.warnLow??''} onChange={e=>onChange({warnLow:e.target.value===''?null:Number(e.target.value)})}/></Field>
    <Field label="Üst uyarı"><input type="number" placeholder="yok" value={w.warnHigh??''} onChange={e=>onChange({warnHigh:e.target.value===''?null:Number(e.target.value)})}/></Field>
   </div>
   <div className="field-grid">
    <Field label="Alt alarm limiti"><input type="number" placeholder="yok" value={w.limitLow??''} onChange={e=>onChange({limitLow:e.target.value===''?null:Number(e.target.value)})}/></Field>
    <Field label="Üst alarm limiti"><input type="number" placeholder="yok" value={w.limitHigh??''} onChange={e=>onChange({limitHigh:e.target.value===''?null:Number(e.target.value)})}/></Field>
   </div>
   <button className="property-reset" onClick={()=>onChange({warnLow:null,warnHigh:null,limitLow:null,limitHigh:null})}>İşletme bandını temizle</button>
   <Hint>Değer uyarı sınırını aşınca sarı, alarm limitini aşınca kırmızı. Sınırlar ölçek üzerinde çizgiyle işaretlenir; boş bırakılan sınır çizilmez.{spec.setpoint&&' Setpoint etiketi bağlarsanız hedef değer kesik çizgiyle görünür (Bağlantı sekmesi).'}</Hint></>}

  {spec.frame&&<><div className="property-section">Çerçeve</div>
   <Field label="Çizimin çerçeveye oturması"><select value={w.frameFit} onChange={e=>onChange({frameFit:e.target.value as Widget['frameFit']})}>
    <option value="contain">Oranı koru · çevresinde boşluk kalır</option>
    <option value="trim">Boşluğu kırp · oran korunur</option>
    <option value="fill">Çerçeveyi doldur · gerilir</option>
   </select></Field>
   {!stretches(w)&&(()=>{const bos=Math.round(framePadding(w)*100);
    return <><button className="btn small wide" type="button" onClick={()=>onChange(snapFrameToDrawing(w))}>Çerçeveyi çizime oturt{bos>0?' · %'+bos+' boşluk':''}</button>
     <button className="btn small wide" type="button" onClick={()=>onChange(frameForDrawing(w))}>Çerçeveyi çizimin oranına getir</button></>;})()}
   <Hint>Tutamaklar çerçevede durur, çizimde değil: çerçeve çizimden büyükse konumlandırma ve boyutlandırma gözle yapılır. "Çerçeveyi çizime oturt" boş kenarları kırpar, merkez yerinde kalır. Sembollerin çizimi görüntü kutusunun tamamını doldurmaz; "oranı koru"da çevresinde boşluk kalır ve iki cisim bitişmez. "Boşluğu kırp" çerçeveyi çizime yapıştırır, oran bozulmaz. "Çerçeveyi doldur" çizimi kutuya gerer — dikey borulara, uzun tanklara uygundur, dairesel sembollerde oval görünür.</Hint></>}

  {spec.line&&<><div className="property-section">Hat</div>
   <Field label={'Kalınlık · '+w.lineWidth}><input type="range" min="4" max="32" value={w.lineWidth} onChange={e=>onChange({lineWidth:Number(e.target.value)})}/></Field></>}

  {w.type==='data-card'&&<><div className="property-section">Kart yüzeyi</div>
   <div className="field-grid">
    <Field label="Zemin"><input type="color" value={w.fillColor||'#ffffff'} onChange={e=>onChange({fillColor:e.target.value})}/></Field>
    <Field label="Çerçeve"><input type="color" value={w.borderColor||'#dfe6eb'} onChange={e=>onChange({borderColor:e.target.value})}/></Field>
   </div>
   <div className="field-grid">
    <Field label="Metin"><input type="color" value={w.textColor||'#293f50'} onChange={e=>onChange({textColor:e.target.value})}/></Field>
    <Field label="İkon"><input type="color" value={w.iconColor||w.color} onChange={e=>onChange({iconColor:e.target.value})}/></Field>
   </div>
   <button className="property-reset" onClick={()=>onChange({fillColor:'',borderColor:'',textColor:'',iconColor:''})}>Kart renkleri için temayı kullan</button>
   <Hint>Arıza ve okunamayan veri, seçtiğiniz renkten bağımsız olarak sol durum çizgisi ve durum metniyle görünür kalır.</Hint></>}

  <div className="property-section">Renk</div>
  <div className="field-grid">
   <Field label="Etkin renk"><input type="color" value={w.color} onChange={e=>onChange({color:e.target.value})}/></Field>
   <Field label="Boşta renk"><input type="color" value={w.offColor||'#9aa8b3'} onChange={e=>onChange({offColor:e.target.value})}/></Field>
  </div>
  <button className="property-reset" onClick={()=>onChange({offColor:''})}>Boşta renk için temayı kullan</button>
  <Field label={'Opaklık · '+Math.round(w.opacity*100)+'%'}><input type="range" min="10" max="100" value={w.opacity*100} onChange={e=>onChange({opacity:Number(e.target.value)/100})}/></Field>

  {spec.text&&<><div className="property-section">Yazı</div>
   <label className="check"><input type="checkbox" checked={w.labelVisible} onChange={e=>onChange({labelVisible:e.target.checked})}/>Sembol başlığını göster</label>
   {w.labelVisible&&<>
    <div className="field-grid">
     <Field label="Boyut"><select value={w.fontSize} onChange={e=>onChange({fontSize:Number(e.target.value)})}>
      <option value={0}>Sembole göre</option>{[10,12,14,16,18,20,24,28,32,40,48,64,72].map(n=><option key={n} value={n}>{n} px</option>)}</select></Field>
     <Field label="Kalınlık"><select value={w.fontWeight} onChange={e=>onChange({fontWeight:e.target.value as Widget['fontWeight']})}>
      <option value="400">Normal</option><option value="500">Orta</option><option value="600">Yarı kalın</option><option value="700">Kalın</option><option value="800">Çok kalın</option></select></Field>
    </div>
    <Field label="Hiza"><select value={w.textAlign} onChange={e=>onChange({textAlign:e.target.value as Widget['textAlign']})}>
     <option value="left">Sola</option><option value="center">Ortaya</option><option value="right">Sağa</option></select></Field>
    <button className="btn small wide" type="button" onClick={()=>onChange({width:Math.max(80,Math.min(240,Math.max(100,w.width))),height:w.label.trim()?110:86})}>İçeriğe sığdır</button>
   </>}</>}

  {spec.motion&&<><div className="property-section">Hareket</div>
   <label className="check"><input type="checkbox" checked={w.animated} onChange={e=>onChange({animated:e.target.checked})}/>Çalışırken hareketli</label>
   {w.animated&&<>
    <Field label="Hız"><select value={w.animationSpeed} onChange={e=>onChange({animationSpeed:Number(e.target.value)})}>
     {[.25,.5,1,1.5,2,3,4].map(n=><option value={n} key={n}>{n}×{n===1?' · Normal':''}</option>)}</select></Field>
    <label className="check"><input type="checkbox" checked={w.reverse} onChange={e=>onChange({reverse:e.target.checked})}/>Yönü ters çevir</label>
   </>}</>}
 </div>;
}
