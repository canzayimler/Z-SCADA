import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../apps/server/src/store';
import {Alarms} from '../apps/server/src/alarms';
import {alarmPolicySchema,type AlarmRule,type Sample} from '../packages/contracts/model';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-flood-'));
const sample=(value:boolean):Sample=>({value,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1});
const rule=(id:string,tagId:string,severity:AlarmRule['severity']):AlarmRule=>({
 id,name:id,tagId,kind:'bool',limit:0,expected:true,deadband:0,delayMs:0,severity,message:'',enabled:true,popup:true,
 ackRequired:true,latch:false,area:'',equipment:'',cause:'',consequence:'',action:'',responseMinutes:0,
 shelvedUntil:0,shelvedReason:'',shelvedBy:''});
test('alarm flood suppresses non-critical popups but never hides the events',()=>{
 const db=new Store(directory());
 const samples:Record<string,Sample>={};
 const rules:AlarmRule[]=[];
 for(let i=0;i<6;i++){const tagId='tag-'+i;samples[tagId]=sample(true);rules.push(rule('r'+i,tagId,i===5?'critical':'warning'));}
 const alarms=new Alarms(db,samples,()=>rules,()=>null,()=>alarmPolicySchema.parse({floodPerMinute:4,floodClearMinutes:1}));
 alarms.tick();
 const raised=alarms.active();
 assert.equal(raised.length,6,'sel bastırma olayları kaydetmeyi durdurmaz');
 assert.equal(alarms.floodState().active,true,'eşik aşılınca sel modu açılır');
 const critical=raised.find(e=>e.severity==='critical')!;
 assert.equal(critical.popup,true,'kritik alarm selde de açılır pencere gösterir');
 const suppressed=raised.filter(e=>e.severity!=='critical'&&!e.popup);
 assert.ok(suppressed.length>=1,'eşikten sonraki kritik olmayan olayların popup bayrağı kapanır');
 assert.equal(alarms.counts().outstanding,6,'sayaçlar gerçek toplamı gösterir');
 const started=db.events().filter(e=>e.action==='alarm.flood.started');
 assert.equal(started.length,1,'sel başlangıcı denetime bir kez yazılır');
 db.close();
});
test('flood policy can be turned off; then every popup stays on', ()=>{
 const db=new Store(directory());
 const samples:Record<string,Sample>={};const rules:AlarmRule[]=[];
 for(let i=0;i<6;i++){const tagId='tag-'+i;samples[tagId]=sample(true);rules.push(rule('r'+i,tagId,'warning'));}
 const alarms=new Alarms(db,samples,()=>rules,()=>null,()=>alarmPolicySchema.parse({floodPerMinute:4,suppressPopupsInFlood:false}));
 alarms.tick();
 assert.ok(alarms.active().every(e=>e.popup),'politika kapalıyken popup bastırılmaz');
 assert.equal(alarms.floodState().active,true,'sel yine de raporlanır');
 db.close();
});
