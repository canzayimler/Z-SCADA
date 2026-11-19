/**
 * HTTP/REST, SNMP ve SQL Server sürücülerini uçtan uca doğrular; canlı sisteme, gerçek cihaza, gerçek veritabanına
 * ve ağdaki hiçbir sunucuya dokunmaz (yalnız 127.0.0.1 ve yedek portlar).
 * 1) 127.0.0.1:18080'de basic/bearer korumalı yerel bir JSON sunucusu (+ yönlendirme hedefi olarak 18081'de
 *    kimlik yakalayıcı), 127.0.0.1:11161/udp'de net-snmp ajanı (v2c community + v3 authPriv kullanıcı) açar.
 *    SQL Server yok: 127.0.0.1:14330 kapalı port (bağlantı reddi) ve 14331'de bağlantıyı kabul edip hiç cevap
 *    vermeyen kara delik dinleyici kullanılır.
 * 2) Yalıtılmış bir Node-RED (1898, geçici userDir, adminAuth + credentialSecret) başlatır ve akışı sunucunun
 *    GERÇEK deployGateway'iyle uygular. Örnekler 15998'deki geçici WebSocket'e gelir; her mesaj sunucunun ingest
 *    kurallarından (acceptSource / acceptSampledAt) geçirilir.
 * 3) Denetler: doğru kimlikte good, yanlış kimlikte hiç good yok, 500/zaman aşımı/yönlendirme bad, SNMP v2c ve v3
 *    good, yanlış community bad, noSuchObject bad, SQL düğümleri bilinmeyen tip hatası olmadan yüklenir ve erişilemeyen
 *    sunucuda sahte good yok / asılı kalmaz; sırların GET /flows, yedek, flows.json/userDir düz metni ve Node-RED
 *    logunda olmaması; SNMP bağlantısı kaldırılınca community'nin şifreli flows_cred.json'dan da silinmesi.
 *   npx tsx scripts/http-snmp-sql-dogrula.mts      (LOG=1: Node-RED logunu da yazdır)
 */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';
import bcrypt from 'bcryptjs';
import {validateConfig,type Config} from '../packages/contracts/model';
import {deployGateway} from '../apps/server/src/gateway';
import {snmpCommunityEnv} from '../packages/drivers/driver';
import {CONNECTION_SECRETS_FILE} from '../apps/server/src/connectionSecrets';
import {acceptSource,acceptSampledAt,type SourceState} from '../apps/server/src/ingest';

const require=createRequire(import.meta.url);
const snmp=require(require.resolve('net-snmp',{paths:[path.resolve('node_modules/node-red-node-snmp')]}));
const HTTP_PORT=18080,TRAP_PORT=18081,SNMP_PORT=11161,SQL_CLOSED=14330,SQL_HOLE=14331,RED_PORT=1898,WS_PORT=15998;
const BASIC_USER='zscada',BASIC_PASS='Dogrula-Http-Parola-4410',WRONG_PASS='Yanlis-Http-Parola-7781',TOKEN='Dogrula-Bearer-Token-9q2Lx';
const COMMUNITY='Dogrula-Comm-6620',WRONG_COMMUNITY='Yanlis-Comm-1187',V3_USER='zscada3',V3_AUTH='Dogrula-V3-Auth-3381',V3_PRIV='Dogrula-V3-Priv-5517',SQL_PASS='Dogrula-Sql-Parola-2204';
const SECRETS=[BASIC_PASS,WRONG_PASS,TOKEN,COMMUNITY,WRONG_COMMUNITY,V3_AUTH,V3_PRIV,SQL_PASS];
const RED='http://127.0.0.1:'+RED_PORT;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'hss-dogrula-'));
const nrDir=path.join(root,'node-red'),dataDir=path.join(root,'data');
fs.mkdirSync(nrDir);fs.mkdirSync(dataDir);
const checks:[string,boolean][]=[];
const check=(name:string,ok:boolean)=>{checks.push([name,ok]);console.log(ok?'✔':'✘',name);};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>boolean|Promise<boolean>,timeout:number){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return true;await sleep(200);}return false;}

// --- Yerel HTTP sunucusu --------------------------------------------------------------------
let tick=0;const httpHits:Record<string,number>={};const trapped:string[]=[];
const basicOk='Basic '+Buffer.from(BASIC_USER+':'+BASIC_PASS).toString('base64');
const api=http.createServer((req,res)=>{
 const url=req.url||'',auth=req.headers.authorization||'';httpHits[url]=(httpHits[url]||0)+1;
 if(url==='/api/basic/olcum'){
  if(auth!==basicOk){res.writeHead(401,{'WWW-Authenticate':'Basic'});res.end('{"error":"yetkisiz"}');return;}
  tick++;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:{temp:20+tick*0.5,at:new Date(Date.now()-2000).toISOString()},on:tick%2?'on':'off',metin:'abc'}));return;
 }
 if(url==='/api/bearer/durum'){if(auth!=='Bearer '+TOKEN){res.writeHead(401);res.end('yetkisiz');return;}res.writeHead(200,{'Content-Type':'text/plain'});res.end('23.5');return;}
 if(url==='/api/basic/hata'){res.writeHead(500,{'Content-Type':'application/json'});res.end('{"data":{"temp":99}}');return;}
 if(url==='/api/basic/yavas'){/* hic cevap yok: istek zaman asimina dusmeli */return;}
 if(url==='/api/basic/yonlen'){res.writeHead(302,{Location:'http://127.0.0.1:'+TRAP_PORT+'/yakala'});res.end();return;}
 res.writeHead(404);res.end();
});
const trap=http.createServer((req,res)=>{trapped.push(String(req.headers.authorization||'(kimliksiz)'));res.writeHead(200);res.end('{"data":{"temp":1}}');});
await new Promise<void>(r=>api.listen(HTTP_PORT,'127.0.0.1',()=>r()));
await new Promise<void>(r=>trap.listen(TRAP_PORT,'127.0.0.1',()=>r()));
const sqlHoleSockets=new Set<net.Socket>();
const sqlHole=net.createServer(s=>{sqlHoleSockets.add(s);s.on('error',()=>{});s.on('close',()=>sqlHoleSockets.delete(s));});
await new Promise<void>(r=>sqlHole.listen(SQL_HOLE,'127.0.0.1',()=>r()));
console.log('http: 127.0.0.1:'+HTTP_PORT+' · tuzak: '+TRAP_PORT+' · sql kara delik: '+SQL_HOLE);

// --- Yerel SNMP ajani (v2c community + v3 authPriv) -------------------------------------------
let snmpRequests=0,agentErrors=0;
const agent=snmp.createAgent({port:SNMP_PORT,address:'127.0.0.1',disableAuthorization:false},(err:any)=>{if(err)agentErrors++;else snmpRequests++;});
const auth=agent.getAuthorizer();
auth.addCommunity(COMMUNITY);
auth.addUser({name:V3_USER,level:snmp.SecurityLevel.authPriv,authProtocol:snmp.AuthProtocols.sha256,authKey:V3_AUTH,privProtocol:snmp.PrivProtocols.aes,privKey:V3_PRIV});
const mib=agent.getMib();
const scalar=(name:string,oid:string,type:number,value:unknown)=>{mib.registerProvider({name,type:snmp.MibProviderType.Scalar,oid,scalarType:type,maxAccess:snmp.MaxAccess['read-only']});mib.setScalarValue(name,value);};
scalar('sicaklik','1.3.6.1.4.1.99999.1.1',snmp.ObjectType.Integer,215);
scalar('sayac64','1.3.6.1.4.1.99999.1.2',snmp.ObjectType.Counter64,Buffer.from([0,0,0,0x01,0x00,0x00,0x00,0x05]));
scalar('metinsayi','1.3.6.1.4.1.99999.1.3',snmp.ObjectType.OctetString,'23.5');
scalar('metin','1.3.6.1.4.1.99999.1.4',snmp.ObjectType.OctetString,'Pano-1');
scalar('durum','1.3.6.1.4.1.99999.1.5',snmp.ObjectType.Integer,1);
let snmpTick=0;const snmpTimer=setInterval(()=>{snmpTick++;mib.setScalarValue('sicaklik',215+snmpTick);},500);
console.log('snmp ajanı: udp 127.0.0.1:'+SNMP_PORT);

// --- Gecici WebSocket + ingest kurallari --------------------------------------------------------
const samples:any[]=[],messages:any[]=[];let rejects=0;
const sources=new Map<string,SourceState>();
const wss=new WebSocketServer({host:'127.0.0.1',port:WS_PORT,path:'/internal/gateway'});
wss.on('connection',ws=>ws.on('message',b=>{try{
 const m=JSON.parse(String(b));if(!Array.isArray(m.samples))return;
 const now=Date.now();messages.push({source:m.source,session:m.session,sequence:m.sequence,at:now});
 const v=acceptSource(sources.get(m.source),m,now);if(!v.ok){rejects++;return;}sources.set(m.source,v.next);
 for(const s of m.samples){if(!acceptSampledAt(s.sampledAt,now)){rejects++;continue;}samples.push({...s,source:m.source,receivedAt:now});}
}catch{/* */}}));
const last=(id:string)=>[...samples].reverse().find(s=>s.tagId===id);
const of=(id:string)=>samples.filter(s=>s.tagId===id);

// --- Yapilandirma + sirlar ---------------------------------------------------------------------
const tag=(id:string,deviceId:string,dataType:string,over:Record<string,unknown>)=>({id,deviceId,code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'read',scale:1,offset:0,min:-1e12,max:1e12,unit:'',description:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,...over});
const dev=(id:string,connectionId:string,pollMs=1000)=>({id,connectionId,code:id.toUpperCase(),name:id,slaveId:1,enabled:true,pollMs,staleMs:Math.max(5000,pollMs*2),description:''});
const BASE='http://127.0.0.1:'+HTTP_PORT+'/api';
const httpConn=(id:string,httpAuth:string)=>({id,name:'HTTP '+id,protocol:'http',host:'localhost',port:80,timeout:1500,httpBaseUrl:BASE,httpAuth});
const snmpConn=(id:string,extra:object={})=>({id,name:'SNMP '+id,protocol:'snmp',host:'127.0.0.1',port:SNMP_PORT,timeout:1000,snmpVersion:'2c',...extra});
const sqlConn=(id:string,port:number)=>({id,name:'SQL '+id,protocol:'sql',sqlDialect:'mssql',host:'127.0.0.1',port,timeout:2000,sqlDatabase:'MES',sqlEncrypt:false});
const Q='SELECT TOP 1 Sicaklik FROM dbo.Olcum ORDER BY Zaman DESC';
const fullConfig=(withSnmp=true):Config=>validateConfig({revision:1,name:'HTTP/SNMP/SQL dogrula',
 connections:[httpConn('hb','basic'),httpConn('ht','bearer'),httpConn('hw','basic'),
  ...(withSnmp?[snmpConn('s2'),snmpConn('sw'),snmpConn('s3',{snmpVersion:'3',snmpSecurityLevel:'authPriv',snmpAuthProtocol:'SHA256',snmpPrivProtocol:'AES'})]:[]),
  sqlConn('qr',SQL_CLOSED),sqlConn('qh',SQL_HOLE)],
 devices:[dev('dhb','hb'),dev('dht','ht'),dev('dhw','hw'),...(withSnmp?[dev('ds2','s2'),dev('dsw','sw'),dev('ds3','s3')]:[]),dev('dqr','qr',2000),dev('dqh','qh',2000)],
 tags:[
  tag('h-temp','dhb','float32',{httpPath:'/basic/olcum',httpJsonPath:'data.temp',scale:2,offset:1}),
  tag('h-ts','dhb','float32',{httpPath:'/basic/olcum',httpJsonPath:'data.temp',httpTimestampPath:'data.at'}),
  tag('h-on','dhb','bool',{httpPath:'/basic/olcum',httpJsonPath:'on'}),
  tag('h-metin','dhb','float32',{httpPath:'/basic/olcum',httpJsonPath:'metin'}),
  tag('h-500','dhb','float32',{httpPath:'/basic/hata',httpJsonPath:'data.temp'}),
  tag('h-yavas','dhb','float32',{httpPath:'/basic/yavas'}),
  tag('h-yonlen','dhb','float32',{httpPath:'/basic/yonlen',httpJsonPath:'data.temp'}),
  tag('h-bearer','dht','float32',{httpPath:'/bearer/durum'}),
  tag('h-wrong','dhw','float32',{httpPath:'/basic/olcum',httpJsonPath:'data.temp'}),
  ...(withSnmp?[
   tag('s-int','ds2','float32',{snmpOid:'1.3.6.1.4.1.99999.1.1.0',scale:0.1}),
   tag('s-c64','ds2','float32',{snmpOid:'.1.3.6.1.4.1.99999.1.2.0'}),
   tag('s-str','ds2','float32',{snmpOid:'1.3.6.1.4.1.99999.1.3.0'}),
   tag('s-txt','ds2','float32',{snmpOid:'1.3.6.1.4.1.99999.1.4.0'}),
   tag('s-bool','ds2','bool',{snmpOid:'1.3.6.1.4.1.99999.1.5.0'}),
   tag('s-yok','ds2','float32',{snmpOid:'1.3.6.1.4.1.99999.9.9.0'}),
   tag('s-wrong','dsw','float32',{snmpOid:'1.3.6.1.4.1.99999.1.1.0'}),
   tag('s-v3','ds3','float32',{snmpOid:'1.3.6.1.4.1.99999.1.1.0'})]:[]),
  tag('q-red','dqr','float32',{sqlQuery:Q,sqlColumn:'Sicaklik'}),
  tag('q-hole','dqh','float32',{sqlQuery:Q,sqlColumn:'Sicaklik'}),
 ],commands:[]});
fs.writeFileSync(path.join(dataDir,CONNECTION_SECRETS_FILE),JSON.stringify({
 hb:{username:BASIC_USER,password:BASIC_PASS},ht:{token:TOKEN},hw:{username:BASIC_USER,password:WRONG_PASS},
 s2:{community:COMMUNITY},sw:{community:WRONG_COMMUNITY},s3:{username:V3_USER,authKey:V3_AUTH,privKey:V3_PRIV},
 qr:{username:'zscada_ro',password:SQL_PASS},qh:{username:'zscada_ro',password:SQL_PASS}}));
const nrAdmin={username:'scada',password:randomUUID()};
fs.writeFileSync(path.join(dataDir,'nodered-admin.json'),JSON.stringify(nrAdmin));
const credentialSecret=randomUUID();
/** flows_cred.json cozucu (Node-RED: aes-256-ctr, anahtar sha256(credentialSecret), ilk 32 hex IV). */
function readCreds():Record<string,any>{
 const raw=JSON.parse(fs.readFileSync(path.join(nrDir,'flows_cred.json'),'utf8')).$ as string;
 const key=crypto.createHash('sha256').update(credentialSecret).digest();
 const d=crypto.createDecipheriv('aes-256-ctr',key,Buffer.from(raw.slice(0,32),'hex'));
 return JSON.parse(d.update(raw.slice(32),'base64','utf8')+d.final('utf8'));
}

// --- Yalitilmis Node-RED ---------------------------------------------------------------------------
fs.writeFileSync(path.join(nrDir,'flows.json'),'[]');
fs.writeFileSync(path.join(nrDir,'settings.js'),`module.exports={uiHost:'127.0.0.1',uiPort:${RED_PORT},flowFile:'flows.json',credentialSecret:${JSON.stringify(credentialSecret)},
 adminAuth:{type:'credentials',users:[{username:${JSON.stringify(nrAdmin.username)},password:${JSON.stringify(bcrypt.hashSync(nrAdmin.password,10))},permissions:'*'}]},logging:{console:{level:'info'}}};`);
const red=spawn(process.execPath,['node_modules/node-red/red.js','--userDir',nrDir,'--settings',path.join(nrDir,'settings.js'),'-p',String(RED_PORT)],{stdio:['ignore','pipe','pipe']});
let log='';red.stdout.on('data',d=>{log+=d;});red.stderr.on('data',d=>{log+=d;});
let exitCode=1;
const leaks=(text:string)=>SECRETS.filter(s=>text.includes(s));
try{
 if(!await until(async()=>{try{return (await fetch(RED+'/auth/login')).ok;}catch{return false;}},60000))throw Error('Node-RED açılmadı');
 const d1=await deployGateway(fullConfig(),'tok',WS_PORT,dataDir,RED);
 console.log('deployGateway 1:',d1.diff.added.length,'düğüm eklendi');
 await sleep(1500);
 check('Node-RED: bilinmeyen/eksik düğüm tipi yok (snmp, MSSQL, MSSQL-CN, http request yüklendi)',!/missing types|Waiting for missing|Unknown type|unknown type/i.test(log));

 // --- HTTP -------------------------------------------------------------------------------------
 await until(()=>of('h-temp').length>=4&&!!last('h-bearer')&&!!last('h-500')&&!!last('h-yavas')&&!!last('h-yonlen'),25000);
 const ht=last('h-temp'),hts=last('h-ts');
 check('HTTP basic: JSON yolu + ölçek (x*2+1) good: '+ht?.value,ht?.quality==='good'&&typeof ht.value==='number'&&(ht.value-1)/2>20);
 check('HTTP: yükteki zaman damgası (alıştan ~2 sn önce: '+(hts?hts.receivedAt-hts.sampledAt:'?')+' ms)',!!hts&&hts.receivedAt-hts.sampledAt>=1500&&hts.receivedAt-hts.sampledAt<4500);
 const ons=of('h-on');
 check('HTTP: on/off → true/false good',ons.some(s=>s.value===true)&&ons.some(s=>s.value===false)&&ons.every(s=>s.quality==='good'));
 check('HTTP: çevrilemeyen metin → bad',of('h-metin').length>0&&of('h-metin').every(s=>s.quality==='bad'&&s.value===null));
 check('HTTP bearer: düz metin "23.5" good',last('h-bearer')?.value===23.5&&last('h-bearer')?.quality==='good');
 check('HTTP 500 (gövdede değer olsa da) → yalnız bad',of('h-500').length>0&&of('h-500').every(s=>s.quality==='bad'&&s.value===null));
 check('HTTP zaman aşımı → yalnız bad ('+of('h-yavas').length+' örnek)',of('h-yavas').length>0&&of('h-yavas').every(s=>s.quality==='bad'));
 check('HTTP 302 izlenmedi → bad; kimlik başka sunucuya gitmedi (tuzak isteği: '+trapped.length+')',of('h-yonlen').every(s=>s.quality==='bad')&&trapped.length===0);
 check('HTTP yanlış parola: hiç good yok ('+of('h-wrong').length+' örnek, hepsi bad)',of('h-wrong').length>0&&of('h-wrong').every(s=>s.quality==='bad'));
 const yavasHits=httpHits['/api/basic/yavas']||0,olcumHits=httpHits['/api/basic/olcum']||0;
 check('HTTP bekçi: yavaş yola eşzamanlı istek birikmedi (yavaş '+yavasHits+' / hızlı '+olcumHits+' istek)',yavasHits<olcumHits);

 // --- SNMP -------------------------------------------------------------------------------------
 await until(()=>of('s-int').length>=3&&!!last('s-v3')&&!!last('s-wrong'),25000);
 const si=last('s-int');
 check('SNMP v2c (community sekme cred env üzerinden): Integer × 0.1 good: '+si?.value,si?.quality==='good'&&typeof si.value==='number'&&si.value>21.5);
 check('SNMP Counter64 (2^32+5) good: '+last('s-c64')?.value,last('s-c64')?.value===4294967301&&last('s-c64')?.quality==='good');
 check('SNMP OctetString "23.5" → 23.5 good',last('s-str')?.value===23.5&&last('s-str')?.quality==='good');
 check('SNMP OctetString metin → bad',of('s-txt').length>0&&of('s-txt').every(s=>s.quality==='bad'));
 check('SNMP Integer 1 → bool true good',last('s-bool')?.value===true&&last('s-bool')?.quality==='good');
 check('SNMP noSuchObject → bad',of('s-yok').length>0&&of('s-yok').every(s=>s.quality==='bad'&&s.value===null));
 check('SNMP v3 authPriv (SHA256/AES) good: '+last('s-v3')?.value,last('s-v3')?.quality==='good'&&typeof last('s-v3').value==='number');
 check('SNMP yanlış community: hiç good yok ('+of('s-wrong').length+' örnek, hepsi bad)',of('s-wrong').length>0&&of('s-wrong').every(s=>s.quality==='bad'));

 // --- SQL (sunucu yok) ---------------------------------------------------------------------------
 await until(()=>!!last('q-red')&&!!last('q-hole'),20000);
 check('SQL bağlantı reddi → yalnız bad ('+of('q-red').length+')',of('q-red').length>0&&of('q-red').every(s=>s.quality==='bad'&&s.value===null));
 check('SQL cevapsız sunucu → zaman aşımıyla bad, asılı kalmadı ('+of('q-hole').length+')',of('q-hole').length>0&&of('q-hole').every(s=>s.quality==='bad'));
 const holeFirst=of('q-hole')[0]?.receivedAt??0;
 await until(()=>of('q-hole').some(s=>s.receivedAt>holeFirst+1000),15000);
 check('SQL cevapsız sunucuda yoklama sürüyor (bekçi kilitlenmedi)',of('q-hole').some(s=>s.receivedAt>holeFirst+1000));

 // --- Sira + ingest -------------------------------------------------------------------------------
 const bySource=new Map<string,any[]>();for(const m of messages)(bySource.get(m.source)??bySource.set(m.source,[]).get(m.source)!).push(m);
 const mono=[...bySource.values()].every(l=>l.every((m,k)=>k===0||(m.session===l[k-1].session&&m.sequence>l[k-1].sequence)));
 check('sıra: '+bySource.size+' kaynak, tek session, kesin artan sequence',bySource.size>=7&&mono);
 check('ingest kuralları: reddedilen mesaj/örnek yok ('+rejects+')',rejects===0);

 // --- Sizinti denetimi ----------------------------------------------------------------------------
 const d2=await deployGateway(fullConfig(),'tok',WS_PORT,dataDir,RED);
 console.log('deployGateway 2: değişen',d2.diff.changed.length);
 const tokenRes=await fetch(RED+'/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'node-red-admin',grant_type:'password',scope:'*',username:nrAdmin.username,password:nrAdmin.password})});
 const token=(await tokenRes.json() as any).access_token;
 const flowsText=await (await fetch(RED+'/flows',{headers:{Authorization:'Bearer '+token,'Node-RED-API-Version':'v2'}})).text();
 check('GET /flows sır döndürmüyor (community, token, parolalar, v3 anahtarları)',!leaks(flowsText).length&&flowsText.includes(snmpCommunityEnv({id:'s2'} as any)));
 const flowsJson=fs.readFileSync(path.join(nrDir,'flows.json'),'utf8');
 const tab=JSON.parse(flowsJson).find((n:any)=>n.id==='scada-gateway');
 check('flows.json: sekmede yalnız cred tipli boş env girdisi',Array.isArray(tab?.env)&&tab.env.every((e:any)=>e.type==='cred'&&e.value===''));
 const backups=fs.readdirSync(path.join(dataDir,'backups'));
 check('yedek dosyalarında sır yok ('+backups.length+' yedek)',backups.length>=2&&backups.every(f=>!leaks(fs.readFileSync(path.join(dataDir,'backups',f),'utf8')).length));
 const walk=(d:string):string[]=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='node_modules'?[]:walk(path.join(d,e.name))):[path.join(d,e.name)]);
 const plainFiles=walk(nrDir).filter(f=>leaks(fs.readFileSync(f,'latin1')).length);
 check('Node-RED userDir dosyalarında düz metin sır yok'+(plainFiles.length?': '+plainFiles.map(f=>path.relative(nrDir,f)).join(', '):''),!plainFiles.length);
 const creds=readCreds(),cname=snmpCommunityEnv({id:'s2'} as any);
 check('flows_cred.json (şifreli) community sekme kimliğinde',creds['scada-gateway']?.[cname]===COMMUNITY);
 // SNMP baglantilari kaldirilinca community sifreli dosyadan da silinir.
 await deployGateway({...fullConfig(false),revision:2},'tok',WS_PORT,dataDir,RED);
 await sleep(1000);
 const creds3=readCreds();
 check('SNMP kaldırılınca community flows_cred.json\'dan silindi',!JSON.stringify(creds3).includes(COMMUNITY)&&!JSON.stringify(creds3).includes(WRONG_COMMUNITY)&&!JSON.stringify(creds3).includes(V3_AUTH));
 const after=Date.now();
 check('üçüncü deploy sonrası HTTP okuma sürüyor',await until(()=>samples.some(s=>s.tagId==='h-temp'&&s.receivedAt>after+300&&s.quality==='good'),10000));
 await sleep(500);
 check('Node-RED logunda sır yok',!leaks(log).length);
 const sqlLine=log.split('\n').find(l=>/MSSQL|ECONNREFUSED|ETIMEOUT|Failed to connect/i.test(l));
 console.log('· SQL log örneği:',sqlLine?sqlLine.trim().slice(0,220):'(yok)');
 console.log('· SNMP ajanı: işlenen istek',snmpRequests,'· reddedilen (yanlış community)',agentErrors);
 exitCode=checks.some(c=>!c[1])?1:0;
}catch(e){console.log('✘ hata:',(e as Error).message);exitCode=1;}
finally{
 red.kill();wss.close();clearInterval(snmpTimer);
 try{agent.close();}catch{/* */}
 api.closeAllConnections();api.close();trap.close();for(const s of sqlHoleSockets)s.destroy();sqlHole.close();
 if(exitCode||process.env.LOG){console.log('\n--- Node-RED log (sırlar maskeli) ---\n'+SECRETS.reduce((t,s)=>t.replaceAll(s,'***'),log).slice(-8000));}
 await sleep(500);
 fs.rmSync(root,{recursive:true,force:true});
}
console.log(checks.filter(c=>c[1]).length+'/'+checks.length+' denetim geçti');
process.exit(exitCode);
