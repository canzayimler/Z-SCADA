import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordChange,undoStep,redoStep,historyAppender,screenChanged,HISTORY_LIMIT,type Stacks} from '../apps/web/src/screenHistory';
/* Stüdyo geri al / yinele: Studio.tsx'te dört kopya halinde duran mantık saf fonksiyonlara
 * ayrıldı; önceden hiç testi yoktu. */
type S={v:number;w:{x:number}[]};
const s=(v:number):S=>({v,w:[{x:v}]});
const empty:Stacks<S>={history:[],future:[]};

test('recordChange mevcut hali gecmise ekler, ileri yigini siler',()=>{
 const r=recordChange({history:[s(1)],future:[s(9)]},s(2));
 assert.deepEqual(r.history.map(x=>x.v),[1,2]);
 assert.deepEqual(r.future,[]);
});
test('recordChange derin kopya alir: sonradan yerinde degisen ekran gecmisi bozmaz',()=>{
 const cur=s(1);const r=recordChange(empty,cur);cur.w[0].x=99;
 assert.equal(r.history[0].w[0].x,1);
});
test('gecmis HISTORY_LIMIT te kirpilir, en eski duser',()=>{
 let st=empty;
 for(let i=0;i<HISTORY_LIMIT+7;i++)st=recordChange(st,s(i));
 assert.equal(st.history.length,HISTORY_LIMIT);
 assert.equal(st.history[0].v,7);
 assert.equal(st.history.at(-1)!.v,HISTORY_LIMIT+6);
});
test('undo: bos gecmiste null, dolu gecmiste son hali dondurur ve mevcut hali ileriye koyar',()=>{
 assert.equal(undoStep(empty,s(1)),null);
 const r=undoStep({history:[s(1),s(2)],future:[s(9)]},s(3))!;
 assert.equal(r.screen.v,2);
 assert.deepEqual(r.stacks.history.map(x=>x.v),[1]);
 assert.deepEqual(r.stacks.future.map(x=>x.v),[3,9]);
});
test('redo: bos ileride null, dolu ileride basini dondurur ve mevcut hali gecmise ekler',()=>{
 assert.equal(redoStep(empty,s(1)),null);
 const r=redoStep({history:[s(1)],future:[s(3),s(4)]},s(2))!;
 assert.equal(r.screen.v,3);
 assert.deepEqual(r.stacks.history.map(x=>x.v),[1,2]);
 assert.deepEqual(r.stacks.future.map(x=>x.v),[4]);
});
test('degisiklik -> geri al -> yinele turu baslangic ekranina doner; araya giren degisiklik ileriyi siler',()=>{
 let cur=s(1),st=empty;
 const edit=(n:S)=>{st=recordChange(st,cur);cur=n;};
 edit(s(2));edit(s(3));
 let u=undoStep(st,cur)!;st=u.stacks;cur=u.screen;assert.equal(cur.v,2);
 u=undoStep(st,cur)!;st=u.stacks;cur=u.screen;assert.equal(cur.v,1);
 const r=redoStep(st,cur)!;st=r.stacks;cur=r.screen;assert.equal(cur.v,2);
 edit(s(7));
 assert.equal(redoStep(st,cur),null,'yeni degisiklikten sonra yinelenecek bir sey kalmamali');
 assert.deepEqual(st.history.map(x=>x.v),[1,2]);
});
test('redo gecmis sinirini asmaz (eski kod redo da siniri uygulamiyordu)',()=>{
 const full:Stacks<S>={history:Array.from({length:HISTORY_LIMIT},(_,i)=>s(i)),future:[s(100)]};
 const r=redoStep(full,s(99))!;
 assert.equal(r.stacks.history.length,HISTORY_LIMIT);
});

/* Denetim 2026-11-18: Stüdyo'da Sil + Ctrl+Z nesneleri getirmiyordu. pushUndo anlık görüntüyü
 * setHistory güncelleyicisinin İÇİNDE okuyordu; React güncelleyiciyi render'a erteleyince ref
 * çoktan yeni (boş) hali gösteriyordu. Aşağıdaki test bu ertelemeyi taklit eder. */
test('historyAppender anlik goruntuyu cagri aninda alir; ertelenen guncelleyici yeni hali yazmaz',()=>{
 const ref={current:s(3)};
 const updater=historyAppender(ref.current);
 ref.current={v:0,w:[]};                       // change(): current.current=next (silindi)
 const history=updater([]);                    // React güncelleyiciyi şimdi çalıştırıyor
 assert.equal(history.length,1);
 assert.equal(history[0].v,3,'gecmise silmeden onceki hal yazilmali');
 const u=undoStep({history,future:[]},ref.current)!;
 assert.equal(u.screen.w.length,1,'geri al silinen nesneyi getirmeli');
});
test('historyAppender derin kopya alir ve siniri korur',()=>{
 const cur=s(1);const up=historyAppender(cur);cur.w[0].x=50;
 const h=up(Array.from({length:HISTORY_LIMIT},(_,i)=>s(i)));
 assert.equal(h.length,HISTORY_LIMIT);assert.equal(h.at(-1)!.w[0].x,1);
});
test('screenChanged: yalniz tiklama (ayni hal ya da esit kopya) gecmise kayit dogurmaz',()=>{
 const a=s(1);
 assert.equal(screenChanged(a,a),false);
 assert.equal(screenChanged(a,structuredClone(a)),false,'surukleme 0 px: yeni nesne ama ayni icerik');
 assert.equal(screenChanged(a,{...a,w:[{x:2}]}),true);
});
