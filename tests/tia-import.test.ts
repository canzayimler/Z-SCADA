import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {workbook,type Cell} from '../apps/server/src/xlsx';
import {readZip,xlsxSheets,tiaToS7,tiaRows,convertTia,readTiaFile} from '../apps/web/src/tiaImport';
/* TIA Portal "PLC Tags" .xlsx ice aktarma: zip okuyucu, xlsx ayristirici, TIA -> S7 adres cevirisi.
 * Gercek xlsx, projenin kendi yazicisindan (apps/server/src/xlsx.ts) uretilir; deflate/stored zip elle kurulur. */

const toAB=(b:Buffer):ArrayBuffer=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
const HEADER:Cell[]=['Name','Path','Data Type','Logical Address','Comment','Hmi Visible'];
const dec=(u:Uint8Array)=>new TextDecoder().decode(u);

/* Elle zip: yerel + merkez baslik. extra: yerel baslikta bos extra alani, comment: merkez dizin yorumu. */
function makeZip(entries:{name:string;data:Buffer;method:0|8;extra?:number;comment?:string}[],eocdComment=''):ArrayBuffer{
 const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
 for(const e of entries){
  const nameBuf=Buffer.from(e.name,'utf8'),comp=e.method===8?deflateRawSync(e.data):e.data,extra=Buffer.alloc(e.extra??0,0x41);
  const commentBuf=Buffer.from(e.comment??'','utf8');
  const l=Buffer.alloc(30);
  l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(e.method,8);
  l.writeUInt32LE(comp.length,18);l.writeUInt32LE(e.data.length,22);l.writeUInt16LE(nameBuf.length,26);l.writeUInt16LE(extra.length,28);
  const c=Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(e.method,10);
  c.writeUInt32LE(comp.length,20);c.writeUInt32LE(e.data.length,24);c.writeUInt16LE(nameBuf.length,28);
  c.writeUInt16LE(0,30);c.writeUInt16LE(commentBuf.length,32);c.writeUInt32LE(offset,42);
  locals.push(l,nameBuf,extra,comp);centrals.push(c,nameBuf,commentBuf);
  offset+=30+nameBuf.length+extra.length+comp.length;
 }
 const cd=Buffer.concat(centrals),end=Buffer.alloc(22),ec=Buffer.from(eocdComment,'utf8');
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(ec.length,20);
 return toAB(Buffer.concat([...locals,cd,end,ec]));
}

/* --- 1. Gercek xlsx gidis-donus ------------------------------------------- */
const TAG_ROWS:Cell[][]=[
 HEADER,
 ['Start','Default tag table','Bool','%M0.0','Baslat','True'],
 ['Hiz','Default tag table','Int','%MW10','',''],
 ['Durum','Default tag table','Word','%MW12','',''],
 ['Sayac','Default tag table','DInt','%MD20','',''],
 ['Maske','Default tag table','DWord','%MD24','',''],
 ['Sicaklik','Default tag table','Real','%MD28','Fırın sıcaklığı (°C) & <ölçüm> "şğüöçİı"','True'],
 ['Giris','Default tag table','Bool','%I0.1','',''],
 ['Cikis','Default tag table','Bool','%Q0.0','',''],
 ['GirisDE','Default tag table','Bool','%E1.2','',''],
 ['CikisDE','Default tag table','Bool','%A1.3','',''],
 ['Metin','Default tag table','String','%MB100','',''],
 ['BadSize','Default tag table','Real','%MW30','',''],
 ['NoAddr','Default tag table','Int','','',''],
];

test('readTiaFile: gercek xlsx (PLC Tags) — tum satirlar dogru cevrilir',async()=>{
 const buf=workbook([{name:'PLC Tags',rows:TAG_ROWS}]);
 const {sheet,results}=await readTiaFile(toAB(buf));
 assert.equal(sheet,'PLC Tags');
 assert.equal(results.length,TAG_ROWS.length-1);
 const by=Object.fromEntries(results.map(r=>[r.row.name,r]));
 const ok=(n:string,addr:string,type:string)=>{assert.equal(by[n].reason,undefined,n);assert.equal(by[n].s7Address,addr,n);assert.equal(by[n].tagType,type,n);};
 ok('Start','M0.0','bool');
 ok('Hiz','MI10','int16');
 ok('Durum','MW12','uint16');
 ok('Sayac','MDI20','int32');
 ok('Maske','MD24','uint32');
 ok('Sicaklik','MR28','float32');
 ok('Giris','I0.1','bool');
 ok('Cikis','Q0.0','bool');
 ok('GirisDE','I1.2','bool');
 ok('CikisDE','Q1.3','bool');
 // Aciklama ve alanlar korunur (Turkce karakter, XML ozel karakterleri)
 assert.equal(by.Sicaklik.row.comment,'Fırın sıcaklığı (°C) & <ölçüm> "şğüöçİı"');
 assert.equal(by.Start.row.comment,'Baslat');
 assert.equal(by.Sicaklik.row.dataType,'Real');
 assert.equal(by.Sicaklik.row.address,'%MD28');
 // Reddedilenler neden dondurur, s7Address/tagType yok
 assert.match(by.Metin.reason!,/Veri tipi desteklenmiyor: String/);
 assert.equal(by.Metin.s7Address,undefined);
 assert.equal(by.Metin.tagType,undefined);
 assert.match(by.BadSize.reason!,/Real/);
 assert.match(by.BadSize.reason!,/%MD/);
 assert.match(by.BadSize.reason!,/%MW30/);
 assert.equal(by.BadSize.s7Address,undefined);
 assert.match(by.NoAddr.reason!,/^Mantıksal adres yok/);
});

test('readTiaFile: "PLC Tags" sayfasi, once gelen baska tablo sayfasina tercih edilir; basliksiz sayfa atlanir',async()=>{
 const other:Cell[][]=[HEADER,['Diger','x','Bool','%M9.9','','']];
 const buf=workbook([
  {name:'Notlar',rows:[['Merhaba'],['Dunya']]},
  {name:'Baska',rows:other},
  {name:'PLC Tags',rows:[HEADER,['Start','p','Bool','%M0.0','','']]},
 ]);
 const r=await readTiaFile(toAB(buf));
 assert.equal(r.sheet,'PLC Tags');
 assert.deepEqual(r.results.map(x=>x.row.name),['Start']);
 // PLC Tags yoksa ilk uygun sayfa
 const buf2=workbook([{name:'Notlar',rows:[['Merhaba']]},{name:'Etiketler',rows:other}]);
 const r2=await readTiaFile(toAB(buf2));
 assert.equal(r2.sheet,'Etiketler');
 assert.equal(r2.results[0].reason!==undefined,true); // %M9.9: bit 9 gecersiz
});

test('xlsxSheets: yazici bos hucreleri atlar, sutun kaymaz; sayilar ve bos hucreler',async()=>{
 const buf=workbook([{name:'S',rows:[['A',null,'C'],[1.5,2,null],[]]}]);
 const sh=xlsxSheets(await readZip(toAB(buf)));
 assert.equal(sh.length,1);
 assert.equal(sh[0].name,'S');
 assert.deepEqual(sh[0].rows[0],['A','','C']);
 assert.deepEqual(sh[0].rows[1],['1.5','2']);
});

/* --- readZip: elle kurulmus zip, deflate + stored -------------------------- */
test('readZip: deflate (8) ve stored (0) girdileri, extra/yorum alanlari, xml disi girdiler atlanir',async()=>{
 const big=Buffer.from('<a>'+'Ş ıİ ğ '.repeat(5000)+'</a>','utf8');
 const z=makeZip([
  {name:'xl/deflated.xml',data:big,method:8,extra:7,comment:'yorum'},
  {name:'xl/stored.xml',data:Buffer.from('<x>düz metin</x>','utf8'),method:0,extra:3},
  {name:'xl/_rels/workbook.xml.rels',data:Buffer.from('<Relationships/>'),method:8},
  {name:'xl/media/image1.png',data:Buffer.from([1,2,3,4,5]),method:0},
  {name:'docProps/app.txt',data:Buffer.from('metin'),method:8},
 ],'zip yorumu');
 const files=await readZip(z);
 assert.deepEqual([...files.keys()].sort(),['xl/_rels/workbook.xml.rels','xl/deflated.xml','xl/stored.xml']);
 assert.equal(dec(files.get('xl/deflated.xml')!),big.toString('utf8'));
 assert.equal(dec(files.get('xl/stored.xml')!),'<x>düz metin</x>');
 assert.equal(dec(files.get('xl/_rels/workbook.xml.rels')!),'<Relationships/>');
});

test('readZip + xlsxSheets: elle kurulmus xlsx — sharedStrings, sayi hucreleri, XML varliklari, r:id sirasi',async()=>{
 const wb='<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Ilk &amp; Son" sheetId="1" r:id="rId2"/></sheets></workbook>';
 const rels='<Relationships><Relationship Target="/xl/worksheets/s1.xml" Type="t" Id="rId2"/></Relationships>';
 const ss='<sst><si><t>Name</t></si><si><t>Data Type</t></si><si><t>Logical Address</t></si><si><r><t>Ka</t></r><r><t xml:space="preserve">zan &amp; Ç</t></r></si><si><t>Int</t></si></sst>';
 const sheet='<worksheet><sheetData>'
  +'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
  +'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="inlineStr"><is><t>%MW10</t></is></c></row>'
  +'<row r="3"><c r="A3" t="inlineStr"><is><t>Sayi</t></is></c><c r="C3"><v>42</v></c><c r="D3" s="1"/></row>'
  +'</sheetData></worksheet>';
 const z=makeZip([
  {name:'xl/workbook.xml',data:Buffer.from(wb),method:8},
  {name:'xl/_rels/workbook.xml.rels',data:Buffer.from(rels),method:0},
  {name:'xl/sharedStrings.xml',data:Buffer.from(ss),method:8},
  {name:'xl/worksheets/s1.xml',data:Buffer.from(sheet),method:8},
 ]);
 const sh=xlsxSheets(await readZip(z));
 assert.equal(sh.length,1);
 assert.equal(sh[0].name,'Ilk & Son');
 assert.deepEqual(sh[0].rows[0],['Name','Data Type','Logical Address']);
 assert.deepEqual(sh[0].rows[1],['Kazan & Ç','Int','%MW10']);
 assert.deepEqual(sh[0].rows[2],['Sayi','','42','']);
 // tiaRows: sadece "Name" ve "Logical Address" yeterli, Data Type okunur
 const r=await readTiaFile(z);
 assert.equal(r.sheet,'Ilk & Son');
 assert.equal(r.results[0].s7Address,'MI10');
 assert.equal(r.results[0].row.name,'Kazan & Ç');
 // 3. satir: Data Type bos -> once tip denetlenir
 assert.match(r.results[1].reason!,/Veri tipi yok/);
});

/* --- 2. tiaToS7 -------------------------------------------------------------- */
test('tiaToS7: Almanca E/A takma adlari I/Q olur',()=>{
 assert.deepEqual(tiaToS7('Bool','%E0.1'),{s7Address:'I0.1',tagType:'bool'});
 assert.deepEqual(tiaToS7('Bool','%A4.7'),{s7Address:'Q4.7',tagType:'bool'});
 assert.deepEqual(tiaToS7('Int','%EW2'),{s7Address:'II2',tagType:'int16'});
 assert.deepEqual(tiaToS7('Word','%AW4'),{s7Address:'QW4',tagType:'uint16'});
 assert.deepEqual(tiaToS7('Real','%ED8'),{s7Address:'IR8',tagType:'float32'});
 assert.deepEqual(tiaToS7('DWord','%AD8'),{s7Address:'QD8',tagType:'uint32'});
});

test('tiaToS7: bit numarasi olmayan Bool ve yanlis boyut neden dondurur',()=>{
 const r=tiaToS7('Bool','%M5') as {reason:string};
 assert.match(r.reason,/[Bb]it/);
 assert.match((tiaToS7('Bool','%MW5') as {reason:string}).reason,/bit/);
 assert.match((tiaToS7('Int','%MD4') as {reason:string}).reason,/%MW/);
 assert.match((tiaToS7('Word','%M0.0') as {reason:string}).reason,/%MW/);
 // bit numarasi yalniz Bool'da
 assert.match((tiaToS7('Int','%MW10.0') as {reason:string}).reason,/[Bb]it numarası/);
 // bit 8 gecersiz (parseS7Address hatasi reason'a doner, firlatmaz)
 assert.match((tiaToS7('Bool','%M0.8') as {reason:string}).reason,/0-7/);
 // ofset siniri
 assert.match((tiaToS7('Int','%MW70000') as {reason:string}).reason,/65535/);
});

test('tiaToS7: kucuk harf, tirnakli ve bosluklu girdi kabul edilir',()=>{
 assert.deepEqual(tiaToS7('int','%mw10'),{s7Address:'MI10',tagType:'int16'});
 assert.deepEqual(tiaToS7('"Int"','%MW10'),{s7Address:'MI10',tagType:'int16'});
 assert.deepEqual(tiaToS7('  "REAL" ','  % MD 28 '.replace('% ','%')),{s7Address:'MR28',tagType:'float32'});
 assert.deepEqual(tiaToS7('bool','%m0.0'),{s7Address:'M0.0',tagType:'bool'});
 assert.deepEqual(tiaToS7('UDInt','%MD4'),{s7Address:'MD4',tagType:'uint32'});
 assert.deepEqual(tiaToS7('UInt','%MW4'),{s7Address:'MW4',tagType:'uint16'});
 assert.deepEqual(tiaToS7('Time','%MD4'),{s7Address:'MDI4',tagType:'int32'});
 // adressiz: % olmadan da cozulur
 assert.deepEqual(tiaToS7('Int','MW10'),{s7Address:'MI10',tagType:'int16'});
});

test('tiaToS7: Byte %MB5 -> MB5, tip parseS7Address\'in dondurdugu',()=>{
 assert.deepEqual(tiaToS7('Byte','%MB5'),{s7Address:'MB5',tagType:'uint16'});
 assert.deepEqual(tiaToS7('USInt','%IB0'),{s7Address:'IB0',tagType:'uint16'});
 assert.deepEqual(tiaToS7('Byte','%QB3'),{s7Address:'QB3',tagType:'uint16'});
 assert.match((tiaToS7('Byte','%MW5') as {reason:string}).reason,/%MB/);
});

test('tiaToS7: desteklenmeyen alan/adres/tip neden dondurur',()=>{
 for(const a of ['%DB1.DBX0.0','%T1','%C3','%PIW256','DB1.DBW2','%M','%MW','%MX0.0','']){
  const r=tiaToS7('Bool',a) as {reason?:string;s7Address?:string};
  assert.equal(r.s7Address,undefined,a);
  assert.equal(typeof r.reason,'string',a);
 }
 assert.match((tiaToS7('Bool','%DB1.DBX0.0') as {reason:string}).reason,/Adres biçimi desteklenmiyor: %DB1\.DBX0\.0/);
 assert.match((tiaToS7('Bool','%T1') as {reason:string}).reason,/yalnız %I\/%Q\/%M/);
 assert.match((tiaToS7('Bool','') as {reason:string}).reason,/^Mantıksal adres yok/);
 assert.match((tiaToS7('Bool','   ') as {reason:string}).reason,/^Mantıksal adres yok/);
 assert.match((tiaToS7('String','%MB100') as {reason:string}).reason,/Veri tipi desteklenmiyor: String/);
 assert.match((tiaToS7('Array[0..3] of Int','%MW0') as {reason:string}).reason,/Veri tipi desteklenmiyor/);
 assert.match((tiaToS7('','%MW0') as {reason:string}).reason,/Veri tipi yok/);
 assert.match((tiaToS7('LReal','%MD0') as {reason:string}).reason,/Veri tipi desteklenmiyor: LReal/);
});

/* --- 3. tiaRows ------------------------------------------------------------- */
test('tiaRows: ustte baslik satiri olsa da baslik bulunur; bos Name satirlari atlanir; alanlar kirpilir',()=>{
 const rows=[
  ['PLC Tags export'],
  [],
  ['Name','Path','Data Type','Logical Address','Comment'],
  ['  Start ','p',' Bool ',' %M0.0 ',' not '],
  ['','p','Int','%MW0','adsiz'],
  ['   ','p','Int','%MW2',''],
  ['Hiz','p','Int','%MW10'],
 ];
 const r=tiaRows(rows)!;
 assert.deepEqual(r,[
  {name:'Start',dataType:'Bool',address:'%M0.0',comment:'not'},
  {name:'Hiz',dataType:'Int',address:'%MW10',comment:''},
 ]);
});

test('tiaRows: Comment sutunu yok, sutun sirasi farkli, baslik buyuk/kucuk harf duyarsiz',()=>{
 const r=tiaRows([['LOGICAL ADDRESS','data type','NAME'],['%MW1','Int','A']])!;
 assert.deepEqual(r,[{name:'A',dataType:'Int',address:'%MW1',comment:''}]);
 // veri satiri yok -> bos dizi (null degil)
 assert.deepEqual(tiaRows([['Name','Data Type','Logical Address']]),[]);
});

test('tiaRows: baslik yoksa null (Name ya da Logical Address eksik / bos girdi)',()=>{
 assert.equal(tiaRows([]),null);
 assert.equal(tiaRows([['Name','Data Type'],['a','Int']]),null);
 assert.equal(tiaRows([['Data Type','Logical Address'],['Int','%MW1']]),null);
 assert.equal(tiaRows([['foo','bar']]),null);
});

test('convertTia: satir basina bir sonuc, sira korunur',()=>{
 const res=convertTia([
  {name:'a',dataType:'Bool',address:'%M0.0',comment:''},
  {name:'b',dataType:'String',address:'%MB1',comment:''},
 ]);
 assert.equal(res.length,2);
 assert.equal(res[0].s7Address,'M0.0');
 assert.equal(res[0].reason,undefined);
 assert.equal(res[1].s7Address,undefined);
 assert.equal(typeof res[1].reason,'string');
 assert.equal(res[1].row.name,'b');
 assert.deepEqual(convertTia([]),[]);
});

/* --- 4. Hata yollari -------------------------------------------------------- */
test('readTiaFile: hicbir sayfada baslik yoksa Turkce hata firlatir',async()=>{
 const buf=workbook([{name:'Sayfa1',rows:[['Ad','Tip'],['x','y']]}]);
 await assert.rejects(readTiaFile(toAB(buf)),(e:Error)=>{
  assert.match(e.message,/TIA PLC etiket tablosu bulunamadı/);
  assert.match(e.message,/Name \/ Data Type \/ Logical Address/);
  return true;
 });
 // sayfasiz, bos xlsx iskeleti de ayni hata
 const z=makeZip([{name:'xl/workbook.xml',data:Buffer.from('<workbook><sheets/></workbook>'),method:8}]);
 await assert.rejects(readTiaFile(z),/bulunamadı/);
});

test('readZip: zip olmayan girdi Turkce hatayla reddedilir',async()=>{
 await assert.rejects(readZip(toAB(Buffer.from('bu bir zip degil, duz metin '.repeat(20)))),/Excel \(\.xlsx\) dosyası değil/);
 await assert.rejects(readZip(new ArrayBuffer(0)),/Excel \(\.xlsx\) dosyası değil/);
 await assert.rejects(readZip(new ArrayBuffer(10)),/Excel \(\.xlsx\) dosyası değil/);
 await assert.rejects(readTiaFile(toAB(Buffer.from('PK ama zip degil'))),/Excel \(\.xlsx\) dosyası değil/);
});
