import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {api} from './api';
import {InfoTip} from './InfoTip';
type Status={current:string;latest:string|null;available:boolean;verified:boolean;checkedAt:number|null;error?:string;enabled:boolean;envDisabled:boolean;
 notesUrl:string|null;asset:{name:string;url:string;size:number;sha256:string|null}|null};
/**
 * Guncellemeler (yalniz yonetici): denetimi ac/kapat, son denetim zamani, "Simdi denetle". Kurulum burada
 * yapilmaz; yeni surum bildirim simgesinde gorunur ve tepsiden onayla kurulur. Degisiklik ust cubuga
 * 'zscada:update' olayiyla hemen yansir.
 */
export function UpdatePanel({notify}:{notify:(s:string,tone?:'info'|'error')=>void}){
 const [s,setS]=useState<Status|null>(null),[busy,setBusy]=useState(false);
 const publish=(n:Status)=>{setS(n);dispatchEvent(new CustomEvent('zscada:update',{detail:n}));};
 useEffect(()=>{void api<Status>('/update').then(setS).catch(e=>notify((e as Error).message,'error'));},[]);
 async function act(fn:()=>Promise<Status>,msg:(n:Status)=>string){setBusy(true);try{const n=await fn();publish(n);notify(msg(n));}catch(e){notify((e as Error).message,'error');}finally{setBusy(false);}}
 const when=(t:number)=>new Date(t).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'});
 const result=!s?'':!s.enabled?'Denetim kapalı.':!s.checkedAt?'Henüz denetlenmedi (açılıştan yaklaşık 1 dakika sonra denetlenir).'
  :s.error?`Son denetim ${when(s.checkedAt)} · ulaşılamadı (${s.error}). Günde bir yeniden denenir.`
  :s.available?`Son denetim ${when(s.checkedAt)} · Z SCADA ${s.latest} yayınlandı${s.verified?'':' (SHA-256 özeti yok; yalnız elle kurulum)'}.`
  :`Son denetim ${when(s.checkedAt)} · güncel.`;
 return <section className="settings-section">
  <div className="settings-head"><h2>Güncellemeler</h2><InfoTip>Sunucu günde bir kez GitHub'daki Z SCADA yayın sayfasına (api.github.com) sorar; isteğe yalnız uygulama sürümü eklenir, kurulumu tanıtan bilgi gönderilmez. Yeni sürüm yalnız yöneticilere bildirim simgesinde görünür. Kurulum kendiliğinden yapılmaz: tepsideki Z SCADA simgesi → Güncellemeyi kur (Windows yönetici onayı ister; veriler korunur).</InfoTip></div>
  {s&&<>
   <p className="small muted">Kurulu sürüm <strong>{s.current}</strong>. {result}</p>
   <label className="check">
    <input type="checkbox" checked={s.enabled} disabled={busy||s.envDisabled}
     onChange={e=>{const enabled=e.target.checked;void act(()=>api<Status>('/update/settings','PUT',{enabled}),()=>enabled?'Güncelleme denetimi açıldı.':'Güncelleme denetimi kapatıldı; GitHub\'a istek gönderilmez.');}}/>
    Yeni sürümleri denetle (günde bir)
   </label>
   {s.envDisabled&&<p className="small muted">Sunucu ortamında <code>ZSCADA_UPDATE_CHECK=0</code> ile kapatılmış.</p>}
   <div className="toolbar-group">
    <button className="btn" disabled={busy||!s.enabled} onClick={()=>void act(()=>api<Status>('/update/check','POST'),n=>n.error?'GitHub\'a ulaşılamadı: '+n.error:n.available?'Z SCADA '+n.latest+' yayınlandı.':'Z SCADA güncel.')}><RefreshCw size={15}/>Şimdi denetle</button>
   </div>
  </>}
 </section>;
}
