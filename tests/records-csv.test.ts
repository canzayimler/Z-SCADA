import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localCsvTime} from '../apps/server/src/records';
test('localCsvTime renders local wall-clock time with a computed (not hardcoded) offset',()=>{
 const d=new Date(2026,8,25,14,30,5); // local: 2026-09-25 14:30:05
 const s=localCsvTime(d.getTime());
 assert.match(s,/^2026-09-25 14:30:05[+-]\d{2}:\d{2}$/);
 const off=-d.getTimezoneOffset(),sign=off>=0?'+':'-',abs=Math.abs(off);
 const expectedOffset=sign+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');
 assert.equal(s,`2026-09-25 14:30:05${expectedOffset}`);
});
test('localCsvTime pads single-digit month/day/time fields',()=>{
 const d=new Date(2026,0,5,3,4,9);
 const s=localCsvTime(d.getTime());
 assert.match(s,/^2026-01-05 03:04:09[+-]\d{2}:\d{2}$/);
});
