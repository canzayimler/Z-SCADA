import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// UYARI: index.ts'in modul govdesi, SCADA_NO_LISTEN!=='1' ise gercek main()'i calistirir
// (canli sunucu ile ayni ağaç/port/varsayilan .local veri dizini). Statik import hoist
// edilecegi icin hic kullanilmiyor — env once, sonra tembel/dinamik import (bkz. load()).
let mod:any;
async function load(){if(!mod){process.env.SCADA_NO_LISTEN='1';mod=await import('../apps/server/src/index');}return mod;}
test('readBuild parses a valid build.json',async()=>{
 const {readBuild}=await load();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-build-'));
 const file=path.join(dir,'build.json');
 fs.writeFileSync(file,JSON.stringify({id:'abc123',at:1700000000000}));
 assert.deepEqual(readBuild(file),{id:'abc123',at:1700000000000});
});
test('readBuild returns null when the file is missing',async()=>{
 const {readBuild}=await load();
 assert.equal(readBuild(path.join(os.tmpdir(),'scada-build-missing','build.json')),null);
});
test('readBuild returns null on malformed JSON or wrong field types',async()=>{
 const {readBuild}=await load();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-build-'));
 const badJson=path.join(dir,'bad.json');fs.writeFileSync(badJson,'{not json');
 assert.equal(readBuild(badJson),null);
 const wrongTypes=path.join(dir,'wrong.json');fs.writeFileSync(wrongTypes,JSON.stringify({id:123,at:'x'}));
 assert.equal(readBuild(wrongTypes),null);
});
test('/api/health exposes build identity, reading dist/web/build.json fresh on each call',async()=>{
 const {createServer}=await load();
 // Gercek repo'nun dist/web'ine dokunmamak icin sunucuyu izole bir cwd altinda baslatiyoruz
 // (dist/web/build.json yolu index.ts icinde repo koku goreli cozuluyor).
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-build-data-'));
 process.env.SCADA_DATA=dataDir;
 const workDir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-build-cwd-'));
 const distWeb=path.join(workDir,'dist','web');
 fs.mkdirSync(distWeb,{recursive:true});
 fs.writeFileSync(path.join(distWeb,'build.json'),JSON.stringify({id:'dist-v1',at:111}));
 const originalCwd=process.cwd();
 process.chdir(workDir);
 let app:any;
 try{
  app=await createServer();
  const first=await app.inject({method:'GET',url:'/api/health'});
  assert.equal(first.json().version,JSON.parse(fs.readFileSync(path.join(originalCwd,'package.json'),'utf8')).version,'surum package.json kaynakli');
  assert.equal(first.json().build.dist,'dist-v1');
  assert.equal(first.json().build.distAt,111);
  assert.ok('server' in first.json().build);
  // dosya degisince (mtime farkli) sonraki cagri yeni degeri yansitmali (mtime ile onbelleklenir).
  await new Promise(r=>setTimeout(r,10));
  fs.writeFileSync(path.join(distWeb,'build.json'),JSON.stringify({id:'dist-v2',at:222}));
  const second=await app.inject({method:'GET',url:'/api/health'});
  assert.equal(second.json().build.dist,'dist-v2');
  assert.equal(second.json().build.distAt,222);
 }finally{
  if(app)await app.scadaClose();
  process.chdir(originalCwd);
  fs.rmSync(workDir,{recursive:true,force:true});
 }
});
