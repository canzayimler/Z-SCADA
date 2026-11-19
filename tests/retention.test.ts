import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../apps/server/src/store';
import type {Execution} from '../packages/contracts/model';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-retention-'));
const execution=(id:string,status:Execution['status'],createdAt:number):Execution=>({
 id,commandId:'cmd',name:'Pompa',user:'op',value:true,status,message:'',createdAt,updatedAt:createdAt,
 screenId:'screen-main',screenVersion:1,revision:1,expiresAt:createdAt+7000,targets:[],requestId:id} as any);
test('retention keeps unsettled commands so replay protection survives cleanup',()=>{
 const db=new Store(directory());
 const old=Date.now()-120*86400000;
 db.saveCommand(execution('c-verified','verified',old));
 db.saveCommand(execution('c-pending','pending' as any,old));
 db.db.prepare('UPDATE commands SET created=? WHERE id=?').run(old,'c-verified');
 db.db.prepare('UPDATE commands SET created=? WHERE id=?').run(old,'c-pending');
 db.audit('op','test.event',{});
 db.db.prepare('UPDATE audit SET created=?').run(old);
 const pruned=db.pruneRecords(90);
 assert.equal(pruned.commands,1,'yalnızca sonuçlanmış komut silinir');
 assert.equal(pruned.audit,1,'saklama süresi dışındaki denetim kaydı silinir');
 assert.ok(db.command('c-pending'),'sonuçlanmamış komut korunur; tekrar engelleme bozulmaz');
 assert.equal(db.command('c-verified'),undefined);
 db.close();
});
test('audit and command pages report the real total, not the page size',()=>{
 const db=new Store(directory());
 for(let i=0;i<250;i++)db.audit('op','test.event',{i});
 const page=db.auditPage(0,Date.now(),100,0);
 assert.equal(page.rows.length,100,'sayfa boyutu sınırlı');
 assert.ok(page.total>=250,'toplam gerçek satır sayısını gösterir');
 const second=db.auditPage(0,Date.now(),100,100);
 assert.equal(second.rows.length,100);
 assert.notEqual(second.rows[0].id,page.rows[0].id,'ikinci sayfa farklı kayıtlar döner');
 assert.ok(db.freeSpaceMb()!==undefined);
 db.close();
});
test('schema migration adds the date indexes on an older database',()=>{
 const dir=directory();
 const db=new Store(dir);db.close();
 const raw=new (require('node:sqlite').DatabaseSync)(path.join(dir,'scada.sqlite'));
 raw.exec('DROP INDEX IF EXISTS audit_created; DROP INDEX IF EXISTS commands_created; PRAGMA user_version=3;');
 raw.close();
 const migrated=new Store(dir);
 const names=(migrated.db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as any[]).map(r=>r.name);
 assert.ok(names.includes('audit_created'),'audit indeksi göç ile gelir');
 assert.ok(names.includes('commands_created'),'komut indeksi göç ile gelir');
 migrated.close();
});
