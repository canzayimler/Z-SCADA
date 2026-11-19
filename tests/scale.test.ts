import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../apps/server/src/store';
import {seedScreen} from '../packages/contracts/seed';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-scale-'));
test('a single screen is read by id, not by loading every screen',()=>{
 const db=new Store(directory());
 for(let i=0;i<50;i++){const draft={...structuredClone(seedScreen),id:'ekran-'+i,name:'Ekran '+i};
  db.saveScreen({id:draft.id,name:draft.name,version:1,publishedVersion:0,draft,published:null});}
 const target=db.screen('ekran-42');
 assert.ok(target,'aranan ekran bulunur');
 assert.equal(target!.name,'Ekran 42');
 assert.equal(db.screen('yok-boyle'),undefined,'olmayan ekran undefined döner');
 // Sorgu planinda tam tarama olmamali: birincil anahtar uzerinden arama.
 const plan=(db.db.prepare('EXPLAIN QUERY PLAN SELECT body FROM screens WHERE id=?').all('ekran-42') as any[]).map(r=>String(r.detail)).join(' ');
 assert.match(plan,/USING (INDEX|PRIMARY KEY)|SEARCH/,'ekran birincil anahtar üzerinden aranır: '+plan);
 db.close();
});
test('date-range audit queries use the created index',()=>{
 const db=new Store(directory());
 for(let i=0;i<200;i++)db.audit('op','test.event',{i});
 const plan=(db.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM audit WHERE created BETWEEN ? AND ? ORDER BY created DESC LIMIT 10').all(0,Date.now()) as any[]).map(r=>String(r.detail)).join(' ');
 assert.match(plan,/audit_created/,'denetim sorgusu tarih indeksini kullanır: '+plan);
 db.close();
});
