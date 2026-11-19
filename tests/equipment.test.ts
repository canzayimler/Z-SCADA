import {test} from 'node:test';
import assert from 'node:assert/strict';
import {equipmentTypeSchema,validateEquipmentTypes,instantiateEquipment,applyEquipmentBindings,unboundEquipmentInputs,validateScreen,newWidget} from '../packages/contracts/model';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {portsOf} from '../packages/screen-model/ports';

const makeType=()=>equipmentTypeSchema.parse({
 id:'motor-a',name:'Motor A',
 inputs:[{key:'run',label:'Çalışıyor',kind:'bool'},{key:'speed',label:'Hız',kind:'number'},{key:'start',label:'Başlat',kind:'command'}],
 widgets:[
  {...newWidget('indicator',10,10),bindTag:'run'},
  {...newWidget('numeric-input',10,140),bindTag:'speed'},
  {...newWidget('button',10,260),bindCommand:'start'}
 ]
});
const makeIdGen=()=>{let n=0;return ()=>'gen-'+(n++);};

test('validateEquipmentTypes rejects duplicate ids, duplicate input keys and unresolved bindings',()=>{
 const t=makeType();
 assert.doesNotThrow(()=>validateEquipmentTypes([t]));
 assert.throws(()=>validateEquipmentTypes([t,structuredClone(t)]),/tekrarlanıyor/);
 const dupInput=structuredClone(t);dupInput.inputs.push({key:'run',label:'Yine',kind:'bool'});
 assert.throws(()=>validateEquipmentTypes([dupInput]),/tekrarlanıyor/);
 const badBindTag=structuredClone(t);badBindTag.widgets[0].bindTag='yok';
 assert.throws(()=>validateEquipmentTypes([badBindTag]));
 const badBindCommand=structuredClone(t);badBindCommand.widgets[2].bindCommand='yok';
 assert.throws(()=>validateEquipmentTypes([badBindCommand]));
 const commandAsBindTag=structuredClone(t);commandAsBindTag.widgets[0].bindTag='start';
 assert.throws(()=>validateEquipmentTypes([commandAsBindTag]));
 const nonCommandAsBindCommand=structuredClone(t);nonCommandAsBindCommand.widgets[2].bindCommand='run';
 assert.throws(()=>validateEquipmentTypes([nonCommandAsBindCommand]));
});
test('instantiateEquipment assigns fresh ids, a shared group/equipment id and preserves relative layout',()=>{
 const type=makeType();
 const widgets=instantiateEquipment(type,'inst-1',500,500,makeIdGen());
 assert.equal(widgets.length,3);
 assert.equal(new Set(widgets.map(w=>w.id)).size,3);
 for(const w of widgets)assert.ok(!type.widgets.some(tw=>tw.id===w.id));
 assert.equal(new Set(widgets.map(w=>w.groupId)).size,1);
 assert.ok(widgets.every(w=>w.equipmentId==='inst-1'));
 assert.equal(widgets[0].x,500);assert.equal(widgets[0].y,500);
 assert.equal(widgets[1].x,500);assert.equal(widgets[1].y,630);
 assert.equal(widgets[2].x,500);assert.equal(widgets[2].y,750);
});
test('saved equipment templates retain safe symbol drawing and port behaviour in each instance',()=>{
 const pump={...newWidget('pump',10,20),width:240,height:200,color:'#208169'};
 const pipe={...newWidget('pipe',250,70),width:300,height:40,lineWidth:16};
 const type=equipmentTypeSchema.parse({id:'pump-set',name:'Pompa grubu',inputs:[],widgets:[pump,pipe]});
 const [instancePump,instancePipe]=instantiateEquipment(type,'pump-1',400,500,makeIdGen());
 assert.equal(instancePump.type,'pump');assert.equal(instancePump.color,pump.color);
 assert.equal(instancePipe.type,'pipe');assert.equal(instancePipe.lineWidth,pipe.lineWidth);
 assert.deepEqual(portsOf(instancePump).map(p=>p.axis),['h','h']);
 assert.deepEqual(portsOf(instancePipe).map(p=>p.axis),['h','h']);
});
test('applyEquipmentBindings writes matched bindings only onto member widgets and leaves unmatched inputs and outsiders alone',()=>{
 const type=makeType();
 const widgets=instantiateEquipment(type,'inst-1',0,0,makeIdGen());
 const outsider=newWidget('text');
 const screen={...structuredClone(seedScreen),widgets:[...widgets,outsider],equipment:[{id:'inst-1',typeId:type.id,typeVersion:1,name:'Motor 1',bindings:{run:'tag-m0',start:'cmd-tag-m0'}}]};
 const applied=applyEquipmentBindings(screen);
 const [ind,num,btn,out]=applied.widgets;
 assert.equal(ind.tagId,'tag-m0');
 assert.equal(num.tagId,'');
 assert.equal(btn.commandId,'cmd-tag-m0');
 assert.deepEqual(out,outsider);
});
test('unboundEquipmentInputs reports only unmapped inputs, and none without a resolvable type',()=>{
 const type=makeType();
 const instance={id:'inst-1',typeId:type.id,typeVersion:1,name:'Motor 1',bindings:{run:'tag-m0'}};
 const unbound=unboundEquipmentInputs(instance,type);
 assert.deepEqual(unbound.map(i=>i.key),['speed','start']);
 assert.deepEqual(unboundEquipmentInputs(instance,undefined),[]);
});
test('validateScreen rejects unresolved equipment instances, duplicate instance ids and dangling bindings',()=>{
 const type=makeType();
 const widgets=instantiateEquipment(type,'inst-1',0,0,makeIdGen());
 const config=structuredClone(seedConfig);
 const baseScreen={...structuredClone(seedScreen),widgets,equipment:[{id:'inst-1',typeId:type.id,typeVersion:1,name:'Motor 1',bindings:{run:'tag-m0',start:'cmd-tag-m0'}}]};
 assert.doesNotThrow(()=>validateScreen(structuredClone(baseScreen),config));
 const noInstance={...structuredClone(baseScreen),equipment:[]};
 assert.throws(()=>validateScreen(noInstance,config));
 const dupInstance={...structuredClone(baseScreen),equipment:[...structuredClone(baseScreen).equipment,structuredClone(baseScreen.equipment[0])]};
 assert.throws(()=>validateScreen(dupInstance,config));
 const badBinding=structuredClone(baseScreen);badBinding.equipment[0].bindings.run='yok';
 assert.throws(()=>validateScreen(badBinding,config));
});
