import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../apps/server/src/store';
import {Alarms} from '../apps/server/src/alarms';
import {alarmRuleSchema,validateAlarms,type AlarmRule,type Sample} from '../packages/contracts/model';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-alarm-'));
const rule=(patch:Partial<AlarmRule>)=>alarmRuleSchema.parse({id:'rule-1',name:'Sıcaklık yüksek',tagId:'tag-m0',...patch});
function setup(rules:AlarmRule[]){
 const store=new Store(directory()),config=store.config(),samples:Record<string,Sample>={};
 const write=(id:string,value:boolean|number|null,quality:Sample['quality']='good')=>{samples[id]={value,quality,receivedAt:Date.now(),sampledAt:Date.now(),sequence:1};};
 store.saveAlarmRules(rules);
 return {store,samples,write,alarms:new Alarms(store,samples,()=>store.alarmRules(),()=>config)};
}
test('high limit raises once, holds through deadband and clears below it',()=>{
 const {store,write,alarms}=setup([rule({kind:'high',limit:80,deadband:5})]);
 write('tag-m0',70);assert.equal(alarms.tick().length,0);
 write('tag-m0',85);assert.equal(alarms.tick().length,1);
 const first=alarms.active()[0];
 write('tag-m0',82);assert.equal(alarms.tick().length,1,'ölü bant içinde alarm devam eder');
 assert.equal(alarms.active()[0].id,first.id,'aynı olay tekrar açılmaz');
 write('tag-m0',74);assert.equal(alarms.tick().length,0);
 assert.ok(store.alarm(first.id)!.clearedAt,'normale dönünce olay kapanır');
 store.close();
});
test('delay defers the alarm and unknown quality freezes the state',()=>{
 const {write,alarms,store}=setup([rule({kind:'low',limit:10,delayMs:1000})]);
 const t0=Date.now();
 write('tag-m0',5);assert.equal(alarms.tick(t0).length,0,'gecikme dolmadan alarm verilmez');
 assert.equal(alarms.tick(t0+400).length,0);
 assert.equal(alarms.tick(t0+1200).length,1);
 write('tag-m0',null,'stale');assert.equal(alarms.tick(t0+1300).length,1,'veri bilinmiyorsa alarm korunur');
 write('tag-m0',20);assert.equal(alarms.tick(t0+1400).length,0);
 store.close();
});
test('digital and stale rules, acknowledgement and disabling',()=>{
 const {store,write,alarms}=setup([rule({id:'rule-bool',kind:'bool',expected:true,severity:'critical'}),rule({id:'rule-stale',kind:'stale',tagId:'tag-y0'})]);
 write('tag-m0',false);write('tag-y0',true);
 assert.equal(alarms.tick().length,0);
 write('tag-m0',true);
 const active=alarms.tick();assert.equal(active.length,1);assert.equal(active[0].severity,'critical');
 write('tag-y0',null,'bad');
 assert.equal(alarms.tick().length,2,'veri güncel değilse stale alarmı açılır');
 assert.equal(alarms.acknowledge(alarms.active().map(a=>a.id),'operator'),2);
 assert.ok(alarms.pending().every(a=>a.ackAt&&a.ackBy==='operator'));
 store.saveAlarmRules(store.alarmRules().map(r=>({...r,enabled:false})));
 assert.equal(alarms.tick().length,0,'devre dışı kural aktif alarmı kapatır');
 store.close();
});
test('latched alarms wait for acknowledgement after the condition returns to normal',()=>{
 const {store,write,alarms}=setup([rule({kind:'bool',expected:true,latch:true})]);
 write('tag-m0',true);const event=alarms.tick()[0];
 write('tag-m0',false);assert.equal(alarms.tick().length,1,'latch ACK olmadan kapanmaz');
 alarms.acknowledge([event.id],'operator');assert.equal(alarms.tick().length,0,'ACK sonrasi normal kosul kapatir');
 store.close();
});
test('informational events can be configured without acknowledgement',()=>{
 const {store,write,alarms}=setup([rule({kind:'bool',expected:true,severity:'info',ackRequired:false})]);
 write('tag-m0',true);const event=alarms.tick()[0];assert.ok(event.ackAt);assert.equal(event.ackBy,'system');store.close();
});
test('alarm metrics identify frequent, long-running and acknowledged alarms',()=>{
 const {store,write,alarms}=setup([rule({kind:'bool',expected:true})]),t=Date.now()-10000;
 write('tag-m0',true);const first=alarms.tick(t)[0];alarms.acknowledge([first.id],'operator');
 write('tag-m0',false);alarms.tick(t+1000);write('tag-m0',true);alarms.tick(t+2000);
 const metrics=store.alarmMetrics(t-1,Date.now()+1);assert.equal(metrics.total,2);assert.equal(metrics.rows[0].count,2);assert.ok(metrics.rows[0].averageAckMs!==null);assert.equal(metrics.rows[0].open,1);store.close();
});
test('alarm rules validate tag existence and data type',()=>{
 const store=new Store(directory()),c=store.config();
 assert.throws(()=>validateAlarms([rule({tagId:'missing'})],c));
 assert.throws(()=>validateAlarms([rule({kind:'high',tagId:'tag-m0'})],c),/sayısal/);
 assert.throws(()=>validateAlarms([rule({id:'x'}),rule({id:'x'})],c));
 assert.doesNotThrow(()=>validateAlarms([rule({kind:'bool',tagId:'tag-m0'})],c));
 store.close();
});
