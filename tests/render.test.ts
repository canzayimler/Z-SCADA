import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Symbol} from '../packages/symbols/Symbol';
import {newWidget,symbolTypes,type Widget} from '../packages/contracts/model';
import {renderers} from '../packages/symbols/render';
import {matchesSymbol} from '../packages/symbols/search';
/* A0 sonrasi guvenlik agi: her sembol turunun bir cizimi olmali ve cizim
 * asla patlamamalidir. Renderer tablosunda eksik kalan tur burada yakalanir. */
const draw=(w:Widget,value:boolean|number|null,quality:string)=>
 renderToStaticMarkup(createElement(Symbol,{w,value,quality,samples:{}}));
test('every symbol type renders markup in all three qualities', () => {
 for(const type of symbolTypes){
  const w=newWidget(type);
  for(const [value,quality] of [[true,'good'],[62,'good'],[null,'unknown'],[false,'bad']] as const){
   const html=draw(w,value,quality);
   assert.ok(html.length>0,type+' ('+quality+') bos cizildi');
   assert.ok(!html.includes('undefined'),type+' ('+quality+') ciziminde undefined var');
   assert.ok(!html.includes('NaN'),type+' ('+quality+') ciziminde NaN var');
  }
 }
});
test('label visibility and rotation do not break any symbol', () => {
 for(const type of symbolTypes){
  const w={...newWidget(type),labelVisible:false,rotation:45,flipX:true,flipY:true,animated:false};
  assert.ok(draw(w,true,'good').length>0,type+' etiketsiz cizilemedi');
 }
});
test('pipe family stretches its view box to the object size', () => {
 for(const type of ['pipe','elbow','tee','cross','reducer'] as const){
  const html=draw({...newWidget(type),width:240,height:60},true,'good');
  assert.ok(html.includes('viewBox="0 0 240 60"'),type+' goruntu kutusu gerilmedi');
  assert.ok(html.includes('pipe-symbol'),type+' boru sinifini kaybetti');
 }
});
test('an unknown reading marks the symbol with a question mark', () => {
 const w={...newWidget('motor'),tagId:'t1'};
 assert.ok(draw(w,null,'unknown').includes('>?</text>'),'bilinmiyor rozeti cizilmedi');
 assert.ok(!draw(w,true,'good').includes('>?</text>'),'saglam veride rozet cizildi');
});
test('every catalog type has a renderer', () => {
 const missing=symbolTypes.filter(t=>!renderers[t]);
 assert.deepEqual(missing,[],'cizimi olmayan tur: '+missing.join(', '));
});
test('no renderer is registered for a type that is not in the catalog', () => {
 const orphans=Object.keys(renderers).filter(t=>!(symbolTypes as readonly string[]).includes(t));
 assert.deepEqual(orphans,[],'katalogda olmayan cizim: '+orphans.join(', '));
});
test('library search finds symbols by synonym, english name and type key', () => {
 assert.ok(matchesSymbol('butterfly-valve','valf'),'es anlamli bulunamadi');
 assert.ok(matchesSymbol('butterfly-valve','kelebek'),'turkce ad bulunamadi');
 assert.ok(matchesSymbol('butterfly-valve','butterfly'),'ingilizce ad bulunamadi');
 assert.ok(matchesSymbol('breaker','kesici'),'salter es anlamlisi bulunamadi');
 assert.ok(matchesSymbol('instrument','ISA'),'balon es anlamlisi bulunamadi');
 assert.ok(matchesSymbol('pump','DALGIÇ'),'varyant adi bulunamadi');
 assert.ok(matchesSymbol('tank',''),'bos arama her seyi gostermeli');
 assert.ok(!matchesSymbol('tank','kelebek'),'alakasiz eslesme');
 assert.ok(matchesSymbol('cooling-tower','sogutma kulesi'),'cok kelimeli arama');
});
