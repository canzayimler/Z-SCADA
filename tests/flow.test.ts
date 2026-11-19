import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Symbol} from '../packages/symbols/Symbol';
import {newWidget,type Widget} from '../packages/contracts/model';
/* G10: boruda akis bir ac/kapa degildir. Isaretli debi hem YONU hem HIZI
 * tasir. Bu dosya, olculen debinin cizime gercekten yansidigini ve veri
 * okunamadiginda akisin DURDUGUNU dogrular — akan bir boru "her sey yolunda"
 * der, oysa veri yoktur. */
type Reading={value:boolean|number|null;quality:string};
const flowWidget=(type:'pipe'|'duct',patch:Partial<Widget>={}):Widget=>
 ({...newWidget(type),min:0,max:100,bindings:[{role:'flow',tagId:'f1',invert:false}],...patch});
const draw=(w:Widget,samples:Record<string,Reading>)=>
 renderToStaticMarkup(createElement(Symbol,{w,value:null,quality:'unknown',samples}));
const good=(value:number)=>({f1:{value,quality:'good'}});
const animated=(html:string)=>/class="[^"]*\bflow\b[^"]*"/.test(html);

for(const type of ['pipe','duct'] as const){
 test(type+': measured flow drives direction and motion',()=>{
  const w=flowWidget(type);
  const forward=draw(w,good(40)),backward=draw(w,good(-40)),still=draw(w,good(0));
  assert.ok(animated(forward),'ileri akis hareket etmiyor');
  assert.ok(animated(backward),'geri akis hareket etmiyor');
  assert.notEqual(forward,backward,'ileri ve geri akis ayni cizildi');
  assert.ok(!animated(still),'sifir debide hareket var');
  assert.notEqual(forward,still,'sifir debi akan boruyla ayni');
 });
 test(type+': unreadable flow stops the animation and is not drawn as calm flow',()=>{
  const w=flowWidget(type);
  const bad=draw(w,{f1:{value:40,quality:'bad'}});
  const missing=draw(w,{});
  const still=draw(w,good(0));
  assert.ok(!animated(bad),'kotu veride hareket var');
  assert.ok(!animated(missing),'okunmamis etikette hareket var');
  assert.notEqual(bad,still,'kotu veri "akis yok" ile ayni cizildi');
  assert.notEqual(missing,still,'okunmamis etiket "akis yok" ile ayni cizildi');
 });
 test(type+': animation setting still wins over a healthy flow',()=>{
  const w=flowWidget(type,{animated:false});
  assert.ok(!animated(draw(w,good(80))),'hareket kapaliyken akis animasyonu cizildi');
 });
}
test('a pipe without a flow binding keeps the old single-tag behaviour',()=>{
 const w:Widget={...newWidget('pipe'),tagId:'t1'};
 const on=renderToStaticMarkup(createElement(Symbol,{w,value:true,quality:'good',samples:{}}));
 const off=renderToStaticMarkup(createElement(Symbol,{w,value:false,quality:'good',samples:{}}));
 assert.ok(animated(on),'tekil etiketle acik boru hareket etmiyor');
 assert.ok(!animated(off),'tekil etiketle kapali boru hareket ediyor');
});
test('flow magnitude is independent of the drawn markup, direction is not',()=>{
 // Hiz CSS degiskeniyle (Studio tarafinda) surulur; cizimde yalniz yon degisir.
 const w=flowWidget('pipe');
 assert.equal(draw(w,good(10)),draw(w,good(90)),'hiz cizimi degistirmemeli');
 assert.notEqual(draw(w,good(10)),draw(w,good(-10)),'yon cizimi degistirmeli');
});
