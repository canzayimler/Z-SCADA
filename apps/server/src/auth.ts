import {randomBytes,randomUUID,scryptSync as scryptSyncLocal,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import type {Store} from './store';
import {preferencesSchema,defaultPreferences,userPermissionsSchema,type User,type UserPermissions} from '../../../packages/contracts/model';
/**
 * Kimlik, oturum, hesap yonetimi ve kullanici tercihleri yuzeyi.
 * Kritik kurallar: son etkin yonetici korunur, hesap degisikligi acik
 * oturumlari dusurur (B30) ve hesap yonetimi taze parola ister (B39).
 */
export type AuthContext={app:any;store:Store;
 read:(r:any)=>User;requireRole:(r:any,roles:string[])=>User;
 userFor:(headers:any)=>User|undefined;requireFresh:(req:any)=>void;
scryptAsync:(p:string,s:string,len:number)=>Promise<Buffer>;
sessionRow:(req:any)=>any;
 parsePermissions:(raw:unknown)=>UserPermissions;hash:(s:string)=>string;
 attempts:Map<string,{count:number;until:number}>;cookieOptions:any;sessionHours:number;reauthWindowMs:number};
const LOOPBACK=['127.0.0.1','::1','::ffff:127.0.0.1'];
export function registerAuth(ctx:AuthContext){
/* Kurulum hesabi (hazirla.ts -> admin-access.json) parolasi degismedigi surece giris ekraninda
 * dolu gelir; yalniz bu bilgisayardan acilan oturuma. Parola degisince kayittaki hash tutmaz ve
 * bilgi bir daha verilmez. Hash'e gore onbellek: her /api/session cagrisi scrypt calistirmasin. */
const accessFile=path.join(ctx.store.directory,'admin-access.json');
let defaultCheck:{hash:string;ok:boolean}|null=null;
async function defaultLogin(req:any):Promise<{username:string;password:string}|null>{
 if(process.env.SCADA_DISABLE_DEFAULT_LOGIN==='1'||!LOOPBACK.includes(req.ip)||!fs.existsSync(accessFile))return null;
 try{
  const access=JSON.parse(fs.readFileSync(accessFile,'utf8'));
  if(typeof access?.username!=='string'||typeof access?.password!=='string')return null;
  const row=ctx.store.db.prepare('SELECT hash,disabled FROM users WHERE username=?').get(access.username) as any;
  if(!row||row.disabled)return null;
  if(defaultCheck?.hash!==row.hash){const [salt,expected]=String(row.hash).split(':');defaultCheck={hash:row.hash,ok:timingSafeEqual(await ctx.scryptAsync(access.password,salt,64),Buffer.from(expected,'hex'))};}
  return defaultCheck?.ok?{username:access.username,password:access.password}:null;
 }catch{return null;}
}
ctx.app.get('/api/session',async (req:any)=>{const user=ctx.userFor(req.headers)||null;return {user,setup:!(ctx.store.db.prepare('SELECT id FROM users LIMIT 1').get()),defaultLogin:user?null:await defaultLogin(req)};});
ctx.app.post('/api/setup',async (req:any,reply:any)=>{
 if(!LOOPBACK.includes(req.ip))throw Error('İlk kurulum yerel bilgisayardan yapılır.');
 if(ctx.store.db.prepare('SELECT id FROM users LIMIT 1').get())throw Error('Kurulum tamamlanmış.');
 const b=z.object({username:z.string().min(3).max(50),password:z.string().min(12).max(200)}).parse(req.body);createUser(b.username,b.password,'admin');return {ok:true};
});
function passwordHash(password:string){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSyncLocal(password,salt,64).toString('hex');}
function createUser(username:string,password:string,role:string){ctx.store.db.prepare('INSERT INTO users (id,username,role,hash,disabled) VALUES (?,?,?,?,0)').run(randomUUID(),username,role,passwordHash(password));}
function activeAdmins(){return (ctx.store.db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND disabled=0").get() as any).n as number;}
function revokeSessions(userId:string){return ctx.store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId).changes;}
ctx.app.post('/api/login',async (req:any,reply:any)=>{
 const b=z.object({username:z.string().max(50),password:z.string().max(200)}).parse(req.body);const ip=req.ip,now=Date.now();
 // Suresi dolan kayitlar silinir: Map sinirsiz buyumesin.
 for(const [k,v] of ctx.attempts)if(v.until<=now)ctx.attempts.delete(k);
 const userKey='user:'+b.username.toLowerCase();
 const blocked=(k:string)=>{const a=ctx.attempts.get(k);return !!a&&a.until>now&&a.count>=10;};
 if(blocked(ip)||blocked(userKey))throw Error('Çok fazla deneme; bir dakika bekleyin.');
 const row=ctx.store.db.prepare('SELECT * FROM users WHERE username=?').get(b.username) as any;
 const [salt,expected]=(row?.hash||'invalid:'+randomBytes(64).toString('hex')).split(':');const actual=await ctx.scryptAsync(b.password,salt,64);
 if(!row||!timingSafeEqual(actual,Buffer.from(expected,'hex'))){for(const k of [ip,userKey]){const p=ctx.attempts.get(k);ctx.attempts.set(k,{count:p&&p.until>now?p.count+1:1,until:now+60000});}throw Error('Kullanıcı adı veya parola yanlış.');}
 if(row.disabled)throw Error('Bu hesap devre dışı bırakıldı.');
 ctx.attempts.delete(ip);ctx.attempts.delete(userKey);const t=randomBytes(32).toString('hex');ctx.store.db.prepare('INSERT INTO sessions (token,user_id,expires,reauth) VALUES (?,?,?,?)').run(ctx.hash(t),row.id,Date.now()+ctx.sessionHours*3600000,Date.now());reply.setCookie('scada',t,{...ctx.cookieOptions,maxAge:ctx.sessionHours*3600});return {user:{id:row.id,username:row.username,role:row.role}};
});
ctx.app.post('/api/logout',async (req:any,reply:any)=>{const raw=ctx.app.parseCookie(req.headers.cookie||'').scada;if(raw)ctx.store.db.prepare('DELETE FROM sessions WHERE token=?').run(ctx.hash(raw));reply.clearCookie('scada',{...ctx.cookieOptions});return {ok:true};});
ctx.app.post('/api/reauth',async (req:any)=>{
 const u=ctx.requireRole(req,['admin','designer','operator','viewer']);
 const b=z.object({password:z.string().max(200)}).parse(req.body);
 const row=ctx.store.db.prepare('SELECT hash FROM users WHERE id=?').get(u.id) as any;
 const [salt,expected]=String(row?.hash||'invalid:'+randomBytes(64).toString('hex')).split(':');
 const actual=await ctx.scryptAsync(b.password,salt,64);
 if(!row||!timingSafeEqual(actual,Buffer.from(expected,'hex'))){ctx.store.audit(u.username,'reauth.failed',{});throw Error('Parola yanlış.');}
 const session=ctx.sessionRow(req);if(session)ctx.store.db.prepare('UPDATE sessions SET reauth=? WHERE token=?').run(Date.now(),session.token);
 ctx.store.audit(u.username,'reauth.ok',{});
 return {ok:true,validMinutes:Math.round(ctx.reauthWindowMs/60000)};
});
ctx.app.get('/api/preferences',async (req:any)=>{
 const u=ctx.read(req);
 try{return preferencesSchema.parse(ctx.store.get('prefs:'+u.id)||{});}catch{return defaultPreferences;}
});
ctx.app.put('/api/preferences',async (req:any)=>{
 const u=ctx.read(req);const prefs=preferencesSchema.parse(req.body);
 // Panel etiketleri gercekten var mi? Silinmis etiket sessizce bos kutu gostermesin.
 const known=new Set(ctx.store.config().tags.map(t=>t.id));
 const dashboard=prefs.dashboard.filter(t=>known.has(t.tagId));
 const panelPages=prefs.panelPages.map(pg=>({...pg,tiles:pg.tiles.filter(t=>known.has(t.tagId))}));
 const saved={...prefs,dashboard,panelPages};
 ctx.store.set('prefs:'+u.id,saved);
 return saved;
});
ctx.app.get('/api/users',async (req:any)=>{ctx.requireRole(req,['admin']);return (ctx.store.db.prepare('SELECT id,username,role,disabled,permissions FROM users ORDER BY username').all() as any[]).map(r=>({...r,disabled:!!r.disabled,permissions:ctx.parsePermissions(r.permissions)}));}); // SQLite 0/1 -> boolean: arayüzde `0 &&` "0" çiziyordu
ctx.app.patch('/api/users/:id',async (req:any)=>{
 const u=ctx.requireRole(req,['admin']);ctx.requireFresh(req);const id=(req.params as any).id;
 const b=z.object({role:z.enum(['admin','designer','operator','viewer']).optional(),disabled:z.boolean().optional(),password:z.string().min(12).max(200).optional(),permissions:userPermissionsSchema.optional()}).parse(req.body);
 const row=ctx.store.db.prepare('SELECT id,username,role,disabled FROM users WHERE id=?').get(id) as any;if(!row)throw Error('Kullanıcı yok.');
 const losesAdmin=(b.disabled===true||(b.role&&b.role!=='admin'))&&row.role==='admin'&&!row.disabled;
 if(losesAdmin&&activeAdmins()<2)throw Error('Son etkin yöneticinin yetkisi kaldırılamaz.');
 ctx.store.transaction(()=>{
  if(b.role)ctx.store.db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role,id);
  if(b.password!==undefined)ctx.store.db.prepare('UPDATE users SET hash=? WHERE id=?').run(passwordHash(b.password),id);
  if(b.disabled!==undefined)ctx.store.db.prepare('UPDATE users SET disabled=? WHERE id=?').run(b.disabled?1:0,id);
  // Izinler rolu daraltir; degisiklik denetime yazilir ve oturum dusurulur.
  if(b.permissions)ctx.store.db.prepare('UPDATE users SET permissions=? WHERE id=?').run(JSON.stringify(b.permissions),id);
  // Rol, parola veya hesap durumu degistiginde mevcut oturumlar da sona erer.
  const revoked=revokeSessions(id);
  ctx.store.audit(u.username,'user.updated',{id,username:row.username,role:b.role??row.role,disabled:b.disabled??!!row.disabled,passwordChanged:b.password!==undefined,permissions:b.permissions||null,revokedSessions:revoked});
 });
 const updated=ctx.store.db.prepare('SELECT id,username,role,disabled,permissions FROM users WHERE id=?').get(id) as any;
 return {ok:true,user:{...updated,permissions:ctx.parsePermissions(updated.permissions)}};
});
ctx.app.post('/api/users/:id/revoke',async (req:any)=>{const u=ctx.requireRole(req,['admin']);ctx.requireFresh(req);const id=(req.params as any).id;
 const row=ctx.store.db.prepare('SELECT username FROM users WHERE id=?').get(id) as any;if(!row)throw Error('Kullanıcı yok.');
 const revoked=revokeSessions(id);ctx.store.audit(u.username,'user.sessions.revoked',{id,username:row.username,revoked});return {revoked};});
ctx.app.post('/api/password',async (req:any,reply:any)=>{
 const u=ctx.requireRole(req,['admin','designer','operator','viewer']);
 const b=z.object({current:z.string().max(200),password:z.string().min(12).max(200)}).parse(req.body);
 const row=ctx.store.db.prepare('SELECT hash FROM users WHERE id=?').get(u.id) as any;
 const [salt,expected]=row.hash.split(':');
 if(!timingSafeEqual(await ctx.scryptAsync(b.current,salt,64),Buffer.from(expected,'hex')))throw Error('Mevcut parola yanlış.');
 ctx.store.transaction(()=>{ctx.store.db.prepare('UPDATE users SET hash=? WHERE id=?').run(passwordHash(b.password),u.id);revokeSessions(u.id);ctx.store.audit(u.username,'user.password.changed',{id:u.id});});
 reply.clearCookie('scada',{...ctx.cookieOptions});return {ok:true,reauth:true};
});
ctx.app.post('/api/users',async (req:any)=>{const u=ctx.requireRole(req,['admin']);ctx.requireFresh(req);const b=z.object({username:z.string().min(3).max(50),password:z.string().min(12).max(200),role:z.enum(['admin','designer','operator','viewer'])}).parse(req.body);createUser(b.username,b.password,b.role);ctx.store.audit(u.username,'user.created',{username:b.username,role:b.role});return {ok:true};});

}
