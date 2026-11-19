import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Config} from '../packages/contracts/model';
import {seedConfig} from '../packages/contracts/seed';
import {buildGateway} from '../apps/server/src/gateway';
test('Modbus dijital veri boolean kalir; ikinci ham cikti ve hata ayirt edilir',()=>{
 const nodes=buildGateway(structuredClone(seedConfig),'tok',3000,'.');
 const code=nodes.find(n=>n.id==='scada-poll-conn-01-convert')!.func;
 const convert=new Function('msg','flow','context',code);
 const memory=new Map();const context={get:(k:string)=>memory.get(k),set:(k:string,v:unknown)=>memory.set(k,v)};
 const tag={...seedConfig.tags[0],dataType:'bool',scale:1,offset:0};
 const msg={block:{tags:[tag,tag]},payload:[true,false],bus:'test',lockKey:'test'};
 const result=convert(msg,context,context);
 assert.deepEqual(result.payload.samples.map((s:any)=>s.value),[true,false]);
 assert.ok(result.payload.samples.every((s:any)=>s.quality==='good'));
 assert.equal(convert({...msg,payload:{data:[true,false],buffer:Buffer.from([1])}},context,context),null);
 const failed=convert({...msg,payload:'',error:Error('timeout')},context,context);
 assert.ok(failed.payload.samples.every((s:any)=>s.value===null&&s.quality==='bad'));
});
// Test icin: iki ayri baglanti tanimi ayni fiziksel hatta (host:port) isaret ediyor (B44 senaryosu).
const sameBusConfig=():Config=>{
 const c=structuredClone(seedConfig);
 c.connections.push({id:'conn-02',name:'Yedek tanim',host:c.connections[0].host,port:c.connections[0].port,timeout:3000});
 c.devices.push({id:'plc-02',connectionId:'conn-02',code:'PLC-02',name:'Ayni hat ikinci cihaz',slaveId:2,enabled:true,pollMs:1000,staleMs:4000,description:''});
 c.tags.push({id:'tag-conn2',deviceId:'plc-02',code:'C2',name:'C2',area:'coil',address:0,dataType:'bool',access:'readwrite',scale:1,offset:0,min:0,max:65535,unit:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,description:''});
 c.commands.push({id:'cmd-conn2',name:'C2 kontrol',tagIds:['tag-conn2'],feedbackTagIds:[],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''});
 return c;
};
const findFunc=(nodes:any[],id:string):string=>{
 const n=nodes.find(x=>x.id===id);
 assert.ok(n,`${id} dugumu bulunamali`);
 return n.func as string;
};
test('ayni host:port paylasan iki farkli baglanti tanimi ayni kilit anahtarini kullanir (B44)',()=>{
 const c=sameBusConfig();
 const nodes=buildGateway(c,'tok',1880,'.');
 const poll1=findFunc(nodes,'scada-poll-conn-01');
 const poll2=findFunc(nodes,'scada-poll-conn-02');
 const key1=poll1.match(/bus-([^']+)'/)?.[1];
 const key2=poll2.match(/bus-([^']+)'/)?.[1];
 assert.ok(key1&&key2,'her iki tarama fonksiyonu da bir kilit anahtari uretmeli');
 assert.equal(key1,key2,'ayni fiziksel hatti paylasan baglantilar ayni kilidi kullanmali');
 assert.equal(key1,c.connections[0].host.toLowerCase()+':'+c.connections[0].port,'kilit anahtari host:port formatinda olmali');
});
test('farkli host veya port icin farkli kilit anahtari uretilir',()=>{
 const c=structuredClone(seedConfig);
 c.connections.push({id:'conn-farkli',name:'Farkli hat',host:'192.0.2.16',port:502,timeout:2000});
 c.devices.push({id:'plc-farkli',connectionId:'conn-farkli',code:'PLC-F',name:'Farkli',slaveId:3,enabled:true,pollMs:1000,staleMs:4000,description:''});
 const nodes=buildGateway(c,'tok',1880,'.');
 const poll1=findFunc(nodes,'scada-poll-conn-01');
 const poll2=findFunc(nodes,'scada-poll-conn-farkli');
 const key1=poll1.match(/bus-([^']+)'/)?.[1];
 const key2=poll2.match(/bus-([^']+)'/)?.[1];
 assert.notEqual(key1,key2,'farkli fiziksel hatlar ayri kilit anahtari almali');
});
test('kilit anahtari kucuk harfe normalize edilir (host buyuk/kucuk harf farki ayni kilidi vermeli)',()=>{
 const c=structuredClone(seedConfig);
 c.connections[0].host=c.connections[0].host.toUpperCase();
 const nodes=buildGateway(c,'tok',1880,'.');
 const poll1=findFunc(nodes,'scada-poll-conn-01');
 assert.ok(poll1.includes(`bus-${c.connections[0].host.toLowerCase()}:${c.connections[0].port}`),'buyuk harfli host bile kucuk harfle anahtarlanmali');
});
test('okuma ve yazma yollarindaki kilit suresi ayni formulden (timeout+500) gelir (B45)',()=>{
 const c=sameBusConfig();
 const nodes=buildGateway(c,'tok',1880,'.');
 const poll=findFunc(nodes,'scada-poll-conn-01');
 // Hat kilidi Modbus'a ozgudur: paylasilan bekcide degil, Modbus yazma dalinda (scada-modbus-write-prep).
 const guard=findFunc(nodes,'scada-modbus-write-prep');
 // Okuma yolunda literal esik degeri.
 assert.ok(poll.includes(`<${c.connections[0].timeout+500})`),'okuma kilidi esigi connection.timeout+500 olmali');
 // Yazma yolunda baglanti bazinda lockMs haritasi JSON olarak gomulu olmali, hem conn-01 hem conn-02 icin dogru deger.
 assert.ok(guard.includes('connLockMs'),'yazma yolu paylasilan bir kilit suresi haritasi kullanmali');
 assert.ok(guard.includes(`"conn-01":${c.connections[0].timeout+500}`),'conn-01 icin kilit suresi timeout+500 olmali');
 assert.ok(guard.includes(`"conn-02":${c.connections[1].timeout+500}`),'conn-02 icin kilit suresi kendi timeout+500 olmali');
 assert.ok(!guard.includes('12000'),'eski sabit 12000ms esigi kalmamali');
});
test('yazma zincirinde her hata dalinda kilit serbest birakilir ve HTTP cevabi doner (B45)',()=>{
 const nodes=buildGateway(structuredClone(seedConfig),'tok',1880,'.');
 const guardNode=nodes.find(n=>n.id==='scada-write-guard');
 const resultFunc=findFunc(nodes,'scada-write-result');
 const writeNode=nodes.find(n=>n.id==='scada-write-'+seedConfig.connections[0].id);
 // scada-write-guard dogrulama hatalarinda (fail()) her zaman http-response'a kablolu son cikisi kullanir.
 assert.ok(guardNode.wires.at(-1).includes('scada-http-response'),'guard dugumunun son cikisi http yanitina baglanmali');
 // modbus-flex-write dugumunun HEM basari HEM hata cikisi sonuc fonksiyonuna baglanmali (eskiden hata cikisi bosa gidiyordu).
 assert.equal(writeNode.wires.length,2,'yazma dugumunun iki cikisi olmali');
 assert.deepEqual(writeNode.wires[0],['scada-write-result'],'basari cikisi sonuc fonksiyonuna baglanmali');
 assert.deepEqual(writeNode.wires[1],['scada-write-result'],'hata cikisi da sonuc fonksiyonuna baglanmali, bosa gitmemeli');
 // Sonuc fonksiyonu: kilit sahipligini kontrol edip serbest birakir ve HER durumda (hata da dahil) msg'yi (ve dolayisiyla msg.res'i) http yanitina dondurur.
 assert.ok(resultFunc.includes("lock.key===msg.lockKey"),'sonuc fonksiyonu yalniz kendi kilidini serbest birakmali');
 assert.ok(resultFunc.includes("flow.set('bus-'+msg.bus,null)"),'sonuc fonksiyonu kilidi serbest birakmali');
 assert.ok(resultFunc.includes('return msg'),'sonuc fonksiyonu her durumda msg (ve msg.res) dondurmeli, cevap kaybolmamali');
});
test('okuma yolunda modbus-flex-getter hata ciktisi da kilit serbest birakan donusum fonksiyonuna baglanir',()=>{
 const nodes=buildGateway(structuredClone(seedConfig),'tok',1880,'.');
 const readNode=nodes.find(n=>n.id==='scada-poll-conn-01-read');
 assert.equal(readNode.wires.length,2);
 assert.deepEqual(readNode.wires[0],['scada-poll-conn-01-convert']);
 assert.deepEqual(readNode.wires[1],['scada-poll-conn-01-convert'],'hata ciktisi bosa gitmemeli, kilidi de serbest birakmali');
});
test('bayat kalmis kilit yeni istek tarafindan devralinabilir (esik asilinca engellenmez)',()=>{
 const c=structuredClone(seedConfig);
 const nodes=buildGateway(c,'tok',1880,'.');
 const poll=findFunc(nodes,'scada-poll-conn-01');
 // "lock && now-lock.at<ESIK" bicimindeki kosul sadece TAZE kilitte engeller; esik asildiginda kosul false olur ve akis devam eder.
 assert.match(poll,/lock&&now-lock\.at<\d+\)return null/,'kilit sadece esik icindeyken engellemeli, bayat kilitte devam etmeli');
});
test('uretilen dugum id leri deterministiktir (ayni config -> ayni cikti)',()=>{
 const c=structuredClone(seedConfig);
 const a=buildGateway(c,'tok',1880,'.');
 const b=buildGateway(c,'tok',1880,'.');
 assert.deepEqual(a.map(n=>n.id),b.map(n=>n.id),'ayni config icin ayni sirada ayni id listesi uretilmeli');
 assert.deepEqual(a,b,'ayni config icin tum cikti birebir ayni olmali');
});
