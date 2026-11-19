import type {Live,Sample} from '../../../packages/contracts/model';
/* Canli mesaj birlestirme (proto=2). 'd' = delta (yalniz degisen ornekler), 'f' = tam goruntu,
 * tipsiz = eski protokol. Degismeyen ornek nesnesi ayni referansla korunur (yapisal paylasim):
 * memo'lu bilesenler yalniz kendi etiketi degisince yeniden cizilir. */
const same=(a:Sample|undefined,b:Sample)=>!!a&&a.value===b.value&&a.quality===b.quality&&a.receivedAt===b.receivedAt;
export function applyLive(prev:Live,msg:any):Live{
 if(msg?.t==='d'){
  const {t:_t,changed,removed,...rest}=msg,samples={...prev.samples};
  for(const id of removed||[])delete samples[id];
  for(const [id,s] of Object.entries(changed||{}) as [string,Sample][])if(!same(samples[id],s))samples[id]=s;
  return {...prev,...rest,samples};
 }
 const {t:_t,...state}=msg as Live&{t?:string};
 const samples:Record<string,Sample>={};
 for(const [id,s] of Object.entries(state.samples||{}))samples[id]=same(prev.samples[id],s)?prev.samples[id]:s;
 return {...state,samples};
}
