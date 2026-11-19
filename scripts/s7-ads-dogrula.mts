/**
 * S7 ve ADS yazma dallarını GERÇEK paketlerle (node-red-contrib-s7, node-red-contrib-ads-client)
 * yalıtılmış bir Node-RED'de doğrular; canlı sisteme ve gerçek PLC'ye dokunmaz (yalnız 127.0.0.1).
 * 1) S7: scripts/s7-sahte-plc.mts'teki sahte PLC (11102) — okuma, köprü üzerinden yazma (REAL ölçekli,
 *    INT, bit, BYTE), sahte bellekteki baytlar, geri okuma, erişim hatası (DB2 = PUT/GET kapalı /
 *    optimize DB gibi) 502, bağlantı kopukken yazma 502, sınır 400, tekrar 409.
 * 2) Erişilemeyen hedefler: S7 11103 (dinleyen yok), ADS 11104 (dinleyen yok), ADS 11105 (bağlantıyı
 *    kabul edip hiç yanıt vermeyen yerel kara delik). Bunlarda okuma olmadığından bekçinin tazelik
 *    şartı yazmayı 409 ile keserdi; dalın kendisini sınamak için akışa YALNIZ BU TESTTE etiketleri taze
 *    işaretleyen bir düğüm eklenir. Beklenen: zaman aşımı içinde temiz 502, asılı istek yok.
 * ADS için yerel simülatör yok (ads-client yalnız istemci; AMS/ADS sunucusu yazmak sembol/tip tablosu
 * gerektirir): ADS başarılı yazma yolu burada DOĞRULANMAZ.
 *   npx tsx scripts/s7-ads-dogrula.mts      (LOG=1: Node-RED logunu da yazdır)
 */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';
import bcrypt from 'bcryptjs';
import {validateConfig,type Config} from '../packages/contracts/model';
import {deployGateway} from '../apps/server/src/gateway';
import {startFakeS7} from './s7-sahte-plc.mts';

const S7_PORT=11102,S7_DEAD=11103,ADS_DEAD=11104,ADS_HOLE=11105,RED_PORT=1898,WS_PORT=15998;
const RED='http://127.0.0.1:'+RED_PORT;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'s7ads-dogrula-'));
const nrDir=path.join(root,'node-red'),dataDir=path.join(root,'data');
fs.mkdirSync(nrDir);fs.mkdirSync(dataDir);
const checks:[string,boolean][]=[];
const check=(name:string,ok:boolean)=>{checks.push([name,ok]);console.log(ok?'✔':'✘',name);};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>boolean|Promise<boolean>,timeout:number){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return true;await sleep(200);}return false;}

// --- Sahte S7 + kara delik ---------------------------------------------------------
const fake=await startFakeS7(S7_PORT,{failWriteDb:2});
const db1=Buffer.alloc(256);db1.writeFloatBE(12.5,4);db1.writeInt16BE(7,8);fake.memory.set('DB1',db1);
const holeSockets=new Set<net.Socket>();
const hole=net.createServer(s=>{holeSockets.add(s);s.on('error',()=>{});s.on('close',()=>holeSockets.delete(s));});
await new Promise<void>(r=>hole.listen(ADS_HOLE,'127.0.0.1',()=>r()));

// --- Gecici WebSocket ----------------------------------------------------------------
const samples:any[]=[];
const wss=new WebSocketServer({host:'127.0.0.1',port:WS_PORT,path:'/internal/gateway'});
wss.on('connection',ws=>ws.on('message',b=>{try{const m=JSON.parse(String(b));if(Array.isArray(m.samples))for(const s of m.samples)samples.push(s);}catch{/* */}}));
const last=(id:string)=>[...samples].reverse().find(s=>s.tagId===id);

// --- Yapilandirma ----------------------------------------------------------------------
const tag=(id:string,deviceId:string,dataType:string,over:Record<string,unknown>)=>({id,deviceId,code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'readwrite',scale:1,offset:0,min:-1000,max:1000,unit:'',description:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,...over});
const dev=(id:string,connectionId:string)=>({id,connectionId,code:id.toUpperCase(),name:id,slaveId:1,enabled:true,pollMs:500,staleMs:4000,description:''});
const s7=(id:string,port:number)=>({id,name:'S7 '+id,host:'127.0.0.1',port,timeout:2000,protocol:'s7',rack:0,slot:1});
const ads=(id:string,port:number)=>({id,name:'ADS '+id,host:'127.0.0.1',port,timeout:2000,protocol:'ads',amsNetId:'127.0.0.1.1.1',localAmsNetId:'127.0.0.1.1.20',adsPort:851});
const config:Config=validateConfig({revision:1,name:'S7/ADS dogrula',
 connections:[s7('plc',S7_PORT),s7('s7yok',S7_DEAD),ads('adsyok',ADS_DEAD),ads('adsdelik',ADS_HOLE)],
 devices:[dev('d1','plc'),dev('d2','s7yok'),dev('d3','adsyok'),dev('d4','adsdelik')],
 tags:[
  tag('s-sp','d1','float32',{s7Address:'DB1,REAL4',scale:0.1,offset:5}),
  tag('s-int','d1','int16',{s7Address:'DB1,INT8'}),
  tag('s-bit','d1','bool',{s7Address:'M0.1',min:0,max:1}),
  tag('s-byte','d1','uint16',{s7Address:'MB3',min:0,max:1000}),
  tag('s-kilit','d1','int16',{s7Address:'DB2,INT0'}),
  tag('s-oku','d1','int32',{s7Address:'DB1,DINT12',access:'read'}),
  tag('s-yok','d2','int16',{s7Address:'DB1,INT0'}),
  tag('a-yok','d3','float32',{adsSymbol:'GVL.fSetpoint'}),
  tag('a-delik','d4','int16',{adsSymbol:'MAIN.nMod'}),
 ],commands:[]});
const nrAdmin={username:'scada',password:randomUUID()};
fs.writeFileSync(path.join(dataDir,'nodered-admin.json'),JSON.stringify(nrAdmin));

// --- Yalitilmis Node-RED -----------------------------------------------------------------
fs.writeFileSync(path.join(nrDir,'flows.json'),'[]');
fs.writeFileSync(path.join(nrDir,'settings.js'),`module.exports={uiHost:'127.0.0.1',uiPort:${RED_PORT},flowFile:'flows.json',credentialSecret:${JSON.stringify(randomUUID())},
 adminAuth:{type:'credentials',users:[{username:${JSON.stringify(nrAdmin.username)},password:${JSON.stringify(bcrypt.hashSync(nrAdmin.password,10))},permissions:'*'}]},logging:{console:{level:'info'}}};`);
const red=spawn(process.execPath,['node_modules/node-red/red.js','--userDir',nrDir,'--settings',path.join(nrDir,'settings.js'),'-p',String(RED_PORT)],{stdio:['ignore','pipe','pipe']});
let log='';red.stdout.on('data',d=>{log+=d;});red.stderr.on('data',d=>{log+=d;});
let exitCode=1;
try{
 if(!await until(async()=>{try{return (await fetch(RED+'/auth/login')).ok;}catch{return false;}},60000))throw Error('Node-RED açılmadı');
 await deployGateway(config,'tok',WS_PORT,dataDir,RED);
 // Yalniz erisilemeyen hedeflerin etiketlerini taze isaretleyen test dugumu (bkz. ust not).
 const tokenRes=await fetch(RED+'/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'node-red-admin',grant_type:'password',scope:'*',username:nrAdmin.username,password:nrAdmin.password})});
 const token=(await tokenRes.json() as any).access_token;
 const auth={Authorization:'Bearer '+token,'Node-RED-API-Version':'v2'};
 const current=await (await fetch(RED+'/flows',{headers:auth})).json() as any;
 const types=new Set(current.flows.map((n:any)=>n.type));
 check('akışta s7 out, complete, catch ve ads-client-write-value düğümleri var',['s7 out','complete','catch','ads-client-write-value'].every(t=>types.has(t)));
 current.flows.push({id:'test-fresh-clock',type:'inject',z:'scada-gateway',name:'TEST taze',props:[{p:'payload'}],repeat:'0.5',once:true,onceDelay:0.1,x:100,y:2000,wires:[['test-fresh']]},
  {id:'test-fresh',type:'function',z:'scada-gateway',name:'TEST taze işaretle',outputs:1,func:"for(const id of ['s-yok','a-yok','a-delik'])flow.set('fresh-'+id,Date.now());return null;",x:300,y:2000,wires:[[]]});
 const post=await fetch(RED+'/flows',{method:'POST',headers:{...auth,'Content-Type':'application/json','Node-RED-Deployment-Type':'full'},body:JSON.stringify({rev:current.rev,flows:current.flows})});
 if(!post.ok)throw Error('test düğümü eklenemedi: '+post.status);

 // --- Okuma ----------------------------------------------------------------------------
 await until(()=>['s-sp','s-int','s-bit','s-byte','s-oku'].every(id=>last(id)?.quality==='good'),45000);
 check('S7 okuma: REAL ölçekli 12.5*0.1+5=6.25 ('+last('s-sp')?.value+'), INT 7 ('+last('s-int')?.value+')',last('s-sp')?.value===6.25&&last('s-int')?.value===7);
 const missingTypes=/Waiting for missing types|Unknown type|missing types/i.test(log);
 check('Node-RED bilinmeyen/eksik düğüm tipi bildirmedi',!missingTypes);

 // --- Yazma: kopru HTTP ucu --------------------------------------------------------------
 let n=0;
 async function write(tagId:string,value:unknown,commandId='dogrula-'+(++n)){
  const t0=Date.now();
  const r=await fetch(RED+'/scada-bridge/command',{method:'POST',headers:{'Content-Type':'application/json','x-scada-token':'tok'},body:JSON.stringify({tagId,value,commandId,expiresAt:Date.now()+4500,revision:config.revision}),signal:AbortSignal.timeout(9000)}).catch(e=>({status:0,json:async()=>({error:String(e)})}) as any);
  return {status:r.status as number,body:await r.json().catch(()=>null) as any,ms:Date.now()-t0};
 }
 const w1=await write('s-sp',25);
 check('S7 REAL ölçekli yazma 200 ve sahte PLC DB1.DBD4 = 200.0 ('+w1.status+', '+db1.readFloatBE(4)+', '+w1.ms+' ms)',w1.status===200&&w1.body?.ack===true&&db1.readFloatBE(4)===200);
 const w2=await write('s-int',-12);
 check('S7 INT yazma 200 ve DB1.DBW8 = -12 ('+w2.status+', '+db1.readInt16BE(8)+')',w2.status===200&&db1.readInt16BE(8)===-12);
 const w3=await write('s-bit',true);
 const m=fake.memory.get('M')!;
 check('S7 bit yazma 200 ve M0.1 = 1, diğer bitler dokunulmadı ('+w3.status+', M0=0x'+m[0].toString(16)+')',w3.status===200&&m[0]===0x02);
 const w4=await write('s-byte',255);
 check('S7 BYTE yazma 200 ve MB3 = 255 ('+w4.status+', '+m[3]+')',w4.status===200&&m[3]===255);
 const since=Date.now();
 await until(()=>samples.some(s=>s.tagId==='s-sp'&&s.sampledAt>since&&s.value===25)&&samples.some(s=>s.tagId==='s-int'&&s.sampledAt>since&&s.value===-12),5000);
 check('S7 geri okuma: s-sp 25 ve s-int -12',samples.some(s=>s.tagId==='s-sp'&&s.sampledAt>since&&s.value===25)&&samples.some(s=>s.tagId==='s-int'&&s.sampledAt>since&&s.value===-12));
 const before=fake.writes.length;
 const big=await write('s-byte',256);
 check('S7 BYTE sınırı: 256 → 400 ('+big.status+' '+big.body?.error+')',big.status===400&&/BYTE/.test(big.body?.error||''));
 const range=await write('s-int',5000);
 check('sınır dışı → 400 ('+range.status+')',range.status===400);
 const ro=await write('s-oku',1);
 check('salt okunur etiket → 400 ('+ro.status+' '+ro.body?.error+')',ro.status===400);
 const dup=await write('s-int',3,'dogrula-2');
 check('tekrar eden commandId → 409 ('+dup.status+')',dup.status===409);
 check('reddedilen yazmalar PLC\'ye ulaşmadı',fake.writes.length===before);
 const lock=await write('s-kilit',5);
 check('S7 erişim hatası (DB2, PUT/GET kapalı/optimize DB gibi) → 502 ('+lock.status+' '+lock.body?.error+', '+lock.ms+' ms)',lock.status===502&&/S7 yazma hatası/.test(lock.body?.error||''));
 fake.dropClients();await sleep(50);
 const drop=await write('s-int',4);
 check('S7 bağlantı koptuktan hemen sonra yazma → temiz 502, PLC\'ye yazılmadı ('+drop.status+' '+drop.body?.error+', '+drop.ms+' ms)',drop.status===502&&drop.ms<5500&&db1.readInt16BE(8)===-12);

 // --- Erisilemeyen hedefler ------------------------------------------------------------
 const s7dead=await write('s-yok',1);
 check('S7 erişilemeyen PLC (bağlantı reddi) → 502, '+s7dead.ms+' ms ('+s7dead.body?.error+')',s7dead.status===502&&s7dead.ms<5500);
 const adsDead=await write('a-yok',1.5);
 check('ADS erişilemeyen router (bağlantı reddi) → 502, '+adsDead.ms+' ms ('+adsDead.body?.error+')',adsDead.status===502&&adsDead.ms<5500);
 const adsHole=await write('a-delik',2);
 check('ADS yanıt vermeyen hedef → asılı kalmadan 502, '+adsHole.ms+' ms ('+adsHole.body?.error+')',adsHole.status===502&&adsHole.ms<6000);
 const adsBad=await write('a-delik',1.5);
 check('ADS INT etikete kesirli değer → 400 ('+adsBad.status+')',adsBad.status===400);
 await sleep(1000);
 check('Node-RED çalışmaya devam ediyor',red.exitCode===null&&(await fetch(RED+'/auth/login')).ok);
 exitCode=checks.some(c=>!c[1])?1:0;
}catch(e){console.log('✘ hata:',(e as Error).message);exitCode=1;}
finally{
 red.kill();wss.close();await fake.close();for(const s of holeSockets)s.destroy();hole.close();
 if(exitCode||process.env.LOG)console.log('\n--- Node-RED log ---\n'+log.slice(-6000));
 await sleep(500);
 fs.rmSync(root,{recursive:true,force:true});
}
console.log(checks.filter(c=>c[1]).length+'/'+checks.length+' denetim geçti');
process.exit(exitCode);
