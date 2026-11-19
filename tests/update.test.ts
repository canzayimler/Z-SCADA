import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {parseSemver,compareSemver,parseRelease,bodySha256,safeUrl,createUpdateChecker,APP_VERSION} from '../apps/server/src/update';
import {Store} from '../apps/server/src/store';

/* Guncelleme denetimi: surum karsilastirma, asset/digest cozumleme, kapatma, yetki, hata sessizligi,
 * hiz siniri. Ag cagrilari yalniz yerel sahte GitHub API'sine (127.0.0.1, rastgele port) gider. */
const SHA='a'.repeat(64);
const release=(over:any={})=>({tag_name:'v9.0.0',draft:false,prerelease:false,published_at:'2026-11-01T10:00:00Z',
 html_url:'https://github.com/canzayimler/Z-SCADA/releases/tag/v9.0.0',body:'Notlar',
 assets:[{name:'Z-SCADA-Kurulum-9.0.0.exe',browser_download_url:'https://github.com/canzayimler/Z-SCADA/releases/download/v9.0.0/Z-SCADA-Kurulum-9.0.0.exe',size:123456,digest:'sha256:'+SHA}],...over});

test('app version comes from package.json',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.resolve('package.json'),'utf8'));
 assert.equal(APP_VERSION,pkg.version);
 assert.ok(parseSemver(APP_VERSION),'package.json version X.Y.Z');
});
test('semver parse and compare: numeric, v prefix, prereleases rejected',()=>{
 assert.deepEqual(parseSemver('v1.2.3'),[1,2,3]);
 assert.deepEqual(parseSemver('0.6.0'),[0,6,0]);
 for(const bad of ['v1.2','1.2.3-rc1','1.2.3+b','x1.2.3','',null,7])assert.equal(parseSemver(bad as any),null,String(bad));
 assert.ok(compareSemver('0.10.0','0.9.9')!>0,'sayisal karsilastirma');
 assert.ok(compareSemver('v1.0.0','0.99.99')!>0);
 assert.equal(compareSemver('0.6.0','v0.6.0'),0);
 assert.ok(compareSemver('0.5.9','0.6.0')!<0);
 assert.equal(compareSemver('0.6.0','0.7.0-beta'),null);
});
test('release parsing: asset match, digest, body fallback, unverified, drafts/prereleases',()=>{
 const ok=parseRelease(release())!;
 assert.equal(ok.latest,'9.0.0');assert.equal(ok.verified,true);
 assert.deepEqual(ok.asset,{name:'Z-SCADA-Kurulum-9.0.0.exe',url:'https://github.com/canzayimler/Z-SCADA/releases/download/v9.0.0/Z-SCADA-Kurulum-9.0.0.exe',size:123456,sha256:SHA});
 // digest yok -> govdedeki SHA-256 satiri
 const bodyHex='B'.repeat(64);
 const fromBody=parseRelease(release({assets:[{...release().assets[0],digest:undefined}],body:'Kurulum\nSHA-256: '+bodyHex+'\n'}))!;
 assert.equal(fromBody.asset!.sha256,bodyHex.toLowerCase());assert.equal(fromBody.verified,true);
 // ikisi de yok -> dogrulanmamis: asset (indirme baglantisi) var, sha yok
 const none=parseRelease(release({assets:[{...release().assets[0],digest:null}],body:'notlar'}))!;
 assert.equal(none.asset!.sha256,null);assert.equal(none.verified,false);
 // bozuk digest -> govdeye duser, o da yoksa null
 assert.equal(parseRelease(release({assets:[{...release().assets[0],digest:'sha256:xyz'}]}))!.asset!.sha256,null);
 // eslesmeyen asset adi -> asset null
 const other=parseRelease(release({assets:[{name:'kaynak.zip',browser_download_url:'https://x/y.zip',size:1}]}))!;
 assert.equal(other.asset,null);assert.equal(other.verified,false);
 assert.equal(parseRelease(release({draft:true})),null);
 assert.equal(parseRelease(release({prerelease:true})),null);
 assert.equal(parseRelease(release({tag_name:'v9.0.0-rc1'})),null);
 // tehlikeli URL'ler href'e gitmez
 const evil=parseRelease(release({html_url:'javascript:alert(1)',assets:[{...release().assets[0],browser_download_url:'file:///c:/x.exe'}]}))!;
 assert.equal(evil.notesUrl,null);assert.equal(evil.asset,null);
 assert.equal(safeUrl('http://example.com/x'),null,'uzak http kabul edilmez');
 assert.ok(safeUrl('http://127.0.0.1:9/x'),'loopback http (test) kabul');
 assert.equal(bodySha256('SHA256: `'+SHA+'`'),SHA);
});

function fakeFetch(json:any,calls:{url:string;init:any}[],status=200):typeof fetch{
 return (async(url:any,init:any)=>{calls.push({url:String(url),init});
  return new Response(JSON.stringify(json),{status,headers:{'content-type':'application/json'}});}) as any;
}
const tmpStore=()=>new Store(fs.mkdtempSync(path.join(os.tmpdir(),'scada-update-')));

test('checker sends only a plain GET with Accept + User-Agent and reports availability',async()=>{
 const store=tmpStore(),calls:any[]=[];
 const c=createUpdateChecker({store,current:'0.6.0',env:{},fetchImpl:fakeFetch(release(),calls)});
 await c.check();
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.github.com/repos/canzayimler/Z-SCADA/releases/latest');
 assert.deepEqual(Object.keys(calls[0].init.headers).sort(),['Accept','User-Agent']);
 assert.equal(calls[0].init.headers['User-Agent'],'Z-SCADA/0.6.0');
 assert.equal(calls[0].init.headers.Accept,'application/vnd.github+json');
 assert.equal(calls[0].init.method,undefined,'GET');assert.equal(calls[0].init.body,undefined);
 const s=c.status();
 assert.equal(s.available,true);assert.equal(s.verified,true);assert.equal(s.latest,'9.0.0');assert.equal(s.current,'0.6.0');assert.ok(s.checkedAt);
 // ayni veya eski surum -> available false
 const same=createUpdateChecker({store,current:'9.0.0',env:{},fetchImpl:fakeFetch(release(),[])});await same.check();
 assert.equal(same.status().available,false);
 const newer=createUpdateChecker({store,current:'10.0.0',env:{},fetchImpl:fakeFetch(release(),[])});await newer.check();
 assert.equal(newer.status().available,false);
 store.close();
});
test('repo slug and api base come from env',async()=>{
 const store=tmpStore(),calls:any[]=[];
 const c=createUpdateChecker({store,current:'0.6.0',env:{ZSCADA_UPDATE_REPO:'ornek/depo',ZSCADA_UPDATE_API:'http://127.0.0.1:9/'},fetchImpl:fakeFetch(release(),calls)});
 await c.check();assert.equal(calls[0].url,'http://127.0.0.1:9/repos/ornek/depo/releases/latest');
 const bad=createUpdateChecker({store,current:'0.6.0',env:{ZSCADA_UPDATE_REPO:'../../x',ZSCADA_UPDATE_API:'javascript:1'},fetchImpl:fakeFetch(release(),calls)});
 await bad.check();assert.equal(calls[1].url,'https://api.github.com/repos/canzayimler/Z-SCADA/releases/latest');
 store.close();
});
test('opt-out: setting off or env ZSCADA_UPDATE_CHECK=0 makes no network call and hides the update',async()=>{
 const store=tmpStore(),calls:any[]=[];
 const env=createUpdateChecker({store,current:'0.6.0',env:{ZSCADA_UPDATE_CHECK:'0'},fetchImpl:fakeFetch(release(),calls)});
 await env.check();assert.equal(calls.length,0);
 assert.equal(env.status().enabled,false);assert.equal(env.status().envDisabled,true);assert.equal(env.status().available,false);
 const c=createUpdateChecker({store,current:'0.6.0',env:{},fetchImpl:fakeFetch(release(),calls)});
 await c.check();assert.equal(c.status().available,true);
 store.set('updateCheck',{enabled:false});
 assert.equal(c.status().available,false,'kapatilinca eski sonuc da gizlenir');assert.equal(c.status().latest,null);
 await c.check();assert.equal(calls.length,1,'kapaliyken ag cagrisi yok');
 store.close();
});
test('failures are silent: no availability, error recorded, logged once per distinct error',async()=>{
 const store=tmpStore(),logs:any[]=[];
 const failing:typeof fetch=(async()=>{throw new TypeError('fetch failed');}) as any;
 const c=createUpdateChecker({store,current:'0.6.0',env:{},fetchImpl:failing,log:{info:(o:any,m?:string)=>logs.push([o,m])}});
 await c.check();await c.check();await c.check();
 assert.equal(c.status().available,false);assert.equal(c.status().error,'fetch failed');assert.equal(logs.length,1);
 const http500=createUpdateChecker({store,current:'0.6.0',env:{},fetchImpl:fakeFetch({},[],500)});
 await http500.check();assert.equal(http500.status().error,'HTTP 500');assert.equal(http500.status().available,false);
 const garbage=createUpdateChecker({store,current:'0.6.0',env:{},fetchImpl:fakeFetch({tag_name:'banana'},[])});
 await garbage.check();assert.equal(garbage.status().available,false);assert.ok(garbage.status().error);
 store.close();
});

// --- HTTP uclari: gercek sunucu (inject) + yerel sahte GitHub API
let createServer:(()=>Promise<any>)|null=null;
const headers={'content-type':'application/json','x-scada-request':'1'};
async function fakeApi(body:()=>{status:number;json:any}){
 const hits:string[]=[];
 const srv=http.createServer((req,res)=>{hits.push(String(req.url)+' '+req.headers['user-agent']);const b=body();res.writeHead(b.status,{'content-type':'application/json'});res.end(JSON.stringify(b.json));});
 await new Promise<void>(r=>srv.listen(0,'127.0.0.1',()=>r()));
 return {base:'http://127.0.0.1:'+(srv.address() as any).port,hits,close:()=>new Promise(r=>srv.close(r))};
}
async function boot(apiBase:string){
 if(!createServer){process.env.SCADA_NO_LISTEN='1';createServer=(await import('../apps/server/src/index')).createServer as any;}
 process.env.SCADA_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'scada-update-http-'));
 process.env.ZSCADA_UPDATE_API=apiBase;
 try{
  const app=await createServer!() as any;
  await app.inject({method:'POST',url:'/api/setup',headers,payload:{username:'admin',password:'Test-parola-2026!'},remoteAddress:'127.0.0.1'});
  const login=async(username:string)=>String((await app.inject({method:'POST',url:'/api/login',headers,payload:{username,password:'Test-parola-2026!'}})).headers['set-cookie']).split(';')[0];
  const admin=await login('admin');
  await app.inject({method:'POST',url:'/api/users',headers:{...headers,cookie:admin},payload:{username:'operator',password:'Test-parola-2026!',role:'operator'}});
  return {app,admin,operator:await login('operator')};
 }finally{delete process.env.ZSCADA_UPDATE_API;}
}
test('endpoints: admin only, anonymous 401, public summary has no url/sha, rate limit, setting toggle',async()=>{
 let up=true;
 const api=await fakeApi(()=>up?{status:200,json:release({tag_name:'v7.0.0'})}:{status:503,json:{}});
 const {app,admin,operator}=await boot(api.base);
 try{
  assert.equal((await app.inject({method:'GET',url:'/api/update'})).statusCode,401);
  assert.equal((await app.inject({method:'GET',url:'/api/update',headers:{cookie:operator}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/update/check',headers:{...headers,cookie:operator},payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url:'/api/update/settings',headers:{...headers,cookie:operator},payload:{enabled:false}})).statusCode,403);
  const before=(await app.inject({method:'GET',url:'/api/update',headers:{cookie:admin}})).json();
  assert.equal(before.available,false);assert.equal(before.checkedAt,null);assert.equal(api.hits.length,0,'testte kendiliginden denetim yok');
  const checked=await app.inject({method:'POST',url:'/api/update/check',headers:{...headers,cookie:admin},payload:{}});
  assert.equal(checked.statusCode,200);
  const s=checked.json();
  assert.equal(s.available,true);assert.equal(s.latest,'7.0.0');assert.equal(s.verified,true);assert.equal(s.asset.sha256,SHA);
  assert.match(api.hits[0],/^\/repos\/canzayimler\/Z-SCADA\/releases\/latest Z-SCADA\/\d+\.\d+\.\d+$/);
  const pub=(await app.inject({method:'GET',url:'/api/update/public'})).json();
  assert.deepEqual(pub,{available:true,latest:'7.0.0'},'kimliksiz uc yalniz available/latest');
  const again=await app.inject({method:'POST',url:'/api/update/check',headers:{...headers,cookie:admin},payload:{}});
  assert.equal(again.statusCode,429,'dakikada bir elle denetim');
  assert.equal(api.hits.length,1);
  const health=(await app.inject({method:'GET',url:'/api/health'})).json();
  assert.equal(health.version,APP_VERSION);
  // kapat -> gizlenir, kimliksiz uc da false
  const off=await app.inject({method:'PUT',url:'/api/update/settings',headers:{...headers,cookie:admin},payload:{enabled:false}});
  assert.equal(off.statusCode,200);assert.equal(off.json().enabled,false);assert.equal(off.json().available,false);
  assert.deepEqual((await app.inject({method:'GET',url:'/api/update/public'})).json(),{available:false,latest:null});
  assert.equal((await app.inject({method:'POST',url:'/api/update/check',headers:{...headers,cookie:admin},payload:{}})).statusCode,409);
  const audit=app.scadaStore.db.prepare("SELECT action FROM audit WHERE action='update.settings'").all();
  assert.equal(audit.length,1);
  await app.inject({method:'PUT',url:'/api/update/settings',headers:{...headers,cookie:admin},payload:{enabled:true}});
 }finally{await app.scadaClose();await api.close();}
});
test('fake API down: check fails quietly, no update offered, server keeps serving',async()=>{
 const api=await fakeApi(()=>({status:200,json:{}}));await api.close();// port kapali
 const {app,admin}=await boot(api.base);
 try{
  const r=await app.inject({method:'POST',url:'/api/update/check',headers:{...headers,cookie:admin},payload:{}});
  assert.equal(r.statusCode,200);
  assert.equal(r.json().available,false);assert.ok(r.json().error);
  assert.equal((await app.inject({method:'GET',url:'/api/health'})).statusCode,200);
  assert.deepEqual((await app.inject({method:'GET',url:'/api/update/public'})).json(),{available:false,latest:null});
 }finally{await app.scadaClose();}
});
