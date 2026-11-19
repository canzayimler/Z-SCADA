import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../apps/server/src/store';
import type {AlarmEvent} from '../packages/contracts/model';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-report-'));
const event=(patch:Partial<AlarmEvent>):AlarmEvent=>({id:randomUUID(),ruleId:'r1',name:'Pompa arıza',severity:'warning',kind:'bool',tagId:'t1',tagCode:'M0',
 value:true,limit:0,message:'',raisedAt:Date.now(),clearedAt:null,ackAt:null,ackBy:'',popup:true,...patch});
test('the shift report counts real rows in the range, not the page size',()=>{
 const db=new Store(directory());
 const now=Date.now(),from=now-8*3600000;
 for(let i=0;i<300;i++)db.saveAlarm(event({raisedAt:now-i*1000,clearedAt:now-i*1000+60000,ackAt:i<10?now:null,severity:i===0?'critical':'warning'}));
 db.saveAlarm(event({raisedAt:from-3600000,name:'Aralık dışı'}));
 const r=db.report(from,now);
 assert.equal(r.alarms.total,300,'aralık dışındaki olay rapora girmez');
 assert.equal(r.alarms.bySeverity.critical,1);
 assert.equal(r.alarms.unacked,290);
 assert.ok(r.alarms.top[0].count>0&&r.alarms.top.length<=10,'en sık alarmlar sıralı ve sınırlı');
 db.close();
});
test('shift notes are stored with author and range and read back by date',()=>{
 const db=new Store(directory());
 const now=Date.now();
 const note=db.addShiftNote({author:'op1',shift:'Gece',start:now-8*3600000,finish:now,text:'Pompa 2 elle çalıştırıldı, bakım bekliyor.'});
 assert.ok(note.id);
 const r=db.report(now-8*3600000,now+1000);
 assert.equal(r.notes.length,1);
 assert.equal(r.notes[0].author,'op1');
 assert.equal(r.notes[0].shift,'Gece');
 assert.equal(db.shiftNotes(now+10000,now+20000).length,0,'aralık dışındaki not gelmez');
 db.close();
});
test('older databases migrate in the shift note table',()=>{
 const dir=directory();
 const db=new Store(dir);db.close();
 const raw=new (require('node:sqlite').DatabaseSync)(path.join(dir,'scada.sqlite'));
 raw.exec('DROP TABLE shift_notes; PRAGMA user_version=6;');
 raw.close();
 const migrated=new Store(dir);
 const tables=(migrated.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map(r=>r.name);
 assert.ok(tables.includes('shift_notes'),'göç vardiya notu tablosunu ekler');
 migrated.close();
});
test('digital report builds activations and clips an open interval to the report range',()=>{
 const db=new Store(directory()),now=Date.now(),from=now-100000,to=now;
 db.writeHistory([
  {tagId:'tag-m0',at:from-10000,value:0,quality:'good'},
  {tagId:'tag-m0',at:from+10000,value:1,quality:'good'},
  {tagId:'tag-m0',at:from+25000,value:0,quality:'good'},
  {tagId:'tag-m0',at:from+40000,value:1,quality:'good'},
  {tagId:'tag-m0',at:from+60000,value:0,quality:'good'},
  {tagId:'tag-m0',at:from+70000,value:1,quality:'good'}
 ]);
 const r=db.report(from,to,['tag-m0']),a=r.activities[0];
 assert.equal(a.activations,3);
 assert.equal(a.totalOnMs,15000+20000+30000);
 assert.equal(a.averageOnMs,Math.round(65000/3));
 assert.equal(a.longestOnMs,30000);
 assert.equal(a.intervals[2].ongoing,true);
 assert.equal(a.intervals[2].end,to);
 db.close();
});
test('bad/stale samples do not become boolean states and mark affected intervals uncertain',()=>{
 const db=new Store(directory()),now=Date.now(),from=now-60000,to=now;
 db.writeHistory([
  {tagId:'tag-m0',at:from-1000,value:0,quality:'good'},
  {tagId:'tag-m0',at:from+1000,value:1,quality:'good'},
  {tagId:'tag-m0',at:from+2000,value:null,quality:'stale'},
  {tagId:'tag-m0',at:from+5000,value:0,quality:'good'},
  {tagId:'tag-m0',at:from+10000,value:1,quality:'unknown'},
  {tagId:'tag-m0',at:from+15000,value:1,quality:'good'},
  {tagId:'tag-m0',at:from+20000,value:0,quality:'good'}
 ]);
 const a=db.report(from,to,['tag-m0']).activities[0];
 assert.equal(a.activations,2);
 assert.equal(a.intervals[0].uncertain,true);
 assert.equal(a.intervals[1].uncertain,true);
 db.close();
});
test('an interval already open at the range boundary contributes duration but not a new activation',()=>{
 const db=new Store(directory()),now=Date.now(),from=now-30000,to=now;
 db.writeHistory([
  {tagId:'tag-m0',at:from-5000,value:1,quality:'good'},
  {tagId:'tag-m0',at:from+10000,value:0,quality:'good'}
 ]);
 const a=db.report(from,to,['tag-m0']).activities[0];
 assert.equal(a.activations,0);
 assert.equal(a.totalOnMs,10000);
 assert.equal(a.intervals[0].start,from);
 db.close();
});
test('an explicit empty tag selection does not silently report every digital tag',()=>{
 const db=new Store(directory()),now=Date.now();
 assert.deepEqual(db.report(now-1000,now,[]).activities,[]);
 db.close();
});
