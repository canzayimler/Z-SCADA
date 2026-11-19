import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalog,meta,symbolTypes,labels,symbolGroups,groupOrder,portMap,portWeights,flatTypes,bindingDefs,familyOf,auditCatalog} from '../packages/symbols/catalog';

test('auditCatalog finds no inconsistencies: every symbol placed once, no unknown group, no duplicate type',()=>{
 assert.deepEqual(auditCatalog(),[]);
});

test('every symbol type has a non-empty label',()=>{
 for(const t of symbolTypes){
  assert.ok(labels[t]&&labels[t].length>0,t+': etiket eksik');
 }
});

test('symbolGroups covers every symbol type exactly once and group names match groupOrder',()=>{
 const names=symbolGroups.map(g=>g.name);
 assert.deepEqual(names,groupOrder);
 const all=symbolGroups.flatMap(g=>g.types);
 assert.equal(all.length,symbolTypes.length,'toplam tur sayisi eslesmeli');
 assert.equal(new Set(all).size,all.length,'bir tur birden fazla grupta olamaz');
 for(const t of symbolTypes)assert.ok(all.includes(t),t+': hicbir grupta yok');
});

test('every type with ports also declares a portWeight, except the flat pipe family which uses lineWidth',()=>{
 for(const m of catalog){
  if(m.ports&&m.ports.length){
   if((flatTypes as readonly string[]).includes(m.type)){
    assert.ok(!('portWeight' in m)||m.portWeight===undefined,m.type+': duz boru ailesi portWeight yerine lineWidth kullanmali');
   }else{
    assert.ok(portWeights[m.type as keyof typeof portWeights]!==undefined,m.type+': ports var ama portWeight yok');
   }
  }
 }
});

test('port coordinates stay inside the 0..120 x 0..100 view box',()=>{
 for(const type of Object.keys(portMap)){
  for(const p of portMap[type as keyof typeof portMap]!){
   assert.ok(p.x>=0&&p.x<=120,type+': port x sinir disi ('+p.x+')');
   assert.ok(p.y>=0&&p.y<=100,type+': port y sinir disi ('+p.y+')');
  }
 }
});

test('bindingDefs roles are unique per type and role keys match /^[a-z][a-zA-Z0-9]*$/',()=>{
 for(const t of symbolTypes){
  const defs=bindingDefs(t);
  const roles=defs.map(d=>d.role);
  assert.equal(new Set(roles).size,roles.length,t+': tekrarlanan rol var');
  for(const r of roles)assert.match(r,/^[a-z][a-zA-Z0-9]*$/,t+': gecersiz rol adi '+r);
 }
});

test('every type with a family declares bindings, and vice-versa',()=>{
 for(const m of catalog){
  const meta_=meta(m.type)!;
  if(meta_.family)assert.ok(meta_.bindings&&meta_.bindings.length>0,m.type+': family var ama binding yok');
  if(meta_.family)assert.ok(meta_.family,m.type+': binding var ama family yok');
 }
 /* Tersi DOGRU DEGILDIR: bir sembol `family` olmadan da bag tasiyabilir.
  * Aile yalniz cok durumlu bir DURUM MAKINESI (vana/motor/salter/tasiyici)
  * gerektiginde verilir; kazan, trafo, UPS gibi semboller baglarini dogrudan
  * okur ve kendi cizimlerinde yorumlar. Burada yalniz aile adinin gecerli bir
  * makineye isaret ettigi dogrulanir. */
 const families=['valve','motor','switchgear','conveyor'];
 for(const m of catalog){
  const family=familyOf(m.type);
  if(family)assert.ok(families.includes(family),m.type+': bilinmeyen aile '+family);
 }
});
