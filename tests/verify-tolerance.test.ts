import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../apps/server/src/store';
import {Commands} from '../apps/server/src/commands';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {decodeRegisters,encodeValue,feedbackMatches,newWidget,validateConfig,verifyToleranceOf,
 type Config,type Sample,type ScreenRecord,type Tag,type User,type Widget} from '../packages/contracts/model';
/* B61: float32 yolunda geri okuma yazilan degere tanim geregi esit olamaz —
 * deger float32'ye yuvarlanir, geri okunurken toPrecision(15) ile acilir.
 * Kati esitlik burada dogru calisan bir yazmayi 'unverified' gosterir ve
 * finish() hedefi 'unsettled' kilidine alir. Tolerans etiket tanimindan
 * turer: null = otomatik (temsil hatasi kadar), sayi = muhendisin karari. */
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-tol-'));
const operator=(name:string):User=>({id:name,username:name,role:'operator'});

function setup(tolerance:number|null,dataType:Tag['dataType']='float32',scale=1){
 const db=new Store(directory());
 const config=structuredClone(seedConfig) as Config;
 const tag:Tag={...config.tags[0],id:'tag-setpoint',code:'D200',name:'Sicaklik setpoint',
  area:'holding-register',address:4300,dataType,access:'readwrite',unit:'°C',
  min:0,max:200,scale,offset:0,bit:null,verifyTolerance:tolerance};
 config.tags.push(tag);
 const command={...config.commands[0],id:'cmd-setpoint',name:'Setpoint yaz',
  tagIds:[tag.id],feedbackTagIds:[tag.id],approval:'none' as const,risk:'normal' as const};
 config.commands.push(command);
 validateConfig(config);
 const samples:Record<string,Sample>={};
 for(const t of config.tags)samples[t.id]={value:t.dataType==='bool'?false:0,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1};
 const commands=new Commands(db,samples,()=>config,()=>true,async()=>{});
 const widget={...newWidget('numeric-input',40,40),commandId:command.id,tagId:tag.id} as Widget;
 const screen={...structuredClone(seedScreen),widgets:[widget]};
 const record:ScreenRecord={id:screen.id,name:screen.name,version:1,publishedVersion:1,draft:screen,published:screen};
 return {db,config,tag,command,commands,samples,screen:record};
}

/** Sahanin gercek yolu: yaz -> register -> geri oku. Hicbir yerde elle sayi uydurulmuyor. */
const roundTrip=(tag:Tag,value:number)=>decodeRegisters(encodeValue(value,tag),tag);

async function send(s:ReturnType<typeof setup>,value:number){
 const id=randomUUID();
 s.commands.request({id,commandId:s.command.id,value,screenId:s.screen.id,screenVersion:1},operator('op'),s.screen);
 await new Promise(r=>setTimeout(r,10));
 const readback=roundTrip(s.tag,value),at=Date.now()+1;
 s.samples[s.tag.id]={value:readback,quality:'good',receivedAt:at,sampledAt:at,sequence:2};
 s.commands.tick();
 return {status:s.db.command(id)?.status,readback};
}

test('float32 setpoint geri okumasi otomatik toleransla dogrulanir',async()=>{
 const s=setup(null);
 for(const value of [37.2,1.1,0.1,12.34,3.7,25.5,50,100.75]){
  const {status,readback}=await send(s,value);
  assert.equal(status,'verified',`${value} yazildi, ${readback} okundu, dogrulanmadi`);
 }
 // Kilit olusmamali: dogrulanan komut hedefi 'unsettled' birakmaz.
 assert.equal(s.commands.unsettled.size,0);
 s.db.close();
});

test('katı esitlik olsaydi ondalik setpointler gecmezdi — tolerans gercekten gerekli',()=>{
 const s=setup(null);
 const sapanlar=[37.2,1.1,0.1,12.34,3.7].filter(v=>roundTrip(s.tag,v)!==v);
 assert.equal(sapanlar.length,5,'float32 round-trip beklenenden hatasiz — test varsayimi gecersiz');
 s.db.close();
});

test('tolerans disina cikan geri okuma dogrulanmaz ve hedefi kilitler',async()=>{
 const s=setup(null);
 const id=randomUUID();
 s.commands.request({id,commandId:s.command.id,value:37.2,screenId:s.screen.id,screenVersion:1},operator('op'),s.screen);
 await new Promise(r=>setTimeout(r,10));
 const at=Date.now()+1;
 s.samples[s.tag.id]={value:37.5,quality:'good',receivedAt:at,sampledAt:at,sequence:2};// saha baska degerde
 s.commands.tick();
 assert.equal(s.db.command(id)?.status,'acknowledged');// henuz zaman asimi yok, ama dogrulanmadi
 s.db.close();
});

test('tam sayi tiplerinde tolerans otomatik olarak sifirdir — esitlik korunur',async()=>{
 const s=setup(null,'uint16');
 assert.equal(verifyToleranceOf(s.tag,37),0);
 const {status}=await send(s,37);
 assert.equal(status,'verified');
 assert.ok(!feedbackMatches(s.tag,37,38),'tam sayida 1 birim sapma dogrulanmamali');
 s.db.close();
});

test('elle girilen tolerans otomatik payi ezer',()=>{
 const s=setup(0.5);
 assert.equal(verifyToleranceOf(s.tag,37.2),0.5);
 assert.ok(feedbackMatches(s.tag,37.2,37.65));
 assert.ok(!feedbackMatches(s.tag,37.2,37.8));
 s.db.close();
});

test('bool etiket toleransi ve asiri genis pay yapilandirmada reddedilir',()=>{
 const c=structuredClone(seedConfig) as Config;
 const digital=c.tags.find(t=>t.dataType==='bool')!;
 digital.verifyTolerance=1;
 assert.throws(()=>validateConfig(c),/dijital etikette doğrulama toleransı/);
 const c2=structuredClone(seedConfig) as Config;
 const analog:Tag={...c2.tags[0],id:'tag-wide',code:'D300',name:'Genis',area:'holding-register',
  address:4400,dataType:'float32',access:'readwrite',min:0,max:100,scale:1,offset:0,bit:null,verifyTolerance:60};
 c2.tags.push(analog);
 assert.throws(()=>validateConfig(c2),/çalışma aralığının yarısını/);
});

test('bool geri bildirim toleranstan etkilenmez',()=>{
 const c=structuredClone(seedConfig) as Config;
 const digital=c.tags.find(t=>t.dataType==='bool')!;
 assert.ok(feedbackMatches(digital,true,true));
 assert.ok(!feedbackMatches(digital,true,false));
});

test('surum 8 gocu eski etiketlere acik null yazar',()=>{
 const dir=directory();
 let db=new Store(dir);
 const c=db.config() as any;
 for(const t of c.tags)delete t.verifyTolerance;
 db.set('config',c);
 db.db.exec('PRAGMA user_version=7');
 db.close();
 db=new Store(dir);
 assert.ok(db.config().tags.every(t=>t.verifyTolerance===null));
 // Zincir 8'den sonra da ilerler (9: enerji tablosu); goc guncel surumde biter.
 assert.equal(Number((db.db.prepare('PRAGMA user_version').get() as any).user_version),Store.SCHEMA_VERSION);
 db.close();
});

test('etiket tanimi yoksa tolerans uygulanmaz — gevsetme sessizce olmaz',()=>{
 assert.ok(!feedbackMatches(undefined,37.2,37.2000007629395));
 assert.ok(feedbackMatches(undefined,37.2,37.2));
});
