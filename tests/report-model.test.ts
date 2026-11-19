import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shiftAt,presetRange,activationBuckets,bucketSize,timeTicks} from '../apps/web/src/reportModel';

const at=(d:number,h:number,m=0)=>new Date(2026,8,d,h,m).getTime();

test('vardiya sinirlari: 00-08 Gece, 08-16 Gunduz, 16-24 Aksam',()=>{
 assert.deepEqual(shiftAt(at(25,3)),{name:'Gece',from:at(25,0),to:at(25,8)});
 assert.equal(shiftAt(at(25,8)).name,'Gündüz');
 assert.equal(shiftAt(at(25,15,59)).name,'Gündüz');
 assert.deepEqual(shiftAt(at(25,23,30)),{name:'Akşam',from:at(25,16),to:at(26,0)});
});

test('on ayarlar: bu vardiya simdi biter, onceki vardiya gun sinirini gecer',()=>{
 const now=at(25,2,15);
 assert.deepEqual(presetRange('shift',now),{from:at(25,0),to:now});
 assert.deepEqual(presetRange('prevShift',now),{from:at(24,16),to:at(25,0)});
 assert.deepEqual(presetRange('yesterday',now),{from:at(24,0),to:at(25,0)});
 assert.deepEqual(presetRange('today',now),{from:at(25,0),to:now});
});

test('kovalar: aralik basinda zaten acik cevrim giris sayilmaz',()=>{
 const from=at(25,8),to=at(25,16);
 assert.equal(bucketSize(to-from),30*60000);
 const b=activationBuckets([{start:from,end:at(25,9)},{start:at(25,9,10),end:at(25,9,20)},{start:at(25,9,40),end:at(25,10)},{start:to,end:to}],from,to);
 assert.equal(b.length,16);
 assert.equal(b[2].count,1);
 assert.equal(b[3].count,1);
 assert.equal(b[15].count,1); // tam bitiste baslayan son kovaya duser
 assert.equal(b.reduce((n,x)=>n+x.count,0),3);
});

test('eksen isaretleri duz saatlere hizalanir ve sinirli sayidadir',()=>{
 const {ticks,step}=timeTicks(at(25,8,20),at(25,16));
 assert.equal(step,3600000);
 assert.equal(new Date(ticks[0]).getHours(),9);
 assert.ok(ticks.length<=8);
 assert.ok(timeTicks(at(1,0),at(30,0)).ticks.length<=8);
});
