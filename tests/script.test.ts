import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseScript,checkScript,type TagRef} from '../packages/contracts/script';
import {ScriptRun,ScriptStopped,type ScriptHost} from '../apps/server/src/scriptRunner';
import {Store} from '../apps/server/src/store';
import {Commands} from '../apps/server/src/commands';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {validateConfig,validateScreen,type Config,type Sample,type ScreenRecord,type User} from '../packages/contracts/model';

const refs:TagRef[]=[
 {id:'x0',code:'X0',deviceId:'d1',access:'read',dataType:'bool',writable:false},
 {id:'y0',code:'Y0',deviceId:'d1',access:'readwrite',dataType:'bool',writable:true},
 {id:'y1',code:'Y1',deviceId:'d1',access:'readwrite',dataType:'bool',writable:true},
 {id:'d100',code:'D100',deviceId:'d1',access:'readwrite',dataType:'int16',writable:true},
 {id:'m0a',code:'M0',deviceId:'d1',access:'readwrite',dataType:'bool',writable:true},
 {id:'m0b',code:'M0',deviceId:'d2',access:'readwrite',dataType:'bool',writable:true},
];
const devs=[{id:'d1',code:'DVP'},{id:'d2',code:'PLC2'}];
const errs=(src:string)=>checkScript(src,refs,devs).errors.map(e=>e.line+':'+e.message);

test('ayrıştırıcı: C benzeri sözdizimi, yorumlar, öncelik', () => {
 const ast=parseScript('// yorum\nint n = 1 + 2 * 3; /* blok */ if (n >= 7 && !false) { n += 1; } else n = 0;');
 assert.equal(ast.length,2);
 assert.equal(ast[0].k,'decl');
 const d=ast[0] as any;assert.equal(d.init.op,'+');assert.equal(d.init.b.op,'*');
});

test('sözdizimi hataları satır numarasıyla, Türkçe', () => {
 assert.match(errs('if (read("X0") { }')[0],/^1:"\)" bekleniyordu/);
 assert.match(errs('write("Y0", 1)\nwait(5);')[0],/^1:Satır sonunda ";" eksik/);
 assert.match(errs('write("Y0", 1) wait(5);')[0],/^1:";" bekleniyordu, "wait"/);
 assert.match(errs('if (a & b) {}')[0],/"&&" kullanın/);
 assert.match(errs('{ write("Y0",1);')[0],/"\}" eksik/);
 assert.match(errs('"abc')[0],/Metin kapanmamış/);
});

test('statik denetim: etiket çözümü, yazılabilirlik, belirsiz ad, tanımsız değişken', () => {
 assert.deepEqual(errs('if (read("X0")) write("Y0", 1);'),[]);
 assert.match(errs('write("X0", 1);')[0],/yazılabilir değil \(salt okuma/);
 assert.match(errs('write("YOK", 1);')[0],/Etiket bulunamadı: "YOK"/);
 assert.match(errs('write("M0", 1);')[0],/birden çok cihazda.*"DVP\.M0" ya da "PLC2\.M0"/);
 assert.deepEqual(errs('write("PLC2.M0", 1);'),[]);
 assert.match(errs('x = 1;')[0],/tanımlı değil/);
 assert.match(errs('if (X0) write("Y0",1);')[0],/read\("X0"\)/);
 assert.match(errs('write(tag, 1);')[0],/sabit metin/);
 assert.match(errs('foo();')[0],/Bilinmeyen fonksiyon/);
 assert.match(errs('wait(5000000);')[0],/1 saat/);
 assert.match(errs('pulse("D100", 100);')[0],/yalnız dijital/);
 assert.match(errs('read("X0");\nint input = 2;')[0],/ayrılmış/);
 const c=checkScript('if (holdFor(read("X0"), 5000)) pulse("Y1", 1000); write("D100", 5);',refs,devs);
 assert.deepEqual(c.reads,['x0']);assert.deepEqual(c.writes.sort(),['d100','y1']);
 assert.ok(checkScript('while (true) { write("Y0",1); }',refs,devs).warnings.some(w=>/Döngüde bekleme yok/.test(w.message)));
 assert.ok(checkScript('wait(5);write("Y0",1);',refs,devs).warnings.some(w=>/Saniye mi/.test(w.message)));
});

// --- Yorumlayıcı: sahte saha ---------------------------------------------------
function host(values:Record<string,boolean|number>,opts:{failWrite?:string}={}){
 const writes:[string,boolean|number][]=[],logs:string[]=[];
 const h:ScriptHost={
  resolve:n=>refs.find(r=>r.code===n||r.deviceId+'.'+r.code===n)!.id,
  read:id=>{if(!(id in values))throw Error(id+' verisi güncel değil');return values[id];},
  write:async(id,v)=>{if(opts.failWrite===id)throw Error('köprü yanıtı yok');writes.push([id,v]);values[id]=v;},
  isBool:id=>refs.find(r=>r.id===id)!.dataType==='bool',
  log:t=>logs.push(t),
 };
 return {h,writes,logs,values};
}
const run=(src:string,h:ScriptHost,input:boolean|number=true,maxRunMs=5000)=>new ScriptRun(checkScript(src,refs,devs).ast!,h,input,maxRunMs);

test('yorumlayıcı: if/else, sayaç döngüsü, 0/1 → dijital, input', async () => {
 const f=host({x0:true,d100:0});
 await run('if (read("X0")) { write("Y0", 1); } else write("Y0", 0);\nint i = 0; while (i < 3) { i += 1; }\nwrite("D100", i * 10 + input);',f.h,2).run();
 assert.deepEqual(f.writes,[['y0',true],['d100',32]]);
});

test('wait ve pulse gerçekten bekler; holdFor kesintide false döner', async () => {
 const f=host({x0:true});
 const t0=Date.now();
 await run('pulse("Y0", 120);',f.h).run();
 assert.ok(Date.now()-t0>=110,'pulse süre kadar açık kalır');
 assert.deepEqual(f.writes,[['y0',true],['y0',false]]);
 const g=host({x0:true});
 setTimeout(()=>{g.values.x0=false;},150);
 await run('if (holdFor(read("X0"), 600)) write("Y1", 1); else write("Y1", 0);',g.h).run();
 assert.deepEqual(g.writes,[['y1',false]],'sinyal 600 ms dolmadan düştü');
 const k=host({x0:false});
 setTimeout(()=>{k.values.x0=true;},120);
 await run('if (waitUntil(read("X0"), 2000)) write("Y1", 1);',k.h).run();
 assert.deepEqual(k.writes,[['y1',true]]);
});

test('durdurma bekleyen wait\'i hemen keser; süre sınırı ve adım sınırı hata verir', async () => {
 const f=host({});
 const r=run('write("Y0",1); wait(60000); write("Y0",0);',f.h);
 const p=r.run();
 setTimeout(()=>r.abort('Durduruldu (op1).'),50);
 const t0=Date.now();
 await assert.rejects(p,(e:unknown)=>e instanceof ScriptStopped&&/Durduruldu/.test((e as Error).message));
 assert.ok(Date.now()-t0<1000);
 assert.deepEqual(f.writes,[['y0',true]],'durdurmadan sonra script yazmaz');
 await assert.rejects(run('wait(60000);',host({}).h,true,150).run(),/Süre sınırı/);
 await assert.rejects(run('int i=0; while (true) { i += 1; }',host({}).h).run(),/Adım sınırı/);
 await assert.rejects(run('if (read("X0")) write("Y0",1);',host({}).h).run(),/güncel değil/);
 await assert.rejects(run('stop("Kapı açık");',host({}).h).run(),(e:unknown)=>e instanceof ScriptStopped&&(e as Error).message==='Kapı açık');
 await assert.rejects(run('write("D100", 1 / 0);',host({}).h).run(),/Sıfıra bölme/);
});

// --- Commands entegrasyonu: tohum yapılandırmasındaki ilk komut scripte çevrilir ------
function setup(script:string,opts:{failSafe?:boolean}={}){
 const db=new Store(fs.mkdtempSync(path.join(os.tmpdir(),'scada-script-')));
 const config=structuredClone(seedConfig) as Config;
 const command=config.commands[0];
 const target=config.tags.find(t=>t.id===command.tagIds[0])!;
 const src=script.replaceAll('$T',target.code);
 const chk=checkScript(src,config.tags.map(t=>({id:t.id,code:t.code,deviceId:t.deviceId,access:t.access,dataType:t.dataType,writable:t.access==='readwrite'})),config.devices);
 assert.ok(chk.ok,JSON.stringify(chk.errors));
 Object.assign(command,{kind:'script',script:src,tagIds:chk.writes,feedbackTagIds:[],safeWrites:[{tagId:target.id,value:false}],maxRunMs:10000});
 const samples:Record<string,Sample>={};
 for(const tag of config.tags)samples[tag.id]={value:tag.dataType==='bool'?false:0,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1};
 const writes:{tagId:string;value:boolean|number;id:string}[]=[];
 let up=true;
 const commands=new Commands(db,samples,()=>config,()=>up,async(tagId,value,id)=>{if(opts.failSafe&&id.includes('-safe-'))throw Error('köprü yok');writes.push({tagId,value,id});});
 const screen:ScreenRecord={id:seedScreen.id,name:seedScreen.name,version:1,publishedVersion:1,draft:seedScreen,published:seedScreen};
 return {db,config,command,target,commands,screen,writes,samples,down:()=>{up=false;}};
}
const op:User={id:'op1',username:'op1',role:'operator'};
const start=(s:ReturnType<typeof setup>)=>s.commands.request({id:randomUUID(),commandId:s.command.id,value:true,screenId:s.screen.id,screenVersion:1},op,s.screen);
const settle=(ms=50)=>new Promise(r=>setTimeout(r,ms));

test('script komutu: kayıt denetimi hedefleri ve güvenli durumu zorunlu tutar', () => {
 const s=setup('write("$T", 1); wait(100); write("$T", 0);');
 assert.doesNotThrow(()=>validateConfig(s.config));
 const noSafe=structuredClone(s.config);noSafe.commands[0].safeWrites=[];
 assert.throws(()=>validateConfig(noSafe),/güvenli durum seçin/);
 const drift=structuredClone(s.config);drift.commands[0].tagIds=[];
 assert.throws(()=>validateConfig(drift),/scriptle uyuşmuyor/);
 const bad=structuredClone(s.config);bad.commands[0].script='write("$T" 1);';
 assert.throws(()=>validateConfig(bad),/script satır 1/);
 // Ekranda script komutu çek-bas düğmesine bağlanamaz.
 const scr=structuredClone(seedScreen);const w=scr.widgets.find(x=>x.commandId===s.command.id)!;
 w.action='momentary';
 assert.throws(()=>validateScreen(scr,s.config),/script komutu yalnız/);
 s.db.close();
});

test('script komutu çalışır, tamamlanır; aynı script ikinci kez başlatılamaz', async () => {
 const s=setup('write("$T", 1); wait(80); write("$T", 0); log("bitti", input);');
 const e=start(s);
 assert.equal(e.status,'running');
 assert.throws(()=>start(s),/zaten çalışıyor|komut sonucu bekleniyor/);
 await settle(250);
 const done=s.db.command(e.id)!;
 assert.equal(done.status,'completed');
 assert.deepEqual(s.writes.map(w=>w.value),[true,false]);
 assert.ok(done.log!.some(l=>l.text==='bitti true'));
 assert.equal(s.commands.pending.size,0);
});

test('durdurma: güvenli durum yazılır, durum "aborted"', async () => {
 const s=setup('write("$T", 1); wait(60000);');
 const e=start(s);
 await settle();
 s.commands.stop(e.id,op);
 await settle();
 const done=s.db.command(e.id)!;
 assert.equal(done.status,'aborted');
 assert.equal(done.stoppedBy,'op1');
 assert.deepEqual(s.writes.map(w=>[w.value,w.id.includes('-safe-')]),[[true,false],[false,true]]);
 assert.throws(()=>s.commands.stop(e.id,op),/bulunamadı/);
});

test('haberleşme koparsa ya da izin koşulu kalkarsa script durur; güvenli durum yazılamazsa "uncertain" ve kilit', async () => {
 const s=setup('write("$T", 1); wait(60000);',{failSafe:true});
 const e=start(s);
 await settle();
 s.down();s.commands.tick();
 await settle();
 const done=s.db.command(e.id)!;
 assert.equal(done.status,'uncertain');
 assert.match(done.message,/Haberleşme koptu.*yazılamadı/);
 assert.ok(s.commands.unsettled.has(s.target.id),'hedef yeni okuma gelene kadar kilitli');

 const p=setup('write("$T", 1); wait(60000);');
 const perm=p.config.tags.find(t=>t.dataType==='bool'&&t.id!==p.target.id)!;
 p.command.permissives=[{tagId:perm.id,expected:false,label:'Kapı kapalı'}];
 const e2=start(p);
 await settle();
 p.samples[perm.id]={...p.samples[perm.id],value:true};
 p.commands.tick();
 await settle();
 const d2=p.db.command(e2.id)!;
 assert.equal(d2.status,'aborted');
 assert.match(d2.message,/İzin koşulu kalktı — Kapı kapalı/);
});

test('sunucu kapanışı scripti durdurur ve güvenli durumu bekler', async () => {
 const s=setup('write("$T", 1); wait(60000);');
 const e=start(s);
 await settle();
 await s.commands.shutdown(2000);
 assert.equal(s.db.command(e.id)!.status,'aborted');
 assert.ok(s.writes.some(w=>w.id.includes('-safe-')&&w.value===false));
});

test('yeniden başlatmada yarım kalan script: haberleşme gelince güvenli durum bir kez yazılır', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-script-rec-'));
 const s=setup('write("$T", 1); wait(60000);');
 const db1=new Store(dir);
 db1.saveCommand({id:'run-1',commandId:s.command.id,name:'x',user:'op1',value:true,status:'running',createdAt:Date.now(),updatedAt:Date.now(),message:'',steps:[],configRevision:s.config.revision,screenId:'',screenVersion:1,kind:'script',log:[]});
 db1.close();
 const db2=new Store(dir);
 const stored=db2.command('run-1')!;
 assert.equal(stored.status,'uncertain');assert.equal(stored.recover,true);
 const writes:string[]=[];
 const c=new Commands(db2,s.samples,()=>s.config,()=>true,async(tagId,value,id)=>{writes.push(id+':'+value);});
 c.tick();c.tick();
 await settle();
 assert.deepEqual(writes,['run-1-safe-0:false']);
 assert.equal(db2.command('run-1')!.recover,false);
 db2.close();
});
