import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeRegisters,encodeValue,registerCount,tagSchema,validateConfig,type Tag} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {blocks} from '../apps/server/src/gateway';
// Test icin taban etiket: alan/tip alani cagiran testler kendi mutasyonlarini uygular.
const baseTag=(patch:Partial<Tag>):Tag=>tagSchema.parse({id:'t',deviceId:'plc-01',code:'T',name:'T',area:'holding-register',address:0,dataType:'uint16',access:'readwrite',min:-1e9,max:1e9,...patch}) as Tag;
test('registerCount bool/16 bit tipler icin 1, 32 bit tipler icin 2 dondurur',()=>{
 assert.equal(registerCount('bool'),1);
 assert.equal(registerCount('uint16'),1);
 assert.equal(registerCount('int16'),1);
 assert.equal(registerCount('uint32'),2);
 assert.equal(registerCount('int32'),2);
 assert.equal(registerCount('float32'),2);
});
test('uint32 buyuk-endian (big word/byte) cozumlemesi',()=>{
 const t=baseTag({dataType:'uint32',wordOrder:'big',byteOrder:'big'});
 assert.equal(decodeRegisters([0x0001,0x0002],t),0x00010002);
});
test('uint32 kucuk word order (little) register sirasini ters cevirir',()=>{
 const t=baseTag({dataType:'uint32',wordOrder:'little',byteOrder:'big'});
 assert.equal(decodeRegisters([0x0002,0x0001],t),0x00010002);
});
test('uint32 kucuk byte order (little) her register icindeki baytlari ters cevirir',()=>{
 const t=baseTag({dataType:'uint32',wordOrder:'big',byteOrder:'little'});
 // Kayitlardaki baytlar ters: 0x0100 -> 0x0001, 0x0200 -> 0x0002
 assert.equal(decodeRegisters([0x0100,0x0200],t),0x00010002);
});
test('int32 negatif deger isaretli cozumlenir',()=>{
 const t=baseTag({dataType:'int32',wordOrder:'big',byteOrder:'big',min:-1e9,max:1e9});
 const regs=encodeValue(-1,t);
 assert.deepEqual(regs,[0xFFFF,0xFFFF]);
 assert.equal(decodeRegisters(regs,t),-1);
});
test('float32 yuvarlama: kodla-coz round-trip uygun hassasiyette esit kalir',()=>{
 const t=baseTag({dataType:'float32',min:-1e6,max:1e6});
 for(const v of [3.14,-273.15,0,12345.678]){
  const regs=encodeValue(v,t);
  assert.equal(regs.length,2);
  const back=decodeRegisters(regs,t);
  assert.ok(Math.abs(back-v)<1e-2,`float32 round-trip ${v} -> ${back}`);
 }
});
test('float32 word order little register cifti ters cevrilir',()=>{
 const big=baseTag({dataType:'float32',wordOrder:'big',min:-1e6,max:1e6});
 const little=baseTag({dataType:'float32',wordOrder:'little',min:-1e6,max:1e6});
 const regsBig=encodeValue(42.5,big);
 const regsLittle=encodeValue(42.5,little);
 assert.deepEqual(regsLittle,[regsBig[1],regsBig[0]]);
 assert.equal(decodeRegisters(regsLittle,little),42.5);
});
test('bit alani register icinden tek biti okur',()=>{
 const t=baseTag({dataType:'uint16',bit:3,min:0,max:1});
 assert.equal(decodeRegisters([0b0000_1000],t),1,'3. bit set edilmis, diger bitler onemsiz');
 assert.equal(decodeRegisters([0b1111_0111],t),0,'3. bit temiz, diger bitler set olsa da sonuc 0');
 const t0=baseTag({dataType:'uint16',bit:0,min:0,max:1});
 assert.equal(decodeRegisters([0b0000_0001],t0),1,'0. bit (LSB) okunur');
});
test('bit alani yazarken yalniz 0/1 kabul eder ve dogru bit konumuna yerlesir',()=>{
 const t=baseTag({dataType:'uint16',bit:4,min:0,max:1});
 assert.deepEqual(encodeValue(1,t),[1<<4]);
 assert.deepEqual(encodeValue(0,t),[0]);
});
test('scale/offset uygulanmis deger sinir disindaysa acik hatayla reddedilir',()=>{
 const t=baseTag({dataType:'uint16',scale:.1,offset:0,min:0,max:100});
 assert.throws(()=>decodeRegisters([2000],t),/sınır dışı/);
 assert.throws(()=>encodeValue(150,t),/izin verilen sınırlar dışında/);
});
test('register sayisi yetersizse decodeRegisters acik hata verir',()=>{
 const t=baseTag({dataType:'uint32'});
 assert.throws(()=>decodeRegisters([1],t),/register sayısı yetersiz/);
});
test('validateConfig ayni cihaz+alanda cakisan adres araligini reddeder',()=>{
 const c=structuredClone(seedConfig);
 // tag-m0 coil adresi 2048; ayni alanda 2 register kaplayan (holding-register uint32) bir cakisma senaryosu kur.
 c.tags.push(tagSchema.parse({id:'hr-a',deviceId:'plc-01',code:'HRA',name:'HRA',area:'holding-register',address:500,dataType:'uint32',access:'read',min:-1e9,max:1e9}));
 c.tags.push(tagSchema.parse({id:'hr-b',deviceId:'plc-01',code:'HRB',name:'HRB',area:'holding-register',address:501,dataType:'uint16',access:'read',min:-1e9,max:1e9}));
 assert.throws(()=>validateConfig(c),/adres aralığı çakışıyor/);
});
test('validateConfig bitisik olmayan (cakismayan) 32 bit adres araliklarini kabul eder',()=>{
 const c=structuredClone(seedConfig);
 c.tags.push(tagSchema.parse({id:'hr-a',deviceId:'plc-01',code:'HRA',name:'HRA',area:'holding-register',address:500,dataType:'uint32',access:'read',min:-1e9,max:1e9}));
 c.tags.push(tagSchema.parse({id:'hr-b',deviceId:'plc-01',code:'HRB',name:'HRB',area:'holding-register',address:502,dataType:'uint16',access:'read',min:-1e9,max:1e9}));
 assert.doesNotThrow(()=>validateConfig(c));
});
test('validateConfig 16 bit disi tipte bit alani tanimlanamaz',()=>{
 const c=structuredClone(seedConfig);
 c.tags.push(tagSchema.parse({id:'hr-c',deviceId:'plc-01',code:'HRC',name:'HRC',area:'holding-register',address:600,dataType:'uint32',access:'read',min:-1e9,max:1e9,bit:2}));
 assert.throws(()=>validateConfig(c),/bit alanı yalnız 16 bit/);
});
test('blocks() 32 bit etiketleri register genisligine gore bitisik gruplar',()=>{
 const tags=[
  baseTag({id:'a',code:'A',area:'holding-register',address:100,dataType:'uint32'}),
  baseTag({id:'b',code:'B',area:'holding-register',address:102,dataType:'uint16'}),
  baseTag({id:'c',code:'C',area:'holding-register',address:200,dataType:'uint16'}),
 ];
 const b=blocks(tags);
 assert.equal(b.length,2,'ilk iki etiket bitisik (100-101, 102), uzak olan ayri blok');
 assert.equal(b[0].tags.length,2);
 assert.equal(b[1].tags.length,1);
});
test('sinir disi yazma reddedilir (uint16 ve float32)',()=>{
 const u=baseTag({dataType:'uint16',min:0,max:100});
 assert.throws(()=>encodeValue(101,u),/izin verilen sınırlar dışında/);
 const f=baseTag({dataType:'float32',min:-10,max:10});
 assert.throws(()=>encodeValue(11,f),/izin verilen sınırlar dışında/);
 assert.doesNotThrow(()=>encodeValue(9.5,f));
});
/* B58: dijital deger olcek/offset tasimaz. Kodek tek kaynaga indirilirken
 * cozme yolu bir ara kanonik decodeRegisters'a baglandi; kanonik bool'a da
 * scale/offset uyguladigi icin offset!=0 tanimli bir bool etiketinde 0
 * register'i sifirdan kayiyor ve Boolean() HER ZAMAN true okuyordu — kapali
 * kontak ekranda acik gorunurdu. Eslik (parity) testi bunu yakalayamaz:
 * gomulu kopya ile kanonik ayni hatayi paylastigi icin ikisi de "esit"tir.
 * Bu test dogrulugu ayrica olcer. */
test('bool cozumlemesi olcek/offset tasimaz (kapali kontak acik gorunmez)',()=>{
 const t=baseTag({dataType:'bool',area:'coil',scale:1,offset:1,min:0,max:65535});
 assert.equal(decodeRegisters([0],t),0,'offset tanimli olsa da kapali kontak 0 kalir');
 assert.equal(decodeRegisters([1],t),1);
 const scaled=baseTag({dataType:'bool',area:'coil',scale:5,offset:0,min:0,max:65535});
 assert.equal(decodeRegisters([1],scaled),1,'olcek dijital degeri buyutmez');
 // Kodlama zaten bool icin olcegi atliyor; cozme onun tersi olmali.
 // Not: encodeValue sayisal kontrolu bool erken donusunden ONCE yapar, yani
 // 0/1 bekler. Surucu bool yazmayi zaten ayri ele alir (fc=5) ve buraya girmez.
 assert.deepEqual(encodeValue(1,t),[1]);
 assert.deepEqual(encodeValue(0,t),[0]);
});
test('bool cozumlemesi muhendislik sinirina takilmaz',()=>{
 const t=baseTag({dataType:'bool',area:'coil',scale:1,offset:0,min:10,max:20});
 assert.doesNotThrow(()=>decodeRegisters([1],t),'dijital deger min/max araligina tabi degildir');
 assert.equal(decodeRegisters([1],t),1);
});
