import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../apps/server/src/store';
import type {AlarmEvent} from '../packages/contracts/model';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-alarm-history-'));
const event=(id:string,raisedAt:number):AlarmEvent=>({id,ruleId:'rule-1',name:'Sıcaklık yüksek',severity:'warning',kind:'high',tagId:'tag-m0',tagCode:'M0',value:85,limit:80,message:'Sıcaklık yüksek',raisedAt,clearedAt:null,ackAt:null,ackBy:'',popup:false});
test('alarmsBetween includes events at the range edges and excludes those outside it',()=>{
 const store=new Store(directory());
 store.saveAlarm(event('e-before',900));
 store.saveAlarm(event('e-from',1000));
 store.saveAlarm(event('e-mid',1500));
 store.saveAlarm(event('e-to',2000));
 store.saveAlarm(event('e-after',2100));
 const events=store.alarmsBetween(1000,2000);
 assert.deepEqual(events.map(e=>e.id),['e-to','e-mid','e-from'],'sınırlar dahil, dışı hariç ve DESC sıralı');
 store.close();
});
test('alarmsBetween orders newest first and truncates at the limit',()=>{
 const store=new Store(directory());
 for(let i=0;i<10;i++)store.saveAlarm(event('e-'+i,1000+i));
 const events=store.alarmsBetween(0,Date.now(),3);
 assert.equal(events.length,3);
 assert.deepEqual(events.map(e=>e.id),['e-9','e-8','e-7'],'en yeniden eskiye sıralı ve limitle kesilir');
 store.close();
});
let createServer:(()=>Promise<any>)|null=null;
async function serverModule(){
 if(!createServer){process.env.SCADA_NO_LISTEN='1';createServer=(await import('../apps/server/src/index')).createServer as any;}
 return createServer!;
}
const headers={'content-type':'application/json','x-scada-request':'1'};
async function boot(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-alarm-history-http-'));
 process.env.SCADA_DATA=dir;
 const app=await (await serverModule())() as any;
 const setup=await app.inject({method:'POST',url:'/api/setup',headers,payload:{username:'admin',password:'Test-parola-2026!'},remoteAddress:'127.0.0.1'});
 assert.equal(setup.statusCode,200);
 const login=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'admin',password:'Test-parola-2026!'}});
 assert.equal(login.statusCode,200);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 return {app,cookie};
}
test('GET /api/alarms/history returns defaults and rejects an inverted range',async()=>{
 const {app,cookie}=await boot();
 const defaults=await app.inject({method:'GET',url:'/api/alarms/history',headers:{...headers,cookie}});
 assert.equal(defaults.statusCode,200);
 const body=defaults.json();
 assert.ok(Array.isArray(body.events));
 assert.equal(body.truncated,false);
 assert.ok(body.to>body.from,'varsayılan aralık 24 saatliktir');
 const inverted=await app.inject({method:'GET',url:'/api/alarms/history?from=2000&to=1000',headers:{...headers,cookie}});
 assert.equal(inverted.statusCode,400,'bitiş başlangıçtan önce olamaz');
 await app.scadaClose();
});
