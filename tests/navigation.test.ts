import {test} from 'node:test';
import assert from 'node:assert/strict';
import {screenTree,sortScreens,type ScreenRecord} from '../packages/contracts/model';
import {seedScreen} from '../packages/contracts/seed';

function record(id:string,name:string,folder:string,order:number):ScreenRecord{
 return {id,name,folder,order,version:1,publishedVersion:0,draft:{...structuredClone(seedScreen),id,name},published:null};
}

test('screen navigation orders root first and groups the remaining screens by folder',()=>{
 const screens=[record('boiler','Kazan','Üretim',2),record('home','Genel','',5),record('pump','Pompalar','Üretim',1),record('lab','Laboratuvar','Kalite',0)];
 assert.deepEqual(sortScreens(screens).map(s=>s.id),['home','lab','pump','boiler']);
 assert.deepEqual(screenTree(screens).map(g=>[g.folder,g.screens.map(s=>s.id)]),[
  ['', ['home']],['Kalite',['lab']],['Üretim',['pump','boiler']]
 ]);
});
