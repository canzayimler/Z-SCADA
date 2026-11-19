import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../apps/server/src/store';
import {Commands} from '../apps/server/src/commands';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {validateScreen,writeRangeOf,newWidget,type Config,type Sample,type ScreenRecord,type User,type Widget} from '../packages/contracts/model';
/* G45: analog yazma araligi nesne bazinda daraltilabilir. Kisitlama yalniz
 * giris penceresinde kalsaydi sus payi olurdu: baska bir istemci ya da eski
 * sekme araligin disina yazabilirdi. Sunucu ayni sinirlari zorlar. */
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-range-'));
function setup(writeMin:number|null,writeMax:number|null){
 const db=new Store(directory());
 const config=structuredClone(seedConfig) as Config;
 let command=config.commands.find(c=>c.tagIds.every(id=>config.tags.find(t=>t.id===id)?.dataType!=='bool'));
 let tag=command&&config.tags.find(t=>t.id===command!.tagIds[0]);
 if(!command||!tag){
  tag={...config.tags[0],id:'tag-analog',code:'D100',name:'Analog hedef',dataType:'uint16',address:4200,access:'readwrite',unit:'°C',min:0,max:200,scale:1};
  config.tags.push(tag);
  command={...config.commands[0],id:'cmd-analog',name:'Analog yaz',tagIds:[tag.id],feedbackTagIds:[tag.id],approval:'none',risk:'normal'};
  config.commands.push(command);
 }
 command.approval='none';command.risk='normal';
 const samples:Record<string,Sample>={};
 for(const t of config.tags)samples[t.id]={value:t.dataType==='bool'?false:0,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1};
 const writes:{tagId:string;value:boolean|number}[]=[];
 const commands=new Commands(db,samples,()=>config,()=>true,async(tagId,value)=>{writes.push({tagId,value});});
 const widget={...newWidget('numeric-input',40,40),commandId:command.id,tagId:tag.id,writeMin,writeMax} as Widget;
 const screen={...structuredClone(seedScreen),widgets:[widget]};
 const record:ScreenRecord={id:screen.id,name:screen.name,version:1,publishedVersion:1,draft:screen,published:screen};
 return {db,config,command,commands,screen:record,writes,widget,tag};
}
const operator=(name:string):User=>({id:name,username:name,role:'operator'});

test('aralik disi deger sunucuda reddedilir, sahaya yazilmaz',async()=>{
 const s=setup(0,100);
 assert.throws(()=>s.commands.request({id:randomUUID(),commandId:s.command.id,value:150,screenId:s.screen.id,screenVersion:1},operator('op1'),s.screen),
  /yazma aralığı 0 – 100/,'aralık dışı değer reddedilir ve sınırı söyler');
 assert.equal(s.writes.length,0,'reddedilen istek sahaya hiçbir şey yazmaz');
 await new Promise(r=>setTimeout(r,60));
 s.db.close();
});

test('aralik icindeki deger normal gecer',async()=>{
 const s=setup(0,100);
 const e=s.commands.request({id:randomUUID(),commandId:s.command.id,value:60,screenId:s.screen.id,screenVersion:1},operator('op1'),s.screen);
 assert.notEqual(e.status,'awaiting');
 await new Promise(r=>setTimeout(r,60));
 assert.ok(s.writes.some(w=>w.value===60),'aralık içi değer sahaya yazılır');
 s.db.close();
});

test('sinir bos birakilirsa etiketin kendi araligi gecerlidir',async()=>{
 const s=setup(null,null);
 const range=writeRangeOf(s.widget,s.config);
 assert.deepEqual([range.min,range.max],[s.tag!.min,s.tag!.max],'boş sınır = etiketin sınırı');
 const e=s.commands.request({id:randomUUID(),commandId:s.command.id,value:s.tag!.max,screenId:s.screen.id,screenVersion:1},operator('op1'),s.screen);
 assert.notEqual(e.status,'awaiting','etiket sınırındaki değer geçer');
 await new Promise(r=>setTimeout(r,60));
 s.db.close();
});

test('nesne sinirlari etiketinkini genisletemez',()=>{
 const s=setup(0,100);
 const wide={...s.widget,writeMin:-50,writeMax:9999};
 assert.throws(()=>validateScreen({...structuredClone(seedScreen),widgets:[wide]},s.config),/etiketin sınırından/);
 const upside={...s.widget,writeMin:80,writeMax:20};
 assert.throws(()=>validateScreen({...structuredClone(seedScreen),widgets:[upside]},s.config),/alt sınırı üst sınırdan küçük olmalı/);
 s.db.close();
});
