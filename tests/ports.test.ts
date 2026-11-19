import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newWidget} from '../packages/contracts/model';
import {fitToPort,hasPorts,portSnap,portWeight,portsOf} from '../packages/screen-model/ports';
test('pipe ports sit on the stretched centre line, equipment ports follow the letterboxed drawing',()=>{
 const pipe={...newWidget('pipe',100,200),width:220,height:40};
 assert.deepEqual(portsOf(pipe),[{x:100,y:220,axis:'h'},{x:320,y:220,axis:'h'}]);
 const valve={...newWidget('valve',0,0),width:120,height:100};
 const [left,right]=portsOf(valve);
 assert.ok(left.x<right.x&&Math.abs(left.y-right.y)<.001,'vana uçları aynı yükseklikte ve karşılıklı');
 assert.equal(hasPorts('text'),false);
 assert.deepEqual(portsOf(newWidget('text')),[]);
});
test('flip and rotation move the ports with the drawing',()=>{
 const elbow={...newWidget('elbow',0,0),width:120,height:100};
 assert.deepEqual(portsOf(elbow),[{x:0,y:50,axis:'h'},{x:60,y:0,axis:'v'}]);
 assert.deepEqual(portsOf({...elbow,flipX:true}),[{x:120,y:50,axis:'h'},{x:60,y:0,axis:'v'}]);
 const turned=portsOf({...elbow,rotation:90});
 assert.ok(Math.abs(turned[0].x-60)<.001&&Math.abs(turned[0].y-(-10))<.001,'90° dönüşte sol uç yukarı taşınır');
});
test('drag snapping joins the nearest pair of ends and ignores far ones',()=>{
 const fixed={...newWidget('pipe',0,0),width:200,height:40};      // uçlar: (0,20) ve (200,20)
 const moving={...newWidget('pipe',214,10),width:200,height:40};  // sol uç: (214,30)
 const snap=portSnap([moving],[fixed],0,0,20);
 assert.ok(snap,'yakın uç bulunmalı');
 assert.equal(Math.round(moving.x+snap!.dx),200);
 assert.equal(Math.round(moving.y+snap!.dy),0,'uçlar tam üst üste gelir');
 assert.equal(portSnap([{...moving,x:600,y:600}],[fixed],0,0,20),null);
});
test('connecting resizes the added object to the thickness of the pipe it meets',()=>{
 const thick={...newWidget('pipe',0,0),width:200,height:60,lineWidth:20};
 assert.equal(portWeight(thick,1),20,'boru kalınlığı piksel cinsinden çizgi kalınlığıdır');
 const thin={...newWidget('pipe',200,0),width:200,height:40,lineWidth:8};
 const patch=fitToPort(thin,0,portWeight(thick,1))!;
 assert.ok(patch,'kalınlık farkı varsa ölçü değişir');
 assert.equal(portWeight({...thin,...patch},0),20);
 assert.ok(patch.height!>=30,'gövde, boruyu ve flanşları alacak kadar büyür');
 const valve={...newWidget('valve',200,0),width:120,height:100};
 const grown=fitToPort(valve,0,portWeight(thick,1))!;
 assert.ok(grown.width&&grown.height,'ekipman oranını koruyarak ölçeklenir');
 assert.ok(Math.abs(portWeight({...valve,...grown},0)-20)<1);
 assert.equal(fitToPort(thick,1,portWeight(thick,1)),null,'kalınlık zaten uyuyorsa değişiklik yok');
});
