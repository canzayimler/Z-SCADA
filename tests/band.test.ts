import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Symbol} from '../packages/symbols/Symbol';
import {bandOf,bandMarks,hasBand} from '../packages/symbols/band';
import {panelSpec,auditCatalog,symbolTypes} from '../packages/symbols/catalog';
import {newWidget,type Widget} from '../packages/contracts/model';
/* G46/G47: isletme bandi ve setpoint bugune kadar YALNIZ dogrulaniyordu;
 * hicbir sembol cizmiyordu. Ayar var, karsiligi yok demek ekrana guveni
 * bozar. Bu testler karsiligin var oldugunu ve panelin yalnizca karsiligi
 * olan ayarlari gosterdigini tutar. */
const draw=(w:Widget,value:number|null,samples:Record<string,{value:number;quality:string}>={})=>
 renderToStaticMarkup(createElement(Symbol,{w,value,quality:value===null?'unknown':'good',samples}));
const scaled=(type:string,patch:Partial<Widget>={}):Widget=>({...newWidget(type as Widget['type']),min:0,max:100,...patch} as Widget);

test('bandOf degeri dogru banda koyar; okunamayan deger normal sayilmaz',()=>{
 const w={warnLow:20,warnHigh:80,limitLow:10,limitHigh:90};
 assert.equal(bandOf(w,50),'normal');
 assert.equal(bandOf(w,85),'warn');
 assert.equal(bandOf(w,95),'alarm');
 assert.equal(bandOf(w,15),'warn');
 assert.equal(bandOf(w,5),'alarm');
 assert.equal(bandOf(w,null),'unknown','veri yoksa "normal" denmez');
});
test('tek tarafli band da calisir; sinirsiz taraf asla alarm uretmez',()=>{
 const onlyHigh={warnLow:null,warnHigh:80,limitLow:null,limitHigh:90};
 assert.equal(bandOf(onlyHigh,-500),'normal');
 assert.equal(bandOf(onlyHigh,95),'alarm');
 assert.equal(hasBand(onlyHigh),true);
 assert.equal(hasBand({warnLow:null,warnHigh:null,limitLow:null,limitHigh:null}),false);
});
test('olcek disinda kalan sinir isaretlenmez',()=>{
 const marks=bandMarks({min:0,max:100,warnLow:-10,warnHigh:80,limitLow:null,limitHigh:120});
 assert.deepEqual(marks.map(m=>m.value),[80],'ölçek dışındaki sınırlar çizilmez');
 assert.equal(marks[0].kind,'warn');
 assert.ok(Math.abs(marks[0].ratio-0.8)<1e-9);
});

test('gosterge alarm limitini asinca alarm rengine doner',()=>{
 const w=scaled('gauge',{warnHigh:70,limitHigh:90,color:'#208169'});
 const normal=draw(w,50),alarm=draw(w,95),warn=draw(w,80);
 assert.ok(normal.includes('#208169'),'normal bantta sembolün kendi rengi');
 assert.ok(alarm.includes('--sym-alarm'),'alarm limitinin üstünde alarm rengi');
 assert.ok(warn.includes('--warn-text'),'uyarı bandında uyarı rengi');
});
test('bant sinirlari olcek uzerinde isaretlenir',()=>{
 const bare=draw(scaled('level-bar'),50);
 const marked=draw(scaled('level-bar',{warnHigh:70,limitHigh:90}),50);
 assert.ok(marked.length>bare.length,'sınır verilince ölçeğe işaret eklenir');
 assert.ok(marked.includes('--sym-alarm'),'alarm sınırı çizilir');
});
test('setpoint bagliysa hedef cizilir, bagli degilse hicbir sey eklenmez',()=>{
 const w=scaled('thermometer',{setpointTagId:'tag-sp'});
 const without=draw(w,40);
 const with_=draw(w,40,{'tag-sp':{value:70,quality:'good'}});
 assert.ok(with_.length>without.length,'hedef değer okunduğunda çizilir');
 const stale=draw(w,40,{'tag-sp':{value:70,quality:'bad'}});
 assert.equal(stale,without,'bayat hedef çizilmez — uydurma hedef gösterilmez');
});
test('bandsiz nesne eskisi gibi cizilir',()=>{
 const w=scaled('tank');
 assert.ok(draw(w,50).length>0);
 assert.ok(!draw(w,50).includes('--warn-text'),'sınır yokken uyarı rengi kullanılmaz');
});

test('panel speci her sembol turu icin uretilir ve katalog tutarli',()=>{
 assert.deepEqual(auditCatalog(),[],'katalog denetimi temiz olmalı');
 for(const type of symbolTypes){
  const spec=panelSpec(type);
  assert.equal(typeof spec.text,'boolean',type+': panel spec eksik');
  if(spec.band)assert.ok(spec.scale,type+': bant var ama ölçek yok');
  if(spec.setpoint)assert.ok(spec.band,type+': setpoint var ama bant yok');
 }
});
test('panel yalnizca karsiligi olan ayari gosterir',()=>{
 assert.equal(panelSpec('text').motion,false,'metinde animasyon ayarı yok');
 assert.equal(panelSpec('text').scale,false,'metinde ölçek yok');
 assert.equal(panelSpec('pipe').text,false,'düz boru etiket çizmez');
 assert.equal(panelSpec('pipe').line,true,'boruda kalınlık var');
 assert.equal(panelSpec('gauge').band,true);
 assert.equal(panelSpec('gauge').line,false,'göstergede hat kalınlığı yok');
 assert.equal(panelSpec('motor').motion,true);
 assert.equal(panelSpec('pump').variants,true,'pompanın gövde varyantları var');
});
