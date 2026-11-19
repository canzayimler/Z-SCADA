import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../apps/server/src/store';
import {snapshotOf,saveSnapshot,readSnapshot,listProjects,restoreSnapshot,emptySnapshot,currentProjectId,projectsDir} from '../apps/server/src/projects';

/* Proje yoneticisi: tek calisan proje + JSON arsiv. Proje degistirmek
 * sahaya hicbir sey yazmaz; cihazlar pasif gelir, dogrulama hatasi calisan
 * projeye dokunmaz. */
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-projects-'));

test('snapshot -> restore round trip keeps screens, publish state and home screen; devices come back passive',()=>{
 const dir=tmp(),store=new Store(dir);
 const cfg=store.config();cfg.devices.forEach(d=>d.enabled=true);store.set('config',cfg);
 const first=store.screens()[0];store.set('homeScreenId',first.id);
 const snap=snapshotOf(store,'tester');
 assert.equal(snap.meta.id,currentProjectId(store));
 saveSnapshot(dir,snap);
 // calisan projeyi bosalt, sonra arsivden geri ac
 restoreSnapshot(store,emptySnapshot('Bos',[],'tester'),'tester');
 assert.equal(store.config().devices.length,0);
 restoreSnapshot(store,readSnapshot(dir,snap.meta.id),'tester');
 assert.equal(store.screens().length,snap.screens.length);
 assert.equal(store.get('homeScreenId'),first.id);
 assert.equal(store.screens().find(s=>s.id===first.id)?.publishedVersion,first.publishedVersion,'yayin durumu korunur');
 assert.ok(store.config().devices.length>0);
 assert.ok(store.config().devices.every(d=>!d.enabled),'acilan projede cihazlar pasif');
 assert.equal(currentProjectId(store),snap.meta.id);
 store.close();
});
test('an invalid snapshot is rejected before anything is written',()=>{
 const dir=tmp(),store=new Store(dir);
 const before=JSON.stringify({c:store.config(),s:store.screens()});
 const bad=snapshotOf(store,'tester');
 (bad.config as any).devices=[{id:'x'}];
 assert.throws(()=>restoreSnapshot(store,bad,'tester'));
 assert.equal(JSON.stringify({c:store.config(),s:store.screens()}),before,'calisan proje degismedi');
 store.close();
});
test('empty project: one blank screen, no devices',()=>{
 const dir=tmp(),store=new Store(dir);
 const snap=emptySnapshot('Hat 2',[],'tester');
 restoreSnapshot(store,snap,'tester');
 assert.equal(store.config().name,'Hat 2');
 assert.equal(store.config().tags.length,0);
 assert.equal(store.screens().length,1);
 assert.equal(store.screens()[0].publishedVersion,0);
 store.close();
});
test('project ids cannot escape the projects folder',()=>{
 const dir=tmp();
 assert.throws(()=>readSnapshot(dir,'../scada'),/Geçersiz proje kimliği/);
 assert.throws(()=>readSnapshot(dir,'a/b'),/Geçersiz proje kimliği/);
});
test('listProjects skips corrupt and foreign files instead of failing',()=>{
 const dir=tmp(),store=new Store(dir);
 saveSnapshot(dir,snapshotOf(store,'tester'));
 fs.writeFileSync(path.join(projectsDir(dir),'bozuk.json'),'{yarim');
 fs.writeFileSync(path.join(projectsDir(dir),'yabanci.json'),JSON.stringify({kind:'other'}));
 const list=listProjects(dir);
 assert.equal(list.length,1);
 assert.equal(list[0].name,store.config().name);
 store.close();
});
test('a snapshot from a newer app version is refused',()=>{
 const dir=tmp(),store=new Store(dir);
 const snap={...snapshotOf(store,'tester'),version:99};
 saveSnapshot(dir,snap as any);
 assert.throws(()=>readSnapshot(dir,snap.meta.id),/sürümden yeni/);
 store.close();
});
