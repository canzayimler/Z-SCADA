import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterOptions,rank,fold,groupOrder,type PickOption} from '../apps/web/src/pick';
/* G48: etiket secimi acilir listeyle yapiliyordu; on etiketle calisir,
 * binlerce etiketle kaydirma iskencesine doner. Secim artik aranarak
 * yapilir, liste kisa tutulur ve "kac tane daha var" sayilir. */
const tags:PickOption[]=[
 {value:'1',label:'PLC-01.M0',hint:'Start butonu'},
 {value:'2',label:'PLC-01.M1',hint:'Pompa çalışıyor'},
 {value:'3',label:'PLC-01.D0',hint:'Tank seviyesi'},
 {value:'4',label:'PLC-02.M0',hint:'Isı talebi'},
 {value:'5',label:'PLC-01.ISI',hint:'Kazan sıcaklığı'},
];
test('kod bastan eslesmesi ad icinde gecmeye gore once gelir',()=>{
 const {items}=filterOptions(tags,'M0');
 assert.equal(items[0].label,'PLC-01.M0','nokta sonrası kod baştan eşleşir');
 assert.ok(items.some(o=>o.label==='PLC-02.M0'));
});
test('etiket adindan da bulunur',()=>{
 const {items}=filterOptions(tags,'tank');
 assert.deepEqual(items.map(o=>o.value),['3']);
});
test('Turkce buyuk-kucuk harf dogru katlanir',()=>{
 assert.equal(fold('ISI'),'ısı');
 assert.equal(fold('İSİ'),'isi');
 const {items}=filterOptions(tags,'ısı');
 assert.ok(items.some(o=>o.label==='PLC-01.ISI'),'ISI etiketi "ısı" aramasında çıkar');
});
test('liste kirpilir ve gorunmeyen sayilir',()=>{
 const many:PickOption[]=Array.from({length:26},(_,i)=>({value:String(i),label:'PLC-01.D'+i}));
 const {items,more}=filterOptions(many,'',10);
 assert.equal(items.length,10,'ilk 10 gösterilir');
 assert.equal(more,16,'gerisi sayılır');
 assert.equal(items[0].label,'PLC-01.D0','sorgu yokken sıra bozulmaz');
});
test('eslesme yoksa bos doner, uydurma sonuc gelmez',()=>{
 const {items,more}=filterOptions(tags,'zzz');
 assert.deepEqual(items,[]);
 assert.equal(more,0);
});
test('rank eslesmeyene -1 verir',()=>{
 assert.equal(rank({value:'x',label:'PLC-01.M0'},'y0'),-1);
 assert.equal(rank({value:'x',label:'PLC-01.M0'},''),0,'boş sorgu herkesi eşit tutar');
});

test('groupOrder: arama bosken secenekler cihaz basligi altinda toplanir, grup ici sira korunur',()=>{
 const o=(value:string,group:string):PickOption=>({value,label:value,group});
 const out=groupOrder([o('a1','PLC-01'),o('b1','PLC-02'),o('a2','PLC-01'),o('b2','PLC-02'),o('a3','PLC-01')]);
 assert.deepEqual(out.map(x=>x.value),['a1','a2','a3','b1','b2']);
});