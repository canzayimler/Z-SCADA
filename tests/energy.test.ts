import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {
 bandOf,defaultTariff,tariffSchema,suggestRoles,validateEnergySettings,groupHours,summarize,imbalancePct,
 bucketStart,bucketEnd,analyzerSchema,type HourRow,type Analyzer,type Tariff,
} from '../packages/contracts/energy';
import {seedConfig} from '../packages/contracts/seed';
import type {Sample} from '../packages/contracts/model';
import {Store} from '../apps/server/src/store';
import {EnergyMeter,hourRows} from '../apps/server/src/energy';
import {workbook,zip,crc32,excelDate,colName,sheetName,type Sheet} from '../apps/server/src/xlsx';

const HOUR=3600000;
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-energy-'));

/* --- 1. bandOf ------------------------------------------------------------------------------ */
test('bandOf: default tariff 06/17/22 boundaries',()=>{
 assert.equal(bandOf(5,defaultTariff),'night');
 assert.equal(bandOf(6,defaultTariff),'day');
 assert.equal(bandOf(16,defaultTariff),'day');
 assert.equal(bandOf(17,defaultTariff),'peak');
 assert.equal(bandOf(21,defaultTariff),'peak');
 assert.equal(bandOf(22,defaultTariff),'night');
 assert.equal(bandOf(0,defaultTariff),'night');
});

/* --- 2. suggestRoles -------------------------------------------------------------------------- */
test('suggestRoles: tag codes map to the expected roles, one tag per role',()=>{
 const tags=[
  {id:'t1',code:'P_TOT',name:'Toplam Güç'},
  {id:'t2',code:'PF',name:'Güç Faktörü'},
  {id:'t3',code:'V_L1',name:'Gerilim L1'},
  {id:'t4',code:'I_L2',name:'Akım L2'},
  {id:'t5',code:'THD_V_L3',name:'THD V L3'},
  {id:'t6',code:'EA_IMP',name:'Aktif Enerji'},
 ];
 const roles=suggestRoles(tags);
 assert.equal(roles.p,'t1');
 assert.equal(roles.pf,'t2');
 assert.equal(roles.v1,'t3');
 assert.equal(roles.i2,'t4');
 assert.equal(roles.ea,'t6');
 const used=Object.values(roles);
 assert.equal(new Set(used).size,used.length,'a tag is never used for two roles');
});

// Bug: packages/contracts/energy.ts:19 ('v3' hint) matches the substring "_v_l3" inside
// "thd_v_l3" because the hint has no anchor excluding a leading "thd" segment, and in
// ENERGY_ROLES (line 28 is 'thdv3') the plain 'v3' role is tried first inside suggestRoles
// (packages/contracts/energy.ts:105-113, field loop runs role list in array order). So a tag
// coded THD_V_L3 is suggested as role 'v3' (Gerilim L3-N) instead of 'thdv3' (THD-V L3) —
// wrong physical quantity offered to the engineer.
test('suggestRoles: THD_V_L3 maps to thdv3, not v3',()=>{
 const tags=[{id:'t5',code:'THD_V_L3',name:'THD V L3'}];
 const roles=suggestRoles(tags);
 assert.equal(roles.thdv3,'t5');
 assert.equal(roles.v3,undefined);
});

/* --- 3. validateEnergySettings ----------------------------------------------------------------- */
test('validateEnergySettings: unknown tag id is rejected',()=>{
 assert.throws(()=>validateEnergySettings({analyzers:[{id:'a1',name:'A1',roles:{p:'no-such-tag'}}]},seedConfig),/etiket yapılandırmada yok|için seçilen etiket/);
});
test('validateEnergySettings: duplicate analyzer id is rejected',()=>{
 const tagId=seedConfig.tags[0].id;
 assert.throws(()=>validateEnergySettings({analyzers:[
  {id:'dup',name:'A1',roles:{p:tagId}},
  {id:'dup',name:'A2',roles:{}},
 ]},seedConfig),/tekrar ediyor/);
});
test('validateEnergySettings: unknown role key is rejected',()=>{
 const tagId=seedConfig.tags[0].id;
 assert.throws(()=>validateEnergySettings({analyzers:[{id:'a1',name:'A1',roles:{notARole:tagId}}]},seedConfig),/bilinmeyen ölçüm rolü/);
});
test('tariff refine: dayStart must be before peakStart',()=>{
 assert.throws(()=>tariffSchema.parse({dayStart:10,peakStart:5,nightStart:20}));
 assert.throws(()=>tariffSchema.parse({dayStart:10,peakStart:10,nightStart:20}),/sıralı olmalı/);
 assert.doesNotThrow(()=>tariffSchema.parse({dayStart:6,peakStart:17,nightStart:22}));
});

/* --- 4. groupHours / summarize ------------------------------------------------------------------ */
const at=(h:number)=>new Date(2026,0,15,h,0,0,0).getTime();
const tariff:Tariff={dayStart:6,peakStart:17,nightStart:22,priceDay:1,pricePeak:2,priceNight:3,currency:'TL',
 inductiveLimitPct:20,capacitiveLimitPct:15,demandMinutes:15};
const rows:HourRow[]=[
 {analyzerId:'a1',hour:at(6),ea:10,eqi:3,eqc:0,pSum:100,pN:10,pMax:12,demandMax:11,gap:0}, // day
 {analyzerId:'a1',hour:at(17),ea:20,eqi:5,eqc:0,pSum:400,pN:20,pMax:22,demandMax:25,gap:0}, // peak
 {analyzerId:'a1',hour:at(22),ea:10,eqi:4,eqc:0,pSum:40,pN:10,pMax:6,demandMax:4,gap:1}, // night, missing-data hour
];
test('groupHours: aggregates by day, bucketing kWh/cost per tariff band',()=>{
 const buckets=groupHours(rows,'day',tariff);
 assert.equal(buckets.length,1,'all three hours fall in the same calendar day');
 const b=buckets[0];
 assert.equal(b.ea,40);
 assert.deepEqual(b.byBand,{day:10,peak:20,night:10});
 assert.equal(b.cost,10*1+20*2+10*3); // 80
 assert.equal(b.demandMax,25,'largest demandMax wins');
 assert.equal(b.demandAt,at(17));
 assert.equal(b.pMax,22);
 assert.equal(b.pAvg,(100+400+40)/(10+20+10)); // 13.5
 assert.equal(b.gap,1);
});
test('summarize: per-analyzer totals, reactive % and over-limit flag depend on roles.eqi',()=>{
 const analyzer:Analyzer=analyzerSchema.parse({id:'a1',name:'A1',roles:{eqi:'tag-x'}});
 const [s]=summarize(rows,[analyzer],tariff);
 assert.equal(s.ea,40);
 assert.equal(s.eqi,12);
 assert.deepEqual(s.byBand,{day:10,peak:20,night:10});
 assert.equal(s.cost,80);
 assert.equal(s.inductivePct,12/40*100); // 30%
 assert.equal(s.inductiveOver,true,'30% > 20% limit');
 assert.equal(s.capacitivePct,null,'no eqi... capacitive role not mapped');
 assert.equal(s.capacitiveOver,false);
 assert.equal(s.demandMax,25);
 assert.equal(s.demandAt,at(17));
 assert.equal(s.pMax,22);
 assert.equal(s.pAvg,(100+400+40)/(10+20+10));
 assert.equal(s.gapHours,1);
 assert.equal(s.hours,3);
});
test('summarize: without roles.eqi/eqc, inductive/capacitive % stay null even if eqi has data',()=>{
 const analyzer:Analyzer=analyzerSchema.parse({id:'a1',name:'A1',roles:{}});
 const [s]=summarize(rows,[analyzer],tariff);
 assert.equal(s.inductivePct,null);
 assert.equal(s.inductiveOver,false);
});

/* --- imbalancePct, bucketStart/bucketEnd -------------------------------------------------------- */
test('imbalancePct: NEMA-style max deviation over average',()=>{
 assert.equal(imbalancePct([100,100,100]),0);
 assert.equal(imbalancePct([90,100,110]),10); // max dev 10, avg 100 -> 10%
 assert.equal(imbalancePct([5]),null,'needs at least two values');
 assert.equal(imbalancePct([0,0]),null,'zero average is undefined');
});
test('bucketStart/bucketEnd: hour/day/month boundaries',()=>{
 const t=new Date(2026,2,15,13,45,30,0).getTime();
 const h=bucketStart(t,'hour');
 assert.equal(new Date(h).getMinutes(),0);
 assert.equal(bucketEnd(h,'hour')-h,HOUR);
 const d=bucketStart(t,'day');
 assert.equal(new Date(d).getHours(),0);
 assert.equal(new Date(bucketEnd(d,'day')).getDate()-new Date(d).getDate(),1);
 const m=bucketStart(t,'month');
 assert.equal(new Date(m).getDate(),1);
 assert.equal(new Date(bucketEnd(m,'month')).getMonth(),new Date(m).getMonth()+1);
});

/* --- 5. EnergyMeter --------------------------------------------------------------------------- */
function meterSetup(roles:Record<string,string>){
 const store=new Store(dir());
 const analyzer:Analyzer=analyzerSchema.parse({id:'a1',name:'A1',roles});
 const settings=()=>({analyzers:[analyzer],tariff:defaultTariff});
 const samples:Record<string,Sample>={};
 const meter=new EnergyMeter(store.db,store,settings,samples);
 return {store,meter,samples,settings};
}
const sample=(value:number,at:number):Sample=>({value,quality:'good',receivedAt:at,sampledAt:at,sequence:1});
const anchor=new Date(2026,3,10,10,30,0,0).getTime(); // well inside an hour, away from any DST edge

test('EnergyMeter: first counter reading is only a baseline, no energy added',()=>{
 const {store,meter,samples}=meterSetup({ea:'tag-ea'});
 samples['tag-ea']=sample(100,anchor);
 meter.tick(anchor);
 meter.flush(anchor);
 const rows=hourRows(store.db,['a1'],anchor-HOUR,anchor+HOUR);
 assert.equal(rows.length,1);
 assert.equal(rows[0].ea,0);
 store.close();
});
test('EnergyMeter: counter delta within the current hour accumulates as ea',()=>{
 const {store,meter,samples}=meterSetup({ea:'tag-ea'});
 samples['tag-ea']=sample(100,anchor);
 meter.tick(anchor);
 samples['tag-ea']=sample(105,anchor+2000);
 meter.tick(anchor+2000);
 meter.flush(anchor+2000);
 const rows=hourRows(store.db,['a1'],anchor-HOUR,anchor+HOUR);
 assert.equal(rows.length,1);
 assert.equal(rows[0].ea,5);
 assert.equal(rows[0].gap,0);
 store.close();
});
test('EnergyMeter: a negative delta (counter reset/rollover) sets gap and adds nothing',()=>{
 const {store,meter,samples}=meterSetup({ea:'tag-ea'});
 samples['tag-ea']=sample(100,anchor);
 meter.tick(anchor);
 samples['tag-ea']=sample(95,anchor+2000); // counter went down
 meter.tick(anchor+2000);
 meter.flush(anchor+2000);
 const rows=hourRows(store.db,['a1'],anchor-HOUR,anchor+HOUR);
 assert.equal(rows.length,1);
 assert.equal(rows[0].ea,0);
 assert.equal(rows[0].gap,1);
 store.close();
});
test('EnergyMeter: a delta after a >5 minute gap spanning hours is spread proportionally, summing to the delta, and marks gap on the affected hours',()=>{
 const {store,meter,samples}=meterSetup({ea:'tag-ea'});
 const hourStart=bucketStart(anchor,'hour');
 const t1=hourStart+55*60000; // 5 minutes before this hour ends
 const t2=t1+130*60000; // 130 minutes later, 2 hour boundaries crossed
 samples['tag-ea']=sample(1000,t1);
 meter.tick(t1);
 samples['tag-ea']=sample(1130,t2); // delta = 130
 meter.tick(t2);
 meter.flush(t2);
 const rows=hourRows(store.db,['a1'],hourStart-HOUR,t2+HOUR);
 assert.ok(rows.length>=3,'delta spans several hourly buckets: '+rows.length);
 const total=rows.reduce((n,r)=>n+r.ea,0);
 assert.ok(Math.abs(total-130)<1e-6,'sum of spread ea equals the delta: '+total);
 assert.ok(rows.filter(r=>r.ea>0).every(r=>r.gap===1),'every hour that received a share is flagged incomplete');
 store.close();
});
test('EnergyMeter: without an ea role, total active power P is trapezoid-integrated into kWh (60 kW x 60 s = 1 kWh)',()=>{
 const {store,meter,samples}=meterSetup({p:'tag-p'});
 samples['tag-p']=sample(60,anchor);
 meter.tick(anchor);
 let now=anchor;
 for(let i=0;i<60;i++){now+=1000;samples['tag-p']=sample(60,now);meter.tick(now);}
 meter.flush(now);
 const rows=hourRows(store.db,['a1'],anchor-HOUR,anchor+HOUR);
 const totalEa=rows.reduce((n,r)=>n+r.ea,0);
 assert.ok(Math.abs(totalEa-1)<0.01,'≈1 kWh from 60kW over 60s: '+totalEa);
 store.close();
});
test('EnergyMeter: flush() persists rows readable via hourRows(), and a fresh meter restores counter baselines from store',()=>{
 const store=new Store(dir());
 const analyzer:Analyzer=analyzerSchema.parse({id:'a1',name:'A1',roles:{ea:'tag-ea'}});
 const settings=()=>({analyzers:[analyzer],tariff:defaultTariff});
 const samples:Record<string,Sample>={};
 const meter=new EnergyMeter(store.db,store,settings,samples);
 samples['tag-ea']=sample(50,anchor);
 meter.tick(anchor);
 samples['tag-ea']=sample(60,anchor+2000); // delta 10
 meter.tick(anchor+2000);
 meter.flush(anchor+2000);
 const rows=hourRows(store.db,['a1'],anchor-HOUR,anchor+HOUR);
 assert.equal(rows[0].ea,10,'flush() persisted the accumulated hour, readable via hourRows()');
 // New meter instance over the same store must restore the counter baseline (60), not start at 0.
 const meter2=new EnergyMeter(store.db,store,settings,samples);
 assert.equal(meter2.counters.get('a1:ea')?.value,60,'baseline restored from store meta energyCounters');
 samples['tag-ea']=sample(60,anchor+4000); // same value again -> delta 0, nothing added
 meter2.tick(anchor+4000);
 samples['tag-ea']=sample(65,anchor+6000); // delta 5 on top of restored baseline
 meter2.tick(anchor+6000);
 meter2.flush(anchor+6000);
 const rows2=hourRows(store.db,['a1'],anchor-HOUR,anchor+HOUR);
 assert.equal(rows2[0].ea,15,'10 from first meter + 5 from second, baseline correctly carried over');
 store.close();
});

/* --- 6. xlsx ------------------------------------------------------------------------------------ */
test('colName: spreadsheet column letters',()=>{
 assert.equal(colName(0),'A');
 assert.equal(colName(25),'Z');
 assert.equal(colName(26),'AA');
});
test('sheetName: truncates to 31 chars and de-duplicates',()=>{
 const taken=new Set<string>();
 const long='A'.repeat(40);
 const n1=sheetName(long,taken);
 assert.ok(n1.length<=31);
 const n2=sheetName(long,taken); // same name again must be de-duped
 assert.notEqual(n1,n2);
 assert.ok(n2.length<=31);
});
type ZipEntry={name:string;data:Buffer;crc:number};
function parseZip(buf:Buffer):ZipEntry[]{
 const entries:ZipEntry[]=[];
 let o=0;
 while(o<buf.length){
  const sig=buf.readUInt32LE(o);
  if(sig!==0x04034b50)break;
  const crc=buf.readUInt32LE(o+14)>>>0;
  const compSize=buf.readUInt32LE(o+18);
  const nameLen=buf.readUInt16LE(o+26);
  const extraLen=buf.readUInt16LE(o+28);
  const nameStart=o+30;
  const name=buf.toString('utf8',nameStart,nameStart+nameLen);
  const dataStart=nameStart+nameLen+extraLen;
  const comp=buf.subarray(dataStart,dataStart+compSize);
  const data=inflateRawSync(comp);
  entries.push({name,data,crc});
  o=dataStart+compSize;
 }
 return entries;
}
test('workbook(): valid zip, expected entries present, crc32 matches inflated data',()=>{
 const sheets:Sheet[]=[{name:'Test',rows:[[{v:'a & b <c> "d"',s:'text'}]]}]; // needs XML escaping
 const buf=workbook(sheets);
 assert.equal(buf.subarray(0,2).toString(),'PK');
 const entries=parseZip(buf);
 const names=entries.map(e=>e.name);
 assert.ok(names.includes('[Content_Types].xml'));
 assert.ok(names.includes('xl/workbook.xml'));
 assert.ok(names.includes('xl/worksheets/sheet1.xml'));
 for(const e of entries)assert.equal(crc32(e.data),e.crc,e.name+' crc32 must match its inflated bytes');
 const sheet1=entries.find(e=>e.name==='xl/worksheets/sheet1.xml')!.data.toString('utf8');
 assert.ok(sheet1.includes('&amp;')&&sheet1.includes('&lt;')&&sheet1.includes('&gt;')&&sheet1.includes('&quot;'),'special characters are XML-escaped: '+sheet1);
 assert.ok(!/[^&]a & b/.test(sheet1)||true); // sanity no-op guard; real check above
});
test('zip()/crc32(): round-trips arbitrary bytes',()=>{
 const data=Buffer.from('hello enerji '+'x'.repeat(500));
 const buf=zip([['a.txt',data]]);
 const entries=parseZip(buf);
 assert.equal(entries.length,1);
 assert.deepEqual(entries[0].data,data);
 assert.equal(crc32(data),entries[0].crc);
});
test('excelDate(): local wall-clock time converts to the 1900 serial date system',()=>{
 const ms=new Date(2026,0,1,0,0,0,0).getTime(); // local midnight 2026-01-01
 const serial=excelDate(ms);
 assert.ok(Math.abs(serial-46023)<1,'2026-01-01 is serial ~46023: '+serial);
});

/* --- 7. HTTP ------------------------------------------------------------------------------------ */
let createServer:(()=>Promise<any>)|null=null;
async function serverModule(){
 if(!createServer){process.env.SCADA_NO_LISTEN='1';createServer=(await import('../apps/server/src/index')).createServer as any;}
 return createServer!;
}
const headers={'content-type':'application/json','x-scada-request':'1'};
async function boot(){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'scada-energy-http-'));
 process.env.SCADA_DATA=d;
 const app=await (await serverModule())() as any;
 const setup=await app.inject({method:'POST',url:'/api/setup',headers,payload:{username:'admin',password:'Test-parola-2026!'},remoteAddress:'127.0.0.1'});
 assert.equal(setup.statusCode,200);
 const login=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'admin',password:'Test-parola-2026!'}});
 assert.equal(login.statusCode,200);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 return {app,cookie,dir:d};
}
test('HTTP: GET /api/energy returns empty settings at revision 0',async()=>{
 const {app,cookie}=await boot();
 const r=await app.inject({method:'GET',url:'/api/energy',headers:{...headers,cookie}});
 assert.equal(r.statusCode,200);
 assert.deepEqual(r.json().settings.analyzers,[]);
 assert.equal(r.json().revision,0);
 await app.scadaClose();
});
test('HTTP: PUT /api/energy with the wrong revision is rejected with 409',async()=>{
 const {app,cookie}=await boot();
 const r=await app.inject({method:'PUT',url:'/api/energy',headers:{...headers,cookie},payload:{settings:{analyzers:[]},revision:7}});
 assert.equal(r.statusCode,409);
 await app.scadaClose();
});
test('HTTP: PUT /api/energy with an analyzer mapped to an existing tag advances revision to 1',async()=>{
 const {app,cookie}=await boot();
 const project=await app.inject({method:'GET',url:'/api/project',headers:{...headers,cookie}});
 const tagId=project.json().config.tags[0].id;
 const r=await app.inject({method:'PUT',url:'/api/energy',headers:{...headers,cookie},
  payload:{settings:{analyzers:[{id:'an1',name:'Pano 1',roles:{p:tagId}}]},revision:0}});
 assert.equal(r.statusCode,200,r.body);
 assert.equal(r.json().revision,1);
 assert.equal(r.json().settings.analyzers[0].roles.p,tagId);
 await app.scadaClose();
});
test('HTTP: GET /api/energy/consumption?group=day returns buckets and summaries',async()=>{
 const {app,cookie}=await boot();
 const project=await app.inject({method:'GET',url:'/api/project',headers:{...headers,cookie}});
 const tagId=project.json().config.tags[0].id;
 await app.inject({method:'PUT',url:'/api/energy',headers:{...headers,cookie},
  payload:{settings:{analyzers:[{id:'an1',name:'Pano 1',roles:{p:tagId}}]},revision:0}});
 const to=Date.now(),from=to-24*HOUR;
 const r=await app.inject({method:'GET',url:`/api/energy/consumption?from=${from}&to=${to}&group=day`,headers:{...headers,cookie}});
 assert.equal(r.statusCode,200,r.body);
 const body=r.json();
 assert.ok(Array.isArray(body.buckets));
 assert.ok(Array.isArray(body.summaries));
 assert.equal(body.summaries[0].analyzerId,'an1');
 assert.ok(body.byAnalyzer.an1);
 await app.scadaClose();
});
test('HTTP: GET /api/energy/export returns an xlsx attachment starting with PK',async()=>{
 const {app,cookie}=await boot();
 const project=await app.inject({method:'GET',url:'/api/project',headers:{...headers,cookie}});
 const tagId=project.json().config.tags[0].id;
 await app.inject({method:'PUT',url:'/api/energy',headers:{...headers,cookie},
  payload:{settings:{analyzers:[{id:'an1',name:'Pano 1',roles:{p:tagId}}]},revision:0}});
 const to=Date.now(),from=to-24*HOUR;
 const r=await app.inject({method:'GET',url:`/api/energy/export?from=${from}&to=${to}`,headers:{...headers,cookie}});
 assert.equal(r.statusCode,200,r.body.toString().slice(0,300));
 assert.match(String(r.headers['content-type']),/spreadsheetml/);
 const buf=Buffer.isBuffer(r.rawPayload)?r.rawPayload:Buffer.from(r.body,'binary');
 assert.equal(buf.subarray(0,2).toString(),'PK');
 await app.scadaClose();
});
test('HTTP: unauthenticated request to /api/energy is rejected with 401',async()=>{
 const {app}=await boot();
 const r=await app.inject({method:'GET',url:'/api/energy',headers});
 assert.equal(r.statusCode,401);
 await app.scadaClose();
});
test('HTTP: viewer can read /api/energy but cannot write it (edit is admin/designer only)',async()=>{
 const {app,cookie}=await boot();
 await app.inject({method:'POST',url:'/api/users',headers:{...headers,cookie},payload:{username:'izleyici',password:'Test-parola-2026!',role:'viewer'}});
 const login=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'izleyici',password:'Test-parola-2026!'}});
 const viewerCookie=String(login.headers['set-cookie']).split(';')[0];
 const read=await app.inject({method:'GET',url:'/api/energy',headers:{...headers,cookie:viewerCookie}});
 assert.equal(read.statusCode,200,'viewer has read access');
 const write=await app.inject({method:'PUT',url:'/api/energy',headers:{...headers,cookie:viewerCookie},payload:{settings:{analyzers:[]},revision:0}});
 assert.equal(write.statusCode,403,'viewer cannot write settings');
 await app.scadaClose();
});
