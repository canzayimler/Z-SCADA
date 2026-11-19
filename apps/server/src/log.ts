import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
/**
 * Dosya loglama (B: crash capture). Fastify'in logger:false ile sessiz
 * kalmasi, uretimde "ne oldu" sorusunu cevapsiz birakiyordu — burada JSON
 * satirlari <data>/logs/server.log'a yazilir. Boyut esikli basit dondurme
 * kendimiz yapiyoruz (ekstra paket yok, pino zaten fastify ile geliyor).
 */
export const MAX_LOG_BYTES=10*1024*1024,MAX_LOG_FILES=5;
/** server.log > esik ise .1..5 kaydirip mevcut dosyayi .1 yapar; en eski (.5) silinir. */
export function rotateIfNeeded(file:string){
 let size=0;try{size=fs.statSync(file).size;}catch{return;}
 if(size<=MAX_LOG_BYTES)return;
 for(let i=MAX_LOG_FILES;i>=1;i--){
  const from=i===1?file:`${file}.${i-1}`,to=`${file}.${i}`;
  try{if(i===MAX_LOG_FILES)fs.rmSync(to,{force:true});if(fs.existsSync(from))fs.renameSync(from,to);}catch{}
 }
}
/** Log dizinini kurar ve dosyaya yazan pino ornegi dondurur. */
export function createFileLogger(directory:string){
 const dir=path.join(directory,'logs');
 fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'server.log');
 rotateIfNeeded(file);
 const rotateTimer=setInterval(()=>rotateIfNeeded(file),3600000);rotateTimer.unref?.();
 const destination=pino.destination({dest:file,sync:false,mkdir:true});
 const logger=pino({level:'info'},destination);
 return {logger,file,stop:()=>clearInterval(rotateTimer)};
}
