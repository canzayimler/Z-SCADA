import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptSource,acceptSampledAt,SESSION_SWITCH_COOLDOWN_MS,SESSION_RESTART_MAX_SEQ,
 CLOCK_SKEW_MS,MAX_SAMPLE_AGE_MS,type SourceState} from '../apps/server/src/ingest';
/* Y3: tekrar korumasi `session` esitligine bagliydi; her mesajda yeni session
 * uyduran biri eski ornekleri sinirsiz tekrar oynatabiliyordu.
 * Y4: `sampledAt` dogrulanmiyordu; gelecek tarihli damga bayat okumayi
 * commands.ts dogrulamasina "ack sonrasi" diye gosterebiliyordu. */
const now=1_700_000_000_000;
const state=(over:Partial<SourceState>={}):SourceState=>({session:'s1',seq:10,switchedAt:now-60_000,...over});

test('ayni session icinde sira geriye gidemez — tekrar oynatma reddedilir',()=>{
 const prior=state();
 assert.equal(acceptSource(prior,{session:'s1',sequence:9},now).ok,false);
 assert.equal(acceptSource(prior,{session:'s1',sequence:10},now).ok,false);
 const ileri=acceptSource(prior,{session:'s1',sequence:11},now);
 assert.equal(ileri.ok,true);
 assert.equal(ileri.ok&&ileri.next.seq,11);
});

test('Y3: her mesajda yeni session uydurmak sira kontrolunu atlatmaz',()=>{
 let current=state({switchedAt:now});
 for(let i=1;i<=5;i++){
  const verdict=acceptSource(current,{session:'sahte-'+i,sequence:3},now+i*100);
  assert.equal(verdict.ok,false,'session cevirme hemen kabul edilmemeli');
  assert.equal(verdict.ok===false&&verdict.reason,'session-churn');
 }
});

test('gercek yeniden baslatma kabul edilir: bekleme dolmus ve sayac sifirlanmis',()=>{
 const prior=state({switchedAt:now-SESSION_SWITCH_COOLDOWN_MS});
 const verdict=acceptSource(prior,{session:'s2',sequence:1},now);
 assert.equal(verdict.ok,true);
 assert.equal(verdict.ok&&verdict.next.session,'s2');
 assert.equal(verdict.ok&&verdict.next.switchedAt,now);
});

test('yeni session yuksek sayacla gelirse yeniden baslatma sayilmaz',()=>{
 const prior=state({switchedAt:now-SESSION_SWITCH_COOLDOWN_MS});
 const verdict=acceptSource(prior,{session:'s2',sequence:SESSION_RESTART_MAX_SEQ+1},now);
 assert.equal(verdict.ok,false);
 assert.equal(verdict.ok===false&&verdict.reason,'session-sequence');
});

test('sayi olmayan sira reddedilir, ilk mesaj kabul edilir',()=>{
 assert.equal(acceptSource(undefined,{session:'s1',sequence:'5'},now).ok,false);
 assert.equal(acceptSource(undefined,{session:'s1',sequence:NaN},now).ok,false);
 assert.equal(acceptSource(undefined,{session:'s1',sequence:1},now).ok,true);
});

test('session alani olmayan kaynak (OPC UA dugumu) sira kontroluyle korunur',()=>{
 const ilk=acceptSource(undefined,{sequence:now},now);
 assert.equal(ilk.ok,true);
 assert.equal(ilk.ok&&ilk.next.session,'');
 const prior=ilk.ok?ilk.next:state();
 assert.equal(acceptSource(prior,{sequence:now-1},now).ok,false);
 assert.equal(acceptSource(prior,{sequence:now+1},now).ok,true);
});

test('Y4: gelecek tarihli damga reddedilir — dogrulamayi kandiramaz',()=>{
 assert.equal(acceptSampledAt(now+CLOCK_SKEW_MS+1,now),false);
 assert.equal(acceptSampledAt(now+60_000,now),false);
 assert.equal(acceptSampledAt(now+CLOCK_SKEW_MS-1,now),true);
});

test('Y4: bayat damga reddedilir, sayi olmayan damga reddedilir',()=>{
 assert.equal(acceptSampledAt(now-MAX_SAMPLE_AGE_MS-1,now),false);
 assert.equal(acceptSampledAt(now-MAX_SAMPLE_AGE_MS+1,now),true);
 assert.equal(acceptSampledAt('1700000000000',now),false);
 assert.equal(acceptSampledAt(undefined,now),false);
 assert.equal(acceptSampledAt(NaN,now),false);
 assert.equal(acceptSampledAt(now,now),true);
});
