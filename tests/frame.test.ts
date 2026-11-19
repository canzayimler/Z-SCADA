import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Symbol} from '../packages/symbols/Symbol';
import {viewBoxOf,viewBoxAttr,drawRectOf,inkRectOf,framePadding,snapFrameToDrawing,frameForDrawing,stretches} from '../packages/symbols/frame';
import {contentBoxes} from '../packages/symbols/content';
import {portsOf} from '../packages/screen-model/ports';
import {newWidget,symbolTypes,type Widget} from '../packages/contracts/model';
/* G51: cerceve ile cizim ayri seylerdi. Tutamaklar cerceveyi tutuyor, cizim
 * cercevenin ortasinda kucuk duruyordu — konumlandirma ve boyutlandirma gozle
 * yapiliyordu. Ayrica `ports.ts` "cizim 120x100'un tamamini doldurur"
 * varsayimiyla calisiyordu; `frameFit` 'trim'/'fill' modunda agizlar cizimin
 * olmadigi yere dusuyordu. */
const measured=Object.keys(contentBoxes) as Widget['type'][];

test('goruntu kutusu tek kaynak: cizilen svg frame.ts ile ayni kutuyu kullanir',()=>{
 for(const type of measured.slice(0,12)){
  for(const fit of ['contain','trim','fill'] as const){
   for(const labelVisible of [true,false]){
    const w={...newWidget(type),frameFit:fit,labelVisible} as Widget;
    const svg=renderToStaticMarkup(createElement(Symbol,{w,value:null,quality:'unknown',samples:{}}));
    const found=/viewBox="([^"]+)"/.exec(svg);
    assert.ok(found,type+': viewBox yok');
    assert.equal(found![1],viewBoxAttr(w),type+' · '+fit+' · etiket '+labelVisible);
   }
  }
 }
});

test('yeni nesnenin cercevesinde bosluk kalmaz — oran cizimden gelir',()=>{
 const kotu:string[]=[];
 for(const type of symbolTypes){
  const w=newWidget(type);
  if(stretches(w))continue;
  if(framePadding(w)>0.05)kotu.push(type+': %'+Math.round(framePadding(w)*100));
 }
 assert.deepEqual(kotu,[],'yeni nesnede çerçeve boşluğu');
});

test('cerceveyi cizime oturtmak boslugu bitirir ve cizimi ekranda oynatmaz',()=>{
 /* Degismez olan nesnenin merkezi degil, CIZIMIN ekrandaki yeri: cerceve
  * kirpilir, operatorun gordugu sekil ayni pikselde kalir. Cizim kutunun
  * ortasinda olmadigi turlerde (silindir gibi) merkez kayar — dogrusu budur. */
 for(const type of measured){
  const w={...newWidget(type),x:40,y:30,width:240,height:180,frameFit:'contain'} as Widget;
  if(stretches(w))continue;
  const once=inkRectOf(w),next={...w,...snapFrameToDrawing(w)} as Widget;
  assert.equal(next.frameFit,'trim',type+": 'contain' kalirsa ayni bosluk yeniden dogar");
  assert.ok(framePadding(next)<=0.06,type+': oturttuktan sonra hâlâ %'+Math.round(framePadding(next)*100)+' boşluk');
  const sonra=inkRectOf(next);
  assert.ok(Math.abs((w.x+once.x)-(next.x+sonra.x))<=2,type+': çizim yatayda oynadı');
  assert.ok(Math.abs((w.y+once.y)-(next.y+sonra.y))<=2,type+': çizim dikeyde oynadı');
  assert.ok(Math.abs(once.width-sonra.width)<=2&&Math.abs(once.height-sonra.height)<=2,type+': çizim boyu değişti');
 }
});

test("'contain' modunda bosluk gercek cizime gore olculur — letterbox'a degil",()=>{
 const w={...newWidget('indicator'),width:200,height:200,frameFit:'contain',labelVisible:false} as Widget;
 const cizim=drawRectOf(w),murekkep=inkRectOf(w);
 // Goruntu kutusu 120x100 oldugu icin 'cizim' cerceveyi doldurur gorunur;
 // gercek murekkep onun icinde kucuk durur. Fark tam olarak kullanicinin gordugu bosluk.
 assert.ok(murekkep.width<cizim.width&&murekkep.height<=cizim.height);
 assert.ok(framePadding(w)>0.2,'gerçek boşluk ölçülemedi: %'+Math.round(framePadding(w)*100));
});

test('agizlar nesne cercevesinin icinde kalir — her uc modda',()=>{
 for(const type of measured){
  for(const fit of ['contain','trim','fill'] as const){
   const w={...newWidget(type),x:0,y:0,width:200,height:140,frameFit:fit} as Widget;
   for(const p of portsOf(w)){
    assert.ok(p.x>=-1&&p.x<=w.width+1,type+' · '+fit+': ağız çerçevenin yatay dışında');
    assert.ok(p.y>=-1&&p.y<=w.height+1,type+' · '+fit+': ağız çerçevenin dikey dışında');
   }
  }
 }
});

test('G51 gerileme: kirpilmis modda agizlar cizimle birlikte tasinir',()=>{
 /* Eski `ports.ts` frameFit'i bilmiyordu: her modda ayni noktayi veriyordu.
  * Kirpma cizimi buyutup kaydirdigi icin agizlarin da kaymasi gerekir. */
 const fark:string[]=[];
 for(const type of measured){
  const base={...newWidget(type),x:0,y:0,width:200,height:140,labelVisible:false} as Widget;
  const kapali=portsOf({...base,frameFit:'contain'}),kirpik=portsOf({...base,frameFit:'trim'});
  if(!kapali.length)continue;
  if(kapali.some((p,i)=>Math.abs(p.x-kirpik[i].x)>0.5||Math.abs(p.y-kirpik[i].y)>0.5))fark.push(type);
 }
 assert.ok(fark.length>=10,'ağızlar kırpmayı izlemiyor; yalnız '+fark.length+' türde değişti');
});

test('kirpilmis modda kenardaki agiz cizimin kenarina oturur',()=>{
 /* Agiz TAM kenarda degildir: vanada flans agzin 2 birim disina tasar
  * (portMap 12/108, cizim kutusu 10..110). Aranan, agzin kenar seridinde
  * kalmasi — boru oraya oturur; ortada kalmasi kirpmanin islemedigi demektir. */
 const w={...newWidget('valve'),x:0,y:0,width:200,height:140,frameFit:'trim',labelVisible:false} as Widget;
 const r=inkRectOf(w),ports=portsOf(w);
 assert.ok(ports.length>=2,'vana ağızları yok');
 const sol=Math.min(...ports.map(p=>p.x)),sag=Math.max(...ports.map(p=>p.x));
 assert.ok(Math.abs(sol-r.x)<=6,'sol ağız çizimin kenarında değil: '+sol+' / '+r.x);
 assert.ok(Math.abs(sag-(r.x+r.width))<=6,'sağ ağız çizimin kenarında değil: '+sag+' / '+(r.x+r.width));
});

test("'fill' ve boru ailesinde cerceve zaten dolu — oran degistirilmez",()=>{
 const pipe={...newWidget('pipe'),width:300,height:40} as Widget;
 assert.equal(stretches(pipe),true);
 assert.deepEqual(frameForDrawing(pipe),{width:300,height:40});
 const dolu={...newWidget('motor'),width:300,height:40,frameFit:'fill'} as Widget;
 const r=drawRectOf(dolu);
 assert.deepEqual([r.x,r.y,r.width,r.height],[0,0,300,40]);
});

test('donmus ve aynalanmis nesnede de agiz sayisi ve simetri korunur',()=>{
 const base={...newWidget('valve'),x:0,y:0,width:200,height:140,frameFit:'trim'} as Widget;
 const duz=portsOf(base),donuk=portsOf({...base,rotation:90}),ayna=portsOf({...base,flipX:true});
 assert.equal(donuk.length,duz.length);
 assert.equal(ayna.length,duz.length);
 const merkez=(list:{x:number;y:number}[])=>[list.reduce((a,p)=>a+p.x,0)/list.length,list.reduce((a,p)=>a+p.y,0)/list.length];
 const [mx,my]=merkez(duz),[rx,ry]=merkez(donuk);
 // 90 derece donus agizlarin ortak merkezini nesne merkezinde tutar.
 assert.ok(Math.abs((mx-100)+(ry-70))<2||Math.abs(rx-100)<60,'dönüş ağızları savurdu');
});

test('goruntu kutusu hep pozitif ve 120x100 uzayindan tasmaz',()=>{
 for(const type of measured){
  for(const fit of ['contain','trim'] as const){
   const vb=viewBoxOf({...newWidget(type),frameFit:fit} as Widget);
   assert.ok(vb.width>0&&vb.height>0,type+': kutu sıfır');
   assert.ok(vb.x>=0&&vb.y>=0,type+': kutu negatif başlıyor');
   assert.ok(vb.x+vb.width<=120.001&&vb.y+vb.height<=105.001,type+': kutu 120x100 dışına taşıyor');
  }
 }
});
