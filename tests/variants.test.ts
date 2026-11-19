import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Symbol} from '../packages/symbols/Symbol';
import {catalog,variantsOf,variantKey} from '../packages/symbols/catalog';
import {newWidget,validateScreen,type Config,type Widget} from '../packages/contracts/model';
/* Govde varyantlari tek bir `variant` alaninda tasinir; her varyant icin ayri
 * sembol turu acmak katalogu sisirirdi. Bu dosya varyantin GERCEKTEN cizime
 * yansidigini dogrular: katalogda ilan edilip renderer'da dallanmamis bir
 * varyant, kullaniciya yalan soyleyen bir secenektir. */
const draw=(w:Widget)=>renderToStaticMarkup(createElement(Symbol,{w,value:62,quality:'good',samples:{}}));
/* Cizimdeki rastgele uretilen clipPath kimlikleri karsilastirmayi bozmasin. */
const stable=(html:string)=>html.replace(/(id="|url\(#)[a-z]?[0-9a-f-]{8,}/gi,'$1X');

test('variantKey falls back to the first declared variant',()=>{
 assert.equal(variantKey('tank',''),'cylindrical');
 assert.equal(variantKey('tank','bilinmeyen'),'cylindrical');
 assert.equal(variantKey('tank','cone'),'cone');
 assert.equal(variantKey('motor',''),'','varyantsiz tur bos donmeli');
 assert.equal(variantKey('bilinmeyen-tur','x'),'','bilinmeyen tur bos donmeli');
});
test('validateScreen refuses a variant the symbol does not declare',()=>{
 const config={revision:1,name:'T',connections:[],devices:[],tags:[],commands:[]} as unknown as Config;
 const screen=(w:Widget)=>({id:'s1',name:'Ekran',width:800,height:600,widgets:[w],equipment:[],scenarios:[],links:[],background:'',gridSize:10});
 assert.throws(()=>validateScreen(screen({...newWidget('tank'),variant:'yok-boyle'} as Widget),config),/varyantı yok/);
 assert.doesNotThrow(()=>validateScreen(screen({...newWidget('tank'),variant:'cone'} as Widget),config));
 assert.doesNotThrow(()=>validateScreen(screen({...newWidget('tank'),variant:''} as Widget),config));
 assert.throws(()=>validateScreen(screen({...newWidget('motor'),variant:'cone'} as Widget),config),/varyantı yok/);
});
test('every declared variant actually changes the drawing',()=>{
 const flat:string[]=[];
 for(const meta of catalog){
  const variants=variantsOf(meta.type);
  if(variants.length<2)continue;
  const drawn=new Map<string,string>();
  for(const v of variants){
   const html=stable(draw({...newWidget(meta.type as Widget['type']),variant:v.key} as Widget));
   assert.ok(html.length>0,meta.type+'/'+v.key+' cizilmedi');
   drawn.set(v.key,html);
  }
  const unique=new Set(drawn.values());
  if(unique.size!==variants.length){
   const duplicates=[...drawn.entries()].filter(([k,html])=>[...drawn.entries()].some(([k2,h2])=>k2!==k&&h2===html)).map(([k])=>k);
   flat.push(meta.type+': '+duplicates.join(' = '));
  }
 }
 assert.deepEqual(flat,[],'cizime yansimayan varyant: '+flat.join(' | '));
});
test('the default variant is what an unset variant renders',()=>{
 for(const meta of catalog){
  const variants=variantsOf(meta.type);
  if(!variants.length)continue;
  const unset=stable(draw({...newWidget(meta.type as Widget['type']),variant:''} as Widget));
  const first=stable(draw({...newWidget(meta.type as Widget['type']),variant:variants[0].key} as Widget));
  assert.equal(unset,first,meta.type+': bos varyant ilk varyantla ayni cizilmiyor');
 }
});
