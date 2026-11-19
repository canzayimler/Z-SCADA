import {test} from 'node:test';
import assert from 'node:assert/strict';
import {equipmentTypeSchema,equipmentDrift,upgradeEquipmentInstance,reviseEquipmentType,instantiateEquipment,newWidget,addLink,pruneLinks} from '../packages/contracts/model';
import {seedScreen} from '../packages/contracts/seed';
import type {Screen} from '../packages/contracts/model';

const makeType=(version=1)=>equipmentTypeSchema.parse({
 id:'motor-a',name:'Motor A',version,
 inputs:[{key:'run',label:'Çalışıyor',kind:'bool'},{key:'speed',label:'Hız',kind:'number'},{key:'start',label:'Başlat',kind:'command'}],
 widgets:[
  {...newWidget('indicator',10,10),bindTag:'run'},
  {...newWidget('numeric-input',10,140),bindTag:'speed'},
  {...newWidget('button',10,260),bindCommand:'start'}
 ]
});
const makeIdGen=()=>{let n=0;return ()=>'gen-'+(n++);};

test('equipmentDrift reports nothing when every instance is at the type version',()=>{
 const type=makeType(1);
 const screen:Screen={...structuredClone(seedScreen),equipment:[{id:'inst-1',typeId:type.id,typeVersion:1,name:'Motor 1',bindings:{}}]};
 assert.deepEqual(equipmentDrift(screen,[type]),[]);
});
test('equipmentDrift reports instances whose type has a higher version',()=>{
 const type=makeType(3);
 const screen:Screen={...structuredClone(seedScreen),equipment:[{id:'inst-1',typeId:type.id,typeVersion:1,name:'Motor 1',bindings:{}}]};
 assert.deepEqual(equipmentDrift(screen,[type]),[{instanceId:'inst-1',name:'Motor 1',typeId:'motor-a',from:1,to:3}]);
});
test('equipmentDrift ignores instances whose type has been deleted',()=>{
 const screen:Screen={...structuredClone(seedScreen),equipment:[{id:'inst-1',typeId:'gone',typeVersion:1,name:'Motor 1',bindings:{}}]};
 assert.doesNotThrow(()=>equipmentDrift(screen,[]));
 assert.deepEqual(equipmentDrift(screen,[]),[]);
});
test('equipmentDrift reports nothing when the instance version is ahead of the type',()=>{
 const type=makeType(1);
 const screen:Screen={...structuredClone(seedScreen),equipment:[{id:'inst-1',typeId:type.id,typeVersion:5,name:'Motor 1',bindings:{}}]};
 assert.deepEqual(equipmentDrift(screen,[type]),[]);
});

test('upgradeEquipmentInstance replaces members, keeps origin/bindings and bumps typeVersion, re-applying bindings',()=>{
 const oldType=makeType(1);
 const idGen=makeIdGen();
 const widgets=instantiateEquipment(oldType,'inst-1',300,400,idGen);
 const screen:Screen={...structuredClone(seedScreen),widgets,
  equipment:[{id:'inst-1',typeId:oldType.id,typeVersion:1,name:'Motor 1',bindings:{run:'tag-m0',start:'cmd-tag-m0'}}]};
 const newType=makeType(2);
 const next=upgradeEquipmentInstance(screen,'inst-1',newType,idGen);
 const members=next.widgets.filter(w=>w.equipmentId==='inst-1');
 assert.equal(members.length,3);
 assert.equal(Math.min(...members.map(w=>w.x)),300);
 assert.equal(Math.min(...members.map(w=>w.y)),400);
 assert.equal(next.equipment[0].typeVersion,2);
 assert.deepEqual(next.equipment[0].bindings,{run:'tag-m0',start:'cmd-tag-m0'});
 const ind=members.find(w=>w.type==='indicator')!;
 assert.equal(ind.tagId,'tag-m0');
 const btn=members.find(w=>w.type==='button')!;
 assert.equal(btn.commandId,'cmd-tag-m0');
 // ids of the members are new, not reused from the old instance
 for(const w of members)assert.ok(!widgets.some(old=>old.id===w.id));
});

test('upgradeEquipmentInstance drops links to replaced widgets but keeps links between untouched widgets',()=>{
 const oldType=makeType(1);
 const idGen=makeIdGen();
 const widgets=instantiateEquipment(oldType,'inst-1',0,0,idGen);
 const outsiderA=newWidget('text',900,900);
 const outsiderB=newWidget('text',950,950);
 let screen:Screen={...structuredClone(seedScreen),widgets:[...widgets,outsiderA,outsiderB],
  equipment:[{id:'inst-1',typeId:oldType.id,typeVersion:1,name:'Motor 1',bindings:{}}]};
 screen=addLink(screen,{fromWidgetId:widgets[0].id,fromPort:0,toWidgetId:widgets[1].id,toPort:0});
 screen=addLink(screen,{fromWidgetId:outsiderA.id,fromPort:0,toWidgetId:outsiderB.id,toPort:0});
 assert.equal(screen.links.length,2);
 const newType=makeType(2);
 const next=upgradeEquipmentInstance(screen,'inst-1',newType,idGen);
 assert.equal(next.links.length,1);
 assert.ok(next.links.some(l=>l.fromWidgetId===outsiderA.id&&l.toWidgetId===outsiderB.id));
 assert.ok(!next.links.some(l=>widgets.some(w=>w.id===l.fromWidgetId||w.id===l.toWidgetId)));
});

test('upgradeEquipmentInstance is a no-op for unknown instance id, mismatched type id, or no members',()=>{
 const type=makeType(1);
 const widgets=instantiateEquipment(type,'inst-1',0,0,makeIdGen());
 const screen:Screen={...structuredClone(seedScreen),widgets,
  equipment:[{id:'inst-1',typeId:type.id,typeVersion:1,name:'Motor 1',bindings:{}}]};
 const newType=makeType(2);
 assert.deepEqual(upgradeEquipmentInstance(screen,'unknown',newType,makeIdGen()),screen);
 const otherType=equipmentTypeSchema.parse({...structuredClone(newType),id:'other-type'});
 assert.deepEqual(upgradeEquipmentInstance(screen,'inst-1',otherType,makeIdGen()),screen);
 const noMembers:Screen={...structuredClone(seedScreen),widgets:[],
  equipment:[{id:'inst-1',typeId:type.id,typeVersion:1,name:'Motor 1',bindings:{}}]};
 assert.deepEqual(upgradeEquipmentInstance(noMembers,'inst-1',newType,makeIdGen()),noMembers);
});

test('reviseEquipmentType bumps version, keeps id/name/inputs, normalises origin and clears equipmentId/locked',()=>{
 const type=makeType(1);
 const editedWidgets=[
  {...type.widgets[0],x:510,y:610,equipmentId:'inst-1',locked:true},
  {...type.widgets[1],x:510,y:740,equipmentId:'inst-1',locked:true},
  {...type.widgets[2],x:510,y:860,equipmentId:'inst-1',locked:false}
 ];
 const revised=reviseEquipmentType(type,editedWidgets);
 assert.equal(revised.version,2);
 assert.equal(revised.id,type.id);
 assert.equal(revised.name,type.name);
 assert.deepEqual(revised.inputs,type.inputs);
 assert.equal(Math.min(...revised.widgets.map(w=>w.x)),0);
 assert.equal(Math.min(...revised.widgets.map(w=>w.y)),0);
 for(const w of revised.widgets){
  assert.equal(w.equipmentId,'');
  assert.equal(w.locked,false);
  assert.ok(w.equipmentRole);
 }
});
