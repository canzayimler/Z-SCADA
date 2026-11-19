import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Symbol} from '../packages/symbols/Symbol';
import {allowsStateRules,partTypes} from '../packages/symbols/catalog';
import {newWidget,validateScreen,type Config,type Widget,type Part} from '../packages/contracts/model';
/* K04: durum kurallari (kademeler) artik yalniz bes sembolde degil, salt
 * cizim olmayan her sembolde calisir. Kendi kademe cizimi olan semboller
 * kurallari kendileri yorumlar; digerlerinde kural VURGU RENGINI ve durum
 * yazisini surer — hicbir renderer degismek zorunda kalmaz. */
const rule=(label:string,color:string,value:number):Part=>({tagId:'',label,color,value,upper:null,expected:true});
const analogRules=(tagId:string):Partial<Widget>=>({
 mode:'analog',rangeMode:'threshold',tagId,
 parts:[rule('DURDU','#8a9ca9',0),rule('ÇALIŞIYOR','#208169',1),rule('ARIZA','#c0392b',2)]});
const draw=(w:Widget,value:number|boolean|null,quality:string)=>
 renderToStaticMarkup(createElement(Symbol,{w,value,quality,samples:{}}));

test('state rules are allowed on real symbols and refused on pure drawings',()=>{
 for(const t of ['text','rectangle','line','ellipse','arrow','callout','image','info','navigation',
  'trend','alarm-band','alarm-list','data-table','pid','slider','keypad','numeric-input','value'])
  assert.equal(allowsStateRules(t),false,t+': kural tasiyamamali');
 for(const t of ['tank','motor','valve','gauge','indicator','breaker','boiler'])
  assert.equal(allowsStateRules(t),true,t+': kural tasiyabilmeli');
 assert.equal(allowsStateRules('bilinmeyen-tur'),false,'bilinmeyen tur');
});
test('a symbol without its own state drawing paints the matched rule colour and caption',()=>{
 const w:Widget={...newWidget('tank'),...analogRules('t1')} as Widget;
 const stopped=draw(w,0,'good'),running=draw(w,1,'good'),faulted=draw(w,2,'good');
 assert.ok(stopped.includes('DURDU'),'eslesen kural yazisi yok');
 assert.ok(running.includes('ÇALIŞIYOR'),'ikinci kural yazisi yok');
 assert.ok(faulted.includes('ARIZA'),'ucuncu kural yazisi yok');
 assert.ok(running.includes('#208169'),'eslesen kuralin rengi kullanilmadi');
 assert.ok(faulted.includes('#c0392b'),'ariza rengi kullanilmadi');
 assert.notEqual(stopped,running,'farkli durumlar ayni cizildi');
 assert.notEqual(running,faulted,'farkli durumlar ayni cizildi');
});
test('an unreadable rule tag says so instead of showing a state',()=>{
 const w:Widget={...newWidget('tank'),...analogRules('t1')} as Widget;
 const unknown=draw(w,null,'bad');
 assert.ok(unknown.includes('BİLİNMİYOR'),'bilinmiyor yazisi yok');
 for(const value of [0,1,2])assert.notEqual(unknown,draw(w,value,'good'),'bilinmiyor bir durumla ayni cizildi');
});
test('a reading that matches no rule is reported, not silently drawn as normal',()=>{
 const w:Widget={...newWidget('tank'),mode:'analog',rangeMode:'range',tagId:'t1',
  parts:[{...rule('DÜŞÜK','#208169',0),upper:10}]} as Widget;
 const outside=draw(w,50,'good');
 assert.ok(outside.includes('EŞLEŞME YOK'),'eslesmeyen deger normal gibi cizildi');
});
test('symbols that draw their own states do not get the generic caption',()=>{
 const tank:Widget={...newWidget('tank'),...analogRules('t1')} as Widget;
 assert.ok(draw(tank,1,'good').includes('ÇALIŞIYOR'),'genel yazi tankta cizilmedi');
 for(const type of partTypes){
  const native:Widget={...newWidget(type as Widget['type']),...analogRules('t1')} as Widget;
  const html=draw(native,1,'good');
  // Kendi cizimi olan sembol kural adini kendi icinde gosterebilir; olmamasi
  // gereken sey, ustune bir de genel durum rozetinin binmesidir.
  const badges=(html.match(/ÇALIŞIYOR/g)||[]).length;
  assert.ok(badges<=1,type+': durum yazisi iki kez cizildi');
 }
});
test('a widget with no rules is untouched',()=>{
 const plain=newWidget('tank');
 const before=draw(plain,62,'good');
 const withRules:Widget={...plain,...analogRules('t1')} as Widget;
 assert.notEqual(before,draw(withRules,1,'good'),'kural eklemek cizimi degistirmedi');
 assert.equal(before,draw({...plain},62,'good'),'kuralsiz cizim kararsiz');
});
test('validateScreen refuses rules on a type that cannot carry them',()=>{
 const config={revision:1,name:'T',connections:[],devices:[],tags:[],commands:[]} as unknown as Config;
 const screen=(w:Widget)=>({id:'s1',name:'Ekran',width:800,height:600,widgets:[w],equipment:[],scenarios:[],links:[],background:'',gridSize:10});
 const bad:Widget={...newWidget('text'),parts:[rule('X','#208169',0)]} as Widget;
 assert.throws(()=>validateScreen(screen(bad),config),/durum kuralı taşıyamaz/);
 const good:Widget={...newWidget('tank'),parts:[rule('X','#208169',0)]} as Widget;
 assert.doesNotThrow(()=>validateScreen(screen(good),config));
});
