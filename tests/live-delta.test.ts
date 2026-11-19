import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sampleDelta} from '../apps/server/src/liveDelta';
import {applyLive} from '../apps/web/src/liveMerge';

const S=(value:any,receivedAt:number,quality='good')=>({value,quality,receivedAt,sampledAt:receivedAt,sequence:receivedAt} as any);
const base={gatewayConnected:true,activeRevision:1,desiredRevision:1,deploying:false,commands:[],alarms:[],alarmCounts:{} as any,alarmFlood:{} as any,devices:[],devicesReady:0,devicesTotal:0,controlReady:false};

test('delta yalniz degisen ve silinen ornekleri tasir',()=>{
 const a=sampleDelta(new Map(),{m0:S(true,1),t1:S(5,1)});
 assert.deepEqual(Object.keys(a.changed).sort(),['m0','t1']);
 const b=sampleDelta(a.next,{m0:S(true,1),t1:S(6,2)});
 assert.deepEqual(Object.keys(b.changed),['t1']);assert.deepEqual(b.removed,[]);
 const c=sampleDelta(b.next,{t1:S(6,2)});
 assert.deepEqual(c.changed,{});assert.deepEqual(c.removed,['m0']);
});
test('istemci deltayi uygular, degismeyen ornek ayni nesne kalir',()=>{
 const full=applyLive({...base,samples:{}} as any,{t:'f',...base,samples:{m0:S(true,1),t1:S(5,1)}});
 const m0=full.samples.m0;
 const next=applyLive(full,{t:'d',...base,gatewayConnected:false,changed:{t1:S(6,2)},removed:[]});
 assert.equal(next.samples.m0,m0,'degismeyen ornek referansi korunur');
 assert.equal(next.samples.t1.value,6);assert.equal(next.gatewayConnected,false);
 const gone=applyLive(next,{t:'d',...base,changed:{},removed:['m0']});
 assert.equal(gone.samples.m0,undefined);
});
test('tam goruntu ve eski protokol de yapisal paylasimla birlesir',()=>{
 const a=applyLive({...base,samples:{}} as any,{...base,samples:{m0:S(true,1)}});
 const b=applyLive(a,{...base,samples:{m0:S(true,1)}});
 assert.equal(b.samples.m0,a.samples.m0);
 assert.equal((b as any).t,undefined);
});

test('sembol yalniz kendi degeri/ozelligi degisince yeniden cizilir',async()=>{
 const {symbolPropsEqual}=await import('../packages/symbols/Symbol');
 const {newWidget}=await import('../packages/contracts/model');
 const w=newWidget('pump'),live={};
 const p={w,value:true,quality:'good',samples:{a:{value:1,quality:'good'}},live} as any;
 assert.ok(symbolPropsEqual(p,{...p,w:{...w},samples:{a:{value:1,quality:'good'}}}),'ayni icerik yeni nesne: cizilmez');
 assert.ok(!symbolPropsEqual(p,{...p,value:false}),'deger degisti');
 assert.ok(!symbolPropsEqual(p,{...p,samples:{a:{value:2,quality:'good'}}}),'okuma degisti');
 assert.ok(!symbolPropsEqual(p,{...p,w:{...w,color:'#000000'}}),'ozellik degisti');
});
