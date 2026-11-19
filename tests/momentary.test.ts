import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../apps/server/src/store';
import {Commands} from '../apps/server/src/commands';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {validateScreen,widgetSchema,newWidget,type Config,type Sample,type ScreenRecord,type User,type Widget} from '../packages/contracts/model';
/* G44: "cek bas" (momentary) ve "darbe" (pulse). Ikisi de once true sonra
 * false yazar; bu yuzden sunucunun ayni nesneden iki degeri de kabul etmesi
 * gerekir. Yalniz "Ac" kabul etseydi birakma yazisi reddedilir ve cikis
 * sahada acik kalirdi. */
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-momentary-'));
function setup(action:Widget['action']){
 const db=new Store(directory());
 const config=structuredClone(seedConfig) as Config;
 const command=config.commands.find(c=>c.tagIds.every(id=>config.tags.find(t=>t.id===id)?.dataType==='bool'))!;
 command.approval='none';command.risk='normal';
 const samples:Record<string,Sample>={};
 for(const tag of config.tags)samples[tag.id]={value:tag.dataType==='bool'?false:0,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1};
 const writes:{tagId:string;value:boolean|number}[]=[];
 const commands=new Commands(db,samples,()=>config,()=>true,async(tagId,value)=>{writes.push({tagId,value});});
 const button={...newWidget('push-button',40,40),commandId:command.id,action,tagId:command.feedbackTagIds[0]||''} as Widget;
 const screen={...structuredClone(seedScreen),widgets:[button]};
 const record:ScreenRecord={id:screen.id,name:screen.name,version:1,publishedVersion:1,draft:screen,published:screen};
 return {db,config,command,commands,screen:record,writes};
}
const operator=(name:string):User=>({id:name,username:name,role:'operator'});

test('cek bas nesnesi hem basma (true) hem birakma (false) yazisini gonderebilir',async()=>{
 const s=setup('momentary');
 const press=s.commands.request({id:randomUUID(),commandId:s.command.id,value:true,screenId:s.screen.id,screenVersion:1},operator('op1'),s.screen);
 assert.notEqual(press.status,'awaiting','onaysız komut beklemez');
 assert.ok(s.writes.some(w=>w.value===true),'basma sahaya true yazar');
 for(const p of [...s.commands.pending.keys()])s.commands.pending.delete(p);
 const release=s.commands.request({id:randomUUID(),commandId:s.command.id,value:false,screenId:s.screen.id,screenVersion:1},operator('op1'),s.screen);
 assert.notEqual(release.status,'awaiting');
 assert.ok(s.writes.some(w=>w.value===false),'bırakma sahaya false yazar');
 await new Promise(r=>setTimeout(r,60));// yazma geri cagrisi asenkron; db kapanmadan once bitsin
 s.db.close();
});

test('darbe nesnesi de iki degeri gonderebilir',async()=>{
 const s=setup('pulse');
 s.commands.request({id:randomUUID(),commandId:s.command.id,value:true,screenId:s.screen.id,screenVersion:1},operator('op1'),s.screen);
 for(const p of [...s.commands.pending.keys()])s.commands.pending.delete(p);
 s.commands.request({id:randomUUID(),commandId:s.command.id,value:false,screenId:s.screen.id,screenVersion:1},operator('op1'),s.screen);
 assert.deepEqual([s.writes.some(w=>w.value===true),s.writes.some(w=>w.value===false)],[true,true]);
 await new Promise(r=>setTimeout(r,60));// yazma geri cagrisi asenkron; db kapanmadan once bitsin
 s.db.close();
});

test('duz "Ac" butonu hala yalniz true gonderebilir — gevseme yok',async()=>{
 const s=setup('on');
 assert.throws(()=>s.commands.request({id:randomUUID(),commandId:s.command.id,value:false,screenId:s.screen.id,screenVersion:1},operator('op1'),s.screen),
  /yayınlanmış ekranda tanımlı değil/,'yayındaki nesne bu değeri yazmıyorsa istek reddedilir');
 await new Promise(r=>setTimeout(r,60));// yazma geri cagrisi asenkron; db kapanmadan once bitsin
 s.db.close();
});

test('cek bas sayisal yazma komutuna baglanamaz',()=>{
 const config=structuredClone(seedConfig) as Config;
 const analog=config.commands.find(c=>c.tagIds.some(id=>config.tags.find(t=>t.id===id)?.dataType!=='bool'));
 if(!analog)return;// tohum projede sayisal komut yoksa kural zaten denenemez
 const button={...newWidget('push-button',40,40),commandId:analog.id,action:'momentary'} as Widget;
 assert.throws(()=>validateScreen({...structuredClone(seedScreen),widgets:[button]},config),/çek bas \/ darbe için dijital yazma komutu/);
});

test('pulseMs sinirlari semada tutulur; varsayilan 500 ms',()=>{
 const base=newWidget('push-button',0,0);
 assert.equal(base.pulseMs,500,'varsayılan darbe süresi');
 assert.throws(()=>widgetSchema.parse({...base,pulseMs:10}),/pulseMs|50/,'çok kısa darbe reddedilir');
 assert.throws(()=>widgetSchema.parse({...base,pulseMs:600000}),/pulseMs|60000/,'çok uzun darbe reddedilir');
 assert.equal(widgetSchema.parse({...base,pulseMs:10000}).pulseMs,10000);
});
