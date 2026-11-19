import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Store} from './store';
import {newScreenSymbolStyle,validateConfig,validateScreen,validateAlarms,validateEquipmentTypes,type Config,type ScreenRecord,type Screen} from '../../../packages/contracts/model';
/* --- Proje yoneticisi -------------------------------------------------------
 * Veritabaninda her zaman TEK calisan proje vardir; digerleri `projects/`
 * altinda JSON anlik goruntusu olarak arsivlenir. Proje degistirmek:
 *   1) calisan projeyi kendi dosyasina kaydet (kayip olmaz),
 *   2) secilen anlik goruntuyu veritabanina yukle.
 * Guvenlik (B06): yuklenen projede cihazlar PASIF gelir ve PLC koprusune hic
 * dokunulmaz; sahada calisan yapilandirma, kullanici "Haberlesmeye uygula"
 * diyene kadar degismez. Denetim, alarm gecmisi ve historian sahaya aittir;
 * projeyle degismez.
 */
export const PROJECT_SNAPSHOT_VERSION=1;
export type ProjectMeta={id:string;name:string;savedAt:number;savedBy:string;screens:number;devices:number;tags:number};
export type ProjectSnapshot={kind:'dvp-scada-project';version:number;meta:ProjectMeta;
 config:Config;screens:ScreenRecord[];alarmRules:unknown[];equipmentTypes:unknown[];homeScreenId:string};
const idPattern=/^[a-zA-Z0-9_-]{1,80}$/;
export function projectsDir(directory:string){return path.join(directory,'projects');}
function fileOf(directory:string,id:string){if(!idPattern.test(id))throw Error('Geçersiz proje kimliği.');return path.join(projectsDir(directory),id+'.json');}
/** Calisan projenin kimligi; ilk cagrida uretilir ve saklanir. */
export function currentProjectId(store:Store){let id=store.get<string>('projectId');if(!id){id=randomUUID();store.set('projectId',id);}return id;}
export function snapshotOf(store:Store,savedBy:string):ProjectSnapshot{
 const config=store.config(),screens=store.screens();
 return {kind:'dvp-scada-project',version:PROJECT_SNAPSHOT_VERSION,
  meta:{id:currentProjectId(store),name:config.name,savedAt:Date.now(),savedBy,screens:screens.length,devices:config.devices.length,tags:config.tags.length},
  config,screens,alarmRules:store.alarmRules(),equipmentTypes:store.equipmentTypes(),homeScreenId:store.get<string>('homeScreenId')||''};
}
/** Atomik yazim: yarim dosya arsivi bozmasin. */
export function saveSnapshot(directory:string,snap:ProjectSnapshot){
 fs.mkdirSync(projectsDir(directory),{recursive:true});
 const file=fileOf(directory,snap.meta.id),tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(snap));fs.renameSync(tmp,file);
}
export function readSnapshot(directory:string,id:string):ProjectSnapshot{
 const file=fileOf(directory,id);if(!fs.existsSync(file))throw Error('Proje bulunamadı.');
 const snap=JSON.parse(fs.readFileSync(file,'utf8'));
 if(snap?.kind!=='dvp-scada-project')throw Error('Proje dosyası tanınmadı.');
 if(snap.version>PROJECT_SNAPSHOT_VERSION)throw Error('Proje dosyası bu sürümden yeni; uygulamayı güncelleyin.');
 return snap;
}
export function listProjects(directory:string):ProjectMeta[]{
 const dir=projectsDir(directory);if(!fs.existsSync(dir))return [];
 const out:ProjectMeta[]=[];
 for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){
  try{const s=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));if(s?.kind==='dvp-scada-project'&&s.meta&&idPattern.test(s.meta.id))out.push(s.meta);}catch{/* bozuk dosya listede gorunmez, silinmez */}
 }
 return out.sort((a,b)=>b.savedAt-a.savedAt);
}
/**
 * Anlik goruntuyu calisan projeye yukler. Once HER SEY dogrulanir, sonra tek
 * islemde yazilir: dogrulama hatasi calisan projeye dokunmaz. Cihazlar pasif.
 */
export function restoreSnapshot(store:Store,snap:ProjectSnapshot,actor:string){
 const config=validateConfig(snap.config);
 config.revision=store.config().revision+1;
 config.devices.forEach(d=>d.enabled=false);
 const ids=snap.screens.map(s=>s.draft.id);
 if(new Set(ids).size!==ids.length)throw Error('Ekran kimliği tekrar ediyor.');
 const records:ScreenRecord[]=snap.screens.map(r=>{
  const draft=validateScreen(r.draft,config,ids);
  const published=r.published?validateScreen(r.published,config,ids):null;
  return {...r,draft,published,publishedVersion:published?r.publishedVersion:0};
 });
 const rules=validateAlarms(snap.alarmRules||[],config);
 const types=validateEquipmentTypes(snap.equipmentTypes||[]);
 const home=records.some(r=>r.id===snap.homeScreenId)?snap.homeScreenId:'';
 store.transaction(()=>{
  store.set('config',config);store.saveAlarmRules(rules);store.saveEquipmentTypes(types);
  store.db.exec('DELETE FROM screens; DELETE FROM revisions;');
  for(const r of records){store.saveScreen(r);if(r.published)store.revision(r.published,r.publishedVersion);}
  store.set('homeScreenId',home||null);store.set('projectId',snap.meta.id);
  store.audit(actor,'project.opened',{id:snap.meta.id,name:config.name,screens:records.length,devices:config.devices.length});
 });
}
/** Bos proje: tek bos ekran; ekipman tipleri kutuphane oldugu icin tasinir. */
export function emptySnapshot(name:string,equipmentTypes:unknown[],actor:string):ProjectSnapshot{
 const id=randomUUID(),screenId='screen-'+randomUUID().slice(0,8);
 const draft:Screen={id:screenId,name:'Ana ekran',width:1920,height:1080,widgets:[],equipment:[],scenarios:[],links:[],background:'',symbolStyle:newScreenSymbolStyle,gridSize:10};
 return {kind:'dvp-scada-project',version:PROJECT_SNAPSHOT_VERSION,
  meta:{id,name,savedAt:Date.now(),savedBy:actor,screens:1,devices:0,tags:0},
  config:{revision:1,name,connections:[],devices:[],tags:[],commands:[]} as Config,
  screens:[{id:screenId,name:draft.name,version:1,publishedVersion:0,draft,published:null}],
  alarmRules:[],equipmentTypes,homeScreenId:screenId};
}
type Ctx={app:any;store:Store;directory:string;requireRole:(r:any,roles:string[])=>{username:string};requireFresh:(r:any)=>void;busy:()=>boolean;backup:(name:string)=>Promise<void>};
export function registerProjects(ctx:Ctx){
 const {app,store,directory}=ctx;
 const admin=(req:any)=>ctx.requireRole(req,['admin']);
 const guard=()=>{if(ctx.busy())throw Error('Devam eden işlem var (haberleşme uygulaması veya komut). Bitince tekrar deneyin.');};
 app.get('/api/projects',async (req:any)=>{admin(req);
  const current=currentProjectId(store),config=store.config();
  return {current:{id:current,name:config.name},projects:listProjects(directory).filter(p=>p.id!==current)};});
 app.post('/api/projects/save',async (req:any)=>{const u=admin(req);
  const snap=snapshotOf(store,u.username);saveSnapshot(directory,snap);store.audit(u.username,'project.saved',{id:snap.meta.id,name:snap.meta.name});return {project:snap.meta};});
 app.post('/api/projects/new',async (req:any)=>{const u=admin(req);ctx.requireFresh(req);guard();
  const b=z.object({name:z.string().trim().min(1).max(100)}).parse(req.body);
  saveSnapshot(directory,snapshotOf(store,u.username));await ctx.backup(`pre-project-${Date.now()}.sqlite`);
  const snap=emptySnapshot(b.name,store.equipmentTypes(),u.username);
  restoreSnapshot(store,snap,u.username);saveSnapshot(directory,snapshotOf(store,u.username));
  return {project:{id:snap.meta.id,name:b.name}};});
 app.post('/api/projects/:id/open',async (req:any)=>{const u=admin(req);ctx.requireFresh(req);guard();
  const id=z.string().regex(idPattern).parse(req.params.id);
  if(id===currentProjectId(store))throw Error('Bu proje zaten açık.');
  const target=readSnapshot(directory,id);
  saveSnapshot(directory,snapshotOf(store,u.username));await ctx.backup(`pre-project-${Date.now()}.sqlite`);
  restoreSnapshot(store,target,u.username);
  return {project:{id,name:target.meta.name}};});
 app.delete('/api/projects/:id',async (req:any)=>{const u=admin(req);ctx.requireFresh(req);
  const id=z.string().regex(idPattern).parse(req.params.id);
  if(id===currentProjectId(store))throw Error('Açık proje silinemez; önce başka bir proje açın.');
  const file=fileOf(directory,id);if(!fs.existsSync(file))throw Error('Proje bulunamadı.');
  const meta=readSnapshot(directory,id).meta;fs.unlinkSync(file);
  store.audit(u.username,'project.deleted',{id,name:meta.name});return {ok:true};});
}
