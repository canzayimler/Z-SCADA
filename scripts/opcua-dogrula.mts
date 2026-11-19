/**
 * OPC UA sürücüsünü GERÇEK paketle uçtan uca doğrular; canlı sisteme dokunmaz (yalnız yalıtılmış portlar).
 * 1) Yerelde iki node-opcua test sunucusu açar:
 *    - 4841 anonim: Sicaklik (Double), Calisiyor (Boolean), Sayac (Int32) — salt okuma.
 *    - 4842 yalnız kullanıcı/parola: Setpoint (Float), Mod (Int16), Olcekli (Int16), Bayrak (Boolean)
 *      yazılabilir; Kilitli (Float) sunucuda salt okunur.
 * 2) Yalıtılmış bir Node-RED (1899, geçici userDir, adminAuth + credentialSecret) başlatır ve akışı
 *    sunucunun GERÇEK deployGateway'iyle uygular (yedek, manifest, kimlik bilgisi yolu dahil).
 *    Örnekler 15999'daki geçici bir WebSocket'e ('scada-ws') gelir.
 * 3) Denetler: anonim okuma; doğru parolayla okuma; yanlış parolanın temiz başarısızlığı (veri yok,
 *    yazma 409); köprü HTTP ucu /scada-bridge/command üzerinden yazma gidiş-dönüşü (sunucudaki değer +
 *    geri okuma); salt okunur değişkene yazmanın 502 ile reddi; sınır dışı 400; tekrar 409;
 *    parolanın yedekte, GET /flows'ta, userDir dosyalarında ve Node-RED logunda olmaması.
 * 4) Erişilemeyen parolalı endpoint'te paketin "Case B" uyarısı parolayı maskeli yazar (patch-package yaması).
 *   npx tsx scripts/opcua-dogrula.mts      (LOG=1: Node-RED logunu da yazdır)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';
import bcrypt from 'bcryptjs';
import {OPCUAServer,Variant,DataType,StatusCodes} from 'node-opcua';
import {validateConfig,type Config} from '../packages/contracts/model';
import {deployGateway} from '../apps/server/src/gateway';
import {CONNECTION_SECRETS_FILE} from '../apps/server/src/connectionSecrets';

const ANON_PORT=4841,AUTH_PORT=4842,DEAD_PORT=4849,RED_PORT=1899,WS_PORT=15999;
const USER='operator',PASS='Dogrula-Opc-Parola-7731',WRONG='Yanlis-Parola-4410',DEAD_PASS='Ulasilamaz-Parola-9902';
const RED='http://127.0.0.1:'+RED_PORT;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'opcua-dogrula-'));
const nrDir=path.join(root,'node-red'),dataDir=path.join(root,'data');
fs.mkdirSync(nrDir);fs.mkdirSync(dataDir);
const checks:[string,boolean][]=[];
const check=(name:string,ok:boolean)=>{checks.push([name,ok]);console.log(ok?'✔':'✘',name);};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>boolean|Promise<boolean>,timeout:number){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return true;await sleep(250);}return false;}

// --- OPC UA test sunuculari -------------------------------------------------------
let sicaklik=21.5,sayac=7;
const anon=new OPCUAServer({port:ANON_PORT,resourcePath:'/UA/Test',alternateHostname:['127.0.0.1'],buildInfo:{productName:'ZScadaTest'}});
await anon.initialize();
{const ns=anon.engine.addressSpace!.getOwnNamespace();
 const dev=ns.addObject({organizedBy:anon.engine.addressSpace!.rootFolder.objects,browseName:'Hat'});
 ns.addVariable({componentOf:dev,browseName:'Sicaklik',nodeId:'s=Sicaklik',dataType:'Double',minimumSamplingInterval:100,value:{get:()=>new Variant({dataType:DataType.Double,value:sicaklik})}});
 ns.addVariable({componentOf:dev,browseName:'Calisiyor',nodeId:'s=Calisiyor',dataType:'Boolean',minimumSamplingInterval:100,value:{get:()=>new Variant({dataType:DataType.Boolean,value:true})}});
 ns.addVariable({componentOf:dev,browseName:'Sayac',nodeId:'s=Sayac',dataType:'Int32',minimumSamplingInterval:100,value:{get:()=>new Variant({dataType:DataType.Int32,value:sayac})}});}
await anon.start();
const store:Record<string,number|boolean>={Setpoint:10,Mod:1,Olcekli:50,Bayrak:false,Kilitli:3.5};
const types:Record<string,DataType>={Setpoint:DataType.Float,Mod:DataType.Int16,Olcekli:DataType.Int16,Bayrak:DataType.Boolean,Kilitli:DataType.Float};
let serverWrites=0;
const auth=new OPCUAServer({port:AUTH_PORT,resourcePath:'/UA/Auth',alternateHostname:['127.0.0.1'],buildInfo:{productName:'ZScadaAuthTest'},allowAnonymous:false,
 userManager:{isValidUser:(u:string,p:string)=>u===USER&&p===PASS}});
await auth.initialize();
{const ns=auth.engine.addressSpace!.getOwnNamespace();
 const dev=ns.addObject({organizedBy:auth.engine.addressSpace!.rootFolder.objects,browseName:'Pano'});
 for(const name of Object.keys(store)){
  const writable=name!=='Kilitli';
  ns.addVariable({componentOf:dev,browseName:name,nodeId:'s='+name,dataType:DataType[types[name]] as string,minimumSamplingInterval:100,
   accessLevel:writable?'CurrentRead | CurrentWrite':'CurrentRead',userAccessLevel:writable?'CurrentRead | CurrentWrite':'CurrentRead',
   value:{get:()=>new Variant({dataType:types[name],value:store[name]}),
    ...(writable?{set:(v:Variant)=>{if(v.dataType!==types[name])return StatusCodes.BadTypeMismatch;store[name]=v.value;serverWrites++;return StatusCodes.Good;}}:{})}});
 }}
await auth.start();
const tick=setInterval(()=>{sicaklik+=0.5;sayac++;},700);
console.log('OPC UA test sunuculari:',anon.getEndpointUrl(),'|',auth.getEndpointUrl());

// --- Gecici WebSocket (sunucunun /internal/gateway ucu yerine) ----------------------
const samples:any[]=[];
const wss=new WebSocketServer({host:'127.0.0.1',port:WS_PORT,path:'/internal/gateway'});
wss.on('connection',ws=>ws.on('message',b=>{try{const m=JSON.parse(String(b));if(Array.isArray(m.samples))for(const s of m.samples)samples.push({...s,source:m.source});}catch{/* */}}));
const last=(id:string)=>[...samples].reverse().find(s=>s.tagId===id);

// --- Yapilandirma + sirlar -----------------------------------------------------------
const tag=(id:string,deviceId:string,code:string,dataType:string,nodeId:string,over:Record<string,unknown>={})=>({id,deviceId,code,name:code,area:'holding-register',address:0,dataType,access:'read',scale:1,offset:0,min:-1e6,max:1e6,unit:'',description:'',wordOrder:'big',byteOrder:'big',bit:null,verifyTolerance:null,history:false,historyDeadband:0,historyMaxGapMs:60000,nodeId,...over});
const dev=(id:string,connectionId:string)=>({id,connectionId,code:id.toUpperCase(),name:id,slaveId:1,enabled:true,pollMs:1000,staleMs:5000,description:''});
const conn=(id:string,port:number,res:string)=>({id,name:'OPC '+id,host:'127.0.0.1',port,timeout:3000,protocol:'opc-ua',endpoint:`opc.tcp://127.0.0.1:${port}/UA/${res}`,securityMode:'none'});
const config:Config=validateConfig({revision:1,name:'OPC UA dogrula',
 connections:[conn('anon',ANON_PORT,'Test'),conn('auth',AUTH_PORT,'Auth'),conn('wrong',AUTH_PORT,'Auth'),conn('dead',DEAD_PORT,'Yok')],
 devices:[dev('d1','anon'),dev('d2','auth'),dev('d3','wrong'),dev('d4','dead')],
 tags:[
  tag('t-sic','d1','SIC','float32','ns=1;s=Sicaklik',{scale:2,offset:1}),
  tag('t-cal','d1','CAL','bool','ns=1;s=Calisiyor'),
  tag('t-say','d1','SAY','int32','ns=1;s=Sayac'),
  tag('t-yok','d1','YOK','int32','ns=1;s=Olmayan'),
  tag('t-sp','d2','SP','float32','ns=1;s=Setpoint',{access:'readwrite',min:0,max:100}),
  tag('t-mod','d2','MOD','int16','ns=1;s=Mod',{access:'readwrite',min:-100,max:100}),
  tag('t-olc','d2','OLC','int16','ns=1;s=Olcekli',{access:'readwrite',scale:0.1,min:0,max:100}),
  tag('t-bay','d2','BAY','bool','ns=1;s=Bayrak',{access:'readwrite'}),
  tag('t-kil','d2','KIL','float32','ns=1;s=Kilitli',{access:'readwrite',min:0,max:100}),
  tag('t-yp','d3','YP','int16','ns=1;s=Mod',{access:'readwrite',min:-100,max:100}),
  tag('t-dead','d4','DEAD','int16','ns=1;s=Mod'),
 ],commands:[]});
fs.writeFileSync(path.join(dataDir,CONNECTION_SECRETS_FILE),JSON.stringify({auth:{username:USER,password:PASS},wrong:{username:USER,password:WRONG},dead:{username:USER,password:DEAD_PASS}}));
const nrAdmin={username:'scada',password:randomUUID()};
fs.writeFileSync(path.join(dataDir,'nodered-admin.json'),JSON.stringify(nrAdmin));

// --- Yalitilmis Node-RED -------------------------------------------------------------
fs.writeFileSync(path.join(nrDir,'flows.json'),'[]');
fs.writeFileSync(path.join(nrDir,'settings.js'),`module.exports={uiHost:'127.0.0.1',uiPort:${RED_PORT},flowFile:'flows.json',credentialSecret:${JSON.stringify(randomUUID())},
 adminAuth:{type:'credentials',users:[{username:${JSON.stringify(nrAdmin.username)},password:${JSON.stringify(bcrypt.hashSync(nrAdmin.password,10))},permissions:'*'}]},logging:{console:{level:'info'}}};`);
const red=spawn(process.execPath,['node_modules/node-red/red.js','--userDir',nrDir,'--settings',path.join(nrDir,'settings.js'),'-p',String(RED_PORT)],{stdio:['ignore','pipe','pipe']});
let log='';red.stdout.on('data',d=>{log+=d;});red.stderr.on('data',d=>{log+=d;});
let exitCode=1;
try{
 if(!await until(async()=>{try{return (await fetch(RED+'/auth/login')).ok;}catch{return false;}},60000))throw Error('Node-RED açılmadı');
 const d1=await deployGateway(config,'tok',WS_PORT,dataDir,RED);
 console.log('deployGateway 1:',d1.diff.added.length,'düğüm eklendi');

 // --- Okuma ------------------------------------------------------------------------
 // Palet yuklemesi (node-opcua) ~20 sn surebilir.
 await until(()=>['t-sic','t-cal','t-say','t-sp','t-mod','t-olc','t-bay'].every(id=>last(id)?.quality==='good')&&samples.filter(s=>s.tagId==='t-sic').length>=4,90000);
 const sic=last('t-sic'),cal=last('t-cal'),say=last('t-say'),yok=last('t-yok');
 const sicValues=samples.filter(s=>s.tagId==='t-sic').map(s=>s.value);
 check('anonim: Sicaklik good + ölçekli (x*2+1): '+JSON.stringify(sic?.value),sic?.quality==='good'&&typeof sic?.value==='number'&&(sic.value-1)/2>=21.5);
 check('anonim: Sicaklik değişiyor: '+sicValues.slice(-4).join(', '),new Set(sicValues).size>=3);
 check('anonim: Calisiyor bool true',cal?.quality==='good'&&cal?.value===true);
 check('anonim: Sayac int '+say?.value,say?.quality==='good'&&Number.isInteger(say?.value)&&say.value>=7);
 check('anonim: olmayan node bad',yok?.quality==='bad'&&yok?.value===null);
 check('parola: doğru kullanıcı/parolayla okuma good (Setpoint='+last('t-sp')?.value+', Mod='+last('t-mod')?.value+', Olcekli='+last('t-olc')?.value+')',
  last('t-sp')?.quality==='good'&&last('t-sp')?.value===10&&last('t-mod')?.value===1&&last('t-olc')?.value===5&&last('t-bay')?.value===false);
 check('yanlış parola: hiç good örnek yok ('+samples.filter(s=>s.tagId==='t-yp').length+' örnek)',!samples.some(s=>s.tagId==='t-yp'&&s.quality==='good'));

 // --- Yazma: kopru HTTP ucu -------------------------------------------------------------
 let n=0;
 async function write(tagId:string,value:unknown,commandId='dogrula-'+(++n)){
  const r=await fetch(RED+'/scada-bridge/command',{method:'POST',headers:{'Content-Type':'application/json','x-scada-token':'tok'},body:JSON.stringify({tagId,value,commandId,expiresAt:Date.now()+4000,revision:config.revision}),signal:AbortSignal.timeout(8000)});
  return {status:r.status,body:await r.json().catch(()=>null) as any};
 }
 // Yazma istemcisinin oturumu ayri acilir: 503 (hazir degil) gecene kadar bekle.
 let first:any;await until(async()=>{first=await write('t-sp',42.5);return first.status!==503;},30000);
 check('yazma Float: 200 ack '+JSON.stringify(first),first.status===200&&first.body?.ack===true);
 check('yazma Float: sunucudaki değer 42.5 ('+store.Setpoint+')',store.Setpoint===42.5);
 const w2=await write('t-mod',-7);
 check('yazma Int16: 200 ve sunucu -7 ('+w2.status+', '+store.Mod+')',w2.status===200&&store.Mod===-7);
 const w3=await write('t-olc',12.3);
 check('yazma ölçekli Int16 (0.1): ham 123 ('+w3.status+', '+store.Olcekli+')',w3.status===200&&store.Olcekli===123);
 const w4=await write('t-bay',true);
 check('yazma Boolean: 200 ve sunucu true ('+w4.status+', '+store.Bayrak+')',w4.status===200&&store.Bayrak===true);
 const since=Date.now();
 await until(()=>samples.some(s=>s.tagId==='t-sp'&&s.sampledAt>since&&s.value===42.5)&&samples.some(s=>s.tagId==='t-olc'&&s.sampledAt>since&&s.value===12.3),8000);
 check('geri okuma: Setpoint 42.5 ve Olcekli 12.3 okundu',samples.some(s=>s.tagId==='t-sp'&&s.sampledAt>since&&s.value===42.5)&&samples.some(s=>s.tagId==='t-olc'&&s.sampledAt>since&&s.value===12.3));
 const before=serverWrites;
 const ro=await write('t-kil',9);
 check('salt okunur değişken: 502 + OPC UA hata kodu ('+ro.status+' '+ro.body?.error+')',ro.status===502&&/OPC UA yazma (reddedildi|hatası)/.test(ro.body?.error||'')&&store.Kilitli===3.5);
 const range=await write('t-mod',500);
 check('sınır dışı: 400 ('+range.status+' '+range.body?.error+')',range.status===400);
 const dup=await write('t-mod',3,'dogrula-1');
 check('tekrar eden commandId: 409 ('+dup.status+')',dup.status===409);
 const wrongW=await write('t-yp',5);
 check('yanlış parola bağlantısına yazma temiz reddedilir ('+wrongW.status+' '+wrongW.body?.error+')',wrongW.status===409);
 check('reddedilen yazmalar sunucuya ulaşmadı',serverWrites===before);

 // --- Ikinci deploy: yedek dosyasi az onceki (parolali) akisi icerir ----------------------
 const d2=await deployGateway(config,'tok',WS_PORT,dataDir,RED);
 console.log('deployGateway 2: değişen',d2.diff.changed.length);
 const backups=fs.readdirSync(path.join(dataDir,'backups')).sort();
 const backup2=fs.readFileSync(path.join(dataDir,'backups',backups.at(-1)!),'utf8');
 check('yedek: önceki akış parolalı endpoint\'i içeriyor',backup2.includes('scada-opcua-auth-endpoint-auth'));
 const secrets=[PASS,WRONG,DEAD_PASS];
 const leaks=(text:string)=>secrets.filter(s=>text.includes(s));
 check('yedek dosyalarında parola yok',backups.every(f=>!leaks(fs.readFileSync(path.join(dataDir,'backups',f),'utf8')).length));
 const tokenRes=await fetch(RED+'/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'node-red-admin',grant_type:'password',scope:'*',username:nrAdmin.username,password:nrAdmin.password})});
 const token=(await tokenRes.json() as any).access_token;
 const flowsText=await (await fetch(RED+'/flows',{headers:{Authorization:'Bearer '+token,'Node-RED-API-Version':'v2'}})).text();
 check('GET /flows parola döndürmüyor',!leaks(flowsText).length&&flowsText.includes('"login":true'));
 const walk=(d:string):string[]=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='node_modules'?[]:walk(path.join(d,e.name))):[path.join(d,e.name)]);
 const plainFiles=walk(nrDir).filter(f=>leaks(fs.readFileSync(f,'latin1')).length);
 check('Node-RED userDir dosyalarında düz metin parola yok'+(plainFiles.length?': '+plainFiles.map(f=>path.relative(nrDir,f)).join(', '):''),!plainFiles.length);
 await sleep(1500);
 check('Node-RED logunda doğru/yanlış parola yok',!log.includes(PASS)&&!log.includes(WRONG));
 // Erisilemeyen parolali endpoint paketin "Case B" uyarisini tetikler; yamasiz 0.2.355 burada parolayi yaziyordu
 // (patches/node-red-contrib-opcua+0.2.355.patch). Uyari gorulmeden denetim anlamsiz: once onu bekle.
 const caseB=await until(()=>/Case B:/.test(log),20000);
 const caseBLine=log.split('\n').find(l=>l.includes('Case B:'))||'';
 check('erişilemeyen parolalı endpoint: "Case B" uyarısı görüldü ve parola maskeli ('+(caseB?'*** '+(caseBLine.includes('password: ***')?'var':'YOK'):'uyarı yok')+')',caseB&&caseBLine.includes('password: ***'));
 check('Node-RED logunda erişilemeyen bağlantının parolası yok',!log.includes(DEAD_PASS));
 const wrongLine=log.split('\n').find(l=>/OPC wrong|BadUserAccessDenied|BadIdentityToken/i.test(l));
 console.log('· yanlış parola log satırı:',wrongLine?wrongLine.replaceAll(WRONG,'***').slice(0,220):'(bulunamadı)');
 exitCode=checks.some(c=>!c[1])?1:0;
}catch(e){console.log('✘ hata:',(e as Error).message);exitCode=1;}
finally{
 red.kill();clearInterval(tick);wss.close();
 await anon.shutdown(300);await auth.shutdown(300);
 if(exitCode||process.env.LOG){console.log('\n--- Node-RED log (parolalar maskeli) ---\n'+[PASS,WRONG,DEAD_PASS].reduce((t,s)=>t.replaceAll(s,'***'),log).slice(-6000));}
 await sleep(500);
 fs.rmSync(root,{recursive:true,force:true});
}
console.log(checks.filter(c=>c[1]).length+'/'+checks.length+' denetim geçti');
process.exit(exitCode);
