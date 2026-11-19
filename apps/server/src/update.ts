import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Store} from './store';
import {APP_VERSION} from './version';
export {APP_VERSION};
/* Guncelleme denetimi (0.6.0). Sunucu gunde bir kez (ve acilistan ~1 dk sonra) GitHub'daki son
 * yayini sorar; yeni surum varsa YALNIZ yoneticilere bildirim cikar. Kurulum asla kendiliginden
 * yapilmaz: tek tik kurulum tepsi simgesindedir (installer/launcher/ZScada.cs, ayni kurallar).
 * Gonderilen tek sey herkese acik GET istegi + `User-Agent: Z-SCADA/<surum>`; kurulumu tanitan
 * hicbir bilgi (makine, kullanici, proje, IP disinda bir sey) gitmez. Hata sessizdir: bildirim yok,
 * log'a durum degistiginde tek satir. */

export const DEFAULT_REPO='canzayimler/Z-SCADA',DEFAULT_API='https://api.github.com';
export const ASSET_PATTERN=/^Z-SCADA-Kurulum-.*\.exe$/;
export const CHECK_INTERVAL_MS=24*3600000,FIRST_CHECK_MS=60000,FETCH_TIMEOUT_MS=10000,MANUAL_CHECK_MIN_MS=60000;

/** `vX.Y.Z` / `X.Y.Z`; on surum (-rc1), yapi eki veya baska bicim null doner (yalniz kararli surum onerilir). */
export function parseSemver(tag:unknown):[number,number,number]|null{
 if(typeof tag!=='string')return null;
 const m=/^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(tag.trim());
 return m?[Number(m[1]),Number(m[2]),Number(m[3])]:null;
}
/** a<b: negatif, esit: 0, a>b: pozitif. Sayisal karsilastirir (0.10.0 > 0.9.0). Gecersiz surum null. */
export function compareSemver(a:string,b:string):number|null{
 const x=parseSemver(a),y=parseSemver(b);if(!x||!y)return null;
 for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];
 return 0;
}
/** Yalniz https (testte sahte API icin loopback http). Baska sema (javascript:, file:) href'e gitmez. */
export function safeUrl(raw:unknown):string|null{
 if(typeof raw!=='string'||raw.length>2048)return null;
 try{const u=new URL(raw);
  if(u.protocol==='https:')return u.toString();
  if(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))return u.toString();
 }catch{}
 return null;
}
export type UpdateAsset={name:string;url:string;size:number;sha256:string|null};
export type ParsedRelease={latest:string;publishedAt:string|null;notesUrl:string|null;asset:UpdateAsset|null;verified:boolean};
const HEX64=/^[0-9a-f]{64}$/;
/** Yayin govdesinde `SHA-256: <hex>` satiri (asset digest'i yoksa yedek kaynak). */
export function bodySha256(body:unknown):string|null{
 if(typeof body!=='string')return null;
 const m=/SHA-?256\s*:\s*`?([0-9a-fA-F]{64})\b/.exec(body);
 return m?m[1].toLowerCase():null;
}
/** GitHub `releases/latest` cevabini cozer. Taslak/on surum veya bicimsiz etiket: null (oneri yok).
 * SHA-256 once asset `digest` alanindan (`sha256:<hex>`), yoksa govdedeki `SHA-256:` satirindan;
 * ikisi de yoksa `verified:false` (tek tik kurulum sunulmaz, yalniz indirme baglantisi). */
export function parseRelease(json:any):ParsedRelease|null{
 if(!json||typeof json!=='object'||json.draft||json.prerelease)return null;
 const v=parseSemver(json.tag_name);if(!v)return null;
 const latest=v.join('.');
 const assets=Array.isArray(json.assets)?json.assets:[];
 const raw=assets.find((a:any)=>typeof a?.name==='string'&&ASSET_PATTERN.test(a.name));
 let asset:UpdateAsset|null=null;
 if(raw){
  const url=safeUrl(raw.browser_download_url);
  if(url){
   const d=typeof raw.digest==='string'?/^sha256:([0-9a-fA-F]{64})$/.exec(raw.digest.trim()):null;
   const sha=d?d[1].toLowerCase():bodySha256(json.body);
   asset={name:raw.name,url,size:Number.isFinite(raw.size)&&raw.size>0?Math.round(raw.size):0,sha256:sha&&HEX64.test(sha)?sha:null};
  }
 }
 return {latest,publishedAt:typeof json.published_at==='string'?json.published_at:null,notesUrl:safeUrl(json.html_url),asset,verified:!!asset?.sha256};
}
export type UpdateStatus={current:string;latest:string|null;available:boolean;verified:boolean;publishedAt:string|null;notesUrl:string|null;
 asset:UpdateAsset|null;checkedAt:number|null;error?:string;enabled:boolean;envDisabled:boolean};
type Opts={store:Store;log?:{info:(o:any,m?:string)=>void};fetchImpl?:typeof fetch;current?:string;env?:NodeJS.ProcessEnv;now?:()=>number};
/** Denetleyici: zamanlayici + son sonuc. Ag cagrisi yalniz `check()` icinde. */
export function createUpdateChecker(o:Opts){
 const env=o.env||process.env,now=o.now||Date.now,current=o.current||APP_VERSION,doFetch=o.fetchImpl||fetch;
 const repo=/^[\w.-]+\/[\w.-]+$/.test(env.ZSCADA_UPDATE_REPO||'')?env.ZSCADA_UPDATE_REPO!:DEFAULT_REPO;
 const apiBase=(safeUrl(env.ZSCADA_UPDATE_API)||DEFAULT_API).replace(/\/+$/,'');
 const envDisabled=env.ZSCADA_UPDATE_CHECK==='0'||/^(false|off|no)$/i.test(env.ZSCADA_UPDATE_CHECK||'');
 let release:ParsedRelease|null=null,checkedAt:number|null=null,error:string|undefined,lastLogged='',running:Promise<void>|null=null;
 let firstTimer:ReturnType<typeof setTimeout>|null=null,interval:ReturnType<typeof setInterval>|null=null;
 const settingOn=()=>o.store.get<{enabled:boolean}>('updateCheck')?.enabled!==false;
 const enabled=()=>!envDisabled&&settingOn();
 const note=(key:string,msg:string,extra:any={})=>{if(key===lastLogged)return;lastLogged=key;try{o.log?.info({...extra,update:true},msg);}catch{}};
 async function run(){
  try{
   const r=await doFetch(`${apiBase}/repos/${repo}/releases/latest`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Z-SCADA/'+current},
    signal:AbortSignal.timeout(FETCH_TIMEOUT_MS),redirect:'follow'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const parsed=parseRelease(await r.json());
   if(!parsed)throw Error('Yayın bilgisi çözülemedi');
   release=parsed;error=undefined;checkedAt=now();
   note('ok:'+parsed.latest,'update check ok',{latest:parsed.latest,verified:parsed.verified});
  }catch(e){
   error=(e as Error)?.name==='TimeoutError'?'Zaman aşımı':String((e as Error)?.message||e).slice(0,200);checkedAt=now();
   note('err:'+error,'update check failed',{error});
  }
 }
 /** Ayni anda tek denetim; kapaliysa hic ag cagrisi yapmaz. */
 function check():Promise<void>{
  if(!enabled())return Promise.resolve();
  return running||=run().finally(()=>{running=null;});
 }
 function status():UpdateStatus{
  const on=enabled(),cmp=release?compareSemver(release.latest,current):null;
  const available=on&&!!release&&cmp!==null&&cmp>0;
  return {current,latest:on?release?.latest??null:null,available,verified:available&&!!release?.verified,publishedAt:on?release?.publishedAt??null:null,
   notesUrl:on?release?.notesUrl??null:null,asset:on?release?.asset??null:null,checkedAt,...(on&&error?{error}:{}),enabled:on,envDisabled};
 }
 function start(){
  if(firstTimer||interval)return;
  firstTimer=setTimeout(()=>{firstTimer=null;void check();},FIRST_CHECK_MS);firstTimer.unref?.();
  interval=setInterval(()=>void check(),CHECK_INTERVAL_MS);interval.unref?.();
 }
 function stop(){if(firstTimer)clearTimeout(firstTimer);if(interval)clearInterval(interval);firstTimer=null;interval=null;}
 return {check,status,start,stop,enabled,envDisabled,settingOn,apiBase,repo};
}
export type UpdateChecker=ReturnType<typeof createUpdateChecker>;
type Reg={app:FastifyInstance;store:Store;requireRole:(req:any,roles:string[])=>{username:string};checker:UpdateChecker;now?:()=>number};
/** Uclar: GET /api/update (yonetici), POST /api/update/check (yonetici, dakikada bir), PUT /api/update/settings
 * (yonetici) ve kimliksiz GET /api/update/public — tepsi icin YALNIZ {available,latest}; URL/SHA vermez. */
export function registerUpdate({app,store,requireRole,checker,now=Date.now}:Reg){
 let lastManual=0;
 app.get('/api/update',async req=>{requireRole(req,['admin']);return checker.status();});
 app.get('/api/update/public',async()=>{const s=checker.status();return {available:s.available,latest:s.available?s.latest:null};});
 app.post('/api/update/check',async req=>{
  requireRole(req,['admin']);
  if(!checker.enabled())throw Object.assign(Error('Güncelleme denetimi kapalı.'),{statusCode:409});
  const t=now();if(t-lastManual<MANUAL_CHECK_MIN_MS)throw Object.assign(Error('Çok sık denetim; bir dakika sonra yeniden deneyin.'),{statusCode:429});
  lastManual=t;await checker.check();return checker.status();
 });
 app.put('/api/update/settings',async req=>{
  const u=requireRole(req,['admin']);const b=z.object({enabled:z.boolean()}).parse(req.body);
  const before=checker.settingOn();
  store.transaction(()=>{store.set('updateCheck',{enabled:b.enabled});store.audit(u.username,'update.settings',{before:{enabled:before},after:{enabled:b.enabled}});});
  return checker.status();
 });
}
