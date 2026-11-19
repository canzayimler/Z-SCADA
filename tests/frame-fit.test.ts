import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Symbol} from '../packages/symbols/Symbol';
import {contentBox,contentBoxes} from '../packages/symbols/content';
import {labelSpanOf} from '../packages/symbols/frame';
import {markupBounds,boxFrom,mergeBounds,type Box} from '../packages/symbols/bounds';
import {flatTypes,panelSpec,variantsOf} from '../packages/symbols/catalog';
import {newWidget,symbolTypes,type Widget} from '../packages/contracts/model';
/* G50: sembolun cizimi 120x100 goruntu kutusunu doldurmaz — tank kutunun
 * ortasinda kucuk durur, nesne buyutulunce cizim buyumez ve etrafindaki
 * bosluk yuzunden iki cisim bitisemez. `content.ts` her turun cizim kutusunu
 * tutar; 'trim'/'fill' modundaki nesnenin goruntu kutusu ve DOLAYISIYLA
 * EKRANDAKI BORU AGIZLARI bu kutudan hesaplanir (frame.ts -> ports.ts).
 *
 * 2026-11-18 (sembol dili v2 "B · Endustriyel metal"): tablo artik cizimden
 * yeniden URETILMEZ; kayitli ekranlardaki boru baglantilari kaymasin diye
 * dondurulmus bir cerceve sozlesmesidir. Eskiden "olcum == tablo" esitligi
 * aranirdi; yeni cizimler ayni kutuya sigacak sekilde cizildi. Test simdi:
 *  1) her turun HER varyanti her durumda kutunun ICINDE kalir (kirpilmaz),
 *  2) varsayilan cizim kutuyu bos birakmaz (kutu sessizce eskimesin).
 * Not: eski cizimde pompa/konveyor/karistirici/tank varyantlari kutudan
 * tasiyordu (kirpilmis modda kesik gorunuyordu); 1) bunu da yakalar. */
const draw=(w:Widget,value:boolean|number|null,quality:string)=>
 renderToStaticMarkup(createElement(Symbol,{w,value,quality,samples:{}}));
function measure(type:string,variant=''){
 let box:Box|null=null;
 for(const [value,quality] of [[true,'good'],[62,'good'],[false,'good'],[null,'unknown']] as const){
  const w={...newWidget(type as Widget['type']),variant,labelVisible:false,label:''} as Widget;
  box=mergeBounds(box,markupBounds(draw(w,value,quality)));
 }
 return boxFrom(box);
}
test('her varyantin cizimi cerceve kutusunun icinde kalir — kutu dondurulmus sozlesmedir',()=>{
 const over:string[]=[];
 for(const type of Object.keys(contentBoxes)){
  const variants=variantsOf(type).map(v=>v.key);
  for(const v of variants.length?variants:['']){
   const m=measure(type,v),s=contentBox(type)!;
   if(!m){over.push(type+'/'+v+': ölçülemedi');continue;}
   if(m[0]<s[0]||m[1]<s[1]||m[0]+m[2]>s[0]+s[2]||m[1]+m[3]>s[1]+s[3])over.push(type+(v?'/'+v:'')+': kutu ['+s.join(',')+'] ölçüm ['+m.join(',')+']');
  }
 }
 assert.deepEqual(over,[],'çizim cerceve kutusundan taşıyor (kırpılır)');
});
test('varsayilan cizim cerceve kutusunu bos birakmaz',()=>{
 const loose:string[]=[];
 for(const type of Object.keys(contentBoxes)){
  const m=measure(type)!,s=contentBox(type)!;
  const gaps=[m[0]-s[0],m[1]-s[1],s[0]+s[2]-m[0]-m[2],s[1]+s[3]-m[1]-m[3]];
  const cover=(m[2]*m[3])/(s[2]*s[3]);
  if(Math.max(...gaps)>16||cover<.6)loose.push(type+': boşluk '+gaps.join(',')+' kaplama '+cover.toFixed(2));
 }
 assert.deepEqual(loose,[],'çizim kutuyu dolduramıyor; kutu eskimiş olabilir');
});
test('olculen kutu cizimi ICINE alir, kirpmaz',()=>{
 for(const type of Object.keys(contentBoxes)){
  const box=contentBox(type)!;
  assert.ok(box[0]>=0&&box[1]>=0,type+': kutu negatif başlıyor');
  assert.ok(box[0]+box[2]<=120,type+': kutu genişlik dışına taşıyor');
  assert.ok(box[1]+box[3]<=105,type+': kutu yükseklik dışına taşıyor');
  assert.ok(box[2]>=8&&box[3]>=8,type+': kutu anlamsız küçük');
 }
});
test('"contain" eski davranis: goruntu kutusu degismez',()=>{
 const w={...newWidget('tank'),frameFit:'contain' as const,labelVisible:false,label:''};
 const html=draw(w,50,'good');
 assert.ok(html.includes('viewBox="0 0 120 82"')||html.includes('viewBox="0 0 120 100"'),'contain modunda tam görüntü kutusu: '+html.slice(0,200));
 assert.ok(html.includes('preserveAspectRatio="xMidYMid meet"'),'oran korunur');
});
test('"trim" goruntu kutusunu cizime daraltir, orani korur',()=>{
 const w={...newWidget('tank'),frameFit:'trim' as const,labelVisible:false,label:''};
 const html=draw(w,50,'good');
 const box=contentBox('tank')!;
 assert.ok(html.includes(`viewBox="${box.join(' ')}"`),'kırpılmış görüntü kutusu kullanılır: '+html.slice(0,200));
 assert.ok(html.includes('preserveAspectRatio="xMidYMid meet"'),'kırpmada oran bozulmaz');
});
test('"fill" cizimi cerceveye gerer',()=>{
 const w={...newWidget('tank'),frameFit:'fill' as const,labelVisible:false,label:''};
 const html=draw(w,50,'good');
 assert.ok(html.includes('preserveAspectRatio="none"'),'doldurmada oran bırakılır');
});
test('etiket cizilirken kirpma etiketi disarida birakmaz',()=>{
 /* G51: eskiden etiket varken YATAY kirpma hic yapilmiyordu ("yazi govdeden
  * genis olabilir"). Bu, cercevenin yanlarinda kalici bosluk birakiyordu ve
  * tutamaklar cizimden uzakta duruyordu. Artik yazinin kapladigi serit
  * olculuyor (labelSpanOf) ve kutu yalniz o kadar genis birakiliyor. */
 const w={...newWidget('tank'),frameFit:'trim' as const,labelVisible:true,label:'TANK'};
 const html=draw(w,50,'good');
 const box=/viewBox="(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(html)!;
 const [left,top,width,height]=[1,2,3,4].map(i=>Number(box[i]));
 const [lx0,lx1]=labelSpanOf(w);
 assert.ok(left<=lx0+0.01,'etiketin sol ucu kutu dışında kaldı');
 assert.ok(left+width>=lx1-0.01,'etiketin sağ ucu kutu dışında kaldı');
 assert.ok(top>0,'üstteki boşluk yine de alınır');
 assert.ok(top+height>=100,'etiket şeridi (y≈95) görüntü kutusunda kalmalı');
 const dar={...w,labelVisible:false};
 const darBox=/viewBox="(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(draw(dar,50,'good'))!;
 assert.ok(Number(darBox[3])<=width,'etiket kapaliyken kutu daha da daralmalı');
});
test('yeni nesne cizimine yapisik gelir; kayitli nesne gorunumunu korur',()=>{
 assert.equal(newWidget('tank').frameFit,'trim','yeni nesne kırpılmış başlar');
 const old={...newWidget('tank')} as Record<string,unknown>;
 delete old.frameFit;
 assert.equal((newWidget('tank'),Object.prototype.hasOwnProperty.call(old,'frameFit')),false);
});
test('duz boru ailesinde cerceve secimi gosterilmez',()=>{
 for(const type of flatTypes)assert.equal(panelSpec(type).frame,false,type+': düz boru zaten gerilir');
 assert.equal(panelSpec('tank').frame,true);
});
test('her sembol her cerceve modunda patlamadan cizilir',()=>{
 for(const type of symbolTypes)for(const frameFit of ['contain','trim','fill'] as const){
  const w={...newWidget(type as Widget['type']),frameFit};
  const html=draw(w,62,'good');
  assert.ok(html.length>0&&!html.includes('NaN'),type+' ('+frameFit+') çizilemedi');
 }
});
test('sembol dili v2: kirpilmis nesnenin boru agizlari ekranda yerinde kalir',async()=>{
 /* Degerler sembol dili v2'den ONCE (8bc8979) portsOf ile olculdu. Cizim degisti, agiz degismedi. */
 const {portsOf,portWeight}=await import('../packages/screen-model/ports');
 const before:Record<string,[number,number][]>={
  pump:[[102.619,84.2857],[247.381,80.4762]],tank:[[161.5,53.6622],[161.5,173.3378]],
  valve:[[103.58,96.2],[251.42,96.2]],'heat-exchanger':[[103.8333,76.9167],[326.1667,119.0833]],
  mixer:[[103.0938,81.1094],[195.9063,81.1094],[149.5,167.7344]]};
 const weights:Record<string,number>={pump:20.3175,tank:26.5946,valve:58.52,'heat-exchanger':23,mixer:21.6563};
 for(const [type,pts] of Object.entries(before)){
  const w={...newWidget(type as Widget['type']),x:100,y:50,frameFit:'trim' as const,labelVisible:false,label:'P-101'};
  const now=portsOf(w);
  assert.equal(now.length,pts.length,type+': ağız sayısı');
  now.forEach((p,i)=>{assert.ok(Math.abs(p.x-pts[i][0])<1e-3&&Math.abs(p.y-pts[i][1])<1e-3,type+' ağız '+i+' kaydı: '+p.x+','+p.y);});
  assert.ok(Math.abs(portWeight(w,0)-weights[type])<1e-3,type+': ağız kalınlığı');
 }
});
test('Detayli stil tanimlari tek yerde, kimlikler tekil ve CSS ile ayni',async()=>{
 const fs=await import('node:fs');
 const {SymbolDefs,SYMBOL_DEF_IDS}=await import('../packages/symbols/defs');
 const html=renderToStaticMarkup(createElement(SymbolDefs));
 const ids:string[]=Array.from(html.matchAll(/id="([^"]+)"/g)).map(m=>m[1]);
 assert.deepEqual(ids,[...SYMBOL_DEF_IDS],'tanım listesi');
 assert.equal(new Set(ids).size,ids.length,'kimlik çakışması');
 const css=fs.readFileSync('apps/web/src/motion.css','utf8');
 for(const ref of css.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(ref[1] as typeof ids[number]),'motion.css tanımsız kimliğe başvuruyor: '+ref[1]);
 /* Sembol cizimleri tanim TASIMAZ (sembol basina tekrar yok). */
 const pump=draw({...newWidget('pump')},true,'good');
 assert.ok(!/<(linearGradient|radialGradient|filter)\b/.test(pump),'sembol kendi degradesini cizmemeli');
 assert.match(pump,/class="zb zc"/,'pompa dokum govde sinifini tasir');
});
test('yeni ekran Detayli stille baslar; alani olmayan eski kayit Klasik kalir (goc yok)',async()=>{
 const {screenSchema,newScreenSymbolStyle}=await import('../packages/contracts/model');
 assert.equal(newScreenSymbolStyle,'detailed');
 assert.equal(screenSchema.parse({id:'s',name:'S',width:800,height:600,widgets:[]}).symbolStyle,'classic','eski kayit bugunku gorunumunu korur');
 assert.equal(screenSchema.parse({id:'s',name:'S',width:800,height:600,widgets:[],symbolStyle:'isa101'}).symbolStyle,'isa101','kayitli secim korunur');
 const {emptySnapshot}=await import('../apps/server/src/projects');
 assert.equal(emptySnapshot('Yeni',[],'test').screens[0].draft.symbolStyle,'detailed','yeni projenin ilk ekrani');
});
