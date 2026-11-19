import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LIBRARY_PACK_VERSION,libraryPackSchema,planLibraryMerge,applyLibraryMerge,equipmentTypeSchema,newWidget} from '../packages/contracts/model';
import type {EquipmentType,LibraryPack} from '../packages/contracts/model';

const makeType=(id:string,name:string,version=1)=>equipmentTypeSchema.parse({
 id,name,version,
 widgets:[newWidget('indicator',10,10)]
});
const makePack=(types:EquipmentType[],name='Pompa Seti'):LibraryPack=>libraryPackSchema.parse({
 kind:'scada-library',packVersion:LIBRARY_PACK_VERSION,name,types
});
const makeIdGen=()=>{let n=0;return ()=>'new-'+(n++);};

// --- planLibraryMerge -------------------------------------------------------

test('planLibraryMerge classifies an unknown id as add',()=>{
 const pack=makePack([makeType('pump-a','Pompa A',1)]);
 const plan=planLibraryMerge([],pack);
 assert.equal(plan.items.length,1);
 assert.equal(plan.items[0].state,'add');
 assert.equal(plan.items[0].typeId,'pump-a');
});

test('planLibraryMerge classifies a higher incoming version as upgrade',()=>{
 const existing=[makeType('pump-a','Pompa A',1)];
 const pack=makePack([makeType('pump-a','Pompa A',2)]);
 const plan=planLibraryMerge(existing,pack);
 assert.equal(plan.items[0].state,'upgrade');
});

test('planLibraryMerge classifies a lower incoming version as older',()=>{
 const existing=[makeType('pump-a','Pompa A',3)];
 const pack=makePack([makeType('pump-a','Pompa A',1)]);
 const plan=planLibraryMerge(existing,pack);
 assert.equal(plan.items[0].state,'older');
});

test('planLibraryMerge classifies equal versions as older, not upgrade',()=>{
 const existing=[makeType('pump-a','Pompa A',2)];
 const pack=makePack([makeType('pump-a','Pompa A',2)]);
 const plan=planLibraryMerge(existing,pack);
 assert.equal(plan.items[0].state,'older');
});

test('planLibraryMerge classifies a real name change on the same id as renamed',()=>{
 const existing=[makeType('pump-a','Pompa A',1)];
 const pack=makePack([makeType('pump-a','Vana A',2)]);
 const plan=planLibraryMerge(existing,pack);
 assert.equal(plan.items[0].state,'renamed');
});

test('planLibraryMerge treats Turkish-locale/case/whitespace variants as the same name (upgrade by version, not renamed)',()=>{
 const existing=[makeType('pump-a','Pompa',1)];
 const pack=makePack([makeType('pump-a','pompa ',2)]);
 const plan=planLibraryMerge(existing,pack);
 assert.equal(plan.items[0].state,'upgrade');
});

// --- applyLibraryMerge: defaults with no choices ----------------------------

test('applyLibraryMerge default: add appends the new type',()=>{
 const existing:EquipmentType[]=[];
 const pack=makePack([makeType('pump-a','Pompa A',1)]);
 const {types,applied}=applyLibraryMerge(existing,pack);
 assert.equal(types.length,1);
 assert.equal(types[0].id,'pump-a');
 assert.deepEqual(applied,[{typeId:'pump-a',action:'add'}]);
});

test('applyLibraryMerge default: upgrade replaces the existing type in place',()=>{
 const existing=[makeType('pump-a','Pompa A',1)];
 const pack=makePack([makeType('pump-a','Pompa A',2)]);
 const {types,applied}=applyLibraryMerge(existing,pack);
 assert.equal(types.length,1);
 assert.equal(types[0].id,'pump-a');
 assert.equal(types[0].version,2);
 assert.deepEqual(applied,[{typeId:'pump-a',action:'upgrade'}]);
});

test('applyLibraryMerge default: older is skipped, existing untouched',()=>{
 const existing=[makeType('pump-a','Pompa A',3)];
 const pack=makePack([makeType('pump-a','Pompa A',1)]);
 const {types,applied}=applyLibraryMerge(existing,pack);
 assert.equal(types.length,1);
 assert.equal(types[0].version,3);
 assert.deepEqual(applied,[{typeId:'pump-a',action:'skip'}]);
});

test('applyLibraryMerge default: renamed duplicates under a new id, original untouched',()=>{
 const existing=[makeType('pump-a','Pompa A',1)];
 const pack=makePack([makeType('pump-a','Vana A',2)]);
 const {types,applied}=applyLibraryMerge(existing,pack,{},makeIdGen());
 assert.equal(types.length,2);
 const original=types.find(t=>t.id==='pump-a')!;
 assert.equal(original.version,1);
 assert.equal(original.name,'Pompa A');
 const copy=types.find(t=>t.id==='new-0')!;
 assert.ok(copy);
 assert.equal(copy.name,'Vana A');
 assert.deepEqual(applied,[{typeId:'new-0',action:'duplicate'}]);
});

// --- applyLibraryMerge: explicit choices override defaults ------------------

test('applyLibraryMerge: explicit skip on an upgrade item leaves the existing type untouched',()=>{
 const existing=[makeType('pump-a','Pompa A',1)];
 const pack=makePack([makeType('pump-a','Pompa A',2)]);
 const {types,applied}=applyLibraryMerge(existing,pack,{'pump-a':'skip'});
 assert.equal(types.length,1);
 assert.equal(types[0].version,1);
 assert.deepEqual(applied,[{typeId:'pump-a',action:'skip'}]);
});

test('applyLibraryMerge: explicit duplicate on an upgrade item keeps both original and a new duplicate',()=>{
 const existing=[makeType('pump-a','Pompa A',1)];
 const pack=makePack([makeType('pump-a','Pompa A',2)]);
 const {types,applied}=applyLibraryMerge(existing,pack,{'pump-a':'duplicate'},makeIdGen());
 assert.equal(types.length,2);
 const original=types.find(t=>t.id==='pump-a')!;
 assert.equal(original.version,1);
 const copy=types.find(t=>t.id==='new-0')!;
 assert.equal(copy.version,2);
 assert.equal(copy.name,'Pompa A (2)');
 assert.deepEqual(applied,[{typeId:'new-0',action:'duplicate'}]);
});

// --- invariant: pre-existing ids never vanish -------------------------------

test('applyLibraryMerge never removes a pre-existing id, across a mix of add/upgrade/older/renamed',()=>{
 const existing=[
  makeType('pump-a','Pompa A',1), // will be upgraded
  makeType('pump-b','Pompa B',5), // will stay older (skipped)
  makeType('pump-c','Pompa C',1)  // will be renamed -> duplicated
 ];
 const pack=makePack([
  makeType('pump-a','Pompa A',2),
  makeType('pump-b','Pompa B',1),
  makeType('pump-c','Vana C',2),
  makeType('pump-d','Pompa D',1) // add
 ]);
 const {types}=applyLibraryMerge(existing,pack,{},makeIdGen());
 const ids=new Set(types.map(t=>t.id));
 for(const e of existing)assert.ok(ids.has(e.id));
 // upgrade keeps the same id in place, does not duplicate it
 assert.equal(types.filter(t=>t.id==='pump-a').length,1);
 assert.equal(types.find(t=>t.id==='pump-a')!.version,2);
});

// --- duplicate naming --------------------------------------------------------

test('applyLibraryMerge appends (2), (3)... for successive duplicates sharing a base name',()=>{
 const existing=[makeType('pump-a','Pompa A',1)];
 const pack=makePack([
  makeType('pump-a','Vana X',2), // renamed -> duplicate, base name "Vana X"
  makeType('pump-b','Vana X',1)  // add, also named "Vana X" -> occupies base name first? verify order
 ]);
 const {types}=applyLibraryMerge(existing,pack,{},makeIdGen());
 const names=types.map(t=>t.name).sort();
 // "Vana X" is taken by the add (pump-b, processed with its literal name), the renamed duplicate must get "Vana X (2)"
 assert.ok(names.includes('Vana X'));
 assert.ok(names.includes('Vana X (2)'));
});

test('applyLibraryMerge duplicate-name check is Turkish/whitespace-insensitive',()=>{
 const existing=[makeType('pump-a','Pompa A',1),makeType('pump-x','vana x',1)];
 const pack=makePack([makeType('pump-a','Vana X ',2)]); // renamed, base name collides case/whitespace-insensitively
 const {types}=applyLibraryMerge(existing,pack,{},makeIdGen());
 const copy=types.find(t=>t.id==='new-0')!;
 // Sema adlari zaten kirpar (equipmentTypeSchema: z.string().trim()), bu yuzden
 // "Vana X " pakete "Vana X" olarak girer; kopya adi tek bosluklu olur.
 assert.equal(pack.types[0].name,'Vana X','paket adi kirpilmadi');
 assert.equal(copy.name,'Vana X (2)');
});

// --- applied array shape ------------------------------------------------------

test('applyLibraryMerge applied array has exactly one entry per pack.types entry',()=>{
 const existing=[makeType('pump-a','Pompa A',1)];
 const pack=makePack([makeType('pump-a','Pompa A',2),makeType('pump-b','Pompa B',1)]);
 const {applied}=applyLibraryMerge(existing,pack,{},makeIdGen());
 assert.equal(applied.length,pack.types.length);
 assert.deepEqual(applied,[{typeId:'pump-a',action:'upgrade'},{typeId:'pump-b',action:'add'}]);
});

// --- libraryPackSchema validation --------------------------------------------

test('libraryPackSchema rejects a kind other than scada-library',()=>{
 assert.throws(()=>libraryPackSchema.parse({kind:'other',packVersion:1,types:[makeType('pump-a','Pompa A',1)]}));
});

test('libraryPackSchema rejects an empty types array',()=>{
 assert.throws(()=>libraryPackSchema.parse({kind:'scada-library',packVersion:1,types:[]}));
});

test('libraryPackSchema accepts a minimally valid pack',()=>{
 assert.doesNotThrow(()=>libraryPackSchema.parse({kind:'scada-library',packVersion:1,types:[makeType('pump-a','Pompa A',1)]}));
});
