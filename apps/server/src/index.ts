import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import {staticOptions} from './staticAssets';
import {WebSocketServer,WebSocket} from 'ws';
import {randomBytes,randomUUID,scrypt,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
// Parola dogrulama olay dongusunu kilitlemesin (B50): scrypt asenkron calisir.
const scryptAsync=promisify(scrypt) as (p:string,s:string,len:number)=>Promise<Buffer>;
import {backup} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {parseS7Address,isModbus,registerCount,decodeRegisters,configSchema,validateConfig,validateScreen,validateAlarms,validateEquipmentTypes,applyEquipmentBindings,screenSchema,alarmPolicySchema,defaultAlarmPolicy,SHELVE_MAX_MINUTES,userPermissionsSchema,emptyPermissions,permits,visibleScreens,preferencesSchema,defaultPreferences,widgetTagReferenceFields,alarmRulesSchema,LIBRARY_PACK_VERSION,libraryPackSchema,planLibraryMerge,applyLibraryMerge,type Config,type Sample,type User,type ScreenRecord,type Screen,type LibraryChoice} from '../../../packages/contracts/model';
// B26: navigasyon duzeni ucu icin gövde semasi — ekran id'si dogrulamasi asagida store'a bakarak yapilir.
import {validateRecipes,recipePreview,type Recipe} from '../../../packages/contracts/recipes';
import {registerMedia} from './media';
import {registerRecords} from './records';
import {registerEnergy} from './energy';
import {registerPlcHealth} from './plcHealth';
import {registerNetScan} from './netScan';
import {registerOpcuaBrowse} from './opcuaBrowse';
import {registerAuth} from './auth';
import {registerScreens} from './screens';
import {registerProjects} from './projects';
import {registerConnectionSecrets,readConnectionSecrets,pruneConnectionSecrets} from './connectionSecrets';
import {inspectSvg} from './svg';
import {Store} from './store';
import {ensureSecretFile} from './secrets';
import {Commands} from './commands';
import {deployGateway,startGatewayWatchdog,stopGatewayWatchdog,gatewayHealth} from './gateway';
import {Alarms} from './alarms';
import {acceptSource,acceptSampledAt,noteReject,ingestRejects,type SourceState} from './ingest';
import {createFileLogger} from './log';
import {sampleDelta} from './liveDelta';
/* Beklenmeyen (5xx / calisma zamani) hatalar operatore sizdirilmaz: genel Turkce mesaj donulur,
 * ayrinti sadece server.log'a yazilir. Kasitli is hatalari (Error('mesaj'), statusCode<500) eski
 * davranista kalir — mevcut testler buna guvenir. Test edilebilir olsun diye saf fonksiyon. */
const isRuntimeError=(err:any)=>err instanceof TypeError||err instanceof ReferenceError||err instanceof RangeError||err instanceof SyntaxError;
export function classifyRouteError(err:any):{status:number;body:any;serverFault:boolean}{
 const isZod=err instanceof z.ZodError;
 const serverFault=!isZod&&(Number(err.statusCode)>=500||isRuntimeError(err)||(typeof err.code==='string'&&(err.code.startsWith('ERR_')||err.code.startsWith('SQLITE'))));
 if(serverFault)return {status:500,body:{error:'Sunucu hatası — ayrıntı sunucu kaydında (logs/server.log).'},serverFault:true};
 const message=isZod?err.issues.map((i:any)=>i.path.join('.')+': '+i.message).join('; '):err.message;
 return {status:err.statusCode||400,body:{error:message,...(err.data?{data:err.data}:{}),...(err.code?{code:err.code}:{})},serverFault:false};
}
/** Build kimligi (dist/web/build.json = {id,at}); eksik/bozuksa null — /api/health bunu sunucu ve
 * yayindaki dosyayi karsilastirmak icin dondurur (dagitim eslesme kontrolu icin frontend'le sozlesme). */
export function readBuild(file:string):{id:string;at:number}|null{
 try{const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  return typeof raw?.id==='string'&&typeof raw?.at==='number'?{id:raw.id,at:raw.at}:null;
 }catch{return null;}
}
export async function main(){
const directory=path.resolve(process.env.SCADA_DATA||'.local');
const store=new Store(directory),port=Number(process.env.SCADA_PORT||3000),nodeRed=process.env.NODERED_URL||'http://127.0.0.1:1880';
/* Y2: kopru token'i, kopruye sahte ORNEK enjekte etme anahtaridir — bu dosyayi
 * okuyan yerel bir hesap uydurma `samples` gonderip operatore olmayan bir
 * gerceklik gosterebilir. Projedeki diger iki sir zaten daraltiliyordu; bu
 * atlanmisti. ensureSecretFile her acilista korumayi da tazeler. */
const tokenFile=path.join(directory,'gateway-token');
const gatewayToken=ensureSecretFile(tokenFile,()=>randomBytes(32).toString('hex'));
// B: logger:false uretimde sessiz kalip "ne oldu" sorusunu cevapsiz birakiyordu — dosyaya JSON log.
const fileLog=createFileLogger(directory);
const app=Fastify({loggerInstance:fileLog.logger as any,disableRequestLogging:true,bodyLimit:5*1024*1024});await app.register(cookie);
/* Beklenmedik hata yakalama: surec sessizce olmesin, izi log dosyasinda kalsin.
 * uncaughtException sonrasi surec bilinmeyen durumda olabilir — bir supervisor
 * (pm2/servis) yeniden baslatabilsin diye exit(1) ile cikiyoruz. unhandledRejection
 * ise devam eder, sadece kaydedilir. Dinleyiciler adli tanimlanir ki kapanista
 * process.off ile kaldirilabilsin (testte ayni surecte cok sayida sunucu acilip
 * kapaniyor — kaldirilmazsa dinleyici birikir ve baska testin hatasi bu sunucuyu
 * process.exit(1) ile öldürebilir).
 */
const onUncaught=(err:any)=>{
 fileLog.logger.fatal({err,stack:err?.stack},'uncaughtException');
 try{store?.audit('system','process.error',{message:String(err?.message||err)});}catch{}
 process.exit(1);
};
const onUnhandled=(reason:any)=>{
 fileLog.logger.error({err:reason,stack:reason?.stack},'unhandledRejection');
 try{store?.audit('system','process.error',{message:String(reason?.message||reason)});}catch{}
};
process.on('uncaughtException',onUncaught);
process.on('unhandledRejection',onUnhandled);
let active=store.get<Config|null>('activeConfig')||null,deploying=false,gatewayAt=0;
// Kopru watchdog: deploy sonrasi Node-RED surecinin/akisinin sessizce kaybolmasini gorunur kilar (yazmayi engellemez, bkz. gateway.ts).
startGatewayWatchdog(nodeRed,()=>active?.revision??null,directory);
const samples:Record<string,Sample>={},sessions=new Map<WebSocket,string>(),sources=new Map<string,SourceState>();
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function parsePermissions(raw:unknown){try{return raw?userPermissionsSchema.parse(JSON.parse(String(raw))):emptyPermissions;}catch{return emptyPermissions;}}
function userFor(headers:any):User|undefined{const raw=app.parseCookie(headers.cookie||'').scada;if(!raw)return;
 const row=store.db.prepare('SELECT users.id,username,role,users.permissions FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>? AND users.disabled=0').get(hash(raw),Date.now()) as any;
 return row?{id:row.id,username:row.username,role:row.role,permissions:parsePermissions(row.permissions)} as User:undefined;}
function requireRole(req:any,roles:string[]){const u=userFor(req.headers);if(!u)throw Object.assign(Error('Oturum açın.'),{statusCode:401});if(!roles.includes(u.role))throw Object.assign(Error('Bu işlem için yetkiniz yok.'),{statusCode:403});return u;}
const read=(r:any)=>requireRole(r,['admin','designer','operator','viewer']);
/**
 * Kritik islemde yeniden dogrulama (B39): oturum acik olsa bile hesap yonetimi,
 * proje ice aktarimi ve geri alma gibi islemler icin parola son N dakika icinde
 * tekrar girilmis olmali. Basiboş kalan acik oturum tek basina yetmez.
 */
const reauthWindowMs=Math.min(60,Math.max(1,Number(process.env.SCADA_REAUTH_MINUTES)||5))*60000;
function sessionRow(req:any){const raw=app.parseCookie(req.headers.cookie||'').scada;if(!raw)return null;
 return store.db.prepare('SELECT token,user_id,reauth FROM sessions WHERE token=?').get(hash(raw)) as any;}
function requireFresh(req:any){
 const row=sessionRow(req);
 if(!row||Date.now()-Number(row.reauth||0)>reauthWindowMs)
  throw Object.assign(Error('Bu işlem için parolanızı yeniden girin.'),{statusCode:403,code:'REAUTH_REQUIRED'});
}
const edit=(r:any)=>requireRole(r,['admin','designer']);
app.setErrorHandler((err:any,req,reply)=>{
 const r=classifyRouteError(err);
 if(r.serverFault)req.log.error({err,url:req.url,method:req.method},'unhandled route error');
 reply.code(r.status).send(r.body);
});
app.addHook('onRequest',async(req,reply)=>{
 if(req.url.startsWith('/api')&&!['GET','HEAD'].includes(req.method)){
  if(req.headers['x-scada-request']!=='1')return reply.code(403).send({error:'İstek başlığı eksik.'});
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return reply.code(403).send({error:'Origin reddedildi.'});
 }
});
/* --- LAN yayin profili (B40) ----------------------------------------------
 * `SCADA_TLS=1` (dogrudan TLS ya da TLS sonlandiran ters vekil) secure cookie
 * acar. Yerel HTTP gelistirmede secure cookie tarayicida calismaz, o yuzden
 * korlemesine acilmaz. Guvenlik basliklari her cevaba eklenir.
 */
const secureCookies=process.env.SCADA_TLS==='1'||process.env.SCADA_PROFILE==='lan-tls';
const sessionHours=Math.min(168,Math.max(1,Number(process.env.SCADA_SESSION_HOURS)||12));
const cookieOptions={httpOnly:true,sameSite:'strict' as const,path:'/',secure:secureCookies};
app.addHook('onSend',async(req,reply)=>{
 if(req.url.startsWith('/uploads/'))return;// yuklenen medyanin kendi katı politikasi var
 reply.header('X-Content-Type-Options','nosniff');
 reply.header('Referrer-Policy','no-referrer');
 reply.header('X-Frame-Options','DENY');
 reply.header('Cross-Origin-Opener-Policy','same-origin');
 if(secureCookies)reply.header('Strict-Transport-Security','max-age=15552000');
 if(!req.url.startsWith('/api'))reply.header('Content-Security-Policy',
  "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
});
/* --- Aktif / pasif sunucu (B12) --------------------------------------------
 * Ayni veri klasorune iki sunucu baglanirsa sahaya iki yazici cikar. Sahiplik
 * kirasi tek yaziciyi garanti eder: kirasi olmayan ornek PASIF calisir —
 * okur, gosterir, ama komut kabul etmez ve kopruye deploy etmez.
 * RTO: kira suresi (varsayilan 10 sn) + kopru yeniden uygulama suresi.
 * RPO: SQLite WAL diske yazildigi icin sifir; bekleyen komutlar devralinmaz.
 */
const instanceId=process.env.SCADA_INSTANCE||`${process.env.COMPUTERNAME||'yerel'}-${process.pid}`;
const leaseTtlMs=Math.min(120000,Math.max(3000,Number(process.env.SCADA_LEASE_MS)||10000));
let ownership=store.claimOwnership(instanceId,leaseTtlMs);
let standbyLogged=false;
const isPrimary=()=>ownership.role==='primary';
function ownershipTick(){
 if(ownership.role==='primary'){
  if(store.renewOwnership(instanceId,ownership.epoch))return;
  // Kira baskasina gecti: hemen pasife dus, yazmayi birak (fencing).
  ownership={role:'standby',instanceId:store.ownership()?.instanceId||'',epoch:store.ownership()?.epoch||0,heartbeatAt:Date.now()};
  store.audit('system','cluster.demoted',{instanceId,epoch:ownership.epoch});
  return;
 }
 const claim=store.claimOwnership(instanceId,leaseTtlMs);
 if(claim.role==='primary'){ownership=claim;standbyLogged=false;store.audit('system','cluster.promoted',{instanceId,epoch:claim.epoch});}
 else if(!standbyLogged){standbyLogged=true;console.log('Z SCADA pasif modda: aktif sunucu '+claim.instanceId);}
}
const ownershipTimer=setInterval(ownershipTick,Math.max(1000,Math.floor(leaseTtlMs/3)));
/** Sahaya etki eden islemler yalniz aktif sunucuda calisir. */
function requirePrimary(){
 if(!isPrimary())throw Object.assign(Error('Bu sunucu pasif (yedek) modda; sahaya yazma yetkisi aktif sunucuda: '+(store.ownership()?.instanceId||'bilinmiyor')+'.'),{statusCode:409,code:'STANDBY'});
}
const attempts=new Map<string,{count:number;until:number}>();
registerAuth({app,store,read,requireRole,userFor,requireFresh,scryptAsync,sessionRow,parsePermissions,hash,attempts,cookieOptions,sessionHours,reauthWindowMs});
app.get('/api/project',async req=>{const viewer=read(req);const screens=visibleScreens(viewer,store.screens());return {config:store.config(),screens,equipmentTypes:store.equipmentTypes(),activeRevision:active?.revision||0,deployment:store.get('deployment')||null,homeScreenId:store.get<string>('homeScreenId')||screens[0]?.id||''};});
// B34: Etiket silme/yeniden baglama kararinda, taslak-yayin ve gecmis ekran
// surumlerindeki tum baglar ayni yerden gorunur.
app.get('/api/tags/:id/references',async req=>{
 read(req);const tagId=z.string().min(1).parse((req.params as any).id),config=store.config();
 if(!config.tags.some(t=>t.id===tagId))throw Error('Etiket yok.');
 const references:{group:'screen'|'revision'|'command'|'alarm';text:string;detail:string;screenId?:string;objectId?:string}[]=[];
 const addScreen=(screen:Screen,screenId:string,screenName:string,version:string,group:'screen'|'revision')=>{
  for(const widget of screen.widgets){const fields=widgetTagReferenceFields(widget,tagId,config);if(fields.length)references.push({group,text:screenName+' · '+(widget.label||widget.id.slice(0,8))+' ('+version+')',detail:fields.join(', ')+' · nesne: '+widget.id,screenId,objectId:widget.id});}
 };
 const screens=store.screens(),names=new Map(screens.map(s=>[s.id,s.name]));
 for(const record of screens){addScreen(record.draft,record.id,record.name,'taslak v'+record.version,'screen');if(record.published)addScreen(record.published,record.id,record.name,'yayin v'+record.publishedVersion,'screen');}
 for(const row of store.db.prepare('SELECT screen_id,version,body FROM revisions ORDER BY created DESC').all() as any[]){try{addScreen(JSON.parse(row.body) as Screen,row.screen_id,names.get(row.screen_id)||row.screen_id,'gecmis v'+row.version,'revision');}catch{/* bozuk eski arsiv kaydi referans yanitini engellemez */}}
 for(const command of config.commands){const fields:string[]=[];if(command.tagIds.includes(tagId))fields.push('yazma hedefi');if(command.feedbackTagIds.includes(tagId))fields.push('geri bildirim');if((command.permissives||[]).some(p=>p.tagId===tagId))fields.push('izin kosulu');if(fields.length)references.push({group:'command',text:command.name,detail:fields.join(', ')+' · komut: '+command.id,objectId:command.id});}
 for(const rule of store.alarmRules())if(rule.tagId===tagId)references.push({group:'alarm',text:rule.name,detail:'alarm etiketi · kural: '+rule.id,objectId:rule.id});
 return {references};
});
app.post('/api/tags/:id/rebind',async req=>{
 const user=edit(req),from=z.string().min(1).parse((req.params as any).id),to=z.object({targetTagId:z.string().min(1)}).parse(req.body).targetTagId;
 const current=store.config();if(from===to)throw Error('Yeni etiket farkli olmali.');if(!current.tags.some(t=>t.id===from)||!current.tags.some(t=>t.id===to))throw Error('Etiket bulunamadi.');
 const replaceCondition=(condition:any):any=>!condition?condition:condition.op==='and'||condition.op==='or'?{...condition,terms:condition.terms.map(replaceCondition)}:condition.op==='not'?{...condition,term:replaceCondition(condition.term)}:{...condition,tagId:condition.tagId===from?to:condition.tagId};
 const replaceScreen=(screen:Screen):Screen=>({...screen,widgets:screen.widgets.map(widget=>({...widget,tagId:widget.tagId===from?to:widget.tagId,visibleTagId:widget.visibleTagId===from?to:widget.visibleTagId,visibleCondition:replaceCondition(widget.visibleCondition),parts:widget.parts.map(part=>({...part,tagId:part.tagId===from?to:part.tagId})),details:widget.details.map(detail=>({...detail,tagId:detail.tagId===from?to:detail.tagId}))})),scenarios:(screen.scenarios||[]).map(scenario=>({name:scenario.name,values:Object.fromEntries(Object.entries(scenario.values).map(([id,value])=>[id===from?to:id,value])),quality:Object.fromEntries(Object.entries(scenario.quality).map(([id,value])=>[id===from?to:id,value]))}))});
 const next=structuredClone(current);for(const command of next.commands){command.tagIds=command.tagIds.map(id=>id===from?to:id);command.feedbackTagIds=command.feedbackTagIds.map(id=>id===from?to:id);command.permissives=(command.permissives||[]).map(p=>({...p,tagId:p.tagId===from?to:p.tagId}));}
 const rules=store.alarmRules().map(rule=>({...rule,tagId:rule.tagId===from?to:rule.tagId}));
 const changed=store.screens().map(record=>({...record,draft:replaceScreen(record.draft),published:record.published?replaceScreen(record.published):null}));
 validateConfig(next);validateAlarms(rules,next);for(const record of changed){validateScreen(record.draft,next);if(record.published)validateScreen(record.published,next);}
 next.revision++;store.transaction(()=>{store.set('config',next);store.saveAlarmRules(rules);for(const record of changed){record.version++;if(record.published){record.publishedVersion=record.version;store.revision(record.published,record.version);}store.saveScreen(record);}store.audit(user.username,'tag.rebound',{from,to,screens:changed.length});});
 return {ok:true,screens:changed.length};
});
app.put('/api/equipment-types',async req=>{
 const u=edit(req);const types=validateEquipmentTypes(req.body);
 // Sablon degisikligi haberlesmeyi etkilemez; yalnizca tasarim varliklaridir.
 store.transaction(()=>{store.saveEquipmentTypes(types);store.audit(u.username,'equipment.types.saved',{count:types.length});});
 return {equipmentTypes:types};
});
/* --- Taslak yapilandirma / calisan sistem ayrimi (B46) ---------------------
 * `config` duzenlenen TASLAKTIR; sahada calisan `active`'tir. Ikisi arasindaki
 * fark kullaniciya acikca gosterilir: uygulanmamis degisiklikler, etkilenen
 * ekranlar ve alarm kurallari. Boylece "kaydettim ama neden degismedi?"
 * sorusu ekranda cevaplanir.
 */
function configDiff(draft:Config,running:Config|null){
 const list=(c:Config|null,kind:'devices'|'tags'|'commands')=>new Map(((c?.[kind]||[]) as any[]).map(x=>[x.id,x]));
 const out:{kind:string;added:string[];removed:string[];changed:string[]}[]=[];
 for(const kind of ['devices','tags','commands'] as const){
  const a=list(running,kind),b=list(draft,kind);
  out.push({kind,
   added:[...b.keys()].filter(id=>!a.has(id)).map(id=>(b.get(id) as any).code||(b.get(id) as any).name),
   removed:[...a.keys()].filter(id=>!b.has(id)).map(id=>(a.get(id) as any).code||(a.get(id) as any).name),
   changed:[...b.keys()].filter(id=>a.has(id)&&JSON.stringify(a.get(id))!==JSON.stringify(b.get(id))).map(id=>(b.get(id) as any).code||(b.get(id) as any).name)});
 }
 return out;
}
// Modbus RTU baglantisi kurarken bu PC'deki seri portlar (COM3 vb.). serialport, node-red-contrib-modbus
// ile gelir; yoksa ya da listeleme basarisizsa bos liste doner — kullanici portu elle yazabilir.
app.get('/api/serial-ports',async req=>{
 requireRole(req,['admin','designer']);
 try{
  const {SerialPort}=await import('serialport' as string);
  const ports=await SerialPort.list();
  return ports.map((p:any)=>({path:String(p.path),label:[p.manufacturer,p.friendlyName].filter(Boolean).join(' · ')}));
 }catch{return [];}
});
app.get('/api/config/pending',async req=>{
 read(req);
 const draft=store.config(),diff=configDiff(draft,active);
 const changedTagIds=new Set<string>();
 for(const t of draft.tags){const before=active?.tags.find(x=>x.id===t.id);if(!before||JSON.stringify(before)!==JSON.stringify(t))changedTagIds.add(t.id);}
 for(const t of active?.tags||[])if(!draft.tags.some(x=>x.id===t.id))changedTagIds.add(t.id);
 const screens=store.screens().filter(s=>[...(s.published?.widgets||[]),...s.draft.widgets].some(w=>changedTagIds.has(w.tagId)||w.parts.some(p=>changedTagIds.has(p.tagId))));
 const rules=store.alarmRules().filter(r=>changedTagIds.has(r.tagId));
 return {revision:draft.revision,activeRevision:active?.revision||0,applied:!!active&&active.revision===draft.revision,
  diff,affectedScreens:screens.map(s=>s.name),affectedAlarmRules:rules.map(r=>r.name),
  pendingCommands:commands.pending.size,deploying};
});
/* B61: kullanimdaki bir etiketi silmeye calisan kullanici engelin NEREDE
 * oldugunu soylemeyen mesajlar aliyordu ("Kazan sicakligi yuksek: etiket
 * bulunamadi.", "Komutun yazilabilir etiketi bulunamadi."). Bu tarama
 * /tags/:id/references ile ayni yerlere bakar ve tek mesajda
 * "hangi etiket -> hangi kullanim" der. Semantik dogrulayicilardan ONCE kosar. */
function blockRemovedTags(current:Config,next:Config){
 const removed=current.tags.filter(t=>!next.tags.some(x=>x.id===t.id));
 if(!removed.length)return;
 const blocked:string[]=[];
 for(const tag of removed){
  const where:string[]=[];
  for(const record of store.screens()){
   const published=(record.published?.widgets||[]).some(w=>widgetTagReferenceFields(w,tag.id,current).length>0);
   const draft=record.draft.widgets.some(w=>widgetTagReferenceFields(w,tag.id,current).length>0);
   if(published)where.push('yayındaki ekran "'+record.name+'"');
   else if(draft)where.push('taslak ekran "'+record.name+'"');
  }
  for(const rule of store.alarmRules())if(rule.tagId===tag.id)where.push('alarm kuralı "'+rule.name+'"');
  for(const command of next.commands){
   if(command.tagIds.includes(tag.id))where.push('komut "'+command.name+'" (yazma hedefi)');
   else if(command.feedbackTagIds.includes(tag.id))where.push('komut "'+command.name+'" (geri bildirim)');
   else if((command.permissives||[]).some(p=>p.tagId===tag.id))where.push('komut "'+command.name+'" (izin koşulu)');
  }
  if(where.length)blocked.push(tag.code+' → '+where.join(', '));
 }
 if(blocked.length)throw Error('Şu etiketler kullanımda olduğu için silinemez: '+blocked.join(' ; ')+'. Önce bu bağları kaldırın; etiketi "Nerede kullanılıyor?" panelinden başka bir etikete de taşıyabilirsiniz.');
}
app.put('/api/config',async req=>{
 const u=edit(req);if(deploying||commands.pending.size)throw Error('Devam eden işlem var.');
 // Once SEKIL dogrulanir; kullanim taramasi semantik dogrulayicilardan once kosmali.
 const shape=configSchema.parse(req.body),old=store.config();
 if(shape.revision!==old.revision)throw Object.assign(Error('Yapılandırma revizyonu değişti. Yenileyin.'),{statusCode:409});
 blockRemovedTags(old,shape);
 const next=validateConfig(shape);
 for(const s of store.screens()){validateScreen(s.draft,next);if(s.published)validateScreen(s.published,next);}
 validateAlarms(store.alarmRules(),next);
 const removedTags=old.tags.filter(t=>!next.tags.some(x=>x.id===t.id));
 next.revision++;store.transaction(()=>{store.set('config',next);store.audit(u.username,'config.saved',{before:old,after:next,removedTags:removedTags.map(t=>t.code)});});
 // Silinen baglantinin kimlik bilgisi connection-secrets.json'da sahipsiz kalmasin. Kayit zaten yapildi:
 // sir dosyasi bozuksa kayit geri alinmaz, denetime yazilir (deger yazilmaz).
 const removedConnections=old.connections.filter(x=>!next.connections.some(y=>y.id===x.id)).map(x=>x.id);
 try{const pruned=pruneConnectionSecrets(directory,removedConnections);if(pruned.length)store.audit(u.username,'connection.secret.pruned',{connectionIds:pruned});}
 catch(e){store.audit(u.username,'connection.secret.prune-failed',{connectionIds:removedConnections,error:(e as Error).message});}
 return {...next,pending:{activeRevision:active?.revision||0,applied:false}};
});
async function deploy(c:Config,actor:string){
 requirePrimary();
 if(deploying||commands.pending.size)throw Error('Devam eden komut veya uygulama var.');deploying=true;store.set('deployment',{status:'applying',revision:c.revision,at:Date.now()});
 try{const nr=await deployGateway(c,gatewayToken,port,directory,nodeRed);if(active)store.set('previousConfig',active);active=c;store.set('activeConfig',c);for(const k of Object.keys(samples))delete samples[k];sources.clear();gatewayAt=0;store.set('deployment',{status:'waiting',revision:c.revision,nodeRedRevision:(nr as any)?.rev??nr,diff:(nr as any)?.diff||null,at:Date.now()});store.audit(actor,'gateway.applied',{revision:c.revision,nodes:(nr as any)?.diff||null});return {ok:true,diff:(nr as any)?.diff||null};}
 catch(e){store.set('deployment',{status:'failed',revision:c.revision,error:(e as Error).message,at:Date.now()});throw e;}finally{deploying=false;}
}
app.post('/api/deploy',async req=>{const u=requireRole(req,['admin']);return deploy(store.config(),u.username);});
app.post('/api/deploy/rollback',async req=>{const u=requireRole(req,['admin']);const c=store.get<Config>('previousConfig');if(!c)throw Error('Önceki etkin yapılandırma yok.');return deploy(c,u.username);});
registerScreens({app,store,read,edit,requireRole,permits,validateScreen,applyEquipmentBindings});
const commands=new Commands(store,samples,()=>active,()=>isPrimary()&&!deploying&&Date.now()-gatewayAt<4000&&active?.revision===store.config().revision,async(tagId,value,id,expiresAt,revision)=>{
 const response=await fetch(nodeRed+'/scada-bridge/command',{method:'POST',headers:{'Content-Type':'application/json','x-scada-token':gatewayToken},body:JSON.stringify({tagId,value,commandId:id,expiresAt,revision}),signal:AbortSignal.timeout(Math.max(1,Math.min(5000,expiresAt-Date.now())))});
 if(!response.ok)throw Error('Köprü yazma yanıtı: '+response.status);const result=await response.json() as any;if(!result.ack)throw Error('Yazma doğrulanmadı.');
});
const alarmPolicy=()=>{try{return alarmPolicySchema.parse(store.get('alarmPolicy')||{});}catch{return defaultAlarmPolicy;}};
const alarms=new Alarms(store,samples,()=>store.alarmRules(),()=>active,alarmPolicy);
/* --- Historian (B07) ------------------------------------------------------
 * Anlik deger "ne oluyor?" sorusunu yanitlar; operatorun "ne zaman basladi,
 * duzeliyor mu?" sorusu icin gecmis gerekir. Etiket bazinda ac/kapa, olu bant
 * ve azami kayit araligi vardir; veri kesintileri bosluk olarak saklanir.
 */
// Enerji analizorleri: saatlik tuketim sayaci + analizor etiketleri historian'a girer.
const energy=registerEnergy({app,store,samples,read,edit});
// S7 PLC sagligi: calisma modu, kimlik, saat sapmasi, tanilama tamponu (salt okuma, yalniz aktif sunucu).
const plcHealth=registerPlcHealth({app,read,active:()=>active,isPrimary});
/* Okuma testi: etiket eklerken/duzenlerken taslak adresi KAYDETMEDEN bir kez okur. Salt okuma:
 * Modbus'ta kopru uzerinden FC1-4 (ayni soket, ayni hat kilidi), S7'de saglik oturumundan tek okuma.
 * Yalniz sahada calisan (uygulanmis) yapilandirmadaki etkin cihazlar okunabilir. */
const testReadAt=new Map<string,number>();
const testReadModbusError=(m:string)=>/exception[^0-9]*0?2|illegal data address/i.test(m)?'Modbus istisna 02: geçersiz adres. Adres PLC\'nin aralığı dışında olabilir.'
 :/exception[^0-9]*0?1|illegal function/i.test(m)?'Modbus istisna 01: bu alan (fonksiyon kodu) cihazda desteklenmiyor.'
 :/timeout|timed out|zaman/i.test(m)?'Yanıt yok (zaman aşımı). Slave ID, bağlantı ya da cihaz durumu kontrol edilmeli.':m;
app.post('/api/tags/test-read',async req=>{
 const u=edit(req);requirePrimary();
 const now=Date.now();if(now-(testReadAt.get(u.username)||0)<400)throw Object.assign(Error('Çok sık okuma; biraz bekleyin.'),{statusCode:429});testReadAt.set(u.username,now);
 const b=z.object({deviceId:z.string().min(1).max(80),area:z.enum(['coil','discrete-input','holding-register','input-register']).optional(),address:z.number().int().min(0).max(65535).optional(),
  dataType:z.enum(['bool','uint16','int16','uint32','int32','float32']),bit:z.number().int().min(0).max(15).nullable().optional(),wordOrder:z.enum(['big','little']).optional(),byteOrder:z.enum(['big','little']).optional(),
  scale:z.number().finite().optional(),offset:z.number().finite().optional(),s7Address:z.string().max(40).optional()}).parse(req.body);
 const c=active;if(!c)throw Error('Sahada çalışan yapılandırma yok; önce "Haberleşmeye uygula".');
 const d=c.devices.find(x=>x.id===b.deviceId);
 if(!d||!d.enabled)throw Object.assign(Error('Cihaz sahada etkin değil; okuma testi için cihazı etkinleştirip "Haberleşmeye uygula".'),{statusCode:409});
 const conn=c.connections.find(x=>x.id===d.connectionId)!;const t0=Date.now();
 if(conn.protocol==='s7'){
  if(!b.s7Address)throw Error('S7 adresi gerekli.');
  const address=parseS7Address(b.s7Address).address;
  try{const v=await plcHealth.readOnce(conn.id,address);return {value:typeof v==='boolean'?v:Number(v),ms:Date.now()-t0};}
  catch(e){throw Object.assign(Error('S7 okuması başarısız: '+(e as Error).message),{statusCode:502});}
 }
 if(!isModbus(conn))throw Object.assign(Error('Bu protokolde okuma testi yok; kaydedip canlı değeri izleyin.'),{statusCode:400});
 if(!b.area||b.address===undefined)throw Error('Alan ve adres gerekli.');
 const bool=b.area==='coil'||b.area==='discrete-input',count=bool?1:registerCount(b.dataType);
 if(b.address+count-1>65535)throw Error('Adres aralığı 65535\'i aşıyor.');
 const fc={coil:1,'discrete-input':2,'holding-register':3,'input-register':4}[b.area];
 let r:Response;
 try{r=await fetch(nodeRed+'/scada-bridge/read',{method:'POST',headers:{'Content-Type':'application/json','x-scada-token':gatewayToken},body:JSON.stringify({connectionId:conn.id,unitid:d.slaveId,fc,address:b.address,quantity:count}),signal:AbortSignal.timeout(Math.max(6000,conn.timeout+3000))});}
 catch{throw Object.assign(Error('Köprüye ulaşılamadı (Node-RED).'),{statusCode:502});}
 const j=await r.json().catch(()=>({})) as any;
 if(r.status===404&&!j.error)throw Object.assign(Error('Okuma testi köprüde yok; bir kez "Haberleşmeye uygula" gerekiyor.'),{statusCode:409});
 if(!r.ok)throw Object.assign(Error(testReadModbusError(String(j.error||('Köprü yanıtı '+r.status)))),{statusCode:r.status===404?409:502});
 const data=(j.data||[]) as (number|boolean)[];
 if(data.length<count)throw Object.assign(Error('Cihaz eksik yanıt verdi.'),{statusCode:502});
 if(bool)return {value:Boolean(data[0]),ms:Date.now()-t0};
 const tag={id:'test',deviceId:d.id,code:'test',name:'test',area:b.area,address:b.address,dataType:b.dataType,access:'read',scale:b.scale??1,offset:b.offset??0,min:-1e15,max:1e15,unit:'',description:'',wordOrder:b.wordOrder??'big',byteOrder:b.byteOrder??'big',bit:b.bit??null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000} as Config['tags'][number];
 const v=decodeRegisters(data.map(Number),tag);
 return {value:tag.bit!==null||b.dataType==='bool'?Boolean(v):v,ms:Date.now()-t0};
});
// Ag kesfi: alt agdaki endustriyel portlar + S7 kimligi + ARP/MAC (salt okuma, yalniz tasarimci/yonetici).
registerNetScan({app,edit,config:()=>store.config()});
// OPC UA adres uzayi gezgini (etiket panelinde Gozat; salt okuma).
registerOpcuaBrowse({app,edit,config:()=>store.config(),secret:id=>{const all=readConnectionSecrets(directory);return Object.prototype.hasOwnProperty.call(all,id)?all[id]:undefined;}});
const energyRetentionDays=Number(process.env.SCADA_ENERGY_RETENTION_DAYS||3650);
const lastHistory=new Map<string,{at:number;value:number|null;quality:string}>();
function recordHistory(now=Date.now()){
 if(!active)return;
 const rows:{tagId:string;at:number;value:number|null;quality:string}[]=[],energyTags=energy.historyTags();
 for(const t of active.tags){
  if(!t.history&&!energyTags.has(t.id))continue;
  const s=samples[t.id];if(!s)continue;
  const value=typeof s.value==='boolean'?(s.value?1:0):typeof s.value==='number'?s.value:null;
  const prior=lastHistory.get(t.id);
  const changed=!prior||prior.quality!==s.quality||(value===null)!==(prior.value===null)
   ||(value!==null&&prior.value!==null&&Math.abs(value-prior.value)>t.historyDeadband);
  const stale=!prior||now-prior.at>=t.historyMaxGapMs;
  if(!changed&&!stale)continue;
  const row={tagId:t.id,at:now,value,quality:s.quality};
  rows.push(row);lastHistory.set(t.id,row);
 }
 if(rows.length)store.writeHistory(rows);
}
const retentionDays=Number(process.env.SCADA_RETENTION_DAYS||90);
app.get('/api/history',async req=>{
 read(req);
 const q=z.object({tagIds:z.string().min(1).max(2000),from:z.coerce.number().int(),to:z.coerce.number().int(),maxPoints:z.coerce.number().int().min(10).max(5000).default(1000)}).parse(req.query);
 const ids=q.tagIds.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12);
 if(q.to<=q.from)throw Error('Bitiş zamanı başlangıçtan sonra olmalı.');
 return {series:store.history(ids,q.from,q.to,q.maxPoints),from:q.from,to:q.to,retentionDays};
});
app.get('/api/alarms',async req=>{read(req);return {rules:store.alarmRules(),revision:Number(store.get('alarmRulesRevision')||0),active:alarms.active(),events:store.alarms(200),counts:alarms.counts(),policy:alarmPolicy(),flood:alarms.floodState()};});
app.get('/api/alarms/metrics',async req=>{read(req);const q=z.object({from:z.coerce.number().int().optional(),to:z.coerce.number().int().optional()}).parse(req.query),to=q.to||Date.now(),from=q.from||to-24*3600000;if(to<=from)throw Error('Bitiş zamanı başlangıçtan sonra olmalı.');return store.alarmMetrics(from,to);});
app.get('/api/alarms/history',async req=>{read(req);const q=z.object({from:z.coerce.number().int().optional(),to:z.coerce.number().int().optional(),limit:z.coerce.number().int().min(1).max(2000).default(1000)}).parse(req.query),to=q.to||Date.now(),from=q.from||to-24*3600000;if(to<=from)throw Error('Bitiş zamanı başlangıçtan sonra olmalı.');const events=store.alarmsBetween(from,to,q.limit);return {events,from,to,limit:q.limit,truncated:events.length===q.limit};});
app.get('/api/alarms/policy',async req=>{read(req);return {policy:alarmPolicy(),flood:alarms.floodState()};});
app.put('/api/alarms/policy',async req=>{
 const u=edit(req),policy=alarmPolicySchema.parse(req.body),before=alarmPolicy();
 store.transaction(()=>{store.set('alarmPolicy',policy);store.audit(u.username,'alarm.policy.saved',{before,after:policy});});
 return {policy};
});
app.post('/api/alarms/:id/shelve',async req=>{
 const user=requireRole(req,['admin','designer','operator']),id=z.string().min(1).parse((req.params as any).id),body=z.object({minutes:z.number().int().min(1).max(SHELVE_MAX_MINUTES),reason:z.string().trim().min(3).max(300)}).parse(req.body),rules=store.alarmRules(),rule=rules.find(r=>r.id===id);
 if(!rule)throw Error('Alarm kuralı yok.');
 const shelveMax=user.role==='operator'?alarmPolicy().operatorShelveMaxMinutes:SHELVE_MAX_MINUTES;
 if(body.minutes>shelveMax)throw Object.assign(Error('Rafa kaldırma en fazla '+shelveMax+' dakika olabilir.'),{statusCode:403});rule.shelvedUntil=Date.now()+body.minutes*60000;rule.shelvedReason=body.reason;rule.shelvedBy=user.username;store.transaction(()=>{store.saveAlarmRules(rules);store.audit(user.username,'alarm.shelved',{id,name:rule.name,minutes:body.minutes,reason:body.reason});});return {rule};
});
app.post('/api/alarms/:id/unshelve',async req=>{
 const user=requireRole(req,['admin','designer','operator']),id=z.string().min(1).parse((req.params as any).id),rules=store.alarmRules(),rule=rules.find(r=>r.id===id);if(!rule)throw Error('Alarm kuralı yok.');rule.shelvedUntil=0;rule.shelvedReason='';rule.shelvedBy='';store.transaction(()=>{store.saveAlarmRules(rules);store.audit(user.username,'alarm.unshelved',{id,name:rule.name});});alarms.tick();return {rule};
});
app.put('/api/alarms/rules',async req=>{
 const u=edit(req),body=z.union([alarmRulesSchema,z.object({rules:alarmRulesSchema,reason:z.string().trim().min(3).max(300),revision:z.number().int().min(0).optional()})]).parse(req.body);
 const rules=validateAlarms(Array.isArray(body)?body:body.rules,store.config()),before=store.alarmRules();
 // Iyimser eszamanlilik (B48): iki tasarimci birbirinin kural degisikligini ezmesin.
 const revision=Number(store.get('alarmRulesRevision')||0);
 const sent=Array.isArray(body)?undefined:body.revision;
 if(sent!==undefined&&sent!==revision)
  throw Object.assign(Error('Alarm kuralları başka bir oturumda değişti; listeyi yenileyip tekrar deneyin.'),{statusCode:409,data:{revision,rules:before}});
 store.transaction(()=>{store.saveAlarmRules(rules);store.set('alarmRulesRevision',revision+1);
  store.audit(u.username,'alarm.rules.saved',{reason:Array.isArray(body)?'':body.reason,before,after:rules,count:rules.length,revision:revision+1});});
 // Kural degisiminde acik olaylarin gecis politikasi acik olsun.
 alarms.applyRuleChanges(before,rules);
 alarms.tick();return {rules,revision:revision+1};
});
app.post('/api/alarms/ack',async req=>{
 const u=requireRole(req,['admin','operator']);
 const b=z.object({ids:z.array(z.string().max(80)).max(200).optional()}).parse(req.body||{});
 const rulesById=new Map(store.alarmRules().map(r=>[r.id,r]));
 // Alan izni olan kullanici yalniz kendi alanindaki alarmi onaylayabilir.
 const allowed=(id:string)=>{const e=store.alarm(id);const area=e?rulesById.get(e.ruleId)?.area||'':'';return !area||permits(u,'areas',area);};
 const ids=(b.ids?.length?b.ids:alarms.outstanding().filter(e=>!e.ackAt).map(e=>e.id)).filter(allowed);
 if(b.ids?.length&&!ids.length)throw Object.assign(Error('Bu alarmın alanı için onay izniniz yok.'),{statusCode:403});
 return {acknowledged:alarms.acknowledge(ids,u.username),counts:alarms.counts()};
});
app.post('/api/commands',async req=>{
 const u=read(req);requirePrimary();const b=z.object({id:z.string().uuid(),commandId:z.string().max(80),value:z.union([z.boolean(),z.number().finite()]),screenId:z.string(),screenVersion:z.number().int(),reason:z.string().trim().max(300).optional()}).parse(req.body);const s=store.screen(b.screenId);if(!s)throw Error('Ekran yok.');try{return commands.request(b,u,s);}catch(e){store.audit(u.username,'command.rejected',{request:b,error:(e as Error).message});throw e;}
});
app.post('/api/commands/:id/approve',async req=>{
 /* Y1: onay da sahaya yazan bir yoldur (approve -> request -> execute -> write).
  * Komut gonderme ve recete uygulama gibi burada da aktif sunucu sarti aranir;
  * aksi halde iki kisi onayi gerektiren EN YUKSEK RISKLI sinif, fencing'i
  * delerek pasif sunucudan PLC'ye yazabiliyordu. */
 const u=requireRole(req,['admin','operator']);requirePrimary();const id=String((req.params as any).id);
 const waiting=store.command(id);if(!waiting)throw Error('İşlem bulunamadı.');
 const s=store.screen(waiting.screenId);if(!s)throw Error('Ekran yok.');
 try{return commands.approve(id,u,s);}catch(e){store.audit(u.username,'command.approval.failed',{id,error:(e as Error).message});throw e;}
});
// Calisan scripti durdurur; guvenli durum yazilir. Durdurma hiz sinirina takilmaz.
app.post('/api/commands/:id/stop',async req=>{
 const u=requireRole(req,['admin','operator']);return commands.stop(String((req.params as any).id),u);
});
app.post('/api/commands/:id/reject',async req=>{
 const u=requireRole(req,['admin','operator']);return commands.rejectApproval(String((req.params as any).id),u);
});
registerRecords({app,store,retentionDays,read,requireRole});
/* --- Receteler (B09) -------------------------------------------------------
 * Recete surumludur; uygulanmasi SIRALI komut istekleridir. Her adim komut
 * kabul kontrollerinden (kalite, izin kosulu, yetki, risk onayi) tek tek gecer.
 * Kismi uygulamada ters yazma yapilmaz; sonuc adim adim raporlanir.
 */
app.get('/api/recipes',async req=>{read(req);return {recipes:store.get<Recipe[]>('recipes')||[]};});
app.put('/api/recipes',async req=>{
 const u=edit(req);const before=store.get<Recipe[]>('recipes')||[];
 const recipes=validateRecipes(req.body,store.config()).map(r=>{
  const old=before.find(x=>x.id===r.id);
  const changed=!old||JSON.stringify({...old,version:0,updatedAt:0,updatedBy:''})!==JSON.stringify({...r,version:0,updatedAt:0,updatedBy:''});
  return changed?{...r,version:(old?.version||0)+1,updatedBy:u.username,updatedAt:Date.now()}:old!;
 });
 store.transaction(()=>{store.set('recipes',recipes);store.audit(u.username,'recipe.saved',{count:recipes.length,before,after:recipes});});
 return {recipes};
});
app.get('/api/recipes/:id/preview',async req=>{
 read(req);const id=String((req.params as any).id);
 const recipe=(store.get<Recipe[]>('recipes')||[]).find(r=>r.id===id);if(!recipe)throw Error('Reçete bulunamadı.');
 return {recipe,steps:recipePreview(recipe,store.config(),samples)};
});
app.post('/api/recipes/:id/apply',async req=>{
 const u=requireRole(req,['admin','operator']);requirePrimary();
 const id=String((req.params as any).id);
 const b=z.object({screenId:z.string(),reason:z.string().trim().max(300).optional()}).parse(req.body);
 const recipe=(store.get<Recipe[]>('recipes')||[]).find(r=>r.id===id);if(!recipe)throw Error('Reçete bulunamadı.');
 const screen=store.screen(b.screenId);if(!screen)throw Error('Ekran yok.');
 store.audit(u.username,'recipe.apply.started',{id,name:recipe.name,version:recipe.version,steps:recipe.steps.length,reason:b.reason||''});
 const results:{index:number;commandId:string;status:string;message:string;executionId?:string}[]=[];
 for(const [index,step] of recipe.steps.entries()){
  try{
   const e=commands.request({id:randomUUID(),commandId:step.commandId,value:step.value,screenId:screen.id,screenVersion:screen.publishedVersion,reason:b.reason||('Reçete: '+recipe.name+' v'+recipe.version)},u,screen);
   results.push({index,commandId:step.commandId,status:e.status,message:e.message,executionId:e.id});
  }catch(e){
   // Kismi uygulama: kalan adimlar durur, yazilanlar korlemesine geri alinmaz.
   results.push({index,commandId:step.commandId,status:'rejected',message:(e as Error).message});
   store.audit(u.username,'recipe.apply.stopped',{id,name:recipe.name,version:recipe.version,failedStep:index,error:(e as Error).message,applied:results.filter(r=>r.status!=='rejected').length});
   return {ok:false,recipe:{id:recipe.id,name:recipe.name,version:recipe.version},results,
    message:'Reçete '+(index+1)+'. adımda durdu. Uygulanan adımlar geri alınmadı; sahayı kontrol edin.'};
  }
 }
 store.audit(u.username,'recipe.apply.finished',{id,name:recipe.name,version:recipe.version,steps:results.length});
 return {ok:true,recipe:{id:recipe.id,name:recipe.name,version:recipe.version},results,message:'Reçetenin tüm adımları gönderildi; sonuçlar komut listesinde izlenir.'};
});
/* --- Tasinabilir proje paketi (B33) ---------------------------------------
 * "Tasinabilir proje" = tanimlar + ekranlar (taslak ve yayin) + alarm kurallari
 * + ekipman tipleri + KULLANILAN GORSELLER, her biri hash'li bir manifest ile.
 * "Tam sistem yedegi" ise /api/backup ile alinan SQLite kopyasidir; olay
 * gecmisi, kullanicilar ve komut kayitlari yalnizca onda bulunur.
 */
const PACKAGE_VERSION=2;
function buildPackage(){
 const screens=store.screens();
 const assets=[...usedImages()].filter(n=>fs.existsSync(path.join(uploads,n))).map(name=>{
  const data=fs.readFileSync(path.join(uploads,name));
  return {name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),data:data.toString('base64')};
 });
 const body={kind:'dvp-scada-portable' as const,packageVersion:PACKAGE_VERSION,createdAt:Date.now(),
  config:store.config(),
  screens:screens.map(s=>({id:s.id,name:s.name,version:s.version,publishedVersion:s.publishedVersion,draft:s.draft,published:s.published,folder:s.folder||'',order:s.order??0})),
  alarmRules:store.alarmRules(),equipmentTypes:store.equipmentTypes(),homeScreenId:store.get<string>('homeScreenId')||'',
  alarmPolicy:alarmPolicy(),assets};
 const manifest={packageVersion:PACKAGE_VERSION,screens:body.screens.length,publishedScreens:body.screens.filter(s=>s.publishedVersion>0).length,
  tags:body.config.tags.length,devices:body.config.devices.length,alarmRules:body.alarmRules.length,equipmentTypes:body.equipmentTypes.length,
  assets:assets.map(a=>({name:a.name,bytes:a.bytes,sha256:a.sha256}))};
 return {...body,manifest};
}
const packageSchema=z.object({kind:z.literal('dvp-scada-portable'),packageVersion:z.number().int().min(1).max(PACKAGE_VERSION),
 config:z.unknown(),screens:z.array(z.object({id:z.string(),name:z.string(),draft:screenSchema,published:screenSchema.nullable().default(null),
  publishedVersion:z.number().int().min(0).default(0),version:z.number().int().min(1).default(1),folder:z.string().max(60).default(''),order:z.number().int().min(0).default(0)})).min(1).max(200),
 alarmRules:z.unknown().optional(),equipmentTypes:z.unknown().optional(),homeScreenId:z.string().optional(),alarmPolicy:z.unknown().optional(),
 assets:z.array(z.object({name:z.string().regex(/^[a-f0-9]{32}\.(png|jpg|gif|webp)$/),bytes:z.number().int().min(0),sha256:z.string().length(64),data:z.string()})).max(500).default([])});
/** Paketi dogrular ve uygulanacak degisikligin ozetini cikarir; ice aktarim once bunu gosterir. */
function inspectPackage(input:unknown){
 const p=packageSchema.parse(input);
 const c=validateConfig(p.config);
 const drafts=p.screens.map(s=>validateScreen(s.draft,c,p.screens.map(x=>x.id)));
 if(new Set(drafts.map(x=>x.id)).size!==drafts.length)throw Error('Ekran kimliği tekrar ediyor.');
 const badAssets=p.assets.filter(a=>createHash('sha256').update(Buffer.from(a.data,'base64')).digest('hex')!==a.sha256).map(a=>a.name);
 const referenced=new Set<string>();
 for(const m of JSON.stringify(p.screens).match(imagePattern)||[])referenced.add(m.slice('/uploads/'.length));
 const packaged=new Set(p.assets.map(a=>a.name));
 const missing=[...referenced].filter(n=>!packaged.has(n)&&!fs.existsSync(path.join(uploads,n)));
 const current=store.screens();
 return {packageVersion:p.packageVersion,compatible:p.packageVersion<=PACKAGE_VERSION,
  screens:{incoming:p.screens.length,replaced:current.filter(s=>p.screens.some(x=>x.id===s.id)).length,removed:current.filter(s=>!p.screens.some(x=>x.id===s.id)).map(s=>s.name)},
  tags:c.tags.length,devices:c.devices.length,alarmRules:Array.isArray(p.alarmRules)?p.alarmRules.length:0,
  equipmentTypes:Array.isArray(p.equipmentTypes)?p.equipmentTypes.length:0,
  assets:{total:p.assets.length,corrupted:badAssets,missing},
  devicesStayDisabled:true,parsed:p,config:c,drafts};
}
app.get('/api/package',async(req,reply)=>{requireRole(req,['admin']);
 const body=buildPackage();
 store.audit(userFor(req.headers)!.username,'package.exported',{...body.manifest,assets:body.manifest.assets.length});
 return reply.header('Content-Disposition','attachment; filename="scada-proje-paketi.json"').send(body);});
app.post('/api/package/preview',{bodyLimit:96*1024*1024},async req=>{requireRole(req,['admin']);
 const r=inspectPackage(req.body);const {parsed,config,drafts,...summary}=r as any;return summary;});
app.post('/api/package/import',{bodyLimit:96*1024*1024},async req=>{
 const u=requireRole(req,['admin']);requireFresh(req);
 if(deploying||commands.pending.size)throw Error('Devam eden işlem var.');
 const r=inspectPackage(req.body);
 if(r.assets.corrupted.length)throw Error('Paketteki görsellerin bütünlüğü bozuk: '+r.assets.corrupted.join(', '));
 if(r.assets.missing.length)throw Error('Ekranların kullandığı görseller pakette yok: '+r.assets.missing.join(', '));
 await backup(store.db,path.join(directory,`pre-package-${Date.now()}.sqlite`));
 const p=r.parsed,c=r.config;
 c.revision=store.config().revision+1;c.devices.forEach(d=>d.enabled=false);// devreye alma ayri karar (B06)
 for(const a of p.assets){const file=path.join(uploads,a.name);if(!fs.existsSync(file))fs.writeFileSync(file,Buffer.from(a.data,'base64'));}
 const rules=p.alarmRules?validateAlarms(p.alarmRules,c):[];
 const types=p.equipmentTypes?validateEquipmentTypes(p.equipmentTypes):[];
 store.transaction(()=>{
  store.set('config',c);store.saveAlarmRules(rules);store.saveEquipmentTypes(types);
  if(p.alarmPolicy)store.set('alarmPolicy',alarmPolicySchema.parse(p.alarmPolicy));
  store.db.exec('DELETE FROM screens; DELETE FROM revisions;');
  p.screens.forEach((s,i)=>{
   const draft=applyEquipmentBindings(r.drafts[i]);
   const published=s.published?applyEquipmentBindings(validateScreen(s.published,c)):null;
   store.saveScreen({id:draft.id,name:draft.name,version:s.version,publishedVersion:published?s.publishedVersion:0,draft,published,folder:s.folder,order:s.order});
   if(published)store.revision(published,s.publishedVersion);
  });
  if(p.homeScreenId&&p.screens.some(s=>s.id===p.homeScreenId))store.set('homeScreenId',p.homeScreenId);
  store.audit(u.username,'package.imported',{revision:c.revision,screens:p.screens.length,assets:p.assets.length,alarmRules:rules.length,equipmentTypes:types.length});
 });
 return {ok:true,summary:{screens:p.screens.length,assets:p.assets.length,devicesDisabled:c.devices.length}};
});
/* --- Bagimsiz kutuphane paketi (K12) ---------------------------------------
 * /api/package tum tesisi tasir ve ekranlari SILER; bu yuzey ise yalniz
 * ekipman tiplerini ve kullandiklari gorselleri tasir, EKLER/BIRLESTIRIR,
 * hicbir seyi silmez (bkz. packages/contracts/model.ts K12 blogu).
 */
const libraryAssetName=/^[a-f0-9]{32}\.(png|jpg|gif|webp|svg)$/;
/** Tiplerin JSON gövdesinde gecen /uploads/... adlarini bulur, diskten okuyup base64+sha256 ile döndürür. */
function libraryAssets(types:unknown){
 const names=new Set<string>();
 for(const m of JSON.stringify(types).match(imagePattern)||[])names.add(m.slice('/uploads/'.length));
 const out:{name:string;data:string;sha256:string}[]=[];
 for(const name of names){
  const file=path.join(uploads,name);if(!fs.existsSync(file))continue;
  const data=fs.readFileSync(file);
  out.push({name,data:data.toString('base64'),sha256:createHash('sha256').update(data).digest('hex')});
 }
 return out;
}
/** Kutuphane paketini dogrular; hicbir sey degistirmez. Varlik adlari, yol gecisini (path traversal)
 * onlemek icin path.join'e girmeden ONCE duzenli ifadeyle denetlenir. */
function inspectLibrary(input:unknown){
 const pack=libraryPackSchema.parse(input);
 if(pack.packVersion>LIBRARY_PACK_VERSION)throw Error('Kütüphane paketi bu sunucu sürümünden daha yeni; sunucuyu güncelleyin.');
 const badNames=pack.assets.filter(a=>!libraryAssetName.test(a.name)).map(a=>a.name);
 if(badNames.length)throw Error('Paketteki görsel adları geçersiz: '+badNames.join(', '));
 const corrupted=pack.assets.filter(a=>createHash('sha256').update(Buffer.from(a.data,'base64')).digest('hex')!==a.sha256).map(a=>a.name);
 const referenced=new Set<string>();
 for(const m of JSON.stringify(pack.types).match(imagePattern)||[])referenced.add(m.slice('/uploads/'.length));
 const packaged=new Set(pack.assets.map(a=>a.name));
 const missing=[...referenced].filter(n=>!packaged.has(n)&&!fs.existsSync(path.join(uploads,n)));
 return {pack,plan:planLibraryMerge(store.equipmentTypes(),pack),corrupted,missing};
}
app.get('/api/library',async(req,reply)=>{
 const user=edit(req);
 const q=z.object({typeIds:z.string().optional()}).parse(req.query);
 const ids=q.typeIds?q.typeIds.split(',').map(x=>x.trim()).filter(Boolean):[];
 const all=store.equipmentTypes();
 const types=ids.length?all.filter(t=>ids.includes(t.id)):all;
 if(!types.length)throw Error('Dışa aktarılacak ekipman tipi bulunamadı.');
 const assets=libraryAssets(types);
 if(assets.length>200)throw Error('Görsel sayısı çok fazla (en fazla 200); tip seçimini daraltın.');
 const name=types.length===1?types[0].name:types.length+' ekipman tipi';
 const body={kind:'scada-library' as const,packVersion:LIBRARY_PACK_VERSION,name,exportedAt:Date.now(),types,assets};
 store.audit(user.username,'library.exported',{types:types.length,assets:assets.length,names:types.map(t=>t.name)});
 return reply.header('Content-Disposition','attachment; filename="ekipman-kutuphanesi.json"').send(body);
});
app.post('/api/library/preview',{bodyLimit:96*1024*1024},async req=>{
 edit(req);
 const {pack,plan,corrupted,missing}=inspectLibrary(req.body);
 return {packVersion:pack.packVersion,packName:plan.packName,exportedAt:pack.exportedAt,items:plan.items,assets:{total:plan.assets,corrupted,missing}};
});
app.post('/api/library/import',{bodyLimit:96*1024*1024},async req=>{
 const user=edit(req);
 const body=z.object({pack:z.unknown(),choices:z.record(z.string(),z.enum(['upgrade','skip','duplicate'])).default({})}).parse(req.body);
 const {pack,corrupted,missing}=inspectLibrary(body.pack);
 if(corrupted.length)throw Error('Paketteki görsellerin bütünlüğü bozuk: '+corrupted.join(', '));
 if(missing.length)throw Error('Tiplerin kullandığı görseller pakette yok: '+missing.join(', '));
 const merged=applyLibraryMerge(store.equipmentTypes(),pack,body.choices as Record<string,LibraryChoice>,()=>randomUUID());
 const validated=validateEquipmentTypes(merged.types);
 // Kutuphane ice aktarimi yalniz equipmentTypes anahtarina dokunur; ekranlar,
 // config, alarm kurallari ve revizyonlar bu rotada HIC degistirilmez.
 for(const a of pack.assets){
  const file=path.join(uploads,a.name);if(fs.existsSync(file))continue;
  const buffer=Buffer.from(a.data,'base64');
  if(a.name.endsWith('.svg')){const verdict=inspectSvg(buffer.toString('utf8'));if(!verdict.ok)throw Error(a.name+': '+verdict.reason);}
  fs.writeFileSync(file,buffer);
 }
 const summary={packName:pack.name,added:merged.applied.filter(a=>a.action==='add').length,upgraded:merged.applied.filter(a=>a.action==='upgrade').length,
  duplicated:merged.applied.filter(a=>a.action==='duplicate').length,skipped:merged.applied.filter(a=>a.action==='skip').length,
  assets:pack.assets.length,total:validated.length};
 store.transaction(()=>{store.saveEquipmentTypes(validated);store.audit(user.username,'library.imported',summary);});
 return {equipmentTypes:validated,applied:merged.applied,summary};
});
app.get('/api/export',async(req,reply)=>{requireRole(req,['admin']);return reply.header('Content-Disposition','attachment; filename="scada-project.json"').send({schemaVersion:1,config:store.config(),screens:store.screens(),alarmRules:store.alarmRules(),equipmentTypes:store.equipmentTypes()});});
app.post('/api/import',async req=>{
 const u=requireRole(req,['admin']);requireFresh(req);if(deploying||commands.pending.size)throw Error('Devam eden işlem var.');const b=z.object({schemaVersion:z.literal(1),config:z.unknown(),screens:z.array(z.object({draft:screenSchema})).min(1).max(100),alarmRules:z.unknown().optional(),equipmentTypes:z.unknown().optional()}).parse(req.body);const c=validateConfig(b.config);c.revision=store.config().revision+1;c.devices.forEach(d=>d.enabled=false);const drafts=b.screens.map(s=>validateScreen(s.draft,c,b.screens.map(x=>x.draft.id)));if(new Set(drafts.map(x=>x.id)).size!==drafts.length)throw Error('Ekran kimliği tekrar ediyor.');
 await backup(store.db,path.join(directory,`pre-import-${Date.now()}.sqlite`));
 const rules=b.alarmRules?validateAlarms(b.alarmRules,c):[];
 const types=b.equipmentTypes?validateEquipmentTypes(b.equipmentTypes):[];
 store.transaction(()=>{store.set('config',c);store.saveAlarmRules(rules);store.saveEquipmentTypes(types);store.db.exec('DELETE FROM screens; DELETE FROM revisions;');for(const s of drafts)store.saveScreen({id:s.id,name:s.name,version:1,publishedVersion:0,draft:s,published:null});store.audit(u.username,'project.imported',{revision:c.revision,alarmRules:rules.length,equipmentTypes:types.length});});return {ok:true};
});
app.post('/api/backup',async req=>{const u=requireRole(req,['admin']),name=`backup-${Date.now()}.sqlite`;await backup(store.db,path.join(directory,name));store.audit(u.username,'backup.created',{name});return {name};});
const {uploads,usedImages,unusedImages,imagePattern}=await registerMedia({app,store,directory,read,edit,requireRole});
registerConnectionSecrets({app,store,directory,requireRole,requireFresh});
registerProjects({app,store,directory,requireRole,requireFresh,busy:()=>deploying||commands.pending.size>0,backup:name=>backup(store.db,path.join(directory,name)).then(()=>{})});
/* --- Saglik (B11) ---------------------------------------------------------
 * Portun acik olmasi calisan SCADA anlamina gelmez. Liveness surecin
 * yasadigini, readiness ise veritabani, disk, veri yasi ve etkin revizyonun
 * gercekten hazir oldugunu soyler.
 */
let loopLag=0,loopMark=Date.now();
const lagTimer=setInterval(()=>{const now=Date.now();loopLag=Math.max(0,now-loopMark-1000);loopMark=now;},1000);
const startedAt=Date.now();
// Dagitim kimligi (B): Vite build'i dist/web/build.json yazar; sunucu baslarken kendi kopyasini
// okur, /api/health her cagrida yayindaki dosyayi (mtime ile ucuz) yeniden okur — ikisi ayrisirsa
// tarayici eski dist'i, sunucu yeni kodu calistiriyor demektir (ya da tersi).
const buildFile=path.resolve('dist/web/build.json');
const startBuild=readBuild(buildFile);
let distBuildCache:{mtime:number;data:{id:string;at:number}|null}|null=null;
function currentDistBuild(){
 try{const mtime=fs.statSync(buildFile).mtimeMs;
  if(!distBuildCache||distBuildCache.mtime!==mtime)distBuildCache={mtime,data:readBuild(buildFile)};
  return distBuildCache.data;
 }catch{distBuildCache=null;return null;}
}
function readiness(){
 const checks:{name:string;ok:boolean;detail:string}[]=[];
 let dbOk=true;try{store.db.prepare('SELECT 1').get();}catch{dbOk=false;}
 checks.push({name:'database',ok:dbOk,detail:dbOk?'erişilebilir':'sorgu başarısız'});
 let freeMb=-1;try{const st=(fs as any).statfsSync?.(directory);if(st)freeMb=Math.round(st.bavail*st.bsize/1048576);}catch{}
 checks.push({name:'disk',ok:freeMb<0||freeMb>200,detail:freeMb<0?'ölçülemedi':freeMb+' MB boş'});
 const gatewayAge=Date.now()-gatewayAt;
 checks.push({name:'gateway',ok:gatewayAge<4000,detail:gatewayAt?Math.round(gatewayAge/1000)+' sn önce veri geldi':'hiç veri gelmedi'});
 const devices=deviceHealth(),ready=devices.filter(d=>d.status==='ready').length;
 checks.push({name:'devices',ok:devices.length>0&&ready===devices.length,detail:ready+'/'+devices.length+' cihaz güncel'});
 const revisionOk=!!active&&active.revision===store.config().revision;
 checks.push({name:'revision',ok:revisionOk,detail:revisionOk?'etkin revizyon güncel':'kayıtlı yapılandırma uygulanmadı'});
 checks.push({name:'eventLoop',ok:loopLag<2000,detail:loopLag+' ms gecikme'});
 checks.push({name:'ownership',ok:isPrimary(),detail:isPrimary()?'aktif sunucu ('+instanceId+', epoch '+ownership.epoch+')':'pasif; aktif: '+(store.ownership()?.instanceId||'bilinmiyor')});
 return {ready:checks.every(c=>c.ok),checks};
}
app.get('/api/health',async(req,reply)=>{
 // Liveness: surec ve olay dongusu; dis bagimliliklara bakmaz.
 const ok=loopLag<5000;
 if(!ok)reply.code(503);
 const distBuild=currentDistBuild();
 // bridge: Node-RED kopru watchdog'unun son bilinen sonucu (gorunurluk icin, liveness'i etkilemez).
 return {ok,version:'0.1.0',uptimeMs:Date.now()-startedAt,eventLoopLagMs:loopLag,bridge:gatewayHealth(),
  build:{server:startBuild?.id??null,dist:distBuild?.id??null,serverAt:startBuild?.at??null,distAt:distBuild?.at??null}};
});
/**
 * Watchdog gecmisi (B11): hazir/hazir degil gecisleri denetim kaydina yazilir,
 * boylece "gece 03:12'de ne oldu" sorusu cevaplanabilir. Her turda degil,
 * yalniz durum degistiginde yazilir.
 */
let lastReady='';
const watchdogTimer=setInterval(()=>{
 const r=readiness(),state=r.ready?'ready':'degraded';
 if(state===lastReady)return;
 const failing=r.checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail);
 if(lastReady)store.audit('system','watchdog.'+state,{failing,uptimeMs:Date.now()-startedAt});
 lastReady=state;
},5000).unref?.();
app.get('/api/cluster',async req=>{read(req);const owner=store.ownership();
 return {instanceId,role:ownership.role,epoch:ownership.epoch,leaseTtlMs,activeInstance:owner?.instanceId||'',lastHeartbeatAt:owner?.heartbeatAt||0};});
app.get('/api/ready',async(req,reply)=>{
 const r=readiness();if(!r.ready)reply.code(503);
 // bridge: koprunun goruntusu ready hesabina karismaz — yazma zaten staleMs ile durur, bu sadece teshis.
 return {...r,version:'0.1.0',uptimeMs:Date.now()-startedAt,bridge:gatewayHealth(),ingestRejects:ingestRejects()};
});
const wsServer=new WebSocketServer({noServer:true,maxPayload:1024*1024});
app.server.on('upgrade',(req,socket,head)=>{
 const url=new URL(req.url||'/',`http://127.0.0.1:${port}`);
 if(url.pathname==='/internal/gateway'&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')){
  wsServer.handleUpgrade(req,socket,head,ws=>{ws.on('message',raw=>{try{
   const m=JSON.parse(raw.toString());if(m.token!==gatewayToken){ws.close();return;}if(m.revision!==active?.revision)return;gatewayAt=Date.now();
   if(!Array.isArray(m.samples)||!active)return;const now=Date.now();
   /* Y3: session degisimi sira kontrolunu atlamanin yolu olmasin — kabul kurallari ingest.ts'te. */
   const verdict=acceptSource(sources.get(m.source),m,now);
   if(!verdict.ok){noteReject(verdict.reason);return;}
   sources.set(m.source,verdict.next);
   for(const item of m.samples){const t=active.tags.find(t=>t.id===item.tagId);if(!t)continue;
    /* Y4: damgasi uydurma olan ornek hic yazilmaz — eski deger yerinde kalir ve
     * staleMs ile bayatlar. Yazmak, commands.ts:122'deki `sampledAt>ackAt`
     * dogrulamasini kandirip komutu yanlislikla `verified` yapardi. */
    if(!acceptSampledAt(item.sampledAt,now)){noteReject('sampled-at');continue;}
    const valid=item.quality==='good'&&(t.dataType==='bool'?typeof item.value==='boolean':typeof item.value==='number'&&Number.isFinite(item.value));samples[t.id]={value:valid?item.value:null,quality:valid?'good':'bad',receivedAt:now,sampledAt:item.sampledAt,sequence:m.sequence};}
  }catch{ws.close();}});});
 }else if(url.pathname==='/api/live'&&userFor(req.headers)&&(!req.headers.origin||new URL(req.headers.origin).host===req.headers.host)){
  const v2=url.searchParams.get('proto')==='2';
  wsServer.handleUpgrade(req,socket,head,ws=>{sessions.set(ws,req.headers.cookie||'');if(v2)deltaClients.set(ws,{needFull:false});ws.on('close',()=>{sessions.delete(ws);deltaClients.delete(ws);});ws.send(JSON.stringify(v2?{t:'f',...live()}:live()));});
 }else socket.destroy();
});
/** Cihaz bazlı sağlık; genel gösterge en kötü kritik bağlantıdan üretilir. */
function deviceHealth(){
 if(!active)return [];
 return active.devices.filter(d=>d.enabled).map(d=>{
  const tags=active!.tags.filter(t=>t.deviceId===d.id);
  const good=tags.filter(t=>samples[t.id]?.quality==='good').length;
  const seen=tags.filter(t=>samples[t.id]).length;
  const oldest=tags.reduce((age,t)=>{const s=samples[t.id];return s?Math.max(age,Date.now()-s.receivedAt):age;},0);
  return {id:d.id,code:d.code,name:d.name,tags:tags.length,good,seen,dataAgeMs:oldest,
   status:tags.length===0?'empty':good===tags.length?'ready':good>0?'partial':'down'};
 });
}
function live(){
 const gatewayConnected=Date.now()-gatewayAt<4000,devices=deviceHealth();
 const ready=devices.filter(d=>d.status==='ready').length;
 return {samples,gatewayConnected,activeRevision:active?.revision||0,desiredRevision:store.config().revision,deploying,
  commands:store.commands().slice(0,20),alarms:alarms.pending(),alarmCounts:alarms.counts(),alarmFlood:alarms.floodState(),
  devices,devicesReady:ready,devicesTotal:devices.length,
  controlReady:gatewayConnected&&!deploying&&devices.length>0&&ready===devices.length&&active?.revision===store.config().revision};
}
let lastHealth='';
/** Komut tekrar engelleme garantisini bozmamak icin journal yalnizca saklama suresi disinda silinir. */
function pruneJournal(days:number){
 const dir=path.join(directory,'gateway-commands');
 if(!fs.existsSync(dir))return 0;
 const cutoff=Date.now()-days*86400000;let removed=0;
 for(const f of fs.readdirSync(dir)){const file=path.join(dir,f);
  try{if(fs.statSync(file).mtimeMs<cutoff){fs.unlinkSync(file);removed++;}}catch{}}
 return removed;
}
let diskWarned=false;
/** Disk dolmadan once uyar: dolu disk sessizce veri kaybettirir. */
function checkDisk(){
 const freeMb=store.freeSpaceMb();
 if(freeMb<0)return freeMb;
 if(freeMb<500&&!diskWarned){diskWarned=true;store.audit('system','disk.low',{freeMb,thresholdMb:500});}
 else if(freeMb>=750&&diskWarned){diskWarned=false;store.audit('system','disk.recovered',{freeMb});}
 return freeMb;
}
function pruneAll(){
 const freeMb=checkDisk();
 const history=store.pruneHistory(retentionDays);
 const records=store.pruneRecords(retentionDays);
 const journal=pruneJournal(retentionDays);
 const energyRows=store.pruneEnergy(energyRetentionDays);if(energyRows)store.audit('system','retention.energy',{energyRetentionDays,rows:energyRows});
 if(history||journal||records.audit||records.commands||records.alarms)
  store.audit('system','retention.pruned',{retentionDays,history,journal,freeMb,...records});
}
const prune=setInterval(pruneAll,6*3600000);setTimeout(pruneAll,30000).unref?.();
let lastPayload='',lastBroadcast=0,lastSampleJson=new Map<string,string>(),lastFullAt=0;
// proto=2 istemciler delta alir; gonderim atlanirsa (tampon dolu) sonraki mesaj tam gider, 30 sn'de bir herkese tam.
const deltaClients=new Map<WebSocket,{needFull:boolean}>();
const timer=setInterval(()=>{
 for(const [id,s] of Object.entries(samples)){const t=active?.tags.find(t=>t.id===id),d=active?.devices.find(d=>d.id===t?.deviceId);if(s.quality==='good'&&(Date.now()-s.receivedAt>(d?.staleMs||4000)||Date.now()-gatewayAt>4000))s.quality='stale';}
 commands.tick();alarms.tick();recordHistory();energy.meter.tick();const state=live(),payload=JSON.stringify(state);
 // Ayni icerik tekrar gonderilmez; sessiz tesiste 500 ms'lik tam snapshot yuku dusuyor (B50).
 // En az 5 saniyede bir kalp atisi olarak yine gonderilir ki istemci baglantiyi canli sayabilsin.
 const now=Date.now(),changed=payload!==lastPayload,heartbeat=now-lastBroadcast>=5000;
 if(changed||heartbeat){lastPayload=payload;lastBroadcast=now;
  const {changed:dChanged,removed:dRemoved,next:dNext}=sampleDelta(lastSampleJson,state.samples);lastSampleJson=dNext;
  const fullRound=now-lastFullAt>=30000;if(fullRound)lastFullAt=now;
  const {samples:_s,...rest}=state;let deltaPayload='',fullPayload='';
  for(const [ws,c] of sessions){if(!userFor({cookie:c})){ws.close();continue;}
   const d=deltaClients.get(ws),open=ws.readyState===WebSocket.OPEN,room=ws.bufferedAmount<1024*1024;
   if(!d){if(open&&room)ws.send(payload);continue;}
   if(!open||!room){d.needFull=true;continue;}
   if(d.needFull||fullRound){ws.send(fullPayload||=JSON.stringify({t:'f',...state}));d.needFull=false;}
   else ws.send(deltaPayload||=JSON.stringify({t:'d',...rest,changed:dChanged,removed:dRemoved}));}}
 const enabled=active?.tags.filter(t=>active!.devices.some(d=>d.id===t.deviceId&&d.enabled))||[];
 const ready=state.gatewayConnected&&enabled.every(t=>samples[t.id]?.quality==='good');const health=ready?'ready':'waiting';if(lastHealth!==health){lastHealth=health;store.audit('system','gateway.'+health,{revision:active?.revision});}
 const dep=store.get<any>('deployment');if(dep&&dep.status!=='failed'&&dep.status!==health&&!deploying)store.set('deployment',{...dep,status:health});
},500);
if(fs.existsSync(path.resolve('dist/web'))){await app.register(staticFiles,staticOptions(path.resolve('dist/web')));app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api')?reply.code(404).send({error:'Bulunamadı'}):reply.sendFile('index.html'));}
// Testte port acmadan `app.inject` ile surulebilsin diye dinleme kosullu (B55).
if(process.env.SCADA_NO_LISTEN!=='1'){await app.listen({host:process.env.SCADA_HOST||'127.0.0.1',port});console.log(`Z SCADA http://localhost:${port}`);}
async function close(){try{await commands.shutdown();}catch{}clearInterval(timer);try{energy.meter.flush();}catch{}clearInterval(prune);clearInterval(lagTimer);clearInterval(ownershipTimer);stopGatewayWatchdog();fileLog.stop();process.off("uncaughtException",onUncaught);process.off("unhandledRejection",onUnhandled);for(const ws of wsServer.clients)ws.close();await app.close();store.close();process.exit(0);}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
/** Testler icin: acik zamanlayicilari da kapatan, sureci sonlandirmayan kapanis. */
return Object.assign(app,{scadaStore:store,scadaClose:async()=>{try{await commands.shutdown();}catch{}clearInterval(timer);try{energy.meter.flush();}catch{}clearInterval(prune);clearInterval(lagTimer);clearInterval(watchdogTimer);clearInterval(ownershipTimer);stopGatewayWatchdog();fileLog.stop();process.off("uncaughtException",onUncaught);process.off("unhandledRejection",onUnhandled);for(const ws of wsServer.clients)ws.close();await app.close();store.close();}});
}
/** Port acmadan kurulmus sunucu; `app.inject` ile HTTP testleri yazilabilir. */
export async function createServer(){const prior=process.env.SCADA_NO_LISTEN;process.env.SCADA_NO_LISTEN='1';try{return await main();}finally{if(prior===undefined)delete process.env.SCADA_NO_LISTEN;else process.env.SCADA_NO_LISTEN=prior;}}
// Dogrudan calistirildiginda sunucuyu ayaga kaldirir; import edildiginde (testler) kaldirmaz.
/* 2026-09-25 olay: bir test index.ts'i statik import edince gercek main() canli .local verisine karsi
 * calisti (Store acildi, zamanlayicilar denetim kaydina yazdi). Test calistiricisi icinde (node --test
 * cocuk sureci NODE_TEST_CONTEXT tasir) sunucu kendiliginden ASLA baslamaz; testler createServer() kullanir. */
if(process.env.SCADA_NO_LISTEN!=='1'&&!process.env.NODE_TEST_CONTEXT)main().catch(e=>{console.error(e);process.exitCode=1;});
