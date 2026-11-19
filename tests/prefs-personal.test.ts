import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preferencesSchema,defaultPreferences} from '../packages/contracts/model';

test('eski kayitli tercih yeni alanlarla sorunsuz acilir',()=>{
 const eski=preferencesSchema.parse({theme:'dark',language:'tr',density:'compact',homeScreenId:'',dashboard:[],panelColumns:4,panelPages:[]});
 assert.deepEqual(eski.alarmSound,{enabled:true,minSeverity:'info'});
 assert.equal(eski.kiosk.enabled,false);assert.equal(eski.kiosk.rotateSeconds,0);
 assert.deepEqual(eski.pinnedScreenIds,[]);assert.deepEqual(eski.savedFilters,[]);
 assert.equal(defaultPreferences.density,'comfortable');
});
test('kisisel alanlar dogrulanir',()=>{
 assert.equal(preferencesSchema.parse({density:'large'}).density,'large');
 assert.throws(()=>preferencesSchema.parse({kiosk:{enabled:true,rotateSeconds:-5}}));
 assert.throws(()=>preferencesSchema.parse({pinnedScreenIds:Array.from({length:13},(_,i)=>'s'+i)}),'en fazla 12 sabitleme');
 const f=preferencesSchema.parse({savedFilters:[{id:'f-1',name:'Hat 2',scope:'alarm.active',value:{severities:['critical']}}]});
 assert.equal(f.savedFilters[0].name,'Hat 2');
 assert.throws(()=>preferencesSchema.parse({savedFilters:[{id:'F 1',name:'x',scope:'alarm.active',value:{}}]}),'kimlik bicimi');
});
