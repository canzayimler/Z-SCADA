import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writesCommand,validateScreen,newWidget} from '../packages/contracts/model';
import {seedConfig,seedScreen} from '../packages/contracts/seed';

/* G43: secici anahtar (selector) hem gosterge hem kumanda olabilir. Komut baglanmamis
 * secici SALT GOSTERGEDIR: eski davranis (tiklanamaz, engellenmez) korunur. Kumanda
 * yolu yalniz commandId setlendiginde acilir ve o zaman siki kurallar uygulanir. */

test('writesCommand: a selector is non-interactive without a commandId, interactive once one is set',()=>{
 assert.equal(writesCommand({type:'selector',commandId:''}),false);
 assert.equal(writesCommand({type:'selector',commandId:'cmd-1'}),true);
});
test('writesCommand: buttons and numeric-input stay writable regardless of commandId',()=>{
 assert.equal(writesCommand({type:'button',commandId:''}),true);
 assert.equal(writesCommand({type:'button',commandId:'cmd-1'}),true);
 assert.equal(writesCommand({type:'numeric-input',commandId:''}),true);
 assert.equal(writesCommand({type:'numeric-input',commandId:'cmd-1'}),true);
});

function buildConfig(){
 const c=structuredClone(seedConfig);
 c.tags.push(
  {id:'tag-an0',deviceId:'plc-01',code:'AN0',name:'AN0',area:'holding-register',address:100,dataType:'uint16',access:'readwrite',scale:1,offset:0,min:0,max:100,unit:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,description:''},
  {id:'tag-an1',deviceId:'plc-01',code:'AN1',name:'AN1',area:'holding-register',address:101,dataType:'uint16',access:'readwrite',scale:1,offset:0,min:0,max:100,unit:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,description:''});
 c.commands.push(
  {id:'cmd-an0',name:'AN0 kontrol',tagIds:['tag-an0'],feedbackTagIds:['tag-an0'],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''},
  {id:'cmd-an-double',name:'AN çift',tagIds:['tag-an0','tag-an1'],feedbackTagIds:['tag-an0','tag-an1'],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''},
  {id:'cmd-an0-badfeedback',name:'AN0 yanlış geri bildirim',tagIds:['tag-an0'],feedbackTagIds:['tag-an1'],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''},
  {id:'cmd-bool-target',name:'Bool hedef',tagIds:['tag-m0'],feedbackTagIds:['tag-an0'],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''});
 return c;
}
const part=(value:number)=>({tagId:'',label:String(value),color:'#208169',value,upper:null,expected:true});
function baseScreen(widget:any){
 return {...structuredClone(seedScreen),widgets:[widget],equipment:[],scenarios:[],links:[]};
}

test('a selector WITHOUT a command passes validation even in digital mode with per-part bool tags (regression)',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'digital' as const,commandId:'',
  parts:[{...part(0),tagId:'tag-m0'},{...part(1),tagId:'tag-m1'}]};
 assert.doesNotThrow(()=>validateScreen(baseScreen(w),config));
});
test('a fully correct writable selector passes',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'analog' as const,tagId:'tag-an0',commandId:'cmd-an0',
  parts:[part(0),part(80)]};
 assert.doesNotThrow(()=>validateScreen(baseScreen(w),config));
});
test('a writable selector is rejected when mode is not analog',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'digital' as const,tagId:'tag-an0',commandId:'cmd-an0',
  parts:[part(0),part(80)]};
 assert.throws(()=>validateScreen(baseScreen(w),config),/analog/);
});
test('a writable selector is rejected when it has no parts',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'analog' as const,tagId:'tag-an0',commandId:'cmd-an0',parts:[]};
 assert.throws(()=>validateScreen(baseScreen(w),config),/konum/);
});
test('a writable selector is rejected when two parts share the same value',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'analog' as const,tagId:'tag-an0',commandId:'cmd-an0',
  parts:[part(0),part(0)]};
 assert.throws(()=>validateScreen(baseScreen(w),config),/tekrarlanamaz/);
});
test('a writable selector is rejected when tagId is empty',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'analog' as const,tagId:'',commandId:'cmd-an0',
  parts:[part(0),part(80)]};
 assert.throws(()=>validateScreen(baseScreen(w),config));
});
test('a writable selector is rejected when tagId is a bool tag',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'analog' as const,tagId:'tag-m0',commandId:'cmd-an0',
  parts:[part(0),part(80)]};
 assert.throws(()=>validateScreen(baseScreen(w),config));
});
test('a writable selector is rejected when the command has more than one target tag',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'analog' as const,tagId:'tag-an0',commandId:'cmd-an-double',
  parts:[part(0),part(80)]};
 assert.throws(()=>validateScreen(baseScreen(w),config));
});
test('a writable selector is rejected when the command target is a bool tag',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'analog' as const,tagId:'tag-an0',commandId:'cmd-bool-target',
  parts:[part(0),part(80)]};
 assert.throws(()=>validateScreen(baseScreen(w),config));
});
test('a writable selector is rejected when feedbackTagIds does not include the widget tagId',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'analog' as const,tagId:'tag-an0',commandId:'cmd-an0-badfeedback',
  parts:[part(0),part(80)]};
 assert.throws(()=>validateScreen(baseScreen(w),config));
});
test('a part value outside the target tag writable range is rejected (validateValue)',()=>{
 const config=buildConfig();
 const w={...newWidget('selector',10,10),mode:'analog' as const,tagId:'tag-an0',commandId:'cmd-an0',
  parts:[part(0),part(150)]};
 assert.throws(()=>validateScreen(baseScreen(w),config),/sınır/);
});
