import {randomUUID} from 'node:crypto';
import {alarmText,defaultAlarmPolicy,type AlarmEvent,type AlarmFlood,type AlarmPolicy,type AlarmRule,type Config,type Sample} from '../../../packages/contracts/model';
import {Store} from './store';
const severityRank:Record<AlarmRule['severity'],number>={critical:0,warning:1,info:2};
export class Alarms {
 states=new Map<string,{since:number;event:AlarmEvent|null}>();
 /** Son bir dakikadaki tetiklenme zamanlari; sel esigi bunun uzerinden olculur. */
 raiseTimes:number[]=[];
 flood:AlarmFlood={active:false,since:0,lastRaiseAt:0,ratePerMinute:0,suppressed:0};
 constructor(public store:Store,public samples:Record<string,Sample>,public rules:()=>AlarmRule[],public config:()=>Config|null,public policy:()=>AlarmPolicy=()=>defaultAlarmPolicy){
  for(const e of store.openAlarms())this.states.set(e.ruleId,{since:e.raisedAt,event:e});
 }
 /**
  * Alarm seli: bir dakikadaki tetiklenme sayisi esigi asarsa bastirma acilir.
  * Bastirmada olay KAYDEDILIR ve listede kalir; yalniz kritik olmayanin
  * popup'i kapanir. Sessiz kayip olmasin diye giris/cikis denetime yazilir.
  */
 floodState(now=Date.now()):AlarmFlood{
  const p=this.policy();
  this.raiseTimes=this.raiseTimes.filter(t=>now-t<60000);
  const rate=this.raiseTimes.length;
  if(!this.flood.active&&rate>=p.floodPerMinute){
   this.flood={active:true,since:now,lastRaiseAt:this.flood.lastRaiseAt,ratePerMinute:rate,suppressed:0};
   this.store.audit('system','alarm.flood.started',{ratePerMinute:rate,threshold:p.floodPerMinute});
  }else if(this.flood.active&&rate<p.floodPerMinute&&now-this.flood.lastRaiseAt>=p.floodClearMinutes*60000){
   this.store.audit('system','alarm.flood.ended',{durationMs:now-this.flood.since,suppressedPopups:this.flood.suppressed});
   this.flood={active:false,since:0,lastRaiseAt:this.flood.lastRaiseAt,ratePerMinute:rate,suppressed:0};
  }else this.flood={...this.flood,ratePerMinute:rate};
  return this.flood;
 }
 active(){return [...this.states.values()].map(s=>s.event).filter((e):e is AlarmEvent=>!!e);}
 /** Aktif ve onaylanmamış olayların tamamı; önem önceliğine göre sıralanır. */
 outstanding(){const open=this.active();const unacked=this.store.unackedAlarms().filter(e=>!open.some(o=>o.id===e.id));
  return [...open,...unacked].sort((a,b)=>severityRank[a.severity]-severityRank[b.severity]||b.raisedAt-a.raisedAt);}
 /** Canlı yayında istemciye giden liste; kesilen kısım sayaçlarla bildirilir. */
 pending(limit=200){return this.outstanding().slice(0,limit);}
 /** Gerçek toplamlar; listenin kesilmiş olması gerçek adedi gizlemesin. */
 counts(){const outstanding=this.outstanding();
  return {...this.store.alarmCounts(),outstanding:outstanding.length,
   critical:outstanding.filter(e=>e.severity==='critical').length,
   unackedOutstanding:outstanding.filter(e=>!e.ackAt).length};}
 /** Kural degisiminde acik olayin ne olacagini belirler; sessiz kayma olmasin. */
 materialChange(a:AlarmRule,b:AlarmRule){return a.tagId!==b.tagId||a.kind!==b.kind||a.limit!==b.limit||a.expected!==b.expected||a.severity!==b.severity;}
 /** Kural seti degistiginde cagrilir: maddi degisen kurallarin acik olaylari gerekce ile kapatilir. */
 applyRuleChanges(before:AlarmRule[],after:AlarmRule[],now=Date.now()){
  for(const [ruleId,state] of [...this.states]){
   const old=before.find(r=>r.id===ruleId),next=after.find(r=>r.id===ruleId);
   if(!old)continue;
   if(!next){this.clear(ruleId,state,now,'Kural silindi.');continue;}
   if(this.materialChange(old,next))this.clear(ruleId,state,now,'Kural değişti: '+(old.limit!==next.limit?'limit '+old.limit+' → '+next.limit:'tanım güncellendi')+'. Yeni tanımla yeniden değerlendirilecek.');
  }
 }
 tick(now=Date.now()){
  const rules=this.rules(),c=this.config();
  for(const [ruleId,state] of this.states)if(!rules.some(r=>r.id===ruleId&&r.enabled))this.clear(ruleId,state,now,'Kural kaldırıldı veya devre dışı bırakıldı.');
  for(const r of rules){
   if(!r.enabled)continue;
   if(r.shelvedUntil>Date.now())continue;
   const s=this.samples[r.tagId],good=s?.quality==='good';
   const state=this.states.get(r.id);
   let condition:boolean;
   if(r.kind==='stale')condition=!good;
   else if(!good){
    /*
     * Gecikme politikasi (B48): "kesintisiz iyi kalitede kosul suresi".
     * Veri kalitesi bozulunca henuz alarma donmemis bekleme sayaci sifirlanir;
     * kesinti suresi gecikmeye sayilmaz. Zaten acilmis alarm korunur —
     * bilinmeyen veri alarmi sessizce kapatmaz (bkz. B04).
     */
    const pending=this.states.get(r.id);
    if(pending&&!pending.event)this.states.delete(r.id);
    continue;
   }
   else if(r.kind==='bool')condition=typeof s.value==='boolean'&&s.value===r.expected;
   else if(typeof s.value==='number'){const v=s.value,on=!!state?.event;
    condition=r.kind==='high'?(on?v>r.limit-r.deadband:v>r.limit):(on?v<r.limit+r.deadband:v<r.limit);}
   else continue;
   if(condition){
    const current=state||{since:now,event:null};
    if(!state)this.states.set(r.id,current);
    if(!current.event&&now-current.since>=r.delayMs)this.raise(r,s?.value??null,now,c);
   }else if(state){
    if(state.event&&r.latch&&!state.event.ackAt)continue;
    if(state.event)this.clear(r.id,state,now,r.latch?'Latch alarm ACK sonrası normale döndü.':'Alarm koşulu normale döndü.');
    else this.states.delete(r.id);
   }
  }
  this.floodState(now);
  return this.active();
 }
 raise(r:AlarmRule,value:boolean|number|null,now:number,c:Config|null){
  const tagCode=c?.tags.find(t=>t.id===r.tagId)?.code||r.tagId;
  this.raiseTimes.push(now);this.flood.lastRaiseAt=now;
  const flood=this.floodState(now),p=this.policy();
  // Sel sirasinda yalniz kritik olay popup olur; digerleri kayit ve listede kalir.
  const suppressed=flood.active&&p.suppressPopupsInFlood&&r.severity!=='critical'&&r.popup;
  if(suppressed)this.flood.suppressed++;
  const event:AlarmEvent={id:randomUUID(),ruleId:r.id,name:r.name,severity:r.severity,kind:r.kind,tagId:r.tagId,tagCode,value,limit:r.limit,
   message:alarmText(r,tagCode),raisedAt:now,clearedAt:null,ackAt:r.ackRequired?null:now,ackBy:r.ackRequired?'':'system',popup:r.popup&&!suppressed};
  this.states.set(r.id,{since:now,event});
  this.store.saveAlarm(event);this.store.audit('system','alarm.raised',{id:event.id,rule:r.id,name:r.name,severity:r.severity,value,popupSuppressed:!!suppressed});
 }
 clear(ruleId:string,state:{since:number;event:AlarmEvent|null},now:number,reason:string){
  const event=state.event;this.states.delete(ruleId);
  if(!event)return;
  event.clearedAt=now;this.store.saveAlarm(event);
  this.store.audit('system','alarm.cleared',{id:event.id,rule:ruleId,reason,duration:now-event.raisedAt});
 }
 acknowledge(ids:string[],user:string){
  let count=0;
  for(const id of ids){
   const event=this.store.alarm(id);if(!event||event.ackAt)continue;
   event.ackAt=Date.now();event.ackBy=user;this.store.saveAlarm(event);
   const state=this.states.get(event.ruleId);if(state?.event?.id===event.id)state.event=event;
   this.store.audit(user,'alarm.acknowledged',{id:event.id,name:event.name});count++;
  }
  return count;
 }
}
