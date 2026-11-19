import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathFor,parsePath,MGMT_PATH,projectStale,PROJECT_STALE_MS} from '../apps/web/src/routing';
/* Arayuz testi tabani (acik uc 3): 50 test dosyasinin hicbiri `apps/web/src`
 * altindan import etmiyordu — geri al/yinele, yonlendirme ve istek katmani
 * tamamen elle deneniyordu. Yol cozumleme bagimlilik istemez, ilk buradan. */
const HOME='screen-main';

test('bos yol ana ekrana cozulur, ana ekran koke yazilir',()=>{
 assert.deepEqual(parsePath('/'),{page:'runtime'});
 assert.deepEqual(parsePath(''),{page:'runtime'});
 assert.equal(pathFor('runtime',HOME,HOME),'/');
 assert.equal(pathFor('runtime','',HOME),'/');
});

test('ekran yollari gidip gelirken kimligi korur',()=>{
 for(const [page,prefix] of [['runtime','/ekran/'],['editor','/tasarim/'],['preview','/onizleme/']] as const){
  const url=pathFor(page,'kazan-2',HOME);
  assert.equal(url,prefix+'kazan-2');
  assert.deepEqual(parsePath(url),{page,screenId:'kazan-2'});
 }
});

test('kimlikte bosluk, turkce harf ve egik cizgi kaybolmaz',()=>{
 for(const id of ['kazan 2','ısı değişimi','a/b','%50 hat','tire-alt_çizgi']){
  const url=pathFor('editor',id,HOME);
  assert.deepEqual(parsePath(url),{page:'editor',screenId:id},id);
 }
});

test('yonetim sayfalarinin yollari cift yonlu esler',()=>{
 for(const page of Object.keys(MGMT_PATH)){
  const url=pathFor(page,'yoksay',HOME);
  assert.equal(url,MGMT_PATH[page]);
  assert.deepEqual(parsePath(url),{page});
 }
});

test('taninmayan yol null doner — cagiran varsayilana duser',()=>{
 for(const yol of ['/bilinmeyen','/ekran','/tasarim','/cihazlar/fazladan','/onizleme/'])
  assert.equal(parsePath(yol),null,yol);
});

test('bilinmeyen sayfa koke duser, ekran kimligi sizdirmaz',()=>{
 assert.equal(pathFor('uydurma','kazan-2',HOME),'/');
});

test('ana ekran disindaki ekran runtime yolunda gorunur',()=>{
 assert.equal(pathFor('runtime','kazan-2',HOME),'/ekran/kazan-2');
 assert.equal(pathFor('runtime',HOME,HOME),'/','ana ekran kimligi URL kirletmez');
});
/* Denetim 2026-11-18: her sayfa geçişi /api/project'i bekletip yeniden çekiyordu (açılışta iki kez). */
test('projectStale: hic cekilmediyse ya da sure dolduysa tazele, yeni cekimde tazeleme',()=>{
 assert.equal(projectStale(0,1000),true);
 assert.equal(projectStale(10000,10000+PROJECT_STALE_MS-1),false);
 assert.equal(projectStale(10000,10000+PROJECT_STALE_MS),true);
});
