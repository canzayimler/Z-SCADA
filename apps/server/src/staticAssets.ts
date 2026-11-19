/* Arayüz dosyalarının sunumu: önceden sıkıştırma + önbellek başlıkları.
 * Paket gömülü node ile çalışıyor; yeni bağımlılık (ör. @fastify/compress) yerine build sırasında
 * node:zlib ile .br/.gz üretilir, @fastify/static `preCompressed` ile Accept-Encoding'e göre sunar.
 * Hash'li /assets/* dosyaları değişmez: bir yıl, immutable. index.html ve diğerleri no-cache
 * (yeni build hemen görünsün; ETag/Last-Modified ile yeniden doğrulanır). */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const COMPRESSIBLE=/\.(?:js|mjs|css|html|svg|json|txt|map)$/i;  // woff2/woff zaten sıkıştırılmış
const MIN_BYTES=1024;

/** dir altındaki sıkıştırılabilir dosyalar için yanına .br ve .gz yazar; yalnız küçülüyorsa. */
export function precompress(dir:string):{files:number;raw:number;br:number;gz:number}{
 const out={files:0,raw:0,br:0,gz:0};
 const walk=(d:string)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,e.name);
  if(e.isDirectory()){walk(p);continue;}
  if(!COMPRESSIBLE.test(e.name))continue;
  const data=fs.readFileSync(p);if(data.length<MIN_BYTES)continue;
  const br=zlib.brotliCompressSync(data,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:11,[zlib.constants.BROTLI_PARAM_SIZE_HINT]:data.length}});
  const gz=zlib.gzipSync(data,{level:9});
  out.files++;out.raw+=data.length;
  if(br.length<data.length){fs.writeFileSync(p+'.br',br);out.br+=br.length;}
  if(gz.length<data.length){fs.writeFileSync(p+'.gz',gz);out.gz+=gz.length;}
 }};
 walk(dir);
 return out;
}
/** Dosya yoluna göre Cache-Control. Vite hash'li çıktıları assets/ altına koyar. */
export function cacheControlFor(file:string):string{
 return /[\\/]assets[\\/]/.test(file)?'public, max-age=31536000, immutable':'no-cache';
}
/** @fastify/static seçenekleri. */
export function staticOptions(root:string){
 return {root,preCompressed:true,cacheControl:false,
  setHeaders(res:any,file:string){const v=cacheControlFor(file);if(typeof res.header==='function')res.header('cache-control',v);else res.setHeader('cache-control',v);}};
}
