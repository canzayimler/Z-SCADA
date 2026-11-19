import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newWidget,validateScreen,linksOf,addLink,removeLink,pruneLinks,moveWithLinks,type Screen} from '../packages/contracts/model';
import {seedConfig,seedScreen} from '../packages/contracts/seed';

/** İki boru ve bir vanadan oluşan temel bir ekran; A-B-C zincir olarak bağlanabilir. */
function baseScreen():Screen{
 const a={...newWidget('pipe',0,0),id:'a',width:200,height:40};
 const b={...newWidget('pipe',200,0),id:'b',width:200,height:40};
 const c={...newWidget('valve',400,0),id:'c',width:120,height:100};
 return {...structuredClone(seedScreen),widgets:[a,b,c],links:[]};
}

test('addLink kalıcı bağlantı kurar, aynı çifti iki kez eklemez ve kendine bağlanmayı reddeder',()=>{
 let s=baseScreen();
 s=addLink(s,{fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0});
 assert.equal(s.links.length,1,'bağlantı eklenmeli');
 const again=addLink(s,{fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0});
 assert.equal(again.links.length,1,'aynı çift tekrar eklenmemeli');
 const reversed=addLink(s,{fromWidgetId:'b',fromPort:0,toWidgetId:'a',toPort:1});
 assert.equal(reversed.links.length,1,'yön farklı olsa da aynı uç çifti tekrar eklenmemeli');
 const self=addLink(s,{fromWidgetId:'a',fromPort:0,toWidgetId:'a',toPort:1});
 assert.equal(self.links.length,1,'nesne kendine bağlanamaz');
 assert.equal(self,s,'kendine bağlanma denemesi ekranı değiştirmemeli');
});

test('linksOf bir nesnenin tüm bağlantılarını (hem from hem to yönünde) döndürür',()=>{
 let s=baseScreen();
 s=addLink(s,{fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0});
 s=addLink(s,{fromWidgetId:'b',fromPort:1,toWidgetId:'c',toPort:0});
 assert.equal(linksOf(s,'a').length,1);
 assert.equal(linksOf(s,'b').length,2,'b hem a hem c ile bağlantılı');
 assert.equal(linksOf(s,'c').length,1);
});

test('removeLink bağlantıyı kimliğiyle kaldırır',()=>{
 let s=baseScreen();
 s=addLink(s,{fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0});
 const linkId=s.links[0].id;
 s=removeLink(s,linkId);
 assert.equal(s.links.length,0);
 assert.doesNotThrow(()=>removeLink(s,'bilinmeyen-id'),'bilinmeyen kimlik sessizce yok sayılmalı');
});

test('pruneLinks silinen nesnelere ait bağlantıları temizler',()=>{
 let s=baseScreen();
 s=addLink(s,{fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0});
 s=addLink(s,{fromWidgetId:'b',fromPort:1,toWidgetId:'c',toPort:0});
 s={...s,widgets:s.widgets.filter(w=>w.id!=='b')};
 const pruned=pruneLinks(s);
 assert.equal(pruned.links.length,0,'b silinince ona bağlı iki kayıt da temizlenmeli');
});

test('moveWithLinks zincirleme bağlı nesneleri birlikte taşır ve her nesneyi bir kez taşır',()=>{
 let s=baseScreen();
 s=addLink(s,{fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0});
 s=addLink(s,{fromWidgetId:'b',fromPort:1,toWidgetId:'c',toPort:0});
 const moved=moveWithLinks(s,'a',30,15);
 const [a,b,c]=['a','b','c'].map(id=>moved.widgets.find(w=>w.id===id)!);
 assert.equal(a.x,30);assert.equal(a.y,15);
 assert.equal(b.x,230,'zincirdeki komşu da aynı miktarda taşınmalı');
 assert.equal(c.x,430,'zincirin sonundaki nesne de taşınmalı');
});

test('moveWithLinks döngüsel bağlantıda takılmaz ve kilitli nesneyi taşımaz',()=>{
 let s=baseScreen();
 s=addLink(s,{fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0});
 s=addLink(s,{fromWidgetId:'b',fromPort:1,toWidgetId:'c',toPort:0});
 s=addLink(s,{fromWidgetId:'c',fromPort:1,toWidgetId:'a',toPort:0}); // döngü: a-b-c-a
 const before=Date.now();
 const moved=moveWithLinks(s,'a',10,10);
 assert.ok(Date.now()-before<1000,'döngüde sonsuz döngüye girmemeli');
 assert.equal(moved.widgets.find(w=>w.id==='a')!.x,10);
 assert.equal(moved.widgets.find(w=>w.id==='b')!.x,210);
 assert.equal(moved.widgets.find(w=>w.id==='c')!.x,410);
 // döngüsüz zincirde: a-b-c, b kilitliyse zincir orada durur ve c de taşınmaz.
 let chain=baseScreen();
 chain=addLink(chain,{fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0});
 chain=addLink(chain,{fromWidgetId:'b',fromPort:1,toWidgetId:'c',toPort:0});
 const withLocked={...chain,widgets:chain.widgets.map(w=>w.id==='b'?{...w,locked:true}:w)};
 const movedLocked=moveWithLinks(withLocked,'a',10,10);
 assert.equal(movedLocked.widgets.find(w=>w.id==='a')!.x,10,'a yine de taşınır');
 assert.equal(movedLocked.widgets.find(w=>w.id==='b')!.x,200,'kilitli b taşınmaz');
 assert.equal(movedLocked.widgets.find(w=>w.id==='c')!.x,400,'kilitli b zinciri durdurduğu için c de taşınmaz');
});

test('moveWithLinks kilitli başlangıç nesnesini veya sıfır taşımayı hiç değiştirmez',()=>{
 let s=baseScreen();
 s=addLink(s,{fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0});
 const lockedStart={...s,widgets:s.widgets.map(w=>w.id==='a'?{...w,locked:true}:w)};
 assert.equal(moveWithLinks(lockedStart,'a',10,10),lockedStart,'kilitli nesne kendisi taşınmaz');
 assert.equal(moveWithLinks(s,'a',0,0),s,'sıfır yer değiştirme ekranı değiştirmemeli');
});

test('validateScreen geçersiz bağlantıyı (bulunamayan nesne, geçersiz port, kendine bağlanma, tekrarlı kimlik) reddeder',()=>{
 let s=baseScreen();
 s=addLink(s,{fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0});
 assert.doesNotThrow(()=>validateScreen(structuredClone(s),seedConfig));
 const danglingTarget={...s,links:[{id:'l1',fromWidgetId:'a',fromPort:0,toWidgetId:'yok',toPort:0}]};
 assert.throws(()=>validateScreen(danglingTarget,seedConfig),/bulunamadı/);
 const badPort={...s,links:[{id:'l1',fromWidgetId:'a',fromPort:9,toWidgetId:'b',toPort:0}]};
 assert.throws(()=>validateScreen(badPort,seedConfig),/geçersiz/);
 const selfLink={...s,links:[{id:'l1',fromWidgetId:'a',fromPort:0,toWidgetId:'a',toPort:1}]};
 assert.throws(()=>validateScreen(selfLink,seedConfig),/aynı nesneye/);
 const dupId={...s,links:[{id:'l1',fromWidgetId:'a',fromPort:1,toWidgetId:'b',toPort:0},{id:'l1',fromWidgetId:'b',fromPort:1,toWidgetId:'c',toPort:0}]};
 assert.throws(()=>validateScreen(dupId,seedConfig),/tekrarlanıyor/);
});

test('links alanı olmayan eski ekranlar sorunsuz doğrulanır (geriye dönük uyumluluk)',()=>{
 const legacy:any=structuredClone(baseScreen());
 delete legacy.links;
 const validated=validateScreen(legacy,seedConfig);
 assert.deepEqual(validated.links,[],'eksik links alanı boş diziye düşer');
 assert.equal(linksOf(validated,'a').length,0);
});
