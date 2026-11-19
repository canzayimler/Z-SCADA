import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../apps/server/src/store';
import {screenDelta,newWidget} from '../packages/contracts/model';
import {seedScreen} from '../packages/contracts/seed';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-conflict-'));
test('screenDelta reports what the other draft would cost the user',()=>{
 const mine=structuredClone(seedScreen),theirs=structuredClone(seedScreen);
 mine.widgets=[...mine.widgets,newWidget('pump',10,10)];
 theirs.widgets=[...theirs.widgets,newWidget('valve',300,10)];
 mine.widgets[0]={...mine.widgets[0],x:mine.widgets[0].x+40};
 const d=screenDelta(mine,theirs);
 assert.equal(d.added,1,'benim eklediğim nesne karşı tarafta yok');
 assert.equal(d.removed,1,'karşı tarafın eklediği nesne bende yok; almazsam kaybolur');
 assert.equal(d.changed,1,'taşınan nesne değişmiş sayılır');
 assert.equal(d.total,d.added+d.removed+d.changed);
 const same=screenDelta(seedScreen,seedScreen);
 assert.equal(same.total,0,'aynı taslakta fark yok');
});
test('archiving a draft on overwrite never fails on an already stored version',()=>{
 const db=new Store(directory());
 const s=db.screens()[0];
 db.revision(s.draft,s.version);
 const changed={...s.draft,name:'Değişmiş taslak'};
 db.revision(changed,s.version);// Cakisma zorlamasinda ayni surum numarasi tekrar arsivlenebilir.
 const rows=db.db.prepare('SELECT body FROM revisions WHERE screen_id=? AND version=?').all(s.id,s.version) as any[];
 assert.equal(rows.length,1,'aynı sürüm tek satır kalır');
 assert.equal(JSON.parse(rows[0].body).name,'Değişmiş taslak','son arşivlenen taslak korunur');
 db.close();
});
