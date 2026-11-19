import {z} from 'zod';
import type {DatabaseSync} from 'node:sqlite';
import type {Store} from './store';
import type {Sample,User} from '../../../packages/contracts/model';
import {energySettingsSchema,emptyEnergySettings,validateEnergySettings,bucketStart,groupHours,summarize,bandOf,bandLabels,BANDS,ENERGY_ROLES,
 type EnergySettings,type HourRow,type Grouping,type Analyzer} from '../../../packages/contracts/energy';
import {workbook,type Cell,type Sheet} from './xlsx';

/* --- Sayac: saatlik tuketim kovasi ----------------------------------------------------------
 * Kaynak onceligi: analizorun kendi enerji sayaci (kWh). Sayac eslenmemisse toplam aktif guc
 * zamana gore entegre edilir (yamuk kurali). Sayac farki kesintiyi asan bir araliga yayiliyorsa
 * kayip saatlere zamanla orantili dagitilir ve o saatler "eksik veri" olarak isaretlenir —
 * gunluk toplam dogru kalir, saat dagilimi tahmindir. Negatif fark = sayac sifirlandi/tasti:
 * o adim sayilmaz, bayrak dusulur. */
const HOUR=3600000;
type Acc={hour:number;ea:number;eqi:number;eqc:number;pSum:number;pN:number;pMax:number|null;demandMax:number|null;gap:number};
type Counter={value:number;at:number};
const COUNTER_ROLES=['ea','eqi','eqc'] as const;
const zeroAcc=(hour:number):Acc=>({hour,ea:0,eqi:0,eqc:0,pSum:0,pN:0,pMax:null,demandMax:null,gap:0});

export class EnergyMeter{
 acc=new Map<string,Acc>();counters=new Map<string,Counter>();
 lastP=new Map<string,{value:number;at:number}>();demand=new Map<string,{start:number;energy:number;covered:number}>();
 lastTick=0;lastFlush=0;
 constructor(private db:DatabaseSync,private store:Store,private settings:()=>EnergySettings,private samples:Record<string,Sample>){
  const saved=store.get<Record<string,Counter>>('energyCounters')||{};
  for(const [k,v] of Object.entries(saved))if(Number.isFinite(v?.value)&&Number.isFinite(v?.at))this.counters.set(k,v);
 }
 num(tagId:string|undefined){if(!tagId)return null;const s=this.samples[tagId];return s&&s.quality==='good'&&typeof s.value==='number'&&Number.isFinite(s.value)?s.value:null;}
 load(analyzerId:string,hour:number):Acc{
  const r=this.db.prepare('SELECT * FROM energy_hourly WHERE analyzer_id=? AND hour=?').get(analyzerId,hour) as any;
  return r?{hour,ea:r.ea,eqi:r.eqi,eqc:r.eqc,pSum:r.p_sum,pN:r.p_n,pMax:r.p_max,demandMax:r.demand_max,gap:r.gap}:zeroAcc(hour);
 }
 write(analyzerId:string,a:Acc){
  this.db.prepare('INSERT OR REPLACE INTO energy_hourly (analyzer_id,hour,ea,eqi,eqc,p_sum,p_n,p_max,demand_max,gap) VALUES (?,?,?,?,?,?,?,?,?,?)')
   .run(analyzerId,a.hour,a.ea,a.eqi,a.eqc,a.pSum,a.pN,a.pMax,a.demandMax,a.gap);
 }
 /** Gecmis bir saate enerji ekler (kesinti dagitimi); o saat bellekte degilse dogrudan tabloya. */
 addTo(analyzerId:string,hour:number,role:'ea'|'eqi'|'eqc',kwh:number){
  const cur=this.acc.get(analyzerId);
  if(cur&&cur.hour===hour){cur[role]+=kwh;cur.gap=1;return;}
  this.db.prepare(`INSERT INTO energy_hourly (analyzer_id,hour,ea,eqi,eqc,p_sum,p_n,p_max,demand_max,gap) VALUES (?,?,?,?,?,0,0,NULL,NULL,1)
   ON CONFLICT(analyzer_id,hour) DO UPDATE SET ${role}=${role}+excluded.${role},gap=1`)
   .run(analyzerId,hour,role==='ea'?kwh:0,role==='eqi'?kwh:0,role==='eqc'?kwh:0);
 }
 /** Farki [from,to] araligindaki saatlere zamanla orantili dagitir; cari saatin payi acc'ye. */
 spread(analyzerId:string,role:'ea'|'eqi'|'eqc',delta:number,from:number,to:number){
  const span=to-from;
  for(let h=bucketStart(from,'hour');h<to;h+=HOUR){
   const part=(Math.min(to,h+HOUR)-Math.max(from,h))/span;
   if(part>0)this.addTo(analyzerId,h,role,delta*part);
  }
 }
 tick(now=Date.now()){
  if(now-this.lastTick<1000)return;this.lastTick=now;
  const {analyzers,tariff}=this.settings(),hour=bucketStart(now,'hour'),window=tariff.demandMinutes*60000,ws=Math.floor(now/window)*window;
  for(const a of analyzers){
   if(!a.enabled)continue;
   let acc=this.acc.get(a.id);
   const raw=this.num(a.roles.p),kw=raw===null?null:raw*a.powerFactor,prev=this.lastP.get(a.id);
   // Yamuk entegrasyon; 10 sn'den uzun bosluk kopukluk sayilir, tahmin edilmez.
   const integ=kw!==null&&prev&&now-prev.at<=10000?(prev.value+kw)/2*(now-prev.at)/HOUR:null;
   const integMs=integ!==null?now-prev!.at:0;
   if(kw!==null)this.lastP.set(a.id,{value:kw,at:now});else this.lastP.delete(a.id);
   // Talep penceresi: kapanan pencerenin ortalama gucu, kapsama %80'i gecerse gecerli.
   let d=this.demand.get(a.id);
   if(d&&d.start!==ws){
    if(integ!==null){d.energy+=integ;d.covered+=integMs;}
    if(d.covered>=window*0.8&&acc&&acc.hour===bucketStart(d.start,'hour')){const kwAvg=d.energy/(d.covered/HOUR);if(acc.demandMax===null||kwAvg>acc.demandMax)acc.demandMax=kwAvg;}
    d=undefined;
   }
   if(!d){d={start:ws,energy:0,covered:0};this.demand.set(a.id,d);}
   else if(integ!==null){d.energy+=integ;d.covered+=integMs;}
   // Saat devri: biten saat yazilir, yeni saat tablodan (yeniden baslatmada kaldigi yerden) okunur.
   if(!acc||acc.hour!==hour){if(acc)this.write(a.id,acc);acc=this.load(a.id,hour);this.acc.set(a.id,acc);}
   if(kw!==null){acc.pSum+=kw;acc.pN++;if(acc.pMax===null||kw>acc.pMax)acc.pMax=kw;}
   for(const role of COUNTER_ROLES){
    const tagId=a.roles[role];
    if(!tagId){if(role==='ea'&&integ!==null)acc.ea+=integ;continue;}
    const v=this.num(tagId);if(v===null)continue;
    const val=v*a.energyFactor,key=a.id+':'+role,last=this.counters.get(key);
    this.counters.set(key,{value:val,at:now});
    if(!last)continue;
    const delta=val-last.value;
    if(delta<0){acc.gap=1;continue;}
    if(delta===0)continue;
    if(now-last.at>5*60000)this.spread(a.id,role,delta,last.at,now);
    else acc[role]+=delta;
   }
  }
  if(now-this.lastFlush>=60000)this.flush(now);
 }
 /** Bellekteki saatleri ve sayac tabanini diske yazar. Sorgudan once ve kapanista da cagrilir. */
 flush(now=Date.now()){
  this.lastFlush=now;
  const ids=new Set(this.settings().analyzers.map(a=>a.id));
  for(const [id,a] of this.acc){if(ids.has(id))this.write(id,a);else this.acc.delete(id);}
  const counters:Record<string,Counter>={};for(const [k,v] of this.counters)if(ids.has(k.split(':')[0]))counters[k]=v;
  this.store.set('energyCounters',counters);
 }
 /** Analizor eslemesi degisince tabani sifirla: yeni etiketin degeri eskiyle farklanmasin. */
 reset(analyzerId:string){for(const k of [...this.counters.keys()])if(k.startsWith(analyzerId+':'))this.counters.delete(k);this.lastP.delete(analyzerId);this.demand.delete(analyzerId);}
}

export function hourRows(db:DatabaseSync,ids:string[],from:number,to:number):HourRow[]{
 if(!ids.length)return [];
 const rows=db.prepare(`SELECT * FROM energy_hourly WHERE analyzer_id IN (${ids.map(()=>'?').join(',')}) AND hour>=? AND hour<? ORDER BY hour`).all(...ids,bucketStart(from,'hour'),to) as any[];
 return rows.map(r=>({analyzerId:r.analyzer_id,hour:Number(r.hour),ea:r.ea,eqi:r.eqi,eqc:r.eqc,pSum:r.p_sum,pN:r.p_n,pMax:r.p_max,demandMax:r.demand_max,gap:r.gap}));
}

/** Eslenmis anlik olcum rolleri icin zaman kovasi ortalamalari (historian tablosundan). */
export function measurementRows(db:DatabaseSync,analyzers:Analyzer[],from:number,to:number,bucketMs:number){
 const cols:{analyzer:Analyzer;role:typeof ENERGY_ROLES[number];tagId:string}[]=[];
 for(const a of analyzers)for(const r of ENERGY_ROLES)if(r.group!=='energy'&&a.roles[r.key])cols.push({analyzer:a,role:r,tagId:a.roles[r.key]});
 if(!cols.length)return {cols,rows:[] as {at:number;values:(number|null)[]}[]};
 const tagIds=[...new Set(cols.map(c=>c.tagId))];
 const data=db.prepare(`SELECT tag_id,(at/?)*? b,AVG(value) v FROM history WHERE tag_id IN (${tagIds.map(()=>'?').join(',')}) AND at>=? AND at<? AND quality='good' AND value IS NOT NULL GROUP BY tag_id,b`)
  .all(bucketMs,bucketMs,...tagIds,from,to) as any[];
 const byBucket=new Map<number,Map<string,number>>();
 for(const r of data){const b=Number(r.b);let m=byBucket.get(b);if(!m){m=new Map();byBucket.set(b,m);}m.set(r.tag_id,Number(r.v));}
 const rows=[...byBucket.keys()].sort((a,b)=>a-b).map(at=>({at,values:cols.map(c=>{const v=byBucket.get(at)!.get(c.tagId);return v===undefined?null:(c.role.unit==='kW'||c.role.unit==='kVAr'||c.role.unit==='kVA')?v*c.analyzer.powerFactor:v;})}));
 return {cols,rows};
}

/* --- Excel ---------------------------------------------------------------------------------- */
const DAY=24*HOUR;
export function energyWorkbook(opts:{db:DatabaseSync;settings:EnergySettings;analyzers:Analyzer[];from:number;to:number;generatedBy:string;now?:number}){
 const {db,settings,analyzers,from,to}=opts,t=settings.tariff,cur=t.currency,span=to-from;
 const rows=hourRows(db,analyzers.map(a=>a.id),from,to),sums=summarize(rows,analyzers,t);
 const name=new Map(analyzers.map(a=>[a.id,a]));
 const H=(s:string):Cell=>({v:s,s:'header'}),N=(v:number|null):Cell=>({v,s:'num'}),M=(v:number|null):Cell=>({v,s:'money'}),P=(v:number|null):Cell=>({v,s:'pct'});
 const D=(v:number|null,s:'dateTime'|'date'|'month'='dateTime'):Cell=>({v,s,date:true});
 const tot=(k:(x:typeof sums[number])=>number)=>sums.reduce((n,x)=>n+k(x),0);
 const totalEa=tot(x=>x.ea),totalEqi=tot(x=>x.eqi),totalEqc=tot(x=>x.eqc);
 const sheets:Sheet[]=[];
 // 1) Ozet
 const head=['Analizör','Grup','Toplam kWh',...BANDS.map(b=>bandLabels[b]+' kWh'),'Maliyet '+cur,...BANDS.map(b=>bandLabels[b]+' '+cur),'Endüktif kVArh','Kapasitif kVArh','Endüktif %','Kapasitif %','Reaktif durum','Maks. talep kW','Talep zamanı','Maks. P kW','Ort. P kW','Eksik veri (saat)'];
 const summaryStart=9;
 sheets.push({name:'Özet',freezeRow:summaryStart,filterRow:summaryStart,widths:[28,18,14,13,13,13,14,13,13,13,15,15,12,12,22,14,17,12,12,14],rows:[
  [{v:'Enerji tüketim raporu',s:'title'}],
  [{v:'Aralık',s:'muted'},D(from),D(to)],
  [{v:'Oluşturan',s:'muted'},opts.generatedBy,D(opts.now??Date.now())],
  [{v:'Tarife',s:'muted'},`Gündüz ${pad(t.dayStart)}–${pad(t.peakStart)} · Puant ${pad(t.peakStart)}–${pad(t.nightStart)} · Gece ${pad(t.nightStart)}–${pad(t.dayStart)}`],
  [{v:'Birim fiyat '+cur+'/kWh',s:'muted'},'Gündüz',M(t.priceDay),'Puant',M(t.pricePeak),'Gece',M(t.priceNight)],
  [{v:'Reaktif sınır',s:'muted'},`Endüktif %${t.inductiveLimitPct} · Kapasitif %${t.capacitiveLimitPct}`,'',{v:'Talep penceresi',s:'muted'},t.demandMinutes+' dk'],
  [{v:'Not',s:'muted'},'Eksik veri işaretli saatlerde sayaç farkı kesinti süresine eşit dağıtıldı; günlük toplam doğru, saat dağılımı tahmindir.'],
  [],
  head.map(H),
  ...sums.map(s=>[s.name,s.group,N(s.ea),...BANDS.map(b=>N(s.byBand[b])),M(s.cost),...BANDS.map(b=>M(s.costByBand[b])),N(s.eqi),N(s.eqc),P(s.inductivePct),P(s.capacitivePct),
   s.inductiveOver||s.capacitiveOver?{v:(s.inductiveOver?'Endüktif sınır aşıldı':'')+(s.inductiveOver&&s.capacitiveOver?' · ':'')+(s.capacitiveOver?'Kapasitif sınır aşıldı':''),s:'warn'}:(s.inductivePct===null&&s.capacitivePct===null?'Sayaç eşlenmedi':'Sınır içinde'),
   N(s.demandMax),D(s.demandAt),N(s.pMax),N(s.pAvg),{v:s.gapHours,s:'int'}] as Cell[]),
  [{v:'Toplam',s:'totalLabel'},{v:'',s:'totalLabel'},{v:totalEa,s:'totalNum'},...BANDS.map(b=>({v:tot(x=>x.byBand[b]),s:'totalNum'} as Cell)),{v:tot(x=>x.cost),s:'totalMoney'},...BANDS.map(b=>({v:tot(x=>x.costByBand[b]),s:'totalMoney'} as Cell)),
   {v:totalEqi,s:'totalNum'},{v:totalEqc,s:'totalNum'},{v:totalEa>0?totalEqi/totalEa*100:null,s:'totalNum'},{v:totalEa>0?totalEqc/totalEa*100:null,s:'totalNum'}],
 ]});
 // 2) Donem kovalari: gunluk + aylik, (analizor x kova)
 const periodSheet=(label:string,g:Grouping,fmt:'dateTime'|'date'|'month',withBand:boolean):Sheet=>{
  const out:Cell[][]=[[label==='Saatlik'?'Saat':label==='Günlük'?'Gün':'Ay','Analizör','Grup',...(withBand?['Dilim']:[]),'kWh',...(withBand?[]:BANDS.map(b=>bandLabels[b]+' kWh')),'Maliyet '+cur,'Endüktif kVArh','Kapasitif kVArh','Endüktif %','Kapasitif %','Ort. P kW','Maks. P kW','Maks. talep kW','Eksik veri'].map(H)];
  for(const a of analyzers){
   const mine=rows.filter(r=>r.analyzerId===a.id);
   for(const b of groupHours(mine,g,t))out.push([D(b.from,fmt),a.name,a.group,...(withBand?[bandLabels[bandOf(new Date(b.from).getHours(),t)]]:[]),N(b.ea),...(withBand?[]:BANDS.map(x=>N(b.byBand[x]))),M(b.cost),N(b.eqi),N(b.eqc),
    P(b.ea>0&&a.roles.eqi?b.eqi/b.ea*100:null),P(b.ea>0&&a.roles.eqc?b.eqc/b.ea*100:null),N(b.pAvg),N(b.pMax),N(b.demandMax),b.gap?'Evet':'']);
  }
  out.splice(1,out.length-1,...out.slice(1).sort((x,y)=>(((x[0] as any).v as number)-((y[0] as any).v as number))||String(x[1]).localeCompare(String(y[1]),'tr')));
  return {name:label,rows:out,freezeRow:1,filterRow:1,widths:[17,26,16,...(withBand?[10]:[]),12,...(withBand?[]:[12,12,12]),13,14,14,11,11,11,11,13,10]};
 };
 sheets.push(periodSheet('Aylık','month','month',false));
 sheets.push(periodSheet('Günlük','day','date',false));
 // Saatlik satir sayisi: 200 analizor x 93 gun = ~450 bin; sinir koy, Excel acilabilir kalsin.
 if(span<=93*DAY)sheets.push(periodSheet('Saatlik','hour','dateTime',true));
 // 3) Olcumler: 31 gune kadar 15 dk, uzun araliklarda saatlik ortalama.
 const bucketMs=span<=31*DAY?15*60000:HOUR;
 const m=measurementRows(db,analyzers,from,to,bucketMs);
 if(m.cols.length){
  sheets.push({name:'Ölçümler ('+(bucketMs===HOUR?'saatlik':'15 dk')+' ort.)',freezeRow:1,filterRow:1,widths:[17,...m.cols.map(()=>14)],rows:[
   [H('Zaman'),...m.cols.map(c=>H(c.analyzer.name+' · '+c.role.short+(c.role.unit?' ('+c.role.unit+')':'')))],
   ...m.rows.map(r=>[D(r.at),...r.values.map(v=>N(v))])]});
 }
 // 4) Esleme: hangi etiket hangi rolde — raporun izlenebilirligi.
 sheets.push({name:'Eşleme',freezeRow:1,widths:[26,32,10,40],rows:[[H('Analizör'),H('Ölçüm'),H('Birim'),H('Etiket kimliği')],
  ...analyzers.flatMap(a=>ENERGY_ROLES.filter(r=>a.roles[r.key]).map(r=>[a.name,r.label,r.unit,a.roles[r.key]] as Cell[]))]});
 return workbook(sheets);
}
const pad=(h:number)=>String(h).padStart(2,'0')+':00';

/* --- HTTP ----------------------------------------------------------------------------------- */
export type EnergyContext={app:any;store:Store;samples:Record<string,Sample>;
 read:(r:any)=>User;edit:(r:any)=>User};
export function registerEnergy(ctx:EnergyContext){
 const {app,store}=ctx,db=store.db;
 let cached:EnergySettings|null=null;
 const settings=()=>{if(cached)return cached;const parsed=energySettingsSchema.safeParse(store.get('energySettings')||emptyEnergySettings);cached=parsed.success?parsed.data:emptyEnergySettings;return cached;};
 const meter=new EnergyMeter(db,store,settings,ctx.samples);
 const range=z.object({from:z.coerce.number().int(),to:z.coerce.number().int(),ids:z.string().max(8000).optional()});
 const pick=(ids:string|undefined)=>{const all=settings().analyzers;if(!ids)return all;const want=new Set(ids.split(',').map(x=>x.trim()).filter(Boolean));return all.filter(a=>want.has(a.id));};
 app.get('/api/energy',async (req:any)=>{ctx.read(req);return {settings:settings(),revision:Number(store.get('energyRevision')||0)};});
 app.put('/api/energy',async (req:any)=>{
  const u=ctx.edit(req),body=z.object({settings:z.unknown(),revision:z.number().int().min(0)}).parse(req.body);
  const next=validateEnergySettings(body.settings,store.config()),revision=Number(store.get('energyRevision')||0),before=settings();
  if(body.revision!==revision)throw Object.assign(Error('Analizör ayarları başka bir oturumda değişti; sayfayı yenileyip tekrar deneyin.'),{statusCode:409,data:{revision,settings:before}});
  // Eslemesi degisen analizorun sayac tabani sifirlanir; aksi halde farkli etiketin degeri "tuketim" sayilir.
  for(const a of next.analyzers){const old=before.analyzers.find(x=>x.id===a.id);if(!old||JSON.stringify(old.roles)!==JSON.stringify(a.roles)||old.energyFactor!==a.energyFactor||old.powerFactor!==a.powerFactor)meter.reset(a.id);}
  meter.flush();
  store.transaction(()=>{store.set('energySettings',next);store.set('energyRevision',revision+1);
   store.audit(u.username,'energy.settings.saved',{analyzers:next.analyzers.length,revision:revision+1,tariff:next.tariff});});
  cached=next;return {settings:next,revision:revision+1};
 });
 app.get('/api/energy/consumption',async (req:any)=>{
  ctx.read(req);
  const q=range.extend({group:z.enum(['hour','day','month']).default('day')}).parse(req.query);
  if(q.to<=q.from)throw Error('Bitiş zamanı başlangıçtan sonra olmalı.');
  if(q.group==='hour'&&q.to-q.from>93*DAY)throw Error('Saatlik gruplama en fazla 93 günlük aralıkta kullanılabilir.');
  meter.flush();
  const s=settings(),analyzers=pick(q.ids),rows=hourRows(db,analyzers.map(a=>a.id),q.from,q.to);
  const buckets=groupHours(rows,q.group,s.tariff);
  // Analizor basina kova serisi (karsilastirma grafigi); kovalar ortak eksene hizali.
  const byAnalyzer:Record<string,number[]>={};
  for(const a of analyzers){const mine=new Map(groupHours(rows.filter(r=>r.analyzerId===a.id),q.group,s.tariff).map(b=>[b.from,b.ea]));byAnalyzer[a.id]=buckets.map(b=>mine.get(b.from)??0);}
  return {from:q.from,to:q.to,group:q.group,tariff:s.tariff,buckets,byAnalyzer,summaries:summarize(rows,analyzers,s.tariff)};
 });
 app.get('/api/energy/export',async (req:any,reply:any)=>{
  const u=ctx.read(req),q=range.parse(req.query);
  if(q.to<=q.from)throw Error('Bitiş zamanı başlangıçtan sonra olmalı.');
  if(q.to-q.from>400*DAY)throw Error('Excel dışa aktarımı en fazla 400 günlük aralık için yapılabilir.');
  meter.flush();
  const s=settings(),analyzers=pick(q.ids);
  if(!analyzers.length)throw Error('Dışa aktarılacak analizör yok.');
  const buf=energyWorkbook({db,settings:s,analyzers,from:q.from,to:q.to,generatedBy:u.username});
  const d=new Date(q.from),stamp=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  store.audit(u.username,'energy.exported',{from:q.from,to:q.to,analyzers:analyzers.length});
  return reply.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
   .header('Content-Disposition',`attachment; filename="enerji-raporu-${stamp}.xlsx"`).send(buf);
 });
 /** Historian: analizore eslenen olcum etiketleri, etiketin kendi gecmis ayari kapali olsa da kaydedilir. */
 const historyTags=()=>{const set=new Set<string>();for(const a of settings().analyzers)if(a.enabled)for(const tagId of Object.values(a.roles))set.add(tagId);return set;};
 return {meter,settings,historyTags};
}
