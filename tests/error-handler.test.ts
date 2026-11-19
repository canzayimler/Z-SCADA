import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {z} from 'zod';
// UYARI: index.ts'in modul govdesi, SCADA_NO_LISTEN!=='1' ise gercek main()'i calistirir
// (canli sunucu ile ayni ağaç/port/varsayilan .local veri dizini). Statik import hoist
// edilecegi icin hic kullanilmiyor — env once, sonra tembel/dinamik import (bkz. load()).
let mod:any;
async function load(){if(!mod){process.env.SCADA_NO_LISTEN='1';mod=await import('../apps/server/src/index');}return mod;}
test('a plain thrown Error keeps the existing 400 contract (business validation)',async()=>{
 const {classifyRouteError}=await load();
 const r=classifyRouteError(Error('x'));
 assert.equal(r.status,400);
 assert.equal(r.body.error,'x');
 assert.equal(r.serverFault,false);
});
test('an explicit statusCode<500 business error is untouched',async()=>{
 const {classifyRouteError}=await load();
 const r=classifyRouteError(Object.assign(Error('Oturum açın.'),{statusCode:401}));
 assert.equal(r.status,401);assert.equal(r.body.error,'Oturum açın.');assert.equal(r.serverFault,false);
});
test('a ZodError still renders field-path messages with 400',async()=>{
 const {classifyRouteError}=await load();
 const schema=z.object({a:z.string()});
 let zerr:any;try{schema.parse({a:1});}catch(e){zerr=e;}
 const r=classifyRouteError(zerr);
 assert.equal(r.status,400);
 assert.match(r.body.error,/^a: /);
});
test('a TypeError is logged and returns a generic 500 without leaking the internal message',async()=>{
 const {classifyRouteError}=await load();
 const r=classifyRouteError(new TypeError('Cannot read properties of undefined'));
 assert.equal(r.status,500);
 assert.equal(r.serverFault,true);
 assert.equal(r.body.error,'Sunucu hatası — ayrıntı sunucu kaydında (logs/server.log).');
 assert.ok(!JSON.stringify(r.body).includes('Cannot read properties'));
});
test('ReferenceError, RangeError and SyntaxError are all treated as server faults',async()=>{
 const {classifyRouteError}=await load();
 for(const err of [new ReferenceError('x'),new RangeError('x'),new SyntaxError('x')])
  assert.equal(classifyRouteError(err).status,500);
});
test('an explicit statusCode>=500 or SQLITE/ERR_ coded error is a server fault',async()=>{
 const {classifyRouteError}=await load();
 assert.equal(classifyRouteError(Object.assign(Error('boom'),{statusCode:503})).status,500);
 assert.equal(classifyRouteError(Object.assign(Error('boom'),{code:'SQLITE_BUSY'})).status,500);
 assert.equal(classifyRouteError(Object.assign(Error('boom'),{code:'ERR_INVALID_ARG_TYPE'})).status,500);
});
test('http: an intentional business Error still round-trips as 400 with its message',async()=>{
 const {createServer}=await load();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-errh-'));
 process.env.SCADA_DATA=dir;
 const app=await createServer() as any;
 const headers={'content-type':'application/json','x-scada-request':'1'};
 await app.inject({method:'POST',url:'/api/setup',headers,payload:{username:'admin',password:'Test-parola-2026!'},remoteAddress:'127.0.0.1'});
 const login=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'admin',password:'Test-parola-2026!'}});
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const bad=await app.inject({method:'GET',url:'/api/reports?from=2000&to=1000',headers:{...headers,cookie}});
 assert.equal(bad.statusCode,400);
 assert.equal(bad.json().error,'Bitiş zamanı başlangıçtan sonra olmalı.');
 await app.scadaClose();
});
