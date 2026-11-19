import {z} from 'zod';
import {screenSchema,type User,type Screen,type Config} from '../../../packages/contracts/model';
import type {Store} from './store';
/**
 * Ekran yuzeyi: taslak kaydetme (cakisma kurtarma dahil), yayinlama,
 * silme, surum gecmisi ve ekran duzeni. Cakismada karsi tarafin taslagi
 * cevapla birlikte doner; zorlanan yazma once karsi tarafi arsivler (B28).
 */
export type ScreensContext={app:any;store:Store;
 read:(r:any)=>User;edit:(r:any)=>User;requireRole:(r:any,roles:string[])=>User;
 permits:(u:any,kind:'screens'|'commands'|'areas',value:string)=>boolean;
 validateScreen:(input:unknown,config:Config,ids?:string[])=>Screen;
 applyEquipmentBindings:(screen:Screen)=>Screen};
// B26: navigasyon duzeni ucu icin govde semasi.
const screenLayoutSchema=z.object({items:z.array(z.object({id:z.string().min(1),folder:z.string().max(60).default(''),order:z.number().int().min(0).max(100000)})).min(1).max(500),homeScreenId:z.string().optional()});
export function registerScreens(ctx:ScreensContext){
ctx.app.post('/api/screens',async (req:any)=>{const u=ctx.edit(req);const s=ctx.validateScreen(req.body,ctx.store.config());if(ctx.store.screen(s.id))throw Error('Ekran zaten var.');ctx.store.saveScreen({id:s.id,name:s.name,version:1,publishedVersion:0,draft:s,published:null});ctx.store.audit(u.username,'screen.created',{id:s.id,name:s.name});return ctx.store.screen(s.id);});
ctx.app.put('/api/screens/:id',async (req:any)=>{
 const u=ctx.edit(req),id=(req.params as any).id,b=z.object({version:z.number().int(),screen:screenSchema,force:z.boolean().optional()}).parse(req.body);const s=ctx.store.screen(id);if(!s)throw Error('Ekran yok.');
 if(!ctx.permits(u,'screens',id))throw Object.assign(Error('Bu ekranı düzenleme izniniz yok.'),{statusCode:403});
 // Cakisma: kullanicinin emegi sunucuda kaybolmasin. Zorlamadan once karsi tarafin taslagi da revizyona arsivlenir.
 if(s.version!==b.version&&!b.force)throw Object.assign(Error('Taslak başka oturumda değişti.'),{statusCode:409,data:{version:s.version,draft:s.draft,updatedBy:s.updatedBy||'',updatedAt:s.updatedAt||0}});
 if(b.screen.id!==id)throw Error('Ekran kimliği değiştirilemez.');const draft=ctx.applyEquipmentBindings(ctx.validateScreen(b.screen,ctx.store.config()));
 const overwrote=s.version!==b.version;
 ctx.store.transaction(()=>{if(overwrote)ctx.store.revision(s.draft,s.version);s.draft=draft;s.name=draft.name;s.version++;s.updatedBy=u.username;s.updatedAt=Date.now();ctx.store.saveScreen(s);ctx.store.audit(u.username,overwrote?'screen.overwritten':'screen.saved',{id,version:s.version,...(overwrote?{replaced:b.version}:{})});});
 return s;
});
ctx.app.post('/api/screens/:id/publish',async (req:any)=>{
 const u=ctx.requireRole(req,['admin']),s=ctx.store.screen((req.params as any).id);if(!s)throw Error('Ekran yok.');ctx.validateScreen(s.draft,ctx.store.config(),ctx.store.screens().map(x=>x.id));
 if(s.publishedVersion===s.version)return s;
 ctx.store.transaction(()=>{s.published=structuredClone(s.draft);s.publishedVersion=s.version;ctx.store.saveScreen(s);ctx.store.revision(s.published,s.version);ctx.store.audit(u.username,'screen.published',{id:s.id,version:s.version});});return s;
});
ctx.app.delete('/api/screens/:id',async (req:any)=>{
 const u=ctx.requireRole(req,['admin']);const id=(req.params as any).id;const all=ctx.store.screens();
 const target=all.find(s=>s.id===id);if(!target)throw Error('Ekran yok.');
 if(all.length<2)throw Error('Son ekran silinemez. Önce yeni bir ekran oluşturun.');
 const links=all.filter(s=>s.id!==id&&[...s.draft.widgets,...(s.published?.widgets||[])].some(w=>w.targetScreenId===id));
 if(links.length)throw Error('Şu ekranlarda buraya geçiş var: '+links.map(s=>s.name).join(', ')+'. Önce o bağlantıları kaldırın.');
 ctx.store.transaction(()=>{
  ctx.store.db.prepare('DELETE FROM revisions WHERE screen_id=?').run(id);
  ctx.store.db.prepare('DELETE FROM screens WHERE id=?').run(id);
  // Silinen ekran ana ekrandiysa isaret temizlenir; bir sonraki istekte ilk ekrana duser.
  if(ctx.store.get<string>('homeScreenId')===id)ctx.store.set('homeScreenId',null);
  ctx.store.audit(u.username,'screen.deleted',{id,name:target.name,widgets:target.draft.widgets.length});
 });
 return {ok:true};
});
ctx.app.put('/api/screens/layout',async (req:any)=>{
 const u=ctx.edit(req),b=screenLayoutSchema.parse(req.body),all=ctx.store.screens();
 for(const it of b.items)if(!all.some(s=>s.id===it.id))throw Error('Ekran bulunamadı: '+it.id);
 if(b.homeScreenId&&!all.some(s=>s.id===b.homeScreenId))throw Error('Ana ekran bulunamadı.');
 ctx.store.transaction(()=>{
  for(const it of b.items){const s=all.find(x=>x.id===it.id)!;s.folder=it.folder;s.order=it.order;ctx.store.saveScreen(s);}
  if(b.homeScreenId!==undefined)ctx.store.set('homeScreenId',b.homeScreenId||null);
  ctx.store.audit(u.username,'screens.layout',{items:b.items.length,homeScreenId:b.homeScreenId});
 });
 return ctx.store.screens();
});
ctx.app.get('/api/screens/:id/revisions',async (req:any)=>{ctx.read(req);return ctx.store.db.prepare('SELECT version,created FROM revisions WHERE screen_id=? ORDER BY version DESC').all((req.params as any).id);});
ctx.app.get('/api/screens/:id/revisions/:version',async (req:any)=>{ctx.read(req);const row=ctx.store.db.prepare('SELECT body FROM revisions WHERE screen_id=? AND version=?').get((req.params as any).id,z.coerce.number().int().parse((req.params as any).version)) as any;if(!row)throw Error('Surum yok.');return {screen:JSON.parse(row.body)};});
ctx.app.post('/api/screens/:id/restore',async (req:any)=>{
 const u=ctx.edit(req),id=(req.params as any).id,version=z.object({version:z.number().int()}).parse(req.body).version;const row=ctx.store.db.prepare('SELECT body FROM revisions WHERE screen_id=? AND version=?').get(id,version) as any,s=ctx.store.screen(id);if(!row||!s)throw Error('Sürüm yok.');s.draft=ctx.validateScreen(JSON.parse(row.body),ctx.store.config());s.version++;ctx.store.saveScreen(s);ctx.store.audit(u.username,'screen.restored',{id,version});return s;
});

}
