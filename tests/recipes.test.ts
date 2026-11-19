import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipes,recipePreview,recipeSchema} from '../packages/contracts/recipes';
import {seedConfig} from '../packages/contracts/seed';
import type {Config,Sample} from '../packages/contracts/model';
const config=seedConfig as Config;
const cmd=()=>config.commands[0].id;
const recipe=(patch:any={})=>recipeSchema.parse({id:'r1',name:'Dolum 500 ml',steps:[{commandId:cmd(),value:true,label:'Pompa aç'}],...patch});
test('a recipe is validated against the running configuration',()=>{
 assert.doesNotThrow(()=>validateRecipes([recipe()],config));
 assert.throws(()=>validateRecipes([recipe({steps:[{commandId:'yok-boyle',value:true}]})],config),/komutu bulunamadı/);
 assert.throws(()=>validateRecipes([recipe(),recipe()],config),/kimliği tekrarlanıyor/);
});
test('step limits are enforced so a recipe cannot carry an out-of-range value',()=>{
 assert.throws(()=>validateRecipes([recipe({steps:[{commandId:cmd(),value:120,min:0,max:100}]})],config),/üst sınırın üstünde/);
 assert.throws(()=>validateRecipes([recipe({steps:[{commandId:cmd(),value:5,min:10,max:100}]})],config),/alt sınırın altında/);
 assert.throws(()=>validateRecipes([recipe({steps:[{commandId:cmd(),value:5,min:100,max:10}]})],config),/alt sınır üst sınırdan büyük/);
});
test('the preview shows current value against the new one and flags unknown data',()=>{
 const command=config.commands[0];
 const feedback=command.feedbackTagIds[0]||command.tagIds[0];
 const samples:Record<string,Sample>={[feedback]:{value:false,quality:'good',receivedAt:Date.now(),sampledAt:Date.now(),sequence:1}};
 const rows=recipePreview(recipe(),config,samples);
 assert.equal(rows.length,1);
 assert.equal(rows[0].current,false);
 assert.equal(rows[0].newValue,true);
 assert.equal(rows[0].changes,true,'değişecek adım işaretlenir');
 const unknown=recipePreview(recipe(),config,{});
 assert.equal(unknown[0].current,null,'veri yoksa mevcut değer uydurulmaz');
 assert.equal(unknown[0].changes,null,'bilinmeyen veride değişecek mi sorusu cevapsız kalır');
});
test('recipe versioning fields default safely for a freshly written recipe',()=>{
 const parsed=recipe();
 assert.equal(parsed.version,1);
 assert.equal(parsed.updatedBy,'');
 assert.equal(parsed.steps[0].min,null);
 assert.throws(()=>recipeSchema.parse({id:'r',name:'x',steps:[]}),'adımsız reçete kabul edilmez');
});
