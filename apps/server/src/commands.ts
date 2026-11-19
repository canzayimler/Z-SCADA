import {randomUUID} from 'node:crypto';
import {finalStatuses,isButton,isScript,scriptTagRefs,validateValue,unmetPermissives,permissiveText,permits,feedbackMatches,type Config,type Execution,type Sample,type User,type ScreenRecord} from '../../../packages/contracts/model';
import {checkScript,resolveTag} from '../../../packages/contracts/script';
import {ScriptRun,ScriptStopped} from './scriptRunner';
import {Store} from './store';
export class Commands {
 pending=new Map<string,Execution>();
 /** Sonucu belirsiz kalan hedefler; yeni bir iyi okuma gelene kadar aynı hedefe komut kabul edilmez. */
 unsettled=new Map<string,{since:number;commandId:string;status:string}>();
 /**
  * Hiz siniri (B38): kullanici ve ekipman bazinda kayan pencere. Amac,
  * yanlislikla veya kotu niyetle saha ekipmanini dovmeyi engellemek.
  * DURDURMA (deger false / 0) hicbir zaman sinirlanmaz — emniyet islemi
  * genel limite takilmamali.
  */
 static USER_LIMIT={count:30,windowMs:60000};
 static COMMAND_LIMIT={count:10,windowMs:60000};
 recent:{at:number;user:string;commandId:string}[]=[];
 /** Kabul edilen isteklerin izini tutar; pencerenin disindakiler dusurulur. */
 rateCheck(user:string,commandId:string,value:boolean|number,now=Date.now()){
  this.recent=this.recent.filter(r=>now-r.at<Math.max(Commands.USER_LIMIT.windowMs,Commands.COMMAND_LIMIT.windowMs));
  const stop=value===false||value===0;
  if(stop)return;// durdurma her zaman gecer
  const byUser=this.recent.filter(r=>r.user===user&&now-r.at<Commands.USER_LIMIT.windowMs).length;
  if(byUser>=Commands.USER_LIMIT.count)throw Error('Çok fazla komut gönderildi ('+Commands.USER_LIMIT.count+'/dk). Bir süre bekleyin; durdurma komutları engellenmez.');
  const byCommand=this.recent.filter(r=>r.commandId===commandId&&now-r.at<Commands.COMMAND_LIMIT.windowMs).length;
  if(byCommand>=Commands.COMMAND_LIMIT.count)throw Error('Bu ekipmana dakikada en fazla '+Commands.COMMAND_LIMIT.count+' komut gönderilebilir; durdurma komutları engellenmez.');
 }
 /** Calisan scriptler (yurutme kimligi → calisma). Hepsi ayni zamanda `pending` icindedir. */
 scripts=new Map<string,{run:ScriptRun;done:Promise<void>;commandId:string}>();
 /** Sunucu script calisirken kapandiysa guvenli durumu haberlesme gelince yazilacak yurutmeler. */
 recovering:Execution[]=[];
 constructor(public store:Store,public samples:Record<string,Sample>,public active:()=>Config|null,public available:()=>boolean,public write:(tagId:string,value:boolean|number,id:string,expiresAt:number,revision:number)=>Promise<void>){
  this.recovering=store.commands().filter(e=>e.recover);
 }
 request(input:{id:string;commandId:string;value:boolean|number;screenId:string;screenVersion:number;reason?:string},user:User,screen:ScreenRecord,approvedBy?:string){
  const existing=this.store.command(input.id);if(existing){if(existing.user!==user.username||existing.commandId!==input.commandId||existing.value!==input.value)throw Error('İstek kimliği başka işlemde kullanıldı.');return existing;}
  if(!['admin','operator'].includes(user.role))throw Error('Komut yetkisi yok.');
  // Granuler izin (B29): rol komut vermeye yetse de bu ekipman kullanicinin kapsaminda olmayabilir.
  if(!permits(user,'commands',input.commandId))throw Object.assign(Error('Bu ekipmana komut verme izniniz yok.'),{statusCode:403});
  if(!permits(user,'screens',input.screenId))throw Object.assign(Error('Bu ekranı kullanma izniniz yok.'),{statusCode:403});
  const c=this.active();if(!c||!this.available())throw Error('Haberleşme hazır değil.');
  if(input.screenVersion!==screen.publishedVersion||!screen.published)throw Error('Ekran revizyonu değişti; canlı ekranı yenileyin.');
  const fromDetail=screen.published.widgets.some(w=>w.details?.some(d=>d.kind==='command'&&d.commandId===input.commandId&&(d.action==='toggle'
   ?typeof input.value==='boolean'&&this.samples[d.tagId]?.quality==='good'&&typeof this.samples[d.tagId]?.value==='boolean'&&input.value!==this.samples[d.tagId].value
   :(d.action==='set'?d.setValue:d.action==='on')===input.value)));
  if(!fromDetail&&!screen.published.widgets.some(w=>w.commandId===input.commandId&&((['numeric-input','slider','keypad','pid'].includes(w.type)&&typeof input.value==='number')||(isButton(w.type)&&(['momentary','pulse'].includes(w.action)?typeof input.value==='boolean':w.action==='toggle'?typeof input.value==='boolean'&&(this.samples[w.tagId]?.quality==='good')&&typeof this.samples[w.tagId]?.value==='boolean'&&input.value!==this.samples[w.tagId].value:(w.action==='set'?w.setValue:w.action==='on')===input.value)))))throw Error('Komut yayınlanmış ekranda tanımlı değil.');
  /* G45: nesne bazli yazma araligi. Ekranda 0-100 yazan bir nesneden 250
   * gonderilemez; kisitlama arayuzde degil burada baglayicidir. */
  if(typeof input.value==='number'){
   const value=input.value;
   const limited=screen.published.widgets.filter(w=>w.commandId===input.commandId&&['numeric-input','slider','keypad','pid'].includes(w.type)&&(w.writeMin!==null||w.writeMax!==null));
   if(limited.length&&!limited.some(w=>(w.writeMin===null||value>=w.writeMin)&&(w.writeMax===null||value<=w.writeMax))){
    const w=limited[0];
    throw Error('Bu nesnede yazma aralığı '+(w.writeMin??'−∞')+' – '+(w.writeMax??'+∞')+'; '+value+' bu aralığın dışında.');
   }
  }
  const d=c.commands.find(d=>d.id===input.commandId);if(!d)throw Error('Komut bulunamadı.');
  // Script: deger hedefe yazilmaz, scripte `input` olarak gider. Okunan etiketler de baslangicta guncel olmali.
  const script=isScript(d)?checkScript(d.script||'',scriptTagRefs(c),c.devices):null;
  if(script&&!script.ok)throw Error('Script geçersiz: '+script.errors[0].message);
  if(script){if([...this.scripts.values()].some(x=>x.commandId===d.id))throw Error('Bu script zaten çalışıyor.');}
  else validateValue(c,d.tagIds,input.value);
  for(const tagId of [...new Set([...d.tagIds,...d.feedbackTagIds,...(script?.reads||[])])]){
   const t=c.tags.find(t=>t.id===tagId)!,device=c.devices.find(x=>x.id===t.deviceId)!;const s=this.samples[tagId];
   if(!device.enabled||!s||s.quality!=='good'||Date.now()-s.receivedAt>device.staleMs)throw Error('Hedef veya geri bildirim verisi güncel değil.');
  }
  for(const p of this.pending.values()){const other=c.commands.find(x=>x.id===p.commandId);if(other?.tagIds.some(i=>d.tagIds.includes(i)))throw Error('Bu hedefte komut sonucu bekleniyor.');}
  this.reconcile();
  for(const tagId of d.tagIds){const u=this.unsettled.get(tagId);if(u)throw Error('Bu hedefte sonucu belirsiz komut var; yeni PLC okuması bekleniyor.');}
  // Yazilabilir ve guncel olmak, bu proses durumunda gonderilmesi uygun demek degildir.
  this.rateCheck(user.username,d.id,input.value);
  /*
   * Risk bazli onay (B36): gerekce ve iki kisi onayi SUNUCUDA zorlanir.
   * Arayuz onay penceresini atlarsa istek yine reddedilir.
   */
  if((d.approval==='reason'||d.approval==='two-person')&&!(input.reason||'').trim())
   throw Object.assign(Error('Bu komut için gerekçe zorunlu ('+d.name+').'),{statusCode:400});
  const unmet=unmetPermissives(c,d.id,this.samples);
  if(unmet.length)throw Error('İzin koşulu sağlanmadı — '+unmet.map(permissiveText).join('; ')+'.');
  const e:Execution={id:input.id||randomUUID(),commandId:d.id,name:d.name,user:user.username,value:input.value,status:'accepted',createdAt:Date.now(),updatedAt:Date.now(),message:'Komut kabul edildi.',steps:script?[]:d.tagIds.map(tagId=>({tagId,status:'waiting'})),configRevision:c.revision,screenId:screen.id,screenVersion:screen.publishedVersion,...(input.reason?{reason:input.reason.trim()}:{}),...(approvedBy?{approvedBy,approvedAt:Date.now()}:{}),...(script?{kind:'script' as const,log:[]}:{})};
  if(d.approval==='two-person'&&!approvedBy){
   // Ikinci kisi onaylayana kadar sahaya hicbir sey yazilmaz.
   const waiting:Execution={id:input.id||randomUUID(),commandId:d.id,name:d.name,user:user.username,value:input.value,status:'awaiting',
    createdAt:Date.now(),updatedAt:Date.now(),message:'İkinci kişinin onayı bekleniyor.',steps:d.tagIds.map(tagId=>({tagId,status:'awaiting'})),
    configRevision:c.revision,screenId:input.screenId,screenVersion:input.screenVersion,reason:(input.reason||'').trim()};
   this.store.saveCommand(waiting);
   this.store.audit(user.username,'command.approval.requested',{id:waiting.id,command:d.id,name:d.name,value:waiting.value,reason:waiting.reason});
   return waiting;
  }
  this.recent.push({at:Date.now(),user:user.username,commandId:d.id});
  this.store.saveCommand(e);this.store.audit(user.username,'command.accepted',{id:e.id,definition:d,config:c,previous:d.tagIds.map(i=>({tagId:i,sample:this.samples[i]})),value:e.value});this.pending.set(e.id,e);
  if(script)this.startScript(e,c,d,script.ast!);else void this.execute(e,c);
  return e;
 }
 /**
  * Ikinci kisi onayi: ilk isteyen kendi komutunu onaylayamaz. Onay aninda
  * butun kabul kontrolleri (kalite, izin kosulu, kilit, hiz siniri) yeniden
  * calisir — bekleme suresinde saha durumu degismis olabilir.
  */
 approve(executionId:string,approver:User,screen:ScreenRecord){
  const e=this.store.command(executionId);if(!e)throw Error('İşlem bulunamadı.');
  if(e.status!=='awaiting')throw Error('Bu işlem onay beklemiyor.');
  if(e.user===approver.username)throw Object.assign(Error('Kendi komutunuzu onaylayamazsınız; ikinci bir yetkili gerekiyor.'),{statusCode:403});
  const fresh=this.request({id:randomUUID(),commandId:e.commandId,value:e.value,screenId:e.screenId,screenVersion:screen.publishedVersion,reason:e.reason},approver,screen,approver.username);
  e.status='rejected';e.message='İkinci onayla yeni işlem olarak yürütüldü: '+fresh.id;e.approvedBy=approver.username;e.approvedAt=Date.now();
  this.store.saveCommand(e);
  this.store.audit(approver.username,'command.approved',{id:e.id,execution:fresh.id,requestedBy:e.user,command:e.commandId,value:e.value,reason:e.reason});
  return fresh;
 }
 /** Onay bekleyen istegi iptal eder. */
 rejectApproval(executionId:string,user:User){
  const e=this.store.command(executionId);if(!e)throw Error('İşlem bulunamadı.');
  if(e.status!=='awaiting')throw Error('Bu işlem onay beklemiyor.');
  e.status='rejected';e.message='Onay reddedildi ('+user.username+').';e.updatedAt=Date.now();
  this.store.saveCommand(e);this.store.audit(user.username,'command.approval.rejected',{id:e.id,requestedBy:e.user,command:e.commandId});
  return e;
 }
 /** İşlem sonlandıysa (timeout veya yapılandırma değişimi) artık durumu değiştirilemez. */
 settled(e:Execution){return finalStatuses.includes(e.status)||!this.pending.has(e.id);}
 /** Terminal durumdan sonra gelen sonuç kaydedilir ama durumu değiştirmez. */
 late(e:Execution,message:string){e.message=(e.message?e.message+' ':'')+message;this.store.saveCommand(e);this.store.audit(e.user,'command.late',{id:e.id,status:e.status,message,steps:e.steps});}
 async execute(e:Execution,c:Config){
  const d=c.commands.find(x=>x.id===e.commandId)!;const deadline=e.createdAt+d.timeoutMs;
  try{
   for(let n=0;n<e.steps.length;n++){
    if(this.settled(e))return this.late(e,'Kalan adımlar süre dolduğu için gönderilmedi.');
    if(!this.available()||Date.now()>deadline)throw Error('Bağlantı veya süre sınırı.');
    const step=e.steps[n];e.status='sent';step.status='sent';e.message='PLC yazma yanıtı bekleniyor.';this.store.saveCommand(e);
    await this.write(step.tagId,e.value,`${e.id}-${n}`,deadline,c.revision);step.status='acknowledged';step.ackAt=Date.now();
    if(this.settled(e))return this.late(e,'Yazma yanıtı süre dolduktan sonra geldi.');
    this.store.saveCommand(e);
   }
   if(this.settled(e))return this.late(e,'Yazma yanıtı süre dolduktan sonra geldi.');
   e.status='acknowledged';e.message='Yeni PLC okuması bekleniyor.';this.store.saveCommand(e);
  }catch(error){
   if(this.settled(e))return this.late(e,'Yazma hatası süre dolduktan sonra geldi: '+(error as Error).message);
   e.status=e.steps.some(s=>s.status==='acknowledged')?'partial':'uncertain';e.message='İşlem tamamlanamadı; otomatik tekrar yapılmadı. '+(error as Error).message;this.finish(e);
  }
 }
 /** Belirsiz hedeflerde yeni bir iyi okuma geldiyse kilidi kaldırır. */
 reconcile(now=Date.now()){for(const [tagId,u] of this.unsettled){const s=this.samples[tagId];
  if(s&&s.quality==='good'&&s.receivedAt>u.since&&s.sampledAt>u.since){this.unsettled.delete(tagId);this.store.audit('system','command.reconciled',{tagId,commandId:u.commandId,status:u.status,value:s.value,waitedMs:now-u.since});}}}
 tick(){this.reconcile();this.recover();for(const e of this.pending.values()){
  const c=this.active(),d=c?.commands.find(x=>x.id===e.commandId);
  if(e.kind==='script'){this.watchScript(e,c,d);continue;}
  if(!d||c?.revision!==e.configRevision){e.status='uncertain';e.message='Yapılandırma değişti.';this.finish(e);continue;}
  if(e.status==='acknowledged'&&d.feedbackTagIds.every((id,n)=>{const s=this.samples[id];return s?.quality==='good'&&s.receivedAt>(e.steps[n].ackAt||Infinity)&&s.sampledAt>(e.steps[n].ackAt||Infinity)&&feedbackMatches(c?.tags.find(t=>t.id===id),e.value,s.value);})){e.status='verified';e.message='Yeni PLC okumasıyla doğrulandı.';this.finish(e);}
  else if(Date.now()-e.createdAt>d.timeoutMs){e.status=e.status==='acknowledged'?'unverified':'uncertain';e.message='Süre içinde geri bildirim doğrulanamadı.';this.finish(e);}
 }}
 /* --- Script yurutme -------------------------------------------------------- */
 private logLine(e:Execution,text:string){e.log=[...(e.log||[]),{at:Date.now(),text}].slice(-200);e.message=text;this.store.saveCommand(e);}
 startScript(e:Execution,c:Config,d:Config['commands'][number],ast:NonNullable<ReturnType<typeof checkScript>['ast']>){
  const code=(id:string)=>c.tags.find(t=>t.id===id)?.code||id;
  const run=new ScriptRun(ast,{
   resolve:name=>{const hits=resolveTag(name,scriptTagRefs(c),c.devices);if(hits.length!==1)throw Error('Etiket çözülemedi: '+name);return hits[0].id;},
   read:tagId=>{const t=c.tags.find(x=>x.id===tagId)!,device=c.devices.find(x=>x.id===t.deviceId),s=this.samples[tagId];
    if(!device?.enabled||!s||s.quality!=='good'||s.value===null||Date.now()-s.receivedAt>device.staleMs)throw Error(t.code+' verisi güncel değil; script güvenli duruma alındı.');
    return s.value;},
   write:async(tagId,value,n)=>{
    if(!this.available())throw Error('Haberleşme hazır değil.');
    validateValue(c,[tagId],value);
    await this.write(tagId,value,`${e.id}-${n}`,Date.now()+d.timeoutMs,c.revision);
    e.steps=[...e.steps,{tagId,status:'acknowledged',ackAt:Date.now()}].slice(-50);
    this.logLine(e,code(tagId)+' ← '+(typeof value==='boolean'?(value?'1':'0'):value));
   },
   isBool:tagId=>c.tags.find(x=>x.id===tagId)?.dataType==='bool',
   log:text=>this.logLine(e,text),
  },e.value,d.maxRunMs??60000);
  e.status='running';this.logLine(e,'Script başladı ('+e.user+').');
  const done=(async()=>{
   try{
    await run.run();
    e.status='completed';this.logLine(e,'Script tamamlandı · '+Math.round((Date.now()-run.started)/100)/10+' sn, '+run.writes+' yazma.');
    this.store.audit(e.user,'command.completed',{id:e.id,command:d.id,writes:run.writes,ms:Date.now()-run.started});
   }catch(error){
    const msg=error instanceof ScriptStopped?error.message:'Hata: '+(error as Error).message;
    this.logLine(e,msg);
    await this.safeState(e,c,d,msg);
   }finally{this.scripts.delete(e.id);this.pending.delete(e.id);this.store.saveCommand(e);}
  })();
  this.scripts.set(e.id,{run,done,commandId:d.id});
 }
 /**
  * Guvenli durum: tanimli her etikete sirayla yazilir, biri basarisiz olsa da digerleri denenir.
  * Hepsi onaylanirsa 'aborted'; biri bile yazilamazsa 'uncertain' ve o hedefler yeni okuma gelene
  * kadar kilitli kalir (normal komutlarin belirsiz sonuc kurali).
  */
 async safeState(e:Execution,c:Config,d:Config['commands'][number],reason:string){
  const failed:string[]=[];
  for(const [i,sw] of (d.safeWrites||[]).entries()){
   const code=c.tags.find(t=>t.id===sw.tagId)?.code||sw.tagId;
   try{await this.write(sw.tagId,sw.value,`${e.id}-safe-${i}`,Date.now()+5000,c.revision);this.logLine(e,'Güvenli durum: '+code+' ← '+(typeof sw.value==='boolean'?(sw.value?'1':'0'):sw.value));}
   catch(err){failed.push(sw.tagId);this.logLine(e,'Güvenli durum YAZILAMADI: '+code+' — '+(err as Error).message);}
  }
  if(failed.length){e.status='uncertain';for(const tagId of failed)this.unsettled.set(tagId,{since:Date.now(),commandId:d.id,status:'uncertain'});}
  else e.status='aborted';
  e.message=reason+(failed.length?' · Güvenli durum '+failed.length+' etikette yazılamadı; sahayı kontrol edin.':(d.safeWrites||[]).length?' · Güvenli durum yazıldı.':'');
  this.store.saveCommand(e);
  this.store.audit(e.stoppedBy||e.user,'command.'+e.status,{id:e.id,command:d.id,reason,safeFailed:failed});
 }
 /** Calisan scripti haberlesme, yapilandirma ve izin kosuluna gore izler; bozulursa durdurur. */
 private watchScript(e:Execution,c:Config|null,d:Config['commands'][number]|undefined){
  const x=this.scripts.get(e.id);if(!x)return;
  if(!c||!d||c.revision!==e.configRevision)return x.run.abort('Yapılandırma değişti.');
  if(!this.available())return x.run.abort('Haberleşme koptu.');
  const unmet=unmetPermissives(c,d.id,this.samples);
  if(unmet.length)x.run.abort('İzin koşulu kalktı — '+unmet.map(permissiveText).join('; ')+'.');
 }
 /** Operator/yonetici durdurmasi. Durdurma hiz sinirina takilmaz. */
 stop(executionId:string,user:User){
  if(!['admin','operator'].includes(user.role))throw Error('Komut yetkisi yok.');
  const x=this.scripts.get(executionId),e=this.pending.get(executionId);
  if(!x||!e)throw Error('Çalışan script bulunamadı; bitmiş olabilir.');
  if(!permits(user,'commands',e.commandId))throw Object.assign(Error('Bu ekipmana komut verme izniniz yok.'),{statusCode:403});
  e.stoppedBy=user.username;x.run.abort('Durduruldu ('+user.username+').');
  this.store.audit(user.username,'command.stop',{id:e.id,command:e.commandId});
  return e;
 }
 /** Sunucu kapanirken: scriptleri durdur ve guvenli durumun yazilmasini en cok `ms` bekle. */
 async shutdown(ms=4000){
  for(const x of this.scripts.values())x.run.abort('Sunucu kapanıyor.');
  await Promise.race([Promise.all([...this.scripts.values()].map(x=>x.done)),new Promise(r=>setTimeout(r,ms))]);
 }
 /** Onceki calismada yarim kalan scriptlerin guvenli durumu: haberlesme gelince bir kez. */
 private recover(){
  if(!this.recovering.length||!this.available())return;
  const c=this.active();if(!c)return;
  const list=this.recovering;this.recovering=[];
  for(const e of list){
   const d=c.commands.find(x=>x.id===e.commandId);
   e.recover=false;
   if(!d||!isScript(d)){e.message+=' Komut artık yok; güvenli durum yazılamadı, sahayı kontrol edin.';this.store.saveCommand(e);continue;}
   void this.safeState(e,c,d,'Sunucu script çalışırken kapanmıştı.');
  }
 }
 finish(e:Execution){
  if(['uncertain','partial','unverified'].includes(e.status))
   for(const step of e.steps)if(step.status!=='waiting')this.unsettled.set(step.tagId,{since:Date.now(),commandId:e.commandId,status:e.status});
  this.store.saveCommand(e);this.store.audit(e.user,'command.'+e.status,{id:e.id,message:e.message,steps:e.steps});this.pending.delete(e.id);
 }
}
