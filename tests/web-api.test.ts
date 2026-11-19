import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {api,SessionExpired,setSessionEndHandler,setReauthHandler} from '../apps/web/src/api';
/* Arayuz testi tabani (acik uc 3): istek katmani 401 dusurmesini, yeniden
 * dogrulama tekrarini ve zaman asimi metnini elle deneniyordu. Burasi
 * tarayici istemez: `fetch` degistirilir, davranis dogrudan olculur. */
type Cagri={url:string;init:any};
let cagrilar:Cagri[]=[];
const gercekFetch=globalThis.fetch;
function sahteFetch(yanitlar:Array<{status:number;body?:unknown}|Error>){
 let n=0;
 globalThis.fetch=(async(url:any,init:any)=>{
  cagrilar.push({url:String(url),init});
  const y=yanitlar[Math.min(n++,yanitlar.length-1)];
  if(y instanceof Error)throw y;
  return {status:y.status,ok:y.status>=200&&y.status<300,json:async()=>y.body??{}} as any;
 }) as any;
}
beforeEach(()=>{cagrilar=[];setSessionEndHandler(null);setReauthHandler(null);});
afterEach(()=>{globalThis.fetch=gercekFetch;setSessionEndHandler(null);setReauthHandler(null);});

test('istek /api onekiyle ve surum basligiyla gider',async()=>{
 sahteFetch([{status:200,body:{ok:true}}]);
 assert.deepEqual(await api('/screens'),{ok:true});
 assert.equal(cagrilar[0].url,'/api/screens');
 assert.equal(cagrilar[0].init.headers['x-scada-request'],'1');
 assert.equal(cagrilar[0].init.body,undefined,'GET gövdesiz gider');
});

test('govdesiz POST bos nesne gonderir — sunucu JSON bekler',async()=>{
 sahteFetch([{status:200,body:{}}]);
 await api('/logout','POST');
 assert.equal(cagrilar[0].init.body,'{}');
});

test('401 oturumu dusurur ve kancayi bir kez cagirir',async()=>{
 let dustu=0;setSessionEndHandler(()=>{dustu++;});
 sahteFetch([{status:401,body:{error:'yok'}}]);
 await assert.rejects(()=>api('/screens'),(e:Error)=>e instanceof SessionExpired);
 assert.equal(dustu,1);
 assert.equal(cagrilar.length,1,'401 tekrar denenmez');
});

test('REAUTH_REQUIRED: parola onaylanirsa istek BIR kez tekrarlanir',async()=>{
 let soruldu=0;setReauthHandler(async()=>{soruldu++;return true;});
 sahteFetch([{status:403,body:{code:'REAUTH_REQUIRED'}},{status:200,body:{ok:1}}]);
 assert.deepEqual(await api('/users','POST',{a:1}),{ok:1});
 assert.equal(soruldu,1);
 assert.equal(cagrilar.length,2);
 assert.equal(cagrilar[1].init.body,JSON.stringify({a:1}),'tekrar aynı gövdeyle gider');
});

test('REAUTH_REQUIRED tekrarinda yine gelirse sonsuz dongu yok',async()=>{
 let soruldu=0;setReauthHandler(async()=>{soruldu++;return true;});
 sahteFetch([{status:403,body:{code:'REAUTH_REQUIRED',error:'Parolanızı doğrulayın.'}}]);
 await assert.rejects(()=>api('/users','POST'),(e:any)=>e.code==='REAUTH_REQUIRED'&&e.status===403);
 assert.equal(soruldu,1,'ikinci kez sorulmaz');
 assert.equal(cagrilar.length,2,'en fazla bir tekrar');
});

test('parola penceresi iptal edilirse tekrar yok',async()=>{
 setReauthHandler(async()=>false);
 sahteFetch([{status:403,body:{code:'REAUTH_REQUIRED',error:'Parolanızı doğrulayın.'}}]);
 await assert.rejects(()=>api('/users','POST'),/Parolanızı doğrulayın/);
 assert.equal(cagrilar.length,1);
});

test('sunucu hatasinin durumu, kodu ve ek verisi cagirana aynen ulasir',async()=>{
 sahteFetch([{status:409,body:{error:'Ekran değişmiş.',code:'CONFLICT',data:{version:7}}}]);
 await assert.rejects(()=>api('/screens/1','PUT',{}),(e:any)=>
  e.status===409&&e.code==='CONFLICT'&&e.data.version===7&&e.message==='Ekran değişmiş.');
});

test('bozuk JSON govdesi cokertmez, genel mesaj doner',async()=>{
 globalThis.fetch=(async()=>({status:500,ok:false,json:async()=>{throw Error('bozuk');}}) as any) as any;
 await assert.rejects(()=>api('/screens'),/İşlem tamamlanamadı/);
});

test('zaman asimi ve erisilemezlik ayri, Turkce mesaj verir',async()=>{
 sahteFetch([Object.assign(Error('timeout'),{name:'TimeoutError'})]);
 await assert.rejects(()=>api('/screens'),/Sunucu yanıt vermedi/);
 sahteFetch([Object.assign(Error('down'),{name:'TypeError'})]);
 await assert.rejects(()=>api('/screens'),/Sunucuya ulaşılamadı/);
});

test('oturum bitis kancasi kaldirilinca cagrilmaz',async()=>{
 let dustu=0;setSessionEndHandler(()=>{dustu++;});setSessionEndHandler(null);
 sahteFetch([{status:401,body:{}}]);
 await assert.rejects(()=>api('/screens'),(e:Error)=>e instanceof SessionExpired);
 assert.equal(dustu,0);
});
