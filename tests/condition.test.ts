import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conditionSchema,conditionDepth,conditionTags,validateCondition,evaluateCondition,explainCondition,type Sample} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';

const config=structuredClone(seedConfig);
config.tags.push({id:'tag-p0',deviceId:'plc-01',code:'P0',name:'P0',area:'holding-register',address:100,dataType:'uint16',access:'readwrite',scale:1,offset:0,min:0,max:1000,unit:'bar',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,description:'',history:false,historyDeadband:0,historyMaxGapMs:60000});
const good=(value:boolean|number)=>({value,quality:'good',receivedAt:0,sampledAt:0,sequence:0}) as Sample;
const bad=(value:boolean|number)=>({value,quality:'bad',receivedAt:0,sampledAt:0,sequence:0}) as Sample;

test('condition schema rejects unknown op, empty terms and oversized term lists',()=>{
 assert.equal(conditionSchema.safeParse({op:'xor',terms:[]}).success,false);
 assert.equal(conditionSchema.safeParse({op:'and',terms:[]}).success,false);
 const leaf={op:'bool',tagId:'tag-m0',expected:true};
 assert.equal(conditionSchema.safeParse({op:'and',terms:Array(7).fill(leaf)}).success,false);
 assert.equal(conditionSchema.safeParse({op:'and',terms:Array(6).fill(leaf)}).success,true);
});
test('conditionDepth and conditionTags walk nested trees',()=>{
 const tree={op:'and',terms:[{op:'not',term:{op:'bool',tagId:'tag-m0',expected:true}},{op:'range',tagId:'tag-p0',min:0,max:10}]} as const;
 assert.equal(conditionDepth(tree as any),3);
 assert.deepEqual(conditionTags(tree as any).sort(),['tag-m0','tag-p0']);
});
test('validateCondition enforces the depth limit and rejects unknown tags',()=>{
 const leaf={op:'bool',tagId:'tag-m0',expected:true} as const;
 const wrap=(c:any,n:number):any=>n<=0?c:wrap({op:'not',term:c},n-1);
 const depth4=wrap(leaf,3);assert.equal(conditionDepth(depth4),4);
 assert.doesNotThrow(()=>validateCondition(depth4,config,'test'));
 const depth5=wrap(leaf,4);assert.equal(conditionDepth(depth5),5);
 assert.throws(()=>validateCondition(depth5,config,'test'));
 assert.throws(()=>validateCondition({op:'bool',tagId:'yok',expected:true},config,'test'));
});
test('validateCondition rejects operator/tag type mismatches and inverted ranges',()=>{
 assert.throws(()=>validateCondition({op:'cmp',tagId:'tag-m0',test:'gt',value:1},config,'t'),/sayısal/);
 assert.throws(()=>validateCondition({op:'bool',tagId:'tag-p0',expected:true},config,'t'),/dijital/);
 assert.doesNotThrow(()=>validateCondition({op:'range',tagId:'tag-p0',min:0,max:10},config,'t'));
 assert.throws(()=>validateCondition({op:'range',tagId:'tag-p0',min:10,max:0},config,'t'));
});
test('evaluateCondition resolves bool/cmp/range against sample quality',()=>{
 const samples:Record<string,Sample>={'tag-m0':good(true),'tag-p0':good(50)};
 assert.equal(evaluateCondition({op:'bool',tagId:'tag-m0',expected:true},samples),true);
 assert.equal(evaluateCondition({op:'bool',tagId:'tag-m0',expected:false},samples),false);
 assert.equal(evaluateCondition({op:'bool',tagId:'tag-y0',expected:true},samples),null);
 assert.equal(evaluateCondition({op:'bool',tagId:'tag-m0',expected:true},{'tag-m0':bad(true)}),null);
 assert.equal(evaluateCondition({op:'cmp',tagId:'tag-p0',test:'eq',value:50},samples),true);
 assert.equal(evaluateCondition({op:'cmp',tagId:'tag-p0',test:'ne',value:50},samples),false);
 assert.equal(evaluateCondition({op:'cmp',tagId:'tag-p0',test:'lt',value:50},samples),false);
 assert.equal(evaluateCondition({op:'cmp',tagId:'tag-p0',test:'lte',value:50},samples),true);
 assert.equal(evaluateCondition({op:'cmp',tagId:'tag-p0',test:'gt',value:50},samples),false);
 assert.equal(evaluateCondition({op:'cmp',tagId:'tag-p0',test:'gte',value:50},samples),true);
 assert.equal(evaluateCondition({op:'range',tagId:'tag-p0',min:0,max:50},samples),false);
 assert.equal(evaluateCondition({op:'range',tagId:'tag-p0',min:50,max:100},samples),true);
 assert.equal(evaluateCondition({op:'not',term:{op:'bool',tagId:'tag-y0',expected:true}},samples),null);
});
test('and/or short-circuit before every term is known; not(null) stays null',()=>{
 const samples:Record<string,Sample>={'tag-m0':good(false),'tag-m1':good(true)};
 const unknownLeaf={op:'bool',tagId:'tag-y0',expected:true} as const;
 const falseLeaf={op:'bool',tagId:'tag-m0',expected:true} as const;
 const trueLeaf={op:'bool',tagId:'tag-m1',expected:true} as const;
 assert.equal(evaluateCondition({op:'and',terms:[falseLeaf,unknownLeaf]},samples),false);
 assert.equal(evaluateCondition({op:'or',terms:[trueLeaf,unknownLeaf]},samples),true);
 assert.equal(evaluateCondition({op:'and',terms:[trueLeaf,unknownLeaf]},samples),null);
 assert.equal(evaluateCondition({op:'or',terms:[falseLeaf,unknownLeaf]},samples),null);
 assert.equal(evaluateCondition({op:'not',term:unknownLeaf},samples),null);
});
test('explainCondition reports current readings and a doğru/yanlış/bilinmiyor outcome',()=>{
 const samples:Record<string,Sample>={'tag-m0':good(true),'tag-p0':good(50)};
 const c={op:'and',terms:[{op:'bool',tagId:'tag-m0',expected:true},{op:'cmp',tagId:'tag-p0',test:'gte',value:50}]} as const;
 const text=explainCondition(c as any,config,samples);
 assert.match(text,/doğru$/);
 assert.match(text,/M0/);
 assert.match(text,/açık/);
 assert.match(text,/50/);
 const unknownText=explainCondition({op:'bool',tagId:'tag-y0',expected:true},config,samples);
 assert.match(unknownText,/bilinmiyor/);
});
