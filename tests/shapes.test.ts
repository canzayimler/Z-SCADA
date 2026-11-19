import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {newWidget,widgetSchema,type Widget} from '../packages/contracts/model';
import {panelSpec,symbolTypes,labelIsContent} from '../packages/symbols/catalog';
import {shapePoints} from '../packages/symbols/render/layout';
import {portsOf} from '../packages/screen-model/ports';
import {Symbol} from '../packages/symbols/Symbol';

const draw=(w:Widget)=>renderToStaticMarkup(createElement(Symbol,{w,value:null,quality:'unknown',samples:{}}));

test('cokgen ve yildiz kose sayisi kenar sayisindan gelir',()=>{
 assert.equal(shapePoints('polygon',3).split(' ').length,3);
 assert.equal(shapePoints('polygon',6).split(' ').length,6);
 assert.equal(shapePoints('star',5).split(' ').length,10,'yildizda ic ve dis kose');
 assert.equal(shapePoints('polygon',40).split(' ').length,12,'ust sinir 12');
 for(const p of shapePoints('star',7).split(' ').map(s=>s.split(',').map(Number)))
  assert.ok(p.every(v=>v>=0&&v<=100),'kose 0-100 kutusunda');
});

test('eski kayitli nesne yeni alanlarla ayni cizilir',()=>{
 const eski=widgetSchema.parse({id:'a',type:'rectangle',label:'Alan',x:0,y:0,width:200,height:100,color:'#208169'});
 assert.equal(eski.strokeWidth,0);assert.equal(eski.strokeStyle,'solid');assert.equal(eski.shadow,'none');assert.equal(eski.fillColor,'');
 const html=draw(eski);
 assert.match(html,/border:1px solid #208169/);
 assert.ok(!html.includes('box-shadow'),'golge yokken golge yazilmaz');
});

test('sekil ayarlari cizime yansir',()=>{
 const w={...newWidget('rectangle'),strokeWidth:3,strokeStyle:'dashed',radius:20,shadow:'soft',fillColor:'#336699',fillOpacity:.5} as Widget;
 const html=draw(w);
 assert.match(html,/border:3px dashed/);assert.match(html,/border-radius:20px/);
 assert.match(html,/color-mix\(in srgb,#336699 50%,transparent\)/);assert.match(html,/box-shadow/);
 assert.match(draw({...newWidget('polygon'),sides:3} as Widget),/<polygon/);
 assert.match(draw({...newWidget('line'),strokeStyle:'dotted'} as Widget),/stroke-dasharray/);
});

test('sekil paneli yalniz sekillerde, kenar stili cizgi ve okta',()=>{
 for(const t of ['rectangle','section','ellipse','polygon','star'])assert.equal(panelSpec(t).shape,true,t);
 assert.equal(panelSpec('pump').shape,false);
 assert.equal(panelSpec('line').stroke,true);assert.equal(panelSpec('arrow').stroke,true);
 assert.equal(panelSpec('polygon').frame,false,'html sekil kutuya gerilir, cerceve ayari yok');
});

test('yeni nesnede sembol basligi kapali, yalniz yazisi icerik olan turlerde acik',()=>{
 assert.equal(newWidget('pump').labelVisible,false);
 assert.equal(newWidget('silo').labelVisible,false);
 for(const t of ['value','section','rectangle','alarm','data-card','multi-state'])assert.equal(newWidget(t as Widget['type']).labelVisible,false,t);
 for(const t of ['text','button','callout','navigation'])assert.equal(newWidget(t as Widget['type']).labelVisible,true,t);
 for(const t of labelIsContent)assert.ok((symbolTypes as readonly string[]).includes(t),t);
 assert.equal(newWidget('star').sides,5);
});

test('baslik kapaliyken silo agzi cercevede, govde kirpilmaz',()=>{
 const w={...newWidget('silo'),x:0,y:0,width:200,height:140,frameFit:'contain',labelVisible:false} as Widget;
 for(const p of portsOf(w))assert.ok(p.y>=-1&&p.y<=w.height+1,'agiz y='+p.y);
});

test('belirgin dolguda yazi rengi dolgudan secilir',async()=>{
 const {inkOn}=await import('../packages/symbols/render/layout');
 assert.equal(inkOn({...newWidget('section'),fillColor:'#ffffff',fillOpacity:1} as Widget),'#1d2126');
 assert.equal(inkOn({...newWidget('section'),fillColor:'#1d2126',fillOpacity:1} as Widget),'#f2f3f5');
 assert.equal(inkOn({...newWidget('section'),fillColor:'#ffffff',fillOpacity:.2} as Widget),'var(--txt)','saydam dolguda tema');
});

test('Detayli sembol stili semada gecerli, govde degrade degiskeninden gelir',async()=>{
 const {screenSchema}=await import('../packages/contracts/model');
 const s=screenSchema.parse({id:'s',name:'S',width:800,height:600,widgets:[],symbolStyle:'detailed'});
 assert.equal(s.symbolStyle,'detailed');
 assert.match(draw(newWidget('pump')),/var\(--sym-body-fill,var\(--sym-body\)\)/);
});
