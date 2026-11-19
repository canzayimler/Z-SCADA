import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimeRows} from '../apps/web/src/RuntimeList';
import {newWidget,type Config,type Live,type Screen} from '../packages/contracts/model';

const tag=(id:string,dataType:string,unit='')=>({id,deviceId:'d',code:id.toUpperCase(),name:'Ad '+id,dataType,unit} as any);
const config={tags:[tag('m0','bool'),tag('t1','float32','°C'),tag('x','bool')]} as unknown as Config;
const screen={id:'s',name:'S',widgets:[{...newWidget('pump'),label:'Pompa 1',tagId:'m0'},{...newWidget('value'),label:'',tagId:'t1'},{...newWidget('indicator'),label:'Tekrar',tagId:'m0'},{...newWidget('text'),tagId:''}]} as unknown as Screen;
const live=(s:Record<string,any>)=>({samples:s} as unknown as Live);

test('etiketler cizim sirasiyla, tekrarsiz; ad yoksa etiket adi',()=>{
 const r=runtimeRows(screen,config,live({m0:{value:true,quality:'good'},t1:{value:21.456,quality:'good'}}));
 assert.deepEqual(r.map(x=>x.key),['m0','t1']);
 assert.equal(r[0].label,'Pompa 1');assert.equal(r[0].text,'AÇIK');assert.equal(r[0].tone,'on');
 assert.equal(r[1].label,'Ad t1');assert.match(r[1].text,/21,46 °C/);
});
test('bayat ve hatali veri deger gibi gosterilmez',()=>{
 const r=runtimeRows(screen,config,live({m0:{value:true,quality:'stale'},t1:{value:5,quality:'bad'}}));
 assert.equal(r[0].text,'Bayat');assert.equal(r[0].tone,'stale');
 assert.equal(r[1].text,'Okuma hatası');assert.equal(r[1].tone,'bad');
});
