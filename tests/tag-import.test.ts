import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectDelimiter,parseTable,parseDeltaAddress,parseModbusCell,importTags,headerFields,toDeltaName,nextDeltaSlot} from '../apps/web/src/tagImport';
import type {Config,Tag} from '../packages/contracts/model';

const cfg=(tags:Partial<Tag>[]=[]):Pick<Config,'connections'|'devices'|'tags'>=>({
 connections:[{id:'c1',name:'DVP',host:'10.0.0.1',port:502,timeout:1000} as any,{id:'c2',name:'S7',host:'10.0.0.2',port:102,timeout:1000,protocol:'s7'} as any],
 devices:[{id:'d1',connectionId:'c1',code:'DVP',name:'DVP',slaveId:1,enabled:true,pollMs:1000,staleMs:4000,description:'',addressFormat:'delta'},{id:'d3',connectionId:'c1',code:'ENA',name:'Analizör',slaveId:12,enabled:true,pollMs:1000,staleMs:4000,description:''},{id:'d2',connectionId:'c2',code:'PLC-02',name:'S7',slaveId:2,enabled:true,pollMs:1000,staleMs:4000,description:''}],
 tags:tags.map((t,i)=>({id:'t'+i,deviceId:'d1',code:'X'+i,name:'',area:'coil',address:0,dataType:'bool',access:'read',scale:1,offset:0,min:0,max:1,unit:'',description:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,...t}) as Tag),
});
let n=0;const id=()=>'n'+(++n);
const defaults={deviceId:'d1',group:'',access:'read' as const};

test('ayraç: Excel sekme, TR CSV noktalı virgül, aksi virgül', () => {
 assert.equal(detectDelimiter('M0\tStart\nM1\tStop'),'\t');
 assert.equal(detectDelimiter('kod;ad;adres\nM0;Start;M0'),';');
 assert.equal(detectDelimiter('code,name\nM0,Start'),',');
});

test('parseTable: tırnaklı hücre içinde ayraç, "" ve satır sonu', () => {
 assert.deepEqual(parseTable('a,"b,c","d ""e""",f\r\n"x\ny",z',','),[['a','b,c','d "e"','f'],['x\ny','z']]);
 assert.deepEqual(parseTable('﻿a\tb\n',"\t"),[['a','b']]);
});

test('Delta DVP adresleri: X/Y sekizlik, M ve D iki blok, T/C belirsiz', () => {
 assert.deepEqual(parseDeltaAddress('M0'),{area:'coil',address:2048,dataType:'bool'});
 assert.deepEqual(parseDeltaAddress('m1535'),{area:'coil',address:3583,dataType:'bool'});
 assert.deepEqual(parseDeltaAddress('M1536'),{area:'coil',address:45056,dataType:'bool'});
 assert.deepEqual(parseDeltaAddress('Y0'),{area:'coil',address:1280,dataType:'bool'});
 assert.deepEqual(parseDeltaAddress('Y10'),{area:'coil',address:1288,dataType:'bool'});
 assert.equal(parseDeltaAddress('Y8'),null);
 assert.deepEqual(parseDeltaAddress('X7'),{area:'discrete-input',address:1031,dataType:'bool'});
 assert.deepEqual(parseDeltaAddress('D100'),{area:'holding-register',address:4196,dataType:'int16'});
 assert.deepEqual(parseDeltaAddress('D4096'),{area:'holding-register',address:36864,dataType:'int16'});
 assert.equal(parseDeltaAddress('T5'),null);
 assert.equal(parseDeltaAddress('C5'),null);
});

test('Modbus adres hücresi: kılavuz referansı, kısa biçim ve bit, alan ipucuyla düz sayı', () => {
 assert.deepEqual(parseModbusCell('40001'),{area:'holding-register',address:0,bit:null});
 assert.deepEqual(parseModbusCell('HR 100.3'),{area:'holding-register',address:100,bit:3});
 assert.deepEqual(parseModbusCell('c2048'),{area:'coil',address:2048,bit:null});
 assert.equal(parseModbusCell('100'),null);
 assert.deepEqual(parseModbusCell('100','input-register'),{area:'input-register',address:100,bit:null});
 // Alan sütunu varken 5 haneli sayı ham adres sayılır, kılavuz referansı değil.
 assert.deepEqual(parseModbusCell('12000','holding-register'),{area:'holding-register',address:12000,bit:null});
});

test('başlık satırı: Türkçe veya İngilizce en az iki sütun adı', () => {
 assert.deepEqual(headerFields(['Kod','Ad','Adres','Bölüm']),['code','name','address','group']);
 assert.equal(headerFields(['M0','Start']),null);
});

test('Excel yapıştırma (başlıksız): Delta adresi kod olur, cihaz/bölüm/erişim varsayılandan', () => {
 const r=importTags('M0\tStart butonu\nY0\tKonveyör motoru\t\trw\nD100\tSıcaklık\t\t\t°C',cfg(),{deviceId:'d1',group:'Pano 1',access:'read'},id);
 assert.equal(r.header,false);
 assert.deepEqual(r.rows.map(x=>x.errors),[[],[],[]]);
 const [m0,y0,d100]=r.rows.map(x=>x.tag!);
 assert.equal(m0.code,'M0');assert.equal(m0.name,'Start butonu');assert.equal(m0.address,2048);assert.equal(m0.group,'Pano 1');assert.equal(m0.access,'read');
 assert.equal(y0.access,'readwrite');assert.equal(y0.address,1280);
 assert.equal(d100.dataType,'int16');assert.equal(d100.unit,'°C');assert.equal(d100.area,'holding-register');
});

test('hatalı satır diğerlerini durdurmaz; satır numarasıyla döner', () => {
 const r=importTags('kod;ad;adres;tip\nM0;A;M0;bool\nM1;B;Q9;bool\nM2;C;M2;metin\nM3;D;M3;',cfg(),defaults,id);
 assert.equal(r.header,true);
 assert.deepEqual(r.rows.map(x=>[x.line,!!x.tag]),[[2,true],[3,false],[4,false],[5,true]]);
 assert.match(r.rows[1].errors[0],/Adres tanınmadı: Q9/);
 assert.match(r.rows[2].errors[0],/Veri tipi tanınmadı/);
});

test('çakışma: mevcut kod ve adres, aynı yapıştırmada tekrar; farklı bitler çakışmaz', () => {
 const r=importTags('M0\tA\nM5\tB\nM5\tC\nHR 10.1\tBit1\nHR 10.2\tBit2\nHR 10\tTam',cfg([{code:'M0',address:2048}]),defaults,id);
 assert.match(r.rows[0].errors.join(' '),/zaten var/);
 assert.equal(r.rows[1].tag?.code,'M5');
 assert.ok(r.rows[2].errors.some(e=>/zaten var|çakışıyor/.test(e)));
 assert.equal(r.rows[3].tag?.bit,1);assert.equal(r.rows[3].tag?.dataType,'uint16');
 assert.equal(r.rows[4].tag?.bit,2);
 assert.match(r.rows[5].errors.join(' '),/çakışıyor/);
});

test('giriş alanı ve S7 girişi: yazma istenirse salt okumaya iner, uyarı verir; S7 DB/M yazılabilir', () => {
 const r=importTags('X0\tAcil stop\trw\nY0\tÇıkış\trw',cfg(),defaults,id);
 // Başlıksız sıra: adres, ad, tip, erişim — burada "rw" tip sütununa düştü → hata
 assert.match(r.rows[0].errors[0],/Veri tipi tanınmadı/);
 const r2=importTags('adres\tad\terişim\nX0\tAcil stop\trw',cfg(),defaults,id);
 assert.equal(r2.rows[0].tag?.access,'read');assert.match(r2.rows[0].warnings[0],/yazılamaz/);
 const r3=importTags('cihaz\tadres\tad\terişim\nPLC-02\tDB1,REAL4\tSıcaklık\trw',cfg(),defaults,id);
 assert.deepEqual(r3.rows[0].errors,[]);
 assert.equal(r3.rows[0].tag?.s7Address,'DB1,REAL4');assert.equal(r3.rows[0].tag?.dataType,'float32');assert.equal(r3.rows[0].tag?.access,'readwrite');
 const r5=importTags('cihaz\tadres\tad\terişim\nPLC-02\tE0.1\tButon\trw',cfg(),defaults,id);
 assert.deepEqual(r5.rows[0].errors,[]);assert.equal(r5.rows[0].tag?.access,'read');assert.match(r5.rows[0].warnings.join(' '),/S7 giriş alanına \(I\/E\) yazılamaz/);
 const r4=importTags('cihaz\tadres\nYOK\tM0',cfg(),defaults,id);
 assert.match(r4.rows[0].errors[0],/Cihaz bulunamadı: YOK/);
});

test('Delta adları yalnız Delta biçimli cihazda: genel Modbus cihazında D100 tanınmaz', () => {
 const r=importTags('D100\tSıcaklık\nHR 100\tGüç\n40201\tAkım',cfg(),{deviceId:'d3',group:'',access:'read'},id);
 assert.match(r.rows[0].errors[0],/Adres tanınmadı: D100.*Delta DVP/);
 assert.equal(r.rows[1].tag?.address,100);assert.equal(r.rows[1].tag?.area,'holding-register');
 assert.equal(r.rows[2].tag?.address,200);
 assert.equal(parseModbusCell('D100',undefined,false),null);
});

test('toDeltaName: Delta adresinin tersi, gidiş-dönüş tutarlı', () => {
 for(const n of ['M0','M1535','M1536','M4095','Y0','Y7','Y10','Y377','X0','X17','S5','D0','D100','D4095','D4096','D11999'])
  {const a=parseDeltaAddress(n)!;assert.equal(toDeltaName(a.area,a.address),n);}
 assert.equal(toDeltaName('coil',1100),null);
 assert.equal(toDeltaName('input-register',0),null);
});

// --- nextDeltaSlot: yeni etiketin kodu ve adresi aynı Delta adından gelir ---------------

const dt = (code: string, area: Tag['area'], address: number, dataType: Tag['dataType'] = 'bool', deviceId = 'd1') =>
 ({id: code + deviceId, deviceId, code, area, address, dataType, bit: null}) as Tag;

test('nextDeltaSlot: boş cihazda M0 → C 2048 (S0 = C 0 değil)', () => {
 assert.deepEqual(nextDeltaSlot([], 'd1', null, new Set()), {code: 'M0', area: 'coil', address: 2048, dataType: 'bool'});
});

test('nextDeltaSlot: Y2 sonrası Y3, adres M aralığına kaymaz', () => {
 const tags = [dt('M0', 'coil', 2048), dt('M1', 'coil', 2049), dt('Y2', 'coil', 1282)];
 const r = nextDeltaSlot(tags, 'd1', tags[2], new Set(tags.map(t => t.code)));
 assert.deepEqual(r, {code: 'Y3', area: 'coil', address: 1283, dataType: 'bool'});
});

test('nextDeltaSlot: X/Y sekizlik — Y7 sonrası Y10 (C 1288)', () => {
 const y7 = dt('Y7', 'coil', 1287);
 assert.deepEqual(nextDeltaSlot([y7], 'd1', y7, new Set(['Y7'])), {code: 'Y10', area: 'coil', address: 1288, dataType: 'bool'});
});

test('nextDeltaSlot: alınmış kod ya da dolu adres atlanır', () => {
 const tags = [dt('M0', 'coil', 2048), dt('START', 'coil', 2049)];
 assert.equal(nextDeltaSlot(tags, 'd1', tags[0], new Set(tags.map(t => t.code)))?.code, 'M2');
 // Başka cihazdaki M1 bu cihazın adresini doldurmaz, yalnız kod çakışması sayılır.
 const other = [dt('M0', 'coil', 2048), dt('M1', 'coil', 2049, 'bool', 'd2')];
 assert.equal(nextDeltaSlot(other, 'd1', other[0], new Set(['M0']))?.code, 'M1');
});

test('nextDeltaSlot: 32 bit D sonrası iki register atlanır, tip korunur', () => {
 const d100 = dt('D100', 'holding-register', 4196, 'float32');
 assert.deepEqual(nextDeltaSlot([d100], 'd1', d100, new Set(['D100'])), {code: 'D102', area: 'holding-register', address: 4198, dataType: 'float32'});
});

test('nextDeltaSlot: M1535 sonrası M1536 ikinci bloğa (C 45056) geçer', () => {
 const m = dt('M1535', 'coil', 3583);
 assert.deepEqual(nextDeltaSlot([m], 'd1', m, new Set(['M1535'])), {code: 'M1536', area: 'coil', address: 45056, dataType: 'bool'});
});

test('nextDeltaSlot: önceki etiketin kodu Delta adı değilse ya da adresiyle uyuşmuyorsa null (eski davranış)', () => {
 assert.equal(nextDeltaSlot([], 'd1', dt('START', 'coil', 2048), new Set()), null);
 assert.equal(nextDeltaSlot([], 'd1', dt('M5', 'coil', 0), new Set()), null);
});

test('MQTT içe aktarma: konu + JSON/zaman yolu sütunları, joker reddi, oku/yaz salt okumaya iner', () => {
 const c = cfg();
 c.connections.push({ id: 'c3', name: 'Broker', host: '10.0.0.3', port: 1883, timeout: 1000, protocol: 'mqtt' } as any);
 c.devices.push({ id: 'd4', connectionId: 'c3', code: 'MQ', name: 'MQTT', slaveId: 1, enabled: true, pollMs: 1000, staleMs: 5000, description: '' });
 const r = importTags('device,code,dataType,access,mqttTopic,mqttJsonPath,mqttTimestampPath\nMQ,T1,float32,read,hat1/sensor,data.temp,ts\nMQ,T2,bool,readwrite,hat1/durum,,\nMQ,T3,float32,read,hat1/#,,\nMQ,T4,float32,read,hat1/a,a..b,\nMQ,T5,int16,read,,,', c, { deviceId: 'd4', group: '', access: 'read' }, id);
 const [t1, t2, t3, t4, t5] = r.rows;
 assert.deepEqual([t1.tag?.mqttTopic, t1.tag?.mqttJsonPath, t1.tag?.mqttTimestampPath, t1.tag?.access], ['hat1/sensor', 'data.temp', 'ts', 'read']);
 assert.equal(t2.tag?.access, 'read');
 assert.match(t2.warnings.join(' '), /yalnız okunur/);
 assert.match(t3.errors.join(' '), /joker/);
 assert.match(t4.errors.join(' '), /JSON yolu/);
 assert.match(t5.errors.join(' '), /MQTT konusu gerekli/);
});

test('SNMP / HTTP / SQL içe aktarma: adres sütunları, doğrulama, oku/yaz salt okumaya iner', () => {
 const c = cfg();
 c.connections.push({ id: 'c5', name: 'Switch', host: '10.0.0.5', port: 161, timeout: 1000, protocol: 'snmp' } as any,
  { id: 'c6', name: 'MES', host: 'localhost', port: 80, timeout: 1000, protocol: 'http', httpBaseUrl: 'http://10.0.0.6/api' } as any,
  { id: 'c7', name: 'DB', host: '10.0.0.7', port: 1433, timeout: 1000, protocol: 'sql', sqlDatabase: 'MES' } as any);
 c.devices.push({ id: 'd5', connectionId: 'c5', code: 'SW', name: 'SW', slaveId: 1, enabled: true, pollMs: 1000, staleMs: 5000, description: '' },
  { id: 'd6', connectionId: 'c6', code: 'API', name: 'API', slaveId: 1, enabled: true, pollMs: 1000, staleMs: 5000, description: '' },
  { id: 'd7', connectionId: 'c7', code: 'DB', name: 'DB', slaveId: 1, enabled: true, pollMs: 1000, staleMs: 5000, description: '' });
 const r = importTags([
  'device,code,dataType,access,snmpOid,httpPath,json yolu,httpTimestampPath,sqlQuery,sqlColumn',
  'SW,UP,uint32,readwrite,.1.3.6.1.2.1.1.3.0,,,,,',
  'SW,KOTU,uint32,read,sysUpTime.0,,,,,',
  'API,T1,float32,read,,/olcum?hat=1,data.temp,ts,,',
  'API,T2,float32,read,,//evil.com/x,,,,',
  'DB,,float32,rw,,,,,"SELECT TOP 1 Sicaklik, Basinc FROM dbo.Olcum",Sicaklik',
  'DB,X,float32,read,,,,,select 1; drop table x,a',
  'DB,Y,float32,read,,,,,select 1,',
 ].join('\n'), c, { deviceId: 'd5', group: '', access: 'read' }, id);
 const [up, kotu, t1, t2, q1, q2, q3] = r.rows;
 assert.deepEqual([up.tag?.snmpOid, up.tag?.access, up.errors], ['1.3.6.1.2.1.1.3.0', 'read', []]);
 assert.match(up.warnings.join(' '), /SNMP etiketi yalnız okunur/);
 assert.match(kotu.errors.join(' '), /SNMP OID/);
 assert.deepEqual([t1.tag?.httpPath, t1.tag?.httpJsonPath, t1.tag?.httpTimestampPath, t1.errors], ['/olcum?hat=1', 'data.temp', 'ts', []]);
 assert.match(t2.errors.join(' '), /göreli/);
 assert.deepEqual([q1.tag?.sqlQuery, q1.tag?.sqlColumn, q1.tag?.code, q1.tag?.access, q1.errors], ['SELECT TOP 1 Sicaklik, Basinc FROM dbo.Olcum', 'Sicaklik', 'Sicaklik', 'read', []]);
 assert.match(q2.errors.join(' '), /noktalı virgül/);
 assert.match(q3.errors.join(' '), /sütun adı gerekli/);
});

test('BACnet / EtherNet/IP içe aktarma: nesne + özellik, CIP adı, tip uyumu, BACnet salt okuma', () => {
 const c = cfg();
 c.connections.push({ id: 'c8', name: 'AHU', host: '10.0.0.8', port: 47808, timeout: 2000, protocol: 'bacnet', bacnetDeviceInstance: 1201 } as any,
  { id: 'c9', name: 'Logix', host: '10.0.0.9', port: 44818, timeout: 2000, protocol: 'enip', slot: 0 } as any);
 c.devices.push({ id: 'd8', connectionId: 'c8', code: 'AHU', name: 'AHU', slaveId: 1, enabled: true, pollMs: 1000, staleMs: 5000, description: '' },
  { id: 'd9', connectionId: 'c9', code: 'PLC', name: 'PLC', slaveId: 1, enabled: true, pollMs: 1000, staleMs: 5000, description: '' });
 const r = importTags([
  'device,code,dataType,access,nesne,özellik,cipTag',
  'AHU,SICAKLIK,float32,readwrite,AV12,,',
  'AHU,DURUM,,read,BI:3,,',
  'AHU,OOS,float32,read,analog-value 4,out-of-service,',
  'AHU,MOD,,read,MSV 2,,',
  'AHU,KOTU,,read,device 1,,',
  'AHU,OZ,,read,AV1,kotu-ozellik,',
  'PLC,SP,float32,readwrite,,,Program:Main.Setpoint',
  'PLC,BIT,int16,read,,,Durum.3',
  'PLC,U16,uint16,read,,,Sayac',
  'PLC,HATA,float32,read,,,1Kotu',
 ].join('\n'), c, { deviceId: 'd8', group: '', access: 'read' }, id);
 const [av, bi, oos, msv, dev, oz, sp, bit, u16, bad] = r.rows;
 assert.deepEqual([av.tag?.bacnetObjectType, av.tag?.bacnetInstance, av.tag?.bacnetProperty, av.tag?.dataType, av.tag?.access, av.errors], ['analog-value', 12, 'present-value', 'float32', 'read', []]);
 assert.match(av.warnings.join(' '), /BACnet\/IP etiketi yalnız okunur/);
 assert.deepEqual([bi.tag?.bacnetObjectType, bi.tag?.bacnetInstance, bi.tag?.dataType], ['binary-input', 3, 'bool']);
 assert.deepEqual([oos.tag?.bacnetProperty, oos.tag?.dataType], ['out-of-service', 'bool']);
 assert.match(oos.warnings.join(' '), /dijitaldir/);
 assert.deepEqual([msv.tag?.bacnetObjectType, msv.tag?.dataType], ['multi-state-value', 'uint16']);
 assert.match(dev.errors.join(' '), /desteklenmiyor/);
 assert.match(oz.errors.join(' '), /özelliği tanınmadı/);
 assert.deepEqual([sp.tag?.cipTag, sp.tag?.access, sp.tag?.dataType, sp.errors], ['Program:Main.Setpoint', 'readwrite', 'float32', []]);
 assert.deepEqual([bit.tag?.cipTag, bit.tag?.dataType], ['Durum.3', 'bool']);
 assert.match(bit.warnings.join(' '), /Bit erişimi/);
 assert.match(u16.errors.join(' '), /UINT\/UDINT/);
 assert.match(bad.errors.join(' '), /etiket adı anlaşılamadı/);
});
