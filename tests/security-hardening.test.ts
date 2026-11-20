import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ICACLS_WELL_KNOWN_GRANTS} from '../apps/server/src/secrets';

let mod:any=null;
async function serverModule(){
 if(!mod){process.env.SCADA_NO_LISTEN='1';mod=await import('../apps/server/src/index');}
 return mod;
}
const headers={'content-type':'application/json','x-scada-request':'1'};
const PASS='Test-parola-2026!';
async function boot(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-sec-'));
 process.env.SCADA_DATA=dir;
 const app=await (await serverModule()).createServer() as any;
 const setup=await app.inject({method:'POST',url:'/api/setup',headers,payload:{username:'admin',password:PASS},remoteAddress:'127.0.0.1'});
 assert.equal(setup.statusCode,200);
 const login=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'admin',password:PASS}});
 assert.equal(login.statusCode,200);
 return {app,cookie:String(login.headers['set-cookie']).split(';')[0],dir};
}
const staleSessions=(dir:string)=>{
 // Sunucu kendi baglantisini tutar; ayni dosyaya ikinci baglanti yeterli.
 return import('node:sqlite').then(({DatabaseSync})=>{
  const file=fs.readdirSync(dir).find(f=>f.endsWith('.db')||f.endsWith('.sqlite'));
  const db=new DatabaseSync(path.join(dir,file!));db.exec('UPDATE sessions SET reauth=0');db.close();
 });
};

test('icacls grants use language-independent SIDs',()=>{
 assert.deepEqual(ICACLS_WELL_KNOWN_GRANTS,['/grant:r','*S-1-5-32-544:F','/grant:r','*S-1-5-18:F']);
 assert.ok(!ICACLS_WELL_KNOWN_GRANTS.some(g=>/Administrators/i.test(g)));
});

test('safeOriginHost never throws',async()=>{
 const {safeOriginHost}=await serverModule();
 assert.equal(safeOriginHost('http://localhost:3000'),'localhost:3000');
 assert.equal(safeOriginHost('null'),undefined);
 assert.equal(safeOriginHost('::not a url'),undefined);
});

test('Origin: null or malformed is rejected with 403, not 500',async()=>{
 const {app,cookie}=await boot();
 for(const origin of ['null','not a url','http://']){
  const res=await app.inject({method:'POST',url:'/api/logout',headers:{...headers,cookie,origin,host:'localhost:3000'},payload:{}});
  assert.equal(res.statusCode,403,'origin='+origin);
 }
 await app.scadaClose();
});

test('POST /api/users requires a fresh reauth',async()=>{
 const {app,cookie,dir}=await boot();
 const body={username:'yeni-admin',password:PASS,role:'admin'};
 const ok=await app.inject({method:'POST',url:'/api/users',headers:{...headers,cookie},payload:body});
 assert.equal(ok.statusCode,200,'taze oturumla gecer');
 await staleSessions(dir);
 const stale=await app.inject({method:'POST',url:'/api/users',headers:{...headers,cookie},payload:{...body,username:'baska-admin'}});
 assert.equal(stale.statusCode,403);
 assert.match(stale.body,/REAUTH/);
 const re=await app.inject({method:'POST',url:'/api/reauth',headers:{...headers,cookie},payload:{password:PASS}});
 assert.equal(re.statusCode,200);
 const again=await app.inject({method:'POST',url:'/api/users',headers:{...headers,cookie},payload:{...body,username:'baska-admin'}});
 assert.equal(again.statusCode,200);
 await app.scadaClose();
});

test('POST /api/password clears the cookie with the session cookie flags',async()=>{
 const {app,cookie}=await boot();
 const res=await app.inject({method:'POST',url:'/api/password',headers:{...headers,cookie},payload:{current:PASS,password:'Yeni-parola-2027!'}});
 assert.equal(res.statusCode,200);
 const set=String(res.headers['set-cookie']);
 assert.match(set,/scada=;/);
 assert.match(set,/HttpOnly/i);
 assert.match(set,/SameSite=Strict/i);
 assert.match(set,/Path=\//);
 await app.scadaClose();
});

test('login throttle is per IP and per username, and expired entries are swept',async()=>{
 const {app}=await boot();
 // Farkli IP'lerden ayni kullaniciya 10 hata -> kullanici bazli kilit
 for(let i=0;i<10;i++){
  const r=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'admin',password:'yanlis'},remoteAddress:'10.0.0.'+(i+1)});
  assert.equal(r.statusCode,400);
 }
 const locked=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'admin',password:PASS},remoteAddress:'10.0.1.1'});
 assert.equal(locked.statusCode,400,'dogru parola bile kilitliyken reddedilir');
 assert.match(locked.body,/Çok fazla deneme/);
 // Ayni IP'den 10 hata -> IP kilidi (farkli kullanicilarla)
 for(let i=0;i<10;i++)await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'u'+i+'xx',password:'yanlis'},remoteAddress:'10.9.9.9'});
 const ipLocked=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'baska-ad',password:'x'},remoteAddress:'10.9.9.9'});
 assert.match(ipLocked.body,/Çok fazla deneme/);
 await app.scadaClose();
});

test('default login can be disabled with SCADA_DISABLE_DEFAULT_LOGIN=1',async()=>{
 const {app,dir}=await boot();
 fs.writeFileSync(path.join(dir,'admin-access.json'),JSON.stringify({username:'admin',password:PASS}));
 const on=await app.inject({method:'GET',url:'/api/session',headers,remoteAddress:'127.0.0.1'});
 assert.deepEqual(on.json().defaultLogin,{username:'admin',password:PASS});
 process.env.SCADA_DISABLE_DEFAULT_LOGIN='1';
 try{
  const off=await app.inject({method:'GET',url:'/api/session',headers,remoteAddress:'127.0.0.1'});
  assert.equal(off.json().defaultLogin,null);
 }finally{delete process.env.SCADA_DISABLE_DEFAULT_LOGIN;}
 await app.scadaClose();
});
