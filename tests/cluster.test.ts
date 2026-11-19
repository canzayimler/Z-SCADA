import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../apps/server/src/store';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-cluster-'));
test('only one instance owns the write lease at a time',()=>{
 const dir=directory();
 const a=new Store(dir),b=new Store(dir);
 const first=a.claimOwnership('sunucu-a',10000);
 assert.equal(first.role,'primary','ilk ornek aktif olur');
 const second=b.claimOwnership('sunucu-b',10000);
 assert.equal(second.role,'standby','kira taze iken ikinci ornek pasif kalır');
 assert.equal(second.instanceId,'sunucu-a','pasif ornek aktif sunucunun kim olduğunu bilir');
 a.close();b.close();
});
test('a stale lease is taken over and the epoch advances (fencing)',()=>{
 const dir=directory();
 const a=new Store(dir);
 const first=a.claimOwnership('sunucu-a',10000);
 // Kira bayatlatilir: aktif sunucu coktu.
 a.set('owner',{instanceId:'sunucu-a',epoch:first.epoch,heartbeatAt:Date.now()-60000});
 const b=new Store(dir);
 const taken=b.claimOwnership('sunucu-b',10000);
 assert.equal(taken.role,'primary','bayat kira devralınır');
 assert.ok(taken.epoch>first.epoch,'devralmada epoch artar');
 assert.equal(a.renewOwnership('sunucu-a',first.epoch),false,'eski sunucu kirasını yenileyemez ve yazmayı bırakır');
 a.close();b.close();
});
test('the owner keeps its epoch while renewing',()=>{
 const dir=directory();
 const a=new Store(dir);
 const first=a.claimOwnership('sunucu-a',10000);
 assert.equal(a.renewOwnership('sunucu-a',first.epoch),true);
 const again=a.claimOwnership('sunucu-a',10000);
 assert.equal(again.epoch,first.epoch,'aynı sunucu tekrar talep edince epoch artmaz');
 assert.equal(again.role,'primary');
 a.close();
});
