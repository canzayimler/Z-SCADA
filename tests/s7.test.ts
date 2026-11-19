import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectionSchema,deviceSchema,tagSchema,parseS7Address,validateConfig,protocolLabels} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {s7Driver,assertDriversDeployable,driverFor,S7_MIN_CYCLE_MS} from '../packages/drivers/driver';
/* Siemens S7 surucusu (salt okuma): adres ayristirici, yapilandirma dogrulamasi,
 * Node-RED dugum uretimi ve gomulu donusum fonksiyonunun calisma davranisi. */

test('parseS7Address: DB ve alan adresleri dogru veri tipine eslenir',()=>{
 const cases:[string,string,string][]=[
  ['DB1,X0.0','DB1,X0.0','bool'],['db10,x4.7','DB10,X4.7','bool'],['DB1,INT2','DB1,INT2','int16'],['DB1,I2','DB1,I2','int16'],
  ['DB1,DINT4','DB1,DINT4','int32'],['DB1,WORD6','DB1,WORD6','uint16'],['DB1,BYTE8','DB1,BYTE8','uint16'],['DB1,DWORD10','DB1,DWORD10','uint32'],
  ['DB1,REAL14','DB1,REAL14','float32'],['DB1,R14','DB1,R14','float32'],
  ['M0.0','M0.0','bool'],['MB1','MB1','uint16'],['MW10','MW10','uint16'],['MI10','MI10','int16'],['MD20','MD20','uint32'],['MDI20','MDI20','int32'],['MR24','MR24','float32'],
  ['I0.1','I0.1','bool'],['E0.1','I0.1','bool'],['QW4','QW4','uint16'],['AW4','QW4','uint16'],[' db1 , real 4 ','DB1,REAL4','float32'],
 ];
 for(const [input,address,dataType] of cases)assert.deepEqual(parseS7Address(input),{address,dataType},input);
});
test('parseS7Address: desteklenmeyen veya eksik adresler Turkce hatayla reddedilir',()=>{
 for(const bad of ['','DB1','DB0,INT2','DB1,STRING2.10','DB1,X0','DB1,X0.8','M0','MW10.1','T1','C5','PIW256','DB1,RREAL4','DB1,DT0','XYZ','DB1,REAL4.2','MW70000'])
  assert.throws(()=>parseS7Address(bad),/S7|Bit|Desteklenmeyen/,bad);
});

const conn=(extra:object={})=>connectionSchema.parse({id:'s1',name:'PLC S7',protocol:'s7',host:'203.0.113.20',port:102,rack:0,slot:1,timeout:2000,...extra});
const device=(extra:object={})=>deviceSchema.parse({id:'sd1',connectionId:'s1',code:'S7-1',name:'S7 hat',slaveId:1,enabled:true,pollMs:1000,staleMs:4000,...extra});
const tag=(id:string,s7Address:string,dataType:string,extra:object={})=>tagSchema.parse({id,deviceId:'sd1',code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'read',min:-1e9,max:1e9,s7Address,...extra});

test('validateConfig: S7 etiketi adresle uyumlu veri tipi ister; yazma M/Q/DB adresinde serbest, girişte (I/E) reddedilir',()=>{
 const base=()=>{const c:any=structuredClone(seedConfig);c.connections.push(conn());c.devices.push(device());return c;};
 const ok=base();ok.tags.push(tag('t1','DB1,REAL4','float32'),tag('t2','M0.0','bool'));
 assert.doesNotThrow(()=>validateConfig(ok));
 const missing=base();missing.tags.push(tag('t1','','float32'));
 assert.throws(()=>validateConfig(missing),/S7 etiketi için adres gerekli/);
 const mismatch=base();mismatch.tags.push(tag('t1','DB1,INT2','float32'));
 assert.throws(()=>validateConfig(mismatch),/int16 okur/);
 const write=base();write.tags.push(tag('t1','MW10','uint16',{access:'readwrite'}),tag('t2','DB1,X0.0','bool',{access:'readwrite',min:0,max:1}),tag('t3','QW4','uint16',{access:'readwrite',deviceId:'sd1'}));
 assert.doesNotThrow(()=>validateConfig(write));
 const input=base();input.tags.push(tag('t1','E0.1','bool',{access:'readwrite'}));
 assert.throws(()=>validateConfig(input),/giriş alanına \(I\/E\) yazılamaz/);
 const inputWord=base();inputWord.tags.push(tag('t1','IW2','uint16',{access:'readwrite'}));
 assert.throws(()=>validateConfig(inputWord),/giriş alanına/);
 const readInput=base();readInput.tags.push(tag('t1','I0.1','bool'));
 assert.doesNotThrow(()=>validateConfig(readInput),'girişi okumak serbest');
 const tol=base();tol.tags.push(tag('t1','DB1,X0.0','bool',{access:'readwrite',verifyTolerance:1}));
 assert.throws(()=>validateConfig(tol),/doğrulama toleransı/);
});
test('S7 baglantisi surucu secicide Siemens S7 surucusune gider, etiketi dogru',()=>{
 assert.equal(driverFor(conn()).id,'s7');
 assert.equal(protocolLabels.s7,'Siemens S7');
 assert.equal(s7Driver.writeLimits.allowWrite,true);
});
test('s7Driver.buildNodes: endpoint (rack/slot/cevrim/degisken tablosu) + s7 in + donusum, okuma dalinda yazma dugumu yok',()=>{
 const tags=[tag('t1','db1,real4','float32'),tag('t2','E0.1','bool')];
 const nodes=s7Driver.buildNodes([conn({slot:2})],[device({pollMs:500}),device({id:'sd2',code:'S7-2',slaveId:2,pollMs:2000})],tags,{token:'tok',revision:7});
 const endpoint=nodes.find(n=>n.type==='s7 endpoint');
 assert.equal(endpoint.address,'203.0.113.20');
 assert.equal(endpoint.port,'102');
 assert.equal(endpoint.rack,'0');
 assert.equal(endpoint.slot,'2');
 assert.equal(endpoint.connmode,'rack-slot');
 assert.equal(endpoint.cycletime,S7_MIN_CYCLE_MS,'cevrim suresi cihazlarin en kisa taramasi');
 assert.deepEqual(endpoint.vartable,[{name:'t1',addr:'DB1,REAL4'},{name:'t2',addr:'I0.1'}],'adresler normallestirilmis, degisken adi etiket kimligi');
 const input=nodes.find(n=>n.type==='s7 in');
 assert.equal(input.endpoint,endpoint.id);
 assert.equal(input.mode,'all');
 assert.equal(input.diff,false,'her cevrimde tum degerler gelmeli, yalniz degisenler degil');
 assert.ok(!nodes.some(n=>n.type==='s7 out'),'yazma dugumu uretilmemeli');
});
test('s7Driver.buildNodes: devre disi cihazin etiketleri ve etiketsiz baglanti atlanir',()=>{
 assert.deepEqual(s7Driver.buildNodes([conn()],[device({enabled:false})],[tag('t1','MW10','uint16')],{token:'tok',revision:1}),[]);
 assert.deepEqual(s7Driver.buildNodes([conn()],[device()],[],{token:'tok',revision:1}),[]);
});
test('S7 donusum fonksiyonu: scale/offset uygular, eksik deger bad kalite olur, sahte good uretmez',()=>{
 const tags=[tag('t1','DB1,REAL4','float32',{scale:0.1,offset:5}),tag('t2','M0.0','bool'),tag('t3','MW10','uint16')];
 const nodes=s7Driver.buildNodes([conn()],[device()],tags,{token:'tok',revision:3});
 const convert=new Function('msg','flow',nodes.find(n=>n.type==='function').func);
 const store=new Map<string,unknown>();const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>store.set(k,v)};
 const out=convert({payload:{t1:123,t2:1,t3:null}},flow);
 assert.equal(out.payload.token,'tok');
 assert.equal(out.payload.revision,3);
 const byId=Object.fromEntries(out.payload.samples.map((s:any)=>[s.tagId,s]));
 assert.equal(byId.t1.value,17.3);
 assert.equal(byId.t1.quality,'good');
 assert.equal(byId.t2.value,true);
 assert.equal(byId.t3.value,null);
 assert.equal(byId.t3.quality,'bad');
 assert.equal(store.get('fresh-t3'),0);
});
test('assertDriversDeployable: S7 paketi yoksa acik hata, varsa okuma ve yazma gecer, girise yazma reddedilir',()=>{
 const empty=fs.mkdtempSync(path.join(os.tmpdir(),'scada-s7-'));
 const cwd=process.cwd();
 try{
  process.chdir(empty);
  assert.throws(()=>assertDriversDeployable([conn()],[device()],[tag('t1','MW10','uint16')],empty,empty),/node-red-contrib-s7 kurulu değil/);
 }finally{process.chdir(cwd);}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-s7-'));
 fs.mkdirSync(path.join(dir,'node_modules','node-red-contrib-s7'),{recursive:true});
 fs.writeFileSync(path.join(dir,'node_modules','node-red-contrib-s7','package.json'),'{}');
 assert.doesNotThrow(()=>assertDriversDeployable([conn()],[device()],[tag('t1','MW10','uint16')],dir));
 assert.doesNotThrow(()=>assertDriversDeployable([conn()],[device()],[tag('t1','MW10','uint16',{access:'readwrite'})],dir));
 assert.throws(()=>assertDriversDeployable([conn()],[device()],[tag('t1','I0.0','bool',{access:'readwrite'})],dir),/giriş alanına/);
});
test('parseS7Address ile nodes7 ayni adresi ayni tipte okur (kutuphane guncellenirse ilk bu test kirilir)',async()=>{
 const {createRequire}=await import('node:module');
 const nodes7Parser=createRequire(import.meta.url)('@st-one-io/nodes7/src/addressParser/nodes7.js');
 const want:Record<string,RegExp>={bool:/^X$/,uint16:/^(WORD|BYTE)$/,int16:/^INT$/,uint32:/^DWORD$/,int32:/^DINT$/,float32:/^REAL$/};
 for(const input of ['DB1,X0.0','DB1,INT2','DB1,DINT4','DB1,WORD6','DB1,BYTE8','DB1,DWORD10','DB1,REAL14','M0.0','MB1','MW10','MI10','MD20','MDI20','MR24','E0.1','AW4','Q1.7','IR12']){
  const ours=parseS7Address(input);
  assert.match(nodes7Parser.parse(ours.address).datatype,want[ours.dataType],input);
 }
});
