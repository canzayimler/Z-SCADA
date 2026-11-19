import {z} from 'zod';
import {type Store,auditScopeFor} from './store';
import type {User} from '../../../packages/contracts/model';
/** CSV'ler ekrandaki gibi yerel saatle (TR, makine Europe/Istanbul) okunsun diye ISO/UTC
 * yerine `YYYY-MM-DD HH:mm:ss±HH:mm` yazar; ofset Date'ten hesaplanir, +03:00 sabitlenmez. */
export function localCsvTime(ms:number){
 const d=new Date(ms),pad=(n:number)=>String(n).padStart(2,'0');
 const off=-d.getTimezoneOffset(),sign=off>=0?'+':'-',abs=Math.abs(off);
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs/60))}:${pad(abs%60)}`;
}
/**
 * Isletme kayitlari yuzeyi: vardiya raporu, vardiya notu ve denetim gecmisi.
 * Hepsi tarih arali kli ve sayfali okunur — UI'da az satir gorunmesi diskte
 * az kayit oldugu anlamina gelmez (B51).
 */
export type RecordsContext={app:any;store:Store;retentionDays:number;
 read:(r:any)=>User;requireRole:(r:any,roles:string[])=>User};
export function registerRecords(ctx:RecordsContext){
ctx.app.get('/api/reports',async (req:any,reply:any)=>{
 ctx.read(req);
 const q=z.object({from:z.coerce.number().int().optional(),to:z.coerce.number().int().optional(),tagIds:z.string().max(2000).optional(),format:z.enum(['json','csv']).default('json')}).parse(req.query);
 const to=q.to||Date.now(),from=q.from||to-24*3600000;
 if(to<=from)throw Error('Bitiş zamanı başlangıçtan sonra olmalı.');
 const tagIds=q.tagIds?.split(',').map(x=>x.trim()).filter(Boolean).slice(0,100);
 const r=ctx.store.report(from,to,tagIds);
 if(q.format!=='csv')return r;
 // Vardiya raporu disari tasinabilsin; kaynak alanlar ve aralik satirda gorunur.
 const rows=[['bolum','anahtar','deger'],
  ['aralik','baslangic',localCsvTime(from)],['aralik','bitis',localCsvTime(to)],
  ['alarm','toplam',String(r.alarms.total)],['alarm','onaylanmamis',String(r.alarms.unacked)],['alarm','en_uzun_ms',String(r.alarms.longestMs)],
  ...Object.entries(r.alarms.bySeverity).map(([k,v])=>['alarm','onem_'+k,String(v)]),
  ...r.alarms.top.map(t=>['alarm','kural_'+t.name,String(t.count)]),
  ['komut','toplam',String(r.commands.total)],['komut','basarisiz',String(r.commands.failed)],
  ...Object.entries(r.commands.byStatus).map(([k,v])=>['komut','durum_'+k,String(v)]),
  ...Object.entries(r.commands.byUser).map(([k,v])=>['komut','kullanici_'+k,String(v)]),
  ...r.activities.flatMap((a:any)=>[
   ['dijital_ozet',a.tagCode||a.tagId,`aktivasyon=${a.activations};toplam_ms=${a.totalOnMs};ortalama_ms=${a.averageOnMs};en_uzun_ms=${a.longestOnMs};belirsiz=${a.uncertain}`],
   ...a.intervals.map((i:any)=>['dijital_cevrim',a.tagCode||a.tagId,`baslangic=${localCsvTime(i.start)};bitis=${localCsvTime(i.end)};sure_ms=${i.durationMs};devam_ediyor=${i.ongoing};belirsiz=${i.uncertain}`])
  ]),
  ...r.notes.map((n:any)=>['vardiya',n.shift+' · '+n.author,String(n.text).replace(/"/g,'""')])];
 const csv=rows.map(cols=>cols.map((c:any)=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join(String.fromCharCode(13,10));
 return reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="vardiya-raporu.csv"').send(String.fromCharCode(0xFEFF)+csv);
});
ctx.app.post('/api/reports/notes',async (req:any)=>{
 const u=ctx.requireRole(req,['admin','designer','operator']);
 const b=z.object({shift:z.string().trim().min(1).max(40),text:z.string().trim().min(3).max(4000),start:z.number().int(),finish:z.number().int()}).parse(req.body);
 if(b.finish<=b.start)throw Error('Vardiya bitişi başlangıçtan sonra olmalı.');
 const note=ctx.store.addShiftNote({author:u.username,shift:b.shift,start:b.start,finish:b.finish,text:b.text});
 ctx.store.audit(u.username,'shift.note',{id:note.id,shift:b.shift,start:b.start,finish:b.finish});
 return note;
});
ctx.app.get('/api/audit',async (req:any)=>{const scope=auditScopeFor(ctx.read(req).role);
 const q=z.object({from:z.coerce.number().int().optional(),to:z.coerce.number().int().optional(),limit:z.coerce.number().int().min(1).max(500).default(200),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
 const freeMb=ctx.store.freeSpaceMb();
 if(q.from===undefined&&q.to===undefined)return {events:ctx.store.events(scope),commands:ctx.store.commands(),retentionDays:ctx.retentionDays,freeMb,scope};
 const from=q.from??0,to=q.to??Date.now();
 const events=ctx.store.auditPage(from,to,q.limit,q.offset,scope),commands=ctx.store.commandPage(from,to,q.limit,q.offset);
 return {events:events.rows,eventsTotal:events.total,commands:commands.rows,commandsTotal:commands.total,retentionDays:ctx.retentionDays,freeMb,scope};
});

}
