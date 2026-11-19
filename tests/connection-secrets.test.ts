import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {seedConfig} from '../packages/contracts/seed';
import {modbusDriver} from '../packages/drivers/driver';
import {buildGateway} from '../apps/server/src/gateway';
import {connectionSecretReader,readConnectionSecrets,pruneConnectionSecrets,CONNECTION_SECRETS_FILE} from '../apps/server/src/connectionSecrets';
/* Baglanti sirlari (Faz 0 / B): yalniz veri klasorundeki connection-secrets.json;
 * config, SQLite, disa aktarim, denetim ve log disinda. API yalniz yonetici + yeniden
 * dogrulama ile yazar; okuma parolayi asla dondurmez. */
let createServer:(()=>Promise<any>)|null=null;
async function serverModule(){
 if(!createServer){process.env.SCADA_NO_LISTEN='1';createServer=(await import('../apps/server/src/index')).createServer as any;}
 return createServer!;
}
const headers={'content-type':'application/json','x-scada-request':'1'};
const PASSWORD='Gizli-Parola-Opc-7781',USERNAME='opc-kullanici-xq';
async function boot(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-connsecret-'));
 process.env.SCADA_DATA=dir;
 const app=await (await serverModule())() as any;
 await app.inject({method:'POST',url:'/api/setup',headers,payload:{username:'admin',password:'Test-parola-2026!'},remoteAddress:'127.0.0.1'});
 const login=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'admin',password:'Test-parola-2026!'}});
 assert.equal(login.statusCode,200);
 return {app,cookie:String(login.headers['set-cookie']).split(';')[0],dir};
}
const url='/api/connections/'+seedConfig.connections[0].id+'/secret';

test('baglanti sirri: yonetici olmayan 403; GET parolayi asla dondurmez',async()=>{
 const {app,cookie}=await boot();
 try{
  await app.inject({method:'POST',url:'/api/users',headers:{...headers,cookie},payload:{username:'tasarimci',password:'Test-parola-2026!',role:'designer'}});
  const dl=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'tasarimci',password:'Test-parola-2026!'}});
  const designer=String(dl.headers['set-cookie']).split(';')[0];
  for(const method of ['GET','PUT','DELETE']){
   const r=await app.inject({method,url,headers:{'x-scada-request':'1',...(method==='PUT'?{'content-type':'application/json'}:{}),cookie:designer},...(method==='PUT'?{payload:{password:'x'}}:{})});
   assert.equal(r.statusCode,403,method+' tasarimciya kapali');
  }
  const anon=await app.inject({method:'GET',url,headers});
  assert.equal(anon.statusCode,401);
  const empty=await app.inject({method:'GET',url,headers:{...headers,cookie}});
  assert.deepEqual(empty.json(),{hasUsername:false,hasPassword:false,hasCommunity:false,hasAuthKey:false,hasPrivKey:false,hasToken:false});
  const put=await app.inject({method:'PUT',url,headers:{...headers,cookie},payload:{username:USERNAME,password:PASSWORD}});
  assert.equal(put.statusCode,200);
  assert.ok(!put.body.includes(PASSWORD),'PUT yaniti parolayi dondurmez');
  const got=await app.inject({method:'GET',url,headers:{...headers,cookie}});
  assert.deepEqual(got.json(),{hasUsername:true,hasPassword:true,hasCommunity:false,hasAuthKey:false,hasPrivKey:false,hasToken:false,username:USERNAME});
  assert.ok(!got.body.includes(PASSWORD));
  // Yalniz kullanici adi degisir, parola korunur; bos dize alani siler.
  await app.inject({method:'PUT',url,headers:{...headers,cookie},payload:{username:'baska'}});
  assert.equal(connectionSecretReader(process.env.SCADA_DATA!)(seedConfig.connections[0].id)?.password,PASSWORD);
  const cleared=await app.inject({method:'PUT',url,headers:{...headers,cookie},payload:{username:''}});
  assert.deepEqual(cleared.json(),{hasUsername:false,hasPassword:true,hasCommunity:false,hasAuthKey:false,hasPrivKey:false,hasToken:false});
  // Bilinmeyen baglanti ve bilinmeyen alan reddedilir.
  assert.equal((await app.inject({method:'PUT',url:'/api/connections/yok/secret',headers:{...headers,cookie},payload:{password:'x'}})).statusCode,404);
  assert.equal((await app.inject({method:'PUT',url,headers:{...headers,cookie},payload:{password:'x',apiKey:'y'}})).statusCode,400);
  const del=await app.inject({method:'DELETE',url,headers:{'x-scada-request':'1',cookie}});
  assert.equal(del.statusCode,200);
  assert.deepEqual((await app.inject({method:'GET',url,headers:{...headers,cookie}})).json(),{hasUsername:false,hasPassword:false,hasCommunity:false,hasAuthKey:false,hasPrivKey:false,hasToken:false});
 }finally{await app.scadaClose();}
});

test('baglanti sirri: yazma ve silme yeniden dogrulama ister (oturum bayatsa 403 REAUTH_REQUIRED)',async()=>{
 const {app,cookie,dir}=await boot();
 try{
  const db=new DatabaseSync(path.join(dir,'scada.sqlite'));
  db.exec('UPDATE sessions SET reauth=0');db.close();
  const put=await app.inject({method:'PUT',url,headers:{...headers,cookie},payload:{password:PASSWORD}});
  assert.equal(put.statusCode,403);
  assert.match(put.body,/parolanızı yeniden girin|REAUTH/);
  const del=await app.inject({method:'DELETE',url,headers:{'x-scada-request':'1',cookie}});
  assert.equal(del.statusCode,403);
  assert.deepEqual(readConnectionSecrets(dir),{},'reddedilen istek dosyaya yazmaz');
  // Okuma (ozet) yeniden dogrulama istemez ama yine yalniz yoneticiye acik.
  assert.equal((await app.inject({method:'GET',url,headers:{...headers,cookie}})).statusCode,200);
 }finally{await app.scadaClose();}
});

test('baglanti sirri: yalniz connection-secrets.json icinde; config, disa aktarim, proje, denetim ve SQLite icinde yok',async()=>{
 const {app,cookie,dir}=await boot();
 try{
  const put=await app.inject({method:'PUT',url,headers:{...headers,cookie},payload:{username:USERNAME,password:PASSWORD}});
  assert.equal(put.statusCode,200);
  const file=path.join(dir,CONNECTION_SECRETS_FILE);
  assert.ok(fs.existsSync(file));
  assert.equal(readConnectionSecrets(dir)[seedConfig.connections[0].id].password,PASSWORD);
  const project=await app.inject({method:'GET',url:'/api/project',headers:{...headers,cookie}});
  const exported=await app.inject({method:'GET',url:'/api/export',headers:{...headers,cookie}});
  const saved=await app.inject({method:'POST',url:'/api/projects/save',headers:{...headers,cookie},payload:{}});
  const audit=await app.inject({method:'GET',url:'/api/audit',headers:{...headers,cookie}});
  for(const [name,r] of [['project',project],['export',exported],['audit',audit]] as const){
   assert.equal(r.statusCode,200,name);
   assert.ok(!r.body.includes(PASSWORD),name+' parola icermemeli');
   assert.ok(!r.body.includes(USERNAME),name+' kullanici adi icermemeli');
  }
  assert.ok(audit.body.includes('connection.secret.set'),'degisiklik denetime (degersiz) yazilir');
  assert.equal(saved.statusCode,200,'proje anlik goruntusu kaydedilir (taramaya dahil)');
  // Veri klasorundeki sir dosyasi DISINDAKI hicbir dosya (SQLite + WAL, proje anlik goruntuleri, loglar) parolayi icermez.
  const walk=(d:string):string[]=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
  for(const f of walk(dir)){
   if(path.basename(f)===CONNECTION_SECRETS_FILE)continue;
   const bytes=fs.readFileSync(f);
   assert.ok(!bytes.includes(PASSWORD),path.relative(dir,f)+' parola icermemeli');
   assert.ok(!bytes.includes(Buffer.from(PASSWORD,'utf16le')),path.relative(dir,f)+' parola icermemeli (utf16)');
  }
 }finally{await app.scadaClose();}
});

test('baglanti silinince kimlik bilgisi connection-secrets.json dan atilir; diger baglantilar ve baglantisiz kayit degismez',async()=>{
 const {app,cookie,dir}=await boot();
 try{
  const project=await app.inject({method:'GET',url:'/api/project',headers:{...headers,cookie}});
  const config=project.json().config;
  const kept=seedConfig.connections[0].id;
  config.connections.push({...structuredClone(config.connections.find((c:any)=>c.id===kept)),id:'silinecek',name:'Silinecek OPC',protocol:'opc-ua',endpoint:'opc.tcp://127.0.0.1:4840'});
  const add=await app.inject({method:'PUT',url:'/api/config',headers:{...headers,cookie},payload:config});
  assert.equal(add.statusCode,200,add.body);
  for(const id of [kept,'silinecek']){
   const put=await app.inject({method:'PUT',url:'/api/connections/'+id+'/secret',headers:{...headers,cookie},payload:{username:USERNAME,password:PASSWORD+id}});
   assert.equal(put.statusCode,200);
  }
  assert.deepEqual(Object.keys(readConnectionSecrets(dir)).sort(),[kept,'silinecek'].sort());
  // Ilgisiz kayit (ornegin elle eklenmis) yalniz baglanti silindiginde dokunulmaz kalir.
  const rename=add.json();rename.name='Ad degisti';
  assert.equal((await app.inject({method:'PUT',url:'/api/config',headers:{...headers,cookie},payload:rename})).statusCode,200);
  assert.deepEqual(Object.keys(readConnectionSecrets(dir)).sort(),[kept,'silinecek'].sort(),'baglanti silinmeden kayit atilmaz');
  const latest=(await app.inject({method:'GET',url:'/api/project',headers:{...headers,cookie}})).json().config;
  latest.connections=latest.connections.filter((c:any)=>c.id!=='silinecek');
  const del=await app.inject({method:'PUT',url:'/api/config',headers:{...headers,cookie},payload:latest});
  assert.equal(del.statusCode,200,del.body);
  const after=readConnectionSecrets(dir);
  assert.deepEqual(Object.keys(after),[kept]);
  assert.equal(after[kept].password,PASSWORD+kept,'kalan baglantinin sirri korunur');
  assert.ok(!fs.readFileSync(path.join(dir,CONNECTION_SECRETS_FILE),'utf8').includes(PASSWORD+'silinecek'));
  const audit=await app.inject({method:'GET',url:'/api/audit',headers:{...headers,cookie}});
  assert.ok(audit.body.includes('connection.secret.pruned'));
  assert.ok(!audit.body.includes(PASSWORD),'denetim degeri icermez');
 }finally{await app.scadaClose();}
});
test('pruneConnectionSecrets: yalniz verilen ve var olan kimlikleri atar; dosya yoksa olusturmaz',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-connsecret-'));
 assert.deepEqual(pruneConnectionSecrets(dir,['a']),[]);
 assert.equal(fs.existsSync(path.join(dir,CONNECTION_SECRETS_FILE)),false);
 fs.writeFileSync(path.join(dir,CONNECTION_SECRETS_FILE),JSON.stringify({a:{password:'p'},b:{username:'u'}}));
 const before=fs.statSync(path.join(dir,CONNECTION_SECRETS_FILE)).mtimeMs;
 assert.deepEqual(pruneConnectionSecrets(dir,['yok']),[]);
 assert.equal(fs.statSync(path.join(dir,CONNECTION_SECRETS_FILE)).mtimeMs,before,'atilacak yoksa yazilmaz');
 assert.deepEqual(pruneConnectionSecrets(dir,['a','yok']),['a']);
 assert.deepEqual(readConnectionSecrets(dir),{b:{username:'u'}});
});
test('DriverContext.secret: buildGateway secenegiyle suruculere ulasir; 4 argumanli cagri sirsiz calisir',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-connsecret-'));
 fs.writeFileSync(path.join(dir,CONNECTION_SECRETS_FILE),JSON.stringify({'conn-01':{username:'u',password:'Zq9-sizmamali'}}));
 const original=modbusDriver.buildNodes;const seen:any[]=[];
 modbusDriver.buildNodes=(cs,ds,ts,ctx)=>{seen.push(ctx);return original(cs,ds,ts,ctx);};
 try{
  const withSecret=buildGateway(structuredClone(seedConfig),'tok',1880,'.',{secret:connectionSecretReader(dir)});
  assert.deepEqual(seen[0].secret('conn-01'),{username:'u',password:'Zq9-sizmamali'});
  assert.equal(seen[0].secret('yok'),undefined);
  assert.ok(!JSON.stringify(withSecret).includes('Zq9-sizmamali'),'sir uretilen akisa sizmaz (surucu kullanmadikca)');
  buildGateway(structuredClone(seedConfig),'tok',1880,'.');
  assert.equal(seen[1].secret('conn-01'),undefined,'secenek yoksa sir yok');
 }finally{modbusDriver.buildNodes=original;}
 // Okuyucu dosyaya ancak ilk cagrida dokunur: bozuk dosya cagrilmadikca yayini bozmaz.
 fs.writeFileSync(path.join(dir,CONNECTION_SECRETS_FILE),'{bozuk');
 const reader=connectionSecretReader(dir);
 assert.throws(()=>reader('conn-01'),/okunamadı/);
});
