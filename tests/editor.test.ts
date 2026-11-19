import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newWidget,widgetSchema,screenSchema,symbolGroups,symbolTypes,validateScreen,widgetTagReferenceFields} from '../packages/contracts/model';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {createEquipment,patchSelection,matchSize,commonValue,moveSelectionTo,arrangeWidgets} from '../packages/screen-model/editor';

test('legacy documents acquire appearance defaults without changing geometry',()=>{
 const w=widgetSchema.parse({id:'legacy',label:'Motor',type:'motor',x:31,y:44,width:150,height:120});
 assert.equal(w.opacity,1);assert.equal(w.animationSpeed,1);assert.equal(w.flipX,false);assert.equal(w.x,31);
 const s=screenSchema.parse({id:'legacy',name:'Legacy',width:1200,height:700,widgets:[w]});
 assert.equal(s.gridSize,10);assert.equal(s.background,'');
 assert.equal(widgetSchema.safeParse({...w,animationSpeed:0}).success,false);
});
test('screen scenarios are validated and persist with the screen document',()=>{
 const screen=screenSchema.parse({...structuredClone(seedScreen),scenarios:[{name:'Geri bildirim takıldı',values:{'tag-m0':true,'tag-m1':42},quality:{'tag-m0':'good','tag-m1':'stale'}}]});
 assert.equal(screen.scenarios[0].name,'Geri bildirim takıldı');
 assert.equal(screen.scenarios[0].quality['tag-m1'],'stale');
 assert.equal(screenSchema.safeParse({...screen,scenarios:[{name:'Hatalı',values:{x:Infinity},quality:{}}]}).success,false);
});
test('tag reference fields include conditional visibility and nested widget bindings',()=>{
 const config=structuredClone(seedConfig),widget=newWidget('info');
 config.commands.push({id:'cmd-reference',name:'Referans komutu',tagIds:['tag-m0'],feedbackTagIds:['tag-m1'],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''});
 widget.visibleCondition={op:'and',terms:[{op:'bool',tagId:'tag-m0',expected:true},{op:'bool',tagId:'tag-m1',expected:false}]};
 widget.parts=[{tagId:'tag-m0',label:'Durum',color:'#208169',value:0,upper:null,expected:true}];
 widget.details=[{kind:'command',tagId:'',commandId:'cmd-reference',label:'Kumanda',unit:'',decimals:-1,action:'on',setValue:0,onText:'A',offText:'K'}];
 const fields=widgetTagReferenceFields(widget,'tag-m0',config);
 assert.ok(fields.includes('gorunurluk kosulu'));assert.ok(fields.includes('kademe 1 etiketi'));assert.ok(fields.includes('bilgi satiri 1 komut hedefi'));
});
test('equipment instances have independent ids and no PLC bindings',()=>{
 const a=createEquipment('motor-control',10,20),b=createEquipment('motor-control',10,20);
 assert.equal(a.length,4);assert.equal(new Set([...a,...b].map(w=>w.id)).size,8);
 assert.equal(new Set(a.map(w=>w.groupId)).size,1);assert.notEqual(a[0].groupId,b[0].groupId);
 for(const w of [...a,...b]){assert.ok(!w.tagId);assert.ok(!w.commandId);}
});
test('batch formatting and matching sizes leave locked widgets untouched',()=>{
 const a=newWidget('motor'),b={...newWidget('pump'),locked:true},c=newWidget('valve');a.width=220;
 const ids=[a.id,b.id,c.id];const result=patchSelection([a,b,c],ids,{opacity:.5});
 assert.equal(result[1],b);assert.equal(result[2].opacity,.5);
 const sized=matchSize([a,b,c],ids,'width');assert.equal(sized[1],b);assert.equal(sized[2].width,220);
});
test('every symbol is discoverable in the library',()=>{
 assert.deepEqual([...new Set(symbolGroups.flatMap(g=>g.types))].sort(),[...symbolTypes].sort());
});
test('info button rows validate their tags and commands',()=>{
 const config=structuredClone(seedConfig);
 config.commands.push({id:'cmd-info',name:'Bilgi komutu',tagIds:['tag-m0'],feedbackTagIds:['tag-m0'],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''});
 const screen=structuredClone(seedScreen);
 const info=newWidget('info');info.label='Detay';
 screen.widgets=[info];
 const withRows=(details:any[])=>{info.details=details;return ()=>validateScreen(structuredClone(screen),config);};
 assert.throws(withRows([{kind:'value',tagId:'missing',commandId:'',label:'',unit:'',decimals:-1,action:'on',setValue:0,onText:'A',offText:'K'}]));
 assert.throws(withRows([{kind:'command',tagId:'',commandId:'yok',label:'',unit:'',decimals:-1,action:'on',setValue:0,onText:'A',offText:'K'}]));
 assert.throws(withRows([{kind:'command',tagId:'',commandId:'cmd-info',label:'',unit:'',decimals:-1,action:'toggle',setValue:0,onText:'A',offText:'K'}]),/geri bildirim/);
 assert.doesNotThrow(withRows([
  {kind:'value',tagId:'tag-m1',commandId:'',label:'Basınç',unit:'bar',decimals:1,action:'on',setValue:0,onText:'A',offText:'K'},
  {kind:'command',tagId:'tag-m0',commandId:'cmd-info',label:'Aç/kapa',unit:'',decimals:-1,action:'toggle',setValue:0,onText:'A',offText:'K'}]));
 assert.equal(newWidget('info').details.length,0);
});
/* Denetim 2026-11-18: çoklu seçimde panel etiket ve X'i yalnız ilk nesneye yazıyordu. */
test('commonValue: hepsi ayniysa deger, degilse undefined (karisik)',()=>{
 const a={...newWidget('button',10,20),id:'a'},b={...newWidget('button',30,20),id:'b'};
 assert.equal(commonValue([a,b],'y'),20);
 assert.equal(commonValue([a,b],'x'),undefined);
 assert.equal(commonValue([],'x'),undefined);
});
test('moveSelectionTo secimi butun olarak tasir, araliklari ve kilitlileri korur',()=>{
 const a={...newWidget('button',100,50),id:'a'},b={...newWidget('button',160,90),id:'b'},c={...newWidget('button',5,5),id:'c',locked:true},d={...newWidget('button',0,0),id:'d'};
 const out=moveSelectionTo([a,b,c,d],['a','b','c'],'x',40);
 const by=Object.fromEntries(out.map(w=>[w.id,w]));
 assert.equal(by.a.x,40);assert.equal(by.b.x,100,'aralik korunur');
 assert.equal(by.c.x,5,'kilitli kalir');assert.equal(by.d.x,0,'secilmeyen kalir');
 assert.equal(moveSelectionTo([a,b],['a','b'],'y',50)[1].y,90,'zaten yerinde: degismez');
});
/* Denetim 2026-11-18: "Yatay eşit aralık" aynı konumdaki nesneleri tuval dışına taşıyabiliyordu
 * (aralık negatif çıkıyordu). Aralık en az 0, sonuç tuval sınırına kıstırılır. */
test('arrangeWidgets: ust uste nesneler negatif konuma gitmez, tuvale sigar',()=>{
 const mk=(id:string,width:number)=>({...newWidget('button',5,5),id,width,height:40});
 const ws=[mk('a',20),mk('b',100),mk('c',100)];
 for(const kind of ['space','space-v'] as const){
  const out=arrangeWidgets(ws,['a','b','c'],kind,{width:1200,height:700});
  for(const w of out){assert.ok(w.x>=0&&w.y>=0,kind+' '+w.id+' '+w.x+','+w.y);assert.ok(w.x+w.width<=1200&&w.y+w.height<=700);}
  const key=kind==='space'?'x':'y',pos=out.map(w=>w[key]).sort((a,b)=>a-b);
  assert.ok(new Set(pos).size===3,'nesneler ayrisir: '+pos.join(','));
 }
 // sağ kenarda sığmayan sıra sola çekilir
 const edge=[{...mk('d',300),x:1100},{...mk('e',300),x:1100}];
 const out=arrangeWidgets(edge,['d','e'],'space',{width:1200,height:700});
 assert.deepEqual(out.map(w=>w.x),[600,900]);
});
test('arrangeWidgets: normal esit aralik ve hizalama eskisi gibi; kilitli yerinde',()=>{
 const a={...newWidget('button',0,0),id:'a',width:100},b={...newWidget('button',150,30),id:'b',width:100},c={...newWidget('button',500,60),id:'c',width:100},l={...newWidget('button',900,10),id:'l',locked:true};
 const sp=arrangeWidgets([a,b,c,l],['a','b','c','l'],'space',{width:1200,height:700});
 assert.deepEqual(sp.map(w=>w.x),[0,250,500,900]);
 const top=arrangeWidgets([a,b,c],['a','b','c'],'top',{width:1200,height:700});
 assert.deepEqual(top.map(w=>w.y),[0,0,0]);
 assert.equal(arrangeWidgets([a],['a'],'left',{width:1200,height:700})[0],a);
});
