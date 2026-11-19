import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestBindings,suggestMainTag,applySuggestions,newWidget} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';

/* K08: etiket adina gore otomatik bag onerisi. suggestBindings SAF'tir: hicbir seyi
 * baglamaz, yalniz govde (stem) + rol eki (suffix) eslesirse aday dondurur.
 * Belirsiz eslesme (ayni role birden fazla aday) veya tur uyusmazligi onerilmez. */

let n=0;
const mkTag=(deviceId:string,code:string,dataType:'bool'|'uint16')=>({
 id:'tag-'+(n++),deviceId,code,name:code,area:(dataType==='bool'?'coil':'holding-register') as 'coil'|'holding-register',
 address:100,dataType,access:'readwrite' as const,scale:1,offset:0,min:0,max:dataType==='bool'?1:1000,unit:'',
 wordOrder:'big' as const,byteOrder:'big' as const,bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,description:''});
function buildConfig(extraTags:ReturnType<typeof mkTag>[]){
 const c=structuredClone(seedConfig);
 c.tags.push(...extraTags);
 return c;
}

test('valve: OPEN/CLOSE/FLT siblings suggest openLimit/closeLimit/fault',()=>{
 const main=mkTag('plc-01','V101_POS','uint16');
 const open=mkTag('plc-01','V101_OPEN','bool');
 const close=mkTag('plc-01','V101_CLOSE','bool');
 const flt=mkTag('plc-01','V101_FLT','bool');
 const config=buildConfig([main,open,close,flt]);
 const w={...newWidget('valve'),tagId:main.id};
 const out=suggestBindings(w,config);
 assert.deepEqual(out.map(s=>s.role).sort(),['closeLimit','fault','openLimit']);
 assert.equal(out.find(s=>s.role==='openLimit')?.tagId,open.id);
 assert.equal(out.find(s=>s.role==='closeLimit')?.tagId,close.id);
 assert.equal(out.find(s=>s.role==='fault')?.tagId,flt.id);
});
test('siblings on a different device with the same stem are not suggested',()=>{
 const main=mkTag('plc-01','V101_POS','uint16');
 const open=mkTag('plc-01','V101_OPEN','bool');
 const otherDeviceOpen=mkTag('plc-02','V101_OPEN','bool'); // wrong device
 const config=buildConfig([main,open,otherDeviceOpen]);
 config.devices.push({id:'plc-02',connectionId:'conn-01',code:'PLC-02',name:'İkinci PLC',slaveId:2,enabled:true,pollMs:1000,staleMs:4000,description:''});
 const w={...newWidget('valve'),tagId:main.id};
 const out=suggestBindings(w,config);
 // the wrong-device tag must be filtered out before matching, so only the same-device
 // candidate remains and the match is unambiguous.
 assert.equal(out.find(s=>s.role==='openLimit')?.tagId,open.id);
});
test('a tag whose stem differs (V102_OPEN) is not suggested for V101_POS',()=>{
 const main=mkTag('plc-01','V101_POS','uint16');
 const wrongStem=mkTag('plc-01','V102_OPEN','bool');
 const config=buildConfig([main,wrongStem]);
 const w={...newWidget('valve'),tagId:main.id};
 const out=suggestBindings(w,config);
 assert.deepEqual(out,[]);
});
test('kind mismatch is skipped: a numeric V101_FLT is not offered for the bool-kind fault role',()=>{
 const main=mkTag('plc-01','V101_POS','uint16');
 const numericFlt=mkTag('plc-01','V101_FLT','uint16');
 const config=buildConfig([main,numericFlt]);
 const w={...newWidget('valve'),tagId:main.id};
 const out=suggestBindings(w,config);
 assert.ok(!out.some(s=>s.role==='fault'));
});
test('ambiguity is dropped: two bool siblings matching the same role keyword set suggest nothing for that role',()=>{
 const main=mkTag('plc-01','V101_POS','uint16');
 const open1=mkTag('plc-01','V101_OPEN','bool');
 const open2=mkTag('plc-01','V101_ACIK','bool'); // both match openLimit keywords (OPEN / ACIK)
 const config=buildConfig([main,open1,open2]);
 const w={...newWidget('valve'),tagId:main.id};
 const out=suggestBindings(w,config);
 assert.ok(!out.some(s=>s.role==='openLimit'));
});
test('a role that already has a bound tag on the widget is not suggested again',()=>{
 const main=mkTag('plc-01','V101_POS','uint16');
 const flt=mkTag('plc-01','V101_FLT','bool');
 const config=buildConfig([main,flt]);
 const w={...newWidget('valve'),tagId:main.id,bindings:[{role:'fault',tagId:'tag-already-bound',invert:false}]};
 const out=suggestBindings(w,config);
 assert.ok(!out.some(s=>s.role==='fault'));
});
test('a tag already used by the widget (own tagId, or an existing binding tagId) is never suggested',()=>{
 const main=mkTag('plc-01','V101_POS','uint16');
 const open=mkTag('plc-01','V101_OPEN','bool');
 const config=buildConfig([main,open]);
 // 'open' tag is already used for an unrelated role -> must not be offered for openLimit either.
 const w={...newWidget('valve'),tagId:main.id,bindings:[{role:'target',tagId:open.id,invert:false}]};
 const out=suggestBindings(w,config);
 assert.ok(!out.some(s=>s.role==='openLimit'));
 assert.ok(!out.some(s=>s.tagId===open.id));
});
test('Turkish folding: P101_HIZ with sibling P101_ARIZA (Ç/Ş/İ/ı style spelling) suggests the fault role',()=>{
 const main=mkTag('plc-01','P101_HIZ','uint16');
 const ariza=mkTag('plc-01','P101_arıza','bool'); // dotless-ı lower-case Turkish spelling
 const running=mkTag('plc-01','P101_ÇALIŞIYOR','bool'); // Ç and Ş folding
 const config=buildConfig([main,ariza,running]);
 const w={...newWidget('motor'),tagId:main.id};
 const out=suggestBindings(w,config);
 assert.equal(out.find(s=>s.role==='fault')?.tagId,ariza.id);
 assert.equal(out.find(s=>s.role==='running')?.tagId,running.id);
});
test('Turkish folding: a fully lower-case p101_ariza sibling also matches',()=>{
 const main=mkTag('plc-01','P101_HIZ','uint16');
 const ariza=mkTag('plc-01','p101_ariza','bool');
 const config=buildConfig([main,ariza]);
 const w={...newWidget('motor'),tagId:main.id};
 const out=suggestBindings(w,config);
 assert.equal(out.find(s=>s.role==='fault')?.tagId,ariza.id);
});
test('a widget type with no binding defs (e.g. text) returns an empty array',()=>{
 const main=mkTag('plc-01','V101_POS','uint16');
 const open=mkTag('plc-01','V101_OPEN','bool');
 const config=buildConfig([main,open]);
 const w={...newWidget('text'),tagId:main.id};
 assert.deepEqual(suggestBindings(w,config),[]);
});
test('a widget whose tagId is empty or points at a missing tag returns an empty array',()=>{
 const config=buildConfig([]);
 assert.deepEqual(suggestBindings({...newWidget('valve'),tagId:''},config),[]);
 assert.deepEqual(suggestBindings({...newWidget('valve'),tagId:'no-such-tag'},config),[]);
});
test('separators: "_", "-" and "." all split the stem',()=>{
 const mainDash=mkTag('plc-01','V101-POS','uint16');
 const openDash=mkTag('plc-01','V101-OPEN','bool');
 const mainDot=mkTag('plc-01','V201.POS','uint16');
 const openDot=mkTag('plc-01','V201.OPEN','bool');
 const config=buildConfig([mainDash,openDash,mainDot,openDot]);
 const wDash={...newWidget('valve'),tagId:mainDash.id};
 const wDot={...newWidget('valve'),tagId:mainDot.id};
 assert.equal(suggestBindings(wDash,config).find(s=>s.role==='openLimit')?.tagId,openDash.id);
 assert.equal(suggestBindings(wDot,config).find(s=>s.role==='openLimit')?.tagId,openDot.id);
});
test('a code with no separator yields no suggestions (stem has no suffix to match)',()=>{
 const main=mkTag('plc-01','V301POS','uint16'); // no separator: stem is the whole code
 const unrelatedOpen=mkTag('plc-01','V301_OPEN','bool'); // stem 'V301', does not match 'V301POS'
 const config=buildConfig([main,unrelatedOpen]);
 const w={...newWidget('valve'),tagId:main.id};
 assert.deepEqual(suggestBindings(w,config),[]);
});

/* --- Akilli atama v2: ana etiket olmadan da oneri ------------------------ */
test('no main tag: a label with digits ("V-101") anchors the stem',()=>{
 const open=mkTag('plc-01','V101_OPEN','bool');
 const close=mkTag('plc-01','V101_CLOSE','bool');
 const config=buildConfig([open,close]);
 const w={...newWidget('valve'),label:'V-101',tagId:''};
 const out=suggestBindings(w,config);
 assert.equal(out.find(s=>s.role==='openLimit')?.tagId,open.id);
 assert.equal(out.find(s=>s.role==='closeLimit')?.tagId,close.id);
});
test('no main tag: a generic label without digits never anchors a stem',()=>{
 const open=mkTag('plc-01','VANA_OPEN','bool');
 const config=buildConfig([open]);
 assert.deepEqual(suggestBindings({...newWidget('valve'),label:'Vana',tagId:''},config),[]);
});
test('no main tag: an already bound role anchors the stem for the remaining roles',()=>{
 const flt=mkTag('plc-01','P201_FLT','bool');
 const run=mkTag('plc-01','P201_RUN','bool');
 const config=buildConfig([flt,run]);
 const w={...newWidget('motor'),label:'Motor',tagId:'',bindings:[{role:'fault',tagId:flt.id,invert:false}]};
 const out=suggestBindings(w,config);
 assert.equal(out.find(s=>s.role==='running')?.tagId,run.id);
 assert.ok(!out.some(s=>s.role==='fault'));
});
test('label anchor across two devices with the same stem is ambiguous and dropped',()=>{
 const a=mkTag('plc-01','V101_OPEN','bool');
 const b=mkTag('plc-02','V101_OPEN','bool');
 const config=buildConfig([a,b]);
 const out=suggestBindings({...newWidget('valve'),label:'V101',tagId:''},config);
 assert.ok(!out.some(s=>s.role==='openLimit'));
});
test('tag name words match when the code suffix is not a role keyword',()=>{
 const main=mkTag('plc-01','P301_HIZ','uint16');
 const alarm={...mkTag('plc-01','P301_B7','bool'),name:'Pompa 301 arıza'};
 const config=buildConfig([main,alarm]);
 const out=suggestBindings({...newWidget('motor'),tagId:main.id},config);
 assert.equal(out.find(s=>s.role==='fault')?.tagId,alarm.id);
});
test('a code suffix that names another role wins over the free-text name',()=>{
 const main=mkTag('plc-01','P401_HIZ','uint16');
 const run={...mkTag('plc-01','P401_RUN','bool'),name:'P401 arıza sonrası çalışma'};
 const config=buildConfig([main,run]);
 const out=suggestBindings({...newWidget('motor'),tagId:main.id},config);
 assert.equal(out.find(s=>s.role==='running')?.tagId,run.id);
 assert.ok(!out.some(s=>s.role==='fault'));
});
test('suggestMainTag: exact code match by label, kind-checked and unique',()=>{
 const bool=mkTag('plc-01','LS101','bool');
 const config=buildConfig([bool]);
 const lamp={...newWidget('indicator'),label:'LS-101',tagId:''};
 assert.equal(lamp.mode,'digital');
 assert.equal(suggestMainTag(lamp,config)?.tagId,bool.id);
 const analog={...newWidget('indicator'),label:'LS-101',tagId:'',mode:'analog' as const};
 assert.equal(suggestMainTag(analog,config),null,'bool etiket analog nesneye onerilmez');
});
test('suggestMainTag: never overrides an existing main tag, never guesses without digits',()=>{
 const bool=mkTag('plc-01','LS102','bool');
 const config=buildConfig([bool]);
 assert.equal(suggestMainTag({...newWidget('indicator'),label:'LS102',tagId:'x'},config),null);
 assert.equal(suggestMainTag({...newWidget('indicator'),label:'Lamba',tagId:''},config),null);
});
test('applySuggestions: fills main tag and roles in one step; no-op keeps the same object',()=>{
 const pos=mkTag('plc-01','V501','uint16');
 const open=mkTag('plc-01','V501_OPEN','bool');
 const config=buildConfig([pos,open]);
 const valve={...newWidget('valve'),label:'V501',tagId:'',mode:'analog' as const};
 const r=applySuggestions(valve,config);
 assert.equal(r.widget.tagId,pos.id);
 assert.equal(r.widget.bindings.find(b=>b.role==='openLimit')?.tagId,open.id);
 assert.equal(r.applied,2);
 const none={...newWidget('valve'),label:'Vana',tagId:''};
 const n2=applySuggestions(none,config);
 assert.equal(n2.applied,0);
 assert.equal(n2.widget,none);
});

/* Koyu temada sabit beyaz zeminli ekran: tuval zeminin parlakligina gore tema secer. */
import {surfaceTheme} from '../packages/symbols/isa';
test('surfaceTheme: explicit background decides the canvas theme; empty follows the app',()=>{
 assert.equal(surfaceTheme('#ffffff','dark'),'light');
 assert.equal(surfaceTheme('#0b1720','light'),'dark');
 assert.equal(surfaceTheme('#dfe2e6','dark'),'light');
 assert.equal(surfaceTheme('#5a6068','light'),'dark');
 assert.equal(surfaceTheme('','dark'),'dark');
 assert.equal(surfaceTheme('not-a-color','light'),'light');
});
