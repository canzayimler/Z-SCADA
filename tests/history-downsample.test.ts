import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../apps/server/src/store';
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'scada-history-'));
/** Eski JS-seyreltme uygulamasi (referans): store.ts'teki SQL versiyonu ile
 * ayni tag/from/to/maxPoints icin birebir ayni cikti vermeli. */
function oldHistory(db:Store,tagIds:string[],from:number,to:number,maxPoints=1000){
 const result:Record<string,{at:number;value:number|null;quality:string}[]>={};
 for(const tagId of tagIds){
  const total=(db.db.prepare('SELECT COUNT(*) n FROM history WHERE tag_id=? AND at BETWEEN ? AND ?').get(tagId,from,to) as any).n as number;
  const stride=Math.max(1,Math.ceil(total/maxPoints));
  const rows=db.db.prepare('SELECT at,value,quality,ROW_NUMBER() OVER (ORDER BY at) rn FROM history WHERE tag_id=? AND at BETWEEN ? AND ?').all(tagId,from,to) as any[];
  result[tagId]=rows.filter(r=>stride===1||Number(r.rn)%stride===0||Number(r.rn)===1||Number(r.rn)===rows.length)
   .map(r=>({at:Number(r.at),value:r.value===null?null:Number(r.value),quality:String(r.quality)}));
 }
 return result;
}
test('SQL downsampling matches the old JS-stride implementation for various point counts and limits',()=>{
 const db=new Store(directory());
 const tagId='tag-history-test';
 const base=1_700_000_000_000;
 const counts=[0,1,2,999,1000,1001,2500,7000];
 for(const count of counts){
  db.db.exec('DELETE FROM history');
  const rows=[];
  for(let i=0;i<count;i++)rows.push({tagId,at:base+i*1000,value:i%17===0?null:i*0.5,quality:i%23===0?'bad':'good'});
  db.writeHistory(rows);
  const from=base-1,to=base+count*1000+1;
  for(const maxPoints of [1,5,50,200,1000,5000]){
   const expected=oldHistory(db,[tagId],from,to,maxPoints);
   const actual=db.history([tagId],from,to,maxPoints);
   assert.deepEqual(actual,expected,`count=${count} maxPoints=${maxPoints}`);
  }
 }
 db.close();
});
test('multiple tags are downsampled independently with matching output',()=>{
 const db=new Store(directory());
 const base=1_700_000_000_000;
 for(const tagId of ['a','b']){
  const rows=[];
  for(let i=0;i<3000;i++)rows.push({tagId,at:base+i*1000,value:i,quality:'good'});
  db.writeHistory(rows);
 }
 const from=base-1,to=base+3000*1000;
 const expected=oldHistory(db,['a','b'],from,to,250);
 const actual=db.history(['a','b'],from,to,250);
 assert.deepEqual(actual,expected);
 assert.equal(actual.a[0].at,base);
 assert.equal(actual.a.at(-1)?.at,expected.a.at(-1)?.at);
 db.close();
});
