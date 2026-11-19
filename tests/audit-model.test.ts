import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditCategory,auditLabel,auditSummary,auditFields,countBuckets} from '../apps/web/src/auditModel';

test('islem kodu kategoriye ayrilir; recete uygulamasi yapilandirmadan ayri',()=>{
 assert.equal(auditCategory('command.accepted'),'command');
 assert.equal(auditCategory('screens.layout'),'screen');
 assert.equal(auditCategory('recipe.saved'),'config');
 assert.equal(auditCategory('recipe.apply.started'),'recipe');
 assert.equal(auditCategory('reauth.failed'),'user');
 assert.equal(auditCategory('watchdog.tripped'),'system');
});

test('bilinmeyen kod oldugu gibi kalir',()=>{
 assert.equal(auditLabel('config.saved'),'Yapılandırma kaydedildi');
 assert.equal(auditLabel('yeni.bir.kod'),'yeni.bir.kod');
});

test('ozet ust duzeyden sonra bir alt duzeyden alinir',()=>{
 assert.equal(auditSummary({name:'Pompa 1 başlat'}),'Pompa 1 başlat');
 assert.equal(auditSummary({id:'abcdef123456',definition:{name:'Fan'}}),'Fan');
 assert.equal(auditSummary({revision:12}),'rev 12');
 assert.equal(auditSummary(null),'');
 assert.deepEqual(auditFields({a:1,b:'x',c:{d:1},e:[1]}),[['a','1'],['b','x']]);
});

test('kovalar: aralik disi sayilmaz, bitis son kovaya duser',()=>{
 const b=countBuckets([0,5,10,11,25,-1],0,20,10);
 assert.deepEqual(b.map(x=>x.count),[2,2]);
});
