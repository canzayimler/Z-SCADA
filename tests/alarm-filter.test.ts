import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alarmState,eventFacets,filterEvents,filterRules,matchesText,ruleFacets,ruleState,sortEvents,activeFilterCount,emptyEventFilter,emptyRuleFilter} from '../apps/web/src/alarmFilter';
import type {AlarmEvent,AlarmRule} from '../packages/contracts/model';

const ev=(id:string,p:Partial<AlarmEvent>):AlarmEvent=>({id,ruleId:'r',name:id,severity:'warning',kind:'bool',tagId:'t',tagCode:'P101_ARIZA',value:true,limit:0,message:'',raisedAt:0,clearedAt:null,ackAt:null,ackBy:'',popup:true,...p});
const rule=(id:string,p:Partial<AlarmRule>)=>({id,name:id,tagId:'t1',kind:'bool',severity:'warning',enabled:true,shelvedUntil:0,message:'',...p}) as AlarmRule;

test('ISA-18.2 dort durum: aktif/normal x onayli/onaysiz',()=>{
 assert.equal(alarmState({clearedAt:null,ackAt:null}),'activeUnacked');
 assert.equal(alarmState({clearedAt:null,ackAt:5}),'activeAcked');
 assert.equal(alarmState({clearedAt:5,ackAt:null}),'clearUnacked');
 assert.equal(alarmState({clearedAt:5,ackAt:6}),'clearAcked');
});

test('metin aramasi: kelimeler VE, Turkce buyuk/kucuk harf, joker',()=>{
 assert.ok(matchesText('pompa arıza',['POMPA 1','P101 ARIZA']));
 assert.ok(!matchesText('pompa kapak',['POMPA 1','P101 ARIZA']));
 assert.ok(matchesText('İSTASYON',['istasyon 3']));
 assert.ok(matchesText('p1*arıza',['P101_ARIZA']));
 assert.ok(!matchesText('p2*arıza',['P101_ARIZA']));
 assert.ok(matchesText('  ',['x']));
 assert.ok(matchesText('a.b',['a.b']) && !matchesText('a.b',['axb']),'nokta duz karakterdir');
});

test('bos secim grubu filtrelemez, secim VEYA, gruplar arasi VE',()=>{
 const list=[ev('a',{severity:'critical'}),ev('b',{severity:'warning',ackAt:1}),ev('c',{severity:'info',clearedAt:2})];
 assert.equal(filterEvents(list,emptyEventFilter()).length,3);
 assert.deepEqual(filterEvents(list,{q:'',severities:['critical','info'],states:[]}).map(e=>e.id),['a','c']);
 assert.deepEqual(filterEvents(list,{q:'',severities:['critical','info'],states:['clearUnacked']}).map(e=>e.id),['c']);
});

test('yuzey sayaclari kendi grubunu disarida birakarak sayar',()=>{
 const list=[ev('a',{severity:'critical'}),ev('b',{severity:'critical',ackAt:1}),ev('c',{severity:'warning'})];
 const f={q:'',severities:['critical' as const],states:[]};
 const facets=eventFacets(list,f);
 assert.deepEqual(facets.severities,{critical:2,warning:1,info:0},'oncelik secimi oncelik sayacini daraltmaz');
 assert.equal(facets.states.activeUnacked,1,'durum sayaci oncelik secimine uyar');
 assert.equal(facets.states.activeAcked,1);
});

test('oncelik siralamasi: kritik once, ayni oncelikte onaysiz once, sonra en yeni',()=>{
 const list=[ev('eski-uyari',{raisedAt:1}),ev('kritik-onayli',{severity:'critical',ackAt:9,raisedAt:5}),ev('kritik-yeni',{severity:'critical',raisedAt:3}),ev('yeni-uyari',{raisedAt:8})];
 assert.deepEqual(sortEvents(list,'priority').map(e=>e.id),['kritik-yeni','kritik-onayli','yeni-uyari','eski-uyari']);
 assert.deepEqual(sortEvents(list,'time').map(e=>e.id),['yeni-uyari','kritik-onayli','kritik-yeni','eski-uyari']);
});

test('kural durumu ve filtresi: etkin / devre disi / rafta, etiket koduyla arama',()=>{
 const now=1000,codes:Record<string,string>={t1:'TK1_SEVIYE',t2:'P2_ARIZA'};
 const list=[rule('a',{}),rule('b',{enabled:false}),rule('c',{shelvedUntil:2000,tagId:'t2'}),rule('d',{shelvedUntil:500,kind:'high'})];
 assert.deepEqual(list.map(r=>ruleState(r,now)),['enabled','disabled','shelved','enabled'],'suresi gecmis raf etkin sayilir');
 const code=(id:string)=>codes[id];
 assert.deepEqual(filterRules(list,{...emptyRuleFilter(),states:['shelved']},code,now).map(r=>r.id),['c']);
 assert.deepEqual(filterRules(list,{...emptyRuleFilter(),q:'p2_'},code,now).map(r=>r.id),['c']);
 assert.deepEqual(ruleFacets(list,{...emptyRuleFilter(),kinds:['high']},code,now).states,{enabled:1,disabled:0,shelved:0});
});

test('etkin filtre sayisi arama ve dolu gruplari sayar',()=>{
 assert.equal(activeFilterCount(emptyEventFilter()),0);
 assert.equal(activeFilterCount({q:' x ',severities:['critical'],states:[]}),2);
});

test('aktif gruplar: onaysizlar (normale donmus olanlar dahil) once, sonra onayli ve suren',async()=>{
 const {groupActive,clearedInShift,shiftMarks}=await import('../apps/web/src/alarmFilter');
 const ev=(id:string,o:any={})=>({id,ruleId:'r',name:id,severity:'warning',kind:'high',tagId:'t',tagCode:'T',value:1,limit:0,message:'',raisedAt:1000,clearedAt:null,ackAt:null,ackBy:'',popup:false,...o}) as any;
 const g=groupActive([ev('a'),ev('b',{ackAt:5}),ev('c',{clearedAt:9})]);
 assert.deepEqual(g.pending.map((x:any)=>x.id),['a','c']);
 assert.deepEqual(g.acked.map((x:any)=>x.id),['b']);
 const hist=[ev('x',{clearedAt:3000,ackAt:3100}),ev('y',{clearedAt:500,ackAt:600}),ev('a',{clearedAt:4000,ackAt:4100}),ev('z',{clearedAt:3500})];
 assert.deepEqual(clearedInShift(hist,[ev('a')],1000).map((x:any)=>x.id),['x'],'vardiya oncesi, aktifte olan ve onaysiz olan girmez');
 const m=shiftMarks([ev('p',{raisedAt:1500}),ev('p',{raisedAt:1500}),ev('q',{raisedAt:500})],1000,2000);
 assert.equal(m.length,1);assert.equal(m[0].x,0.5);assert.equal(m[0].unacked,true);
});
