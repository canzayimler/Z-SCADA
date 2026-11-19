import {z} from 'zod';
import type {Config,Sample} from './model';
/* --- Recete modeli (B09) ---------------------------------------------------
 * Recete, bir urune/isletme moduna ait parametre kumesidir. Komut iki hedefle
 * sinirli oldugu icin recete komutun yerine gecmez: recete SIRALI komut
 * listesidir, her adim ayri dogrulanir ve ayri sonuclanir.
 * Kismi uygulamada otomatik ters yazma YAPILMAZ — sahada yarim kalan degeri
 * korlemesine geri almak daha tehlikelidir; durum kullaniciya bildirilir.
 */
export const recipeStepSchema=z.object({
 commandId:z.string().min(1).max(80),
 value:z.union([z.boolean(),z.number().finite()]),
 label:z.string().trim().max(80).default(''),
 unit:z.string().max(16).default(''),
 min:z.number().finite().nullable().default(null),
 max:z.number().finite().nullable().default(null)});
export type RecipeStep=z.infer<typeof recipeStepSchema>;
export const recipeSchema=z.object({
 id:z.string().min(1).max(80),
 name:z.string().trim().min(1).max(100),
 version:z.number().int().min(1).default(1),
 description:z.string().trim().max(500).default(''),
 steps:z.array(recipeStepSchema).min(1).max(100),
 updatedBy:z.string().max(80).default(''),
 updatedAt:z.number().int().min(0).default(0)});
export type Recipe=z.infer<typeof recipeSchema>;
export const recipesSchema=z.array(recipeSchema).max(200);
/** Receteyi yapilandirmaya gore dogrular: komutlar var mi, sinirlar tutarli mi. */
export function validateRecipes(input:unknown,config:Config):Recipe[]{
 const recipes=recipesSchema.parse(input);
 if(new Set(recipes.map(r=>r.id)).size!==recipes.length)throw Error('Reçete kimliği tekrarlanıyor.');
 for(const r of recipes){
  for(const [i,step] of r.steps.entries()){
   const command=config.commands.find(c=>c.id===step.commandId);
   if(!command)throw Error(r.name+': '+(i+1)+'. adımın komutu bulunamadı.');
   if(step.min!==null&&step.max!==null&&step.min>step.max)throw Error(r.name+': '+(i+1)+'. adımda alt sınır üst sınırdan büyük.');
   if(typeof step.value==='number'){
    if(step.min!==null&&step.value<step.min)throw Error(r.name+': '+(i+1)+'. adımın değeri alt sınırın altında.');
    if(step.max!==null&&step.value>step.max)throw Error(r.name+': '+(i+1)+'. adımın değeri üst sınırın üstünde.');
   }
  }
 }
 return recipes;
}
/** Uygulamadan once: her adimin mevcut degeri ile yeni degerini yan yana verir. */
export function recipePreview(recipe:Recipe,config:Config,samples:Record<string,Sample>){
 return recipe.steps.map((step,index)=>{
  const command=config.commands.find(c=>c.id===step.commandId);
  const feedbackTag=command?.feedbackTagIds[0]||command?.tagIds[0]||'';
  const sample=samples[feedbackTag];
  const current=sample&&sample.quality==='good'?sample.value:null;
  return {index,commandId:step.commandId,name:command?.name||step.commandId,label:step.label,unit:step.unit,
   current,newValue:step.value,quality:sample?.quality||'unknown',
   changes:current===null?null:current!==step.value};
 });
}
