import {test} from 'node:test';
import assert from 'node:assert/strict';
import {equipmentTypeSchema,validateEquipmentTypes,applyEquipmentBindings,newWidget} from '../packages/contracts/model';
import {seedScreen} from '../packages/contracts/seed';

/* K03: applyEquipmentBindings artik sadece widget-seviyesi bindTag/bindCommand degil,
 * kademe (parts), adlandirilmis saha bagi (bindings) ve bilgi satiri (details) ile
 * gorunurluk (bindVisible) icin de instans girdilerini esler. */

const part=(bindTag?:string)=>({tagId:'',label:'',color:'#208169',value:0,upper:null,expected:true,...(bindTag?{bindTag}:{})});
const binding=(role:string,bindTag?:string)=>({role,tagId:'',invert:false,...(bindTag?{bindTag}:{})});
const detail=(kind:'value'|'command',bindTag?:string,bindCommand?:string)=>({kind,tagId:'',commandId:'',label:'',unit:'',decimals:-1,action:'on' as const,setValue:0,onText:'AÇIK',offText:'KAPALI',...(bindTag?{bindTag}:{}),...(bindCommand?{bindCommand}:{})});

test('applyEquipmentBindings fills part-level bindTag from instance bindings and leaves unbound parts untouched',()=>{
 const w={...newWidget('indicator',10,10),equipmentId:'inst-1',parts:[part('run'),part()]};
 const screen={...structuredClone(seedScreen),widgets:[w],equipment:[{id:'inst-1',typeId:'t',typeVersion:1,name:'I1',bindings:{run:'tag-run'}}]};
 const [applied]=applyEquipmentBindings(screen).widgets;
 assert.equal(applied.parts[0].tagId,'tag-run');
 assert.deepEqual(applied.parts[1],part());
});
test('applyEquipmentBindings fills A1 named field bindings (bindings[i].bindTag)',()=>{
 const w={...newWidget('motor',10,10),equipmentId:'inst-1',bindings:[binding('running','run'),binding('fault')]};
 const screen={...structuredClone(seedScreen),widgets:[w],equipment:[{id:'inst-1',typeId:'t',typeVersion:1,name:'I1',bindings:{run:'tag-run'}}]};
 const [applied]=applyEquipmentBindings(screen).widgets;
 assert.equal(applied.bindings[0].tagId,'tag-run');
 assert.deepEqual(applied.bindings[1],binding('fault'));
});
test('applyEquipmentBindings fills detail value rows (bindTag) and command rows (bindCommand)',()=>{
 const w={...newWidget('info',10,10),equipmentId:'inst-1',details:[detail('value','run'),detail('command',undefined,'start'),detail('value')]};
 const screen={...structuredClone(seedScreen),widgets:[w],equipment:[{id:'inst-1',typeId:'t',typeVersion:1,name:'I1',bindings:{run:'tag-run',start:'cmd-start'}}]};
 const [applied]=applyEquipmentBindings(screen).widgets;
 assert.equal(applied.details[0].tagId,'tag-run');
 assert.equal(applied.details[1].commandId,'cmd-start');
 assert.deepEqual(applied.details[2],detail('value'));
});
test('applyEquipmentBindings fills widget-level bindVisible into visibleTagId',()=>{
 const w={...newWidget('indicator',10,10),equipmentId:'inst-1',bindVisible:'vis'};
 const screen={...structuredClone(seedScreen),widgets:[w],equipment:[{id:'inst-1',typeId:'t',typeVersion:1,name:'I1',bindings:{vis:'tag-vis'}}]};
 const [applied]=applyEquipmentBindings(screen).widgets;
 assert.equal(applied.visibleTagId,'tag-vis');
});
test('applyEquipmentBindings resolves an unbound input key to empty string, never undefined or stale',()=>{
 const w={...newWidget('indicator',10,10),equipmentId:'inst-1',tagId:'stale-value',parts:[part('speed')],bindVisible:'vis'};
 const screen={...structuredClone(seedScreen),widgets:[w],equipment:[{id:'inst-1',typeId:'t',typeVersion:1,name:'I1',bindings:{}}]};
 const [applied]=applyEquipmentBindings(screen).widgets;
 assert.equal(applied.parts[0].tagId,'');
 assert.notEqual(applied.parts[0].tagId,undefined);
 assert.equal(applied.visibleTagId,'');
});
test('applyEquipmentBindings still fills the pre-existing widget-level bindTag/bindCommand (regression)',()=>{
 const w={...newWidget('indicator',10,10),equipmentId:'inst-1',bindTag:'run'};
 const btn={...newWidget('button',10,140),equipmentId:'inst-1',bindCommand:'start'};
 const screen={...structuredClone(seedScreen),widgets:[w,btn],equipment:[{id:'inst-1',typeId:'t',typeVersion:1,name:'I1',bindings:{run:'tag-run',start:'cmd-start'}}]};
 const [appliedInd,appliedBtn]=applyEquipmentBindings(screen).widgets;
 assert.equal(appliedInd.tagId,'tag-run');
 assert.equal(appliedBtn.commandId,'cmd-start');
});

const makeFullType=()=>equipmentTypeSchema.parse({
 id:'full-type',name:'Tam tip',
 inputs:[{key:'run',label:'Çalışıyor',kind:'bool'},{key:'spd',label:'Hız',kind:'number'},{key:'start',label:'Başlat',kind:'command'}],
 widgets:[
  {...newWidget('motor',10,10),bindVisible:'run',parts:[part('run')],bindings:[binding('running','spd')],details:[detail('value','run'),detail('command',undefined,'start')]}
 ]
});
test('validateEquipmentTypes accepts a fully declared type',()=>{
 assert.doesNotThrow(()=>validateEquipmentTypes([makeFullType()]));
});
test('validateEquipmentTypes rejects a part bindTag naming an undeclared input',()=>{
 const t=makeFullType();t.widgets[0].parts[0].bindTag='missing';
 assert.throws(()=>validateEquipmentTypes([t]),/tanımlı değil/);
});
test('validateEquipmentTypes rejects a binding bindTag naming an undeclared input',()=>{
 const t=makeFullType();t.widgets[0].bindings[0].bindTag='missing';
 assert.throws(()=>validateEquipmentTypes([t]),/tanımlı değil/);
});
test('validateEquipmentTypes rejects a detail bindTag naming an undeclared input',()=>{
 const t=makeFullType();t.widgets[0].details[0].bindTag='missing';
 assert.throws(()=>validateEquipmentTypes([t]),/tanımlı değil/);
});
test('validateEquipmentTypes rejects a bindVisible naming an undeclared input',()=>{
 const t=makeFullType();t.widgets[0].bindVisible='missing';
 assert.throws(()=>validateEquipmentTypes([t]),/tanımlı değil/);
});
test('validateEquipmentTypes rejects a detail bindCommand naming a non-command input',()=>{
 const t=makeFullType();t.widgets[0].details[1].bindCommand='run';
 assert.throws(()=>validateEquipmentTypes([t]),/komut girdisi tanımlı değil/);
});
