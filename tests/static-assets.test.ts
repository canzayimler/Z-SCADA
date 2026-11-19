import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import {precompress,cacheControlFor,staticOptions} from '../apps/server/src/staticAssets';
/* Denetim 2026-11-18: sunucu sıkıştırmıyordu ve hash'li asset'ler `public, max-age=0` ile
 * her açılışta yeniden doğrulanıyordu. Build .br/.gz üretir, sunucu Accept-Encoding'e göre seçer. */
function site(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-static-'));
 fs.mkdirSync(path.join(dir,'assets'));
 const js='export const a='+JSON.stringify('x'.repeat(20000))+';\n'.repeat(1);
 fs.writeFileSync(path.join(dir,'assets','index-AbC123.js'),js);
 fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><title>t</title>'+'<p>z</p>'.repeat(400));
 fs.writeFileSync(path.join(dir,'build.json'),'{"id":"k","at":1}');
 return {dir,js};
}
test('precompress buyuk metin dosyalarina .br ve .gz yazar, kucukleri atlar',()=>{
 const {dir}=site();const r=precompress(dir);
 assert.equal(r.files,2);
 assert.ok(fs.existsSync(path.join(dir,'assets','index-AbC123.js.br')));
 assert.ok(fs.existsSync(path.join(dir,'index.html.gz')));
 assert.ok(!fs.existsSync(path.join(dir,'build.json.br')),'1 kB altı sıkıştırılmaz');
});
test('cacheControlFor: assets/ bir yil immutable, digerleri no-cache',()=>{
 assert.equal(cacheControlFor(String.raw`C:\x\dist\web\assets\index-AbC.js.br`),'public, max-age=31536000, immutable');
 assert.equal(cacheControlFor('/srv/dist/web/assets/a.css'),'public, max-age=31536000, immutable');
 assert.equal(cacheControlFor('/srv/dist/web/index.html'),'no-cache');
});
test('sunucu br/gzip secer, basliklari dogru verir, sikistirmasiz istemciye duz gonderir',async()=>{
 const {dir,js}=site();precompress(dir);
 const app=Fastify();await app.register(staticFiles,staticOptions(dir));
 app.setNotFoundHandler((req,reply)=>reply.sendFile('index.html'));
 const br=await app.inject({method:'GET',url:'/assets/index-AbC123.js',headers:{'accept-encoding':'br, gzip'}});
 assert.equal(br.statusCode,200);
 assert.equal(br.headers['content-encoding'],'br');
 assert.equal(br.headers['cache-control'],'public, max-age=31536000, immutable');
 assert.match(String(br.headers['vary']),/accept-encoding/i);
 assert.match(String(br.headers['content-type']),/javascript/);
 assert.equal(zlib.brotliDecompressSync(br.rawPayload).toString(),js);
 const gz=await app.inject({method:'GET',url:'/assets/index-AbC123.js',headers:{'accept-encoding':'gzip'}});
 assert.equal(gz.headers['content-encoding'],'gzip');
 const plain=await app.inject({method:'GET',url:'/assets/index-AbC123.js'});
 assert.equal(plain.headers['content-encoding'],undefined);assert.equal(plain.body,js);
 const html=await app.inject({method:'GET',url:'/',headers:{'accept-encoding':'br'}});
 assert.equal(html.headers['cache-control'],'no-cache');assert.equal(html.headers['content-encoding'],'br');
 const spa=await app.inject({method:'GET',url:'/alarmlar',headers:{'accept-encoding':'gzip'}});
 assert.equal(spa.statusCode,200);assert.equal(spa.headers['cache-control'],'no-cache');
 await app.close();
});
