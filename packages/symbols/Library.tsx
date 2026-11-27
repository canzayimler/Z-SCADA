import {useState} from 'react';
import {Search,ChevronRight,Star,Blocks,Plus,History,LayoutGrid,List,X,Shapes} from 'lucide-react';
import {newWidget,symbolTypes,type Widget} from '../contracts/model';
import {labelsOf,symbolGroupsOf,sizes,groupTitle,meta,variantsOf} from './catalog';
import {matchesSymbol} from './search';
import {Symbol} from './Symbol';
import {indicatorGlyphs} from './render/glyphs';
import {equipmentTemplates} from '../screen-model/editor';
import {portMap} from './catalog';

export function Library({onAdd,onEquipment,language='tr',initialOpen,hideGroupsTab=false,symbolStyle='classic'}:{onAdd:(t:Widget['type'])=>void;onEquipment:(id:string)=>void;language?:'tr'|'en';initialOpen?:string[];hideGroupsTab?:boolean;symbolStyle?:'classic'|'isa101'|'detailed'}){
 const labels=labelsOf(language),symbolGroups=symbolGroupsOf(language);
 const [search,setSearch]=useState(''),[tab,setTab]=useState<'symbols'|'favorites'|'recent'|'groups'>('symbols');
 const [favorites,setFavorites]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('scada-favorite-symbols')||'[]').filter((x:string)=>(symbolTypes as readonly string[]).includes(x));}catch{return [];}});
 const [open,setOpen]=useState<string[]>(()=>initialOpen||[]);
 const [hovered,setHovered]=useState<Widget['type']|null>(null);
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
 function previewSymbol(t:Widget['type'],bw:number,bh:number){
  const demo=newWidget(t);demo.label=['button','push-button','toggle-switch','key-switch'].includes(t)?'Aç':'';demo.parts=demo.parts.map((p,i)=>({...p,tagId:'demo'+i}));const samples=Object.fromEntries(demo.parts.map((p,i)=>[p.tagId,{value:i===demo.parts.length-1,quality:'good'}]));
  const Glyph=indicatorGlyphs[t];
  const [pw,ph]=sizes[t]||[120,100];
  const scale=Math.min(bw/pw,bh/ph);
  return Glyph?<Glyph/>:<div className="library-preview-scale" style={{width:pw,height:ph,transform:'scale('+scale+')'}}><Symbol w={demo} quality="good" samples={samples} value={['tank','silo','vessel','gauge','level-bar','led-bar','thermometer','weighing'].includes(t)?62:true}/></div>;
 }
 function tile(t:Widget['type']){
  const [bw,bh]=view==='list'?[38,26]:[88,62];
  const preview=previewSymbol(t,bw,bh);
  /* Önizleme gerçek sembolü çizer; tuş takımı, düğme, kaydırıcı gibi semboller kendi <button>/<input>'larını
   * taşır. Kart eskiden <button>'dı: düğme içinde düğme geçersiz HTML (tuş takımında 14 iç içe button).
   * Kart artık role=button bir div; önizleme inert (odak almaz, tıklanmaz, erişilebilirlik ağacında yok). */
  return <div className={'library-tile'+(view==='list'?' row':'')} key={t} onMouseEnter={()=>setHovered(t)} onMouseLeave={()=>setHovered(h=>h===t?null:h)}><div className="library-pick" role="button" tabIndex={0} aria-label={labels[t]+' ekle'} draggable onDragStart={e=>{remember(t);e.dataTransfer.setData('scada-symbol',t);}} onFocus={()=>setHovered(t)} onBlur={()=>setHovered(h=>h===t?null:h)} onClick={()=>place(t)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();place(t);}}} title={labels[t]+' ekle'}><div className="library-preview" aria-hidden="true" inert>{preview}</div><span>{labels[t]}</span></div><button className={'library-star '+(favorites.includes(t)?'saved':'')} aria-label={labels[t]+(favorites.includes(t)?' favorilerden çıkar':' favorilere ekle')} onClick={()=>favorite(t)}><Star size={12}/></button></div>;}
 const matches=(t:Widget['type'])=>matchesSymbol(t,search);
 const hoveredMeta=hovered?meta(hovered):undefined;
 const hoveredVariants=hovered?variantsOf(hovered):[];
 const hoveredPorts=hovered?(portMap[hovered]?.length||0):0;
 const libraryTabs=([['symbols','Semboller','Semboller',Shapes],['favorites','Favoriler','Favoriler',Star],['recent','Son','Son kullanılanlar',History],['groups','Gruplar','Ekipman grupları',Blocks]] as const).filter(([k])=>!(hideGroupsTab&&k==='groups'));
 const onLibraryTabKey=(e:React.KeyboardEvent<HTMLDivElement>)=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();
  const idx=Math.max(0,libraryTabs.findIndex(([k])=>k===tab));
  const nextIdx=e.key==='Home'?0:e.key==='End'?libraryTabs.length-1:(idx+(e.key==='ArrowRight'?1:-1)+libraryTabs.length)%libraryTabs.length;
  setTab(libraryTabs[nextIdx][0]);
  e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[nextIdx]?.focus();
 };
 return <><div className="library-heading"><span>Nesne kütüphanesi</span><small>{symbolTypes.length} sembol</small><span className="library-view" role="group" aria-label="Görünüm"><button type="button" aria-pressed={view==='list'} title="Liste görünümü" aria-label="Liste görünümü" onClick={()=>changeView('list')}><List size={14}/></button><button type="button" aria-pressed={view==='grid'} title="Kart görünümü" aria-label="Kart görünümü" onClick={()=>changeView('grid')}><LayoutGrid size={14}/></button></span></div><label className="search compact"><Search size={15}/><input aria-label="Sembol ara" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Sembol veya ekipman ara"/>{search&&<button type="button" className="search-clear" aria-label="Aramayı temizle" onClick={()=>setSearch('')}><X size={13}/></button>}</label><div className="library-bar"><div className="library-tabs" role="tablist" aria-label="Kütüphane bölümü" onKeyDown={onLibraryTabKey}>{libraryTabs.map(([k,short,name,Icon])=><button type="button" key={k} role="tab" tabIndex={tab===k?0:-1} aria-selected={tab===k} aria-label={name} title={name} onClick={()=>setTab(k)}><Icon size={14}/><span className="tab-label" aria-hidden="true">{short}</span></button>)}</div></div>
 <div className={'palette-scroll library-scroll'+(symbolStyle==='detailed'?' sym-detailed':'')} onMouseLeave={()=>setHovered(null)}>{tab==='groups'?<><p className="library-note">Birlikte yerleştirin, ardından etiketleri bağlayın.</p>{equipmentTemplates.filter(t=>(t.name+t.description).toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))).map(t=><button key={t.id} className="equipment-template" draggable onDragStart={e=>e.dataTransfer.setData('scada-equipment',t.id)} onClick={()=>onEquipment(t.id)}><div><Symbol w={{...newWidget(t.symbol),label:''}} quality="good" value={false}/></div><span><strong>{t.name}</strong><small>{t.description}</small></span><Plus size={15}/></button>)}</>:tab==='recent'?<><p className="library-note">Son eklediğiniz semboller; bu tarayıcıda saklanır.</p><div className={view==='list'?'library-list':'library-grid'}>{recent.filter(t=>matches(t as Widget['type'])).map(t=>tile(t as Widget['type']))}</div>{!recent.length&&<p className="library-empty">Henüz sembol eklemediniz.</p>}</>:tab==='favorites'?<><p className="library-note">Favoriler bu tarayıcıda saklanır.</p><div className={view==='list'?'library-list':'library-grid'}>{favorites.filter(t=>matches(t as Widget['type'])).map(t=>tile(t as Widget['type']))}</div>{!favorites.length&&<p className="library-empty">Sembolün yıldızına tıklayarak hızlı erişime ekleyin.</p>}</>:symbolGroups.map(g=>{const list=g.types.filter(matches);if(!list.length)return null;const expanded=!!search||open.includes(g.key);return <section key={g.key} className="palette-section"><button className={'palette-group '+(expanded?'open':'')} aria-expanded={expanded} onClick={()=>setOpen(a=>a.includes(g.key)?a.filter(x=>x!==g.key):[...a,g.key])}><ChevronRight size={13}/><span>{groupTitle(g.name,language)}</span><small>{list.length}</small></button>{expanded&&<div className={view==='list'?'library-list':'library-grid'}>{list.map(tile)}</div>}</section>})}{tab==='symbols'&&search&&!symbolGroups.some(g=>g.types.some(matches))&&<div className="library-empty-search"><Search size={18}/><strong>“{search}” için sonuç yok</strong><span>Türkçe veya İngilizce ad, grup ya da ekipman adıyla arayın.</span><button className="btn small" onClick={()=>setSearch('')}>Aramayı temizle</button></div>}</div>
 {hovered&&tab!=='groups'&&<div className={'library-hover-preview'+(symbolStyle==='detailed'?' sym-detailed':'')} aria-hidden="true">
  <div className="library-hover-stage">{previewSymbol(hovered,146,100)}</div>
  <div className="library-hover-meta">
   <strong>{labels[hovered]}</strong>
   <small>{hoveredMeta?groupTitle(hoveredMeta.group,language):''}{hoveredVariants.length>0?` · ${hoveredVariants.length} varyant`:''}{hoveredPorts>0?` · ${hoveredPorts} port`:''}</small>
  </div>
 </div>}</>;
}
