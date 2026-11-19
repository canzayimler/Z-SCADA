/** Oturum bittiginde tek noktadan yakalanabilsin diye ayri hata tipi. */
export class SessionExpired extends Error{constructor(message='Oturumunuz sona erdi. Yeniden giriş yapın.'){super(message);this.name='SessionExpired';}}
/** Oturum bitisini dinleyen merkezi kanca; main.tsx kaydeder. */
let onSessionEnd:(()=>void)|null=null;
export function setSessionEndHandler(fn:(()=>void)|null){onSessionEnd=fn;}
/** Kritik islem yeniden dogrulama isterse cagrilan kanca; main.tsx parola penceresini acar. */
let onReauth:(()=>Promise<boolean>)|null=null;
export function setReauthHandler(fn:(()=>Promise<boolean>)|null){onReauth=fn;}
export async function api<T=any>(url:string,method='GET',body?:unknown,timeoutMs=15000,retry=true):Promise<T>{
 let r:Response;
 try{r=await fetch('/api'+url,{method,headers:{'Content-Type':'application/json','x-scada-request':'1'},body:body===undefined?(method==='GET'?undefined:'{}'):JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});}
 catch(e){throw Error((e as Error).name==='TimeoutError'?'Sunucu yanıt vermedi; bağlantınızı kontrol edin.':'Sunucuya ulaşılamadı.');}
 if(r.status===401){onSessionEnd?.();throw new SessionExpired();}
 const d=await r.json().catch(()=>({}));
 // Sunucu hatasi ek veri tasiyabilir (ornegin cakismada karsi tarafin taslagi); cagirana aynen ulassin.
 if(!r.ok){
  // Sunucu parola tazelemesi istiyorsa kullaniciya sor ve istegi bir kez tekrarla.
  if(d.code==='REAUTH_REQUIRED'&&retry&&onReauth&&await onReauth())return api<T>(url,method,body,timeoutMs,false);
  throw Object.assign(Error(d.error||'İşlem tamamlanamadı.'),{status:r.status,data:d.data,code:d.code});
 }
 return d;
}
export function download(name:string,data:unknown){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
export async function uploadImage(file:File):Promise<{src:string;bytes:number}>{if(file.size>4*1024*1024)throw Error('Görsel en fazla 4 MB olabilir.');const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(Error('Dosya okunamadı.'));r.readAsDataURL(file);});return api('/uploads','POST',{data});}
