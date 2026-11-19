import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {seedConfig,seedScreen} from '../../../packages/contracts/seed';
import {utilityDemoScreen} from '../../../packages/contracts/demo';
import type {AlarmEvent,AlarmRule,Config,EquipmentType,Screen,ScreenRecord,Execution} from '../../../packages/contracts/model';
import {finalStatuses} from '../../../packages/contracts/model';
/**
 * Denetim kaydi gorunurluk kapsami. Config/kullanici olaylari tam icerik
 * (IP, rol, izin) tasir; izleyici ve operator yalniz isletme olaylarini gorur.
 * SQL parcalari sabittir, kullanici girdisi icermez.
 */
export type AuditScope='all'|'design'|'operations';
const auditScopeSql:Record<AuditScope,string>={
 all:'',
 design:" AND action NOT LIKE 'user.%' AND action NOT LIKE 'reauth.%'",
 operations:" AND (action LIKE 'command.%' OR action LIKE 'recipe.apply.%' OR action='shift.note' OR action LIKE 'watchdog.%' OR action LIKE 'gateway.%' OR (action LIKE 'alarm.%' AND action NOT IN ('alarm.rules.saved','alarm.policy.saved')))"
};
export function auditScopeFor(role:string):AuditScope{return role==='admin'?'all':role==='designer'?'design':'operations';}
export class Store {
 /** Sema surumu; her yapisal degisiklikte artirilir ve migrate() icine adim eklenir. */
 static SCHEMA_VERSION=9;
 db:DatabaseSync;
 constructor(public directory:string){
  fs.mkdirSync(directory,{recursive:true});this.db=new DatabaseSync(path.join(directory,'scada.sqlite'));this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  this.db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS screens (id TEXT PRIMARY KEY, body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS revisions (screen_id TEXT, version INTEGER, body TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(screen_id,version));
   CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, body TEXT NOT NULL, created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL, created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, role TEXT NOT NULL, hash TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT '');
   CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL,reauth INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS alarms (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, raised INTEGER NOT NULL, cleared INTEGER, ack INTEGER, body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS alarms_raised ON alarms (raised DESC);
   CREATE TABLE IF NOT EXISTS history (tag_id TEXT NOT NULL, at INTEGER NOT NULL, value REAL, quality TEXT NOT NULL, PRIMARY KEY(tag_id,at));
   CREATE INDEX IF NOT EXISTS history_at ON history (at DESC);
   CREATE TABLE IF NOT EXISTS shift_notes (id TEXT PRIMARY KEY, author TEXT NOT NULL, shift TEXT NOT NULL, start INTEGER NOT NULL, finish INTEGER NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS shift_notes_created ON shift_notes (created DESC);
   CREATE INDEX IF NOT EXISTS audit_created ON audit (created DESC);
   CREATE INDEX IF NOT EXISTS commands_created ON commands (created DESC);
   CREATE TABLE IF NOT EXISTS energy_hourly (analyzer_id TEXT NOT NULL, hour INTEGER NOT NULL, ea REAL NOT NULL DEFAULT 0, eqi REAL NOT NULL DEFAULT 0, eqc REAL NOT NULL DEFAULT 0, p_sum REAL NOT NULL DEFAULT 0, p_n INTEGER NOT NULL DEFAULT 0, p_max REAL, demand_max REAL, gap INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(analyzer_id,hour));
   CREATE INDEX IF NOT EXISTS energy_hourly_hour ON energy_hourly (hour);
   `);
  this.migrate();
  if(!this.get('config')){this.set('config',seedConfig);this.set('activeConfig',null);this.saveScreen({id:seedScreen.id,name:seedScreen.name,version:1,publishedVersion:1,draft:seedScreen,published:seedScreen});this.revision(seedScreen,1);}
  if(!this.screen('screen-utility-demo')){const demo=utilityDemoScreen(this.config());this.saveScreen({id:demo.id,name:demo.name,version:1,publishedVersion:1,draft:demo,published:demo});this.revision(demo,1);}
  for(const c of this.commands())if(!finalStatuses.includes(c.status)){
   // Yarim kalan script: guvenli durum haberlesme gelince Commands.tick'te yazilir (recover).
   if(c.kind==='script'){c.status='uncertain';c.recover=true;c.message='Sunucu script çalışırken kapandı; haberleşme gelince güvenli durum yazılacak.';}
   else{c.status='uncertain';c.message='Sunucu yeniden başladı; komut tekrar gönderilmedi.';}
   this.saveCommand(c);}
 }
 /**
  * Sema surumu zinciri. Yeni kurulumda yukaridaki CREATE ifadeleri guncel
  * semayi kurar; eski veritabanlari sirayla goc eder. Desteklenmeyen (daha
  * yeni) surum acikca reddedilir — sessiz veri kaybi yerine acik hata.
  */
 migrate(){
  const current=Number((this.db.prepare('PRAGMA user_version').get() as any).user_version||0);
  if(current>Store.SCHEMA_VERSION)throw Error(`Veritabanı şeması (v${current}) bu sürümden yeni (v${Store.SCHEMA_VERSION}). Uygulamayı güncelleyin.`);
  if(current===Store.SCHEMA_VERSION)return;
  const fresh=!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get()
   ||!this.db.prepare('SELECT key FROM meta LIMIT 1').get();
  if(!fresh&&current<Store.SCHEMA_VERSION){
   // Donusum oncesi yedek; geri donus mumkun kalsin.
   const backup=path.join(this.directory,`pre-migration-v${current}-${Date.now()}.sqlite`);
   try{fs.copyFileSync(path.join(this.directory,'scada.sqlite'),backup);}catch{}
  }
  const steps:Record<number,()=>void>={
   1:()=>{if(!(this.db.prepare('PRAGMA table_info(users)').all() as any[]).some(c=>c.name==='disabled'))
     this.db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');},
   2:()=>{this.db.exec(`CREATE TABLE IF NOT EXISTS history (tag_id TEXT NOT NULL, at INTEGER NOT NULL, value REAL, quality TEXT NOT NULL, PRIMARY KEY(tag_id,at));
    CREATE INDEX IF NOT EXISTS history_at ON history (at DESC);`);},
   // Tarih arali kli denetim/komut sorgusu tabloyu bastan sona taramasin.
   // Adim numarasi HEDEF surumdur: k adimi (k-1)'den k'ya gecirir.
   4:()=>{this.db.exec(`CREATE INDEX IF NOT EXISTS audit_created ON audit (created DESC);
    CREATE INDEX IF NOT EXISTS commands_created ON commands (created DESC);`);},
   // Kritik islemde yeniden dogrulama: oturumun en son ne zaman parola ile tazelendigi.
   5:()=>{if(!(this.db.prepare('PRAGMA table_info(sessions)').all() as any[]).some(c=>c.name==='reauth'))
     this.db.exec('ALTER TABLE sessions ADD COLUMN reauth INTEGER NOT NULL DEFAULT 0');},
   // Granuler izinler: bos deger "kisitlama yok" demektir, eski hesaplar aynen calisir.
   6:()=>{if(!(this.db.prepare('PRAGMA table_info(users)').all() as any[]).some(c=>c.name==='permissions'))
     this.db.exec("ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT ''");},
   // Vardiya notlari: raporun insan tarafi. Olay kayitlari neyi, not nedenini anlatir.
   7:()=>{this.db.exec(`CREATE TABLE IF NOT EXISTS shift_notes (id TEXT PRIMARY KEY, author TEXT NOT NULL, shift TEXT NOT NULL, start INTEGER NOT NULL, finish INTEGER NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS shift_notes_created ON shift_notes (created DESC);`);},
   /* B61: etiket bazinda geri okuma dogrulama toleransi. Tablo degisikligi yok —
    * etiketler config JSON'unda yasiyor; goc eski kayitlara acik `null` yaziyor
    * ki "otomatik" secimi veride gorunsun, undefined olarak sessiz kalmasin. */
   8:()=>{for(const key of ['config','activeConfig']){const c=this.get<any>(key);if(!c||!Array.isArray(c.tags))continue;
     let changed=false;for(const t of c.tags)if(t.verifyTolerance===undefined){t.verifyTolerance=null;changed=true;}
     if(changed)this.set(key,c);}},
   // Enerji analizoru: saatlik tuketim kovasi. Historian'dan ayri ve uzun saklanir (yillik rapor).
   9:()=>{this.db.exec(`CREATE TABLE IF NOT EXISTS energy_hourly (analyzer_id TEXT NOT NULL, hour INTEGER NOT NULL, ea REAL NOT NULL DEFAULT 0, eqi REAL NOT NULL DEFAULT 0, eqc REAL NOT NULL DEFAULT 0, p_sum REAL NOT NULL DEFAULT 0, p_n INTEGER NOT NULL DEFAULT 0, p_max REAL, demand_max REAL, gap INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(analyzer_id,hour));
   CREATE INDEX IF NOT EXISTS energy_hourly_hour ON energy_hourly (hour);`);}
  };
  for(let v=current;v<Store.SCHEMA_VERSION;v++){const step=steps[v+1];if(step)step();}
  this.db.exec('PRAGMA user_version='+Store.SCHEMA_VERSION);
 }
 get<T=unknown>(key:string):T{const row=this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as any;return row?JSON.parse(row.value):undefined as T;}
 set(key:string,value:unknown){this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key,JSON.stringify(value));}
 config(){return this.get<Config>('config');}
 screens():ScreenRecord[]{return (this.db.prepare('SELECT body FROM screens ORDER BY rowid').all() as any[]).map(r=>JSON.parse(r.body));}
 /** Tek ekran icin butun ekranlari okumak olcek riskiydi (B50): id ile dogrudan sorgu. */
 screen(id:string){const r=this.db.prepare('SELECT body FROM screens WHERE id=?').get(id) as any;return r?JSON.parse(r.body) as ScreenRecord:undefined;}
 saveScreen(s:ScreenRecord){this.db.prepare('INSERT OR REPLACE INTO screens VALUES (?,?)').run(s.id,JSON.stringify(s));}
 revision(s:Screen,version:number){this.db.prepare('INSERT OR REPLACE INTO revisions VALUES (?,?,?,?)').run(s.id,version,JSON.stringify(s),Date.now());}
 commands():Execution[]{return (this.db.prepare('SELECT body FROM commands ORDER BY created DESC LIMIT 200').all() as any[]).map(r=>JSON.parse(r.body));}
 command(id:string):Execution|undefined{const r=this.db.prepare('SELECT body FROM commands WHERE id=?').get(id) as any;return r?JSON.parse(r.body):undefined;}
 saveCommand(c:Execution){c.updatedAt=Date.now();this.db.prepare('INSERT OR REPLACE INTO commands VALUES (?,?,?)').run(c.id,JSON.stringify(c),c.createdAt);}
 alarmRules():AlarmRule[]{return this.get<AlarmRule[]>('alarmRules')||[];}
 equipmentTypes():EquipmentType[]{return this.get<EquipmentType[]>('equipmentTypes')||[];}
 saveEquipmentTypes(types:EquipmentType[]){this.set('equipmentTypes',types);}
 saveAlarmRules(rules:AlarmRule[]){this.set('alarmRules',rules);}
 saveAlarm(e:AlarmEvent){this.db.prepare('INSERT OR REPLACE INTO alarms VALUES (?,?,?,?,?,?)').run(e.id,e.ruleId,e.raisedAt,e.clearedAt,e.ackAt,JSON.stringify(e));}
 alarm(id:string):AlarmEvent|undefined{const r=this.db.prepare('SELECT body FROM alarms WHERE id=?').get(id) as any;return r?JSON.parse(r.body):undefined;}
 alarms(limit=200):AlarmEvent[]{return (this.db.prepare('SELECT body FROM alarms ORDER BY raised DESC LIMIT ?').all(limit) as any[]).map(r=>JSON.parse(r.body));}
 alarmsBetween(from:number,to:number,limit=1000):AlarmEvent[]{return (this.db.prepare('SELECT body FROM alarms WHERE raised>=? AND raised<=? ORDER BY raised DESC LIMIT ?').all(from,to,limit) as any[]).map(r=>JSON.parse(r.body));}
 openAlarms():AlarmEvent[]{return (this.db.prepare('SELECT body FROM alarms WHERE cleared IS NULL ORDER BY raised DESC LIMIT 500').all() as any[]).map(r=>JSON.parse(r.body));}
 /** Onaylanmamış olayların tamamı; zaman penceresinden bağımsızdır (alarm selinde eski kritik olay kaybolmasın). */
 unackedAlarms(limit=2000):AlarmEvent[]{return (this.db.prepare('SELECT body FROM alarms WHERE ack IS NULL ORDER BY raised DESC LIMIT ?').all(limit) as any[]).map(r=>JSON.parse(r.body));}
 alarmCounts(){const r=this.db.prepare('SELECT COUNT(*) total, SUM(CASE WHEN cleared IS NULL THEN 1 ELSE 0 END) active, SUM(CASE WHEN ack IS NULL THEN 1 ELSE 0 END) unacked, SUM(CASE WHEN cleared IS NULL AND ack IS NULL THEN 1 ELSE 0 END) activeUnacked FROM alarms').get() as any;
  return {total:Number(r?.total||0),active:Number(r?.active||0),unacked:Number(r?.unacked||0),activeUnacked:Number(r?.activeUnacked||0)};}
 /** Alarm felsefesi raporu: sel, uzun sure, tekrar ve ACK gecikmesi olculebilir olsun. */
 alarmMetrics(from:number,to:number){
  const events=(this.db.prepare('SELECT body FROM alarms WHERE raised BETWEEN ? AND ?').all(from,to) as any[]).map(r=>JSON.parse(r.body) as AlarmEvent),now=Date.now();
  const byRule=new Map<string,AlarmEvent[]>();for(const event of events){const list=byRule.get(event.ruleId)||[];list.push(event);byRule.set(event.ruleId,list);}
  const rows=[...byRule.entries()].map(([ruleId,list])=>{const durations=list.map(e=>(e.clearedAt||now)-e.raisedAt),acks=list.filter(e=>e.ackAt).map(e=>e.ackAt!-e.raisedAt);return {ruleId,name:list[0].name,count:list.length,open:list.filter(e=>!e.clearedAt).length,longestMs:Math.max(0,...durations),averageAckMs:acks.length?Math.round(acks.reduce((a,b)=>a+b,0)/acks.length):null,chattering:list.length>=3&&list.at(-1)!.raisedAt-list[0].raisedAt<3600000};}).sort((a,b)=>b.count-a.count||b.longestMs-a.longestMs);
  return {from,to,total:events.length,rows};
 }
/** Gecmis ornek yazar; deger yoksa kalite ile bosluk kaydedilir (grafikte kopukluk gorunur). */
 writeHistory(rows:{tagId:string;at:number;value:number|null;quality:string}[]){
  if(!rows.length)return;
  const stmt=this.db.prepare('INSERT OR REPLACE INTO history VALUES (?,?,?,?)');
  for(const r of rows)stmt.run(r.tagId,r.at,r.value,r.quality);
 }
 /** Zaman araligindaki ornekler; cok nokta varsa esit araliklarla seyreltilir.
  * Seyreltme SQL icinde yapilir (B): eskiden butun satirlar JS'e cekilip orada
  * filtreleniyordu — genis araliklarda gereksiz IO/bellek. Cikti ayni: ilk ve
  * son nokta her zaman kalir, aradakiler `stride` araliklarla secilir. */
 history(tagIds:string[],from:number,to:number,maxPoints=1000){
  const result:Record<string,{at:number;value:number|null;quality:string}[]>={};
  const stmt=this.db.prepare(
   `WITH r AS (SELECT at,value,quality,ROW_NUMBER() OVER (ORDER BY at) rn FROM history WHERE tag_id=? AND at BETWEEN ? AND ?)
    SELECT at,value,quality FROM r WHERE rn%?=0 OR rn=1 OR rn=(SELECT MAX(rn) FROM r) ORDER BY at`);
  for(const tagId of tagIds){
   const total=(this.db.prepare('SELECT COUNT(*) n FROM history WHERE tag_id=? AND at BETWEEN ? AND ?').get(tagId,from,to) as any).n as number;
   const stride=Math.max(1,Math.ceil(total/maxPoints));
   const rows=stmt.all(tagId,from,to,stride) as any[];
   result[tagId]=rows.map(r=>({at:Number(r.at),value:r.value===null?null:Number(r.value),quality:String(r.quality)}));
  }
  return result;
 }
 /** Kayitlar sinirsiz buyumesin: saklama suresi disindaki islem, denetim ve kapanmis alarm kayitlarini siler. */
 pruneRecords(days:number){
  const cutoff=Date.now()-days*86400000;
  return this.transaction(()=>({
   audit:this.db.prepare('DELETE FROM audit WHERE created<?').run(cutoff).changes,
   // Sonuclanmamis komut silinmez: tekrar engelleme ve uzlastirma garantisi bozulmasin.
   commands:this.db.prepare("DELETE FROM commands WHERE created<? AND json_extract(body,'$.status') IN ('verified','rejected','failed','unverified','partial')").run(cutoff).changes,
   alarms:this.db.prepare('DELETE FROM alarms WHERE raised<? AND cleared IS NOT NULL AND ack IS NOT NULL').run(cutoff).changes}));
 }
 /** Tarih arali kli sayfalama; UI'da az kayit gorunmesi diskte az kayit oldugu anlamina gelmez. */
 auditPage(from:number,to:number,limit=200,offset=0,scope:AuditScope='all'){
  const where='WHERE created BETWEEN ? AND ?'+auditScopeSql[scope];
  const total=(this.db.prepare('SELECT COUNT(*) n FROM audit '+where).get(from,to) as any).n as number;
  const rows=(this.db.prepare('SELECT * FROM audit '+where+' ORDER BY created DESC LIMIT ? OFFSET ?').all(from,to,limit,offset) as any[]).map(r=>({...r,details:JSON.parse(r.details)}));
  return {total,rows};
 }
 commandPage(from:number,to:number,limit=200,offset=0){
  const total=(this.db.prepare('SELECT COUNT(*) n FROM commands WHERE created BETWEEN ? AND ?').get(from,to) as any).n as number;
  const rows=(this.db.prepare('SELECT body FROM commands WHERE created BETWEEN ? AND ? ORDER BY created DESC LIMIT ? OFFSET ?').all(from,to,limit,offset) as any[]).map(r=>JSON.parse(r.body));
  return {total,rows};
 }
 /** Saklama suresi disindaki gecmis satirlari siler. */
 /** Enerji kovalari historian'dan uzun saklanir; varsayilan 10 yil. */
 pruneEnergy(days:number){return this.db.prepare('DELETE FROM energy_hourly WHERE hour<?').run(Date.now()-days*86400000).changes;}
 pruneHistory(days:number){
  const cutoff=Date.now()-days*86400000;
  return this.db.prepare('DELETE FROM history WHERE at<?').run(cutoff).changes;
 }
 /** Vardiya notu ekler ve tarih araligiyla okur (B10). */
 addShiftNote(note:{author:string;shift:string;start:number;finish:number;text:string}){
  const row={id:randomUUID(),...note,created:Date.now()};
  this.db.prepare('INSERT INTO shift_notes VALUES (?,?,?,?,?,?,?)').run(row.id,row.author,row.shift,row.start,row.finish,row.text,row.created);
  return row;
 }
 shiftNotes(from:number,to:number,limit=100){
  return this.db.prepare('SELECT * FROM shift_notes WHERE created BETWEEN ? AND ? ORDER BY created DESC LIMIT ?').all(from,to,limit) as any[];
 }
 /** Tarih arali kli isletme raporu: alarm ve komut ozetleri tek sorgu kumesinde. */
  report(from:number,to:number,tagIds?:string[]){
  const alarms=(this.db.prepare('SELECT body FROM alarms WHERE raised BETWEEN ? AND ?').all(from,to) as any[]).map(r=>JSON.parse(r.body) as AlarmEvent);
  const commands=(this.db.prepare('SELECT body FROM commands WHERE created BETWEEN ? AND ?').all(from,to) as any[]).map(r=>JSON.parse(r.body) as Execution);
  const count=<T,>(rows:T[],key:(r:T)=>string)=>{const m:Record<string,number>={};for(const r of rows){const k=key(r);m[k]=(m[k]||0)+1;}return m;};
  const durations=alarms.map(a=>(a.clearedAt||to)-a.raisedAt);
  const requested=tagIds===undefined?null:tagIds;
  const boolTags=(this.config()?.tags||[]).filter((t:any)=>t.dataType==='bool'&&(!requested||requested.includes(t.id)));
  const intervals:{tagId:string;tagCode:string;tagName:string;startedAt:number;endedAt:number;durationMs:number;ongoing:boolean;uncertain:boolean}[]=[];
  const activityRows=boolTags.map((tag:any)=>{
   const prior=this.db.prepare('SELECT at,value,quality FROM history WHERE tag_id=? AND at<=? ORDER BY at DESC LIMIT 1').get(tag.id,from) as any;
   const rows=this.db.prepare('SELECT at,value,quality FROM history WHERE tag_id=? AND at>? AND at<=? ORDER BY at').all(tag.id,from,to) as any[];
   let state:boolean|undefined=undefined,startedAt:number|undefined,uncertain=false,uncertainGap=false,activations=0;
   const isGood=(q:unknown)=>String(q||'').toLowerCase()==='good';
   const asBool=(v:unknown)=>v===true||v===1||v==='1'?true:v===false||v===0||v==='0'?false:undefined;
   const apply=(row:any)=>{
    if(!isGood(row.quality)){uncertainGap=true;return;}
    const next=asBool(row.value);if(next===undefined){uncertainGap=true;return;}
    if(state===undefined){state=next;if(next){startedAt=from;uncertain=uncertainGap;}uncertainGap=false;return;}
    if(next===state){if(uncertainGap&&state)uncertain=true;uncertainGap=false;return;}
    if(state&&startedAt!==undefined){intervals.push({tagId:tag.id,tagCode:tag.code,tagName:tag.name,startedAt,endedAt:Number(row.at),durationMs:Math.max(0,Number(row.at)-startedAt),ongoing:false,uncertain:uncertain||uncertainGap});}
    if(!state&&next&&Number(row.at)>from)activations++;
    state=next;startedAt=next?Number(row.at):undefined;uncertain=next?uncertainGap:false;uncertainGap=false;
   };
   if(prior)apply(prior); else uncertainGap=true;
   for(const row of rows)apply(row);
   if(state&&startedAt!==undefined)intervals.push({tagId:tag.id,tagCode:tag.code,tagName:tag.name,startedAt,endedAt:to,durationMs:Math.max(0,to-startedAt),ongoing:true,uncertain:uncertain||uncertainGap});
   const own=intervals.filter(a=>a.tagId===tag.id),durations=own.map(a=>a.durationMs);
   return {tagId:tag.id,tagCode:tag.code,tagName:tag.name,activations,totalOnMs:durations.reduce((a,b)=>a+b,0),averageOnMs:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):0,longestOnMs:durations.length?Math.max(...durations):0,uncertain:own.some(a=>a.uncertain),intervals:own.map(({tagId:_tagId,tagCode:_tagCode,tagName:_tagName,startedAt:start,endedAt:end,...rest})=>({start,end,...rest}))};
  });
  return {from,to,
   alarms:{total:alarms.length,bySeverity:count(alarms,a=>a.severity),unacked:alarms.filter(a=>!a.ackAt).length,
    longestMs:durations.length?Math.max(...durations):0,
    top:Object.entries(count(alarms,a=>a.name)).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,n])=>({name,count:n}))},
   commands:{total:commands.length,byStatus:count(commands,c=>c.status),byUser:count(commands,c=>c.user),
    failed:commands.filter(c=>['failed','rejected','unverified','partial','uncertain'].includes(c.status)).length},
   notes:this.shiftNotes(from,to),activities:activityRows};
 }
 /* --- Tek yazici sahipligi / fencing (B12) ---------------------------------
  * Iki sunucu ayni veriyi yazamasin: sahiplik kiralanir (lease), her turda
  * yenilenir. Kira bayatlarsa baska ornek devralir ve EPOCH artar; eski
  * ornek epoch'unun gectigini gorunce yazmayi birakir (fencing).
  */
 claimOwnership(instanceId:string,ttlMs:number){
  return this.transaction(()=>{
   const now=Date.now();
   const current=this.get<{instanceId:string;epoch:number;heartbeatAt:number}>('owner');
   if(current&&current.instanceId!==instanceId&&now-current.heartbeatAt<ttlMs)return {role:'standby' as const,...current};
   const next={instanceId,epoch:(current?.epoch||0)+(current&&current.instanceId===instanceId?0:1),heartbeatAt:now};
   this.set('owner',next);
   return {role:'primary' as const,...next};
  });
 }
 /** Kirayi yeniler; baska ornek devraldiysa false doner ve cagiran yazmayi birakir. */
 renewOwnership(instanceId:string,epoch:number){
  return this.transaction(()=>{
   const current=this.get<{instanceId:string;epoch:number;heartbeatAt:number}>('owner');
   if(!current||current.instanceId!==instanceId||current.epoch!==epoch)return false;
   this.set('owner',{...current,heartbeatAt:Date.now()});
   return true;
  });
 }
 ownership(){return this.get<{instanceId:string;epoch:number;heartbeatAt:number}>('owner')||null;}
 audit(actor:string,action:string,details:unknown){this.db.prepare('INSERT INTO audit VALUES (?,?,?,?,?)').run(randomUUID(),actor,action,JSON.stringify(details),Date.now());}
 events(scope:AuditScope='all'){return (this.db.prepare('SELECT * FROM audit WHERE 1=1'+auditScopeSql[scope]+' ORDER BY created DESC LIMIT 300').all() as any[]).map(r=>({...r,details:JSON.parse(r.details)}));}
 transaction<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 /** Veri dizinindeki bos alan (MB); olculemezse -1. Disk dolmasi sessiz veri kaybi demektir. */
 freeSpaceMb(){try{const st=(fs as any).statfsSync?.(this.directory);return st?Math.round(st.bavail*st.bsize/1048576):-1;}catch{return -1;}}
 close(){this.db.close();}
}
