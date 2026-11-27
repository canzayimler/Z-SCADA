import {historyAppender,screenChanged,undoStep,redoStep} from './screenHistory';
import {NumericEntry} from './NumericEntry';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Plus,Undo2,Redo2,Save,Upload,Copy,Trash2,Lock,Unlock,Layers,AlignLeft,AlignCenter,AlignRight,AlignVerticalJustifyStart,AlignVerticalJustifyCenter,AlignVerticalJustifyEnd,Grid2X2,Download,ZoomIn,ZoomOut,Group,Ungroup,ArrowUp,ArrowDown,Maximize,MousePointer2,Search,ClipboardPaste,ChevronDown,X,PanelLeftOpen,Minimize2,Monitor,RotateCw,RotateCcw,FlipHorizontal2,FlipVertical2,Scissors,BringToFront,SendToBack,CheckSquare,Ruler,Blocks,Unlink2,Eye,EyeOff,Folder,FolderOpen,GripVertical,Crop,PenTool} from 'lucide-react';
import {writeRangeOf,suggestMainTag,applySuggestions,type Config,type Screen,type ScreenRecord,type Widget,type Live,type User,type EquipmentType,type EquipmentInstance,type Sample,newWidget,labels,symbolTypes,symbolGroups,supportsParts,allowsStateRules,bindingDefs,dynamicBindings,isDynamicRole,writesCommand,suggestBindings,equipmentDrift,upgradeEquipmentInstance,reviseEquipmentType,type Binding,isButton,isCommandWidget,hydrateScreen,finalStatuses,statusText,unmetPermissives,permissiveText,conditionTags,evaluateCondition,explainCondition,conditionTests,conditionTestLabels,commandRiskLabels,approvalLabels,instantiateEquipment,applyEquipmentBindings,unboundEquipmentInputs,screenDelta,type Condition,type Part,type Detail,lintScreen,lintSummary,defaultStyleGuide,type LintFinding,linksOf,addLink,removeLink,pruneLinks,moveWithLinks} from '../../../packages/contracts/model';
import {Symbol} from '../../../packages/symbols/Symbol';
import {Library} from '../../../packages/symbols/Library';
import {SymbolDefs} from '../../../packages/symbols/defs';
import {arrangeWidgets,commonValue,createEquipment,equipmentTemplates,matchSize,moveSelectionTo,patchSelection,widgetBindingStatus,withLinkedNeighbors,type ArrangeKind} from '../../../packages/screen-model/editor';
import {buildScreenTemplate,screenTemplates,type ScreenTemplateId,type ScreenTemplateMeta} from '../../../packages/screen-model/screenTemplates';
import {BACKDROP_VARIANTS,renderBackdropSvg} from '../../../packages/symbols/render/backdrops';
import {commitPipePath,findNearestPort,routeOrthogonalLeg,type Point,type PortHit} from '../../../packages/screen-model/pipePen';
import {fitToPort,hasPorts,portSnap,portWeight,portsOf,type Snap} from '../../../packages/screen-model/ports';
import {snapFrameToDrawing,stretches} from '../../../packages/symbols/frame';
import {ObjectAppearance} from './ObjectAppearance';
import {Field,Hint} from './StudioFields';
export {Field,Hint};
import {SearchSelect} from './SearchSelect';
import type {PickOption} from './pick';
import {exportScreenSvg} from './exportSvg';
import {readBindings,phaseOf,phaseLabels,phaseTone,dynamicsOf} from '../../../packages/symbols/states';
import {bindingDef,panelSpec,groupTitle} from '../../../packages/symbols/catalog';
import {styledWidget,surfaceTheme} from '../../../packages/symbols/isa';
import {useModal} from './useModal';
import {api,download,uploadImage} from './api';
import './lint.css';
import './links.css';
const COMPACT_QUERY='(max-width:1280px)';
/* G48: etiket ve komut secimi tek yerden uretilir — hepsi ayni gorunur
 * (CIHAZ.KOD, altinda etiket adi) ve hepsi aranabilir. Acilir listede
 * kaydirarak adres aramak on etiketle calisir, binlerce etiketle calismaz. */
export function tagPickOptions(config:Config,filter?:(t:Config['tags'][number])=>boolean):PickOption[]{
 return config.tags.filter(t=>!filter||filter(t)).map(t=>({
  value:t.id,
  label:(config.devices.find(d=>d.id===t.deviceId)?.code||'?')+'.'+t.code,
  hint:t.name&&t.name!==t.code?t.name:undefined,
  // Arama bosken secici etiketleri cihaz basligi altinda toplar (ilk 10 ile sinirli kalmaz).
  group:(()=>{const d=config.devices.find(x=>x.id===t.deviceId);return d?d.code+(d.name&&d.name!==d.code?' · '+d.name:''):'Cihaz yok';})()}));
}
export function commandPickOptions(config:Config,filter?:(c:Config['commands'][number])=>boolean):PickOption[]{
 return config.commands.filter(c=>!filter||filter(c)).map(c=>({
  value:c.id,
  label:c.name,
  hint:((c.kind==='script'?'Script · ':'')+c.tagIds.map(id=>config.tags.find(t=>t.id===id)?.code).filter(Boolean).join(', '))||undefined}));
}
let keepFullscreen=false,navigatedAt=0;
const handleDirections=['nw','n','ne','w','e','sw','s','se'] as const;
const handleLabels:Record<string,string>={nw:'Sol üstten boyutlandır',n:'Üstten boyutlandır',ne:'Sağ üstten boyutlandır',w:'Soldan boyutlandır',e:'Sağdan boyutlandır',sw:'Sol alttan boyutlandır',s:'Alttan boyutlandır',se:'Sağ alttan boyutlandır'};
type Props={record:ScreenRecord;records:ScreenRecord[];config:Config;live:Live;user:User;mode:'runtime'|'editor'|'preview';canEdit?:boolean;onModeChange?:(mode:'runtime'|'editor'|'preview')=>void;onRefresh:()=>Promise<void>;onScreen:(id:string)=>void;onCreateFromTemplate?:(templateId:ScreenTemplateId)=>Promise<void>;notify:(s:string,tone?:'info'|'error')=>void;registerLeave:(fn:()=>Promise<boolean>)=>void;language?:'tr'|'en';theme?:'light'|'dark';equipmentTypes?:EquipmentType[];homeScreenId?:string};
export function Studio({record,records,config,live,user,mode,canEdit=false,onModeChange,onRefresh,onScreen,onCreateFromTemplate,notify,registerLeave,language='tr',theme='light',equipmentTypes:projectEquipmentTypes,homeScreenId=''}:Props){
 // Tembel başlangıç: 600 nesnede derin kopya + hydrate her render'da boşa çalışıyordu.
 const [screen,setScreen]=useState<Screen>(()=>hydrateScreen(structuredClone(mode==='runtime'?(record.published||record.draft):record.draft)));
 const [version,setVersion]=useState(record.version),[selection,setSelection]=useState<string[]>([]),[zoom,setZoom]=useState(1),[grid,setGrid]=useState(true),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[conflict,setConflict]=useState<{version:number;draft:Screen;updatedBy:string;updatedAt:number}|null>(null);
 const [history,setHistory]=useState<Screen[]>([]),[future,setFuture]=useState<Screen[]>([]),[simulation,setSimulation]=useState<Record<string,boolean|number>>({}),[simOn,setSimOn]=useState(false),[simQuality,setSimQuality]=useState<Record<string,'good'|'stale'|'bad'|'unknown'>>({}),[simPanel,setSimPanel]=useState(false),[scenarioName,setScenarioName]=useState(''),[scenarios,setScenarios]=useState(screen.scenarios||[]),[saveText,setSaveText]=useState('Kaydedildi');
 const current=useRef(screen),versionRef=useRef(version),saveBusy=useRef(false),generation=useRef(0),savedGeneration=useRef(0),canvas=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null);
 const dragging=useRef<{startX:number;startY:number;widgets:Widget[];kind:'move'|'resize'|'rotate'|'group';id:string;dir:string;cx:number;cy:number;angle:number;box?:{x:number;y:number;width:number;height:number};before:Screen;index?:Map<string,Widget>}|null>(null);
 const pan=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const [guides,setGuides]=useState<{x:number[];y:number[]}>({x:[],y:[]});
 const [ports,setPorts]=useState(false),[snapped,setSnapped]=useState<{x:number;y:number}|null>(null);
 const lastSnap=useRef<Snap|null>(null),[autoFit,setAutoFit]=useState(true);
 // B36: riskli komutta ozet + gerekce penceresi; iki kisi onayi sunucuda zorlanir.
 const [riskConfirm,setRiskConfirm]=useState<{widget:Widget;value:boolean|number;reason:string;busy:boolean}|null>(null);
 const [full,setFull]=useState(false),[drawer,setDrawer]=useState(false),[overrideId,setOverrideId]=useState('');
 /* Tam ekranda yalniz :fullscreen ogesinin alt agaci cizilir. Pencereler
  * (sayisal deger girisi, bilgi, komut onayi) app-shell'de duruyordu; tam
  * ekranda gorunmuyordu. Hepsi tam ekran ogesine portal ile tasinir. */
 const [fullscreenHost,setFullscreenHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{const sync=()=>setFullscreenHost((document.fullscreenElement as HTMLElement)||null);sync();document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[]);
 const live_record=records.find(r=>r.id===overrideId)||record;
 /* --- Calisma anlik goruntusu (B47) ----------------------------------------
  * Operator ekraninda belge, yayin revizyonu ve config revizyonu TEK PARCA
  * tutulur. Yeni yayin geldiginde ekran sessizce degismez: kullaniciya
  * bildirilir, onay verince anlik goruntu butun olarak degistirilir.
  * Boylece komut, gordugu belgeyle ayni revizyonu tasir.
  */
 const [snapshot,setSnapshot]=useState(()=>({record:live_record,publishedVersion:live_record.publishedVersion,configRevision:config.revision}));
 useEffect(()=>{if(mode!=='runtime')setSnapshot({record:live_record,publishedVersion:live_record.publishedVersion,configRevision:config.revision});},[mode,live_record,config.revision]);
 const view=mode==='runtime'?snapshot.record:live_record;
 const newPublication=mode==='runtime'&&(live_record.publishedVersion!==snapshot.publishedVersion||config.revision!==snapshot.configRevision);
 function adoptSnapshot(){
  const next=live_record;
  setSnapshot({record:next,publishedVersion:next.publishedVersion,configRevision:config.revision});
  setScreen(hydrateScreen(structuredClone(next.published||next.draft)));
  notify('Ekran yeni yayına geçirildi (v'+next.publishedVersion+').');
 }
 const [paletteTab,setPaletteTab]=useState<'library'|'layers'|'templates'>('library'),[layerSearch,setLayerSearch]=useState(''),[templateSearch,setTemplateSearch]=useState('');
 const [pendingTemplate,setPendingTemplate]=useState<ScreenTemplateMeta|null>(null);
 const templateModalRef=useModal<HTMLDivElement>(!!pendingTemplate,useCallback(()=>setPendingTemplate(null),[]));
 // Editorde gecici gizleme ve katman klasoru katlama: yalniz tasarim goruntusunu etkiler, yayina gitmez.
 const [hiddenLayers,setHiddenLayers]=useState<string[]>([]),[collapsedLayers,setCollapsedLayers]=useState<string[]>([]);
 const layerDrag=useRef<string>('');
 const [resOpen,setResOpen]=useState(false);
 const resRef=useRef<HTMLDivElement>(null);
 const resTriggerRef=useRef<HTMLButtonElement>(null);
 const [pipePen,setPipePen]=useState(false);
 const [pipeDraft,setPipeDraft]=useState<{points:Point[];startSnap:PortHit|null;lastAxis?:'h'|'v'}|null>(null);
 const [pipeHover,setPipeHover]=useState<{point:Point;snap:PortHit|null;shift:boolean}|null>(null);
 const [isDragging,setIsDragging]=useState(false);
 const screenIdSet=useMemo(()=>new Set(records.map(r=>r.id)),[records]);
 useEffect(()=>{
  if(!resOpen)return;
  const close=(e:PointerEvent)=>{if(resRef.current&&!resRef.current.contains(e.target as Node))setResOpen(false);};
  const onEsc=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setResOpen(false);resTriggerRef.current?.focus();}};
  document.addEventListener('pointerdown',close);
  document.addEventListener('keydown',onEsc,true);
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',onEsc,true);};
 },[resOpen]);

 const [inspectorTab,setInspectorTab]=useState<'appearance'|'binding'|'layout'>('appearance'),[compact,setCompact]=useState(()=>window.matchMedia(COMPACT_QUERY).matches),[showLibrary,setShowLibrary]=useState(()=>!window.matchMedia(COMPACT_QUERY).matches),[showInspector,setShowInspector]=useState(()=>!window.matchMedia(COMPACT_QUERY).matches),[focus,setFocus]=useState(false);const editorFitted=useRef(false);
 useEffect(()=>{document.documentElement.classList.toggle('studio-focus',focus&&mode==='editor');return()=>document.documentElement.classList.remove('studio-focus');},[focus,mode]);
 const [library,setLibrary]=useState<{src:string;bytes:number}[]|null>(null),[uploading,setUploading]=useState(false),[dropArmed,setDropArmed]=useState('');
 /* Silme onayi satir icinde iki adim (tarayicinin confirm() penceresi temaya/dile uymuyordu,
  * tam ekranda da gorunmuyordu): ilk tik "Emin misiniz?" gosterir, 4 sn icinde ikinci tik siler. */
 useEffect(()=>{if(!dropArmed)return;const t=setTimeout(()=>setDropArmed(''),4000);return()=>clearTimeout(t);},[dropArmed]);
 async function removeImage(src:string){
  if(dropArmed!==src){setDropArmed(src);return;}setDropArmed('');
  try{await api('/uploads/'+src.split('/').pop(),'DELETE');
   setLibrary(l=>l?l.filter(x=>x.src!==src):l);notify('Görsel silindi.');}
  catch(e){notify((e as Error).message,'error');}}
 async function pickImage(id:string,file?:File){if(!file)return;setUploading(true);
  try{const r=await uploadImage(file);update(id,{src:r.src});setLibrary(null);notify('Görsel yüklendi.');}
  catch(e){notify((e as Error).message,'error');}finally{setUploading(false);}}
 const [band,setBand]=useState<{x:number;y:number;w:number;h:number}|null>(null);
 const [menu,setMenu]=useState<{x:number;y:number;widget:Widget|null;at:{x:number;y:number}}|null>(null);
 const banding=useRef<{x:number;y:number}|null>(null),clipboard=useRef<Widget[]>([]);
 const editor=mode==='editor',preview=mode==='preview',selected=screen.widgets.find(w=>w.id===selection[0]);
 const selectedSet=useMemo(()=>new Set(selection),[selection]);
 // Çoklu seçim: özellik paneli yalnız ilk nesneye yazıyordu; artık ortak alanlar tüm seçime uygulanır,
 // nesneye özel alanlar (etiket, bağlar, uç bağlantıları) devre dışı/gizli.
 const multi=selection.length>1;
 const picked=useMemo(()=>multi?screen.widgets.filter(w=>selectedSet.has(w.id)):[],[multi,screen.widgets,selectedSet]);
 const pickedBox=multi&&picked.length?{x:Math.min(...picked.map(w=>w.x)),y:Math.min(...picked.map(w=>w.y))}:null;
 useEffect(()=>{current.current=screen;},[screen]);
 // Ekipman tipleri proje yanıtıyla gelir (prop); Studio eskiden açılışta /api/project'i ikinci kez çekiyordu.
 // Yerel kopya kayıttan sonra hemen güncellenir; proje tazelenince prop'tan eşitlenir.
 const [equipmentTypes,setEquipmentTypes]=useState<EquipmentType[]>(()=>projectEquipmentTypes||[]);
 /* Ekipman tipi silme iki adimlidir: ilk tik onay ister, 4 sn icinde ikinci tik siler.
  * Ekranlara yerlestirilmis ornekler (nesneler) yerinde kalir; yalniz sablonla bagi kopar. */
 const [pendingTypeDelete,setPendingTypeDelete]=useState('');
 useEffect(()=>{if(!pendingTypeDelete)return;const id=setTimeout(()=>setPendingTypeDelete(''),4000);return()=>clearTimeout(id);},[pendingTypeDelete]);
 async function deleteEquipmentType(type:EquipmentType){
  if(pendingTypeDelete!==type.id){setPendingTypeDelete(type.id);return;}
  setPendingTypeDelete('');
  const uses=(current.current.equipment||[]).filter(e=>e.typeId===type.id).length+records.filter(r=>r.id!==current.current.id).reduce((n,r)=>n+(r.draft.equipment||[]).filter(e=>e.typeId===type.id).length,0);
  try{const r=await api<{equipmentTypes:EquipmentType[]}>('/equipment-types','PUT',equipmentTypes.filter(t=>t.id!==type.id));setEquipmentTypes(r.equipmentTypes||[]);void onRefresh();
   notify('"'+type.name+'" ekipman tipi silindi.'+(uses?' Ekranlardaki '+uses+' örnek yerinde kaldı; şablonla bağı koptu.':''));}
  catch(e){notify((e as Error).message,'error');}
 }
 const [typeBuilder,setTypeBuilder]=useState<{name:string;description:string;inputs:{key:string;label:string;kind:'bool'|'number'|'command';source:string}[]}|null>(null);
 // B41: ana ekran kimligi (homeScreenId) prop olarak gelir; ana ekranda gecis nesnesi zorunlu degildir.
 useEffect(()=>{if(projectEquipmentTypes)setEquipmentTypes(projectEquipmentTypes);},[projectEquipmentTypes]);
 /* --- ISA-101 yayin lint'i (B41) ------------------------------------------
  * Yayinlamadan once ekran tesis HMI stil rehberine gore denetlenir.
  * Kritik ihlal varsa gerekceli onay istenir; uyari/bilgi yayini engellemez.
  */
 const [lintModal,setLintModal]=useState<{findings:LintFinding[];reason:string;busy:boolean}|null>(null);
 const lintModalRef=useModal<HTMLDivElement>(!!lintModal,useCallback(()=>setLintModal(null),[]));
 const lintOrder:Record<LintFinding['severity'],number>={critical:0,warning:1,info:2};
 async function doPublish(reason?:string){
  try{await api('/screens/'+record.id+'/publish','POST',reason?{lintOverrideReason:reason}:undefined);notify('Ekran yayınlandı.');await onRefresh();}
  catch(e){notify((e as Error).message,'error');}
 }
 /** Coklu secimden yeniden kullanilabilir ekipman tipi taslagi cikarir; benzersiz etiket/komut basina bir girdi onerir. */
 function openTypeBuilder(){
  const widgets=current.current.widgets.filter(w=>selection.includes(w.id));
  if(widgets.length<1){notify('Önce ekipman tipine dönüştürülecek nesneleri seçin.');return;}
  const used=new Set<string>();
  const keyFor=(base:string)=>{let k=(base||'girdi').replace(/[^a-zA-Z0-9]/g,'');if(!/^[a-zA-Z]/.test(k))k='g'+k;k=(k[0]||'g').toLowerCase()+k.slice(1);k=k.slice(0,31)||'girdi';let n=k,i=1;while(used.has(n))n=k.slice(0,28)+(i++);used.add(n);return n;};
  /* K03: sablon girdisi yalniz ana etiket/komut degildir. Kademe, saha bagi,
   * bilgi satiri ve gorunurluk etiketleri de parametrelenir; yoksa yirmi
   * benzer ekipmanda bu baglar tek tek elle duzeltilmek zorunda kalir. */
  const tagIds=Array.from(new Set(widgets.flatMap(w=>[w.tagId,w.visibleTagId,...w.parts.map(p=>p.tagId),...(w.bindings||[]).map(b=>b.tagId),...w.details.filter(d=>d.kind==='value').map(d=>d.tagId)]).filter(Boolean)));
  const commandIds=Array.from(new Set(widgets.flatMap(w=>[w.commandId,...w.details.filter(d=>d.kind==='command').map(d=>d.commandId)]).filter(Boolean)));
  const inputs=[
   ...tagIds.map(id=>{const t=config.tags.find(x=>x.id===id);return {key:keyFor(t?.code||'etiket'),label:t?.name||t?.code||id,kind:(t?.dataType==='bool'?'bool':'number') as 'bool'|'number',source:id};}),
   ...commandIds.map(id=>{const c=config.commands.find(x=>x.id===id);return {key:keyFor(c?.name||'komut'),label:c?.name||id,kind:'command' as const,source:id};})];
  setTypeBuilder({name:'Yeni ekipman tipi',description:'',inputs});
 }
 async function saveEquipmentType(){
  if(!typeBuilder)return;
  const widgets=current.current.widgets.filter(w=>selection.includes(w.id));
  if(!widgets.length){setTypeBuilder(null);return;}
  const tagMap=new Map(typeBuilder.inputs.filter(i=>i.kind!=='command').map(i=>[i.source,i.key]));
  const cmdMap=new Map(typeBuilder.inputs.filter(i=>i.kind==='command').map(i=>[i.source,i.key]));
  const left=Math.min(...widgets.map(w=>w.x)),top=Math.min(...widgets.map(w=>w.y));
  const templateWidgets=widgets.map(w=>{
   const key=(id:string)=>id&&tagMap.has(id)?tagMap.get(id)!:'';
   const cmdKey=(id:string)=>id&&cmdMap.has(id)?cmdMap.get(id)!:'';
   const bindTag=key(w.tagId),bindCommand=cmdKey(w.commandId),bindVisible=key(w.visibleTagId);
   return {...w,x:w.x-left,y:w.y-top,
    tagId:bindTag?'':w.tagId,commandId:bindCommand?'':w.commandId,visibleTagId:bindVisible?'':w.visibleTagId,
    bindTag,bindCommand,bindVisible,
    parts:w.parts.map(p=>{const k=key(p.tagId);return k?{...p,tagId:'',bindTag:k}:p;}),
    bindings:(w.bindings||[]).map(b=>{const k=key(b.tagId);return k?{...b,tagId:'',bindTag:k}:b;}),
    details:w.details.map(d=>{const k=d.kind==='value'?key(d.tagId):'',ck=d.kind==='command'?cmdKey(d.commandId):'';
     return k||ck?{...d,...(k?{tagId:'',bindTag:k}:{}),...(ck?{commandId:'',bindCommand:ck}:{})}:d;}),
    equipmentId:'',equipmentRole:w.id,locked:false};
  });
  const type:EquipmentType={id:crypto.randomUUID(),name:typeBuilder.name.trim()||'Ekipman tipi',version:1,description:typeBuilder.description,
   inputs:typeBuilder.inputs.map(i=>({key:i.key,label:i.label.trim()||i.key,kind:i.kind})),widgets:templateWidgets};
  try{const r=await api<{equipmentTypes:EquipmentType[]}>('/equipment-types','PUT',[...equipmentTypes,type]);setEquipmentTypes(r.equipmentTypes||[]);void onRefresh();notify('Ekipman tipi kaydedildi.');setTypeBuilder(null);}
  catch(e){notify((e as Error).message,'error');}
 }
 /** Kayitli bir ekipman tipinden ekrana yeni instans basar ve equipment listesine ekler. */
 function addEquipmentInstance(typeId:string,x=60,y=80){
  const type=equipmentTypes.find(t=>t.id===typeId);if(!type)return;
  const count=(current.current.equipment||[]).filter(e=>e.typeId===typeId).length+1;
  const instanceId=crypto.randomUUID();
  const widgets=instantiateEquipment(type,instanceId,x,y,()=>crypto.randomUUID());
  change({...current.current,widgets:[...current.current.widgets,...widgets],equipment:[...(current.current.equipment||[]),{id:instanceId,typeId,typeVersion:type.version,name:type.name+' '+count,bindings:{}}]});
  setSelection(widgets.map(w=>w.id));notify('Ekipman eklendi. Özellikler panelinden bağlarını tanımlayın.');
 }
 /** Tek bir girdi bagini gunceller; tum uye nesnelere tek yerden uygulanir. */
 function bindEquipment(instanceId:string,key:string,value:string){
  change(applyEquipmentBindings({...current.current,equipment:(current.current.equipment||[]).map(e=>e.id===instanceId?{...e,bindings:{...e.bindings,[key]:value}}:e)}));
 }
 function renameEquipment(instanceId:string,name:string){change({...current.current,equipment:(current.current.equipment||[]).map(e=>e.id===instanceId?{...e,name}:e)});}
 /** Instansi kaldirir; uye nesneler normal nesne olarak kalir (son eslenen bag korunur). */
 function dissolveEquipment(instanceId:string){
  change({...current.current,
   equipment:(current.current.equipment||[]).filter(e=>e.id!==instanceId),
   widgets:current.current.widgets.map(w=>w.equipmentId===instanceId?{...w,equipmentId:'',equipmentRole:'',bindTag:'',bindCommand:''}:w)});
  notify('Ekipman çözüldü; nesneler normal nesne olarak kaldı.');
 }
 function change(next:Screen,track=true){if(!editor)return;if(track){pushUndo();}current.current=next;setScreen(next);generation.current++;setDirty(true);setSaveText('Kaydedilmedi');}
 function patchPart(w:Widget,i:number,patch:Partial<Part>){update(w.id,{parts:w.parts.map((p,n)=>n===i?{...p,...patch}:p)});}
 function update(id:string,patch:Partial<Widget>,track=true){if(current.current.widgets.find(w=>w.id===id)?.locked&&!(Object.keys(patch).length===1&&'locked' in patch)){notify('Önce Düzen sekmesinden nesnenin kilidini açın.');return;}change({...current.current,widgets:current.current.widgets.map(w=>w.id===id?{...w,...patch}:w)},track);}
 /** Degisiklikten once mevcut hali geri al yiginina alir (bkz. screenHistory.ts). */
 function pushUndo(base:Screen=current.current){setHistory(historyAppender(base));setFuture([]);}
 function undo(){const r=undoStep({history,future},current.current);if(!r)return;setHistory(r.stacks.history);setFuture(r.stacks.future);change(r.screen,false);}
 function redo(){const r=redoStep({history,future},current.current);if(!r)return;setHistory(r.stacks.history);setFuture(r.stacks.future);change(r.screen,false);}
 /* 2026-09-25: kayit surerken yapilan degisikligin zamanlayicisi saveBusy'ye takilip dusuyordu; efekt
  * yeniden tetiklenmedigi icin taslak sayfadan cikana kadar yazilmiyordu. Basarili kayit bitince geride
  * kalan varsa tekrar; hata/cakismada tekrar yok (hata yagmuru olmasin, sonraki degisiklik zaten tetikler). */
 async function save(force=false){if(saveBusy.current||(conflict&&!force))return false;saveBusy.current=true;setSaving(true);const g=generation.current;let saved=false;
  try{const r=await api<ScreenRecord>('/screens/'+record.id,'PUT',{version:versionRef.current,screen:current.current,...(force?{force:true}:{})});versionRef.current=r.version;setVersion(r.version);savedGeneration.current=g;setConflict(null);saved=true;if(g===generation.current){setDirty(false);setSaveText('Kaydedildi');}return true;}
  catch(e){setSaveText('Kaydedilemedi');
   // Cakismada kullanicinin taslagi ekranda kalir; hangi surumun kalacagina kendisi karar verir.
   const data=(e as any).data;
   if((e as any).status===409&&data?.draft){setConflict({version:data.version,draft:data.draft,updatedBy:data.updatedBy||'',updatedAt:data.updatedAt||0});return false;}
   notify((e as Error).message,'error');return false;}
  finally{saveBusy.current=false;setSaving(false);if(saved&&editor&&generation.current!==savedGeneration.current)setTimeout(()=>void save(),400);}
 }
 /** Cakismayi cozer: kendi taslagini yazar, karsi tarafinkini alir ya da kopyasini indirir. */
 async function resolveConflict(kind:'mine'|'theirs'|'download'){
  if(!conflict)return;
  if(kind==='download'){download('ekran-'+record.id+'-kopyam.json',{screen:current.current,version:versionRef.current,savedAt:new Date().toISOString()});return;}
  if(kind==='mine'){const ok=await save(true);if(ok)notify('Sizin taslağınız kaydedildi; diğer sürüm sürüm geçmişine arşivlendi.');return;}
  const theirs=hydrateScreen(structuredClone(conflict.draft));
  pushUndo();
  current.current=theirs;setScreen(theirs);versionRef.current=conflict.version;setVersion(conflict.version);
  generation.current++;savedGeneration.current=generation.current;setDirty(false);setSaveText('Kaydedildi');setSelection([]);setConflict(null);
  notify('Sunucudaki taslak alındı. Kendi sürümünüz "Geri al" ile geri gelir.');
 }
 useEffect(()=>{registerLeave(async()=>{if(!editor)return true;if(conflict){notify('Önce taslak çakışmasını çözün: kendi sürümünüzü kaydedin, sunucudakini alın veya kopyanızı indirin.','error');return false;}while(saveBusy.current)await new Promise(r=>setTimeout(r,50));if(generation.current===savedGeneration.current)return true;return await save();});return()=>registerLeave(async()=>true);});
 useEffect(()=>{if(!editor||!dirty||conflict)return;const timer=setTimeout(()=>void save(),1500);return()=>clearTimeout(timer);},[screen,dirty,editor,conflict]);
 useEffect(()=>{const prevent=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[dirty]);
 /** Coklu secimde akilli atama: her nesneye yalniz kesin (tekil) eslesmeler uygulanir, tek geri-al adimi. */
 function bulkSuggest(){
  let widgets=0,links=0;
  const next=current.current.widgets.map(w=>{if(!selection.includes(w.id)||w.equipmentId)return w;const r=applySuggestions(w,config);if(r.applied){widgets++;links+=r.applied;}return r.widget;});
  if(!links){notify('Seçili nesnelerde kesin eşleşme bulunamadı. Nesne adında ekipman numarası (ör. P-101) ve etiket kodlarında aynı gövde (P101_RUN) olmalı.');return;}
  change({...current.current,widgets:next});
  notify(widgets+' nesnede '+links+' bağ atandı. Eşleşmeyenler olduğu gibi bırakıldı; geri almak için Ctrl+Z.');
 }
 function add(type:Widget['type'],x=Math.min(current.current.width-260,Math.round(((viewport.current?.scrollLeft||0)/zoom+80)/10)*10),y=Math.min(current.current.height-180,Math.round(((viewport.current?.scrollTop||0)/zoom+80)/10)*10)){const taken=(px:number,py:number)=>current.current.widgets.some(o=>o.x===px&&o.y===py);for(let i=0;i<30&&taken(x,y);i++){x+=20;y+=20;}const w=newWidget(type,x,y);change({...current.current,widgets:[...current.current.widgets,w]});setSelection([w.id]);}
 function addEquipment(id:string,x=60,y=80){const widgets=createEquipment(id,x,y);change({...current.current,widgets:[...current.current.widgets,...widgets]});setSelection(widgets.map(w=>w.id));notify('Ekipman grubu eklendi. Bağlantı sekmesinden etiketleri seçin.');}
 function addBackdrop(variant:string,x=60,y=110){const meta=BACKDROP_VARIANTS.find(b=>b.key===variant);const w={...newWidget('backdrop',x,y),variant,label:meta?.label||'Tesis altlığı',labelVisible:false,animated:false};change({...current.current,widgets:[w,...current.current.widgets]});setSelection([w.id]);notify((meta?.label||'Tesis altlığı')+' en alt katmana eklendi.');}
 function applyScreenTemplate(tpl:ScreenTemplateMeta){const built=buildScreenTemplate(tpl.id,current.current.id,current.current.name);change({...built,id:current.current.id,name:current.current.name});setSelection([]);setPendingTemplate(null);notify(tpl.name+' şablonu tuvale uygulandı. Geri almak için Ctrl+Z.');}
 function styleSelection(patch:Partial<Widget>){change({...current.current,widgets:patchSelection(current.current.widgets,selection,patch)});}
 function remove(){change(pruneLinks({...current.current,widgets:current.current.widgets.filter(w=>!selection.includes(w.id)||w.locked)}));setSelection([]);}
 function duplicate(){const groupMap=new Map<string,string>();const copies=current.current.widgets.filter(w=>selection.includes(w.id)).map(w=>{if(w.groupId&&!groupMap.has(w.groupId))groupMap.set(w.groupId,crypto.randomUUID());return {...w,id:crypto.randomUUID(),x:w.x+24,y:w.y+24,locked:false,groupId:groupMap.get(w.groupId)||''};});change({...current.current,widgets:[...current.current.widgets,...copies]});setSelection(copies.map(w=>w.id));}
 /** Katman listesi: nesneler ekipman/grup kutulerine ayrilir, ust katman once gelir (B24). */
 function layerGroups(){
  const q=layerSearch.trim().toLocaleLowerCase('tr');
  const match=(w:Widget)=>{const tag=config.tags.find(t=>t.id===w.tagId),command=config.commands.find(c=>c.id===w.commandId);const text=[w.label,labels[w.type],tag?.code,tag?.name,command?.name].filter(Boolean).join(' ').toLocaleLowerCase('tr');return !q||text.includes(q);};
  const out:{key:string;name:string;items:Widget[]}[]=[];
  for(const w of [...screen.widgets].reverse()){
   if(!match(w))continue;
   const key=w.equipmentId?'e:'+w.equipmentId:w.groupId?'g:'+w.groupId:'';
   const name=w.equipmentId?((screen.equipment||[]).find(e=>e.id===w.equipmentId)?.name||'Ekipman'):w.groupId?'Grup':'';
   const found=out.find(g=>g.key===key);
   if(found)found.items.push(w);else out.push({key,name,items:[w]});
  }
  return out;
 }
 function toggleHidden(ids:string[],hide?:boolean){setHiddenLayers(h=>{const set=new Set(h);const target=hide??!ids.every(id=>set.has(id));for(const id of ids)target?set.add(id):set.delete(id);return [...set];});}
 function lockLayers(ids:string[]){const lock=!current.current.widgets.filter(w=>ids.includes(w.id)).every(w=>w.locked);change({...current.current,widgets:current.current.widgets.map(w=>ids.includes(w.id)?{...w,locked:lock}:w)});}
 /** Katman surukleyip birakma z-sirasini degistirir; listede ust = ekranda ust. */
 function moveLayer(dragId:string,targetId:string){
  if(dragId===targetId)return;
  const ws=[...current.current.widgets],from=ws.findIndex(w=>w.id===dragId),to=ws.findIndex(w=>w.id===targetId);
  if(from<0||to<0)return;
  const [moved]=ws.splice(from,1);ws.splice(to,0,moved);
  change({...current.current,widgets:ws});
 }
 function pickLayer(id:string,e:{ctrlKey:boolean;metaKey:boolean;shiftKey:boolean}){
  if(e.ctrlKey||e.metaKey||e.shiftKey)setSelection(sel=>sel.includes(id)?sel.filter(x=>x!==id):[...sel,id]);
  else setSelection([id]);
 }
 /** Secili nesneleri goruntunun merkezine alir; buyuk ekranda katmandan bulmayi tamamlar. */
 function zoomToSelection(ids=selection){
  const widgets=current.current.widgets.filter(w=>ids.includes(w.id)),host=viewport.current;if(!widgets.length||!host)return;
  const left=Math.min(...widgets.map(w=>w.x)),top=Math.min(...widgets.map(w=>w.y)),right=Math.max(...widgets.map(w=>w.x+w.width)),bottom=Math.max(...widgets.map(w=>w.y+w.height));
  const next=Math.max(.25,Math.min(2,Math.min((host.clientWidth-100)/Math.max(1,right-left),(host.clientHeight-100)/Math.max(1,bottom-top))));
  setZoom(next);requestAnimationFrame(()=>{host.scrollLeft=Math.max(0,(left+right)*next/2-host.clientWidth/2);host.scrollTop=Math.max(0,(top+bottom)*next/2-host.clientHeight/2);});
 }
 /* --- Ariza senaryolari (B27) -------------------------------------------
  * Onizlemede etiket degeri VE veri kalitesi elle kurulur; boylece kopan
  * baglanti, bayat veri ve protokol hatasi tasarim asamasinda denenir.
  * Senaryolar ekran belgesinde saklanir ve proje aktarimina dahil olur.
  */
 useEffect(()=>setScenarios(screen.scenarios||[]),[record.id]);
 async function storeScenarios(next:typeof scenarios){
  const updated={...current.current,scenarios:next};
  try{const saved=await api<ScreenRecord>('/screens/'+record.id,'PUT',{version:versionRef.current,screen:updated});current.current=saved.draft;setScreen(saved.draft);versionRef.current=saved.version;setVersion(saved.version);setScenarios(next);setSaveText('Kaydedildi');}
  catch(e){notify((e as Error).message,'error');}
 }
 /** Bu ekranin dokundugu etiketler: nesne, gorunurluk, kademe, bilgi satiri ve kosul girdileri. */
 function screenTags(){
  const ids=new Set<string>();
  for(const w of screen.widgets){
   if(w.tagId)ids.add(w.tagId);if(w.visibleTagId)ids.add(w.visibleTagId);
   w.parts.forEach(p=>{if(p.tagId)ids.add(p.tagId);});
   w.details.forEach(d=>{if(d.tagId)ids.add(d.tagId);});
   if(w.visibleCondition)conditionTags(w.visibleCondition).forEach(id=>ids.add(id));
  }
  return config.tags.filter(t=>ids.has(t.id));
 }
 function setSimValue(tagId:string,value:boolean|number){setSimulation(s=>({...s,[tagId]:value}));}
 function setSimQualityFor(tagId:string,quality:'good'|'stale'|'bad'|'unknown'){setSimQuality(q=>({...q,[tagId]:quality}));}
 async function saveScenario(){
  const name=scenarioName.trim();if(!name){notify('Senaryoya bir ad verin.','error');return;}
  await storeScenarios([...scenarios.filter(s=>s.name!==name),{name,values:{...simulation},quality:{...simQuality}}]);
  setScenarioName('');notify('"'+name+'" senaryosu kaydedildi.');
 }
 function applyScenario(name:string){
  const sc=scenarios.find(s=>s.name===name);if(!sc)return;
  setSimulation({...sc.values});setSimQuality({...(sc.quality||{})} as any);setSimOn(true);notify('"'+name+'" senaryosu uygulandı.');
 }
 function faultAll(quality:'good'|'stale'|'bad'|'unknown'){setSimQuality(Object.fromEntries(screenTags().map(t=>[t.id,quality])) as any);}
 function group(ungroup=false){const id=ungroup?'':crypto.randomUUID();change({...current.current,widgets:current.current.widgets.map(w=>selection.includes(w.id)&&!w.locked?{...w,groupId:id}:w)});}
 function arrange(kind:ArrangeKind){
  const cur=current.current,next=arrangeWidgets(cur.widgets,selection,kind,cur);if(next!==cur.widgets)change({...cur,widgets:next});
 }

 function layer(up:boolean){if(!selected||selected.locked)return;const ws=[...current.current.widgets],i=ws.findIndex(w=>w.id===selected.id),j=Math.max(0,Math.min(ws.length-1,i+(up?1:-1)));[ws[i],ws[j]]=[ws[j],ws[i]];change({...current.current,widgets:ws});}
 function canvasPoint(e:{clientX:number;clientY:number}){const rect=canvas.current!.getBoundingClientRect();const scale=rect.width/current.current.width;
  return {x:(e.clientX-rect.left)/scale,y:(e.clientY-rect.top)/scale};}
 function pivot(w:Widget,e:React.PointerEvent){const cx=w.x+w.width/2,cy=w.y+w.height/2,p=canvasPoint(e);
  return {cx,cy,angle:Math.atan2(p.y-cy,p.x-cx)*180/Math.PI+90};}
 function normalize(deg:number){return Math.round(((deg%360)+360)%360);}
 function rotateSelection(delta:number){if(!selection.length)return;
  change({...current.current,widgets:current.current.widgets.map(w=>selection.includes(w.id)&&!w.locked?{...w,rotation:normalize(w.rotation+delta)}:w)});}
 function setRotation(deg:number){if(!selection.length)return;
  change({...current.current,widgets:current.current.widgets.map(w=>selection.includes(w.id)&&!w.locked?{...w,rotation:normalize(deg)}:w)});}
 function mirror(axis:'x'|'y'){if(!selection.length)return;
  const ws=current.current.widgets.filter(w=>selection.includes(w.id)&&!w.locked);if(!ws.length)return;
  const left=Math.min(...ws.map(w=>w.x)),right=Math.max(...ws.map(w=>w.x+w.width));
  const top=Math.min(...ws.map(w=>w.y)),bottom=Math.max(...ws.map(w=>w.y+w.height));
  change({...current.current,widgets:current.current.widgets.map(w=>{if(!ws.some(x=>x.id===w.id))return w;
   return axis==='x'?{...w,flipX:!w.flipX,rotation:normalize(-w.rotation),x:Math.round(left+right-w.x-w.width)}
    :{...w,flipY:!w.flipY,rotation:normalize(-w.rotation),y:Math.round(top+bottom-w.y-w.height)};})});
 }
 /** Döndürülmüş nesnede fare hareketi nesnenin kendi eksenine çevrilir, merkez kayması geri döndürülür. */
 function rotatedResize(orig:Widget,dir:string,dx:number,dy:number,snap:(v:number)=>number,ratio:boolean,center:boolean){
  const angle=(orig.rotation||0)*Math.PI/180;
  if(!angle)return resizeBox(orig,dir,dx,dy,snap,ratio,center);
  const cos=Math.cos(angle),sin=Math.sin(angle);
  const box=resizeBox(orig,dir,dx*cos+dy*sin,-dx*sin+dy*cos,v=>Math.round(v),ratio,center);
  const cx=orig.x+orig.width/2,cy=orig.y+orig.height/2;
  const mx=box.x+box.width/2-cx,my=box.y+box.height/2-cy;
  return {width:box.width,height:box.height,
   x:Math.round(cx+mx*cos-my*sin-box.width/2),y:Math.round(cy+mx*sin+my*cos-box.height/2)};
 }
 function resizeBox(orig:Widget,dir:string,dx:number,dy:number,snap:(v:number)=>number,ratio:boolean,center:boolean){
  const east=dir.includes('e'),west=dir.includes('w'),north=dir.includes('n'),south=dir.includes('s');
  let left=orig.x,top=orig.y,right=orig.x+orig.width,bottom=orig.y+orig.height;
  if(east)right=snap(right+dx);if(west)left=snap(left+dx);
  if(south)bottom=snap(bottom+dy);if(north)top=snap(top+dy);
  let width=right-left,height=bottom-top;
  if(ratio&&orig.width>0&&orig.height>0){
   const aspect=orig.width/orig.height;
   if((east||west)&&(north||south)){if(Math.abs(width-orig.width)>=Math.abs(height-orig.height))height=width/aspect;else width=height*aspect;}
   else if(east||west)height=width/aspect;else width=height*aspect;
   if(west)left=right-width;else right=left+width;
   if(north)top=bottom-height;else bottom=top+height;
  }
  if(center){
   const cx=orig.x+orig.width/2,cy=orig.y+orig.height/2;
   if(east||west){const half=Math.abs((east?right:left)-cx);left=cx-half;right=cx+half;}
   if(north||south){const half=Math.abs((south?bottom:top)-cy);top=cy-half;bottom=cy+half;}
  }
  if(right-left<30){if(center){const cx=(left+right)/2;left=cx-15;right=cx+15;}else if(west)left=right-30;else right=left+30;}
  if(bottom-top<24){if(center){const cy=(top+bottom)/2;top=cy-12;bottom=cy+12;}else if(north)top=bottom-24;else bottom=top+24;}
  return {x:Math.max(0,Math.round(left)),y:Math.max(0,Math.round(top)),width:Math.round(right-left),height:Math.round(bottom-top)};
 }
 /** Seçimin eksene hizalı çerçevesi; çoklu seçimde topluca ölçeklemek için. */
 function selectionBox(list=current.current.widgets.filter(w=>selection.includes(w.id))){
  if(list.length<2)return null;
  const x=Math.min(...list.map(w=>w.x)),y=Math.min(...list.map(w=>w.y));
  const right=Math.max(...list.map(w=>w.x+w.width)),bottom=Math.max(...list.map(w=>w.y+w.height));
  return {x,y,width:right-x,height:bottom-y};
 }
 function groupDown(e:React.PointerEvent,dir:string){
  if(!editor)return;e.stopPropagation();
  const list=current.current.widgets.filter(w=>selection.includes(w.id)&&!w.locked);
  const box=selectionBox(list);if(!box)return;
  // Geçmişe kayıt burada değil, bırakınca ve yalnız gerçekten değiştiyse (endDrag).
  setIsDragging(true);
  dragging.current={startX:e.clientX,startY:e.clientY,widgets:structuredClone(list),kind:'group',id:'',dir,cx:0,cy:0,angle:0,box,before:current.current};
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
 }
 /** Çoklu seçimi tek parça gibi ölçekler: konumlar, ölçüler, boru kalınlığı ve yazı boyu aynı oranda değişir. */
 function groupResize(d:NonNullable<typeof dragging.current>,dx:number,dy:number,e:React.PointerEvent){
  const box=d.box!,snap=(v:number)=>grid&&!e.altKey?Math.round(v/current.current.gridSize)*current.current.gridSize:Math.round(v);
  const east=d.dir.includes('e'),west=d.dir.includes('w'),north=d.dir.includes('n'),south=d.dir.includes('s');
  const center=e.altKey;
  let fx=1,fy=1,ax=box.x,ay=box.y;
  if(east){const right=snap(box.x+box.width+dx);fx=center?(right-(box.x+box.width/2))/(box.width/2):(right-box.x)/box.width;ax=center?box.x+box.width/2:box.x;}
  else if(west){const left=snap(box.x+dx);fx=center?((box.x+box.width/2)-left)/(box.width/2):(box.x+box.width-left)/box.width;ax=center?box.x+box.width/2:box.x+box.width;}
  if(south){const bottom=snap(box.y+box.height+dy);fy=center?(bottom-(box.y+box.height/2))/(box.height/2):(bottom-box.y)/box.height;ay=center?box.y+box.height/2:box.y;}
  else if(north){const top=snap(box.y+dy);fy=center?((box.y+box.height/2)-top)/(box.height/2):(box.y+box.height-top)/box.height;ay=center?box.y+box.height/2:box.y+box.height;}
  const corner=(east||west)&&(north||south);
  if(corner&&!e.shiftKey){const f=(fx+fy)/2;fx=f;fy=f;}   // köşede varsayılan oranlı; Shift ile serbest
  else if(!east&&!west)fx=1;else if(!north&&!south)fy=1;
  const limit=(f:number,axis:'width'|'height')=>{const smallest=Math.min(...d.widgets.map(w=>w[axis]));
   const min=(axis==='width'?24:20)/Math.max(1,smallest),max=4000/Math.max(...d.widgets.map(w=>w[axis]));
   return Math.max(min,Math.min(max,f));};
  fx=limit(fx,'width');fy=limit(fy,'height');
  const uniform=(fx+fy)/2;
  const index=origIndex(d);
  const ws=current.current.widgets.map(w=>{const orig=index.get(w.id);if(!orig)return w;
   return {...w,
    x:Math.round(ax+(orig.x-ax)*fx),y:Math.round(ay+(orig.y-ay)*fy),
    width:Math.max(20,Math.round(orig.width*fx)),height:Math.max(20,Math.round(orig.height*fy)),
    lineWidth:Math.max(4,Math.min(32,Math.round(orig.lineWidth*uniform*10)/10)),
    fontSize:orig.fontSize?Math.max(1,Math.min(72,Math.round(orig.fontSize*uniform))):orig.fontSize};});
  change({...current.current,widgets:ws},false);
 }
 function pointerDown(e:React.PointerEvent,w:Widget,kind:'move'|'resize'|'rotate'='move',dir=''){
  if(!editor||pipePen)return;e.stopPropagation();const ids=w.groupId?screen.widgets.filter(x=>x.groupId===w.groupId).map(x=>x.id):[w.id];const next=e.shiftKey?Array.from(new Set([...selection,...ids])):selection.includes(w.id)?selection:ids;setSelection(next);if(w.locked)return;
  setIsDragging(true);
  dragging.current={startX:e.clientX,startY:e.clientY,widgets:structuredClone(current.current.widgets.filter(x=>next.includes(x.id)&&!x.locked)),kind,id:w.id,dir,...pivot(w,e),before:current.current};{const picked=new Set(next);setPorts(kind==='move'&&current.current.widgets.some(x=>picked.has(x.id)&&hasPorts(x.type)));}(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
 }
 /** Sürükleme başındaki nesneler id'ye göre; her pointermove'da find ile taramamak için bir kez kurulur. */
 function origIndex(d:NonNullable<typeof dragging.current>){return d.index??=new Map(d.widgets.map(w=>[w.id,w]));}
 function move(e:React.PointerEvent){const d=dragging.current;if(!d)return;const index=origIndex(d);
  const scale=canvas.current!.getBoundingClientRect().width/current.current.width;
  let dx=(e.clientX-d.startX)/scale,dy=(e.clientY-d.startY)/scale;
  if(d.kind==='group'){groupResize(d,dx,dy,e);return;}
  if(d.kind==='rotate'){const p=canvasPoint(e);const delta=Math.atan2(p.y-d.cy,p.x-d.cx)*180/Math.PI+90-d.angle;
   change({...current.current,widgets:current.current.widgets.map(w=>{const orig=index.get(w.id);if(!orig)return w;
    const raw=orig.rotation+delta;return {...w,rotation:normalize(e.shiftKey?Math.round(raw/15)*15:raw)};})},false);
   return;}
  const snap=(v:number)=>grid?Math.round(v/current.current.gridSize)*current.current.gridSize:Math.round(v);
  let lines:{x:number[];y:number[]}={x:[],y:[]};
  if(d.kind==='move'&&!e.altKey){
   const others=current.current.widgets.filter(w=>!index.has(w.id));
   const port=portSnap(d.widgets,others,dx,dy,14/Math.max(scale,.2));
   if(port){setGuides({x:[],y:[]});setSnapped(port.at);lastSnap.current=port;
    const ws=current.current.widgets.map(w=>{const orig=index.get(w.id);return orig?{...w,x:Math.round(orig.x+port.dx),y:Math.round(orig.y+port.dy)}:w;});
    change(withLinkedNeighbors({...current.current,widgets:ws},d.widgets,ws),false);return;}
   setSnapped(null);lastSnap.current=null;
   const left=Math.min(...d.widgets.map(w=>w.x))+dx,top=Math.min(...d.widgets.map(w=>w.y))+dy;
   const right=Math.max(...d.widgets.map(w=>w.x+w.width))+dx,bottom=Math.max(...d.widgets.map(w=>w.y+w.height))+dy;
   const tol=6/Math.max(scale,.2);
   const fit=(mine:number[],theirs:number[])=>{let best=null as null|{shift:number;line:number};
    for(const m of mine)for(const t of theirs){const shift=t-m;if(Math.abs(shift)<=tol&&(!best||Math.abs(shift)<Math.abs(best.shift)))best={shift,line:t};}return best;};
   const hx=fit([left,(left+right)/2,right],others.flatMap(w=>[w.x,w.x+w.width/2,w.x+w.width]).concat([0,current.current.width/2,current.current.width]));
   const hy=fit([top,(top+bottom)/2,bottom],others.flatMap(w=>[w.y,w.y+w.height/2,w.y+w.height]).concat([0,current.current.height/2,current.current.height]));
   if(hx){dx+=hx.shift;lines.x.push(hx.line);}
   if(hy){dy+=hy.shift;lines.y.push(hy.line);}
  }
  const free=lines.x.length>0||lines.y.length>0;
  const place=(v:number)=>free?Math.round(v):snap(v);
  const ws=current.current.widgets.map(w=>{const orig=index.get(w.id);if(!orig)return w;
   return d.kind==='resize'&&w.id===d.id?{...w,...rotatedResize(orig,d.dir||'se',dx,dy,snap,e.shiftKey,e.altKey)}
    :d.kind==='move'?{...w,x:Math.max(0,place(orig.x+dx)),y:Math.max(0,place(orig.y+dy))}:w;});
  setGuides(lines);
  const merged=d.kind==='move'?withLinkedNeighbors({...current.current,widgets:ws},d.widgets,ws):{...current.current,widgets:ws};
  change(merged,false);}
 function endDrag(){const snap=lastSnap.current,d=dragging.current;dragging.current=null;lastSnap.current=null;setIsDragging(false);
  setGuides({x:[],y:[]});setPorts(false);setSnapped(null);
  if(snap){
   // Uc uca yapisma anlik hizalamadan kalici proses baglantisina donusur (B25).
   change(addLink(current.current,{fromWidgetId:snap.movingId,fromPort:snap.movingPort,toWidgetId:snap.targetId,toPort:snap.targetPort}),false);
   if(autoFit)fitSnapped(snap);
  }
  // Tıklama (seçme) geçmişe boş kayıt bırakmaz; yalnız hal değiştiyse sürükleme öncesi hal yazılır.
  if(d&&screenChanged(d.before,current.current))pushUndo(d.before);
 }
 /** Uç uca eklenen nesneyi karşı ağzın kalınlığına göre boyutlandırır ve ucu yerinde tutar. */
 function fitSnapped(snap:Snap){
  const widgets=current.current.widgets;
  const moving=widgets.find(w=>w.id===snap.movingId),target=widgets.find(w=>w.id===snap.targetId);
  if(!moving||!target||moving.locked)return;
  const patch=fitToPort(moving,snap.movingPort,portWeight(target,snap.targetPort));
  if(!patch)return;
  const anchor=portsOf(moving)[snap.movingPort];
  const resized={...moving,...patch};
  const moved=portsOf(resized)[snap.movingPort];
  const next={...resized,x:Math.round(resized.x+anchor.x-moved.x),y:Math.round(resized.y+anchor.y-moved.y)};
  change({...current.current,widgets:widgets.map(w=>w.id===moving.id?next:w)},false);
 }
 function pipePointFromEvent(e:{clientX:number;clientY:number;altKey?:boolean}){
  const raw=canvasPoint(e);
  const tol=16/Math.max(zoom,.2);
  const visibleWidgets=current.current.widgets.filter(w=>!(editor&&hiddenLayers.includes(w.id)));
  const snap=findNearestPort(visibleWidgets,raw,tol);
  if(snap)return {point:{x:Math.round(snap.x),y:Math.round(snap.y)},snap};
  const g=current.current.gridSize||10;
  const pt=grid&&!e.altKey?{x:Math.round(raw.x/g)*g,y:Math.round(raw.y/g)*g}:{x:Math.round(raw.x),y:Math.round(raw.y)};
  return {point:pt,snap:null};
 }
 function finishPipeDraft(pointsToCommit:Point[],startSnap:PortHit|null,endSnap:PortHit|null){
  const res=commitPipePath(current.current,pointsToCommit,{startSnap,endSnap,autoFit});
  if(res.createdIds.length){change(res.screen);setSelection(res.createdIds);}
  setPipeDraft(null);
 }
 function bandDown(e:React.PointerEvent){
  if(!editor)return;
  if(pipePen){
   if(e.button!==0)return;
   e.stopPropagation();
   const {point,snap}=pipePointFromEvent(e);
   if(!pipeDraft){
    setSelection([]);
    setPipeDraft({points:[point],startSnap:snap,lastAxis:snap?.axis});
    setPipeHover({point,snap,shift:e.shiftKey});
    return;
   }
   const last=pipeDraft.points[pipeDraft.points.length-1];
   if(Math.hypot(point.x-last.x,point.y-last.y)<4){
    if(pipeDraft.points.length>=2)finishPipeDraft(pipeDraft.points,pipeDraft.startSnap,null);
    return;
   }
   const leg=routeOrthogonalLeg(last,point,pipeDraft.lastAxis,e.shiftKey);
   const merged=[...pipeDraft.points,...leg.slice(1)];
   const samePort=!!(snap&&pipeDraft.startSnap&&snap.widgetId===pipeDraft.startSnap.widgetId&&snap.portIndex===pipeDraft.startSnap.portIndex);
   if(snap&&!samePort){
    finishPipeDraft(merged,pipeDraft.startSnap,snap);
    return;
   }
   const pPrev=merged[merged.length-2],pEnd=merged[merged.length-1];
   const nextAxis=pPrev&&pEnd?(Math.abs(pEnd.x-pPrev.x)>=Math.abs(pEnd.y-pPrev.y)?'v':'h'):pipeDraft.lastAxis;
   setPipeDraft({...pipeDraft,points:merged,lastAxis:nextAxis});
   return;
  }
  setSelection([]);const rect=canvas.current!.getBoundingClientRect();
  banding.current={x:(e.clientX-rect.left)/zoom,y:(e.clientY-rect.top)/zoom};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}
 function bandMove(e:React.PointerEvent){
  if(editor&&pipePen){
   const {point,snap}=pipePointFromEvent(e);
   setPipeHover({point,snap,shift:e.shiftKey});
   return;
  }
  const b=banding.current;if(!b)return;const rect=canvas.current!.getBoundingClientRect();
  const x=(e.clientX-rect.left)/zoom,y=(e.clientY-rect.top)/zoom;
  setBand({x:Math.min(b.x,x),y:Math.min(b.y,y),w:Math.abs(x-b.x),h:Math.abs(y-b.y)});}
 function bandUp(){if(pipePen)return;const b=band;banding.current=null;setBand(null);if(!b||b.w<6&&b.h<6)return;
  setSelection(current.current.widgets.filter(w=>w.x<b.x+b.w&&w.x+w.width>b.x&&w.y<b.y+b.h&&w.y+w.height>b.y).map(w=>w.id));}
 /* G51: tutamaklar cerceveyi tutar, cizimi degil. Cerceve cizimden buyukse
  * konumlandirma gozle yapiliyor; bu eylem bos kenarlari kirpar, merkez yerinde kalir. */
 function snapFrames(){if(!selection.length)return;
  change({...current.current,widgets:current.current.widgets.map(w=>
   selection.includes(w.id)&&!w.locked&&!stretches(w)?{...w,...snapFrameToDrawing(w)}:w)});}
 function resizeSelection(dw:number,dh:number){if(!selection.length)return;
  change({...current.current,widgets:current.current.widgets.map(w=>selection.includes(w.id)&&!w.locked?{...w,width:Math.max(30,w.width+dw),height:Math.max(24,w.height+dh)}:w)});}
 function nudge(dx:number,dy:number){if(!selection.length)return;
  // Klavyeyle tasimada da bagli komsular birlikte gider; ayni zincir iki kez tasinmasin diye tasinanlar izlenir (B25).
  let s=current.current;const moved=new Set<string>();
  for(const id of selection){
   if(moved.has(id))continue;
   const w=s.widgets.find(x=>x.id===id);if(!w||w.locked)continue;
   const before=s;s=moveWithLinks(s,id,dx,dy);
   for(const nw of s.widgets){const ow=before.widgets.find(x=>x.id===nw.id);if(ow&&(nw.x!==ow.x||nw.y!==ow.y))moved.add(nw.id);}
  }
  change({...s,widgets:s.widgets.map(w=>w.x<0||w.y<0?{...w,x:Math.max(0,w.x),y:Math.max(0,w.y)}:w)});}
 function copy(){const picked=current.current.widgets.filter(w=>selection.includes(w.id));if(!picked.length)return;clipboard.current=structuredClone(picked);}
 function cut(){copy();remove();}
 function paste(at?:{x:number;y:number}){if(!clipboard.current.length)return;const map=new Map<string,string>();
  const left=Math.min(...clipboard.current.map(w=>w.x)),top=Math.min(...clipboard.current.map(w=>w.y));
  const dx=at?Math.round(at.x-left):20,dy=at?Math.round(at.y-top):20;
  const copies=clipboard.current.map(w=>{if(w.groupId&&!map.has(w.groupId))map.set(w.groupId,crypto.randomUUID());
   return {...w,id:crypto.randomUUID(),x:Math.max(0,w.x+dx),y:Math.max(0,w.y+dy),locked:false,groupId:map.get(w.groupId)||''};});
  clipboard.current=structuredClone(copies);change({...current.current,widgets:[...current.current.widgets,...copies]});setSelection(copies.map(w=>w.id));}

 /* Sekme gizlenir, pencere odagi gider ya da sayfa kapanirsa cek bas
  * birakilmis sayilmaz; cikis elle dusurulur. */
 useEffect(()=>{
  const release=()=>{
   const hold=holdRef.current;if(!hold)return;
   const w=current.current.widgets.find(x=>x.id===hold.id);
   if(hold.timer)clearTimeout(hold.timer);
   holdRef.current=null;
   if(w)void releaseWrite(w,(w.label||'Komut')+': ekran odağı kaybedildi, çıkış düşürüldü.');
  };
  const onHidden=()=>{if(document.hidden)release();};
  window.addEventListener('blur',release);window.addEventListener('pagehide',release);
  document.addEventListener('visibilitychange',onHidden);
  return()=>{window.removeEventListener('blur',release);window.removeEventListener('pagehide',release);document.removeEventListener('visibilitychange',onHidden);};
 },[]);
 useEffect(()=>{const onFull=()=>{const on=document.fullscreenElement===viewport.current;setFull(on);
   if(!on){setDrawer(false);keepFullscreen=false;setOverrideId(id=>{if(id&&id!==record.id)onScreen(id);return id;});}};
  document.addEventListener('fullscreenchange',onFull);return()=>document.removeEventListener('fullscreenchange',onFull);},[]);
 useEffect(()=>{if(keepFullscreen&&!document.fullscreenElement&&viewport.current)
  viewport.current.requestFullscreen().then(()=>setFull(true)).catch(()=>{keepFullscreen=false;});},[]);
 async function enterFullscreen(){keepFullscreen=true;changeFullScale(null);try{await viewport.current?.requestFullscreen();}catch{keepFullscreen=false;}}
 function exitFullscreen(){keepFullscreen=false;const id=overrideId;void document.exitFullscreen().catch(()=>{});if(id&&id!==record.id)onScreen(id);}
 function jump(id:string){setDrawer(false);if(id===view.id)return;
  const next=records.find(r=>r.id===id);if(!next)return;
  if(!full){onScreen(id);return;}
  navigatedAt=Date.now();setOverrideId(id);setSelection([]);
  setScreen(hydrateScreen(structuredClone(mode==='runtime'?(next.published||next.draft):next.draft)));}
 const [fullScale,setFullScale]=useState<number|null>(()=>{try{const n=Number(localStorage.getItem('scada-fullscreen-scale'));return n>=.2&&n<=4?n:null;}catch{return null;}});
 function changeFullScale(value:number|null){setFullScale(value);try{if(value===null)localStorage.removeItem('scada-fullscreen-scale');else localStorage.setItem('scada-fullscreen-scale',String(value));}catch{}}
 useEffect(()=>{if(!viewport.current)return;
  const fit=()=>{const v=viewport.current;if(!v)return;if(editor){if(!editorFitted.current){setZoom(Math.min(1,(v.clientWidth-48)/screen.width));editorFitted.current=true;}return;}
   if(full)setZoom(fullScale??Math.min(v.clientWidth/screen.width,v.clientHeight/screen.height));
   else setZoom(Math.min(1,(v.clientWidth-48)/screen.width));};
 fit();const observer=new ResizeObserver(fit);observer.observe(viewport.current);return()=>observer.disconnect();},[editor,screen.width,screen.height,full,fullScale]);
 /* Yakınlaştırma: Shift+tekerlek (eski) ve tasarımda Ctrl+tekerlek. Ctrl+tekerlek tuval üstünde tarayıcının
  * sayfa yakınlaştırmasını engeller (passive:false + preventDefault). Dokunmatik yüzey kıstırması da
  * Ctrl+wheel üretir, küçük deltalar orantılı adımla işlenir. */
 useEffect(()=>{const host=viewport.current;if(!host)return;const onWheel=(e:WheelEvent)=>{const ctrl=editor&&(e.ctrlKey||e.metaKey);if(!e.shiftKey&&!ctrl)return;e.preventDefault();const d=e.deltaY||e.deltaX;if(!d)return;const step=Math.abs(d)>=50?(d<0?.1:-.1):-d/500;setZoom(z=>Math.max(.2,Math.min(4,Math.round((z+step)*100)/100)));};host.addEventListener('wheel',onWheel,{passive:false});return()=>host.removeEventListener('wheel',onWheel);},[]);
 useEffect(()=>{const host=viewport.current;if(!host)return;const down=(e:PointerEvent)=>{if(e.button!==1)return;e.preventDefault();e.stopPropagation();pan.current={x:e.clientX,y:e.clientY,left:host.scrollLeft,top:host.scrollTop};host.setPointerCapture(e.pointerId);};const movePan=(e:PointerEvent)=>{const p=pan.current;if(!p)return;e.preventDefault();host.scrollLeft=p.left-(e.clientX-p.x);host.scrollTop=p.top-(e.clientY-p.y);};const up=()=>{pan.current=null;};host.addEventListener('pointerdown',down,true);host.addEventListener('pointermove',movePan,true);host.addEventListener('pointerup',up,true);host.addEventListener('pointercancel',up,true);return()=>{host.removeEventListener('pointerdown',down,true);host.removeEventListener('pointermove',movePan,true);host.removeEventListener('pointerup',up,true);host.removeEventListener('pointercancel',up,true);};},[]);
 useEffect(()=>{const host=viewport.current;if(!host)return;const down=(e:MouseEvent)=>{if(e.button!==1)return;e.preventDefault();pan.current={x:e.clientX,y:e.clientY,left:host.scrollLeft,top:host.scrollTop};};const movePan=(e:MouseEvent)=>{const p=pan.current;if(!p)return;e.preventDefault();host.scrollLeft=p.left-(e.clientX-p.x);host.scrollTop=p.top-(e.clientY-p.y);};const up=()=>{pan.current=null;};host.addEventListener('mousedown',down,true);window.addEventListener('mousemove',movePan,true);window.addEventListener('mouseup',up,true);return()=>{host.removeEventListener('mousedown',down,true);window.removeEventListener('mousemove',movePan,true);window.removeEventListener('mouseup',up,true);};},[]);
 const [shortcuts,setShortcuts]=useState(false);
 const shortcutRef=useModal<HTMLDivElement>(shortcuts,useCallback(()=>setShortcuts(false),[]));
 useEffect(()=>{function key(e:KeyboardEvent){if(['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName))return;
  // Kisayol yardimi her modda acilir; komut kisayolu yoktur, yalnizca gezinme ve duzenleme.
  if(e.key==='?'||(e.shiftKey&&e.key==='/')){e.preventDefault();setShortcuts(v=>!v);return;}
  if(e.key==='Escape'&&shortcuts){setShortcuts(false);return;}
  if(!editor)return;
  const ctrl=e.ctrlKey||e.metaKey,step=e.shiftKey?10:1;
  if(e.key==='Shift'&&pipePen&&pipeDraft){setPipeHover(h=>h?{...h,shift:true}:h);}
  if(!ctrl&&!e.altKey&&(e.key==='p'||e.key==='P')){e.preventDefault();setPipePen(v=>{const next=!v;if(!next){setPipeDraft(null);setPipeHover(null);}return next;});return;}
  if(e.key==='Enter'&&pipePen&&pipeDraft&&pipeDraft.points.length>=2){e.preventDefault();finishPipeDraft(pipeDraft.points,pipeDraft.startSnap,null);return;}
  if(e.key==='Delete'){e.preventDefault();remove();}
  if(ctrl&&e.key==='z'){e.preventDefault();e.shiftKey?redo():undo();}
  if(ctrl&&e.key==='d'){e.preventDefault();duplicate();}
  if(ctrl&&e.key==='a'){e.preventDefault();setSelection(current.current.widgets.map(w=>w.id));}
  if(ctrl&&e.key==='c'){copy();}
  if(ctrl&&e.key==='x'){e.preventDefault();cut();}
  if(ctrl&&e.key==='v'){e.preventDefault();paste();}
  if(e.key==='Escape'){if(resOpen){setResOpen(false);return;}if(pipeDraft){setPipeDraft(null);return;}if(pipePen){setPipePen(false);setPipeHover(null);return;}setMenu(null);if(compact){setShowLibrary(false);setShowInspector(false);}}
  if(!ctrl&&e.shiftKey&&(e.key==='F'||e.key==='f')){e.preventDefault();snapFrames();}
 if(!ctrl&&e.key==='['){e.preventDefault();rotateSelection(-(e.shiftKey?90:15));}
  if(!ctrl&&e.key===']'){e.preventDefault();rotateSelection(e.shiftKey?90:15);}
  if(!ctrl&&(e.key==='h'||e.key==='H')){e.preventDefault();mirror('x');}
  if(!ctrl&&(e.key==='v'||e.key==='V')){e.preventDefault();mirror('y');}
  if(e.key.startsWith('Arrow')){e.preventDefault();const dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;ctrl?resizeSelection(dx,dy):nudge(dx,dy);}
 }
 function keyUp(e:KeyboardEvent){if(e.key==='Shift'&&pipePen&&pipeDraft)setPipeHover(h=>h?{...h,shift:false}:h);}
 window.addEventListener('keydown',key);window.addEventListener('keyup',keyUp);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',keyUp);};});
 const shortcutList:[string,string][]=[['?','Bu yardım penceresi'],['P','Dik açılı boru kalemi (Shift köşe yönü, Enter bitirir)'],['Delete','Seçimi sil'],['Ctrl+Z / Ctrl+Shift+Z','Geri al / yinele'],['Ctrl+D','Çoğalt'],['Ctrl+A','Tümünü seç'],['Ctrl+C / X / V','Kopyala / kes / yapıştır'],['Ok tuşları','1 px taşı (Shift ile 10 px)'],['Ctrl+Ok','Boyutlandır'],['[ / ]','15° döndür (Shift ile 90°)'],['H / V','Yatay / dikey aynala'],['Ctrl / Shift + tekerlek','Yakınlaştır / uzaklaştır'],['Esc','Menüyü veya aracı kapat']];
 const [numericEntry,setNumericEntry]=useState<Widget|null>(null),[info,setInfo]=useState<Widget|null>(null);
 /* G44: cek bas (momentary) ve darbe (pulse). Ikisi de true yazip ARDINDAN
  * false yazar. Kritik olan birakmadir: parmak kalkmasa, sekme kapansa,
  * ekran odagi gitse bile cikis dusmelidir. Bu yuzden birakma yazisi ayri
  * bir yoldan, israrla tekrar denenerek gonderilir ve basarisiz olursa
  * operatore sessizce degil, kirmizi uyariyla bildirilir. */
 const holdRef=useRef<{id:string;timer:ReturnType<typeof setTimeout>|null}|null>(null);
 const [held,setHeld]=useState('');
 const infoRef=useModal<HTMLDivElement>(!!info,useCallback(()=>setInfo(null),[]));
 const [waiting,setWaiting]=useState<string[]>([]);
 // Operatorun KENDI istegi komut kimligiyle izlenir; baska operatorun komutu bu gostergeyi golgelemez.
 const [ownRequests,setOwnRequests]=useState<{id:string;commandId:string;widgetId:string;at:number}[]>([]);
 useEffect(()=>{const t=setInterval(()=>setOwnRequests(list=>list.filter(r=>{
  const e=live.commands.find(c=>c.id===r.id);
  return !(e&&finalStatuses.includes(e.status)&&Date.now()-r.at>12000)&&Date.now()-r.at<120000;})),1000);return()=>clearInterval(t);},[live.commands]);
 /** Nesnenin uzerinde gosterilecek islem durumu; yalnizca bu tarayicidan verilen komut icin. */
 function ownStatus(w:Widget){
  const r=[...ownRequests].reverse().find(x=>x.widgetId===w.id);if(!r)return null;
  const e=live.commands.find(c=>c.id===r.id);
  if(!e)return {tone:'pending',text:'Gönderiliyor…'};
  const steps=e.steps.length>1?` (adım ${e.steps.filter(s=>s.status==='acknowledged').length}/${e.steps.length})`:'';
  if(e.status==='accepted'||e.status==='sent')return {tone:'pending',text:'PLC yazma yanıtı bekleniyor'+steps};
  if(e.status==='acknowledged')return {tone:'pending',text:'Yazma yanıtı alındı; geri okuma bekleniyor'+steps};
  if(e.status==='verified')return {tone:'good',text:'Geri okumayla doğrulandı'+steps};
  if(e.status==='partial')return {tone:'bad',text:'Kısmen tamamlandı'+steps};
  if(e.status==='unverified')return {tone:'warn',text:'Yazıldı ama geri okumayla doğrulanamadı'};
  if(e.status==='uncertain')return {tone:'warn',text:'Sonuç belirsiz; tekrar gönderilmedi'};
  return {tone:'bad',text:statusText(e.status)};
 }
 function fitContent(){if(!selection.length)return;change({...current.current,widgets:current.current.widgets.map(w=>{if(!selection.includes(w.id)||w.locked)return w;const hasLabel=w.labelVisible!==false&&w.label.trim().length>0;const base=['pipe','elbow','tee','cross','reducer'].includes(w.type)?{width:Math.max(80,w.width),height:Math.max(24,Math.min(160,w.height))}:{width:Math.max(80,Math.min(240,Math.max(100,w.width))),height:hasLabel?110:86};return {...w,...base};})});}
 async function click(w:Widget,numericValue?:number){if(editor)return;if(w.type==='info'){setInfo(w);return;}if(w.type==='numeric-input'&&numericValue===undefined){setNumericEntry(w);return;}if(['slider','keypad','pid'].includes(w.type)&&numericValue===undefined)return;if(w.type==='navigation'){if(w.targetScreenId){if(full)jump(w.targetScreenId);else onScreen(w.targetScreenId)};return;}if(w.type==='selector'){await selectorStep(w);return;}if(!isCommandWidget(w.type)||!w.commandId)return;const d=config.commands.find(x=>x.id===w.commandId);if(!d)return;if(typeof numericValue==='number'){const range=writeRangeOf(w,config);if(numericValue<range.min||numericValue>range.max){notify((w.label||'Nesne')+': izin verilen aralık '+range.min+' – '+range.max+'; '+numericValue+' gönderilmedi.','error');return;}}if(w.action==='momentary')return;/* basma/birakma isaretcilerden yurur */if(w.action==='pulse'){await pulseWrite(w);return;}const state=preview?(simulation[w.tagId]??false):live.samples[w.tagId]?.value;if(w.action==='toggle'&&typeof state!=='boolean'){notify('Dijital geri bildirim bekleniyor.');return;}const value=['numeric-input','slider','keypad','pid'].includes(w.type)?numericValue!:w.action==='toggle'?!state:w.action==='set'?w.setValue:w.action==='on';if(preview){setSimulation(s=>({...s,...Object.fromEntries([...d.tagIds,...d.feedbackTagIds,w.tagId].filter(Boolean).map(id=>[id,value]))}));return;}
  const definition=config.commands.find(x=>x.id===w.commandId);
  if(definition&&definition.approval&&definition.approval!=='none'){setRiskConfirm({widget:w,value,reason:'',busy:false});return;}
  await send(w,value);
 }
 /* G43: secici anahtar bir sonraki konuma gecer ve o konumun degerini yazar.
  * Konum geri bildirimi (w.tagId) okunamiyorsa hicbir sey yazilmaz — hangi
  * konumdan hangi konuma gidildigi belirsizken kumanda gonderilmez. */
 async function selectorStep(w:Widget){
  if(!w.commandId||!w.parts.length)return;
  const d=config.commands.find(x=>x.id===w.commandId);if(!d)return;
  const reading=preview?simulation[w.tagId]:live.samples[w.tagId]?.value;
  if(typeof reading!=='number'){notify('Seçici konumu okunamıyor; komut gönderilmedi.','error');return;}
  const current=w.parts.findIndex(p=>p.value===reading);
  const next=w.parts[(current+1)%w.parts.length];
  if(!next)return;
  if(preview){setSimulation(s=>({...s,...Object.fromEntries([...d.tagIds,...d.feedbackTagIds,w.tagId].filter(Boolean).map(id=>[id,next.value]))}));return;}
  if(d.approval&&d.approval!=='none'){setRiskConfirm({widget:w,value:next.value,reason:'',busy:false});return;}
  await send(w,next.value);
 }
 /** Onizlemede yazma simule edilir; sahaya hicbir sey gitmez. */
 function simulateWrite(w:Widget,value:boolean){
  const d=config.commands.find(x=>x.id===w.commandId);if(!d)return;
  setSimulation(s=>({...s,...Object.fromEntries([...d.tagIds,...d.feedbackTagIds,w.tagId].filter(Boolean).map(id=>[id,value]))}));
 }
 /* Birakma yazisi tek denemede birakilmaz: ayni hedefte bekleyen komut varken
  * sunucu reddeder ve tek deneme "cikis acik kaldi" demektir. */
 async function releaseWrite(w:Widget,note?:string){
  if(preview){simulateWrite(w,false);setHeld('');return;}
  for(let attempt=0;attempt<20;attempt++){
   try{
    await api('/commands','POST',{id:crypto.randomUUID(),commandId:w.commandId,value:false,screenId:view.id,screenVersion:view.publishedVersion});
    setHeld('');if(note)notify(note);return;
   }catch{await new Promise(r=>setTimeout(r,300));}
  }
  setHeld('');
  notify((w.label||'Komut')+': BIRAKMA YAZISI GÖNDERİLEMEDİ — çıkış açık kalmış olabilir, sahayı kontrol edin.','error');
 }
 /** Cek bas: parmak indi. Guvenlik sayaci ayni anda kurulur. */
 async function pressStart(w:Widget){
  if(holdRef.current)return;
  const reason=blockReason(w);if(reason){notify(reason);return;}
  holdRef.current={id:w.id,timer:setTimeout(()=>{holdRef.current=null;void releaseWrite(w,(w.label||'Komut')+': güvenlik süresi doldu, çıkış düşürüldü.');},w.pulseMs)};
  setHeld(w.id);
  if(preview){simulateWrite(w,true);return;}
  await send(w,true);
 }
 /** Cek bas: parmak kalkti / isaretci kacti / odak gitti. */
 async function pressEnd(w:Widget){
  const hold=holdRef.current;if(!hold||hold.id!==w.id)return;
  if(hold.timer)clearTimeout(hold.timer);
  holdRef.current=null;
  await releaseWrite(w);
 }
 /** Darbe: tek basis, sure sonunda kendiliginden birakir. */
 async function pulseWrite(w:Widget){
  const reason=blockReason(w);if(reason){notify(reason);return;}
  if(preview){simulateWrite(w,true);setTimeout(()=>simulateWrite(w,false),w.pulseMs);return;}
  setHeld(w.id);
  await send(w,true);
  setTimeout(()=>{void releaseWrite(w);},w.pulseMs);
 }
 /** Komutu sunucuya gonderir; riskli komutlarda gerekce de tasinir. */
 async function send(w:Widget,value:boolean|number,reason?:string){
  const d=config.commands.find(x=>x.id===w.commandId);if(!d)return;
  const requestId=crypto.randomUUID();setWaiting(a=>[...a,w.commandId]);setOwnRequests(list=>[...list,{id:requestId,commandId:w.commandId,widgetId:w.id,at:Date.now()}]);try{const r=await api<{status:string}>('/commands','POST',{id:requestId,commandId:w.commandId,value,screenId:view.id,screenVersion:view.publishedVersion,...(reason?{reason}:{})});
   notify(r.status==='awaiting'?d.name+': ikinci kişinin onayı bekleniyor.':d.name+': istek alındı, PLC yanıtı bekleniyor.');}catch(e){setOwnRequests(list=>list.filter(x=>x.id!==requestId));notify((e as Error).message,'error');if(w.type==='numeric-input')throw e;}finally{setWaiting(a=>a.filter(x=>x!==w.commandId));}
 }
 /* K02: instansi tipin guncel surumune tasir. Tek instans tasinir; ayni
  * tipin diger instanslari elle onaylanana kadar eski surumde kalir. */
 function upgradeInstance(instanceId:string){
  const instance=(current.current.equipment||[]).find(e=>e.id===instanceId);
  const type=instance&&equipmentTypes.find(t=>t.id===instance.typeId);
  if(!instance||!type)return;
  change(upgradeEquipmentInstance(current.current,instanceId,type));
  notify(instance.name+': ekipman tipi v'+type.version+' sürümüne güncellendi.');
 }
 /* K02: ekrandaki instansin bugunku halinden tipin yeni surumunu uretir.
  * Mevcut instanslar KENDILIGINDEN degismez; her biri ayri onaylanir. */
 async function reviseType(instanceId:string){
  const instance=(current.current.equipment||[]).find(e=>e.id===instanceId);
  const type=instance&&equipmentTypes.find(t=>t.id===instance.typeId);
  const members=current.current.widgets.filter(w=>w.equipmentId===instanceId);
  if(!instance||!type||!members.length)return;
  const revised=reviseEquipmentType(type,members);
  try{
   const r=await api<{equipmentTypes:EquipmentType[]}>('/equipment-types','PUT',equipmentTypes.map(t=>t.id===type.id?revised:t));
   setEquipmentTypes(r.equipmentTypes||[]);void onRefresh();
   change({...current.current,equipment:(current.current.equipment||[]).map(e=>e.id===instanceId?{...e,typeVersion:revised.version}:e)});
   notify(type.name+': tip v'+revised.version+' olarak kaydedildi. Diğer instanslar eski sürümde kaldı.');
  }catch(e){notify((e as Error).message,'error');}
 }
 /* G37/G38/G39: gecmis veri, alarm akisi ve etiket sozlugunu tek kanaldan
  * sembollere verir. Tasarim ve onizlemede alarm/gecmis baglanmaz: orada
  * nesne "veri kaynagi yok" halini cizer, sahte veri uydurmaz. */
 const symbolLive=useMemo(()=>({
  alarms:editor||preview?undefined:live.alarms,
  ack:editor||preview?undefined:(id:string)=>{void api('/alarms/ack','POST',{ids:[id]}).then(()=>void onRefresh()).catch(e=>notify((e as Error).message,'error'));},
  history:editor||preview?undefined:async(tagIds:string[],from:number,to:number)=>{
   const r=await api<{series:Record<string,{at:number;value:number|null;quality:string}[]>}>(`/history?tagIds=${encodeURIComponent(tagIds.join(','))}&from=${Math.round(from)}&to=${Math.round(to)}&maxPoints=600`);
   return r.series||{};
  },
  tagInfo:(id:string)=>{const t=config.tags.find(x=>x.id===id);return t?{code:t.code,name:t.name,unit:t.unit}:undefined;},
  // G44/G45: sayisal yazma, butonlarla AYNI yoldan gider (onay, izin kosulu,
  // risk gerekcesi ve bekleme durumu dahil); ayri bir kisa yol acilmaz.
  write:editor?undefined:(widget:Widget,value:number)=>{void click(widget,value);},
  blocked:editor?undefined:(widget:Widget)=>blockReason(widget),
  editor
 }),[editor,preview,live.alarms,config.tags,click,blockReason]);
 /* K11: ekrani SVG olarak disa aktarir. Kaynak, o an gorunen tuvaldir —
  * cizim mantiginin ikinci bir kopyasi yasatilmaz. HTML tabanli nesneler
  * cerceve olarak gider ve kaci boyle gittigi kullaniciya soylenir. */
 function downloadSvg(){
  const node=canvas.current;
  if(!node){notify('Çizim alanı bulunamadı.','error');return;}
  const {svg,drawn,placeholders}=exportScreenSvg(node,{width:screen.width,height:screen.height},screen.background);
  const blob=new Blob([svg],{type:'image/svg+xml'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=(screen.name||'ekran').replace(/[^A-Za-z0-9.-]+/g,'-')+'.svg';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  notify(placeholders.length
   ?`${drawn} sembol SVG olarak yazıldı. ${placeholders.length} nesne (${placeholders.slice(0,3).join(', ')}${placeholders.length>3?'…':''}) SVG'ye çevrilemediği için boş çerçeve olarak kondu.`
   :`${drawn} sembol SVG olarak yazıldı.`);
 }
 /** Faceplate icin ornek kaynagi: onizlemede simulasyon, calismada canli veri. */
 function faceplateSamples(w:Widget):Record<string,{value:boolean|number|null;quality:string}>{
  const ids=(w.bindings||[]).map(b=>b.tagId).filter(Boolean);
  return Object.fromEntries(ids.map(id=>[id,preview?{value:simulation[id]??null,quality:simQuality[id]||'good'}:{value:live.samples[id]?.value??null,quality:live.samples[id]?.quality||'unknown'}]));
 }
 /** Bilgi penceresindeki komut satırını, buton nesnesiymiş gibi çalıştırır. */
 function detailWidget(w:Widget,d:Detail):Widget{return {...w,type:'button',commandId:d.commandId,action:d.action,setValue:d.setValue,tagId:d.tagId,onText:d.onText,offText:d.offText,label:d.label||w.label};}
 /** K06: kalite durumunun operatore ne anlattigi. */
 function qualityHint(w:Widget,quality:string):string{
  if(!w.tagId||quality==='good')return '';
  const s=live.samples[w.tagId];
  const age=s?Math.round((Date.now()-s.receivedAt)/1000):0;
  if(quality==='stale')return `Veri ${age} saniyedir güncellenmiyor; gösterilen değer eski.`;
  if(quality==='bad')return 'Cihaz bu etiket için hatalı değer bildiriyor.';
  return 'Bu etiket hiç okunmadı.';
 }
 /* K05: nesnenin kendi etiketlerine (durum, kademe, saha bagi, gorunurluk)
  * bagli bir alarm varsa nesne isaretlenir. Onaylanmamis alarm yanip soner;
  * onaylandiktan sonra yanip sonme durur, alarm gecene kadar sabit halka
  * kalir. Renk tek basina birakilmaz: halka + baslik metni birlikte gider. */
 function widgetTagIds(w:Widget):string[]{
  return [w.tagId,w.visibleTagId,...w.parts.map(p=>p.tagId),...(w.bindings||[]).map(b=>b.tagId),...w.details.map(d=>d.tagId)].filter(Boolean);
 }
 function alarmRing(w:Widget):string{
  const ids=new Set(widgetTagIds(w));
  if(!ids.size)return '';
  const mine=(live.alarms||[]).filter(a=>ids.has(a.tagId));
  if(!mine.length)return '';
  if(mine.some(a=>!a.ackAt))return 'alarm-unacked ';
  return mine.some(a=>!a.clearedAt)?'alarm-active ':'';
 }
 /** Komut neden gonderilemiyor? Tek boolean yerine acik neden dondurulur (bos = gonderilebilir). */
 function blockReason(w:Widget):string{
  if(editor||preview)return '';
  if(w.type==='navigation'||!writesCommand(w))return '';
  if(!['admin','operator'].includes(user.role))return 'Bu rol komut gönderemez.';
  const d=config.commands.find(x=>x.id===w.commandId);
  if(!d)return 'Bu nesneye komut tanımı bağlı değil.';
  if(!live.gatewayConnected)return 'Köprü bağlı değil; komut gönderilemez.';
  if(live.deploying)return 'Yapılandırma uygulanıyor.';
  if(live.activeRevision!==live.desiredRevision)return 'Kayıtlı yapılandırma henüz haberleşmeye uygulanmadı.';
  if((w.action==='toggle'||w.type==='selector')&&(!w.tagId||live.samples[w.tagId]?.quality!=='good'||typeof live.samples[w.tagId]?.value!==(w.type==='selector'?'number':'boolean')))
   return w.type==='selector'?'Seçici konumu güncel değil; kumanda kapalı.':'Değiştirme için nesnenin durum verisi güncel değil.';
  if(waiting.includes(w.commandId))return 'Komut gönderiliyor.';
  const busy=live.commands.find(c=>c.commandId===w.commandId&&!finalStatuses.includes(c.status));
  if(busy)return `${busy.user} tarafından verilen komutun sonucu bekleniyor.`;
  const staleTag=[...d.tagIds,...d.feedbackTagIds].find(id=>live.samples[id]?.quality!=='good');
  if(staleTag){const t=config.tags.find(x=>x.id===staleTag),s=live.samples[staleTag];
   const age=s?Math.round((Date.now()-s.receivedAt)/1000):0;
   return `${t?.code||staleTag} verisi ${s?`${age} saniyedir güncel değil`:'hiç okunmadı'}.`;}
  const unmet=unmetPermissives(config,d.id,live.samples);
  if(unmet.length)return 'İzin koşulu sağlanmadı — '+unmet.map(permissiveText).join('; ')+'.';
  return '';
 }
 function disabled(w:Widget){return blockReason(w)!=='';}
 async function publish(){if(dirty&&!(await save()))return;
  const findings=lintScreen(current.current,config,defaultStyleGuide,homeScreenId?homeScreenId===record.id:true).sort((a,b)=>lintOrder[a.severity]-lintOrder[b.severity]);
  if(!findings.length){await doPublish();return;}
  setLintModal({findings,reason:'',busy:false});
 }
 function openMenu(e:React.MouseEvent,w:Widget|null){if(!editor)return;e.preventDefault();e.stopPropagation();
  if(pipePen&&pipeDraft){setPipeDraft(null);return;}
  if(w){const ids=w.groupId?current.current.widgets.filter(x=>x.groupId===w.groupId).map(x=>x.id):[w.id];
   if(!selection.includes(w.id))setSelection(ids);}
  else setSelection([]);
  setMenu({x:e.clientX,y:e.clientY,widget:w,at:canvasPoint(e)});}
 function runMenu(fn:()=>void){setMenu(null);fn();}
 useEffect(()=>{if(!menu)return;const close=()=>setMenu(null);
  window.addEventListener('pointerdown',close);window.addEventListener('resize',close);window.addEventListener('blur',close);
  document.addEventListener('scroll',close,true);
  return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('resize',close);window.removeEventListener('blur',close);document.removeEventListener('scroll',close,true);};},[menu]);
 // Dar ekranda (<=1280 px) palet ve ozellikler tuvali ezmesin: kapali acilir, acilinca tuvalin ustune cekmece olarak gelir.
 useEffect(()=>{const mq=window.matchMedia(COMPACT_QUERY);const sync=()=>{setCompact(mq.matches);setShowLibrary(!mq.matches);setShowInspector(!mq.matches);};mq.addEventListener('change',sync);return()=>mq.removeEventListener('change',sync);},[]);
 return <div className={'studio '+(editor?'editing':preview?'previewing':'')+(compact?' compact':'')+(editor&&pipePen?' pipe-pen-mode':'')}><SymbolDefs/>
  {editor&&showLibrary&&<aside className="palette">{compact&&<div className="drawer-bar"><span>Stüdyo paneli</span><button className="tool" aria-label="Paneli kapat" title="Kapat (Esc)" onClick={()=>setShowLibrary(false)}><X size={14}/></button></div>}
  <div className="palette-tabs" role="tablist" aria-label="Sol panel" onKeyDown={e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();
   const order=['library','layers','templates'] as const;
   const idx=order.indexOf(paletteTab);
   const nextIdx=e.key==='Home'?0:e.key==='End'?order.length-1:(idx+(e.key==='ArrowRight'?1:-1)+order.length)%order.length;
   setPaletteTab(order[nextIdx]);
   e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[nextIdx]?.focus();
  }}>
   <button type="button" role="tab" tabIndex={paletteTab==='library'?0:-1} aria-selected={paletteTab==='library'} onClick={()=>setPaletteTab('library')}>Kütüphane</button>
   <button type="button" role="tab" tabIndex={paletteTab==='layers'?0:-1} aria-selected={paletteTab==='layers'} onClick={()=>setPaletteTab('layers')}>Katmanlar<small>{screen.widgets.length}</small></button>
   <button type="button" role="tab" tabIndex={paletteTab==='templates'?0:-1} aria-selected={paletteTab==='templates'} onClick={()=>setPaletteTab('templates')}>Şablonlar<small>{screenTemplates.length+BACKDROP_VARIANTS.length+equipmentTemplates.length+equipmentTypes.length}</small></button>
  </div>
  {paletteTab==='library'&&<Library language={language} symbolStyle={screen.symbolStyle} hideGroupsTab onAdd={t=>add(t)} onEquipment={id=>addEquipment(id)}/>}
  {paletteTab==='layers'&&<div className="layer-panel">
   <div className="layer-search"><Search size={12}/><input value={layerSearch} placeholder="Katman ara" aria-label="Katman ara" onChange={e=>setLayerSearch(e.target.value)}/>{layerSearch&&<button className="tool" aria-label="Aramayı temizle" onClick={()=>setLayerSearch('')}><X size={12}/></button>}{hiddenLayers.length>0&&<button className="tool" title="Gizlenen katmanları göster" aria-label="Gizlenen katmanları göster" onClick={()=>setHiddenLayers([])}><Eye size={12}/></button>}</div>
   <div className="layer-list">{layerGroups().map(g=>{
    const ids=g.items.map(i=>i.id),collapsed=collapsedLayers.includes(g.key),allHidden=ids.every(id=>hiddenLayers.includes(id));
    return <div key={g.key||'tekil'} className="layer-group">
     {g.key&&<div className={'layer-group-head'+(collapsed?' collapsed':'')}>
     <button className="layer-group-name" aria-expanded={!collapsed} onClick={()=>setCollapsedLayers(c=>c.includes(g.key)?c.filter(x=>x!==g.key):[...c,g.key])}>{collapsed?<Folder size={12}/>:<FolderOpen size={12}/>}<span>{g.name}</span><small>{g.items.length}</small></button>
     <button className="tool" title="Grubu seç" aria-label={g.name+' grubunu seç'} onClick={()=>setSelection(ids)}><CheckSquare size={11}/></button>
      <button className="tool" title="Gruba odaklan" aria-label={g.name+' grubuna odaklan'} onClick={()=>{setSelection(ids);zoomToSelection(ids)}}><Maximize size={11}/></button>
      <button className="tool" title={allHidden?'Tasarımda göster':'Tasarımda gizle'} aria-label={allHidden?'Tasarımda göster':'Tasarımda gizle'} onClick={()=>toggleHidden(ids)}>{allHidden?<EyeOff size={11}/>:<Eye size={11}/>}</button>
      <button className="tool" title="Kilidi değiştir" aria-label="Kilidi değiştir" onClick={()=>lockLayers(ids)}>{g.items.every(i=>i.locked)?<Lock size={11}/>:<Unlock size={11}/>}</button>
     </div>}
     {!collapsed&&g.items.map(w=>{const bind=widgetBindingStatus(w,config,screenIdSet);return <div key={w.id} className={'layer-row'+(selection.includes(w.id)?' selected':'')+(hiddenLayers.includes(w.id)?' hidden-layer':'')} draggable
       onDragStart={()=>{layerDrag.current=w.id;}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();moveLayer(layerDrag.current,w.id);layerDrag.current='';}}>
      <span className="layer-grip" aria-hidden="true"><GripVertical size={11}/></span>
      <span className={'layer-bind-dot '+bind.state} title={bind.label} aria-label={bind.label}/>
      <button className="layer-name" onClick={e=>pickLayer(w.id,e)} title={(w.label||labels[w.type])+' · '+bind.label+' · sürükleyerek katman sırasını değiştirin'}><span>{w.label||labels[w.type]}</span></button>
      <button className="tool" title="Nesneye odaklan" aria-label={(w.label||labels[w.type])+' nesnesine odaklan'} onClick={()=>{setSelection([w.id]);zoomToSelection([w.id])}}><Maximize size={11}/></button>
      <button className="tool" title={hiddenLayers.includes(w.id)?'Tasarımda göster':'Tasarımda gizle'} aria-label={hiddenLayers.includes(w.id)?'Tasarımda göster':'Tasarımda gizle'} onClick={()=>toggleHidden([w.id])}>{hiddenLayers.includes(w.id)?<EyeOff size={11}/>:<Eye size={11}/>}</button>
      <button className="tool" title={w.locked?'Kilidi aç':'Kilitle'} aria-label={w.locked?'Kilidi aç':'Kilitle'} onClick={()=>lockLayers([w.id])}>{w.locked?<Lock size={11}/>:<Unlock size={11}/>}</button>
     </div>;})}
    </div>;})}
    {!layerGroups().length&&<p className="small muted" style={{padding:'6px 5px 10px'}}>{layerSearch?'Aramaya uyan katman yok.':'Bu ekranda nesne yok.'}</p>}
   </div></div>}
  {paletteTab==='templates'&&<div className="templates-panel">
   <div className="layer-search"><Search size={12}/><input value={templateSearch} placeholder="Şablon veya ekipman ara" aria-label="Şablon ara" onChange={e=>setTemplateSearch(e.target.value)}/>{templateSearch&&<button className="tool" aria-label="Aramayı temizle" onClick={()=>setTemplateSearch('')}><X size={12}/></button>}</div>
   <button type="button" className="btn small wide" disabled={!selection.length} title={selection.length?'Seçili nesnelerden ekipman tipi oluştur':'Önce tuvalden nesne seçin'} onClick={openTypeBuilder}><Blocks size={13}/>Seçimi ekipman tipi olarak kaydet</button>
   <div className="templates-scroll">
    <div className="templates-section-head"><span>Hazır ekran şablonları</span><small>{screenTemplates.length}</small></div>
    {screenTemplates.filter(t=>(t.name+' '+t.category+' '+t.description).toLocaleLowerCase('tr').includes(templateSearch.trim().toLocaleLowerCase('tr'))).map(t=><button key={t.id} type="button" className="screen-template-card" onClick={()=>setPendingTemplate(t)}>
     <div className="screen-template-preview" aria-hidden="true">{renderBackdropSvg(t.backdropVariant,'st-'+t.id)}</div>
     <span><strong>{t.name}</strong><small>{t.category} · {t.width}×{t.height}</small></span>
    </button>)}
    <div className="templates-section-head"><span>Tesis altlıkları (SVG)</span><small>{BACKDROP_VARIANTS.length}</small></div>
    <div className="backdrop-pick-grid">
     {BACKDROP_VARIANTS.filter(b=>(b.label+' '+b.labelEn).toLocaleLowerCase('tr').includes(templateSearch.trim().toLocaleLowerCase('tr'))).map(b=><button key={b.key} type="button" className="backdrop-pick-tile" draggable title={b.label+' altlığını en alt katmana ekle'} onDragStart={e=>e.dataTransfer.setData('scada-backdrop',b.key)} onClick={()=>addBackdrop(b.key)}>
      <div className="backdrop-pick-preview" aria-hidden="true">{renderBackdropSvg(b.key,'bp-'+b.key)}</div>
      <span>{b.label}</span>
     </button>)}
    </div>
    <div className="templates-section-head"><span>Hazır gruplar</span><small>{equipmentTemplates.length}</small></div>
    {equipmentTemplates.filter(t=>(t.name+' '+t.description).toLocaleLowerCase('tr').includes(templateSearch.trim().toLocaleLowerCase('tr'))).map(t=><button key={t.id} type="button" className="equipment-template" draggable onDragStart={e=>e.dataTransfer.setData('scada-equipment',t.id)} onClick={()=>addEquipment(t.id)}><div><Symbol w={{...newWidget(t.symbol),label:''}} quality="good" value={false}/></div><span><strong>{t.name}</strong><small>{t.description}</small></span><Plus size={14}/></button>)}
    <div className="templates-section-head"><span>Kayıtlı ekipman tipleri</span><small>{equipmentTypes.length}</small></div>
    {(()=>{const q=templateSearch.trim().toLocaleLowerCase('tr'),list=equipmentTypes.filter(t=>!q||(t.name+' '+(t.description||'')).toLocaleLowerCase('tr').includes(q));
     return list.length?list.map(t=><div key={t.id} className={'equipment-row'+(pendingTypeDelete===t.id?' confirm':'')}><button type="button" className="equipment-add" draggable title={(t.description||t.name)+' · tıklayın veya sürükleyin'} onDragStart={e=>e.dataTransfer.setData('scada-equipment-type',t.id)} onClick={()=>addEquipmentInstance(t.id)}><Blocks size={13}/><span>{t.name}</span></button><button type="button" className="tool equipment-delete" title={pendingTypeDelete===t.id?'Silmeyi onaylamak için tekrar tıklayın':'Ekipman tipini sil'} aria-label={pendingTypeDelete===t.id?t.name+' silmeyi onayla':t.name+' ekipman tipini sil'} onClick={()=>void deleteEquipmentType(t)}>{pendingTypeDelete===t.id?<span>Sil?</span>:<Trash2 size={12}/>}</button></div>):<p className="small muted" style={{padding:'6px 4px 10px'}}>{templateSearch?'Aramaya uyan şablon yok.':'Kayıtlı ekipman tipi yok. Nesneleri seçip yukarıdan tip kaydedin.'}</p>;})()}
   </div>
  </div>}
  </aside>}
  <section className="workspace">
   <div className="canvas-toolbar"><div className="toolbar-group">{(editor||preview)&&canEdit&&onModeChange&&<><div className="mode-switch inline" role="group" aria-label="Çalışma modu"><button type="button" onClick={()=>onModeChange('runtime')}><Monitor size={14}/>Canlı</button><button type="button" className={editor?'active':''} onClick={()=>onModeChange('editor')}><PenTool size={14}/>Tasarım</button><button type="button" className={preview?'active':''} onClick={()=>onModeChange('preview')}><Eye size={14}/>Önizleme</button></div><span className="divider"/></>}<span className="screen-name">{screen.name}</span><span className="muted small">{editor?'Taslak v'+version:preview?'Simülasyon':'Yayın v'+view.publishedVersion}</span></div><div className="toolbar-group">{editor?<><Tool title="Seçim aracı (Esc)" onClick={()=>{setPipePen(false);setPipeDraft(null);setPipeHover(null);}} active={!pipePen} pressed={!pipePen}><MousePointer2/></Tool><Tool title="Dik açılı boru kalemi (P)" onClick={()=>{setPipePen(v=>{const next=!v;if(!next){setPipeDraft(null);setPipeHover(null);}return next;});}} active={pipePen} pressed={pipePen}><PipePenIcon/></Tool><span className="divider"/><Tool title="Sol paneli aç / kapat" onClick={()=>setShowLibrary(!showLibrary)} active={showLibrary} pressed={showLibrary}><PanelLeftOpen/></Tool><Tool title="Özellikleri aç / kapat" onClick={()=>setShowInspector(!showInspector)} active={showInspector} pressed={showInspector}><Layers/></Tool><Tool title="Odak modu" onClick={()=>setFocus(!focus)} active={focus} pressed={focus}><Maximize/></Tool><span className="divider"/><Tool title="Geri al" onClick={undo} disabled={!history.length}><Undo2/></Tool><Tool title="Yinele" onClick={redo} disabled={!future.length}><Redo2/></Tool><span className="divider"/><Tool title="Kopyala" onClick={duplicate} disabled={!selection.length}><Copy/></Tool><Tool title="Sil" onClick={remove} disabled={!selection.length}><Trash2/></Tool><Tool title="Seçimi ekipman tipi olarak kaydet" onClick={openTypeBuilder} disabled={!selection.length}><Blocks/></Tool><Tool title="Ekranı SVG olarak indir" onClick={downloadSvg}><Download/></Tool><Tool title="Izgara" onClick={()=>setGrid(!grid)} active={grid} pressed={grid}><Grid2X2/></Tool><Tool title="Uç uca eklerken boru kalınlığına göre boyutlandır" onClick={()=>setAutoFit(!autoFit)} active={autoFit} pressed={autoFit}><Ruler/></Tool><span className="save-state">{saving?'Kaydediliyor…':saveText}</span><button type="button" className="btn small" onClick={()=>void save()} disabled={saving||!dirty}><Save size={14}/>Kaydet</button>{user.role==='admin'&&<button type="button" className="btn primary small" onClick={()=>void publish()}><Upload size={14}/>Yayınla</button>}</>:<><Tool title="Uzaklaştır" onClick={()=>setZoom(Math.max(.25,zoom-.1))}><ZoomOut/></Tool><span className="small">{Math.round(zoom*100)}%</span><Tool title="Yakınlaştır" onClick={()=>setZoom(Math.min(2,zoom+.1))}><ZoomIn/></Tool><Tool title="Tam ekran" onClick={()=>void enterFullscreen()}><Maximize/></Tool></>}</div></div>
   {preview&&<><div className="preview-banner"><span>ÖNİZLEME · Saha komutu gönderilmez.</span><div><button onClick={()=>setSimPanel(!simPanel)}>{simPanel?'Senaryoları kapat':'Arıza senaryoları'}</button><button onClick={()=>{const on=!simOn;setSimOn(on);setSimulation(Object.fromEntries(config.tags.map(t=>[t.id,t.dataType==='bool'?on:on?75:0])));}}>{simOn?'Simülasyonu durdur':'Çalışma durumunu göster'}</button></div></div>{simPanel&&<div className="simulation-panel"><div><strong>Etiket simülasyonu</strong><span className="small muted">Değer, geri bildirim ve kalite birbirinden bağımsızdır; fiziksel sürücüye yazılmaz.</span></div><div className="simulation-actions"><button className="btn small" onClick={()=>faultAll('good')}>Tümü güncel</button><button className="btn small" onClick={()=>faultAll('stale')}>Tümü bayat</button><button className="btn small" onClick={()=>faultAll('bad')}>Protokol hatası</button></div>{screenTags().map(t=>{const value=simulation[t.id]??(t.dataType==='bool'?false:0),quality=simQuality[t.id]||'good';return <div className="simulation-row" key={t.id}><strong>{t.code}</strong>{t.dataType==='bool'?<select aria-label={t.code+' simüle değer'} value={String(value)} onChange={e=>setSimValue(t.id,e.target.value==='true')}><option value="true">Açık</option><option value="false">Kapalı</option></select>:<input type="number" aria-label={t.code+' simüle değer'} value={value as number} onChange={e=>setSimValue(t.id,Number(e.target.value)||0)}/>}<select aria-label={t.code+' veri kalitesi'} value={quality} onChange={e=>setSimQualityFor(t.id,e.target.value as typeof quality)}><option value="good">Güncel</option><option value="stale">Bayat</option><option value="bad">Protokol hatası</option><option value="unknown">Bilinmiyor</option></select></div>})}<div className="simulation-save"><input value={scenarioName} onChange={e=>setScenarioName(e.target.value)} placeholder="Senaryo adı"/><button className="btn small primary" onClick={()=>void saveScenario()}>Senaryoyu kaydet</button>{scenarios.map(s=><button className="btn small" key={s.name} onClick={()=>applyScenario(s.name)}>{s.name}</button>)}</div></div>}</>}
   {newPublication&&<div className="warning publication-bar" role="status">
    <span>Bu ekranın yeni bir yayını var (v{live_record.publishedVersion}{config.revision!==snapshot.configRevision?' · yeni yapılandırma v'+config.revision:''}). Gördüğünüz belge v{snapshot.publishedVersion}; komutlar da bu belgeye göre gönderilir.</span>
    <button className="btn small primary" onClick={adoptSnapshot}>Yeni yayına geç</button>
   </div>}
   {!editor&&!preview&&!view.published&&<div className="warning">Bu ekran henüz yayınlanmadı. Önce tasarım stüdyosundan yayınlayın.</div>}
   {conflict&&(()=>{const d=screenDelta(current.current,conflict.draft);return <div className="warning conflict-bar" role="alert">
    <div><strong>Taslak başka oturumda değişti{conflict.updatedBy?' ('+conflict.updatedBy+')':''}.</strong> Çalışmanız duruyor; otomatik kaydetme durduruldu.
     <p className="small">Sunucudaki sürüm v{conflict.version}{conflict.updatedAt?' · '+new Date(conflict.updatedAt).toLocaleString('tr-TR'):''} · Sizinkine göre {d.added} yeni, {d.removed} silinmiş, {d.changed} değişmiş nesne{d.equipment?' · '+d.equipment+' ekipman farkı':''}.</p></div>
    <div className="conflict-actions">
     <button className="btn small" onClick={()=>void resolveConflict('download')}>Kopyamı indir</button>
     <button className="btn small" onClick={()=>void resolveConflict('theirs')}>Sunucudaki taslağı al</button>
     <button className="btn primary small" onClick={()=>void resolveConflict('mine')} disabled={saving}>Benim taslağımı kaydet</button>
    </div></div>;})()}
   <div className="canvas-viewport" ref={viewport} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const backdropKey=e.dataTransfer.getData('scada-backdrop');if(editor&&backdropKey){const rect=canvas.current!.getBoundingClientRect();addBackdrop(backdropKey,Math.max(0,Math.round((e.clientX-rect.left)/zoom/10)*10),Math.max(0,Math.round((e.clientY-rect.top)/zoom/10)*10));return;}const equipmentType=e.dataTransfer.getData('scada-equipment-type');if(editor&&equipmentType){const rect=canvas.current!.getBoundingClientRect();addEquipmentInstance(equipmentType,Math.max(0,Math.round((e.clientX-rect.left)/zoom)),Math.max(0,Math.round((e.clientY-rect.top)/zoom)));return;}const equipment=e.dataTransfer.getData('scada-equipment');if(editor&&equipment){const rect=canvas.current!.getBoundingClientRect();addEquipment(equipment,Math.max(0,Math.round((e.clientX-rect.left)/zoom)),Math.max(0,Math.round((e.clientY-rect.top)/zoom)));return;}const t=e.dataTransfer.getData('scada-symbol') as Widget['type'];if(editor&&symbolTypes.includes(t)){const rect=canvas.current!.getBoundingClientRect();add(t,Math.max(0,Math.round((e.clientX-rect.left)/zoom/10)*10),Math.max(0,Math.round((e.clientY-rect.top)/zoom/10)*10));}}}>
    {full&&<><button className="fs-handle" aria-label="Ekran listesini aç" title="Ekranlar" onClick={()=>setDrawer(true)}><PanelLeftOpen size={18}/></button>
     <button className="fs-exit" aria-label="Tam ekrandan çık" title="Tam ekrandan çık (Esc)" onClick={exitFullscreen}><Minimize2 size={17}/></button>
     <div className="fs-scale-controls" role="group" aria-label="Tam ekran ölçeği"><button className="btn" aria-label="Uzaklaştır" onClick={()=>changeFullScale(Math.max(.2,zoom-.1))}>−</button><label>Ölçek <input aria-label="Tam ekran ölçeği" type="range" min="20" max="400" step="5" value={Math.round(zoom*100)} onChange={e=>changeFullScale(Number(e.target.value)/100)}/></label><output>{Math.round(zoom*100)}%</output><button className="btn" aria-label="Yakınlaştır" onClick={()=>changeFullScale(Math.min(4,zoom+.1))}>+</button><button className="btn" onClick={()=>changeFullScale(1)}>%100</button><button className="btn" aria-pressed={fullScale===null} onClick={()=>changeFullScale(null)}>Sığdır</button></div>
     {drawer&&<div className="fs-backdrop" onPointerDown={()=>setDrawer(false)}/>}
     <aside className={'fs-drawer '+(drawer?'open':'')} aria-hidden={!drawer}>
      <div className="fs-drawer-head"><Monitor size={16}/><span>EKRANLAR</span><button aria-label="Kapat" onClick={()=>setDrawer(false)}><X size={15}/></button></div>
      <div className="fs-screens">{records.map(r=>
       <button key={r.id} className={r.id===view.id?'current':''} onClick={()=>jump(r.id)}>
        <span className="screen-dot"/><span className="fs-name">{r.name}</span>
        {r.publishedVersion===0&&<small>Taslak</small>}</button>)}</div>
      <button className="fs-drawer-exit" onClick={exitFullscreen}><Minimize2 size={15}/>Tam ekrandan çık</button>
     </aside></>}
    <div className="canvas-scale" style={{width:screen.width*zoom,height:screen.height*zoom}}><div ref={canvas} data-theme={surfaceTheme(screen.background,theme)} className={'canvas '+(editor&&grid?'grid ':'')+(editor&&pipePen?'pipe-pen-active ':'')+(screen.symbolStyle==='detailed'?'sym-detailed':'')} style={{width:screen.width,height:screen.height,transform:`scale(${zoom})`,backgroundColor:screen.background||undefined,backgroundSize:`${screen.gridSize}px ${screen.gridSize}px`}} onPointerDown={bandDown} onPointerMove={bandMove} onPointerUp={bandUp} onPointerCancel={bandUp} onDoubleClick={()=>{if(editor&&pipePen&&pipeDraft&&pipeDraft.points.length>=2)finishPipeDraft(pipeDraft.points,pipeDraft.startSnap,null);}} onContextMenu={e=>openMenu(e,null)}>
     {(!view.published&&!editor&&!preview)?null:screen.widgets.filter(w=>!(editor&&hiddenLayers.includes(w.id))).map(w=>{
      const sample=live.samples[w.tagId],numericTag=config.tags.find(t=>t.id===w.tagId)?.dataType!=='bool';const value=preview?(simulation[w.tagId]??(numericTag?0:false)):editor?(numericTag?0:false):sample?.value;
      const rawQuality=preview?(simQuality[w.tagId]||'good'):editor?'good':sample?.quality||'unknown';
      const readings=Object.fromEntries([...w.parts.filter(p=>p.tagId),...(w.bindings||[]).filter(b=>b.tagId),...w.details.filter(d=>d.kind==='value'&&d.tagId).map(d=>({tagId:d.tagId}))].map(p=>[p.tagId,preview?{value:simulation[p.tagId]??false,quality:simQuality[p.tagId]||'good'}:editor?{value:false,quality:'good'}:{value:live.samples[p.tagId]?.value??null,quality:live.samples[p.tagId]?.quality||'unknown'}]));// Gorunurluk uc durumlu: goster / gizle / bilinmiyor. Bilinmiyorda nesne gizlenmez, kalite rozetiyle gosterilir.
      const samplesFor=preview?Object.fromEntries(Object.entries(simulation).map(([id,v])=>[id,{value:v,quality:(simQuality[id]||'good') as Sample['quality'],receivedAt:Date.now(),sampledAt:Date.now(),sequence:0}])):live.samples;
      const condition=w.visibleCondition?(editor?true:evaluateCondition(w.visibleCondition,samplesFor)):null;
      const visibleKnown=w.visibleCondition?condition!==null:(!w.visibleTagId||preview||editor||live.samples[w.visibleTagId]?.quality==='good');
      const visible=w.visibleCondition?(condition===null?true:condition)
       :(!w.visibleTagId||!visibleKnown||(preview?simulation[w.visibleTagId]:live.samples[w.visibleTagId]?.value)===w.visibleWhen);
      const quality=visibleKnown?rawQuality:'unknown';
      const alarmTone=!editor&&!preview?alarmRing(w):'';
      /* K06: "veri yok" tek bir gri degildir. Hic okunmadi / eskidi / cihaz
       * kotu deger bildirdi ayri seylerdir ve operatorun tepkisi farklidir. */
      /* K07: dinamik sunum. Deger okunamiyorsa tasarim degeri kullanilir;
       * nesne uydurma bir aciya donmez ya da gorunmez olmaz. */
      const bindingReadings=readBindings(w,readings);
      const dyn=editor?null:dynamicsOf(bindingReadings);
      /* G10: akis animasyonunun hizi olculen debiden gelir. Olcegin ustundeki
       * debi en hizli akistir; sifir ve okunamayan deger akisi durdurur. */
      const flowValue=editor?undefined:('flow' in bindingReadings.number?bindingReadings.number.flow:undefined);
      const flowSpeed=flowValue===undefined||flowValue===null?null
       :Math.max(.15,Math.min(4,Math.abs(flowValue)/(Math.abs(w.max-w.min)||1)*4));
      const dynRotation=dyn?.rotation??0;
      const dynOpacity=dyn&&dyn.opacity!==null?Math.max(0,Math.min(1,dyn.opacity/100)):1;
      const qualityTone=!editor&&!preview&&w.tagId&&quality!=='good'?'q-'+quality+' ':'';
      if(!editor&&!visible)return null;const selfControlled=['slider','keypad','pid','alarm-list','trend','data-table'].includes(w.type);const clickable=!editor&&!selfControlled&&(writesCommand(w)||['navigation','info'].includes(w.type)),reason=blockReason(w),isDisabled=reason!=='';
      return <div key={w.id} role={clickable?'button':undefined} tabIndex={clickable?0:undefined} aria-label={w.label} aria-disabled={isDisabled} title={reason||qualityHint(w,quality)||undefined} className={'canvas-widget '+(selectedSet.has(w.id)&&editor?'selected ':'')+(clickable?'clickable ':'')+(isDisabled?'disabled ':'')+(held===w.id?'held ':'')+alarmTone+qualityTone+(dyn?.blink?'dyn-blink ':'')} style={{left:w.x,top:w.y,width:w.width,height:w.height,transform:`rotate(${w.rotation+dynRotation}deg)`,opacity:(w.opacity??1)*dynOpacity*(editor&&!visible?.valueOf()?0.5:1),'--symbol-speed':flowSpeed??(w.animationSpeed||1),'--symbol-direction':w.reverse?'reverse':'normal','--symbol-sign':w.reverse?-1:1} as React.CSSProperties} onPointerDown={e=>{if(!editor&&w.action==='momentary'&&clickable&&!isDisabled)void pressStart(w);pointerDown(e,w);}} onPointerLeave={()=>{if(!editor&&w.action==='momentary')void pressEnd(w);}} onContextMenu={e=>{if(editor){openMenu(e,w);return;}if((w.bindings||[]).some(b=>b.tagId)||w.details.length){e.preventDefault();setInfo(w);}}} onPointerMove={move} onPointerUp={()=>{if(!editor&&w.action==='momentary')void pressEnd(w);endDrag();}} onPointerCancel={()=>{if(!editor&&w.action==='momentary')void pressEnd(w);endDrag();}} onClick={()=>{if(isDisabled){if(reason&&clickable)notify(reason);return;}void click(w);}} onKeyDown={e=>{if(clickable&&['Enter',' '].includes(e.key)){e.preventDefault();if(isDisabled){if(reason)notify(reason);return;}void click(w);}}}>
       {(()=>{const st=!editor&&!preview?ownStatus(w):null;return st?<div className={'command-state '+st.tone} role="status">{st.text}</div>:null;})()}<div className={'symbol-orientation'+(w.flipX?' flip-x':'')+(w.flipY?' flip-y':'')} style={{width:'100%',height:'100%',transform:`scale(${w.flipX?-1:1}, ${w.flipY?-1:1})`}}><Symbol w={styledWidget({...w,unit:w.unit||config.tags.find(t=>t.id===w.tagId)?.unit||''},screen.symbolStyle,surfaceTheme(screen.background,theme))} value={value} quality={quality} samples={readings} live={symbolLive}/></div>{editor&&selection.length<2&&selectedSet.has(w.id)&&!w.locked&&<><div className="rotate-handle" title="Döndür · Shift ile 15° adım" aria-label="Döndür" onPointerDown={e=>pointerDown(e,w,'rotate')}><RotateCw size={11}/></div>{handleDirections.map(dir=><div key={dir} className={'resize-handle '+dir} title={handleLabels[dir]} aria-label={handleLabels[dir]} onPointerDown={e=>pointerDown(e,w,'resize',dir)}/>)}</>}
      </div>;
     })}
     {editor&&selection.length>1&&(()=>{const box=selectionBox(screen.widgets.filter(w=>selectedSet.has(w.id)));if(!box)return null;
      return <div className="selection-frame" style={{left:box.x,top:box.y,width:box.width,height:box.height}} onPointerMove={move} onPointerUp={endDrag} onPointerCancel={endDrag}>
       {handleDirections.map(dir=><span key={dir} className={'resize-handle '+dir} title={'Seçimi '+handleLabels[dir].toLocaleLowerCase('tr')} onPointerDown={e=>groupDown(e,dir)}/>)}</div>;})()}
     {editor&&(ports||pipePen)&&screen.widgets.filter(w=>hasPorts(w.type)&&!hiddenLayers.includes(w.id)).flatMap(w=>portsOf(w).map((p,i)=><span key={w.id+'-p'+i} className="port-dot" style={{left:p.x,top:p.y}}/>))}
     {editor&&snapped&&<span className="port-dot snapped" style={{left:snapped.x,top:snapped.y}}/>}
     {editor&&pipePen&&pipeHover?.snap&&<span className="port-dot snapped" style={{left:pipeHover.snap.x,top:pipeHover.snap.y}}/>}
     {editor&&pipePen&&pipeDraft&&(()=>{const previewPts=pipeHover?[...pipeDraft.points,...routeOrthogonalLeg(pipeDraft.points[pipeDraft.points.length-1],pipeHover.point,pipeDraft.lastAxis,pipeHover.shift).slice(1)]:pipeDraft.points;
      const dPath='M'+previewPts.map(p=>`${p.x} ${p.y}`).join(' L');
      return <svg className="pipe-pen-preview" width={screen.width} height={screen.height} viewBox={`0 0 ${screen.width} ${screen.height}`} aria-hidden="true">
       <path className="pipe-pen-casing" d={dPath} fill="none"/>
       <path className="pipe-pen-guide" d={dPath} fill="none"/>
       {previewPts.map((pt,idx)=><circle key={idx} cx={pt.x} cy={pt.y} r={idx===0?5:3.5} className={idx===0?'pipe-pen-anchor':'pipe-pen-vertex'}/>)}
      </svg>;})()}
     {editor&&guides.x.map(x=><div key={'gx'+x} className="guide vertical" style={{left:x}}/>)}
     {editor&&guides.y.map(y=><div key={'gy'+y} className="guide horizontal" style={{top:y}}/>)}
     {editor&&band&&<div className="marquee" style={{left:band.x,top:band.y,width:band.w,height:band.h}}/>}
     {editor&&screen.widgets.length===0&&!pipePen&&<div className="empty-canvas"><MousePointer2 size={34}/><h3>İlk sembolünüzü yerleştirin</h3><p>Kütüphaneden sürükleyin veya bir sembole tıklayın.</p></div>}
    </div>
    {editor&&selection.length>1&&!pipePen&&!isDragging&&(()=>{const box=selectionBox(screen.widgets.filter(w=>selectedSet.has(w.id)));if(!box)return null;
     const half=Math.min(216,Math.max(0,(screen.width*zoom)/2));
     const left=Math.max(half,Math.min(Math.max(half,screen.width*zoom-half),(box.x+box.width/2)*zoom));
     const top=box.y*zoom>=48?box.y*zoom-42:(box.y+box.height)*zoom+10;
     const allGrouped=picked.length>0&&!!picked[0].groupId&&picked.every(w=>w.groupId===picked[0].groupId);
     return <div className="floating-align-bar" role="toolbar" aria-label="Çoklu seçim hizalama araçları" style={{left,top}} onPointerDown={e=>e.stopPropagation()}>
      <Tool title="Sola hizala" onClick={()=>arrange('left')}><AlignLeft/></Tool>
      <Tool title="Yatayda ortala" onClick={()=>arrange('center')}><AlignCenter/></Tool>
      <Tool title="Sağa hizala" onClick={()=>arrange('right')}><AlignRight/></Tool>
      <span className="divider"/>
      <Tool title="Üste hizala" onClick={()=>arrange('top')}><AlignVerticalJustifyStart/></Tool>
      <Tool title="Dikeyde ortala" onClick={()=>arrange('middle')}><AlignVerticalJustifyCenter/></Tool>
      <Tool title="Alta hizala" onClick={()=>arrange('bottom')}><AlignVerticalJustifyEnd/></Tool>
      <span className="divider"/>
      <button type="button" className="tool" title="Yatay eşit aralık" aria-label="Yatay eşit aralık" disabled={selection.length<3} onClick={()=>arrange('space')}>↔</button>
      <button type="button" className="tool" title="Dikey eşit aralık" aria-label="Dikey eşit aralık" disabled={selection.length<3} onClick={()=>arrange('space-v')}>↕</button>
      <span className="divider"/>
      <button type="button" className="tool text-tool" title="Aynı genişlik" aria-label="Aynı genişlik" onClick={()=>change({...current.current,widgets:matchSize(current.current.widgets,selection,'width')})}>G=</button>
      <button type="button" className="tool text-tool" title="Aynı yükseklik" aria-label="Aynı yükseklik" onClick={()=>change({...current.current,widgets:matchSize(current.current.widgets,selection,'height')})}>Y=</button>
      <span className="divider"/>
      <Tool title={allGrouped?'Grubu çöz':'Grupla'} onClick={()=>group(allGrouped)}><>{allGrouped?<Ungroup/>:<Group/>}</></Tool>
      <Tool title="Çoğalt (Ctrl+D)" onClick={duplicate}><Copy/></Tool>
      <Tool title="Sil (Delete)" onClick={remove}><Trash2/></Tool>
     </div>;})()}
    </div>
   </div>
   <div className="canvas-footer"><span>{editor?(pipePen?'Boru kalemi · Port veya tuvale tıklayın · Shift köşe yönü · Enter/çift tık bitir · Esc iptal':`${selection.length} nesne seçili · ${screen.widgets.length} nesne · uçlar otomatik birleşir${autoFit?' ve kalınlığa göre boyutlanır':''} (Alt ile kapat)`):'Canlı değerler · Gönderilen komutlar geri okuma ile doğrulanır'}</span><div>{editor&&<><button type="button" aria-label="Uzaklaştır" title="Uzaklaştır" onClick={()=>setZoom(Math.max(.25,zoom-.1))}>−</button><span>{Math.round(zoom*100)}%</span><button type="button" aria-label="Yakınlaştır" title="Yakınlaştır" onClick={()=>setZoom(Math.min(2,zoom+.1))}>+</button><button type="button" title="Tuvali pencereye sığdır" onClick={()=>{if(viewport.current)setZoom(Math.min(1,(viewport.current.clientWidth-48)/screen.width));}}>Sığdır</button></>}{editor?<div className="resolution-picker" ref={resRef}><button ref={resTriggerRef} type="button" className="resolution-trigger" aria-label="Hedef ekran çözünürlüğü" aria-expanded={resOpen} onClick={()=>setResOpen(o=>!o)}><span>{screen.width} × {screen.height}</span><ChevronDown size={12}/></button>{resOpen&&<div className="resolution-popover" role="dialog" aria-label="Hedef çözünürlük"><div className="resolution-popover-title">Hedef çözünürlük</div><div className="resolution-list">{['1024x768','1280x720','1366x768','1920x1080','1920x1200','2560x1440','3840x2160','1080x1920'].map(size=>{const [rw,rh]=size.split('x').map(Number),active=screen.width===rw&&screen.height===rh;return <button key={size} type="button" className={active?'active':''} onClick={()=>{editorFitted.current=false;change({...screen,width:rw,height:rh});setResOpen(false);resTriggerRef.current?.focus();}}>{rw} × {rh}</button>;})}</div><button type="button" className="resolution-current" onClick={()=>{editorFitted.current=false;change({...screen,width:Math.max(400,Math.min(4000,window.screen.width)),height:Math.max(300,Math.min(3000,window.screen.height))});setResOpen(false);resTriggerRef.current?.focus();}}>Bu ekranı kullan · {window.screen.width} × {window.screen.height}</button></div>}</div>:<span>{screen.width} × {screen.height}</span>}</div></div>
  </section>
  {editor&&showInspector&&<aside className="inspector">{compact?<div className="drawer-bar"><span>Nesne özellikleri</span><button className="tool" aria-label="Özellikleri kapat" title="Kapat (Esc)" onClick={()=>setShowInspector(false)}><X size={14}/></button></div>:<div className="panel-title">Nesne özellikleri</div>}<div className="inspector-tabs" role="tablist" aria-label="Özellik bölümü" onKeyDown={e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();
   const order=['appearance','binding','layout'] as const;
   const idx=order.indexOf(inspectorTab);
   const nextIdx=e.key==='Home'?0:e.key==='End'?order.length-1:(idx+(e.key==='ArrowRight'?1:-1)+order.length)%order.length;
   setInspectorTab(order[nextIdx]);
   e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[nextIdx]?.focus();
  }}>{(['appearance','binding','layout'] as const).map(t=><button type="button" key={t} role="tab" tabIndex={inspectorTab===t?0:-1} aria-selected={inspectorTab===t} onClick={()=>setInspectorTab(t)}>{{appearance:'Görünüm',binding:'Veri',layout:'Yerleşim'}[t]}</button>)}</div>{selected?<><div className="inspector-heading"><strong>{multi?(commonValue(picked,'type')?labels[selected.type]:'Karma seçim'):labels[selected.type]}</strong><span>{multi?selection.length+' nesne seçili':(()=>{const g=symbolGroups.find(g=>(g.types as readonly string[]).includes(selected.type));return g?groupTitle(g.name,language):'Nesne ayarları';})()}</span></div><Field label="Etiket / başlık"><input value={multi?'':selected.label} disabled={multi} placeholder={multi?'Çoklu seçimde tek tek düzenlenir':undefined} title={multi?'Etiket her nesneye özeldir; tek nesne seçerek değiştirin.':undefined} onChange={e=>update(selected.id,{label:e.target.value})}/></Field>{inspectorTab==='layout'&&!multi&&(()=>{const links=linksOf(screen,selected.id);return <div className="link-panel"><div className="panel-title">Uç bağlantıları · {links.length}</div>{!links.length&&<p className="small muted">Bu nesnenin ucu başka bir nesneye yapışık değil.</p>}{links.map(l=>{const otherId=l.fromWidgetId===selected.id?l.toWidgetId:l.fromWidgetId;const other=screen.widgets.find(w=>w.id===otherId);return <div className="link-row" key={l.id}><button className="link-jump" onClick={()=>setSelection([otherId])} title="Bağlı nesneyi seç">{other?(other.label||labels[other.type]):'Nesne bulunamadı'}</button><button className="tool" title="Bağlantıyı kaldır" onClick={()=>change(removeLink(current.current,l.id))}><Unlink2 size={12}/></button></div>;})}</div>;})()}{inspectorTab==='layout'&&<><div className="field-grid">{(['x','y','width','height','rotation'] as const).map(k=><Field key={k} label={{x:'X',y:'Y',width:'Genişlik',height:'Yükseklik',rotation:'Dönüş °'}[k]}>{multi?(()=>{const v=k==='x'||k==='y'?(pickedBox?pickedBox[k]:undefined):commonValue(picked,k);return <input type="number" value={v??''} placeholder="karışık" title={k==='x'||k==='y'?'Seçimin '+(k==='x'?'sol':'üst')+' kenarı; nesneler birlikte taşınır':'Tüm seçili nesnelere uygulanır'} onChange={e=>{if(e.target.value==='')return;const n=Number(e.target.value);if(k==='x'||k==='y')change({...current.current,widgets:moveSelectionTo(current.current.widgets,selection,k,n)});else styleSelection({[k]:n});}}/>;})():<input type="number" value={selected[k]} onChange={e=>update(selected.id,{[k]:Number(e.target.value)})}/>}</Field>)}<Field label="Renk"><input type="color" value={multi?(commonValue(picked,'color')??selected.color):selected.color} onChange={e=>multi?styleSelection({color:e.target.value}):update(selected.id,{color:e.target.value})}/></Field></div>{multi&&<Hint>Çoklu seçim: X/Y seçimi bir bütün olarak taşır; boyut, dönüş ve renk tüm seçili nesnelere uygulanır. Kilitli nesneler değişmez.</Hint>}
   </>}{inspectorTab==='appearance'&&<ObjectAppearance widget={selected} onChange={styleSelection} symbolStyle={screen.symbolStyle} surface={surfaceTheme(screen.background,theme)}/>}{inspectorTab==='binding'&&selection.length>1&&<div className="binding-suggest bulk"><p><strong>{selection.length} nesne seçili.</strong> Adı ve etiket kodu eşleşen nesnelere ana etiket ve saha bağları önerilir; belirsiz eşleşme atlanır, mevcut bağlar korunur.</p><button className="btn small wide" onClick={bulkSuggest}>Seçili nesnelere önerileri uygula</button></div>}{inspectorTab==='binding'&&multi&&<Hint>Etiket ve komut bağları her nesneye özeldir; tek nesne seçerek düzenleyin.</Hint>}{inspectorTab==='binding'&&!multi&&<>{selected.equipmentId?<EquipmentPanel instance={(screen.equipment||[]).find(e=>e.id===selected.equipmentId)!} type={equipmentTypes.find(t=>t.id===(screen.equipment||[]).find(e=>e.id===selected.equipmentId)?.typeId)} config={config} onBinding={(key,value)=>bindEquipment(selected.equipmentId,key,value)} onRename={name=>renameEquipment(selected.equipmentId,name)} onDissolve={()=>dissolveEquipment(selected.equipmentId)} drift={equipmentDrift(screen,equipmentTypes).find(d=>d.instanceId===selected.equipmentId)} onUpgrade={()=>upgradeInstance(selected.equipmentId)} onRevise={()=>void reviseType(selected.equipmentId)}/>:<Field label="Durum / değer etiketi"><SearchSelect ariaLabel="Durum / değer etiketi" value={selected.tagId} emptyLabel="Bağlantı yok" placeholder="Etiket seçin" options={tagPickOptions(config)} onChange={v=>update(selected.id,{tagId:v})}/></Field>}{(()=>{const m=suggestMainTag(selected,config);return m?<div className="binding-suggest compact"><p>Nesne adıyla eşleşen etiket: <strong>{m.tagCode}</strong></p><button className="btn small" onClick={()=>update(selected.id,{tagId:m.tagId})}>Bağla</button></div>:null;})()}
   {selected.type==='selector'&&!selected.equipmentId&&<><Field label="Konum yazma komutu (isteğe bağlı)"><SearchSelect ariaLabel="Konum yazma komutu" value={selected.commandId} emptyLabel="Komut yok · salt gösterge" placeholder="Komut seçin" options={commandPickOptions(config,c=>c.tagIds.length===1&&config.tags.find(t=>t.id===c.tagIds[0])?.dataType!=='bool')} onChange={v=>{const c=config.commands.find(x=>x.id===v);update(selected.id,{commandId:v,...(v?{mode:'analog',tagId:c?.feedbackTagIds[0]||''}:{})});}}/></Field><Hint>Komut bağlıysa her tıkta bir sonraki konuma geçilir ve o konumun değeri yazılır. Konum geri bildirimi okunamıyorsa kumanda kapalıdır; komut yoksa sembol salt göstergedir.</Hint></>}{['numeric-input','slider','keypad','pid'].includes(selected.type)&&!selected.equipmentId&&<><Field label="Sayısal yazma komutu"><SearchSelect ariaLabel="Sayısal yazma komutu" value={selected.commandId} emptyLabel="Komut seçin" placeholder="Komut seçin" options={commandPickOptions(config,c=>c.tagIds.length===1&&config.tags.find(t=>t.id===c.tagIds[0])?.dataType!=='bool')} onChange={v=>{const c=config.commands.find(x=>x.id===v);update(selected.id,{commandId:v,tagId:c?.feedbackTagIds[0]||''});}}/></Field><Hint>Birim ve hassasiyet hedef etiketten gelir. Sayısal komut yoksa önce Etiketler'de holding-register, Komutlar'da yazma komutu tanımlayın.</Hint>
   <div className="field-grid"><Field label="Yazma alt sınırı"><input type="number" value={selected.writeMin??''} placeholder="Etiketin sınırı" onChange={e=>update(selected.id,{writeMin:e.target.value===''?null:Number(e.target.value)})}/></Field><Field label="Yazma üst sınırı"><input type="number" value={selected.writeMax??''} placeholder="Etiketin sınırı" onChange={e=>update(selected.id,{writeMax:e.target.value===''?null:Number(e.target.value)})}/></Field></div>
   <Hint>Boş bırakılırsa etiketin kendi sınırları geçerli. Etiketin sınırını genişletemez, yalnız daraltır. Sunucu da aynı aralığı zorlar; aralık dışı değer arayüz atlansa bile sahaya gitmez.</Hint></>}{isButton(selected.type)&&!selected.equipmentId&&<><Field label="Yazma komutu"><SearchSelect ariaLabel="Yazma komutu" value={selected.commandId} emptyLabel="Komut seçin" placeholder="Komut seçin" options={commandPickOptions(config)} onChange={v=>{const c=config.commands.find(x=>x.id===v);update(selected.id,{commandId:v,...(selected.action==='toggle'?{tagId:c?.feedbackTagIds[0]||''}:{})});}}/></Field><Field label="İşlem"><select value={selected.action} onChange={e=>update(selected.id,{action:e.target.value as Widget['action'],...(e.target.value==='toggle'?{tagId:config.commands.find(c=>c.id===selected.commandId)?.feedbackTagIds[0]||''}:{}),...(e.target.value==='momentary'?{pulseMs:10000}:e.target.value==='pulse'?{pulseMs:500}:{})})}><option value="on">Aç (true)</option><option value="off">Kapat (false)</option><option value="set">Sabit değer yaz</option><option value="toggle">Aç / kapa · her basışta değiştir</option><option value="momentary">Çek bas · basılı tuttukça açık</option><option value="pulse">Darbe · süre sonunda kendi kapanır</option></select></Field>{selected.action==='toggle'&&<><Hint>Metin PLC geri bildirimini gösterir. Basışta tersi yazılır; yanıt beklenirken tekrar gönderilmez.</Hint><Field label="Açık durum metni"><input value={selected.onText} onChange={e=>update(selected.id,{onText:e.target.value})}/></Field><Field label="Kapalı durum metni"><input value={selected.offText} onChange={e=>update(selected.id,{offText:e.target.value})}/></Field></>}{selected.action==='set'&&<Field label="Yazılacak değer"><input type="number" value={selected.setValue} onChange={e=>update(selected.id,{setValue:Number(e.target.value)})}/></Field>}{['momentary','pulse'].includes(selected.action)&&<><Field label={selected.action==='momentary'?'Güvenlik · en geç kapanma (ms)':'Darbe süresi (ms)'}><input type="number" min={50} max={60000} step={50} value={selected.pulseMs} onChange={e=>update(selected.id,{pulseMs:Math.max(50,Math.min(60000,Number(e.target.value)||500))})}/></Field><Hint>{selected.action==='momentary'?'Basılı tutuldukça true, parmak kalkınca false. Sekme gizlenir veya odak giderse çıkış hemen, hiçbir şey olmazsa en geç bu süre sonunda düşer. Bırakma gönderilemezse kırmızı uyarı çıkar. Emniyet fonksiyonu değildir; kalıcı emniyet PLC tarafında kalır.':'Tek basışta true, bu süre sonunda false. Kendini tutan (latch) devrelerde bunu seçin; çıkış basılı kalmaz.'}</Hint></>}</>}
   {panelSpec(selected.type).setpoint&&!selected.equipmentId&&<Field label="Setpoint etiketi · hedef değer (isteğe bağlı)"><SearchSelect ariaLabel="Setpoint etiketi" value={selected.setpointTagId} emptyLabel="Setpoint yok" placeholder="Etiket seçin" options={tagPickOptions(config,t=>t.dataType!=='bool')} onChange={v=>update(selected.id,{setpointTagId:v})}/></Field>}
   {!selected.equipmentId&&<BindingsPanel widget={selected} config={config} onChange={bindings=>update(selected.id,{bindings})}/>}
   {selected.type==='trend'&&<><Field label="Zaman penceresi"><select value={selected.timeWindowMin} onChange={e=>update(selected.id,{timeWindowMin:Number(e.target.value)})}>{[5,15,30,60,120,240,480,1440].map(n=><option key={n} value={n}>{n<60?n+' dakika':(n/60)+' saat'}</option>)}</select></Field><p className="small muted">Y ekseni Görünüm sekmesindeki alt/üst ölçekten gelir; farklı birimleri aynı eksende üst üste bindirmek operatörü yanıltır. Kalemin çizilebilmesi için etikette geçmiş kaydının açık olması gerekir.</p></>}
   {['alarm-band','alarm-list'].includes(selected.type)&&<><Field label="Önem süzgeci"><select value={selected.severityFilter} onChange={e=>update(selected.id,{severityFilter:e.target.value as Widget['severityFilter']})}><option value="all">Tümü</option><option value="critical">Yalnız kritik</option><option value="warning">Yalnız uyarı</option><option value="info">Yalnız bilgi</option></select></Field><p className="small muted">Alarm nesneleri olay akışından beslenir; ayrı etiket bağlanmaz. Tasarım ve simülasyonda veri kaynağı bağlanmaz, nesne boş halini gösterir.</p></>}
   {selected.type==='emergency-stop'&&<p className="parts-hint">Bu sembol sahadaki acil durdurma devresinin <strong>durumunu gösterir</strong>; buradan komut gönderilmez ve emniyet fonksiyonu yerine geçmez. Emniyet, PLC/emniyet rölesi tarafında kalır.</p>}
   {selected.type==='navigation'&&<Field label="Hedef ekran"><select value={selected.targetScreenId} onChange={e=>update(selected.id,{targetScreenId:e.target.value})}><option value="">Ekran seçin</option>{records.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></Field>}
   <Field label="Görünürlük kuralı"><select value={selected.visibleCondition?'condition':'tag'} onChange={e=>update(selected.id,e.target.value==='condition'?{visibleCondition:{op:'and',terms:[{op:'bool',tagId:selected.visibleTagId||config.tags.find(t=>t.dataType==='bool')?.id||'',expected:selected.visibleWhen}]}}:{visibleCondition:null})}><option value="tag">Tek etiket</option><option value="condition">Çok etiketli koşul</option></select></Field>{selected.visibleCondition?<div className="condition-builder"><ConditionEditor node={selected.visibleCondition} config={config} depth={0} onChange={c=>update(selected.id,{visibleCondition:c})}/><p className="parts-hint">{explainCondition(selected.visibleCondition,config,live.samples)}</p><Hint>Koşulun girdisi bilinmiyorsa nesne gizlenmez; kalite rozetiyle gösterilir.</Hint></div>:<><Field label="Görünürlük etiketi"><SearchSelect ariaLabel="Görünürlük etiketi" value={selected.visibleTagId} emptyLabel="Her zaman görünür" placeholder="Etiket seçin" options={tagPickOptions(config,t=>t.dataType==='bool')} onChange={v=>update(selected.id,{visibleTagId:v})}/></Field>{selected.visibleTagId&&<Field label="Görünür olduğu değer"><select value={String(selected.visibleWhen)} onChange={e=>update(selected.id,{visibleWhen:e.target.value==='true'})}><option value="true">Açık</option><option value="false">Kapalı</option></select></Field>}</>}
   </>}{inspectorTab==='appearance'&&!multi&&selected.type==='image'&&<><Field label="Görsel dosyası"><label className="btn small upload"><Upload size={13}/>{uploading?'Yükleniyor…':'Bilgisayardan seç'}<input hidden type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" disabled={uploading} onChange={e=>{void pickImage(selected.id,e.target.files?.[0]);e.target.value='';}}/></label></Field><Field label="Yerleştirme"><select value={selected.fit} onChange={e=>update(selected.id,{fit:e.target.value as Widget['fit']})}><option value="contain">Sığdır (oranı koru)</option><option value="cover">Doldur (kırp)</option><option value="fill">Ger (oranı boz)</option></select></Field><button className="btn small wide" onClick={()=>void api<{src:string;bytes:number}[]>('/uploads').then(setLibrary).catch(e=>notify(e.message))}><Layers size={13}/>Yüklenen görseller</button>{library&&<div className="image-library">{library.length?library.map(i=><div key={i.src} className={'image-tile '+(selected.src===i.src?'selected':'')}><button className="pick" title={Math.round(i.bytes/1024)+' KB'} onClick={()=>update(selected.id,{src:i.src})}><img src={i.src} alt=""/></button>{user.role==='admin'&&<button className={'drop'+(dropArmed===i.src?' armed':'')} aria-label={dropArmed===i.src?'Silmeyi onayla':'Görseli sil'} title={dropArmed===i.src?'Kalıcı olarak silmek için tekrar tıklayın':'Görseli sunucudan sil'} onClick={()=>void removeImage(i.src)}>{dropArmed===i.src?'Sil?':<X size={11}/>}</button>}</div>):<p className="small muted">Henüz görsel yüklenmedi.</p>}</div>}</>}
   {inspectorTab==='binding'&&!multi&&['info','trend','data-table'].includes(selected.type)&&<><div className="parts-head"><span>{selected.type==='trend'?'TREND KALEMLERİ':selected.type==='data-table'?'TABLO SATIRLARI':'BİLGİ SATIRLARI'} · {selected.details.length}</span><button className="tool" title="Satır ekle" disabled={selected.details.length>=20} onClick={()=>update(selected.id,{details:[...selected.details,{kind:'value',tagId:config.tags[0]?.id||'',commandId:'',label:'',unit:'',decimals:-1,action:'on',setValue:0,onText:'AÇIK',offText:'KAPALI'}]})}><Plus size={13}/></button></div>
    {selected.details.map((d,i)=>{const patchDetail=(patch:Partial<Detail>)=>update(selected.id,{details:selected.details.map((x,n)=>n===i?{...x,...patch}:x)});
     return <div className="detail-row" key={i}>
      <div className="detail-head"><select aria-label="Satır türü" value={d.kind} onChange={e=>patchDetail({kind:e.target.value as Detail['kind']})}><option value="value">Değer göster</option><option value="command">Komut düğmesi</option></select>
       <button className="tool" title="Satırı kaldır" onClick={()=>update(selected.id,{details:selected.details.filter((_,n)=>n!==i)})}><Trash2 size={12}/></button></div>
      <input className="part-label" placeholder="Başlık" value={d.label} onChange={e=>patchDetail({label:e.target.value})}/>
      {d.kind==='value'?<><SearchSelect ariaLabel="Bilgi satırı etiketi" value={d.tagId} allowEmpty={false} placeholder="Etiket seçin" options={tagPickOptions(config)} onChange={v=>patchDetail({tagId:v})}/>
       <div className="field-grid"><input placeholder="Birim" value={d.unit} onChange={e=>patchDetail({unit:e.target.value})}/><select aria-label="Ondalık" value={d.decimals} onChange={e=>patchDetail({decimals:Number(e.target.value)})}><option value={-1}>Otomatik</option>{[0,1,2,3].map(n=><option key={n} value={n}>{n} basamak</option>)}</select></div></>
      :<><SearchSelect ariaLabel="Bilgi satırı komutu" value={d.commandId} emptyLabel="Komut seçin" placeholder="Komut seçin" options={commandPickOptions(config)} onChange={v=>{const cmd=config.commands.find(c=>c.id===v);patchDetail({commandId:v,...(d.action==='toggle'?{tagId:cmd?.feedbackTagIds[0]||''}:{})});}}/>
       <select aria-label="İşlem" value={d.action} onChange={e=>patchDetail({action:e.target.value as Detail['action'],...(e.target.value==='toggle'?{tagId:config.commands.find(c=>c.id===d.commandId)?.feedbackTagIds[0]||''}:{})})}><option value="on">Aç (true)</option><option value="off">Kapat (false)</option><option value="set" disabled={digitalCommand(config,d.commandId)}>Sabit değer yaz{digitalCommand(config,d.commandId)?' · yalnız analog komut':''}</option><option value="toggle">Aç / kapa</option></select>{d.action==='set'&&digitalCommand(config,d.commandId)&&<p className="field-warning" role="alert">Bu komut dijital (true/false). Sabit değer yazılamaz; Aç, Kapat veya Aç / kapa seçin.</p>}
       {d.action==='set'&&<input type="number" aria-label="Yazılacak değer" value={d.setValue} onChange={e=>patchDetail({setValue:Number(e.target.value)})}/>}
       {d.action==='toggle'&&<div className="field-grid"><input placeholder="Açık metni" value={d.onText} onChange={e=>patchDetail({onText:e.target.value})}/><input placeholder="Kapalı metni" value={d.offText} onChange={e=>patchDetail({offText:e.target.value})}/></div>}</>}
     </div>;})}
    <Hint>Operatör bilgi düğmesine basınca bu satırlar açılır: değer satırları canlı okumayı gösterir, komut satırları aynı doğrulamadan geçerek yazar.</Hint></>}
   {inspectorTab==='binding'&&!multi&&allowsStateRules(selected.type)&&<><Field label="Bağlama türü"><select value={selected.mode} onChange={e=>update(selected.id,{mode:e.target.value as Widget['mode']})}><option value="digital">Dijital · her kademe ayrı etiket</option><option value="analog">Analog · tek sayısal etiket + eşik</option></select></Field>{selected.mode==='analog'&&<Field label="Kural türü"><select value={selected.rangeMode} onChange={e=>update(selected.id,{rangeMode:e.target.value as Widget['rangeMode']})}><option value="threshold">Eşik · en yüksek uygun eşik</option><option value="range">Aralık · alt dahil, üst hariç</option></select></Field>}<div className="parts-head"><span>{selected.type==='tower-light'?'KUTUCUKLAR':'KADEMELER'} · {selected.parts.length}</span><button className="tool" title="Kademe ekle" disabled={selected.parts.length>=8} onClick={()=>update(selected.id,{parts:[...selected.parts,{tagId:'',label:String(selected.parts.length),color:'#208169',value:selected.parts.length,upper:null,expected:true}]})}><Plus size={13}/></button></div>{selected.parts.map((p,i)=><div className="part-row" key={i}><input className="part-label" value={p.label} placeholder={'Kademe '+i} aria-label={'Kademe '+i+' adı'} onChange={e=>patchPart(selected,i,{label:e.target.value})}/><input type="color" aria-label="Renk" value={p.color} onChange={e=>patchPart(selected,i,{color:e.target.value})}/>{selected.mode==='digital'?<SearchSelect ariaLabel="Kademe etiketi" value={p.tagId} emptyLabel="Etiket yok" placeholder="Etiket seçin" options={tagPickOptions(config,t=>t.dataType==='bool')} onChange={v=>patchPart(selected,i,{tagId:v})}/>:<input type="number" aria-label="Alt sınır / eşik" title="Bu değer dahil, buradan itibaren etkin" value={p.value} onChange={e=>patchPart(selected,i,{value:Number(e.target.value)})}/>}{selected.mode==='analog'&&selected.rangeMode==='range'&&<input type="number" aria-label="Üst sınır (hariç)" placeholder="Üst sınır yok" value={p.upper??''} onChange={e=>patchPart(selected,i,{upper:e.target.value===''?null:Number(e.target.value)})}/>} {selected.mode==='digital'&&<select aria-label="Beklenen sinyal" value={String(p.expected)} onChange={e=>patchPart(selected,i,{expected:e.target.value==='true'})}><option value="true">1 · Açık</option><option value="false">0 · Kapalı</option></select>}<button className="tool" title="Kuralı yukarı taşı" disabled={i===0} onClick={()=>{const parts=[...selected.parts];[parts[i-1],parts[i]]=[parts[i],parts[i-1]];update(selected.id,{parts});}}><ArrowUp size={12}/></button><button className="tool" title="Kuralı aşağı taşı" disabled={i===selected.parts.length-1} onClick={()=>{const parts=[...selected.parts];[parts[i+1],parts[i]]=[parts[i],parts[i+1]];update(selected.id,{parts});}}><ArrowDown size={12}/></button><button className="tool" title="Kademeyi kaldır" disabled={false} onClick={()=>update(selected.id,{parts:selected.parts.filter((_,n)=>n!==i)})}><Trash2 size={12}/></button></div>)}<Hint>{selected.mode==='digital'?'Kural sırası önceliktir; ilk eşleşen renk gösterilir. Bilinmeyen sinyalde durum bilinmiyor gösterilir. Sinyal kulesinde birden fazla kutucuk yanabilir.':'"Durum / değer etiketi" okunur; eşikte en yüksek uygun değer, aralıkta ilk eşleşen satır kullanılır. Üst sınır dahil değildir, boş üst sınır sınırsızdır.'}</Hint></>}
   {inspectorTab==='layout'&&<><div className="property-section">Boyut ve hizalama</div><div className="size-tools"><button disabled={selection.length<2} onClick={()=>change({...screen,widgets:matchSize(screen.widgets,selection,'width')})}>Aynı genişlik</button><button disabled={selection.length<2} onClick={()=>change({...screen,widgets:matchSize(screen.widgets,selection,'height')})}>Aynı yükseklik</button></div><p className="small muted">Seçili nesnenin 8 tutamağından boyutlandırın. Shift · en-boy oranını koru, Alt · merkezden büyüt/küçült, Ctrl + ok tuşları · klavyeyle boyutlandır.</p><div className="property-section">Döndür ve aynala</div><div className="inspector-tools"><Tool title="90° sola döndür (Shift+[)" onClick={()=>rotateSelection(-90)}><RotateCcw/></Tool><Tool title="90° sağa döndür (Shift+])" onClick={()=>rotateSelection(90)}><RotateCw/></Tool><Tool title="Yatay aynala (H)" onClick={()=>mirror('x')}><FlipHorizontal2/></Tool><Tool title="Dikey aynala (V)" onClick={()=>mirror('y')}><FlipVertical2/></Tool></div><div className="size-tools"><button onClick={()=>setRotation(0)}>Dönüşü sıfırla</button><button onClick={()=>styleSelection({flipX:false,flipY:false})}>Aynalamayı sıfırla</button></div><div className="size-tools">{[0,45,90,135,180,225,270,315].map(d=><button key={d} className={selected.rotation===d?'active':''} onClick={()=>setRotation(d)}>{d}°</button>)}</div><p className="small muted">Tutamağın üstündeki daireden serbest döndürün; Shift 15° adımlarla kilitler. Aynalama seçimi ortak eksende çevirir.</p><div className="inspector-tools"><Tool title="Sola hizala" onClick={()=>arrange('left')}><AlignLeft/></Tool><Tool title="Yatayda ortala" onClick={()=>arrange('center')}><AlignCenter/></Tool><Tool title="Sağa hizala" onClick={()=>arrange('right')}><AlignRight/></Tool><Tool title="Üste hizala" onClick={()=>arrange('top')}><AlignVerticalJustifyStart/></Tool><Tool title="Dikeyde ortala" onClick={()=>arrange('middle')}><AlignVerticalJustifyCenter/></Tool><Tool title="Alta hizala" onClick={()=>arrange('bottom')}><AlignVerticalJustifyEnd/></Tool><button className="tool" title="Yatay eşit aralık" onClick={()=>arrange('space')}>↔</button><button className="tool" title="Dikey eşit aralık" onClick={()=>arrange('space-v')}>↕</button><Tool title="Yapıştır (Ctrl+V)" onClick={paste}><ClipboardPaste/></Tool><Tool title="Grupla" onClick={()=>group()}><Group/></Tool><Tool title="Grubu çöz" onClick={()=>group(true)}><Ungroup/></Tool><Tool title="Öne getir" onClick={()=>layer(true)}><ArrowUp/></Tool><Tool title="Arkaya gönder" onClick={()=>layer(false)}><ArrowDown/></Tool><Tool title="Kilitle / aç" onClick={()=>multi?lockLayers(selection):update(selected.id,{locked:!selected.locked})}>{selected.locked?<Unlock/>:<Lock/>}</Tool></div></>}
  </>:<><div className="inspector-empty"><MousePointer2 size={28}/><p>Özelliklerini düzenlemek için bir nesne seçin.</p></div><div className="property-section">Çizim alanı</div><Field label="Arka plan"><input type="color" value={screen.background||(theme==='dark'?'#262d36':'#ffffff')} onChange={e=>change({...screen,background:e.target.value})}/></Field><button className="property-reset" onClick={()=>change({...screen,background:''})}>Arka plan için temayı kullan</button><Field label="Sembol stili"><select value={screen.symbolStyle||'classic'} onChange={e=>change({...screen,symbolStyle:e.target.value as Screen['symbolStyle']})}><option value="classic">Klasik · nesne renkleri</option><option value="isa101">ISA-101 · gri, renk yalnız anormal durumda</option><option value="detailed">Detaylı · metalik gövde, derinlik</option></select></Field>{(screen.symbolStyle||'classic')==='isa101'&&<Hint>Süreç sembolleri normal işletmede gri çizilir; alarm, uyarı ve bilinmeyen veri renkli kalır. Buton, lamba, gösterge ve yerleşim nesnelerinin renklerine dokunulmaz. Nesne renkleri silinmez; Klasik'e dönünce geri gelir.</Hint>}<Field label="Izgara aralığı"><select value={screen.gridSize} onChange={e=>change({...screen,gridSize:Number(e.target.value)})}>{[5,10,20,25,50,100].map(n=><option key={n} value={n}>{n} px</option>)}</select></Field><Field label="Ekran adı"><input value={screen.name} onChange={e=>change({...screen,name:e.target.value})}/></Field><div className="field-grid"><Field label="Genişlik"><BoundedNumber label="Tuval genişliği" value={screen.width} min={400} max={4000} onCommit={v=>change({...screen,width:v})}/></Field><Field label="Yükseklik"><BoundedNumber label="Tuval yüksekliği" value={screen.height} min={300} max={3000} onCommit={v=>change({...screen,height:v})}/></Field></div></>}</aside>}
 {editor&&menu&&<ContextMenu x={menu.x} y={menu.y} items={menu.widget?[
   {label:'Kes',hint:'Ctrl+X',icon:<Scissors size={13}/>,run:cut,off:!selection.length},
   {label:'Kopyala',hint:'Ctrl+C',icon:<Copy size={13}/>,run:copy,off:!selection.length},
   {label:'Yapıştır',hint:'Ctrl+V',icon:<ClipboardPaste size={13}/>,run:()=>paste(menu.at),off:!clipboard.current.length},
   {label:'Çoğalt',hint:'Ctrl+D',icon:<Copy size={13}/>,run:duplicate,off:!selection.length,line:true},
   {label:'Öne getir',icon:<BringToFront size={13}/>,run:()=>layer(true)},
   {label:'Arkaya gönder',icon:<SendToBack size={13}/>,run:()=>layer(false)},
   {label:'90° sola döndür',hint:'Shift+[',icon:<RotateCcw size={13}/>,run:()=>rotateSelection(-90),line:true},
   {label:'90° sağa döndür',hint:'Shift+]',icon:<RotateCw size={13}/>,run:()=>rotateSelection(90)},
   {label:'Yatay aynala',hint:'H',icon:<FlipHorizontal2 size={13}/>,run:()=>mirror('x')},
   {label:'Dikey aynala',hint:'V',icon:<FlipVertical2 size={13}/>,run:()=>mirror('y')},
   {label:'Grupla',icon:<Group size={13}/>,run:()=>group(),off:selection.length<2,line:true},
   {label:'Grubu çöz',icon:<Ungroup size={13}/>,run:()=>group(true),off:!menu.widget.groupId},
   {label:'Çerçeveyi çizime oturt',hint:'Shift+F',icon:<Crop size={13}/>,run:snapFrames,off:!selection.length,line:true},
   {label:'Ekipman tipi olarak kaydet',icon:<Blocks size={13}/>,run:openTypeBuilder,off:!selection.length,line:true},
   {label:menu.widget.locked?'Kilidi aç':'Kilitle',icon:menu.widget.locked?<Unlock size={13}/>:<Lock size={13}/>,run:()=>update(menu.widget!.id,{locked:!menu.widget!.locked})},
   {label:'Sil',hint:'Delete',icon:<Trash2 size={13}/>,run:remove,off:!selection.length,danger:true,line:true},
  ]:[
   {label:'Yapıştır',hint:'Ctrl+V',icon:<ClipboardPaste size={13}/>,run:()=>paste(menu.at),off:!clipboard.current.length},
   {label:'Tümünü seç',hint:'Ctrl+A',icon:<CheckSquare size={13}/>,run:()=>setSelection(current.current.widgets.map(w=>w.id)),off:!screen.widgets.length},
   {label:grid?'Izgarayı gizle':'Izgarayı göster',icon:<Grid2X2 size={13}/>,run:()=>setGrid(!grid),line:true},
   {label:'Geri al',hint:'Ctrl+Z',icon:<Undo2 size={13}/>,run:undo,off:!history.length},
   {label:'Yinele',hint:'Ctrl+Shift+Z',icon:<Redo2 size={13}/>,run:redo,off:!future.length},
  ]} onRun={runMenu}/>}
 {createPortal(<>
 {info&&<div className="modal-backdrop" onPointerDown={()=>setInfo(null)}>
  <div ref={infoRef} className="modal info-modal" role="dialog" aria-modal="true" onPointerDown={e=>e.stopPropagation()}>
   <div className="modal-heading"><h2>{info.label||'Bilgi'}</h2><button className="tool" aria-label="Kapat" onClick={()=>setInfo(null)}><X size={16}/></button></div>
   {(()=>{
    /* G40: ekipman isletme paneli. Nesnenin saha baglari varsa once isletme
     * durumu ve ham rol okumalari gosterilir; komut satirlari altta kalir.
     * Durum, sembolle AYNI `phaseOf` fonksiyonundan gelir — panel ile ekran
     * asla farkli sey soylemez. */
    const bound=(info.bindings||[]).filter(b=>b.tagId);
    if(!bound.length)return null;
    const readings=readBindings(info,faceplateSamples(info));
    const phase=phaseOf(info,readings);
    return <><div className={'faceplate-state '+(phase?phaseTone[phase]:'unknown')}><span className="faceplate-dot"/><strong>{phase?phaseLabels[phase]:'DURUM YOK'}</strong><small>{phase?'Saha geri bildirimi':'Bağlı rol durumu belirlemiyor'}</small></div>
     <div className="info-rows">{bound.map(b=>{const def=bindingDef(info.type,b.role);
      const value=b.role in readings.bool?readings.bool[b.role]:b.role in readings.number?readings.number[b.role]:null;
      const text=value===null||value===undefined?'—':typeof value==='boolean'?(value?'AÇIK':'KAPALI'):String(value);
      const tag=config.tags.find(t=>t.id===b.tagId);
      return <div className="info-row" key={b.role}><span>{def?.label||b.role}{b.invert?' · ters':''}</span><strong className={text==='—'?'muted':''}>{text}{typeof value==='number'&&tag?.unit?' '+tag.unit:''}</strong></div>;})}</div></>;
   })()}
   {!info.details.length&&!(info.bindings||[]).some(b=>b.tagId)&&<p className="small muted spaced">Bu bilgi düğmesine henüz satır eklenmedi. Tasarım stüdyosunda Bağlantı sekmesinden değer veya komut satırı ekleyin.</p>}
   <div className="info-rows">{info.details.map((d,i)=>{
    if(d.kind==='value'){const s=preview?{value:simulation[d.tagId]??0,quality:'good'}:live.samples[d.tagId];
     const tag=config.tags.find(t=>t.id===d.tagId);const good=s?.quality==='good';
     const text=!good?'—':typeof s!.value==='boolean'?(s!.value?'AÇIK':'KAPALI'):(d.decimals>=0?Number(s!.value).toFixed(d.decimals):String(s!.value));
     return <div className="info-row" key={i}><span>{d.label||tag?.name||tag?.code}</span>
      <strong className={good?'':'muted'}>{text}{good&&typeof s!.value!=='boolean'&&(d.unit||tag?.unit)?' '+(d.unit||tag?.unit):''}</strong></div>;}
    const target=detailWidget(info,d),busy=disabled(target);
    const state=preview?simulation[d.tagId]:live.samples[d.tagId]?.value;
    return <div className="info-row command" key={i}><span>{d.label||config.commands.find(c=>c.id===d.commandId)?.name}</span>
     <button className="btn small primary" disabled={busy} onClick={()=>void click(target)}>
      {d.action==='toggle'?(typeof state==='boolean'?(state?d.offText:d.onText):'BİLİNMİYOR'):d.action==='off'?'Kapat':d.action==='set'?'Değer yaz · '+d.setValue:'Çalıştır'}</button></div>;})}
   </div>
   <div className="modal-actions"><button className="btn" onClick={()=>setInfo(null)}>Kapat</button></div>
  </div></div>}
 {shortcuts&&<div className="modal-backdrop" onPointerDown={()=>setShortcuts(false)}>
  <div ref={shortcutRef} className="modal shortcut-help" role="dialog" aria-modal="true" aria-label="Klavye kısayolları" onPointerDown={e=>e.stopPropagation()}>
   <div className="modal-heading"><h2>Klavye kısayolları</h2><button className="tool" aria-label="Kapat" autoFocus onClick={()=>setShortcuts(false)}>×</button></div>
   <dl className="shortcut-list">{shortcutList.map(([k,label])=><div key={k}><dt><kbd>{k}</kbd></dt><dd>{label}</dd></div>)}</dl>
   <p className="parts-hint">Kısayollar tasarım stüdyosunda geçerlidir. Operatör ekranında fiziksel yazma için kısayol yoktur; komutlar yalnızca nesneye tıklayarak verilir.</p>
  </div></div>}
{riskConfirm&&(()=>{const w=riskConfirm.widget,d=config.commands.find(x=>x.id===w.commandId)!;
 const tag=config.tags.find(t=>t.id===w.tagId);
 const current=live.samples[w.tagId]?.value;
 const needsReason=d.approval==='reason'||d.approval==='two-person';
 return <div className="modal-backdrop" onPointerDown={()=>setRiskConfirm(null)}>
  <div className={'modal risk-modal '+(d.risk||'normal')} role="alertdialog" aria-modal="true" aria-label="Komut onayı" onPointerDown={e=>e.stopPropagation()}>
   <div className="modal-heading"><h2>{d.name}</h2><span className={'badge '+(d.risk==='critical'?'bad':d.risk==='high'?'warn':'')}>{commandRiskLabels[d.risk||'normal']}</span></div>
   <div className="info-rows">
    <div className="info-row"><span>Ekipman</span><strong>{w.label||labels[w.type]}</strong></div>
    <div className="info-row"><span>Etiket</span><strong>{tag?config.devices.find(dv=>dv.id===tag.deviceId)?.code+'.'+tag.code:'—'}</strong></div>
    <div className="info-row"><span>Mevcut değer</span><strong>{current===undefined||current===null?'—':String(current)+(tag?.unit?' '+tag.unit:'')}</strong></div>
    <div className="info-row"><span>Yeni değer</span><strong>{String(riskConfirm.value)+(tag?.unit?' '+tag.unit:'')}</strong></div>
    {d.scope&&<div className="info-row"><span>Kapsam</span><strong>{d.scope}</strong></div>}
    <div className="info-row"><span>Onay</span><strong>{approvalLabels[d.approval||'none']}</strong></div>
   </div>
   {needsReason&&<Field label="Gerekçe (denetim kaydına yazılır)"><input autoFocus value={riskConfirm.reason} onChange={e=>setRiskConfirm(r=>r?{...r,reason:e.target.value}:r)}/></Field>}
   {d.approval==='two-person'&&<p className="parts-hint">Bu komut gönderildikten sonra <strong>başka bir yetkilinin</strong> onayı gerekir; onaya kadar sahaya hiçbir şey yazılmaz.</p>}
   <div className="modal-actions"><button className="btn" onClick={()=>setRiskConfirm(null)}>Vazgeç</button>
    <button className="btn primary" disabled={riskConfirm.busy||(needsReason&&riskConfirm.reason.trim().length<3)}
     onClick={async()=>{setRiskConfirm(r=>r?{...r,busy:true}:r);await send(w,riskConfirm.value,riskConfirm.reason.trim());setRiskConfirm(null);}}>
     {riskConfirm.busy?'Gönderiliyor…':d.approval==='two-person'?'Onaya gönder':'Onayla ve gönder'}</button></div>
  </div></div>;})()}
 {!editor&&!preview&&live.commands.filter(c=>c.status==='awaiting').length>0&&<div className="warning approval-bar">
  {live.commands.filter(c=>c.status==='awaiting').map(c=><div key={c.id} className="approval-row">
   <span><strong>{c.name}</strong> · {String(c.value)} · isteyen: {c.user}{c.reason?' · gerekçe: '+c.reason:''}</span>
   <span className="toolbar-group">
    <button className="btn small" onClick={()=>void api('/commands/'+c.id+'/reject','POST').then(()=>notify('Onay reddedildi.')).catch(e=>notify((e as Error).message,'error'))}>Reddet</button>
    <button className="btn primary small" disabled={c.user===user.username} title={c.user===user.username?'Kendi komutunuzu onaylayamazsınız':''}
     onClick={()=>void api('/commands/'+c.id+'/approve','POST').then(()=>notify('Onaylandı; komut gönderildi.')).catch(e=>notify((e as Error).message,'error'))}>Onayla</button>
   </span></div>)}
 </div>}
 {numericEntry&&<NumericEntry widget={numericEntry} config={config} currentValue={preview?simulation[numericEntry.tagId]??0:live.samples[numericEntry.tagId]?.value} unavailable={disabled(numericEntry)} preview={preview} onClose={()=>setNumericEntry(null)} onSubmit={async value=>{await click(numericEntry,value);setNumericEntry(null);}}/>}
 {typeBuilder&&<div className="modal-backdrop" onPointerDown={()=>setTypeBuilder(null)}>
  <div className="modal" role="dialog" aria-modal="true" onPointerDown={e=>e.stopPropagation()}>
   <div className="modal-heading"><h2>Ekipman tipi olarak kaydet</h2><button className="tool" aria-label="Kapat" onClick={()=>setTypeBuilder(null)}><X size={16}/></button></div>
   <Field label="Tip adı"><input value={typeBuilder.name} onChange={e=>setTypeBuilder({...typeBuilder,name:e.target.value})}/></Field>
   <Field label="Açıklama"><textarea value={typeBuilder.description} onChange={e=>setTypeBuilder({...typeBuilder,description:e.target.value})}/></Field>
   <div className="parts-head"><span>Girdiler · {typeBuilder.inputs.length}</span></div>
   {typeBuilder.inputs.length===0&&<p className="small muted parts-hint">Seçimde etikete veya komuta bağlı nesne bulunamadı; girdisiz de kaydedebilirsiniz.</p>}
   {typeBuilder.inputs.map((inp,i)=><div className="part-row" key={inp.key}>
    <input className="part-label" value={inp.label} placeholder="Girdi adı" aria-label="Girdi adı" onChange={e=>setTypeBuilder({...typeBuilder,inputs:typeBuilder.inputs.map((x,n)=>n===i?{...x,label:e.target.value}:x)})}/>
    <span className="small muted">{inp.kind==='command'?'komut':inp.kind==='bool'?'dijital':'sayısal'}</span>
    <button className="tool" title="Girdiyi kaldır" onClick={()=>setTypeBuilder({...typeBuilder,inputs:typeBuilder.inputs.filter((_,n)=>n!==i)})}><Trash2 size={12}/></button>
   </div>)}
   <p className="small muted parts-hint">Kaydedilince seçili nesnelerdeki bu etiket/komut bağları girdi olarak ayrılır; her ekipman instansı için Bağlantı sekmesinden ayrı eşleyebilirsiniz.</p>
   <div className="modal-actions"><button className="btn" onClick={()=>setTypeBuilder(null)}>Vazgeç</button><button className="btn primary" onClick={()=>void saveEquipmentType()}>Kaydet</button></div>
  </div></div>}
 {lintModal&&(()=>{const summary=lintSummary(lintModal.findings),hasCritical=summary.critical>0,reasonOk=lintModal.reason.trim().length>=5;
 const severityLabel:Record<LintFinding['severity'],string>={critical:'Kritik',warning:'Uyarı',info:'Bilgi'};
 return <div className="modal-backdrop" onPointerDown={()=>setLintModal(null)}>
  <div ref={lintModalRef} className="modal lint-modal" role="alertdialog" aria-modal="true" aria-label="Yayın öncesi HMI denetimi" onPointerDown={e=>e.stopPropagation()}>
   <div className="modal-heading"><h2>Yayın öncesi denetim</h2><button className="tool" aria-label="Kapat" onClick={()=>setLintModal(null)}><X size={16}/></button></div>
   <p className="small muted spaced">Tesis HMI stil rehberine göre {summary.total} bulgu bulundu: {summary.critical} kritik, {summary.warning} uyarı, {summary.info} bilgi.</p>
   <div className="lint-list">{lintModal.findings.map((f,i)=><button key={i} type="button" className={'lint-row '+f.severity} onClick={()=>{if(f.widgetId){setSelection([f.widgetId]);zoomToSelection([f.widgetId]);}}} disabled={!f.widgetId}>
    <span className={'lint-severity '+f.severity}>{severityLabel[f.severity]}</span><span className="lint-message">{f.message}</span></button>)}
   </div>
   {hasCritical&&<>
    <Field label="Gerekçe (kritik ihlal için zorunlu, en az 5 karakter — denetim kaydına yazılır)"><textarea autoFocus value={lintModal.reason} onChange={e=>setLintModal(m=>m?{...m,reason:e.target.value}:m)}/></Field>
    <p className="parts-hint">Kritik ihlal(ler) giderilmeden yayınlamak isterseniz gerekçenizi yazın; bu gerekçe yayın kaydına eklenir.</p>
   </>}
   <div className="modal-actions"><button className="btn" onClick={()=>setLintModal(null)}>Vazgeç</button>
    <button className="btn primary" disabled={lintModal.busy||(hasCritical&&!reasonOk)}
     onClick={async()=>{setLintModal(m=>m?{...m,busy:true}:m);await doPublish(hasCritical?lintModal.reason.trim():undefined);setLintModal(null);}}>
     {lintModal.busy?'Yayınlanıyor…':hasCritical?'Gerekçeyle yayınla':'Yine de yayınla'}</button></div>
  </div></div>;})()}
  {pendingTemplate&&<div className="modal-backdrop" onPointerDown={()=>setPendingTemplate(null)}>
   <div ref={templateModalRef} className="modal template-apply-modal" role="dialog" aria-modal="true" aria-label="Ekran şablonunu kullan" onPointerDown={e=>e.stopPropagation()}>
    <div className="modal-heading"><h2>{pendingTemplate.name}</h2><button className="tool" aria-label="Kapat" onClick={()=>setPendingTemplate(null)}><X size={16}/></button></div>
    <div className="template-apply-preview" aria-hidden="true">{renderBackdropSvg(pendingTemplate.backdropVariant,'apply-'+pendingTemplate.id)}</div>
    <p className="small muted spaced">{pendingTemplate.description}</p>
    <div className="template-apply-tags">{pendingTemplate.highlights.map(h=><span key={h} className="badge">{h}</span>)}</div>
    <p className="small muted spaced">Mevcut tuvale uygularsanız tuvaldeki taslak şablonla değişir (geri almak için <strong>Ctrl+Z</strong>). İsterseniz doğrudan yeni bir ekran olarak da açabilirsiniz.</p>
    <div className="modal-actions">
     <button className="btn" onClick={()=>setPendingTemplate(null)}>Vazgeç</button>
     {onCreateFromTemplate&&<button className="btn" onClick={()=>{const id=pendingTemplate.id;setPendingTemplate(null);void onCreateFromTemplate(id);}}>Yeni ekran olarak aç</button>}
     <button className="btn primary" onClick={()=>applyScreenTemplate(pendingTemplate)}>Mevcut tuvale uygula</button>
    </div>
   </div></div>}
 </>,fullscreenHost||document.body)}
 </div>;
}
type MenuItem={label:string;hint?:string;icon:React.ReactNode;run:()=>void;off?:boolean;danger?:boolean;line?:boolean};
function ContextMenu({x,y,items,onRun}:{x:number;y:number;items:MenuItem[];onRun:(fn:()=>void)=>void}){
 const box=useRef<HTMLDivElement>(null),[pos,setPos]=useState({x,y});
 useEffect(()=>{const el=box.current;if(!el)return;const r=el.getBoundingClientRect();
  setPos({x:Math.max(6,Math.min(x,window.innerWidth-r.width-6)),y:Math.max(6,Math.min(y,window.innerHeight-r.height-6))});},[x,y]);
 return <div ref={box} className="context-menu" role="menu" style={{left:pos.x,top:pos.y}} onPointerDown={e=>e.stopPropagation()} onContextMenu={e=>e.preventDefault()}>
  {items.map((item,i)=><button key={i} role="menuitem" className={(item.danger?'danger ':'')+(item.line?'line ':'')} disabled={item.off} onClick={()=>onRun(item.run)}>
   {item.icon}<span>{item.label}</span>{item.hint&&<small>{item.hint}</small>}</button>)}
 </div>;
}
function Tool({title,onClick,children,disabled=false,active=false,pressed}:{title:string;onClick:()=>void;children:React.ReactNode;disabled?:boolean;active?:boolean;pressed?:boolean}){return <button type="button" className={'tool '+(active?'active':'')} title={title} aria-label={title} aria-pressed={pressed} onClick={onClick} disabled={disabled}>{children}</button>;}
function PipePenIcon(){
 return <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M3 12V6a2 2 0 0 1 2-2h6"/>
  <circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/>
  <circle cx="13" cy="4" r="1.5" fill="currentColor" stroke="none"/>
 </svg>;
}

/** Ekipman instansinin girdi baglarini tek yerden duzenler; 20 uye nesne tek tek acilmaz. */
/* --- Saha baglari paneli (A1) ---------------------------------------------
 * Roller katalogda tanimlidir; operator ekraninda "acik mi" yerine
 * "acildi / kapandi / arada / celiskili / arizali" ayrimini bu baglar besler.
 * Bag baglanmadiginda sembol eski tekil etiket davranisini surdurur.
 */
function BindingsPanel({widget,config,onChange}:{widget:Widget;config:Config;onChange:(b:Binding[])=>void}){
 const defs=bindingDefs(widget.type),current=widget.bindings||[];
 const dynamics=dynamicBindings as {role:string;label:string;kind:'bool'|'number'}[];
 const find=(role:string)=>current.find(b=>b.role===role);
 function set(role:string,patch:Partial<Binding>){
  const existing=find(role),next:Binding[]=existing?current.map(b=>b.role===role?{...b,...patch}:b):[...current,{role,tagId:'',invert:false,...patch}];
  onChange(next.filter(b=>b.tagId));
 }
 const bound=current.filter(b=>b.tagId&&!isDynamicRole(b.role)).length;
 // K08: etiket adina gore oneri; uygulamak kullanicinin karari, otomatik yazilmaz.
 const suggestions=suggestBindings(widget,config);
 return <><div className="property-section">Saha bağları · {bound}/{defs.length}</div>
  {!!suggestions.length&&<div className="binding-suggest"><p>{suggestions.length} rol etiket adından eşleşti: {suggestions.map(s=>s.tagCode).join(', ')}</p><button className="btn small wide" onClick={()=>onChange([...current.filter(b=>b.tagId),...suggestions.map(s=>({role:s.role,tagId:s.tagId,invert:false}))])}>Önerilenleri bağla</button></div>}
  {defs.map(d=>{const b=find(d.role);
   return <div className="binding-row" key={d.role}>
    <label title={d.kind==='bool'?'dijital sinyal':'sayısal değer'}>{d.label}</label>
    <SearchSelect ariaLabel={d.label+' etiketi'} value={b?.tagId||''} emptyLabel="Bağlı değil" placeholder="Bağla" options={tagPickOptions(config,t=>d.kind==='bool'?t.dataType==='bool':t.dataType!=='bool')} onChange={v=>set(d.role,{tagId:v})}/>
    {d.kind==='bool'
     ?<label className="check compact" title="Sahada ters kablolanmış (NC) sinyal"><input type="checkbox" disabled={!b?.tagId} checked={!!b?.invert} onChange={e=>set(d.role,{invert:e.target.checked})}/>Ters</label>
     :<span className="binding-spacer" aria-hidden="true"/>}
   </div>;})}
  <div className="property-section">Dinamik görünüm</div>
  {dynamics.map(d=>{const b=find(d.role);
   return <div className="binding-row" key={d.role}>
    <label title={d.kind==='bool'?'dijital sinyal':'sayısal değer'}>{d.label}</label>
    <SearchSelect ariaLabel={d.label+' etiketi'} value={b?.tagId||''} emptyLabel="Bağlı değil" placeholder="Bağla" options={tagPickOptions(config,t=>d.kind==='bool'?t.dataType==='bool':t.dataType!=='bool')} onChange={v=>set(d.role,{tagId:v})}/>
    {d.kind==='bool'
     ?<label className="check compact" title="Sahada ters kablolanmış (NC) sinyal"><input type="checkbox" disabled={!b?.tagId} checked={!!b?.invert} onChange={e=>set(d.role,{invert:e.target.checked})}/>Ters</label>
     :<span className="binding-spacer" aria-hidden="true"/>}
   </div>;})}
  <Hint>Açı nesnenin kendi dönüşüne eklenir; opaklık ve doluluk yüzde okunur. Bağlanmamış rol durumu belirlemez; hiç rol bağlanmazsa sembol tekil etikete göre çizilir. Veri kötüyse durum bilinmiyor gösterilir — nesne uydurma bir açıya dönmez, görünmez olmaz.</Hint>
 </>;
}

function EquipmentPanel({instance,type,config,onBinding,onRename,onDissolve,drift,onUpgrade,onRevise}:{instance:EquipmentInstance;type:EquipmentType|undefined;config:Config;onBinding:(key:string,value:string)=>void;onRename:(name:string)=>void;onDissolve:()=>void;drift?:{from:number;to:number};onUpgrade:()=>void;onRevise:()=>void}){
 const unbound=unboundEquipmentInputs(instance,type);
 return <><div className="property-section">Ekipman</div>
  <Field label="Ekipman adı"><input value={instance.name} onChange={e=>onRename(e.target.value)}/></Field>
  {!type&&<p className="small muted parts-hint">Bu ekipmanın tipi bulunamadı; tip silinmiş olabilir.</p>}
  {type&&<div className="equipment-version"><span>Tip sürümü <strong>v{instance.typeVersion}</strong>{drift?` · tipte v${drift.to} var`:' · güncel'}</span>
   {drift&&<button className="btn small wide" onClick={onUpgrade}>v{drift.from} → v{drift.to} güncelle</button>}
   <button className="property-reset" onClick={onRevise}>Bu ekipmandan yeni tip sürümü kaydet (v{type.version+1})</button>
   <p className="small muted">Yükseltme yalnız bu ekipmanı taşır; aynı tipin diğer ekipmanları siz onaylayana kadar eski sürümde kalır. Üye nesnelere bağlı boru bağlantıları yükseltmede kopar.</p></div>}
  {type?.inputs.map(input=><Field key={input.key} label={input.label}>
   <SearchSelect ariaLabel={input.label} value={instance.bindings[input.key]||''} emptyLabel="Bağlantı yok" placeholder={input.kind==='command'?'Komut seçin':'Etiket seçin'} options={input.kind==='command'?commandPickOptions(config):tagPickOptions(config,t=>input.kind==='bool'?t.dataType==='bool':t.dataType!=='bool')} onChange={v=>onBinding(input.key,v)}/></Field>)}
  {unbound.length>0&&<p className="small muted parts-hint">Eşlenmemiş girdiler: {unbound.map(i=>i.label).join(', ')}.</p>}
  <button className="btn small danger wide" type="button" onClick={onDissolve}><Unlink2 size={13}/>Ekipmanı çöz</button>
 </>;
}

/** Kosul agaci duzenleyicisi: kod yazmadan VE/VEYA/DEGIL ve karsilastirma kurar. */
function ConditionEditor({node,config,depth,onChange,onRemove}:{node:Condition;config:Config;depth:number;onChange:(c:Condition)=>void;onRemove?:()=>void}){
 const boolTags=config.tags.filter(t=>t.dataType==='bool'),numberTags=config.tags.filter(t=>t.dataType!=='bool');
 const firstBool=boolTags[0]?.id||'',firstNumber=numberTags[0]?.id||'';
 function changeKind(kind:string){
  if(kind==='bool')onChange({op:'bool',tagId:'tagId' in node?node.tagId:firstBool||firstNumber,expected:true});
  else if(kind==='cmp')onChange({op:'cmp',tagId:'tagId' in node?node.tagId:firstNumber,test:'gt',value:0});
  else if(kind==='range')onChange({op:'range',tagId:'tagId' in node?node.tagId:firstNumber,min:0,max:100});
  else if(kind==='and'||kind==='or')onChange({op:kind,terms:[node]});
  else onChange({op:'not',term:node});
 }
 const kind=node.op;
 const group=kind==='and'||kind==='or';
 return <div className={'condition-node depth-'+depth}>
  <div className="condition-head">
   <select value={kind} onChange={e=>changeKind(e.target.value)} aria-label="Koşul türü">
    <option value="bool">Dijital durum</option><option value="cmp">Karşılaştırma</option><option value="range">Aralık</option>
    <option value="and">VE grubu</option><option value="or">VEYA grubu</option><option value="not">DEĞİL</option>
   </select>
   {onRemove&&<button className="tool" type="button" aria-label="Koşulu kaldır" onClick={onRemove}>×</button>}
  </div>
  {kind==='bool'&&<div className="condition-row">
   <SearchSelect ariaLabel="Koşul etiketi" value={node.tagId} allowEmpty={false} placeholder="Etiket seçin" options={tagPickOptions(config,t=>t.dataType==='bool')} onChange={v=>onChange({...node,tagId:v})}/>
   <select value={String(node.expected)} onChange={e=>onChange({...node,expected:e.target.value==='true'})} aria-label="Beklenen"><option value="true">açık</option><option value="false">kapalı</option></select>
  </div>}
  {kind==='cmp'&&<div className="condition-row">
   <SearchSelect ariaLabel="Koşul etiketi" value={node.tagId} allowEmpty={false} placeholder="Etiket seçin" options={tagPickOptions(config,t=>t.dataType!=='bool')} onChange={v=>onChange({...node,tagId:v})}/>
   <select value={node.test} onChange={e=>onChange({...node,test:e.target.value as any})} aria-label="İşleç">{conditionTests.map(t=><option key={t} value={t}>{(conditionTestLabels as any)[t]}</option>)}</select>
   <input type="number" value={node.value} onChange={e=>onChange({...node,value:Number(e.target.value)||0})} aria-label="Değer"/>
  </div>}
  {kind==='range'&&<div className="condition-row">
   <SearchSelect ariaLabel="Koşul etiketi" value={node.tagId} allowEmpty={false} placeholder="Etiket seçin" options={tagPickOptions(config,t=>t.dataType!=='bool')} onChange={v=>onChange({...node,tagId:v})}/>
   <input type="number" value={node.min} onChange={e=>onChange({...node,min:Number(e.target.value)||0})} aria-label="Alt sınır"/>
   <input type="number" value={node.max} onChange={e=>onChange({...node,max:Number(e.target.value)||0})} aria-label="Üst sınır"/>
  </div>}
  {kind==='not'&&<ConditionEditor node={node.term} config={config} depth={depth+1} onChange={t=>onChange({op:'not',term:t})}/>}
  {group&&<div className="condition-terms">
   {node.terms.map((t,i)=><ConditionEditor key={i} node={t} config={config} depth={depth+1}
     onChange={next=>onChange({op:node.op,terms:node.terms.map((x,j)=>j===i?next:x)})}
     onRemove={node.terms.length>1?()=>onChange({op:node.op,terms:node.terms.filter((_,j)=>j!==i)}):undefined}/>)}
   <button className="btn small" type="button" disabled={node.terms.length>=6||depth>=3}
    onClick={()=>onChange({op:node.op,terms:[...node.terms,{op:'bool',tagId:firstBool,expected:true}]})}>Koşul ekle</button>
  </div>}
 </div>;
}
/** Komutun yazdigi etiketlerin hepsi bool ise komut dijitaldir; sabit deger yazilamaz (model.validateValue ile ayni kural). */
function digitalCommand(config:Config,commandId:string){const c=config.commands.find(c=>c.id===commandId);return !!c&&c.tagIds.length>0&&c.tagIds.every(id=>config.tags.find(t=>t.id===id)?.dataType==='bool');}
/** Yazarken serbest, alandan cikinca veya Enter'da [min,max] araligina oturan sayi alani. */
function BoundedNumber({value,min,max,label,onCommit}:{value:number;min:number;max:number;label:string;onCommit:(v:number)=>void}){
 const [text,setText]=useState(String(value));
 useEffect(()=>{setText(String(value));},[value]);
 const commit=()=>{const n=Math.round(Number(text));const v=Number.isFinite(n)&&text.trim()!==''?Math.min(max,Math.max(min,n)):value;setText(String(v));if(v!==value)onCommit(v);};
 const out=text.trim()!==''&&Number.isFinite(Number(text))&&(Number(text)<min||Number(text)>max);
 return <><input type="number" aria-label={label} min={min} max={max} value={text} aria-invalid={out} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();}}/>{out&&<small className="field-warning">{min} – {max} arası</small>}</>;
}
