import {test} from 'node:test';
import assert from 'node:assert/strict';
import {opcTypeToTag} from '../apps/server/src/opcuaBrowse';
/* OPC UA gezgini: sunucudaki degisken tipinden etiket tipi onerisi. Uctan uca dogrulama
 * scripts/opcua-gozat-dogrula.mts (yerel node-opcua sunucusu). */
test('opcTypeToTag: yerlesik tip numarasi ve adi etiket tipine eslenir',()=>{
 assert.equal(opcTypeToTag(1),'bool');
 assert.equal(opcTypeToTag('Boolean'),'bool');
 assert.equal(opcTypeToTag(4),'int16');
 assert.equal(opcTypeToTag(2),'int16');
 assert.equal(opcTypeToTag(3),'uint16');
 assert.equal(opcTypeToTag(5),'uint16');
 assert.equal(opcTypeToTag(6),'int32');
 assert.equal(opcTypeToTag(7),'uint32');
 assert.equal(opcTypeToTag(10),'float32');
 assert.equal(opcTypeToTag('Double'),'float32');
});
test('opcTypeToTag: desteklenmeyen tip null (secilemez, sessizce yanlis tipe dusmez)',()=>{
 for(const t of [8,9,12,13,'String','DateTime','ns=3;i=3002',null,undefined])assert.equal(opcTypeToTag(t as any),null,String(t));
});
