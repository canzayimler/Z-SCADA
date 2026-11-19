import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../apps/server/src/store';
import {Commands} from '../apps/server/src/commands';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import type {Config,Sample,ScreenRecord,User} from '../packages/contracts/model';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-approval-'));
function setup(approval:'none'|'confirm'|'reason'|'two-person'){
 const db=new Store(directory());
 const config=structuredClone(seedConfig) as Config;
 const command=config.commands[0];command.approval=approval;command.risk='critical';
 const samples:Record<string,Sample>={};
 for(const tag of config.tags)samples[tag.id]={value:tag.dataType==='bool'?false:0,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1};
 const writes:{tagId:string;value:boolean|number}[]=[];
 const commands=new Commands(db,samples,()=>config,()=>true,async(tagId,value)=>{writes.push({tagId,value});});
 const screen:ScreenRecord={id:seedScreen.id,name:seedScreen.name,version:1,publishedVersion:1,draft:seedScreen,published:seedScreen};
 return {db,config,command,commands,screen,writes,samples};
}
const operator=(name:string):User=>({id:name,username:name,role:'operator'});
const widgetFor=(screen:ScreenRecord,commandId:string)=>screen.published!.widgets.find(w=>w.commandId===commandId);
test('a reason is required by the server, not only by the dialog',()=>{
 const s=setup('reason');
 const w=widgetFor(s.screen,s.command.id);
 assert.ok(w,'tohum ekranda bu komutu kullanan bir nesne olmalı');
 assert.throws(()=>s.commands.request({id:randomUUID(),commandId:s.command.id,value:true,screenId:s.screen.id,screenVersion:1},operator('op1'),s.screen),/gerekçe zorunlu/);
 s.db.close();
});
test('two-person commands wait for a second person and write nothing meanwhile',()=>{
 const s=setup('two-person');
 const waiting=s.commands.request({id:randomUUID(),commandId:s.command.id,value:true,screenId:s.screen.id,screenVersion:1,reason:'Bakım sonrası devreye alma'},operator('op1'),s.screen);
 assert.equal(waiting.status,'awaiting','ilk istek yalnızca onay bekler');
 assert.equal(s.writes.length,0,'onaydan önce sahaya yazılmaz');
 assert.throws(()=>s.commands.approve(waiting.id,operator('op1'),s.screen),/Kendi komutunuzu onaylayamazsınız/);
 assert.equal(s.writes.length,0);
 const executed=s.commands.approve(waiting.id,operator('op2'),s.screen);
 assert.ok(executed.status!=='awaiting','ikinci onaydan sonra komut yürütülür, onay beklemez');
 assert.equal(executed.reason,'Bakım sonrası devreye alma','gerekçe taşınır');
 const stored=s.db.command(waiting.id)!;
 assert.equal(stored.approvedBy,'op2');
 const audit=s.db.events().map(e=>e.action);
 assert.ok(audit.includes('command.approval.requested'));
 assert.ok(audit.includes('command.approved'));
 // Yurutme asenkron devam eder; DB'yi kapatmak yaris kosulu yaratir, gecici klasor zaten atilir.
});
test('a pending approval can be rejected and then no longer approved',()=>{
 const s=setup('two-person');
 const waiting=s.commands.request({id:randomUUID(),commandId:s.command.id,value:true,screenId:s.screen.id,screenVersion:1,reason:'Deneme'},operator('op1'),s.screen);
 const rejected=s.commands.rejectApproval(waiting.id,operator('op2'));
 assert.equal(rejected.status,'rejected');
 assert.throws(()=>s.commands.approve(waiting.id,operator('op3'),s.screen),/onay beklemiyor/);
 assert.equal(s.writes.length,0);
 s.db.close();
});
test('commands without an approval policy keep working unchanged',()=>{
 const s=setup('none');
 const e=s.commands.request({id:randomUUID(),commandId:s.command.id,value:true,screenId:s.screen.id,screenVersion:1},operator('op1'),s.screen);
 assert.ok(e.status!=='awaiting','onay politikası yoksa komut doğrudan yürütülür');
});
