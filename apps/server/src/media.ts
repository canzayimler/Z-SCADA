import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import staticFiles from '@fastify/static';
import type {Store} from './store';
import type {User} from '../../../packages/contracts/model';
import {inspectSvg} from './svg';
/**
 * Medya (gorsel) yuzeyi: yukleme, listeleme, kullanim cozumleme ve temizlik.
 * Kritik kural: tekil silme ile toplu temizlik AYNI referans cozumleyicisini
 * kullanir; eski yayin surumunde gecen gorsel silinemez (B52).
 */
export type MediaContext={app:any;store:Store;directory:string;
 read:(r:any)=>User;edit:(r:any)=>User;requireRole:(r:any,roles:string[])=>User};
export async function registerMedia(ctx:MediaContext){
 const directory=ctx.directory;
const uploads=path.join(directory,'uploads');fs.mkdirSync(uploads,{recursive:true});
const imageTypes:[string,(b:Buffer)=>boolean][]=[
 ['png',b=>b.length>8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47],
 ['jpg',b=>b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff],
 ['gif',b=>b.subarray(0,4).toString('latin1')==='GIF8'],
 ['webp',b=>b.subarray(0,4).toString('latin1')==='RIFF'&&b.subarray(8,12).toString('latin1')==='WEBP'],
 // SVG ikili imza tasimaz; metin olarak taninir ve AYRICA denetlenir (svg.ts).
 ['svg',b=>/<svg[\s>]/i.test(b.subarray(0,4096).toString('utf8'))]];
ctx.app.post('/api/uploads',async (req:any)=>{
 const u=ctx.edit(req);const b=z.object({data:z.string().max(6*1024*1024)}).parse(req.body);
 const buffer=Buffer.from(b.data,'base64');
 if(!buffer.length)throw Error('Dosya boş.');
 if(buffer.length>4*1024*1024)throw Error('Görsel en fazla 4 MB olabilir.');
 const kind=imageTypes.find(([,test])=>test(buffer));
 if(!kind)throw Error('Yalnızca PNG, JPG, GIF, WEBP ve SVG yüklenebilir.');
 if(kind[0]==='svg'){
  // SVG bir belgedir: temizlenmez, denetlenir ve suphe halinde reddedilir.
  if(buffer.length>1024*1024)throw Error('SVG en fazla 1 MB olabilir.');
  const verdict=inspectSvg(buffer.toString('utf8'));
  if(!verdict.ok){ctx.store.audit(u.username,'image.rejected',{reason:verdict.reason,bytes:buffer.length});throw Error(verdict.reason);}
 }
 const name=createHash('sha256').update(buffer).digest('hex').slice(0,32)+'.'+kind[0];
 const file=path.join(uploads,name);
 if(!fs.existsSync(file))fs.writeFileSync(file,buffer);
 ctx.store.audit(u.username,'image.uploaded',{name,bytes:buffer.length});
 return {src:'/uploads/'+name,bytes:buffer.length};
});
ctx.app.get('/api/uploads',async (req:any)=>{ctx.read(req);
 return fs.readdirSync(uploads).filter(f=>/^[a-f0-9]{32}\.(png|jpg|gif|webp|svg)$/.test(f))
  .map(f=>({src:'/uploads/'+f,bytes:fs.statSync(path.join(uploads,f)).size,created:fs.statSync(path.join(uploads,f)).mtimeMs}))
  .sort((a,b)=>b.created-a.created);
});
const imagePattern=/\/uploads\/[a-f0-9]{32}\.(?:png|jpg|gif|webp|svg)/g;
function usedImages(){const used=new Set<string>();
 const scan=(text:string)=>{for(const m of text.match(imagePattern)||[])used.add(m.slice('/uploads/'.length));};
 scan(JSON.stringify(ctx.store.screens()));
 for(const r of ctx.store.db.prepare('SELECT body FROM revisions').all() as any[])scan(r.body);
 // Arsivlenmis projelerin gorselleri de kullanimdadir; temizlik onlari silmesin.
 {const dir=path.join(ctx.directory,'projects');if(fs.existsSync(dir))for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){try{scan(fs.readFileSync(path.join(dir,f),'utf8'));}catch{}}}
 return used;}
function unusedImages(){const used=usedImages();
 return fs.readdirSync(uploads).filter(f=>/^[a-f0-9]{32}\.(png|jpg|gif|webp|svg)$/.test(f)&&!used.has(f))
  .map(f=>({src:'/uploads/'+f,bytes:fs.statSync(path.join(uploads,f)).size}));}
ctx.app.get('/api/uploads/unused',async (req:any)=>{ctx.requireRole(req,['admin']);const list=unusedImages();
 return {files:list,count:list.length,bytes:list.reduce((t,f)=>t+f.bytes,0)};});
ctx.app.post('/api/uploads/cleanup',async (req:any)=>{const u=ctx.requireRole(req,['admin']);const list=unusedImages();
 let removed=0,bytes=0;
 for(const f of list){try{fs.unlinkSync(path.join(uploads,path.basename(f.src)));removed++;bytes+=f.bytes;}catch{}}
 ctx.store.audit(u.username,'image.cleanup',{removed,bytes});
 return {removed,bytes};});
await ctx.app.register(staticFiles,{root:uploads,prefix:'/uploads/',decorateReply:false,index:false,maxAge:31536000000,immutable:true,
 setHeaders:(res:any)=>{const set=(k:string,v:string)=>typeof res.header==='function'?res.header(k,v):res.setHeader(k,v);set('Content-Security-Policy',"default-src 'none'");set('X-Content-Type-Options','nosniff');}});
ctx.app.delete('/api/uploads/:name',async (req:any)=>{
 const u=ctx.requireRole(req,['admin']);const name=(req.params as any).name;
 if(!/^[a-f0-9]{32}\.(png|jpg|gif|webp|svg)$/.test(name))throw Error('Geçersiz dosya adı.');
 const file=path.join(uploads,name);
 if(!fs.existsSync(file))throw Error('Görsel zaten yok.');
 // Tekil silme ve toplu temizlik ayni referans cozumleyicisini kullanir:
 // yalniz eski yayin surumunde gecen gorsel de silinemez (B52).
 if(usedImages().has(name))throw Error('Bu görsel bir ekranda veya eski bir yayın sürümünde kullanılıyor; önce oradan kaldırın.');
 const where=[];const src='/uploads/'+name;
 for(const s of ctx.store.screens()){
  if(s.draft.widgets.some(w=>w.src===src))where.push(s.name+' (taslak)');
  if((s.published?.widgets||[]).some(w=>w.src===src))where.push(s.name+' (yayın)');
 }
 if(where.length)throw Error('Görsel kullanımda: '+where.join(', ')+'. Önce ekrandan kaldırın.');
 fs.unlinkSync(file);ctx.store.audit(u.username,'image.deleted',{name});
 return {ok:true};
});
 return {uploads,usedImages,unusedImages,imagePattern};
}
