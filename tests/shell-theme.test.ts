import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {seedConfig} from '../packages/contracts/seed';
import {utilityDemoScreen} from '../packages/contracts/demo';

const root=new URL('../',import.meta.url);

test('koyu antrasit sol ray ve arduvaz koyu tema tokenlari tanimli',()=>{
 const css=fs.readFileSync(new URL('apps/web/src/style.css',root),'utf8');
 const darkIdx=css.indexOf('[data-theme=dark]');
 assert.ok(darkIdx>0,'dark tema blogu bulunamadi');
 const lightBlock=css.slice(0,darkIdx);
 const darkBlock=css.slice(darkIdx,css.indexOf('/* Temel tipografi'));
 assert.match(lightBlock,/--nav-bg:\s*#13171c/);
 assert.match(lightBlock,/--nav-surface:\s*#1a2027/);
 assert.match(darkBlock,/--app:\s*#1e242b/);
 assert.match(darkBlock,/--card:\s*#262d36/);
 assert.match(darkBlock,/--nav-bg:\s*#161b22/);
 assert.match(darkBlock,/--nav-surface:\s*#1d242d/);
 for(const selector of ['.project-switch{','.gateway-mini{']){
  const start=css.indexOf(selector);
  assert.ok(start>0,`${selector} bulunamadi`);
  const block=css.slice(start,css.indexOf('}',start));
  assert.match(block,/background:\s*var\(--nav-surface\)/);
  assert.ok(!block.includes('var(--card)'),`${selector} var(--card) kullanmamali`);
 }
});

test('sembol metinleri koyu tema ve bant renkleriyle uyumlu',()=>{
 const motion=fs.readFileSync(new URL('apps/web/src/motion.css',root),'utf8');
 assert.match(motion,/\.sym-detailed\s+\.scada-symbol\s+\.zt:not\(\.zt-keep\)/);
 const valves=fs.readFileSync(new URL('packages/symbols/render/valves.tsx',root),'utf8');
 const controlStart=valves.indexOf('const control:Renderer');
 const controlEnd=valves.indexOf('const gate:Renderer');
 const controlBlock=valves.slice(controlStart,controlEnd);
 const bottomLabel=controlBlock.slice(controlBlock.indexOf('y="95"')-40,controlBlock.indexOf('y="95"')+60);
 assert.ok(!bottomLabel.includes('className="zt"'),'kontrol vanasi alt etiketi .zt tasimamali');
 const measure=fs.readFileSync(new URL('packages/symbols/render/measure.tsx',root),'utf8');
 assert.match(measure,/zt-keep/);
});

test('utilityDemoScreen sabit koyu zemin kullanmaz ve detayli stili secer',()=>{
 const demo=utilityDemoScreen(seedConfig);
 assert.equal(demo.background,'');
 assert.equal(demo.symbolStyle,'detailed');
});

test('giris vitrini raster gorsel yerine seffaf SVG semasi kullanir',()=>{
 assert.equal(fs.existsSync(new URL('apps/web/public/login-visual.jpg',root)),false);
 const schematic=fs.readFileSync(new URL('apps/web/src/LoginSchematic.tsx',root),'utf8');
 assert.match(schematic,/export function LoginSchematic/);
 assert.match(schematic,/<svg[^>]+fill="none"/);
 const mainTsx=fs.readFileSync(new URL('apps/web/src/main.tsx',root),'utf8');
 assert.match(mainTsx,/<LoginSchematic\/>/);
});
