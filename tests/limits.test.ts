import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../apps/server/src/store';
import {Commands} from '../apps/server/src/commands';
import {baseTimeoutMs,deployTimeoutMs} from '../apps/server/src/gateway';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-limits-'));
function engine(){
 const db=new Store(directory());
 return {db,commands:new Commands(db,{},()=>null,()=>false,async()=>{})};
}
test('command rate limit protects equipment but never blocks a stop', ()=>{
 const {db,commands}=engine();
 const now=Date.now();
 for(let i=0;i<Commands.COMMAND_LIMIT.count;i++)commands.recent.push({at:now,user:'op',commandId:'cmd-1'});
 assert.throws(()=>commands.rateCheck('op','cmd-1',true,now),/dakikada en fazla/,'aynı ekipmana üst üste açma komutu reddedilir');
 assert.doesNotThrow(()=>commands.rateCheck('op','cmd-1',false,now),'durdurma komutu limite takılmaz');
 assert.doesNotThrow(()=>commands.rateCheck('op','cmd-1',0,now),'sayısal sıfır da durdurma sayılır');
 assert.doesNotThrow(()=>commands.rateCheck('op','cmd-2',true,now),'başka ekipman etkilenmez');
 db.close();
});
test('per-user limit counts across equipment and expires with the window',()=>{
 const {db,commands}=engine();
 const now=Date.now();
 for(let i=0;i<Commands.USER_LIMIT.count;i++)commands.recent.push({at:now,user:'op',commandId:'cmd-'+i});
 assert.throws(()=>commands.rateCheck('op','cmd-yeni',true,now),/Çok fazla komut/);
 assert.doesNotThrow(()=>commands.rateCheck('baska','cmd-yeni',true,now),'limit kullanıcı bazlıdır');
 assert.doesNotThrow(()=>commands.rateCheck('op','cmd-yeni',true,now+Commands.USER_LIMIT.windowMs+1),'pencere dolunca serbest kalır');
 db.close();
});
test('gateway timeouts scale with flow size and honour the env override',()=>{
 delete process.env.NODERED_TIMEOUT_MS;
 assert.equal(baseTimeoutMs(),7000);
 assert.ok(deployTimeoutMs(1000)>deployTimeoutMs(10),'büyük akışta uygulama süresi uzar');
 assert.ok(deployTimeoutMs(100000)<=180000,'üst sınır aşılmaz');
 process.env.NODERED_TIMEOUT_MS='20000';
 assert.equal(baseTimeoutMs(),20000);
 delete process.env.NODERED_TIMEOUT_MS;
});
test('source files stay valid UTF-8 without replacement characters',()=>{
 const roots=['apps','packages','scripts','tests'];
 const files:string[]=[];
 const walk=(dir:string)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,e.name);
  if(e.isDirectory()){if(e.name!=='node_modules')walk(full);}
  else if(/\.(ts|tsx|css)$/.test(e.name))files.push(full);}};
 for(const r of roots)walk(path.join(process.cwd(),r));
 const broken=files.filter(f=>fs.readFileSync(f,'utf8').includes(String.fromCharCode(0xFFFD)));
 assert.deepEqual(broken,[],'kaynak dosyalarda bozuk karakter olmamalı');
});
