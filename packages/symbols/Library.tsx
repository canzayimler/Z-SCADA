import {useState} from 'react';
import {Search,ChevronRight,Star,Blocks,Plus,History,LayoutGrid,List,X,Shapes} from 'lucide-react';
import {newWidget,symbolTypes,type Widget} from '../contracts/model';
import {labelsOf,symbolGroupsOf,sizes,groupTitle} from './catalog';
import {matchesSymbol} from './search';
import {Symbol} from './Symbol';
import {indicatorGlyphs} from './render/glyphs';
import {equipmentTemplates} from '../screen-model/editor';

export function Library({onAdd,onEquipment,language='tr',initialOpen}:{onAdd:(t:Widget['type'])=>void;onEquipment:(id:string)=>void;language?:'tr'|'en';initialOpen?:string[]}){
 const labels=labelsOf(language),symbolGroups=symbolGroupsOf(language);
 const [search,setSearch]=useState(''),[tab,setTab]=useState<'symbols'|'favorites'|'recent'|'groups'>('symbols');
 const [favorites,setFavorites]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('scada-favorite-symbols')||'[]').filter((x:string)=>(symbolTypes as readonly string[]).includes(x));}catch{return [];}});
 const [open,setOpen]=useState<string[]>(()=>initialOpen||[]);
 /* Kompakt liste varsayilandir: 99 sembolde isim, buyuk onizlemeden hizli okunur. */
 const [view,setView]=useState<'list'|'grid'>(()=>{try{return localStorage.getItem('scada-library-view')==='grid'?'grid':'list';}catch{return 'list';}});
 function changeView(v:'list'|'grid'){setView(v);try{localStorage.setItem('scada-library-view',v);}catch{}}
 /* K10: son kullanilanlar. Favoriler gibi bu tarayicida saklanir — hangi
  * sembolu az once koydugunu hatirlamak, yuz sembullu bir kutuphanede
  * arama kutusuna geri donmekten hizlidir. */
 const [recent,setRecent]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('scada-recent-symbols')||'[]').filter((x:string)=>(symbolTypes as readonly string[]).includes(x));}catch{return [];}});
 function remember(t:string){setRecent(a=>{const next=[t,...a.filter(x=>x!==t)].slice(0,12);try{localStorage.setItem('scada-recent-symbols',JSON.stringify(next));}catch{}return next;});}
 const place=(t:Widget['type'])=>{remember(t);onAdd(t);};
 function favorite(t:string){setFavorites(a=>{const next=a.includes(t)?a.filter(x=>x!==t):[...a,t];localStorage.setItem('scada-favorite-symbols',JSON.stringify(next));return next;});}
 function tile(t:Widget['type']){const demo=newWidget(t);demo.label=['button','push-button','toggle-switch','key-switch'].includes(t)?'Aç':'';demo.parts=demo.parts.map((p,i)=>({...p,tagId:'demo'+i}));const samples=Object.fromEntries(demo.parts.map((p,i)=>[p.tagId,{value:i===demo.parts.length-1,quality:'good'}]));
  /* GÖSTERGE grubu (trend/pid/alarm-band/alarm-list/data-table): gercek
   * render buyuk ve legend/tablo tasir, 74x52 karta oturtulsa bile okunmaz.
   * Onlar yerine amaca cizilmis sade bir glif gosterilir (render/glyphs.tsx). */
  const Glyph=indicatorGlyphs[t];
  /* Diger her tur: kartin gercek boyutu (catalog.size, yoksa varsayilan
   * 120x100) 74x52'ye SIGACAK sekilde oranli kucultulur; wrapper gercek
   * olcude kalir, sadece gorsel olarak scale() ile kuculur — bu yuzden
   * bugunku ve gelecekteki HER html donen sembol de tasmaz. */
  const [pw,ph]=sizes[t]||[120,100];
  const [bw,bh]=view==='list'?[34,24]:[74,52];
  const scale=Math.min(bw/pw,bh/ph);
  const preview=Glyph?<Glyph/>:<div className="library-preview-scale" style={{width:pw,height:ph,transform:'scale('+scale+')'}}><Symbol w={demo} quality="good" samples={samples} value={['tank','silo','vessel','gauge','level-bar','led-bar','thermometer','weighing'].includes(t)?62:true}/></div>;
  /* Önizleme gerçek sembolü çizer; tuş takımı, düğme, kaydırıcı gibi semboller kendi <button>/<input>'larını
   * taşır. Kart eskiden <button>'dı: düğme içinde düğme geçersiz HTML (tuş takımında 14 iç içe button).
   * Kart artık role=button bir div; önizleme inert (odak almaz, tıklanmaz, erişilebilirlik ağacında yok). */
  return <div className={'library-tile'+(view==='list'?' row':'')} key={t}><div className="library-pick" role="button" tabIndex={0} aria-label={labels[t]+' ekle'} draggable onDragStart={e=>{remember(t);e.dataTransfer.setData('scada-symbol',t);}} onClick={()=>place(t)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();place(t);}}} title={labels[t]+' ekle'}><div className="library-preview" aria-hidden="true" inert>{preview}</div><span>{labels[t]}</span></div><button className={'library-star '+(favorites.includes(t)?'saved':'')} aria-label={labels[t]+(favorites.includes(t)?' favorilerden çıkar':' favorilere ekle')} onClick={()=>favorite(t)}><Star size={12}/></button></div>;}
 const matches=(t:Widget['type'])=>matchesSymbol(t,search);
 return <><div className="library-heading"><span>Nesne kütüphanesi</span><small>{symbolTypes.length} sembol</small><span className="library-view" role="group" aria-label="Görünüm"><button aria-pressed={view==='list'} title="Liste görünümü" aria-label="Liste görünümü" onClick={()=>changeView('list')}><List size={14}/></button><button aria-pressed={view==='grid'} title="Kart görünümü" aria-label="Kart görünümü" onClick={()=>changeView('grid')}><LayoutGrid size={14}/></button></span></div><label className="search compact"><Search size={15}/><input aria-label="Sembol ara" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Sembol veya ekipman ara"/>{search&&<button className="search-clear" aria-label="Aramayı temizle" onClick={()=>setSearch('')}><X size={13}/></button>}</label><div className="library-bar"><div className="library-tabs" role="tablist" aria-label="Kütüphane bölümü">{([['symbols','Semboller','Semboller',Shapes],['favorites','Favoriler','Favoriler',Star],['recent','Son','Son kullanılanlar',History],['groups','Gruplar','Ekipman grupları',Blocks]] as const).map(([k,short,name,Icon])=><button key={k} role="tab" aria-selected={tab===k} aria-label={name} title={name} onClick={()=>setTab(k)}><Icon size={14}/><span className="tab-label" aria-hidden="true">{short}</span></button>)}</div></div>
 <div className="palette-scroll library-scroll">{tab==='groups'?<><p className="library-note">Birlikte yerleştirin, ardından etiketleri bağlayın.</p>{equipmentTemplates.filter(t=>(t.name+t.description).toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))).map(t=><button key={t.id} className="equipment-template" draggable onDragStart={e=>e.dataTransfer.setData('scada-equipment',t.id)} onClick={()=>onEquipment(t.id)}><div><Symbol w={{...newWidget(t.symbol),label:''}} quality="good" value={false}/></div><span><strong>{t.name}</strong><small>{t.description}</small></span><Plus size={15}/></button>)}</>:tab==='recent'?<><p className="library-note">Son eklediğiniz semboller; bu tarayıcıda saklanır.</p><div className={view==='list'?'library-list':'library-grid'}>{recent.filter(t=>matches(t as Widget['type'])).map(t=>tile(t as Widget['type']))}</div>{!recent.length&&<p className="library-empty">Henüz sembol eklemediniz.</p>}</>:tab==='favorites'?<><p className="library-note">Favoriler bu tarayıcıda saklanır.</p><div className={view==='list'?'library-list':'library-grid'}>{favorites.filter(t=>matches(t as Widget['type'])).map(t=>tile(t as Widget['type']))}</div>{!favorites.length&&<p className="library-empty">Sembolün yıldızına tıklayarak hızlı erişime ekleyin.</p>}</>:symbolGroups.map(g=>{const list=g.types.filter(matches);if(!list.length)return null;const expanded=!!search||open.includes(g.key);return <section key={g.key} className="palette-section"><button className={'palette-group '+(expanded?'open':'')} aria-expanded={expanded} onClick={()=>setOpen(a=>a.includes(g.key)?a.filter(x=>x!==g.key):[...a,g.key])}><ChevronRight size={13}/><span>{groupTitle(g.name,language)}</span><small>{list.length}</small></button>{expanded&&<div className={view==='list'?'library-list':'library-grid'}>{list.map(tile)}</div>}</section>})}{tab==='symbols'&&search&&!symbolGroups.some(g=>g.types.some(matches))&&<div className="library-empty-search"><Search size={18}/><strong>“{search}” için sonuç yok</strong><span>Türkçe veya İngilizce ad, grup ya da ekipman adıyla arayın.</span><button className="btn small" onClick={()=>setSearch('')}>Aramayı temizle</button></div>}</div></>;
}
