import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectionSchema,deviceSchema,tagSchema,validateConfig,protocolLabels,isSymbolicProtocol,isReadOnlyProtocol,symbolicAddressField,symbolicAddressOf,addressFormatOf,connectionAddress,
 parseHttpBaseUrl,parseHttpPath,httpRequestUrl,type Config} from '../packages/contracts/model';
import {acceptSource,type SourceState} from '../apps/server/src/ingest';
import {seedConfig} from '../packages/contracts/seed';
import {httpDriver,driverFor,assertDriversDeployable,httpRequestId} from '../packages/drivers/driver';
import {buildGateway,withoutCredentials} from '../apps/server/src/gateway';
/* HTTP/REST surucusu: temel adres / yol dogrulama (sema-sunucu enjeksiyonu yok), yol basina tek istek, kimlik
 * bilgisinin yalniz istek dugumunun credentials alaninda durmasi, 2xx disi ve hata yolunda sahte good olmamasi. */

const conn=(extra:object={})=>connectionSchema.parse({id:'h1',name:'MES API',protocol:'http',host:'localhost',port:80,timeout:3000,httpBaseUrl:'https://mes.fabrika.local/api',httpAuth:'none',...extra});
const device=(extra:object={})=>deviceSchema.parse({id:'hd1',connectionId:'h1',code:'MES-1',name:'MES',slaveId:1,enabled:true,pollMs:2000,staleMs:10000,...extra});
const tag=(id:string,httpPath:string,dataType:string,extra:object={})=>tagSchema.parse({id,deviceId:'hd1',code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'read',min:-1e9,max:1e9,httpPath,...extra});
const base=():Config=>{const c:any=structuredClone(seedConfig);c.connections.push(conn());c.devices.push(device());return c;};
const ctx={token:'tok',revision:4,hostname:'ZS-A'};

test('HTTP protokolu: etiket, sembolik alan, adres, salt okuma',()=>{
 assert.equal(protocolLabels.http,'HTTP/REST');
 assert.equal(isSymbolicProtocol('http'),true);assert.equal(isReadOnlyProtocol('http'),true);
 assert.equal(symbolicAddressField('http'),'httpPath');
 assert.equal(symbolicAddressOf({httpPath:'/hat/1',httpJsonPath:'data.t'},{protocol:'http'}),'/hat/1 · data.t');
 assert.equal(symbolicAddressOf({httpPath:'/hat/1'},{protocol:'http'}),'/hat/1');
 assert.equal(addressFormatOf(base(),'hd1'),'http');
 assert.equal(connectionAddress(conn()),'https://mes.fabrika.local/api');
 assert.equal(driverFor(conn()).id,'http');
 assert.equal(httpDriver.writeLimits.allowWrite,false);assert.equal(httpDriver.buildWriteNodes,undefined);
});

test('parseHttpBaseUrl: yalniz http/https; kullanici bilgisi, sorgu, # ve {} yok; sondaki / atilir',()=>{
 assert.equal(parseHttpBaseUrl('http://203.0.113.20/api/'),'http://203.0.113.20/api');
 assert.equal(parseHttpBaseUrl(' HTTPS://Mes.Local:8443 '),'https://mes.local:8443');
 for(const bad of ['','ftp://x/a','file:///c:/x','javascript:alert(1)','//x/a','x/a','http://u:p@x/a','http://u@x','http://x/a?k=1','http://x/a#f','http://x/{{a}}','http://x/a b','http:\\\\x','http://','https:/x'])
  assert.throws(()=>parseHttpBaseUrl(bad),/HTTP temel adresi/,bad);
});

test('parseHttpPath: goreli yol; sema/sunucu, //, .., kodlanmis nokta/bolu, {} ve # reddedilir',()=>{
 assert.equal(parseHttpPath('/v1/olcum'),'/v1/olcum');
 assert.equal(parseHttpPath('v1/olcum?hat=3&tip=a'),'/v1/olcum?hat=3&tip=a');
 assert.equal(parseHttpPath('/a%20b'),'/a%20b');
 assert.equal(parseHttpPath('/@user'),'/@user','/ ile baslayan yolda @ sunucu degistirmez');
 for(const bad of ['','http://evil/x','https://evil','//evil.com/x','javascript:x','/a//b','/../x','/a/./b','/a/..','..','/%2e%2e/x','/a%2fb','/a%5cb','/a%00','/a%zz','/a#f','/{{x}}','/a b','/a\\b','/a"b',"/a'b",'mailto:x@y'])
  assert.throws(()=>parseHttpPath(bad),/HTTP yolu/,bad);
});

test('httpRequestUrl: sonuc temel adresin origin ve yolunda kalir; @ ile sunucu enjeksiyonu olmaz',()=>{
 assert.equal(httpRequestUrl('http://10.0.0.5/api','/x?a=1'),'http://10.0.0.5/api/x?a=1');
 assert.equal(httpRequestUrl('http://10.0.0.5','@evil.com/x'),'http://10.0.0.5/@evil.com/x');
 assert.equal(new URL(httpRequestUrl('http://10.0.0.5','@evil.com/x')).host,'10.0.0.5');
 assert.equal(new URL(httpRequestUrl('http://10.0.0.5:8080/api','v1')).host,'10.0.0.5:8080');
});

test('validateConfig: HTTP baglanti/etiket kurallari, oku/yaz reddi',()=>{
 const ok=base();ok.tags.push(tag('t1','/hat1','float32',{httpJsonPath:'data.temp',httpTimestampPath:'ts'}),tag('t2','/hat1','bool',{httpJsonPath:'on'}));
 assert.doesNotThrow(()=>validateConfig(ok));
 const rw=base();rw.tags.push(tag('t1','/x','float32',{access:'readwrite',min:0,max:1}));
 assert.throws(()=>validateConfig(rw),/HTTP etiketi yalnız okunur/);
 const inj=base();inj.tags.push(tag('t1','//evil.com/x','float32'));
 assert.throws(()=>validateConfig(inj),/göreli/);
 const jp=base();jp.tags.push(tag('t1','/x','float32',{httpJsonPath:'a..b'}));
 assert.throws(()=>validateConfig(jp),/JSON yolu/);
 const badBase=base();badBase.connections[badBase.connections.length-1]=conn({httpBaseUrl:'http://u:p@x/a'});
 assert.throws(()=>validateConfig(badBase),/kullanıcı adı\/parola olamaz/);
 const noBase=base();noBase.connections[noBase.connections.length-1]=conn({httpBaseUrl:''});
 assert.throws(()=>validateConfig(noBase),/temel adresi gerekli/);
 assert.throws(()=>connectionSchema.parse({...conn(),httpAuth:'digest'}));
 assert.doesNotThrow(()=>assertDriversDeployable([conn()],[device()],[tag('t1','/x','float32')],'.'),'cekirdek dugum: paket gerekmez');
 assert.throws(()=>httpDriver.validate(conn(),[tag('t1','/x','float32',{access:'readwrite'})]),/yalnız okunur/);
});

test('httpDriver.buildNodes: farkli yol basina tek istek; adres dugumde sabit; en kisa tarama; deterministik',()=>{
 const tags=[tag('t1','/hat1','float32',{httpJsonPath:'data.temp'}),tag('t2','hat1','int16',{httpJsonPath:'data.count',deviceId:'hd2'}),tag('t3','/hat2?x=1','bool'),tag('t4','/pasif','float32',{deviceId:'hd3'})];
 const devices=[device(),device({id:'hd2',code:'MES-2',slaveId:2,pollMs:1000}),device({id:'hd3',code:'MES-3',slaveId:3,enabled:false})];
 const nodes=httpDriver.buildNodes([conn()],devices,tags,ctx);
 const reqs=nodes.filter(n=>n.type==='http request');
 assert.equal(reqs.length,2,'/hat1 ve hat1 ayni yol; pasif cihazin yolu istenmez');
 assert.deepEqual(reqs.map(n=>n.url).sort(),['https://mes.fabrika.local/api/hat1','https://mes.fabrika.local/api/hat2?x=1']);
 for(const r of reqs){assert.equal(r.method,'GET');assert.equal(r.ret,'txt');assert.equal(r.authType,'');assert.equal(r.credentials,undefined);assert.equal(r.tls,'');assert.equal(r.senderr,false);assert.deepEqual(r.wires,[['scada-http-h1-convert']]);assert.doesNotMatch(r.url,/\{\{/);}
 const clocks=nodes.filter(n=>n.type==='inject');
 assert.equal(clocks.length,2);
 assert.equal(clocks.find(n=>n.name.endsWith('/hat1')).repeat,'1','iki cihazin en kisa taramasi');
 const guard=nodes.find(n=>n.id==='scada-http-h1-guard');
 assert.equal(guard.outputs,2);assert.deepEqual(guard.wires.flat().sort(),reqs.map(r=>r.id).sort());
 assert.equal(reqs[0].id,httpRequestId(conn(),'/hat1',ctx));
 for(const n of nodes)assert.match(n.id,/^scada-/);
 assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
 assert.deepEqual(httpDriver.buildNodes([conn()],devices,tags,ctx),nodes);
 assert.deepEqual(httpDriver.buildNodes([conn()],[device({enabled:false})],tags,ctx),[]);
});

test('HTTP kimlik: basic kullanici/parola ve bearer token yalniz istek dugumunun credentials alaninda; kimlikli dugum kimligi ayri',()=>{
 const t=[tag('t1','/x','float32')];
 const basic=httpDriver.buildNodes([conn({httpAuth:'basic'})],[device()],t,{...ctx,secret:()=>({username:'mes',password:'Gizli-Http-42',token:'kullanilmaz'})});
 const rb=basic.find(n=>n.type==='http request');
 assert.equal(rb.authType,'basic');assert.deepEqual(rb.credentials,{user:'mes',password:'Gizli-Http-42'});assert.match(rb.id,/-auth$/);
 const bearer=httpDriver.buildNodes([conn({httpAuth:'bearer'})],[device()],t,{...ctx,secret:()=>({token:'Gizli-Token-xyz',password:'kullanilmaz'})});
 const rt=bearer.find(n=>n.type==='http request');
 assert.equal(rt.authType,'bearer');assert.deepEqual(rt.credentials,{user:'',password:'Gizli-Token-xyz'});
 for(const nodes of [basic,bearer]){
  const r=nodes.find(n=>n.type==='http request'),{credentials:_c,...rest}=r;
  assert.equal(JSON.stringify(rest).includes('Gizli'),false);assert.equal(JSON.stringify(nodes.filter(n=>n!==r)).includes('Gizli'),false);
  assert.equal(JSON.stringify(withoutCredentials(nodes)).includes('Gizli'),false);
  assert.equal(JSON.stringify(nodes).includes('kullanilmaz'),false,'secilmeyen turun sirri kullanilmaz');
 }
 // Sir yoksa ya da 'none' ise kimliksiz dugum.
 const none=httpDriver.buildNodes([conn({httpAuth:'basic'})],[device()],t,ctx).find(n=>n.type==='http request');
 assert.equal(none.credentials,undefined);assert.doesNotMatch(none.id,/-auth$/);
 assert.equal(httpDriver.buildNodes([conn()],[device()],t,{...ctx,secret:()=>({username:'u',password:'p'})}).find(n=>n.type==='http request').credentials,undefined);
});

function runner(nodes:any[],id:string){
 const fn=new Function('msg','flow','context','node','Buffer',nodes.find(n=>n.id===id).func) as (...a:any[])=>any;
 const flowStore:Record<string,unknown>={},ctxStore:Record<string,unknown>={};
 const flow={get:(k:string)=>flowStore[k],set:(k:string,v:unknown)=>{flowStore[k]=v;}},context={get:(k:string)=>ctxStore[k],set:(k:string,v:unknown)=>{ctxStore[k]=v;}};
 return {run:(msg:any)=>fn(msg,flow,context,{status(){}},Buffer),flowStore,flow,context};
}
test('bekci: TLS dogrulama acik, yonlendirme kapali, zaman asimi baglantidan; ayni yola es zamanli ikinci istek yok',()=>{
 const nodes=httpDriver.buildNodes([conn()],[device()],[tag('t1','/a','float32'),tag('t2','/b','float32')],ctx);
 const {run,flowStore}=runner(nodes,'scada-http-h1-guard');
 const clocks=nodes.filter(n=>n.type==='inject');
 const out=run({topic:clocks[0].topic});
 const i=out.findIndex((m:any)=>m);
 assert.deepEqual(out[i],{topic:clocks[0].topic,httpKey:clocks[0].topic,requestTimeout:3000,rejectUnauthorized:true,followRedirects:false});
 assert.equal(run({topic:clocks[0].topic}),null,'cevap gelmeden ayni yol tekrar istenmez');
 assert.ok(run({topic:clocks[1].topic}),'baska yol etkilenmez');
 assert.equal(run({topic:'baska'}),null);
 (flowStore['http-busy-h1-'+clocks[0].topic] as number)-=10000;
 assert.ok(run({topic:clocks[0].topic}),'pencere dolunca tekrar');
});

test('donusum: 2xx JSON yolu/olcek/damga good; 3xx/4xx/5xx/zaman asimi/JSON degil -> bad; sira artar',()=>{
 const tags=[tag('t1','/hat','float32',{httpJsonPath:'data.temp',scale:2,offset:1}),tag('t2','/hat','bool',{httpJsonPath:'on',httpTimestampPath:'at'}),tag('t3','/duz','float32')];
 const nodes=httpDriver.buildNodes([conn()],[device()],tags,ctx);
 const {run,flowStore}=runner(nodes,'scada-http-h1-convert');
 const k=(p:string)=>nodes.find(n=>n.type==='inject'&&n.name.endsWith(p)).topic;
 flowStore['http-busy-h1-'+k('/hat')]=Date.now();
 const now=Date.now();
 const r=run({httpKey:k('/hat'),statusCode:200,payload:JSON.stringify({data:{temp:'20.25'},on:'on',at:new Date(now-2000).toISOString()})});
 assert.equal(flowStore['http-busy-h1-'+k('/hat')],null);
 const by=Object.fromEntries(r.payload.samples.map((s:any)=>[s.tagId,s]));
 assert.equal(by.t1.value,41.5);assert.equal(by.t1.quality,'good');assert.equal(by.t2.value,true);assert.equal(by.t2.sampledAt,now-2000);
 assert.equal(r.payload.source,'scada-http-h1');
 assert.equal(run({httpKey:k('/duz'),statusCode:200,payload:' 12.5 '}).payload.samples[0].value,12.5,'duz metin');
 assert.equal(run({httpKey:k('/duz'),statusCode:200,payload:Buffer.from('7')}).payload.samples[0].value,7);
 for(const [sc,p] of [[500,'{"data":{"temp":1}}'],[404,'1'],[302,'1'],[401,'1'],['ETIMEDOUT','RequestError: Timeout : https://x'],['ECONNREFUSED','x'],[undefined,'1'],[200,'abc'],[200,'{"x":1}']] as const){
  const res=run({httpKey:k(String(p).startsWith('{')?'/hat':'/duz'),statusCode:sc,payload:p});
  assert.ok(res.payload.samples.every((s:any)=>s.value===null&&s.quality==='bad'),String(sc)+' '+p);
 }
 assert.equal(run({httpKey:'yok',statusCode:200,payload:'1'}),null);
 let state:SourceState|undefined;
 for(let i=0;i<50;i++){const m=run({httpKey:k('/duz'),statusCode:200,payload:String(i)}).payload;const v=acceptSource(state,m,Date.now());assert.equal(v.ok,true,'mesaj '+i);state=(v as any).next;}
});

test('buildGateway: HTTP yalniz okuma dugumleri; yazma koprusu ve okuma testi yok',()=>{
 const c=base();c.connections=[conn()];c.devices=[device()];c.tags=[tag('t1','/a','float32'),tag('t2','/b','bool')];c.commands=[];
 const nodes=buildGateway(validateConfig(c),'tok',4730,'.',{hostname:'ZS-A'});
 assert.equal(nodes.filter(n=>n.type==='http request').length,2);
 assert.equal(nodes.some(n=>n.id==='scada-write-http'||n.id==='scada-read-http'||n.type==='http response'),false);
});
