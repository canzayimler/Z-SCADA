import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../apps/server/src/store';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-auth-'));
test('older databases migrate in the session reauth stamp without losing sessions',()=>{
 const dir=directory();
 const db=new Store(dir);
 db.db.prepare('INSERT INTO users (id,username,role,hash,disabled) VALUES (?,?,?,?,0)').run('u1','op','operator','salt:00');
 db.db.prepare('INSERT INTO sessions (token,user_id,expires,reauth) VALUES (?,?,?,?)').run('t1','u1',Date.now()+3600000,0);
 db.close();
 // Sema v4 gibi davranan bir veritabani: reauth sutunu yok.
 const raw=new DatabaseSync(path.join(dir,'scada.sqlite'));
 raw.exec('ALTER TABLE sessions DROP COLUMN reauth; PRAGMA user_version=4;');
 raw.close();
 const migrated=new Store(dir);
 const columns=(migrated.db.prepare('PRAGMA table_info(sessions)').all() as any[]).map(c=>c.name);
 const userColumns=(migrated.db.prepare('PRAGMA table_info(users)').all() as any[]).map(c=>c.name);
 assert.ok(userColumns.includes('permissions'),'göç granüler izin sütununu da ekler');
 assert.ok(columns.includes('reauth'),'göç reauth sütununu ekler');
 const row=migrated.db.prepare('SELECT token,reauth FROM sessions WHERE token=?').get('t1') as any;
 assert.ok(row,'mevcut oturum göçte kaybolmaz');
 assert.equal(Number(row.reauth),0,'eski oturum tazelenmemiş sayılır; kritik işlem parola ister');
 assert.ok(Store.SCHEMA_VERSION>=5,'şema sürümü ileri gider, geri gitmez');
 migrated.close();
});
