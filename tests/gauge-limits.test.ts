import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateScreen,newWidget,widgetTagReferenceFields} from '../packages/contracts/model';
import {seedScreen} from '../packages/contracts/seed';
import type {Config} from '../packages/contracts/model';

const config:Config={revision:1,name:'Test projesi',connections:[],devices:[],commands:[],tags:[
 {id:'tag-num',deviceId:'plc-01',code:'NUM',name:'Sayısal',area:'holding-register',address:0,dataType:'float32',access:'readwrite',scale:1,offset:0,min:0,max:65535,unit:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,description:''},
 {id:'tag-bool',deviceId:'plc-01',code:'BOOL',name:'Dijital',area:'coil',address:0,dataType:'bool',access:'readwrite',scale:1,offset:0,min:0,max:65535,unit:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,description:''}
]};

const screenWith=(w:Record<string,unknown>)=>({...structuredClone(seedScreen),widgets:[{...newWidget('gauge'),...w}]});

test('a gauge with all four limit fields null passes',()=>{
 const s=screenWith({});
 assert.doesNotThrow(()=>validateScreen(s,config));
});
test('warnLow >= warnHigh is rejected, warnLow < warnHigh passes',()=>{
 assert.throws(()=>validateScreen(screenWith({warnLow:10,warnHigh:10}),config),/uyarı bandının alt sınırı üst sınırdan küçük olmalı/);
 assert.throws(()=>validateScreen(screenWith({warnLow:20,warnHigh:10}),config),/uyarı bandının alt sınırı üst sınırdan küçük olmalı/);
 assert.doesNotThrow(()=>validateScreen(screenWith({warnLow:10,warnHigh:20}),config));
});
test('limitLow >= limitHigh is rejected',()=>{
 assert.throws(()=>validateScreen(screenWith({limitLow:10,limitHigh:10}),config),/alarm limitlerinin alt sınırı üst sınırdan küçük olmalı/);
 assert.throws(()=>validateScreen(screenWith({limitLow:20,limitHigh:10}),config),/alarm limitlerinin alt sınırı üst sınırdan küçük olmalı/);
});
test('limitLow > warnLow is rejected, limitLow < warnLow passes',()=>{
 assert.throws(()=>validateScreen(screenWith({limitLow:15,warnLow:10,limitHigh:100,warnHigh:90}),config),/alt alarm limiti alt uyarı sınırının üstünde olamaz/);
 assert.doesNotThrow(()=>validateScreen(screenWith({limitLow:5,warnLow:10,limitHigh:100,warnHigh:90}),config));
});
test('limitHigh < warnHigh is rejected, limitHigh > warnHigh passes',()=>{
 assert.throws(()=>validateScreen(screenWith({limitLow:0,warnLow:10,warnHigh:90,limitHigh:80}),config),/üst alarm limiti üst uyarı sınırının altında olamaz/);
 assert.doesNotThrow(()=>validateScreen(screenWith({limitLow:0,warnLow:10,warnHigh:90,limitHigh:100}),config));
});
test('setting only one side of the band passes',()=>{
 assert.doesNotThrow(()=>validateScreen(screenWith({warnHigh:50}),config));
 assert.doesNotThrow(()=>validateScreen(screenWith({warnLow:50}),config));
 assert.doesNotThrow(()=>validateScreen(screenWith({limitLow:50}),config));
 assert.doesNotThrow(()=>validateScreen(screenWith({limitHigh:50}),config));
});
test('setpointTagId pointing at a missing tag is rejected',()=>{
 assert.throws(()=>validateScreen(screenWith({setpointTagId:'yok'}),config),/setpoint etiketi bulunamadı/);
});
test('setpointTagId pointing at a bool tag is rejected',()=>{
 assert.throws(()=>validateScreen(screenWith({setpointTagId:'tag-bool'}),config),/setpoint için sayısal etiket seçin/);
});
test('setpointTagId pointing at a numeric tag passes',()=>{
 assert.doesNotThrow(()=>validateScreen(screenWith({setpointTagId:'tag-num'}),config));
});
test('widgetTagReferenceFields lists setpoint etiketi for a widget whose setpointTagId matches',()=>{
 const w={...newWidget('gauge'),setpointTagId:'tag-num'};
 assert.deepEqual(widgetTagReferenceFields(w,'tag-num',config),['setpoint etiketi']);
});
