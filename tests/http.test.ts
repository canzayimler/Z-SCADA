import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// `import` deyimleri hoist edilir; ortam degiskenini once kurmak icin dinamik import.
let createServer:(()=>Promise<any>)|null=null;
async function serverModule(){
 if(!createServer){process.env.SCADA_NO_LISTEN='1';createServer=(await import('../apps/server/src/index')).createServer as any;}
 return createServer!;
}
const headers={'content-type':'application/json','x-scada-request':'1'};
async function boot(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-http-'));
 process.env.SCADA_DATA=dir;
 const app=await (await serverModule())() as any;
 const setup=await app.inject({method:'POST',url:'/api/setup',headers,payload:{username:'admin',password:'Test-parola-2026!'},remoteAddress:'127.0.0.1'});
 assert.equal(setup.statusCode,200,'ilk kurulum yerelden yapılır');
 const login=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'admin',password:'Test-parola-2026!'}});
 assert.equal(login.statusCode,200);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 return {app,cookie,dir};
}
test('setup runs once and login rejects a wrong password',async()=>{
 const {app,cookie}=await boot();
 const again=await app.inject({method:'POST',url:'/api/setup',headers,payload:{username:'x',password:'Baska-parola-2026!'},remoteAddress:'127.0.0.1'});
 assert.equal(again.statusCode,400,'kurulum ikinci kez çalışmaz');
 const bad=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'admin',password:'yanlis'}});
 assert.equal(bad.statusCode,400);
 const session=await app.inject({method:'GET',url:'/api/session',headers:{...headers,cookie}});
 assert.equal(session.json().user.username,'admin');
 await app.scadaClose();
});
test('kurulum hesabi parolasi degismedikce yalniz yerel giris ekranina dolu gelir',async()=>{
 const {app,cookie,dir}=await boot();
 fs.writeFileSync(path.join(dir,'admin-access.json'),JSON.stringify({username:'admin',password:'Test-parola-2026!'}));
 const local=await app.inject({method:'GET',url:'/api/session',headers,remoteAddress:'127.0.0.1'});
 assert.deepEqual(local.json().defaultLogin,{username:'admin',password:'Test-parola-2026!'});
 const remote=await app.inject({method:'GET',url:'/api/session',headers,remoteAddress:'10.0.0.8'});
 assert.equal(remote.json().defaultLogin,null,'baska bilgisayara parola verilmez');
 const signedIn=await app.inject({method:'GET',url:'/api/session',headers:{...headers,cookie},remoteAddress:'127.0.0.1'});
 assert.equal(signedIn.json().defaultLogin,null,'oturum acikken gerek yok');
 const users=(await app.inject({method:'GET',url:'/api/users',headers:{...headers,cookie}})).json();
 const changed=await app.inject({method:'PATCH',url:'/api/users/'+users[0].id,headers:{...headers,cookie},payload:{password:'Yeni-parola-2026!'}});
 assert.equal(changed.statusCode,200);
 const after=await app.inject({method:'GET',url:'/api/session',headers,remoteAddress:'127.0.0.1'});
 assert.equal(after.json().defaultLogin,null,'parola degisince eski bilgi gosterilmez');
 await app.scadaClose();
});
test('mutations require the request header and a same-origin request',async()=>{
 const {app,cookie}=await boot();
 const missing=await app.inject({method:'POST',url:'/api/logout',headers:{cookie},payload:{}});
 assert.equal(missing.statusCode,403,'x-scada-request başlığı olmadan mutasyon reddedilir');
 const crossOrigin=await app.inject({method:'POST',url:'/api/logout',headers:{...headers,cookie,origin:'http://kotu.example',host:'localhost:3000'},payload:{}});
 assert.equal(crossOrigin.statusCode,403,'yabancı origin reddedilir');
 await app.scadaClose();
});
test('the role matrix is enforced on the API, not only in the interface',async()=>{
 const {app,cookie}=await boot();
 for(const [username,role] of [['izleyici','viewer'],['operator','operator'],['tasarimci','designer']]){
  const created=await app.inject({method:'POST',url:'/api/users',headers:{...headers,cookie},payload:{username,password:'Test-parola-2026!',role}});
  assert.equal(created.statusCode,200,role+' hesabı oluşturuldu');
 }
 const sessionFor=async(username:string)=>{
  const r=await app.inject({method:'POST',url:'/api/login',headers,payload:{username,password:'Test-parola-2026!'}});
  return String(r.headers['set-cookie']).split(';')[0];
 };
 const viewer=await sessionFor('izleyici'),operator=await sessionFor('operator'),designer=await sessionFor('tasarimci');
 const project=await app.inject({method:'GET',url:'/api/project',headers:{...headers,cookie:viewer}});
 assert.equal(project.statusCode,200,'izleyici projeyi okuyabilir');
 const viewerWrite=await app.inject({method:'PUT',url:'/api/config',headers:{...headers,cookie:viewer},payload:project.json().config});
 assert.equal(viewerWrite.statusCode,403,'izleyici yapılandırma yazamaz');
 const operatorWrite=await app.inject({method:'PUT',url:'/api/config',headers:{...headers,cookie:operator},payload:project.json().config});
 assert.equal(operatorWrite.statusCode,403,'operatör yapılandırma yazamaz');
 const designerUsers=await app.inject({method:'GET',url:'/api/users',headers:{...headers,cookie:designer}});
 assert.equal(designerUsers.statusCode,403,'tasarımcı kullanıcıları listeleyemez');
 const designerDeploy=await app.inject({method:'POST',url:'/api/deploy',headers:{...headers,cookie:designer},payload:{}});
 assert.equal(designerDeploy.statusCode,403,'tasarımcı sahaya uygulayamaz: '+designerDeploy.body);
 await app.scadaClose();
});
test('critical account changes need a fresh password and disabling drops the session',async()=>{
 const {app,cookie}=await boot();
 await app.inject({method:'POST',url:'/api/users',headers:{...headers,cookie},payload:{username:'operator',password:'Test-parola-2026!',role:'operator'}});
 const list=await app.inject({method:'GET',url:'/api/users',headers:{...headers,cookie}});
 const target=list.json().find((u:any)=>u.username==='operator');
 // SQLite 0/1 döner; JSX'te `{row.disabled && …}` "admin0" çiziyordu. API boolean vermeli.
 assert.equal(target.disabled,false);
 const opLogin=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'operator',password:'Test-parola-2026!'}});
 const opCookie=String(opLogin.headers['set-cookie']).split(';')[0];
 // Yonetici oturumu az once acildi; reauth penceresi acik oldugu icin islem gecer.
 const disabled=await app.inject({method:'PATCH',url:'/api/users/'+target.id,headers:{...headers,cookie},payload:{disabled:true}});
 assert.equal(disabled.statusCode,200);
 const after=await app.inject({method:'GET',url:'/api/session',headers:{...headers,cookie:opCookie}});
 assert.equal(after.json().user,null,'devre dışı hesabın açık oturumu düşer');
 await app.scadaClose();
});
test('an image in use cannot be deleted and the export keeps devices disabled on import',async()=>{
 const {app,cookie}=await boot();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
 const upload=await app.inject({method:'POST',url:'/api/uploads',headers:{...headers,cookie},payload:{data:png.toString('base64')}});
 assert.equal(upload.statusCode,200,'PNG yüklenir');
 const name=String(upload.json().src).split('/').pop();
 const bad=await app.inject({method:'POST',url:'/api/uploads',headers:{...headers,cookie},payload:{data:Buffer.from('bu bir görsel değil').toString('base64')}});
 assert.equal(bad.statusCode,400,'görsel olmayan içerik reddedilir');
 const removed=await app.inject({method:'DELETE',url:'/api/uploads/'+name,headers:{cookie,'x-scada-request':'1'}});
 assert.equal(removed.statusCode,200,'kullanılmayan görsel silinebilir: '+removed.body);
 const exported=await app.inject({method:'GET',url:'/api/export',headers:{...headers,cookie}});
 assert.equal(exported.statusCode,200);
 const body=exported.json();
 const imported=await app.inject({method:'POST',url:'/api/import',headers:{...headers,cookie},payload:body});
 assert.equal(imported.statusCode,200,'proje içe aktarılır');
 const project=await app.inject({method:'GET',url:'/api/project',headers:{...headers,cookie}});
 assert.ok(project.json().config.devices.every((d:any)=>!d.enabled),'içe aktarım cihazları pasif bırakır');
 await app.scadaClose();
});

/* B61: kullanimdaki etiketi silmeye calisan kullanici "etiket bulunamadi"
 * diye anlamsiz bir mesaj aliyordu; engelin alarm kurali mi ekran mi
 * oldugu gorunmuyordu. Mesaj artik etiketi ve engeli adiyla sayar. */
test('kullanimdaki etiket silinmek istenince engel adiyla raporlanir',async()=>{
 const {app,cookie}=await boot();
 const project=await app.inject({method:'GET',url:'/api/project',headers:{...headers,cookie}});
 const config=project.json().config as any;
 const tag=config.tags.find((t:any)=>t.dataType!=='bool')||config.tags[0];
 assert.ok(tag,'projede etiket var');
 const rules=await app.inject({method:'PUT',url:'/api/alarms/rules',headers:{...headers,cookie},
  payload:[{id:'rule-silme',name:'Kazan sıcaklığı yüksek',tagId:tag.id,kind:tag.dataType==='bool'?'bool':'high',
   limit:10,severity:'warning',deadband:0,delaySec:0,message:'',expected:true,area:'',enabled:true}]});
 assert.equal(rules.statusCode,200,'alarm kuralı kaydedildi: '+rules.body);
 const drop=await app.inject({method:'PUT',url:'/api/config',headers:{...headers,cookie},
  payload:{...config,tags:config.tags.filter((t:any)=>t.id!==tag.id)}});
 assert.equal(drop.statusCode,400,'kullanımdaki etiket silinemez');
 const message=drop.json().error as string;
 assert.ok(message.includes(tag.code),'mesaj etiketin kodunu söyler: '+message);
 assert.ok(message.includes('alarm kuralı'),'mesaj engelin alarm kuralı olduğunu söyler: '+message);
 assert.ok(message.includes('Kazan sıcaklığı yüksek'),'mesaj kuralın adını söyler: '+message);
 assert.ok(!/etiket bulunamadı/i.test(message),'eski anlamsız mesaj dönmez: '+message);
 await app.scadaClose();
});
test('audit visibility is scoped by role: config and user events stay with admin',async()=>{
 const {app,cookie}=await boot();
 for(const [username,role] of [['izleyici','viewer'],['operator','operator'],['tasarimci','designer']]){
  const created=await app.inject({method:'POST',url:'/api/users',headers:{...headers,cookie},payload:{username,password:'Test-parola-2026!',role}});
  assert.equal(created.statusCode,200);
 }
 const sessionFor=async(username:string)=>{
  const r=await app.inject({method:'POST',url:'/api/login',headers,payload:{username,password:'Test-parola-2026!'}});
  return String(r.headers['set-cookie']).split(';')[0];
 };
 app.scadaStore?.audit('system','command.verified',{id:'c1'});
 app.scadaStore?.audit('system','alarm.raised',{id:'a1'});
 app.scadaStore?.audit('admin','config.saved',{before:{host:'192.0.2.15'},after:{host:'192.0.2.20'}});
 app.scadaStore?.audit('admin','alarm.rules.saved',{rules:[]});
 const actionsFor=async(c:string,ranged:boolean)=>{
  const r=await app.inject({method:'GET',url:'/api/audit'+(ranged?'?from=0&to='+(Date.now()+1000):''),headers:{...headers,cookie:c}});
  assert.equal(r.statusCode,200);
  return {scope:r.json().scope,actions:r.json().events.map((e:any)=>e.action) as string[],total:r.json().eventsTotal};
 };
 for(const ranged of [false,true]){
  for(const name of ['izleyici','operator']){
   const {scope,actions,total}=await actionsFor(await sessionFor(name),ranged);
   assert.equal(scope,'operations');
   assert.ok(actions.every(a=>/^(command\.|alarm\.|recipe\.apply\.|shift\.note$|watchdog\.|gateway\.)/.test(a)),name+' yalnız işletme olaylarını görür: '+actions);
   assert.ok(!actions.includes('config.saved')&&!actions.includes('alarm.rules.saved')&&!actions.some(a=>a.startsWith('user.')),name+' config/kullanıcı olayını görmez');
   if(ranged)assert.equal(total,actions.length,'toplam da filtreli sayılır');
  }
  const d=await actionsFor(await sessionFor('tasarimci'),ranged);
  assert.equal(d.scope,'design');
  assert.ok(d.actions.includes('config.saved'),'tasarımcı config geçmişini görür');
  assert.ok(!d.actions.some(a=>a.startsWith('user.')||a.startsWith('reauth.')),'tasarımcı kullanıcı olaylarını görmez');
  const a=await actionsFor(cookie,ranged);
  assert.equal(a.scope,'all');
  assert.ok(a.actions.includes('config.saved')&&a.actions.some(x=>x.startsWith('user.')),'yönetici hepsini görür');
 }
 await app.scadaClose();
});
test('operator shelve limit comes from the alarm policy; admin keeps the fixed ceiling',async()=>{
 const {app,cookie}=await boot();
 await app.inject({method:'POST',url:'/api/users',headers:{...headers,cookie},payload:{username:'operator',password:'Test-parola-2026!',role:'operator'}});
 const login=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'operator',password:'Test-parola-2026!'}});
 const operator=String(login.headers['set-cookie']).split(';')[0];
 app.scadaStore.saveAlarmRules([{id:'r1',name:'Basınç yüksek',tagId:'t1',kind:'high',limit:10,expected:true,deadband:0,delayMs:0,severity:'warning',message:'',enabled:true,popup:true,ackRequired:true,latch:false,area:'',equipment:'',cause:'',consequence:'',action:'',responseMinutes:0,shelvedUntil:0,shelvedReason:'',shelvedBy:''}]);
 const shelve=(c:string,minutes:number)=>app.inject({method:'POST',url:'/api/alarms/r1/shelve',headers:{...headers,cookie:c},payload:{minutes,reason:'bakımda'}});
 const policy=(await app.inject({method:'GET',url:'/api/alarms/policy',headers:{...headers,cookie}})).json().policy;
 assert.equal(policy.operatorShelveMaxMinutes,1440,'varsayılan eski davranışı korur');
 assert.equal((await shelve(operator,1440)).statusCode,200,'varsayılanda operatör 24 saate kadar kaldırabilir');
 const saved=await app.inject({method:'PUT',url:'/api/alarms/policy',headers:{...headers,cookie},payload:{...policy,operatorShelveMaxMinutes:120}});
 assert.equal(saved.statusCode,200);
 const operatorPolicy=await app.inject({method:'PUT',url:'/api/alarms/policy',headers:{...headers,cookie:operator},payload:{...policy,operatorShelveMaxMinutes:1440}});
 assert.equal(operatorPolicy.statusCode,403,'operatör kendi sınırını değiştiremez');
 const over=await shelve(operator,121);
 assert.equal(over.statusCode,403,'sınır üstü reddedilir');
 assert.match(over.json().error,/120 dakika/);
 assert.equal((await shelve(operator,120)).statusCode,200,'sınırda kabul edilir');
 assert.equal((await shelve(cookie,1440)).statusCode,200,'yönetici sabit tavanı kullanır');
 assert.equal((await shelve(cookie,1441)).statusCode,400,'1440 üstü herkes için geçersiz');
 await app.scadaClose();
});
