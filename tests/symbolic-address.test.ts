import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isSymbolicProtocol,symbolicAddressField,symbolicAddressOf} from '../packages/contracts/model';
test('isSymbolicProtocol: yalniz s7, ads ve opc-ua sembolik; Modbus, bos ve tanimsiz degil',()=>{
 for(const p of ['s7','ads','opc-ua'] as const)assert.equal(isSymbolicProtocol(p),true,p);
 for(const p of ['modbus-tcp','modbus-rtu','',undefined,null] as const)assert.equal(isSymbolicProtocol(p),false,String(p));
});
test('symbolicAddressOf: protokole gore dogru alan, Modbus ve baglantisiz durumda undefined',()=>{
 const tag={s7Address:'DB1,REAL4',adsSymbol:'GVL.a',nodeId:'ns=2;i=5'};
 assert.equal(symbolicAddressField('s7'),'s7Address');
 assert.equal(symbolicAddressField('modbus-tcp'),null);
 assert.equal(symbolicAddressOf(tag,{protocol:'s7'}),'DB1,REAL4');
 assert.equal(symbolicAddressOf(tag,{protocol:'ads'}),'GVL.a');
 assert.equal(symbolicAddressOf(tag,{protocol:'opc-ua'}),'ns=2;i=5');
 assert.equal(symbolicAddressOf(tag,{protocol:'modbus-rtu'}),undefined);
 assert.equal(symbolicAddressOf(tag,{}),undefined,'protokolu olmayan baglanti Modbus TCP sayilir');
 assert.equal(symbolicAddressOf(tag,undefined),undefined);
 assert.equal(symbolicAddressOf({},{protocol:'s7'}),undefined,'alan bos ise ham deger (undefined) doner, eski dallanmayla ayni');
});
