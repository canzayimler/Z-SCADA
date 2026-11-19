import type {Live} from '../../../packages/contracts/model';
/* Durum bandi (2026-09-25 inceleme #1): veri koptugunda ekran normal gorunuyordu — tek isaret
 * topbar'daki kucuk gri yazi, tam ekranda o da yok. Bu model bandin ne diyecegini SAF uretir;
 * main.tsx hem sayfa ustune hem tam ekran kokune ayni listeyi cizer. Renk ISA-101: yalniz
 * 'bad' kirmizi, 'warn' sari; her bildirim metinle de anlatilir. */
export type Notice={id:string;tone:'bad'|'warn'|'info';title:string;detail?:string;action?:'reload';hint?:string;links?:{label:string;href:string}[]};
/** GET /api/update cevabinin arayuzun kullandigi kismi (yalniz yonetici alir). */
export type UpdateInfo={available:boolean;verified:boolean;latest:string|null;notesUrl:string|null;asset:{name:string;url:string;size:number;sha256:string|null}|null};
/** Yeni surum bildirimi (yalniz yonetici). Kurulum kendiliginden yapilmaz; nasil kurulacagi yazilir.
 * SHA-256 ozeti yayinda yoksa tepsiden tek tik kurulum sunulmaz: yalniz indirme baglantisi. */
export function updateNotice(u:UpdateInfo|null|undefined):Notice|null{
 if(!u?.available||!u.latest)return null;
 const links:{label:string;href:string}[]=[];
 if(u.notesUrl)links.push({label:'Sürüm notları',href:u.notesUrl});
 if(u.asset?.url)links.push({label:'Kurulum dosyasını indir',href:u.asset.url});
 return u.verified
  ?{id:'update',tone:'info',title:`Z SCADA ${u.latest} yayınlandı`,detail:'Nasıl kurulur: Tepsideki Z SCADA simgesi → Güncellemeyi kur. Ya da indirilen .exe dosyasını çalıştırın. Veriler korunur.',
    hint:'Kurulum sırasında servis birkaç dakika durur; uygun bir zamanda kurun.',links}
  :{id:'update',tone:'info',title:`Z SCADA ${u.latest} yayınlandı`,detail:'Kurulum dosyasının SHA-256 özeti yayında yok; tepsiden tek tıkla kurulum sunulmaz. Dosyayı indirip elle çalıştırabilirsiniz. Veriler korunur.',links};
}
export type BuildInfo={server:string|null;dist:string|null};
export function statusNotices(o:{connected:boolean;fresh:boolean;live:Live;build?:BuildInfo|null;clientBuild?:string;isAdmin?:boolean;update?:UpdateInfo|null}):Notice[]{
 const {connected,fresh,live}=o,out:Notice[]=[];
 // Sayim cihaz saglik toplamlarindan: hic veri gelmemis etiketin ornegi yoktur, ornek sayisi eksik sayardi
 // (yeniden baslayan sunucuda PLC kapaliyken "1/1" yaziyordu). Cihaz bilgisi yoksa orneklere dus.
 const devTotal=live.devices.reduce((n,d)=>n+d.tags,0),devGood=live.devices.reduce((n,d)=>n+d.good,0);
 const total=devTotal||Object.keys(live.samples).length,stale=devTotal?devTotal-devGood:Object.values(live.samples).filter(s=>s.quality!=='good').length;
 const staleText=total?` · ${stale}/${total} etiket güncel değil — ekrandaki değerler son bilinen değerdir`:'';
 if(!connected)out.push({id:'server',tone:'bad',title:'Sunucu bağlantısı yok',detail:'Ekrandaki değerler güncel değil. Bağlantı kendiliğinden yeniden denenir.'});
 else if(!fresh)out.push({id:'server',tone:'bad',title:'Sunucudan veri gelmiyor',detail:'Ekrandaki değerler güncel değil.'});
 else if(!live.gatewayConnected)out.push({id:'bridge',tone:'bad',title:'PLC köprüsü bağlı değil',detail:'Node-RED köprüsünden veri gelmiyor'+staleText+'.'});
 else{
  const down=live.devices.filter(d=>d.status==='down'),partial=live.devices.filter(d=>d.status==='partial');
  if(down.length)out.push({id:'devices',tone:'bad',title:down.length===live.devices.length?'Hiçbir cihazdan veri gelmiyor':`${down.length} cihazdan veri gelmiyor`,detail:down.map(d=>d.code+(d.name&&d.name!==d.code?' ('+d.name+')':'')).join(', ')+staleText+'.'});
  else if(partial.length)out.push({id:'devices',tone:'warn',title:`${partial.length} cihaz kısmen güncel`,detail:partial.map(d=>`${d.code}: ${d.good}/${d.tags} etiket`).join(', ')+'.'});
  if(live.deploying)out.push({id:'deploy',tone:'warn',title:'Yapılandırma uygulanıyor',detail:'Köprü yeni yapılandırmayı yüklüyor; birkaç saniye sürebilir.'});
  else if(live.activeRevision!==live.desiredRevision)out.push({id:'revision',tone:'warn',title:'Yapılandırma uygulanmadı',detail:`Köprü revizyon ${live.activeRevision}, kayıtlı ${live.desiredRevision}.`});
 }
 const b=o.build;
 if(b&&o.clientBuild){
  if(b.dist&&b.dist!==o.clientBuild)out.push({id:'build-client',tone:'info',title:'Yeni arayüz sürümü hazır',detail:'Sayfayı yenileyin (kaydedilmemiş taslak varsa önce kaydedin).',action:'reload'});
  if(b.server&&b.dist&&b.server!==b.dist&&o.isAdmin)out.push({id:'build-server',tone:'warn',title:'Sunucu eski kodla çalışıyor',detail:'Arayüz yeniden derlendi ama sunucu yeniden başlatılmadı; yeni alanlar kayıtta silinebilir. Sunucuyu yeniden başlatın.'});
 }
 if(o.isAdmin){const u=updateNotice(o.update);if(u)out.push(u);}
 return out;
}
/** Komut durumunun Türkçe etiketi (eskiden Management.tsx'teydi). */
export function statusLabel(s: string) {
 return (
  (
   {
    accepted: 'Kabul edildi',
    sent: 'Gönderildi',
    acknowledged: 'Geri okuma bekleniyor',
    verified: 'Doğrulandı',
    failed: 'Başarısız',
    rejected: 'Reddedildi',
    unverified: 'Doğrulanamadı',
    partial: 'Kısmen tamamlandı',
    uncertain: 'Sonuç belirsiz',
    awaiting: 'İkinci onay bekleniyor',
    running: 'Script çalışıyor',
    completed: 'Script tamamlandı',
    aborted: 'Durdu · güvenli durum',
   } as Record<string, string>
  )[s] || s
 );
}
