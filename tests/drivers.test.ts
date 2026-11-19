import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectionSchema,deviceSchema,tagSchema} from '../packages/contracts/model';
import {backoffDelay,BACKOFF_BASE_MS,BACKOFF_CAP_MS,opcUaDriver,modbusDriver,assertDriversDeployable,nodeRedPackageInstalled,nodeRedModuleDirs} from '../packages/drivers/driver';
/* Bu dosya B?-hata-farkindali-backoff, watchdog-bagimsiz surucu davranislarini ve OPC UA
 * surucu kurallarini dogrular. tests/gateway.test.ts ve tests/modbus.test.ts zaten Modbus akis
 * yapisini (dugum kimlikleri, kilit) dogruluyor; burasi driver.ts icindeki saf mantiga (backoffDelay)
 * ve surucuye ozgu kurallara (opcUaDriver.validate, writeLimits) odaklanir. */

test('backoffDelay: hatasiz durumda gecikme yoktur',()=>{
 assert.equal(backoffDelay(0),0);
 assert.equal(backoffDelay(-1),0);
});
test('backoffDelay: taban formul base*2^(n-1), jitter sifirlandiginda (rng=0.5) tam deger doner',()=>{
 const rng=()=>0.5;// rng()*2-1===0 => sapma yok
 assert.equal(backoffDelay(1,BACKOFF_BASE_MS,BACKOFF_CAP_MS,0.2,rng),500);
 assert.equal(backoffDelay(2,BACKOFF_BASE_MS,BACKOFF_CAP_MS,0.2,rng),1000);
 assert.equal(backoffDelay(3,BACKOFF_BASE_MS,BACKOFF_CAP_MS,0.2,rng),2000);
});
test('backoffDelay: cok fazla ardisik hatada tavan (30000) asilmaz',()=>{
 for(const rng of [()=>0,()=>0.5,()=>1]){
  const d=backoffDelay(20,BACKOFF_BASE_MS,BACKOFF_CAP_MS,0.2,rng);
  assert.ok(d<=BACKOFF_CAP_MS,`tavan asildi: ${d}`);
 }
});
test('backoffDelay: jitter ±%20 araliginin disina cikmaz',()=>{
 const n=4;// raw=500*2^3=4000
 const raw=500*Math.pow(2,n-1);
 const low=backoffDelay(n,BACKOFF_BASE_MS,BACKOFF_CAP_MS,0.2,()=>0);// rng()*2-1=-1 -> -%20
 const high=backoffDelay(n,BACKOFF_BASE_MS,BACKOFF_CAP_MS,0.2,()=>1);// rng()*2-1=+1 -> +%20
 assert.ok(Math.abs(low-raw*0.8)<1e-9,`alt sinir yanlis: ${low}`);
 assert.ok(Math.abs(high-raw*1.2)<1e-9,`ust sinir yanlis: ${high}`);
});

// --- Modbus: reconnectTimeout ve gomulu backoff kapisi -----------------------
const baseConn=()=>connectionSchema.parse({id:'c1',name:'PLC',host:'10.0.0.5',port:502,timeout:3000});
const baseDevice=()=>deviceSchema.parse({id:'d1',connectionId:'c1',code:'D1',name:'D1',slaveId:1,enabled:true,pollMs:1000,staleMs:4000});
const baseTag=()=>tagSchema.parse({id:'t1',deviceId:'d1',code:'T1',name:'T1',area:'holding-register',address:0,dataType:'uint16',access:'read',min:-1e9,max:1e9});

test('modbus-client reconnectTimeout, baglanti zaman asimindan kisa olamaz (Math.max(2000, timeout))',()=>{
 const shortTimeout=connectionSchema.parse({id:'c1',name:'PLC',host:'10.0.0.5',port:502,timeout:500});
 const nodes=modbusDriver.buildNodes([shortTimeout],[baseDevice()],[baseTag()],{token:'tok',revision:1});
 const client=nodes.find(n=>n.id==='scada-client-c1');
 assert.equal(client.reconnectTimeout,2000,'kisa timeoutta tabana (2000) dusmeli');
 const longTimeout=connectionSchema.parse({id:'c1',name:'PLC',host:'10.0.0.5',port:502,timeout:9000});
 const nodes2=modbusDriver.buildNodes([longTimeout],[baseDevice()],[baseTag()],{token:'tok',revision:1});
 const client2=nodes2.find(n=>n.id==='scada-client-c1');
 assert.equal(client2.reconnectTimeout,9000,'uzun timeoutta baglanti zaman asimini takip etmeli');
});
test('sirali tarama fonksiyonu: ardisik hata sonrasi backoff penceresinde tarama atlanir, pencere gecince devam eder',()=>{
 const conn=baseConn();
 const nodes=modbusDriver.buildNodes([conn],[baseDevice()],[baseTag()],{token:'tok',revision:1});
 const pollFunc=nodes.find(n=>n.id==='scada-poll-c1')!.func as string;
 const run=new Function('msg','flow','context',pollFunc);
 const store=new Map<string,unknown>();
 const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>store.set(k,v)};
 const ctxStore=new Map<string,unknown>();
 const context={get:(k:string)=>ctxStore.get(k),set:(k:string,v:unknown)=>ctxStore.set(k,v)};
 // 3 ardisik hata kaydedilmis: raw=min(500*2^2,30000)=2000ms bekleme (jitter ±%20 -> 1600-2400 arasi).
 flow.set('fail-10.0.0.5:502',3);
 flow.set('fail-at-10.0.0.5:502',Date.now());
 const skipped=run(undefined,flow,context);
 assert.equal(skipped,null,'backoff penceresi icindeyken tarama atlanmali');
 // Pencere gecmis (uzun sure once) -> tarama devam etmeli.
 flow.set('fail-at-10.0.0.5:502',Date.now()-60000);
 const resumed=run(undefined,flow,context);
 assert.ok(resumed&&resumed.block,'backoff penceresi gectiginde tarama devam etmeli');
});
test('sirali tarama fonksiyonu: hic hata yoksa backoff kapisi devreye girmez',()=>{
 const conn=baseConn();
 const nodes=modbusDriver.buildNodes([conn],[baseDevice()],[baseTag()],{token:'tok',revision:1});
 const pollFunc=nodes.find(n=>n.id==='scada-poll-c1')!.func as string;
 const run=new Function('msg','flow','context',pollFunc);
 const store=new Map<string,unknown>();
 const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>store.set(k,v)};
 const ctxStore=new Map<string,unknown>();
 const context={get:(k:string)=>ctxStore.get(k),set:(k:string,v:unknown)=>ctxStore.set(k,v)};
 const result=run(undefined,flow,context);
 assert.ok(result&&result.block,'ilk taramada hic hata kaydi yok, calismali');
});
test("'Etiket / kalite' donusum fonksiyonu ardisik hata sayacini bus bazinda tutar",()=>{
 const conn=baseConn();
 const nodes=modbusDriver.buildNodes([conn],[baseDevice()],[baseTag()],{token:'tok',revision:1});
 const convertFunc=nodes.find(n=>n.id==='scada-poll-c1-convert')!.func as string;
 const convert=new Function('msg','flow','context',convertFunc);
 const store=new Map<string,unknown>();
 const flow={get:(k:string)=>store.get(k),set:(k:string,v:unknown)=>store.set(k,v)};
 const busKey='10.0.0.5:502';
 const tag={...baseTag(),dataType:'uint16' as const};
 const okMsg={block:{tags:[tag]},payload:[7],bus:busKey,lockKey:'x'};
 convert(okMsg,flow,flow);
 assert.equal(flow.get('fail-'+busKey),0,'basarili okuma sayaci sifirlamali');
 flow.set('fail-'+busKey,2);
 const noBlockMsg={payload:[1],bus:busKey,lockKey:'x'};
 assert.equal(convert(noBlockMsg,flow,flow),null);
 assert.equal(flow.get('fail-'+busKey),3,'msg.block yoklugu sayaci artirmali');
 const badLenMsg={block:{tags:[tag]},payload:{data:[]},bus:busKey,lockKey:'x'};
 assert.equal(convert(badLenMsg,flow,flow),null);
 assert.equal(flow.get('fail-'+busKey),4,'beklenmeyen payload bicimi sayaci artirmali');
 const shortMsg={block:{tags:[tag]},payload:[],bus:busKey,lockKey:'x'};
 convert(shortMsg,flow,flow);
 assert.equal(flow.get('fail-'+busKey),5,'yetersiz uzunluktaki (bad kalite) okuma da sayaci artirmali');
 convert(okMsg,flow,flow);
 assert.equal(flow.get('fail-'+busKey),0,'sonraki basarili okuma sayaci yeniden sifirlamali');
});

// --- OPC UA: Faz 1 ile yazma acildi (paylasilan kopru dali; ayrinti tests/opcua-write.test.ts) ----
const opcConn=()=>connectionSchema.parse({id:'o1',name:'OPC',protocol:'opc-ua',endpoint:'opc.tcp://10.0.0.9:4840',timeout:3000});
const opcDevice=()=>deviceSchema.parse({id:'od1',connectionId:'o1',code:'OD1',name:'OD1',slaveId:1,enabled:true,pollMs:1000,staleMs:4000});
const opcTag=(access:'read'|'readwrite',nodeId='ns=2;s=Tag1')=>tagSchema.parse({id:'ot1',deviceId:'od1',code:'OT1',name:'OT1',area:'holding-register',address:0,dataType:'uint16',access,min:-1e9,max:1e9,nodeId});

test('opcUaDriver.writeLimits.allowWrite true ve yazma dali uretebilir',()=>{
 assert.equal(opcUaDriver.writeLimits.allowWrite,true);
 assert.equal(typeof opcUaDriver.buildWriteNodes,'function');
});
test('opcUaDriver.validate: yazilabilir nodeId bicimindeki readwrite etiket kabul edilir',()=>{
 assert.doesNotThrow(()=>opcUaDriver.validate(opcConn(),[opcTag('readwrite')]));
 assert.doesNotThrow(()=>opcUaDriver.validate(opcConn(),[opcTag('readwrite','i=2258')]),'ns siz kimlik ns=0 sayilir');
});
test('opcUaDriver.validate: yazilamaz nodeId (nsu=, bicimsiz) readwrite etikette acik hatayla reddedilir; read etikette sorun degil',()=>{
 assert.throws(()=>opcUaDriver.validate(opcConn(),[opcTag('readwrite','nsu=http://x;s=A')]),/OT1.*node kimliği/);
 assert.throws(()=>opcUaDriver.validate(opcConn(),[opcTag('readwrite','Tag1')]),/OT1.*node kimliği/);
 assert.doesNotThrow(()=>opcUaDriver.validate(opcConn(),[opcTag('read','nsu=http://x;s=A')]));
});
test('opcUaDriver.validate: eski username alani artik reddedilmez (yok sayilir)',()=>{
 assert.doesNotThrow(()=>opcUaDriver.validate({...opcConn(),username:'eski'},[opcTag('read')]));
});
test('opcUaDriver.buildNodes yalanci OpcUa-Write dugumu uretmez; okuma dugumleri yazmadan bagimsiz',()=>{
 const nodes=opcUaDriver.buildNodes([opcConn()],[opcDevice()],[opcTag('readwrite')],{token:'tok',revision:1});
 assert.ok(!nodes.some(n=>n.type==='OpcUa-Write'),'pakette olmayan OpcUa-Write dugumu uretilmemeli');
 assert.ok(!nodes.some(n=>n.type==='OpcUa-Client'&&n.action==='write'),'yazma istemcisi buildWriteNodes ile gelir');
});
test('assertDriversDeployable: OPC UA baglantisinda yazilamaz nodeId li readwrite etiket deploy oncesi acik hatayla durur',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-opcua-'));
 fs.mkdirSync(path.join(dir,'node_modules','node-red-contrib-opcua'),{recursive:true});
 fs.writeFileSync(path.join(dir,'node_modules','node-red-contrib-opcua','package.json'),'{}');
 assert.throws(()=>assertDriversDeployable([opcConn()],[opcDevice()],[opcTag('readwrite','nsu=http://x;s=A')],dir),/node kimliği/);
});
test('assertDriversDeployable: OPC UA baglantisinda read ve gecerli readwrite etiketler sorunsuz gecer',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-opcua-'));
 fs.mkdirSync(path.join(dir,'node_modules','node-red-contrib-opcua'),{recursive:true});
 fs.writeFileSync(path.join(dir,'node_modules','node-red-contrib-opcua','package.json'),'{}');
 assert.doesNotThrow(()=>assertDriversDeployable([opcConn()],[opcDevice()],[opcTag('read')],dir));
 assert.doesNotThrow(()=>assertDriversDeployable([opcConn()],[opcDevice()],[opcTag('readwrite')],dir));
});
// --- Node-RED paket kontrolu: cwd disindaki konumlar --------------------------
test('nodeRedPackageInstalled: Node-RED userDir (<veri>/node-red/node_modules) ve uygulama koku de aranir',()=>{
 const empty=fs.mkdtempSync(path.join(os.tmpdir(),'scada-pkg-empty-'));
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'scada-pkg-data-'));
 const cwd=process.cwd();
 try{
  process.chdir(empty);
  assert.equal(nodeRedPackageInstalled('node-red-contrib-ornek',data,empty),false,'hicbir yerde yoksa false');
  const inUserDir=path.join(data,'node-red','node_modules','node-red-contrib-ornek');
  fs.mkdirSync(inUserDir,{recursive:true});fs.writeFileSync(path.join(inUserDir,'package.json'),'{}');
  assert.equal(nodeRedPackageInstalled('node-red-contrib-ornek',data,empty),true,'Node-RED userDir icindeki paket bulunmali');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'scada-pkg-root-'));
  const inRoot=path.join(root,'node_modules','node-red-contrib-kok');
  fs.mkdirSync(inRoot,{recursive:true});fs.writeFileSync(path.join(inRoot,'package.json'),'{}');
  assert.equal(nodeRedPackageInstalled('node-red-contrib-kok',data,root),true,'cwd farkli olsa da uygulama kokundeki paket bulunmali');
  assert.equal(nodeRedPackageInstalled('node-red-contrib-kok',data,empty),false);
 }finally{process.chdir(cwd);}
 // Varsayilan kok bu modulun konumundan cozulur: depo kokundeki node_modules listede olmali (cwd'den bagimsiz).
 assert.ok(nodeRedModuleDirs('x').includes(path.resolve(__dirname,'..','node_modules')),'uygulama koku modul konumundan cozulmeli');
});
