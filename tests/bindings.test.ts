import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newWidget,validateScreen} from '../packages/contracts/model';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {readBindings,phaseOf,phaseLabels,phaseTone} from '../packages/symbols/states';

/** `w.bindings`i verilen [role,tagId,invert?] uclulerinden kurar. */
function bind(w:any,entries:[string,string,boolean?][]){
 w.bindings=entries.map(([role,tagId,invert])=>({role,tagId,invert:invert??false}));
 return w;
}
const good=(v:boolean|number)=>({value:v,quality:'good'});
const bad=(v:boolean|number)=>({value:v,quality:'bad'});

test('a widget with no bindings leaves phaseOf null (old single-tagId behaviour applies)',()=>{
 for(const type of ['valve','motor','breaker'] as const){
  const w=newWidget(type);
  const r=readBindings(w,{});
  assert.equal(phaseOf(w,r),null,type+': binding yokken null donmeli');
 }
});

test('valve limit combinations resolve to the right phase',()=>{
 const w=newWidget('valve');
 bind(w,[['openLimit','o',false],['closeLimit','c',false]]);
 assert.equal(phaseOf(w,readBindings(w,{o:good(true),c:good(false)})),'open');
 assert.equal(phaseOf(w,readBindings(w,{o:good(false),c:good(true)})),'closed');
 assert.equal(phaseOf(w,readBindings(w,{o:good(false),c:good(false)})),'moving');
 assert.equal(phaseOf(w,readBindings(w,{o:good(true),c:good(true)})),'conflict');
});

test('valve fault wins over limit readings',()=>{
 const w=newWidget('valve');
 bind(w,[['openLimit','o',false],['closeLimit','c',false],['fault','f',false]]);
 assert.equal(phaseOf(w,readBindings(w,{o:good(true),c:good(false),f:good(true)})),'fault');
});

test('valve limit tag with bad quality, or missing from samples, is unknown',()=>{
 const w=newWidget('valve');
 bind(w,[['openLimit','o',false],['closeLimit','c',false]]);
 assert.equal(phaseOf(w,readBindings(w,{o:bad(true),c:good(false)})),'unknown');
 assert.equal(phaseOf(w,readBindings(w,{c:good(false)})),'unknown','o etiketi ornekte yoksa da bilinmiyor donmeli');
});

test('valve with only a numeric position binding maps 0/100/mid-range to closed/open/moving',()=>{
 const w=newWidget('valve');
 bind(w,[['position','p',false]]);
 assert.equal(phaseOf(w,readBindings(w,{p:good(0)})),'closed');
 assert.equal(phaseOf(w,readBindings(w,{p:good(100)})),'open');
 assert.equal(phaseOf(w,readBindings(w,{p:good(45)})),'moving');
});

test('invert flips a boolean reading (valve openLimit)',()=>{
 const w=newWidget('valve');
 bind(w,[['openLimit','o',true],['closeLimit','c',false]]);
 // ham deger false, invert:true -> okunan deger true -> 'open'
 assert.equal(phaseOf(w,readBindings(w,{o:good(false),c:good(false)})),'open');
});

test('motor phases: trip, running, ready, stopped',()=>{
 const w=newWidget('motor');
 bind(w,[['fault','f',false],['running','r',false],['ready','rd',false]]);
 assert.equal(phaseOf(w,readBindings(w,{f:good(true),r:good(false),rd:good(false)})),'trip');
 assert.equal(phaseOf(w,readBindings(w,{f:good(false),r:good(true),rd:good(false)})),'running');
 assert.equal(phaseOf(w,readBindings(w,{f:good(false),r:good(false),rd:good(true)})),'ready');
 assert.equal(phaseOf(w,readBindings(w,{f:good(false),r:good(false),rd:good(false)})),'stopped');
});

test('switchgear (breaker/contactor) phases: trip, closed, open, conflict',()=>{
 for(const type of ['breaker','contactor'] as const){
  const w=newWidget(type);
  bind(w,[['trip','t',false],['closed','cl',false],['open','op',false]]);
  assert.equal(phaseOf(w,readBindings(w,{t:good(true),cl:good(false),op:good(false)})),'trip');
  assert.equal(phaseOf(w,readBindings(w,{t:good(false),cl:good(true),op:good(false)})),'closed');
  assert.equal(phaseOf(w,readBindings(w,{t:good(false),cl:good(false),op:good(true)})),'open');
  assert.equal(phaseOf(w,readBindings(w,{t:good(false),cl:good(true),op:good(true)})),'conflict');
 }
});

test('conveyor phases: jam, reverse, running, stopped',()=>{
 const w=newWidget('conveyor');
 bind(w,[['jam','j',false],['running','r',false],['reverse','rv',false]]);
 assert.equal(phaseOf(w,readBindings(w,{j:good(true),r:good(true),rv:good(false)})),'jam');
 assert.equal(phaseOf(w,readBindings(w,{j:good(false),r:good(true),rv:good(true)})),'reverse');
 assert.equal(phaseOf(w,readBindings(w,{j:good(false),r:good(true),rv:good(false)})),'running');
 assert.equal(phaseOf(w,readBindings(w,{j:good(false),r:good(false),rv:good(false)})),'stopped');
});

test('phaseTone has an entry for every phase named in phaseLabels',()=>{
 for(const phase of Object.keys(phaseLabels))assert.ok((phaseTone as any)[phase],phase+': ton eksik');
});

/* --- validateScreen ile bag dogrulama ------------------------------------ */
function withNumericTag(){
 const c=structuredClone(seedConfig),base=c.tags[0];
 c.tags.push({...base,id:'num-tag',code:'D_NUM',name:'Sayisal test',area:'holding-register',dataType:'int16',address:400,scale:1,offset:0,min:-1000,max:1000,unit:''});
 return c;
}

test('validateScreen rejects a binding role that is not defined for that symbol type',()=>{
 const c=structuredClone(seedConfig),s=structuredClone(seedScreen);
 const w=newWidget('valve');
 bind(w,[['running','tag-m0',false]]); // 'running' motor rolu, valve'de tanimli degil
 s.widgets=[w];
 assert.throws(()=>validateScreen(s,c),/tanımlı değil/);
});

test('validateScreen rejects a duplicate role on the same widget',()=>{
 const c=structuredClone(seedConfig),s=structuredClone(seedScreen);
 const w=newWidget('valve');
 w.bindings=[{role:'fault',tagId:'',invert:false},{role:'fault',tagId:'',invert:false}];
 s.widgets=[w];
 assert.throws(()=>validateScreen(s,c),/iki kez tanımlanamaz/);
});

test('validateScreen rejects a bool-kind role bound to a numeric tag',()=>{
 const c=withNumericTag(),s=structuredClone(seedScreen);
 const w=newWidget('valve');
 bind(w,[['openLimit','num-tag',false]]);
 s.widgets=[w];
 assert.throws(()=>validateScreen(s,c),/dijital etiket seçin/);
});

test('validateScreen rejects a number-kind role bound to a bool tag',()=>{
 const c=structuredClone(seedConfig),s=structuredClone(seedScreen);
 const w=newWidget('valve');
 bind(w,[['position','tag-m0',false]]);
 s.widgets=[w];
 assert.throws(()=>validateScreen(s,c),/sayısal etiket seçin/);
});

test('validateScreen accepts a valid binding set',()=>{
 const c=structuredClone(seedConfig),s=structuredClone(seedScreen);
 const w=newWidget('valve');
 bind(w,[['openLimit','tag-m0',false],['closeLimit','tag-m1',false]]);
 s.widgets=[w];
 assert.doesNotThrow(()=>validateScreen(s,c));
});
