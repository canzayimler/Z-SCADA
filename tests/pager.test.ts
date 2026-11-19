import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageWindow} from '../apps/web/src/Pager';

test('sayfa penceresi: az sayfada hepsi, cokta ilk/son/komsular ve bosluk',()=>{
 assert.deepEqual(pageWindow(0,5),[0,1,2,3,4]);
 assert.deepEqual(pageWindow(0,20),[0,1,'…',19]);
 assert.deepEqual(pageWindow(10,20),[0,'…',9,10,11,'…',19]);
 assert.deepEqual(pageWindow(19,20),[0,'…',18,19]);
 assert.deepEqual(pageWindow(2,20),[0,1,2,3,'…',19]);
});
