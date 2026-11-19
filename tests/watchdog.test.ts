import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {checkGatewayOnce,startGatewayWatchdog,stopGatewayWatchdog,gatewayHealth,invalidateAdminToken} from '../apps/server/src/gateway';
/* Node-RED surecinin/akisinin deploy sonrasi sessizce kaybolmasini gorunur kilan kopru watchdog'u.
 * Gercek Node-RED yerine sahte bir `fetch` enjekte edilir; boylece ag baglantisi olmadan test edilir.
 * /flows admin API'si kimlik dogrulamasi ister (OAuth2 password grant); asagidaki testlerin cogu
 * NODERED_ADMIN_TOKEN ortam degiskenini kullanarak bu adimi atlar (adminAuthHeader'in belgelenmis kisayolu),
 * kimlik dosyasi/401-yenileme davranisi ise ayri testlerde dosya tabanli akisla dogrulanir. */
const flowsResponse=(flows:any[])=>({ok:true,json:async()=>({flows})} as Response);
const scadaGatewayTab={id:'scada-gateway',type:'tab'};
const heartbeat=(revision:number)=>({id:'scada-heartbeat',type:'inject',payload:JSON.stringify({token:'tok',revision})});
const withAdminToken=async(fn:()=>Promise<void>)=>{
 const prev=process.env.NODERED_ADMIN_TOKEN;
 process.env.NODERED_ADMIN_TOKEN='test-token';
 try{await fn();}finally{if(prev===undefined)delete process.env.NODERED_ADMIN_TOKEN;else process.env.NODERED_ADMIN_TOKEN=prev;}
};

test('akis (sekme + dogru revizyon) hala oradaysa durum "ok"',()=>withAdminToken(async()=>{
 const fakeFetch=(async()=>flowsResponse([scadaGatewayTab,heartbeat(5)])) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',5,'.',fakeFetch);
 assert.equal(health.status,'ok');
 assert.equal(gatewayHealth().status,'ok','son sonuc paylasilan durumu da guncellemeli');
}));
test('sekme akista yoksa (silinmis/kopmus) durum "bozuk"',()=>withAdminToken(async()=>{
 const fakeFetch=(async()=>flowsResponse([heartbeat(5)])) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',5,'.',fakeFetch);
 assert.equal(health.status,'bozuk');
 assert.match(health.reason,/scada-gateway/);
}));
test('sekme yok ve aktif revizyon yoksa (kopru hic uygulanmadi) durum "uygulanmadi", hata degil',()=>withAdminToken(async()=>{
 const fakeFetch=(async()=>flowsResponse([])) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',null,'.',fakeFetch);
 assert.equal(health.status,'uygulanmadi');
 assert.match(health.reason,/uygulanmad/);
 assert.equal(gatewayHealth().status,'uygulanmadi');
}));
test('sekme yok ama beklenen revizyon 5 ise (uygulanmis kopru kaybolmus) durum "bozuk"',()=>withAdminToken(async()=>{
 const fakeFetch=(async()=>flowsResponse([])) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',5,'.',fakeFetch);
 assert.equal(health.status,'bozuk');
 assert.match(health.reason,/scada-gateway/);
}));
test('sekme var ama revizyon uyusmuyorsa (eski akis) durum "bozuk"',()=>withAdminToken(async()=>{
 const fakeFetch=(async()=>flowsResponse([scadaGatewayTab,heartbeat(3)])) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',5,'.',fakeFetch);
 assert.equal(health.status,'bozuk');
 assert.match(health.reason,/revizyon/);
}));
test('beklenen revizyon verilmemisse (henuz deploy yok) yalniz sekme kontrol edilir',()=>withAdminToken(async()=>{
 const fakeFetch=(async()=>flowsResponse([scadaGatewayTab,heartbeat(999)])) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',null,'.',fakeFetch);
 assert.equal(health.status,'ok');
}));
test('/flows http hatasi donerse (Node-RED calisiyor ama surec bozuk) durum "bozuk"',()=>withAdminToken(async()=>{
 const fakeFetch=(async()=>({ok:false,status:502,json:async()=>({})} as Response)) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',5,'.',fakeFetch);
 assert.equal(health.status,'bozuk');
 assert.match(health.reason,/502/);
}));
test('fetch tamamen basarisiz olursa (Node-RED sureci olu/erisimsiz) durum "bilinmiyor"',()=>withAdminToken(async()=>{
 const fakeFetch=(async()=>{throw Error('connect ECONNREFUSED');}) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',5,'.',fakeFetch);
 assert.equal(health.status,'bilinmiyor');
 assert.match(health.reason,/ECONNREFUSED/);
}));
test('startGatewayWatchdog periyodik calisir ve stopGatewayWatchdog zamanlayiciyi temizler (surec/test asili kalmaz)',()=>withAdminToken(async()=>{
 let calls=0;
 const fakeFetch=(async()=>{calls++;return flowsResponse([scadaGatewayTab,heartbeat(1)]);}) as unknown as typeof fetch;
 const timer=startGatewayWatchdog('http://nodered.local',()=>1,'.',20,fakeFetch);
 await new Promise(r=>setTimeout(r,70));
 stopGatewayWatchdog();
 const callsAtStop=calls;
 await new Promise(r=>setTimeout(r,60));
 assert.equal(calls,callsAtStop,'stopGatewayWatchdog sonrasi yeni cagri olmamali');
 assert.ok(callsAtStop>=2,'periyodik olarak birden fazla kez calismali (ilk+en az bir tekrar): '+callsAtStop);
 assert.ok(timer,'zamanlayici referansi donmeli');
}));

/* --- Kimlik dosyasi tabanli akis (gercek dagitimda kullanilan yol; NODERED_ADMIN_TOKEN yok) --- */
const tempDir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'zscada-watchdog-'));
const writeCredential=(dir:string,username='scada',password='gizli-parola')=>
 fs.writeFileSync(path.join(dir,'nodered-admin.json'),JSON.stringify({username,password,hash:'x'}));

test('kimlik dosyasi yoksa durum "bozuk" ve neden Turkce net soyler (sessiz basari yok)',async()=>{
 invalidateAdminToken();
 const dir=tempDir();
 const fakeFetch=(async()=>{throw Error('bu cagrilmamali');}) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',null,dir,fakeFetch);
 assert.equal(health.status,'bozuk');
 assert.match(health.reason,/kimliği bulunamadı/);
});
test('Node-RED kimlik dogrulamayi reddederse (yanlis parola) durum "bozuk" ve neden acik soyler',async()=>{
 invalidateAdminToken();
 const dir=tempDir();
 writeCredential(dir);
 const fakeFetch=(async(url:string)=>{
  if(String(url).includes('/auth/token'))return {ok:false,status:401,json:async()=>({})} as Response;
  throw Error('bu cagrilmamali');
 }) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',null,dir,fakeFetch);
 assert.equal(health.status,'bozuk');
 assert.match(health.reason,/reddedildi/);
});
test('kimlik dogru ise once /auth/token ile Bearer token alinir, sonra /flows Authorization basligiyla cagrilir',async()=>{
 invalidateAdminToken();
 const dir=tempDir();
 writeCredential(dir);
 const calls:string[]=[];
 const fakeFetch=(async(url:string,init?:any)=>{
  calls.push(String(url));
  if(String(url).includes('/auth/token'))return {ok:true,json:async()=>({access_token:'abc123',expires_in:3600})} as Response;
  assert.equal(init?.headers?.Authorization,'Bearer abc123','flows cagrisi alinan token ile Authorization tasimali');
  return flowsResponse([scadaGatewayTab]);
 }) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',null,dir,fakeFetch);
 assert.equal(health.status,'ok');
 assert.deepEqual(calls,['http://nodered.local/auth/token','http://nodered.local/flows']);
});
test('/flows 401 donerse token bir kez yenilenip istek tekrarlanir (sonsuz dongu yok)',async()=>{
 invalidateAdminToken();
 const dir=tempDir();
 writeCredential(dir);
 let tokenCalls=0,flowsCalls=0;
 const fakeFetch=(async(url:string,init?:any)=>{
  if(String(url).includes('/auth/token')){tokenCalls++;return {ok:true,json:async()=>({access_token:'tok-'+tokenCalls,expires_in:3600})} as Response;}
  flowsCalls++;
  if(flowsCalls===1)return {ok:false,status:401,json:async()=>({})} as Response;
  assert.equal(init?.headers?.Authorization,'Bearer tok-2','yenilenen token ikinci denemede kullanilmali');
  return flowsResponse([scadaGatewayTab]);
 }) as unknown as typeof fetch;
 const health=await checkGatewayOnce('http://nodered.local',null,dir,fakeFetch);
 assert.equal(health.status,'ok','401 sonrasi tek yenileme ile basarili olmali');
 assert.equal(tokenCalls,2,'ilk token + 401 sonrasi bir yenileme, fazlasi degil');
 assert.equal(flowsCalls,2,'ilk deneme + tek tekrar, sonsuz dongu yok');
 invalidateAdminToken();
});
