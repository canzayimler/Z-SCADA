import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
// Temel stil EN ÖNCE: bileşen dosyaları (cfg, report, panel…) onu bilerek ezebilsin.
// Eskiden bileşenlerden sonra yükleniyordu; .btn.danger, .modal genişliği gibi ayarlar sessizce kayboluyordu.
import './style.css';
import React,{Suspense,lazy,useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {Activity,FileText,Monitor,PenTool,Network,Tags,History,Settings,ChevronDown,ChevronUp,Plus,LogOut,Radio,ArrowRight,Command,CheckCircle2,X,Layers,Eye,Sun,Moon,BellRing,Check,AlertTriangle,Home,Search,Pin,PinOff} from 'lucide-react';
import { BellIcon, CommIcon, CommandsIcon, DevicesIcon, EnergyIcon, HistoryIcon, LogoutIcon, MonitorIcon, MoonIcon, PanelIcon, ReportIcon, SettingsIcon, StudioIcon, SunIcon, TagsIcon } from './zIcons';
import {newScreenSymbolStyle,severityLabels,deviceStatusLabels,sortScreens,screenTree,translator,defaultPreferences,preferencesSchema,type Preferences,type AlarmEvent,type Config,type Live,type User,type ScreenRecord,type EquipmentType} from '../../../packages/contracts/model';
import {buildScreenTemplate,screenTemplates,type ScreenTemplateId} from '../../../packages/screen-model/screenTemplates';
import {renderBackdropSvg} from '../../../packages/symbols/render/backdrops';
import {Studio,Field} from './Studio';
import {NoticeCenter} from './StatusBanner';
import {LoginSchematic} from './LoginSchematic';
import {RuntimeList} from './RuntimeList';
import {applyLive} from './liveMerge';
import {statusNotices,statusLabel,type BuildInfo,type UpdateInfo} from './statusModel';
import {api,setReauthHandler,setSessionEndHandler} from './api';
import {pathFor,parsePath,projectStale} from './routing';
import {useModal} from './useModal';
/* Kod bölme: yönetim, panel ve enerji sayfaları ilk açılışta gerekmez; ayrı parça olarak
 * ilk ziyarette yüklenir. CSS'leri burada, eski sırasıyla kalır: tembel parçaya gitseydi
 * ortak.css'ten SONRA yüklenip kaskad sırasını değiştirirdi. */
const Management=lazy(()=>import('./Management').then(m=>({default:m.Management})));
const Panel=lazy(()=>import('./Panel').then(m=>({default:m.Panel})));
const Energy=lazy(()=>import('./Energy').then(m=>({default:m.Energy})));
const pageLoading=<div className="loading" role="status">Sayfa yükleniyor…</div>;
import './modbus.css';
import './tabs.css';
import './report.css';
import './cfg.css';
import './panel.css';
import './energy.css';
import './studio.css';
import './motion.css';
// Ortak dil en son: aynı işi yapan bileşen ailelerinin görünümü tek yerde (ortak.css).
import './ortak.css';
// B26: ekranlarin duz listesi yerine klasor+sira+ana ekran modeli — bu yardimci varsayilan ekrani secer.
function homeScreenId(project:{screens:ScreenRecord[];homeScreenId?:string}):string{
 return project.homeScreenId&&project.screens.some(s=>s.id===project.homeScreenId)?project.homeScreenId:(project.screens[0]?.id||'');
}
const emptyLive:Live={samples:{},gatewayConnected:false,activeRevision:0,desiredRevision:0,deploying:false,commands:[],alarms:[],
 alarmCounts:{total:0,active:0,unacked:0,activeUnacked:0,outstanding:0,critical:0,unackedOutstanding:0},alarmFlood:{active:false,since:0,lastRaiseAt:0,ratePerMinute:0,suppressed:0},devices:[],devicesReady:0,devicesTotal:0,controlReady:false};
// B26: URL tabanli navigasyon — yol cozumleme routing.ts'te (test edilebilsin diye).
/** Üst çubuk saati kendi bileşeninde döner: eskiden App'te duran 500 ms'lik saat durumu tüm
 * kabuğu (ekran ağacı, Stüdyo, yönetim tabloları) saniyede iki kez yeniden çiziyordu. */
function TopClock(){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(t);},[]);
 return <span className="top-clock">{new Date(now).toLocaleTimeString('tr-TR')}</span>;
}
function App(){
 const [user,setUser]=useState<User|null>(null),[checked,setChecked]=useState(false),[setup,setSetup]=useState(false),[defaultLogin,setDefaultLogin]=useState<{username:string;password:string}|null>(null),[project,setProject]=useState<{config:Config;screens:ScreenRecord[];homeScreenId?:string;equipmentTypes?:EquipmentType[]}|null>(null),[live,setLive]=useState<Live>(emptyLive),[page,setPage]=useState('runtime'),[screenId,setScreenId]=useState('screen-main'),[toast,setToast]=useState<{text:string;tone:'info'|'error'}|null>(null),[connected,setConnected]=useState(false),[newScreen,setNewScreen]=useState(false),[screenName,setScreenName]=useState('Yeni ekran'),[screenTemplate,setScreenTemplate]=useState('blank'),[sessionEnded,setSessionEnded]=useState(false);
 const leave=useRef<()=>Promise<boolean>>(async()=>true);const lastMessage=useRef(0);
 const inited=useRef(false);
 // B31/B32: tercihler sunucuda kullaniciya bagli tutulur; baska bilgisayarda ayni duzen gelir.
 // B12: pasif (yedek) sunucuda operatore acikca soylenir; komut kabul edilmez.
 const [cluster,setCluster]=useState<{role:string;instanceId:string;activeInstance:string}|null>(null);
 const [prefs,setPrefs]=useState<Preferences>(defaultPreferences),[prefsOpen,setPrefsOpen]=useState(false);
 const t=translator(prefs.language);
 const prefsRef=useModal<HTMLDivElement>(prefsOpen,useCallback(()=>setPrefsOpen(false),[]));
 /* Surum kaymasina dayaniklilik (2026-09-25): eski sunucu yeni alanlari (alarmSound, kiosk...)
  * dondurmez; istemci eksik alani varsayilanla doldurur, cokmez. Gecersizse varsayilan uzerine birlestirilir. */
 const normalizePrefs=(p:any):Preferences=>{const r=preferencesSchema.safeParse(p||{});if(r.success)return r.data;
  return {...defaultPreferences,...p,alarmSound:{...defaultPreferences.alarmSound,...p?.alarmSound},kiosk:{...defaultPreferences.kiosk,...p?.kiosk},pinnedScreenIds:Array.isArray(p?.pinnedScreenIds)?p.pinnedScreenIds:[],savedFilters:Array.isArray(p?.savedFilters)?p.savedFilters:[]};};
 async function savePrefs(next:Preferences){try{const saved=await api<Preferences>('/preferences','PUT',next);setPrefs(normalizePrefs(saved));}catch(e){notify((e as Error).message,'error');}}
 // Telefon (<=600 px): kenar cubugu gizli, ust cubuktaki dugmeyle cekmece olarak acilir.
 const [mobileNav,setMobileNav]=useState(false);
 // Dar ekranda operator ekrani varsayilan liste; secim cihaza ozel (telefon/tablet farkli).
 const [narrow,setNarrow]=useState(()=>matchMedia('(max-width:700px)').matches);
 useEffect(()=>{const m=matchMedia('(max-width:700px)'),f=()=>setNarrow(m.matches);m.addEventListener('change',f);return()=>m.removeEventListener('change',f);},[]);
 const [runtimeView,setRuntimeView]=useState<'list'|'canvas'>(()=>{try{return localStorage.getItem('scada-runtime-view')==='canvas'?'canvas':'list';}catch{return 'list';}});
 useEffect(()=>{try{localStorage.setItem('scada-runtime-view',runtimeView);}catch{}},[runtimeView]);
 const [navCollapsed,setNavCollapsed]=useState(()=>{try{const v=localStorage.getItem('scada-nav');return v?v==='1':innerWidth<1280;}catch{return false;}});
 useEffect(()=>{try{localStorage.setItem('scada-nav',navCollapsed?'1':'0');}catch{}},[navCollapsed]);
 const [theme,setTheme]=useState<'light'|'dark'>(()=>{try{const v=localStorage.getItem('scada-theme');return v==='dark'||v==='light'?v:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}catch{return 'light';}});
 // Surum bandi: sunucunun acilistaki ve diskteki derleme kimligi 30 sn'de bir okunur.
 const [build,setBuild]=useState<BuildInfo|null>(null);
 useEffect(()=>{if(!user||__BUILD_ID__==='dev')return;const load=()=>void api<any>('/health').then(h=>setBuild(h.build||null)).catch(()=>{});load();const id=setInterval(load,30000);return()=>clearInterval(id);},[user]);
 // Yeni surum (yalniz yonetici): sunucu gunde bir GitHub'a sorar; arayuz 30 dk'da bir sonucu okur. Ayarlar paneli
 // degisince 'zscada:update' olayiyla hemen gunceller.
 const [update,setUpdate]=useState<UpdateInfo|null>(null);
 useEffect(()=>{if(user?.role!=='admin'){setUpdate(null);return;}const load=()=>void api<UpdateInfo>('/update').then(setUpdate).catch(()=>{});load();const id=setInterval(load,1800000);
  const on=(e:Event)=>setUpdate((e as CustomEvent<UpdateInfo>).detail);addEventListener('zscada:update',on);return()=>{clearInterval(id);removeEventListener('zscada:update',on);};},[user?.role]);
 useEffect(()=>{if(!user)return;const load=()=>void api<any>('/cluster').then(setCluster).catch(()=>{});load();const id=setInterval(load,15000);return()=>clearInterval(id);},[user]);
 useEffect(()=>{if(!user)return;void api<Preferences>('/preferences').then(raw=>{const p=normalizePrefs(raw);setPrefs(p);if(p.theme!=='system')setTheme(p.theme);
  // Eski cihaz ayari (localStorage) bir kez hesaba tasinir.
  try{if(localStorage.getItem('scada-alarm-sound')==='off'&&p.alarmSound.enabled){localStorage.removeItem('scada-alarm-sound');void savePrefs({...p,alarmSound:{...p.alarmSound,enabled:false}});}}catch{}}).catch(()=>{});},[user]);
 useEffect(()=>{document.documentElement.dataset.density=prefs.density;},[prefs.density]);
 useEffect(()=>{
  const root=document.documentElement;
  root.classList.add('theme-switching');
  root.dataset.theme=theme;
  root.style.colorScheme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#1e242b':'#f2f3f5');
  void root.offsetHeight;
  const raf=requestAnimationFrame(()=>root.classList.remove('theme-switching'));
  try{localStorage.setItem('scada-theme',theme);}catch{}
  return()=>{cancelAnimationFrame(raf);root.classList.remove('theme-switching');};
 },[theme]);
 // Gizlenen alarm popup'lari sayfa yenilendiginde geri gelmesin (kural bazli shelving degil, gorunum tercihi).
 const [dismissed,setDismissed]=useState<string[]>(()=>{try{return JSON.parse(sessionStorage.getItem('scada-alarm-dismissed')||'[]');}catch{return [];}});
 const muted=!prefs.alarmSound.enabled,setMuted=(v:boolean)=>void savePrefs({...prefs,alarmSound:{...prefs.alarmSound,enabled:!v}});
 useEffect(()=>{try{sessionStorage.setItem('scada-alarm-dismissed',JSON.stringify(dismissed.slice(-500)));}catch{}},[dismissed]);
 const newScreenRef=useModal<HTMLDivElement>(newScreen,useCallback(()=>setNewScreen(false),[]));
 // B26: ekran duzeni (klasor / sira / ana ekran) ve Ctrl+K ile ekranlar arasi hizli gecis.
 const [layout,setLayout]=useState<{items:{id:string;name:string;folder:string}[];home:string}|null>(null),[layoutBusy,setLayoutBusy]=useState(false);
 const [jump,setJump]=useState<string|null>(null);
 // B39: kritik islemde parola tazeleme penceresi; api() 403/REAUTH_REQUIRED alinca acar.
 const [reauth,setReauth]=useState<{resolve:(ok:boolean)=>void;password:string;error:string;busy:boolean}|null>(null);
 const reauthRef=useModal<HTMLDivElement>(!!reauth,useCallback(()=>{setReauth(r=>{r?.resolve(false);return null;});},[]));
 useEffect(()=>{setReauthHandler(()=>new Promise<boolean>(resolve=>setReauth({resolve,password:'',error:'',busy:false})));return()=>setReauthHandler(null);},[]);
 async function submitReauth(){
  if(!reauth)return;setReauth({...reauth,busy:true,error:''});
  try{await api('/reauth','POST',{password:reauth.password});reauth.resolve(true);setReauth(null);}
  catch(e){setReauth(r=>r?{...r,busy:false,error:(e as Error).message}:r);}
 }
 const layoutRef=useModal<HTMLDivElement>(!!layout,useCallback(()=>setLayout(null),[]));
 const jumpRef=useModal<HTMLDivElement>(jump!==null,useCallback(()=>setJump(null),[]));
 // Ctrl+K: ekran adiyla arayip dogrudan gecis (operator ekranlar arasinda kaybolmasin).
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setJump(j=>j===null?'':null);}if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='b'&&!(e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true]')){e.preventDefault();setNavCollapsed(c=>!c);}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 const seen=useRef<string[]>([]);
 const [fullscreenHost,setFullscreenHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{const sync=()=>setFullscreenHost((document.fullscreenElement as HTMLElement)||null);sync();document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[]);
 // Bildirim turleri ayrilir; hata mesaji basari isaretiyle gosterilmez.
 const notify=useCallback((s:string,tone:'info'|'error'='info')=>{setToast(s?{text:s,tone}:null);},[]);
 const projectFetchedAt=useRef(0);
 const refresh=useCallback(async()=>{const p=await api('/project');projectFetchedAt.current=Date.now();setProject(p);},[]);
 // Geçişte bekletmez; yalnız veri bayatsa arka planda tazeler (bkz. routing.ts projectStale).
 const refreshIfStale=useCallback(()=>{if(projectStale(projectFetchedAt.current,Date.now()))void refresh().catch(()=>{});},[refresh]);
 // Oturum her yerde ayni sekilde biter: kullanici dusurulur, neden gosterilir, yeniden baglanma denenmez.
 useEffect(()=>{setSessionEndHandler(()=>{setUser(null);setProject(null);setLive(emptyLive);setSessionEnded(true);});return()=>setSessionEndHandler(null);},[]);
 useEffect(()=>{api('/session').then(r=>{setUser(r.user);setSetup(r.setup);setDefaultLogin(r.defaultLogin||null);setChecked(true);}).catch(e=>{setChecked(true);notify(e.message,'error');});},[]);
 useEffect(()=>{if(!user)return;void refresh();let stopped=false,ws:WebSocket,timer:ReturnType<typeof setTimeout>;function connect(){ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/live?proto=2`);ws.onopen=()=>setConnected(true);ws.onmessage=e=>{const m=JSON.parse(e.data);setLive(prev=>applyLive(prev,m));lastMessage.current=Date.now();};ws.onclose=()=>{setConnected(false);if(stopped)return;attempts++;if(attempts>=3){void api('/session').then(r=>{if(!r.user){setUser(null);setSessionEnded(true);return;}attempts=0;timer=setTimeout(connect,1500);}).catch(()=>{timer=setTimeout(connect,4000);});return;}timer=setTimeout(connect,Math.min(1500*attempts,8000));};}let attempts=0;connect();return()=>{stopped=true;clearTimeout(timer);ws?.close();};},[user]);
 // Ilk yukleme: URL'den sayfa/ekran okunur; gecersiz yol veya ekran varsayilana duser ve URL duzeltilir.
 useEffect(()=>{if(!project||inited.current)return;inited.current=true;const defId=homeScreenId(project);const parsed=parsePath(location.pathname);let p='runtime',sid=defId;if(parsed){if(parsed.page==='runtime'||parsed.page==='editor'||parsed.page==='preview'){p=parsed.page;sid=parsed.screenId&&project.screens.some(s=>s.id===parsed.screenId)?parsed.screenId:defId;}else{p=parsed.page;}}setPage(p);setScreenId(sid);history.replaceState({page:p,screenId:sid},'',pathFor(p,sid,defId));},[project]);
 // Tarayici geri/ileri: kaydedilmemis degisiklik varsa leave.current() kullaniciya sorar; vazgecilirse URL geri alinir.
 useEffect(()=>{const onPop=()=>{const defId=project?homeScreenId(project):'';const oldUrl=pathFor(page,screenId,defId);(async()=>{if(!(await leave.current())){history.pushState({page,screenId},'',oldUrl);return;}refreshIfStale();const parsed=parsePath(location.pathname);let p='runtime',sid=defId;if(parsed){if(parsed.page==='runtime'||parsed.page==='editor'||parsed.page==='preview'){p=parsed.page;sid=parsed.screenId&&project?.screens.some(s=>s.id===parsed.screenId)?parsed.screenId:defId;if(sid!==parsed.screenId)history.replaceState({page:p,screenId:sid},'',pathFor(p,sid,defId));}else{p=parsed.page;}}else{history.replaceState({page:p,screenId:sid},'',pathFor(p,sid,defId));}setPage(p);setScreenId(sid);})();};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);},[page,screenId,project,refresh]);
 useEffect(()=>{if(!toast||toast.tone==='error')return;const t=setTimeout(()=>setToast(null),6500);return()=>clearTimeout(t);},[toast]);
 // Canlı veri tazeliği: aralık yalnız boolean değiştiğinde durum yazar (aynı değer render tetiklemez).
 const [recentMessage,setRecentMessage]=useState(false);
 useEffect(()=>{const tick=()=>setRecentMessage(Date.now()-lastMessage.current<4000);tick();const t=setInterval(tick,500);return()=>clearInterval(t);},[]);
 const fresh=connected&&recentMessage;
 const safeLive=fresh?live:{...live,gatewayConnected:false,controlReady:false,devicesReady:0,devices:live.devices.map(x=>({...x,status:'down' as const,good:0})),samples:Object.fromEntries(Object.entries(live.samples).map(([id,s])=>[id,{...s,quality:'stale' as const}]))};
 const alarms=safeLive.alarms||[];
 const unacked=alarms.filter(a=>!a.ackAt);
 // Yayindaki liste kesilmis olabilir; gercek toplam sayaclardan gelir.
 const unackedTotal=Math.max(unacked.length,safeLive.alarmCounts.unackedOutstanding);
 const popupAlarms=unacked.filter(a=>a.popup&&!dismissed.includes(a.id));
 // Genel gosterge en kotu kritik baglantidan uretilir; kopru heartbeat'i PLC sagligi sayilmaz.
 const systemStatus=!connected?{tone:'bad',text:'Sunucu bağlantısı yok'}
  :!fresh?{tone:'bad',text:'Sunucu verisi bekleniyor'}
  :!safeLive.gatewayConnected?{tone:'bad',text:'Köprü bağlı değil'}
  :safeLive.deploying?{tone:'warn',text:'Yapılandırma uygulanıyor'}
  :safeLive.devicesTotal===0?{tone:'warn',text:'Etkin cihaz yok'}
  :safeLive.devicesReady<safeLive.devicesTotal?{tone:'warn',text:`${safeLive.devicesReady}/${safeLive.devicesTotal} cihaz güncel`}
  :safeLive.activeRevision!==safeLive.desiredRevision?{tone:'warn',text:'Yapılandırma uygulanmadı'}
  :{tone:'good',text:'Kumanda hazır'};
 // Pano (kiosk): acilista Panelim'e gecilir, kabuk (kenar cubugu + ust cubuk) gizlenir; durum bandi kalir.
 const kioskShell=prefs.kiosk.enabled&&prefs.kiosk.hideChrome&&page==='dashboard';
 const kioskStarted=useRef(false);
 useEffect(()=>{if(!project||!prefs.kiosk.enabled||kioskStarted.current)return;kioskStarted.current=true;if(page!=='dashboard')void navigate('dashboard');},[project,prefs.kiosk.enabled]);
 const notices=statusNotices({connected,fresh,live:safeLive,build,clientBuild:__BUILD_ID__,isAdmin:user?.role==='admin',update});
 const statusDetail=['Sunucu: '+(connected&&fresh?'bağlı':'bağlı değil'),'Köprü: '+(safeLive.gatewayConnected?'bağlı':'bağlı değil'),
  ...safeLive.devices.map(d=>`${d.code}: ${deviceStatusLabels[d.status]} (${d.good}/${d.tags} etiket)`),
  'Kumanda: '+(safeLive.controlReady?'hazır':'hazır değil')].join(' · ');
 useEffect(()=>{const fresh=unacked.filter(a=>a.popup&&!seen.current.includes(a.id));
  seen.current=unacked.map(a=>a.id);
  const rank={info:0,warning:1,critical:2} as const,loud=fresh.filter(a=>rank[a.severity]>=rank[prefs.alarmSound.minSeverity]);
  if(!loud.length||muted)return;
  try{const ctx=new (window.AudioContext||(window as any).webkitAudioContext)();const osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type='square';osc.frequency.value=loud.some(a=>a.severity==='critical')?880:620;gain.gain.value=.05;
   osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.35);
   setTimeout(()=>void ctx.close().catch(()=>{}),600);}catch{}
 },[unacked.map(a=>a.id).join(','),muted]);
 async function ackAlarms(ids?:string[]){try{await api('/alarms/ack','POST',ids?{ids}:{});}catch(e){notify((e as Error).message,'error');}}
 if(!checked)return <div className="loading"><Activity/> SCADA başlatılıyor…</div>;
 if(!user)return <Login setup={setup} defaultLogin={defaultLogin} onLogin={u=>{setUser(u);setSetup(false);setDefaultLogin(null);}} notify={notify} toast={toast?.text||''} sessionEnded={sessionEnded}/>;
 if(!project)return <div className="loading">Proje yükleniyor…</div>;
 const record=project.screens.find(s=>s.id===screenId)||project.screens[0],isStudio=['runtime','editor','preview'].includes(page),canEdit=['admin','designer'].includes(user.role);
 // Kisisel acilis ekrani tesis ana ekranini gecersiz kilar (B32).
 const defaultScreenId=(prefs.homeScreenId&&project.screens.some(sc=>sc.id===prefs.homeScreenId)?prefs.homeScreenId:homeScreenId(project)),mgmtLabel:Record<string,string>={devices:t('nav.devices'),tags:t('nav.tags'),commands:t('nav.commands'),alarms:t('nav.alarms'),audit:t('nav.audit'),dashboard:t('nav.dashboard'),reports:'Vardiya raporu',energy:'Enerji analizörleri',settings:t('nav.settings')};
 const pushUrl=(p:string,sid:string,replace?:boolean)=>{const url=pathFor(p,sid,defaultScreenId);if(!replace&&location.pathname===url)return;history[replace?'replaceState':'pushState']({page:p,screenId:sid},'',url);};
 const navigate=async(p:string,sid?:string)=>{if(!(await leave.current()))return;refreshIfStale();const nextSid=sid??screenId;setPage(p);if(sid)setScreenId(sid);pushUrl(p,nextSid);};
 const selectScreen=async(id:string)=>{if(!(await leave.current()))return;refreshIfStale();setScreenId(id);const p=isStudio?page:'runtime';if(!isStudio)setPage('runtime');pushUrl(p,id);};
 function openLayout(){setLayout({items:sortScreens(project!.screens).map(s=>({id:s.id,name:s.name,folder:s.folder||''})),home:defaultScreenId});}
 function moveLayoutItem(index:number,delta:number){setLayout(l=>{if(!l)return l;const items=[...l.items],to=index+delta;if(to<0||to>=items.length)return l;const [m]=items.splice(index,1);items.splice(to,0,m);return {...l,items};});}
 async function saveLayout(){
  if(!layout)return;setLayoutBusy(true);
  try{await api('/screens/layout','PUT',{items:layout.items.map((it,i)=>({id:it.id,folder:it.folder.trim(),order:i})),homeScreenId:layout.home});await refresh();setLayout(null);notify('Ekran düzeni kaydedildi.');}
  catch(e){notify((e as Error).message,'error');}
  finally{setLayoutBusy(false);}
 }
 async function createScreenFromTemplate(templateId:ScreenTemplateId,customName?:string){
  try{
   const s=buildScreenTemplate(templateId,crypto.randomUUID(),customName);
   await api('/screens','POST',s);
   await refresh();
   setScreenId(s.id);
   setPage('editor');
   setNewScreen(false);
   notify(s.name+' şablonu ile ekran oluşturuldu.');
  }catch(e){notify((e as Error).message,'error');}
 }
 async function createScreen(){
  if(screenTemplate!=='blank'&&screenTemplate!=='current'){
   await createScreenFromTemplate(screenTemplate as ScreenTemplateId,screenName);
   return;
  }
  try{const base=screenTemplate==='blank'?{width:1200,height:700,widgets:[],symbolStyle:newScreenSymbolStyle}:structuredClone(record.draft);const s={...base,id:crypto.randomUUID(),name:screenName};await api('/screens','POST',s);await refresh();setScreenId(s.id);setPage('editor');setNewScreen(false);}catch(e){notify((e as Error).message,'error');}
 }
 const pickNewTemplate=(id:string)=>{
  const prevTpl=screenTemplates.find(t=>t.id===screenTemplate);
  const nextTpl=screenTemplates.find(t=>t.id===id);
  setScreenTemplate(id);
  if(nextTpl&&(screenName==='Yeni ekran'||(prevTpl&&screenName===prevTpl.name)))setScreenName(nextTpl.name);
  else if(!nextTpl&&prevTpl&&screenName===prevTpl.name)setScreenName('Yeni ekran');
 };
 return <div className={'app-shell'+(kioskShell?' kiosk':'')}>{mobileNav&&<div className="mobile-nav-backdrop" onClick={()=>setMobileNav(false)}/>}<aside className={'sidebar'+(navCollapsed?' collapsed':'')+(mobileNav?' mobile-open':'')} onClick={e=>{if(mobileNav&&(e.target as HTMLElement).closest('nav button,.screen-row>button:first-child'))setMobileNav(false);}}><div className="sidebar-head"><a className="brand" href="/" title="Z SCADA" onClick={e=>{e.preventDefault();void navigate('runtime');}}><img className="brand-logo" src="/logo.svg" alt="" width={28} height={28}/><span className="brand-text">Z SCADA<span className="brand-sub" title={project.config.name}>{project.config.name}</span></span></a><button className={'nav-toggle'+(navCollapsed?' is-collapsed':'')} aria-label={navCollapsed?'Menüyü aç':'Menüyü daralt'} title={(navCollapsed?'Menüyü aç':'Menüyü daralt')+' · Ctrl+B'} onClick={()=>setNavCollapsed(c=>!c)}><span className="burger" aria-hidden="true"><i/><i/><i/></span></button></div>{/* Kisisel sabitlenen ekranlar: kenar cubugunun en ustunde, operator ekraninda acilir. */}{(()=>{const pins=prefs.pinnedScreenIds.map(id=>project.screens.find(x=>x.id===id)).filter(Boolean) as ScreenRecord[];return pins.length>0&&<div><div className="nav-label">Sabitlenenler</div><nav>{pins.map(sc=><button key={sc.id} title={sc.name} className={page==='runtime'&&record.id===sc.id?'active':''} onClick={()=>void navigate('runtime',sc.id)}><Pin size={16}/><span>{sc.name}</span></button>)}</nav></div>;})()}{[{label:'İzleme',items:[{id:'runtime',label:t('nav.runtime'),icon:MonitorIcon},{id:'dashboard',label:t('nav.dashboard'),icon:PanelIcon},{id:'alarms',label:t('nav.alarms'),icon:BellIcon},{id:'audit',label:t('nav.audit'),icon:HistoryIcon},{id:'reports',label:'Vardiya raporu',icon:ReportIcon},{id:'energy',label:'Enerji',icon:EnergyIcon}]},{label:'Mühendislik',items:[{id:'editor',label:t('nav.editor'),icon:StudioIcon},{id:'devices',label:t('nav.devices'),icon:DevicesIcon},{id:'tags',label:t('nav.tags'),icon:TagsIcon},{id:'commands',label:t('nav.commands'),icon:CommandsIcon}]}].map(g=>({...g,items:g.items.filter(n=>n.id!=='editor'||canEdit)})).filter(g=>g.items.length).map(g=><div key={g.label}><div className="nav-label">{g.label}</div><nav>{g.items.map(n=><button key={n.id} title={n.label} className={page===n.id||page==='preview'&&n.id==='editor'?'active':''} onClick={()=>navigate(n.id)}><n.icon size={17} strokeWidth={1.7}/><span>{n.label}</span>{n.id==='devices'&&<small>{project.config.devices.length}</small>}{n.id==='alarms'&&unackedTotal>0&&<small className="alarm-count">{unackedTotal}</small>}</button>)}</nav></div>)}<div className="nav-label screens-label"><span>Ekranlar</span><button aria-label="Ekranlar arasında geç (Ctrl+K)" title="Ekranlar arasında geç · Ctrl+K" onClick={()=>setJump('')}><Search size={13}/></button>{canEdit&&<><button aria-label="Ekran düzeni" title="Ekran düzeni: klasör, sıra, ana ekran" onClick={openLayout}><Layers size={13}/></button><button aria-label="Yeni ekran" onClick={()=>{setScreenName('Yeni ekran');setScreenTemplate('blank');setNewScreen(true);}}><Plus size={14}/></button></>}</div><div className="screen-nav">{screenTree(project.screens).map(group=><div className="screen-folder" key={group.folder||'root'}>{group.folder&&<span>{group.folder}</span>}{group.screens.map(s=>{const pinned=prefs.pinnedScreenIds.includes(s.id);return <div key={s.id} className={'screen-row'+(pinned?' pinned':'')}><button title={s.name} className={record.id===s.id&&isStudio?'current':''} onClick={()=>void selectScreen(s.id)}><span className="screen-dot"/><span className="screen-name">{s.name}</span>{s.id===defaultScreenId&&<Home size={11}/>} {s.publishedVersion===0&&<small>Taslak</small>}</button><button className="screen-pin" aria-label={pinned?'Sabitlemeyi kaldır':'Üste sabitle'} title={pinned?'Sabitlemeyi kaldır':'Üste sabitle'} onClick={()=>void savePrefs({...prefs,pinnedScreenIds:pinned?prefs.pinnedScreenIds.filter(x=>x!==s.id):[...prefs.pinnedScreenIds,s.id].slice(-12)})}>{pinned?<PinOff size={12}/>:<Pin size={12}/>}</button></div>;})}</div>)}</div><div className="sidebar-bottom"><div className={'gateway-mini '+(safeLive.gatewayConnected?'online':'')} title={safeLive.gatewayConnected?'Haberleşme aktif':'Haberleşme bekleniyor'}><CommIcon size={17} strokeWidth={1.7}/><div><strong>{safeLive.gatewayConnected?'Haberleşme aktif':'Haberleşme bekleniyor'}</strong><small>Node-RED bağlantısı</small></div></div><button title="Proje ayarları" onClick={()=>navigate('settings')} className={page==='settings'?'active':''}><SettingsIcon size={17} strokeWidth={1.7}/><span>Proje ayarları</span></button><div className="profile"><span className="avatar" title={user.username}>{user.username.slice(0,2).toUpperCase()}</span><div><strong>{user.username}</strong><small>{{admin:'Yönetici',designer:'Tasarımcı',operator:'Operatör',viewer:'İzleyici'}[user.role]}</small></div><button aria-label="Oturumu kapat" onClick={()=>void api('/logout','POST').then(()=>setUser(null))}><LogoutIcon size={17} strokeWidth={1.7}/></button></div></div></aside>
 <main className="main">{cluster&&cluster.role!=='primary'&&<div className="warning standby-bar" role="alert">Bu sunucu <strong>pasif (yedek)</strong> modda. Ekranlar izlenebilir; komut ve haberleşme uygulaması aktif sunucuda yapılır{cluster.activeInstance?' ('+cluster.activeInstance+')':''}.</div>}<header className="topbar"><button className="mobile-menu" aria-label="Menüyü aç" aria-expanded={mobileNav} onClick={()=>setMobileNav(true)}><span className="burger" aria-hidden="true"><i/><i/><i/></span></button><div className="breadcrumbs"><span>Çalışma alanı</span><span>/</span>{isStudio?<><span>{page==='runtime'?'Operatör ekranı':page==='editor'?'Tasarım stüdyosu':'Önizleme'}</span><span>/</span><strong className="crumb-link" role="link" tabIndex={0} onClick={()=>void navigate('runtime')} onKeyDown={e=>{if(e.key==='Enter')void navigate('runtime');}}>{record.name}</strong></>:<strong>{mgmtLabel[page]}</strong>}</div><div className="top-status"><span className={'top-telemetry '+systemStatus.tone} title={statusDetail}><span className={'connection-dot '+systemStatus.tone}/><span>{systemStatus.text}</span></span><NoticeCenter notices={notices}/><button className={'alarm-bell '+(unackedTotal?'ringing':'')} title={unackedTotal?unackedTotal+' onaylanmamış alarm'+(unackedTotal>unacked.length?` (${unacked.length} tanesi listede)`:''):'Aktif alarm yok'} aria-label="Alarmlar" onClick={()=>void navigate('alarms')}><BellIcon size={16} strokeWidth={1.7}/>{unackedTotal>0&&<span>{unackedTotal}</span>}</button><TopClock/><button type="button" className="prefs-toggle" title={t('common.preferences')} aria-label={t('common.preferences')} onClick={()=>setPrefsOpen(true)}><SettingsIcon size={16} strokeWidth={1.7}/></button><button type="button" className="theme-toggle" aria-label={theme==='dark'?'Aydınlık temaya geç':'Koyu temaya geç'} title={theme==='dark'?'Aydınlık tema':'Koyu tema'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<SunIcon size={16} strokeWidth={1.7}/>:<MoonIcon size={16} strokeWidth={1.7}/>}</button></div></header>
 {/* Operator ekraninda kabuk dar: duzenleme yetkisi yoksa baslik hic yok (tek 'Canli' dugmesi anlamsizdi), tasarim/onizlemede baslik tek editör barina tasindi. */}{isStudio&&page==='runtime'&&canEdit&&<div className="workspace-heading compact"><div><div className="eyebrow">Canlı izleme</div><h1>Operatör ekranı</h1></div><div className="mode-switch"><button className="active" onClick={()=>navigate('runtime')}><Monitor size={15}/>Canlı</button><button onClick={()=>navigate('editor')}><PenTool size={15}/>Tasarım</button><button onClick={()=>navigate('preview')}><Eye size={15}/>Önizleme</button></div></div>}
 {isStudio?<>{page==='runtime'&&narrow&&<div className="runtime-view-switch" role="radiogroup" aria-label="Görünüm"><button role="radio" aria-checked={runtimeView==='list'} onClick={()=>setRuntimeView('list')}>Liste</button><button role="radio" aria-checked={runtimeView==='canvas'} onClick={()=>setRuntimeView('canvas')}>Çizim</button></div>}{page==='runtime'&&narrow&&runtimeView==='list'?<RuntimeList screen={record.published||record.draft} config={project.config} live={safeLive}/>:<Studio key={record.id+'-'+page} record={record} records={project.screens} config={project.config} live={safeLive} user={user} theme={theme} mode={page as any} canEdit={canEdit} onModeChange={m=>void navigate(m)} onRefresh={refresh} equipmentTypes={project.equipmentTypes} homeScreenId={project.homeScreenId||''} onScreen={id=>void selectScreen(id)} onCreateFromTemplate={id=>createScreenFromTemplate(id)} notify={notify} registerLeave={fn=>{leave.current=fn;}} language={prefs.language}/>}{page==='runtime'&&<div className="runtime-strip"><span title={statusDetail}><span className={'connection-dot '+systemStatus.tone}/> {Object.values(safeLive.samples).filter(s=>s.quality==='good').length} / {project.config.tags.length} etiket güncel</span>{/* Son 3 komut; dogrulanamayan/basarisiz sonuc 10 dk vurgulu kalir — bir sonraki komutla kaybolmasin. */}<span className="runtime-commands">{safeLive.commands.length?safeLive.commands.slice(0,3).map(c=>{const bad=['failed','rejected','unverified','partial','uncertain','aborted'].includes(c.status),recent=Date.now()-c.updatedAt<600000;return <span key={c.id} className={'cmd-chip'+(bad&&recent?' bad':c.status==='verified'||c.status==='completed'?' ok':'')} title={c.name+' · '+statusLabel(c.status)+' · '+new Date(c.updatedAt).toLocaleTimeString('tr-TR')+(c.message?' · '+c.message:'')}>{c.name} · {statusLabel(c.status)}{/* Calisan script operator seridinden de durdurulur; guvenli durum sunucuda yazilir. */c.status==='running'&&(user.role==='admin'||user.role==='operator')&&<button className="cmd-stop" onClick={()=>void api('/commands/'+encodeURIComponent(c.id)+'/stop','POST').then(()=>notify('Script durduruldu; güvenli durum yazılıyor.')).catch(e=>notify((e as Error).message,'error'))}>Durdur</button>}</span>;}):'Henüz komut gönderilmedi.'}</span><button onClick={()=>navigate('audit')}>İşlem kayıtları <ArrowRight size={13}/></button></div>}</>:page==='energy'?<Suspense fallback={pageLoading}><Energy config={project.config} live={safeLive} user={user} notify={notify}/></Suspense>:page==='dashboard'?<Suspense fallback={pageLoading}><Panel prefs={prefs} config={project.config} live={safeLive} onSave={next=>void savePrefs(next)}/></Suspense>:<Suspense fallback={pageLoading}><Management key={page} page={page} config={project.config} live={safeLive} screens={project.screens} user={user} refresh={refresh} notify={notify} onScreen={id=>void navigate('runtime',id)} prefs={prefs} onPrefs={p=>void savePrefs(p)}/></Suspense>}
 </main>{fullscreenHost&&notices.length>0&&createPortal(<NoticeCenter notices={notices} floating/>,fullscreenHost)}{popupAlarms.length>0&&createPortal(<AlarmPopup alarms={popupAlarms} muted={muted} onMute={v=>setMuted(v)} canAck={['admin','operator'].includes(user.role)} onAck={ids=>void ackAlarms(ids)} onDismiss={ids=>setDismissed(d=>[...d,...ids])} onOpen={()=>{setDismissed(d=>[...d,...popupAlarms.map(a=>a.id)]);if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});void navigate('alarms');}}/>,fullscreenHost||document.body)}{toast&&createPortal(<div className={'toast '+toast.tone} role={toast.tone==='error'?'alert':'status'}>{toast.tone==='error'?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}<span>{toast.text}</span><button aria-label="Kapat" onClick={()=>setToast(null)}><X size={16}/></button></div>,fullscreenHost||document.body)}{prefsOpen&&<div className="modal-backdrop"><div ref={prefsRef} className="modal" role="dialog" aria-modal="true" aria-label={t('common.preferences')}>
 <div className="modal-heading"><h2>{t('common.preferences')}</h2><button className="tool" aria-label="Kapat" onClick={()=>setPrefsOpen(false)}><X size={16}/></button></div>
 <p className="small muted">Tercihler hesabınıza kayıtlıdır; başka bilgisayarda aynı hesapla girdiğinizde de geçerlidir.</p>
 <Field label="Tema"><select value={prefs.theme} onChange={e=>{const v=e.target.value as Preferences['theme'];void savePrefs({...prefs,theme:v});if(v!=='system')setTheme(v);}}><option value="system">Sistem</option><option value="light">Aydınlık</option><option value="dark">Koyu</option></select></Field>
 <Field label="Dil / Language"><select value={prefs.language} onChange={e=>void savePrefs({...prefs,language:e.target.value as Preferences['language']})}><option value="tr">Türkçe</option><option value="en">English (kısmi)</option></select></Field>
 <Field label="Yoğunluk"><select value={prefs.density} onChange={e=>void savePrefs({...prefs,density:e.target.value as Preferences['density']})}><option value="comfortable">Rahat</option><option value="compact">Sıkışık</option><option value="large">Büyük · tablet / dokunmatik</option></select></Field>
 <Field label="Alarm sesi"><select value={prefs.alarmSound.enabled?prefs.alarmSound.minSeverity:'off'} onChange={e=>{const v=e.target.value;void savePrefs({...prefs,alarmSound:v==='off'?{...prefs.alarmSound,enabled:false}:{enabled:true,minSeverity:v as Preferences['alarmSound']['minSeverity']}});}}><option value="info">Her yeni alarmda</option><option value="warning">Uyarı ve kritikte</option><option value="critical">Yalnız kritikte</option><option value="off">Kapalı</option></select></Field>
 <Field label="Açılış ekranım"><select value={prefs.homeScreenId} onChange={e=>void savePrefs({...prefs,homeScreenId:e.target.value})}><option value="">Tesis ana ekranı</option>{project.screens.map(sc=><option key={sc.id} value={sc.id}>{sc.name}</option>)}</select></Field>
 <div className="property-section">Pano (duvar monitörü)</div>
 <label className="check"><input type="checkbox" checked={prefs.kiosk.enabled} onChange={e=>void savePrefs({...prefs,kiosk:{...prefs.kiosk,enabled:e.target.checked}})}/>Pano modu · açılışta Panelim, menüler gizli</label>
 {prefs.kiosk.enabled&&<><Field label="Sayfalar arasında dön"><select value={prefs.kiosk.rotateSeconds} onChange={e=>void savePrefs({...prefs,kiosk:{...prefs.kiosk,rotateSeconds:Number(e.target.value)}})}><option value={0}>Dönme</option>{[10,20,30,60,120,300].map(n=><option key={n} value={n}>{n<60?n+' saniyede bir':n/60+' dakikada bir'}</option>)}</select></Field>
  <label className="check"><input type="checkbox" checked={prefs.kiosk.autoFullscreen} onChange={e=>void savePrefs({...prefs,kiosk:{...prefs.kiosk,autoFullscreen:e.target.checked}})}/>İlk dokunuşta tam ekran</label>
  <label className="check"><input type="checkbox" checked={prefs.kiosk.hideChrome} onChange={e=>void savePrefs({...prefs,kiosk:{...prefs.kiosk,hideChrome:e.target.checked}})}/>Menüleri gizle</label></>}
 <div className="modal-actions"><button className="btn" onClick={()=>setPrefsOpen(false)}>Kapat</button></div>
</div></div>}
{reauth&&<div className="modal-backdrop"><div ref={reauthRef} className="modal" role="dialog" aria-modal="true" aria-label="Parolayı doğrulayın">
 <div className="modal-heading"><h2>Parolanızı doğrulayın</h2></div>
 <p className="small muted">Bu işlem hesap yönetimi veya proje bütünlüğü ile ilgili. Oturumunuz açık olsa da parolanız isteniyor.</p>
 <Field label="Parola"><input type="password" autoFocus value={reauth.password} onChange={e=>setReauth(r=>r?{...r,password:e.target.value}:r)} onKeyDown={e=>{if(e.key==='Enter')void submitReauth();}}/></Field>
 {reauth.error&&<p className="login-error" role="alert">{reauth.error}</p>}
 <div className="modal-actions"><button className="btn" onClick={()=>{reauth.resolve(false);setReauth(null);}}>Vazgeç</button><button className="btn primary" disabled={reauth.busy||!reauth.password} onClick={()=>void submitReauth()}>{reauth.busy?'Doğrulanıyor…':'Doğrula ve devam et'}</button></div>
</div></div>}
{layout&&<div className="modal-backdrop"><div ref={layoutRef} className="modal" role="dialog" aria-modal="true" aria-label="Ekran düzeni"><div className="modal-heading"><h2>Ekran düzeni</h2><button className="tool" aria-label="Kapat" onClick={()=>setLayout(null)}><X size={16}/></button></div>
 <p className="small muted">Klasör adı yazarak ekranları gruplayın, oklarla sırayı değiştirin, ana ekranı seçin. Operatör açılışta ana ekranı görür.</p>
 <datalist id="ekran-klasorleri">{[...new Set(layout.items.map(i=>i.folder).filter(Boolean))].map(f=><option key={f} value={f}/>)}</datalist>
 <div className="layout-rows">{layout.items.map((it,i)=><div className="layout-row" key={it.id}>
  <button className="tool" aria-label="Yukarı taşı" disabled={i===0} onClick={()=>moveLayoutItem(i,-1)}><ChevronUp size={14}/></button>
  <button className="tool" aria-label="Aşağı taşı" disabled={i===layout.items.length-1} onClick={()=>moveLayoutItem(i,1)}><ChevronDown size={14}/></button>
  <strong>{it.name}</strong>
  <input className="screen-folder-input" list="ekran-klasorleri" value={it.folder} placeholder="Klasör (boş = kök)" aria-label={it.name+' klasörü'} onChange={e=>setLayout(l=>l?{...l,items:l.items.map(x=>x.id===it.id?{...x,folder:e.target.value}:x)}:l)}/>
  <button className={'tool'+(layout.home===it.id?' active':'')} aria-label={it.name+' ana ekran olsun'} title="Ana ekran yap" aria-pressed={layout.home===it.id} onClick={()=>setLayout(l=>l?{...l,home:it.id}:l)}><Home size={14}/></button>
 </div>)}</div>
 <div className="modal-actions"><button className="btn" onClick={()=>setLayout(null)}>Vazgeç</button><button className="btn primary" disabled={layoutBusy} onClick={()=>void saveLayout()}>{layoutBusy?'Kaydediliyor…':'Kaydet'}</button></div></div></div>}
{jump!==null&&(()=>{const q=jump.trim().toLocaleLowerCase('tr'),hits=sortScreens(project.screens).filter(s=>!q||s.name.toLocaleLowerCase('tr').includes(q));
 return <div className="modal-backdrop" onPointerDown={()=>setJump(null)}><div ref={jumpRef} className="modal screen-jump" role="dialog" aria-modal="true" aria-label="Ekrana geç" onPointerDown={e=>e.stopPropagation()}>
  <input autoFocus value={jump} placeholder="Ekran adı yazın" aria-label="Ekran ara" onChange={e=>setJump(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&hits[0]){setJump(null);void selectScreen(hits[0].id);}}}/>
  <div className="jump-list">{hits.length?hits.map(s=><button key={s.id} onClick={()=>{setJump(null);void selectScreen(s.id);}}><span className="screen-dot"/>{s.name}{s.folder?<small>{s.folder}</small>:null}{s.id===defaultScreenId&&<Home size={11}/>}</button>):<p className="small muted">Eşleşen ekran yok.</p>}</div>
 </div></div>;})()}
{newScreen&&<div className="modal-backdrop" onPointerDown={()=>setNewScreen(false)}><div ref={newScreenRef} className="modal template-modal" role="dialog" aria-modal="true" aria-label="Yeni SCADA ekranı" onPointerDown={e=>e.stopPropagation()}>
 <div className="modal-heading"><h2>Yeni SCADA ekranı</h2><button className="tool" aria-label="Kapat" onClick={()=>setNewScreen(false)}><X size={16}/></button></div>
 <Field label="Ekran adı"><input value={screenName} onChange={e=>setScreenName(e.target.value)}/></Field>
 <div className="property-section">Başlangıç düzeni</div>
 <div role="radiogroup" aria-label="Başlangıç düzeni ve şablonlar" onKeyDown={e=>{
  if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key))return;
  e.preventDefault();
  const order=['blank','current',...screenTemplates.map(t=>t.id)];
  const idx=Math.max(0,order.indexOf(screenTemplate));
  const delta=e.key==='ArrowRight'||e.key==='ArrowDown'?1:-1;
  const nextId=order[(idx+delta+order.length)%order.length];
  pickNewTemplate(nextId);
  const radios=e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
  radios[(idx+delta+order.length)%order.length]?.focus();
 }}>
  <div className="template-base-row">
   <button type="button" role="radio" tabIndex={screenTemplate==='blank'?0:-1} aria-checked={screenTemplate==='blank'} className={'template-base-btn'+(screenTemplate==='blank'?' active':'')} onClick={()=>pickNewTemplate('blank')}>
    <strong>Boş ekran</strong><small>1200 × 700 · Detaylı stil</small>
   </button>
   <button type="button" role="radio" tabIndex={screenTemplate==='current'?0:-1} aria-checked={screenTemplate==='current'} className={'template-base-btn'+(screenTemplate==='current'?' active':'')} onClick={()=>pickNewTemplate('current')}>
    <strong>Mevcut ekranın kopyası</strong><small>{record.name} baz alınır</small>
   </button>
  </div>
  <div className="property-section">Hazır endüstriyel ekran şablonları · 5</div>
  <div className="template-gallery">
   {screenTemplates.map(tpl=>{const active=screenTemplate===tpl.id;return <button key={tpl.id} type="button" role="radio" tabIndex={active?0:-1} aria-checked={active} className={'template-card'+(active?' active':'')} onClick={()=>pickNewTemplate(tpl.id)}>
    <div className="template-card-preview" aria-hidden="true">{renderBackdropSvg(tpl.backdropVariant,'tpl-'+tpl.id)}</div>
    <div className="template-card-body">
     <span className="template-card-cat">{tpl.category}</span>
     <strong>{tpl.name}</strong>
     <small>{tpl.description}</small>
    </div>
   </button>;})}
  </div>
 </div>
 <div className="modal-actions"><button className="btn" onClick={()=>setNewScreen(false)}>Vazgeç</button><button className="btn primary" disabled={!screenName.trim()} onClick={()=>void createScreen()}>Oluştur</button></div>
</div></div>}</div>;
}
function AlarmPopup({alarms,canAck,muted,onAck,onDismiss,onOpen,onMute}:{alarms:AlarmEvent[];canAck:boolean;muted:boolean;onAck:(ids?:string[])=>void;onDismiss:(ids:string[])=>void;onOpen:()=>void;onMute:(v:boolean)=>void}){
 const worst=alarms.some(a=>a.severity==='critical')?'critical':alarms.some(a=>a.severity==='warning')?'warning':'info';
 return <div className="modal-backdrop alarm-backdrop" role="alertdialog" aria-label="Aktif alarm">
  <div className={'modal alarm-modal '+worst}>
   <div className="alarm-modal-head"><BellRing size={20}/><div><strong>{alarms.length>1?alarms.length+' aktif alarm':'Alarm'}</strong><small>{severityLabels[worst as 'critical']} · onay bekliyor</small></div>
    <button className="tool" title={muted?'Sesi aç':'Sesi kapat'} aria-label={muted?'Sesi aç':'Sesi kapat'} onClick={()=>onMute(!muted)}>{muted?'🔇':'🔊'}</button></div>
   <div className="alarm-modal-list">{alarms.slice(0,8).map(a=><div key={a.id} className={'alarm-item '+a.severity}>
    <span className="alarm-severity">{severityLabels[a.severity]}</span>
    <div><strong>{a.name}</strong><small>{a.message}</small>
     <small className="mono">{a.tagCode} · {a.value===null?'—':String(a.value)} · {new Date(a.raisedAt).toLocaleTimeString('tr-TR')}{a.clearedAt?' · normale döndü':''}</small></div>
    {canAck&&<button className="btn small" onClick={()=>onAck([a.id])}><Check size={14}/>Onayla</button>}
   </div>)}{alarms.length>8&&<p className="small muted">ve {alarms.length-8} alarm daha…</p>}</div>
   <div className="modal-actions"><button className="btn" onClick={()=>onDismiss(alarms.map(a=>a.id))}>Şimdilik gizle</button><button className="btn" onClick={onOpen}>Alarm sayfası<ArrowRight size={15}/></button>{canAck&&<button className="btn primary" onClick={()=>onAck(alarms.map(a=>a.id))}><Check size={16}/>Tümünü onayla</button>}</div>
  </div></div>;
}
function Login({setup,defaultLogin,onLogin,notify,toast,sessionEnded}:{setup:boolean;defaultLogin?:{username:string;password:string}|null;onLogin:(u:User)=>void;notify:(s:string,tone?:'info'|'error')=>void;toast:string;sessionEnded?:boolean}){
 const [username,setUsername]=useState(defaultLogin?.username||'admin'),[password,setPassword]=useState(defaultLogin?.password||''),[busy,setBusy]=useState(false);
 return <div className="login-page">
  <section className="login-showcase" aria-label="Z SCADA Platform Özeti">
   <div className="login-brand">
    <img className="brand-logo" src="/logo.svg" alt="" width={34} height={34}/>
    <div><strong>Z SCADA</strong><span>Endüstriyel İzleme ve Kumanda Platformu</span></div>
   </div>
   <div className="login-showcase-media" aria-hidden="true">
    <LoginSchematic/>
   </div>
   <div className="login-showcase-foot">
    <div className="login-protocols">Modbus TCP/RTU · Siemens S7 · OPC UA · Beckhoff ADS · EtherNet/IP · MQTT · BACnet/IP · SNMP · SQL · REST</div>
    <ul className="login-pillars">
     <li>Çevrimdışı yerel çalışma</li>
     <li>Geri okuma doğrulamalı kumanda</li>
     <li>ISA-101 operatör arayüzü</li>
    </ul>
   </div>
  </section>
  <main className="login-stage">
   <div className="login-form">
    <span className="eyebrow">Kontrol stüdyosu</span>
    <h1>{setup?'Çalışma alanını oluşturun':'Çalışma alanına giriş'}</h1>
    <p>{setup?'İlk yönetici hesabınızı tanımlayın.':'Ekranlarınızı, cihazlarınızı ve saha kontrollerinizi yönetin.'}</p>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{if(setup)await api('/setup','POST',{username,password});const r=await api('/login','POST',{username,password});onLogin(r.user);}catch(e){notify((e as Error).message,'error');}finally{setBusy(false);}}}>
     <Field label="Kullanıcı adı"><input name="username" autoComplete="username" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)} required/></Field>
     <Field label={setup?'Parola · en az 12 karakter':'Parola'}><input name="password" autoComplete={setup?'new-password':'current-password'} type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={setup?12:1} required/></Field>
     {defaultLogin&&username===defaultLogin.username&&password===defaultLogin.password&&<p className="login-hint">İlk kurulum hesabı hazır. Giriş yaptıktan sonra <b>Proje ayarları → Kullanıcılar</b>'dan parolayı değiştirin ve kullanıcıları ekleyin.</p>}
     {sessionEnded&&!toast&&<p className="login-error" role="alert">Oturumunuz sona erdi. Kaydedilmemiş taslak değişiklikleri uygulanmadı; yeniden giriş yapın.</p>}
     {toast&&<p className="login-error" role="alert">{toast}</p>}
     <button className="btn primary" disabled={busy}>{busy?'Bekleyin…':setup?'Oluştur ve giriş yap':'Giriş yap'}<ArrowRight size={17}/></button>
    </form>
    <small>Yerel SCADA · Çok Protokollü Saha Ağ Geçidi</small>
   </div>
  </main>
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
