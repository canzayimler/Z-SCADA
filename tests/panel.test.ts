import {test} from 'node:test';
import assert from 'node:assert/strict';
import {panelLayout,tileReading,readingFontSize,tilePosition,panelPagesOf,withPages,newPageId,PANEL_WIDTH} from '../apps/web/src/panelModel';
import {preferencesSchema} from '../packages/contracts/model';

const tile={tagId:'t',label:'',unit:'bar',decimals:1,onText:'',offText:'',color:'',icon:'' as const};
const s=(value:any,quality='good')=>({value,quality,receivedAt:0} as any);

test('dijital kutucuk: 1=RUN 0=STOP, ozel metin kullanilir',()=>{
 assert.deepEqual(tileReading(tile,s(true),'bool'),{state:'run',text:'RUN',note:''});
 assert.deepEqual(tileReading(tile,s(false),'bool'),{state:'stop',text:'STOP',note:''});
 assert.equal(tileReading({...tile,onText:'ÇALIŞIYOR'},s(true),'bool').text,'ÇALIŞIYOR');
 assert.equal(tileReading({...tile,offText:'DURDU'},s(0),'bool').text,'DURDU');
});

test('guncel olmayan veri asla RUN/STOP veya sayi gibi gosterilmez',()=>{
 assert.deepEqual(tileReading(tile,undefined,'bool'),{state:'unknown',text:'—',note:'Veri yok'});
 assert.deepEqual(tileReading(tile,s(true,'stale'),'bool'),{state:'stale',text:'—',note:'Veri bayat'});
 assert.deepEqual(tileReading(tile,s(false,'bad'),'bool'),{state:'bad',text:'—',note:'Okuma hatası'});
 assert.equal(tileReading(tile,s(12.34,'stale'),'float32').text,'—');
});

test('analog kutucuk ondalik ayarina gore yazilir',()=>{
 assert.deepEqual(tileReading(tile,s(12.345),'float32'),{state:'value',text:'12.3',note:''});
 assert.equal(tileReading({...tile,decimals:0},s(7.6),'int16').text,'8');
});

test('izgara: sutun sayisi 2..6, satir sayisi yukari yuvarlanir, genislik tuvali doldurur',()=>{
 const l=panelLayout(9,4);
 assert.equal(l.cols,4);assert.equal(l.rows,3);
 assert.equal(Math.round(l.cols*l.tileW),PANEL_WIDTH,'kutular yapisik, bosluk yok');
 const p=tilePosition(5,l);assert.equal(p.left,l.tileW);assert.equal(p.top,l.tileH);
 assert.equal(panelLayout(3,9).cols,6);assert.equal(panelLayout(0,1).cols,2);
 assert.equal(panelLayout(0,4).rows,1,'bos panelde de bir satir yer ayrilir');
});

test('eski tercih kaydi yeni alanlarla gecerli kalir',()=>{
 const p=preferencesSchema.parse({dashboard:[{tagId:'t1',label:'Pompa'}]});
 assert.equal(p.panelColumns,4);
 assert.equal(p.dashboard[0].onText,'');assert.equal(p.dashboard[0].offText,'');
 assert.throws(()=>preferencesSchema.parse({panelColumns:9}));
});

test('okuma puntosu kutuya sigar: kisa kelime tasmaz, uzun metin kuculur',()=>{
 const w=370,h=600;
 for(const t of ['RUN','STOP','ÇALIŞIYOR','212.8']){
  const f=readingFontSize(t,w,h,true,'');
  assert.ok(f*[...t].length*0.6<=w,'"'+t+'" kaba genislik siniri');
  assert.ok(f<=h*0.36);
 }
 assert.ok(readingFontSize('ÇALIŞIYOR',w,190,true,'')<readingFontSize('RUN',w,190,true,''));
 assert.equal(readingFontSize('—',w,h,false,''),56,'bos veri isareti buyumez');
});

test('sutun ayari eksikse (eski sunucu yaniti) izgara 4 sutuna duser, NaN olmaz',()=>{
 for(const bad of [undefined,NaN,null,'4' as any]){
  const l=panelLayout(1,bad as any);
  assert.equal(l.cols,4);assert.ok(Number.isFinite(l.tileW)&&Number.isFinite(l.height));
 }
});

test('panel sayfalari: eski tek panel Genel sayfasina tasinir, kayitta cift kalmaz',()=>{
 const old=preferencesSchema.parse({panelColumns:5,dashboard:[{tagId:'t1'}]});
 const pages=panelPagesOf(old);
 assert.equal(pages.length,1);assert.equal(pages[0].name,'Genel');assert.equal(pages[0].columns,5);
 assert.equal(pages[0].tiles[0].tagId,'t1');
 const saved=withPages(old,[...pages,{id:newPageId(pages),name:'Döküm',columns:4,tiles:[]}]);
 assert.equal(saved.dashboard[0].tagId,'t1','eski alan ilk sayfanin kopyasi: eski sunucu sayfalari atsa da kutular kalir');
 assert.equal(saved.panelPages.length,2);
 assert.equal(panelPagesOf(saved).length,2,'sayfalar doluyken eski alan cift gosterilmez');
 assert.equal(saved.panelPages[1].id,'sayfa-2');
 assert.doesNotThrow(()=>preferencesSchema.parse(saved));
 assert.throws(()=>preferencesSchema.parse({panelPages:[{id:'a',name:'x'},{id:'a',name:'y'}]}),'ayni sayfa kimligi reddedilir');
 assert.throws(()=>preferencesSchema.parse({panelPages:[{id:'a',name:'  '}]}),'bos sayfa adi reddedilir');
});

test('kutu alt satiri: guncel veri "Guncel", sorunlu veride neden + son verinin yasi',async()=>{
 const {tileFooter,ageText}=await import('../apps/web/src/panelModel');
 const now=10_000_000;
 assert.equal(tileFooter(tileReading(tile,s(true),'bool'),{...s(true),receivedAt:now-2000},now),'Güncel');
 assert.equal(tileFooter(tileReading(tile,s(true,'stale'),'bool'),{...s(true,'stale'),receivedAt:now-27*60000},now),'Veri bayat · 27 dk');
 assert.equal(tileFooter(tileReading(tile,undefined,'bool'),undefined,now),'Veri yok','hic veri yoksa sure uydurulmaz');
 assert.equal(tileFooter(tileReading(tile,s(true,'bad'),'bool'),{...s(true,'bad'),receivedAt:now-19000},now),'Okuma hatası','hatanin suresi bilinmiyor');
 assert.equal(ageText(45_000),'45 sn');assert.equal(ageText(3*3600_000),'3 sa');assert.equal(ageText(50*3600_000),'2 gün');
});

test('baslik ozeti durumlari sayar',async()=>{
 const {panelSummary}=await import('../apps/web/src/panelModel');
 assert.deepEqual(panelSummary(['run','run','stop','stale','bad','value']),{run:2,stop:1,bad:1,stale:1,unknown:0,value:1});
});
