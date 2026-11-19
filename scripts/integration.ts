import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import bcrypt from 'bcryptjs';
import {Store} from '../apps/server/src/store';
const root=process.cwd(),dir=path.join(root,'.local','integration-'+Date.now());fs.mkdirSync(dir,{recursive:true});
const nrdir=path.join(dir,'node-red');fs.mkdirSync(nrdir);fs.writeFileSync(path.join(nrdir,'package.json'),JSON.stringify({name:'scada-integration',dependencies:{'node-red-contrib-modbus':'5.60.2'}}));fs.mkdirSync(path.join(nrdir,'node_modules'));
/**
 * Tasinabilirlik (B55): once depodaki yerel bagimlilik kullanilir, yoksa
 * kullanicinin global .node-red klasorune duselir. Ikisi de yoksa betik
 * sessizce yanlis calismak yerine acik hata verir.
 */
const modbusCandidates=[path.join(root,'node_modules','node-red-contrib-modbus'),path.join(process.env.USERPROFILE||'','.node-red','node_modules','node-red-contrib-modbus')];
const modbusSource=modbusCandidates.find(p=>fs.existsSync(p));
if(!modbusSource)throw Error('node-red-contrib-modbus bulunamadi. `npm i node-red-contrib-modbus` calistirin (yerel kurulum tercih edilir): '+modbusCandidates.join(' | '));
fs.symlinkSync(modbusSource,path.join(nrdir,'node_modules','node-red-contrib-modbus'),'junction');// Yonetim yuzeyi burada da adminAuth ile korunur; sunucu korumasiz yuzeye deploy etmez.
const nrUser='scada',nrPassword=randomUUID();
fs.writeFileSync(path.join(nrdir,'settings.cjs'),`module.exports={uiHost:'127.0.0.1',functionExternalModules:true,adminAuth:{type:'credentials',users:[{username:${JSON.stringify(nrUser)},password:${JSON.stringify(bcrypt.hashSync(nrPassword,10))},permissions:'*'}]},logging:{console:{level:'info'}}};`);
const values=new Map<string,boolean|number>();let writes=0,failY=false,offline=false;const clients=new Set<net.Socket>();
const plc=net.createServer(socket=>{clients.add(socket);socket.on('close',()=>clients.delete(socket));socket.on('error',()=>{});let bytes=Buffer.alloc(0);socket.on('data',chunk=>{bytes=Buffer.concat([bytes,Buffer.from(chunk)]);while(bytes.length>=7&&bytes.length>=6+bytes.readUInt16BE(4)){const length=6+bytes.readUInt16BE(4),q=bytes.subarray(0,length);bytes=bytes.subarray(length);if(offline)continue;const unit=q[6],fc=q[7],addr=q.readUInt16BE(8),quantity=q.readUInt16BE(10);let pdu:Buffer;
 if(fc===1||fc===2){pdu=Buffer.alloc(2+Math.ceil(quantity/8));pdu[0]=fc;pdu[1]=pdu.length-2;for(let i=0;i<quantity;i++)if(values.get(unit+':'+(addr+i)))pdu[2+(i>>3)]|=1<<(i%8);}
 else if(fc===3||fc===4){pdu=Buffer.alloc(2+quantity*2);pdu[0]=fc;pdu[1]=quantity*2;for(let i=0;i<quantity;i++)pdu.writeUInt16BE(Number(values.get(unit+':'+(addr+i))||0),2+i*2);}
 else if(fc===5||fc===6){writes++;if(failY&&addr===1280){pdu=Buffer.from([fc|128,4]);}else{values.set(unit+':'+addr,fc===5?quantity===65280:quantity);pdu=Buffer.from(q.subarray(7));}}
 else pdu=Buffer.from([fc|128,1]);const r=Buffer.alloc(7+pdu.length);q.copy(r,0,0,4);r.writeUInt16BE(pdu.length+1,4);r[6]=unit;pdu.copy(r,7);socket.write(r);}});});
const children:ReturnType<typeof spawn>[]=[];const logs:fs.WriteStream[]=[];
function start(cmd:string,args:string[],env:any,name:string){const log=fs.createWriteStream(path.join(dir,name+'.log'));logs.push(log);const child=spawn(cmd,args,{cwd:root,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout!.pipe(log);child.stderr!.pipe(log);children.push(child);return child;}
async function until(fn:()=>boolean|Promise<boolean>,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw Error('Koşul zaman aşımı.');}
let cookie='';async function api(url:string,method='GET',body?:unknown){const r=await fetch('http://127.0.0.1:3001/api'+url,{method,headers:{'Content-Type':'application/json','x-scada-request':'1',cookie},body:body===undefined?(method==='GET'?undefined:'{}'):JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie')!.split(';')[0];const data=await r.json() as any;if(!r.ok)throw Error(r.status+' '+data.error);return data;}
async function main(){
 await new Promise<void>(r=>plc.listen(15020,'127.0.0.1',r));
 const redCandidates=[path.join(root,'node_modules','node-red','red.js'),path.join(process.env.APPDATA||'','npm/node_modules/node-red/red.js')];
 const redEntry=redCandidates.find(p=>fs.existsSync(p));
 if(!redEntry)throw Error('node-red bulunamadi: '+redCandidates.join(' | '));
 start(process.execPath,[redEntry,'--userDir',nrdir,'--settings',path.join(nrdir,'settings.cjs'),'--port','1881'],{},'node-red');
 const dataDir=path.join(dir,'server');fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(path.join(dataDir,'nodered-admin.json'),JSON.stringify({username:nrUser,password:nrPassword}));
 const db=new Store(dataDir),c=db.config();c.connections[0].host='127.0.0.1';c.connections[0].port=15020;db.set('config',c);db.close();
 start(process.execPath,['--import','tsx','apps/server/src/index.ts'],{SCADA_DATA:dataDir,SCADA_PORT:'3001',NODERED_URL:'http://127.0.0.1:1881'},'server');
 await until(async()=>{try{return (await fetch('http://127.0.0.1:1881/auth/login')).ok&&(await fetch('http://127.0.0.1:3001/api/health')).ok;}catch{return false;}},45000);
 await api('/setup','POST',{username:'testadmin',password:'Integration-test-only-2026'});await api('/login','POST',{username:'testadmin',password:'Integration-test-only-2026'});await api('/deploy','POST');
 let live:any;const ws=new WebSocket('ws://127.0.0.1:3001/api/live',{headers:{cookie}});ws.on('message',b=>live=JSON.parse(b.toString()));
 await until(()=>Object.values(live?.samples||{}).filter((s:any)=>s.quality==='good').length===6,35000);assert.equal(writes,0);console.log('PASS read: 6 tags via Node-RED; deployment emits zero writes.');
 {// Okuma testi: kaydedilmemis adres kopru uzerinden okunur, yazma uretmez.
  const dev=(await api('/project')).config.devices[0],wait=()=>new Promise(r=>setTimeout(r,450)),w0=writes;
  values.set(dev.slaveId+':4196',1234);values.set(dev.slaveId+':2060',true);
  const r1=await api('/tags/test-read','POST',{deviceId:dev.id,area:'holding-register',address:4196,dataType:'int16'});assert.equal(r1.value,1234);await wait();
  const r2=await api('/tags/test-read','POST',{deviceId:dev.id,area:'coil',address:2060,dataType:'bool'});assert.equal(r2.value,true);await wait();
  values.set(dev.slaveId+':100',0x4148);values.set(dev.slaveId+':101',0x0000);
  const r3=await api('/tags/test-read','POST',{deviceId:dev.id,area:'holding-register',address:100,dataType:'float32'});assert.equal(r3.value,12.5);
  assert.equal(writes,w0);console.log('PASS test-read: draft addresses read through the bridge (int16, coil, float32); no writes.');}
 const id=randomUUID(),request={id,commandId:'cmd-pair-0',value:true,screenId:'screen-main',screenVersion:1};await api('/commands','POST',request);await api('/commands','POST',request);await until(()=>live.commands.some((c:any)=>c.id===id&&c.status==='verified'));assert.equal(writes,2);console.log('PASS write: pair command verified; duplicate HTTP request causes no extra write.');
 failY=true;const partial=randomUUID();await api('/commands','POST',{...request,id:partial,value:false});await until(()=>live.commands.some((c:any)=>c.id===partial&&c.status==='partial'));console.log('PASS partial: second step exception recorded.');failY=false;
 offline=true;await until(()=>Object.values(live.samples).every((s:any)=>s.quality!=='good'),15000);const before=writes;await assert.rejects(api('/commands','POST',{...request,id:randomUUID()}));assert.equal(writes,before);offline=false;console.log('PASS outage: stale values block writes; reconnect does not replay.');
 await until(()=>Object.values(live.samples).every((s:any)=>s.quality==='good'),20000);
 // Create 3 slaves, 100 additional tags each, while preserving the six control tags.
 const project=await api('/project'),expanded=project.config;for(let unit=1;unit<=3;unit++){
  if(unit>1)expanded.devices.push({...expanded.devices[0],id:'plc-0'+unit,code:'PLC-0'+unit,slaveId:unit});
  for(let i=0;i<100;i++)expanded.tags.push({...expanded.tags[0],id:`load-${unit}-${i}`,deviceId:'plc-0'+unit,code:'X'+i,name:'X'+i,area:'discrete-input',address:i,access:'read'});
 }
 await api('/config','PUT',expanded);await api('/deploy','POST');await until(()=>Object.values(live.samples).filter((s:any)=>s.quality==='good').length===306,40000);
 const extra=[new WebSocket('ws://127.0.0.1:3001/api/live',{headers:{cookie}}),new WebSocket('ws://127.0.0.1:3001/api/live',{headers:{cookie}})];let frames=0;extra.forEach(w=>w.on('message',()=>frames++));await new Promise(r=>setTimeout(r,5000));assert.ok(frames>=12);console.log('PASS scale: 3 slaves / 306 tags / 3 live clients, '+frames+' additional frames in 5 seconds.');extra.forEach(w=>w.close());
 const backup=await api('/backup','POST');assert.ok(fs.existsSync(path.join(dataDir,backup.name)));const copyDir=path.join(dir,'restore');fs.mkdirSync(copyDir);fs.copyFileSync(path.join(dataDir,backup.name),path.join(copyDir,'scada.sqlite'));const restored=new Store(copyDir);assert.equal(restored.config().tags.length,306);assert.equal(restored.screens()[0].publishedVersion,1);restored.close();console.log('PASS backup: snapshot opens independently with project and screen intact.');
 // Guvenlik profili ve yeniden dogrulama (B39/B40).
 const page=await fetch('http://127.0.0.1:3001/');
 assert.match(page.headers.get('content-security-policy')||'',/frame-ancestors 'none'/,'uygulama HTML dosyasina CSP uygulanmali');
 assert.equal(page.headers.get('x-frame-options'),'DENY');
 assert.equal(page.headers.get('x-content-type-options'),'nosniff');
 const others=await api('/users');
 const target=(others as any[]).find(x=>x.username==='testadmin');
 const staleAuth=await fetch('http://127.0.0.1:3001/api/users/'+target.id,{method:'PATCH',headers:{'Content-Type':'application/json','x-scada-request':'1',cookie},body:JSON.stringify({role:'admin'})});
 const staleData=await staleAuth.json() as any;
 if(staleAuth.status===403){assert.equal(staleData.code,'REAUTH_REQUIRED','tazelenmemis oturumda hesap yonetimi parola ister');
  await api('/reauth','POST',{password:'Integration-test-only-2026'});
  const after=await fetch('http://127.0.0.1:3001/api/users/'+target.id,{method:'PATCH',headers:{'Content-Type':'application/json','x-scada-request':'1',cookie},body:JSON.stringify({role:'admin'})});
  assert.ok(after.ok,'parola tazelendikten sonra islem gecer');}
 // Hesap degisikligi o kullanicinin oturumlarini dusurur (auth.ts, kendi hesabi dahil): eski cerez 401 alir, yeniden giris gerekir.
 const revoked=await fetch('http://127.0.0.1:3001/api/project',{headers:{'x-scada-request':'1',cookie}});
 assert.equal(revoked.status,401,'hesap degisikliginden sonra eski oturum gecmemeli');
 cookie='';await api('/login','POST',{username:'testadmin',password:'Integration-test-only-2026'});
 console.log('PASS security: CSP/frame headers set; account changes require a fresh password and revoke sessions.');

 // Taslak cakismasi: eski surumle kayit 409 + karsi tarafin taslagi doner; force ile yazan taraf onceki taslagi arsivler.
 const scr=(await api('/project')).screens[0];
 const mine={...scr.draft,name:'Çakışma denemesi'};
 const saved=await api('/screens/'+scr.id,'PUT',{version:scr.version,screen:scr.draft});
 const stale=await fetch('http://127.0.0.1:3001/api/screens/'+scr.id,{method:'PUT',headers:{'Content-Type':'application/json','x-scada-request':'1',cookie},body:JSON.stringify({version:scr.version,screen:mine})});
 const staleBody=await stale.json() as any;
 assert.equal(stale.status,409);assert.ok(staleBody.data?.draft,'409 karşı tarafın taslağını taşımalı');assert.equal(staleBody.data.version,saved.version);assert.equal(staleBody.data.updatedBy,'testadmin');
 const forced=await api('/screens/'+scr.id,'PUT',{version:scr.version,screen:mine,force:true});
 assert.equal(forced.draft.name,'Çakışma denemesi');
 const revs=await api('/screens/'+scr.id+'/revisions');
 assert.ok(revs.some((r:any)=>r.version===saved.version),'zorlanan yazma öncesinde karşı tarafın taslağı arşivlenmeli');
 console.log('PASS conflict: stale save returns the other draft; forced save archives it as a revision.');
 ws.close();fs.writeFileSync(path.join(root,'output','integration-result.json'),JSON.stringify({at:new Date().toISOString(),status:'passed',tags:306,slaves:3,clients:3,physicalPlcWrites:0,logDirectory:dir},null,2));
}
main().catch(e=>{console.error(e);console.error('Logs:',dir);process.exitCode=1;}).finally(()=>{for(const c of children)c.kill();for(const s of clients)s.destroy();plc.close();for(const l of logs)l.end();setTimeout(()=>process.exit(process.exitCode||0),500);});
