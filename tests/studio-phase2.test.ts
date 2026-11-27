import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {newWidget,validateScreen,type Screen} from '../packages/contracts/model';
import {seedConfig,seedScreen} from '../packages/contracts/seed';
import {portsOf,portWeight} from '../packages/screen-model/ports';
import {widgetBindingStatus} from '../packages/screen-model/editor';
import {commitPipePath,findNearestPort,routeOrthogonalLeg,simplifyOrthogonalPath} from '../packages/screen-model/pipePen';
import {Library} from '../packages/symbols/Library';
import {ObjectAppearance} from '../apps/web/src/ObjectAppearance';

function emptyScreen():Screen{
 return {...structuredClone(seedScreen),widgets:[],links:[],equipment:[],scenarios:[]};
}

function nestedInteractive(html:string):string[]{
 const bad:string[]=[],stack:string[]=[];
 const re=/<(\/?)(button|a|input|select|textarea)\b[^>]*?(\/?)>/g;let m;
 while((m=re.exec(html))){const [,close,tag,self]=m;
  if(close){stack.pop();continue;}
  if(stack.length)bad.push(stack.join('>')+'>'+tag);
  if(!self&&!['input'].includes(tag))stack.push(tag);}
 return bad;
}

test('routeOrthogonalLeg ve simplifyOrthogonalPath dik acili kol uretir ve ayni ekseni birlestirir',()=>{
 assert.deepEqual(routeOrthogonalLeg({x:100,y:100},{x:220,y:100}),[{x:100,y:100},{x:220,y:100}]);
 assert.deepEqual(routeOrthogonalLeg({x:100,y:100},{x:260,y:180}),[{x:100,y:100},{x:260,y:100},{x:260,y:180}]);
 assert.deepEqual(routeOrthogonalLeg({x:100,y:100},{x:260,y:180},'h',true),[{x:100,y:100},{x:100,y:180},{x:260,y:180}]);
 assert.deepEqual(
  simplifyOrthogonalPath([{x:0,y:0},{x:50,y:0},{x:120,y:0},{x:120,y:40},{x:120,y:90}]),
  [{x:0,y:0},{x:120,y:0},{x:120,y:90}]
 );
});

test('commitPipePath yatay ve dikey borulari gecerli semayla uretir',()=>{
 const base=emptyScreen();
 const horiz=commitPipePath(base,[{x:100,y:200},{x:300,y:200}],{lineWidth:12});
 assert.equal(horiz.createdIds.length,1);
 const hp=horiz.screen.widgets[0];
 assert.equal(hp.type,'pipe');
 assert.equal(hp.rotation,0);
 assert.deepEqual(portsOf(hp).map(p=>({x:Math.round(p.x),y:Math.round(p.y)})),[{x:100,y:200},{x:300,y:200}]);
 assert.doesNotThrow(()=>validateScreen(structuredClone(horiz.screen),seedConfig));

 const vert=commitPipePath(base,[{x:250,y:120},{x:250,y:320}],{lineWidth:14});
 assert.equal(vert.createdIds.length,1);
 const vp=vert.screen.widgets[0];
 assert.equal(vp.type,'pipe');
 assert.equal(vp.rotation,90);
 assert.deepEqual(portsOf(vp).map(p=>({x:Math.round(p.x),y:Math.round(p.y)})),[{x:250,y:120},{x:250,y:320}]);
 assert.doesNotThrow(()=>validateScreen(structuredClone(vert.screen),seedConfig));
});

test('commitPipePath 90 derece L-kirilimda pipe-elbow-pipe zinciri ve kalici links kurar',()=>{
 const base=emptyScreen();
 const res=commitPipePath(base,[{x:100,y:150},{x:300,y:150},{x:300,y:350}],{lineWidth:12});
 assert.equal(res.createdIds.length,3);
 assert.deepEqual(res.screen.widgets.map(w=>w.type),['pipe','elbow','pipe']);
 assert.equal(res.screen.links.length,2);
 // Dirsek portu ile bagli boru portlari ayni koordinatta bulusmali.
 for(const link of res.screen.links){
  const a=res.screen.widgets.find(w=>w.id===link.fromWidgetId)!;
  const b=res.screen.widgets.find(w=>w.id===link.toWidgetId)!;
  const pa=portsOf(a)[link.fromPort],pb=portsOf(b)[link.toPort];
  assert.ok(Math.hypot(pa.x-pb.x,pa.y-pb.y)<1,'bagli portlar ust uste gelmeli');
 }
 assert.doesNotThrow(()=>validateScreen(structuredClone(res.screen),seedConfig));
});

test('commitPipePath iki ekipman portu arasinda port agirligini esler ve baglar',()=>{
 const pump={...newWidget('pump',80,140),id:'p1',width:120,height:100};
 const valve={...newWidget('valve',340,260),id:'v1',width:120,height:100};
 const s0:Screen={...emptyScreen(),widgets:[pump,valve]};
 const pRight=portsOf(pump)[1],vLeft=portsOf(valve)[0];
 const startHit=findNearestPort(s0.widgets,{x:pRight.x,y:pRight.y},16);
 const endHit=findNearestPort(s0.widgets,{x:vLeft.x,y:vLeft.y},16);
 assert.ok(startHit&&endHit);
 const pts=routeOrthogonalLeg({x:startHit.x,y:startHit.y},{x:endHit.x,y:endHit.y},startHit.axis);
 const res=commitPipePath(s0,pts,{startSnap:startHit,endSnap:endHit,autoFit:true});
 assert.ok(res.createdIds.length>=3);
 assert.ok(res.screen.links.some(l=>l.fromWidgetId==='p1'||l.toWidgetId==='p1'),'pompa portu baglanmali');
 assert.ok(res.screen.links.some(l=>l.fromWidgetId==='v1'||l.toWidgetId==='v1'),'vana portu baglanmali');
 const firstPipe=res.screen.widgets.find(w=>w.id===res.createdIds[0])!;
 assert.ok(Math.abs(firstPipe.lineWidth-Math.round(Math.min(32,Math.max(4,portWeight(pump,1)))*10)/10)<0.2);
 assert.doesNotThrow(()=>validateScreen(structuredClone(res.screen),seedConfig));
});

test('widgetBindingStatus bound, unbound, broken ve passive durumlarini dogru ayirir',()=>{
 const screenIds=new Set(seedConfig.tags.length?[seedScreen.id]:[]);
 const validTag=seedConfig.tags[0].id;
 const validCmd=seedConfig.commands[0]?.id||'';
 const boundMotor={...newWidget('motor'),tagId:validTag};
 assert.equal(widgetBindingStatus(boundMotor,seedConfig,screenIds).state,'bound');

 const unboundPump=newWidget('pump');
 assert.equal(widgetBindingStatus(unboundPump,seedConfig,screenIds).state,'unbound');

 const brokenTag={...newWidget('gauge'),tagId:'olmayan-etiket'};
 assert.equal(widgetBindingStatus(brokenTag,seedConfig,screenIds).state,'broken');

 const brokenNav={...newWidget('navigation'),targetScreenId:'silinmis-ekran'};
 assert.equal(widgetBindingStatus(brokenNav,seedConfig,screenIds).state,'broken');

 const unboundCmd={...newWidget('button'),commandId:''};
 assert.equal(widgetBindingStatus(unboundCmd,seedConfig,screenIds).state,'unbound');
 if(validCmd){
  const boundBtn={...newWidget('button'),commandId:validCmd};
  assert.equal(widgetBindingStatus(boundBtn,seedConfig,screenIds).state,'bound');
 }

 assert.equal(widgetBindingStatus(newWidget('pipe'),seedConfig,screenIds).state,'passive');
 assert.equal(widgetBindingStatus(newWidget('rectangle'),seedConfig,screenIds).state,'passive');
 assert.equal(widgetBindingStatus(newWidget('alarm-list'),seedConfig,screenIds).state,'bound');
});

test('ObjectAppearance gorsel varyant kartlarini cizer ve ic ice etkilesimli oge icermez',()=>{
 for(const type of ['pump','tank','data-card'] as const){
  const html=renderToStaticMarkup(createElement(ObjectAppearance,{widget:newWidget(type),onChange:()=>{}}));
  assert.match(html,/variant-grid/);
  assert.match(html,/role="radiogroup"/);
  assert.match(html,/variant-tile/);
  assert.deepEqual(nestedInteractive(html),[]);
 }
});

test('Library hideGroupsTab propu verildiğinde Gruplar sekmesini gizler',()=>{
 const html=renderToStaticMarkup(createElement(Library,{onAdd:()=>{},onEquipment:()=>{},hideGroupsTab:true}));
 assert.ok(html.includes('Semboller'));
 assert.ok(!html.includes('Ekipman grupları'));
});
