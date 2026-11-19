import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Library} from '../packages/symbols/Library';
import {symbolGroupsOf} from '../packages/symbols/catalog';
/* Denetim 2026-11-18: sayısal tuş takımı önizlemesi <button> kart içinde 14 <button> çiziyordu
 * (geçersiz HTML). Kart artık düğme değil; önizleme inert. Etiket yığınıyla iç içe denetim. */
function nestedInteractive(html:string):string[]{
 const bad:string[]=[],stack:string[]=[];
 const re=/<(\/?)(button|a|input|select|textarea)\b[^>]*?(\/?)>/g;let m;
 while((m=re.exec(html))){const [,close,tag,self]=m;
  if(close){stack.pop();continue;}
  if(stack.length)bad.push(stack.join('>')+'>'+tag);
  if(!self&&!['input'].includes(tag))stack.push(tag);}
 return bad;
}
test('kutuphane kartlari ic ice etkilesimli oge icermez (tus takimi dahil)',()=>{
 const html=renderToStaticMarkup(createElement(Library,{onAdd:()=>{},onEquipment:()=>{},initialOpen:symbolGroupsOf('tr').map(g=>g.key)}));
 assert.match(html,/library-pick/);
 assert.ok(html.includes('keypad-widget'),'tus takimi onizlemesi cizilmeli');
 assert.deepEqual(nestedInteractive(html),[]);
 assert.match(html,/class="library-preview" aria-hidden="true" inert=""/);
});
