import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeRegisters,encodeValue,registerCount,modbusCodecSource,tagSchema,connectionSchema,deviceSchema,type Tag} from '../packages/contracts/model';
import {modbusDriver,buildWriteBridge,MODBUS_WRITE_PREP_ID} from '../packages/drivers/driver';
/* B58: bu dosyanin asil degeri kanonik TS kodek (model.ts) ile gomulu Node-RED function
 * node'una .toString() ile tasinan kodek'in AYNI davrandigini kanitlamaktir — boylece
 * gomulu kopya bir daha sessizce kayamaz. modbusCodecSource() metnini gercekten calistirip
 * (new Function) kanonik fonksiyonlarla ayni girdide ayni sonucu verdigini dogruluyoruz;
 * ayrica buildNodes ile uretilen '-convert' ve 'scada-write-guard' dugumlerinin func
 * govdelerinin sozdizimsel olarak gecerli oldugunu (derlenebildigini) kontrol ediyoruz. */
const baseTag=(patch:Partial<Tag>):Tag=>tagSchema.parse({id:'t',deviceId:'d1',code:'T',name:'T',area:'holding-register',address:0,dataType:'uint16',access:'readwrite',min:-1e9,max:1e9,...patch}) as Tag;
// modbusCodecSource() metnini gercek fonksiyonlara donusturur (gomulu kopyanin calisma zamani esdegeri).
function loadEmbeddedCodec(){
 const body=modbusCodecSource()+'\nreturn {decodeRegisters,encodeValue,registerCount};';
 return (new Function(body))() as {decodeRegisters:(r:number[],t:Tag)=>number;encodeValue:(v:number,t:Tag)=>number[];registerCount:(dt:Tag['dataType'])=>number};
}
const embedded=loadEmbeddedCodec();
// --- registerCount paritesi --------------------------------------------------
test('gomulu registerCount kanonikle ayni',()=>{
 for(const dt of ['bool','uint16','int16','uint32','int32','float32'] as const){
  assert.equal(embedded.registerCount(dt),registerCount(dt),dt);
 }
});
// --- bool ---------------------------------------------------------------------
test('bool: decode/encode paritesi',()=>{
 const t=baseTag({dataType:'bool',area:'coil',min:0,max:1});
 for(const regs of [[0],[1],[7]]){
  assert.equal(embedded.decodeRegisters(regs,t),decodeRegisters(regs,t));
 }
 for(const v of [0,1]){
  assert.deepEqual(embedded.encodeValue(v,t),encodeValue(v,t));
 }
});
// --- uint16 ---------------------------------------------------------------------
test('uint16: decode/encode paritesi',()=>{
 const t=baseTag({dataType:'uint16',min:0,max:65535});
 for(const regs of [[0],[1],[65535],[1234]]){
  assert.equal(embedded.decodeRegisters(regs,t),decodeRegisters(regs,t));
 }
 for(const v of [0,1,65535,1234]){
  assert.deepEqual(embedded.encodeValue(v,t),encodeValue(v,t));
 }
});
// --- int16 (negatif deger dahil) -------------------------------------------------
test('int16: negatif deger decode/encode paritesi',()=>{
 const t=baseTag({dataType:'int16',min:-32768,max:32767});
 for(const regs of [[0],[1],[32767],[0x8000],[0xFFFF]]){// 0x8000=-32768, 0xFFFF=-1
  assert.equal(embedded.decodeRegisters(regs,t),decodeRegisters(regs,t));
 }
 for(const v of [0,1,-1,-32768,32767]){
  assert.deepEqual(embedded.encodeValue(v,t),encodeValue(v,t));
 }
});
// --- uint32 -----------------------------------------------------------------------
test('uint32: decode/encode paritesi',()=>{
 const t=baseTag({dataType:'uint32',min:0,max:4294967295});
 for(const regs of [[0x0001,0x0002],[0xFFFF,0xFFFF],[0,0]]){
  assert.equal(embedded.decodeRegisters(regs,t),decodeRegisters(regs,t));
 }
 for(const v of [0,0x00010002,4294967295]){
  assert.deepEqual(embedded.encodeValue(v,t),encodeValue(v,t));
 }
});
// --- int32 (negatif deger dahil) ------------------------------------------------
test('int32: negatif deger decode/encode paritesi',()=>{
 const t=baseTag({dataType:'int32',min:-2147483648,max:2147483647});
 for(const regs of [[0xFFFF,0xFFFF],[0x8000,0x0000],[0x0001,0x0002]]){
  assert.equal(embedded.decodeRegisters(regs,t),decodeRegisters(regs,t));
 }
 for(const v of [-1,-2147483648,2147483647,0x00010002]){
  assert.deepEqual(embedded.encodeValue(v,t),encodeValue(v,t));
 }
});
// --- float32 ----------------------------------------------------------------------
test('float32: decode/encode paritesi',()=>{
 const t=baseTag({dataType:'float32',min:-1e9,max:1e9});
 for(const regs of [[0x4048,0xF5C3],[0xC048,0xF5C3],[0,0]]){// ~3.14 / -3.14 / 0
  assert.equal(embedded.decodeRegisters(regs,t),decodeRegisters(regs,t));
 }
 for(const v of [3.140000104904175,-3.140000104904175,0,1000000]){
  assert.deepEqual(embedded.encodeValue(v,t),encodeValue(v,t));
 }
});
// --- wordOrder x byteOrder 4 kombinasyon (32 bit veri tipleriyle) ---------------
test('wordOrder/byteOrder 4 kombinasyonda decode/encode paritesi',()=>{
 for(const wordOrder of ['big','little'] as const)for(const byteOrder of ['big','little'] as const){
  const t=baseTag({dataType:'uint32',wordOrder,byteOrder,min:0,max:4294967295});
  const regs=[0x1234,0x5678];
  assert.equal(embedded.decodeRegisters(regs,t),decodeRegisters(regs,t),`decode ${wordOrder}/${byteOrder}`);
  const v=0x11223344;
  assert.deepEqual(embedded.encodeValue(v,t),encodeValue(v,t),`encode ${wordOrder}/${byteOrder}`);
 }
});
// --- bit alani (0/1) --------------------------------------------------------------
test('bit alani: decode/encode paritesi',()=>{
 const t=baseTag({dataType:'uint16',bit:3,min:0,max:1});
 for(const regs of [[0b0000],[0b1000],[0b1111]]){
  assert.equal(embedded.decodeRegisters(regs,t),decodeRegisters(regs,t));
 }
 for(const v of [0,1]){
  assert.deepEqual(embedded.encodeValue(v,t),encodeValue(v,t));
 }
});
// --- scale/offset uygulanmis deger --------------------------------------------
test('scale/offset uygulanmis deger: decode/encode paritesi',()=>{
 const t=baseTag({dataType:'uint16',scale:0.1,offset:5,min:-1e6,max:1e6});
 for(const regs of [[0],[100],[500]]){
  assert.equal(embedded.decodeRegisters(regs,t),decodeRegisters(regs,t));
 }
 for(const v of [5,15,55]){
  assert.deepEqual(embedded.encodeValue(v,t),encodeValue(v,t));
 }
});
// --- sinir disi deger: decode ve encode'da HATA -----------------------------------
test('sinir disi deger: decode hem gomulu hem kanonikte firlar',()=>{
 const t=baseTag({dataType:'uint16',min:0,max:100});
 assert.throws(()=>decodeRegisters([200],t));
 assert.throws(()=>embedded.decodeRegisters([200],t));
});
test('sinir disi deger: encode hem gomulu hem kanonikte firlar',()=>{
 const t=baseTag({dataType:'uint16',min:0,max:100});
 assert.throws(()=>encodeValue(200,t));
 assert.throws(()=>embedded.encodeValue(200,t));
});
// --- gomulu function node metinleri sozdizimsel olarak gecerli mi ------------------
test('buildNodes: -convert ve scada-write-guard func govdeleri derlenebiliyor (new Function)',()=>{
 const conn=connectionSchema.parse({id:'c1',name:'PLC',host:'10.0.0.5',port:502,timeout:3000});
 const dev=deviceSchema.parse({id:'d1',connectionId:'c1',code:'D1',name:'D1',slaveId:1,enabled:true,pollMs:1000,staleMs:4000});
 const tag=tagSchema.parse({id:'t1',deviceId:'d1',code:'T1',name:'T1',area:'holding-register',address:0,dataType:'uint16',access:'readwrite',min:-1e9,max:1e9});
 const nodes=modbusDriver.buildNodes([conn],[dev],[tag],{token:'tok',revision:1});
 const branch=modbusDriver.buildWriteNodes!([conn],[dev],[tag],{token:'tok',revision:1});
 const bridge=buildWriteBridge('tok',1,[{branch,devices:[dev],tags:[tag]}]);
 const convert=nodes.find(n=>n.id==='scada-poll-c1-convert');
 const guard=bridge.find(n=>n.id==='scada-write-guard');
 const prep=bridge.find(n=>n.id===MODBUS_WRITE_PREP_ID);
 const result=bridge.find(n=>n.id==='scada-write-result');
 assert.ok(convert,'convert dugumu bulunamadi');
 assert.ok(guard,'write-guard dugumu bulunamadi');
 assert.ok(prep,'Modbus yazma dali (kodlama) bulunamadi');
 assert.doesNotThrow(()=>new Function('msg','flow','context','node',convert!.func));
 assert.doesNotThrow(()=>new Function('msg','flow','context','node',guard!.func));
 assert.doesNotThrow(()=>new Function('msg','flow','context','node',prep!.func));
 assert.doesNotThrow(()=>new Function('msg','flow','context','node',result!.func));
 assert.ok(prep!.func.includes('encodeValue('),'kanonik encodeValue Modbus dalinda kalmali');
});
