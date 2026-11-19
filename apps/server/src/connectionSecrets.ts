// Baglanti kimlik bilgileri (OPC UA kullanici/parola vb.). Config'e, SQLite'a,
// proje disa aktarimina, denetim kayitlarina ve loglara GIRMEZ: yalniz veri
// klasorundeki connection-secrets.json dosyasinda, sir dosyasi korumasiyla
// (ensureSecretFile / restrictSecretFile) tutulur. API yalniz yazar; okuma
// tarafi parolayi asla dondurmez. OPC UA surucusu ve gozatici kullanir; kopru
// uretimi DriverContext.secret ile okuyabilir.
import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import type {Store} from './store';
import type {ConnectionSecret} from '../../../packages/drivers/driver';
import {ensureSecretFile,restrictSecretFile} from './secrets';

export const CONNECTION_SECRETS_FILE='connection-secrets.json';
export const connectionSecretsFile=(directory:string)=>path.join(directory,CONNECTION_SECRETS_FILE);
/* Alanlar: username/password (OPC UA, MQTT, HTTP basic, SQL, SNMPv3 kullanici adi), community (SNMP v1/v2c),
 * authKey/privKey (SNMPv3 kimlik dogrulama / sifreleme anahtari), token (HTTP bearer). Hicbiri GET'te donmez. */
export const SECRET_FIELDS=['username','password','community','authKey','privKey','token'] as const;
const entrySchema=z.object({username:z.string().max(200).optional(),password:z.string().max(500).optional(),
 community:z.string().max(200).optional(),authKey:z.string().max(500).optional(),privKey:z.string().max(500).optional(),token:z.string().max(4000).optional()}).strict();
const fileSchema=z.record(z.string(),entrySchema);
const idSchema=z.string().min(1).max(80);

/** Dosyayi okur; yoksa bos. Bozuksa acik hata (icerik mesaja yazilmaz). */
export function readConnectionSecrets(directory:string):Record<string,ConnectionSecret>{
 const file=connectionSecretsFile(directory);
 if(!fs.existsSync(file))return {};
 let raw:unknown;
 try{raw=JSON.parse(fs.readFileSync(file,'utf8')||'{}');}catch{throw Error(CONNECTION_SECRETS_FILE+' okunamadı (bozuk).');}
 const parsed=fileSchema.safeParse(raw);
 if(!parsed.success)throw Error(CONNECTION_SECRETS_FILE+' biçimi geçersiz.');
 return parsed.data;
}
/** Yerinde yazar: var olan dosyanin daraltilmis ACL'i korunur; yoksa olusturulup daraltilir. */
function writeConnectionSecrets(directory:string,all:Record<string,ConnectionSecret>){
 const file=connectionSecretsFile(directory);
 const existed=fs.existsSync(file);
 fs.writeFileSync(file,JSON.stringify(all,null,1),{mode:0o600});
 if(!existed)restrictSecretFile(file);
}
/** Silinen baglantilarin kimlik bilgisini dosyadan atar; atilan kimlikleri doner.
 * Dosya yoksa veya bu kimliklerden hicbiri yoksa dosyaya dokunmaz. */
export function pruneConnectionSecrets(directory:string,connectionIds:string[]):string[]{
 if(!connectionIds.length||!fs.existsSync(connectionSecretsFile(directory)))return [];
 const all=readConnectionSecrets(directory);
 const removed=connectionIds.filter(id=>Object.prototype.hasOwnProperty.call(all,id));
 if(!removed.length)return [];
 for(const id of removed)delete all[id];
 writeConnectionSecrets(directory,all);
 return removed;
}
/** Kopru uretimi icin: dosyayi ilk istekte bir kez okur. Hic cagrilmazsa dosyaya dokunmaz. */
export function connectionSecretReader(directory:string):(connectionId:string)=>ConnectionSecret|undefined{
 let cache:Record<string,ConnectionSecret>|null=null;
 return id=>{
  cache??=readConnectionSecrets(directory);
  const s=Object.prototype.hasOwnProperty.call(cache,id)?cache[id]:undefined;
  return s?{...s}:undefined;
 };
}
/** Disari verilen ozet: parola hicbir zaman yok. */
export function secretSummary(s:ConnectionSecret|undefined){
 return {hasUsername:!!s?.username,hasPassword:!!s?.password,hasCommunity:!!s?.community,hasAuthKey:!!s?.authKey,hasPrivKey:!!s?.privKey,hasToken:!!s?.token,
  ...(s?.username?{username:s.username}:{})};
}

type Ctx={app:any;store:Store;directory:string;requireRole:(r:any,roles:string[])=>{username:string};requireFresh:(r:any)=>void};
export function registerConnectionSecrets(ctx:Ctx){
 const {app,store,directory}=ctx;
 // Acilista dosya olusturulur ve korumasi tazelenir (kopyalanmis/korumasiz yazilmis olabilir).
 ensureSecretFile(connectionSecretsFile(directory),()=>'{}');
 const connectionOf=(req:any)=>{
  const id=idSchema.parse((req.params as any).id);
  if(!store.config().connections.some(c=>c.id===id))throw Object.assign(Error('Bağlantı bulunamadı.'),{statusCode:404});
  return id;
 };
 app.get('/api/connections/:id/secret',async(req:any)=>{
  ctx.requireRole(req,['admin']);
  const id=idSchema.parse((req.params as any).id);
  const all=readConnectionSecrets(directory);
  return secretSummary(Object.prototype.hasOwnProperty.call(all,id)?all[id]:undefined);
 });
 /* Yalniz yazma. Alan verilmezse korunur, bos dize o alani siler; ikisi de bos kalirsa kayit silinir. */
 app.put('/api/connections/:id/secret',async(req:any)=>{
  const u=ctx.requireRole(req,['admin']);ctx.requireFresh(req);
  const id=connectionOf(req);
  const body=entrySchema.parse(req.body??{});
  const all=readConnectionSecrets(directory);
  const next:ConnectionSecret={...(Object.prototype.hasOwnProperty.call(all,id)?all[id]:{})};
  for(const k of SECRET_FIELDS){
   if(body[k]===undefined)continue;
   if(body[k]==='')delete next[k];else next[k]=body[k];
  }
  if(SECRET_FIELDS.some(k=>next[k]))all[id]=next;else delete all[id];
  writeConnectionSecrets(directory,all);
  // Denetim kaydi: yalniz baglanti ve hangi alanin degistigi; deger (kullanici adi dahil) yazilmaz.
  store.audit(u.username,'connection.secret.set',{connectionId:id,...Object.fromEntries(SECRET_FIELDS.map(k=>[k,body[k]===undefined?'unchanged':body[k]===''?'cleared':'set']))});
  return secretSummary(all[id]);
 });
 app.delete('/api/connections/:id/secret',async(req:any)=>{
  const u=ctx.requireRole(req,['admin']);ctx.requireFresh(req);
  const id=idSchema.parse((req.params as any).id);
  const all=readConnectionSecrets(directory);
  const existed=Object.prototype.hasOwnProperty.call(all,id);
  if(existed){delete all[id];writeConnectionSecrets(directory,all);}
  store.audit(u.username,'connection.secret.deleted',{connectionId:id,existed});
  return {ok:true,existed};
 });
}
