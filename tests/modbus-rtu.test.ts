import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Config} from '../packages/contracts/model';
import {connectionSchema,deviceSchema,tagSchema,isModbus,isSerial,serialFormat,connectionAddress,busKeyOf,validateConfig} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {modbusClientNode,modbusDriver,driverFor} from '../packages/drivers/driver';
import {buildGateway} from '../apps/server/src/gateway';
/* Modbus RTU (seri RS-485, RTU-over-TCP, ASCII) destegi: sema yardimcilari, validateConfig kurallari,
 * modbus-client dugum uretimi, ortak hat kilidi ve yazma yolunun RTU icin de uretilmesi. */

const rtu=(o:Record<string,unknown>={})=>connectionSchema.parse({id:'r1',name:'RTU Hat',port:502,timeout:2000,protocol:'modbus-rtu',serialPort:'COM3',...o});
const tcpConn=(o:Record<string,unknown>={})=>connectionSchema.parse({id:'c1',name:'TCP PLC',host:'10.0.0.5',port:502,timeout:3000,...o});
const device=(id:string,connectionId:string,slaveId=1)=>deviceSchema.parse({id,connectionId,code:id.toUpperCase(),name:id,slaveId,enabled:true,pollMs:1000,staleMs:4000});
const tag=(id:string,deviceId:string,o:Record<string,unknown>={})=>tagSchema.parse({id,deviceId,code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType:'uint16',access:'read',min:-1e9,max:1e9,...o});
const ctx={token:'tok',revision:1};
const cfgWith=(conns:any[],devices:any[],tags:any[]):Config=>({...structuredClone(seedConfig),connections:conns,devices,tags,commands:[]} as Config);
const busOf=(func:string)=>func.match(/bus-([^']+)'/)?.[1];

// --- Sema ve yardimcilar -------------------------------------------------------
test('connectionSchema: modbus-rtu protokolu ve seri alanlari kabul edilir, gecersiz degerler reddedilir',()=>{
 const c=rtu({rtuTransport:'serial',baudRate:19200,parity:'even',dataBits:7,stopBits:2,serialMode:'ascii'});
 assert.equal(c.protocol,'modbus-rtu');
 assert.equal(c.serialPort,'COM3');
 assert.equal(c.parity,'even');
 assert.equal(c.dataBits,7);
 assert.equal(c.stopBits,2);
 assert.equal(c.serialMode,'ascii');
 assert.throws(()=>rtu({parity:'mark'}));
 assert.throws(()=>rtu({dataBits:9}));
 assert.throws(()=>rtu({stopBits:3}));
 assert.throws(()=>rtu({serialMode:'binary'}));
 assert.throws(()=>rtu({rtuTransport:'usb'}));
});
test('isModbus: modbus-tcp, tanimsiz protokol ve modbus-rtu dogru; diger protokoller yanlis',()=>{
 assert.equal(isModbus({protocol:'modbus-tcp'}),true);
 assert.equal(isModbus({}),true);
 assert.equal(isModbus({protocol:'modbus-rtu'}),true);
 for(const p of ['opc-ua','s7','ads'] as const)assert.equal(isModbus({protocol:p}),false,p);
});
test('isSerial: yalniz modbus-rtu ve tasima seri/tanimsiz ise dogru',()=>{
 assert.equal(isSerial({protocol:'modbus-rtu'}),true);
 assert.equal(isSerial({protocol:'modbus-rtu',rtuTransport:'serial'}),true);
 assert.equal(isSerial({protocol:'modbus-rtu',rtuTransport:'tcp'}),false);
 assert.equal(isSerial({protocol:'modbus-tcp'}),false);
 assert.equal(isSerial({}),false);
 assert.equal(isSerial(rtu()),true);
});
test('serialFormat: varsayilan 9600 8N1, Delta DVP 7E1 ve diger kombinasyonlar',()=>{
 assert.equal(serialFormat({}),'9600 8N1');
 assert.equal(serialFormat({baudRate:9600,dataBits:7,parity:'even',stopBits:1}),'9600 7E1');
 assert.equal(serialFormat({baudRate:19200,dataBits:8,parity:'odd',stopBits:2}),'19200 8O2');
});
test('connectionAddress: seri, ASCII, RTU-over-TCP, TCP ve OPC UA',()=>{
 assert.equal(connectionAddress(rtu()),'COM3 · 9600 8N1');
 assert.equal(connectionAddress(rtu({baudRate:9600,dataBits:7,parity:'even',stopBits:1,serialMode:'ascii'})),'COM3 · 9600 7E1 ASCII');
 assert.equal(connectionAddress(rtu({serialMode:'rtu'})),'COM3 · 9600 8N1','RTU modunda ASCII eki olmamali');
 assert.equal(connectionAddress(rtu({rtuTransport:'tcp',host:'10.0.0.9',port:4001})),'10.0.0.9:4001');
 assert.equal(connectionAddress(tcpConn()),'10.0.0.5:502');
 assert.equal(connectionAddress(connectionSchema.parse({id:'o1',name:'OPC',host:'h',port:4840,timeout:2000,protocol:'opc-ua',endpoint:'opc.tcp://srv:4840'})),'opc.tcp://srv:4840');
 assert.equal(connectionAddress(rtu({serialPort:undefined})),'? · 9600 8N1','port yoksa ? gosterilir');
});
test('busKeyOf: seri hat COM portudur (kucuk harf, kirpilmis); TCP ve RTU-over-TCP host:port',()=>{
 assert.equal(busKeyOf(rtu()),'serial:com3');
 assert.equal(busKeyOf(rtu({serialPort:'com3'})),'serial:com3');
 assert.equal(busKeyOf(rtu({serialPort:'COM4'})),'serial:com4');
 assert.equal(busKeyOf(rtu({rtuTransport:'tcp',host:'GW.Local',port:4001})),'gw.local:4001');
 assert.equal(busKeyOf(tcpConn({host:'10.0.0.5'})),'10.0.0.5:502');
 assert.equal(busKeyOf(rtu({host:'10.0.0.5'})),'serial:com3','seri portta host onemsiz');
});

// --- validateConfig ------------------------------------------------------------
const validBase=(connOver:Record<string,unknown>={},tags:any[]=[])=>cfgWith([rtu(connOver)],[device('d1','r1')],tags);
test('validateConfig: gecerli seri RTU baglantisi kabul edilir; host verilmese de olur (varsayilan localhost)',()=>{
 assert.doesNotThrow(()=>validateConfig(validBase()));
 assert.doesNotThrow(()=>validateConfig(validBase({rtuTransport:'serial',baudRate:19200,parity:'odd',stopBits:2})));
});
test('validateConfig: seri RTU seri port ister (bos/bosluk/tanimsiz reddedilir)',()=>{
 assert.throws(()=>validateConfig(validBase({serialPort:undefined})),/seri bağlantısı için port gerekli/);
 assert.throws(()=>validateConfig(validBase({serialPort:''})),/seri bağlantısı için port gerekli/);
 assert.throws(()=>validateConfig(validBase({serialPort:'   '})),/seri bağlantısı için port gerekli|Invalid|too_small|regex|pattern/i);
});
test('validateConfig: ASCII modu 7 veri biti ister (varsayilan 8 hata, 7 kabul)',()=>{
 assert.throws(()=>validateConfig(validBase({serialMode:'ascii'})),/ASCII 7 veri biti/);
 assert.throws(()=>validateConfig(validBase({serialMode:'ascii',dataBits:8})),/ASCII 7 veri biti/);
 assert.doesNotThrow(()=>validateConfig(validBase({serialMode:'ascii',dataBits:7,parity:'even'})));
 assert.doesNotThrow(()=>validateConfig(validBase({serialMode:'rtu',dataBits:8})),'RTU modunda 8 bit serbest');
});
test('validateConfig: RTU-over-TCP seri port istemez ama host/port ister',()=>{
 assert.doesNotThrow(()=>validateConfig(validBase({rtuTransport:'tcp',host:'10.0.0.9',port:4001,serialPort:undefined})));
 assert.throws(()=>validateConfig(validBase({rtuTransport:'tcp',host:'',serialPort:undefined})),'bos host semada reddedilir');
});
test('validateConfig: RTU etiketleri normal Modbus kurallarina tabidir',()=>{
 assert.doesNotThrow(()=>validateConfig(validBase({},[
  tag('t1','d1',{area:'coil',dataType:'bool',access:'readwrite',min:0,max:1}),
  tag('t2','d1',{area:'holding-register',dataType:'uint16',access:'readwrite',address:10}),
  tag('t3','d1',{area:'input-register',dataType:'float32',address:20})])));
 assert.throws(()=>validateConfig(validBase({},[tag('t1','d1',{area:'coil',dataType:'uint16'})])),/Adres alanı ile veri tipi uyumsuz/);
 assert.throws(()=>validateConfig(validBase({},[tag('t1','d1',{area:'holding-register',dataType:'bool',min:0,max:1})])),/Adres alanı ile veri tipi uyumsuz/);
 assert.throws(()=>validateConfig(validBase({},[tag('t1','d1',{area:'input-register',access:'readwrite'})])),/Giriş alanına yazılamaz/);
 // float32 iki register kaplar (5-6); ikinci etiket 6'da cakisir.
 assert.throws(()=>validateConfig(validBase({},[tag('t1','d1',{dataType:'float32',address:5}),tag('t2','d1',{address:6})])),/adres aralığı çakışıyor/);
 assert.doesNotThrow(()=>validateConfig(validBase({},[tag('t1','d1',{address:5}),tag('t2','d1',{area:'input-register',address:5})])));
});

// --- modbusClientNode ----------------------------------------------------------
test('modbusClientNode: seri RTU varsayilanlari (simpleser, RTU-BUFFERD, 9600 8N1)',()=>{
 const n:any=modbusClientNode(rtu());
 assert.equal(n.id,'scada-client-r1');
 assert.equal(n.type,'modbus-client');
 assert.equal(n.clienttype,'simpleser');
 assert.equal(n.serialType,'RTU-BUFFERD');
 assert.equal(n.serialPort,'COM3');
 assert.equal(n.serialBaudrate,9600);
 assert.equal(n.serialDatabits,8);
 assert.equal(n.serialStopbits,1);
 assert.equal(n.serialParity,'none');
});
test('modbusClientNode: seri ayarlari baglantidan gelir, ASCII modu serialType ASCII olur',()=>{
 const n:any=modbusClientNode(rtu({baudRate:19200,dataBits:7,stopBits:2,parity:'even',serialMode:'ascii'}));
 assert.equal(n.clienttype,'simpleser');
 assert.equal(n.serialType,'ASCII');
 assert.equal(n.serialBaudrate,19200);
 assert.equal(n.serialDatabits,7);
 assert.equal(n.serialStopbits,2);
 assert.equal(n.serialParity,'even');
 assert.equal((modbusClientNode(rtu({serialMode:'rtu'})) as any).serialType,'RTU-BUFFERD');
});
test('modbusClientNode: RTU over TCP tcp istemcisi ve TCP-RTU-BUFFERED kullanir',()=>{
 const n:any=modbusClientNode(rtu({rtuTransport:'tcp',host:'10.0.0.9',port:4001}));
 assert.equal(n.clienttype,'tcp');
 assert.equal(n.tcpType,'TCP-RTU-BUFFERED');
 assert.equal(n.tcpHost,'10.0.0.9');
 assert.equal(n.tcpPort,4001);
 assert.equal(n.serialType,undefined,'seri alanlari sizmamali');
});
test('modbusClientNode: duz modbus-tcp degismez (regresyon: clienttype tcp, tcpType DEFAULT)',()=>{
 const n:any=modbusClientNode(tcpConn({host:'10.0.0.5',port:1502}));
 assert.equal(n.id,'scada-client-c1');
 assert.equal(n.clienttype,'tcp');
 assert.equal(n.tcpType,'DEFAULT');
 assert.equal(n.tcpHost,'10.0.0.5');
 assert.equal(n.tcpPort,1502);
 assert.equal(n.serialPort,undefined);
 assert.equal((modbusClientNode(tcpConn({protocol:'modbus-tcp'})) as any).tcpType,'DEFAULT');
});

// --- Surucu secimi ve akis uretimi --------------------------------------------
test('modbusDriver RTU baglantisini destekler; driverFor modbusDriver dondurur',()=>{
 assert.equal(modbusDriver.supports(rtu()),true);
 assert.equal(modbusDriver.supports(rtu({rtuTransport:'tcp'})),true);
 assert.equal(driverFor(rtu()),modbusDriver);
 assert.equal(driverFor(rtu({rtuTransport:'tcp'})),modbusDriver);
 assert.equal(driverFor(tcpConn()),modbusDriver);
});
test('RTU icin tarama, okuma, donusum ve yazma dugumleri TCP ile ayni sekilde uretilir',()=>{
 const devs=[device('d1','r1')];
 const tags=[tag('t1','d1'),tag('t2','d1',{area:'coil',dataType:'bool',access:'readwrite',min:0,max:1})];
 const withWrite=(conn:any)=>[...modbusDriver.buildNodes([conn],devs,tags,ctx),...modbusDriver.buildWriteNodes!([conn],devs,tags,ctx).nodes];
 const nodes=withWrite(rtu());
 const ids=nodes.map(n=>n.id);
 for(const id of ['scada-client-r1','scada-poll-r1-clock','scada-poll-r1','scada-poll-r1-read','scada-poll-r1-convert','scada-write-r1'])assert.ok(ids.includes(id),id+' bulunamali');
 assert.equal(nodes.find(n=>n.id==='scada-poll-r1-read')!.type,'modbus-flex-getter');
 assert.equal(nodes.find(n=>n.id==='scada-poll-r1-read')!.server,'scada-client-r1');
 const w=nodes.find(n=>n.id==='scada-write-r1')!;
 assert.equal(w.type,'modbus-flex-write');
 assert.equal(w.server,'scada-client-r1');
 const tcpNodes=withWrite(tcpConn({id:'r1'}));
 assert.deepEqual(nodes.map(n=>n.id).sort(),tcpNodes.map(n=>n.id).sort());
});
test('ayni COM portunu farkli yazimla (COM3 / com3) paylasan iki RTU baglantisi ayni kilit anahtarini kullanir',()=>{
 const a=rtu({id:'r1',serialPort:'COM3'}),b=rtu({id:'r2',name:'RTU Hat 2',serialPort:'com3'});
 const nodes=modbusDriver.buildNodes([a,b],[device('d1','r1',1),device('d2','r2',2)],[tag('t1','d1'),tag('t2','d2')],ctx);
 const f1=nodes.find(n=>n.id==='scada-poll-r1')!.func as string;
 const f2=nodes.find(n=>n.id==='scada-poll-r2')!.func as string;
 assert.ok(f1.includes('bus-serial:com3'));
 assert.ok(f2.includes('bus-serial:com3'));
 assert.equal(busOf(f1),busOf(f2));
 const n3=modbusDriver.buildNodes([rtu({id:'r3',serialPort:'COM4'})],[device('d3','r3')],[tag('t3','d3')],ctx);
 assert.equal(busOf(n3.find(n=>n.id==='scada-poll-r3')!.func as string),'serial:com4');
});
test('seri RTU tarama fonksiyonu calisir ve mesaja seri hat kilidini yazar',()=>{
 const nodes=modbusDriver.buildNodes([rtu()],[device('d1','r1',7)],[tag('t1','d1')],ctx);
 const run=new Function('msg','flow','context',nodes.find(n=>n.id==='scada-poll-r1')!.func as string);
 const store=new Map<string,any>(),mem=new Map<string,any>();
 const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>store.set(k,v)};
 const context={get:(k:string)=>mem.get(k),set:(k:string,v:unknown)=>mem.set(k,v)};
 const out=run(undefined,flow,context);
 assert.ok(out&&out.block);
 assert.equal(out.bus,'serial:com3');
 assert.equal(out.payload.unitid,7);
 assert.equal(out.payload.fc,3);
 assert.equal(store.get('bus-serial:com3').kind,'read');
 assert.equal(run(undefined,flow,context),null,'kilit tutulurken ikinci tarama atlanmali');
});
test('yazma yolu: RTU baglantisi icin komut dugumu ve seri hat kilit anahtari uretilir',()=>{
 const nodes=modbusDriver.buildWriteNodes!([rtu({serialPort:'COM3'})],[device('d1','r1')],[tag('t2','d1',{area:'coil',dataType:'bool',access:'readwrite',min:0,max:1})],ctx).nodes;
 assert.ok(nodes.some(n=>n.id==='scada-write-r1'&&n.type==='modbus-flex-write'),'scada-write-r1 bulunamali');
 const withBus=nodes.filter(n=>typeof n.func==='string'&&n.func.includes('serial:com3')&&/write/.test(n.id));
 assert.ok(withBus.length>0,'yazma yolu seri hat kilit anahtarini kullanmali');
});

// --- buildGateway --------------------------------------------------------------
test('buildGateway: modbus-tcp ve seri modbus-rtu baglantilari dogru clienttype ile uretilir',()=>{
 const conns=[tcpConn({id:'c1'}),rtu({id:'r1',serialPort:'COM5',baudRate:19200,parity:'even'})];
 const c=cfgWith(conns,[device('d1','c1',1),device('d2','r1',2)],[tag('t1','d1'),tag('t2','d2')]);
 const nodes=buildGateway(c,'tok',3000,'.');
 const tcpNode=nodes.find(n=>n.id==='scada-client-c1');
 const rtuNode=nodes.find(n=>n.id==='scada-client-r1');
 assert.ok(tcpNode&&rtuNode,'iki modbus-client dugumu de uretilmeli');
 assert.equal(tcpNode.type,'modbus-client');
 assert.equal(rtuNode.type,'modbus-client');
 assert.equal(tcpNode.clienttype,'tcp');
 assert.equal(tcpNode.tcpType,'DEFAULT');
 assert.equal(rtuNode.clienttype,'simpleser');
 assert.equal(rtuNode.serialPort,'COM5');
 assert.equal(rtuNode.serialBaudrate,19200);
 assert.equal(rtuNode.serialParity,'even');
 assert.equal(nodes.filter(n=>n.type==='modbus-client').length,2);
 assert.ok(nodes.some(n=>n.id==='scada-poll-r1')&&nodes.some(n=>n.id==='scada-poll-c1'));
});
