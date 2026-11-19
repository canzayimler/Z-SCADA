/* Kopru giris yolunun kabul kurallari (Y3, Y4).
 *
 * Y3: tekrar korumasi `session` esitligine bagliydi — `prior.session===m.session`
 * tutmazsa sira sayisi kontrolu tamamen atlaniyordu. Her mesajda yeni bir session
 * uydurmak, eski ornekleri sinirsiz tekrar oynatmaya yetiyordu: operator donmus
 * ama normal gorunen bir ekrana bakip vana/motor karari verir.
 * Y4: `sampledAt` oldugu gibi aliniyordu. commands.ts dogrulamada `s.sampledAt>ackAt`
 * karsilastirmasi yapar; gelecek tarihli uydurma damga, bayat bir okumayi
 * "ack sonrasi geldi" gibi gosterip komutu yanlislikla `verified` yapar.
 *
 * Saf fonksiyonlar: WebSocket islemesinden ayri tutuldu ki test edilebilsin. */

export type SourceState={session:string;seq:number;switchedAt:number};

/** Iki session degisimi arasindaki en kisa sure. Gercek yeniden baslatma seyrek,
 * saldirganin session cevirme hizi ise bu degerle sinirlanir. */
export const SESSION_SWITCH_COOLDOWN_MS=3000;
/** Yeni session ilk mesajlarinda sira sayaci sifirdan baslar (driver.ts:104).
 * Yuksek sayacla gelen "yeni session" yeniden baslatma degildir. */
export const SESSION_RESTART_MAX_SEQ=60;
/** Kopru ile sunucu ayni makinede; saat farki degil, olcum gecikmesi payi. */
export const CLOCK_SKEW_MS=2000;
/** Bundan eski damga tasiyan ornek kabul edilmez — tekrar oynatma penceresi. */
export const MAX_SAMPLE_AGE_MS=60000;

export type IngestReject='sequence'|'session-churn'|'session-sequence'|'sampled-at';

/**
 * Kaynagin sira/oturum bilgisini degerlendirir.
 * Ayni session: sira kesin artmali. Yeni session: hem bekleme suresi dolmali,
 * hem de sayac yeniden baslamis gorunmeli.
 */
export function acceptSource(prior:SourceState|undefined,message:{session?:unknown;sequence?:unknown},now:number):
 {ok:true;next:SourceState}|{ok:false;reason:IngestReject}{
 const session=typeof message.session==='string'?message.session:'';
 const sequence=typeof message.sequence==='number'&&Number.isFinite(message.sequence)?message.sequence:null;
 if(sequence===null)return {ok:false,reason:'sequence'};
 if(!prior)return {ok:true,next:{session,seq:sequence,switchedAt:now}};
 if(prior.session===session){
  if(sequence<=prior.seq)return {ok:false,reason:'sequence'};
  return {ok:true,next:{session,seq:sequence,switchedAt:prior.switchedAt}};
 }
 if(now-prior.switchedAt<SESSION_SWITCH_COOLDOWN_MS)return {ok:false,reason:'session-churn'};
 if(sequence>SESSION_RESTART_MAX_SEQ)return {ok:false,reason:'session-sequence'};
 return {ok:true,next:{session,seq:sequence,switchedAt:now}};
}

/** Ornek damgasi: sayi olmali, gelecekten gelmemeli, bayat olmamali. */
export function acceptSampledAt(sampledAt:unknown,now:number):boolean{
 if(typeof sampledAt!=='number'||!Number.isFinite(sampledAt))return false;
 if(sampledAt>now+CLOCK_SKEW_MS)return false;
 if(sampledAt<now-MAX_SAMPLE_AGE_MS)return false;
 return true;
}

/* Reddedilenler sessizce yutulmaz: sayac /api/ready altinda gorunur, boylece
 * "veri neden gelmiyor" sorusu tahminle degil olcumle cevaplanir. */
const rejects:Record<IngestReject,number>={sequence:0,'session-churn':0,'session-sequence':0,'sampled-at':0};
export function noteReject(reason:IngestReject){rejects[reason]++;}
export function ingestRejects(){return {...rejects};}
export function resetIngestRejects(){for(const k of Object.keys(rejects) as IngestReject[])rejects[k]=0;}
