import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSzl,parseCpuMode,parseModuleId,parseComponentId,parseBcdTime,parseDiagBuffer,eventClassLabels,cpuModeLabels,type SzlRecords} from '../packages/drivers/s7Health';
/* S7 SZL ayristiricilari: Siemens SZL yerlesimine gore elle uretilmis bayt tamponlari. */

const hdr=(id:number,index:number,len:number,count:number)=>{const b=Buffer.alloc(8);b.writeUInt16BE(id,0);b.writeUInt16BE(index,2);b.writeUInt16BE(len,4);b.writeUInt16BE(count,6);return b;};
const szl=(id:number,len:number,records:Buffer[],count=records.length,index=0)=>Buffer.concat([hdr(id,index,len,count),...records]);
const wrap=(id:number,records:Buffer[]):SzlRecords=>({id,index:0,records});
const modRec=(idx:number,mlfb:string,ver?:[number,number,number],size=28)=>{
 const r=Buffer.alloc(size);r.writeUInt16BE(idx,0);r.write(mlfb,2,'latin1');
 if(ver&&size>=28){r[25]=ver[0];r[26]=ver[1];r[27]=ver[2];}
 return r;
};
const compRec=(idx:number,text:string)=>{const r=Buffer.alloc(34);r.writeUInt16BE(idx,0);r.write(text,2,'latin1');return r;};
const bcd=(n:number)=>((Math.floor(n/10))<<4)|(n%10);
const bcdTime=(y:number,mo:number,d:number,h:number,mi:number,s:number,ms=0,dow=0)=>Buffer.from([bcd(y),bcd(mo),bcd(d),bcd(h),bcd(mi),bcd(s),bcd(Math.floor(ms/10)),((ms%10)<<4)|dow]);
const diagRec=(id:number,info:Buffer=Buffer.alloc(10),ts:Buffer=bcdTime(26,9,30,14,5,7,123)):Buffer=>{const r=Buffer.alloc(20);r.writeUInt16BE(id,0);info.copy(r,2);ts.copy(r,12);return r;};

test('parseSzl: null yanit veya 8 bayttan kisa tampon icin null doner',()=>{
 assert.equal(parseSzl(undefined),null);
 assert.equal(parseSzl(null),null);
 assert.equal(parseSzl(Buffer.alloc(0)),null);
 assert.equal(parseSzl(Buffer.alloc(7)),null);
 assert.notEqual(parseSzl(Buffer.alloc(8)),null);
});
test('parseSzl: LENTHDR veya N_DR sifirsa kayit listesi bos, baslik alanlari okunur',()=>{
 const a=parseSzl(hdr(0x0424,0x0001,0,3));
 assert.deepEqual(a,{id:0x0424,index:1,records:[]});
 const b=parseSzl(Buffer.concat([hdr(0x0011,0,28,0),Buffer.alloc(28)]));
 assert.deepEqual(b,{id:0x0011,index:0,records:[]});
});
test('parseSzl: birden fazla kayit dogru dilimlenir (buyuk sonlu baslik)',()=>{
 const r1=Buffer.from([1,2,3,4]),r2=Buffer.from([5,6,7,8]),r3=Buffer.from([9,10,11,12]);
 const s=parseSzl(szl(0x1234,4,[r1,r2,r3],3,0x00ab))!;
 assert.equal(s.id,0x1234);assert.equal(s.index,0x00ab);
 assert.equal(s.records.length,3);
 assert.deepEqual([...s.records[0]],[1,2,3,4]);
 assert.deepEqual([...s.records[1]],[5,6,7,8]);
 assert.deepEqual([...s.records[2]],[9,10,11,12]);
});
test('parseSzl: N_DR eldekinden fazlaysa yarim kayit atilir, tam kayitlar korunur',()=>{
 const r1=Buffer.from([1,2,3,4]),r2=Buffer.from([5,6,7,8]);
 const s=parseSzl(Buffer.concat([szl(1,4,[r1,r2],5),Buffer.from([9,9])]))!;
 assert.equal(s.records.length,2);
 assert.deepEqual([...s.records[1]],[5,6,7,8]);
 // hic tam kayit yoksa da hata yok
 assert.deepEqual(parseSzl(Buffer.concat([hdr(1,0,10,2),Buffer.alloc(9)]))!.records,[]);
});

test('parseCpuMode: bzu-id alt dord biti moda eslenir',()=>{
 const rec=(b3:number)=>Buffer.from([0,0,0,b3,0,0]);
 const mode=(b3:number)=>parseCpuMode(wrap(0x0424,[rec(b3)]));
 assert.equal(mode(0x08),'run');
 assert.equal(mode(0x03),'stop');
 assert.equal(mode(0x04),'startup');
 assert.equal(mode(0x0d),'defect');
 assert.equal(mode(0x0f),'unknown');
 assert.equal(mode(0x00),'unknown');
 // ust yarim bayt yok sayilir
 assert.equal(mode(0xa8),'run');
 assert.equal(mode(0x53),'stop');
});
test('parseCpuMode: kayit yoksa veya 4 bayttan kisaysa null',()=>{
 assert.equal(parseCpuMode(null),null);
 assert.equal(parseCpuMode(wrap(0x0424,[])),null);
 assert.equal(parseCpuMode(wrap(0x0424,[Buffer.from([0,0,8])])),null);
 assert.equal(parseCpuMode(wrap(0x0424,[Buffer.from([0,0,0,8])])),'run');
});
test('parseCpuMode: SZL tamponundan uctan uca ve etiket tablosu',()=>{
 const s=parseSzl(szl(0x0424,6,[Buffer.from([0x02,0x51,0xff,0x08,0x00,0x00])]));
 assert.equal(parseCpuMode(s),'run');
 assert.equal(cpuModeLabels.run,'RUN');
 assert.equal(cpuModeLabels.stop,'STOP');
 for(const k of ['run','stop','startup','hold','defect','unknown'] as const)assert.ok(cpuModeLabels[k]);
});

test('parseModuleId: index 1 siparis numarasi (NUL ve bosluk dolgulu)',()=>{
 const r=parseModuleId(wrap(0x0011,[modRec(1,'6ES7 214-1AG40-0XB0')]));
 assert.deepEqual(r,{orderNo:'6ES7 214-1AG40-0XB0'});
 const padded=parseModuleId(wrap(0x0011,[modRec(1,'6ES7 214-1AG40-0XB0  ')]));
 assert.equal(padded!.orderNo,'6ES7 214-1AG40-0XB0');
});
test('parseModuleId: index 7 firmware, index 6 donanim surum bayt 25-27',()=>{
 const r=parseModuleId(wrap(0x0011,[
  modRec(1,'6ES7 214-1AG40-0XB0'),
  modRec(6,'',[1,0,0]),
  modRec(7,'',[4,5,2]),
 ]))!;
 assert.equal(r.orderNo,'6ES7 214-1AG40-0XB0');
 assert.equal(r.hardware,'V1.0.0');
 assert.equal(r.firmware,'V4.5.2');
});
test('parseModuleId: 26 baytlik index-1 kaydi (emulator) siparis no verir, surum vermez',()=>{
 const r=parseModuleId(wrap(0x0011,[modRec(1,'6ES7 214-1AG40-0XB0',undefined,26),modRec(7,'',undefined,26),modRec(6,'',undefined,26)]))!;
 assert.equal(r.orderNo,'6ES7 214-1AG40-0XB0');
 assert.equal(r.firmware,undefined);
 assert.equal(r.hardware,undefined);
});
test('parseModuleId: bos veya null girdi null, 22 bayttan kisa kayit atlanir, bilinmeyen index yok sayilir',()=>{
 assert.equal(parseModuleId(null),null);
 assert.equal(parseModuleId(wrap(0x0011,[])),null);
 assert.deepEqual(parseModuleId(wrap(0x0011,[modRec(1,'ABC',undefined,21)])),{});
 assert.deepEqual(parseModuleId(wrap(0x0011,[modRec(2,'XYZ',[1,2,3])])),{});
 // bos MLFB siparis numarasini ayarlamaz
 assert.deepEqual(parseModuleId(wrap(0x0011,[modRec(1,'')])),{});
});
test('parseModuleId: SZL tamponundan uctan uca',()=>{
 const s=parseSzl(szl(0x0011,28,[modRec(1,'6ES7 214-1AG40-0XB0'),modRec(7,'',[4,5,2])]));
 assert.deepEqual(parseModuleId(s),{orderNo:'6ES7 214-1AG40-0XB0',firmware:'V4.5.2'});
});

test('parseComponentId: bilinen indeksler alanlara eslenir',()=>{
 const r=parseComponentId(wrap(0x001c,[
  compRec(1,'S7-1200 Hat 1'),compRec(2,'CPU 1214C DC/DC/DC'),compRec(3,'Tesis-A'),compRec(5,'S C-ABC123456'),compRec(7,'CPU 1214C'),
 ]));
 assert.deepEqual(r,{systemName:'S7-1200 Hat 1',moduleName:'CPU 1214C DC/DC/DC',plantId:'Tesis-A',serial:'S C-ABC123456',moduleType:'CPU 1214C'});
});
test('parseComponentId: bilinmeyen indeks yok sayilir, NUL ve kontrol karakterleri kirpilir',()=>{
 const r=parseComponentId(wrap(0x001c,[compRec(4,'gizli'),compRec(9,'x'),compRec(1,'\0\tAd\r\n'),compRec(2,'')]))!;
 assert.deepEqual(r,{systemName:'Ad'});
 assert.deepEqual(parseComponentId(wrap(0x001c,[compRec(4,'gizli')])),{});
});
test('parseComponentId: bos/null girdi null; 4 bayttan kisa kayit atlanir',()=>{
 assert.equal(parseComponentId(null),null);
 assert.equal(parseComponentId(wrap(0x001c,[])),null);
 assert.deepEqual(parseComponentId(wrap(0x001c,[Buffer.from([0,1,0])])),{});
 assert.deepEqual(parseComponentId(wrap(0x001c,[Buffer.from([0,1,0x41,0x42])])),{systemName:'AB'});
});
test('parseComponentId: SZL tamponundan uctan uca',()=>{
 const s=parseSzl(szl(0x001c,34,[compRec(1,'Sistem'),compRec(5,'SN42')]));
 assert.deepEqual(parseComponentId(s),{systemName:'Sistem',serial:'SN42'});
});

test('parseBcdTime: BCD tarih-saat yerel saat olarak okunur, ms = byte6*10 + byte7 ust yarim',()=>{
 const b=Buffer.from([0x26,0x09,0x30,0x14,0x05,0x07,0x12,0x3f]);
 const d=parseBcdTime(b)!;
 assert.ok(d instanceof Date);
 assert.equal(d.getTime(),new Date(2026,8,30,14,5,7,123).getTime());
 assert.equal(d.getFullYear(),2026);assert.equal(d.getMonth(),8);assert.equal(d.getDate(),30);
 assert.equal(d.getHours(),14);assert.equal(d.getMinutes(),5);assert.equal(d.getSeconds(),7);assert.equal(d.getMilliseconds(),123);
 // alt yarim bayt (haftanin gunu) ms'yi etkilemez
 assert.equal(parseBcdTime(Buffer.from([0x26,0x09,0x30,0x14,0x05,0x07,0x12,0x35]))!.getMilliseconds(),123);
 assert.equal(parseBcdTime(bcdTime(26,1,2,3,4,5,999))!.getMilliseconds(),999);
 assert.equal(parseBcdTime(bcdTime(26,1,2,3,4,5,0))!.getMilliseconds(),0);
});
test('parseBcdTime: YY>=90 -> 19YY, YY<90 -> 20YY',()=>{
 assert.equal(parseBcdTime(bcdTime(90,1,1,0,0,0))!.getFullYear(),1990);
 assert.equal(parseBcdTime(bcdTime(99,12,31,23,59,59))!.getFullYear(),1999);
 assert.equal(parseBcdTime(bcdTime(89,6,1,0,0,0))!.getFullYear(),2089);
 assert.equal(parseBcdTime(bcdTime(0,1,1,0,0,0))!.getFullYear(),2000);
});
test('parseBcdTime: gecersiz ay veya kisa tampon null',()=>{
 assert.equal(parseBcdTime(bcdTime(26,0,1,0,0,0)),null);
 assert.equal(parseBcdTime(bcdTime(26,13,1,0,0,0)),null);
 assert.equal(parseBcdTime(Buffer.alloc(7)),null);
 assert.equal(parseBcdTime(Buffer.alloc(0)),null);
 // tumu sifir: ay 0 -> null
 assert.equal(parseBcdTime(Buffer.alloc(8,0x00)),null);
});

test('parseDiagBuffer: kimlik metni, sinif, etiket, bilgi hex ve zaman damgasi',()=>{
 const info=Buffer.from([0x01,0x02,0x0a,0xbc,0xde,0xff,0x00,0x10,0x20,0x30]);
 const out=parseDiagBuffer(wrap(0x00a0,[diagRec(0x4302,info)]))!;
 assert.equal(out.length,1);
 const e=out[0];
 assert.equal(e.eventId,0x4302);
 assert.equal(e.idText,'16#4302');
 assert.equal(e.eventClass,4);
 assert.equal(e.classLabel,'Çalışma modu geçişi');
 assert.equal(e.classLabel,eventClassLabels[4]);
 assert.equal(e.incoming,null);
 assert.equal(e.info,'01020ABCDEFF00102030');
 assert.equal(e.at,new Date(2026,8,30,14,5,7,123).toISOString());
});
test('parseDiagBuffer: kimlik metni buyuk harf ve 4 haneye sifir dolgulu',()=>{
 const out=parseDiagBuffer(wrap(0x00a0,[diagRec(0x0abc),diagRec(0xbeef),diagRec(0x000f)]))!;
 assert.deepEqual(out.map(e=>e.idText),['16#0ABC','16#BEEF','16#000F']);
 assert.deepEqual(out.map(e=>e.eventClass),[0,11,0]);
 assert.equal(out[0].classLabel,'Diğer');
 assert.equal(out[1].classLabel,eventClassLabels[11]);
});
test('parseDiagBuffer: gelen/giden bit yalniz 3,5,7,8 siniflarinda anlamli, digerlerinde null',()=>{
 for(const cls of [3,5,7,8]){
  const [inc,out]=parseDiagBuffer(wrap(0x00a0,[diagRec((cls<<12)|0x0100|0x21),diagRec((cls<<12)|0x21)]))!;
  assert.equal(inc.incoming,true,'gelen sinif '+cls);
  assert.equal(out.incoming,false,'giden sinif '+cls);
 }
 for(const cls of [0,1,2,4,6,9,10,12,15]){
  const [a,b]=parseDiagBuffer(wrap(0x00a0,[diagRec((cls<<12)|0x0100),diagRec(cls<<12)]))!;
  assert.equal(a.incoming,null,'sinif '+cls);
  assert.equal(b.incoming,null,'sinif '+cls);
 }
});
test('parseDiagBuffer: gecersiz zaman damgasi at=null; 20 bayttan kisa kayit atlanir',()=>{
 const badTs=Buffer.alloc(8,0x00);
 const out=parseDiagBuffer(wrap(0x00a0,[diagRec(0x4301,undefined,badTs),Buffer.alloc(19),diagRec(0x4302)]))!;
 assert.equal(out.length,2);
 assert.equal(out[0].at,null);
 assert.equal(out[1].idText,'16#4302');
 assert.ok(out[1].at&&!Number.isNaN(Date.parse(out[1].at)));
});
test('parseDiagBuffer: limit ciktiyi sinirlar (varsayilan 50)',()=>{
 const recs=Array.from({length:70},(_,i)=>diagRec(0x4000+i));
 const s=wrap(0x00a0,recs);
 assert.equal(parseDiagBuffer(s,3)!.length,3);
 assert.deepEqual(parseDiagBuffer(s,3)!.map(e=>e.eventId),[0x4000,0x4001,0x4002]);
 assert.equal(parseDiagBuffer(s)!.length,50);
 assert.equal(parseDiagBuffer(s,500)!.length,70);
 assert.deepEqual(parseDiagBuffer(s,0),[]);
});
test('parseDiagBuffer: null girdi null, bos kayit listesi bos dizi',()=>{
 assert.equal(parseDiagBuffer(null),null);
 assert.deepEqual(parseDiagBuffer(wrap(0x00a0,[])),[]);
});
test('parseDiagBuffer: SZL tamponundan uctan uca (0x01A0)',()=>{
 const s=parseSzl(szl(0x01a0,20,[diagRec(0x3942),diagRec(0x4302)]));
 const out=parseDiagBuffer(s)!;
 assert.deepEqual(out.map(e=>e.idText),['16#3942','16#4302']);
 assert.equal(out[0].eventClass,3);
 assert.equal(out[0].incoming,true);
 assert.equal(out[0].classLabel,eventClassLabels[3]);
});
