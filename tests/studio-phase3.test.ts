import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {newWidget,validateScreen} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {variantsOf} from '../packages/symbols/catalog';
import {Symbol} from '../packages/symbols/Symbol';
import {SymbolDefs} from '../packages/symbols/defs';
import {Library} from '../packages/symbols/Library';
import {BACKDROP_VARIANTS} from '../packages/symbols/render/backdrops';
import {buildScreenTemplate,screenTemplates} from '../packages/screen-model/screenTemplates';

test('5 vektorel tesis altligi seffaf SVG olarak render olur ve arka plan dikdortgeni cizmez',()=>{
 const variants=variantsOf('backdrop');
 assert.equal(variants.length,5);
 assert.equal(BACKDROP_VARIANTS.length,5);
 const rendered=new Set<string>();
 for(const v of BACKDROP_VARIANTS){
  const w={...newWidget('backdrop'),variant:v.key,labelVisible:false};
  const html=renderToStaticMarkup(createElement(Symbol,{w,value:true,quality:'good',samples:{}}));
  assert.match(html,/class="symbol-backdrop"/);
  assert.match(html,/class="scada-symbol backdrop-svg"/);
  assert.match(html,/viewBox="0 0 640 360"/);
  assert.match(html,/fill="none"/);
  assert.ok(!/<rect[^>]*width="640"[^>]*height="360"/.test(html),v.key+': tam tuval opak dikdörtgen çizmemeli');
  assert.ok(!html.includes('NaN')&&!html.includes('undefined'),v.key+': NaN/undefined içermemeli');
  rendered.add(html.replace(/(id="|url\(#)[a-z]?[0-9a-f-]{8,}/gi,'$1X'));
 }
 assert.equal(rendered.size,5,'5 tesis altlığı birbirinden farklı SVG üretmeli');
});

test('5 hazir ekran sablonu gecerli Screen belgesi uretir ve sinirlar icindedir',()=>{
 assert.equal(screenTemplates.length,5);
 for(const meta of screenTemplates){
  const screen=buildScreenTemplate(meta.id,'tpl-'+meta.id);
  assert.equal(screen.symbolStyle,'detailed');
  assert.equal(screen.background,'');
  assert.ok(screen.widgets.length>=8,meta.id+': en az 8 widget içermeli');
  assert.equal(screen.widgets[0].type,'backdrop',meta.id+': ilk katman kilitli altlık olmalı');
  assert.equal(screen.widgets[0].locked,true);
  assert.equal(screen.widgets[0].variant,meta.backdropVariant);
  for(const w of screen.widgets){
   assert.ok(w.x>=0&&w.y>=0&&w.x+w.width<=screen.width&&w.y+w.height<=screen.height,meta.id+' / '+w.type+': tuval sınırları içinde kalmalı');
   assert.equal(w.tagId,'',meta.id+': uydurma tagId olmamalı');
   assert.equal(w.commandId,'',meta.id+': uydurma commandId olmamalı');
  }
  assert.doesNotThrow(()=>validateScreen(structuredClone(screen),seedConfig),meta.id+': validateScreen geçmeli');
 }
});

test('Detayli sembol cilasi sym-bezel, sym-glass ve olcum cam pariltisini tasir',()=>{
 const defsHtml=renderToStaticMarkup(createElement(SymbolDefs));
 assert.match(defsHtml,/id="sym-bezel"/);
 assert.match(defsHtml,/id="sym-glass"/);
 const gaugeHtml=renderToStaticMarkup(createElement(Symbol,{w:newWidget('gauge'),value:48,quality:'good',samples:{}}));
 assert.match(gaugeHtml,/class="zbezel"/);
 assert.match(gaugeHtml,/class="zglass"/);
});

test('Library Detayli stil sinifini tasir ve ic ice etkilesimli oge uretmez',()=>{
 const html=renderToStaticMarkup(createElement(Library,{onAdd:()=>{},onEquipment:()=>{},symbolStyle:'detailed',initialOpen:['EKİPMAN']}));
 assert.match(html,/palette-scroll library-scroll sym-detailed/);
 assert.match(html,/class="library-preview" aria-hidden="true" inert=""/);
});

test('style.css acik ve koyu temalarda --bd-* tesis altligi tokenlarini tanimlar',()=>{
 const css=fs.readFileSync('apps/web/src/style.css','utf8');
 const darkIdx=css.indexOf('[data-theme=dark]');
 const lightBlock=css.slice(0,darkIdx);
 const darkBlock=css.slice(darkIdx,css.indexOf('/* Temel tipografi'));
 for(const token of ['--bd-shell-hi','--bd-shell-mid','--bd-shell-lo','--bd-cutaway','--bd-line','--bd-cool','--bd-warm','--bd-label']){
  assert.ok(lightBlock.includes(token+':'),token+' açık temada tanımlı olmalı');
  assert.ok(darkBlock.includes(token+':'),token+' koyu temada tanımlı olmalı');
 }
});
