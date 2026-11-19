import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectionSchema,deviceSchema,tagSchema,validateConfig,protocolLabels,isSymbolicProtocol,isReadOnlyProtocol,symbolicAddressField,symbolicAddressOf,addressFormatOf,
 parseSnmpOid,snmpRaw,snmpCodecSource,mqttCoerce,type Config} from '../packages/contracts/model';
import {acceptSource,type SourceState} from '../apps/server/src/ingest';
import {seedConfig} from '../packages/contracts/seed';
import {snmpDriver,driverFor,assertDriversDeployable,snmpCommunityEnv,snmpGetId,SNMP_MAX_OIDS} from '../packages/drivers/driver';
import {buildGateway,withoutCredentials,clearRemovedTabCredentials} from '../apps/server/src/gateway';
/* SNMP surucusu: OID dogrulama, varbind cozme (gomulu parite), salt okuma, dugum uretimi, community'nin yalniz
 * sekme `credentials`'inda durmasi, v3 anahtarlarinin yalniz dugum `credentials`'inda durmasi, parcalama ve hata yolu. */

const conn=(extra:object={})=>connectionSchema.parse({id:'sn1',name:'Switch',protocol:'snmp',host:'203.0.113.70',port:161,timeout:2000,snmpVersion:'2c',...extra});
const device=(extra:object={})=>deviceSchema.parse({id:'sd1',connectionId:'sn1',code:'SW-1',name:'Pano switch',slaveId:1,enabled:true,pollMs:5000,staleMs:15000,...extra});
const tag=(id:string,snmpOid:string,dataType:string,extra:object={})=>tagSchema.parse({id,deviceId:'sd1',code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'read',min:-1e12,max:1e12,snmpOid,...extra});
const base=():Config=>{const c:any=structuredClone(seedConfig);c.connections.push(conn());c.devices.push(device());return c;};
const ctx={token:'tok',revision:3,hostname:'ZS-A'};
const COMMUNITY='Gizli-Comm-91';

test('SNMP protokolu: etiket, sembolik alan, salt okuma, surucu secimi',()=>{
 assert.equal(protocolLabels.snmp,'SNMP');
 assert.equal(isSymbolicProtocol('snmp'),true);assert.equal(isReadOnlyProtocol('snmp'),true);
 assert.equal(symbolicAddressField('snmp'),'snmpOid');
 assert.equal(symbolicAddressOf({snmpOid:'1.3.6.1.2.1.1.3.0'},{protocol:'snmp'}),'1.3.6.1.2.1.1.3.0');
 assert.equal(addressFormatOf(base(),'sd1'),'snmp');
 assert.equal(driverFor(conn()).id,'snmp');
 assert.equal(snmpDriver.writeLimits.allowWrite,false);assert.equal(snmpDriver.buildWriteNodes,undefined);
});

test('parseSnmpOid: yalniz sayisal noktali OID; bastaki nokta ve sifirlar normallesir',()=>{
 assert.equal(parseSnmpOid('1.3.6.1.2.1.1.3.0'),'1.3.6.1.2.1.1.3.0');
 assert.equal(parseSnmpOid(' .1.3.6.1.2.1.2.2.1.10.1 '),'1.3.6.1.2.1.2.2.1.10.1');
 assert.equal(parseSnmpOid('1.3.06.1'),'1.3.6.1');
 assert.equal(parseSnmpOid('2.999.4294967295'),'2.999.4294967295');
 for(const bad of ['','1','sysUpTime.0','SNMPv2-MIB::sysUpTime.0','1..3','1.3.','1.3.6.a','3.1.1','1.40.1','1.3.4294967296','1.3 .6','-1.3',' ','1,3,6'])
  assert.throws(()=>parseSnmpOid(bad),/SNMP OID/,bad);
 assert.throws(()=>parseSnmpOid('1.'+'1.'.repeat(130)+'1'),/SNMP OID/);
});

test('snmpRaw + mqttCoerce: sayi tipleri, Counter64, OctetString sayi metni; hata tipleri undefined',()=>{
 const b=(...x:number[])=>Buffer.from(x);
 assert.equal(snmpRaw({oid:'1.3',type:2,value:-5}),-5);
 assert.equal(snmpRaw({oid:'1.3',type:65,value:4294967295}),4294967295);
 assert.equal(snmpRaw({oid:'1.3',type:66,value:12}),12);
 assert.equal(snmpRaw({oid:'1.3',type:67,value:123456}),123456,'TimeTicks (1/100 sn) ham sayi');
 assert.equal(snmpRaw({oid:'1.3',type:70,value:b(0x01,0x00,0x00,0x00,0x00)}),4294967296);
 assert.equal(snmpRaw({oid:'1.3',type:70,value:{type:'Buffer',data:[0,0,1,0]}}),256,'JSON Buffer');
 assert.equal(snmpRaw({oid:'1.3',type:70,value:b(0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff)}),undefined,'2^53 ustu');
 assert.equal(snmpRaw({oid:'1.3',type:4,value:Buffer.from('23.5')}),'23.5');
 assert.equal(mqttCoerce(snmpRaw({oid:'1.3',type:4,value:Buffer.from(' 23.5 ')}),'float32'),23.5);
 assert.equal(mqttCoerce(snmpRaw({oid:'1.3',type:4,value:Buffer.from('Cisco IOS')}),'float32'),null,'metin -> bad');
 assert.equal(snmpRaw({oid:'1.3',type:4,value:Buffer.alloc(65,49)}),undefined,'64 bayt ustu');
 for(const vb of [{type:128,value:null},{type:129,value:null},{type:130,value:null},{type:5,value:null},{type:6,value:'1.3.6'},{type:64,value:'10.0.0.1'},{type:68,value:b(1)},
  {type:2,value:3,_error:'x'},null,undefined,'1',{type:2}])assert.equal(snmpRaw(vb),undefined,JSON.stringify(vb));
 assert.equal(mqttCoerce(snmpRaw({oid:'1.3',type:2,value:1}),'bool'),true);
 assert.equal(mqttCoerce(snmpRaw({oid:'1.3',type:2,value:2}),'bool'),null,'2 bool degil');
 assert.equal(mqttCoerce(snmpRaw({oid:'1.3',type:65,value:70000}),'uint16'),null,'tip araligi disi bad');
});

test('gomulu SNMP kodegi (snmpCodecSource) kanonik fonksiyonlarla ayni davranir',()=>{
 const emb=(new Function(snmpCodecSource()+'\nreturn {snmpRaw,mqttCoerce};'))() as {snmpRaw:typeof snmpRaw;mqttCoerce:typeof mqttCoerce};
 const vbs=[{type:2,value:7},{type:70,value:Buffer.from([0,1,0])},{type:4,value:Buffer.from('12')},{type:4,value:Buffer.from('x')},{type:128,value:null},{type:2,value:1,_error:'e'},{type:65,value:0}];
 for(const vb of vbs)for(const dt of ['bool','int16','uint16','int32','uint32','float32']){
  assert.deepEqual(emb.snmpRaw(vb),snmpRaw(vb));
  assert.equal(emb.mqttCoerce(emb.snmpRaw(vb),dt),mqttCoerce(snmpRaw(vb),dt),JSON.stringify(vb)+' '+dt);
 }
});

test('validateConfig: SNMP etiketi OID ister, oku/yaz reddedilir; baglanti kurallari',()=>{
 const ok=base();ok.tags.push(tag('t1','1.3.6.1.2.1.1.3.0','uint32'),tag('t2','.1.3.6.1.2.1.2.2.1.8.1','int16'));
 assert.doesNotThrow(()=>validateConfig(ok));
 const name=base();name.tags.push(tag('t1','sysUpTime.0','uint32'));
 assert.throws(()=>validateConfig(name),/SNMP OID/);
 const rw=base();rw.tags.push(tag('t1','1.3.6.1.2.1.1.3.0','uint32',{access:'readwrite',min:0,max:100}));
 assert.throws(()=>validateConfig(rw),/SNMP etiketi yalnız okunur/);
 assert.throws(()=>snmpDriver.validate(conn(),[tag('t1','1.3.6.1','float32',{access:'readwrite'})]),/yalnız okunur/);
 const withConn=(extra:object)=>{const c=base();c.connections[c.connections.length-1]=conn(extra);return c;};
 assert.throws(()=>validateConfig(withConn({port:1161,host:'switch.local'})),/yalnız IPv4/);
 assert.doesNotThrow(()=>validateConfig(withConn({port:1161,host:'203.0.113.70'})));
 assert.throws(()=>validateConfig(withConn({host:'fe80::1'})),/IPv6/);
 assert.throws(()=>validateConfig(withConn({snmpVersion:'3',snmpSecurityLevel:'authPriv',snmpAuthProtocol:'SHA'})),/şifreleme protokolü/);
 assert.throws(()=>validateConfig(withConn({snmpVersion:'3',snmpSecurityLevel:'authNoPriv'})),/kimlik doğrulama protokolü/);
 assert.doesNotThrow(()=>validateConfig(withConn({snmpVersion:'3',snmpSecurityLevel:'noAuthNoPriv'})));
 assert.throws(()=>connectionSchema.parse({...conn(),snmpVersion:'2'}));
 assert.throws(()=>connectionSchema.parse({...conn(),snmpPrivProtocol:'AES256'}));
});

test('assertDriversDeployable: node-red-node-snmp kurulu degilse acik hata',()=>{
 assert.doesNotThrow(()=>assertDriversDeployable([conn()],[device()],[tag('t1','1.3.6.1','float32')],'.'));
 const empty=fs.mkdtempSync(path.join(os.tmpdir(),'scada-snmp-')),cwd=process.cwd();
 try{process.chdir(empty);assert.throws(()=>assertDriversDeployable([conn()],[device()],[tag('t1','1.3.6.1','float32')],empty,empty),/node-red-node-snmp kurulu değil/);}
 finally{process.chdir(cwd);}
});

test('snmpDriver.buildNodes: baglanti basina tek get dugumu, cihaz basina zamanlayici, community dugumde YOK',()=>{
 const tags=[tag('t1','1.3.6.1.2.1.1.3.0','uint32'),tag('t2','1.3.6.1.2.1.1.3.0','float32',{scale:0.01}),tag('t3','1.3.6.1.2.1.2.2.1.8.1','int16'),tag('t4','1.3.6.1.9','float32',{deviceId:'sd2'})];
 const devices=[device(),device({id:'sd2',code:'SW-2',slaveId:2,enabled:false})];
 const sctx={...ctx,secret:(id:string)=>id==='sn1'?{community:COMMUNITY}:undefined};
 const nodes=snmpDriver.buildNodes([conn()],devices,tags,sctx);
 const get=nodes.find(n=>n.type==='snmp');
 assert.equal(get.id,'scada-snmp-sn1-get');assert.equal(snmpGetId(conn()),get.id);
 assert.equal(get.host,'203.0.113.70');assert.equal(get.version,'2c');assert.equal(get.timeout,2);
 assert.equal(get.community,'','community dugum ozelliginde DEGIL');assert.equal(get.oids,'','OID listesi msg.oid ile gelir');assert.equal(get.credentials,undefined);
 assert.equal(JSON.stringify(nodes).includes(COMMUNITY),false,'community hicbir dugumde yok');
 const clocks=nodes.filter(n=>n.type==='inject');
 assert.equal(clocks.length,1,'pasif cihaz yoklanmaz');
 assert.deepEqual(JSON.parse(clocks[0].payload),['1.3.6.1.2.1.1.3.0','1.3.6.1.2.1.2.2.1.8.1'],'ayni OID tek kez istenir');
 assert.equal(clocks[0].repeat,'5');assert.equal(clocks[0].topic,'sd1');
 assert.deepEqual(nodes.find(n=>n.id==='scada-snmp-sn1-catch').scope,[get.id]);
 for(const n of nodes)assert.match(n.id,/^scada-/);
 assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
 assert.deepEqual(snmpDriver.buildNodes([conn()],devices,tags,sctx),nodes,'deterministik');
 assert.deepEqual(snmpDriver.flowEnv!([conn()],devices,tags,sctx),{[snmpCommunityEnv(conn())]:COMMUNITY});
 assert.match(snmpCommunityEnv(conn()),/^SCADA_SNMP_COMMUNITY_[0-9A-F]{12}$/);
 assert.deepEqual(snmpDriver.flowEnv!([conn()],[device({enabled:false})],tags,sctx),{},'etiketsiz baglanti community tasimaz');
 // 161 disi port IPv4:port bicimiyle gider (paket portu host'tan alir).
 assert.equal(snmpDriver.buildNodes([conn({port:1161})],devices,tags,sctx).find(n=>n.type==='snmp').host,'203.0.113.70:1161');
});

test('SNMPv3: kullanici/anahtarlar yalniz get dugumunun credentials alaninda; dugum kimligi ayri; flowEnv bos',()=>{
 const c3=conn({snmpVersion:'3',snmpSecurityLevel:'authPriv',snmpAuthProtocol:'SHA256',snmpPrivProtocol:'AES'});
 const s={username:'zscada',authKey:'Gizli-Auth-55',privKey:'Gizli-Priv-66',community:'kullanilmaz'};
 const nodes=snmpDriver.buildNodes([c3],[device()],[tag('t1','1.3.6.1.2.1.1.3.0','uint32')],{...ctx,secret:()=>s});
 const get=nodes.find(n=>n.type==='snmp');
 assert.equal(get.id,'scada-snmp-sn1-get-v3');assert.equal(get.version,'3');assert.equal(get.auth,'authPriv');assert.equal(get.authprot,'SHA256');assert.equal(get.privprot,'AES');
 assert.deepEqual(get.credentials,{username:'zscada',authkey:'Gizli-Auth-55',privkey:'Gizli-Priv-66'});
 const {credentials:_c,...rest}=get;
 assert.equal(JSON.stringify(rest).includes('Gizli'),false);assert.equal(JSON.stringify(nodes.filter(n=>n!==get)).includes('Gizli'),false);
 assert.equal(JSON.stringify(withoutCredentials(nodes)).includes('Gizli'),false);
 assert.equal(JSON.stringify(nodes).includes('kullanilmaz'),false,'v3te community kullanilmaz');
 assert.deepEqual(snmpDriver.flowEnv!([c3],[device()],[tag('t1','1.3.6.1','uint32')],{...ctx,secret:()=>s}),{});
 assert.equal(nodes.find(n=>n.id==='scada-snmp-sn1-prep').func.includes('env.get'),false);
});

test('buildGateway: community sekmenin cred ortam degiskeninde; yedekte ayiklanir; kaldirilan anahtar silinir',()=>{
 const c=base();c.connections=[conn()];c.devices=[device()];c.tags=[tag('t1','1.3.6.1.2.1.1.3.0','uint32')];c.commands=[];
 const nodes=buildGateway(validateConfig(c),'tok',4730,'.',{hostname:'ZS-A',secret:id=>id==='sn1'?{community:COMMUNITY}:undefined});
 const tab=nodes[0],name=snmpCommunityEnv(conn());
 assert.equal(tab.type,'tab');assert.deepEqual(tab.env,[{name,value:'',type:'cred'}]);assert.deepEqual(tab.credentials,{[name]:COMMUNITY});
 assert.equal(JSON.stringify(nodes.slice(1)).includes(COMMUNITY),false);
 assert.equal(JSON.stringify(withoutCredentials(nodes)).includes(COMMUNITY),false,'yedek community icermez');
 assert.equal(nodes.some(n=>n.id==='scada-write-http'||n.id==='scada-read-http'||n.type==='http response'),false,'yazma koprusu yok');
 // Community yoksa sekmede env yok.
 const plain=buildGateway(validateConfig(c),'tok',4730,'.',{hostname:'ZS-A'});
 assert.equal(plain[0].env,undefined);assert.equal(plain[0].credentials,undefined);
 // Onceki yayinda olan community anahtari yenisinde yoksa bos deger yazilir (Node-RED kayitli bilgiyi siler).
 clearRemovedTabCredentials([{id:'scada-gateway',type:'tab',env:[{name,value:'',type:'cred'},{name:'BASKA',value:'x',type:'str'}]}],plain);
 assert.deepEqual(plain[0].credentials,{[name]:''});
 const again=buildGateway(validateConfig(c),'tok',4730,'.',{hostname:'ZS-A',secret:()=>({community:COMMUNITY})});
 clearRemovedTabCredentials([{id:'scada-gateway',type:'tab',env:[{name,value:'',type:'cred'}]}],again);
 assert.deepEqual(again[0].credentials,{[name]:COMMUNITY},'hala kullanilan anahtar korunur');
});

/** Node-RED function benzeri calistirici (flow/context/env/node bellekte). */
function runner(nodes:any[],id:string,envVals:Record<string,string>={}){
 const fn=new Function('msg','flow','context','env','node','Buffer',nodes.find(n=>n.id===id).func) as (...a:any[])=>any;
 const flowStore:Record<string,unknown>={},ctxStore:Record<string,unknown>={},status:any[]=[];
 const flow={get:(k:string)=>flowStore[k],set:(k:string,v:unknown)=>{flowStore[k]=v;}},context={get:(k:string)=>ctxStore[k],set:(k:string,v:unknown)=>{ctxStore[k]=v;}};
 const env={get:(k:string)=>envVals[k]},node={status:(s:any)=>status.push(s)};
 return {run:(msg:any)=>fn(msg,flow,context,env,node,Buffer),flowStore,status};
}
test('hazirlik: community env.get ile msg.communitye; OID parcalama; mesgulken yeni istek yok; community yoksa istek yok',()=>{
 const oids=Array.from({length:45},(_,i)=>'1.3.6.1.4.1.9.'+i);
 const tags=oids.map((o,i)=>tag('t'+i,o,'uint32'));
 const nodes=snmpDriver.buildNodes([conn()],[device()],tags,ctx);
 const name=snmpCommunityEnv(conn());
 const {run,flowStore}=runner(nodes,'scada-snmp-sn1-prep',{[name]:COMMUNITY});
 const clock=nodes.find(n=>n.type==='inject');
 const out=run({payload:JSON.parse(clock.payload),topic:'sd1'});
 assert.equal(out[0].length,3,'45 OID -> 20+20+5');
 assert.deepEqual(out[0].map((m:any)=>m.snmpOids.length),[SNMP_MAX_OIDS,SNMP_MAX_OIDS,5]);
 assert.equal(out[0][0].oid,oids.slice(0,20).join(','));assert.equal(out[0][0].community,COMMUNITY);assert.equal(out[0][0].snmpDevice,'sd1');
 assert.equal(run({payload:oids,topic:'sd1'}),null,'cevap gelmeden ikinci istek yok');
 (flowStore['snmp-busy-sn1-sd1'] as any).at-=10000;
 assert.ok(run({payload:oids,topic:'sd1'}),'pencere dolunca tekrar dener');
 const none=runner(nodes,'scada-snmp-sn1-prep',{});
 assert.equal(none.run({payload:oids,topic:'sd1'}),null);assert.equal(none.status[0].text,'community tanımlı değil');
});

test('donusum: varbind -> ornek; noSuchObject/eksik/hata bad; catch hatasi parcanin tum etiketleri bad; sira artar',()=>{
 const tags=[tag('t1','1.3.6.1.2.1.1.3.0','float32',{scale:0.01}),tag('t2','1.3.6.1.2.1.2.2.1.8.1','bool'),tag('t3','1.3.6.1.2.1.2.2.1.10.1','uint32'),tag('t4','1.3.6.1.4.1.1.1','float32'),tag('t5','1.3.6.1.4.1.1.2','float32')];
 const nodes=snmpDriver.buildNodes([conn()],[device()],tags,ctx);
 const {run,flowStore}=runner(nodes,'scada-snmp-sn1-convert');
 const oids=tags.map(t=>t.snmpOid!);
 flowStore['snmp-busy-sn1-sd1']={at:Date.now(),left:1};
 const r=run({snmpDevice:'sd1',snmpOids:oids,payload:[
  {oid:'1.3.6.1.2.1.1.3.0',type:67,value:123456},{oid:'1.3.6.1.2.1.2.2.1.8.1',type:2,value:1},{oid:'1.3.6.1.2.1.2.2.1.10.1',type:65,value:99},
  {oid:'1.3.6.1.4.1.1.1',type:128,value:null,_error:'NoSuchObject'}]});
 assert.equal(flowStore['snmp-busy-sn1-sd1'],null,'cevap mesgul bayragini kaldirir');
 const by=Object.fromEntries(r.payload.samples.map((s:any)=>[s.tagId,s]));
 assert.equal(by.t1.value,1234.56);assert.equal(by.t1.quality,'good');
 assert.equal(by.t2.value,true);assert.equal(by.t3.value,99);
 assert.deepEqual([by.t4.value,by.t4.quality],[null,'bad'],'noSuchObject');
 assert.deepEqual([by.t5.value,by.t5.quality],[null,'bad'],'cevapta olmayan OID');
 assert.equal(flowStore['fresh-t4'],0);assert.ok((flowStore['fresh-t1'] as number)>0);
 assert.equal(r.payload.source,'scada-snmp-sn1');assert.equal(r.payload.token,'tok');
 const err=run({snmpDevice:'sd1',snmpOids:oids,error:{message:'RequestTimedOutError: Request timed out'},payload:undefined});
 assert.ok(err.payload.samples.length===5&&err.payload.samples.every((s:any)=>s.quality==='bad'&&s.value===null),'zaman asimi sahte good uretmez');
 assert.ok(err.payload.sequence>r.payload.sequence);assert.equal(err.payload.session,r.payload.session);
 assert.equal(run({snmpDevice:'yok',snmpOids:oids,payload:[]}),null,'bilinmeyen cihaz');
 let state:SourceState|undefined;
 for(let i=0;i<50;i++){const m=run({snmpDevice:'sd1',snmpOids:oids.slice(0,1),payload:[{oid:'.1.3.6.1.2.1.1.3.0',type:67,value:i}]}).payload;const v=acceptSource(state,m,Date.now());assert.equal(v.ok,true);state=(v as any).next;}
});
